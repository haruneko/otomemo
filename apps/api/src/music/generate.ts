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

function chordAt(t: number, chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[]) {
  for (const c of chords ?? []) {
    const s = Number(c.start ?? 0);
    const d = Number(c.dur ?? 0);
    if (s <= t && t < s + d) return c;
  }
  return null;
}

// リズム図形（1拍=四分を基準に、拍内オフセット[off,dur](拍単位)で刻む）。span=消費する拍数。
// busy=細かい(明るい/速い向き)、long=長音(切ない/遅い向き)、空onは休符。四分縛りを解くための核。
interface RhyFig { on: [number, number][]; span: number; w: number; busy?: boolean; long?: boolean; rest?: boolean }
const MELODY_FIGS: RhyFig[] = [
  { on: [[0, 1]], span: 1, w: 2.5 }, // ♩
  { on: [[0, 0.5], [0.5, 0.5]], span: 1, w: 2.5, busy: true }, // ♪♪
  { on: [[0, 0.5], [0.5, 0.25], [0.75, 0.25]], span: 1, w: 1, busy: true }, // ♪♬
  { on: [[0, 0.25], [0.25, 0.25], [0.5, 0.5]], span: 1, w: 0.8, busy: true }, // ♬♪
  { on: [[0, 0.75], [0.75, 0.25]], span: 1, w: 1.2 }, // ♪.+16 付点
  { on: [[0.5, 0.5]], span: 1, w: 0.9 }, // 休符→♪（シンコペ）
  { on: [[0, 2]], span: 2, w: 1.3, long: true }, // 二分（長音）
  { on: [], span: 1, w: 0.8, rest: true }, // 休符
];

// mood/tempo から「密度バイアス」。切ない/遅い=長音・休符寄り、明るい/速い=細分寄り。
function densityBias(mood: string, tempo?: number): { busy: number; long: number; rest: number } {
  const sparse = isMinorMood(mood) || /バラード|ballad|遅|slow|静|アンビ|ambient/.test(mood.toLowerCase());
  const fast = /明る|元気|アップ|upbeat|fast|速|ダンス|dance|ポップ|pop/.test(mood.toLowerCase()) || (tempo ?? 0) >= 130;
  if (fast) return { busy: 2.0, long: 0.4, rest: 0.6 };
  if (sparse) return { busy: 0.5, long: 1.8, rest: 1.4 };
  return { busy: 1, long: 1, rest: 1 };
}

function pickFig(rng: Rng, figs: RhyFig[], bias: { busy: number; long: number; rest: number }, allowMulti: boolean, forceOnset: boolean): RhyFig {
  const cands = figs.filter((c) => (allowMulti || c.span === 1) && !(forceOnset && (c.rest || c.on.length === 0 || c.on[0]![0] !== 0)));
  const pool = cands.length ? cands : [figs[0]!];
  const weights = pool.map((c) => c.w * (c.busy ? bias.busy : 1) * (c.long ? bias.long : 1) * (c.rest ? bias.rest : 1));
  return rng.choices(pool, weights);
}

// スケールを昇順pcの配列に（degree歩幅で辿るため）。ソートして畳み込み回避。
function scaleArray(scale: Set<number>): number[] {
  return [...scale].sort((a, b) => a - b);
}

// 与pitch を「スケール上の度数インデックス」へ（最近傍スケール音にスナップ）。
// 返り {idx, octShift}：idx=scaleArr内の位置、octShift=オクターブの加算半音。
function toScaleDegree(pitch: number, scaleArr: number[]): { idx: number; oct: number } {
  const pc = ((pitch % 12) + 12) % 12;
  let best = 0;
  let bestD = 99;
  for (let i = 0; i < scaleArr.length; i++) {
    const d = Math.min(Math.abs(scaleArr[i]! - pc), 12 - Math.abs(scaleArr[i]! - pc));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const oct = Math.floor((pitch - scaleArr[best]!) / 12) * 12;
  return { idx: best, oct };
}

// 度数インデックス(+オクターブ)から実pitch を復元。step を足してスケールを上下に辿る。
function degreeToPitch(idx: number, octBase: number, scaleArr: number[]): number {
  const n = scaleArr.length;
  const wrapped = ((idx % n) + n) % n;
  const octJump = Math.floor(idx / n) * 12;
  return scaleArr[wrapped]! + octBase + octJump;
}

// pitch を許可pc集合に最近傍スナップ（拍頭=コードトーン化）。音域clampも。
function snapTo(pitch: number, allowed: Set<number>, lo: number, hi: number): number {
  let best = pitch;
  let bestD = 99;
  for (let p = pitch - 6; p <= pitch + 6; p++) {
    if (p < lo || p > hi) continue;
    if (!allowed.has(((p % 12) + 12) % 12)) continue;
    const d = Math.abs(p - pitch);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (bestD === 99) {
    // 近傍に無ければ音域全体から探す
    for (let p = lo; p <= hi; p++) {
      if (!allowed.has(((p % 12) + 12) % 12)) continue;
      const d = Math.abs(p - pitch);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return Math.max(lo, Math.min(hi, best));
}

// モチーフ：1小節分の (相対start拍, dur拍) 列＋スケール度数コントゥア(各音の開始音からの歩幅)。
interface Motif {
  hits: { off: number; dur: number; step: number }[]; // step=モチーフ開始音からのスケール歩幅
  span: number; // 消費拍数（=1小節）
}

// モチーフを1つ生成：リズム図形を小節幅まで並べ、各発音にスケール歩幅(コントゥア)を割り当て。
function buildMotif(rng: Rng, perBar: number, bias: { busy: number; long: number; rest: number }): Motif {
  const hits: { off: number; dur: number; step: number }[] = [];
  let beat = 0;
  let step = 0; // 累積スケール歩幅（開始音=0）
  while (beat < perBar) {
    const remain = perBar - beat;
    const fig = pickFig(rng, MELODY_FIGS, bias, remain >= 2, beat === 0); // 小節頭は必ず発音
    for (const [off, durRaw] of fig.on) {
      const t = beat + off;
      if (t >= perBar) break;
      const dur = Math.min(durRaw, perBar - t);
      if (dur <= 0) continue;
      // コントゥア：開始音(step=0)から順次中心に小さく上下。たまに跳躍。
      if (hits.length > 0) {
        const move = rng.choices([-2, -1, 0, 1, 2, 3], [1, 3, 1.2, 3, 1, 0.5]);
        step += move;
        step = Math.max(-4, Math.min(6, step)); // 動機の音域を制限（覚えやすさ）
      }
      hits.push({ off: t, dur, step });
    }
    beat += fig.span;
  }
  if (hits.length === 0) hits.push({ off: 0, dur: 1, step: 0 });
  return { hits, span: perBar };
}

// モチーフ生成は単発draw だと音数の分散が大きく mood 密度が安定しない。
// 候補を数本引いて、busy mood なら音数最多／sparse mood なら最少を採用（密度を単調化）。
// 反復は壊さない（採用された動機を全小節で使い回すのは従来通り）。
function buildMotifSteered(rng: Rng, perBar: number, bias: { busy: number; long: number; rest: number }): Motif {
  const cands: Motif[] = [];
  for (let i = 0; i < 3; i++) cands.push(buildMotif(rng, perBar, bias));
  const wantBusy = bias.busy >= 1.5;
  const wantSparse = bias.long >= 1.5;
  if (wantBusy) return cands.reduce((a, b) => (b.hits.length > a.hits.length ? b : a));
  if (wantSparse) return cands.reduce((a, b) => (b.hits.length < a.hits.length ? b : a));
  return cands[0]!; // 既定は最初の draw（決定的）
}

// バリエーション種：そのまま反復／移高(sequence)／反転／末尾変化。
type VarKind = "repeat" | "seq_up" | "seq_down" | "invert" | "tail";

// モチーフをある小節に配置：開始音をコードトーンにアンカーし、コントゥアを辿る。
// 拍頭/コードチェンジはコードトーンにスナップ＝ハモる。variation で軽い変奏。
function placeMotif(
  motif: Motif,
  barBeat: number,
  total: number,
  startPitch: number,
  scaleArr: number[],
  chords: { root?: number | string; quality?: string; start?: number; dur?: number }[] | undefined,
  scale: Set<number>,
  variation: VarKind,
  lo: number,
  hi: number,
): { pitch: number; start: number; dur: number }[] {
  const out: { pitch: number; start: number; dur: number }[] = [];
  const base = toScaleDegree(startPitch, scaleArr);
  const seqShift = variation === "seq_up" ? 1 : variation === "seq_down" ? -1 : 0;
  const lastIdx = motif.hits.length - 1;
  for (let i = 0; i < motif.hits.length; i++) {
    const h = motif.hits[i]!;
    const t = barBeat + h.off;
    if (t >= total) break;
    const dur = Math.min(h.dur, total - t);
    if (dur <= 0) continue;
    let step = h.step;
    if (variation === "invert") step = -step; // 反転：コントゥアを上下逆に
    if (variation === "tail" && i === lastIdx && lastIdx > 0) step = motif.hits[i - 1]!.step; // 末尾変化：終止を寄せる
    step += seqShift; // 移高(sequence)：度数を1つ持ち上げ/下げ
    let pitch = degreeToPitch(base.idx + step, base.oct, scaleArr);
    // 拍頭・コードチェンジ位置はコードトーンへスナップ（ハモる）。
    const onBeatHead = Number.isInteger(t);
    const ch = chordAt(Math.floor(t), chords);
    const ctPcs = ch ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")) : scale;
    const allowed = onBeatHead ? ctPcs : scale;
    pitch = snapTo(pitch, allowed, lo, hi);
    out.push({ pitch, start: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
  }
  return out;
}

/** モチーフ(動機)ベースのメロディ：短い動機を1つ作り、小節ごとにコードトーンへアンカーして
 * 反復＋軽い変奏(移高/反転/末尾変化)で置き直す。拍頭=コードトーン・音域60..84・mood密度を維持。 */
export function genMelody(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed);
  const mood = f.mood ?? "";
  const minor = isMinorMood(mood);
  const scale = scalePcs(0, minor ? "minor" : "major");
  const scaleArr = scaleArray(scale);
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = Math.max(1, Math.round(bpb));
  const bias = densityBias(mood, f.tempo);
  const lo = 60;
  const hi = 84;

  // 1) モチーフを1つ生成（seedで決定的・mood密度で音数を単調化）。
  const motif = buildMotifSteered(rng, perBar, bias);

  const notes: { pitch: number; start: number; dur: number }[] = [];
  let startPitch = 72; // 動機の開始音（前小節の開始音を引き継いで流れを作る）

  for (let bar = 0; bar < bars; bar++) {
    const barBeat = bar * perBar;
    if (barBeat >= total) break;
    // 各小節の開始音は、その小節のコードトーンにアンカー（直近の startPitch に最も近いコードトーン）。
    const ch = chordAt(barBeat, chords);
    const anchorPcs = ch ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")) : scale;
    startPitch = snapTo(startPitch, anchorPcs, lo, hi);

    // 2/3) バリエーション選択：基本は反復、たまに軽い変奏（反復が分かる程度に抑える）。
    let variation: VarKind = "repeat";
    if (bar > 0) {
      // 70%はそのまま反復、残りを軽い変奏に割り振る（覚えやすさ優先）。
      variation = rng.choices<VarKind>(
        ["repeat", "seq_up", "seq_down", "tail", "invert"],
        [7, 1.2, 1.2, 1, 0.6],
      );
    }
    const barNotes = placeMotif(motif, barBeat, total, startPitch, scaleArr, chords, scale, variation, lo, hi);
    for (const n of barNotes) notes.push(n);
    // 次小節の開始音は今小節の開始音（=確定した最初の音）から引き継ぐ＝動機の連続性。
    if (barNotes.length > 0) startPitch = barNotes[0]!.pitch;
  }

  if (notes.length === 0) notes.push({ pitch: 72, start: 0, dur: 1 }); // 全休は避ける
  const label = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
  return { items: [{ kind: "melody", content: { notes }, label }], edges: [] };
}

// ベースの図形（メロより落ち着き：四分主体＋たまに8分のルート→5度/オクターブ、長音）。
const BASS_FIGS: RhyFig[] = [
  { on: [[0, 1]], span: 1, w: 3 }, // ♩
  { on: [[0, 2]], span: 2, w: 1.5, long: true }, // 二分（支え）
  { on: [[0, 0.5], [0.5, 0.5]], span: 1, w: 1.2, busy: true }, // ♪♪（ルート→5度等）
  { on: [[0, 0.75], [0.75, 0.25]], span: 1, w: 0.7 }, // 付点（軽い跳ね）
];

/** ベースライン（強拍=ルート・弱拍=5度/オクターブ）＋**リズム図形**。C2基準低域。 */
export function genBass(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed ?? 42);
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = Math.max(1, Math.round(bpb));
  const bias = densityBias(f.mood ?? "", f.tempo);
  const notes: { pitch: number; start: number; dur: number }[] = [];
  let beat = 0;
  while (beat < total) {
    const onBar = beat % perBar === 0;
    const fig = pickFig(rng, BASS_FIGS, bias, beat + 2 <= total, true); // ベースは毎拍頭から発音
    const ch = chordAt(Math.floor(beat), chords);
    const root = ch ? normRoot(ch.root ?? 0) : 0;
    fig.on.forEach(([off, durRaw], i) => {
      const t = beat + off;
      const dur = Math.min(durRaw, total - t);
      if (dur <= 0) return;
      // 拍頭(小節/拍の頭)=ルート、間=5度。たまにオクターブ上で動きを。
      const fifth = (root + 7) % 12;
      const pc = off === 0 && (onBar || i === 0) ? root : rng.next() < 0.5 ? fifth : root;
      notes.push({ pitch: 36 + pc, start: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
    });
    beat += fig.span;
  }
  if (notes.length === 0) notes.push({ pitch: 36, start: 0, dur: 1 });
  return { items: [{ kind: "bass", content: { notes }, label: "ベース" }], edges: [] };
}

const GM = { Kick: 36, Snare: 38, HiHat: 42, OpenHat: 46 };

/** GMドラム（16ステップ1小節）を **mood/tempo/seed で可変**生成。切ない=ハーフタイム/疎、
 * 明るい/速い=16分ハット・キック増、既定=8ビート。返り #85 items 形（rhythm）。 */
export function genDrums(frame?: Frame | null, seed?: number | null): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed ?? 0);
  const bias = densityBias(f.mood ?? "", f.tempo);
  const sparse = bias.long >= 1.5; // 切ない/遅い
  const busy = bias.busy >= 1.5; // 明るい/速い
  const kick = new Set<number>([0]);
  const snare = new Set<number>();
  let hihat: number[];
  let hatVel = 55;
  const open: number[] = [];
  if (sparse) {
    // ハーフタイム感：スネアは3拍目(8)のみ、キック疎、ハットは4分（静かに支える）。
    snare.add(8);
    kick.add(rng.choice([10, 11]));
    hihat = [0, 4, 8, 12];
    hatVel = 45;
  } else if (busy) {
    // 細かい：16分ハット、キック増、たまにスネアのプッシュ/ゴースト。
    snare.add(4);
    snare.add(12);
    kick.add(8);
    kick.add(rng.choice([6, 7]));
    kick.add(rng.choice([10, 14]));
    hihat = Array.from({ length: 16 }, (_, i) => i);
    hatVel = 42;
    if (rng.next() < 0.5) snare.add(rng.choice([7, 15])); // プッシュ/ゴースト
  } else {
    // 王道8ビート＋seedでキックのおかず1つ。
    snare.add(4);
    snare.add(12);
    kick.add(8);
    kick.add(rng.choice([6, 10, 11, 14]));
    hihat = [0, 2, 4, 6, 8, 10, 12, 14];
  }
  if (rng.next() < 0.4) open.push(rng.choice([7, 14])); // 時々オープンハット（seedで）
  const lanes = [
    { name: "Kick", midi: GM.Kick, hits: [...kick].sort((a, b) => a - b), vel: 115 },
    { name: "Snare", midi: GM.Snare, hits: [...snare].sort((a, b) => a - b), vel: 105 },
    { name: "HiHat", midi: GM.HiHat, hits: hihat, vel: hatVel },
    ...(open.length ? [{ name: "OpenHat", midi: GM.OpenHat, hits: open, vel: 70 }] : []),
  ];
  return { items: [{ kind: "rhythm", content: { rhythm: { steps: 16, lanes } }, label: "ドラム" }], edges: [] };
}
