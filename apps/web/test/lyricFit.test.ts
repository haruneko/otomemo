import { describe, it, expect } from "vitest";
import { buildHitMap, sylFitClass, computeLyricHits, type FitHit } from "../src/lyricFit";
import type { Note } from "../src/music";

const H = (noteIdx: number, severity: FitHit["severity"], ruleId = "A-x"): FitHit => ({
  noteIdx,
  ruleId,
  severity,
  note: "",
});
const N = (pitch: number, start: number, syllable?: string): Note => ({ pitch, start, dur: 1, syllable });

describe("lyricFit：hits→クラス付与（W-K2 web配線）", () => {
  it("severity→クラス、複数規則は重い方が勝つ（赤>黄>info）", () => {
    // idx1=赤/黄が別ノート、idx2 は info と red が重なる→red 採用。
    const map = buildHitMap([H(1, "yellow"), H(2, "info"), H(2, "red")]);
    expect(sylFitClass(map.get(1)!.severity)).toBe("fit-yellow");
    expect(sylFitClass(map.get(2)!.severity)).toBe("fit-red"); // 重い方
    expect(sylFitClass("info")).toBe("fit-info");
  });

  it("赤付与：頭高語を旋律が上昇で裏切る＝A-01 赤（DOWN×+）", () => {
    // 「はし」(頭高=高→低)を上行(60→64)で歌う＝語義誤解級。noteIdx1 に赤。
    const map = computeLyricHits([N(60, 0, "は"), N(64, 1, "し")]);
    const hit = map.get(1);
    expect(hit).toBeDefined();
    expect(hit!.ruleId).toBe("A-01");
    expect(sylFitClass(hit!.severity)).toBe("fit-red");
  });

  it("歌詞なしゼロ影響：syllable が無ければ上昇終止でも空 Map（チップが無い＝装飾しない）", () => {
    const map = computeLyricHits([N(60, 0), N(62, 1), N(67, 2)]); // 上行終止＝A-07 相当だが歌詞なし
    expect(map.size).toBe(0);
  });
});
