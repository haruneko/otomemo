import { describe, it, expect } from "vitest";
import { genSkeletonFromModel, loadSkeletonModel, scalePitchList } from "../src/music/melodyCells";
import { scalePcs } from "../src/music/theory";
import { skeletonDegPrior, type PriorEntry } from "../src/music/corpusStats";

// (WP-M1) 骨格度数サンプリングへ loadSkeletonPriors(degHist) を弱バイアス。genChords(D) と同思想＝
// 頻度は重み・draw数不変で bit一致。正典＝design「コーパス遷移統計テーブル 第2弾」＋WP-M1 計画。

const cMaj = scalePitchList(scalePcs(0, "major"), 48, 84);
const model = loadSkeletonModel(false);
const roots = [0, 5, 7, 0, 5, 7, 0, 0]; // 8小節・度数根pc
const baseArgs = { tonicPc: 0, beatsPerBar: 4, strongQuarters: [0, 2], start: 60 };

describe("(WP-M1) skeletonDegPrior（pc→スケール度・正規化・非ダイアトニック破棄）", () => {
  it("major: pc を度数へ写し合計1へ正規化・非ダイアトニックは破棄", () => {
    const priors: Record<string, PriorEntry[]> = {
      degHist: [
        { bin: "0", pct: 0.4, n: 40 }, // I → deg0
        { bin: "4", pct: 0.3, n: 30 }, // iii pc4 → deg2
        { bin: "7", pct: 0.2, n: 20 }, // V pc7 → deg4
        { bin: "1", pct: 0.1, n: 10 }, // C# 非ダイアトニック → 破棄
      ],
    };
    const p = skeletonDegPrior(priors, "degHist", false);
    expect(p.get(0)).toBeCloseTo(0.4 / 0.9, 5); // 破棄後 total=0.9 で正規化
    expect(p.get(2)).toBeCloseTo(0.3 / 0.9, 5);
    expect(p.get(4)).toBeCloseTo(0.2 / 0.9, 5);
    expect(p.has(1)).toBe(false); // pc1 は度数化されない
    expect([...p.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
  it("空 prior＝空 Map（素通し）", () => {
    expect(skeletonDegPrior({}, "degHist", false).size).toBe(0);
  });
  it("minor: pc→度数マップが短音階（pc3→deg2 等）", () => {
    const p = skeletonDegPrior({ degHist: [{ bin: "3", pct: 1, n: 1 }] }, "degHist", true);
    expect(p.get(2)).toBeCloseTo(1, 5); // ♭3(pc3) → 短音階の deg2
  });
});

describe("(WP-M1) genSkeletonFromModel degPrior 結線（OFF=bit一致・ON=分布寄せ）", () => {
  const degOf = (p: number) => (((p - baseArgs.tonicPc) % 12) + 12) % 12;

  it("degPrior 未指定＝現行と bit 一致（回帰ゼロ）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed, degPrior: undefined }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed }));
    }
  });

  it("空 degPrior Map＝bit 一致（degrade gracefully）", () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed, degPrior: new Map() }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed }));
    }
  });

  it("degPrior 在＝決定的、かつ tonic 度数バイアスで tonic 音が増える（分布が寄る）", () => {
    const prior = new Map<number, number>([[0, 1]]); // 度数0(tonic)を強く
    // 決定的（同入力=同出力）
    for (const seed of [1, 5]) {
      expect(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed, degPrior: prior, degPriorStrength: 6 }))
        .toEqual(genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed, degPrior: prior, degPriorStrength: 6 }));
    }
    let onTonic = 0, offTonic = 0;
    for (let seed = 1; seed <= 40; seed++) {
      onTonic += genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed, degPrior: prior, degPriorStrength: 8 }).filter((p) => degOf(p) === 0).length;
      offTonic += genSkeletonFromModel(roots, model, cMaj, { ...baseArgs, seed }).filter((p) => degOf(p) === 0).length;
    }
    expect(onTonic).toBeGreaterThan(offTonic); // tonic 強バイアスで tonic-pc 音が増える
  });
});
