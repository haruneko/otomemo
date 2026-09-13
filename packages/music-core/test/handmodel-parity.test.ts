// py-parity（M6a-6d）＝手の物理モデル（phrase_maker fingersim/handmodel.py）の関数単位ゴールデン。
// 参照値＝`tools/py-parity/cases-handmodel/handmodel.json`（`tools/py-parity/run_dump_handmodel.sh` が焼く・コミット済み）。
// 比較は toEqual（数値は Object.is＝-0 と 0 も区別）＝round(x, 4) の丸め規則まで一致していること。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FREST, WEIGHTS, BFACTOR, WEAK, REACH, REACH_PAIRS, REACH6, REACH6_PAIRS, MAXPRAC_15, SOLO_BAND, THUMB_PASS_PENALTY,
  bestAssignment, canGrab, assignmentCost, shiftCost, isBlackKeyPitch, thumbCrossSpan, reachBand, freeFingerReach,
  constrainedAssignment, partialCost, heldStillFeasible, pyRoundDigits, type Hand, type SpanMode, type HandAssignment,
} from "../src/handModel";

type Pairs = [number, number][];
type PyBA = { cost: number; assign: Pairs; wrist_x: number; span: number } | null;
type Dump = {
  constants: { FREST: number[]; WEIGHTS: number[]; BFACTOR: number[]; WEAK: Pairs; REACH: [number[], number[]][]; REACH6: [number[], number[]][]; MAXPRAC_15: number; SOLO_BAND: number; THUMB_PASS_PENALTY: number };
  best_assignment: { pitches: number[]; hand: Hand; out: PyBA; can: boolean }[];
  assignment_cost: { pairs: Pairs; hand: Hand; out: [number, number] | null }[];
  shift_cost: { a: number; b: number; out: number }[];
  is_black: { p: number; out: boolean }[];
  thumb_cross_span: { f: number; out: number }[];
  reach_band: { lo: number; hi: number; mode: SpanMode; out: [number, number] }[];
  free_finger_reach: { assign: Pairs; held: number[]; finger: number; hand: Hand; mode: SpanMode; out: number[] }[];
  constrained_assignment: { held: Pairs; new: number[]; hand: Hand; out: PyBA }[];
  partial_cost: { assign: Pairs; held: number[]; finger: number; pitch: number; hand: Hand; out: number | null }[];
  held_still_feasible: { held: Pairs; x: number; hand: Hand; out: number[] }[];
};
const D = JSON.parse(readFileSync(fileURLToPath(new URL("../../../tools/py-parity/cases-handmodel/handmodel.json", import.meta.url)), "utf8")) as Dump;
const ba = (r: HandAssignment | null) => (r == null ? null : { cost: r.cost, assign: r.assign, wrist_x: r.wristX, span: r.span });

describe("定数（pianoplayer MIT／Parncutt）が源流と同じ", () => {
  it("FREST/WEIGHTS/BFACTOR/WEAK/REACH/REACH6/MAXPRAC_15/SOLO_BAND/THUMB_PASS_PENALTY", () => {
    expect(D.constants.FREST).toEqual([...FREST]);
    expect(D.constants.WEIGHTS).toEqual([...WEIGHTS]);
    expect(D.constants.BFACTOR).toEqual([...BFACTOR]);
    expect(D.constants.WEAK).toEqual([...WEAK]);
    expect(D.constants.REACH).toEqual(REACH_PAIRS.map((p) => [[...p], [...REACH.get(`${p[0]},${p[1]}`)!]]));
    expect(D.constants.REACH6).toEqual(REACH6_PAIRS.map((p) => [[...p], [...REACH6.get(`${p[0]},${p[1]}`)!]]));
    expect([D.constants.MAXPRAC_15, D.constants.SOLO_BAND, D.constants.THUMB_PASS_PENALTY]).toEqual([MAXPRAC_15, SOLO_BAND, THUMB_PASS_PENALTY]);
  });
});

describe("関数単位ゴールデン（全件）", () => {
  it(`best_assignment／can_grab（${D.best_assignment.length}件）`, () => {
    for (const c of D.best_assignment) {
      expect(ba(bestAssignment(c.pitches, c.hand)), JSON.stringify(c)).toEqual(c.out);
      expect(canGrab(c.pitches, c.hand)).toBe(c.can);
    }
  });
  it(`assignment_cost（${D.assignment_cost.length}件）`, () => {
    for (const c of D.assignment_cost) expect(assignmentCost(c.pairs, c.hand), JSON.stringify(c)).toEqual(c.out);
  });
  it(`shift_cost／is_black／thumb_cross_span／_reach_band`, () => {
    for (const c of D.shift_cost) expect(shiftCost(c.a, c.b)).toBe(c.out);
    for (const c of D.is_black) expect(isBlackKeyPitch(c.p)).toBe(c.out);
    for (const c of D.thumb_cross_span) expect(thumbCrossSpan(c.f)).toBe(c.out);
    for (const c of D.reach_band) expect(reachBand(c.lo, c.hi, c.mode)).toEqual(c.out);
  });
  it(`free_finger_reach（${D.free_finger_reach.length}件）`, () => {
    for (const c of D.free_finger_reach) expect(freeFingerReach(c.assign, c.held, c.finger, c.hand, c.mode), JSON.stringify(c)).toEqual(c.out);
  });
  it(`constrained_assignment（${D.constrained_assignment.length}件）`, () => {
    for (const c of D.constrained_assignment) expect(ba(constrainedAssignment(c.held, c.new, c.hand)), JSON.stringify(c)).toEqual(c.out);
  });
  it(`partial_cost（${D.partial_cost.length}件）`, () => {
    for (const c of D.partial_cost) expect(partialCost(c.assign, c.held, c.finger, c.pitch, c.hand), JSON.stringify(c)).toEqual(c.out);
  });
  it(`held_still_feasible（${D.held_still_feasible.length}件）`, () => {
    for (const c of D.held_still_feasible) expect(heldStillFeasible(c.held, c.x, c.hand), JSON.stringify(c)).toEqual(c.out);
  });
});

describe("被覆（ケース表が各分岐を踏んでいる＝一致が空虚でない）", () => {
  it("到達不能 null・到達可・窓の枯渇・押さえの間引き・到達不能の partial・制約付きの null がどれも在る", () => {
    const n = (xs: unknown[]) => xs.length;
    const cov = {
      baNull: n(D.best_assignment.filter((c) => c.out == null && c.pitches.length >= 1 && c.pitches.length <= 4)),
      baOk: n(D.best_assignment.filter((c) => c.out != null)),
      acNull: n(D.assignment_cost.filter((c) => c.out == null)),
      ffrEmpty: n(D.free_finger_reach.filter((c) => c.out.length === 0)),
      ffrSolo: n(D.free_finger_reach.filter((c) => c.held.length === 0)),
      caNull: n(D.constrained_assignment.filter((c) => c.out == null)),
      caOk: n(D.constrained_assignment.filter((c) => c.out != null)),
      pcNull: n(D.partial_cost.filter((c) => c.out == null)),
      hsPruned: n(D.held_still_feasible.filter((c) => c.out.length < c.held.length)),
      hsAll: n(D.held_still_feasible.filter((c) => c.out.length === c.held.length)),
    };
    for (const [k, v] of Object.entries(cov)) expect(v, k).toBeGreaterThan(0);
  });
});

describe("pyRoundDigits＝Python round(x, nd)", () => {
  it("ちょうど半分は偶数側（2進で厳密に表せる値）・近傍は厳密値で決まる・符号", () => {
    expect(pyRoundDigits(0.03125, 4)).toBe(0.0312); // Python: round(0.03125, 4) == 0.0312
    expect(pyRoundDigits(0.09375, 4)).toBe(0.0938); // Python: 0.0938
    expect(pyRoundDigits(2.675, 2)).toBe(2.67); // 2.675 の厳密値は 2.67499999… ＝Python も 2.67
    expect(pyRoundDigits(-0.03125, 4)).toBe(-0.0312);
    expect(Object.is(pyRoundDigits(-0.00001, 4), -0)).toBe(true); // Python: -0.0
    expect(pyRoundDigits(67, 4)).toBe(67);
  });
});
