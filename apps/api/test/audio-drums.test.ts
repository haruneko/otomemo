import { describe, it, expect } from "vitest";
import {
  beatPositionOf,
  estimateMeterDownbeat,
  drumOnsetsToRhythm,
  meterString,
  type DrumOnset,
} from "../src/audio-drums";

// #S12 ドラム interpretation 層のTDD。合成オンセットで拍子/位相推定とループ折り畳みを固定。
// Python(perception)が出す drum_onsets を模す＝ここが差し替え（分離器/ADT）不変の契約面。

// 等間隔ビート（bpm→秒間隔）。beats本。
const beats = (n: number, bpm = 120): number[] =>
  Array.from({ length: n }, (_, i) => Math.round((i * 60) / bpm * 1000) / 1000);

// 指定グローバルビートに種別を1つ置く（時刻=そのビート時刻）。
const at = (bt: number[], beat: number, kind: string, s = 1): DrumOnset => [bt[beat]!, kind, s];

describe("beatPositionOf（実数ビート位置＝線形補間＋端外挿）", () => {
  const bt = beats(8); // 0,0.5,1.0,...
  it("ビート上はその index", () => {
    expect(beatPositionOf(bt, 0)).toBeCloseTo(0);
    expect(beatPositionOf(bt, 1.0)).toBeCloseTo(2);
    expect(beatPositionOf(bt, 3.5)).toBeCloseTo(7);
  });
  it("ビート間は補間", () => {
    expect(beatPositionOf(bt, 0.25)).toBeCloseTo(0.5); // 0と0.5の中点
    expect(beatPositionOf(bt, 0.75)).toBeCloseTo(1.5);
  });
  it("端は外挿", () => {
    expect(beatPositionOf(bt, -0.5)).toBeCloseTo(-1);
    expect(beatPositionOf(bt, 4.0)).toBeCloseTo(8);
  });
});

describe("estimateMeterDownbeat", () => {
  it("① 8ビート4小節 4/4（kickは偶数拍・snareは奇数拍・hihat毎拍）→ meter=4 offset=0 高信頼", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) {
      if (b % 2 === 0) on.push(at(bt, b, "kick"));
      else on.push(at(bt, b, "snare"));
      on.push(at(bt, b, "hihat"));
    }
    const e = estimateMeterDownbeat(bt, on);
    expect(e.meter).toBe(4);
    expect(e.offset).toBe(0);
    expect(e.confidence).toBeGreaterThan(0.5);
  });

  it("② ワルツ 3/4（kick=各小節頭・snare=2拍目）→ meter=3", () => {
    const bt = beats(12);
    const on: DrumOnset[] = [];
    for (let bar = 0; bar < 4; bar++) {
      on.push(at(bt, bar * 3, "kick"));
      on.push(at(bt, bar * 3 + 1, "snare"));
      on.push(at(bt, bar * 3 + 2, "hihat"));
    }
    const e = estimateMeterDownbeat(bt, on);
    expect(e.meter).toBe(3);
  });

  it("③ 位相ずれ（真の小節頭がビート1・kickは小節頭のみ＝非対称）→ offset=1", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    // ダウンビート=ビート1,5,9,13。kickは頭のみ、snareはその小節のバックビート(頭+1,頭+3)。
    for (const d of [1, 5, 9, 13]) {
      on.push(at(bt, d, "kick"));
      if (d + 1 < 16) on.push(at(bt, d + 1, "snare"));
      if (d + 3 < 16) on.push(at(bt, d + 3, "snare"));
    }
    const e = estimateMeterDownbeat(bt, on);
    expect(e.meter).toBe(4);
    expect(e.offset).toBe(1);
  });

  it("④ ジッタ±30ms＋偽オンセット混入でも meter=4 offset=0（頑健）", () => {
    const bt = beats(16);
    const j = (x: number, i: number) => x + ((i % 3) - 1) * 0.03; // 決定的な±30ms
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) {
      if (b % 2 === 0) on.push([j(bt[b]!, b), "kick", 1]);
      else on.push([j(bt[b]!, b), "snare", 1]);
    }
    // 偽オンセット（拍裏の弱いゴースト）を数個
    on.push([0.24, "kick", 0.2], [1.26, "snare", 0.2], [3.1, "hihat", 0.3]);
    const e = estimateMeterDownbeat(bt, on);
    expect(e.meter).toBe(4);
    expect(e.offset).toBe(0);
  });

  it("⑤ ドラム希薄（オンセット僅少）→ 低信頼（手動へ落とす想定）", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [at(bt, 0, "kick"), at(bt, 4, "snare")];
    const e = estimateMeterDownbeat(bt, on);
    expect(e.confidence).toBeLessThan(0.5);
  });

  it("オンセット無しは confidence 0（既定 4/4）", () => {
    expect(estimateMeterDownbeat(beats(16), [])).toEqual({ meter: 4, offset: 0, confidence: 0 });
  });
});

describe("drumOnsetsToRhythm（拍位置→16分量子化→多数決で1小節ループ）", () => {
  it("4/4 8ビートロック → steps=16・kick[0,8]・snare[4,12]・hihat[0,4,8,12]", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) {
      if (b % 2 === 0) on.push(at(bt, b, "kick"));
      else on.push(at(bt, b, "snare"));
      on.push(at(bt, b, "hihat"));
    }
    const r = drumOnsetsToRhythm(on, bt, 0, 4);
    expect(r.steps).toBe(16);
    const lane = (name: string) => r.lanes.find((l) => l.name === name);
    expect(lane("Kick")!.hits).toEqual([0, 8]);
    expect(lane("Snare")!.hits).toEqual([4, 12]);
    expect(lane("HiHat")!.hits).toEqual([0, 4, 8, 12]);
    expect(lane("Kick")!.midi).toBe(36);
    expect(lane("Snare")!.midi).toBe(38);
  });

  it("3/4 → steps=12", () => {
    const bt = beats(12);
    const on: DrumOnset[] = [];
    for (let bar = 0; bar < 4; bar++) {
      on.push(at(bt, bar * 3, "kick"));
      on.push(at(bt, bar * 3 + 1, "snare"));
    }
    const r = drumOnsetsToRhythm(on, bt, 0, 3);
    expect(r.steps).toBe(12);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0]);
    expect(r.lanes.find((l) => l.name === "Snare")!.hits).toEqual([4]);
  });

  it("多数決＝一部小節にしか無いフィルは落とす（4小節中1小節だけの hit は不採用）", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b += 2) on.push(at(bt, b, "kick")); // 全小節 step0,8
    on.push(at(bt, 3, "snare")); // 1小節目だけの単発（1/4小節）→ 落ちる
    const r = drumOnsetsToRhythm(on, bt, 0, 4);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0, 8]);
    expect(r.lanes.find((l) => l.name === "Snare")).toBeUndefined(); // 単発は多数決で消える
  });

  it("offset を与えるとその位相で小節を切る", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (const d of [1, 5, 9, 13]) on.push(at(bt, d, "kick")); // 頭がビート1
    const r = drumOnsetsToRhythm(on, bt, 1, 4);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0]); // 各小節頭=step0
  });
});

describe("meterString", () => {
  it("3→3/4・4→4/4・6→6/8", () => {
    expect(meterString(3)).toBe("3/4");
    expect(meterString(4)).toBe("4/4");
    expect(meterString(6)).toBe("6/8");
  });
});
