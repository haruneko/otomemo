import { describe, it, expect } from "vitest";
import {
  intervalIC,
  targetIC,
  expectationLens,
  hookLens,
  singabilityLens,
  melodyLenses,
  FEMALE_POP_AVG,
  MALE_POP_AVG,
  type LensNote,
} from "../src/index";

// WP-M3 候補レンズ（design #12-M「候補レンズ」）。思想＝審判でなく並べ替え眼鏡。
// 研究doc（expectation/earworm-hook/singability）の方向性・数値例を固定値テストに。全レンズ headline は高い=良い。

// 便宜：8分刻みの度数列から notes を作る（start=拍・dur）。
const seq = (pitches: number[], step = 0.5, dur = 0.5): LensNote[] =>
  pitches.map((p, i) => ({ pitch: p, start: i * step, dur }));

describe("intervalIC（近接＋gap-fill サロゲート）", () => {
  it("大きい音程ほど高IC（proximity）", () => {
    expect(intervalIC(2, null)).toBeLessThan(intervalIC(7, null));
    expect(intervalIC(0, null)).toBeLessThan(intervalIC(12, null));
  });
  it("跳躍後：逆向きstep(充填)は低IC・非充填(同方向継続)は高IC", () => {
    const filled = intervalIC(-2, 7); // 上跳躍→下2度＝gap-fill充足
    const notFilled = intervalIC(2, 7); // 上跳躍→さらに上＝非充足
    expect(filled).toBeLessThan(notFilled);
  });
  it("0..1 に収まる", () => {
    for (const iv of [-12, -5, 0, 3, 12, 24]) expect(intervalIC(iv, null)).toBeGreaterThanOrEqual(0);
    for (const iv of [-12, -5, 0, 3, 12, 24]) expect(intervalIC(iv, null)).toBeLessThanOrEqual(1);
  });
});

describe("targetIC（句内ICカーブ＝鋸歯：句頭高→句中低→句末底）", () => {
  it("句頭は高く句末は低い", () => {
    expect(targetIC(0)).toBeGreaterThan(0.8);
    expect(targetIC(1)).toBeLessThan(0.1);
    expect(targetIC(0.5)).toBeLessThan(targetIC(0)); // 句中は句頭より低い
  });
});

describe("expectationLens（句内ICカーブ適合度）", () => {
  // 良いカーブ：句頭で跳ねて入り、順次で下り、主音へ着地（句末=低IC）。
  const good = seq([72, 74, 72, 71, 69, 67]); // 弧→下降・終止stepイン
  // 悪いカーブ：句末で大跳躍（終止が高IC＝納得しない）。
  const bad = seq([67, 69, 71, 72, 74, 62]); // 最後に下方大跳躍（非充填っぽく終わる）
  it("終止が順次着地の方が、句末大跳躍より適合が高い", () => {
    expect(expectationLens(good).score).toBeGreaterThan(expectationLens(bad).score);
  });
  it("score は 0..1・音2つ未満は0", () => {
    expect(expectationLens(good).score).toBeGreaterThanOrEqual(0);
    expect(expectationLens(good).score).toBeLessThanOrEqual(1);
    expect(expectationLens([{ pitch: 60, start: 0, dur: 1 }]).score).toBe(0);
  });
  it("休符で句が割れる（ic 配列長＝音数）", () => {
    const withRest: LensNote[] = [
      { pitch: 72, start: 0, dur: 0.5 }, { pitch: 71, start: 0.5, dur: 0.5 },
      { pitch: 69, start: 2, dur: 0.5 }, { pitch: 67, start: 2.5, dur: 0.5 }, // 1.5拍の休符で新句
    ];
    const r = expectationLens(withRest);
    expect(r.ic.length).toBe(4);
    expect(r.phraseFits.length).toBe(2); // 2句
  });
});

describe("hookLens（積型：大域平凡×局所一点×位置）", () => {
  // フック型：反復する順次モチーフ＋一点だけ跳躍（サビ）。
  const hooky = seq([67, 69, 67, 69, 67, 69, 74, 72]); // ラシラシ…＋一発上跳躍
  // 非フック：跳躍だらけでバラバラ（大域も奇抜＝逆効果）。
  const jumpy = seq([60, 72, 61, 71, 62, 74, 59, 70]);
  it("反復＋一点跳躍のサビは、跳躍だらけより高い", () => {
    expect(hookLens(hooky, { sectionRole: "chorus" }).score).toBeGreaterThan(hookLens(jumpy, { sectionRole: "chorus" }).score);
  });
  it("位置ゲート：chorus は verse より高い（同じメロ）", () => {
    expect(hookLens(hooky, { sectionRole: "chorus" }).score).toBeGreaterThan(hookLens(hooky, { sectionRole: "verse" }).score);
  });
  it("一点跳躍(集中)は跳躍が散るより distinctiveness が高い", () => {
    const onePoint = hookLens(seq([67, 69, 67, 69, 74, 72]));
    const spread = hookLens(seq([60, 72, 61, 71, 62, 74]));
    expect(onePoint.distinctiveness).toBeGreaterThan(spread.distinctiveness);
  });
  it("score/各軸は 0..1", () => {
    const r = hookLens(hooky, { sectionRole: "chorus" });
    for (const v of [r.score, r.compression, r.distinctiveness, r.position]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("singabilityLens（難度→score=1-difficulty・既定=女性ポップ平均）", () => {
  // 歌いやすい：tessitura 内・順次中心。
  const easy = seq([60, 62, 64, 62, 60, 59]); // C4付近・順次
  // 歌いにくい：高音・大跳躍・音域端超過。
  const hard = seq([79, 60, 81, 62, 84, 59]); // hiG付近↔低音の大跳躍・上端超
  it("順次・tessitura内は、大跳躍・音域端超より score が高い（歌いやすい）", () => {
    expect(singabilityLens(easy).score).toBeGreaterThan(singabilityLens(hard).score);
  });
  it("difficulty = 1 - score・0..1", () => {
    const r = singabilityLens(hard);
    expect(round3(r.difficulty + r.score)).toBe(1);
    expect(r.difficulty).toBeGreaterThanOrEqual(0);
    expect(r.difficulty).toBeLessThanOrEqual(1);
    expect(r.leap).toBeGreaterThan(0); // 大跳躍があるので跳躍項>0
  });
  it("上行大跳躍は下行大跳躍より難（方向係数）", () => {
    const up = singabilityLens(seq([60, 72])); // 上オクターブ
    const down = singabilityLens(seq([72, 60])); // 下オクターブ
    expect(up.leap).toBeGreaterThan(down.leap);
  });
  it("声種プロファイルで結果が変わる（男性平均は高音メロを別評価）", () => {
    const highMel = seq([74, 72, 74, 76, 74, 72]); // D5付近
    const f = singabilityLens(highMel, {}, FEMALE_POP_AVG).score;
    const m = singabilityLens(highMel, {}, MALE_POP_AVG).score;
    expect(f).not.toBe(m); // プロファイル差替が効く
  });
  it("歌詞なしは母音×高音項=0（difficulty に寄与しない）", () => {
    const noLyric = singabilityLens(seq([79, 60, 81]));
    const withLyric = singabilityLens([
      { pitch: 79, start: 0, dur: 0.5, syllable: "い" }, // 高音に狭母音
      { pitch: 60, start: 0.5, dur: 0.5, syllable: "あ" },
      { pitch: 81, start: 1, dur: 0.5, syllable: "う" },
    ]);
    expect(withLyric.difficulty).toBeGreaterThanOrEqual(noLyric.difficulty); // 歌詞で母音項が加わり難化方向
  });
});

describe("melodyLenses（headline 3値・api 添付用）", () => {
  it("3軸を返し全て 0..1", () => {
    const r = melodyLenses(seq([67, 69, 67, 69, 74, 72]), { sectionRole: "chorus", beatsPerBar: 4 });
    for (const v of [r.expectation, r.hook, r.singability]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("決定的（同入力＝同出力）", () => {
    const ns = seq([67, 69, 67, 69, 74, 72]);
    expect(melodyLenses(ns, { sectionRole: "chorus" })).toEqual(melodyLenses(ns, { sectionRole: "chorus" }));
  });
});

const round3 = (x: number) => Math.round(x * 1000) / 1000;
