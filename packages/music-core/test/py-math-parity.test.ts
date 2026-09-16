// pyMath（CPython 3.12 の math.exp／sum を最後の桁まで写す）の検算。
// 基準＝test/fixtures/py-math.json（乱数の抜粋 exp 3,000・sum 1,000）＋ tools/py-parity/cases-handframe/exp.json
// （ピアノ伴奏の生成器が実際に math.exp へ渡した引数と結果の全件）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fma, pyExp, pySum } from "../src/pyMath";

const load = (rel: string) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const fx = load("./fixtures/py-math.json") as { exp: [number, number][]; sum: [number[], number][] };
const engineExp = load("../../../tools/py-parity/cases-handframe/exp.json") as [number, number][];

describe("pyExp ≡ Python math.exp（glibc・FMA 版）", () => {
  it(`乱数の抜粋 ${fx.exp.length} 件`, () => {
    let bad = 0;
    for (const [x, y] of fx.exp) if (!Object.is(pyExp(x), y)) bad++;
    expect(bad).toBe(0);
  });
  it(`生成器が実際に使った引数 ${engineExp.length} 件`, () => {
    for (const [x, y] of engineExp) expect(Object.is(pyExp(x), y), String(x)).toBe(true);
  });
  it("診断：V8 の Math.exp のままでは合わない（この小道具が要る理由）", () => {
    expect(fx.exp.filter(([x, y]) => !Object.is(Math.exp(x), y)).length).toBeGreaterThan(0);
  });
  it("範囲外は例外（検算していない域を黙って返さない）", () => {
    expect(() => pyExp(600)).toThrow();
    expect(pyExp(0)).toBe(1);
  });
});

describe("fma", () => {
  it("掛けて足すのを1回で丸める（別々に丸めると消える端数が残る）", () => {
    const a = 1 + 2 ** -30;
    expect(fma(a, a, -1)).toBe(2 ** -29 + 2 ** -60);
    expect(a * a - 1).not.toBe(2 ** -29 + 2 ** -60);
    expect(fma(3, 0, 5)).toBe(5);
    expect(fma(2, 3, 0)).toBe(6);
  });
});

describe("pySum ≡ Python 3.12 sum（補償付き）", () => {
  it(`乱数の抜粋 ${fx.sum.length} 件`, () => {
    let bad = 0;
    for (const [v, y] of fx.sum) if (!Object.is(pySum(v), y)) bad++;
    expect(bad).toBe(0);
  });
  it("診断：素朴な足し算とは違う結果になる組がある", () => {
    expect(fx.sum.filter(([v, y]) => !Object.is(v.reduce((a, b) => a + b, 0), y)).length).toBeGreaterThan(0);
  });
});
