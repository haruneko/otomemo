import { describe, it, expect } from "vitest";
import { evalMelody, corpusTypicality } from "../src/music/evalMelody";
import { learnBarRhythms, learnMoveTransitions } from "../src/music/melodyCells";

// C メジャー・C-Am-F-C を 4/4・各小節4拍で。
const chords = [
  { root: 0, quality: "maj", start: 0, dur: 4 },
  { root: 9, quality: "min", start: 4, dur: 4 },
  { root: 5, quality: "maj", start: 8, dur: 4 },
  { root: 0, quality: "maj", start: 12, dur: 4 },
];

describe("evalMelody（規則ベース自動評価＝耳なし反復の土台）", () => {
  it("良いメロ（強拍コードトーン・順次主体・単一頂点・主音終止・息継ぎ）は高スコア", () => {
    // C5 D5 E5(peak) D5 | C5 .. A4 | F4 G4 A4 .. | G4 .. C5(tonic)
    const good = [
      { pitch: 72, start: 0, dur: 0.5 }, { pitch: 74, start: 0.5, dur: 0.5 }, { pitch: 76, start: 2, dur: 1 }, { pitch: 74, start: 3, dur: 1 },
      { pitch: 72, start: 4, dur: 1 }, { pitch: 69, start: 6, dur: 1.5 },
      { pitch: 65, start: 8, dur: 0.5 }, { pitch: 67, start: 8.5, dur: 0.5 }, { pitch: 69, start: 10, dur: 1 },
      { pitch: 67, start: 12, dur: 1 }, { pitch: 72, start: 14, dur: 2 },
    ];
    const r = evalMelody(good, { chords, key: 0, meter: "4/4" });
    expect(r.score).toBeGreaterThan(0.65);
    expect(r.metrics.noForbiddenLeaps).toBe(1); // 禁則跳躍なし
    expect(r.metrics.cadenceClose).toBe(1); // 主音終止
  });
  it("悪いメロ（禁則跳躍・終止なし・べったり）は低スコア・かつ良メロ未満", () => {
    // 三全音だらけ・休符なし・主音で終わらない
    const bad = [
      { pitch: 72, start: 0, dur: 0.5 }, { pitch: 78, start: 0.5, dur: 0.5 }, { pitch: 72, start: 1, dur: 0.5 }, { pitch: 78, start: 1.5, dur: 0.5 },
      { pitch: 71, start: 2, dur: 0.5 }, { pitch: 77, start: 2.5, dur: 0.5 }, { pitch: 70, start: 3, dur: 0.5 }, { pitch: 76, start: 3.5, dur: 0.5 },
      { pitch: 73, start: 4, dur: 0.5 }, { pitch: 79, start: 4.5, dur: 0.5 }, { pitch: 74, start: 5, dur: 0.5 }, { pitch: 68, start: 5.5, dur: 0.5 },
    ];
    const r = evalMelody(bad, { chords, key: 0, meter: "4/4" });
    const good = evalMelody([
      { pitch: 72, start: 0, dur: 1 }, { pitch: 74, start: 1, dur: 1 }, { pitch: 76, start: 2, dur: 2 },
      { pitch: 72, start: 12, dur: 4 },
    ], { chords, key: 0, meter: "4/4" });
    expect(r.score).toBeLessThan(good.score);
    expect(r.metrics.noForbiddenLeaps).toBeLessThan(1); // 三全音で減点
  });
  it("corpusTypicality：コーパス定番のリズム/動きの方が高スコア（既存重みで“らしさ”判定）", () => {
    // 学習：定番＝x.x.x.x.（4分打ち）＋順次move(±2)。
    const model = {
      rhythm: learnBarRhythms(["x.x.x.x.", "x.x.x.x.", "x.x.x.x.", "xxxxxxxx"]),
      move: learnMoveTransitions([[60, 62, 64, 62, 60, 62, 64, 62, 60]]), // ±2 順次だらけ
    };
    // 定番に沿うメロ（4分・順次）
    const typical = [
      { pitch: 72, start: 0, dur: 1 }, { pitch: 74, start: 1, dur: 1 }, { pitch: 76, start: 2, dur: 1 }, { pitch: 74, start: 3, dur: 1 },
      { pitch: 72, start: 4, dur: 1 }, { pitch: 74, start: 5, dur: 1 }, { pitch: 76, start: 6, dur: 1 }, { pitch: 74, start: 7, dur: 1 },
    ];
    // 非定番（学習に無いリズム位置＋大跳躍）
    const atypical = [
      { pitch: 72, start: 0.5, dur: 0.5 }, { pitch: 79, start: 1.25, dur: 0.25 }, { pitch: 67, start: 2.75, dur: 0.5 }, { pitch: 76, start: 3.5, dur: 0.5 },
    ];
    const a = corpusTypicality(typical, model);
    const b = corpusTypicality(atypical, model);
    expect(a.score).toBeGreaterThan(b.score); // 定番の方が「らしい」
    expect(a.score).toBeGreaterThanOrEqual(0); expect(a.score).toBeLessThanOrEqual(1);
  });
  it("H6: start無しの素のコード列は1小節刻みで解釈＝後半の強拍を先頭コードで誤採点しない", () => {
    // bar1=Am 上で A を歌う＝正しくコードトーン。旧: 全コードstart=0扱い→bar1もC(先頭)で採点されA=非CT。
    const mel = [
      { pitch: 60, start: 0, dur: 1 }, { pitch: 64, start: 2, dur: 1 }, // bar0: C上で C,E
      { pitch: 69, start: 4, dur: 1 }, { pitch: 72, start: 6, dur: 1 }, // bar1: Am上で A,C
    ];
    const bare = [{ root: 0, quality: "" }, { root: 9, quality: "m" }]; // start無し
    const r = evalMelody(mel, { chords: bare, key: 0, meter: "4/4" });
    expect(r.metrics.chordToneStrong).toBe(1);
  });

  it("F2: 6/8等の非対応グリッドではリズム項を評価しない（旧: 全ミス平滑床の定数で水増し）", () => {
    const model = {
      rhythm: learnBarRhythms(["x.x.x.x."]), // 学習は4/4の8枠のみ
      move: learnMoveTransitions([[60, 62, 64, 65, 67, 65, 64, 62, 60]]),
    };
    const notes68 = [
      { pitch: 60, start: 0, dur: 0.5 }, { pitch: 62, start: 0.5, dur: 0.5 }, { pitch: 64, start: 1, dur: 0.5 },
      { pitch: 65, start: 1.5, dur: 0.5 }, { pitch: 67, start: 2, dur: 1 },
    ];
    const r = corpusTypicality(notes68, model, { beatsPerBar: 3, eighthsPerBar: 6 });
    expect(r.rhythmTypicality).toBe(0); // 語彙グリッド不一致＝リズムは判定不能を明示
    expect(r.score).toBeGreaterThan(0); // move のみで「らしさ順」は機能する
  });

  it("metrics は各指標 0..1・score も 0..1", () => {
    const r = evalMelody([{ pitch: 72, start: 0, dur: 1 }, { pitch: 74, start: 1, dur: 1 }], { chords, key: 0, meter: "4/4" });
    for (const v of Object.values(r.metrics)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(1);
    expect(Array.isArray(r.critique)).toBe(true);
  });
});
