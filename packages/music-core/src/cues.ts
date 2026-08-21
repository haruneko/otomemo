// カスケード・ブリーフィング S0＝型と規則の凍結（正典＝docs/design.md「3層カスケード」・
// docs/drafts/2026-08-21-cascade-briefing-implementation.md §1-1/§2-2/§2-3・M0契約 §3-1）。
//
// 思想（案C＝docs/drafts/2026-08-21-arrange-data-locus.md）：セクション＝**薄い合図**（cues＝位置＋
// 性格・楽器非依存）／トラック（レシピ）＝**弾き方の語彙**／resolve が合成。神化回避の機械判定＝
// 「楽器が増えても `Cue` のフィールド集合は1バイトも動かない」（型スナップショットで凍結・§6-C）。
//
// このモジュールは**純型＋純関数のみ**（副作用なし・Date/random 不使用・決定的）。cues.ts は M1
// まで実消費されない（レシピ resolve が届いてから ctx.cues を読む）＝既存挙動は不変（additive）。

/** 合図の種類。人が書ける＝保存可（案C裁定2）。`land` は含まない＝land は導出専用（DerivedCue）。 */
export type CueKind = "fill" | "build" | "break";

/** セクションが持つ「薄い合図」。人が書ける＝section ネタ content の additive フィールドに保存可。 */
export interface Cue {
  /** セクション相対の小節番号（0-based）。fill では「フィル本体の開始小節」（§2-3）。 */
  bar: number;
  kind: CueKind;
  /** 0..1（fill の派手さ・build の傾き）。未指定＝各演奏者の既定。 */
  intensity?: number;
  /** 狙いの向き（駆け上がり/下降）。未指定＝演奏者任せ。 */
  aim?: "up" | "down";
}

/** resolve の ctx.cues が受ける型。`land`（＝着地）は**導出専用**＝保存型 Cue には入らない（型で分離）。 */
export type DerivedCue = Cue | { bar: number; kind: "land" };

/**
 * 内側優先の上書き規則（カスケードの実体＝§2-2）。同一 bar は内側(inner)が丸ごと勝つ・bar で dedup・
 * 安定 sort。#169「明示ノブ＞role プリセット＞既定」の1段上版（曲→セクション）。
 * outer は当面実発火しない純規則（曲レイヤーは実装丸ごと後回し）＝規則とテストだけ先に凍結する。
 */
export function mergeCues(outer: DerivedCue[] = [], inner: DerivedCue[] = []): DerivedCue[] {
  const key = (c: DerivedCue) => `${c.bar}`; // 同一小節は内側の合図で丸ごと上書き（kind 違いも同小節なら内側が正）
  const m = new Map<string, DerivedCue>(outer.map((c) => [key(c), c]));
  for (const c of inner) m.set(key(c), c); // 内側優先
  return [...m.values()].sort((a, b) => a.bar - b.bar);
}

/**
 * 曲の並び（sections: 各 {cues, bars}）から、当該セクション(i)の実効 cues を導く（§2-3）。
 * (a) 保存された `kind:"land"` を捨てる（§1-1 の書き込みガード＝読み側1箇所）。
 * (b) 範囲外 `bar >= bars` の cue を無視（フォーム改訂で bars が縮んでも腐らない・データは消さない）。
 * (c) 前セクション最終小節(`bar === prev.bars-1`)の fill があれば、当該セクション bar0 に `land` を導出（越境＝裁定4）。
 * (d) `mergeCues(landed, own)`＝own が内側＝bar0 に自前の合図があればそちらが勝つ。
 * 純関数・決定的（副作用なし）。
 */
export function deriveCues(sections: { cues?: Cue[]; bars: number }[], i: number): DerivedCue[] {
  const clean = (s: { cues?: Cue[]; bars: number }): Cue[] =>
    (s.cues ?? []).filter((c) => (c.kind as string) !== "land" && c.bar < s.bars); // 保存landの無効化＋範囲外cueの無視（§1-1）
  const own = clean(sections[i]!);
  const prev = sections[i - 1];
  // 裁定4：前セクション最終小節(bars-1)に fill ＝越境＝このセクションの bar0 に "land" を導出で差す。
  const landed: DerivedCue[] =
    prev && clean(prev).some((c) => c.kind === "fill" && c.bar === prev.bars - 1)
      ? [{ bar: 0, kind: "land" as const }]
      : [];
  return mergeCues(landed, own); // 自分の合図が内側＝bar0 に自前の合図があればそちらが勝つ
}
