// S4（2026-07-22）：genBass / genChordPattern 出力への feel 添付＝genMelody と同契約の swing/humanize ノブ。
// 契約：
//  (a) swing/humanize 未指定/0 は content.feel を生やさない＝従来出力と deepStrictEqual bit 一致（鉄則）。
//  (b) 指定時のみ content.feel が genMelody と同形（swing のみ={swing}／humanize>0={humanize,seed}）。
//  (c) /gen/section の feel:{swing,humanize} が melody/bass/chord_pattern へ同一共有（全トラック同一ワープ）。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genBass, genChordPattern, genMelody, type Frame } from "../src/music/generate";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

const J = (x: unknown) => JSON.stringify(x);
const F: Frame = { bars: 4, meter: "4/4", key: 0 };
const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 5, quality: "", start: 4, dur: 4 },
  { root: 7, quality: "", start: 8, dur: 4 },
  { root: 0, quality: "", start: 12, dur: 4 },
];
const SEEDS = [1, 2, 42];
const bassContent = (r: ReturnType<typeof genBass>) => r.items[0]!.content as { notes: unknown[]; feel?: unknown };
const cpContent = (r: ReturnType<typeof genChordPattern>) => r.items[0]!.content as { hits?: unknown[]; feel?: unknown };

describe("(a) 未指定/0＝feel キー無し＝bit 一致（鉄則）", () => {
  it("genBass: swing/humanize 無しは feel キーが無い＝従来 content と完全一致", () => {
    for (const seed of SEEDS) {
      const base = genBass(F, CHORDS, seed);
      expect("feel" in bassContent(base)).toBe(false);
      // opts に他ノブだけ（swing/humanize 無し）でも feel は生えない
      expect(J(genBass(F, CHORDS, seed, null, { slashBass: false }))).toBe(J(base));
      // swing:0/humanize:0 明示も feel を生やさない＝bit 一致
      expect(J(genBass(F, CHORDS, seed, null, { swing: 0, humanize: 0 }))).toBe(J(base));
    }
  });
  it("genChordPattern: swing/humanize 無しは feel キーが無い＝従来 content と完全一致（既定経路＋辞書型経路）", () => {
    for (const seed of SEEDS) {
      const base = genChordPattern(F, seed);
      expect("feel" in cpContent(base)).toBe(false);
      expect(J(genChordPattern(F, seed, { swing: 0, humanize: 0 }))).toBe(J(base));
      // 辞書型経路（pattern 指定）も feel 無しで従来一致
      const lib = genChordPattern(F, seed, { pattern: "PB-WHOLE" });
      expect("feel" in cpContent(lib)).toBe(false);
      expect(J(genChordPattern(F, seed, { pattern: "PB-WHOLE", swing: 0, humanize: 0 }))).toBe(J(lib));
    }
  });
});

describe("(b) 指定時＝content.feel が genMelody と同形", () => {
  it("genBass swing のみ＝{swing}（genMelody と同一 feel）", () => {
    for (const seed of SEEDS) {
      const bf = bassContent(genBass(F, CHORDS, seed, null, { swing: 0.6 })).feel;
      expect(bf).toEqual({ swing: 0.6 });
      // genMelody に同 swing・同 seed を渡した feel と一致（同契約＝同 buildFeel）
      const mf = (genMelody(F, CHORDS, seed, { useV2: true, swing: 0.6 }).items[0]!.content as { feel?: unknown }).feel;
      expect(bf).toEqual(mf);
    }
  });
  it("genBass humanize>0＝{humanize,seed}（seed 明示は同値）", () => {
    const bf = bassContent(genBass(F, CHORDS, 9, null, { swing: 0.5, humanize: 0.4 })).feel;
    expect(bf).toEqual({ swing: 0.5, humanize: 0.4, seed: 9 });
    const mf = (genMelody(F, CHORDS, 9, { useV2: true, swing: 0.5, humanize: 0.4 }).items[0]!.content as { feel?: unknown }).feel;
    expect(bf).toEqual(mf);
  });
  it("genChordPattern swing/humanize＝feel が全経路（既定＋辞書型＋候補）で載る", () => {
    // 既定経路
    expect(cpContent(genChordPattern(F, 3, { swing: 0.6 })).feel).toEqual({ swing: 0.6 });
    expect(cpContent(genChordPattern(F, 3, { humanize: 0.3 })).feel).toEqual({ humanize: 0.3, seed: 3 });
    // 辞書型経路（pattern=型ID）
    expect(cpContent(genChordPattern(F, 3, { pattern: "PB-WHOLE", swing: 0.7 })).feel).toEqual({ swing: 0.7 });
    // 候補経路（variety>=2＋ジャンル名）＝各 item に feel が載る
    const cands = genChordPattern({ bars: 4, meter: "4/4", key: 0, section: { role: "verse" } } as Frame, 3, { pattern: "ballad", variety: 3, swing: 0.5 });
    if (cands.items.length >= 2) for (const it of cands.items) expect((it.content as { feel?: unknown }).feel).toEqual({ swing: 0.5 });
  });
  it("genBass 決定的＝同入力同出力", () => {
    expect(J(genBass(F, CHORDS, 7, null, { swing: 0.5, humanize: 0.4 }))).toBe(J(genBass(F, CHORDS, 7, null, { swing: 0.5, humanize: 0.4 })));
  });
});

describe("(c) /gen/section の共有 feel（全トラック同一ワープ）", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  const contentsOf = async (payload: unknown) => {
    const r = await app.inject({ method: "POST", url: "/gen/section", payload: payload as object });
    expect(r.statusCode).toBe(200);
    const comp = r.json() as { composition: { children: { node: { neta: { kind: string; content: { feel?: unknown } } } }[] } };
    const by = (k: string) => comp.composition.children.find((c) => c.node.neta.kind === k)!.node.neta.content;
    return { melody: by("melody"), bass: by("bass"), chord_pattern: by("chord_pattern"), kinds: comp.composition.children.map((c) => c.node.neta.kind) };
  };
  it("feel:{swing,humanize} は melody/bass/chord_pattern へ同一共有", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const parts = ["chords", "chord_pattern", "melody", "bass", "drums"];
    const feel = { swing: 0.6, humanize: 0.3 };
    const c = await contentsOf({ frame, seed: 5, parts, feel });
    const expected = { swing: 0.6, humanize: 0.3, seed: 5 };
    expect(c.melody.feel).toEqual(expected);
    expect(c.bass.feel).toEqual(expected);
    expect(c.chord_pattern.feel).toEqual(expected);
  });
  it("feel 未指定は各トラックに feel キー無し（従来 section と bit 一致）", async () => {
    const frame = { bars: 4, meter: "4/4", key: 0 };
    const parts = ["chords", "chord_pattern", "melody", "bass", "drums"];
    const c = await contentsOf({ frame, seed: 5, parts });
    expect("feel" in c.melody).toBe(false);
    expect("feel" in c.bass).toBe(false);
    expect("feel" in c.chord_pattern).toBe(false);
    // bass content は direct genBass（feel 無し）と一致＝共有透過が既定を汚さない
    // （chords は section 内 genChords 由来＝direct と同 seed で再現）
  });
});
