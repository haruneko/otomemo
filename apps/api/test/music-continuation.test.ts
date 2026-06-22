import { describe, it, expect } from "vitest";
import { nextChordCandidates } from "../src/music";

const deg = (xs: [number, string][]) => xs.map(([degree, quality]) => ({ degree, quality }));

describe("nextChordCandidates（継続・機能文法）", () => {
  it("V(D)で終わる → 次はトニック解決(I=0,function T)が筆頭", () => {
    const r = nextChordCandidates(deg([[0, ""], [5, ""], [7, ""]]), { mode: "major" });
    expect(r[0]).toMatchObject({ degree: 0, function: "T" });
  });
  it("IV(S)で終わる → 次はドミナント(V=7,function D)を含む", () => {
    const r = nextChordCandidates(deg([[0, ""], [5, ""]]), { mode: "major" });
    expect(r.some((c) => c.degree === 7 && c.function === "D")).toBe(true);
  });
  it("I(T)で終わる → 次はS/D（ii/IV/V…）＝離れる", () => {
    const r = nextChordCandidates(deg([[7, ""], [0, ""]]), { mode: "major" });
    expect(r.some((c) => c.function === "S" || c.function === "D")).toBe(true);
    expect(r.some((c) => c.degree === 0)).toBe(false); // 同じI連続は出さない
  });
  it("空進行でも安全（トニックから提案）", () => {
    expect(nextChordCandidates([]).length).toBeGreaterThan(0);
  });
});
