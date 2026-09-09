// M4＝検証器の型（計画 §6-4 #1 #3 #7 #8）。「診断のつもりがゲートになっていた」を**型**で塞ぐ。
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertCoverage, assertGate, assertGates, byConstruction, coverageOf, diagnostic, gate,
  GateFailure, isVacuous, type GateVerdict,
} from "../src/index";

const VERIFY_DIR = new URL("../src/verify/", import.meta.url).pathname;

describe("検証器の型＝gate/byConstruction/diagnostic を戻り値で強制（§6-4 #8）", () => {
  const okGate = gate("t.ok", true, coverageOf(3, 3), "src:1", [], null);
  const ngGate = gate("t.ng", false, coverageOf(3, 3), "src:1", ["こわれている"], null);
  const diag = diagnostic("t.diag", 1.23, coverageOf(1, 1), "src:2");
  const byc = byConstruction("t.byc", true, coverageOf(2, 4), "src:3", [], null);

  it("合格ゲートは通り、不合格ゲートは GateFailure（出所つき）で落ちる", () => {
    expect(() => assertGate(okGate)).not.toThrow();
    expect(() => assertGate(ngGate)).toThrow(GateFailure);
    expect(() => assertGate(ngGate)).toThrow(/src:1/);
    expect(() => assertGates([okGate, ngGate])).toThrow(GateFailure);
  });

  it("診断は合否フィールドを持たない＝ゲートに使えない（型と実行時の二重の蓋）", () => {
    expect("pass" in diag).toBe(false);
    expect("holds" in diag).toBe(false);
    // 型：診断を assertGate に渡すのはコンパイルエラー（tsc --noEmit が担保）。
    // @ts-expect-error 診断はゲートではない
    expect(() => assertGate(diag)).toThrow(TypeError);
    // 型を迂回した JS からの誤用も実行時に落ちる。
    expect(() => assertGate(byc as unknown as GateVerdict<unknown>)).toThrow(TypeError);
  });

  it("被覆率＝空虚さの自己診断（§6-4 #3）", () => {
    expect(coverageOf(1, 4).frac).toBe(0.25);
    expect(coverageOf(0, 0).frac).toBe(0);
    expect(isVacuous(coverageOf(0, 10))).toBe(true);
    expect(isVacuous(coverageOf(0, 0))).toBe(true);
    expect(isVacuous(coverageOf(1, 10))).toBe(false);
    expect(() => assertCoverage(byc, 0.5)).not.toThrow();         // 0.5 ちょうどは通る
    expect(() => assertCoverage(byc, 0.6)).toThrow(/検査が効いていない/);
  });

  it("陰性対照：空虚な合格は assertCoverage で捕まる（何でも通す検査に堕ちない）", () => {
    const vacuous = gate("t.vacuous", true, coverageOf(0, 12), "src:4", [], null);
    expect(() => assertGate(vacuous)).not.toThrow(); // 合否だけ見ると緑に見える
    expect(() => assertCoverage(vacuous, 0.01)).toThrow(); // 被覆率が暴く
  });
});

describe("自己参照禁止（§6-4 #2）＝検算側は生成が使う表を import しない", () => {
  it("src/verify/ の import は verify/ 内と node 標準だけ", () => {
    const files = readdirSync(VERIFY_DIR).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(VERIFY_DIR, f), "utf8");
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
        const spec = m[1]!;
        const okSpec = spec.startsWith("./") || spec.startsWith("node:");
        if (!okSpec) bad.push(`${f}: ${spec}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
