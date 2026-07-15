import { describe, it, expect } from "vitest";
import {
  analyzeMoras,
  suggestLyricRhythm,
  accentContour,
  analyzeLyricFit,
  opennessSeq,
  opennessReport,
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
  it("openness(V1/V2) を追加で載せる（既存フィールドは互換維持）", () => {
    const rep = analyzeLyricFit(notesFrom(["は", "し"], [60, 64]));
    // 既存フィールドは不変
    expect(rep.contour).toBeDefined();
    expect(rep.melodyDir).toBeDefined();
    // 追加：openness
    expect(rep.openness).toBeDefined();
    expect(rep.openness.apexIdx).toBe(1); // 64 が最高音＝index 1（「し」i段=0.35）
    expect(rep.openness.v1).toBeCloseTo(0.35, 5);
  });
});

// W-K5 母音開口度メトリクス（L1 §4・V1 頂点開口度／V2 開口度×音高・音価相関）。
describe("opennessSeq / opennessReport（V1/V2・母音設計メトリクス）", () => {
  const notesFrom = (syl: string[], pitches: number[], durs?: number[]) =>
    syl.map((s, i) => ({ pitch: pitches[i]!, syllable: s, start: i, dur: durs?.[i] ?? 1 }));

  it("開口度ランク＝あ1.0/お0.8/え0.6/い0.35/う0.2、っ/ん=0、ー は直前を継ぐ", () => {
    expect(opennessSeq(["あ", "お", "え", "い", "う"])).toEqual([1.0, 0.8, 0.6, 0.35, 0.2]);
    expect(opennessSeq(["っ", "ん"])).toEqual([0, 0]);
    expect(opennessSeq(["か", "ー"])).toEqual([1.0, 1.0]); // ー が直前「か」(a=1.0)を継ぐ
  });

  it("V1＝最高音に乗るモーラの開口度", () => {
    // 「あいう」を 60,67,62 で歌う＝最高音は index1「い」(0.35)
    const r = opennessReport(notesFrom(["あ", "い", "う"], [60, 67, 62]));
    expect(r.apexIdx).toBe(1);
    expect(r.v1).toBeCloseTo(0.35, 5);
  });

  it("V2pitch＝開口度×音高が正相関なら正（高い音ほど開いた母音）", () => {
    // 音高上昇に合わせ開口度も上昇＝う(0.2)→い(0.35)→え(0.6)→お(0.8)→あ(1.0)
    const r = opennessReport(notesFrom(["う", "い", "え", "お", "あ"], [60, 62, 64, 65, 67]));
    expect(r.v2pitch).toBeGreaterThan(0.9);
  });

  it("V2dur＝開口度×音価。長い音ほど開いた母音なら正", () => {
    const r = opennessReport(notesFrom(["う", "あ"], [60, 60], [1, 4]));
    expect(r.v2dur).not.toBeNull();
    expect(r.v2dur!).toBeGreaterThan(0);
  });

  it("母音不明のみ／単点は null（誠実にデフォルト）", () => {
    const r = opennessReport(notesFrom(["っ"], [60])); // 開口度0の1点＝相関定義不能
    expect(r.v2pitch).toBeNull();
  });
});
