import { describe, it, expect } from "vitest";
import { melodyEssence, contourSim, rhythmSim, pcSim } from "../src/music/melodyEssence";
import { melodySimilarity, melodySimilarityLayered } from "../src/music/similarity";

const N = (pitch: number, start: number, dur = 0.5) => ({ pitch, start, dur });

describe("melodyEssence（抽象エッセンス抽出・spec§3）", () => {
  it("音程(移調不変)・輪郭(Parsons)・リズム指紋(IOI)・PC分布を出す", () => {
    const m = [N(60, 0), N(64, 0.5), N(62, 1), N(62, 1.5)];
    const e = melodyEssence(m);
    expect(e.intervals).toEqual([4, -2, 0]);
    expect(e.contour).toEqual([1, -1, 0]);
    expect(e.rhythm).toEqual([0.5, 0.5, 0.5]);
    expect(e.pcHist[0]).toBeCloseTo(0.25); // C 1/4
    expect(e.pcHist[2]).toBeCloseTo(0.5); // D 2/4
    expect(e.pcHist.reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });
  it("移調しても音程列・輪郭は同じ（移調不変）", () => {
    const a = melodyEssence([N(60, 0), N(64, 0.5), N(67, 1)]);
    const b = melodyEssence([N(67, 0), N(71, 0.5), N(74, 1)]); // +7移調
    expect(a.intervals).toEqual(b.intervals);
    expect(a.contour).toEqual(b.contour);
  });
  it("contourSim：同じ身振り=1・逆=低い", () => {
    expect(contourSim([1, 1, -1], [1, 1, -1])).toBe(1);
    expect(contourSim([1, 1, 1], [-1, -1, -1])).toBeLessThan(0.5);
  });
  it("rhythmSim：同じノリ=1・違うノリ=低い（音高無関係）", () => {
    expect(rhythmSim([0.5, 0.5, 1], [0.5, 0.5, 1])).toBe(1);
    expect(rhythmSim([0.5, 0.5, 0.5, 0.5], [2, 2])).toBeLessThan(0.6);
  });
  it("pcSim：同分布=1・重なり無し=0", () => {
    expect(pcSim([0.5, 0, 0.5, ...new Array(9).fill(0)], [0.5, 0, 0.5, ...new Array(9).fill(0)])).toBeCloseTo(1);
    const c = [1, ...new Array(11).fill(0)];
    const d = [0, 1, ...new Array(10).fill(0)];
    expect(pcSim(c, d)).toBe(0);
  });
});

describe("多層 melodySimilarity（S4b）", () => {
  it("同じ音程でもリズムが違えば、多層は音程のみより低くなる（ノリの違いを見る）", () => {
    const a = [N(60, 0), N(64, 0.5), N(67, 1)]; // 同じ音程列
    const b = [N(60, 0), N(64, 2), N(67, 4)]; // 音程同じ・リズム全然違う
    expect(melodySimilarity(a, b)).toBe(1); // 音程のみ＝同型
    expect(melodySimilarityLayered(a, b)).toBeLessThan(1); // 多層＝ノリ違いで下がる
  });
  it("完全一致は多層でも1", () => {
    const a = [N(60, 0), N(64, 0.5), N(67, 1)];
    expect(melodySimilarityLayered(a, a)).toBeCloseTo(1);
  });
});
