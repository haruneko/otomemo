import { describe, it, expect } from "vitest";
import { mapAccents, type AccentResult } from "../src/accent";

// W-K1 アクセント自動注入の純関数（accent.py 出力 → analyzeLyricFit の accents）。spawn は実機スモークで別途確認。
// 正典＝docs/research/2026-07-15-kariuta-accent-feasibility.md（L3・phrases[].moras 総和＝syllable 数で round-trip）。

describe("mapAccents（アクセント句 → accents 整形・fallback ガード）", () => {
  it("句境界に沿って syllables を切り {kana,kernel} を組む", () => {
    // 「きみのなまえをよんだ」＝3句 [きみの(3), なまえを(4), よんだ(3)]
    const syll = ["き", "み", "の", "な", "ま", "え", "を", "よ", "ん", "だ"];
    const r: AccentResult = { text: "", mora_total: 10, phrases: [{ moras: 3, kernel: 3 }, { moras: 4, kernel: 4 }, { moras: 3, kernel: 3 }] };
    const acc = mapAccents(syll, r);
    expect(acc).toEqual([
      { kana: "きみの", kernel: 3 },
      { kana: "なまえを", kernel: 4 },
      { kana: "よんだ", kernel: 3 },
    ]);
  });

  it("モーラ総数が syllable 数と食い違えば null（＝内蔵ヒューリスティックへ fallback）", () => {
    const syll = ["は", "し"]; // 2モーラ
    const r: AccentResult = { text: "", mora_total: 3, phrases: [{ moras: 3, kernel: 1 }] }; // 3≠2
    expect(mapAccents(syll, r)).toBeNull();
  });

  it("error/空 phrases は null", () => {
    expect(mapAccents(["あ"], { text: "", mora_total: 0, phrases: [], error: "boom" })).toBeNull();
    expect(mapAccents(["あ"], { text: "", mora_total: 0, phrases: [] })).toBeNull();
  });
});
