import { describe, it, expect } from "vitest";
import { genDrums } from "../src/music/generate";

type Lane = { name: string; midi: number; hits: number[]; vel: number; velCurve?: number[] };
type Rhythm = { steps: number; bars: number; beatsPerStep: number; lanes: Lane[] };
const rh = (r: ReturnType<typeof genDrums>): Rhythm => (r.items[0]!.content as { rhythm: Rhythm }).rhythm;
const lane = (r: Rhythm, name: string) => r.lanes.find((l) => l.name === name);
// 指定小節(bar,grid)の各レーンhitsを bar 相対で集める（比較用）。
const barHits = (r: Rhythm, bar: number, grid: number) =>
  r.lanes.map((l) => ({ name: l.name, hits: l.hits.filter((s) => s >= bar * grid && s < (bar + 1) * grid).map((s) => s - bar * grid) })).filter((l) => l.hits.length);

describe("genDrums 定型ビート＋フィル（WP-D1）", () => {
  it("既定＝opts 無し/空 opts は従来と bit 一致", () => {
    const a = JSON.stringify(genDrums({ meter: "4/4", mood: "明るい" }, 7));
    expect(JSON.stringify(genDrums({ meter: "4/4", mood: "明るい" }, 7, {}))).toBe(a);
    expect(JSON.stringify(genDrums({ meter: "4/4", mood: "明るい" }, 7, undefined))).toBe(a);
  });

  it("style=型ID＝当該グリッドを固定出力（seed 非依存・決定的）", () => {
    const r1 = rh(genDrums({ meter: "4/4" }, 1, { style: "beat8.syncopated" }));
    const r2 = rh(genDrums({ meter: "4/4" }, 999, { style: "beat8.syncopated" }));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2)); // 型ID は seed 不問で固定
    expect(lane(r1, "Kick")!.hits).toEqual([0, 8, 10, 12]); // D5 §2 型3の食い込みキック
    expect(lane(r1, "Snare")!.hits).toEqual([4, 12]);
    expect(r1.steps).toBe(16);
  });

  it("style=ジャンル名→候補型から決定的に1つ選ぶ（jpop chorus/tempo域）", () => {
    const g = genDrums({ meter: "4/4", tempo: 140, section: { role: "chorus" } }, 3, { style: "jpop" });
    const r = rh(g);
    // tempo140・chorus 候補[four.rock/offbeat/beat16]のうち tempo 域内=four.rock（4つ打ちキック）。
    expect(lane(r, "Kick")!.hits).toEqual([0, 4, 8, 12]);
    expect(JSON.stringify(rh(genDrums({ meter: "4/4", tempo: 140, section: { role: "chorus" } }, 3, { style: "jpop" })))).toBe(JSON.stringify(r)); // 決定的
  });

  it("6/8 では 6/8 対応型のみ選ばれる（steps=12・six8.ballad）", () => {
    const r = rh(genDrums({ meter: "6/8", tempo: 70 }, 2, { style: "jpop" }));
    expect(r.steps).toBe(12);
    expect(lane(r, "Kick")!.hits).toEqual([0]);
    expect(lane(r, "Snare")!.hits).toEqual([6]);
    // 6/8 で 4/4 型を直接指定しても six8.ballad へ差し替わる（6/8 型のみ）。
    const r2 = rh(genDrums({ meter: "6/8" }, 0, { style: "four.rock" }));
    expect(r2.steps).toBe(12);
    expect(lane(r2, "Snare")!.hits).toEqual([6]);
  });

  it("未知 style は従来経路へフォールバック（bit 一致）", () => {
    const a = JSON.stringify(genDrums({ meter: "4/4", mood: "明るい" }, 4));
    expect(JSON.stringify(genDrums({ meter: "4/4", mood: "明るい" }, 4, { style: "nonexistent.pattern" }))).toBe(a);
  });

  it("fill ON＝F型が境界小節に出現・他小節は base 不変・着地 crash+kick", () => {
    const grid = 16, N = 4;
    const base = rh(genDrums({ meter: "4/4", bars: 4 }, 5)); // 従来1小節 base
    const r = rh(genDrums({ meter: "4/4", bars: 4 }, 5, { fill: 0.8 }));
    expect(r.bars).toBe(N);
    expect(r.steps).toBe(N * grid);
    const fillBar = N - 2, landingBar = N - 1;
    // 境界小節(=bars-2)にタム下降フィル＝TomFloor が出現（base には無い）。
    const tf = lane(r, "TomFloor");
    expect(tf).toBeTruthy();
    expect(tf!.hits.every((s) => s >= fillBar * grid && s < (fillBar + 1) * grid)).toBe(true);
    // 他小節（0,1）は base（1小節）と bar 相対で一致＝不変。
    const baseBar = barHits(base, 0, grid);
    for (const b of [0, 1]) expect(barHits(r, b, grid)).toEqual(baseBar);
    // 着地：landingBar step0 に Crash + Kick。
    expect(lane(r, "Crash")!.hits).toContain(landingBar * grid);
    expect(lane(r, "Kick")!.hits).toContain(landingBar * grid);
  });

  it("fill の velocity カーブが適用される（フィル型 velCurve）", () => {
    const r = rh(genDrums({ meter: "4/4", bars: 4 }, 5, { fill: 1 })); // intensity 高
    // フィルレーンのどれかに非一様 velCurve（カーブ）が乗る。
    const withCurve = r.lanes.filter((l) => l.velCurve && new Set(l.velCurve).size > 1);
    expect(withCurve.length).toBeGreaterThan(0);
  });

  it("fill=型ID を固定挿入できる（snareRoll）", () => {
    const r = rh(genDrums({ meter: "4/4", bars: 4 }, 0, { fill: "fill.snareRoll.half" }));
    const grid = 16, fillBar = 2;
    const sn = lane(r, "Snare")!;
    // 半小節スネアロール＝境界小節の後半(step8..15)に密な連打。
    const inFill = sn.hits.filter((s) => s >= fillBar * grid + 8 && s < (fillBar + 1) * grid);
    expect(inFill.length).toBe(8);
    expect(sn.velCurve).toBeTruthy(); // クレッシェンド
  });

  it("bars<2 はフィル不可＝ベースのまま（着地小節の余地なし）", () => {
    const r = rh(genDrums({ meter: "4/4", bars: 1 }, 5, { fill: 0.5 }));
    expect(r.bars).toBe(1); // フィル無し＝1小節 base
  });

  it("feel 層委譲：生成物は straight 格子（feel キー無し・hits は整数 step）", () => {
    const content = genDrums({ meter: "4/4", bars: 4 }, 5, { style: "beat8.basic", fill: 0.6 }).items[0]!.content as Record<string, unknown>;
    expect("feel" in content).toBe(false); // swing/微小 timing は applyFeel に委譲＝生成物に焼かない
    const r = (content as { rhythm: Rhythm }).rhythm;
    for (const l of r.lanes) for (const s of l.hits) expect(Number.isInteger(s)).toBe(true);
  });
});
