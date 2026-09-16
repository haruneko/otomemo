// 音高クラスの所属ゲート（M5 受け入れ＝「強拍コードトーン」「非整合音 0」）。
// **表を持たない**（§6-4 #2 自己参照禁止）＝許容集合は呼び手が**生成器と別の出所**から渡す
//   （M5 当時の oracle＝py-parity ダンプ `cases-guitar/chordtheory.json` は 2026-09-16 リフ撤去でギターごと外した）。
// 許容集合の空虚さは diagnostic で必ず出す（§6-4 #3＝12音中いくつ許しているか）。

import { coverageOf, diagnostic, gate, type DiagnosticVerdict, type GateVerdict } from "./types";

export interface PcEvent { readonly pitch: number; readonly start: number }

/**
 * `applies(e)` が真の音だけを判定し、その音の pc が `allowedAt(e)` に入ることを要求する。
 * 被覆率＝判定した音数／音数（0 なら空虚）。
 */
export function pcMembershipGate(
  id: string, events: readonly PcEvent[], allowedAt: (e: PcEvent) => ReadonlySet<number> | null,
  applies: (e: PcEvent) => boolean, source: string,
): GateVerdict<{ offending: readonly PcEvent[] }> {
  const offending: PcEvent[] = [];
  let applied = 0;
  for (const e of events) {
    if (!applies(e)) continue;
    const allowed = allowedAt(e);
    if (!allowed) continue;
    applied++;
    if (!allowed.has(((e.pitch % 12) + 12) % 12)) offending.push(e);
  }
  // 空の音列は合格にしない（2026-09-13 M5 監査 軽微-3）＝判定した音が0なら何も確かめていない。被覆率0として申告する。
  const empty = events.length === 0;
  return gate(id, !empty && offending.length === 0, coverageOf(applied, events.length), source,
    empty ? ["音が0個＝何も判定していない（被覆率0・空虚）"] : offending.slice(0, 8).map((e) => `pitch=${e.pitch} start=${e.start} は許容 pc に無い`), { offending });
}

/** 許容集合の大きさ（12音中の割合の平均）＝ゲートが緩すぎないかの自己診断。 */
export function allowedPcFraction(events: readonly PcEvent[], allowedAt: (e: PcEvent) => ReadonlySet<number> | null, source: string): DiagnosticVerdict<number> {
  let sum = 0, n = 0;
  for (const e of events) { const a = allowedAt(e); if (!a) continue; sum += a.size / 12; n++; }
  return diagnostic("allowed_pc_fraction", n > 0 ? Math.round((sum / n) * 1e4) / 1e4 : 0, coverageOf(n, events.length), source, "許容 pc が 12 音に近いほどゲートは空虚");
}
