// 2026-09-13 M6a 監査 軽微3：隙間刺しの 2 step が小節線を越えて次小節頭のキックまで鳴っていた。
//   不変条件＝**鳴っている区間 [step, step+dur) が、自分の打点より後のキック頭を含まない**（最小 1 step は鳴らす）。
import { describe, it, expect } from "vitest";
import { keyStabSlots, keyStabHits } from "../src/keyStab";

/** 鳴る区間に掛かるキック頭の数（次小節ぶんのキックも数える＝小節線の向こう）。 */
function soundingOverKick(hits: { step: number; dur: number }[], kick: number[], bars: number): number {
  const kickAbs = new Set<number>();
  for (let b = 0; b <= bars; b++) for (const k of kick) kickAbs.add(b * 16 + k);
  let n = 0;
  for (const h of hits) for (let t = h.step + 1; t < h.step + h.dur; t++) if (kickAbs.has(t)) n++;
  return n;
}
const make = (kick: number[], snare: number[], bars: number, withKick: boolean) => {
  const { slots } = keyStabSlots({ onsets: [...kick, ...snare], kick, accents: [] });
  return keyStabHits(slots, bars, 112, 16, withKick ? kick : undefined);
};

describe("隙間刺しの音価は次のキック頭に掛からない（鳴る区間で見る）", () => {
  it("再現：kick [0,4,10]・snare [3,12] の step 3（直後がキック）／snare 15 → 次小節頭のキック", () => {
    expect(soundingOverKick(make([0, 4, 10], [3, 12], 2, false), [0, 4, 10], 2)).toBeGreaterThan(0); // 詰めない旧挙動＝掛かる
    expect(soundingOverKick(make([0, 6, 10], [4, 15], 2, false), [0, 6, 10], 2)).toBeGreaterThan(0);
    const a = make([0, 4, 10], [3, 12], 2, true);
    expect(soundingOverKick(a, [0, 4, 10], 2)).toBe(0);
    expect(a.find((h) => h.step === 3)!.dur).toBe(1);
    const b = make([0, 6, 10], [4, 15], 2, true);
    expect(soundingOverKick(b, [0, 6, 10], 2)).toBe(0);
    expect(b.find((h) => h.step === 15)!.dur).toBe(1);
    expect(b.find((h) => h.step === 4)!.dur).toBe(2); // 掛からない所は 2 step のまま
  });
  it("総当たり（キック・スネアの組 1,000 通り・決定的）で掛からない・dur は 1..2", () => {
    let s = 12345;
    const next = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 2 ** 32; };
    for (let n = 0; n < 1000; n++) {
      const kick = [...new Set(Array.from({ length: 1 + Math.floor(next() * 5) }, () => Math.floor(next() * 16)))];
      const snare = [...new Set(Array.from({ length: Math.floor(next() * 5) }, () => Math.floor(next() * 16)))];
      const hits = make(kick, snare, 3, true);
      expect(soundingOverKick(hits, kick, 3)).toBe(0);
      for (const h of hits) expect(h.dur >= 1 && h.dur <= 2).toBe(true);
    }
  });
  it("kick を渡さなければ従来どおり（引数は additive）", () => {
    const { slots } = keyStabSlots({ onsets: [0, 4, 6, 10, 12, 15], kick: [0, 6, 10], accents: [] });
    expect(keyStabHits(slots, 2, 112)).toStrictEqual(keyStabHits(slots, 2, 112, 16, undefined));
  });
});
