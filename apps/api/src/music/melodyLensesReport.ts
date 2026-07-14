// 候補レンズの生成側露出（design #12-M「候補レンズ」・WP-M3・2026-07-14）。@cm/music-core の3レンズ
// （expectation/hook/singability・純関数・音源不要）を gen_melody 候補へ「読み取り専用メタ」として添付する糊。
// **候補ノートの内容には一切影響しない**（bit一致鉄則＝レポートは items[].meta.lenses への加算のみ）。
// 思想：レンズは審判でない＝弾かず並べ替えるだけ。headline 3値は全て「高い=良い(上位)」に揃う。
import { melodyLenses, type LensNote, type MelodyLenses, type VoiceProfile } from "@cm/music-core";

type LensItem = { kind: string; content: unknown; label: string; meta?: Record<string, unknown> };
type LensResult = { items: LensItem[] };

function itemNotes(it: LensItem): LensNote[] | null {
  const raw = (it.content as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((n): n is { pitch: number; start?: number; dur?: number; syllable?: string } => !!n && Number.isFinite((n as { pitch?: number }).pitch))
    .map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur ?? 0.5, syllable: n.syllable }));
  return out.length ? out : null;
}

// gen_melody 候補への添付：kind==="melody" の各候補に meta.lenses={expectation,hook,singability} を付す。
// profile 既定＝女性ポップ平均（music-core 側 FEMALE_POP_AVG）。voice_profile の frame 宣言は WP-M4。
export function attachMelodyLenses(
  res: LensResult,
  opts: { key?: number; beatsPerBar?: number; sectionRole?: string; profile?: VoiceProfile } = {},
): void {
  for (const it of res.items) {
    if (it.kind !== "melody") continue;
    const notes = itemNotes(it);
    if (!notes) continue;
    const lenses: MelodyLenses = melodyLenses(notes, { key: opts.key, beatsPerBar: opts.beatsPerBar, sectionRole: opts.sectionRole }, opts.profile);
    it.meta = { ...(it.meta ?? {}), lenses };
  }
}
