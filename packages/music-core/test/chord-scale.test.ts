// JZ-WALK が使うコードのスケール表（chordScale.ts）の検算。2026-09-16 リフ撤去で chordFollow.ts から文字どおり移したので、
//   撤去前の py-parity 参照値（phrase_maker core/chordlib.py 層B を源流から焼いたもの）から抜いた fixture と突き合わせる
//   ＝移設で表が1つもずれていないことの証明（旧 chord-follow-parity「層B のスケール表が源流と一致」を引き継ぐ）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scaleOffsets, scaleOrigin, pmClamp, rootLowPitch, chordScalePcs, QUALITY_INTERVALS } from "../src/index";

type Fixture = { cases: { quality: string; tones: number[]; scale: number[] }[] };
const FX = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/chord-scale-layerB.json", import.meta.url)), "utf8")) as Fixture;

describe("層B のスケール表が源流と一致（撤去前の py-parity 参照値）", () => {
  it("fixture の全クオリティで scaleOffsets が一致（被覆＝17 クオリティ）", () => {
    expect(FX.cases.length).toBe(17);
    for (const c of FX.cases) {
      expect([...scaleOffsets(c.quality, c.tones)].sort((a, b) => a - b), c.quality).toEqual(c.scale);
      expect(scaleOrigin(c.quality), c.quality).toBe("phrase_maker-layerB");
    }
  });
  it("otomemo の 34 クオリティはどれも fallback に落ちない（層B か補った表のどちらか）", () => {
    for (const q of Object.keys(QUALITY_INTERVALS)) expect(scaleOrigin(q), q).not.toBe("fallback");
  });
});

describe("低域の畳み（源流 _clamp／root_low）", () => {
  it("pmClamp＝上から先に折る／rootLowPitch＝窓の最下オクターブ", () => {
    expect(pmClamp(61, 33, 48)).toBe(37);
    expect(pmClamp(60, 33, 48)).toBe(48); // 上端ちょうどは折らない
    expect(pmClamp(20, 33, 48)).toBe(44);
    expect(rootLowPitch(9, 33)).toBe(33);
    expect(rootLowPitch(0, 33)).toBe(36);
    expect(rootLowPitch(11, 28)).toBe(35);
  });
  it("chordScalePcs は分数低音を含む", () => {
    expect([...chordScalePcs({ rootPc: 0, quality: "", tones: [0, 4, 7], bassPc: 1 })]).toContain(1);
  });
});
