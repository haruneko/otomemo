// 対位法レポートの生成側露出（design #20 S3d・2026-07-11）。analyzeVoiceLeading（分析のみ・純関数）を
// gen_melody / gen_bass の候補へ「読み取り専用のメタ」として添付する糊。**候補ノートの内容には一切影響しない**
// （bit一致鉄則＝レポートは items[].meta への加算のみ）。lower（実効ベース）の解決順は resolveLowerVoice を参照。
// 「機械は指摘まで・断は人間」＝score が低くても候補は出す/置ける（禁止しない）。
import { analyzeVoiceLeading, type VoiceLeadingReport } from "./voiceLeading";
import { explicitBassSegments, expandDominion, foldBassPitch, type SkeletonContent } from "./skeletonNeta";
import { normRoot } from "./theory";
import { type Note } from "@cm/music-core"; // 音符基本形の SSOT（負債#10・Note型一元化）

type Chord = { root?: number | string; quality?: string; start?: number; dur?: number };
type MaybeNote = { pitch?: number; start?: number; dur?: number };

export interface VoiceLeadingMeta {
  voiceLeading: VoiceLeadingReport; // 数値レポート（score・違反件数・箇所）。
  voiceLeadingSummary: string; // 簡潔サマリ（例「並行5度1・交差1・score0.92」／違反なしは「違反なし・scoreX」）。
}

// レポート→サマリ文字列（Claude/MCP 消費者向けの人間可読。web はバッジを数値から自前整形する）。
export function summarizeVoiceLeading(rep: VoiceLeadingReport): string {
  const parts: string[] = [];
  if (rep.parallelFifths) parts.push(`並行5度${rep.parallelFifths}`);
  if (rep.parallelOctaves) parts.push(`並行8度${rep.parallelOctaves}`);
  if (rep.directFifths) parts.push(`直行5度${rep.directFifths}`);
  if (rep.directOctaves) parts.push(`直行8度${rep.directOctaves}`);
  if (rep.voiceCrossings) parts.push(`交差${rep.voiceCrossings}`);
  return `${parts.length ? parts.join("・") : "違反なし"}・score${rep.score.toFixed(2)}`;
}

// コード根（pc）を時刻 t で（start ≤ t の最後のコード）。無ければ null。
function chordRootPcAt(chords: Chord[], t: number): number | null {
  let pc: number | null = null;
  let best = -Infinity;
  for (const c of chords) { const s = c.start ?? 0; if (s <= t + 1e-9 && s >= best) { best = s; pc = normRoot(c.root ?? 0); } }
  return pc;
}

// 実効下声（lower）の解決＝**同一section の実効2声**を作る。優先順（design #20 S3d）：
//  (a) body に bass notes（明示ベーストラック）があればそれ＝そのまま。
//  (b) 骨格の明示ベース区間（explicitBassSegments）＋コード root 導出のマージ＝「書いた区間だけ上書き・省略はコード導出」。
//      骨格ベース休符(pitch:null)区間は下声なし。導出ピッチは 36+root（低域代用）、明示ピッチは foldBassPitch で低域窓へ畳む。
//  (c) chords の root を低域(36+pc)で代用（http/mcp analyze_voiceleading の既存流儀）。
// どれも無ければ null＝レポート無し＝web 表示無し。
export function resolveLowerVoice(opts: {
  bass?: MaybeNote[] | null;
  skeleton?: SkeletonContent | null;
  chords?: Chord[] | null;
  beatsPerBar?: number;
}): Note[] | null {
  // (a) 明示ベーストラック
  const bass = (opts.bass ?? []).filter((n): n is MaybeNote => !!n && Number.isFinite(n.pitch));
  if (bass.length) return bass.map((n) => ({ pitch: n.pitch as number, start: n.start ?? 0, dur: n.dur ?? 1 }));

  const chords = (opts.chords ?? []).filter((c): c is Chord => c != null);
  const bpb = opts.beatsPerBar ?? 4;
  const skel = opts.skeleton ?? undefined;

  // (b) 骨格の明示ベース＋コード導出のマージ（明示区間がある場合のみ）
  const segs = skel ? explicitBassSegments(skel, { beatsPerBar: bpb }) : [];
  if (segs.length) {
    const total = skel ? skel.bars * bpb : 0;
    const bounds = new Set<number>([0]);
    for (const c of chords) bounds.add(c.start ?? 0);
    for (const s of segs) { bounds.add(s.start); bounds.add(s.start + s.dur); }
    if (total > 0) bounds.add(total);
    const cap = total > 0 ? total : Math.max(0, ...[...bounds]) + 1; // 曲末（骨格 bars 基準・防御的フォールバック）
    const ts = [...bounds].filter((t) => t >= 0 && t < cap - 1e-9).sort((a, b) => a - b);
    const out: Note[] = [];
    for (let i = 0; i < ts.length; i++) {
      const t0 = ts[i]!;
      const t1 = i + 1 < ts.length ? ts[i + 1]! : cap;
      if (t1 <= t0 + 1e-9) continue;
      const seg = segs.find((s) => t0 >= s.start - 1e-9 && t0 < s.start + s.dur - 1e-9);
      let pitch: number | null;
      if (seg) pitch = seg.pitch == null ? null : foldBassPitch(seg.pitch); // 明示（休符=null は下声なし）
      else { const pc = chordRootPcAt(chords, t0); pitch = pc == null ? null : 36 + pc; } // 導出
      if (pitch == null) continue; // 休符/コード不在＝この区間は下声なし
      out.push({ pitch, start: t0, dur: t1 - t0 });
    }
    return out.length ? out : null;
  }

  // (c) コード root 低域代用
  if (chords.length) {
    const out = chords.map((c) => ({ pitch: 36 + normRoot(c.root ?? 0), start: c.start ?? 0, dur: c.dur ?? 1 }));
    return out.length ? out : null;
  }
  return null;
}

// 骨格 tones（上声＝Urlinie 近似）を Note[] 化＝gen_bass の対位相手（上声）。骨格休符(null)は除外。
export function skeletonUpperVoice(skel: SkeletonContent, beatsPerBar = 4): Note[] {
  return expandDominion(skel, { beatsPerBar })
    .filter((s) => s.pitch != null)
    .map((s) => ({ pitch: s.pitch as number, start: s.start, dur: s.dur }));
}

type VLItem = { content: unknown; meta?: Record<string, unknown> };
type VLResult = { items: VLItem[] };

function itemNotes(it: VLItem): Note[] | null {
  const raw = (it.content as { notes?: unknown } | null)?.notes;
  if (!Array.isArray(raw)) return null;
  const out = raw
    .filter((n): n is MaybeNote => !!n && Number.isFinite((n as MaybeNote).pitch))
    .map((n) => ({ pitch: n.pitch as number, start: n.start ?? 0, dur: n.dur ?? 1 }));
  return out.length ? out : null;
}

function setMeta(it: VLItem, rep: VoiceLeadingReport): void {
  it.meta = { ...(it.meta ?? {}), voiceLeading: rep, voiceLeadingSummary: summarizeVoiceLeading(rep) };
}

// gen_melody 候補への添付：upper=各候補ノート・lower=解決した実効ベース（全候補で共通）。lower 無し＝添付スキップ。
export function attachMelodyVoiceLeading(
  res: VLResult,
  opts: { bass?: MaybeNote[] | null; skeleton?: SkeletonContent | null; chords?: Chord[] | null; beatsPerBar?: number },
): void {
  const lower = resolveLowerVoice(opts);
  if (!lower || !lower.length) return;
  for (const it of res.items) { const up = itemNotes(it); if (up) setMeta(it, analyzeVoiceLeading(up, lower)); }
}

// gen_bass 返りへの添付：lower=生成ベース・upper=骨格 tones（メロ骨格）。骨格無し＝対位相手が無い＝添付スキップ。
export function attachBassVoiceLeading(res: VLResult, opts: { skeleton?: SkeletonContent | null; beatsPerBar?: number }): void {
  if (!opts.skeleton) return;
  const upper = skeletonUpperVoice(opts.skeleton, opts.beatsPerBar ?? 4);
  if (!upper.length) return;
  for (const it of res.items) { const low = itemNotes(it); if (low) setMeta(it, analyzeVoiceLeading(upper, low)); }
}
