// 連想エンジン 土台v：メロ×コードの当てはまり判定＋外し音補正（worker analyze.py/correct.py の TS移植）。
// 純TS・決定的。「メロが変→直す」「メロに合うコード（ハモ付け）」の足場。#86＝判定が提案の前提。
import { type Chord, type KeyCandidate, chordPcs, normRoot, scalePcs, rankKeys, KEY_NAMES } from "./theory";

export type Note = { pitch: number; start?: number; dur?: number };
export type NCT = { type: "passing" | "neighbor" | "suspension" | "other"; pos: number; pitch: number };
export type FitResult = {
  key: number;
  mode: "major" | "minor";
  inChordRate: number;
  nonChordTones: NCT[];
  scaleOutsideRate: number;
  score: number;
  issues: { pos: number; pitch: number; type: string; msg: string }[];
};

const onBeat = (start: number) => Math.abs(start - Math.round(start)) < 1e-6;

function chordAt(t: number, chords: Chord[]): Chord | null {
  for (const c of chords) {
    const s = Number(c.start ?? 0);
    const d = Number(c.dur ?? 0);
    if (s <= t && t < s + d) return c;
  }
  return null;
}

// 非和声音の種類（到来/離脱の音程で）。経過/刺繍/掛留/その他（worker _classify_nct と一致）。
function classifyNct(approach: number | null, departure: number | null): NCT["type"] {
  if (approach === null || departure === null) return "other";
  const a = approach;
  const b = departure;
  if (a === 0 && b >= -2 && b < 0) return "suspension";
  if (Math.abs(a) <= 2 && Math.abs(b) <= 2 && a !== 0 && b !== 0) {
    return a > 0 === b > 0 ? "passing" : "neighbor";
  }
  return "other";
}

/** ノート列から調を推定（Krumhansl・music21非依存・worker detect_key の代替）。 */
function noteHist(notes: Note[]): number[] {
  const hist = new Array(12).fill(0) as number[];
  for (const n of (notes ?? []).filter((x) => typeof x.pitch === "number")) {
    const w = typeof n.dur === "number" && n.dur > 0 ? n.dur : 1;
    const pc = ((n.pitch % 12) + 12) % 12;
    hist[pc] = (hist[pc] ?? 0) + w;
  }
  return hist;
}
export function detectKeyFromNotes(notes: Note[]): { key: number; mode: "major" | "minor" } {
  if (!(notes ?? []).some((n) => typeof n.pitch === "number")) return { key: 0, mode: "major" };
  const top = rankKeys(noteHist(notes), 1)[0]!;
  return { key: top.key, mode: top.mode };
}
// 調候補を上位N（相対短調＝Am⇔C 等の曖昧さを候補で出す・特に短調）。
export function detectKeyCandidatesFromNotes(notes: Note[], top = 4): KeyCandidate[] {
  if (!(notes ?? []).some((n) => typeof n.pitch === "number")) return [];
  return rankKeys(noteHist(notes), top);
}

const chordLabel = (c: Chord) => `${KEY_NAMES[normRoot(c.root)]}${c.quality ?? ""}`;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** メロが各コードに当てはまっているかを定量化（worker analyze_fit の移植・純TS）。 */
export function analyzeFit(melody: Note[], chords: Chord[], key?: number): FitResult {
  const notes = (melody ?? [])
    .filter((n) => typeof n.pitch === "number")
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  if (!notes.length) {
    return { key: 0, mode: "major", inChordRate: 0, nonChordTones: [], scaleOutsideRate: 0, score: 0, issues: [] };
  }
  const det = detectKeyFromNotes(notes);
  const keyPc = key === undefined ? det.key : normRoot(key);
  const mode = det.mode;
  const sc = scalePcs(keyPc, mode);

  let covered = 0;
  let inChord = 0;
  let justOut = 0;
  let total = 0;
  let outside = 0;
  const ncts: NCT[] = [];
  const issues: FitResult["issues"] = [];

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const pc = ((n.pitch % 12) + 12) % 12;
    const start = Number(n.start ?? 0);
    const w = Number(n.dur ?? 1) * (onBeat(start) ? 1.5 : 1.0);
    total += w;
    if (!sc.has(pc)) outside += w;
    const c = chordAt(start, chords);
    if (c === null) continue; // コード無し区間は対象外
    covered += w;
    // 分数コード（決定B）：オンベース pc も鳴っている協和音＝当てはまり扱いに含める。
    const consonant = chordPcs(c.root, c.quality ?? "");
    if (c.bass != null) consonant.push(((Math.round(c.bass) % 12) + 12) % 12);
    if (consonant.includes(pc)) {
      inChord += w;
      continue;
    }
    const approach = i > 0 ? n.pitch - notes[i - 1]!.pitch : null;
    const departure = i + 1 < notes.length ? notes[i + 1]!.pitch - n.pitch : null;
    const kind = classifyNct(approach, departure);
    ncts.push({ type: kind, pos: start, pitch: n.pitch });
    if (kind === "passing" || kind === "neighbor" || kind === "suspension") {
      justOut += w;
    } else {
      issues.push({
        pos: start,
        pitch: n.pitch,
        type: kind,
        msg: `${start}拍: ${KEY_NAMES[pc]} がコード(${chordLabel(c)})から浮いている(非和声音/その他)`,
      });
    }
  }

  const inChordRate = covered ? inChord / covered : 0;
  const scaleOutsideRate = total ? outside / total : 0;
  const good = inChord + 0.6 * justOut;
  let score = covered ? good / covered : 1.0 - scaleOutsideRate;
  score = Math.max(0, Math.min(1, score * (1 - 0.25 * scaleOutsideRate)));
  if (scaleOutsideRate > 0.2) {
    issues.push({ pos: -1, pitch: -1, type: "scale", msg: `スケール外の音が多い(${Math.round(scaleOutsideRate * 100)}%)` });
  }
  return {
    key: keyPc,
    mode,
    inChordRate: round3(inChordRate),
    nonChordTones: ncts,
    scaleOutsideRate: round3(scaleOutsideRate),
    score: round3(score),
    issues,
  };
}

// pitch に最も近い MIDI 音で pc が allowed に入るもの（±6半音内・無ければ元のまま）。worker _nearest_pitch と一致。
function nearestPitch(pitch: number, allowed: number[]): number {
  const set = new Set(allowed);
  for (let d = 0; d <= 6; d++) {
    const cands = d === 0 ? [pitch] : [pitch - d, pitch + d];
    for (const cand of cands) if (cand >= 0 && cand <= 127 && set.has(((cand % 12) + 12) % 12)) return cand;
  }
  return pitch;
}

export type FitToChordsResult = { notes: Note[]; before: number; after: FitResult };

/** 非和声音のうち正当でない(other)音だけをコードトーンへスナップ（worker fit_to_chords の移植）。
 * 経過/刺繍/掛留・コードトーンは不変＝「メロが変→直す」。 */
export function fitToChords(melody: Note[], chords: Chord[], key?: number): FitToChordsResult {
  const notes = (melody ?? [])
    .filter((n) => typeof n.pitch === "number")
    .sort((a, b) => Number(a.start ?? 0) - Number(b.start ?? 0));
  const before = analyzeFit(notes, chords, key);
  const bad = new Set(before.nonChordTones.filter((n) => n.type === "other").map((n) => round3(n.pos)));
  const out: Note[] = notes.map((n) => {
    const t = round3(Number(n.start ?? 0));
    const ch = chordAt(t, chords);
    if (ch !== null && bad.has(t)) {
      return { ...n, pitch: nearestPitch(n.pitch, chordPcs(ch.root, ch.quality ?? "")) };
    }
    return { ...n };
  });
  return { notes: out, before: before.score, after: analyzeFit(out, chords, key) };
}
