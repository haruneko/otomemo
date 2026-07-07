import { describe, it, expect } from "vitest";
import { genMelodyCandidates } from "../src/music/generate";

// P1 自己進化ループ（契約）：メロを1本に潰さず「多め生成→らしさ順→多様な top-k」を返す。
// 総合スコアは返さない（哲学：候補まで）。seed 明示は決定的な単一。決定的（同入力→同出力）。
const frame = { bars: 4, meter: "4/4", key: 0 };
const chords = [
  { root: 0, quality: "", start: 0, dur: 4 },
  { root: 9, quality: "m", start: 4, dur: 4 },
  { root: 5, quality: "", start: 8, dur: 4 },
  { root: 7, quality: "", start: 12, dur: 4 },
];
const notesOf = (r: ReturnType<typeof genMelodyCandidates>, i: number) =>
  (r.items[i]!.content as { notes: { pitch: number; start: number }[] }).notes;
const key = (ns: { pitch: number; start: number }[]) => ns.map((n) => `${n.pitch}@${n.start}`).join(",");

describe("genMelodyCandidates（P1 自己進化ループ）", () => {
  it("seed 無し＝複数の候補（1..3本）を返す・全て melody・notes を持つ", () => {
    const r = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8 });
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items.length).toBeLessThanOrEqual(3);
    for (const it of r.items) {
      expect(it.kind).toBe("melody");
      expect((it.content as { notes: unknown[] }).notes.length).toBeGreaterThan(0);
    }
    // 総合スコアを候補に載せない（哲学：良し悪しの断は人間）。
    for (const it of r.items) expect((it as { score?: unknown }).score).toBeUndefined();
  });

  it("複数返る時は互いに異なる（完全重複を潰し多様に選ぶ）", () => {
    const r = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8 });
    if (r.items.length >= 2) {
      const keys = r.items.map((_, i) => key(notesOf(r, i)));
      expect(new Set(keys).size).toBe(keys.length); // 全候補ユニーク
    }
  });

  it("seed 明示＝決定的な単一（従来 genMelody と同じ1本）", () => {
    const r = genMelodyCandidates(frame, chords, 3, { useV2: true, k: 3, n: 8 });
    expect(r.items.length).toBe(1);
  });

  it("決定的：同じ入力は同じ候補列を返す", () => {
    const a = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8 });
    const b = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8 });
    expect(a.items.map((_, i) => key(notesOf(a, i)))).toEqual(b.items.map((_, i) => key(notesOf(b, i))));
  });

  it("corpusModel を渡してもクラッシュせず top-k を返す（らしさ順ランクの経路）", () => {
    const corpusModel = {
      rhythm: { patterns: new Map<string, number>([["x.x.x.x.", 10], ["x...x...", 5]]) },
      move: { trans: new Map<number, Map<number, number>>([[0, new Map([[2, 8], [-2, 6]])]]) },
    };
    const r = genMelodyCandidates(frame, chords, null, { useV2: true, k: 3, n: 8, corpusModel });
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items.length).toBeLessThanOrEqual(3);
  });
});
