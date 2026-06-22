import { describe, it, expect } from "vitest";
import { harmonize } from "../src/music";

describe("harmonize（メロ→合うコード候補）", () => {
  it("C-E-G を並べた小節 → 第1候補は C(root0,\"\")", () => {
    const mel = [60, 64, 67].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    const bars = harmonize(mel, 0, { barBeats: 4 });
    expect(bars[0].candidates[0]).toMatchObject({ root: 0, quality: "" });
    expect(bars[0].candidates[0].score).toBe(1);
  });
  it("F-A-C を並べた小節 → 第1候補は F(root5,\"\")（メロを全部支える）", () => {
    const mel = [65, 69, 72].map((pitch, i) => ({ pitch, start: i, dur: 1 }));
    const bars = harmonize(mel, 0, { barBeats: 4 });
    expect(bars[0].candidates[0].root).toBe(5);
    expect(bars[0].candidates[0].score).toBe(1);
  });
  it("複数小節に分割される（8拍=2小節）", () => {
    const mel = Array.from({ length: 8 }, (_, i) => ({ pitch: 60, start: i, dur: 1 }));
    const bars = harmonize(mel, 0, { barBeats: 4 });
    expect(bars.length).toBe(2);
    expect(bars[1].start).toBe(4);
  });
  it("空は空", () => {
    expect(harmonize([], 0)).toEqual([]);
  });
});
