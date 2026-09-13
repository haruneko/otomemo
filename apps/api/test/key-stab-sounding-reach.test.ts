// 2026-09-13 M6a 監査 軽微3：到達口から返る content に対して「鳴る区間が次のキック頭に掛からない」を assert。
//   既定（keyStab 無し）の出音は変えない。
import { describe, it, expect } from "vitest";
import { genChordPattern, type DrumsInput } from "../src/music/generate";

const FRAME = { bars: 4, meter: "4/4", key: 0, tempo: 120 };
const dr = (kick: number[], snare: number[]): DrumsInput => ({ rhythm: { steps: 16, bars: 1, beatsPerStep: 0.25, lanes: [{ name: "Kick", midi: 36, hits: kick }, { name: "Snare", midi: 38, hits: snare }] } });
type C = { hits: { step: number; dur: number }[] };

describe("隙間刺し：鳴る区間がキック頭に掛からない（返った content）", () => {
  for (const [kick, snare] of [[[0, 4, 10], [3, 12]], [[0, 6, 10], [4, 15]], [[0, 8], [4, 12]], [[0, 3, 8, 11], [2, 7, 10, 15]]] as const) {
    it(`kick ${kick} / snare ${snare}`, () => {
      const c = genChordPattern(FRAME, 1, { keyStab: true, drums: dr([...kick], [...snare]) }).items[0]!.content as C;
      const kickAbs = new Set<number>();
      for (let b = 0; b <= 4; b++) for (const k of kick) kickAbs.add(b * 16 + k);
      const over = c.hits.filter((h) => { for (let t = h.step + 1; t < h.step + h.dur; t++) if (kickAbs.has(t)) return true; return false; });
      expect(over).toEqual([]);
    });
  }
  it("既定（keyStab 無し）は drums を渡しても従来と同じ", () => {
    expect(genChordPattern(FRAME, 1, { drums: dr([0, 6, 10], [4, 15]) })).toStrictEqual(genChordPattern(FRAME, 1, { drums: null }));
  });
});
