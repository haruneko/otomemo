import { describe, it, expect } from "vitest";
import { planLyricMelody } from "../src/music/lyricsPlan";
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
