import { describe, it, expect } from "vitest";
import { QUALITY_INTERVALS, chordPcs } from "../src/music/theory";
import { analyzeFit } from "../src/music/fit";

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

describe("分数コード（決定B）の fit", () => {
  it("オンベース pc は当てはまり扱い（C/D で メロ D が in-chord）", () => {
    const mel = [{ pitch: 62, start: 0, dur: 4 }]; // D4 単音（Cメジャーの非和音音）
    const plain = analyzeFit(mel, [{ root: 0, quality: "", start: 0, dur: 4 }], 0);
    const slash = analyzeFit(mel, [{ root: 0, quality: "", start: 0, dur: 4, bass: 2 }], 0); // C/D
    expect(slash.inChordRate).toBeGreaterThan(plain.inChordRate);
  });
});
