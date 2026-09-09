// コード追従（chord_follow）の5ガード＋層B クオリティ表＝phrase_maker
//   `experiments/bass_rock_riff/chords/{chord_follow,chords_theory}.py` と
//   `experiments/core/chordlib.py:113-171`（層B＝25 クオリティ×スケール）の移植（M3-3b）。
// 正典＝docs/design.md §2106 追補 (k)／計画 docs/drafts/2026-09-09-phrasemaker-port-master-plan.md §5-2 M3。
//
// 何を解いているか：**リズムの骨は 1 つも動かさず、音高だけをコードへ写し直す**。
//   源流 docstring（`chord_follow.py:7-19`）の5ガードをそのまま持ち込む：
//     ①強拍のコードトーン強制＝拍頭（`step%4===0`）とグルーヴ頭（role="head"）の onset は必ずコードトーン。
//     ②非整合の禁止＝コードトーン以外は**そのコードのスケール**に居ること。逃げ道は「次の onset へ半音で解決する
//        接近音」だけ（＝ブルーノートは解決する位置にしか出さない）。
//     ③区間末の接近音化＝各コード区間の最後の自由 onset を、**次の区間のルートへの導音**へ差し替える
//        （発散のあとに解決させるので `resolveApproaches` は最後に呼ぶ）。
//     ④演奏不能の排除＝全ピッチを低域窓へ折り、指板で鳴らせるかを見る（指板は 3e の `verify/fretboard`。
//        ここでは述語として注入する＝この層は指板の実装を知らない）。
//     ⑤リフ崩壊の禁止＝**リズム格子（小節セル）は書き換えない**。写すのは音高だけ。
//
// クオリティ表について（計画 §5-2 M3「otomemo の 34 クオリティと当ててから差分」）：
//   - 層B（`core/chordlib.py:118-171`）は 25 クオリティ。otomemo の `QUALITY_INTERVALS`（34キー・`index.ts:63`）と
//     **重なる 26 キーはコードトーンがバイト一致**（別名 ""≡maj・m≡min・7≡dom7・m7≡min7・mM7≡mMaj7・aug7≡7#5 を含む）。
//     ＝層Bのコードトーン表は otomemo 側に**新しい数値を持ち込まない**。層Bが足すのは**スケール**（整合の物差し）だけ。
//   - otomemo にしか無い 8 キー（`7sus4` `69` `m69` `7#11` `m11` `m13` `maj13` `maj7#11`）には**源流に対応が無い**ので、
//     源流と同じ作り方（教科書モード ∪ そのコードのコードトーン）でスケールをこちらで補った＝**出所は源流ではない**と
//     いう印を `PM_SCALE_ORIGIN` に持つ。層Bにしか無い `power`（ロックリフ語彙＝マイナーペンタ）はそのまま残す。
//   - **`11` は層A/層B とも正としない**（`core/chordlib.py:131`＝`(0,4,7,10,2,5)`＝長3度＋♮11 の衝突。
//     otomemo の `index.ts:98` も同じ）。**ここでは直さない**＝本アーク外（backlog 済み）。同じ数値のまま運ぶ。
//
// **決定的**＝RNG・時刻を使わない（源流も同じ＝計画 §6-1「chord_follow の base line・diverge＝RNG 0件」＝
//   だからデータ一致が主張できる。参照値＝`tools/py-parity/cases-chord-follow/`）。

import { pmClamp, rootLowPitch, type AnchorKind } from "./anchorLock";

// ── 層B＝コードトーン（ルートからの半音）。`core/chordlib.py:118-144` から**そのまま**（数値はバイト一致） ──
export const PM_CHORD_TONES: Readonly<Record<string, readonly number[]>> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  mMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 2],
  m9: [0, 3, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  "11": [0, 4, 7, 10, 2, 5], // ⚠ 層A/B とも正としない（長3度＋♮11）＝本アーク外・直さない
  "13": [0, 4, 7, 10, 2, 9],
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "7#5": [0, 4, 8, 10],
  "7b5": [0, 4, 6, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 2],
  power: [0, 7],
};

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

/** 源流 `chords_theory._snap_to_set`（`:109-111`）＝最も近い許容半音・同点は低い方。 */
export function snapToSet(deg: number, allowed: ReadonlySet<number>): number {
  let best: number | null = null;
  for (const a of [...allowed].sort((x, y) => x - y)) {
    if (best === null) { best = a; continue; }
    const da = Math.abs(a - deg), db = Math.abs(best - deg);
    if (da < db || (da === db && a < best)) best = a;
  }
  return best ?? 0;
}

/**
 * 源流 `chords_theory.remap_deg`（`:250-289`）＝リフ語彙の度数を**そのコードに合う度数**へ。
 * 輪郭は保ちつつ、頭（強拍/グルーヴ頭）は必ずコードトーン・弱拍はスケール内へ着地する。
 * 5度族（P5/P4/blue b5）は**そのコードの実際の5度**へ流す＝aug(#5)/dim(b5)/7b5/7#5 で♮5がぶつからない。
 */
export function remapDeg(deg: number, ch: CfChord, isStrong: boolean): number {
  const scale = scaleOffsets(ch.quality, ch.tones);
  const fifth = fifthSemitone(ch);
  if (deg === 0 || deg === 12) return deg;                       // ルート/オクターブ＝普遍
  if (deg === 7) return fifth;                                   // P5 → 実際の5度
  if (deg === 3) return hasThird(ch) ? thirdSemitone(ch) : fifth; // 「3度」の答句音
  if (deg === 5) {                                               // P4
    if (isStrong) return fifth;
    return scale.has(5) ? 5 : snapToSet(5, scale);
  }
  if (deg === 6) {                                               // blue b5
    if (isStrong) return fifth;
    return scale.has(6) ? 6 : snapToSet(6, scale);
  }
  if (deg === 10) {                                              // b7
    if (isStrong) {
      if (hasTone(ch, 10)) return 10;
      const sev = seventhSemitone(ch);
      return sev ?? 12;
    }
    return scale.has(10) ? 10 : snapToSet(10, scale);
  }
  if (deg === 1) return 0;                                       // ギャロップの導音
  const d = norm12(deg);
  return scale.has(d) ? d : snapToSet(d, scale);
}

/** 源流 `chord_follow._nearest_chord_tone`（`:98-106`）＝強拍の安全網。同点は低い方。 */
export function nearestChordTone(pitch: number, ch: CfChord, lo: number, hi: number): number {
  const rootLow = rootLowPitch(ch.rootPc, lo);
  const cands: number[] = [];
  for (const t of ch.tones) for (const oc of [-12, 0, 12]) cands.push(pmClamp(rootLow + t + oc, lo, hi));
  let best = cands[0]!;
  for (const c of cands) {
    const dc = Math.abs(c - pitch), db = Math.abs(best - pitch);
    if (dc < db || (dc === db && c < best)) best = c;
  }
  return best;
}

/** 演奏可能かの述語（④）。既定＝窓に入っているか。指板の実物は 3e（`verify/fretboard`）を注入する。 */
export type PlayablePredicate = (pitch: number) => boolean;

export interface CfWindow {
  /** 低域窓（源流 REG_LO/REG_HI＝28/59・otomemo は BASS_LO/BASS_HI＝33/48） */
  readonly lo: number;
  readonly hi: number;
  /** 演奏可能域（源流 LOW_LIMIT/HIGH_LIMIT＝4弦ベースの 28..60）。既定は窓と同じ。 */
  readonly lowLimit?: number;
  readonly highLimit?: number;
  readonly playable?: PlayablePredicate;
}

const isPlayableIn = (w: CfWindow, p: number): boolean => {
  const lo = w.lowLimit ?? w.lo, hi = w.highLimit ?? w.hi;
  if (p < lo || p > hi) return false;
  return w.playable ? w.playable(p) : true;
};

/**
 * 源流 `chord_follow._approach_pitch`（`:158-181`）＝**次に実際に鳴る音**へ解決する導音を選ぶ。
 * 半音（真の導音）を全音より優先し、同格なら直前の音に近い方。結果は必ず target の ±2 以内＝必ず解決する（INV2）。
 */
export function approachPitch(prevPitch: number, targetPitch: number, w: CfWindow): number {
  const scored: [number, number, number][] = [];
  for (const delta of [-1, 1, -2, 2]) {
    const c2 = pmClamp(targetPitch + delta, w.lo, w.hi);
    if (!isPlayableIn(w, c2)) continue;
    const d = Math.abs(c2 - targetPitch);
    if (d === 0 || d > 2) continue;                 // _clamp がオクターブ折りした＝棄却
    scored.push([d === 1 ? 0 : 1, Math.abs(c2 - prevPitch), c2]);
  }
  if (scored.length === 0) {
    for (const delta of [1, -1, 2, -2]) {
      const c2 = pmClamp(targetPitch + delta, w.lo, w.hi);
      const d = Math.abs(c2 - targetPitch);
      if (isPlayableIn(w, c2) && d > 0 && d <= 2) return c2;
    }
    return pmClamp(targetPitch, w.lo, w.hi);
  }
  scored.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]));
  return scored[0]![2];
}

// ── 骨（リズム格子）＝⑤「リフは書き換えない」の対象 ────────────────────────
/** 文法セルの1オンセット（源流 `riff.py` の (step, kind, deg, anchor, role)）。 */
export interface CfCell {
  readonly step: number; // 小節内 0..15
  readonly kind: AnchorKind;
  readonly deg: number;  // リフ語彙の度数（半音・ルート基準）
  readonly anchor: boolean;
  readonly role: string;
}

/** コード区間（源流 `chord_follow.Segment`）。 */
export interface CfSeg {
  readonly chord: CfChord;
  readonly startStep: number;
  readonly lengthSteps: number;
}

export interface CfOnset {
  step: number;
  bar: number;
  kind: AnchorKind;
  anchor: boolean;
  role: string;
  deg: number;
  strong: boolean;
  /** その onset が属するコード区間の添字（源流は Segment の id で束ねている） */
  segIndex: number;
}

/** 源流 `chord_follow.STEPS_PER_BAR`（16分格子の1小節）。名前は他所と衝突しないよう接頭辞つき。 */
export const CF_STEPS_PER_BAR = 16;

/** 源流 `chord_follow.chord_at`（`:73-78`）＝step 粒度でコードを読む。 */
export function cfChordAt(segs: readonly CfSeg[], step: number): { seg: CfSeg; index: number } {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.startStep <= step && step < s.startStep + s.lengthSteps) return { seg: s, index: i };
  }
  return { seg: segs[segs.length - 1]!, index: segs.length - 1 };
}

/**
 * 源流 `chord_follow.build_line`（`:110-146`）＝文法の**リズム格子はそのまま**に、音高だけを進行へ写す。
 * `cells` は1小節ぶんのセル列の配列（源流 `_bar_cells` は2小節文法を2つの1小節セルへ割る）。
 * 戻り値の `pitches[i]` が knob=0 の具体ピッチ（源流 `base`）。
 */
export function buildChordFollowLine(
  cells: readonly (readonly CfCell[])[], segs: readonly CfSeg[], totalSteps: number, w: CfWindow,
): { onsets: CfOnset[]; pitches: number[] } {
  const nBars = Math.floor(totalSteps / CF_STEPS_PER_BAR);
  const onsets: CfOnset[] = [];
  const pitches: number[] = [];
  for (let bar = 0; bar < nBars; bar++) {
    const cell = cells[bar % cells.length] ?? [];
    for (const c of cell) {
      const gstep = bar * CF_STEPS_PER_BAR + c.step;
      const { seg, index } = cfChordAt(segs, gstep);
      const ch = seg.chord;
      const strong = gstep % 4 === 0;
      // 「頭」＝拍頭 or グルーヴ頭。**小節末の導音アンカー（climb/pickup）は接近音であって着地ではない＝除外**。
      const head = strong || c.role === "head";
      const rDeg = remapDeg(c.deg, ch, head);
      let pitch = pmClamp(rootLowPitch(ch.rootPc, w.lo) + rDeg, w.lo, w.hi);
      if (head && !chordTonePcs(ch).has(norm12(pitch))) pitch = nearestChordTone(pitch, ch, w.lo, w.hi); // ①
      onsets.push({ step: gstep, bar, kind: c.kind, anchor: c.anchor, role: c.role, deg: c.deg, strong, segIndex: index });
      pitches.push(pitch);
    }
  }
  return { onsets, pitches };
}

/**
 * 源流 `chord_follow.resolve_approaches`（`:218-232`）＝接近音のピッチを「実際に次に鳴る音」への導音にする。
 * **発散のあとに呼ぶ**（源流の注記）。`pitches` は破壊的に書き換える（源流と同じ）。
 */
export function resolveApproaches(
  pitches: number[], approaches: readonly number[], w: CfWindow, loop = true,
): void {
  const n = pitches.length;
  for (const a of approaches) {
    let target: number;
    if (loop) target = pitches[(a + 1) % n]!;
    else { if (a + 1 >= n) continue; target = pitches[a + 1]!; }
    const prev = a > 0 ? pitches[a - 1]! : pitches[a]!;
    pitches[a] = approachPitch(prev, target, w);
  }
}

/**
 * 源流 `chord_follow.apply_boundaries`（`:184-215`）＝③各コード区間の**最後の自由 onset**を接近音にする。
 * 強拍/グルーヴ頭で終わる区間は「コードトーンで終わっている」＝宙ぶらりんの非和声音が無いので飛ばす。
 * 戻り値＝接近音になった onset の添字（被覆率の分子）。
 */
export function applyBoundaries(
  onsets: CfOnset[], pitches: number[], segs: readonly CfSeg[], w: CfWindow, loop = true,
): number[] {
  const regionOf = new Map<number, number[]>();
  onsets.forEach((o, oi) => {
    const list = regionOf.get(o.segIndex);
    if (list) list.push(oi); else regionOf.set(o.segIndex, [oi]);
  });
  const approaches: number[] = [];
  for (let si = 0; si < segs.length; si++) {
    const members = regionOf.get(si);
    if (!members || members.length === 0) continue;
    let last = members[0]!;
    for (const oi of members) if (onsets[oi]!.step > onsets[last]!.step) last = oi; // 源流 max(key=step)＝同値は先勝ち
    const o = onsets[last]!;
    if (o.strong || o.role === "head") continue;
    o.role = "approach";
    approaches.push(last);
  }
  if (approaches.length > 0) resolveApproaches(pitches, approaches, w, loop);
  return approaches;
}

// ── 検証（源流 `chord_follow.validate`（`:285-338`）＝POC-SPEC の破れを測る） ───────────
export interface CfMetrics {
  /** ①強拍/頭のコードトーン着地 */
  readonly strongTotal: number;
  readonly strongHit: number;
  readonly strongRate: number;
  /** ②解決しない非整合音（**0 が要件**） */
  readonly nonInteg: readonly { i: number; pitch: number }[];
  /** 解決する半音経過音（非整合ではない＝説明のつく色） */
  readonly passing: readonly { i: number; pitch: number }[];
  /** ④演奏不能 */
  readonly unplayable: readonly { i: number; pitch: number }[];
  /** ③区間末の接近音が実際に ±2 で解決したか */
  readonly boundaryTotal: number;
  readonly boundaryOk: number;
}

/** 源流 `validate` の移植（指板コストは 3e＝`verify/fretboard` に分離）。**検算側は生成の表を持たない**
 *  （§6-4 #2）＝コードは引数で受け取り、スケール判定はこの表からしか引かない。 */
export function validateChordFollow(
  onsets: readonly CfOnset[], pitches: readonly number[], segs: readonly CfSeg[], w: CfWindow, loop = true,
): CfMetrics {
  const n = pitches.length;
  let strongTotal = 0, strongHit = 0, boundaryTotal = 0, boundaryOk = 0;
  const nonInteg: { i: number; pitch: number }[] = [];
  const passing: { i: number; pitch: number }[] = [];
  const unplayable: { i: number; pitch: number }[] = [];
  for (let i = 0; i < n; i++) {
    const p = pitches[i]!;
    const o = onsets[i]!;
    const ch = segs[o.segIndex]!.chord;
    const pc = norm12(p);
    const nxt = loop ? pitches[(i + 1) % n]! : (i + 1 < n ? pitches[i + 1]! : null);
    if (o.strong || o.role === "head") {
      strongTotal++;
      if (chordTonePcs(ch).has(pc)) strongHit++;
    }
    if (chordScalePcs(ch).has(pc)) { /* 整合＝何もしない */ }
    else if (nxt !== null && Math.abs(p - nxt) === 1) passing.push({ i, pitch: p });
    else nonInteg.push({ i, pitch: p });
    if (o.role === "approach") {
      boundaryTotal++;
      if (nxt !== null && Math.abs(p - nxt) <= 2) boundaryOk++;
    }
    if (!isPlayableIn(w, p)) unplayable.push({ i, pitch: p });
  }
  return {
    strongTotal, strongHit, strongRate: strongTotal > 0 ? Math.round((strongHit / strongTotal) * 1e4) / 1e4 : 1,
    nonInteg, passing, unplayable, boundaryTotal, boundaryOk,
  };
}

// ── 生成側の口（otomemo の既に鳴っている列へ5ガードを当てる） ───────────────────
/** 既に実音化された1オンセット（生成器が作った線）。`head` は「必ずコードトーンで居るべき音」。 */
export interface CfLineOnset {
  readonly step: number;
  readonly pitch: number;
  readonly strong: boolean;
  readonly head: boolean;
  /** 錨（anchorLock が置いたルート）＝**触らない**（構造的契約が勝つ） */
  readonly anchor?: boolean;
}

export interface CfReport {
  /** ①頭の総数／写し直した数 */
  readonly heads: number;
  readonly headsFixed: number;
  /** ②弱拍の総数／スケールへ寄せ直した数 */
  readonly weak: number;
  readonly weakFixed: number;
  /** ③接近音にした区間末の数／候補になり得た区間数 */
  readonly boundaries: number;
  readonly regions: number;
  /** 錨ゆえ触らなかった数 */
  readonly skippedAnchor: number;
  /** ガードが実際に働いた onset 数／総数（＝被覆率の分子・分母） */
  readonly applied: number;
  readonly total: number;
}

/**
 * **生成側の適用**＝リズムは1つも動かさず（⑤）、音高だけを写し直す。
 *
 * 源流との意図的な差（1点・理由つき）：源流は `_clamp(root_low + deg)` で音高を作り直すので
 * **レジスタが毎回 root_low 側へ潰れる**（源流の窓は 28..59＝31半音あるので輪郭が残る）。otomemo の窓は
 * `[33,48]`＝15半音しかなく、そのまま潰すと anchorLock の体（オクターブ往復）が死ぬ＝
 * 「オクターブ選択を帯の下限で決めない」（design 追補 (k)・`f2c3241` の −11半音の教訓）に反する。
 * よってここでは **pc は源流どおり remap し、オクターブだけ元のピッチに最も近いものを選ぶ**（同点は低い方＝
 * anchorLock (b) と同じタイブレーク）。pc の決め方＝源流と同一。
 */
export function applyChordFollow(
  line: readonly CfLineOnset[], segs: readonly CfSeg[], w: CfWindow, loop = false,
): { pitches: number[]; approaches: number[]; report: CfReport } {
  const pitches = line.map((o) => o.pitch);
  let heads = 0, headsFixed = 0, weak = 0, weakFixed = 0, skippedAnchor = 0, applied = 0;

  // pc を保ったままレジスタを元のピッチへ寄せる（上の注記）。
  const placeNear = (pc: number, near: number): number => {
    const base = pmClamp(rootLowPitch(pc, w.lo), w.lo, w.hi);
    let best = base;
    for (const oc of [0, 12, -12]) {
      const c = pmClamp(base + oc, w.lo, w.hi);
      const dc = Math.abs(c - near), db = Math.abs(best - near);
      if (dc < db || (dc === db && c < best)) best = c;
    }
    return best;
  };

  for (let i = 0; i < line.length; i++) {
    const o = line[i]!;
    const ch = cfChordAt(segs, o.step).seg.chord;
    if (o.anchor === true) { skippedAnchor++; continue; }         // 錨は構造的契約＝写し直さない
    const rootLow = rootLowPitch(ch.rootPc, w.lo);
    const deg = norm12(o.pitch - rootLow);
    const remapped = remapDeg(deg, ch, o.head);
    const target = norm12(ch.rootPc + remapped);
    let np = placeNear(target, o.pitch);
    if (o.head) {
      heads++;
      if (!chordTonePcs(ch).has(norm12(np))) { np = nearestChordTone(np, ch, w.lo, w.hi); }        // ①安全網
      if (np !== o.pitch) { headsFixed++; applied++; }
    } else {
      weak++;
      if (!chordScalePcs(ch).has(norm12(np))) { np = placeNear(norm12(ch.rootPc + snapToSet(deg, scaleOffsets(ch.quality, ch.tones))), o.pitch); } // ②
      if (np !== o.pitch) { weakFixed++; applied++; }
    }
    pitches[i] = Math.max(w.lo, Math.min(w.hi, np));               // ④窓の中に居ること
  }

  // ③区間末の自由 onset を次区間ルートへの導音に（錨・頭・強拍は対象外＝コードトーンで終わっている）。
  const lastOf = new Map<number, number>();
  const regionSeen = new Set<number>();
  for (let i = 0; i < line.length; i++) {
    const { index } = cfChordAt(segs, line[i]!.step);
    regionSeen.add(index);
    lastOf.set(index, i);
  }
  const approaches: number[] = [];
  for (const [, i] of [...lastOf.entries()].sort((a, b) => a[0] - b[0])) {
    const o = line[i]!;
    if (o.strong || o.head || o.anchor === true) continue;
    approaches.push(i);
  }
  if (approaches.length > 0) { resolveApproaches(pitches, approaches, w, loop); applied += approaches.length; }

  return {
    pitches, approaches,
    report: {
      heads, headsFixed, weak, weakFixed, boundaries: approaches.length, regions: regionSeen.size,
      skippedAnchor, applied, total: line.length,
    },
  };
}
