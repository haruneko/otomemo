import { describe, it, expect } from "vitest";
import { harmonyVoice } from "../src/harmony";
import type { Note } from "../src/music";

const n = (pitch: number): Note => ({ pitch, start: 0, dur: 1 });

describe("harmonyVoice（ダイアトニック平行ハモリ）", () => {
  it("C長調 上3度＝C→E, E→G, G→B（調内で2度上）", () => {
    const out = harmonyVoice([n(60), n(64), n(67)], 0, false, 2);
    expect(out.map((x) => x.pitch)).toEqual([64, 67, 71]); // E4 G4 B4
  });

  it("C長調 下3度＝C→A(下), E→C, G→E", () => {
    const out = harmonyVoice([n(60), n(64), n(67)], 0, false, -2);
    expect(out.map((x) => x.pitch)).toEqual([57, 60, 64]); // A3 C4 E4
  });

  it("スケール外の音は最寄りの調内音へスナップしてからずらす", () => {
    // C長調で C#(61) は最寄り C(60) or D(62)。上3度で E〜F 付近に収まる（落ちない）。
    const out = harmonyVoice([n(61)], 0, false, 2);
    expect(out[0]!.pitch).toBeGreaterThanOrEqual(64);
    expect(out[0]!.pitch).toBeLessThanOrEqual(67);
  });

  it("start/dur は保持（声部の並行＝リズムは同じ）", () => {
    const out = harmonyVoice([{ pitch: 60, start: 1.5, dur: 0.5 }], 0, false, 2);
    expect(out[0]).toMatchObject({ start: 1.5, dur: 0.5 });
  });
});
