// M4 microtiming_structural＝ヒューマナイズが系統的か（源流 drums/gen2/src/metrics.py:43-55）。
// **診断であってゲートではない**（§6-4 #1・負の知識3・5）。
import { describe, it, expect } from "vitest";
import { microtimingStructural, SRC_STRUCTURAL_MIN_MS, assertGate, isVacuous } from "../src/index";

const voices = ["kick", "snare", "chh", "chh", "snare", "kick"];
//               もたり snare(+)／前ノリ hat(-)＝系統的なノリ
const structuralOffsets = [0.5, 6.0, -5.0, -4.0, 5.0, -0.5];

describe("microtiming_structural（診断）", () => {
  it("snare が後ろ・hat が前で、どちらも 3ms 以上なら structural=true", () => {
    const d = microtimingStructural(structuralOffsets, voices);
    expect(SRC_STRUCTURAL_MIN_MS).toBe(3.0);
    expect(d.value.snareMeanMs).toBe(5.5);
    expect(d.value.hatMeanMs).toBe(-4.5);
    expect(d.value.structural).toBe(true);
    expect(d.coverage.frac).toBe(1);
  });
  it("chh が無ければ ride を手の代表に使う（源流と同じ）", () => {
    const d = microtimingStructural([6.0, -5.0], ["snare", "ride"]);
    expect(d.value.hatMeanMs).toBe(-5);
    expect(d.value.structural).toBe(true);
  });
  it("診断はゲートに使えない（合否フィールドが無い＝型でも実行時でも）", () => {
    const d = microtimingStructural(structuralOffsets, voices);
    expect(d.kind).toBe("diagnostic");
    expect("pass" in d).toBe(false);
    // @ts-expect-error 診断をゲートとして断言することはできない
    expect(() => assertGate(d)).toThrow(TypeError);
  });
});

describe("変異検査＝故障を注入すると診断値が動く（空虚な計測ではない）", () => {
  it("(m5 相当) hat の符号を反転すると structural が false に落ちる", () => {
    const flipped = structuralOffsets.map((o, i) => (voices[i] === "chh" ? -o : o));
    expect(microtimingStructural(flipped, voices).value.structural).toBe(false);
  });
  it("揺れを 3ms 未満へ潰すと false（＝一様に近い散らしを『系統的』と言わない）", () => {
    const tiny = structuralOffsets.map((o) => o * 0.4); // snare 2.2ms / hat -1.8ms
    const d = microtimingStructural(tiny, voices);
    expect(Math.abs(d.value.snareMeanMs)).toBeLessThan(SRC_STRUCTURAL_MIN_MS);
    expect(d.value.structural).toBe(false);
  });
  it("全部 0（ヒューマナイズ無し）なら false", () => {
    expect(microtimingStructural([0, 0, 0, 0, 0, 0], voices).value.structural).toBe(false);
  });
});

describe("空虚さの自己診断", () => {
  it("snare も hat も打点が無ければ被覆率 0＝この診断は何も言っていない", () => {
    const d = microtimingStructural([1, 2], ["kick", "crash"]);
    expect(d.coverage.applied).toBe(0);
    expect(isVacuous(d.coverage)).toBe(true);
    expect(d.value.structural).toBe(false);
  });
});
