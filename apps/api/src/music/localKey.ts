// 局所調・転調検出プロトタイプ（F3）。BTC の chords_timeline を入力に、
// per-window の tonicScores（継続長ヒートマップ＝resolveTonic の中核）を emission とし、
// 「調切替コスト＋最小滞在長」で束ねた DP（Viterbi 型）で全体最適の key_segments を出す。
//
// 正典仕様＝docs/research/2026-07-15-local-key-detection-survey.md §3（推奨アルゴリズム）。
// 理論裏付け＝Gedizlioğlu&Erol 2024（切替の二乗罰）／arXiv:2606.03459（modulation cost + tonal vocabulary の DP）。
// ★プロトはモジュール＋テストで完結（reaper/facts 契約には未結線）。
import { tonicScores } from "../common-progressions";
import { parseChordSymbol } from "./chordname";

// ── I/O 契約（survey §3.1）─────────────────────────────────────────────
export type ChordSpan = [startSec: number, endSec: number, label: string]; // 例 [0.93, 2.22, "A:min"]
export type ChordsTimeline = ChordSpan[];

export interface KeySegment {
  start: number;                    // 秒
  end: number;                      // 秒
  key: number;                      // トニックのピッチクラス 0-11（C=0）
  mode: "major" | "minor";
  confidence: number;               // 0..1（窓スコアの正規化平均＝勝ち調シェア）
}

export interface DetectKeyOptions {
  /** 窓半幅（秒）。survey 初期値 ±4〜6秒（≒±2小節）。 */
  windowSec?: number;
  /** 調を切り替える固定罰（正規化 emission 単位＝勝ち調シェアと同スケール）。survey: まずこれを効かせる。 */
  switchCost?: number;
  /** 最小滞在長（秒）。これ未満の調の島は両隣の強い方へ吸収＝1〜2コード借用を転調に昇格させない砦。 */
  minDwellSec?: number;
  /** 近親調（相対/平行/属/下属）割引 0..1。survey 初期値 1.0＝割引なし（素の挙動を先に測る）。 */
  nearKeyDiscount?: number;
}

// F3 実測でチューニング済み（docs/research/2026-07-15-local-key-proto-results.md §パラメータ感度）。
//   switchCost 1.2＝合成(d)相対調往復のフリップ抑止と(f)部分転調検出を両立する最小オーダー。
//   minDwellSec 8＝≒2小節。windowSec 6＝±2小節相当（survey §3.4 の中庸）。nearKeyDiscount は素の挙動を測るため既定オフ。
export const DEFAULT_OPTS: Required<DetectKeyOptions> = {
  windowSec: 6,
  switchCost: 1.2,
  minDwellSec: 8,
  nearKeyDiscount: 1.0,
};

// ── 24 状態の列挙（root 0-11 × major/minor）─────────────────────────────
interface KeyState { key: number; mode: "major" | "minor"; label: string }
const STATES: KeyState[] = (() => {
  const s: KeyState[] = [];
  for (let r = 0; r < 12; r++) {
    s.push({ key: r, mode: "major", label: `${r}:M` });
    s.push({ key: r, mode: "minor", label: `${r}:m` });
  }
  return s;
})();

interface ParsedSpan { root: number; quality: string; start: number; end: number; dur: number }

/** timeline → パース済みコード span 列（N.C. / 解釈不能は除外）。 */
function parseTimeline(timeline: ChordsTimeline): ParsedSpan[] {
  const out: ParsedSpan[] = [];
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]), end = Number(seg[1]);
    if (!(end > start)) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", "")); // "A:min" → "Amin"
    if (!parsed) continue; // N.C. 等
    out.push({ root: parsed.root, quality: parsed.quality, start, end, dur: end - start });
  }
  return out;
}

/** 窓 [center-H, center+H] に重なるコードを、窓内の重なり長を dur として集める。 */
function windowChords(spans: ParsedSpan[], center: number, half: number): { root: number; quality: string; dur: number }[] {
  const lo = center - half, hi = center + half;
  const out: { root: number; quality: string; dur: number }[] = [];
  for (const s of spans) {
    const ov = Math.min(s.end, hi) - Math.max(s.start, lo);
    if (ov > 0) out.push({ root: s.root, quality: s.quality, dur: ov });
  }
  return out;
}

/** tonicScores（24枠の生スコア）→ 各状態の正規化 emission（合計1）。無得点は 0。 */
function emissionFor(chords: { root: number; quality: string; dur: number }[]): number[] {
  const raw = tonicScores(chords);
  let sum = 0;
  for (const v of raw.values()) sum += v;
  const e = new Array<number>(STATES.length);
  for (let i = 0; i < STATES.length; i++) {
    const v = raw.get(STATES[i]!.label) ?? 0;
    e[i] = sum > 0 ? v / sum : 0;
  }
  return e;
}

// 近親調（相対/平行/属/下属）判定＝割引対象。
function isNearKey(a: KeyState, b: KeyState): boolean {
  if (a.key === b.key && a.mode === b.mode) return false; // 同一は近親でなく無罰
  // 平行調（同 root・長短違い）
  if (a.key === b.key) return true;
  // 相対調（長 root と その短3度下 minor＝相対マイナー: minorKey = majorKey - 3）
  if (a.mode !== b.mode) {
    const maj = a.mode === "major" ? a : b;
    const min = a.mode === "major" ? b : a;
    if (((maj.key - 3 + 12) % 12) === min.key) return true; // 相対
  }
  // 属/下属（同 mode・±完全5度）
  if (a.mode === b.mode) {
    const d = ((a.key - b.key) + 12) % 12;
    if (d === 5 || d === 7) return true;
  }
  return false;
}

export interface DetectKeyResult { segments: KeySegment[] }

/**
 * chords_timeline → 局所調セグメント。
 * DP（Viterbi）: cost = Σ(-emission) + Σ(遷移罰)。最小コスト経路を backtrace → 最小滞在長で平滑化 → セグメント化。
 */
export function detectKeySegments(timeline: ChordsTimeline, opts: DetectKeyOptions = {}): DetectKeyResult {
  const o = { ...DEFAULT_OPTS, ...opts };
  const spans = parseTimeline(timeline);
  if (spans.length === 0) return { segments: [] };
  const T = spans.length, K = STATES.length;

  // 1) emission: 各ステップ（コード変化点）を窓 [center±H] で採点
  const emit: number[][] = new Array(T);
  for (let t = 0; t < T; t++) {
    const center = (spans[t]!.start + spans[t]!.end) / 2;
    emit[t] = emissionFor(windowChords(spans, center, o.windowSec));
  }

  // 2) 遷移罰テーブル（k==k'→0, 近親→switchCost*discount, その他→switchCost）
  const trans = (i: number, j: number): number => {
    if (i === j) return 0;
    if (o.nearKeyDiscount !== 1.0 && isNearKey(STATES[i]!, STATES[j]!)) return o.switchCost * o.nearKeyDiscount;
    return o.switchCost;
  };

  // 3) Viterbi（コスト最小化）
  const dp: number[][] = new Array(T);
  const back: number[][] = new Array(T);
  dp[0] = emit[0]!.map((e) => -e);
  back[0] = new Array(K).fill(-1);
  for (let t = 1; t < T; t++) {
    dp[t] = new Array(K); back[t] = new Array(K);
    for (let k = 0; k < K; k++) {
      let bestPrev = 0, bestCost = Infinity;
      for (let p = 0; p < K; p++) {
        const c = dp[t - 1]![p]! + trans(p, k);
        if (c < bestCost) { bestCost = c; bestPrev = p; }
      }
      dp[t]![k] = -emit[t]![k]! + bestCost;
      back[t]![k] = bestPrev;
    }
  }
  // backtrace
  let last = 0, lastCost = Infinity;
  for (let k = 0; k < K; k++) if (dp[T - 1]![k]! < lastCost) { lastCost = dp[T - 1]![k]!; last = k; }
  const labels = new Array<number>(T);
  labels[T - 1] = last;
  for (let t = T - 1; t > 0; t--) labels[t - 1] = back[t]![labels[t]!]!;

  // 4) 最小滞在長で平滑化：MIN_DWELL 未満の run を隣接の強い方に吸収（反復）
  smoothShortRuns(labels, spans, emit, o.minDwellSec);

  // 5) run → KeySegment[]（confidence = run 内 emission シェアの平均）
  const segments: KeySegment[] = [];
  let i = 0;
  while (i < T) {
    let j = i;
    while (j + 1 < T && labels[j + 1] === labels[i]) j++;
    const st = STATES[labels[i]!]!;
    let conf = 0;
    for (let t = i; t <= j; t++) conf += emit[t]![labels[i]!]!;
    conf /= (j - i + 1);
    segments.push({ start: spans[i]!.start, end: spans[j]!.end, key: st.key, mode: st.mode, confidence: Number(conf.toFixed(4)) });
    i = j + 1;
  }
  return { segments };
}

/** run（連続同一ラベル）の総滞在長が minDwellSec 未満なら、隣接 run の強い方のラベルへ吸収。安定まで反復。 */
function smoothShortRuns(labels: number[], spans: ParsedSpan[], emit: number[][], minDwellSec: number): void {
  const T = labels.length;
  for (let iter = 0; iter < T; iter++) {
    // run 境界を作る
    const runs: { s: number; e: number; label: number; dur: number }[] = [];
    let i = 0;
    while (i < T) {
      let j = i; while (j + 1 < T && labels[j + 1] === labels[i]) j++;
      let dur = 0; for (let t = i; t <= j; t++) dur += spans[t]!.dur;
      runs.push({ s: i, e: j, label: labels[i]!, dur });
      i = j + 1;
    }
    if (runs.length <= 1) return;
    // 最短の「短すぎる run」を1つ潰す
    let target = -1, tdur = Infinity;
    for (let r = 0; r < runs.length; r++) if (runs[r]!.dur < minDwellSec && runs[r]!.dur < tdur) { tdur = runs[r]!.dur; target = r; }
    if (target === -1) return; // 全 run が十分長い＝完了
    const R = runs[target]!;
    const prev = target > 0 ? runs[target - 1]! : null;
    const next = target < runs.length - 1 ? runs[target + 1]! : null;
    // 吸収先＝隣接 run の「強い方」。強さ＝run 総滞在長（長い方が支配的）。同点/片側なら在る方。
    let intoLabel: number;
    if (prev && next) intoLabel = (prev.dur >= next.dur ? prev.label : next.label);
    else intoLabel = (prev ? prev.label : next!.label);
    for (let t = R.s; t <= R.e; t++) labels[t] = intoLabel;
  }
}
