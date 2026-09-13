// 2026-09-13 M5 監査 軽微-4「handshape で seed を変えても出力が同じ」の判定＝**意図どおり**。
//   seed は同コスト解のタイブレーク（負の知識13＝id 順にしない）にだけ効く決定的ソルバ（源流 handshape は knob=0＝乱数なし）。
//   不変条件として固定する：①最小コストは seed 非依存 ②同点が在る入力では seed で選び分けが変わりうる（タイブレークが生きている）
//   ③監査の再現ケース（D7 G Bm Em7・power_chug・seed 1/2）は同じ出力。
import { describe, it, expect } from "vitest";
import { realizeGuitarRiff } from "../src/guitarRealize";
import { buildGuitarSkeleton, gtrOnsetsToHits, GUITAR_GRAMMARS } from "../src/guitarRiff";

const run = (prog: { root: number; quality: string }[], g: keyof typeof GUITAR_GRAMMARS, seed: number) =>
  realizeGuitarRiff(gtrOnsetsToHits(buildGuitarSkeleton(GUITAR_GRAMMARS[g], 64)), { chordAtStep: (s) => prog[Math.floor(s / 16) % prog.length]!, tempo: 150, engine: "handshape", seed });
const key = (r: ReturnType<typeof run>) => r.notes.map((n) => `${n.start}:${n.pitch}`).join(",");
const AUDIT = [{ root: 2, quality: "7" }, { root: 7, quality: "" }, { root: 11, quality: "m" }, { root: 4, quality: "m7" }];
const AMFCG = [{ root: 9, quality: "m" }, { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 7, quality: "" }];

describe("handshape の seed＝同点崩しだけ（意図どおり・不変条件）", () => {
  for (const [name, prog] of [["D7 G Bm Em7", AUDIT], ["Am F C G", AMFCG]] as const) {
    for (const g of ["power_chug", "pedal_answer", "gallop"] as const) {
      it(`${name} × ${g}：最小コストは seed 0..39 で同じ`, () => {
        const costs = new Set(Array.from({ length: 40 }, (_, s) => run(prog, g, s).report.shape!.totalCost));
        expect(costs.size).toBe(1);
      });
    }
  }
  it("監査の再現ケース：seed 1 と 2 は同じ出力", () => {
    expect(key(run(AUDIT, "power_chug", 1))).toBe(key(run(AUDIT, "power_chug", 2)));
  });
  it("タイブレークは生きている：同コストでも seed で選び分けが変わる入力が在る（id 順に潰れていない）", () => {
    const outs = new Set(Array.from({ length: 40 }, (_, s) => key(run(AUDIT, "power_chug", s))));
    expect(outs.size).toBeGreaterThan(1);
  });
});
