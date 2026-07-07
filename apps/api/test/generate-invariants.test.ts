import { describe, it, expect } from "vitest";
import {
  genChords,
  genMelody,
  genBass,
  genDrums,
  genChordPattern,
  genFromEssence,
  type Frame,
} from "../src/music/generate";

// #2 安全網：生成エンジンが実際に保証する musical 不変条件を property test で固定（design 決定1）。
// seed 依存乱数なので byte 等価は約束しない。代わりに「壊れていない」ことを多数の frame×seed で担保。
// ＝#5（generate.ts 分割）の回帰防止網。輪郭保存は engine の約束ではない（折返しはピッチクラス保存）。

type Note = { pitch: number; start: number; dur: number };
type Chord = { root: number; quality: string; start: number; dur: number };

const notesOf = (r: ReturnType<typeof genMelody>): Note[] =>
  (r.items[0]!.content as { notes: Note[] }).notes;
const chordsOf = (r: ReturnType<typeof genChords>): Chord[] =>
  (r.items[0]!.content as { chords: Chord[] }).chords;

// 探索の網：拍子・mood・小節数・seed を掛け合わせて走査。
const METERS = ["4/4", "3/4", "6/8", "5/4", "1/8", "bogus", ""];
const MOODS = ["", "明るい", "切ない", "ダンス", "バラード"];
const BARS = [1, 2, 4, 7, 16, 99];
const SEEDS = [0, 1, 7, 42, 1234, -5];

function* frames(): Generator<Frame> {
  for (const meter of METERS)
    for (const mood of MOODS) for (const bars of BARS) yield { meter, mood, bars };
}

const finiteInt = (n: number) => Number.isFinite(n) && Number.isInteger(n);

describe("genMelody 不変条件", () => {
  it("全 frame×seed で：非空・有限整数・本体音域[60,84]・弱起のみ下にはみ出し可", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 64 }];
        const notes = notesOf(genMelody({ ...f, pickup: 1 }, chords, seed));
        const where = `${f.meter}/${f.mood}/${f.bars}#${seed}`;
        expect(notes.length, `非空: ${where}`).toBeGreaterThan(0);
        for (const n of notes) {
          expect(finiteInt(n.pitch), `有限整数pitch: ${where} ${n.pitch}`).toBe(true);
          expect(finiteInt(n.start) || Number.isFinite(n.start), `start: ${where}`).toBe(true);
          expect(n.dur, `dur>0: ${where}`).toBeGreaterThan(0);
          if (n.start >= 0) {
            expect(n.pitch, `本体下限: ${where}`).toBeGreaterThanOrEqual(60);
            expect(n.pitch, `本体上限: ${where}`).toBeLessThanOrEqual(84);
          } else {
            // 弱起は1スケール度下まで＝極端な値は出さない
            expect(n.pitch, `弱起下限: ${where}`).toBeGreaterThanOrEqual(53);
            expect(n.pitch, `弱起上限: ${where}`).toBeLessThanOrEqual(84);
          }
        }
      }
  }, 30000); // 全 frame×seed の網羅で数秒かかる＝`pnpm -r test` の並行負荷でも既定5sで落ちないよう余裕を持たせる

  it("決定性：同一(frame,chords,seed)は同一出力", () => {
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
    for (const seed of SEEDS) {
      const a = notesOf(genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, chords, seed));
      const b = notesOf(genMelody({ bars: 4, meter: "4/4", mood: "明るい" }, chords, seed));
      expect(b).toEqual(a);
    }
  });

  it("chords 無しでも壊れない（scale フォールバック）", () => {
    for (const seed of SEEDS) {
      const notes = notesOf(genMelody({ bars: 4 }, undefined, seed));
      expect(notes.length).toBeGreaterThan(0);
      expect(notes.every((n) => finiteInt(n.pitch))).toBe(true);
    }
  });
});

describe("genChords 不変条件", () => {
  it("長さ=bars(1..16)・bars>=2でI/i始終・dur>0・root∈0..11", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const chords = chordsOf(genChords(f, seed));
        const expectBars = Math.max(1, Math.min(16, f.bars!));
        const where = `${f.meter}/${f.mood}/${f.bars}#${seed}`;
        expect(chords.length, `len=bars: ${where}`).toBe(expectBars);
        expect(chords[0]!.root, `I始まり: ${where}`).toBe(0);
        if (expectBars >= 2) expect(chords[chords.length - 1]!.root, `I終わり: ${where}`).toBe(0);
        for (const c of chords) {
          expect(c.dur, `dur>0: ${where}`).toBeGreaterThan(0);
          expect(c.root, `root域: ${where}`).toBeGreaterThanOrEqual(0);
          expect(c.root, `root域: ${where}`).toBeLessThan(12);
        }
      }
  });
});

describe("genBass / genDrums / genChordPattern 不変条件", () => {
  it("bass: 非空・低域・有限整数・決定的", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 64 }];
        const r1 = genBass(f, chords, seed);
        const notes = (r1.items[0]!.content as { notes: Note[] }).notes;
        expect(notes.length).toBeGreaterThan(0);
        for (const n of notes) {
          expect(finiteInt(n.pitch)).toBe(true);
          expect(n.pitch).toBeGreaterThanOrEqual(24);
          expect(n.pitch).toBeLessThanOrEqual(55);
        }
        const r2 = genBass(f, chords, seed);
        expect((r2.items[0]!.content as { notes: Note[] }).notes).toEqual(notes);
      }
  });

  it("drums: steps∈{12,16}・hit は範囲内・決定的", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const r = genDrums(f, seed);
        const rhythm = (r.items[0]!.content as { rhythm: { steps: number; lanes: { hits: number[] }[] } }).rhythm;
        expect([12, 16]).toContain(rhythm.steps);
        for (const lane of rhythm.lanes)
          for (const h of lane.hits) {
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(rhythm.steps);
          }
        const r2 = genDrums(f, seed);
        expect((r2.items[0]!.content as { rhythm: unknown }).rhythm).toEqual(rhythm);
      }
  });

  it("chord_pattern: steps>0・hit step は範囲内", () => {
    for (const f of frames())
      for (const seed of SEEDS) {
        const r = genChordPattern(f, seed);
        const c = r.items[0]!.content as { steps: number; hits: { step: number; dur: number }[] };
        expect(c.steps).toBeGreaterThan(0);
        for (const h of c.hits) {
          expect(h.step).toBeGreaterThanOrEqual(0);
          expect(h.step).toBeLessThan(c.steps);
        }
      }
  });
});

describe("genFromEssence 不変条件", () => {
  it("参照空なら通常生成へフォールバック・非空・音域", () => {
    const r = genFromEssence([], { bars: 4 }, undefined, 3);
    const notes = notesOf(r);
    expect(notes.length).toBeGreaterThan(0);
  });
  it("参照ありでも音域[60,84]・決定的", () => {
    const ref = [
      { pitch: 64, start: 0, dur: 1 },
      { pitch: 67, start: 1, dur: 1 },
      { pitch: 60, start: 2, dur: 1 },
    ];
    const chords: Chord[] = [{ root: 0, quality: "", start: 0, dur: 8 }];
    const a = notesOf(genFromEssence(ref, { bars: 2 }, chords, 9));
    expect(a.length).toBeGreaterThan(0);
    for (const n of a) {
      expect(n.pitch).toBeGreaterThanOrEqual(60);
      expect(n.pitch).toBeLessThanOrEqual(84);
    }
    const b = notesOf(genFromEssence(ref, { bars: 2 }, chords, 9));
    expect(b).toEqual(a);
  });
});
