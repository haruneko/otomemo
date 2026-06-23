import { describe, it, expect } from "vitest";
import { pitchToDegree, degreeToPitch, isChordTone, classifyNCT } from "../src/music/degree";

const C = { root: 0, quality: "" }; // C major triad = C E G

describe("度数内部モデル degree.ts（契約・design #12-M）", () => {
  it("pitchToDegree↔degreeToPitch が往復する（ダイアトニック・C major）", () => {
    for (const [pitch, deg] of [
      [60, 1], [62, 2], [64, 3], [65, 4], [67, 5], [69, 6], [71, 7], [72, 1],
    ] as [number, number][]) {
      const d = pitchToDegree(pitch, 0, "major");
      expect(d.degree).toBe(deg);
      expect(d.alter).toBe(0);
      expect(degreeToPitch(d, 0, "major")).toBe(pitch);
    }
  });

  it("音階外は『下位音階音＋alter+1』で表し往復する（C#=1度+#）", () => {
    const d = pitchToDegree(61, 0, "major"); // C#
    expect(d).toMatchObject({ degree: 1, alter: 1 });
    expect(degreeToPitch(d, 0, "major")).toBe(61);
    expect(degreeToPitch(pitchToDegree(66, 0, "major"), 0, "major")).toBe(66); // F#=4度+#
  });

  it("key 相対：G major で C は4度", () => {
    expect(pitchToDegree(67, 7, "major").degree).toBe(1); // G=主音
    expect(pitchToDegree(60, 7, "major").degree).toBe(4); // C=4度
    expect(degreeToPitch(pitchToDegree(60, 7, "major"), 7, "major")).toBe(60);
  });

  it("isChordTone：C コードで C/E/G は真、D は偽", () => {
    expect(isChordTone(60, C)).toBe(true); // C
    expect(isChordTone(64, C)).toBe(true); // E
    expect(isChordTone(67, C)).toBe(true); // G
    expect(isChordTone(62, C)).toBe(false); // D
    expect(isChordTone(72, C)).toBe(true); // C(oct上)
  });

  it("classifyNCT：コードトーン/経過/刺繍/倚音/掛留/逸音/孤立を分類", () => {
    expect(classifyNCT(60, 64, 67, C)).toBe("chord"); // E=コードトーン
    expect(classifyNCT(60, 62, 64, C)).toBe("passing"); // C→D→E 同方向歩進＝経過
    expect(classifyNCT(64, 62, 64, C)).toBe("neighbor"); // E→D→E 戻る＝刺繍
    expect(classifyNCT(60, 65, 64, C)).toBe("appoggiatura"); // 跳躍でF→歩進下行解決＝倚音
    expect(classifyNCT(65, 65, 64, C)).toBe("suspension"); // F保留→下行解決＝掛留
    expect(classifyNCT(60, 62, 67, C)).toBe("escape"); // 歩進でD→跳躍離脱＝逸音
    expect(classifyNCT(60, 66, 72, C)).toBe("other"); // 跳躍入り跳躍抜け＝孤立(禁止対象)
  });
});
