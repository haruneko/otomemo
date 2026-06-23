// ルールベース生成（#86・design「アーキ是正 決定1」＝生成をTSに一本化）。
// worker(Python)の music/generate.py を忠実移植。Claudeは関与しない（決定的記号エンジン）。
// 乱数は seed 付き（Pythonのbyte等価は不可＝MT vs ここ。musicalルールが等価＝property testで担保）。
import { chordPcs, normRoot, scalePcs } from "./theory";

// 度数 → (ルートpc, quality)。C基準（key=0）。
const DIATONIC_MAJOR: Record<number, [number, string]> = {
  1: [0, ""], 2: [2, "m"], 3: [4, "m"], 4: [5, ""], 5: [7, ""], 6: [9, "m"], 7: [11, "dim"],
};
const DIATONIC_MINOR: Record<number, [number, string]> = {
  1: [0, "m"], 2: [2, "dim"], 3: [3, ""], 4: [5, "m"], 5: [7, "7"], 6: [8, ""], 7: [10, ""],
};
const FUNC_DEGREES: Record<string, number[]> = { T: [1, 6, 3], S: [4, 2], D: [5, 7] };
const FUNC_NEXT: Record<string, string[]> = {
  T: ["S", "S", "D", "D", "T"],
  S: ["D", "D", "D", "S", "T"],
  D: ["T", "T", "T", "D"],
};
const MINOR_HINT = ["切な", "悲", "暗", "哀", "泣", "sad", "dark", "melanchol", "minor", "マイナー"];

export interface Frame {
  key?: number;
  meter?: string;
  tempo?: number;
  bars?: number;
  mood?: string;
}
export interface GenResult {
  items: { kind: string; content: unknown; label: string }[];
  edges: never[];
}

// seed 付き乱数（mulberry32）。Python random と同じ列にはならないが、seed で再現可能＝テスト安定。
class Rng {
  private s: number;
  constructor(seed?: number | null) {
    this.s = (seed ?? 0x9e3779b9) >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  choices<T>(arr: readonly T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i]!;
      if (r < 0) return arr[i]!;
    }
    return arr[arr.length - 1]!;
  }
}

export function normalizeFrame(frame?: Frame | null): Frame {
  const f = frame ?? {};
  const out: Frame = {};
  if (typeof f.key === "number" && f.key >= 0 && f.key <= 11) out.key = Math.trunc(f.key);
  if (f.meter) out.meter = String(f.meter);
  if (typeof f.tempo === "number" && f.tempo > 0) out.tempo = f.tempo;
  if (typeof f.bars === "number") out.bars = Math.max(1, Math.min(16, Math.trunc(f.bars)));
  if (f.mood) out.mood = String(f.mood);
  return out;
}

function beatsPerBar(meter?: string): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return 4;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? n * (4 / d) : 4;
}

const isMinorMood = (mood: string): boolean =>
  MINOR_HINT.some((h) => mood.toLowerCase().includes(h) || mood.includes(h));
const barsOf = (frame: Frame): number =>
  typeof frame.bars === "number" && frame.bars ? Math.max(1, Math.min(16, Math.trunc(frame.bars))) : 4;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** 機能和声ルールでコード進行を生成（T始まり・T終わり）。返り #85 items 形。 */
export function genChords(frame?: Frame | null, seed?: number | null): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed);
  const mood = f.mood ?? "";
  const minor = isMinorMood(mood);
  const table = minor ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);

  const funcs: string[] = ["T"];
  for (let i = 0; i < bars - 1; i++) funcs.push(rng.choice(FUNC_NEXT[funcs[funcs.length - 1]!]!));
  if (bars >= 2) funcs[funcs.length - 1] = "T";
  const degrees: number[] = funcs.map((fn) => {
    const cands = FUNC_DEGREES[fn]!;
    return rng.choices(cands, [3, 2, 1].slice(0, cands.length));
  });
  degrees[0] = 1;
  if (bars >= 2) degrees[degrees.length - 1] = 1;

  const chords = degrees.map((deg, i) => {
    const [root, quality] = table[deg]!;
    return { root, quality, start: round3(i * bpb), dur: round3(bpb) };
  });
  const label = (mood ? mood + "コード進行" : minor ? "マイナーの進行" : "コード進行").slice(0, 24);
  return { items: [{ kind: "chord_progression", content: { chords }, label }], edges: [] };
}

function chordAt(t: number, chords?: { root?: number; quality?: string; start?: number; dur?: number }[]) {
  for (const c of chords ?? []) {
    const s = Number(c.start ?? 0);
    const d = Number(c.dur ?? 0);
    if (s <= t && t < s + d) return c;
  }
  return null;
}

/** コードトーン拘束のメロディ（拍頭=コードトーン、間=スケール音で順次）。返り #85 items 形。 */
export function genMelody(
  frame?: Frame | null,
  chords?: { root?: number; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed);
  const mood = f.mood ?? "";
  const minor = isMinorMood(mood);
  const scale = scalePcs(0, minor ? "minor" : "major");
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = Math.max(1, Math.round(bpb));

  const notes: { pitch: number; start: number; dur: number }[] = [];
  let prev = 72;
  for (let beat = 0; beat < total; beat++) {
    const t = beat;
    const ch = chordAt(t, chords);
    const downbeat = beat % perBar === 0;
    const allowed =
      ch && (downbeat || rng.next() < 0.7)
        ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? ""))
        : scale;
    let cands = range(prev - 7, prev + 8).filter((p) => p >= 60 && p <= 84 && allowed.has(((p % 12) + 12) % 12));
    if (cands.length === 0)
      cands = range(60, 85).filter((p) => allowed.has(((p % 12) + 12) % 12));
    if (cands.length === 0) cands = [prev];
    const weights = cands.map((p) => 1 / (1 + Math.abs(p - prev)));
    prev = rng.choices(cands, weights);
    notes.push({ pitch: prev, start: t, dur: 1 });
  }
  const label = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
  return { items: [{ kind: "melody", content: { notes }, label }], edges: [] };
}

/** ベースライン（強拍=ルート、弱拍=5度・C2基準低域）。返り #85 items 形（bass 絶対=notes）。 */
export function genBass(
  frame?: Frame | null,
  chords?: { root?: number; quality?: string; start?: number; dur?: number }[],
): GenResult {
  const f = normalizeFrame(frame);
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = Math.max(1, Math.round(bpb));
  const notes: { pitch: number; start: number; dur: number }[] = [];
  for (let beat = 0; beat < total; beat++) {
    const ch = chordAt(beat, chords);
    const root = ch ? normRoot(ch.root ?? 0) : 0;
    const pc = beat % perBar === 0 ? root : (root + 7) % 12; // 強拍ルート / 弱拍5度
    notes.push({ pitch: 36 + pc, start: beat, dur: 1 });
  }
  return { items: [{ kind: "bass", content: { notes }, label: "ベース" }], edges: [] };
}

const GM = { Kick: 36, Snare: 38, HiHat: 42, OpenHat: 46 };

/** GMバックビート＋seed で小変化（16ステップ1小節）。返り #85 items 形（rhythm）。 */
export function genDrums(frame?: Frame | null, seed?: number | null): GenResult {
  normalizeFrame(frame);
  const rng = new Rng(seed);
  const kick = new Set([0, 8]);
  const snare = new Set([4, 12]);
  const hihat = [0, 2, 4, 6, 8, 10, 12, 14];
  kick.add(rng.choice([6, 10, 11, 14]));
  const lanes = [
    { name: "Kick", midi: GM.Kick, hits: [...kick].sort((a, b) => a - b), vel: 115 },
    { name: "Snare", midi: GM.Snare, hits: [...snare].sort((a, b) => a - b), vel: 105 },
    { name: "HiHat", midi: GM.HiHat, hits: hihat, vel: 55 },
  ];
  return { items: [{ kind: "rhythm", content: { rhythm: { steps: 16, lanes } }, label: "ドラム" }], edges: [] };
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i < hi; i++) out.push(i);
  return out;
}
