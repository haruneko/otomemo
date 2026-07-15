// アナリーゼ「読み筋」層（#S10続 v2.1・2026-07-15）。facts の「射影」を一級の純関数にする。
// buildDigest(facts, interp) = facts + 下流解釈(interp=reaper が既に計算した meter/downbeat/sections/timeline) →
//   digest{ overview, key_segments, chords(度数化), melody, rhythm, bass, spots(見どころ候補) }。
// 契約：**決定的**（乱数なし・入力→出力一意）／**JSON生バイト ~12KB以下**（≈4K tokens・配列は統計/上位N/主ループへ要約）。
// raw／既存 facts 契約は不変＝digest は追加のみ。spots は「候補列挙まで」＝選定と解釈は Claude（深さ優先）。
// 正典＝docs/design.md「決定：アナリーゼ『読み筋』層（#S10続 v2.1）」§1-5・docs/research/2026-07-15-analysis-pedagogy.md §2（見どころ18類型）。
import { detectKeySegments, type ChordsTimeline } from "./localKey";
import { chordSequenceFromTimeline } from "../audio-chords";
import { parseChordSymbol } from "./chordname";
import { resolveTonic } from "../common-progressions";
import { chordPcs, KEY_NAMES } from "./theory";

// ── I/O 契約 ─────────────────────────────────────────────────────────────
/** reaper が既に計算した下流解釈（digest 構築で二重計算しないため受け取る）。 */
export interface DigestInterp {
  bpm: number;
  meter: number;
  /** 小節頭の秒（reaper の anchorSec）。null なら小節番号を出さない。 */
  downbeat: number | null;
  /** サブディビジョン 4=16分 / 3=シャッフル（ext.sub）。 */
  sub?: number | null;
  /** 照合した正準ドラム型（ext.template）。 */
  template?: string | null;
  /** meter 検出信頼度 0..1。 */
  meterConf?: number;
  /** crash 区間分解（reaper の secs）＝{開始秒, 終了秒, 小節数}。 */
  sections: { startSec: number; endSec: number; bars: number }[];
  /** グローバル調（facts.key のパススルー可）。 */
  key?: { key?: string; mode?: string } | null;
  /** chords_timeline（[start,end,label]）。 */
  timeline: ChordsTimeline;
  /** 実ビート時刻（秒）＝食い(M4)の格子。 */
  beatTimes: number[];
}

export interface DigestSpot {
  id: string;                          // H1/H2/H5/M2/M4/R3/F1
  at: { sec: number; bar: number | null }; // 位置（秒＋小節番号併記可能なら）
  fact: string;                        // 度数・具体（"サビ末に iv 借用"）
  conf: number;                        // 0..1
}

export interface Digest {
  overview: string;                    // 1行メタ（BPM/拍子/調/尺/区間数）
  key_segments: { start: number; end: number; key: string; conf: number }[];
  modulation: boolean;                 // 断片化ゲート通過後に >1 セグメント＝転調検出
  chords: {
    key: string;
    freq_top: { deg: string; pct: number }[]; // 度数別頻度（継続長シェア）上位
    main_loop: string[];                       // 最頻の連続4コード（度数）
    sections: { at: string; deg: string[] }[]; // 区間別の主コード度数（各≤8）
    // 監査C2：<1拍で瞬く同ルート7th断片を畳み、「7th含み（継続長シェア=確信度）」として残す注記。
    // argmax で消えた 7th の不確実性シグナルを継続長で代替回収（BTC softmax の代わり）。
    seventh_hints?: { deg: string; conf: number }[];
  };
  melody: {
    range: { low: string; high: string; span_semitones: number } | null;
    contour: { mean_abs_interval: number; up_ratio: number; max_leap: number } | null;
    density_notes_per_bar: number | null;
    non_chord_tone_rate: number | null;
    note_count: number;
  } | null;
  rhythm: {
    meter: number; sub: number | null; template: string | null;
    crash_interval_sec: number | null;
    onset_counts: { kick: number; snare: number; hihat: number };
  };
  bass: {
    range: { low: string; high: string } | null;
    kick_lock_rate: number | null;     // R3 素値
    note_count: number;
  } | null;
  spots: DigestSpot[];
}

// ── 補助 ────────────────────────────────────────────────────────────────
const PITCH = KEY_NAMES;
const CHROMA_DEG = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];
const MINORISH = new Set(["m", "m7", "m6", "mM7", "m7b5", "dim", "dim7"]);
const mmss = (t: number) => { const s = Math.max(0, Math.round(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const round = (x: number, d = 3) => { const k = 10 ** d; return Math.round(x * k) / k; };
const noteName = (midi: number) => `${PITCH[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;
const keyName = (pc: number, mode: string) => `${PITCH[((pc % 12) + 12) % 12]} ${mode}`;

/** 度数(半音)＋quality → ローマ数字ラベル（マイナー系は小文字）。 */
function degLabel(semi: number, quality: string): string {
  const base = CHROMA_DEG[((semi % 12) + 12) % 12]!;
  const lab = MINORISH.has(quality) ? base.toLowerCase() : base;
  const suf = quality === "7" ? "7" : quality === "maj7" ? "M7" : quality === "m7" ? "7"
    : quality === "dim" || quality === "dim7" ? "°" : quality === "m7b5" ? "ø" : "";
  // 小文字化で "♭" が消えないよう base 側の accidental は保持（toLowerCase は半角英字のみ変換）
  return lab + suf;
}

/** quality の機能ファミリ（diatonic 照合用）。 */
type Family = "maj" | "min" | "dom" | "dim" | "other";
function family(q: string): Family {
  if (q === "" || q === "maj7" || q === "6" || q === "sus2" || q === "sus4") return "maj";
  if (q === "m" || q === "m7" || q === "m6" || q === "mM7") return "min";
  if (q === "7" || q === "aug7") return "dom";
  if (q === "dim" || q === "dim7" || q === "m7b5") return "dim";
  return "other";
}

/** 調のダイアトニック「度数(半音):ファミリ」集合。V は maj/dom 両許容、短調は自然v/V7・♭VII 等を許容。 */
function diatonicSet(mode: "major" | "minor"): Set<string> {
  const s = new Set<string>();
  if (mode === "major") {
    // I IIm IIIm IV V(V7) VIm VII°
    [[0, "maj"], [2, "min"], [4, "min"], [5, "maj"], [7, "maj"], [7, "dom"], [9, "min"], [11, "dim"]]
      .forEach(([d, f]) => s.add(`${d}:${f}`));
  } else {
    // i ii° ♭III iv v/V7 ♭VI ♭VII vii°
    [[0, "min"], [2, "dim"], [3, "maj"], [5, "min"], [7, "min"], [7, "dom"], [8, "maj"], [10, "maj"], [11, "dim"]]
      .forEach(([d, f]) => s.add(`${d}:${f}`));
  }
  return s;
}

interface Run { root: number; quality: string; start: number; end: number }
/** timeline → 連続同一(root,quality)を畳んだ run 列（秒付き）。N.C./解釈不能は除外。 */
function timelineRuns(timeline: ChordsTimeline): Run[] {
  const out: Run[] = [];
  for (const seg of timeline) {
    if (!Array.isArray(seg) || seg.length < 3) continue;
    const start = Number(seg[0]), end = Number(seg[1]);
    if (!(end > start)) continue;
    const p = parseChordSymbol(String(seg[2] ?? "").replace(":", ""));
    if (!p) continue;
    const last = out[out.length - 1];
    if (last && last.root === p.root && last.quality === p.quality) last.end = end;
    else out.push({ root: p.root, quality: p.quality, start, end });
  }
  return out;
}

/** quality が 7th/テンションを含むか（"含み" 判定用）。 */
const SEVENTHISH = new Set(["7", "maj7", "m7", "mM7", "m7b5", "dim7", "aug7", "6", "m6"]);

/**
 * 監査C2：<1拍で瞬く断片を継続長重みで畳む（run -11〜23%・偽H1スポットの根治）。
 * (a) ABAサンドイッチ吸収：短い run が同一(root,quality)の隣接に挟まれたら親へ融合。
 * (b) 同ルート隣接吸収：短い run のルートが長い方の隣接と一致→その隣接(=長い方の quality)へ融合。
 *     この時 base三和音↔7th の瞬きは「7th含み」注記（conf=7th側の継続長シェア）として拾う。
 * 閾値＝1拍(secPerBeat)。secPerBeat≤0（BPM不明）は畳まない（安全側）。timeline 原本は不変（純関数・可逆）。
 */
function foldFlickers(runs: Run[], secPerBeat: number): { runs: Run[]; sevenths: { root: number; quality: string; share: number }[] } {
  const sevenths: { root: number; quality: string; share: number }[] = [];
  if (runs.length === 0 || !(secPerBeat > 0)) return { runs, sevenths };
  const cur = runs.map((r) => ({ ...r }));
  const out: Run[] = [];
  for (let i = 0; i < cur.length; i++) {
    const r = cur[i]!;
    const dur = r.end - r.start;
    const prev = out[out.length - 1];
    const next = cur[i + 1];
    if (dur < secPerBeat && (prev || next)) {
      // (a) ABA：前後が同一コード＝短い中身を潰して前後を1つに融合
      if (prev && next && prev.root === next.root && prev.quality === next.quality) {
        prev.end = next.end; i++; continue; // r と next を prev へ吸収
      }
      // (b) 同ルート隣接：長い方の同ルート隣接へ融合（quality は長い方＝継続長多数決）
      const prevSame = !!prev && prev.root === r.root;
      const nextSame = !!next && next.root === r.root;
      if (prevSame || nextSame) {
        const preferPrev = prevSame && (!nextSame || (prev!.end - prev!.start) >= (next!.end - next!.start));
        const host = preferPrev ? prev! : next!;
        // 7th含み注記：base三和音 と 7th の瞬き＝7th 側を継続長シェアで残す
        const rSev = SEVENTHISH.has(r.quality), hSev = SEVENTHISH.has(host.quality);
        if (rSev !== hSev) {
          const sevDur = rSev ? dur : (host.end - host.start);
          const totDur = dur + (host.end - host.start);
          const sevQual = rSev ? r.quality : host.quality;
          sevenths.push({ root: r.root, quality: sevQual, share: totDur > 0 ? sevDur / totDur : 0 });
        }
        if (preferPrev) host.end = r.end; else host.start = r.start; // 時間だけ広げ quality は host 維持
        continue;
      }
    }
    out.push(r);
  }
  return { runs: out, sevenths };
}

// ── メイン ───────────────────────────────────────────────────────────────
export function buildDigest(factsRaw: unknown, interp: DigestInterp): Digest {
  const facts = (factsRaw ?? {}) as {
    bpm?: number; key?: { key?: string; mode?: string }; duration_sec?: number;
    vocal_range?: { note_low?: string | null; note_high?: string | null };
    melody_notes?: [number, number, number][]; bass_notes?: [number, number, number][];
    drum_onsets?: [number, string, number][];
  };
  const timeline = Array.isArray(interp.timeline) ? interp.timeline : [];
  const bpm = interp.bpm > 0 ? interp.bpm : (typeof facts.bpm === "number" ? facts.bpm : 0);
  const meter = interp.meter > 0 ? interp.meter : 4;
  const barLen = bpm > 0 ? (60 / bpm) * meter : 0;
  const downbeat = interp.downbeat;
  const barOf = (t: number): number | null =>
    downbeat != null && barLen > 0 ? Math.max(1, Math.floor((t - downbeat) / barLen) + 1) : null;
  const atOf = (t: number) => ({ sec: round(t, 2), bar: barOf(t) });

  // グローバル調＝**resolveTonic（コード頻度・継続長ヒートマップ）優先**（監査C0の正典是正・2026-07-15）。
  // usecases-chat L94「①調はコードの度数から導く（POC実証・librosa単独は使わない）」＝コードがある限りコード権威。
  // 旧実装は facts.key（analyze.py の K-S chroma 相関＝実測83%）優先・resolveTonic（実測96%）フォールバックで**逆転**していた
  // （蜿蜒＝facts.key=A minor でも iv 首位23.8%の自己矛盾）。コード列が空の時だけ facts.key へフォールバック。
  const seqAll = chordSequenceFromTimeline(timeline);
  let keyPc: number | null;
  let mode: "major" | "minor";
  if (seqAll.length > 0) {
    const rt = resolveTonic(seqAll); keyPc = rt.tonic; mode = rt.mode; // コード頻度権威
  } else {
    keyPc = pcOf(facts.key?.key ?? interp.key?.key); // コード無し＝librosa key へフォールバック
    mode = (facts.key?.mode ?? interp.key?.mode) === "minor" ? "minor" : "major";
    if (keyPc == null) { keyPc = 0; mode = "major"; }
  }
  const keyStr = keyName(keyPc, mode);

  const spots: DigestSpot[] = [];

  // ── key_segments（H5 の土台）＝断片化ゲート付き ──────────────────────────
  const kr = detectKeySegments(timeline);
  const rawSegs = kr.segments;
  const minDwell = rawSegs.length ? Math.min(...rawSegs.map((s) => s.end - s.start)) : Infinity;
  const gated = rawSegs.length === 0 || rawSegs.length > 4 || minDwell < 8; // >4 or 最短滞在<8s → グローバル単一調
  let keySegments: { start: number; end: number; key: string; conf: number }[];
  let modulation = false;
  if (gated) {
    const span0 = timeline.length ? Number(timeline[0]![0]) : 0;
    const span1 = timeline.length ? Number(timeline[timeline.length - 1]![1]) : (facts.duration_sec ?? 0);
    keySegments = [{ start: round(span0, 2), end: round(span1, 2), key: keyStr, conf: 1 }];
  } else {
    keySegments = rawSegs.map((s) => ({ start: round(s.start, 2), end: round(s.end, 2), key: keyName(s.key, s.mode), conf: s.confidence }));
    modulation = rawSegs.length > 1;
    // H5 転調 spot：各切替境界で。fact=「→ 新調」。conf=新セグメント confidence。
    for (let i = 1; i < rawSegs.length; i++) {
      const prev = rawSegs[i - 1]!, cur = rawSegs[i]!;
      spots.push({ id: "H5", at: atOf(cur.start), fact: `転調 ${keyName(prev.key, prev.mode)} → ${keyName(cur.key, cur.mode)}`, conf: round(cur.confidence) });
    }
  }

  // ── chords（度数化・頻度・主ループ・区間別）───────────────────────────
  // 監査C2：<1拍フリッカーを継続長で畳んでから度数化＝ゴミ断片が freq_top/main_loop/spots を汚さない。
  const secPerBeat = bpm > 0 ? 60 / bpm : 0;
  const folded = foldFlickers(timelineRuns(timeline), secPerBeat);
  const runs = folded.runs;
  // 7th含み注記（同ルート瞬きの 7th を継続長シェアで・deg 単位で最大 conf に集約・上位6）
  const sevMap = new Map<string, number>();
  for (const s of folded.sevenths) {
    const deg = degLabel(((s.root - keyPc + 12) % 12), s.quality);
    sevMap.set(deg, Math.max(sevMap.get(deg) ?? 0, s.share));
  }
  const seventhHints = [...sevMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([deg, share]) => ({ deg, conf: round(share, 2) }));
  // 度数別頻度（継続長シェア）
  const degDur = new Map<string, number>();
  let totalDur = 0;
  for (const r of runs) {
    const semi = ((r.root - keyPc + 12) % 12);
    const deg = degLabel(semi, r.quality);
    const d = r.end - r.start;
    degDur.set(deg, (degDur.get(deg) ?? 0) + d);
    totalDur += d;
  }
  const freqTop = [...degDur.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([deg, d]) => ({ deg, pct: totalDur > 0 ? round(d / totalDur, 3) : 0 }));
  // 主ループ＝度数列の最頻の連続4-gram（決定的）
  const degSeq = runs.map((r) => degLabel(((r.root - keyPc + 12) % 12), r.quality));
  const mainLoop = topNgram(degSeq, 4);
  // 区間別の主コード度数（各区間先頭≤8・区間が無ければ空）
  const chordSections = interp.sections.slice(0, 12).map((sec) => {
    const inSec = runs.filter((r) => r.start < sec.endSec && r.end > sec.startSec)
      .map((r) => degLabel(((r.root - keyPc + 12) % 12), r.quality));
    return { at: mmss(sec.startSec), deg: dedupeAdjacent(inSec).slice(0, 8) };
  });

  // ── H1 借用 / H2 セカンダリドミナント ─────────────────────────────────
  const dia = diatonicSet(mode);
  const seenBorrow = new Set<string>();
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    const semi = ((r.root - keyPc + 12) % 12);
    const fam = family(r.quality);
    const inDia = dia.has(`${semi}:${fam}`);
    if (fam === "dom") {
      // H2：非ダイアトニック属7が「5度下/半音下のダイアトニックコード」へ解決
      const next = runs[i + 1];
      if (!inDia && next) {
        const targetDown5 = (r.root + 5) % 12;  // 完全4度上＝5度下解決
        const targetDownHalf = (r.root + 11) % 12; // 裏コード＝半音下解決
        const nextRoot = next.root % 12;
        const nextFam = family(next.quality);
        const nSemi = ((next.root - keyPc + 12) % 12);
        const nextDia = dia.has(`${nSemi}:${nextFam}`);
        if ((nextRoot === targetDown5 || nextRoot === targetDownHalf) && nextDia) {
          spots.push({ id: "H2", at: atOf(r.start), fact: `セカンダリドミナント ${degLabel(semi, "7")} → ${degLabel(nSemi, next.quality)}`, conf: 0.7 });
        }
      }
      continue; // 属7は H1 の対象外（H2 で扱う）
    }
    if (!inDia && (fam === "maj" || fam === "min")) {
      const deg = degLabel(semi, r.quality);
      const dur = r.end - r.start;
      // 監査C2：<1拍の断片は借用と見なさない（fold 後も残る非ABA短片＝BTCノイズ）。secPerBeat 不明時は従来どおり通す。
      if (!seenBorrow.has(deg) && (secPerBeat <= 0 || dur >= secPerBeat)) {
        seenBorrow.add(deg);
        spots.push({ id: "H1", at: atOf(r.start), fact: `借用和音 ${deg}（非ダイアトニック）`, conf: round(Math.min(0.85, 0.4 + dur / (barLen || 2) * 0.15)) });
      }
    }
  }

  // ── melody ─────────────────────────────────────────────────────────────
  const mel = Array.isArray(facts.melody_notes) ? facts.melody_notes.filter((n) => Array.isArray(n) && n.length >= 3) : [];
  let melody: Digest["melody"] = null;
  if (mel.length > 0) {
    const midis = mel.map((n) => n[2]);
    const sorted = [...midis].sort((a, b) => a - b);
    const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
    const lo = p(0.05), hi = p(0.95);
    const range = facts.vocal_range?.note_low && facts.vocal_range?.note_high
      ? { low: facts.vocal_range.note_low, high: facts.vocal_range.note_high, span_semitones: hi - lo }
      : { low: noteName(lo), high: noteName(hi), span_semitones: hi - lo };
    // 輪郭統計
    let absSum = 0, ups = 0, moves = 0, maxLeap = 0;
    for (let i = 1; i < midis.length; i++) {
      const d = midis[i]! - midis[i - 1]!;
      absSum += Math.abs(d); maxLeap = Math.max(maxLeap, Math.abs(d));
      if (d !== 0) { moves++; if (d > 0) ups++; }
    }
    const contour = midis.length > 1
      ? { mean_abs_interval: round(absSum / (midis.length - 1), 2), up_ratio: moves ? round(ups / moves, 2) : 0, max_leap: maxLeap }
      : null;
    // 密度（notes/bar）
    const totalBars = interp.sections.reduce((s, x) => s + x.bars, 0)
      || (barLen > 0 && facts.duration_sec ? facts.duration_sec / barLen : 0);
    const density = totalBars > 0 ? round(mel.length / totalBars, 2) : null;
    // 非和声音率（melody 頭のコードトーン外れ）
    const nct = nonChordToneRate(mel, timeline);
    melody = { range, contour, density_notes_per_bar: density, non_chord_tone_rate: nct, note_count: mel.length };

    // ── M2 音域設計（sections × melody）──────────────────────────────────
    if (interp.sections.length > 0) {
      let bestSec = -1, bestHi = -Infinity, bestT = 0;
      const perSec: string[] = [];
      interp.sections.forEach((sec, si) => {
        const inSec = mel.filter((n) => n[0] >= sec.startSec && n[0] < sec.endSec);
        if (inSec.length) {
          const secHi = Math.max(...inSec.map((n) => n[2]));
          perSec.push(`${mmss(sec.startSec)}:${noteName(secHi)}`);
          if (secHi > bestHi) { bestHi = secHi; bestSec = si; bestT = inSec.find((n) => n[2] === secHi)![0]; }
        }
      });
      if (bestSec >= 0) {
        spots.push({ id: "M2", at: atOf(bestT), fact: `最高音 ${noteName(bestHi)} は第${bestSec + 1}区間（${mmss(interp.sections[bestSec]!.startSec)}）。区間別トップ ${perSec.slice(0, 8).join(" ")}`, conf: 0.6 });
      }
    }

    // ── M4 食い（メロ onset が beat格子/コード変化を 16分前後で先取り）───────
    const anticip = anticipationRate(mel, interp.beatTimes, runs, bpm);
    if (anticip != null && anticip.rate >= 0.12) {
      spots.push({ id: "M4", at: atOf(anticip.firstT), fact: `メロの食い（前ノリ）率 ${Math.round(anticip.rate * 100)}%（16分先取り）`, conf: round(Math.min(0.85, anticip.rate + 0.2)) });
    }
  }

  // ── bass ─────────────────────────────────────────────────────────────
  const bassN = Array.isArray(facts.bass_notes) ? facts.bass_notes.filter((n) => Array.isArray(n) && n.length >= 3) : [];
  const drums = Array.isArray(facts.drum_onsets) ? facts.drum_onsets.filter((o) => Array.isArray(o) && o.length >= 2) : [];
  const kicks = drums.filter((o) => o[1] === "kick").map((o) => o[0]).sort((a, b) => a - b);
  let bass: Digest["bass"] = null;
  if (bassN.length > 0) {
    const bm = bassN.map((n) => n[2]);
    const range = { low: noteName(Math.min(...bm)), high: noteName(Math.max(...bm)) };
    let lock: number | null = null;
    if (kicks.length > 0) {
      let matched = 0;
      for (const n of bassN) if (nearestGap(n[0], kicks) <= 0.05) matched++;
      lock = round(matched / bassN.length, 3);
      // ── R3 ベース×キック絡み ──────────────────────────────────────────
      spots.push({ id: "R3", at: atOf(bassN[0]![0]), fact: `ベースとキックの一致率 ${Math.round(lock * 100)}%（±50ms）`, conf: round(Math.min(0.85, Math.abs(lock - 0.5) * 1.4 + 0.3)) });
    }
    bass = { range, kick_lock_rate: lock, note_count: bassN.length };
  }

  // ── rhythm ─────────────────────────────────────────────────────────────
  const crashes = drums.filter((o) => o[1] === "crash").map((o) => o[0]).sort((a, b) => a - b);
  let crashInterval: number | null = null;
  if (crashes.length >= 2) { let s = 0; for (let i = 1; i < crashes.length; i++) s += crashes[i]! - crashes[i - 1]!; crashInterval = round(s / (crashes.length - 1), 2); }
  const rhythm = {
    meter, sub: interp.sub ?? null, template: interp.template ?? null,
    crash_interval_sec: crashInterval,
    onset_counts: {
      kick: kicks.length,
      snare: drums.filter((o) => o[1] === "snare").length,
      hihat: drums.filter((o) => o[1] === "hihat").length,
    },
  };

  // ── F1 小節数非対称 ──────────────────────────────────────────────────
  if (interp.sections.length >= 2) {
    const bars = interp.sections.map((s) => s.bars);
    const uniq = new Set(bars);
    if (uniq.size > 1) {
      // 全て 4 or 8 の倍数で揃っているなら「均整」＝spot にしない
      const allPow = bars.every((b) => b % 4 === 0);
      if (!allPow || uniq.size >= 3) {
        spots.push({ id: "F1", at: atOf(interp.sections[0]!.startSec), fact: `区間小節数が不揃い ${bars.join("/")}（対称でない）`, conf: round(Math.min(0.7, 0.3 + uniq.size * 0.1)) });
      }
    }
  }

  // spots：id 昇順→時刻昇順で決定的に整列
  spots.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.at.sec - b.at.sec));

  const overview = `BPM ${bpm ? Math.round(bpm) : "?"} / ${meter}拍子 / ${keyStr} / ${facts.duration_sec ? mmss(facts.duration_sec) : "?"} / ${interp.sections.length}区間`;

  return {
    overview,
    key_segments: keySegments,
    modulation,
    chords: { key: keyStr, freq_top: freqTop, main_loop: mainLoop, sections: chordSections, ...(seventhHints.length ? { seventh_hints: seventhHints } : {}) },
    melody,
    rhythm,
    bass,
    spots,
  };
}

// ── ローカルヘルパ ─────────────────────────────────────────────────────
function pcOf(name: unknown): number | null {
  if (typeof name !== "string" || !name.trim()) return null;
  const k = name.trim().replace("♯", "#").replace("♭", "b");
  const map: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  return map[k] ?? null;
}

/** 連続する同一トークンを1つに畳む。 */
function dedupeAdjacent(xs: string[]): string[] {
  const out: string[] = [];
  for (const x of xs) if (out[out.length - 1] !== x) out.push(x);
  return out;
}

/** 最頻の連続 n-gram（同点は最初に出現した方）。列長 < n なら列全体（重複除去）。 */
function topNgram(seq: string[], n: number): string[] {
  const dd = dedupeAdjacent(seq);
  if (dd.length < n) return dd.slice(0, n);
  const count = new Map<string, number>();
  const first = new Map<string, number>();
  for (let i = 0; i + n <= dd.length; i++) {
    const key = dd.slice(i, i + n).join(",");
    count.set(key, (count.get(key) ?? 0) + 1);
    if (!first.has(key)) first.set(key, i);
  }
  let best = "", bestC = 0, bestFirst = Infinity;
  for (const [k, c] of count) if (c > bestC || (c === bestC && first.get(k)! < bestFirst)) { best = k; bestC = c; bestFirst = first.get(k)!; }
  return best ? best.split(",") : dd.slice(0, n);
}

/** melody 頭のコードトーン外れ率（timeline のコード上）。 */
function nonChordToneRate(mel: [number, number, number][], timeline: ChordsTimeline): number | null {
  const spans = timelineRuns(timeline);
  if (spans.length === 0) return null;
  let out = 0, total = 0;
  for (const [t, , midi] of mel) {
    const sp = spans.find((s) => t >= s.start && t < s.end);
    if (!sp) continue;
    const pcs = new Set(chordPcs(sp.root, sp.quality));
    total++;
    if (!pcs.has(((Math.round(midi) % 12) + 12) % 12)) out++;
  }
  return total > 0 ? round(out / total, 3) : null;
}

/** メロ onset が beat格子/コード変化を 16分前後で先取りする率。 */
function anticipationRate(
  mel: [number, number, number][], beatTimes: number[], runs: Run[], bpm: number,
): { rate: number; firstT: number } | null {
  if (bpm <= 0) return null;
  const sixteenth = (60 / bpm) / 4;
  const grid = [...beatTimes, ...runs.map((r) => r.start)].sort((a, b) => a - b);
  if (grid.length === 0) return null;
  const loW = sixteenth * 0.4, hiW = sixteenth * 1.6; // 「16分前後」の先取り窓
  let anticip = 0, firstT = 0;
  for (const [t] of mel) {
    // t より後で最も近い格子点との差（格子点 g に対し g - t が先取り量）
    let bestLead = Infinity;
    for (const g of grid) { const lead = g - t; if (lead > 0 && lead < bestLead) bestLead = lead; }
    if (bestLead >= loW && bestLead <= hiW) { if (!anticip) firstT = t; anticip++; }
  }
  return { rate: round(anticip / mel.length, 3), firstT };
}

/** t と昇順配列 arr の最近傍要素との絶対差（秒）。 */
function nearestGap(t: number, arr: number[]): number {
  let best = Infinity;
  for (const x of arr) { const d = Math.abs(x - t); if (d < best) best = d; else if (x > t) break; }
  return best;
}
