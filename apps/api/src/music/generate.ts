// ルールベース生成（#86・design「アーキ是正 決定1」＝生成をTSに一本化）。
// worker(Python)の music/generate.py を忠実移植。Claudeは関与しない（決定的記号エンジン）。
// 乱数は seed 付き（Pythonのbyte等価は不可＝MT vs ここ。musicalルールが等価＝property testで担保）。
import { chordPcs, normRoot, scalePcs } from "./theory";
import { planSkeleton } from "./skeleton";
import { meterInfo } from "./meter";
import { classifyNCT, isChordTone } from "./degree";
import { melodyEssence } from "./melodyEssence";
import { Rng } from "./rng";
import {
  isMinorMood,
  densityBias,
  pickFig,
  type RhyFig,
  MELODY_FIGS,
  COMPOUND_FIGS,
  BASS_FIGS,
  COMPOUND_BASS_FIGS,
} from "./rhythm";
import { genMotifMelody, genMotifMelodyV2, completeMelody, loadMotifModel16, scalePitchList, loadSkeletonModel, type BarRhythmModel, type MoveModel, type SkeletonModel } from "./melodyCells";
import { corpusTypicality } from "./evalMelody"; // P1 自己進化ループ：候補を"らしさ"(E-corpus)で並べる
import { melodySimilarity } from "./similarity"; // P1：多様な top-k を選ぶ（似すぎを飛ばす）

// 度数 → (ルートpc, quality)。C基準（key=0）。
const DIATONIC_MAJOR: Record<number, [number, string]> = {
  1: [0, ""], 2: [2, "m"], 3: [4, "m"], 4: [5, ""], 5: [7, ""], 6: [9, "m"], 7: [11, "dim"],
};
const DIATONIC_MINOR: Record<number, [number, string]> = {
  1: [0, "m"], 2: [2, "dim"], 3: [3, ""], 4: [5, "m"], 5: [7, "7"], 6: [8, ""], 7: [10, ""],
};
// I3b(2026-07-08)：カラー系mood用の7thパレット（おしゃれ/ジャズ/夜系）。短調Vは従来からV7。
const DIATONIC_MAJOR7: Record<number, [number, string]> = {
  1: [0, "maj7"], 2: [2, "m7"], 3: [4, "m7"], 4: [5, "maj7"], 5: [7, "7"], 6: [9, "m7"], 7: [11, "m7b5"],
};
const DIATONIC_MINOR7: Record<number, [number, string]> = {
  1: [0, "m7"], 2: [2, "m7b5"], 3: [3, "maj7"], 4: [5, "m7"], 5: [7, "7"], 6: [8, "maj7"], 7: [10, "7"],
};
const FUNC_DEGREES: Record<string, number[]> = { T: [1, 6, 3], S: [4, 2], D: [5, 7] };
const FUNC_NEXT: Record<string, string[]> = {
  T: ["S", "S", "D", "D", "T"],
  S: ["D", "D", "D", "S", "T"],
  D: ["T", "T", "T", "D"],
};

export interface Frame {
  key?: number;
  mode?: "major" | "minor"; // 一級の長短宣言（2026-07-08・design#12-M）。mood からの推定はフォールバック。
  meter?: string;
  tempo?: number;
  bars?: number;
  mood?: string;
  pickup?: number; // 弱起（アウフタクト）：拍0の前に置く拍数（0=無し）。
  expression?: number; // 素直⇔表情ノブ（0..1）：強拍に倚音等の滑り込みを置く頻度。既定は mood で控えめ。
}
export interface GenResult {
  items: { kind: string; content: unknown; label: string }[];
  edges: never[];
}

export function normalizeFrame(frame?: Frame | null): Frame {
  const f = frame ?? {};
  const out: Frame = {};
  if (typeof f.key === "number" && f.key >= 0 && f.key <= 11) out.key = Math.trunc(f.key);
  if (f.meter) out.meter = String(f.meter);
  if (typeof f.tempo === "number" && f.tempo > 0) out.tempo = f.tempo;
  if (typeof f.bars === "number") out.bars = Math.max(1, Math.min(16, Math.trunc(f.bars)));
  if (f.mood) out.mood = String(f.mood);
  if (f.mode === "major" || f.mode === "minor") out.mode = f.mode; // 一級の長短（moodより優先）
  if (typeof f.pickup === "number" && f.pickup > 0) out.pickup = Math.min(2, f.pickup);
  if (typeof f.expression === "number") out.expression = Math.max(0, Math.min(1, f.expression));
  return out;
}

// 長短の決定＝frame.mode 優先・無ければ mood 推定（後方互換）。design#12-M 2026-07-08。
export function isMinorFrame(f: Frame): boolean {
  if (f.mode) return f.mode === "minor";
  return isMinorMood(f.mood ?? "");
}

function beatsPerBar(meter?: string): number {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(meter ?? "");
  if (!m) return 4;
  const n = Number(m[1]);
  const d = Number(m[2]);
  return n > 0 && d > 0 ? n * (4 / d) : 4;
}

const barsOf = (frame: Frame): number =>
  typeof frame.bars === "number" && frame.bars ? Math.max(1, Math.min(16, Math.trunc(frame.bars))) : 4;
const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** 機能和声ルールでコード進行を生成（T始まり・T終わり）。返り #85 items 形。 */
export function genChords(frame?: Frame | null, seed?: number | null, cadence?: "full" | "half" | "deceptive" | "plagal"): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed);
  const mood = f.mood ?? "";
  const minor = isMinorFrame(f); // mode一級・moodフォールバック（2026-07-08）
  const table = minor ? DIATONIC_MINOR : DIATONIC_MAJOR;
  const key = f.key ?? 0; // 実音で返す：度数表は C基準、最後に key で移調。
  const bars = barsOf(f);
  const bpb = beatsPerBar(f.meter);

  const funcs: string[] = ["T"];
  for (let i = 0; i < bars - 1; i++) funcs.push(rng.choice(FUNC_NEXT[funcs[funcs.length - 1]!]!));
  if (bars >= 2) funcs[funcs.length - 1] = "T";
  // I3/H9(2026-07-08)：終止前はドミナント準備＝V(まれにvii°)→I で締める（旧: iii→I 等の腰砕けや C→C を許容）。
  if (bars >= 3) funcs[funcs.length - 2] = "D";
  const degrees: number[] = [];
  for (let i = 0; i < funcs.length; i++) {
    const fn = funcs[i]!;
    const cands = FUNC_DEGREES[fn]!;
    // D機能は V を厚く（裸の vii°/dim ブロックはレア＝実用進行の比率へ）。
    const w = fn === "D" ? [5, 1] : [3, 2, 1];
    let d = rng.choices(cands, w.slice(0, cands.length));
    // 隣接同度数の回避：同じなら同機能の別候補へシフト（無ければ許容）。
    if (i > 0 && d === degrees[i - 1] && cands.length > 1) {
      const alt = cands.find((c) => c !== d);
      if (alt !== undefined) d = alt;
    }
    degrees.push(d);
  }
  degrees[0] = 1;
  if (bars >= 2) degrees[degrees.length - 1] = 1;
  // 先頭の強制(1)で隣接重複が再発した場合は同機能の別候補へ（bars=2 の I,I は両端強制なので許容）。
  if (degrees.length > 2 && degrees[1] === degrees[0]) {
    const alt = FUNC_DEGREES[funcs[1]!]!.find((c) => c !== degrees[1]);
    if (alt !== undefined) degrees[1] = alt;
  }
  // Step3(2026-07-09 design#12-M)：カデンツ選択器＝末尾1-2和音を型で上書き（既定 full/undefined=従来一致）。
  // funcs は degree 確定後は未使用ゆえ degrees のみ上書き。先頭 degrees[0]=1 は保護（penult は index≥1 のみ）。
  if (cadence && cadence !== "full" && bars >= 2) {
    const last = degrees.length - 1, pen = last - 1;
    if (cadence === "half") { degrees[last] = 5; if (pen >= 1) degrees[pen] = 4; }              // 半終止＝IV→V(開いて止める)
    else if (cadence === "deceptive") { degrees[last] = 6; if (pen >= 1) degrees[pen] = 5; }    // 偽終止＝V→vi(長調)/V→♭VI(短調)
    else if (cadence === "plagal") { degrees[last] = 1; if (pen >= 1) degrees[pen] = 4; }        // 変終止＝IV→I(アーメン)
  }

  // I3b: mood がコードの「色」に効く＝おしゃれ/ジャズ/夜系は7thパレット（旧: moodは長短切替のみで進行が不変）。
  // 「切ない」は従来どおり素の短調（長短切替の正準語＝色付けしない）。
  const colorful = /おしゃれ|オシャレ|ジャズ|jazz|都会|夜|しっとり|大人/.test(mood);
  const table7 = minor ? DIATONIC_MINOR7 : DIATONIC_MAJOR7;
  const chords = degrees.map((deg, i) => {
    const [root, quality] = (colorful ? table7 : table)[deg]!;
    return { root: (root + key) % 12, quality, start: round3(i * bpb), dur: round3(bpb) };
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

// スケールを昇順pcの配列に（degree歩幅で辿るため）。ソートして畳み込み回避。
export function scaleArray(scale: Set<number>): number[] {
  return [...scale].sort((a, b) => a - b);
}

// 与pitch を「スケール上の度数インデックス」へ（最近傍スケール音にスナップ）。
// 返り {idx, octShift}：idx=scaleArr内の位置、octShift=オクターブの加算半音。
export function toScaleDegree(pitch: number, scaleArr: number[]): { idx: number; oct: number } {
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
// モチーフ輪郭の歩幅候補（スケール度）と既定重み。コーパス学習(corpusBias)で重みを差し替え可能。
export const MOVES = [-2, -1, 0, 1, 2, 3] as const;
export const DEFAULT_STEP_WEIGHTS = [0.6, 4, 1.2, 4, 0.6, 0.2]; // 順次(±1)を厚く＝滑らかさ。跳躍は控えめ。

function buildMotif(
  rng: Rng,
  perBar: number,
  bias: { busy: number; long: number; rest: number },
  figs: RhyFig[] = MELODY_FIGS,
  stepWeights: number[] = DEFAULT_STEP_WEIGHTS,
): Motif {
  const hits: { off: number; dur: number; step: number }[] = [];
  let beat = 0;
  let step = 0; // 累積スケール歩幅（開始音=0）
  while (beat < perBar - 1e-9) {
    const remain = perBar - beat;
    const fig = pickFig(rng, figs, bias, remain, beat === 0); // 小節頭は必ず発音
    for (const [off, durRaw] of fig.on) {
      const t = beat + off;
      if (t >= perBar) break;
      const dur = Math.min(durRaw, perBar - t);
      if (dur <= 0) continue;
      // コントゥア：開始音(step=0)から順次中心に小さく上下。たまに跳躍。歩幅分布はコーパス学習で差替可。
      if (hits.length > 0) {
        const move = rng.choices(MOVES as unknown as number[], stepWeights);
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
function buildMotifSteered(
  rng: Rng,
  perBar: number,
  bias: { busy: number; long: number; rest: number },
  figs: RhyFig[] = MELODY_FIGS,
  stepWeights: number[] = DEFAULT_STEP_WEIGHTS,
): Motif {
  const cands: Motif[] = [];
  for (let i = 0; i < 3; i++) cands.push(buildMotif(rng, perBar, bias, figs, stepWeights));
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
  strongSet: Set<number>, // 小節内の強拍位置（複合拍子で 1.5 等の非整数頭もコードトーンにスナップ）
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
    // 拍頭・コードチェンジ位置はコードトーンへスナップ（ハモる）。複合拍子は強拍(1.5等)も含める。
    const posInBar = Math.round((t - barBeat) * 1000) / 1000;
    const onBeatHead = Number.isInteger(t) || strongSet.has(posInBar);
    const ch = chordAt(Math.floor(t), chords);
    const ctPcs = ch ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")) : scale;
    const allowed = onBeatHead ? ctPcs : scale;
    pitch = snapTo(pitch, allowed, lo, hi);
    out.push({ pitch, start: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
  }
  return out;
}

/** 骨格音プランナ（S6-a・spec §10.7）：各小節に「背骨の音」を1つ。和声連動（その小節のコードトーン）で、
 * **前の骨格音から繋がる**候補を選ぶ（彷徨い防止）＋頂点(≈0.62)に最高音を一音だけ立てる。決定的・純関数。
 * レジスタ包絡(archBase±archAmp)は"目標"として残し音域 magnitude を保つ＝既存アーチ/音域 property と両立。 */
export function planSkeletonTones(
  bars: number,
  chords: { root?: number | string; quality?: string; start?: number; dur?: number }[] | undefined,
  beatsPerBar: number,
  scale: Set<number>,
  opts: { lo?: number; hi?: number; archBase?: number; archAmp?: number } = {},
): number[] {
  const lo = opts.lo ?? 60;
  const hi = opts.hi ?? 84;
  const archBase = opts.archBase ?? 67;
  const archAmp = opts.archAmp ?? 9;
  const n = Math.max(1, Math.trunc(bars));
  const climax = n <= 1 ? 0 : Math.round((n - 1) * 0.62);
  // レジスタ目標＝上行接近→頂点(climax)→下行で閉じる包絡（旧 centerAt と同じ。音域 magnitude 維持）。
  const target = (bar: number): number => {
    if (n <= 1) return archBase + archAmp;
    const downSpan = n - 1 - climax;
    const x = bar <= climax ? (climax === 0 ? 1 : bar / climax) : downSpan <= 0 ? 1 : 1 - (bar - climax) / downSpan;
    return archBase + archAmp * x;
  };
  const candsAt = (bar: number): number[] => {
    const ch = chordAt(bar * beatsPerBar, chords);
    const pcs = ch ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")) : scale;
    const out: number[] = [];
    for (let p = lo; p <= hi; p++) if (pcs.has(((p % 12) + 12) % 12)) out.push(p);
    return out.length ? out : [Math.round(Math.max(lo, Math.min(hi, archBase)))];
  };
  const nearest = (cands: number[], to: number): number =>
    cands.reduce((a, b) => (Math.abs(b - to) < Math.abs(a - to) ? b : a), cands[0]!);

  const skel: number[] = [];
  for (let bar = 0; bar < n; bar++) {
    const cands = candsAt(bar);
    const tgt = target(bar);
    if (bar === 0) {
      skel.push(nearest(cands, tgt));
      continue;
    }
    const prev = skel[bar - 1]!;
    // 連結優先：前の骨格音への近さ(主)＋アーチ目標への近さ(従)＝木の背骨が順次中心に繋がる（arpeggiate/passing の素地）。
    let best = cands[0]!;
    let bestScore = Infinity;
    for (const c of cands) {
      // 連結優先：前の骨格音への近さ(主)＋アーチ目標への近さ(従)＝木の背骨が順次中心に繋がる（arpeggiate/passing の素地）。
      const score = Math.abs(c - prev) * 1.0 + Math.abs(c - tgt) * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    skel.push(best);
  }
  // 頂点を一音立てる：climax はアーチ目標へピン（レジスタ＝旧アーチ相当＝音域維持）。
  skel[climax] = nearest(candsAt(climax), target(climax));
  // 他小節が頂点を超えないようオクターブ下へ折る（pc保存＝コードトーン性は不変）→頂点を唯一の最高音に（#3）。
  for (let bar = 0; bar < n; bar++) {
    if (bar === climax) continue;
    while (skel[bar]! >= skel[climax]! && skel[bar]! - 12 >= lo) skel[bar] = skel[bar]! - 12;
  }
  return skel;
}

/** モチーフ(動機)ベースのメロディ：短い動機を1つ作り、小節ごとに**骨格音**へアンカーして
 * 反復＋軽い変奏(移高/反転/末尾変化)で置き直す。拍頭=コードトーン・音域60..84・mood密度を維持。 */
export function genMelody(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: { stepWeights?: number[]; motifModel?: { rhythm: BarRhythmModel; move: MoveModel }; skelModel?: SkeletonModel; appoggiatura?: number; repetition?: number; rangeSteps?: number; useV2?: boolean; motifBars?: number; phrasing?: "symmetric" | "asymmetric"; partial?: { pitch: number; start?: number; dur?: number }[]; density?: number; swing?: number; expression?: number; runs?: number; push?: number }, // stepWeights/motifModel/skelModel=コーパス学習（無指定＝旧経路）。repetition/rangeSteps=骨格の利用時制約。useV2=A2レシピ経路。motifBars=モチーフ/フレーズ長(小節)。phrasing=句割り 対称/非対称(P0-b・骨格経路)。partial=補完(completion)の種=部分メロ。density=細かさ/swing=跳ね/expression=表情/runs=走句/push=前借り 0..1（V2経路）
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed);
  const mood = f.mood ?? "";
  const minor = isMinorFrame(f); // mode一級・moodフォールバック（2026-07-08）
  const scale = scalePcs(f.key ?? 0, minor ? "minor" : "major"); // 経過音も曲の調に乗せる（実音）。
  const scaleArr = scaleArray(scale);
  const bars = barsOf(f);
  const info = meterInfo(f.meter); // 拍子→拍構造（6/8 一級）
  const compound = info.grouping === "compound";
  const figs = compound ? COMPOUND_FIGS : MELODY_FIGS; // 6/8等は複合拍ネイティブの図形
  const strongSet = new Set(info.strongPositions); // 小節内強拍（複合拍の1.5等もスナップ対象）
  const bpb = info.beatsPerBar;
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = bpb; // 動機の幅＝1小節（複合拍は付点ビート×群でタイル）
  const bias = densityBias(mood, f.tempo);
  const lo = 60;
  const hi = 84;

  // 補完(completion)経路：partial（部分メロ＝先頭数小節）を種に V2 が残りを発展で埋める。4/4(or 6/8)＋chords 時。
  // partial の小節は実音保持・残りは seedMotif の発展。partial 無し時はこの分岐に入らない＝通常生成と一致（回帰）。
  if (opts?.partial && opts.partial.length > 0 && (bpb === 4 || compound) && (chords?.length ?? 0) > 0 && bars >= 1) {
    const sp = scalePitchList(scale, lo, hi);
    const chordPcsPerBar: number[][] = [];
    const rootsPerBar: number[] = [];
    const qualsPerBar: string[] = [];
    const tonicPc = (((f.key ?? 0) % 12) + 12) % 12;
    for (let bar = 0; bar < bars; bar++) {
      const ch = chordAt(bar * perBar, chords);
      const root = ch ? normRoot(ch.root ?? 0) : tonicPc;
      const qual = ch?.quality ?? "";
      rootsPerBar.push(root);
      qualsPerBar.push(qual);
      chordPcsPerBar.push(ch ? chordPcs(root, qual) : scaleArr.map((d) => ((d % 12) + 12) % 12));
    }
    const partialNotes = opts.partial.map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur ?? 0.25 }));
    const scalePcsArr = scaleArr.map((d) => ((d % 12) + 12) % 12);
    const chordPcsAt = (t: number): number[] => { const c = chordAt(t, chords); return c ? chordPcs(normRoot(c.root ?? 0), c.quality ?? "") : scalePcsArr; }; // C3: 小節内チェンジ追従
    const mNotes = completeMelody(partialNotes, chordPcsPerBar, rootsPerBar, qualsPerBar, sp, loadMotifModel16(), { seed: seed ?? 1, tonicPc, minor, skelModel: opts.skelModel ?? loadSkeletonModel(minor), compound, chordPcsAt });
    if (mNotes.length === 0) mNotes.push({ pitch: 72, start: 0, dur: 1 });
    const lbl = (mood ? mood + "メロ補完" : "メロ補完").slice(0, 24);
    return { items: [{ kind: "melody", content: { notes: mNotes }, label: lbl }], edges: [] };
  }

  // A2レシピ経路（docs/research/melody-recipe-validated.md）：4/4＋chords＋bars≥1＋useV2 時。
  // 骨格(句頭アンカー)＋モチーフ選別＋輪郭駆動＋発展(A/A'/B反行+弧/A'')。旧経路は下に残す（回帰防止）。
  if (opts?.useV2 && (bpb === 4 || compound) && (chords?.length ?? 0) > 0 && bars >= 1) {
    const sp = scalePitchList(scale, lo, hi);
    const chordPcsPerBar: number[][] = [];
    const rootsPerBar: number[] = [];
    const qualsPerBar: string[] = [];
    const tonicPc = (((f.key ?? 0) % 12) + 12) % 12;
    for (let bar = 0; bar < bars; bar++) {
      const ch = chordAt(bar * perBar, chords);
      const root = ch ? normRoot(ch.root ?? 0) : tonicPc;
      const qual = ch?.quality ?? "";
      rootsPerBar.push(root);
      qualsPerBar.push(qual);
      chordPcsPerBar.push(ch ? chordPcs(root, qual) : scaleArr.map((d) => ((d % 12) + 12) % 12));
    }
    // F4(2026-07-08)：styleコーパス(motifModel)をV2に反映（旧: V2で無視＝styleがランクにしか効かない）。
    // move遷移＝学習分布で置換（ランク軸corpusTypicalityと同じ統計＝生成と評価が揃う）。
    // リズム＝8分8枠語彙を16枠へ拡張し、既定16分語彙と質量50/50でブレンド（バイアスであって置換ではない）。
    let m16 = loadMotifModel16();
    if (opts.motifModel) {
      const up: Record<string, number> = {};
      for (const [p8, w] of opts.motifModel.rhythm.patterns) {
        const g = Array(16).fill(".");
        for (let k2 = 0; k2 < 8 && k2 < p8.length; k2++) if (p8[k2] === "x") g[k2 * 2] = "x";
        const key16 = g.join("");
        up[key16] = (up[key16] ?? 0) + w;
      }
      const upTot = Object.values(up).reduce((a, b) => a + b, 0);
      if (upTot > 0) {
        const baseTot = Object.values(m16.rhythm16).reduce((a, b) => a + b, 0) || 1;
        const blended: Record<string, number> = { ...m16.rhythm16 };
        for (const [k2, w] of Object.entries(up)) blended[k2] = (blended[k2] ?? 0) + (w / upTot) * baseTot;
        m16 = { rhythm16: blended, move: opts.motifModel.move };
      } else {
        m16 = { rhythm16: m16.rhythm16, move: opts.motifModel.move };
      }
    }
    const scalePcsArr = scaleArr.map((d) => ((d % 12) + 12) % 12);
    const chordPcsAt = (t: number): number[] => { const c = chordAt(t, chords); return c ? chordPcs(normRoot(c.root ?? 0), c.quality ?? "") : scalePcsArr; }; // C3: 小節内チェンジ追従
    // P0-b(Step2)：phrasing 指定時のみ planSkeleton の句割りをV2へ渡す（未指定=phrases無し=従来bit一致）。
    const phrases = opts.phrasing ? planSkeleton(bars, f.meter, { phrasing: opts.phrasing }).map((p) => ({ startBeat: p.startBeat, beats: p.beats, cadenceDegree: p.cadenceDegree })) : undefined;
    const mNotes = genMotifMelodyV2(chordPcsPerBar, rootsPerBar, qualsPerBar, sp, m16, { seed: seed ?? 1, tonicPc, minor, skelModel: opts.skelModel ?? loadSkeletonModel(minor), motifBars: opts.motifBars, compound, repetition: opts.repetition, rangeSteps: opts.rangeSteps, chordPcsAt, density: opts.density, swing: opts.swing, expression: opts.expression, phrases, runs: opts.runs, push: opts.push }); // compound=6/8等＝V2を6/8リズム(3+3八分)・bar=3拍で駆動（骨格/moveは4/4学習を流用）
    if ((f.pickup ?? 0) > 0 && mNotes.length > 0) prependPickup(mNotes, f.pickup!, scaleArr);
    if (mNotes.length === 0) mNotes.push({ pitch: 72, start: 0, dur: 1 });
    const lbl = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
    return { items: [{ kind: "melody", content: { notes: mNotes }, label: lbl }], edges: [] };
  }

  // 新パイプライン（motif-rhythm＋Markov contour＋snap・design#12-M S7/S8）：4/4＋motifModel＋chords 時。
  // ＝コーパスで学んだ「1小節リズム語彙」と「move遷移(gap-fill)」でモチーフを生成・反復。無指定/他拍子は下の旧経路へ。
  if (opts?.motifModel && bpb === 4 && (chords?.length ?? 0) > 0 && bars >= 1) {
    const sp = scalePitchList(scale, lo, hi);
    const chordPcsPerBar: number[][] = [];
    for (let bar = 0; bar < bars; bar++) {
      const ch = chordAt(bar * perBar, chords);
      chordPcsPerBar.push(ch ? chordPcs(ch.root ?? 0, ch.quality ?? "") : scaleArr.map((d) => ((d % 12) + 12) % 12));
    }
    const tonicPc = (((f.key ?? 0) % 12) + 12) % 12;
    const mNotes = genMotifMelody(chordPcsPerBar, sp, opts.motifModel.rhythm, opts.motifModel.move, { seed: seed ?? 1, tonicPc, fifthPc: (tonicPc + 7) % 12, ending: "close", skelModel: opts.skelModel ?? loadSkeletonModel(minor), appoggiatura: opts.appoggiatura ?? 0.5, repetition: opts.repetition, rangeSteps: opts.rangeSteps }); // 既定=同梱学習骨格(長短別)＋倚音0.5。repetition/rangeSteps=利用時制約
    if ((f.pickup ?? 0) > 0 && mNotes.length > 0) prependPickup(mNotes, f.pickup!, scaleArr);
    if (mNotes.length === 0) mNotes.push({ pitch: 72, start: 0, dur: 1 });
    const lbl = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
    return { items: [{ kind: "melody", content: { notes: mNotes }, label: lbl }], edges: [] };
  }

  // 1) モチーフを1つ生成（seedで決定的・mood密度で音数を単調化・拍子ネイティブの図形）。
  const motif = buildMotifSteered(rng, perBar, bias, figs, opts?.stepWeights ?? DEFAULT_STEP_WEIGHTS);

  const notes: { pitch: number; start: number; dur: number }[] = [];
  // 骨格音（S6-a・spec§10.7）：和声連動の「連結ピラー＋頂点一音」で背骨を決める。
  // 旧＝幾何アーチに各小節を**独立**スナップ（彷徨い） → 新＝前の骨格音から繋がるコードトーンを選ぶ。
  const skel = planSkeletonTones(bars, chords, perBar, scale, { lo, hi });

  // 変奏は句機能で**位置駆動**（S3a・spec§10.5）：後楽節頭=模続(sequence)、句末バー=終止寄せ、他=反復。
  // ＝lookback でモチーフを明示反復しつつ、楽節の役割で発展させる（乱数でばらさない）。
  const phrases = planSkeleton(bars, f.meter, { phrasing: opts?.phrasing });
  const barVar = (bar: number): VarKind => {
    if (bar === 0) return "repeat"; // basic idea
    const bBeat = bar * perBar;
    const ph = phrases.find((p) => bBeat >= p.startBeat - 1e-6 && bBeat < p.startBeat + p.beats - 1e-6);
    if (!ph) return "repeat";
    const isFirst = Math.abs(bBeat - ph.startBeat) < 1e-6;
    const isLast = bBeat + perBar >= ph.startBeat + ph.beats - 1e-6;
    if (ph.role === "consequent" && isFirst) return "seq_up"; // 後楽節頭＝模続（応答）
    if (isLast && !isFirst) return "tail"; // 句末バー＝終止へ寄せる
    return "repeat";
  };

  for (let bar = 0; bar < bars; bar++) {
    const barBeat = bar * perBar;
    if (barBeat >= total) break;
    // 各小節の開始音＝その小節の骨格音（コードトーン・前の背骨から連結・頂点一音）。
    const startPitch = skel[bar] ?? 67;
    const variation = barVar(bar);
    const barNotes = placeMotif(motif, barBeat, total, startPitch, scaleArr, chords, scale, variation, lo, hi, strongSet);
    // 背骨音の窓に**オクターブ折り返し**で閉じ込める（pc保存＝コードトーン性は不変・頂点を超えさせない・アーチ維持）。
    const ceil = startPitch + 5;
    const floor = startPitch - 8;
    for (const n of barNotes) {
      let p = n.pitch;
      while (p > ceil && p - 12 >= lo) p -= 12;
      while (p < floor && p + 12 <= hi) p += 12;
      n.pitch = Math.max(lo, Math.min(hi, p));
      notes.push(n);
    }
  }

  // 跳躍後の順次反行（S2a・spec§7-5）：4度以上跳躍の直後の「弱拍」音は逆向き歩進に補正＝ギャップフィル。
  recoverLeaps(notes, scaleArr, strongSet, perBar, lo, hi);
  enforceResolution(notes, chords, lo, hi); // 孤立NCT掃除（カデンツ着地の前＝カデンツ音は消さない）

  // 骨格層（S1c・spec§10.5-10.6）：句末で①カデンツ度数に着地②息継ぎ（末尾を切って休符）。
  // モチーフ反復・拍頭コードトーンは保ったまま、上に「呼吸」を被せる。
  applyPhrasing(notes, scaleArr, bias, f.meter, bars, lo, hi, opts?.phrasing, chords);

  // 弱起（S1d・spec§10.3）：拍0の前に upbeat を前置し、最初のダウンビート音へ歩進で滑り込む。
  // 拍0=曲頭の位置は保つ（負start＝前にはみ出す。compositeNotes/再生は既に負start対応）。
  if ((f.pickup ?? 0) > 0 && notes.length > 0) prependPickup(notes, f.pickup!, scaleArr);

  // 弱拍装飾（S3b）：コードトーンの周りで踊る（3度の間=経過/同音=刺繍）。滑り込みより前＝強拍は未変更。
  decorateWeak(notes, scaleArr, strongSet, perBar, lo, hi);

  // 滑り込み（S2b・spec§10.4）：**最後に**強拍へ倚音をもたせ直後の弱拍で下行解決＝もたれ/滑り込み。
  // phrasing 後に置くので解決音が上書きされない。表情ノブ既定は控えめ（sparse=やや多め/busy=少なめ）。
  const expr = typeof f.expression === "number" ? f.expression : bias.long >= 1.5 ? 0.3 : bias.busy >= 1.5 ? 0.15 : 0.2;
  applyExpression(notes, chords, scaleArr, expr, rng, strongSet, perBar, lo, hi);

  if (notes.length === 0) notes.push({ pitch: 72, start: 0, dur: 1 }); // 全休は避ける
  const label = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
  return { items: [{ kind: "melody", content: { notes }, label }], edges: [] };
}

// P1 自己進化ループ（design 次期計画・#12-M）：メロを1本に潰さず「多め生成→らしさで並べ替え→多様な top-k」で返す。
//  ・各 genMelody 出力は内部で修復pass済（半音クラッシュ矯正/gap-fill/NCT解決/句末カデンツ）＝floorは既に担保。
//  ・ランク軸＝corpusTypicality(E-corpus＝自分/コーパスらしさ)。**E-rule総合点ではランクしない**（gaming回避・self-check-log）。
//  ・多様性＝melodySimilarity で似すぎ(≥SIM_MAX)を飛ばす。総合スコアは返さない（哲学：候補まで・仕上げは人間）。
//  ・seed 明示時は決定的な単一を尊重（従来どおり）。corpusModel 無指定なら生成順のまま多様選別だけ効かせる。
type MelNote = { pitch: number; start: number; dur: number };
const CAND_SIM_MAX = 0.9; // これ以上似た候補は同一視して落とす（移調不変の類似度）
export function genMelodyCandidates(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: Parameters<typeof genMelody>[3] & { corpusModel?: { rhythm: BarRhythmModel; move: MoveModel } | null; k?: number; n?: number },
): GenResult {
  const k = Math.max(1, opts?.k ?? 3);
  const n = Math.max(k, opts?.n ?? 8);
  if (seed != null) return genMelody(frame, chords, seed, opts); // 明示 seed＝1本を決定的に
  const f = normalizeFrame(frame);
  const info = meterInfo(f.meter);
  const cands: { notes: MelNote[]; typ: number }[] = [];
  const seen = new Set<string>();
  for (let s = 1; s <= n; s++) {
    const notes = (genMelody(frame, chords, s, opts).items[0]?.content as { notes?: MelNote[] } | undefined)?.notes;
    if (!notes || notes.length === 0) continue;
    const key = notes.map((x) => `${x.pitch}@${round3(x.start)}:${round3(x.dur)}`).join(","); // 完全重複を捨てる（F3: durも同一性に含める＝リズム違い候補を殺さない）
    if (seen.has(key)) continue;
    seen.add(key);
    const typ = opts?.corpusModel
      ? corpusTypicality(notes, opts.corpusModel, { beatsPerBar: info.beatsPerBar, eighthsPerBar: info.beatsPerBar * 2 }).score
      : 0;
    cands.push({ notes, typ });
  }
  if (cands.length === 0) return genMelody(frame, chords, 1, opts); // 保険（全経路空はまず無い）
  cands.sort((a, b) => b.typ - a.typ); // らしさ順（corpusModel 無ければ全 typ=0＝生成順のまま）
  const picked: { notes: MelNote[]; typ: number }[] = [];
  for (const c of cands) { // 多様な top-k：既採用と似すぎは飛ばす
    if (picked.length >= k) break;
    if (picked.every((p) => melodySimilarity(p.notes, c.notes) < CAND_SIM_MAX)) picked.push(c);
  }
  for (const c of cands) { // 似すぎ除外で k に満たなければ順位順で充填
    if (picked.length >= k) break;
    if (!picked.includes(c)) picked.push(c);
  }
  const base = (f.mood ? f.mood + "メロ" : "メロディ");
  return { items: picked.map((c, i) => ({ kind: "melody", content: { notes: c.notes }, label: `${base}案${i + 1}`.slice(0, 24) })), edges: [] };
}

// pitch を「指定ピッチクラス」の最近傍音へ（カデンツ度数への着地）。音域clamp。
function snapToPc(pitch: number, pc: number, lo: number, hi: number): number {
  let best = pitch;
  let bestD = 99;
  for (let p = lo; p <= hi; p++) {
    if (((p % 12) + 12) % 12 !== pc) continue;
    const d = Math.abs(p - pitch);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// 句末の息継ぎ長（拍）。period末/最終は長め。mood で sparse 長く・busy 短く。
function breathLen(strong: boolean, bias: { busy: number; long: number; rest: number }): number {
  let b = strong ? 1.0 : 0.5;
  if (bias.long >= 1.5) b *= 1.5; // sparse（切ない/バラード）はより長く呼吸
  else if (bias.busy >= 1.5) b *= 0.6; // busy（明るい/速い）は短め
  return b;
}

// 骨格を音符列に適用（破壊的）：各 phrase の末尾を切って休符＝息継ぎ、最終音をカデンツ度数へ着地。
function applyPhrasing(
  notes: { pitch: number; start: number; dur: number }[],
  scaleArr: number[],
  bias: { busy: number; long: number; rest: number },
  meter: string | undefined,
  bars: number,
  lo: number,
  hi: number,
  phrasing?: "symmetric" | "asymmetric",
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
): void {
  if (notes.length === 0) return;
  const phrases = planSkeleton(bars, meter, { phrasing });
  notes.sort((a, b) => a.start - b.start);
  const keep: { pitch: number; start: number; dur: number }[] = [];
  for (const ph of phrases) {
    const end = ph.startBeat + ph.beats;
    const cut = end - breathLen(ph.strongBreath, bias); // ここ以降は息継ぎ（無音）にする
    const inPh = notes.filter((n) => n.start >= ph.startBeat - 1e-6 && n.start < end - 1e-6);
    if (inPh.length === 0) continue;
    // 息継ぎ窓（cut以降）に始まる音は落とす。全部落ちるなら先頭1音は残す。
    let kept = inPh.filter((n) => n.start < cut - 1e-6);
    if (kept.length === 0) kept = [inPh[0]!];
    const last = kept[kept.length - 1]!;
    // 最終音をカデンツ度数(1=主音/5=属音…)のピッチクラスへ着地＝安定音で閉じる。
    // B2(2026-07-08 design#12-M)：コードを見て着地＝カデンツ度数がその時点のコードに含まれる時のみ
    // 度数snap、含まれない時は最寄りのコード音（IV上にG強制等のコード無視を解消）。
    const cadPc = ((scaleArr[(ph.cadenceDegree - 1) % scaleArr.length]! % 12) + 12) % 12;
    const ch = chordAt(Math.floor(last.start), chords);
    const chPcs = ch ? chordPcs(normRoot(ch.root ?? 0), ch.quality ?? "") : null;
    if (!chPcs || chPcs.length === 0 || chPcs.includes(cadPc)) last.pitch = snapToPc(last.pitch, cadPc, lo, hi);
    else last.pitch = snapTo(last.pitch, new Set(chPcs), lo, hi);
    // 末尾を cut までに収めて以降を休符に（息継ぎ）。
    last.dur = Math.max(0.25, Math.min(last.dur, Math.round((cut - last.start) * 1000) / 1000));
    for (const n of kept) keep.push(n);
  }
  notes.length = 0;
  for (const n of keep) notes.push(n);
}

// 弱起を前置（破壊的）：最初のダウンビート音の1スケール度下から歩進で滑り込む upbeat を負startで足す。
function prependPickup(
  notes: { pitch: number; start: number; dur: number }[],
  pickup: number,
  scaleArr: number[],
): void {
  const first = notes.reduce((a, b) => (b.start < a.start ? b : a));
  const deg = toScaleDegree(first.pitch, scaleArr);
  const below = degreeToPitch(deg.idx - 1, deg.oct, scaleArr); // 1スケール度下＝歩進で滑り込む
  notes.push({ pitch: below, start: round3(-pickup), dur: round3(pickup) }); // 拍0の前（負start）
}

// 跳躍後の順次反行（gap-fill）：4度以上跳躍の直後の「弱拍」音を逆向き1スケール度の歩進に補正。
// 強拍/カデンツ音は動かさない（コードトーン着地を壊さない）。
function recoverLeaps(
  notes: { pitch: number; start: number; dur: number }[],
  scaleArr: number[],
  strongSet: Set<number>,
  perBar: number,
  lo: number,
  hi: number,
): void {
  notes.sort((a, b) => a.start - b.start);
  const isStrong = (start: number): boolean => {
    if (start < 0) return false;
    const pos = Math.round((((start % perBar) + perBar) % perBar) * 1000) / 1000;
    return Number.isInteger(start) || strongSet.has(pos);
  };
  for (let i = 1; i < notes.length - 1; i++) {
    const leap = notes[i]!.pitch - notes[i - 1]!.pitch;
    if (Math.abs(leap) < 5) continue; // 4度未満は跳躍扱いしない
    const nxt = notes[i + 1]!;
    if (isStrong(nxt.start)) continue; // 強拍/カデンツ音は保つ
    const dir = leap > 0 ? -1 : 1; // 跳躍と逆向き
    const d = toScaleDegree(notes[i]!.pitch, scaleArr);
    nxt.pitch = Math.max(lo, Math.min(hi, degreeToPitch(d.idx + dir, d.oct, scaleArr)));
  }
}

// 滑り込み能動生成（S2b・spec§10.4）：強拍のコードトーンを「1度上の非和声音(倚音)」に差し替え、
// 直後の弱拍を元のコードトーンへ**下行歩進で解決**＝強拍にもたれて滑り込む表情。頻度＝表情ノブ。
function applyExpression(
  notes: { pitch: number; start: number; dur: number }[],
  chords: { root?: number | string; quality?: string; start?: number; dur?: number }[] | undefined,
  scaleArr: number[],
  knob: number,
  rng: Rng,
  strongSet: Set<number>,
  perBar: number,
  lo: number,
  hi: number,
): void {
  if (knob <= 0) return;
  notes.sort((a, b) => a.start - b.start);
  const isStrong = (start: number): boolean => {
    if (start < 0) return false;
    const pos = Math.round((((start % perBar) + perBar) % perBar) * 1000) / 1000;
    return Number.isInteger(start) || strongSet.has(pos);
  };
  for (let i = 1; i < notes.length - 1; i++) {
    const cur = notes[i]!;
    const next = notes[i + 1]!;
    if (!isStrong(cur.start) || isStrong(next.start)) continue; // 強拍にもたれ→弱拍で解決
    const ch = chordAt(Math.floor(cur.start), chords);
    if (!ch || !isChordTone(cur.pitch, ch)) continue;
    if (rng.next() >= knob) continue;
    const ct = cur.pitch;
    const d = toScaleDegree(ct, scaleArr);
    const appog = degreeToPitch(d.idx + 1, d.oct, scaleArr); // 1スケール度上＝倚音候補
    if (appog < lo || appog > hi || isChordTone(appog, ch) || Math.abs(appog - ct) > 2) continue;
    cur.pitch = appog; // 強拍に非和声音でもたれる
    next.pitch = ct; // 下行歩進で元のコードトーンへ解決
  }
}

// 解決保証（S2b・spec§7-6）：孤立した非和声音(classifyNCT="other"＝跳躍入り跳躍抜け等)を最近傍
// コードトーンへ寄せて消す＝孤立NCTゼロ。経過/刺繍/倚音/掛留/逸音は解決を伴うので残す。
function enforceResolution(
  notes: { pitch: number; start: number; dur: number }[],
  chords: { root?: number | string; quality?: string; start?: number; dur?: number }[] | undefined,
  lo: number,
  hi: number,
): void {
  notes.sort((a, b) => a.start - b.start);
  for (let i = 0; i < notes.length; i++) {
    const cur = notes[i]!;
    const ch = chordAt(Math.floor(Math.max(0, cur.start)), chords);
    if (!ch) continue;
    const prev = i > 0 ? notes[i - 1]!.pitch : null;
    const next = i < notes.length - 1 ? notes[i + 1]!.pitch : null;
    if (classifyNCT(prev, cur.pitch, next, ch) === "other") {
      cur.pitch = snapTo(cur.pitch, new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")), lo, hi);
    }
  }
}

// 弱拍の装飾（S3b・spec§10.4）：コードトーンの周りで「踊る」。前後の音が3度なら間を**経過音**で埋め、
// 同音なら**刺繍音**（歩進で離れて戻る）にする＝歩進で解決する正しい非和声音に。強拍/負startは触らない。
function decorateWeak(
  notes: { pitch: number; start: number; dur: number }[],
  scaleArr: number[],
  strongSet: Set<number>,
  perBar: number,
  lo: number,
  hi: number,
): void {
  notes.sort((a, b) => a.start - b.start);
  const isStrong = (start: number): boolean => {
    if (start < 0) return false;
    const pos = Math.round((((start % perBar) + perBar) % perBar) * 1000) / 1000;
    return Number.isInteger(start) || strongSet.has(pos);
  };
  const step = (p: number, dir: number): number => {
    const d = toScaleDegree(p, scaleArr);
    return Math.max(lo, Math.min(hi, degreeToPitch(d.idx + dir, d.oct, scaleArr)));
  };
  for (let i = 1; i < notes.length - 1; i++) {
    const cur = notes[i]!;
    const prev = notes[i - 1]!.pitch;
    const next = notes[i + 1]!.pitch;
    if (isStrong(cur.start)) continue; // 強拍(骨格音)は保つ
    if (notes[i + 1]!.start - cur.start > 1 || cur.start - notes[i - 1]!.start > 1) continue; // 近接のみ（句跨ぎ除外）
    const d = next - prev;
    if (Math.abs(d) === 3 || Math.abs(d) === 4) {
      cur.pitch = step(prev, Math.sign(d)); // 3度の間＝経過音（前から1歩進、次へも1歩進で解決）
    } else if (d === 0 && prev === cur.pitch) {
      cur.pitch = step(prev, 1); // 静止(同音反復)＝上の刺繍音（離れて戻る）
    }
  }
}

/** エッセンス→"違うメロ"生成（S5a・北極星・spec§4）：参照メロの**リズム指紋＋輪郭(身振り)**を保ち、
 * 音高は**コードに沿って再生成**（開始＝コードトーン、輪郭方向へスケールを歩く・拍頭はコードトーンへ）。
 * ＝「似てるが別物」＝著作権セーフ（抽象層=リズム/輪郭を継ぎ、絶対ピッチ列は作り直す）。決定的(seed)。 */
export function genFromEssence(
  refNotes: { pitch: number; start?: number; dur?: number }[],
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: {
    strength?: number; // 崩し強度 0..1。0=従来(輪郭を厳密保存)・1=面影だけ。既定0＝後方互換。
    blendWith?: { pitch: number; start?: number; dur?: number }[][]; // 追加参照（輪郭を混ぜ、単一源に辿れなくする）
  },
): GenResult {
  const f = normalizeFrame(frame);
  const sortFilter = (arr: { pitch: number; start?: number; dur?: number }[]) =>
    [...(arr ?? [])].filter((n) => typeof n.pitch === "number").sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const ns = sortFilter(refNotes);
  if (ns.length === 0) return genMelody(frame, chords, seed); // 参照無し＝通常生成
  const strength = Math.max(0, Math.min(1, opts?.strength ?? 0));
  const rng = new Rng(seed ?? 1);
  const minor = isMinorFrame(f); // mode一級・moodフォールバック（2026-07-08）
  const scale = scalePcs(f.key ?? 0, minor ? "minor" : "major"); // E1: frame.key を尊重（旧: 常にC＝調外まみれ）
  const scaleArr = scaleArray(scale);
  const lo = 60;
  const hi = 84;
  // ブレンド：主参照＋追加参照の輪郭を位置ごとに混ぜる＝出力が単一源に辿れない（著作権＋凡庸さ対策）。
  const refs = [ns, ...(opts?.blendWith ?? []).map(sortFilter).filter((r) => r.length > 0)];
  const contours = refs.map((r) => melodyEssence(r).contour); // contour（身振り）を継ぐ
  const dirAt = (k: number): number => {
    const cand: number[] = [];
    for (const c of contours) if (c[k] !== undefined) cand.push(c[k]!);
    if (cand.length === 0) return 0;
    if (cand.length === 1) return cand[0]!; // 単一参照＝従来どおり（rng を引かない＝後方互換）
    return rng.choice(cand); // 複数参照＝位置ごとに身振りを混ぜる
  };
  // 崩し強度→歩幅プールと向きの揺らぎ確率。strength=0 は [1,1,2]・揺らぎ無し＝従来と完全一致。
  const magPool = strength < 0.34 ? [1, 1, 2] : strength < 0.67 ? [1, 2, 2, 3] : [1, 2, 3, 4];
  const flipP = strength * 0.5;
  const ctAt = (t: number): Set<number> => {
    const ch = chordAt(Math.floor(Math.max(0, t)), chords);
    return ch ? new Set(chordPcs(ch.root ?? 0, ch.quality ?? "")) : scale;
  };
  const notes: { pitch: number; start: number; dur: number }[] = [];
  let pitch = snapTo(72, ctAt(ns[0]!.start ?? 0), lo, hi); // 開始＝コードトーン
  for (let i = 0; i < ns.length; i++) {
    const t = ns[i]!.start ?? 0;
    const dur = ns[i]!.dur ?? 0.5;
    if (i > 0) {
      let dir = dirAt(i - 1); // 参照(群)の上下動（身振り）
      if (strength > 0 && rng.next() < flipP) dir = rng.choice([-1, 0, 1]); // 崩し：向きを揺らす＝面影だけ残す
      const mag = dir === 0 ? 0 : rng.choice(magPool); // 歩幅は作り直す＝別の音程に（強いほど広い）
      const d = toScaleDegree(pitch, scaleArr);
      pitch = degreeToPitch(d.idx + dir * mag, d.oct, scaleArr);
    }
    if (Number.isInteger(t)) pitch = snapTo(pitch, ctAt(t), lo, hi); // 拍頭はコードトーンへ（ハモる）
    pitch = Math.max(lo, Math.min(hi, pitch));
    notes.push({ pitch, start: round3(t), dur: round3(dur) });
  }
  const tag = strength >= 0.67 ? "大きく崩した" : strength >= 0.34 ? "崩した" : "連想";
  const label = (f.mood ? f.mood + "の" + tag + "メロ" : tag + "メロ").slice(0, 24);
  return { items: [{ kind: "melody", content: { notes }, label }], edges: [] };
}

/** コード楽器パターン（コンピング/アルペジオ・CP4）：素直な既定パターンを生成（音は出さない＝
 * content のパターンのみ。実音化は合成側 resolveChordPattern が進行に当てて行う）。決定的(seed)。 */
export function genChordPattern(frame?: Frame | null, seed?: number | null): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed ?? 5);
  const info = meterInfo(f.meter);
  const bars = barsOf(f);
  const stepsPerBar = Math.round(info.beatsPerBar * 4); // 16分グリッド：4/4=16, 6/8=12, 3/4=12
  const steps = bars * stepsPerBar;
  const bias = densityBias(f.mood ?? "", f.tempo);
  const per = bias.long >= 1.5 ? stepsPerBar : bias.busy >= 1.5 ? 2 : 4; // sparse=小節頭/busy=八分/既定=拍頭
  const hits: { step: number; dur: number }[] = [];
  for (let s = 0; s < steps; s += per) hits.push({ step: s, dur: per }); // 各音は次の発音まで＝つながるコンピング
  const mode = rng.next() < 0.25 ? "arp" : "strum"; // たまにアルペジオ
  const content = { mode, voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0 }, steps, hits };
  return { items: [{ kind: "chord_pattern", content, label: "コード楽器" }], edges: [] };
}

/** ベースライン（強拍=ルート・弱拍=5度/オクターブ）＋**リズム図形**。C2基準低域。 */
export function genBass(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed ?? 42);
  const bars = barsOf(f);
  const info = meterInfo(f.meter); // 6/8 一級（メロと拍子を揃える）
  const bassFigs = info.grouping === "compound" ? COMPOUND_BASS_FIGS : BASS_FIGS;
  const bpb = info.beatsPerBar;
  const total = Math.max(1, Math.round(bars * bpb));
  const perBar = bpb;
  const bias = densityBias(f.mood ?? "", f.tempo);
  const notes: { pitch: number; start: number; dur: number }[] = [];
  let beat = 0;
  while (beat < total - 1e-9) {
    const onBar = beat % perBar === 0;
    const fig = pickFig(rng, bassFigs, bias, total - beat, true); // ベースは毎拍頭から発音
    const ch = chordAt(Math.floor(beat), chords);
    const root = ch ? normRoot(ch.root ?? 0) : (f.key ?? 0); // chord 不在時も曲の調を主音に。
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

  // 6/8 など複合拍子（1小節=12step＝6八分）：付点ビート(step0,6)を芯に。メロ/ベースと拍子を揃える。
  if (meterInfo(f.meter).grouping === "compound") {
    const k = new Set<number>([0, 6]); // 2つの付点ビート頭にキック
    const sn = new Set<number>([6]); // バックビートは2拍目（付点ビート2）
    let hat: number[] = [0, 2, 4, 6, 8, 10]; // 八分でハット
    let hv = 55;
    if (sparse) { sn.clear(); sn.add(6); k.delete(6); hat = [0, 6]; hv = 45; } // 静かな6/8（ハット付点ビートのみ）
    else if (busy) { hat = Array.from({ length: 12 }, (_, i) => i); k.add(rng.choice([3, 9])); hv = 42; } // 16分ハット
    const cl = [
      { name: "Kick", midi: GM.Kick, hits: [...k].sort((a, b) => a - b), vel: 115 },
      { name: "Snare", midi: GM.Snare, hits: [...sn].sort((a, b) => a - b), vel: 105 },
      { name: "HiHat", midi: GM.HiHat, hits: hat, vel: hv },
    ];
    // C④ step↔拍を自己記述（hits は0..steps-1の16分グリッド index、beatsPerStep で拍へ変換可）。
    return { items: [{ kind: "rhythm", content: { rhythm: { steps: 12, bars: 1, beatsPerStep: round3(beatsPerBar(f.meter) / 12), lanes: cl } }, label: "ドラム" }], edges: [] };
  }
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
  // C④ step↔拍を自己記述（hits は0..steps-1の16分グリッド index、beatsPerStep で拍へ変換可）。
  return { items: [{ kind: "rhythm", content: { rhythm: { steps: 16, bars: 1, beatsPerStep: round3(beatsPerBar(f.meter) / 16), lanes } }, label: "ドラム" }], edges: [] };
}
