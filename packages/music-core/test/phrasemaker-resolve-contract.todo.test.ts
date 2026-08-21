import { describe, it } from "vitest";

// M0 契約 §6 ①〜⑥ のうち **resolve 実体が要る**契約テストの保留枠（S0 は型と規則の凍結まで＝
// resolve は M1 で実装）。ここで実 import すると未実装でビルドが壊れるため it.todo で骨子だけ置く。
// resolve 到着時（M1）にアサーションへ昇格する。resolve 非依存の凍結（ソルト表・Cue 型・merge/derive）
// は cues.test.ts / rng-salt.test.ts で**緑**として既に固定済み。
//
// 署名（M0 §3）：resolve(recipe, ctx) -> { notes, skeleton, groove }
//   ctx = { meter, tempo, bars, key?, chords?, sectionRole?, slashBass?, cues?: DerivedCue[] }

describe("M0 契約：resolve 実体依存（M1 で緑化）", () => {
  // ②スキーマ round-trip（未知フィールド保持・v additive・bone 省略可）。
  //   骨子：Recipe を parse→serialize で未知キーが保持され、bone 省略でも「おまかせ骨」で解決できる。
  it.todo("② Recipe スキーマ round-trip（未知フィールド保持・bone 省略可）");

  // ③resolve 決定性：同一 (recipe, ctx, engineVersion) → 同一 notes/skeleton/groove。
  //   骨子：seed・tempo に加え **cues も固定条件**に含めて 2 回 resolve し deepStrictEqual。
  it.todo("③ resolve 決定性（cues を含む固定 ctx で 2 回一致）");

  // ④notes/skeleton がストレート（グルーヴ非適用＝格子位置と一致）。
  //   骨子：resolve 出力の start が cellsPerBar 格子上に乗る（feel 未適用）。
  it.todo("④ notes/skeleton はストレート（feel 非適用）");

  // ⑤recipe 未指定の既存 rhythm ネタ＝従来出力と bit 一致（回帰の器）。
  //   骨子：cues 未指定を「frame.section 自体なし」「section は在るが cues 不在」の両方で回し
  //         従来 genDrums/genBass と deepStrictEqual（undefined 取り回しで音が動かない機械確認）。
  it.todo("⑤ cues 未指定＝従来出力と bit 一致（section なし／cues 不在の両方）");

  // ⑥グルーヴ適用は feel 層の一箇所のみ（二重掛けが無い＝適用前後の差分が groove プロファイルと一致）。
  it.todo("⑥ グルーヴ二重掛け禁止（適用は feel 層一箇所）");

  // ⑦（resolve 依存分）cue 応答の演奏者側契約。
  //   骨子：未知 kind（"kime"）入り ctx ＝現行出力と bit 一致／respondToCues=false＝cues 入りでも
  //         cues なしと同一出力／cue があっても bone.cells は全て出力に literal に残る（骨保存）。
  //   ※ 保存 land・範囲外 cue が deriveCues で捨てられること、Cue 型スナップショット凍結は
  //     resolve 非依存ゆえ cues.test.ts で**緑**として済み（ここでは重複させない）。
  it.todo("⑦ 未知 kind 無視／respondToCues=false 同一出力／骨 literal 保存（resolve 依存分）");

  // §6-A（演奏者ゴールデン）：固定 ctx（cue fill@bar2, intensity 0.7）→ genDrums が bar2 に F 型・
  //   他小節は base 型不変・bar3 頭に着地／genBass が bar2 を fill セル差替・他不変。
  it.todo("§6-A 演奏者ゴールデン（cue fill@bar2 → drums/bass の位置差替）");

  // §6-B（配布の1枚性）：/gen/section が drums/bass（将来 melody/comp）へ**同一の cues 配列**を配る。
  it.todo("§6-B 配布の1枚性（全生成器へ同一 cues）");
});
