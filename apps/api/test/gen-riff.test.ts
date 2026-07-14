// WP-X3b リフ/オスティナート生成の契約テスト（docs/research/2026-07-14-riff-ostinato-design.md §1/§3/§5）。
// 固定値/性質で担保：2部構造(核motif固定リズム＋終止改変)・和声3類型(follow=各コードのコードトーンへ写像/
// indep=全小節同一音列)・音数3〜6(catchiness)・ループ適性(最終16分を空ける)・決定性・content 形。
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { genRiff, type Frame } from "../src/music/generate";
import { chordPcs, normRoot } from "../src/music/theory";
import { openDb } from "../src/db";
import { Core } from "../src/core";
import { buildHttp } from "../src/http";

type Note = { pitch: number; start: number; dur: number };
const J = (x: unknown) => JSON.stringify(x);
const FRAME: Frame = { key: 0, meter: "4/4", bars: 4, mode: "major" };
// 機能進行（ルートがペダル I/V から離れる）＝follow 自動判定。I-V-vi-IV。
const CHORDS = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 7, quality: "", start: 4, dur: 4 },
  { root: 9, quality: "m", start: 8, dur: 4 },
  { root: 5, quality: "", start: 12, dur: 4 },
];
const notesOf = (r: ReturnType<typeof genRiff>) => (r.items[0]!.content as { notes: Note[] }).notes;
const barOf = (n: Note) => Math.floor(n.start / 4);
const stepInBar = (n: Note) => Math.round(((n.start % 4) / 0.25));
const pc = (p: number) => ((p % 12) + 12) % 12;

describe("gen_riff（リフ）契約", () => {
  it("content 形＝kind=riff・program 数値", () => {
    const r = genRiff(FRAME, CHORDS, 1);
    expect(r.items[0]!.kind).toBe("riff");
    expect(typeof (r.items[0]!.content as { program: number }).program).toBe("number");
  });

  it("決定性：同 seed で同一出力", () => {
    expect(J(genRiff(FRAME, CHORDS, 8))).toBe(J(genRiff(FRAME, CHORDS, 8)));
  });

  it("核 motif＝音数3〜6（brevity＝即想起）", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const bar0 = notesOf(genRiff(FRAME, CHORDS, seed)).filter((n) => barOf(n) === 0);
      expect(bar0.length).toBeGreaterThanOrEqual(3);
      expect(bar0.length).toBeLessThanOrEqual(6);
    }
  });

  it("2部構造＝核リズム固定（bar0 と bar1 のオンセット位置が一致）", () => {
    const notes = notesOf(genRiff(FRAME, CHORDS, 4));
    const steps = (bar: number) => notes.filter((n) => barOf(n) === bar).map(stepInBar).sort((a, b) => a - b);
    expect(J(steps(0))).toBe(J(steps(1)));
  });

  it("follow＝各音のピッチクラスがその小節のコードのコードトーン（進行追従）", () => {
    const notes = notesOf(genRiff(FRAME, CHORDS, 4));
    for (const n of notes) {
      const ch = CHORDS[barOf(n)]!;
      const tones = new Set(chordPcs(normRoot(ch.root), ch.quality).map(pc));
      expect(tones.has(pc(n.pitch))).toBe(true);
    }
  });

  it("indep（維持）＝全小節同一音列（bar0 と bar2 のピッチ列が一致）", () => {
    const notes = notesOf(genRiff(FRAME, CHORDS, 4, { harmony: "indep" }));
    const pitches = (bar: number) => notes.filter((n) => barOf(n) === bar).map((n) => n.pitch);
    expect(J(pitches(0))).toBe(J(pitches(2))); // 偶数小節（終止改変なし）は同一
  });

  it("ループ適性＝最終小節の末尾16分にオンセットを置かない（継ぎ目）", () => {
    const notes = notesOf(genRiff(FRAME, CHORDS, 4));
    const total = 4 * 4; // bars*bpb
    expect(notes.some((n) => Math.abs(n.start - (total - 0.25)) < 1e-9)).toBe(false);
  });
});

describe("gen_riff API 配線", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = buildHttp(new Core(openDb(":memory:")));
    await app.ready();
  });
  it("/music/gen_riff：返りは direct と一致・harmony 透過", async () => {
    const r = await app.inject({ method: "POST", url: "/music/gen_riff", payload: { frame: FRAME, chords: CHORDS, seed: 9, harmony: "indep" } });
    expect(r.statusCode).toBe(200);
    expect(r.json().items[0].kind).toBe("riff");
    expect(J(r.json())).toBe(J(genRiff(FRAME, CHORDS, 9, { harmony: "indep" })));
  });
});
