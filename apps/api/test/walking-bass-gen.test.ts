// ウォーキングベース `JZ-WALK`（M3-3d）を genBass の経路として通す（4口からの到達＋**最終出力**の不変条件）。
// 正典＝docs/design.md §2106 追補 (k)／計画 §5-2 M3 Scope 3d。
//
// ⚠ **耳未判定**＝v3 の規則3本は耳の言葉から出ているが v3 自体は打ち切られた枝（`CONCEPT.md:90`）。
//   だから **style を名指しした時だけ立つ**（ジャンル名の型選抜には入れない）。可否は作曲で耳が決める。
//
// **データ一致は主張しない**（計画 §6-2）。ここで見るのは W1〜W5・禁則0・6/8 スロット・到達口・既定の不変。
// **検算側は生成器の表を import しない**（§6-4 #2）＝コードトーン/スケールはリテラル。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";
import { buildMcpServer } from "../src/mcp";
import { genBass, type DrumsInput } from "../src/music/generate";
import { BASS_TYPES, pickBassType, bassTypeById } from "../src/music/bassLibrary";

type Note = { pitch: number; start: number; dur: number };
const FRAME = { bars: 4, meter: "4/4", key: 0 };
// ii-V-I（1小節ずつ）＋トニックで2小節
const CHORDS = [
  { root: 2, quality: "m7", start: 0, dur: 4 },
  { root: 7, quality: "7", start: 4, dur: 4 },
  { root: 0, quality: "maj7", start: 8, dur: 8 },
];
const TONES: Record<string, number[]> = { m7: [0, 3, 7, 10], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], min: [0, 3, 7], "": [0, 4, 7] };
const SCALE: Record<string, number[]> = {
  m7: [0, 2, 3, 5, 7, 8, 10], "7": [0, 2, 4, 5, 7, 9, 10], maj7: [0, 2, 4, 5, 7, 9, 11],
  min: [0, 2, 3, 5, 7, 8, 10], "": [0, 2, 4, 5, 7, 9, 11],
};
const pc = (p: number) => ((p % 12) + 12) % 12;
const content = (o: object, seed = 42, frame: object = FRAME, chords: typeof CHORDS = CHORDS, drums: DrumsInput | null = null) =>
  genBass(frame, chords, seed, drums, o).items[0]!.content as { notes: Note[]; engine?: { version: string } };

/** 最終出力（notes 列）に対する W1〜W5＋禁則0 の検算。**純関数の出口ではなく生成の出口を見る。** */
function auditLine(notes: Note[], chords: typeof CHORDS): { w1: [number, number]; w2: [number, number]; forbidden: number; transitions: number; w4bad: number } {
  const chOf = (t: number) => chords.find((c) => c.start <= t + 1e-9 && t < c.start + c.dur) ?? chords[chords.length - 1]!;
  let w1ok = 0, w1total = 0, w2ok = 0, w2total = 0, forbidden = 0, transitions = 0, w4bad = 0;
  for (const c of chords) { // W1＝各コード区間の頭がルート
    const head = notes.find((n) => Math.abs(n.start - c.start) < 1e-9);
    if (!head) continue;
    w1total++; if (pc(head.pitch) === pc(c.root)) w1ok++;
  }
  for (let i = 0; i < chords.length - 1; i++) { // W2＝チェンジ直前が次ルートの ±2
    const c = chords[i]!, nx = chords[i + 1]!;
    const before = [...notes].filter((n) => n.start < nx.start - 1e-9).pop();
    const nextHead = notes.find((n) => Math.abs(n.start - nx.start) < 1e-9);
    if (!before || !nextHead) continue;
    if (c.root === nx.root && c.quality === nx.quality) continue;
    w2total++; if (Math.abs(before.pitch - nextHead.pitch) <= 2) w2ok++;
  }
  notes.forEach((n, i) => {
    const c = chOf(n.start);
    const inScale = SCALE[c.quality]!.some((t) => pc(c.root + t) === pc(n.pitch)) || TONES[c.quality]!.some((t) => pc(c.root + t) === pc(n.pitch));
    const nxt = notes[i + 1];
    if (!inScale) {
      const nc = nxt ? chOf(nxt.start) : null;
      const resolves = nxt && nc && Math.abs(n.pitch - nxt.pitch) <= 2 && TONES[nc.quality]!.some((t) => pc(nc.root + t) === pc(nxt.pitch));
      if (!resolves) w4bad++;
    }
    if (!nxt) return;
    const ad = Math.abs(nxt.pitch - n.pitch);
    transitions++;
    if (ad === 6 || ad === 11 || ad > 12 || ad === 0) forbidden++;
  });
  return { w1: [w1ok, w1total], w2: [w2ok, w2total], forbidden, transitions, w4bad };
}

describe("gate＝既定は 1bit も変わらない（JZ-WALK は名指しでだけ立つ）", () => {
  it("BASS_TYPES にもジャンル選抜にも居ない＝おまかせ/ジャンル名では絶対に出てこない", () => {
    expect(BASS_TYPES.some((t) => t.id === "JZ-WALK")).toBe(false);
    expect(bassTypeById("JZ-WALK")).toBeFalsy();
    for (const genre of ["rock", "ballad", "citypop", "funk", "edm", "vocarock"]) {
      for (let seed = 0; seed < 12; seed++) expect(pickBassType(genre, undefined, 120, seed)?.id).not.toBe("JZ-WALK");
    }
  });

  it("style 未指定・他の型指定は従来と完全一致（engine キーも生えない）", () => {
    for (const base of [{}, { style: "RK-8ROOT" }, { style: "citypop" }, { approach: 0.5 }]) {
      const c = content(base);
      expect("engine" in c).toBe(false);
    }
  });

  it("JZ-WALK のときだけ engine が刻まれる（M0契約 §2）", () => {
    expect(content({ style: "JZ-WALK" }).engine?.version).toMatch(/^pm-/);
  });
});

describe("gate＝W1〜W5＋禁則0（**生成の最終出力**に対して・純関数の出口で満足しない）", () => {
  it("4/4：区間頭ルート 100%／チェンジ直前は次ルートの±2／禁則音程 0／非整合音 0／音域窓", () => {
    const notes = content({ style: "JZ-WALK" }).notes;
    expect(notes.length).toBe(16); // 4小節×4拍＝1拍1歩
    const a = auditLine(notes, CHORDS);
    expect(a.w1[1]).toBe(3);
    expect(a.w1[0]).toBe(3);            // W1
    expect(a.w2[0]).toBe(a.w2[1]);      // W2
    expect(a.w2[1]).toBeGreaterThan(0);
    expect(a.transitions).toBe(15);
    expect(a.forbidden).toBe(0);        // 禁則0（＋連打なし）
    expect(a.w4bad).toBe(0);            // W4
    for (const n of notes) { expect(n.pitch).toBeGreaterThanOrEqual(33); expect(n.pitch).toBeLessThanOrEqual(48); expect(n.dur).toBeGreaterThan(0); } // W5
    for (let i = 1; i < notes.length; i++) expect(notes[i]!.start).toBeGreaterThan(notes[i - 1]!.start);
  });

  it("ドラムを渡しても（他のノブと同居しても）不変条件は保たれる", () => {
    const dr: DrumsInput = { rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [
      { name: "Kick", midi: 36, hits: [0, 6, 8, 14] }, { name: "Snare", midi: 38, hits: [4, 12] },
    ] } };
    const notes = content({ style: "JZ-WALK", snareGap: 0.5 }, 42, FRAME, CHORDS, dr).notes;
    const a = auditLine(notes, CHORDS);
    expect(a.forbidden).toBe(0);
    expect(a.w1[0]).toBe(a.w1[1]);
  });

  it("決定的＝同じ seed で毎回同じ／seed の偶奇で弧の向きだけ変わる（RNG を消した）", () => {
    const a = content({ style: "JZ-WALK" }, 42).notes;
    for (let i = 0; i < 3; i++) expect(content({ style: "JZ-WALK" }, 42).notes).toEqual(a);
    expect(content({ style: "JZ-WALK" }, 100).notes).toEqual(a);      // 同じ偶奇＝同じ線
    // 別の偶奇＝弧が逆向き。**ただし短い進行では同じ線に落ちることがある**（窓が狭くランプが同じ所へ丸まる）＝
    // 「seed で必ず変わる」と嘘を書かず、変わるケースで示す（8小節ブルース）。
    const blues = [
      { root: 0, quality: "7", start: 0, dur: 8 }, { root: 5, quality: "7", start: 8, dur: 4 },
      { root: 0, quality: "7", start: 12, dur: 4 }, { root: 7, quality: "7", start: 16, dur: 4 },
      { root: 5, quality: "7", start: 20, dur: 4 }, { root: 0, quality: "7", start: 24, dur: 8 },
    ] as typeof CHORDS;
    const f8 = { bars: 8, meter: "4/4", key: 0 };
    expect(content({ style: "JZ-WALK" }, 43, f8, blues).notes).not.toEqual(content({ style: "JZ-WALK" }, 42, f8, blues).notes);
    expect(content({ style: "JZ-WALK" }, 42, f8, blues).notes).toEqual(content({ style: "JZ-WALK" }, 42, f8, blues).notes);
  });
});

describe("6/8＝付点拍＋ピックアップの4歩（源流 core/parts.py:388 のスロット (0,2,6,8)）", () => {
  it("1小節に4歩・位置は拍で 0 / 0.5 / 1.5 / 2.0", () => {
    const frame = { bars: 2, meter: "6/8", key: 0 };
    const chords = [{ root: 9, quality: "min", start: 0, dur: 3 }, { root: 5, quality: "", start: 3, dur: 3 }];
    const notes = content({ style: "JZ-WALK" }, 42, frame, chords as typeof CHORDS).notes;
    expect(notes.map((n) => n.start)).toEqual([0, 0.5, 1.5, 2, 3, 3.5, 4.5, 5]);
    const a = auditLine(notes, chords as typeof CHORDS);
    expect(a.forbidden).toBe(0);
    expect(a.w1[0]).toBe(a.w1[1]);
    expect(a.w1[1]).toBe(2);
  });

  it("9/8 は対応していないと**言う**（黙って落とさない・meta.warnings）", () => {
    const r = genBass({ bars: 2, meter: "9/8", key: 0 }, CHORDS, 42, null, { style: "JZ-WALK" });
    expect(((r as { meta?: { warnings?: string[] } }).meta?.warnings ?? []).join("|")).toMatch(/9\/8.*ウォーキング/);
    expect("engine" in (r.items[0]!.content as object)).toBe(false); // 経路は立っていない＝engine を刻まない
  });

  it("コードが無い時も**言う**（落ち先で言い分ける）", () => {
    const r = genBass(FRAME, [], 42, null, { style: "JZ-WALK" });
    const w = ((r as { meta?: { warnings?: string[] } }).meta?.warnings ?? []).join("|");
    expect(w).toMatch(/コードが無い/);
    expect(w).toMatch(/ウォーキング/);
  });
});

describe("到達口＝4口すべてから JZ-WALK が呼べる（style は既存のノブ＝口は既にある）", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = buildHttp(new Core(openDb(":memory:"))); await app.ready(); });

  it("①/music/gen_bass（HTTP）＝直呼びと列一致・**HTTP 応答の content に対して**禁則0", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_bass", payload: { frame: FRAME, chords: CHORDS, seed: 42, style: "JZ-WALK" } });
    expect(r.statusCode).toBe(200);
    const c = (r.json() as { items: { content: { notes: Note[]; engine?: { version: string } } }[] }).items[0]!.content;
    expect(c.notes).toEqual(content({ style: "JZ-WALK" }).notes);
    expect(c.engine?.version).toMatch(/^pm-/);
    const a = auditLine(c.notes, CHORDS);
    expect(a.forbidden).toBe(0);
    expect(a.w4bad).toBe(0);
  });

  it("②MCP gen_bass＝説明に耳未判定と opt-in が書いてある／呼べる", async () => {
    const server = buildMcpServer(new Core(openDb(":memory:")));
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(st), client.connect(ct)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "gen_bass")!;
    const desc = (tool.inputSchema as { properties: Record<string, { description?: string }> }).properties.style!.description!;
    expect(desc).toMatch(/JZ-WALK/);
    expect(desc).toMatch(/耳判定＝使える/); // 型と実態がずれない＝耳の判定（2026-09-13「使える」）を書く
    const res = await client.callTool({ name: "gen_bass", arguments: { frame: FRAME, chords: CHORDS, seed: 42, style: "JZ-WALK" } });
    const out = JSON.parse((res as { content: { text: string }[] }).content[0]!.text) as { items: { content: { notes: Note[] } }[] };
    expect(out.items[0]!.content.notes).toEqual(content({ style: "JZ-WALK" }).notes);
  });

  it("③/gen/section（bass.style 素通し）＝JZ-WALK が立つ", async () => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: { frame: { bars: 2, meter: "4/4", key: 0 }, seed: 42, parts: ["chords", "bass"], bass: { style: "JZ-WALK" } } });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: unknown } } }[] } };
    const bass = comp.composition.children.find((c) => c.node.neta.kind === "bass")!.node.neta.content as { notes: Note[]; engine?: { version: string } };
    expect(bass.engine?.version).toMatch(/^pm-/);
    const chords = (comp.composition.children.find((c) => c.node.neta.kind === "chord_progression")!.node.neta.content as { chords: typeof CHORDS }).chords;
    expect(bass.notes).toEqual((genBass({ bars: 2, meter: "4/4", key: 0 }, chords, 42, null, { style: "JZ-WALK" }).items[0]!.content as { notes: Note[] }).notes);
    expect(auditLine(bass.notes, chords).forbidden).toBe(0);
  });
});
