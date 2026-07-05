import { describe, it, expect } from "vitest";
import { chordsFromTimeline, pcFromKeyName } from "../src/audio-chords";

describe("chordsFromTimeline（アナリーゼの学習の出口＝BTC timeline→弾ける chord_progression）", () => {
  it("N飛ばし・連続畳み・拍量子化（bpm120＝0.5s/beat）", () => {
    const tl = [[0, 1, "N"], [1, 2, "A:min"], [2, 3, "A:min"], [3, 5, "C"], [5, 6, "D:7"]];
    expect(chordsFromTimeline(tl, 120)).toEqual([
      { root: 9, quality: "m", start: 0, dur: 4 }, // A:min 1..3s = 2s = 4beat（畳み）
      { root: 0, quality: "", start: 4, dur: 4 },  // C 3..5s = 4beat
      { root: 2, quality: "7", start: 8, dur: 2 }, // D:7 5..6s = 2beat
    ]);
  });

  it("BTCの各quality を otomemo語彙へ（maj→''/min→m/min7→m7/7→7）", () => {
    const tl = [[0, 2, "C:maj"], [2, 4, "A:min7"], [4, 6, "G:7"], [6, 8, "F"]];
    expect(chordsFromTimeline(tl, 120).map((c) => `${c.root}:${c.quality}`)).toEqual(["0:", "9:m7", "7:7", "5:"]);
  });

  it("maxBeats で先頭抜粋（頭打ち）", () => {
    const tl = Array.from({ length: 20 }, (_v, i) => [i, i + 1, "C"]); // 全部C
    const c = chordsFromTimeline(tl, 120, 8);
    expect(c).toHaveLength(1); // 同一コード＝1スロットに畳まれる
    expect(c[0]!.dur).toBeGreaterThanOrEqual(8);
  });

  it("空/無和音のみ/不正は空配列", () => {
    expect(chordsFromTimeline(null, 120)).toEqual([]);
    expect(chordsFromTimeline([[0, 1, "N"], [1, 2, "X"]], 120)).toEqual([]);
    expect(chordsFromTimeline([[1, 0, "C"]], 120)).toEqual([]); // end<=start
  });
});

describe("pcFromKeyName", () => {
  it("調名→pc", () => {
    expect(pcFromKeyName("D")).toBe(2);
    expect(pcFromKeyName("F#")).toBe(6);
    expect(pcFromKeyName("Bb")).toBe(10);
    expect(pcFromKeyName("よくわからん")).toBeNull();
    expect(pcFromKeyName(undefined)).toBeNull();
  });
});
