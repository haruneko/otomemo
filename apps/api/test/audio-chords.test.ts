import { describe, it, expect } from "vitest";
import { chordsFromTimeline, chordSequenceFromTimeline, pcFromKeyName } from "../src/audio-chords";

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

describe("chordSequenceFromTimeline（#S11 コードレンズ用・全曲・量子化なし）", () => {
  it("N/X飛ばし・連続同ルートを畳む・量子化なし（start なし / dur=総秒）", () => {
    const tl = [[0, 1, "N"], [1, 3, "A:min"], [3, 5, "A:min"], [5, 9, "C"], [9, 10, "D:7"]];
    const out = chordSequenceFromTimeline(tl);
    expect(out).toEqual([
      { root: 9, quality: "m", dur: 4 }, // A:min（連続畳み・2s+2s=4s）
      { root: 0, quality: "", dur: 4 },  // C（5-9=4s）
      { root: 2, quality: "7", dur: 1 }, // D:7（9-10=1s）
    ]);
  });

  it("quality は秒数累積最長を採用（同ルート・異quality）", () => {
    // C major 1s → C minor 3s → C major 0.5s: total minor(3s) > major(1.5s)→ minor 代表
    const tl = [[0, 1, "C"], [1, 4, "C:min"], [4, 4.5, "C"]];
    const out = chordSequenceFromTimeline(tl);
    expect(out).toHaveLength(1);
    expect(out[0]!.root).toBe(0);
    expect(out[0]!.quality).toBe("m"); // minor が最長
  });

  it("maxBeats 制限なし＝全コードを返す（chordsFromTimeline とは異なる）", () => {
    // 100コード分
    const tl = Array.from({ length: 100 }, (_, i) => [i, i + 1, i % 2 === 0 ? "C" : "Am"]);
    const out = chordSequenceFromTimeline(tl);
    expect(out.length).toBe(100); // 交互に変わるので全部別
  });

  it("root が変わったら連続畳みリセット", () => {
    const tl = [[0, 2, "C"], [2, 4, "G"], [4, 6, "C"]]; // C→G→C（C は連続していない）
    const out = chordSequenceFromTimeline(tl);
    expect(out).toEqual([
      { root: 0, quality: "", dur: 2 },
      { root: 7, quality: "", dur: 2 },
      { root: 0, quality: "", dur: 2 }, // 再登場は別エントリ
    ]);
  });

  it("空/不正/無和音のみ → 空配列", () => {
    expect(chordSequenceFromTimeline(null)).toEqual([]);
    expect(chordSequenceFromTimeline([])).toEqual([]);
    expect(chordSequenceFromTimeline([[0, 1, "N"], [1, 2, "X"]])).toEqual([]);
    expect(chordSequenceFromTimeline([[1, 0, "C"]])).toEqual([]); // end<=start
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
