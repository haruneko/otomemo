import { describe, it, expect } from "vitest";
import { melodySimilarity, findSimilar } from "../src/music/similarity";
import { genNamedProgression, findNamedProgression } from "../src/music/progressions";

describe("melodySimilarity（移調不変・記号）", () => {
  const up = (ns: { pitch: number; start: number }[], d: number) => ns.map((n) => ({ ...n, pitch: n.pitch + d }));
  const a = [0, 2, 4, 5].map((p, i) => ({ pitch: 60 + p, start: i }));
  it("同型は1・移調しても1", () => {
    expect(melodySimilarity(a, a)).toBe(1);
    expect(melodySimilarity(a, up(a, 7))).toBe(1); // 5度上げても同型
  });
  it("別物は低い・空同士は1", () => {
    const b = [0, 5, 11, 1].map((p, i) => ({ pitch: 60 + p, start: i }));
    expect(melodySimilarity(a, b)).toBeLessThan(1);
    expect(melodySimilarity([], [])).toBe(1);
    expect(melodySimilarity(a, [])).toBe(0);
  });
  it("findSimilar は近い順・notes を落として返す", () => {
    const res = findSimilar(a, [
      { id: "x", notes: up(a, 3) }, // 同型
      { id: "y", notes: [60, 61, 62].map((p, i) => ({ pitch: p, start: i })) },
    ]);
    expect(res[0]!.id).toBe("x");
    expect(res[0]).not.toHaveProperty("notes");
  });
});

describe("genNamedProgression（C基準 realize）", () => {
  it("丸の内→FM7-E7-Am7-Gm7-C7（root_pc/quality）", () => {
    const { items } = genNamedProgression("丸の内で", { meter: "4/4" });
    const chords = (items[0]!.content as { chords: { root: number; quality: string; dur: number }[] }).chords;
    expect(chords.map((c) => [c.root, c.quality])).toEqual([
      [5, "maj7"], [4, "7"], [9, "m7"], [7, "m7"], [0, "7"],
    ]);
    expect(chords[0]!.dur).toBe(4); // 1コード=1小節
  });
  it("別名・表記揺れ（marunouchi/丸サ）も引ける／未知は空", () => {
    expect(findNamedProgression("marunouchi")?.name).toBe("丸の内");
    expect(findNamedProgression("丸サ進行")?.name).toBe("丸の内");
    expect(genNamedProgression("存在しない進行").items).toEqual([]);
  });
});
