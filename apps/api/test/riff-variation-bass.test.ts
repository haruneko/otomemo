// 繰り返しに変奏の層（design.md 追補 (k-7)・2026-09-16 オーナー裁定）＝ベース結線（S2）。
// **不変条件は4口から返る content で確かめる**（このアークで後段が契約を黙って破る事故が実際に起きた）。
// 条件＝真因調査と同じ 63条件（3進行×7ドラム×3seed・4小節）。変奏の中身・強さ・スケジュールは「仮」（耳で決める）。
// 形の要求（○個以上変わる）はゲートにしない＝変化量は診断。存在（摂動）と被覆率のレンジだけを assert する。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, type DrumsInput } from "../src/music/generate";

import { BF, PROGS, CONDS, drumsOf, type Note, type Chord } from "./fixtures/riffVariationConds";
const notesOf = (r: ReturnType<typeof genBass>) => (r.items[0]!.content as { notes: Note[] }).notes;
const CANCEL = "打ち消され";

// ── oracle（錨の契約 (k-6)：変わり目のキックはルート・滞在中は許容音）＝生成器の表を使わない ──
const TONES: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7] };
const pc = (p: number) => ((p % 12) + 12) % 12;
const kickOf = (d: DrumsInput): number[] => {
  const r = d.rhythm!;
  return r.lanes!.find((l) => l.midi === 36)!.hits!.map((s) => s * (16 / r.steps!));
};
function contractProblems(notes: Note[], cs: Chord[], kick: number[], bars = 4): string[] {
  const probs: string[] = [];
  let lastKey: string | null = null;
  for (let b = 0; b < bars; b++) for (const k of [...kick].sort((x, y) => x - y)) {
    const t = b * 4 + k * 0.25;
    const c = cs.find((x) => x.start <= t + 1e-9 && t < x.start + x.dur - 1e-9)!;
    const n = notes.find((x) => Math.abs(x.start - t) < 1e-9);
    const key = `${c.root}|${c.quality}`;
    if (key !== lastKey) {
      lastKey = key;
      if (!n || pc(n.pitch) !== c.root) probs.push(`変わり目 ${t}`);
    } else if (n) {
      const ok = new Set([...TONES[c.quality]!, 7, 10].map((x) => (x + c.root) % 12));
      if (!ok.has(pc(n.pitch))) probs.push(`滞在中 ${t}`);
    }
  }
  return probs;
}

describe("S2 ベース：既定は1ビットも変わらない（63条件）", () => {
  it("riffVariation 未指定 ≡ 0（anchorLock 有り・無し）・content も meta も deepStrictEqual", () => {
    for (const c of CONDS) {
      expect(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 0 }), c.name).toStrictEqual(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true }));
    }
    const c = CONDS[0]!;
    expect(notesOf(genBass(BF, c.cs, c.seed, c.drums, { riffVariation: 0 }))).toStrictEqual(notesOf(genBass(BF, c.cs, c.seed, c.drums)));
  });
});

describe("S2 ベース：最終出力で不変条件（63条件×3段）", () => {
  const results = CONDS.map((c) => {
    const kick = kickOf(c.drums);
    const lv = (v?: number) => genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, ...(v != null ? { riffVariation: v } : {}) });
    return { c, kick, r0: lv(), r1: lv(0.5), r2: lv(1) };
  });

  it("決定論：同じ入力で2回呼んで deepStrictEqual", () => {
    for (const { c } of results.slice(0, 9)) for (const v of [0.5, 1]) {
      expect(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: v })).toStrictEqual(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: v }));
    }
  });

  it("錨の契約（変わり目＝ルート／滞在中＝許容音）が level 0 と同じく全段で破れない", () => {
    for (const { c, kick, r0, r1, r2 } of results) {
      expect((r0.items[0]!.content as { engine?: unknown }).engine, `${c.name} 錨経路が立っている`).toBeDefined();
      expect(contractProblems(notesOf(r0), c.cs, kick), c.name).toEqual([]);
      expect(contractProblems(notesOf(r1), c.cs, kick), `${c.name} 中`).toEqual([]);
      expect(contractProblems(notesOf(r2), c.cs, kick), `${c.name} 多め`).toEqual([]);
    }
  });

  it("摂動（存在）＋被覆率（仮 ≥ 0.8）：最終出力が level 0 と違う条件がある", () => {
    let mid = 0, high = 0;
    for (const { r0, r1, r2 } of results) {
      if (JSON.stringify(notesOf(r1)) !== JSON.stringify(notesOf(r0))) mid++;
      if (JSON.stringify(notesOf(r2)) !== JSON.stringify(notesOf(r0))) high++;
    }
    expect(mid).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
    expect(mid / results.length).toBeGreaterThanOrEqual(0.8);
    expect(high / results.length).toBeGreaterThanOrEqual(0.8);
  });

  it("打ち消し警告の整合：level 0 と完全一致 ⇔ 「打ち消され」を告げる", () => {
    for (const { c, r0, r1, r2 } of results) {
      for (const [r, name] of [[r1, "中"], [r2, "多め"]] as const) {
        const same = JSON.stringify(notesOf(r)) === JSON.stringify(notesOf(r0));
        expect(r.meta?.warnings?.some((w) => w.includes(CANCEL) && w.includes(name)) ?? false, `${c.name} ${name}`).toBe(same);
      }
    }
  });

  it("印：level>0 の content に bassRiff {grammar, variation}・level 0 は生やさない", () => {
    const { r0, r1, r2 } = results[0]!;
    expect((r0.items[0]!.content as Record<string, unknown>).bassRiff).toBeUndefined();
    expect((r1.items[0]!.content as Record<string, unknown>).bassRiff).toEqual({ grammar: "pedal_answer", variation: 0.5 });
    expect((r2.items[0]!.content as Record<string, unknown>).bassRiff).toEqual({ grammar: "pedal_answer", variation: 1 });
  });

  it("文法違い（gallop_pedal・octave_call_response）でも契約は破れず、変化が存在する", () => {
    for (const grammar of ["gallop_pedal", "octave_call_response"]) {
      let changed = 0;
      for (const c of CONDS.filter((_, i) => i % 3 === 0)) {
        const kick = kickOf(c.drums);
        const r0 = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, anchorGrammar: grammar });
        for (const v of [0.5, 1]) {
          const r = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, anchorGrammar: grammar, riffVariation: v });
          expect(contractProblems(notesOf(r), c.cs, kick), `${grammar} ${c.name} ${v}`).toEqual([]);
          if (JSON.stringify(notesOf(r)) !== JSON.stringify(notesOf(r0))) changed++;
        }
      }
      expect(changed, grammar).toBeGreaterThan(0);
    }
  });
});

describe("S2 ベース：段（riffVariationSteps）と通知", () => {
  const c = CONDS[20]!;
  it("段＝items 3件（なし／中／多め）・label・各 content は単独生成と同じ", () => {
    const r = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariationSteps: true });
    expect(r.items.map((i) => i.label)).toEqual(["変奏なし（従来）", "変奏 中", "変奏 多め"]);
    expect(r.items[0]!.content).toStrictEqual(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true }).items[0]!.content);
    expect(r.items[1]!.content).toStrictEqual(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 0.5 }).items[0]!.content);
    expect(r.items[2]!.content).toStrictEqual(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 1 }).items[0]!.content);
  });
  it("riffVariation と同時なら段が勝ち告げる", () => {
    const r = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariationSteps: true, riffVariation: 1 });
    expect(r.items.length).toBe(3);
    expect(r.meta?.warnings?.some((w) => w.includes("段") && w.includes("変奏量"))).toBe(true);
  });
  it("錨を選んでいない時は効かないと告げ、出音は従来", () => {
    const r = genBass(BF, c.cs, c.seed, c.drums, { riffVariation: 1 });
    expect(notesOf(r)).toStrictEqual(notesOf(genBass(BF, c.cs, c.seed, c.drums)));
    expect(r.meta?.warnings?.some((w) => w.includes("変奏") && w.includes("だけ"))).toBe(true);
    const s = genBass(BF, c.cs, c.seed, c.drums, { riffVariationSteps: true });
    expect(s.items.length).toBe(1);
    expect(s.meta?.warnings?.some((w) => w.includes("変奏") && w.includes("だけ"))).toBe(true);
  });
  it("ジャンル型の体（役割注記なし）は変奏できないと告げ、出音は従来", () => {
    const r = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, style: "rock", riffVariation: 1 });
    expect(notesOf(r)).toStrictEqual(notesOf(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, style: "rock" })));
    expect(r.meta?.warnings?.some((w) => w.includes("変奏できません"))).toBe(true);
  });
  it("2小節＝反復単位1つ＝変奏の余地なしを告げる／範囲外の値は丸めて告げる", () => {
    const r = genBass({ ...BF, bars: 2 }, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 1 });
    expect(r.meta?.warnings?.some((w) => w.includes("余地"))).toBe(true);
    const q = genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 0.7 });
    expect(q.meta?.warnings?.some((w) => w.includes("丸め"))).toBe(true);
    expect(notesOf(q)).toStrictEqual(notesOf(genBass(BF, c.cs, c.seed, c.drums, { anchorLock: true, riffVariation: 0.5 })));
  });
});

// ── 到達口 ──
const CS = PROGS["vi-IV-I-V"]!;
const D = drumsOf("beat8.syncopated");
describe("到達口①＝HTTP /music/gen_bass", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  const post = async (p: object) => ((await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: BF, chords: CS, seed: 42, drums: D, anchorLock: true, ...p } })).json() as { items: { content: { notes: Note[] }; label: string }[]; meta?: { warnings?: string[] } });
  it("riffVariation・riffVariationSteps が届き、返った content が契約を満たす", async () => {
    const one = await post({ riffVariation: 1 });
    expect(one.items[0]!.content).toEqual(genBass(BF, CS, 42, D, { anchorLock: true, riffVariation: 1 }).items[0]!.content);
    expect(contractProblems(one.items[0]!.content.notes, CS, kickOf(D))).toEqual([]);
    const steps = await post({ riffVariationSteps: true });
    expect(steps.items.map((i) => i.label)).toEqual(["変奏なし（従来）", "変奏 中", "変奏 多め"]);
    for (const it of steps.items) expect(contractProblems(it.content.notes, CS, kickOf(D))).toEqual([]);
    expect(steps.items[2]!.content.notes).not.toEqual(steps.items[0]!.content.notes);
  });
});

describe("到達口②＝MCP gen_bass", () => {
  it("inputSchema に riffVariation・riffVariationSteps が載り、callTool で届く", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props.riffVariation).toBeDefined();
    expect(props.riffVariationSteps).toBeDefined();
    const call = async (args: object) => (JSON.parse(((await client.callTool({ name: "gen_bass", arguments: { frame: BF, chords: CS, seed: 42, drums: D, anchorLock: true, ...args } })) as { content: { text: string }[] }).content[0]!.text) as { items: { content: { notes: Note[] }; label: string }[] });
    expect((await call({ riffVariation: 0.5 })).items[0]!.content).toEqual(genBass(BF, CS, 42, D, { anchorLock: true, riffVariation: 0.5 }).items[0]!.content);
    const s = await call({ riffVariationSteps: true });
    expect(s.items.length).toBe(3);
    for (const it of s.items) expect(contractProblems(it.content.notes, CS, kickOf(D))).toEqual([]);
  });
});

describe("到達口③＝/gen/section（body.bass 素通し・段は出せない）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  const get = async (bass: object) => {
    const j = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: BF, seed: 42, parts: ["chords", "bass", "drums"], bass: { anchorLock: true, ...bass } } })).json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] }; warnings?: string[] };
    const kid = (k: string) => j.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    return { bass: kid("bass") as { notes: Note[]; bassRiff?: unknown }, chords: (kid("chord_progression") as { chords: Chord[] }).chords, drums: kid("rhythm") as DrumsInput, warnings: j.warnings ?? [] };
  };
  it("bass.riffVariation が届く（返った content＝同じドラム・進行で直呼びと一致）", async () => {
    const r = await get({ riffVariation: 1 });
    expect(r.bass).toEqual(genBass(BF, r.chords, 42, r.drums, { anchorLock: true, riffVariation: 1 }).items[0]!.content);
    expect(r.bass.bassRiff).toEqual({ grammar: "pedal_answer", variation: 1 });
  });
  it("bass.riffVariationSteps は段を並べられないと告げ level 0 で作る", async () => {
    const r = await get({ riffVariationSteps: true, riffVariation: 1 });
    expect(r.warnings.some((w) => w.includes("セクション一括では段を並べられません"))).toBe(true);
    expect(r.bass).toEqual(genBass(BF, r.chords, 42, r.drums, { anchorLock: true }).items[0]!.content);
  });
});

// ── 2026-09-16 監査 重大①：段どうしの同一（多め≡中）も告げる＝4口 ──
const SAME_MID = "中と同じ音";
describe("監査 重大①：多めが中と同じ音なら告げる（octave_call_response）", () => {
  const OCR = { anchorLock: true, anchorGrammar: "octave_call_response" };
  it("整合：level 0 と違い・中と完全一致 ⇔ 「中と同じ音」を告げる（63条件×文法3）", () => {
    let hit = 0;
    for (const grammar of ["pedal_answer", "gallop_pedal", "octave_call_response"]) for (const c of CONDS) {
      const o = { anchorLock: true, anchorGrammar: grammar };
      const r0 = genBass(BF, c.cs, c.seed, c.drums, o), r1 = genBass(BF, c.cs, c.seed, c.drums, { ...o, riffVariation: 0.5 }), r2 = genBass(BF, c.cs, c.seed, c.drums, { ...o, riffVariation: 1 });
      const eq = JSON.stringify(notesOf(r2)) === JSON.stringify(notesOf(r1)) && JSON.stringify(notesOf(r2)) !== JSON.stringify(notesOf(r0));
      if (eq) hit++;
      expect(r2.meta?.warnings?.some((w) => w.includes(SAME_MID)) ?? false, `${grammar} ${c.name}`).toBe(eq);
      expect(r1.meta?.warnings?.some((w) => w.includes(SAME_MID)) ?? false, `${grammar} ${c.name} 中は言わない`).toBe(false);
    }
    expect(hit).toBeGreaterThan(0);
  });
  it("到達口①HTTP：段で多め≡中なら meta.warnings に載る", async () => {
    const app = buildHttp(new Core(openDb(":memory:"))); await app.ready();
    const j = (await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: BF, chords: CS, seed: 42, drums: D, ...OCR, riffVariationSteps: true } })).json() as { items: { content: { notes: Note[] } }[]; meta?: { warnings?: string[] } };
    expect(j.items[2]!.content.notes).toEqual(j.items[1]!.content.notes);
    expect(j.meta?.warnings?.some((w) => w.includes(SAME_MID))).toBe(true);
    const one = (await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: BF, chords: CS, seed: 42, drums: D, ...OCR, riffVariation: 1 } })).json() as { meta?: { warnings?: string[] } };
    expect(one.meta?.warnings?.some((w) => w.includes(SAME_MID))).toBe(true);
  });
  it("到達口②MCP：callTool の返りに載る", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const res = JSON.parse(((await client.callTool({ name: "gen_bass", arguments: { frame: BF, chords: CS, seed: 42, drums: D, ...OCR, riffVariationSteps: true } })) as { content: { text: string }[] }).content[0]!.text) as { meta?: { warnings?: string[] } };
    expect(res.meta?.warnings?.some((w) => w.includes(SAME_MID))).toBe(true);
  });
  it("到達口③/gen/section：body.bass.riffVariation:1 で warnings に載る", async () => {
    const app = buildHttp(new Core(openDb(":memory:"))); await app.ready();
    const j = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: BF, seed: 42, parts: ["chords", "bass", "drums"], bass: { ...OCR, riffVariation: 1 } } })).json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] }; warnings?: string[] };
    const kid = (k: string) => j.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    const cs = (kid("chord_progression") as { chords: Chord[] }).chords, dr = kid("rhythm") as DrumsInput;
    const mid = notesOf(genBass(BF, cs, 42, dr, { ...OCR, riffVariation: 0.5 }));
    const same = JSON.stringify((kid("bass") as { notes: Note[] }).notes) === JSON.stringify(mid);
    expect(same).toBe(true); // この入力は多め≡中（前提が崩れたらテストを差し替える）
    expect((j.warnings ?? []).some((w) => w.includes(SAME_MID))).toBe(true);
  });
});
