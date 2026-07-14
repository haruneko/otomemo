// シンコペの「ノリメーター」を候補へ読み取り専用添付する糊（WP-D2・2026-07-14・design.md シンコペレンズ節）。
// @cm/music-core の純関数（lhlSyncScore/noriMeter・音源不要）を gen_drums/gen_bass/gen_melody 候補へ meta.sync として付す。
// **候補ノートの内容には一切影響しない**（bit一致鉄則＝レポートは items[].meta.sync への加算のみ）。melodyLensesReport と同格。
// 思想：シンコペ指標は審判でない＝弾かず、目標帯への適合(fit)で並べ替える「ノリのレンズ」（§6-2）。
import { lhlSyncScore, noriMeter, type NoriCtx, type SyncMeter } from "@cm/music-core";

type ReportItem = { kind: string; content: unknown; label: string; meta?: Record<string, unknown> };
type ReportResult = { items: ReportItem[] };

type DrumLane = { name?: string; midi?: number; hits?: number[] };
type DrumRhythm = { steps?: number; bars?: number; beatsPerStep?: number; lanes?: DrumLane[] };

// 候補 content から onset（拍位置）とメーターを取り出す。層で読み口が違う（melody/bass=notes・drums=rhythm）。
function extractOnsets(it: ReportItem, beatsPerBar: number): { onsets: number[]; meter: SyncMeter } | null {
  const c = it.content as { notes?: unknown; rhythm?: DrumRhythm } | null;
  if (!c) return null;
  // ドラム＝rhythm.lanes の hits（step index）を beatsPerStep で拍へ。全レーンの和集合＝キット全体のシンコペ。
  if (c.rhythm) {
    const r = c.rhythm;
    const bps = typeof r.beatsPerStep === "number" && r.beatsPerStep > 0 ? r.beatsPerStep : 0.25;
    const stepsPerBar = r.steps && r.bars ? r.steps / r.bars : (beatsPerBar / bps);
    const onsets: number[] = [];
    for (const ln of r.lanes ?? []) for (const s of ln.hits ?? []) if (Number.isFinite(s)) onsets.push(s * bps);
    if (!onsets.length) return null;
    const gridPerBeat = Math.max(1, Math.round(1 / bps));
    return { onsets, meter: { beatsPerBar, gridPerBeat, barLen: stepsPerBar * bps } };
  }
  // melody / bass＝notes[].start（拍）。16分格子で度数化。
  const raw = c.notes;
  if (!Array.isArray(raw)) return null;
  const onsets = raw
    .filter((n): n is { start?: number } => !!n && Number.isFinite((n as { start?: number }).start))
    .map((n) => n.start as number);
  if (onsets.length < 2) return null;
  return { onsets, meter: { beatsPerBar, gridPerBeat: 4, barLen: beatsPerBar } };
}

/** 候補への添付：対象 kind（melody/bass/drums）の各候補に meta.sync={perBar,perNote,norm,zone,band,fit,inBand} を付す。
 *  band はセクション役割＋テンポ/和声/ジャンル補正（NoriCtx）で決まる（研究 §6-1）。弾かず並べ替えの軸。 */
export function attachSyncScore(
  res: ReportResult,
  opts: { kinds?: string[]; beatsPerBar?: number } & NoriCtx = {},
): void {
  const beatsPerBar = opts.beatsPerBar ?? 4;
  const kinds = opts.kinds ?? ["melody", "bass", "drums", "rhythm"];
  const noriCtx: NoriCtx = { role: opts.role, tempo: opts.tempo, harmonyTension: opts.harmonyTension, genre: opts.genre };
  for (const it of res.items) {
    if (!kinds.includes(it.kind)) continue;
    const ex = extractOnsets(it, beatsPerBar);
    if (!ex) continue;
    const sync = lhlSyncScore(ex.onsets, ex.meter);
    it.meta = { ...(it.meta ?? {}), sync: noriMeter(sync, noriCtx) };
  }
}
