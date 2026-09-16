// コードのスケール表と低域の畳み＝ウォーキングベース JZ-WALK（walkingBass.ts）が使う部品。
// 出所＝phrase_maker `experiments/core/chordlib.py:118-171`（層B＝クオリティ×教科書スケール）と
//   `bass_rock_riff/chords/chords_theory.py`（Chord の3度/5度/7度）・`chord_follow._clamp`・`theory.root_low`。
//
// 経緯（2026-09-16 リフ撤去・docs/design.md 追補 (k) の撤去記録）：もとは chordFollow.ts（コード追従の5ガード）と
//   anchorLock.ts（錨と間の分業）に同居していた。両経路を外したとき、**JZ-WALK が import していた表と関数だけ**を
//   本ファイルへ**文字どおり移した**（数値・分岐とも変更なし＝JZ-WALK の出力は撤去前と一致を実測）。
//   層B の表が源流と一致することの検算＝test/chord-scale.test.ts（撤去前の py-parity 参照値から抜いた fixture）。
//
// クオリティ表について：
//   - 層B は 25 クオリティ。otomemo の `QUALITY_INTERVALS`（34キー）と重なるキーはコードトーンがバイト一致＝
//     コードトーンは**呼び手が otomemo の QUALITY_INTERVALS を渡す**（表を二重に持たない）。層Bが足すのはスケールだけ。
//   - otomemo にしか無い 8 キー（`7sus4` `69` `m69` `7#11` `m11` `m13` `maj13` `maj7#11`）は源流と同じ作り方で
//     こちらで補った＝出所の印は `scaleOrigin()`。
//   - **`11` は層A/層B とも正としない**（長3度＋♮11 の衝突・backlog 済み）。同じ数値のまま運ぶ。
// **決定的**＝RNG・時刻を使わない。

/** 源流 `chord_follow._clamp`（`:90-95`）＝上限から先に折る・最後の clamp は無し。窓幅 >= 11 半音なら必ず窓内に収まる。 */
export function pmClamp(pitch: number, lo: number, hi: number): number {
  let p = pitch;
  while (p > hi) p -= 12;
  while (p < lo) p += 12;
  return p;
}

/** 源流 `theory.root_low`（`:28-33`）の一般形＝pc を窓の最下オクターブへ。
 *  源流は `REG_LO + ((pc - E_PC) % 12)`（REG_LO=28・E_PC=4＝28%12）＝`lo + ((pc - lo) mod 12)` と同型。
 *  otomemo の `bassPcToWindow`（BASS_LO=33）も同じ式＝**帯だけ違う同じ規則**。 */
export function rootLowPitch(rootPc: number, lo: number): number {
  return lo + ((((rootPc % 12) - lo) % 12) + 12) % 12;
}

// ── 教科書モード（`core/chordlib.py:146-171`＝CT の stress 硬化を引き継いだもの） ──
//   m6→DORIAN（♮6 はそのコード自身の6度）／7b5・7#5・aug→WHOLE TONE（♮5 の衝突を作らない）／
//   power→マイナーペンタ（ロックリフ語彙）／**ブルーノートの無条件 union はどこにも無い**。
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATMIN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HARMMIN = [0, 2, 3, 5, 7, 8, 11];
const MIXO = [0, 2, 4, 5, 7, 9, 10];
const WHOLE = [0, 2, 4, 6, 8, 10];
const OCT_WH = [0, 2, 3, 5, 6, 8, 9, 11];
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10];
const PENTA_MIN = [0, 3, 5, 7, 10];
// ↓ここから下の2つは**源流に無い**＝otomemo にしか無いクオリティのために足したモード（印は PM_SCALE_ORIGIN）。
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const LYD_DOM = [0, 2, 4, 6, 7, 9, 10]; // リディアン7th（7#11 の教科書スケール）

const PM_MODE: Readonly<Record<string, readonly number[]>> = {
  maj: MAJOR, "6": MAJOR, add9: MAJOR, sus2: MAJOR, sus4: MAJOR, maj7: MAJOR, maj9: MAJOR,
  min: NATMIN, min7: NATMIN, m9: NATMIN,
  m6: DORIAN,
  mMaj7: HARMMIN,
  dom7: MIXO, "9": MIXO, "11": MIXO, "13": MIXO,
  "7b9": [...MIXO, 1], "7#9": [...MIXO, 3],
  "7#5": WHOLE, "7b5": WHOLE,
  aug: WHOLE,
  dim: OCT_WH, dim7: OCT_WH,
  m7b5: LOCRIAN,
  power: PENTA_MIN,
};

// ── otomemo の 34 クオリティ（`index.ts:63 QUALITY_INTERVALS`）→ 層B の名前 ──
//   値が null＝層Bに対応が無い（＝スケールをこちらで補った）。**コードトーンは常に otomemo 側の
//   `QUALITY_INTERVALS` を正**とする（この表は「どのスケールで整合を測るか」だけを決める）。
export const PM_QUALITY_ALIAS: Readonly<Record<string, string | null>> = {
  "": "maj", maj: "maj", m: "min", min: "min", dim: "dim", aug: "aug", sus4: "sus4", sus2: "sus2",
  "7": "dom7", maj7: "maj7", m7: "min7", m7b5: "m7b5", dim7: "dim7", aug7: "7#5", "7b5": "7b5",
  mM7: "mMaj7", "6": "6", m6: "m6", "9": "9", maj9: "maj9", m9: "m9", add9: "add9",
  "7b9": "7b9", "7#9": "7#9", "13": "13", "11": "11",
  // ↓ 差分＝層Bに対応が無い8キー（otomemo 固有）。モードは源流と同じ作り方でこちらが補った。
  "7sus4": null, "69": null, m69: null, "7#11": null, m11: null, m13: null, maj13: null, "maj7#11": null,
};

/** 層Bに対応が無いクオリティのために**こちらで補った**モード（＝源流の権威を借りない印）。 */
const PM_EXTRA_MODE: Readonly<Record<string, readonly number[]>> = {
  "7sus4": MIXO,      // ドミナント族（4度はコード自身の sus）
  "69": MAJOR,
  m69: DORIAN,        // ♮6 を持つマイナー＝m6 と同じ扱い
  "7#11": LYD_DOM,
  m11: NATMIN,        // min7/m9 と同じ
  m13: DORIAN,        // ♮6(=13) を持つ
  maj13: MAJOR,
  "maj7#11": LYDIAN,
};

/** そのクオリティのスケールが源流由来か、こちらで補ったか（§6-4 #11「数値の出所を引く」）。 */
export function scaleOrigin(quality: string): "phrase_maker-layerB" | "otomemo-derived" | "fallback" {
  if (PM_MODE[quality]) return "phrase_maker-layerB";            // 源流の名前（dom7/min7/power…）で直接引けた
  const alias = PM_QUALITY_ALIAS[quality];
  if (alias && PM_MODE[alias]) return "phrase_maker-layerB";     // otomemo の名前 → 層Bの名前
  if (PM_EXTRA_MODE[quality]) return "otomemo-derived";          // 層Bに対応が無い8キー
  return "fallback"; // 未知のクオリティ＝メジャー扱い（源流 parse_chord の bare letter と同じ逃げ）
}
export const PM_SCALE_ORIGIN = "phrase_maker experiments/core/chordlib.py:118-171 (層B・CT から verbatim)";

/** コード＝絶対ルート pc ＋ クオリティ（＋分数低音）。源流 `chords_theory.Chord` の最小形。 */
export interface CfChord {
  readonly rootPc: number;
  readonly quality: string;
  /** 分数コードの低音 pc（源流 `Chord.bass_pc`＝コードトーン集合に足される追加の錨） */
  readonly bassPc?: number | null;
  /** コードトーン（ルートからの半音）。**呼び手が otomemo の `QUALITY_INTERVALS` を渡す**＝表を二重に持たない。 */
  readonly tones: readonly number[];
}

const norm12 = (x: number): number => ((Math.trunc(x) % 12) + 12) % 12;

/** そのクオリティのスケール（ルートからの半音・0..11）＝モード ∪ コードトーン（源流 `SCALE[q] = _MODE[q] | CHORD_TONES[q]`）。 */
export function scaleOffsets(quality: string, tones: readonly number[]): ReadonlySet<number> {
  // 引く順＝①源流の名前でそのまま（dom7/min7/power…＝py-parity の入力はこの名前で来る）
  //   ②otomemo の名前を層Bの名前へ写して ③層Bに無い8キーはこちらで補った表 ④未知はメジャー。
  const alias = PM_QUALITY_ALIAS[quality];
  const mode = PM_MODE[quality] ?? (alias ? PM_MODE[alias] : undefined) ?? PM_EXTRA_MODE[quality] ?? MAJOR;
  const s = new Set<number>();
  for (const m of mode) s.add(norm12(m));
  for (const t of tones) s.add(norm12(t));
  return s;
}

/** コードトーンの pc 集合（分数低音を含む＝源流 `Chord.chord_tone_pcs`）。 */
export function chordTonePcs(ch: CfChord): ReadonlySet<number> {
  const s = new Set<number>();
  for (const t of ch.tones) s.add(norm12(ch.rootPc + t));
  if (ch.bassPc != null) s.add(norm12(ch.bassPc));
  return s;
}

/** そのコードの整合スケール pc 集合（源流 `Chord.scale_pcs`＝スケール ∪ コードトーン）。
 *  名前が `chordScalePcs` なのは、api/web が既に別物の `scalePcs`（調のスケール）を持っているから
 *  （M4 の二重実装の番人が名前の衝突を落とす＝`verify-shared-single-impl`）。 */
export function chordScalePcs(ch: CfChord): ReadonlySet<number> {
  const offs = scaleOffsets(ch.quality, ch.tones);
  const s = new Set<number>();
  for (const m of offs) s.add(norm12(ch.rootPc + m));
  for (const pc of chordTonePcs(ch)) s.add(pc);
  return s;
}

const hasTone = (ch: CfChord, t: number): boolean => ch.tones.some((x) => norm12(x) === norm12(t));

/** 源流 `Chord.third_semitone`（3度が無ければ5度で代用）。 */
export function thirdSemitone(ch: CfChord): number {
  for (const t of [3, 4]) if (hasTone(ch, t)) return t;
  return 7;
}
/** 源流 `Chord.fifth_semitone`（b5/♮5/#5 の**実際の**5度）。 */
export function fifthSemitone(ch: CfChord): number {
  for (const t of [6, 7, 8]) if (hasTone(ch, t)) return t;
  return 7;
}
/** 源流 `Chord.seventh_semitone`（6th/b7/♮7・無ければ null）。 */
export function seventhSemitone(ch: CfChord): number | null {
  for (const t of [9, 10, 11]) if (hasTone(ch, t)) return t;
  return null;
}
/** 源流 `Chord.has_third`（power/sus は3度を持たない）。**クオリティ名ではなくコードトーンで判定**＝
 *  otomemo の 34 キーでもそのまま効く（源流は名前で判定していた＝そこだけ一般化した）。 */
export function hasThird(ch: CfChord): boolean {
  return hasTone(ch, 3) || hasTone(ch, 4);
}
