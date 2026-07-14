import { describe, it, expect } from "vitest";
import {
  analyzeMoras,
  suggestLyricRhythm,
  accentContour,
  analyzeLyricFit,
} from "../src/prosody";

// 正典＝docs/research/2026-07-14-jp-prosody-melody-rules.md（R-01〜14 / A-01〜10）。
// 規則表の「例」を固定値テストに落とす（TDD）。単位はモーラ＝長音ー/促音っ/撥音ん は各1モーラ。

describe("analyzeMoras（モーラ分割＋特殊拍分類・§0/§2.1）", () => {
  it("拗音は1モーラ・特殊拍(ー/っ/ん)は独立1モーラ", () => {
    expect(analyzeMoras("そら").map((m) => m.kana)).toEqual(["そ", "ら"]); // R-01: 2モーラ
    expect(analyzeMoras("きゃく").map((m) => m.kana)).toEqual(["きゃ", "く"]); // R-06: 拗音1モーラ→2
    expect(analyzeMoras("がっこう").map((m) => m.kana)).toEqual(["が", "っ", "こ", "う"]); // §0: 4モーラ
    expect(analyzeMoras("とうきょう").map((m) => m.kana)).toEqual(["と", "う", "きょ", "う"]); // §0: 4モーラ
  });
  it("特殊拍の kind 分類と母音継承", () => {
    const m = analyzeMoras("せーの"); // 長音ー
    expect(m.map((x) => x.kind)).toEqual(["normal", "long", "normal"]);
    expect(m[1]!.vowel).toBe("e"); // ー は直前「せ」の母音を継ぐ
    const h = analyzeMoras("ほんと");
    expect(h.map((x) => x.kind)).toEqual(["normal", "hatsuon", "normal"]); // ん=hatsuon
    const k = analyzeMoras("きっと");
    expect(k.map((x) => x.kind)).toEqual(["normal", "sokuon", "normal"]); // っ=sokuon
  });
});

describe("suggestLyricRhythm（歌詞→リズム型候補・R-01〜12）", () => {
  it("basic候補＝1モーラ1スロット・特殊拍の role（R-01/02/03/04/06）", () => {
    const r = suggestLyricRhythm("せーの");
    expect(r.moraCount).toBe(3);
    const basic = r.candidates.find((c) => c.id === "basic")!;
    // ー は tie（新アタック無・直前へ延長）＝R-02、他は onset
    expect(basic.slots.map((s) => s.role)).toEqual(["onset", "tie", "onset"]);

    const kitto = suggestLyricRhythm("きっと").candidates.find((c) => c.id === "basic")!;
    expect(kitto.slots.map((s) => s.role)).toEqual(["onset", "rest", "onset"]); // っ=rest（詰め）R-04

    const honto = suggestLyricRhythm("ほんと").candidates.find((c) => c.id === "basic")!;
    expect(honto.slots.map((s) => s.role)).toEqual(["onset", "onset", "onset"]); // ん=独立onset R-03
  });
  it("字余り subdivide 候補と字足らず tail 候補を出す（R-07/08/11/12）", () => {
    const r = suggestLyricRhythm("そら");
    expect(r.candidates.map((c) => c.id)).toContain("subdivide"); // R-07 早口/シンコペ
    expect(r.candidates.map((c) => c.id)).toContain("tail"); // R-08/11 句末伸ばし・メリスマ
    // subdivide は basic より細かい単位（同じモーラ数を詰め込む）
    const basic = r.candidates.find((c) => c.id === "basic")!;
    const sub = r.candidates.find((c) => c.id === "subdivide")!;
    expect(sub.slots[0]!.dur).toBeLessThan(basic.slots[0]!.dur);
  });
  it("句頭が助詞/接続詞/感動詞なら弱起(pickup)を提案（R-10）", () => {
    const r = suggestLyricRhythm("ねえきいて");
    expect(r.pickup).toBeTruthy();
    expect(r.pickup!.word).toBe("ねえ"); // 感動詞を弱起へ
    const noPickup = suggestLyricRhythm("そら");
    expect(noPickup.pickup).toBeUndefined();
  });
});

describe("accentContour（アクセント核→隣接モーラの朗読関係・§1.3）", () => {
  it("平板型(kernel0)=第1モーラ低→以降高（UP,FLAT…）", () => {
    expect(accentContour(3, 0)).toEqual(["UP", "FLAT"]);
  });
  it("頭高(kernel1)=高→低（DOWN,FLAT…）", () => {
    expect(accentContour(3, 1)).toEqual(["DOWN", "FLAT"]);
  });
  it("中高(kernel2 of 4)=UP→核でDOWN→FLAT", () => {
    expect(accentContour(4, 2)).toEqual(["UP", "DOWN", "FLAT"]);
  });
});

describe("analyzeLyricFit（既存メロ×歌詞のアクセント整合警告・A-01〜05/07）", () => {
  const notesFrom = (syl: string[], pitches: number[]) =>
    syl.map((s, i) => ({ pitch: pitches[i]!, syllable: s, start: i, dur: 1 }));

  it("A-01: 頭高語(箸型)を旋律が上昇で裏切る＝赤(語義誤解)", () => {
    // 「はし」頭高(kernel1)＝朗読はDOWN。旋律が 60→64(上昇=+)＝A-01 衝突(最重)
    const rep = analyzeLyricFit(notesFrom(["は", "し"], [60, 64]), {
      accents: [{ kana: "はし", kernel: 1 }],
    });
    expect(rep.contour).toEqual(["DOWN"]);
    expect(rep.melodyDir).toEqual(["+"]);
    const hit = rep.hits.find((h) => h.ruleId === "A-01")!;
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe("red");
    expect(rep.score).toBeLessThan(0.6);
  });
  it("整合（頭高を下降で歌う）＝ヒット無し・満点", () => {
    const rep = analyzeLyricFit(notesFrom(["は", "し"], [64, 60]), {
      accents: [{ kana: "はし", kernel: 1 }],
    });
    expect(rep.hits.filter((h) => h.severity !== "info")).toEqual([]);
    expect(rep.score).toBe(1);
  });
  it("A-03: 平板の上がり目(UP)を旋律下降で裏切る＝黄", () => {
    // 平板(kernel0) 3モーラ＝UP,FLAT。旋律 64→60→60＝-,0。1対目 UP×- が A-03
    const rep = analyzeLyricFit(notesFrom(["や", "ま", "と"], [64, 60, 60]), {
      accents: [{ kana: "やまと", kernel: 0 }],
    });
    const hit = rep.hits.find((h) => h.ruleId === "A-03")!;
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe("yellow");
  });
  it("内蔵辞書で語のアクセントを引ける（accents 未指定時）", () => {
    // 辞書に無い語は平板ヒューリスティック＝落ちない（誠実にデフォルト）
    const rep = analyzeLyricFit(notesFrom(["あ", "い"], [60, 62]));
    expect(rep.contour.length).toBe(1);
    expect(typeof rep.score).toBe("number");
  });
});
