// 和声張力カーブレンズの生成側露出（WP-C4・design 和声節・2026-07-14）。@cm/music-core の
// harmonicTensionLens（TIS＝DFT→6D TIV→μ/θ・純関数・音源不要）を gen_chords 候補へ「読み取り専用メタ」
// として添付する糊。**候補の content（chords 配列）には一切影響しない**（bit一致鉄則＝meta.tension への加算のみ）。
// 思想：カーブは審判でなく設計レンズ＝弾かず・単一正解を出さず・役割帯へ乗るかを見る。モーダルループで自動降格（score=null）。
// WP-M3（melodyLensesReport）と同流儀：kind 別に candidate へ meta を足すだけ・content/並びは不変。
import { chordPcs, harmonicTensionLens, type TensionChord } from "@cm/music-core";

type TensionItem = { kind: string; content: unknown; label: string; meta?: Record<string, unknown> };
type TensionRes = { items: TensionItem[] };

// content.chords（{root,quality,start,dur,bass?}）→ TensionChord[]（pcs＋度数/root/quality/bass）。
function itemChords(it: TensionItem, key: number): TensionChord[] | null {
  const raw = (it.content as { chords?: unknown } | null)?.chords;
  if (!Array.isArray(raw)) return null;
  const out: TensionChord[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const ch = c as { root?: number | string; quality?: string; bass?: number };
    if (ch.root === undefined) continue;
    const pcs = chordPcs(ch.root, ch.quality ?? "");
    const rootPc = typeof ch.root === "number" ? ((Math.trunc(ch.root) % 12) + 12) % 12 : undefined;
    out.push({
      pcs,
      ...(rootPc !== undefined ? { root: rootPc, degree: ((rootPc - key) % 12 + 12) % 12 } : {}),
      ...(ch.quality !== undefined ? { quality: ch.quality } : {}),
      ...(typeof ch.bass === "number" ? { bass: ((ch.bass % 12) + 12) % 12 } : {}),
    });
  }
  return out.length ? out : null;
}

/**
 * gen_chords 候補への添付：kind==="chord_progression" の各候補に meta.tension を付す。
 * meta.tension＝{ curve（張力カーブ 0..1）, band（役割帯）, role?, score（役割帯適合・高い=良い or **null=モーダルループ降格**）,
 *                modalLoop, warning? }。key/mode/role は frame から供給（無ければ既定 major/verse 相当）。
 * content 不変＝既定 bit 一致（メタ添付のみ・並び不変）。
 */
export function attachHarmonicTension(
  res: TensionRes,
  opts: { key?: number; mode?: "major" | "minor" | string; sectionRole?: string } = {},
): void {
  const key = typeof opts.key === "number" ? ((Math.trunc(opts.key) % 12) + 12) % 12 : 0;
  for (const it of res.items) {
    if (it.kind !== "chord_progression") continue;
    const chords = itemChords(it, key);
    if (!chords) continue;
    const lens = harmonicTensionLens({ tonic: key, mode: opts.mode ?? "major" }, chords, opts.sectionRole);
    it.meta = { ...(it.meta ?? {}), tension: lens };
  }
}
