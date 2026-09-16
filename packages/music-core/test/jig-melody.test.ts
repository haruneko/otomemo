// ジグの主旋律（段1）のゲート＝長さ・旋法・決定論だけ。診断値は合否にしない（出して眺める）。
import { describe, it, expect } from "vitest";
import { generateJigMelody, diagnoseJigMelody, JIG_MODES } from "../src/index";

const MODE_STEPS: Record<string, number[]> = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
};

describe("generateJigMelody（ゲート）", () => {
  it("6/8 で A部8小節＋B部8小節＝48拍を隙間なく埋める", () => {
    for (const seed of [1, 7, 42, 999]) {
      const m = generateJigMelody({ tonic: 2, mode: "mixolydian", seed });
      expect(m.meter).toBe("6/8");
      expect(m.bars).toBe(16);
      let t = 0;
      for (const n of m.notes) {
        expect(n.start).toBeCloseTo(t, 9);
        expect(n.dur).toBeGreaterThan(0);
        expect(Math.round(n.dur * 2)).toBeCloseTo(n.dur * 2, 9); // 8分の整数倍
        t += n.dur;
      }
      expect(t).toBeCloseTo(48, 9);
      expect(m.parts.map((p) => p.part)).toEqual(["A", "B"]);
    }
  });

  it("旋法の音だけを使う（主音・旋法を変えても）", () => {
    expect(JIG_MODES).toEqual(["ionian", "dorian", "mixolydian", "aeolian"]);
    for (const mode of JIG_MODES) {
      for (const tonic of [0, 2, 7, 9]) {
        const allowed = new Set(MODE_STEPS[mode]!.map((s) => (tonic + s) % 12));
        for (const seed of [3, 7, 11]) {
          const m = generateJigMelody({ tonic, mode, seed });
          for (const n of m.notes) expect(allowed.has(n.pitch % 12)).toBe(true);
        }
      }
    }
  });

  it("決定論＝同じ種で同じ出力・種が違えば違う出力", () => {
    const a = generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 7 });
    const b = generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 8 });
    expect(JSON.stringify(c.notes)).not.toBe(JSON.stringify(a.notes));
  });

  it("テンポは付点4分で受け、4分音符の BPM で返す（既定 110）", () => {
    expect(generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 1 }).tempoQuarterBpm).toBeCloseTo(165, 9);
    expect(generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 1, tempo: 120 }).tempoQuarterBpm).toBeCloseTo(180, 9);
  });

  it("診断値を出す（合否にしない＝形だけ確かめる）", () => {
    const d = diagnoseJigMelody(generateJigMelody({ tonic: 2, mode: "mixolydian", seed: 7 }));
    for (const k of ["nearCenter", "evenEighths"] as const) {
      expect(d[k]).toBeGreaterThanOrEqual(0);
      expect(d[k]).toBeLessThanOrEqual(1);
    }
    const iv = d.intervals.same + d.intervals.step + d.intervals.third + d.intervals.wider;
    expect(iv).toBeCloseTo(1, 9);
    const ld = d.landing.same + d.landing.step + d.landing.leap;
    expect(ld).toBeCloseTo(1, 9);
  });
});
