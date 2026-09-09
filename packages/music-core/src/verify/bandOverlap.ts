// band_overlap（低域の棲み分け）＝ベースと上物のピッチ集合の重なりを測る。
// 源流＝phrase_maker `experiments/ensemble/ensemble.py:3225-3241 band_overlap`（純計測・RNG 無し）。
//
// **ゲートは `gap_semitones > 0` だけ**（計画 §5-2 M4）。`overlap_frac` は**診断**。
// 源流で実際にゲートに使われている閾値は `overlap_frac <= 0.10`
// （`experiments/piano/gesture/gesture_p14.py:1143-1145` gate8）＝出所を引いた実値。
// ※ `0.34` はフィル近重複のレーベンシュタイン閾値（`ensemble.py:1529 _FV_TAU`）であって
//    低域衝突のゲートではない（負の知識16・§6-4 #11）。ここでは一切使わない。

import { coverageOf, diagnostic, gate, type DiagnosticVerdict, type GateVerdict } from "./types";

export const SRC_BAND_OVERLAP = "phrase_maker experiments/ensemble/ensemble.py:3225-3241 (band_overlap)";
export const SRC_GATE8 = "phrase_maker experiments/piano/gesture/gesture_p14.py:1143-1145 (gate8)";

/** 源流 gate8 が使う overlap_frac の上限。**otomemo ではゲートにしない＝診断の物差し**。 */
export const SRC_GATE8_OVERLAP_FRAC_MAX = 0.10;

export interface BandOverlapMeasure {
  /** ベースの音域 [min,max]（空なら null）。 */
  readonly bassRange: readonly [number, number] | null;
  /** 上物の音域 [min,max]（空なら null）。 */
  readonly upperRange: readonly [number, number] | null;
  /** 共有しているピッチ（昇順）。 */
  readonly overlapSemitones: readonly number[];
  /** |共通| / min(|bass|,|upper|)（源流と同じ・小数第4位）。どちらか空なら null。 */
  readonly overlapFrac: number | null;
  /** min(upper) - max(bass)。>0 で棲み分け成立。どちらか空なら null。 */
  readonly gapSemitones: number | null;
}

/** 純計測（源流の band_overlap と同じ計算）。入力は MIDI ピッチの並び（重複可）。 */
export function measureBandOverlap(bass: readonly number[], upper: readonly number[]): BandOverlapMeasure {
  const bp = new Set(bass);
  const pp = new Set(upper);
  if (bp.size === 0 || pp.size === 0) {
    return { bassRange: null, upperRange: null, overlapSemitones: [], overlapFrac: null, gapSemitones: null };
  }
  const inter: number[] = [];
  for (const p of bp) if (pp.has(p)) inter.push(p);
  inter.sort((a, b) => a - b);
  const denom = Math.min(bp.size, pp.size);
  const bMin = Math.min(...bp), bMax = Math.max(...bp);
  const uMin = Math.min(...pp), uMax = Math.max(...pp);
  return {
    bassRange: [bMin, bMax],
    upperRange: [uMin, uMax],
    overlapSemitones: inter,
    overlapFrac: Math.round((inter.length / denom) * 1e4) / 1e4,
    gapSemitones: uMin - bMax,
  };
}

/**
 * ゲート＝`gap_semitones > 0`（棲み分け成立）。
 * どちらかのパートが無音のときは gap が定義できない＝**合格にしない**（源流 gate8 も
 * `overlap_frac is not None` を要求する）。そのケースは coverage.applied=0 で「効いていない」と分かる。
 */
export function bandGapGate(bass: readonly number[], upper: readonly number[], id = "band_overlap.gap"): GateVerdict<BandOverlapMeasure> {
  const m = measureBandOverlap(bass, upper);
  const applied = m.gapSemitones === null ? 0 : 1;
  const problems: string[] = [];
  if (m.gapSemitones === null) problems.push("片側が無音＝gap を定義できない（判定不能・合格ではない）");
  else if (m.gapSemitones <= 0) problems.push(`gap_semitones=${m.gapSemitones} <= 0（低域衝突・上物 min=${m.upperRange![0]} / ベース max=${m.bassRange![1]}）`);
  return gate(id, m.gapSemitones !== null && m.gapSemitones > 0, coverageOf(applied, 1), SRC_GATE8, problems, m);
}

export interface BandOverlapDiagnosticValue extends BandOverlapMeasure {
  /** 源流 gate8 の閾値（0.10）を満たすか＝**記録するだけ**（otomemo ではゲートにしない）。 */
  readonly withinSourceGate8: boolean | null;
}

/** 診断＝overlap_frac ほか。合否フィールドを持たない型なのでゲートに使えない（§6-4 #1）。 */
export function bandOverlapDiagnostic(bass: readonly number[], upper: readonly number[], id = "band_overlap.frac"): DiagnosticVerdict<BandOverlapDiagnosticValue> {
  const m = measureBandOverlap(bass, upper);
  const value: BandOverlapDiagnosticValue = {
    ...m,
    withinSourceGate8: m.overlapFrac === null ? null : m.overlapFrac <= SRC_GATE8_OVERLAP_FRAC_MAX,
  };
  return diagnostic(id, value, coverageOf(m.overlapFrac === null ? 0 : 1, 1), `${SRC_BAND_OVERLAP} / 閾値 ${SRC_GATE8_OVERLAP_FRAC_MAX} は ${SRC_GATE8}`,
    "overlap_frac はゲートにしない（診断）。耳が決める。");
}
