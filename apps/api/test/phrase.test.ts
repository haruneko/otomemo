import { describe, it, expect } from "vitest";
import { isStandardMeter, segmentByBars, clusterPhrases, beatsPerBarFromBeats, firstDownbeatFromBeats, scoreDurations } from "../src/music/phrase";
import { parseMidi, meterOf } from "../src/music/midi";

type N = { pitch: number; start: number; dur: number };
const seq = (starts: number[], step = 1): N[] => starts.map((s) => ({ pitch: 60, start: s, dur: step }));

describe("isStandardMeter（標準拍子だけ通す）", () => {
  it("4/4・3/4・2/4・6/8・9/8・12/8 は true、変拍子(5/4,7/8)は false", () => {
    for (const m of ["4/4", "3/4", "2/4", "2/2", "6/8", "9/8", "12/8", "3/8"]) expect(isStandardMeter(m), m).toBe(true);
    for (const m of ["5/4", "7/8", "5/8", "7/4", "", "x", "11/16"]) expect(isStandardMeter(m), m).toBe(false);
  });
});

describe("segmentByBars（実小節で4小節ごとに切る）", () => {
  it("4/4：1フレーズ=16拍。32拍を2フレーズに、各 start 0 起点へ", () => {
    const ph = segmentByBars(seq([0, 4, 8, 12, 16, 20, 24, 28]), "4/4", 4);
    expect(ph.length).toBe(2);
    expect(ph[0]!.map((n) => n.start)).toEqual([0, 4, 8, 12]);
    expect(ph[1]!.map((n) => n.start)).toEqual([0, 4, 8, 12]); // 2フレーズ目も0起点
  });

  it("6/8：1小節=3拍 → 4小節=12拍で切る（4/4の16拍とは違う＝拍子を見誤らない）", () => {
    const ph = segmentByBars(seq([0, 3, 6, 9, 12, 15, 18, 21]), "6/8", 4);
    expect(ph.length).toBe(2);
    expect(ph[0]!.map((n) => n.start)).toEqual([0, 3, 6, 9]);
  });

  it("3/4：1小節=3拍 → 12拍で切る", () => {
    const ph = segmentByBars(seq([0, 3, 6, 9, 12, 15, 18, 21]), "3/4", 4);
    expect(ph.length).toBe(2);
    expect(ph[1]!.map((n) => n.start)).toEqual([0, 3, 6, 9]); // 12,15,18,21 → 0,3,6,9
  });

  it("弱起：最初の音が小節後半→次の小節頭を起点、弱起音は負startで phrase0 に付く（1小節ズレ防止）", () => {
    const notes = [
      { pitch: 60, start: 3, dur: 1 }, // 弱起（小節後半）
      { pitch: 62, start: 4, dur: 1 }, { pitch: 64, start: 5, dur: 1 }, { pitch: 65, start: 6, dur: 1 }, { pitch: 67, start: 7, dur: 1 },
    ];
    const ph = segmentByBars(notes, "4/4", 4, 2);
    expect(ph.length).toBe(1);
    expect(ph[0]![0]!.start).toBe(-1); // 弱起＝origin(4)の1拍前
    expect(ph[0]![1]!.start).toBe(0); // 本フレーズ頭＝小節頭
  });

  it("連続する弱起：各フレーズ境界の弱起（前小節に食い込む頭）が次フレーズに負startで付く", () => {
    const notes = [
      { pitch: 60, start: 3, dur: 1 }, // phrase0 の弱起
      { pitch: 62, start: 4, dur: 1 }, { pitch: 64, start: 8, dur: 1 }, { pitch: 65, start: 12, dur: 1 }, { pitch: 67, start: 16, dur: 1 },
      { pitch: 60, start: 19, dur: 1 }, // phrase1 の弱起（phrase0末尾の小節へ食い込む＝次フレーズ所属）
      { pitch: 62, start: 20, dur: 1 }, { pitch: 64, start: 24, dur: 1 }, { pitch: 65, start: 28, dur: 1 }, { pitch: 67, start: 32, dur: 1 },
    ];
    const ph = segmentByBars(notes, "4/4", 4, 2);
    expect(ph.length).toBe(2);
    expect(ph[0]![0]!.start).toBe(-1); // phrase0 弱起
    expect(ph[1]![0]!.start).toBe(-1); // phrase1 も弱起付き＝前小節からの食い込みを正しく次フレーズへ
    expect(ph[1]![1]!.start).toBe(0); // phrase1 本体頭＝小節頭
  });

  it("疎なフレーズ（minNotes未満）は捨てる", () => {
    const ph = segmentByBars(seq([0, 4, 8, 12, 16]), "4/4", 4, 4); // 2フレーズ目は1音
    expect(ph.length).toBe(1);
  });

  it("anchorBeat：実 downbeat が beat0 の倍数に乗らない曲（オフセット1）でも本体頭が小節頭(0)に乗る", () => {
    // POP909 010/020 型：実 downbeat が beat 1,5,9,13… 。anchorBeat=1 を渡すと位相がそのまま使われる。
    const notes = seq([1, 5, 9, 13, 17, 21, 25, 29], 4); // 8小節分の小節頭、各小節頭に1音
    const ph = segmentByBars(notes, "4/4", 4, 4, 1);
    expect(ph.length).toBe(2);
    expect(ph[0]!.map((n) => n.start)).toEqual([0, 4, 8, 12]); // 本体頭=0（1拍ズレない）
    expect(ph[1]!.map((n) => n.start)).toEqual([0, 4, 8, 12]);
  });

  it("anchorBeat＋弱起：downbeat 手前の pickup 音は負start で次フレーズ(phrase0)に付く", () => {
    const notes = [
      { pitch: 60, start: 0, dur: 1 }, // pickup（downbeat=1 の手前）
      { pitch: 62, start: 1, dur: 1 }, { pitch: 64, start: 5, dur: 1 }, { pitch: 65, start: 9, dur: 1 }, { pitch: 67, start: 13, dur: 1 },
    ];
    const ph = segmentByBars(notes, "4/4", 4, 2, 1);
    expect(ph.length).toBe(1);
    expect(ph[0]![0]!.start).toBe(-1); // pickup＝anchor(1)の1拍前
    expect(ph[0]![1]!.start).toBe(0); // 本体頭＝小節頭
  });

  it("anchorBeat=0（合致曲）は従来の tick0 アンカーと同じ結果", () => {
    const ph = segmentByBars(seq([0, 4, 8, 12, 16, 20, 24, 28]), "4/4", 4, 4, 0);
    expect(ph[0]!.map((n) => n.start)).toEqual([0, 4, 8, 12]);
    expect(ph[1]!.map((n) => n.start)).toEqual([0, 4, 8, 12]);
  });
});

describe("firstDownbeatFromBeats（最初の小節頭の絶対拍）", () => {
  it("downbeat(3列目=1) が初めて立つ行index を返す（=絶対拍, 1行1拍）", () => {
    // 010型：行index 1,5,9… が downbeat → 最初は 1
    const txt = Array.from({ length: 16 }, (_, i) => `${i * 0.5} 0 ${i % 4 === 1 ? 1 : 0}`).join("\n");
    expect(firstDownbeatFromBeats(txt)).toBe(1);
    // 合致型：行index 0,4,8… → 最初は 0
    const txt0 = Array.from({ length: 16 }, (_, i) => `${i * 0.5} 0 ${i % 4 === 0 ? 1 : 0}`).join("\n");
    expect(firstDownbeatFromBeats(txt0)).toBe(0);
  });
  it("downbeat が一つも無ければ null", () => {
    expect(firstDownbeatFromBeats("0 0 0\n1 0 0\n2 0 0")).toBeNull();
  });
});

describe("scoreDurations（演奏音長→楽譜長の復元）", () => {
  it("スタッカート(短く切れた)音を次の音の頭まで伸ばす＝楽譜長", () => {
    // 4分音符をスタッカートで弾いた風（dur0.4＋休み）→ 各音 dur1.0（次のonsetまで）
    const perf = [
      { pitch: 60, start: 0, dur: 0.4 }, { pitch: 62, start: 1, dur: 0.4 },
      { pitch: 64, start: 2, dur: 0.4 }, { pitch: 65, start: 3, dur: 0.5 },
    ];
    const sc = scoreDurations(perf);
    expect(sc.map((n) => n.dur)).toEqual([1, 1, 1, 0.5]); // 末尾は自身の量子化長
    expect(sc.map((n) => n.start)).toEqual([0, 1, 2, 3]);
  });
  it("オンセットの揺れをグリッドへ量子化", () => {
    const sc = scoreDurations([{ pitch: 60, start: 0.05, dur: 0.4 }, { pitch: 62, start: 0.97, dur: 0.4 }]);
    expect(sc.map((n) => n.start)).toEqual([0, 1]); // 0.05→0, 0.97→1
  });
  it("長すぎる間は 二分音符(2拍)以下に抑える（休符を1音にしない）", () => {
    const sc = scoreDurations([{ pitch: 60, start: 0, dur: 0.2 }, { pitch: 62, start: 10, dur: 1 }]);
    expect(sc[0]!.dur).toBe(2); // 0→10 の間でも 二分音符=2 で頭打ち
  });
  it("密なフレーズ（8分中心）では最長音もフレーズ相対で短く（中央値×3≦）", () => {
    // IOI=0.5(8分)中心 → maxDur=min(2, 1.5)=1.5。長い間があっても1.5止まり。
    const sc = scoreDurations([
      { pitch: 60, start: 0, dur: 0.3 }, { pitch: 62, start: 0.5, dur: 0.3 },
      { pitch: 64, start: 1, dur: 0.3 }, { pitch: 65, start: 4, dur: 0.3 },
    ]);
    expect(Math.max(...sc.map((n) => n.dur))).toBeLessThanOrEqual(1.5);
  });
});

describe("beatsPerBarFromBeats（beatファイルから拍/小節を復元）", () => {
  it("小節頭(3列目=1)が4拍ごと → 4、3拍ごと → 3", () => {
    // 各行: time beat downbeat。downbeat=1 が小節頭。
    const four = Array.from({ length: 16 }, (_, i) => `${i * 0.5} ${i % 2} ${i % 4 === 0 ? 1 : 0}`).join("\n");
    expect(beatsPerBarFromBeats(four)).toBe(4);
    const three = Array.from({ length: 15 }, (_, i) => `${i * 0.5} ${i % 2} ${i % 3 === 0 ? 1 : 0}`).join("\n");
    expect(beatsPerBarFromBeats(three)).toBe(3);
  });
  it("小節頭が少なすぎ/不規則は null", () => {
    expect(beatsPerBarFromBeats("0 1 1\n1 0 0")).toBeNull();
  });
});

describe("clusterPhrases（似たフレーズを束ねて圧縮）", () => {
  const r = (ps: number[]): N[] => ps.map((p, i) => ({ pitch: p, start: i, dur: 1 }));
  it("移調しただけの同型フレーズは1パターンに束ねる（count加算）／別輪郭は別パターン", () => {
    const A = r([60, 62, 64, 65]); // C D E F（上行）
    const B = r([67, 69, 71, 72]); // G A B C（同じ上行を移調）
    const C = r([60, 67, 60, 67]); // C G C G（別の輪郭）
    const pats = clusterPhrases([
      { notes: A, style: "x" }, { notes: B, style: "x" }, { notes: C, style: "x" },
    ], 0.85);
    expect(pats.length).toBe(2); // A・B が1つ、C が別
    expect(pats[0]!.count).toBe(2); // 頻出（A+B）が先頭
  });

  it("style が違えば束ねない", () => {
    const A = r([60, 62, 64, 65]);
    const pats = clusterPhrases([{ notes: A, style: "irish" }, { notes: A, style: "pop" }], 0.85);
    expect(pats.length).toBe(2);
  });
});

describe("midi.meterOf（拍子変更は null＝捨てる）", () => {
  function midiWithTimeSig(sigs: [number, number, number][]): Uint8Array {
    // sigs: [deltaTick, numerator, denomPow]
    const trk: number[] = [];
    for (const [dt, num, pow] of sigs) trk.push(dt!, 0xff, 0x58, 0x04, num!, pow!, 24, 8);
    trk.push(0, 0xff, 0x2f, 0x00);
    const len = trk.length;
    return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, len, ...trk]);
  }
  it("単一 6/8 → '6/8'、変更(4/4→3/4) → null、無し → 4/4", () => {
    expect(meterOf(parseMidi(midiWithTimeSig([[0, 6, 3]])))).toBe("6/8"); // 2^3=8
    expect(meterOf(parseMidi(midiWithTimeSig([[0, 4, 2], [96, 3, 2]])))).toBeNull(); // 4/4→3/4 変更（delta<128）
    expect(meterOf(parseMidi(midiWithTimeSig([])))).toBe("4/4");
  });
});
