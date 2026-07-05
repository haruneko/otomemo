import { describe, it, expect } from "vitest";
import { learnStepWeights, cScaleArr } from "../src/music/corpusBias";
import { genChords, genMelody, MOVES } from "../src/music/generate";

// S6-b：コーパス統計→生成バイアス。順次中心のコーパスを学習させると、生成も順次寄りになる。
type Note = { pitch: number; start: number; dur: number };
const seq = (pitches: number[]): Note[] => pitches.map((p, i) => ({ pitch: p, start: i, dur: 1 }));
const idx = (m: number) => (MOVES as readonly number[]).indexOf(m);
const stepRatio = (notes: { pitch: number }[]) => {
  const iv = notes.slice(1).map((n, i) => Math.abs(n.pitch - notes[i]!.pitch));
  return iv.length ? iv.filter((d) => d <= 2).length / iv.length : 0;
};

describe("learnStepWeights（歩幅分布の学習）", () => {
  it("順次だけのコーパス→ ±1 の重みが跳躍(±2,+3)より厚い", () => {
    // C-D-E-F-G…＝スケール度+1 連続
    const corpus = [seq([60, 62, 64, 65, 67, 69]), seq([67, 65, 64, 62, 60])];
    const w = learnStepWeights(corpus, cScaleArr());
    expect(w[idx(1)]! + w[idx(-1)]!).toBeGreaterThan(w[idx(2)]! + w[idx(3)]! + w[idx(-2)]!);
  });

  it("跳躍だけのコーパス→ ±2/+3 の重みが厚い", () => {
    // C-E-G-c＝3度跳躍連続（スケール度+2）
    const corpus = [seq([60, 64, 67, 72]), seq([72, 67, 64, 60])];
    const w = learnStepWeights(corpus, cScaleArr());
    expect(w[idx(2)]! + w[idx(-2)]!).toBeGreaterThan(w[idx(1)]! + w[idx(-1)]!);
  });

  it("count(出現回数)で重み付け＝定番フレーズほど分布に効く", () => {
    const step = seq([60, 62, 64, 65, 67]); // +1連続（順次）
    const leap = seq([60, 64, 67, 72]); // +2連続（跳躍）
    const flat = learnStepWeights([step, leap], cScaleArr()); // 各1票
    const weighted = learnStepWeights([step, leap], cScaleArr(), [1, 20]); // leap を20倍
    const i2 = (MOVES as readonly number[]).indexOf(2);
    const ratio = (w: number[]) => w[i2]! / w.reduce((a, b) => a + b, 0);
    expect(ratio(weighted)).toBeGreaterThan(ratio(flat)); // 跳躍比率が重み付けで上がる
  });

  it("空/不足コーパス→既定にfallback（落ちない）", () => {
    expect(learnStepWeights([]).length).toBe(MOVES.length);
    expect(learnStepWeights([[{ pitch: 60, start: 0, dur: 1 }]]).length).toBe(MOVES.length);
  });
});

describe("コーパス学習が生成に効く（順次率）", () => {
  it("順次コーパスの重み→ 跳躍コーパスの重みより 生成の順次率が高い", () => {
    const stepW = learnStepWeights([seq([60, 62, 64, 65, 67, 69, 71, 72]), seq([72, 71, 69, 67, 65, 64, 62, 60])]);
    const leapW = learnStepWeights([seq([60, 64, 67, 72, 76]), seq([76, 72, 67, 64, 60])]);
    const chords = genChords({ meter: "4/4", bars: 8, mood: "明るい" }, 5).items[0]!.content as { chords: { root: number; quality: string; start: number; dur: number }[] };
    let stepSum = 0;
    let leapSum = 0;
    const seeds = [0, 1, 5, 9, 42];
    for (const s of seeds) {
      const a = genMelody({ meter: "4/4", bars: 8, mood: "明るい" }, chords.chords, s, { stepWeights: stepW }).items[0]!.content as { notes: { pitch: number }[] };
      const b = genMelody({ meter: "4/4", bars: 8, mood: "明るい" }, chords.chords, s, { stepWeights: leapW }).items[0]!.content as { notes: { pitch: number }[] };
      stepSum += stepRatio(a.notes);
      leapSum += stepRatio(b.notes);
    }
    expect(stepSum / seeds.length).toBeGreaterThan(leapSum / seeds.length);
  });
});
