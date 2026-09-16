// 繰り返しに変奏の層（design.md 追補 (k-7)・2026-09-16 オーナー裁定）＝ギター結線（S3）。
// **不変条件は4口から返る content（とそれを web と同じ実音化にかけた音）で確かめる**。
// 条件＝3文法×3進行×3（ドラム・seed の組）×ロック有無。変奏の中身・強さ・スケジュールは「仮」（耳で決める）。
// oracle（強拍コードトーン・非整合 0）＝phrase_maker の py-parity ダンプ（生成器の表を使わない・guitar-reach と同じ）。
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { realizeGuitarRiff, fretboardGate, pcMembershipGate, TUNING_GUITAR6, type GtrRealizeHit } from "@cm/music-core";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genChordPattern, type DrumsInput } from "../src/music/generate";
import { BF, PROGS, drumsOf, type Chord } from "./fixtures/riffVariationConds";

type Hit = GtrRealizeHit & { riff: { anchor: boolean; kind: string; role: string; deg: number } };
type GtrContent = { hits: Hit[]; guitarRiff?: { grammar: string; variation?: number; anchorLock?: true } };
const contentOf = (r: ReturnType<typeof genChordPattern>) => r.items[0]!.content as GtrContent;
const CANCEL = "打ち消され";

// ── oracle ──
const PY = (JSON.parse(readFileSync(fileURLToPath(new URL("../../../tools/py-parity/cases-guitar/chordtheory.json", import.meta.url)), "utf8")) as { chords: { name: string; tone_pcs: number[]; scale_pcs: number[] }[] }).chords;
const PY_Q: Record<string, string> = { "": "C", m: "Cm" };
const oracle = (ch: Chord) => {
  const row = PY.find((r) => r.name === PY_Q[ch.quality])!;
  const sh = (xs: number[]) => new Set(xs.map((x) => (x + ch.root) % 12));
  return { tones: sh(row.tone_pcs), scale: sh(row.scale_pcs) };
};
const chordAtBeat = (cs: Chord[], beat: number) => cs.find((c) => c.start <= beat + 1e-9 && beat < c.start + c.dur - 1e-9) ?? cs[cs.length - 1]!;
const realize = (c: GtrContent, cs: Chord[]) => realizeGuitarRiff(c.hits, { chordAtStep: (s) => chordAtBeat(cs, s * 0.25), keyPc: 0, tempo: 120, engine: "chordfollow", seed: 5 }).notes;
function gateProblems(c: GtrContent, cs: Chord[]): string[] {
  const notes = realize(c, cs);
  const strong = pcMembershipGate("strong_beat_chord_tone", notes, (e) => oracle(chordAtBeat(cs, e.start)).tones, (e) => Math.abs(e.start - Math.round(e.start)) < 1e-9, "phrase_maker chordfollow.py:7-12");
  const scale = pcMembershipGate("non_integrated_zero", notes, (e) => oracle(chordAtBeat(cs, e.start)).scale, () => true, "phrase_maker chordfollow.py:13-16");
  const fret = fretboardGate(notes.map((n) => n.pitch), TUNING_GUITAR6);
  return [...strong.problems, ...scale.problems, ...fret.detail.unreachable.map((p) => `unreachable ${p}`)];
}
const kickOf = (d: DrumsInput): number[] => { const r = d.rhythm!; return r.lanes!.find((l) => l.midi === 36)!.hits!.map((s) => s * (16 / r.steps!)); };
function kickBroken(c: GtrContent, kick: number[], bars = 4): number {
  let broken = 0;
  for (let b = 0; b < bars; b++) for (const k of kick) {
    const h = c.hits.find((x) => x.step === b * 16 + k);
    if (!h || !h.riff.anchor || h.voice === "mono") broken++;
  }
  return broken;
}

const GRAMMARS = ["power_chug", "pedal_answer", "gallop"];
const PAIRS: [string, number][] = [["beat8.basic", 7], ["beat16.basic", 21], ["beat8.syncopated", 42]];
const GCONDS = GRAMMARS.flatMap((g) => Object.entries(PROGS).flatMap(([pn, cs]) => PAIRS.flatMap(([ds, seed]) => [false, true].map((lock) => ({
  name: `${g}/${pn}/${ds}/seed${seed}${lock ? "/lock" : ""}`, g, cs, drums: drumsOf(ds), seed, lock,
})))));
const gen = (c: (typeof GCONDS)[number], extra: object = {}) =>
  genChordPattern(BF, c.seed, { guitarRiff: c.g, ...(c.lock ? { anchorLock: true } : {}), drums: c.drums, chords: c.cs, ...extra });

describe("S3 ギター：既定は1ビットも変わらない", () => {
  it("riffVariation 未指定 ≡ 0（3文法×3進行×3×ロック有無）", () => {
    for (const c of GCONDS) expect(gen(c, { riffVariation: 0 }), c.name).toStrictEqual(gen(c));
  });
});

describe("S3 ギター：最終出力で不変条件（×3段）", () => {
  const results = GCONDS.map((c) => ({ c, r0: gen(c), r1: gen(c, { riffVariation: 0.5 }), r2: gen(c, { riffVariation: 1 }) }));

  it("決定論", () => {
    for (const { c } of results.slice(0, 12)) for (const v of [0.5, 1]) expect(gen(c, { riffVariation: v })).toStrictEqual(gen(c, { riffVariation: v }));
  });

  it("キックの刻みの契約：欠けが level 0 と同数（ロック時 0）", () => {
    for (const { c, r0, r1, r2 } of results) {
      if (!c.lock) continue;
      const k = kickOf(c.drums);
      expect(kickBroken(contentOf(r0), k), c.name).toBe(0);
      expect(kickBroken(contentOf(r1), k), `${c.name} 中`).toBe(0);
      expect(kickBroken(contentOf(r2), k), `${c.name} 多め`).toBe(0);
    }
  });

  it("強拍コードトーン・非整合 0・押さえられる（oracle・web と同じ実音化）", () => {
    for (const { c, r0, r1, r2 } of results) {
      expect(gateProblems(contentOf(r0), c.cs), c.name).toEqual([]);
      expect(gateProblems(contentOf(r1), c.cs), `${c.name} 中`).toEqual([]);
      expect(gateProblems(contentOf(r2), c.cs), `${c.name} 多め`).toEqual([]);
    }
  });

  it("摂動（存在）＋被覆率（仮 ≥ 0.8）：hits と実音の両方で level 0 と違う条件がある", () => {
    let hitsMid = 0, hitsHigh = 0, realMid = 0, realHigh = 0;
    for (const { c, r0, r1, r2 } of results) {
      const h0 = JSON.stringify(contentOf(r0).hits), n0 = JSON.stringify(realize(contentOf(r0), c.cs));
      if (JSON.stringify(contentOf(r1).hits) !== h0) hitsMid++;
      if (JSON.stringify(contentOf(r2).hits) !== h0) hitsHigh++;
      if (JSON.stringify(realize(contentOf(r1), c.cs)) !== n0) realMid++;
      if (JSON.stringify(realize(contentOf(r2), c.cs)) !== n0) realHigh++;
    }
    expect(realMid).toBeGreaterThan(0);
    expect(realHigh).toBeGreaterThan(0);
    expect(hitsMid / results.length).toBeGreaterThanOrEqual(0.8);
    expect(hitsHigh / results.length).toBeGreaterThanOrEqual(0.8);
    expect(realHigh / results.length).toBeGreaterThanOrEqual(0.8);
  });

  it("打ち消し警告の整合：hits か実音が level 0 と完全一致 ⇔ 「打ち消され」を告げる", () => {
    for (const { c, r0, r1, r2 } of results) {
      for (const [r, name] of [[r1, "中"], [r2, "多め"]] as const) {
        const same = JSON.stringify(contentOf(r).hits) === JSON.stringify(contentOf(r0).hits)
          || JSON.stringify(realize(contentOf(r), c.cs)) === JSON.stringify(realize(contentOf(r0), c.cs));
        expect(r.meta?.warnings?.some((w) => w.includes(CANCEL) && w.includes(name)) ?? false, `${c.name} ${name}`).toBe(same);
        // 落ち先ごとの文言：ロックしていない時にキックの刻みのせいにしない（試聴帳づくりで見つけた）
        if (same) expect(r.meta!.warnings!.some((w) => w.includes(CANCEL) && w.includes("キックに刻みを揃える")), `${c.name} ${name} 文言`).toBe(c.lock);
      }
    }
  });

  it("印：guitarRiff.variation（level>0 のみ）", () => {
    const { r0, r1, r2 } = results[0]!;
    expect(contentOf(r0).guitarRiff).not.toHaveProperty("variation");
    expect(contentOf(r1).guitarRiff?.variation).toBe(0.5);
    expect(contentOf(r2).guitarRiff?.variation).toBe(1);
  });
});

describe("S3 ギター：段と通知", () => {
  const c = GCONDS.find((x) => x.g === "power_chug" && x.lock)!;
  it("段＝items 3件・label・各 content は単独生成と同じ", () => {
    const r = gen(c, { riffVariationSteps: true });
    expect(r.items.map((i) => i.label)).toEqual(["変奏なし（従来）", "変奏 中", "変奏 多め"]);
    expect(r.items[0]!.content).toStrictEqual(gen(c).items[0]!.content);
    expect(r.items[1]!.content).toStrictEqual(gen(c, { riffVariation: 0.5 }).items[0]!.content);
    expect(r.items[2]!.content).toStrictEqual(gen(c, { riffVariation: 1 }).items[0]!.content);
    // web は常に variety=4 を送る＝段では「1件です」は嘘になるので3件で言い直す（実機で見つけた）
    const v = gen(c, { riffVariationSteps: true, variety: 4 });
    expect(v.meta?.warnings?.some((w) => w.includes("1件です"))).toBe(false);
    expect(v.meta?.warnings?.some((w) => w.includes("4 件でなく3件"))).toBe(true);
  });
  it("リフ文法なしでは効かないと告げ、出音は従来／段でも1件", () => {
    const r = genChordPattern(BF, 3, { riffVariation: 1 });
    expect(r.items[0]!.content).toStrictEqual(genChordPattern(BF, 3, {}).items[0]!.content);
    expect(r.meta?.warnings?.some((w) => w.includes("変奏") && w.includes("だけ"))).toBe(true);
    const s = genChordPattern(BF, 3, { riffVariationSteps: true });
    expect(s.items.length).toBe(1);
    expect(s.meta?.warnings?.some((w) => w.includes("変奏") && w.includes("だけ"))).toBe(true);
  });
  it("2小節＝余地なし・丸め・段が変奏量に勝つ", () => {
    expect(genChordPattern({ ...BF, bars: 2 }, 3, { guitarRiff: "power_chug", riffVariation: 1 }).meta?.warnings?.some((w) => w.includes("余地"))).toBe(true);
    const q = gen(c, { riffVariation: 0.9 });
    expect(q.meta?.warnings?.some((w) => w.includes("丸め"))).toBe(true);
    expect(contentOf(q)).toStrictEqual(contentOf(gen(c, { riffVariation: 1 })));
    expect(gen(c, { riffVariationSteps: true, riffVariation: 1 }).meta?.warnings?.some((w) => w.includes("段") && w.includes("変奏量"))).toBe(true);
  });
});

// ── 到達口 ──
const CS = PROGS["ロック i-bVII-bVI-bVII"]!;
const D = drumsOf("beat8.basic");
describe("到達口①＝HTTP /music/gen_chord_pattern", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  it("riffVariation・riffVariationSteps が届き、返った content がゲートを満たす", async () => {
    const post = async (p: object) => ((await app.inject({ method: "POST", url: "/music/gen_chord_pattern", payload: { frame: BF, seed: 7, guitarRiff: "power_chug", anchorLock: true, drums: D, chords: CS, ...p } })).json() as { items: { content: GtrContent; label: string }[] });
    const one = await post({ riffVariation: 1 });
    expect(one.items[0]!.content).toEqual(JSON.parse(JSON.stringify(genChordPattern(BF, 7, { guitarRiff: "power_chug", anchorLock: true, drums: D, chords: CS, riffVariation: 1 }).items[0]!.content)));
    const s = await post({ riffVariationSteps: true });
    expect(s.items.map((i) => i.label)).toEqual(["変奏なし（従来）", "変奏 中", "変奏 多め"]);
    for (const it of s.items) { expect(gateProblems(it.content, CS)).toEqual([]); expect(kickBroken(it.content, kickOf(D))).toBe(0); }
  });
});

describe("到達口②＝MCP gen_chord_pattern", () => {
  it("inputSchema に2項・callTool で届く", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_chord_pattern")!;
    const props = (tool.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props.riffVariation).toBeDefined();
    expect(props.riffVariationSteps).toBeDefined();
    const res = JSON.parse(((await client.callTool({ name: "gen_chord_pattern", arguments: { frame: BF, seed: 7, guitarRiff: "gallop", drums: D, chords: CS, riffVariationSteps: true } })) as { content: { text: string }[] }).content[0]!.text) as { items: { content: GtrContent }[] };
    expect(res.items.length).toBe(3);
    expect(res.items[2]!.content.guitarRiff?.variation).toBe(1);
    for (const it of res.items) expect(gateProblems(it.content, CS)).toEqual([]);
  });
});

describe("到達口③＝/gen/section（body.chord 素通し・段は出せない）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });
  const get = async (chord: object) => {
    const j = (await app.inject({ method: "POST", url: "/gen/section", payload: { frame: BF, seed: 42, parts: ["chords", "chord_pattern", "drums"], chord: { guitarRiff: "power_chug", anchorLock: true, ...chord } } })).json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] }; warnings?: string[] };
    const kid = (k: string) => j.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    return { cp: kid("chord_pattern") as GtrContent, chords: (kid("chord_progression") as { chords: Chord[] }).chords, drums: kid("rhythm") as DrumsInput, warnings: j.warnings ?? [] };
  };
  it("chord.riffVariation が届く", async () => {
    const r = await get({ riffVariation: 1 });
    expect(r.cp.guitarRiff?.variation).toBe(1);
    expect(r.cp).toEqual(JSON.parse(JSON.stringify(genChordPattern(BF, 42, { guitarRiff: "power_chug", anchorLock: true, drums: r.drums, chords: r.chords, riffVariation: 1 }).items[0]!.content)));
  });
  it("chord.riffVariationSteps は段を並べられないと告げ level 0", async () => {
    const r = await get({ riffVariationSteps: true, riffVariation: 1 });
    expect(r.warnings.some((w) => w.includes("セクション一括では段を並べられません"))).toBe(true);
    expect(r.cp.guitarRiff).not.toHaveProperty("variation");
  });
});

// 2026-09-16 監査 中②：gallop の中が打ち消される真因（答句が全部弱い位置の単音＝和音追従が隣の音の±2半音へ寄せる）を通知が言い分ける。
describe("監査 中②：gallop の中の打ち消しは理由つきで告げる", () => {
  const WHY = "弱い位置の単音";
  it("gallop・中・和音追従：打ち消された条件では理由が載り、手の形（別エンジン）や pedal_answer の打ち消しでは言わない", () => {
    let gallopCancel = 0;
    for (const cs of Object.values(PROGS)) for (const ds of ["beat8.basic", "four.rock", "beat16.ghost"]) for (const seed of [7, 42]) {
      const drums = drumsOf(ds);
      const g = genChordPattern(BF, seed, { guitarRiff: "gallop", drums, chords: cs, riffVariation: 0.5 });
      if (g.meta?.warnings?.some((w) => w.includes(CANCEL))) {
        gallopCancel++;
        expect(g.meta!.warnings!.some((w) => w.includes(CANCEL) && w.includes(WHY))).toBe(true);
      }
      const hs = genChordPattern(BF, seed, { guitarRiff: "gallop", drums, chords: cs, riffVariation: 0.5, guitarShape: true });
      expect(hs.meta?.warnings?.some((w) => w.includes(WHY)) ?? false).toBe(false);
    }
    expect(gallopCancel).toBeGreaterThan(0);
  });
});
