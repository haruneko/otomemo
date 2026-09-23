// ピアノ伴奏（phrase_maker 試作 #1 取り込み S3）＝バンドの中のピアノとしてまとめる部分＋2拍替わりの区切り。
// 移植元＝phrase_maker `experiments/piano/fingersim/handframe_band.py`（e186970）の generate_handframe_band と
// その下請け（和音の材料・リズムの器・掴む位置の段・左手の3度と7度の和音・音量の輪郭・ペダル窓）。
//
// 正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §3（区切り）・§5 S3。まだどこからも呼ばれない（既存の出音は不変）。
//
// 元との違い（設計どおり）：
// - 区切り（セル）：進行の最短コード長で 2拍 or 1小節の区切りにし、区切りを「小節」としてエンジンに渡す（試作 #1 の疑似拍子と同じ）。
//   源流のモジュール変数 METER は引数（cellBeats）にした。
// - 打鍵の揺れ（源流 strike_chord）：強さ（最高音を強める＋乱数のばらつき）は Otomemo の乱数（mulberry32）で音量に焼く。
//   発音時刻のずれは既存の feel 層（humanize）に渡す値として返すだけ（ここでは時刻を動かさない）。Python との一致は求めない。
//   源流の「強い音ほど早く」は1音ごとの時刻差なので feel 層では表せない（持たない）。
// - 8分裏の単音（器の a 行）を外す口（offbeatSingles=false）＝器から8分裏の打点を消す（切り分け試聴と同じ外し方）。
//   掴む位置の段は外す前の器から決める（同上）。
// 揺れ off・8分裏 on の出力は Python（humanize=False）と bit 一致（test/handframe-band.test.ts・基準音 F-A/F-C）。
// 環境の乱数・時計は使わない。
import { canonicalQuality, normRoot, PITCH_NAMES, QUALITY_INTERVALS, type Feel } from "./index";
import { chordScalePcs, chordTonePcs, fifthSemitone, PM_QUALITY_ALIAS, seventhSemitone, thirdSemitone, type CfChord } from "./chordScale";
import { pyRound } from "./drumFill";
import { generateHandFrame, liftAbove, metricAccentNorm, REL, TILL_GRAB, STAB, type DurClass, type HandFrameBar, type HandFrameDiag, type HandFrameNote } from "./handFrame";
import { phraseEnergy, type PhraseSpec } from "./phraseArc";
import { pySum } from "./pyMath";

// ---------------------------------------------------------------------------
// 定数（源流 :58-68・:217-250・:315-323）
// ---------------------------------------------------------------------------
export const HF_BAND_REG_GAP = 2;
export const HF_BAND_PIANO_FLOOR = 52;
/** 源流 HUMANIZE_DEFAULT の強さの部分（chord_attack DEFAULT_TOP_BIAS / DEFAULT_VEL_SD）。 */
export const HF_BAND_TOP_BIAS = 8.0;
export const HF_BAND_VEL_SD = 13.0;
const VMIN = 24;
const VMAX = 120;
/**
 * 揺れ on のとき返す feel.humanize の値（和音パートのプロファイル・tempo つき）。耳A の音声づくりで、25 秒までの
 * 全音の格子からのずれの平均が試作 #1（3.4ms）と同程度になる値を実測で選んだ（0.25→0.6ms・0.5→1.4ms・1.0→3.4ms・96bpm）。
 */
export const HF_BAND_FEEL_HUMANIZE = 1.0;

const RH_CFG_BAND = {
  dyadOn: true, lambdaSkip: 0.3, lambdaInertia: 0.8, landingBonus: -0.2, landingOffstrong: 0.0,
  tension: true, approach: true, wideMotion: true, lineMotion: true, dyadBreak: true,
  approachResolve: true, grabNoCluster: true, secondDyadCap: 1,
} as const;

export type HandFrameBandPreset = "grip" | "mid" | "loose";
const PRESETS: Record<HandFrameBandPreset, { grabOn: "snare" | "snare_kick"; lambdaSkip: number; grabDur: DurClass }> = {
  grip: { grabOn: "snare_kick", lambdaSkip: 0.20, grabDur: TILL_GRAB },
  mid: { grabOn: "snare", lambdaSkip: 0.30, grabDur: TILL_GRAB },
  loose: { grabOn: "snare", lambdaSkip: 0.42, grabDur: STAB },
};

const GRAB_DENSITY = [
  { count: 2, lambdaSkip: 0.55, grabWScale: 0.7 },
  { count: 3, lambdaSkip: 0.45, grabWScale: 1.4 },
  { count: 4, lambdaSkip: 0.32, grabWScale: 2.4 },
  { count: 5, lambdaSkip: 0.14, grabWScale: 5.2 },
] as const;
export const HF_BAND_GRAB_LEVELS = GRAB_DENSITY.length;

// ---------------------------------------------------------------------------
// リズムの器（源流 chart.RhythmSpec.from_grid_text の b/s/a 行だけ）
// ---------------------------------------------------------------------------
export interface HandFrameContainer {
  grid: number;
  onsets: readonly number[];
  kick: readonly number[];
  snare: readonly number[];
  accents: readonly number[];
}

/** "b: x.....x.\ns: ....X...\na: ..x...x." → 器。x＝打点・X＝打点＋強勢・./-/_＝休み。未知の行・文字は例外。 */
export function containerFromGridText(text: string): HandFrameContainer {
  const rows: Record<string, string> = {};
  for (const raw of text.trim().split("\n")) {
    const line = raw.trim();
    if (!line || !line.includes(":")) continue;
    const i = line.indexOf(":");
    const label = line.slice(0, i).trim().toLowerCase();
    if (label !== "b" && label !== "s" && label !== "a") throw new Error(`containerFromGridText: unknown row label ${label}`);
    rows[label] = line.slice(i + 1).replace(/[ \t]/g, "");
  }
  const lens = new Set(Object.values(rows).filter((v) => v !== "").map((v) => v.length));
  if (lens.size !== 1) throw new Error("containerFromGridText: rows must all be the same length");
  const grid = [...lens][0]!;
  const onsets = new Set<number>(), kick: number[] = [], snare: number[] = [], accents: number[] = [];
  const parse = (k: string, target: number[] | null) => {
    const row = rows[k] ?? "";
    for (let i = 0; i < row.length; i++) {
      const c = row[i]!;
      if (".-_".includes(c)) continue;
      if (c !== "x" && c !== "X") throw new Error(`containerFromGridText: bad char ${c} at step ${i} in row ${k}`);
      onsets.add(i);
      if (target) target.push(i);
      if (c === "X") accents.push(i);
    }
  };
  parse("b", kick);
  parse("s", snare);
  parse("a", null);
  const uniqSorted = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b);
  return { grid, onsets: uniqSorted(onsets), kick: uniqSorted(kick), snare: uniqSorted(snare), accents: uniqSorted(accents) };
}

/** 試作 #1 の器（設計書 §3-1）。区切り 8 マス＝2拍・16 マス＝1小節。 */
export const HF_BAND_CONTAINER_TEXT: Readonly<Record<8 | 16, string>> = {
  8: "b: x.....x.\ns: ....X...\na: ..x...x.",
  16: "b: x.......x.......\ns: ....X.......X...\na: ..x...x...x...x.",
};

/** 器から8分裏（マス %4 == 2）の打点を全部の行から消す＝8分裏の単音を外した版（切り分け試聴と同じ外し方）。 */
export function withoutOffbeatEighths(c: HandFrameContainer): HandFrameContainer {
  const keep = (xs: readonly number[]) => xs.filter((s) => s % 4 !== 2);
  return { grid: c.grid, onsets: keep(c.onsets), kick: keep(c.kick), snare: keep(c.snare), accents: keep(c.accents) };
}

// ---------------------------------------------------------------------------
// 掴む位置の段（源流 _ranked_onsets / grab_ladder / grab_density_cfg :326-357）
// ---------------------------------------------------------------------------
export function grabDensityCfg(c: HandFrameContainer, level: number): { grabSlots: ReadonlySet<number>; lambdaSkip: number; grabWScale: number } {
  const lv = Math.max(1, Math.min(GRAB_DENSITY.length, level));
  const row = GRAB_DENSITY[lv - 1]!;
  const nz = (xs: readonly number[]) => xs.filter((s) => s !== 0);
  const onset = nz(c.onsets);
  const ranked: number[] = [];
  for (const s of [...nz(c.snare), ...nz(c.kick), ...nz(c.accents), ...onset]) if (!ranked.includes(s)) ranked.push(s);
  const cap = Math.max(1, onset.length - 2);
  const count = Math.max(1, Math.min(row.count, cap, ranked.length));
  return { grabSlots: new Set(ranked.slice(0, count).sort((a, b) => a - b)), lambdaSkip: row.lambdaSkip, grabWScale: row.grabWScale };
}

/** 源流 sheet_accent_table（:391-420・grab_slots なし）。 */
export function sheetAccentTable(c: HandFrameContainer): (slot: number, grid: number) => number {
  const snare = new Set(c.snare), kick = new Set(c.kick), acc = new Set(c.accents), onset = new Set(c.onsets);
  return (slot, grid) => {
    const s = ((slot % grid) + grid) % grid;
    if (snare.has(s)) return 1.0;
    if (acc.has(s)) return 0.9;
    if (kick.has(s)) return 0.5;
    if (onset.has(s)) return 0.3;
    return 0.2;
  };
}

// ---------------------------------------------------------------------------
// 和音の材料（源流 comping.deg_pcs / allowed_pcs・handframe_band.allowed_colour）＝Otomemo の和音表で作る
// ---------------------------------------------------------------------------
export interface BandChord {
  root: number | string;
  quality: string;
  /** 長さ（拍） */
  beats: number;
}

export interface HandFrameBandBar extends HandFrameBar {
  token: string;
  colour: ReadonlySet<number>;
}

const DOMINANT_FAMILY = new Set(["dom7", "9", "11", "13", "7b9", "7#9", "7#5", "7b5"]);
const sortedSet = (xs: Iterable<number>): Set<number> => new Set([...new Set(xs)].sort((a, b) => a - b));
const mod12 = (x: number) => ((x % 12) + 12) % 12;

export function bandChordMaterial(ch: { root: number | string; quality: string }): HandFrameBandBar {
  const rootPc = normRoot(ch.root);
  const q = canonicalQuality(ch.quality);
  const tones = QUALITY_INTERVALS[q];
  if (!tones) throw new Error(`bandChordMaterial: unknown chord quality ${ch.quality}`);
  const cf: CfChord = { rootPc, quality: q, tones };
  const sev = seventhSemitone(cf);
  const deg: Record<string, number> = {
    R: rootPc,
    "3": mod12(rootPc + thirdSemitone(cf)),
    "5": mod12(rootPc + fifthSemitone(cf)),
    "7": sev != null ? mod12(rootPc + sev) : mod12(rootPc + fifthSemitone(cf)),
    "9": mod12(rootPc + 2),
    "6": mod12(rootPc + 9),
    b7: mod12(rootPc + 10),
  };
  const strong = chordTonePcs(cf);
  const allowed = new Set(strong);
  allowed.add(mod12(rootPc + 2));
  const pmName = PM_QUALITY_ALIAS[q] ?? q;
  if (DOMINANT_FAMILY.has(pmName)) { allowed.add(mod12(rootPc + 6)); allowed.add(mod12(rootPc + 9)); }
  const colour = new Set(strong);
  for (const t of chordScalePcs(cf)) if (!strong.has(t) && !strong.has(mod12(t - 1))) colour.add(t);
  for (const t of allowed) colour.add(t);
  // rh は band では使わない（ボイシングは bandRhVoicing）。源流の close ボイシングは持ち込まない。
  return { token: `${PITCH_NAMES[rootPc]}${q}`, rh: [], allowed: sortedSet(allowed), deg, colour: sortedSet(colour) };
}

// ---------------------------------------------------------------------------
// 区切り（設計書 §3-1）
// ---------------------------------------------------------------------------
/** 最短コード長で区切りを 2拍 or 1小節（4拍）にし、区切りごとに頭で鳴っているコードを返す。4/4 だけ。 */
export function splitIntoCells(chords: readonly BandChord[]): { cellBeats: 2 | 4; cells: BandChord[]; warnings: string[] } {
  if (!chords.length) return { cellBeats: 4, cells: [], warnings: [] };
  const warnings: string[] = [];
  for (const c of chords) if (!(c.beats > 0)) throw new Error(`splitIntoCells: chord beats must be > 0 (got ${c.beats})`);
  const minBeats = Math.min(...chords.map((c) => c.beats));
  const cellBeats: 2 | 4 = minBeats < 4 ? 2 : 4;
  if (minBeats < 2) warnings.push("chord shorter than 2 beats: the chord sounding at each 2-beat cell head is used");
  const total = pySum(chords.map((c) => c.beats));
  const nCells = Math.ceil(total / cellBeats - 1e-9);
  const cells: BandChord[] = [];
  let ci = 0, acc = 0;
  for (let k = 0; k < nCells; k++) {
    const t = k * cellBeats;
    while (ci + 1 < chords.length && acc + chords[ci]!.beats <= t + 1e-9) { acc += chords[ci]!.beats; ci++; }
    const c = chords[ci]!;
    cells.push({ root: c.root, quality: c.quality, beats: cellBeats });
  }
  return { cellBeats, cells, warnings };
}

// ---------------------------------------------------------------------------
// 左手（源流 _place_mid / _shell_lift :86-135）・右手のボイシング（:427-430）
// ---------------------------------------------------------------------------
export function placeMid(pcs: readonly number[], center = 60, lo = 52, hi = 72): number[] {
  const ps = [...new Set(pcs.map(mod12))].sort((a, b) => a - b);
  let notes: number[] = [];
  let prev: number | null = null;
  const base = Math.floor(center / 12) * 12;
  for (const pc of ps) {
    let n = base + pc;
    while (n < lo) n += 12;
    if (prev != null) while (n <= prev) n += 12;
    notes.push(n);
    prev = n;
  }
  while (notes.length && Math.max(...notes) > hi) notes = notes.map((n) => n - 12);
  while (notes.length && Math.min(...notes) < lo) notes = notes.map((n) => n + 12);
  return notes;
}

export const shellLift = (vd: HandFrameBar, bassMax: number): number[] =>
  liftAbove([...placeMid([vd.deg["3"]!, vd.deg["7"]!])].sort((a, b) => a - b), bassMax);

/** 左手の殻を「ベースの壁から1オクターブ」[lo, lo+11] に置く（ピアノの常識的な置き方：左手が下・右手が上）。 */
export const shellLow = (vd: HandFrameBar, lo: number): number[] =>
  [vd.deg["3"]!, vd.deg["7"]!].map((pc) => lo + mod12(pc - lo)).sort((a, b) => a - b);

export const bandRhVoicing = (vd: HandFrameBar, bassMax: number): number[] => {
  const d = vd.deg;
  return liftAbove([d.R!, d["3"]!, d["5"]!, d.R! + 12].sort((a, b) => a - b), bassMax).slice(0, 4);
};

// ---------------------------------------------------------------------------
// 音量の輪郭（源流 velocity_contour / apply_metric_accent / apply_phrase_velocity :142-200）
// ---------------------------------------------------------------------------
const clampVel = (v: number) => Math.trunc(Math.max(VMIN, Math.min(VMAX, v)));
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function velocityContour(notes: readonly HandFrameNote[], hand = "R", amp = 6): HandFrameNote[] {
  const out = notes.map((n) => [...n] as HandFrameNote);
  const byT = new Map<number, number[]>();
  notes.forEach((n, i) => { if (n[4] !== hand) return; const k = r6(n[1]); if (!byT.has(k)) byT.set(k, []); byT.get(k)!.push(i); });
  const wave: [number, number][] = [];
  for (const [t, g] of byT) if (g.length === 1) wave.push([t, g[0]!]);
  wave.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const seq = wave.map((w) => w[1]);
  if (seq.length < 2) return out;
  let runDir = 0, runPos = 0;
  for (let k = 0; k < seq.length; k++) {
    if (k > 0) {
      const step = out[seq[k]!]![0] - out[seq[k - 1]!]![0];
      const d = step === 0 ? 0 : step > 0 ? 1 : -1;
      runPos = d === runDir ? runPos + 1 : 0;
      runDir = d !== 0 ? d : runDir;
    }
    const delta = Math.trunc(Math.max(-amp, Math.min(amp, runDir ? (runPos - 1) * 2 * runDir : 0)));
    const n = out[seq[k]!]!;
    n[3] = clampVel(n[3] + delta);
  }
  return out;
}

export function applyMetricAccent(notes: readonly HandFrameNote[], sd: number, bd: number, accentTable: ((slot: number, grid: number) => number) | null, grid = 16, hand = "R", g = 8): HandFrameNote[] {
  const out = notes.map((n) => [...n] as HandFrameNote);
  const sel = notes.flatMap((n, i) => (n[4] === hand ? [i] : []));
  if (!sel.length) return out;
  const at = accentTable ?? metricAccentNorm;
  const aa = sel.map((i) => { const n = notes[i]!; const slot = ((pyRound((n[1] - n[5] * bd) / sd) % grid) + grid) % grid; return at(slot, grid); });
  const meanA = pySum(aa) / aa.length;
  sel.forEach((i, k) => { const n = out[i]!; n[3] = clampVel(pyRound(n[3] + g * (aa[k]! - meanA))); });
  return out;
}

export function applyPhraseVelocity(notes: readonly HandFrameNote[], arc: PhraseSpec | null, sd: number, bd: number, grid = 16, hand = "R"): HandFrameNote[] {
  const out = notes.map((n) => [...n] as HandFrameNote);
  if (arc == null) return out;
  const sel = notes.flatMap((n, i) => (n[4] === hand ? [i] : []));
  if (!sel.length) return out;
  const es = sel.map((i) => { const n = notes[i]!; const slot = pyRound((n[1] - n[5] * bd) / sd); return phraseEnergy(n[5], slot, grid, arc); });
  const meanE = pySum(es) / es.length;
  sel.forEach((i, k) => { const n = out[i]!; n[3] = clampVel(pyRound(n[3] + arc.kVel * (es[k]! - meanE))); });
  return out;
}

// ---------------------------------------------------------------------------
// 打鍵の強さの揺れ（源流 chord_attack.humanize_chord_attack の強さの部分・Otomemo の乱数）
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 右手の同時打鍵（同じ発音時刻）ごとに、最高音 +TOP_BIAS・各音に正規乱数（SD＝VEL_SD）を足して丸める。時刻は動かさない。 */
export function scatterStrikeVelocity(notes: readonly HandFrameNote[], seed: number, hand = "R"): HandFrameNote[] {
  const out = notes.map((n) => [...n] as HandFrameNote);
  const rnd = mulberry32((seed ^ 0x5f3759df) >>> 0);
  const gauss = (): number => { let u = 0; while (u === 0) u = rnd(); const v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const groups = new Map<number, number[]>();
  out.forEach((n, i) => { if (n[4] !== hand) return; const k = r6(n[1]); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(i); });
  for (const idx of [...groups.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])) {
    const top = Math.max(...idx.map((i) => out[i]![0]));
    for (const i of idx) {
      const n = out[i]!;
      let v = n[3] + (n[0] === top ? HF_BAND_TOP_BIAS : 0);
      v += gauss() * HF_BAND_VEL_SD;
      n[3] = clampVel(pyRound(v));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 本体（源流 generate_handframe_band :436-581）
// ---------------------------------------------------------------------------
export interface HandFrameBandOptions {
  tempo: number;
  seed: number;
  /** 掴む量の段 1..4（試作 #1 は 2） */
  level?: number;
  preset?: HandFrameBandPreset;
  bassMax?: number;
  sustainPedal?: boolean;
  /** 打鍵の揺れ（強さのばらつき＋feel の時刻のずれ）。既定 on（試作 #1）。off でも別のバリエーションとして使える（耳判定 09-17）。 */
  humanize?: boolean;
  /** 8分裏の単音。既定 on（試作 #1）。off＝器から8分裏の打点を消す（耳判定 09-17：別のバリエーションとして良い）。 */
  offbeatSingles?: boolean;
  lh?: "shell" | "tacet";
  /** 両手の音域。"source"＝試作 #1 のまま（左手の殻が中音域・右手はベースの壁のすぐ上＝左右が重なる）。
   *  "piano"＝左手の殻をベースの壁から1オクターブ [bassMax, bassMax+11]・右手はその上（左手が下・右手が上）。 */
  register?: "source" | "piano";
  arc?: PhraseSpec | null;
  /** 器を差し替えるとき（既定＝試作 #1 の器） */
  containerText?: string;
}

export interface HandFrameBandResult {
  cellBeats: 2 | 4;
  /** 源流と同じ6つ組（秒・格子上）。最後はセル番号。 */
  notes: HandFrameNote[];
  /** ペダル窓（秒）[踏む, 離す] */
  pedals: [number, number][];
  /** content の形（拍・四分=1）。pedal はペダルありのときだけキーを持つ。 */
  content: { notes: { pitch: number; start: number; dur: number; vel: number }[]; pedal?: { start: number; dur: number }[] };
  /** 揺れ on のとき feel 層に渡す値（発音時刻のずれ）。off は null。 */
  feel: Feel | null;
  diag: HandFrameDiag;
}

/** 区切り済みのコード列（cells）で生成する。cellBeats＝2 or 4。 */
export function generateHandFrameBandCells(cells: readonly { root: number | string; quality: string }[], cellBeats: 2 | 4, opts: HandFrameBandOptions): HandFrameBandResult {
  const {
    tempo, seed, level = 2, preset = "mid", bassMax = 48, sustainPedal = true, humanize = true, offbeatSingles = true,
    lh = "shell", arc = null, register = "source",
  } = opts;
  if (cellBeats !== 2 && cellBeats !== 4) throw new Error(`generateHandFrameBandCells: cellBeats must be 2 or 4 (got ${cellBeats})`);
  if (!(tempo > 0)) throw new Error("generateHandFrameBandCells: tempo must be > 0");
  const cellSteps = (cellBeats * 4) as 8 | 16;
  const bd = (cellBeats * 60.0) / tempo;
  const sd = bd / cellSteps;
  const vds = cells.map(bandChordMaterial);
  const toks = vds.map((v) => v.token);
  const nBars = vds.length;
  // 右手の下の壁：試作 #1 はベースの壁、ピアノの置き方は左手の殻の窓の上端
  const rhWall = register === "piano" ? bassMax + 11 : bassMax;
  const floor = Math.max(rhWall + HF_BAND_REG_GAP, HF_BAND_PIANO_FLOOR);

  const fullContainer = containerFromGridText(opts.containerText ?? HF_BAND_CONTAINER_TEXT[cellSteps]);
  if (fullContainer.grid !== cellSteps) throw new Error(`container grid ${fullContainer.grid} != cell steps ${cellSteps}`);
  const container = offbeatSingles ? fullContainer : withoutOffbeatEighths(fullContainer);
  const dens = grabDensityCfg(fullContainer, level);
  const ps = PRESETS[preset];
  const grid = container.grid;
  const structureSlots = Array.from({ length: nBars }, () => new Set([...dens.grabSlots].filter((s) => s !== 0)));
  const accentTable = sheetAccentTable(container);

  let pedals: [number, number][] = [];
  let clash: { clashGuard: "region" | "held"; clashRegions?: [number, number][] };
  if (sustainPedal) {
    const windows: [number, number][] = Array.from({ length: nBars }, (_, b) => [b * bd, (b + 1) * bd - REL]);
    clash = { clashGuard: "region", clashRegions: windows };
    pedals = windows.map((w) => [w[0], w[1]]);
  } else {
    clash = { clashGuard: "held" };
  }

  const rhRes = generateHandFrame(toks, vds, container, seed, {
    hand: "R", bassMax: rhWall, stepDur: sd, barDur: bd, grid, spanMode: "comfort", colourAllowed: vds.map((v) => v.colour), floor, arc,
    voicingFn: (vd) => bandRhVoicing(vd, rhWall), grabPolicy: "sheet", structureSlots, accentTable, grabDur: ps.grabDur,
    grabWScale: dens.grabWScale, ...RH_CFG_BAND, lambdaSkip: dens.lambdaSkip, ...clash,
  });
  let rh = rhRes.notes;

  let lhNotes: HandFrameNote[] = [];
  let dlh: HandFrameDiag | null = null;
  if (lh === "shell") {
    const r = generateHandFrame(toks, vds, container, seed, {
      hand: "L", bassMax, stepDur: sd, barDur: bd, grid, spanMode: "comfort",
      voicingFn: (vd) => (register === "piano" ? shellLow(vd, bassMax) : shellLift(vd, bassMax)), structureOnly: true, holdAllReseed: true,
    });
    lhNotes = r.notes;
    dlh = r.diag;
  }

  if (humanize) rh = scatterStrikeVelocity(rh, seed);
  rh = velocityContour(rh);
  rh = applyMetricAccent(rh, sd, bd, accentTable, grid);
  if (arc != null) rh = applyPhraseVelocity(rh, arc, sd, bd, grid);

  const notes = [...rh, ...lhNotes];
  const toBeats = (sec: number) => (sec * tempo) / 60;
  const content: HandFrameBandResult["content"] = {
    notes: notes.map(([p, s, e, v]) => ({ pitch: p, start: toBeats(s), dur: toBeats(e) - toBeats(s), vel: v })),
  };
  if (sustainPedal) content.pedal = pedals.map(([dn, up]) => ({ start: toBeats(dn), dur: toBeats(up) - toBeats(dn) }));
  return {
    cellBeats, notes, pedals, content,
    feel: humanize ? { humanize: HF_BAND_FEEL_HUMANIZE, seed, keepDur: true } : null, // 長さは生成どおり（耳A 09-17）
    diag: {
      rh: rhRes.diag, lh: dlh, floor, bassMax, preset, level, lambdaSkip: dens.lambdaSkip, grabWScale: dens.grabWScale,
      grabSlots: [...dens.grabSlots], sustainPedal, humanize, offbeatSingles, nCells: nBars, onsets: [...container.onsets],
    },
  };
}

/** 進行（長さつき）から区切りを決めて生成する。4/4 だけ。 */
export function generateHandFrameBand(chords: readonly BandChord[], opts: HandFrameBandOptions): HandFrameBandResult & { warnings: string[] } {
  const { cellBeats, cells, warnings } = splitIntoCells(chords);
  return { ...generateHandFrameBandCells(cells, cellBeats, opts), warnings };
}
