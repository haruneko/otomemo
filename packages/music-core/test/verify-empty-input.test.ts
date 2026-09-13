// 2026-09-13 M5 監査 軽微-3：空の音列がゲートを通っていた＝検証が空虚。
//   空入力は合格にせず、被覆率0（isVacuous）として申告する（M4 verify の coverageOf の作法）。
import { describe, it, expect } from "vitest";
import { pcMembershipGate } from "../src/verify/pcMembership";
import { fretboardGate, TUNING_GUITAR6, TUNING_BASS4 } from "../src/verify/fretboard";
import { isVacuous } from "../src/verify/types";

describe("空の音列はゲートを通らない（被覆率0として申告）", () => {
  it("pcMembershipGate", () => {
    const v = pcMembershipGate("x", [], () => new Set([0]), () => true, "test");
    expect(v.pass).toBe(false);
    expect(isVacuous(v.coverage)).toBe(true);
    expect(v.problems.join()).toContain("被覆率0");
    // 陽性対照：音が在って許容内なら通る
    expect(pcMembershipGate("x", [{ pitch: 60, start: 0 }], () => new Set([0]), () => true, "test").pass).toBe(true);
  });
  it("fretboardGate（6弦・4弦）", () => {
    for (const t of [TUNING_GUITAR6, TUNING_BASS4]) {
      const v = fretboardGate([], t);
      expect(v.pass).toBe(false);
      expect(isVacuous(v.coverage)).toBe(true);
      expect(v.detail.unreachable).toEqual([]);
    }
  });
});
