import { describe, it, expect } from "vitest";
import { decomposeQuality, composeQuality, extOptionsFor, maj7Applicable } from "../src/chordQuality";

// 分解→合成の往復（保存形式の quality を壊さない）。design 決定A・UI直交化。
const CANON = [
  "", "m", "dim", "aug", "sus4", "sus2",
  "6", "m6", "69", "m69", "add9",
  "7", "maj7", "m7", "mM7", "m7b5", "dim7", "aug7", "7sus4",
  "9", "maj9", "m9", "11", "m11", "13", "maj13", "m13",
  "7b9", "7#9", "7#11", "7b5", "maj7#11",
];

describe("chordQuality 分解/合成", () => {
  it("全正準 quality が往復で不変（compose(decompose(q))===q）", () => {
    for (const q of CANON) expect(composeQuality(decomposeQuality(q)), q).toBe(q);
  });

  it("エイリアスは正準へ寄る（maj→'', min→'m'）", () => {
    expect(composeQuality(decomposeQuality("maj"))).toBe("");
    expect(composeQuality(decomposeQuality("min"))).toBe("m");
  });

  it("ドミナントは番号だけ・長7は△（決定）", () => {
    // C7（ドミナント）＝ maj + 7 + △off
    expect(composeQuality({ tri: "maj", ext: "7", maj7: false, alt: "" })).toBe("7");
    // Cmaj7 ＝ maj + 7 + △on
    expect(composeQuality({ tri: "maj", ext: "7", maj7: true, alt: "" })).toBe("maj7");
    // C9 / Cmaj9 / Dm9
    expect(composeQuality({ tri: "maj", ext: "9", maj7: false, alt: "" })).toBe("9");
    expect(composeQuality({ tri: "maj", ext: "9", maj7: true, alt: "" })).toBe("maj9");
    expect(composeQuality({ tri: "m", ext: "9", maj7: false, alt: "" })).toBe("m9");
    // 7♭9 / maj7♯11
    expect(composeQuality({ tri: "maj", ext: "7", maj7: false, alt: "b9" })).toBe("7b9");
    expect(composeQuality({ tri: "maj", ext: "7", maj7: true, alt: "#11" })).toBe("maj7#11");
  });

  it("三和音ごとに拡張の可否が変わる（dim+7=m7♭5・△は maj/m のみ）", () => {
    expect(extOptionsFor("dim").map((o) => o.v)).toContain("dim7");
    expect(maj7Applicable("maj", "7")).toBe(true);
    expect(maj7Applicable("dim", "7")).toBe(false);
    expect(maj7Applicable("maj", "6")).toBe(false);
  });
});
