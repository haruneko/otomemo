import { describe, it, expect } from "vitest";
// 連想エンジン：感情シフト＝「このコードだけ もっと切なく/明るく」＝品質をルールで変える（単体・データ不要）。
import { emotionShift } from "../src/music";

const has = (r: { degree: number; quality: string }[], degree: number, quality: string) =>
  r.some((x) => x.degree === degree && x.quality === quality);

describe("emotionShift（単体コードの感情シフト）", () => {
  it("darker：長調系→短調化（C→Cm, CM7→Cm7）", () => {
    expect(has(emotionShift({ degree: 0, quality: "" }, "darker"), 0, "m")).toBe(true);
    expect(has(emotionShift({ degree: 0, quality: "maj7" }, "darker"), 0, "m7")).toBe(true);
  });
  it("brighter：短調系→長調化（Cm→C, Cm7→CM7）", () => {
    expect(has(emotionShift({ degree: 0, quality: "m" }, "brighter"), 0, "")).toBe(true);
    expect(has(emotionShift({ degree: 0, quality: "m7" }, "brighter"), 0, "maj7")).toBe(true);
  });
  it("brighter：既に長調なら色を足して明るく（C→C6 等）", () => {
    const r = emotionShift({ degree: 0, quality: "" }, "brighter");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].degree).toBe(0); // ルートは変えない（単体の質だけ）
  });
  it("度数（ルート）は変えない・結果は入力と別物", () => {
    const r = emotionShift({ degree: 7, quality: "" }, "darker");
    expect(r.every((x) => x.degree === 7)).toBe(true);
    expect(r.some((x) => x.quality === "")).toBe(false);
  });

  it("M9: よくある品質で黙って空にならない（darker: m7/dim・brighter: sus4/6/dim7＝監査実測の空振り）", () => {
    expect(emotionShift({ degree: 9, quality: "m7" }, "darker").length).toBeGreaterThan(0); // 「Am7を切なく」
    expect(emotionShift({ degree: 0, quality: "dim" }, "darker").length).toBeGreaterThan(0);
    expect(emotionShift({ degree: 0, quality: "m7b5" }, "darker").length).toBeGreaterThan(0);
    expect(emotionShift({ degree: 0, quality: "sus4" }, "brighter").length).toBeGreaterThan(0);
    expect(emotionShift({ degree: 0, quality: "6" }, "brighter").length).toBeGreaterThan(0);
    expect(emotionShift({ degree: 0, quality: "dim7" }, "brighter").length).toBeGreaterThan(0);
    expect(emotionShift({ degree: 0, quality: "aug" }, "brighter").length).toBeGreaterThan(0);
  });

  it("M9: 表記ゆれ品質（min7等）もエイリアス解決してシフトできる", () => {
    expect(has(emotionShift({ degree: 9, quality: "min7" }, "brighter"), 9, "maj7")).toBe(true);
  });
});
