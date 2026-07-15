// アナリーゼの「学習の出口」：BTC の chords_timeline（[start_sec, end_sec, "A:min"]…）を
// otomemo の chord_progression content（{chords:[{root,quality,start,dur}]}）へ落とす純関数。
// これで「解析したコードを候補ネタで自分で弾き直せる」（usecases-chat ①の要件）を満たす。
// BTC ラベル "A:min" は ":" を外せば既存 parseChordSymbol が食える（"Amin"→{root:9,quality:"m"}）。
import { parseChordSymbol } from "./music/chordname";
import { chordPcs } from "./music/theory";

// bass? = スラッシュコードの最低音pc（転回・#2）／source = 由来（btc=確定 / slash=転回 / bass-root=ルート補正）。
export interface ChordSlot { root: number; quality: string; start: number; dur: number; bass?: number; source?: "btc" | "slash" | "bass-root" }

// 監査C1（2026-07-15）：拍量子化を「bpm スカラー丸め＋累積 cursor」から「実測 beat_times 格子スナップ＋
// anchorSec 起点の拍位置保持」へ。累積ドリフト（Forgiven +12.9s・DeepSea +28.5s の捏造）を消し、
// 和声リズム（小節内のどこでコードが変わるか）を出口まで運ぶ。beatTimes 未指定なら従来の bpm 丸めへ後方互換退避。
/** beat_times の中央値間隔（外れ値に頑健＝ドリフト・6/8 でも安定）。空/単一なら 0.5s。 */
function medianBeatSpacing(bt: number[]): number {
  if (bt.length < 2) return 0.5;
  const diffs: number[] = [];
  for (let i = 1; i < bt.length; i++) { const d = bt[i]! - bt[i - 1]!; if (d > 0) diffs.push(d); }
  if (diffs.length === 0) return 0.5;
  diffs.sort((a, b) => a - b);
  return diffs[diffs.length >> 1]!;
}
/** 時刻 t → 最近傍の拍インデックス（整数）。範囲外は中央値間隔で外挿（負値も許容＝anchor 前）。 */
function beatIndexAt(bt: number[], t: number, spacing: number): number {
  const last = bt.length - 1;
  if (t <= bt[0]!) return Math.round((t - bt[0]!) / spacing);
  if (t >= bt[last]!) return last + Math.round((t - bt[last]!) / spacing);
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (bt[mid]! <= t) lo = mid; else hi = mid; }
  return (t - bt[lo]! <= bt[hi]! - t) ? lo : hi;
}

/** 拍格子オプション（監査C1）：beatTimes を渡すと格子スナップ量子化。anchorSec 起点で小節内位相を保つ。 */
export interface GridOpts { beatTimes?: number[]; anchorSec?: number; meter?: number }

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
  opts: { maxBeats?: number; slashStrength?: number; corrStrength?: number } & GridOpts = {},
): ChordSlot[] {
  if (!Array.isArray(timeline)) return [];
  const secPerBeat = 60 / (bpm > 0 ? bpm : 120);
  const maxBeats = opts.maxBeats ?? 64;
  const slashStrength = opts.slashStrength ?? 0.4; // slash 付与に要るベース支配比
  const corrStrength = opts.corrStrength ?? 0.6;   // ルート補正はより強く支配的な時だけ（誤補正回避）
  const bass = Array.isArray(bassNotes) ? bassNotes : [];
  // 監査C1：beat_times 格子スナップ（未指定なら bpm 丸め・後方互換）。
  const g = gridCtx(opts);
  const out: ChordSlot[] = [];
  let cursor = 0;
  let originIdx: number | null = null;
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]), end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", ""));
    if (!parsed) continue; // N/X は飛ばす
    const quality = parsed.quality;
    // 拍数と start（格子スナップ or bpm 丸め）。
    let beats: number, startBeat: number;
    if (g) {
      const sIdx = beatIndexAt(g.bt, start, g.sp), eIdx = beatIndexAt(g.bt, end, g.sp);
      beats = Math.max(1, eIdx - sIdx);
      if (originIdx === null) originIdx = sIdx - (((sIdx - g.anchorIdx) % g.meter) + g.meter) % g.meter; // 初コードの小節頭
      startBeat = sIdx - originIdx;
    } else {
      beats = Math.max(1, Math.round((end - start) / secPerBeat));
      startBeat = cursor;
    }
    let root = parsed.root, slashBass: number | undefined, source: ChordSlot["source"] = "btc";
    const dom = bass.length ? dominantBassPc(bass, start, end) : null;
    if (dom && dom.pc !== root) {
      const tones = chordPcs(root, quality);
      if (tones.includes(dom.pc)) {
        if (dom.frac >= slashStrength) { slashBass = dom.pc; source = "slash"; } // (2)転回
      } else if (dom.frac >= corrStrength && beats >= 2) {
        // (1)ルート補正＝非コードトーンかつ強支配。監査C3：**run≥2拍ガード**（発火5件中4件が1拍断片・
        // ベース採譜が粗い現状は短断片への再ルート＝ノイズ×ノイズ。転回(slash)はガードせず継続）。
        root = dom.pc; source = "bass-root";
      }
    }
    const last = out[out.length - 1];
    // 格子時は連続性（前スロット末尾と接する）も条件＝N/X 由来の穴を畳まず位相を保つ。
    const contiguous = !g || (last != null && last.start + last.dur === startBeat);
    if (last && contiguous && last.root === root && last.quality === quality && last.bass === slashBass) {
      last.dur += beats; // 直前と同一（slash含む）＝畳む
    } else {
      out.push({ root, quality, start: startBeat, dur: beats, ...(slashBass != null ? { bass: slashBass } : {}), source });
    }
    cursor = startBeat + beats;
    if (cursor >= maxBeats) break;
  }
  return out;
}

/** GridOpts → 格子コンテキスト（有効時のみ）。beatTimes<2 は無効（bpm 丸めへ退避）。 */
function gridCtx(opts: GridOpts): { bt: number[]; sp: number; anchorIdx: number; meter: number } | null {
  const bt = opts.beatTimes;
  if (!Array.isArray(bt) || bt.length < 2) return null;
  const sp = medianBeatSpacing(bt);
  const meter = opts.meter && opts.meter > 0 ? opts.meter : 4;
  const anchorIdx = beatIndexAt(bt, opts.anchorSec ?? bt[0]!, sp);
  return { bt, sp, anchorIdx, meter };
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
export function chordsFromTimeline(timeline: unknown, bpm: number, maxBeats = 64, opts: GridOpts = {}): ChordSlot[] {
  if (!Array.isArray(timeline)) return [];
  const secPerBeat = 60 / (bpm > 0 ? bpm : 120);
  const g = gridCtx(opts); // 監査C1：beat_times 格子スナップ（未指定なら bpm 丸め・後方互換）
  const out: ChordSlot[] = [];
  let cursor = 0;
  let originIdx: number | null = null;
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]);
    const end = Number(seg[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const parsed = parseChordSymbol(String(seg[2] ?? "").replace(":", "")); // "A:min"→"Amin"
    if (!parsed) continue; // N/X/解釈不能は無和音として飛ばす
    let beats: number, startBeat: number;
    if (g) {
      const sIdx = beatIndexAt(g.bt, start, g.sp), eIdx = beatIndexAt(g.bt, end, g.sp);
      beats = Math.max(1, eIdx - sIdx);
      if (originIdx === null) originIdx = sIdx - (((sIdx - g.anchorIdx) % g.meter) + g.meter) % g.meter;
      startBeat = sIdx - originIdx;
    } else {
      beats = Math.max(1, Math.round((end - start) / secPerBeat));
      startBeat = cursor;
    }
    const last = out[out.length - 1];
    const contiguous = !g || (last != null && last.start + last.dur === startBeat);
    if (last && contiguous && last.root === parsed.root && last.quality === parsed.quality) {
      last.dur += beats; // 直前と同一コード＝延長（畳む）
    } else {
      out.push({ root: parsed.root, quality: parsed.quality, start: startBeat, dur: beats });
    }
    cursor = startBeat + beats;
    if (cursor >= maxBeats) break;
  }
  return out;
}
