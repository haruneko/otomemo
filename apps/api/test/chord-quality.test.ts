import { describe, it, expect } from "vitest";
import { QUALITY_INTERVALS, chordPcs } from "../src/music/theory";

// コード品質語彙の拡張（design「決定A」）：テンション/dim7/altered が pc 正しく解決するか。
describe("QUALITY_INTERVALS 拡張", () => {
  it("テンション/dim7/altered の代表が正しい pc を返す（root=C）", () => {
    const pc = (q: string) => chordPcs(0, q).slice().sort((a, b) => a - b);
    expect(pc("9")).toEqual([0, 2, 4, 7, 10]); // C E G Bb D
    expect(pc("maj9")).toEqual([0, 2, 4, 7, 11]);
    expect(pc("m9")).toEqual([0, 2, 3, 7, 10]);
    expect(pc("add9")).toEqual([0, 2, 4, 7]); // 7thなし
    expect(pc("dim7")).toEqual([0, 3, 6, 9]);
    expect(pc("aug7")).toEqual([0, 4, 8, 10]); // 7#5
    expect(pc("7b9")).toEqual([0, 1, 4, 7, 10]);
    expect(pc("7#9")).toEqual([0, 3, 4, 7, 10]);
    expect(pc("13")).toEqual([0, 2, 4, 7, 9, 10]);
    expect(pc("69")).toEqual([0, 2, 4, 7, 9]);
    expect(pc("mM7")).toEqual([0, 3, 7, 11]);
  });

  it("全 quality が有効な pc 集合（0-11・重複なし・非空）", () => {
    for (const [q, ivals] of Object.entries(QUALITY_INTERVALS)) {
      const pcs = chordPcs(0, q);
      expect(pcs.length, q).toBeGreaterThan(0);
      expect(pcs.every((p) => p >= 0 && p <= 11), q).toBe(true);
      expect(new Set(pcs).size, `${q} に重複pc`).toBe(ivals.length);
    }
  });
});
