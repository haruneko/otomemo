import { describe, it, expect } from "vitest";
import { planLyricMelody, lyricLayerOfPlan } from "../src/music/lyricsPlan";
import { analyzeMoras } from "@cm/music-core";
import { partPatternOnsets } from "../src/music/rhythmParts";

// 歌詞先行メロ M-1（design #13d・WP-L0）＝planLyricMelody の純関数テスト。
// 芯＝オンセット（実音）数=計画の音数 の恒等・特殊拍role・句割り・R-13パターン再利用。

const onsetCount = (kana: string) => analyzeMoras(kana).filter((m) => m.kind === "normal" || m.kind === "hatsuon").length;
const patOnsetsTotal = (p: ReturnType<typeof planLyricMelody>) =>
  (p.rhythmParts.placement ?? []).reduce((s, pl) => {
    const pat = (p.rhythmParts.custom ?? []).find((c) => c.id === pl.partId)?.pattern ?? "";
    return s + [...pat].filter((c) => c === "x").length;
  }, 0);

describe("planLyricMelody オンセット数の恒等（音数一致 property）", () => {
  const samples = ["しずむゆうひが", "うみをそめる", "がっこうへ", "そーらへゆく", "ほんとうにきみは", "きゃっとないた"];
  for (const s of samples) {
    it(`「${s}」＝敷いたパターンの onset 総数 = オンセットモーラ数 = syllables 長`, () => {
      const p = planLyricMelody([s], { bars: 2, beatsPerBar: 4 });
      expect(p.onsetTotal).toBe(onsetCount(s));
      expect(p.syllables.length).toBe(onsetCount(s));
      expect(patOnsetsTotal(p)).toBe(p.onsetTotal); // 敷いたグリッドの実 onset 数が一致（V2 が厳密一致で敷ける保証）
    });
  }
});

describe("特殊拍 role（長音ー=tie/促音っ=rest は音符を立てない・撥音ん=実音）", () => {
  it("ー/っ はオンセットにならない", () => {
    expect(planLyricMelody(["そーらへ"], { bars: 1, beatsPerBar: 4 }).onsetTotal).toBe(3); // そ,ら,へ（ー除く）
    expect(planLyricMelody(["がっこう"], { bars: 1, beatsPerBar: 4 }).onsetTotal).toBe(3); // が,こ,う（っ除く）
    expect(planLyricMelody(["きゃっと"], { bars: 1, beatsPerBar: 4 }).onsetTotal).toBe(2); // きゃ,と
  });
  it("撥音ん は実音（オンセット）", () => {
    expect(planLyricMelody(["ほんとう"], { bars: 1, beatsPerBar: 4 }).onsetTotal).toBe(4); // ほ,ん,と,う
  });
  it("syllables はオンセットかな列（特殊拍を除いた並び）", () => {
    expect(planLyricMelody(["がっこうへ"], { bars: 2, beatsPerBar: 4 }).syllables.join("")).toBe("がこうへ");
  });
});

describe("句割り（phrases＝行/句・整数小節・句末カデンツ）", () => {
  it("最終句 cadenceDegree=1（主音）・他=5（開き）／beats は barLen の整数倍／合計小節=frame bars", () => {
    const p = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    expect(p.phrases.length).toBe(2);
    expect(p.phrases[0]!.cadenceDegree).toBe(5);
    expect(p.phrases[1]!.cadenceDegree).toBe(1);
    for (const ph of p.phrases) expect(ph.beats % 4).toBe(0);
    expect(p.phrases.reduce((s, ph) => s + ph.beats / 4, 0)).toBe(4); // 全句の小節合計=4
    expect(p.phrases[0]!.startBeat).toBe(0);
    expect(p.phrases[1]!.startBeat).toBe(p.phrases[0]!.beats);
  });
  it("行数 > 小節数＝隣接行を統合し警告（各句≥1小節を守る）", () => {
    const p = planLyricMelody(["あ", "かきくけ", "さし"], { bars: 2, beatsPerBar: 4 });
    expect(p.phrases.length).toBe(2);
    expect(p.warnings.some((w) => w.includes("統合"))).toBe(true);
  });
  it("placement は全小節を覆う（l0 を残さない＝音数厳密一致の前提）", () => {
    const p = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    const bars = new Set((p.rhythmParts.placement ?? []).map((pl) => pl.bar));
    expect([...bars].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });
});

describe("R-13 パターン再利用（同レイアウトの小節は custom id を共有＝反復の回復）", () => {
  it("同オンセット数の小節が同一パターン id を引く", () => {
    // しずむゆうひが(7)＝bar0[4]+bar1[3]、うみをそめる(6)＝bar2[4]+bar3[2]。bar0 と bar2 は同じ4分×4パターン＝同 id。
    const p = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    const byBar = Object.fromEntries((p.rhythmParts.placement ?? []).map((pl) => [pl.bar, pl.partId]));
    expect(byBar[0]).toBe(byBar[2]); // 4分×4 が再利用
    // custom はユニークパターンだけ（placement 数より少ない＝重複排除されている）
    expect((p.rhythmParts.custom ?? []).length).toBeLessThan((p.rhythmParts.placement ?? []).length);
    // 引いたパターンの onset は 16枠→拍列で妥当
    const pat0 = (p.rhythmParts.custom ?? []).find((c) => c.id === byBar[0])!.pattern;
    expect(partPatternOnsets(pat0, 4)).toEqual([0, 1, 2, 3]);
  });
});

describe("字余り（グリッド容量超）＝細分＋警告", () => {
  it("1小節に多モーラ＝16分まで細分し、収まらなければ overflow を警告", () => {
    const many = "あいうえおかきくけこさしすせそた"; // 16 normal → 1小節ちょうど16枠
    const p = planLyricMelody([many], { bars: 1, beatsPerBar: 4 });
    expect(p.onsetTotal).toBe(16);
    expect(patOnsetsTotal(p)).toBe(16); // 16枠使い切り
    const over = planLyricMelody([many + "ち"], { bars: 1, beatsPerBar: 4 }); // 17 → 1枠 overflow
    expect(over.warnings.some((w) => w.includes("字余り"))).toBe(true);
  });
});

describe("空/未指定＝空計画（呼び側は注入しない＝bit一致）", () => {
  it("空歌詞＝phrases 空", () => {
    expect(planLyricMelody([], { bars: 4 }).phrases).toEqual([]);
    expect(planLyricMelody(["  ", ""], { bars: 4 }).phrases).toEqual([]);
  });
});

// ── スライス7（design §31-10）＝表記にそろえる。**新挙動はどちらも音符数が変わる＝既定OFFのopt-in**。
// 耳で確かめてから既定を反転する（design §31-10 スライス7・backlog の耳確認リスト）。
describe("スライス7：読み（かな）を受け取る＝表記のモーラ数が正しくなる（既定OFF）", () => {
  const kanji = ["君の名前を", "空に描く"];
  const yomi = ["きみのなまえを", "そらにえがく"];
  it("readings 未指定＝従来（表記の字をそのまま数える＝漢字は1字1音）", () => {
    const p = planLyricMelody(kanji, { bars: 4, beatsPerBar: 4 });
    expect(p.onsetTotal).toBe(onsetCount("君の名前を") + onsetCount("空に描く")); // 5+4＝化けたまま（従来の姿）
  });
  it("readings を渡すと読みでモーラを数える（音数が変わる＝opt-in の理由）", () => {
    const p = planLyricMelody(kanji, { bars: 4, beatsPerBar: 4, readings: yomi });
    expect(p.onsetTotal).toBe(7 + 6); // きみのなまえを(7)＋そらにえがく(6)＝表記のままなら 5+4=9 だった
    expect(p.syllables.join("")).toBe("きみのなまえをそらにえがく");
    expect(p.lines.map((l) => l.text)).toEqual(kanji); // 表示は表記のまま（正データは表記）
    expect(p.lines[0]!.moraCount).toBe(7);
  });
  it("readings は行と同じ並び（空行は表記側で落ちる＝読みも一緒に落ちる）", () => {
    const p = planLyricMelody(["", "君の名前を", "  "], { bars: 2, beatsPerBar: 4, readings: ["", "きみのなまえを", ""] });
    expect(p.lines.length).toBe(1);
    expect(p.syllables.join("")).toBe("きみのなまえを");
  });
  it("読みが取れなかった行（空文字/undefined）は表記で数える＝落ちない", () => {
    const p = planLyricMelody(kanji, { bars: 4, beatsPerBar: 4, readings: ["きみのなまえを", ""] });
    expect(p.onsetTotal).toBe(7 + onsetCount("空に描く"));
  });
});

describe("スライス7：「っ」「ー」に音符を立てる（§31-8 裁定・既定OFF）", () => {
  it("standSpecialMoras=true＝全モーラが音符を持つ（総モーラ数＝音数）", () => {
    const on = { bars: 1, beatsPerBar: 4, standSpecialMoras: true } as const;
    expect(planLyricMelody(["そーらへ"], on).onsetTotal).toBe(4); // そ,ー,ら,へ
    expect(planLyricMelody(["がっこう"], on).onsetTotal).toBe(4); // が,っ,こ,う
    expect(planLyricMelody(["きゃっと"], on).onsetTotal).toBe(3); // きゃ,っ,と（拗音は1モーラのまま）
    expect(planLyricMelody(["がっこうへ"], { bars: 2, beatsPerBar: 4, standSpecialMoras: true }).syllables.join("")).toBe("がっこうへ");
  });
  it("standSpecialMoras=true では onsetCount＝moraCount（#13d の受け入れ条件の数え方が っ/ー 込みになる）", () => {
    const p = planLyricMelody(["そーらへ", "がっこう"], { bars: 4, beatsPerBar: 4, standSpecialMoras: true });
    for (const l of p.lines) expect(l.onsetCount).toBe(l.moraCount);
    expect(p.onsetTotal).toBe(p.lines.reduce((s, l) => s + l.moraCount, 0));
  });
  it("既定（未指定/false）＝従来と bit 一致", () => {
    const lines = ["そーらへゆく", "がっこうへ", "ほんとうにきみは"];
    const base = JSON.stringify(planLyricMelody(lines, { bars: 4, beatsPerBar: 4 }));
    expect(JSON.stringify(planLyricMelody(lines, { bars: 4, beatsPerBar: 4, standSpecialMoras: false }))).toBe(base);
    expect(JSON.stringify(planLyricMelody(lines, { bars: 4, beatsPerBar: 4, readings: undefined }))).toBe(base);
  });
});

describe("スライス7：計画→句（content.lyric に載せる形）", () => {
  it("行1つ＝句1つ・start/beats は句割りと一致・表記が text", () => {
    const p = planLyricMelody(["しずむゆうひが", "うみをそめる"], { bars: 4, beatsPerBar: 4 });
    const layer = lyricLayerOfPlan(p)!;
    expect(layer.phrases.length).toBe(2);
    expect(layer.phrases.map((ph) => ph.text)).toEqual(["しずむゆうひが", "うみをそめる"]);
    expect(layer.phrases.map((ph) => ph.start)).toEqual(p.phrases.map((ph) => ph.startBeat));
    expect(layer.phrases.map((ph) => ph.beats)).toEqual(p.phrases.map((ph) => ph.beats));
    expect(new Set(layer.phrases.map((ph) => ph.id)).size).toBe(2); // 札は句ごとに別
  });
  it("空計画＝句なし（undefined＝content にキーを生やさない）", () => {
    expect(lyricLayerOfPlan(planLyricMelody([], { bars: 4 }))).toBeUndefined();
  });
});
