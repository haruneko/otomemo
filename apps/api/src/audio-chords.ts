// アナリーゼの「学習の出口」：BTC の chords_timeline（[start_sec, end_sec, "A:min"]…）を
// otomemo の chord_progression content（{chords:[{root,quality,start,dur}]}）へ落とす純関数。
// これで「解析したコードを候補ネタで自分で弾き直せる」（usecases-chat ①の要件）を満たす。
// BTC ラベル "A:min" は ":" を外せば既存 parseChordSymbol が食える（"Amin"→{root:9,quality:"m"}）。
import { parseChordSymbol } from "./music/chordname";
import { chordPcs } from "./music/theory";

// bass? = スラッシュコードの最低音pc（転回・#2）／source = 由来（btc=確定 / slash=転回 / bass-root=ルート補正）。
export interface ChordSlot { root: number; quality: string; start: number; dur: number; bass?: number; source?: "btc" | "slash" | "bass-root" }

/** [s,e]区間で最も長く鳴っているベースpc＋その区間比（frac）。ベース無し→null。pc=mod12＝octave誤りに頑健。 */
function dominantBassPc(bassNotes: [number, number, number][], s: number, e: number): { pc: number; frac: number } | null {
  const span = e - s;
  if (span <= 0) return null;
  const byPc = new Map<number, number>();
  for (const [bs, be, midi] of bassNotes) {
    const ov = Math.min(e, be) - Math.max(s, bs);
    if (ov <= 0) continue;
    const pc = (((Math.round(midi) % 12) + 12) % 12);
    byPc.set(pc, (byPc.get(pc) ?? 0) + ov);
  }
  let bestPc = -1, bestT = 0;
  for (const [pc, t] of byPc) if (t > bestT) { bestT = t; bestPc = pc; }
  return bestPc < 0 ? null : { pc: bestPc, frac: bestT / span };
}

/**
 * #S12改3 ベースでコード進行を精緻化（フィジビリ実証＝bassは9割コードトーン・8割弱ルート）。
 * 各コード区間の支配的ベースpcで：(2)転回＝bassがコードトーン(≠ルート)なら slash(`bass`)／
 * (1)ルート補正＝bassがコードトーン**でなく**強く支配的(≥corrStrength)なら bass をルートに置換(quality保持・source=bass-root)。
 * ※裏取りの要点＝root不一致の大半は転回ゆえ、**非コードトーンの時だけ再ルート**（転回を誤補正しない）。
 * bassがルート/弱い/無し＝BTC を信頼(source=btc)。N/X は従来どおり飛ばす（空白穴埋め#3は対象外）。
 */
export function refineChordsWithBass(
  timeline: unknown,
  bassNotes: [number, number, number][],
  bpm: number,
  opts: { maxBeats?: number; slashStrength?: number; corrStrength?: number } = {},
): ChordSlot[] {
  if (!Array.isArray(timeline)) return [];
  const secPerBeat = 60 / (bpm > 0 ? bpm : 120);
  const maxBeats = opts.maxBeats ?? 64;
  const slashStrength = opts.slashStrength ?? 0.4; // slash 付与に要るベース支配比
  const corrStrength = opts.corrStrength ?? 0.6;   // ルート補正はより強く支配的な時だけ（誤補正回避）
  const bass = Array.isArray(bassNotes) ? bassNotes : [];
  const out: ChordSlot[] = [];
  let cursor = 0;
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]), end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", ""));
    if (!parsed) continue; // N/X は飛ばす
    let root = parsed.root, quality = parsed.quality, slashBass: number | undefined, source: ChordSlot["source"] = "btc";
    const dom = bass.length ? dominantBassPc(bass, start, end) : null;
    if (dom && dom.pc !== root) {
      const tones = chordPcs(root, quality);
      if (tones.includes(dom.pc)) {
        if (dom.frac >= slashStrength) { slashBass = dom.pc; source = "slash"; } // (2)転回
      } else if (dom.frac >= corrStrength) {
        root = dom.pc; source = "bass-root"; // (1)ルート補正＝非コードトーンかつ強支配
      }
    }
    const beats = Math.max(1, Math.round((end - start) / secPerBeat));
    const last = out[out.length - 1];
    if (last && last.root === root && last.quality === quality && last.bass === slashBass) {
      last.dur += beats; // 直前と同一（slash含む）＝畳む
    } else {
      out.push({ root, quality, start: cursor, dur: beats, ...(slashBass != null ? { bass: slashBass } : {}), source });
    }
    cursor += beats;
    if (cursor >= maxBeats) break;
  }
  return out;
}

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
