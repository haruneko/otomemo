// py-parity（M6a-6a）＝鍵盤の隙間刺しが phrase_maker の2源流（legacy rock_piano sheet 分岐・gesture_p11 build_rock）と一致。
// 参照値＝`tools/py-parity/cases-key-stab/cases.json`（`tools/py-parity/run_dump_key_stab.sh` が焼く・コミット済み）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { keyStabSlots, keyStabHits, KEY_STAB_FALLBACK_STEPS } from "../src/keyStab";

type PyCase = {
  id: string;
  input: { onsets: number[]; kick: number[]; accents: number[] };
  build_rock: { slots: { step: number; role: string }[]; comp_steps: number[] };
  legacy: { step: number; vel: number }[];
};
const FILE = fileURLToPath(new URL("../../../tools/py-parity/cases-key-stab/cases.json", import.meta.url));
const CASES = (JSON.parse(readFileSync(FILE, "utf8")) as { cases: PyCase[] }).cases;

describe("py-parity 隙間刺し（onsets 6種 × kick 6種 × accents 2種＝72件）", () => {
  it("ケース表がコミットされている（72件）", () => { expect(CASES.length).toBe(72); });
  for (const pc of CASES) {
    it(`一致：${pc.id}`, () => {
      const r = keyStabSlots(pc.input);
      // p11 build_rock（刺し位置＋役割）と完全一致
      expect(r.slots).toEqual(pc.build_rock.slots);
      expect(r.slots.map((s) => s.step)).toEqual(pc.build_rock.comp_steps);
      // legacy（刺し位置＋ vel の骨）：隙間あり＝anchor↔80・colour↔70／隙間なし＝6,14 に 74/71
      expect(r.slots.map((s) => s.step)).toEqual(pc.legacy.map((l) => l.step));
      if (r.fallback) expect(pc.legacy.map((l) => l.vel)).toEqual([74, 71]);
      else expect(r.slots.map((s) => (s.role === "anchor" ? 80 : 70))).toEqual(pc.legacy.map((l) => l.vel));
    });
  }
  it("被覆：隙間なし（fallback）と accents 付き anchor の両分岐がケース表に在る", () => {
    const fb = CASES.filter((c) => keyStabSlots(c.input).fallback).length;
    const anc = CASES.filter((c) => keyStabSlots(c.input).slots.some((s) => s.role === "anchor")).length;
    expect(fb).toBeGreaterThan(0);
    expect(anc).toBeGreaterThan(0);
    expect(fb + CASES.filter((c) => !keyStabSlots(c.input).fallback).length).toBe(72);
  });
});

describe("keyStabHits（小節ごとに敷く・音価は次の刺しと小節末で詰める）", () => {
  it("隙間なしは 6,14", () => { expect(keyStabSlots({ onsets: [0, 8], kick: [0, 8], accents: [] }).slots.map((s) => s.step)).toEqual([...KEY_STAB_FALLBACK_STEPS]); });
  it("隣接 step は dur 1 に詰まり、セクション末を越えない・anchor だけ vel", () => {
    const { slots } = keyStabSlots({ onsets: [3, 4, 15], kick: [], accents: [4] });
    const hits = keyStabHits(slots, 2, 112);
    expect(hits).toEqual([
      { step: 3, dur: 1 }, { step: 4, dur: 2, vel: 112 }, { step: 15, dur: 2 },
      { step: 19, dur: 1 }, { step: 20, dur: 2, vel: 112 }, { step: 31, dur: 1 },
    ]);
  });
});
