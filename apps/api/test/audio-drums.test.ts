import { describe, it, expect } from "vitest";
import {
  beatPositionOf,
  estimateGrid,
  estimateMeterDownbeat,
  drumOnsetsToRhythm,
  meterString,
  type DrumOnset,
  type Grid,
} from "../src/audio-drums";

// #S12 ドラム interpretation 層のTDD。グリッド推定(estimateGrid)と、それを前提にした拍子/位相推定・
// ループ折り畳みを分離してテスト。合成オンセットは Python(perception)が出す drum_onsets を模す＝
// ここが差し替え（分離器/ADT）不変の契約面。

// 等間隔ビート（bpm→秒間隔）。onset 時刻を置くための座標。
const beats = (n: number, bpm = 120): number[] =>
  Array.from({ length: n }, (_, i) => Math.round((i * 60) / bpm * 1000) / 1000);
// 合成用の「完全な」剛体グリッド（下流ロジックを正確なグリッドでテストするため）。
const G = (bpm = 120): Grid => ({ origin: 0, beatPeriod: 60 / bpm });
const at = (bt: number[], beat: number, kind: string, s = 1): DrumOnset => [bt[beat]!, kind, s];

describe("beatPositionOf（実数ビート位置＝線形補間＋端外挿）", () => {
  const bt = beats(8);
  it("ビート上はその index", () => {
    expect(beatPositionOf(bt, 0)).toBeCloseTo(0);
    expect(beatPositionOf(bt, 1.0)).toBeCloseTo(2);
    expect(beatPositionOf(bt, 3.5)).toBeCloseTo(7);
  });
  it("ビート間は補間・端は外挿", () => {
    expect(beatPositionOf(bt, 0.25)).toBeCloseTo(0.5);
    expect(beatPositionOf(bt, -0.5)).toBeCloseTo(-1);
    expect(beatPositionOf(bt, 4.0)).toBeCloseTo(8);
  });
});

describe("estimateGrid（ドラム由来の剛体グリッド＝コムフィルタでテンポ/位相）", () => {
  // 剛体グリッドの絶対位相は16分の粒度で曖昧（拍だけにonsetがあると「どの16分が拍か」は複数解）。
  // 重要なのは①周期が正しい②onset同士の相対位置が一定間隔で乗る、こと。絶対origin=0は要求しない。
  const spacing = (g: Grid, times: number[]) =>
    times.map((t) => (t - g.origin) / g.beatPeriod).map((x) => x - Math.floor(x)); // 各onsetの拍内小数部
  it("拍上のキック/スネアから正しい拍周期を復元（間隔=1拍・小数部が一定）", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) on.push(at(bt, b, b % 2 === 0 ? "kick" : "snare"));
    const g = estimateGrid(bt, on);
    expect(g.beatPeriod).toBeGreaterThan(0.48);
    expect(g.beatPeriod).toBeLessThan(0.52);
    const frac = spacing(g, on.map(([t]) => t));
    // 全onsetの拍内小数部が（16分の丸め誤差内で）一定＝規則正しい格子に乗っている
    expect(Math.max(...frac) - Math.min(...frac)).toBeLessThan(0.15);
  });
  it("位相/テンポがずれても（全体+0.1s）規則正しい格子を復元", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) on.push([bt[b]! + 0.1, b % 2 === 0 ? "kick" : "snare", 1]);
    const g = estimateGrid(bt, on);
    const frac = spacing(g, on.map(([t]) => t));
    expect(Math.max(...frac) - Math.min(...frac)).toBeLessThan(0.15);
  });
});

describe("estimateMeterDownbeat（グリッドを前提に拍子/位相）", () => {
  it("① 8ビート4小節 4/4（kick偶数拍・snare奇数拍・hihat毎拍）→ meter=4 offset=0 高信頼", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) {
      on.push(at(bt, b, b % 2 === 0 ? "kick" : "snare"));
      on.push(at(bt, b, "hihat"));
    }
    const e = estimateMeterDownbeat(G(), on);
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
    }
    expect(estimateMeterDownbeat(G(), on).meter).toBe(3);
  });

  it("③ 位相ずれ（真の小節頭がビート1・kickは小節頭のみ）→ offset=1", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (const d of [1, 5, 9, 13]) {
      on.push(at(bt, d, "kick"));
      if (d + 1 < 16) on.push(at(bt, d + 1, "snare"));
      if (d + 3 < 16) on.push(at(bt, d + 3, "snare"));
    }
    const e = estimateMeterDownbeat(G(), on);
    expect(e.meter).toBe(4);
    expect(e.offset).toBe(1);
  });

  it("④ ジッタ±30msでも meter=4 offset=0（頑健）", () => {
    const bt = beats(16);
    const j = (x: number, i: number) => x + ((i % 3) - 1) * 0.03;
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) on.push([j(bt[b]!, b), b % 2 === 0 ? "kick" : "snare", 1]);
    const e = estimateMeterDownbeat(G(), on);
    expect(e.meter).toBe(4);
    expect(e.offset).toBe(0);
  });

  it("⑤ ドラム希薄→ 低信頼／オンセット無し→ confidence 0", () => {
    const bt = beats(16);
    expect(estimateMeterDownbeat(G(), [at(bt, 0, "kick"), at(bt, 4, "snare")]).confidence).toBeLessThan(0.5);
    expect(estimateMeterDownbeat(G(), [])).toEqual({ meter: 4, offset: 0, confidence: 0 });
  });
});

describe("drumOnsetsToRhythm（グリッド上で16分量子化→多数決で1小節ループ）", () => {
  it("4/4 8ビートロック → steps=16・kick[0,8]・snare[4,12]・hihat[0,4,8,12]", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b++) {
      on.push(at(bt, b, b % 2 === 0 ? "kick" : "snare"));
      on.push(at(bt, b, "hihat"));
    }
    const r = drumOnsetsToRhythm(G(), on, 0, 4);
    expect(r.steps).toBe(16);
    const lane = (name: string) => r.lanes.find((l) => l.name === name)!;
    expect(lane("Kick").hits).toEqual([0, 8]);
    expect(lane("Snare").hits).toEqual([4, 12]);
    expect(lane("HiHat").hits).toEqual([0, 4, 8, 12]);
    expect(lane("Kick").midi).toBe(36);
    expect(lane("Snare").midi).toBe(38);
  });

  it("3/4 → steps=12", () => {
    const bt = beats(12);
    const on: DrumOnset[] = [];
    for (let bar = 0; bar < 4; bar++) {
      on.push(at(bt, bar * 3, "kick"));
      on.push(at(bt, bar * 3 + 1, "snare"));
    }
    const r = drumOnsetsToRhythm(G(), on, 0, 3);
    expect(r.steps).toBe(12);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0]);
    expect(r.lanes.find((l) => l.name === "Snare")!.hits).toEqual([4]);
  });

  it("多数決＝一部小節にしか無いフィルは落とす", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (let b = 0; b < 16; b += 2) on.push(at(bt, b, "kick")); // 全小節 step0,8
    on.push(at(bt, 3, "snare")); // 1小節目だけの単発
    const r = drumOnsetsToRhythm(G(), on, 0, 4);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0, 8]);
    expect(r.lanes.find((l) => l.name === "Snare")).toBeUndefined();
  });

  it("offset を与えるとその位相で小節を切る", () => {
    const bt = beats(16);
    const on: DrumOnset[] = [];
    for (const d of [1, 5, 9, 13]) on.push(at(bt, d, "kick"));
    const r = drumOnsetsToRhythm(G(), on, 1, 4);
    expect(r.lanes.find((l) => l.name === "Kick")!.hits).toEqual([0]);
  });
});

describe("meterString", () => {
  it("3→3/4・4→4/4・6→6/8", () => {
    expect(meterString(3)).toBe("3/4");
    expect(meterString(4)).toBe("4/4");
    expect(meterString(6)).toBe("6/8");
  });
});
