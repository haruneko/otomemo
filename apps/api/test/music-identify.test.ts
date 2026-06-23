import { describe, it, expect } from "vitest";
// 連想エンジン：名前あて＝ユーザーの進行を名前付き進行DBに S1(度数化+距離)で照合（回転不変・調不変）。
import { identifyProgression, NAMED_PROGRESSIONS } from "../src/music";

const CANON = [
  { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" },
  { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 5, quality: "" }, { root: 7, quality: "" },
];
const KOMURO = [
  { root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 7, quality: "" }, { root: 0, quality: "" },
];

describe("identifyProgression（名前あて）", () => {
  it("名前付き進行DBが TS にある（最低6件）", () => {
    expect(NAMED_PROGRESSIONS.length).toBeGreaterThanOrEqual(6);
    expect(NAMED_PROGRESSIONS.map((p) => p.name)).toContain("カノン");
  });
  it("カノンを当てる（第1候補=カノン・高類似）", () => {
    const r = identifyProgression(CANON, { key: 0 });
    expect(r[0].name).toBe("カノン");
    expect(r[0].similarity).toBeGreaterThan(0.9);
  });
  it("小室を当てる", () => {
    expect(identifyProgression(KOMURO, { key: 0 })[0].name).toBe("小室");
  });
  it("回転不変：ループの開始位置が違っても当てる", () => {
    const rotated = CANON.slice(3).concat(CANON.slice(0, 3)); // Em-F-C-F-G-C-G-Am... 開始ずらし
    expect(identifyProgression(rotated, { key: 0 })[0].name).toBe("カノン");
  });
  it("調不変：移調しても（調未指定→推定）当てる", () => {
    const up5 = CANON.map((c) => ({ root: (c.root + 5) % 12, quality: c.quality })); // F調へ
    expect(identifyProgression(up5)[0].name).toBe("カノン");
  });
  it("三和音で書いた王道(F-G-Em-Am)でも王道に当たる（dogfood P2・quality緩照合＋キー候補）", () => {
    const triad = [{ root: 5, quality: "" }, { root: 7, quality: "" }, { root: 4, quality: "m" }, { root: 9, quality: "m" }];
    expect(identifyProgression(triad, { key: 0 })[0].name).toBe("王道"); // 7th無しでも小室に化けない
    expect(identifyProgression(triad)[0].name).toBe("王道"); // 調未指定でも相対短調に飛ばない
  });
  it("無関係な進行は高類似で当たらない（第1候補でも閾値未満）", () => {
    const weird = [{ root: 1, quality: "dim" }, { root: 6, quality: "aug" }, { root: 11, quality: "sus4" }];
    const r = identifyProgression(weird, { key: 0 });
    expect(r[0].similarity).toBeLessThan(0.6);
  });
});
