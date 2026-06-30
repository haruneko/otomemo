import { describe, it, expect } from "vitest";
import { decomposeQuality, composeQuality, extOptionsFor } from "../src/chordQuality";

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

  it("長7vsドミナントは三和音の maj/空欄で切替（決定）", () => {
    // C7（ドミナント）＝ 空欄 + 7／ Cmaj7 ＝ maj + 7
    expect(composeQuality({ tri: "", ext: "7", alt: "" })).toBe("7");
    expect(composeQuality({ tri: "maj", ext: "7", alt: "" })).toBe("maj7");
    // C9 / Cmaj9 / Dm9
    expect(composeQuality({ tri: "", ext: "9", alt: "" })).toBe("9");
    expect(composeQuality({ tri: "maj", ext: "9", alt: "" })).toBe("maj9");
    expect(composeQuality({ tri: "m", ext: "9", alt: "" })).toBe("m9");
    // maj 単独＝C／ mM7 は minor+maj7拡張
    expect(composeQuality({ tri: "maj", ext: "", alt: "" })).toBe("");
    expect(composeQuality({ tri: "m", ext: "M7", alt: "" })).toBe("mM7");
    // 7♭9 / maj7♯11
    expect(composeQuality({ tri: "", ext: "7", alt: "b9" })).toBe("7b9");
    expect(composeQuality({ tri: "maj", ext: "7", alt: "#11" })).toBe("maj7#11");
  });

  it("三和音ごとに拡張の可否が変わる（空欄/dim/minor）", () => {
    expect(extOptionsFor("dim").map((o) => o.v)).toContain("dim7");
    expect(extOptionsFor("m").map((o) => o.v)).toContain("M7"); // mM7用
    expect(extOptionsFor("maj").map((o) => o.v)).toEqual(["", "7", "9", "13"]);
  });
});
