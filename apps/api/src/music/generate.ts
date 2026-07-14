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
import { genMotifMelodyV2, completeMelody, extractMotif16, loadMotifModel16, scalePitchList, loadSkeletonModel, genSkeletonFromModel, type BarRhythmModel, type MoveModel, type SkeletonModel } from "./melodyCells";
import { skeletonToV2Skel, skeletonRestMask, skeletonPhrasesToV2, skelArrayToBreakpoints, explicitBassSegments, foldBassPitch, type SkeletonContent } from "./skeletonNeta"; // 骨格層の一級化（design #20）
import { type RhythmPartsOpt } from "./rhythmParts"; // リズムパーツ層 L1/L2（design #20 S4-1/S4-2）
import { type Feel } from "@cm/music-core"; // フィール層＝swing/humanize を content.feel に載せる（notes はストレート）
import { pitchAt } from "./voiceLeading"; // 対位バイアス＝評価器と同じ低音標本化を生成側でも使う（design「gen_melody×ベース結線」）
import { corpusTypicality } from "./evalMelody"; // P1 自己進化ループ：候補を"らしさ"(E-corpus)で並べる
import { melodySimilarity } from "./similarity"; // P1：多様な top-k を選ぶ（似すぎを飛ばす）

// 度数 → (ルートpc, quality)。C基準（key=0）。
const DIATONIC_MAJOR: Record<number, [number, string]> = {
  1: [0, ""], 2: [2, "m"], 3: [4, "m"], 4: [5, ""], 5: [7, ""], 6: [9, "m"], 7: [11, "dim"],
};
const DIATONIC_MINOR: Record<number, [number, string]> = {
  1: [0, "m"], 2: [2, "dim"], 3: [3, ""], 4: [5, "m"], 5: [7, "7"], 6: [8, ""], 7: [10, ""], 8: [11, "dim"], // 8=vii°(導音の減和音・和声的短調のD)
};
// I3b(2026-07-08)：カラー系mood用の7thパレット（おしゃれ/ジャズ/夜系）。短調Vは従来からV7。
const DIATONIC_MAJOR7: Record<number, [number, string]> = {
  1: [0, "maj7"], 2: [2, "m7"], 3: [4, "m7"], 4: [5, "maj7"], 5: [7, "7"], 6: [9, "m7"], 7: [11, "m7b5"],
};
const DIATONIC_MINOR7: Record<number, [number, string]> = {
  1: [0, "m7"], 2: [2, "m7b5"], 3: [3, "maj7"], 4: [5, "m7"], 5: [7, "7"], 6: [8, "maj7"], 7: [10, "7"], 8: [11, "m7b5"], // 8=vii°(m7b5=導音の減7)
};
const FUNC_DEGREES: Record<string, number[]> = { T: [1, 6, 3], S: [4, 2], D: [5, 7] };
// C0d(2026-07-09 監査C・短調SSOT)：短調のD機能は V7/vii°（両方導音を含む真のドミナント）。旧: D=[5,7] で
// 度数7=♭VII(subtonic・導音なし)を誤ってドミナント位置に置いていた（自前解析器 function.ts=SUB と往復矛盾）。
// ♭VII(度数7)は D から外す＝loop ノブ(♭VI-♭VII-i)でのみ登場。長調 D=[5,7]は度数7=vii°(dim)で正しく不変。
const dcands = (fn: string, minor: boolean): number[] => (fn === "D" && minor ? [5, 8] : FUNC_DEGREES[fn]!);
const FUNC_NEXT: Record<string, string[]> = {
  T: ["S", "S", "D", "D", "T"],
  S: ["D", "D", "D", "S", "T"],
  D: ["T", "T", "T", "D"],
};

// セクション役割（構造上の位置。mood=雰囲気とは直交）。研究doc 2026-07-10-section-role-framing.md §4-1。
export type SectionRole = "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "interlude" | "outro";
export interface SectionContext {
  role?: SectionRole; // このセクションの役割（ノブ既定値の差し替え元）
  prevRole?: SectionRole; // 直前セクションの役割（接続の判断材料・現状は保持のみ）
  nextRole?: SectionRole; // 直後セクションの役割（末尾の開き/締めの判断材料・現状は保持のみ）
  seedMotif?: { pitch: number; start?: number; dur?: number }[]; // 前セクションの代表モチーフ（実音）。extractMotif16→V2 opts.seedMotif
  prevEndPitch?: number; // 前セクション最終音（骨格開始音の近傍候補＝genSkeletonFromModel opts.start へ）
  energy?: number; // 0..1。未指定＝role の既定値をそのまま。明示時のみ density/registerShift を線形スケール（0.5=表の値）。
}

export interface Frame {
  key?: number;
  mode?: "major" | "minor"; // 一級の長短宣言（2026-07-08・design#12-M）。mood からの推定はフォールバック。
  meter?: string;
  tempo?: number;
  bars?: number;
  mood?: string;
  pickup?: number; // 弱起（アウフタクト）：拍0の前に置く拍数（0=無し）。
  expression?: number; // 素直⇔表情ノブ（0..1）：強拍に倚音等の滑り込みを置く頻度。既定は mood で控えめ。
  section?: SectionContext; // セクション役割文脈（2026-07-10）。未指定＝従来 bit 一致。design #12-M「セクション役割の一級化」。
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
  const sec = normalizeSection(f.section);
  if (sec) out.section = sec;
  return out;
}

// セクション役割の別表記を正準へ（pre_chorus/pre-chorus/pre chorus→prechorus 等）。不正は undefined（黙って落とす）。
const SECTION_ROLES = new Set<SectionRole>(["intro", "verse", "prechorus", "chorus", "bridge", "interlude", "outro"]);
function normalizeRole(role?: unknown): SectionRole | undefined {
  if (typeof role !== "string") return undefined;
  const k = role.toLowerCase().replace(/[\s_-]+/g, "");
  const r = (k === "prechorus" ? "prechorus" : k) as SectionRole;
  return SECTION_ROLES.has(r) ? r : undefined;
}
// section の頑健化＝不正 role/enum外は落とす（meter 頑健化と同方針）。全フィールド空なら undefined（＝section 無し扱い＝bit一致）。
function normalizeSection(section?: SectionContext | null): SectionContext | undefined {
  if (!section || typeof section !== "object") return undefined;
  const out: SectionContext = {};
  const role = normalizeRole(section.role);
  if (role) out.role = role;
  const prevRole = normalizeRole(section.prevRole);
  if (prevRole) out.prevRole = prevRole;
  const nextRole = normalizeRole(section.nextRole);
  if (nextRole) out.nextRole = nextRole;
  if (Array.isArray(section.seedMotif)) {
    const sm = section.seedMotif.filter((n) => n && Number.isFinite(n.pitch) && Number.isFinite(n.start ?? 0));
    if (sm.length) out.seedMotif = sm.map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur }));
  }
  if (typeof section.prevEndPitch === "number" && Number.isFinite(section.prevEndPitch)) out.prevEndPitch = section.prevEndPitch;
  if (typeof section.energy === "number" && Number.isFinite(section.energy)) out.energy = Math.max(0, Math.min(1, section.energy));
  return Object.keys(out).length ? out : undefined;
}

// 役割→既存ノブのプリセット（初期値・全て耳較正前提。研究doc §4-2）。値は energy=0.5 相当の基準値。
// 「未指定ノブの既定値差し替え」であり、明示ノブ＞role プリセット＞従来既定。undefined のノブは触らない。
type PresetKnobs = {
  density?: number; registerShift?: number; repetition?: number; motifBars?: number;
  breathe?: number; expression?: number; foreground?: number; phrasing?: "symmetric" | "asymmetric" | "period" | "sentence";
  flow?: number; pickup?: number; arc?: "arch"; // 2026-07-11 句フレージング（塊の連結・弱起・山なり弧）。既定は role 経由でのみ発火
};
// flow=塊の連結＋句末/最終音の長音化（ぶつ切れ解消）。pickup=弱起（句頭を前へ）。arc=山なり弧（登って落ちる・サビ向き）。
// いずれも melodyCells 側は既定 0/未指定=bit一致。ここでは role ごとに音楽的な既定を与える（サビは強く連結＋弧＋弱起）。
const SECTION_PRESETS: Record<SectionRole, PresetKnobs> = {
  intro: { density: 0.3, registerShift: -2, breathe: 0.5, flow: 0.3 },
  verse: { density: 0.45, registerShift: 0, repetition: 0.85, motifBars: 2, breathe: 0.3, expression: 0.25, foreground: 0.3, phrasing: "symmetric", flow: 0.35, pickup: 0.5 },
  prechorus: { density: 0.55, registerShift: 2, repetition: 0.9, motifBars: 1, breathe: 0, expression: 0.25, foreground: 0.15, phrasing: "asymmetric", flow: 0.45, pickup: 0.5, arc: "arch" },
  chorus: { density: 0.65, registerShift: 4, repetition: 0.9, motifBars: 2, breathe: 0.1, expression: 0.15, foreground: 0.1, phrasing: "sentence", flow: 0.6, pickup: 0.5, arc: "arch" }, // sentence[2,2,4]＝句読点を減らし最後に長い解放（旧symmetricは2小節毎に終止＝サビが句読点だらけの是正）
  bridge: { density: 0.5, registerShift: 0, repetition: 0.6, motifBars: 2, breathe: 0.3, expression: 0.4, foreground: 0.5, phrasing: "asymmetric", flow: 0.35 },
  interlude: { density: 0.4, registerShift: 0, breathe: 0.3, flow: 0.3 },
  outro: { density: 0.3, registerShift: -2, breathe: 0.5, flow: 0.4 },
};

// role プリセットを opts の「undefined のノブにだけ」被せる（明示ノブが勝つ）。energy 明示時のみ density/registerShift を線形スケール。
// role が無い section（seedMotif/prevEndPitch のみ）は opts をそのまま返す＝プリセット非適用。
function applySectionPreset<T extends PresetKnobs>(opts: T, section?: SectionContext): T {
  const role = section?.role;
  if (!role) return opts;
  const preset = SECTION_PRESETS[role];
  const energy = section?.energy;
  const scaleDens = (v: number) => (energy === undefined ? v : Math.max(0, Math.min(1, 0.5 + (v - 0.5) * (energy / 0.5))));
  const scaleReg = (v: number) => (energy === undefined ? v : Math.round(v * (energy / 0.5)));
  // energy スケール後のプリセット値。opts の明示ノブが undefined の所にだけ被せる（明示ノブが勝つ）。
  const filled: PresetKnobs = { ...preset };
  if (preset.density !== undefined) filled.density = scaleDens(preset.density);
  if (preset.registerShift !== undefined) filled.registerShift = scaleReg(preset.registerShift);
  const out = { ...opts } as T;
  const cur = out as PresetKnobs;
  for (const k of Object.keys(filled) as (keyof PresetKnobs)[]) {
    if (cur[k] === undefined && filled[k] !== undefined) (cur as Record<string, unknown>)[k] = filled[k];
  }
  return out;
}

// フィール層（2026-07-11・design.md「フィール層分離」）：swing/humanize を notes に焼かず content.feel へ。
// 両方 0/未指定＝undefined＝feel キー無し＝従来 content 形（bit一致）。humanize 指定時のみ seed を載せる（決定的）。
function buildFeel(swing?: number, humanize?: number, seed?: number): Feel | undefined {
  const sw = Math.max(0, Math.min(1, swing ?? 0)), hm = Math.max(0, Math.min(1, humanize ?? 0));
  if (sw <= 0 && hm <= 0) return undefined;
  const f: Feel = {};
  if (sw > 0) f.swing = sw;
  if (hm > 0) { f.humanize = hm; f.seed = seed ?? 1; }
  return f;
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
export function genChords(frame?: Frame | null, seed?: number | null, cadence?: "full" | "half" | "deceptive" | "plagal", opts?: { borrow?: number; secondaryDom?: number; loop?: boolean }): GenResult {
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
    const cands = dcands(fn, minor);
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
    const alt = dcands(funcs[1]!, minor).find((c) => c !== degrees[1]);
    if (alt !== undefined) degrees[1] = alt;
  }
  // loop(2026-07-09 監査C)：閉じずに回す循環進行＝短調エオリアン(i-♭VI-♭VII)／長調アクシス(I-V-vi-IV)。
  // degree列を循環パターンで上書き（T-S-Dマルコフでなく循環）。cadence とは排他（loop時は終止型を掛けない）。
  const loop = opts?.loop ?? false;
  if (loop) { const cyc = minor ? [1, 6, 7] : [1, 5, 6, 4]; for (let i = 0; i < degrees.length; i++) degrees[i] = cyc[i % cyc.length]!; }
  // Step3(2026-07-09 design#12-M)：カデンツ選択器＝末尾1-2和音を型で上書き（既定 full/undefined=従来一致）。
  // funcs は degree 確定後は未使用ゆえ degrees のみ上書き。先頭 degrees[0]=1 は保護（penult は index≥1 のみ）。
  if (!loop && cadence && cadence !== "full" && bars >= 2) {
    const last = degrees.length - 1, pen = last - 1;
    if (cadence === "half") { degrees[last] = 5; if (pen >= 1) degrees[pen] = 4; }              // 半終止＝IV→V(開いて止める)
    else if (cadence === "deceptive") { degrees[last] = 6; if (pen >= 1) degrees[pen] = 5; }    // 偽終止＝V→vi(長調)/V→♭VI(短調)
    else if (cadence === "plagal") { degrees[last] = 1; if (pen >= 1) degrees[pen] = 4; }        // 変終止＝IV→I(アーメン)
  }

  // I3b: mood がコードの「色」に効く＝おしゃれ/ジャズ/夜系は7thパレット（旧: moodは長短切替のみで進行が不変）。
  // 「切ない」は従来どおり素の短調（長短切替の正準語＝色付けしない）。
  const colorful = /おしゃれ|オシャレ|ジャズ|jazz|都会|夜|しっとり|大人/.test(mood);
  const table7 = minor ? DIATONIC_MINOR7 : DIATONIC_MAJOR7;
  // C基準の (root,quality) を先に作り、色ノブ(borrow/secondaryDom)で差し替えてから実音移調（既定OFF=bit一致）。
  const base = degrees.map((deg) => { const [root, quality] = (colorful ? table7 : table)[deg]!; return { root, quality }; });
  // borrow(2026-07-09 監査C)：長調のサブドミナント IV を借用短調 iv(♭6→5 の切なさ・SDm)へ確率で差替。
  const borrow = Math.max(0, Math.min(1, opts?.borrow ?? 0));
  if (borrow > 0 && !minor) for (let i = 1; i < base.length - 1; i++) if (degrees[i] === 4 && rng.next() < borrow) base[i] = { root: 5, quality: colorful ? "m7" : "m" };
  // secondaryDom(2026-07-09 監査C)：非トニック和音の直前を V/x（完全5度上の dom7）へ差替＝二次ドミナント(接着・丸サIII7=V/vi)。
  const secondaryDom = Math.max(0, Math.min(1, opts?.secondaryDom ?? 0));
  if (secondaryDom > 0) for (let i = 1; i < base.length - 1; i++) { const nx = base[i + 1]!; if (((nx.root % 12) + 12) % 12 !== 0 && rng.next() < secondaryDom) base[i] = { root: ((nx.root + 7) % 12 + 12) % 12, quality: "7" }; }
  const chords = base.map((c, i) => ({ root: (c.root + key) % 12, quality: c.quality, start: round3(i * bpb), dur: round3(bpb) }));
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

/** モチーフ(動機)ベースのメロディ：短い動機を1つ作り、小節ごとに**骨格音**へアンカーして
 * 反復＋軽い変奏(移高/反転/末尾変化)で置き直す。拍頭=コードトーン・音域60..84・mood密度を維持。 */
export function genMelody(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: { motifModel?: { rhythm: BarRhythmModel; move: MoveModel }; skelModel?: SkeletonModel; repetition?: number; rangeSteps?: number; useV2?: boolean; motifBars?: number; phrasing?: "symmetric" | "asymmetric" | "period" | "sentence"; partial?: { pitch: number; start?: number; dur?: number }[]; density?: number; swing?: number; expression?: number; runs?: number; push?: number; foreground?: number; breathe?: number; humanize?: number; form?: "sentence"; registerShift?: number; bass?: { pitch: number; start?: number; dur?: number }[]; counter?: number; drums?: DrumsInput | null; drumLock?: number; backbeat?: number; converse?: number; hook?: number; articulation?: number; inflect?: number; motifMode?: "preserve"; finest?: "quarter" | "eighth"; flow?: number; pickup?: number; arc?: "arch"; skelColor?: number; skeleton?: SkeletonContent; rhythmParts?: RhythmPartsOpt }, // motifModel/skelModel=コーパス学習（V2経路が消費＝③genMotifMelodyはJ4/#16で撤去済み）。rhythmParts=リズムパーツ層L1/L2（design #20 S4-1/S4-2・rotate=小節ローテ／placement=小節明示（placement>rotate>L0）／custom=インラインパーツ・未指定=bit一致）。skeleton=人間製/機械候補の骨格（design #20・V2経路で genSkeletonFromModel をバイパスして注入・未指定＝bit一致）。repetition/rangeSteps=骨格の利用時制約。useV2=A2レシピ経路。motifBars=モチーフ/フレーズ長(小節)。phrasing=句割り 対称/非対称(P0-b・骨格経路)。partial=補完(completion)の種=部分メロ。density=細かさ/swing=跳ね/expression=表情/runs=走句/push=前借り 0..1（V2経路）。registerShift=音域中心の半音シフト（V2経路・飽和付き・既定0=bit一致・セクション役割 chorus 等で +）。bass=ベーストラックのnotes＋counter=対位係数0..1（V2経路・既定0=bit一致＝design「gen_melody×ベース結線」）。drums=ドラム入力(genDrums content と同形)＋drumLock/backbeat/converse=3ノブ 0..1（V2経路・既定0=bit一致＝design「gen_melody×ドラム結線」）
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
  // J2a(design #20・Task#13)：3/4(bpb=3)・6/4(bpb=6) を eligible に追加＝旧経路④の受け皿。非複合の
  // bpb=3 は 3/4 のみ・bpb=6 は 6/4（3/2 も同扱い）。compound(6/8系) は従来どおり別に true。既存は不変=bit一致。
  // J2b(design #20・Task#14)：chords 空でも V2 へ（`chords>0` ゲートを撤去）＝chordless メロ生成の受け皿を
  // 旧経路④→V2 へ移す。chords 無しは下の rootsPerBar 合成ループが**全小節を key の主音根＋ダイアトニックpc集合**
  // で代用する（chordAt→null フォールバック・素直優先）。カデンツ着地/表情/濁り掃除はコード非依存の度数(主音/属音)
  // ＋ダイアトニック代用で機能する。chords 有り時は分岐値が不変(true→true)＝**bit一致**（明示回帰＋golden で実証）。
  // J3(design #20 Task#15)：V2 本体を関数化＝②useV2 明示ゲートと、④撤去後の最終フォールバックの両方から呼ぶ。
  const runV2 = (): GenResult => {
    // register窓を tonic中心に(2026-07-09 批判レビューRound2/P1)：旧 [60,84] は長調で tonic を音域最下端に
    // 置き、脱平面化した骨格の下降を主音に叩き戻していた（実測 長調 主音48%/音域8.4）。tonic を下から約1/3
    // (下5・上12=約17半音≒音域12)に置く＝両モードで主音25-35・音域9-12へ。下流clampは全て sp[0]/sp[last] 参照
    // ＝sp 差し替えで render/後処理/頂点/カデンツが追従（別の絶対clampは無い＝評価で確認）。V2分岐のみ。
    // セクション役割プリセット（2026-07-10・design#12-M「セクション役割の一級化」）：role があれば
    // 「未指定ノブの既定値」を差し替える（明示ノブ＞role プリセット＞従来既定）。role 無し＝so===opts＝bit一致。
    const so = applySectionPreset(opts ?? {}, f.section);
    // J2a：V2 内部の barLen＝compound は3固定・直進系は beatsPerBar（4/4→4・3/4→3・6/4→6）。
    // 骨格アダプタ（skeletonToV2Skel/skeletonPhrasesToV2/skeletonRestMask）と genMotifMelodyV2 へ一貫して渡す。
    const barLen = compound ? 3 : bpb;
    // tessitura をキー安定に(2026-07-09 Round3/P3a・回帰修正)：tp=60+pc だと C調G3-C5/B調F#4-B5と
    // 絶対高さが1oct滑走しB5金切り域まで届いた。tonic相対は保ったまま**両端だけ飽和**（[60,65]にclamp）＝
    // 再ピン留め無し・全キーで音域/主音を維持しつつ ceiling 79→76・B5天井を消す（評価で全キー実測・Option D）。
    // registerShift(2026-07-10)：セクション役割（chorus=+4 等）で音域中心を半音シフト。**飽和必須**（Round3 の
    // B5金切り域の轍＝tpBase' を [58,70] にクランプ＝ceiling は tpBase'+12 ≤ 82）。shift=0＝tpBase 不変＝bit一致。
    const tpBase0 = Math.max(60, Math.min(65, 60 + ((((f.key ?? 0) % 12) + 12) % 12)));
    const tpBase = Math.max(58, Math.min(70, tpBase0 + (so.registerShift ?? 0)));
    const sp = scalePitchList(scale, tpBase - 5, tpBase + 12);
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
    if (opts?.motifModel) {
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
    // S3a(design #20)：骨格に phrases があれば frame phrasing 由来より**骨格の句割りを優先**（骨格が構造の権威）。
    // 骨格 phrases 無し＝従来（frame phrasing 由来 or undefined）＝bit一致。beat 単位は V2 の barLen（compound?3:4）に合わせる。
    const skelPhrases = opts?.skeleton ? skeletonPhrasesToV2(opts.skeleton, { beatsPerBar: barLen }) : undefined;
    const phrases = skelPhrases ?? (so.phrasing ? planSkeleton(bars, f.meter, { phrasing: so.phrasing }).map((p) => ({ startBeat: p.startBeat, beats: p.beats, cadenceDegree: p.cadenceDegree })) : undefined);
    // 表情の既定較正(2026-07-09 批判レビューP0a)：V2既定が expression=0＝強拍CT100%(無菌の極・実曲57%)だった。
    // frame.expression 明示＞mood既定(0.15-0.3)＞既定0.25。legacy(applyExpression)と同じロジックをV2へ結線。
    // so.expression＝明示 opts.expression ＞ role プリセット（applySectionPreset で埋め済）。
    const exprDefault = so.expression ?? (typeof f.expression === "number" ? f.expression : bias.long >= 1.5 ? 0.3 : bias.busy >= 1.5 ? 0.2 : 0.25);
    // 対位バイアス（design「gen_melody×ベース結線」2026-07-10）：bass notes→bassPitchAt(t) 閉包（chordPcsAt と同パターン・
    // 標本化は voiceLeading.ts の pitchAt を共用＝評価と生成で同じ低音）。bass無し or counter=0 は undefined＝従来 bit 一致。
    const bassSorted = (so.counter ?? 0) > 0 && so.bass && so.bass.length
      ? so.bass.filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.start ?? 0)).map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur ?? 1 })).sort((a, b) => a.start - b.start)
      : null;
    const bassPitchAt = bassSorted && bassSorted.length ? (t: number): number | null => pitchAt(bassSorted, t) : undefined;
    // ドラム結線（design「gen_melody×ドラム結線」2026-07-10）：DrumsInput を防御パース（gen_bass と共用 parseDrums）
    // →セクション全長へタイルした**絶対拍**の kick/snare＋小節別加重密度(kick+snare+0.3*hihat)。パターン長
    // (steps×beatsPerStep)が小節長の整数倍でない時は drums 無し扱い（gen_bass の不一致→従来経路と同方針）。
    // 全係数0 or drums 無し＝V2 へ drums を渡さない＝各段スキップ＝bit一致（構造的保証）。
    let drumsV2: { kick: number[]; snare: number[]; densityByBar: number[] } | undefined;
    if ((so.drumLock ?? 0) > 0 || (so.backbeat ?? 0) > 0 || (so.converse ?? 0) > 0) {
      const dr = parseDrums(so.drums);
      const span = dr ? dr.steps * dr.bps : 0;
      const spanBars = span > 0 ? span / perBar : 0;
      if (dr && spanBars >= 1 - 1e-6 && Math.abs(spanBars - Math.round(spanBars)) < 1e-6) {
        const sb = Math.max(1, Math.round(spanBars));
        const kick: number[] = [], snare: number[] = [], densityByBar: number[] = [];
        for (let bar = 0; bar < bars; bar++) {
          const w0 = (bar % sb) * perBar; // この小節が読むドラムパターン窓 [w0, w0+perBar)
          const inWin = (s: number): number | null => { const t = s * dr.bps; return t >= w0 - 1e-9 && t < w0 + perBar - 1e-9 ? bar * perBar + (t - w0) : null; };
          let k = 0, s2 = 0, h = 0;
          for (const s of dr.kick) { const t = inWin(s); if (t != null) { kick.push(t); k++; } }
          for (const s of dr.snare) { const t = inWin(s); if (t != null) { snare.push(t); s2++; } }
          for (const s of dr.hihat) if (inWin(s) != null) h++;
          // hihat 重み 0.3＝**上限として維持**（D2 実測＝小節別 hihat 数と kick+snare 数の相関 0.20/−0.02≒無情報。
          // busy-ness 信号としては kick+snare 主体で大勢は変わらず・0.3 で密度指標の約2割を占めるのが上限。0.2 へ下げる
          // 選択肢もデータ寄りだが差は小＝現行 0.3 のままで実測と矛盾しない。docs/research/2026-07-14-stem-groove-measurements.md §4）。
          densityByBar.push(k + s2 + 0.3 * h);
        }
        drumsV2 = { kick, snare, densityByBar };
      }
    }
    // モチーフ共有（design#12-M「セクション役割の一級化」2026-07-10）：前セクションの実音モチーフ（section.seedMotif）
    // を extractMotif16 で Motif16 化し V2 の種に（keepFirstBlocks は渡さない＝先頭ブロックが種 M＝同じ動機の別レンダリング）。
    // 接続：section.prevEndPitch を骨格開始音 skelStart へ（未指定=62=bit一致）。role とは独立に seedMotif/prevEndPitch で発火。
    const seedMotif = f.section?.seedMotif && f.section.seedMotif.length ? extractMotif16(f.section.seedMotif.map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: n.dur })), barLen) : undefined;
    const skelStart = typeof f.section?.prevEndPitch === "number" ? f.section.prevEndPitch : undefined;
    // 骨格注入（design #20）：opts.skeleton 指定時は SkeletonContent を 1拍粒度 number[] へアダプト（bpb=barLen）し
    // V2 の構造線に差し込む＝genSkeletonFromModel をバイパス。未指定＝skel undefined＝従来生成＝bit一致。
    const injectedSkel = opts?.skeleton ? skeletonToV2Skel(opts.skeleton, { beatsPerBar: barLen, fallbackPitch: sp[Math.floor(sp.length / 2)] ?? 62 }) : undefined;
    // 骨格休符の表面抑制（design #20 S3b）：pitch:null 区間の restマスクを渡し、V2 が最終出力で当該区間の表面音を落とす。
    // 休符なし骨格 or 骨格未指定＝空/undefined＝V2側で丸ごとスキップ＝bit一致。
    const restMaskV2 = opts?.skeleton ? skeletonRestMask(opts.skeleton, { beatsPerBar: barLen }) : undefined;
    const mNotes = genMotifMelodyV2(chordPcsPerBar, rootsPerBar, qualsPerBar, sp, m16, { seed: seed ?? 1, tonicPc, minor, beatsPerBar: barLen, skelModel: so.skelModel ?? loadSkeletonModel(minor), skel: injectedSkel, restMask: restMaskV2 && restMaskV2.length ? restMaskV2 : undefined, motifBars: so.motifBars, compound, repetition: so.repetition, rangeSteps: so.rangeSteps, chordPcsAt, density: so.density, swing: so.swing, expression: exprDefault, phrases, runs: so.runs, push: so.push, foreground: so.foreground, breathe: so.breathe, humanize: so.humanize, form: so.form, seedMotif, skelStart, bassPitchAt, counter: so.counter, drums: drumsV2, drumLock: so.drumLock, backbeat: so.backbeat, converse: so.converse, hook: so.hook, articulation: so.articulation, inflect: so.inflect, motifMode: so.motifMode, finest: so.finest ?? ((f.tempo ?? 0) >= 150 ? "eighth" : undefined), flow: so.flow, pickup: so.pickup, arc: so.arc, skelColor: so.skelColor, rhythmParts: so.rhythmParts }); // finest＝最小音符。未指定はテンポ連動(≥150で8分上限＝高BPMの16分潰れを自動回避・オーナーFB)。明示が勝つ
    if ((f.pickup ?? 0) > 0 && mNotes.length > 0) prependPickup(mNotes, f.pickup!, scaleArr);
    if (mNotes.length === 0) mNotes.push({ pitch: 72, start: 0, dur: 1 });
    const lbl = (mood ? mood + "メロ" : "メロディ").slice(0, 24);
    // フィール層（2026-07-11）：swing/humanize は notes に焼かず content.feel に載せる（notes はストレート）。
    // 再生/書き出し境界の applyFeel が拍内単調ワープ＋微小揺れを掛ける。未指定(=0)＝feel 無し＝従来 bit一致。
    const feel = buildFeel(so.swing, so.humanize, seed ?? 1);
    return { items: [{ kind: "melody", content: feel ? { notes: mNotes, feel } : { notes: mNotes }, label: lbl }], edges: [] };
  };
  if (opts?.useV2 && (bpb === 3 || bpb === 4 || bpb === 6 || compound) && bars >= 1) return runV2();

  // ③④撤去後の最終フォールバック（J3=④撤去/J4=③撤去・design #20 Task#15/#16）：旧ルールベース経路④
  // （buildMotif/planSkeletonTones/applyPhrasing/applyExpression/decorateWeak 等）と③ motifModel 経路
  // （genMotifMelody・melodyCells.ts）を撤去し、メロ生成を V2（genMotifMelodyV2）に一本化した。ここへ到達＝
  // ①補完/②useV2 いずれのゲートも外れたケース＝(i) useV2 を渡さない直呼び（本番は全経路 useV2:true＝主にテスト。
  // motifModel 指定だが useV2:false もここ＝V2 が motifModel を消費するので corpusModel は活きる） (ii) useV2 だが
  // V2 非対応の変拍子。
  // 方針＝V2 対応拍子（4/4・3/4・6/4・6/8系複合）は **非partial で V2 を回す**＝品質を本線に揃える（partial
  // 指定でゲートを外れたケースも種は捨てて新規生成＝design #20 J3 の受け皿一本化）。
  if ((bpb === 3 || bpb === 4 || bpb === 6 || compound) && bars >= 1) return runV2();
  // (iii) V2 未対応の変拍子（2/4・5/4・7/8・7/4 等）：黙って壊さず**明示エラー**。V2 は当該 bpb では
  // 総尺が合わない（実測＝bpb 5/7/3.5 で1小節ぶんの音が欠ける＝約7割しか埋まらない）＝丸め代用は不可。
  // 変拍子メロ生成は低頻度と判断（オーナーは 3/6 拍子を明示・2/4 は 2/2=bpb4 で代替可）。design #20 J3 に明記。
  throw new Error(`genMelody: 拍子「${f.meter ?? "4/4"}」（1小節${bpb}拍）は未対応です。対応拍子＝4/4・3/4・6/4・6/8系（複合拍）。`);
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
  const cands: { notes: MelNote[]; typ: number; feel?: Feel }[] = [];
  const seen = new Set<string>();
  for (let s = 1; s <= n; s++) {
    const c0 = genMelody(frame, chords, s, opts).items[0]?.content as { notes?: MelNote[]; feel?: Feel } | undefined;
    const notes = c0?.notes;
    if (!notes || notes.length === 0) continue;
    const key = notes.map((x) => `${x.pitch}@${round3(x.start)}:${round3(x.dur)}`).join(","); // 完全重複を捨てる（F3: durも同一性に含める＝リズム違い候補を殺さない）
    if (seen.has(key)) continue;
    seen.add(key);
    const typ = opts?.corpusModel
      ? corpusTypicality(notes, opts.corpusModel, { beatsPerBar: info.beatsPerBar, eighthsPerBar: info.beatsPerBar * 2 }).score
      : 0;
    cands.push({ notes, typ, feel: c0?.feel }); // feel は content から引き継ぐ（ランクは straight notes で＝評価がスイングに歪まない）
  }
  if (cands.length === 0) return genMelody(frame, chords, 1, opts); // 保険（全経路空はまず無い）
  cands.sort((a, b) => b.typ - a.typ); // らしさ順（corpusModel 無ければ全 typ=0＝生成順のまま）
  const picked: { notes: MelNote[]; typ: number; feel?: Feel }[] = [];
  for (const c of cands) { // 多様な top-k：既採用と似すぎは飛ばす
    if (picked.length >= k) break;
    if (picked.every((p) => melodySimilarity(p.notes, c.notes) < CAND_SIM_MAX)) picked.push(c);
  }
  for (const c of cands) { // 似すぎ除外で k に満たなければ順位順で充填
    if (picked.length >= k) break;
    if (!picked.includes(c)) picked.push(c);
  }
  const base = (f.mood ? f.mood + "メロ" : "メロディ");
  return { items: picked.map((c, i) => ({ kind: "melody", content: c.feel ? { notes: c.notes, feel: c.feel } : { notes: c.notes }, label: `${base}案${i + 1}`.slice(0, 24) })), edges: [] };
}

// 骨格の機械候補出し（design #20・「機械は候補まで」）。frame＋コード進行を受け、genSkeletonFromModel で
// 構造線を引き planSkeleton で句割りを付け、SkeletonContent（ブレークポイント列）へ逆変換して複数 seed 分返す。
// gen_chords/gen_melody と同じ items 配列の流儀。seed 明示＝1本を決定的に。
export function genSkeletonCandidates(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: { k?: number; n?: number; phrasing?: "symmetric" | "asymmetric" | "period" | "sentence"; form?: "period" | "aaba"; skelColor?: number },
): GenResult {
  const f = normalizeFrame(frame);
  const minor = isMinorFrame(f);
  const scale = scalePcs(f.key ?? 0, minor ? "minor" : "major");
  const bars = barsOf(f);
  const info = meterInfo(f.meter);
  const compound = info.grouping === "compound";
  // J2a：gen_skeleton も V2 と同じ barLen/強拍で 3/4・6/4 対応（4/4=4・6/8=3 は不変=bit一致）。
  const barLen = compound ? 3 : info.beatsPerBar;
  const strongQuarters = compound ? [0, 1.5] : barLen === 3 ? [0] : barLen === 6 ? [0, 3] : [0, 2];
  const tonicPc = (((f.key ?? 0) % 12) + 12) % 12;
  const tpBase = Math.max(60, Math.min(65, 60 + tonicPc)); // V2 と同じ tonic中心の音域窓＝注入時にレジスタが揃う
  const sp = scalePitchList(scale, tpBase - 5, tpBase + 12);
  // 小節ごとのコード根（調相対でなく実 pc）＋構成pc（skelColor 倚音判定＝強拍が和声内かを見る）。
  const rootsPerBar: number[] = [];
  const chordPcsPerBar: number[][] = [];
  for (let bar = 0; bar < bars; bar++) {
    const ch = chordAt(bar * barLen, chords);
    rootsPerBar.push(ch ? normRoot(ch.root ?? 0) : tonicPc);
    chordPcsPerBar.push(ch ? chordPcs(normRoot(ch.root ?? 0), ch.quality ?? "") : [...scale]);
  }
  // 句割り＝planSkeleton（未指定=対称）。骨格の phraseEnds（unit尾バー→カデンツ度数）と phrases（endBeat/cadence）両方に使う。
  const phrases = planSkeleton(bars, f.meter, { phrasing: opts?.phrasing });
  const phraseEnds = phrases.map((p) => ({ bar: Math.max(0, Math.floor((p.startBeat + p.beats - 0.001) / barLen)), deg: p.cadenceDegree === 5 ? 4 : p.cadenceDegree === 2 ? 1 : 0 }));
  const phrasesOut = phrases.map((p) => ({ endBeat: p.startBeat + p.beats, cadence: p.isLast ? "full" : p.cadenceDegree === 5 ? "half" : "full" }));
  const model = loadSkeletonModel(minor);
  const build = (s: number): SkeletonContent => {
    const skel = genSkeletonFromModel(rootsPerBar, model, sp, { tonicPc, seed: s, beatsPerBar: barLen, strongQuarters, start: 62, phraseEnds, skelForm: opts?.form, skelColor: opts?.skelColor, chordPcsPerBar });
    return { bars, tones: skelArrayToBreakpoints(skel), phrases: phrasesOut };
  };
  const label = "骨格";
  if (seed != null) {
    return { items: [{ kind: "skeleton", content: build(seed), label }], edges: [] };
  }
  const k = Math.max(1, opts?.k ?? 3);
  const n = Math.max(k, opts?.n ?? 8);
  const seen = new Set<string>();
  const items: { kind: string; content: unknown; label: string }[] = [];
  for (let s = 1; s <= n && items.length < k; s++) {
    const content = build(s);
    const sig = content.tones.map((t) => `${t.start}:${t.pitch}`).join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    items.push({ kind: "skeleton", content, label: `${label}案${items.length + 1}` });
  }
  if (items.length === 0) items.push({ kind: "skeleton", content: build(1), label });
  return { items, edges: [] };
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

// ドラム入力（genDrums content と同形）＝gen_bass のドラム結線用（design「gen_bass×ドラム結線」2026-07-10）。
export interface DrumsInput {
  rhythm?: {
    steps?: number;
    bars?: number;
    beatsPerStep?: number;
    lanes?: { name?: string; midi?: number; hits?: number[]; vel?: number }[];
  } | null;
}
// drums content から kick/snare/hihat の step 集合を防御的に取り出す（不正は null＝従来経路）。
// hihat（midi42/44/46・複数レーン合算）は gen_melody×ドラム結線の密度相補（converse・重み0.3）用＝gen_bass は不使用。
function parseDrums(drums?: DrumsInput | null): { steps: number; bps: number; kick: number[]; snare: number[]; hihat: number[] } | null {
  const r = drums?.rhythm;
  if (!r || !Array.isArray(r.lanes)) return null;
  const steps = Number(r.steps);
  const bps = Number(r.beatsPerStep);
  if (!Number.isFinite(steps) || steps <= 0 || !Number.isFinite(bps) || bps <= 0) return null;
  const laneOf = (midi: number, name: string): number[] => {
    const lane = r.lanes!.find((l) => l?.midi === midi || l?.name === name);
    const hits = Array.isArray(lane?.hits) ? lane!.hits! : [];
    return [...new Set(hits.filter((s) => Number.isInteger(s) && s >= 0 && s < steps))].sort((a, b) => a - b);
  };
  const laneAll = (midis: number[], names: string[]): number[] => {
    const set = new Set<number>();
    for (const l of r.lanes!) {
      if (!l || !((l.midi != null && midis.includes(l.midi)) || (l.name != null && names.includes(l.name)))) continue;
      for (const s of Array.isArray(l.hits) ? l.hits : []) if (Number.isInteger(s) && s >= 0 && s < steps) set.add(s);
    }
    return [...set].sort((a, b) => a - b);
  };
  return { steps: Math.trunc(steps), bps, kick: laneOf(36, "Kick"), snare: laneOf(38, "Snare"), hihat: laneAll([42, 44, 46], ["HiHat", "OpenHat", "ClosedHat"]) };
}

// ベース低域窓＋kickLock 動作点の実測較正（B1+D2＝docs/research/2026-07-14-stem-groove-measurements.md）。
// 音域窓：自作曲 stem 実測 p5–p95=G1..A2（絶対上限F3）。旧 36..47(legacy)/33..55(kick経路) は上端が実曲より高い。
//   → **33..48（A1..C3）へ是正**。★意図的 bit 破壊：ルート/5度/oct の絶対配置が下方シフト＝旧出力と不一致
//   （A/A#/B ルートは1oct 下がり・高ルートの 5度上/oct は窓上端48で刈られ root 集中）。耳確認は[耳/手]。
export const BASS_LO = 33, BASS_HI = 48;
// pc(0..11) を窓 [BASS_LO,BASS_HI] の最下オクターブへ写す（旧 36+pc の 36..47 張り付きに代わる低域化）。
// 例：C(pc0)→36(C2 据え置き)・G(pc7)→43(G2)・A(pc9)→33(A1 で1oct 降下)・B(pc11)→35(B1)。
function bassPcToWindow(pc: number): number { return BASS_LO + ((((pc % 12) - BASS_LO) % 12) + 12) % 12; }
// kickLock 動作点（実測＝bass onset の kick 共有率）。既定0=bit一致は不変。弱/強プリセット＋上限クランプ。
// 上限0.85＝share→1.0（全 onset を kick へスナップ＝完全ユニゾン）は自作曲に存在しない実測ゆえ安全弁。
export const KICK_LOCK_PRESETS = { weak: 0.6, strong: 0.8, max: 0.85 } as const;

/** ベースライン（強拍=ルート・弱拍=5度/オクターブ）＋**リズム図形**。低域窓 [BASS_LO,BASS_HI]。
 * drums＋opts（kickLock/snareGap/approach・各既定0）＝ドラムに噛む強化（design「gen_bass×ドラム結線」・
 * research/2026-07-10-bass-generation-upgrade.md）。**drums 無し or 全係数0 は従来と bit 一致**（fig 経路温存＝
 * 第二経路の追加。melodyCells push/swing/humanize と同じ流儀＝係数0は段ごとスキップ・段は独立 seed 派生 Rng）。 */
export function genBass(
  frame?: Frame | null,
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  drums?: DrumsInput | null,
  opts?: { kickLock?: number; snareGap?: number; approach?: number; skeleton?: SkeletonContent },
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
  // ドラム結線のゲート：drums content が無ければ全ノブ無効＝従来経路（鉄則）。
  const dr = parseDrums(drums);
  // 上限クランプ 0.85（B1 実測＝share→1.0 は非実在）。負(逆相)は 8分裏配置ゆえユニゾン化せず -1 まで許容。
  const kickLock = dr ? Math.max(-1, Math.min(KICK_LOCK_PRESETS.max, opts?.kickLock ?? 0)) : 0;
  const snareGap = dr ? Math.max(0, Math.min(1, opts?.snareGap ?? 0)) : 0;
  const approach = dr ? Math.max(0, Math.min(1, opts?.approach ?? 0)) : 0;
  // A/A' キック骨格＝4/4系のみ・ドラムの1小節長が拍子と一致する時のみ（6/8 は push/swing と同じ除外方針）。
  const kickPath = !!dr && kickLock !== 0 && info.grouping !== "compound" && Math.abs(dr.steps * dr.bps - perBar) < 1e-6;

  if (kickPath) {
    // --- A: キック骨格（kickLock>0）／A': 逆相＝キックの居ない8分裏（kickLock<0） ---
    const kickSet = new Set(dr!.kick);
    const off8 = Array.from({ length: Math.floor(dr!.steps / 4) }, (_, i) => i * 4 + 2); // 8分裏 step（4/4=2,6,10,14）
    for (let bar = 0; bar < bars; bar++) {
      const base = bar * perBar;
      const stepSet = new Set<number>();
      if (kickLock > 0) {
        stepSet.add(0); // "the one"＝小節頭は常に弾く（キック不在でも）
        for (const s of dr!.kick) if (rng.next() < kickLock) stepSet.add(s); // キック骨格の確率採用
        // 差分保証（揃えすぎ禁止）：busy はキックに無い8分裏を確率追加＝ベース側の差分。sparse は前半のみ＝支え。
        if (bias.busy >= 1.5) for (const s of off8) if (!kickSet.has(s) && rng.next() < 0.3) stepSet.add(s);
        if (bias.long >= 1.5) for (const s of [...stepSet]) if (s >= dr!.steps / 2) stepSet.delete(s);
      } else {
        const cand = off8.filter((s) => !kickSet.has(s)); // 逆相＝キックの居ない8分裏（Robert Miles 型）
        for (const s of cand) if (rng.next() < -kickLock) stepSet.add(s);
        if (stepSet.size === 0) stepSet.add(cand[0] ?? 2); // 小節を空にしない
      }
      const ons = [...stepSet].sort((a, b) => a - b);
      let prevRoot = -1;
      ons.forEach((s, i) => {
        const t = base + s * dr!.bps;
        const next = i + 1 < ons.length ? base + ons[i + 1]! * dr!.bps : base + perBar; // レガート基準
        const dur = Math.min(next, total) - t;
        if (dur <= 0) return;
        const ch = chordAt(Math.floor(t), chords);
        const root = ch ? normRoot(ch.root ?? 0) : (f.key ?? 0);
        const rootP = bassPcToWindow(root); // ルートを低域窓の最下 oct へ（実測較正・A/A#/B は1oct 降下）
        let pitch: number;
        if (i === 0 || root !== prevRoot) pitch = rootP; // アンカー＝小節内最初 or チェンジ頭＝ルート
        else {
          // B: 間＝R/5度/オクターブ。5度は原則「上」＝root+7 実音。窓上端 BASS_HI を超える候補（高ルートの5度上/oct）は
          //    刈る＝実測窓（p95=A2）逸脱を防ぐ＝高ルートは root 集中（(root+7)%12 の下転回はしない設計を維持）。
          const cand = [rootP, rootP + 7, rootP + 12].filter((p) => p <= BASS_HI);
          const w = [2, 1.5, bias.busy >= 1.5 ? 1.2 : 0.6].slice(0, cand.length);
          pitch = rng.choices(cand, w);
        }
        prevRoot = root;
        notes.push({ pitch: Math.max(BASS_LO, Math.min(BASS_HI, pitch)), start: round3(t), dur: round3(dur) });
      });
    }
  } else {
    // --- 従来経路（fig 語彙・drums 無し/係数0/6-8/不一致 はここ＝bit一致の要） ---
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
        notes.push({ pitch: bassPcToWindow(pc), start: Math.round(t * 1000) / 1000, dur: Math.round(dur * 1000) / 1000 });
      });
      beat += fig.span;
    }
  }

  // --- C: アプローチノート（approach>0・4/4系のみ）：チェンジ直前の最後のオンセットを接近音→次ルート着地。
  // 弱拍・短音価・チェンジ1.5拍以内に限定（out-of-key 露出ガード）。独立 Rng＝他段の列を乱さない。
  if (approach > 0 && info.grouping !== "compound" && notes.length > 0) {
    const aRng = new Rng((seed ?? 42) + 101);
    for (const c of chords ?? []) {
      const cs = Number(c.start ?? 0);
      if (!(cs > 0) || cs >= total - 1e-9) continue;
      let idx = -1;
      for (let i = 0; i < notes.length; i++) { if (notes[i]!.start < cs - 1e-6) idx = i; else break; } // notes は昇順
      if (idx < 0) continue;
      const n = notes[idx]!;
      const pos = n.start % perBar;
      const strong = Number.isInteger(pos) && pos % 2 === 0; // 4/4 の 1・3拍頭＝強拍
      if (strong || n.dur > 1 + 1e-6 || cs - n.start > 1.5 + 1e-6) continue;
      if (aRng.next() >= approach) continue;
      const target = bassPcToWindow(normRoot(c.root ?? 0)); // beat1=ターゲット（次ルート・低域窓）
      n.pitch = Math.max(BASS_LO, Math.min(BASS_HI, aRng.choice([target - 1, target + 1, target - 2]))); // 半音下/上・全音下
    }
  }

  // --- D: スネアゲート（snareGap>0）：onset 列は不変、スネア頭を跨ぐ音の dur を切る＝2・4に穴（backbeat が抜ける）。
  // beatsPerStep 自己記述換算なので compound でも有効。最小 dur 0.25（16分）保証。
  if (snareGap > 0 && dr!.snare.length > 0 && notes.length > 0) {
    const gRng = new Rng((seed ?? 42) + 29);
    const dbar = dr!.steps * dr!.bps; // ドラム1小節の拍長（frame と独立に自己記述）
    const snareBeats: number[] = [];
    for (let k = 0; k * dbar < total - 1e-9; k++) for (const s of dr!.snare) { const t = k * dbar + s * dr!.bps; if (t < total - 1e-9) snareBeats.push(t); }
    snareBeats.sort((a, b) => a - b);
    for (const n of notes) {
      const next = snareBeats.find((t) => t > n.start + 1e-6);
      if (next === undefined) continue;
      if (n.start + n.dur > next + 1e-6 && gRng.next() < snareGap) n.dur = round3(Math.max(0.25, next - n.start));
    }
  }

  // --- E: 骨格ベース表面化（design #20 S3c）：明示ベース区間のピッチを差し替え・骨格休符区間のオンセットを抑制。
  // 全リズム後処理（approach/snareGap）の後に適用＝RNG 不消費・骨格の有無で生成/approach/snareGap は不変
  // ＝明示点ゼロ（bass 未指定/空）なら segs 空で丸ごとスキップ＝従来と bit 一致（明示点がある場合のみ経路が変わる）。
  const skelBass = opts?.skeleton;
  if (skelBass && (skelBass.bass?.length ?? 0) > 0) {
    const segs = explicitBassSegments(skelBass, { beatsPerBar: bpb });
    if (segs.length) {
      const rests = segs.filter((s) => s.pitch == null);
      const kept: typeof notes = [];
      for (const n of notes) {
        const seg = segs.find((s) => n.start >= s.start - 1e-9 && n.start < s.start + s.dur - 1e-9);
        if (seg) {
          if (seg.pitch == null) continue; // 骨格ベース休符＝当該オンセットを鳴らさない
          n.pitch = Math.max(BASS_LO, Math.min(BASS_HI, foldBassPitch(seg.pitch, BASS_LO, BASS_HI))); // 明示ピッチを低域窓へ畳む
        }
        // 休符区間へ食い込む dur は区間頭で切る（S3b と同思想・直前の音は休符頭で着地）。
        for (const r of rests) if (r.start > n.start + 1e-9 && r.start < n.start + n.dur - 1e-9) n.dur = round3(r.start - n.start);
        kept.push(n);
      }
      notes.length = 0;
      notes.push(...kept);
    }
  }

  if (notes.length === 0) notes.push({ pitch: 36, start: 0, dur: 1 });
  return { items: [{ kind: "bass", content: { notes }, label: "ベース" }], edges: [] };
}

// WP-X3a 対旋律(counter/オブリガート)：主メロの「間ま」に入る従属の第2声を**候補**生成する
// （docs/research/2026-07-14-countermelody-obbligato.md）。主メロのイベント列に依存＝外声(ベース)生成と決定的に違う所。
// ガードレール（機械は候補まで・仕上げは人間）：
//   P0 主メロと**同時発音の2度(半音/全音)を作らない**（音域が近く濁る）／
//   P1 **音域分離**＝主メロの下3〜10度に置く／P1 **相補リズム**＝主メロ busy 拍(1拍に2onset以上)では鳴らさず、
//   rest/sustain 拍で動く／拍頭はコードトーン軸／**反行優先**（主が上れば対旋律は下る）。
//   density（role 既定 or 明示）で出し入れ（常時鳴らさない＝散らからせない）。決定的(seed)。
export function genCounter(
  frame?: Frame | null,
  melody?: { pitch: number; start?: number; dur?: number }[],
  chords?: { root?: number | string; quality?: string; start?: number; dur?: number }[],
  seed?: number | null,
  opts?: { density?: number },
): GenResult {
  const f = normalizeFrame(frame);
  const rng = new Rng(seed ?? 7);
  const minor = isMinorFrame(f);
  const key = (((f.key ?? 0) % 12) + 12) % 12;
  const scalePcsArr = [...scalePcs(key, minor ? "minor" : "major")];
  const bpb = beatsPerBar(f.meter);
  const bars = barsOf(f);
  const total = Math.max(1, Math.round(bars * bpb));
  const label = "対旋律";
  const mel = (melody ?? [])
    .filter((n) => Number.isFinite(n.pitch) && Number.isFinite(n.start ?? 0))
    .map((n) => ({ pitch: n.pitch, start: n.start ?? 0, dur: Math.max(0.01, n.dur ?? 0.5) }))
    .sort((a, b) => a.start - b.start);
  if (!mel.length) return { items: [{ kind: "counter", content: { notes: [], program: 48 }, label }], edges: [] };

  const melPitchAt = (t: number): number | null => pitchAt(mel, t); // その瞬間に鳴っている主メロ音高（voiceLeading と共用）
  const onsetsInBeat = (b: number): number => mel.filter((n) => n.start >= b - 1e-9 && n.start < b + 1 - 1e-9).length;
  const chordTonesAt = (t: number): number[] => { const c = chordAt(t, chords); return c ? chordPcs(normRoot(c.root ?? 0), c.quality ?? "") : scalePcsArr; };
  const isSecond = (a: number, b: number): boolean => { const d = (((a - b) % 12) + 12) % 12; const m = Math.min(d, 12 - d); return m === 1 || m === 2; }; // 同時発音の2度

  // density の出し入れ（§4）：明示 density ＞ role 既定（frame.section.role・#12-M）＞ 0.5。
  const ROLE_DENSITY: Record<string, number> = { intro: 0.3, verse: 0.35, prechorus: 0.6, chorus: 0.75, bridge: 0.5, interlude: 0.4, outro: 0.4 };
  const role = f.section?.role;
  const density = Math.max(0, Math.min(1, opts?.density ?? (role ? ROLE_DENSITY[role] ?? 0.5 : 0.5)));

  const raw: { pitch: number; start: number; dur: number }[] = [];
  let prevCounter: number | null = null;
  let prevMel: number | null = null;
  for (let b = 0; b < total; b++) {
    const melAtOnset = melPitchAt(b); // counter オンセット(拍頭)で鳴っている主メロ音高（2度/音域制約の相手）
    const melMid = melPitchAt(b + 0.5);
    const ref: number | null = melAtOnset ?? melMid ?? prevMel; // 音域窓の基準（拍頭に主メロがあればそれ）
    const busy = onsetsInBeat(b) >= 2; // 主メロが細かい＝相補で counter は引っ込む（交通整理）
    if (busy || ref == null) { prevMel = ref ?? prevMel; continue; }
    if (rng.next() > density + 1e-9) { prevMel = ref; continue; } // density マスク（出し入れ・決定的）
    const tones = chordTonesAt(b + 0.5);
    // 主メロの下 3..10 半音の窓に置ける実音コードトーン候補（同時発音の2度は除外＝P0）。
    const cands: number[] = [];
    for (const pc of tones) {
      for (let p = ref - 10; p <= ref - 3; p++) {
        if ((((p % 12) + 12) % 12) !== pc) continue;
        if (p < 0) continue;
        if (melAtOnset != null && isSecond(p, melAtOnset)) continue;
        cands.push(p);
      }
    }
    if (!cands.length) { prevMel = ref; continue; }
    // 反行優先（主が上れば対旋律は下る）＋滑らかさ（前音に近い）でスコア最小を選ぶ＝決定的。
    const melTrend = prevMel != null ? Math.sign(ref - prevMel) : 0;
    let best = cands[0]!, bestScore = Infinity;
    for (const c of cands) {
      const move = prevCounter != null ? Math.sign(c - prevCounter) : 0;
      const contrary = melTrend !== 0 && move === -melTrend ? 0 : 1; // 反行=0(優先)
      const smooth = prevCounter != null ? Math.abs(c - prevCounter) : Math.abs(c - (ref - 6));
      const score = contrary * 100 + smooth;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    raw.push({ pitch: best, start: b, dur: 1 });
    prevCounter = best;
    prevMel = ref;
  }
  // 相補リズム：連続する同ピッチの counter 拍は1本の長音へ結合（伸ばしで支える＝主メロが動く区間の面）。
  const notes: { pitch: number; start: number; dur: number }[] = [];
  for (const n of raw) {
    const last = notes[notes.length - 1];
    if (last && last.pitch === n.pitch && Math.abs(last.start + last.dur - n.start) < 1e-6) last.dur += n.dur;
    else notes.push({ ...n });
  }
  if (!notes.length) notes.push({ pitch: Math.max(0, (melPitchAt(0.5) ?? 60) - 5), start: 0, dur: 1 });
  return { items: [{ kind: "counter", content: { notes, program: 48 }, label }], edges: [] };
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
