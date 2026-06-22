import { describe, it, expect } from "vitest";
// 連想エンジン S2：度数→機能(T/S/D)・ローマ数字・カデンツ(終止)検出（music21非依存・決定的）。
import { functionOf, romanOf, cadenceOf, analyzeProgression } from "../src/music";

describe("functionOf（度数→機能 T/S/D）", () => {
  it("メジャー：I/iii/vi=T, ii/IV=S, V/vii=D", () => {
    expect(functionOf(0, "major")).toBe("T");
    expect(functionOf(4, "major")).toBe("T");
    expect(functionOf(9, "major")).toBe("T");
    expect(functionOf(2, "major")).toBe("S");
    expect(functionOf(5, "major")).toBe("S");
    expect(functionOf(7, "major")).toBe("D");
    expect(functionOf(11, "major")).toBe("D");
  });
  it("非ダイアトニックは ?（暫定・セカンダリードミナント判定は後続）", () => {
    expect(functionOf(1, "major")).toBe("?"); // bII
    expect(functionOf(6, "major")).toBe("?"); // #IV
  });
});

describe("romanOf（度数＋品質→ローマ数字）", () => {
  it("メジャー基本：度数→数字・品質で大文字小文字", () => {
    expect(romanOf({ degree: 0, quality: "" }, "major")).toBe("I");
    expect(romanOf({ degree: 9, quality: "m" }, "major")).toBe("vi");
    expect(romanOf({ degree: 7, quality: "7" }, "major")).toBe("V7");
    expect(romanOf({ degree: 5, quality: "maj7" }, "major")).toBe("IVmaj7");
  });
  it("非ダイアトニックは臨時記号つき", () => {
    expect(romanOf({ degree: 10, quality: "" }, "major")).toBe("bVII");
  });
});

describe("cadenceOf（終止の型）", () => {
  const deg = (xs: [number, string][]) => xs.map(([degree, quality]) => ({ degree, quality }));
  it("V→I = 全終止(authentic)", () => {
    expect(cadenceOf(deg([[5, ""], [7, ""], [0, ""]]), "major").type).toBe("authentic");
  });
  it("IV→I = 変終止(plagal)", () => {
    expect(cadenceOf(deg([[0, ""], [5, ""], [0, ""]]), "major").type).toBe("plagal");
  });
  it("…→V = 半終止(half)", () => {
    expect(cadenceOf(deg([[0, ""], [5, ""], [7, ""]]), "major").type).toBe("half");
  });
  it("V→vi = 偽終止(deceptive)", () => {
    expect(cadenceOf(deg([[5, ""], [7, ""], [9, "m"]]), "major").type).toBe("deceptive");
  });
});

describe("マイナー調・非ダイア・境界（S2 acceptor 指摘の穴埋め）", () => {
  it("マイナー：i/bIII/bVI=T, ii/iv=S, v/bVII=D", () => {
    expect(functionOf(0, "minor")).toBe("T");
    expect(functionOf(3, "minor")).toBe("T");
    expect(functionOf(8, "minor")).toBe("T");
    expect(functionOf(5, "minor")).toBe("S");
    expect(functionOf(7, "minor")).toBe("D");
    expect(functionOf(10, "minor")).toBe("D");
  });
  it("マイナー authentic（v→i）と deceptive（V→bVI）", () => {
    const deg = (xs: [number, string][]) => xs.map(([degree, quality]) => ({ degree, quality }));
    expect(cadenceOf(deg([[5, ""], [7, "m"], [0, "m"]]), "minor").type).toBe("authentic");
    expect(cadenceOf(deg([[5, ""], [7, ""], [8, ""]]), "minor").type).toBe("deceptive");
  });
  it("非ダイア roman（#IV・dim=°）", () => {
    expect(romanOf({ degree: 6, quality: "" }, "major")).toBe("#IV");
    expect(romanOf({ degree: 2, quality: "dim" }, "major")).toBe("ii°");
  });
  it("空/1和音は安全（カデンツ none・解析は空 degrees）", () => {
    expect(cadenceOf([], "major").type).toBe("none");
    expect(analyzeProgression([]).degrees.length).toBe(0);
    expect(analyzeProgression([{ root: 0, quality: "" }]).degrees.length).toBe(1);
  });
});

describe("analyzeProgression（束ねる・調未指定なら推定）", () => {
  const CANON = [
    { root: 0, quality: "" }, { root: 7, quality: "" }, { root: 9, quality: "m" }, { root: 4, quality: "m" },
    { root: 5, quality: "" }, { root: 0, quality: "" }, { root: 5, quality: "" }, { root: 7, quality: "" },
  ];
  it("カノンを C メジャーで機能解析（I-V-vi-iii-IV-I-IV-V）", () => {
    const r = analyzeProgression(CANON, { key: 0, mode: "major" });
    expect(r.degrees.map((d) => d.function)).toEqual(["T", "D", "T", "T", "S", "T", "S", "D"]);
    expect(r.degrees[0].roman).toBe("I");
    expect(r.degrees[2].roman).toBe("vi");
  });
  it("調未指定でも推定して解析（カノン→C major）", () => {
    const r = analyzeProgression(CANON);
    expect(r.key).toBe(0);
    expect(r.mode).toBe("major");
    expect(r.degrees.length).toBe(8);
  });
});
