import { describe, it, expect } from "vitest";
import { chordsFromTimeline, chordSequenceFromTimeline, pcFromKeyName, refineChordsWithBass } from "../src/audio-chords";

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

describe("refineChordsWithBass（#S12改3 ベースでコード精緻化＝(1)ルート補正/(2)転回検出）", () => {
  // bpm120＝0.5s/beat。各コード2s。ベースは区間を満たす1音（frac≈1）で明示。
  const chordTL = (labels: string[]) => labels.map((l, i) => [i * 2, i * 2 + 2, l] as [number, number, string]);
  const bassFull = (pcs: number[]) => pcs.map((pc, i) => [i * 2, i * 2 + 2, 36 + pc] as [number, number, number]);

  it("(2)転回：bass がコードトーン(≠ルート)なら slash（bass セット・source=slash）", () => {
    // C(0,4,7): 区間0 bass=E(4)→C/E、区間1 bass=G(7)→C/G（bass違いで畳まれない）
    const out = refineChordsWithBass(chordTL(["C", "C"]), [[0, 2, 36 + 4], [2, 4, 36 + 7]], 120);
    expect(out).toEqual([ // 各2s=4拍(bpm120)。bass違いで畳まれず2枠。
      { root: 0, quality: "", start: 0, dur: 4, bass: 4, source: "slash" },
      { root: 0, quality: "", start: 4, dur: 4, bass: 7, source: "slash" },
    ]);
  });

  it("bass==ルート → BTC確定（bass無し・source=btc）", () => {
    const out = refineChordsWithBass(chordTL(["C"]), bassFull([0]), 120);
    expect(out).toEqual([{ root: 0, quality: "", start: 0, dur: 4, source: "btc" }]);
  });

  it("(1)ルート補正：bass が非コードトーンで強支配→bass をルートへ（quality保持・source=bass-root）", () => {
    // BTC=C(0,4,7) だが bass=A(9・非コードトーン)が全区間支配→Aへ再ルート
    const out = refineChordsWithBass(chordTL(["C"]), bassFull([9]), 120);
    expect(out).toEqual([{ root: 9, quality: "", start: 0, dur: 4, source: "bass-root" }]);
  });

  it("非コードトーンでも弱い(通過音)→BTC維持（誤補正しない）", () => {
    // bassはA(9)だが区間2sのうち0.4sだけ(frac0.2<0.6)→補正しない
    const out = refineChordsWithBass(chordTL(["C"]), [[0, 0.4, 36 + 9]], 120);
    expect(out).toEqual([{ root: 0, quality: "", start: 0, dur: 4, source: "btc" }]);
  });

  it("ベース無し→従来どおり（全部 btc・chordsFromTimeline 相当）", () => {
    const out = refineChordsWithBass(chordTL(["C", "G"]), [], 120);
    expect(out.map((c) => ({ root: c.root, source: c.source }))).toEqual([
      { root: 0, source: "btc" }, { root: 7, source: "btc" },
    ]);
  });

  it("C3 run≥2拍ガード：1拍断片は非コードトーン強支配でもルート補正しない（誤爆回避）", () => {
    // C(0,4,7)・0.5s=1拍・bass=A(9・非コードトーン)が全区間支配(frac1)。旧実装は補正、新実装は 1拍<2拍で不補正。
    const out = refineChordsWithBass([[0, 0.5, "C"]], [[0, 0.5, 36 + 9]], 120);
    expect(out).toEqual([{ root: 0, quality: "", start: 0, dur: 1, source: "btc" }]);
  });

  it("C3 run≥2拍ガード：2拍以上なら従来どおり補正する（長尺runは信頼）", () => {
    const out = refineChordsWithBass([[0, 1, "C"]], [[0, 1, 36 + 9]], 120); // 1s=2拍
    expect(out).toEqual([{ root: 9, quality: "", start: 0, dur: 2, source: "bass-root" }]);
  });
});

describe("拍格子スナップ（監査C1・beatTimes 指定時）", () => {
  const bt = Array.from({ length: 40 }, (_, i) => i * 0.5); // bpm120 均一格子
  it("N/X の穴（コード変化の小節内位置）を保存＝bpm 丸めは穴を潰すが格子は残す", () => {
    const tl = [[0, 2, "C"], [2, 4, "N"], [4, 6, "G"]];
    // 従来（beatTimes 無し）＝穴を潰して G が拍4に前詰め
    expect(chordsFromTimeline(tl, 120)).toEqual([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 4, dur: 4 },
    ]);
    // 格子（beatTimes 有り）＝N の2秒(4拍)ぶんの穴を保存し G は拍8から
    expect(chordsFromTimeline(tl, 120, 64, { beatTimes: bt, anchorSec: 0, meter: 4 })).toEqual([
      { root: 0, quality: "", start: 0, dur: 4 },
      { root: 7, quality: "", start: 8, dur: 4 },
    ]);
  });

  it("anchorSec 起点で小節内位相を保つ＝downbeat がずれると start%meter がずれる", () => {
    const tl = [[0, 2, "C"], [2, 4, "G"]];
    // downbeat=1.0s（拍2）＝先頭コードは小節頭の2拍前＝start は拍2位置から始まる
    const out = chordsFromTimeline(tl, 120, 64, { beatTimes: bt, anchorSec: 1.0, meter: 4 });
    expect(out).toEqual([
      { root: 0, quality: "", start: 2, dur: 4 },
      { root: 7, quality: "", start: 6, dur: 4 },
    ]);
    expect(out.every((c) => c.start % 4 === 2)).toBe(true); // 両者とも拍2位置でコードチェンジ
  });

  it("均一格子＋anchor0 では従来 bpm 丸めと一致（退行なし）", () => {
    const tl = [[0, 1, "N"], [1, 3, "A:min"], [3, 5, "C"], [5, 6, "D:7"]];
    const scalar = chordsFromTimeline(tl, 120);
    const grid = chordsFromTimeline(tl, 120, 64, { beatTimes: bt, anchorSec: 0, meter: 4 });
    // 先頭 N（1s の穴）は格子だと保存＝A:min は拍2から。scalar は拍0から。位相以外の形は一致。
    expect(grid.map((c) => `${c.root}:${c.quality}:${c.dur}`)).toEqual(scalar.map((c) => `${c.root}:${c.quality}:${c.dur}`));
  });
});
