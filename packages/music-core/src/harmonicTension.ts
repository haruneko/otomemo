// 和声張力カーブレンズ（WP-C4・2026-07-14）＝TIS（Tonal Interval Space）ベースの純TS実装。
// 正典＝docs/research/2026-07-14-harmonic-tension-curve.md。思想（絶対）：カーブは「審判」でなく
// 「山場をどこに置くかを見る設計レンズ」＝候補を弾かず・単一正解を出さず・役割別の目標帯に沿うかを見る。
// 全て純関数・記号（度数＋品質＋key）のみ＝音源不要。木構造(prolongational h)は既定 off（重い＝プロノブ）。
//
// 実装の要点（研究doc §2・§5）：
//  1. コード/キーの pc集合 → 12次元クロマ → 離散フーリエ変換(DFT)の低次6係数 → TIV（6次元複素）。
//  2. 各次元に知覚的重み（dyad協和度の実測評定＝Bernardes TIS 標準重み [3,8,11.5,15,14.5,7.5]）。
//  3. 距離＝ユークリッド μ（進行の跳躍・声部進行）／角度 θ（キー/機能への整列）。
//  4. 不協和 c ＝ 正規化 TIV ノルムの「中心からの遠さ」＝ 1 − ‖T_norm‖/M（単一pc=0=最協和 → 全12pc=1=最不協和。
//     研究 §2.2 の向き（単一pc最小・全12pc最大）と §4.1（音を足すほど不協和が上がる）を両立する定義）。
//  5. 合成重み初期値（研究 §5.3・木なし再正規化）：不協和0.45／調距離0.30／進行跳躍+表面0.25。**暫定＝耳較正で更新**。
//  6. モーダルループ（機能希薄・循環）検出でレンズ自動降格（score=null＝並べ替え対象外・警告文言／研究 §6-3）。

// ── 定数 ─────────────────────────────────────────────────────────────────────
// Bernardes TIS のクロマ→TIV 重み（k=1..6・dyad協和度の実測評定に由来）。研究 §2.1。
export const TIV_WEIGHTS = [3, 8, 11.5, 15, 14.5, 7.5] as const;
// 単一pc（最協和）の正規化 TIV ノルム＝中心からの最大半径 M＝sqrt(Σ w_k^2)。dissonance の分母。
const TIV_MAX_NORM = Math.sqrt(TIV_WEIGHTS.reduce((a, w) => a + w * w, 0));
// 合成重み初期値（研究 §5.3）。d1(進行跳躍) と ss(表面張力) で声部進行 0.25 を分担。
export const TENSION_WEIGHTS = { c: 0.45, d2: 0.3, d1: 0.18, ss: 0.07 } as const;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

// ── TIV（Tonal Interval Vector）＝クロマの低次6次複素DFT × 知覚重み ────────────────
/** 6次元複素TIV（k=1..6）。re[k],im[k] の12実数として距離/角度を計算する。 */
export interface TIV {
  re: number[]; // length 6
  im: number[]; // length 6
}

/** pc集合(0-11) → 12次元クロマ（0/1）。重複pcは1に畳む（集合）。 */
export function chromaVector(pcs: number[]): number[] {
  const c = new Array(12).fill(0);
  for (const p of pcs) {
    const n = ((Math.trunc(p) % 12) + 12) % 12;
    c[n] = 1;
  }
  return c;
}

/** クロマ → 正規化TIV。DFT 低次6係数（k=1..6）に重みを掛け、pc数で割って正規化（voicing/重複に不変）。
 *  空集合＝原点（全0）。単一pc＝‖T‖=M（最協和・中心から最遠＝TIS空間の縁）。 */
export function tivOfPcs(pcs: number[]): TIV {
  const c = chromaVector(pcs);
  const count = c.reduce((a, v) => a + v, 0);
  const re = new Array(6).fill(0);
  const im = new Array(6).fill(0);
  if (count === 0) return { re, im };
  for (let k = 1; k <= 6; k++) {
    let sr = 0;
    let si = 0;
    for (let n = 0; n < 12; n++) {
      if (!c[n]) continue;
      const ang = (-2 * Math.PI * k * n) / 12;
      sr += Math.cos(ang);
      si += Math.sin(ang);
    }
    const w = TIV_WEIGHTS[k - 1]!;
    re[k - 1] = (w * sr) / count;
    im[k - 1] = (w * si) / count;
  }
  return { re, im };
}

/** TIV のユークリッドノルム（中心＝原点からの距離）。 */
export function tivNorm(t: TIV): number {
  let s = 0;
  for (let k = 0; k < 6; k++) s += t.re[k]! * t.re[k]! + t.im[k]! * t.im[k]!;
  return Math.sqrt(s);
}

/** 2つのTIV間ユークリッド距離 μ（進行の跳躍・声部進行の代理）。研究 §2.2。 */
export function tivDistance(a: TIV, b: TIV): number {
  let s = 0;
  for (let k = 0; k < 6; k++) {
    const dr = a.re[k]! - b.re[k]!;
    const di = a.im[k]! - b.im[k]!;
    s += dr * dr + di * di;
  }
  return Math.sqrt(s);
}

/** 2つのTIVの角度距離 θ∈[0,π]（キー/機能への整列＝帰属の遠さ）。研究 §2.2。原点を含む時は π（無相関扱い）。 */
export function tivAngle(a: TIV, b: TIV): number {
  const na = tivNorm(a);
  const nb = tivNorm(b);
  if (na < 1e-9 || nb < 1e-9) return Math.PI;
  let dot = 0;
  for (let k = 0; k < 6; k++) dot += a.re[k]! * b.re[k]! + a.im[k]! * b.im[k]!;
  const cos = clamp01n(dot / (na * nb));
  return Math.acos(cos);
}
const clamp01n = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** 和音自体の不協和 c∈[0,1]＝中心からの遠さ 1 − ‖T_norm‖/M。単一pc=0（最協和）→ 全12pc=1（最不協和）。
 *  テンションノート(9/11/13th)は pc を足す＝‖T‖が縮み c が上がる（研究 §4：別ロジック不要・増分は重みで逓減）。 */
export function dissonance(pcs: number[]): number {
  if (pcs.length === 0) return 0;
  return clamp01(1 - tivNorm(tivOfPcs(pcs)) / TIV_MAX_NORM);
}

// ── キー（調）の TIV ＝トニック三和音（＝安息点／研究 §5.2「key の pc集合またはトニック」） ─────────
// 音階集合でなくトニック三和音を基準にする＝d2 が「安息点(I)からの遠さ」を測る（I=0・ドミナントで増）。
// 音階集合を基準にすると V が I より近く出る（音階への帰属は I/V で同等）＝機能的張力を測れないため採らない。
const MAJOR_TONIC = [0, 4, 7];
const MINOR_TONIC = [0, 3, 7];
/** key（主音pc＋長短）→ トニック三和音pc → TIV。キー角度距離 d2 の基準（安息点）ベクトル。 */
export function keyTIV(tonic: number, mode: "major" | "minor" | string = "major"): TIV {
  const base = mode === "minor" ? MINOR_TONIC : MAJOR_TONIC;
  const t = ((Math.trunc(tonic) % 12) + 12) % 12;
  return tivOfPcs(base.map((d) => (d + t) % 12));
}

// ── 張力プロファイル（進行→張力値列） ─────────────────────────────────────────
/** レンズが読む1コード（度数＋品質＋任意bass。pcs は呼び側で chordPcs 済みでも度数からでも可）。 */
export interface TensionChord {
  pcs: number[]; // 構成pc集合（0-11）
  degree?: number; // 調主音からの半音（表示用）
  root?: number; // ルートpc（表示用）
  quality?: string; // 品質（表示用）
  bass?: number; // 最低音pc（root と異なれば転回＝表面張力に加算）
}

export interface TensionKey {
  tonic: number; // 主音pc(0-11)
  mode?: "major" | "minor" | string;
}

/** 張力カーブの1点。tension は 0..1（帯 §5.4 と同スケール）。components は生値（デバッグ/UI用）。 */
export interface TensionPoint {
  index: number;
  degree?: number;
  root?: number;
  quality?: string;
  tension: number;
  components: { c: number; d2: number; d1: number; ss: number };
}

export interface TensionProfile {
  curve: TensionPoint[];
  modalLoop: boolean; // 機能希薄な循環＝レンズ降格トリガ（研究 §6-3）
}

/** 表面張力（Lerdahl surface tension の軽量近似・整数近似を 0..1 へ）。転回（bass≠root）＝+1相当。研究 §1.3。 */
function surfaceTension(ch: TensionChord): number {
  let s = 0;
  if (typeof ch.bass === "number" && typeof ch.root === "number") {
    const b = ((ch.bass % 12) + 12) % 12;
    const r = ((ch.root % 12) + 12) % 12;
    if (b !== r) s += 1; // 転回
  }
  return clamp01(s / 2); // 0..1（キャップ）
}

// 生成成分の固定スケール（min-max でなく絶対値＝役割帯 §5.4 と比較可能に／単調度も検出可能に）。
const D2_REF = Math.PI; // 角度距離の最大＝π
const D1_REF = 2 * TIV_MAX_NORM; // TIV距離の理論上限≈正反対の2ベクトル

/**
 * 進行 → 張力プロファイル（研究 §5.2）。木(h)は既定 off。
 * 手順：各コードの TIV から c（不協和）/ d2（キー角度距離）/ d1（前コードとのTIV距離）/ ss（表面張力）を生値で出し、
 *       固定スケールで 0..1 化 → 重み合成 → 隣接移動平均で平滑（聴感の慣性）。出力 tension は 0..1。
 */
export function tensionProfile(
  key: TensionKey,
  chords: TensionChord[],
  weights: { c: number; d2: number; d1: number; ss: number } = TENSION_WEIGHTS,
): TensionProfile {
  const K = keyTIV(key.tonic, key.mode);
  const tivs = chords.map((ch) => tivOfPcs(ch.pcs));
  const raw = chords.map((ch, i) => {
    const c = dissonance(ch.pcs);
    const d2 = clamp01(tivAngle(tivs[i]!, K) / D2_REF);
    const d1 = i === 0 ? 0 : clamp01(tivDistance(tivs[i]!, tivs[i - 1]!) / D1_REF);
    const ss = surfaceTension(ch);
    return { c, d2, d1, ss };
  });
  // 合成（生の0..1成分の重み和）。
  const combined = raw.map((r) => clamp01(weights.c * r.c + weights.d2 * r.d2 + weights.d1 * r.d1 + weights.ss * r.ss));
  // 平滑化（隣接移動平均・端は自分重め）。聴感の慣性を模す（研究 §5.2-6）。
  const smoothed = combined.map((v, i) => {
    const prev = i > 0 ? combined[i - 1]! : v;
    const next = i < combined.length - 1 ? combined[i + 1]! : v;
    return round3(clamp01(0.25 * prev + 0.5 * v + 0.25 * next));
  });
  const curve: TensionPoint[] = chords.map((ch, i) => ({
    index: i,
    ...(ch.degree !== undefined ? { degree: ch.degree } : {}),
    ...(ch.root !== undefined ? { root: ch.root } : {}),
    ...(ch.quality !== undefined ? { quality: ch.quality } : {}),
    tension: smoothed[i]!,
    components: { c: round3(raw[i]!.c), d2: round3(raw[i]!.d2), d1: round3(raw[i]!.d1), ss: round3(raw[i]!.ss) },
  }));
  return { curve, modalLoop: detectModalLoop(chords, raw, combined) };
}

// ── モーダルループ検出（研究 §6-3・task「機能進行が薄い＝張力分散が閾値未満で降格」）─────────────
/** pc集合列が周期 p(2..3) で反復するか（≥2周・length が p の倍数）。I–V–vi–IV や i–♭VII–♭VI 等の循環。 */
function isRepeatedLoop(chords: TensionChord[]): boolean {
  const n = chords.length;
  if (n < 4) return false;
  const ks = chords.map((ch) => chromaVector(ch.pcs).join(""));
  for (let p = 2; p <= 3; p++) {
    if (n % p !== 0 || n / p < 2) continue;
    let ok = true;
    for (let i = p; i < n; i++) if (ks[i] !== ks[i - p]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}
/** 三全音（機能ドミナントの指標＝V7/vii°/dim/m7b5 が持つ）を含むか。含めば機能的解決機構あり＝ループでない。 */
function hasTritone(pcs: number[]): boolean {
  const s = new Set(pcs.map((p) => ((p % 12) + 12) % 12));
  for (const p of s) if (s.has((p + 6) % 12)) return true;
  return false;
}

/**
 * モーダルループ＝機能希薄な循環（研究 §6-3）でレンズを降格。判定：
 *  (a) どの和音も三全音を持たない（＝明確なドミナント V7/vii° が不在）かつ
 *      〔反復ループ（I–V–vi–IV 等）または トニックに始まりトニックで解決しない（宙吊り循環 i–♭VII–♭VI–♭VII）〕、
 *  または (b) 合成張力の分散が極小＝カーブが平坦（ペダル/ドローン・研究 §6-3・task「張力分散が閾値未満」）。
 * 閾値は暫定（tunable・耳較正で更新）。機能進行（I–IV–V7–I 等）は三全音ありで (a) を外れ・トニック解決で除外。
 */
export function detectModalLoop(chords: TensionChord[], raw: { d2: number }[], combined: number[]): boolean {
  if (chords.length < 3) return false;
  const noTritone = chords.every((ch) => !hasTritone(ch.pcs));
  const startsTonic = raw[0]!.d2 < 0.12; // d2≈0＝トニック（安息点）
  const endsTonic = raw[raw.length - 1]!.d2 < 0.12;
  if (noTritone && (isRepeatedLoop(chords) || (startsTonic && !endsTonic))) return true;
  // (b) 平坦カーブ＝分散が閾値未満（ペダル/サスペンド多用で解決点が定義できない）。
  const mean = combined.reduce((a, b) => a + b, 0) / combined.length;
  const variance = combined.reduce((a, v) => a + (v - mean) * (v - mean), 0) / combined.length;
  return variance < 0.0003; // sd < ~0.017＝ほぼ一定（ペダル/ドローン）だけを平坦とみなす
}

// ── 役割別・目標カーブ帯（研究 §5.4・正準テーブル） ────────────────────────────────
export interface TensionBand {
  head: [number, number];
  mid: [number, number];
  tail: [number, number];
  /** 山（ピーク）の狙い位置。 */
  peak: "flat" | "mid" | "tail";
}
export const TENSION_BANDS: Record<string, TensionBand> = {
  verse: { head: [0.15, 0.4], mid: [0.15, 0.45], tail: [0.2, 0.45], peak: "flat" },
  prechorus: { head: [0.35, 0.55], mid: [0.45, 0.7], tail: [0.65, 0.9], peak: "tail" },
  chorus: { head: [0.15, 0.35], mid: [0.55, 0.8], tail: [0.3, 0.55], peak: "mid" },
  bridge: { head: [0.4, 0.65], mid: [0.55, 0.85], tail: [0.7, 0.95], peak: "tail" },
  intro: { head: [0.1, 0.35], mid: [0.1, 0.4], tail: [0.1, 0.4], peak: "flat" },
  outro: { head: [0.1, 0.35], mid: [0.1, 0.4], tail: [0.1, 0.4], peak: "flat" },
};
/** 役割→帯（未知/未指定は verse 相当＝中庸）。 */
export function bandForRole(role?: string): TensionBand {
  return TENSION_BANDS[(role ?? "").toLowerCase()] ?? TENSION_BANDS.verse!;
}

// 帯からの逸脱（区間外の距離を head/mid/tail で集計・小さいほど良）。
function outside(v: number, [lo, hi]: [number, number]): number {
  return v < lo ? lo - v : v > hi ? v - hi : 0;
}
function segAvg(curve: TensionPoint[], a: number, b: number): number {
  const s = curve.slice(a, b);
  if (s.length === 0) return 0;
  return s.reduce((acc, p) => acc + p.tension, 0) / s.length;
}
/** カーブを head/mid/tail の3区間に割り、各代表値の帯逸脱を合算（研究 §5.5 fitToBand・0で完全適合）。 */
export function fitToBand(curve: TensionPoint[], role?: string): number {
  if (curve.length === 0) return 0;
  const band = bandForRole(role);
  const n = curve.length;
  const h = segAvg(curve, 0, Math.max(1, Math.round(n / 3)));
  const m = segAvg(curve, Math.round(n / 3), Math.round((2 * n) / 3));
  const t = segAvg(curve, Math.max(0, n - Math.max(1, Math.round(n / 3))), n);
  return round3(outside(h, band.head) + outside(m, band.mid) + outside(t, band.tail));
}

/** 山（最大張力）が役割の狙い位置にあるか（研究 §5.5 peakPlacementReward・0..1・高い=良い）。 */
export function peakPlacementReward(curve: TensionPoint[], role?: string): number {
  if (curve.length < 2) return 0;
  const band = bandForRole(role);
  const n = curve.length;
  let mi = 0;
  for (let i = 1; i < n; i++) if (curve[i]!.tension > curve[mi]!.tension) mi = i;
  const pos = mi / (n - 1); // 0(頭)..1(末)
  if (band.peak === "flat") return 0.5; // 平坦狙い＝ピーク位置を問わない（中立）
  if (band.peak === "tail") return clamp01(pos); // 末で山＝高い
  return clamp01(1 - Math.abs(pos - 0.5) * 2); // mid＝中央で山＝高い
}

/** 終止の解決/未解決の役割適合（研究 §5.5 §3.2・偽終止/IV–I を減点しない）。
 *  prechorus/bridge/末尾＝高張力終端を"良"／chorus＝頭の解決(低)を"良"／その他は中立。0..1・高い=良い。 */
export function cadenceRelief(curve: TensionPoint[], role?: string): number {
  if (curve.length === 0) return 0.5;
  const r = (role ?? "").toLowerCase();
  const headT = curve[0]!.tension;
  const tailT = curve[curve.length - 1]!.tension;
  if (r === "prechorus" || r === "bridge") return clamp01(tailT); // 宙吊りの高さ＝良（未解決の快・減点しない）
  if (r === "chorus") return clamp01(1 - headT); // サビ頭の解決（低いほど良）
  return 0.5; // verse/その他＝中立（偽終止・IV–I も罰しない）
}

/** のっぺり平坦の減点（研究 §5.5 monotonyPenalty・分散が小さいほど大／0..~0.3）。 */
export function monotonyPenalty(curve: TensionPoint[]): number {
  if (curve.length < 2) return 0;
  const vals = curve.map((p) => p.tension);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, v) => a + (v - mean) * (v - mean), 0) / vals.length;
  const sd = Math.sqrt(variance);
  return round3(clamp01((0.12 - sd) / 0.12) * 0.3); // sd<0.12 で線形に減点・0.12以上は0
}

/**
 * 候補進行のスコア（研究 §5.5）。高い=良い（役割帯に乗る・山が狙い位置・解決が役割適合・平坦でない）。
 * モーダルループ検出時は **null（＝レンズ降格・並べ替え対象外）**。単一"正解"は出さない＝並べ替え用の相対値。
 */
export function scoreCandidate(profile: TensionProfile, role?: string): number | null {
  if (profile.modalLoop) return null;
  const curve = profile.curve;
  const fit = fitToBand(curve, role);
  const peak = peakPlacementReward(curve, role);
  const relief = cadenceRelief(curve, role);
  const mono = monotonyPenalty(curve);
  return round3(-fit + 0.5 * peak + 0.3 * relief - mono);
}

/** 候補の張力レンズ結果（api が item.meta.tension に載せる・content 不変）。 */
export interface HarmonicTensionLens {
  curve: TensionPoint[];
  band: TensionBand;
  role?: string;
  score: number | null; // null＝モーダルループで降格
  modalLoop: boolean;
  warning?: string; // 降格時の説明文言
}

/** 進行1本 → 張力レンズ（プロファイル＋役割帯＋適合score）。attach 用の1発ヘルパ。 */
export function harmonicTensionLens(key: TensionKey, chords: TensionChord[], role?: string): HarmonicTensionLens {
  const profile = tensionProfile(key, chords);
  const score = scoreCandidate(profile, role);
  return {
    curve: profile.curve,
    band: bandForRole(role),
    ...(role ? { role } : {}),
    score,
    modalLoop: profile.modalLoop,
    ...(profile.modalLoop
      ? { warning: "機能希薄な循環（モーダルループ）＝張力カーブが平坦化し設計情報を持たない。役割帯判定は無効＝並べ替え対象外（テクスチャ/密度など非和声の張力代理に委ねる）。" }
      : {}),
  };
}

/**
 * 複数候補を張力score で並べ替え（研究 §5.5・機械は候補まで＝単一正解を出さない）。
 * 既定＝生成順（WP-M3 流儀）。score が高い候補を上位に安定ソート。null（降格）は原順のまま末尾へ。
 * 返り＝元index の並び（content には触れない＝呼び側が order を使って提示）。
 */
export function rankByTension(lenses: { score: number | null }[]): number[] {
  const idx = lenses.map((_, i) => i);
  const scored = idx.filter((i) => lenses[i]!.score !== null);
  const unscored = idx.filter((i) => lenses[i]!.score === null);
  scored.sort((a, b) => {
    const d = (lenses[b]!.score as number) - (lenses[a]!.score as number);
    return d !== 0 ? d : a - b; // 同点＝生成順（安定）
  });
  return [...scored, ...unscored];
}
