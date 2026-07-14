// WP-M8 旋律類似の独自性警告＝**除外ゲート前段 → 緑/黄/赤トリアージ** の純関数。
// 正典＝docs/research/2026-07-14-melody-similarity-warning.md。
//
// 設計の芯（研究doc §3-§5）：
//  ・単一指標で赤にしない。赤は AND 条件＝「音高一致 ∧ リズム一致 ∧ (連続長 or 位置)」が揃って初めて。
//  ・**除外ゲート（scènes à faire / de minimis / コーパス頻度）を"警告を出す前"に噛ませる**＝
//    スケール順次・分散和音・クロマチック・反復オスティナート等の building block は音高一致でも無罪化。
//  ・数値は「耳で確かめる合図」であって法的線ではない＝disclaimer を必ず添える（緑を安全証明と誤読させない）。
//  ・移調不変（音程列で比較）＝既存エンジンと同じ相対化。
import type { Note } from "./fit";

// 免責（研究doc 冒頭・§3.3・§6）＝出力に必須。緑でも「権利上安全」ではないと明記。
export const SIMILARITY_DISCLAIMER =
  "これは法的助言ではありません。警告は制作時の注意喚起（耳と目で確かめる合図）であって、侵害/非侵害の判定でも安全証明でもありません。実際の懸念は弁護士・JASRAC 等の専門家へ。";

export type WarningLevel = "green" | "yellow" | "red";

export interface SimilarityFinding {
  kind: "contiguous" | "ngram" | "contour-rhythm";
  detail: string;
  noteRun?: number; // 連続一致した音数（contiguous / contour-rhythm）
  rhythmMatch?: boolean; // その連続区間でリズム（IOI）も一致したか
  ngramOverlap?: number; // 0..1（ngram 重複率・ありふれ ngram 除外後）
  commonplace?: boolean; // 除外ゲートで building block と判定（警告に昇格しない）
  layer?: "skeleton" | "surface";
}

export interface SimilarityWarning {
  level: WarningLevel;
  findings: SimilarityFinding[];
  disclaimer: string;
}

export interface SimilarityWarningOptions {
  // §5.1 コーパス頻度による除外＝音程 ngram → ありふれ度ランク 0..1（1=最頻）。閾値以上なら building block 扱いで除外。
  // 未指定なら構造的 scènes à faire（§5.2）だけで判定＝DB 不要でも動く。
  commonness?: (intervalNgram: number[]) => number;
  commonThreshold?: number; // default 0.9（コーパス上位10%を"ありふれ"）
  layer?: "skeleton" | "surface"; // §4.3 層ラベル（自己模倣は骨格に出る）。注記に添える。
}

// ── 前処理：ソート済みノートから音程列 / IOI（8分量子化）/ 輪郭を作る（すべて隣接対の列＝同じ添字）──
function features(notes: Note[]): { intervals: number[]; ioiQ: number[]; contour: number[] } {
  const ns = [...(notes ?? [])]
    .filter((n) => typeof n?.pitch === "number")
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const intervals: number[] = [];
  const ioiQ: number[] = [];
  const contour: number[] = [];
  for (let i = 0; i < ns.length - 1; i++) {
    const d = ns[i + 1]!.pitch - ns[i]!.pitch;
    intervals.push(d);
    contour.push(Math.sign(d));
    ioiQ.push(Math.round(((ns[i + 1]!.start ?? i + 1) - (ns[i]!.start ?? i)) * 2)); // 0.5拍(8分)単位
  }
  return { intervals, ioiQ, contour };
}

// §5.2/§5.3 構造的 scènes à faire＋de minimis：音程 run が building block（＝独占不可の建材）なら true。
//  ・順次スケール（±1/±2 の単一方向）・クロマチック（±1）・分散和音（±3/±4）・同一音程反復/同音反復。
//  ・2音程(=3音)未満は de minimis で無条件 commonplace（短すぎる断片は無罪）。
export function isCommonplaceFigure(intervalRun: number[]): boolean {
  if (intervalRun.length < 2) return true; // de minimis：3音未満の断片
  const all = (pred: (x: number) => boolean) => intervalRun.every(pred);
  if (all((x) => x >= 1 && x <= 2)) return true; // 上行スケール（全音/半音の順次）
  if (all((x) => x <= -1 && x >= -2)) return true; // 下行スケール
  if (all((x) => x === 1) || all((x) => x === -1)) return true; // クロマチック
  if (all((x) => x >= 3 && x <= 4) || all((x) => x <= -3 && x >= -4)) return true; // 分散和音（3度積み）
  if (all((x) => x === 0)) return true; // 同音反復
  if (intervalRun.every((x) => x === intervalRun[0])) return true; // 同一音程オスティナート
  return false;
}

// 2列の「最長連続共通部分列（substring）」を DP で。keyEq でトークン一致を判定（音程のみ / 音程∧リズム）。
function longestCommonRun(
  aLen: number,
  bLen: number,
  eq: (i: number, j: number) => boolean,
): { length: number; aStart: number; bStart: number } {
  let best = 0, aStart = 0, bStart = 0;
  const prev = new Array(bLen + 1).fill(0);
  for (let i = 1; i <= aLen; i++) {
    const cur = new Array(bLen + 1).fill(0);
    for (let j = 1; j <= bLen; j++) {
      if (eq(i - 1, j - 1)) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) { best = cur[j]; aStart = i - cur[j]; bStart = j - cur[j]; }
      }
    }
    for (let j = 0; j <= bLen; j++) prev[j] = cur[j];
  }
  return { length: best, aStart, bStart };
}

// §3.1B 音程 n-gram（n=3）の重複率＝共有ngram / 自曲ngram。ありふれ ngram（§5）は分子から除外。
// total（自曲 ngram 数）も返す＝短い断片は ngram 経路で赤にしない（連続長経路に任せる・二重計上防止）。
function ngramOverlap(
  a: number[],
  b: number[],
  n: number,
  isCommon: (g: number[]) => boolean,
): { overlap: number; total: number } {
  if (a.length < n) return { overlap: 0, total: 0 };
  const key = (g: number[]) => g.join(",");
  const bset = new Set<string>();
  for (let i = 0; i + n <= b.length; i++) bset.add(key(b.slice(i, i + n)));
  let shared = 0, total = 0;
  for (let i = 0; i + n <= a.length; i++) {
    const g = a.slice(i, i + n);
    total++;
    if (isCommon(g)) continue; // ありふれ音型は独自性ゼロ＝重複に数えない
    if (bset.has(key(g))) shared++;
  }
  return { overlap: total > 0 ? shared / total : 0, total };
}

// 危険帯の目安（研究doc §3.2・除外ゲート通過後）。閾値は「耳で確かめる合図」＝法的線ではない。
const RED_NOTE_RUN = 8; // 連続一致 ≥8音（記憶に残るフレーズ丸ごと級）＋リズム一致 ＝ AND で赤
const YELLOW_NOTE_RUN = 6; // 連続一致 6〜7音 ＝「なんか聴いたことある」帯
const RED_NGRAM = 0.30; // n-gram 重複率 >30%
const YELLOW_NGRAM = 0.15; // 15〜30%
const RED_CR_NOTES = 12; // 輪郭+リズム同時一致 ≒3小節（8分格子の proxy）
const YELLOW_CR_NOTES = 8; // 同 ≒2小節
const MIN_NGRAM_FOR_RED = 6; // ngram 経路で赤にするのに要る自曲 ngram 数（短い全コピーは連続長経路へ）

/**
 * 2旋律のトリアージ警告（緑/黄/赤）。除外ゲート（§5）を前段に噛ませ、AND 条件（§5.4）で赤の乱発を防ぐ。
 * a=新作フレーズ、b=照合先（他者統計 or 自作既出）。移調不変（音程列で比較）。
 */
export function similarityWarning(
  a: Note[],
  b: Note[],
  opts: SimilarityWarningOptions = {},
): SimilarityWarning {
  const layer = opts.layer;
  const commonThreshold = opts.commonThreshold ?? 0.9;
  const fa = features(a);
  const fb = features(b);
  const findings: SimilarityFinding[] = [];

  // 音程 run が building block か（構造的 scènes à faire ∨ コーパス高頻度）。
  const isCommon = (run: number[]): boolean => {
    if (isCommonplaceFigure(run)) return true;
    if (opts.commonness && run.length >= 2 && opts.commonness(run) >= commonThreshold) return true;
    return false;
  };

  // ── A. 最長連続一致（音程のみ・移調不変）→ その run が building block なら除外して昇格させない ──
  const pitchRun = longestCommonRun(fa.intervals.length, fb.intervals.length, (i, j) => fa.intervals[i] === fb.intervals[j]);
  let pitchNoteRun = 0; // 除外後の"効く"連続一致音数
  let rhythmMatchOnRun = false;
  if (pitchRun.length > 0) {
    const runIv = fa.intervals.slice(pitchRun.aStart, pitchRun.aStart + pitchRun.length);
    const commonplace = isCommon(runIv);
    // 同区間でリズム（IOI）も一致するか＝AND 条件のリズム軸
    rhythmMatchOnRun = runIv.every((_, k) => fa.ioiQ[pitchRun.aStart + k] === fb.ioiQ[pitchRun.bStart + k]);
    pitchNoteRun = commonplace ? 0 : pitchRun.length + 1; // 音程 run 長(=区間) → 音数は +1
    findings.push({
      kind: "contiguous",
      detail: commonplace
        ? `連続一致 ${pitchRun.length + 1} 音だが、ありふれた音型（スケール/分散和音/反復等）＝building block として除外`
        : `連続一致 ${pitchRun.length + 1} 音${rhythmMatchOnRun ? "（リズムも一致）" : "（リズムは不一致）"}`,
      noteRun: pitchRun.length + 1,
      rhythmMatch: rhythmMatchOnRun,
      commonplace,
      layer,
    });
  }

  // ── B. 音程 n-gram(3) 重複率（ありふれ ngram は除外済）──
  const { overlap, total: ngramTotal } = ngramOverlap(fa.intervals, fb.intervals, 3, (g) => isCommon(g));
  if (overlap > 0) findings.push({ kind: "ngram", detail: `音程3-gram 重複率 ${(overlap * 100).toFixed(0)}%（ありふれ音型は除外後）`, ngramOverlap: overlap, layer });

  // ── C. 輪郭＋リズム同時一致の最長連続（音高に依らない身振りの一致・弱い証拠）──
  //  §5.4 AND 原則：音高の独自一致が皆無（連続長も ngram も除外で 0）なら "身振り/フィールだけの一致" は警告しない
  //  （Blurred Lines の feel 保護への揺り戻し）。distinctive な音高一致がある時だけ補助証拠として効かせる。
  const crRun = longestCommonRun(
    fa.contour.length,
    fb.contour.length,
    (i, j) => fa.contour[i] === fb.contour[j] && fa.ioiQ[i] === fb.ioiQ[j],
  );
  const hasPitchEvidence = pitchNoteRun > 0 || overlap > 0;
  const crNotes = hasPitchEvidence && crRun.length > 0 ? crRun.length + 1 : 0;
  if (crNotes >= YELLOW_CR_NOTES) findings.push({ kind: "contour-rhythm", detail: `輪郭＋リズムが ${crNotes} 音連続で一致`, noteRun: crNotes, layer });

  // ── トリアージ（AND 条件・§5.4）。赤は「音高∧リズム∧連続長」or 高 ngram(十分な長さ) or 長い輪郭+リズム ──
  let level: WarningLevel = "green";
  const red =
    (pitchNoteRun >= RED_NOTE_RUN && rhythmMatchOnRun) || // 記念樹/DarkHorse 型（連続長＋リズム AND）
    (overlap > RED_NGRAM && ngramTotal >= MIN_NGRAM_FOR_RED) || // 分散一致（My Sweet Lord 型）＝十分長い旋律で
    crNotes >= RED_CR_NOTES;
  const yellow =
    pitchNoteRun >= YELLOW_NOTE_RUN || // 6音以上は音高だけでも黄（AND 未満は赤に上げない）
    overlap >= YELLOW_NGRAM ||
    crNotes >= YELLOW_CR_NOTES;
  if (red) level = "red";
  else if (yellow) level = "yellow";

  return { level, findings, disclaimer: SIMILARITY_DISCLAIMER };
}

// ── ④ cryptomnesia（自作既出との無意識の焼き直し）レポート＝新作 × 自作コーパス（§4）──
export interface OriginalityHit {
  id?: string;
  label?: string;
  warning: SimilarityWarning;
}
export interface OriginalityReport {
  channel: "self"; // 自作照合＝権利チャンネルではなく「手癖」チャンネル
  layer?: "skeleton" | "surface";
  scanned: number;
  hits: OriginalityHit[]; // yellow/red のみ（green は割愛）
  disclaimer: string;
  note: string;
}

/**
 * 新作メロ × 自作既出コーパス（project の melody ネタ全走査）→ 焼き直し（cryptomnesia）注記。
 * 権利問題ではなく「また同じ手癖」のシグナル＝警告のみ・ブロックしない（§4）。骨格層で手癖が出やすい。
 */
export function originalityReport(
  target: Note[],
  corpus: { id?: string; label?: string; notes: Note[] }[],
  opts: SimilarityWarningOptions = {},
): OriginalityReport {
  const hits: OriginalityHit[] = [];
  for (const c of corpus ?? []) {
    if (!c?.notes?.length) continue;
    const w = similarityWarning(target, c.notes, opts);
    if (w.level !== "green") hits.push({ id: c.id, label: c.label, warning: w });
  }
  // 危険度の高い順（red→yellow）に。
  hits.sort((x, y) => (y.warning.level === "red" ? 1 : 0) - (x.warning.level === "red" ? 1 : 0));
  return {
    channel: "self",
    layer: opts.layer,
    scanned: (corpus ?? []).filter((c) => c?.notes?.length).length,
    hits,
    disclaimer: SIMILARITY_DISCLAIMER,
    note: "自作既出との一致＝権利侵害ではなく『手癖の焼き直し』のシグナル。骨格層の一致は特に手癖。意図的な自己引用なら気にしなくてよい。",
  };
}
