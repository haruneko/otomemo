// 被覆率（M4 Scope 3）＝「検証が実際に効いた割合を数値で出す」。
// 二段構え：
//  (A) 検査の被覆率＝`types.ts` の `Coverage`（applied/total）。各検証器が必ず返す。
//      これが 0 のまま緑なら、その検査は**何も証明していない**（§6-4 #3 #7・空虚さの自己診断）。
//  (B) パートの被覆率＝源流 `experiments/ensemble/ensemble.py:3250-3300 coverage_metrics` の移植。
//      「パートが黙って落ちても二度と隠れない」ための計測（源流のコメント＝ギター統合バグの再発防止）。
//      無音のパートは他のあらゆる検査を**素通り**する＝空虚な合格の主要な入口なので、ここで数える。

import { coverageOf, diagnostic, gate, isVacuous, type Coverage, type DiagnosticVerdict, type GateVerdict } from "./types";

export const SRC_COVERAGE_METRICS = "phrase_maker experiments/ensemble/ensemble.py:3250-3300 (coverage_metrics)";

export interface CoveredNote { readonly start: number; readonly dur: number }
export interface CoveredPart { readonly name: string; readonly notes: readonly CoveredNote[] }

export interface PartCoverage {
  readonly name: string;
  readonly nNotes: number;
  /** last_note_end / track_end＝音が最後まで届いているか（源流 span_frac）。 */
  readonly spanFrac: number;
  readonly firstBar: number | null;
  readonly lastBar: number | null;
  /** 音が鳴っている小節の割合（源流 bars_covered_frac）＝途中の穴も捕まえる。 */
  readonly barsCoveredFrac: number;
  readonly dropout: boolean;
}

export interface PartCoverageReport {
  readonly parts: readonly PartCoverage[];
  readonly warnings: readonly string[];
  readonly nBars: number;
  readonly trackEnd: number;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;

/** 源流 coverage_metrics の移植（start は 0 でクランプ・小節は「鳴っている間の全小節」）。 */
export function partCoverage(parts: readonly CoveredPart[], barLen: number, minCov = 0.9): PartCoverageReport {
  const s0 = (n: CoveredNote): number => Math.max(0, n.start);
  let trackEnd = 0;
  for (const p of parts) for (const n of p.notes) trackEnd = Math.max(trackEnd, s0(n) + n.dur);
  const nBars = trackEnd > 0 ? Math.max(1, Math.ceil((trackEnd - 1e-9) / barLen)) : 0;
  const out: PartCoverage[] = [];
  const warnings: string[] = [];
  for (const p of parts) {
    if (p.notes.length === 0) {
      out.push({ name: p.name, nNotes: 0, spanFrac: 0, firstBar: null, lastBar: null, barsCoveredFrac: 0, dropout: true });
      warnings.push(`${p.name}: SILENT (0 notes)`);
      continue;
    }
    let first = Infinity, last = 0;
    const active = new Set<number>();
    for (const n of p.notes) {
      first = Math.min(first, s0(n));
      last = Math.max(last, s0(n) + n.dur);
      const b0 = Math.floor(s0(n) / barLen);
      const b1 = Math.floor(Math.max(s0(n), s0(n) + n.dur - 1e-9) / barLen);
      for (let b = b0; b <= b1; b++) active.add(b);
    }
    const span = trackEnd > 0 ? r4(last / trackEnd) : 0;
    const covered = nBars > 0 ? r4(active.size / nBars) : 0;
    const dropout = span < minCov;
    out.push({ name: p.name, nNotes: p.notes.length, spanFrac: span, firstBar: Math.floor(first / barLen), lastBar: Math.floor((last - 1e-9) / barLen), barsCoveredFrac: covered, dropout });
    if (dropout) warnings.push(`${p.name}: DROPOUT span_frac=${span} (bars ${Math.floor(first / barLen)}-${Math.floor((last - 1e-9) / barLen)} of ${nBars}; bars_covered=${covered})`);
  }
  return { parts: out, warnings, nBars, trackEnd };
}

/** パート脱落ゲート（源流も ok を返す）。被覆率＝判定できたパート数／総パート数。 */
export function partCoverageGate(parts: readonly CoveredPart[], barLen: number, minCov = 0.9, id = "coverage.parts"): GateVerdict<PartCoverageReport> {
  const rep = partCoverage(parts, barLen, minCov);
  return gate(id, rep.warnings.length === 0, coverageOf(rep.trackEnd > 0 ? parts.length : 0, parts.length), SRC_COVERAGE_METRICS, rep.warnings, rep);
}

export interface CoverageSummary {
  readonly checks: number;
  /** 一度も効いていない（空虚な）検査の id。 */
  readonly vacuous: readonly string[];
  /** 被覆率の単純平均。 */
  readonly meanFrac: number;
}

/** 検証器の束を受けて「どれだけ効いたか」を1枚にする（診断）。ゲートの合格が空虚でないかの物差し。 */
export function coverageSummary(verdicts: readonly { id: string; coverage: Coverage }[], id = "coverage.summary"): DiagnosticVerdict<CoverageSummary> {
  const vacuous = verdicts.filter((v) => isVacuous(v.coverage)).map((v) => v.id);
  const mean = verdicts.length ? Math.round((verdicts.reduce((a, v) => a + v.coverage.frac, 0) / verdicts.length) * 1e4) / 1e4 : 0;
  return diagnostic(id, { checks: verdicts.length, vacuous, meanFrac: mean },
    coverageOf(verdicts.length - vacuous.length, verdicts.length), "M4（計画 §6-4 #3 #7）",
    "空虚な検査が残っていること自体は赤にしない＝何が効いていないかを数で見せる。");
}
