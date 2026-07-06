// アナリーゼの「学習の出口」：BTC の chords_timeline（[start_sec, end_sec, "A:min"]…）を
// otomemo の chord_progression content（{chords:[{root,quality,start,dur}]}）へ落とす純関数。
// これで「解析したコードを候補ネタで自分で弾き直せる」（usecases-chat ①の要件）を満たす。
// BTC ラベル "A:min" は ":" を外せば既存 parseChordSymbol が食える（"Amin"→{root:9,quality:"m"}）。
import { parseChordSymbol } from "./music/chordname";

export interface ChordSlot { root: number; quality: string; start: number; dur: number }

const PC_BY_NAME: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** 調名("D"/"F#"/"Bb"…) → ピッチクラス(0-11)。読めなければ null。 */
export function pcFromKeyName(name: unknown): number | null {
  if (typeof name !== "string") return null;
  const k = name.trim().replace("♯", "#").replace("♭", "b");
  return PC_BY_NAME[k] ?? null; // 0(C) は ?? で残る（|| だと落ちるので使わない）
}

/**
 * #S11 コードレンズ用：chords_timeline → 全曲マージ済みコード列（拍量子化・最大長制限なし）。
 * 連続同一ルートは1つに畳む（quality = 秒数累積で最長の representative）。
 * N/X（無和音）や不正セグメントは飛ばす。`chordsFromTimeline` の全曲版・研究/集計向け。
 */
export function chordSequenceFromTimeline(timeline: unknown): { root: number; quality: string; dur: number }[] {
  if (!Array.isArray(timeline)) return [];
  // ルート別に同じ連続を畳む。quality は最長累積（秒）を採用。
  type Run = { root: number; qualDurs: Map<string, number> };
  const runs: Run[] = [];
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]);
    const end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", "")); // "A:min"→"Amin"
    if (!parsed) continue; // N/X/解釈不能は無和音として飛ばす
    const dur = end - start;
    const last = runs[runs.length - 1];
    if (last && last.root === parsed.root) {
      // 同ルートの連続→1つのランに蓄積（quality ごとに秒数を足す）
      last.qualDurs.set(parsed.quality, (last.qualDurs.get(parsed.quality) ?? 0) + dur);
    } else {
      const qualDurs = new Map<string, number>();
      qualDurs.set(parsed.quality, dur);
      runs.push({ root: parsed.root, qualDurs });
    }
  }
  // 各ランの代表 quality = 最長累積。dur = そのルートに居た総秒（トニック判定のヒートマップ重み用）。
  return runs.map((run) => {
    let bestQual = "";
    let bestDur = -1;
    let total = 0;
    for (const [q, d] of run.qualDurs) {
      total += d;
      if (d > bestDur) { bestDur = d; bestQual = q; }
    }
    return { root: run.root, quality: bestQual, dur: total };
  });
}

/**
 * chords_timeline → chord_progression の chords。連続同一コードは1つに畳み、各長さを bpm で拍量子化。
 * N/X(無和音)や不正セグメントは飛ばす。maxBeats で先頭抜粋（弾き直せる長さに頭打ち）。
 */
export function chordsFromTimeline(timeline: unknown, bpm: number, maxBeats = 64): ChordSlot[] {
  if (!Array.isArray(timeline)) return [];
  const secPerBeat = 60 / (bpm > 0 ? bpm : 120);
  const out: ChordSlot[] = [];
  let cursor = 0;
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]);
    const end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", "")); // "A:min"→"Amin"
    if (!parsed) continue; // N/X/解釈不能は無和音として飛ばす
    const beats = Math.max(1, Math.round((end - start) / secPerBeat));
    const last = out[out.length - 1];
    if (last && last.root === parsed.root && last.quality === parsed.quality) {
      last.dur += beats; // 直前と同一コード＝延長（畳む）
    } else {
      out.push({ root: parsed.root, quality: parsed.quality, start: cursor, dur: beats });
    }
    cursor += beats;
    if (cursor >= maxBeats) break;
  }
  return out;
}
