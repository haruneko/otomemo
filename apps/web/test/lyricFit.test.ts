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

// スライス2：句を渡すと高低が表記由来になる（design §31-3）。
// これまでは9語の内蔵辞書だけが頼りで、下がり目を持つのは「はし/そら/ゆめ」の3語＝
// それ以外の語では一番効く印（読みが下がる所をメロが上げる）が出なかった。
describe("computeLyricHits：句を渡すと印が表記由来の高低で出る", () => {
  const notes = [
    { pitch: 60, start: 0, dur: 1, syllable: "と" },
    { pitch: 67, start: 1, dur: 1, syllable: "け" }, // メロは上がる
  ];
  // 「とけい」は内蔵辞書に無い語。読みの高低は下がる（1→0）＝メロと逆＝赤が出るべき。
  const phrases = [{
    id: "p1", start: 0, beats: 4, text: "時計",
    reading: {
      forText: "時計",
      words: [{ surface: "時計", read: "トケイ", pron: "トケー", moraCount: 3 }],
      moras: [{ kana: "と", word: 0 }, { kana: "け", word: 0 }],
      hl: [1, 0] as (0 | 1)[],
      breaks: [],
    },
  }];

  it("句を渡さなければ（従来の呼び方）辞書に無い語なので何も当たらない", () => {
    const m = computeLyricHits(notes);
    expect([...m.values()].some((h) => h.ruleId === "A-01")).toBe(false);
  });

  it("句を渡すと読みの下がり目をメロが裏切っている所に赤が出る", () => {
    const m = computeLyricHits(notes, phrases);
    const hit = m.get(1);
    expect(hit?.ruleId).toBe("A-01");
    expect(hit?.severity).toBe("red");
  });

  it("表記を直した直後（控えが古い）は印を出さない＝古い高低で断定しない", () => {
    const stale = [{ ...phrases[0]!, text: "時計の針" }]; // reading.forText と食い違う
    expect([...computeLyricHits(notes, stale).values()].some((h) => h.ruleId === "A-01")).toBe(false);
  });
});
