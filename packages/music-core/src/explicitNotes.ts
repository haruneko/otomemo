// 和音パターンの打点に書く「明示の音」（度数＋オクターブ）＝生成器の絶対音を和音パターンの形に写す／戻す。
// 正典＝docs/design.md「和音パターンの明示の音（notes?）」・docs/drafts/2026-09-16-handframe-evolution-design.md §4-2。
//
// 往復一致は「同じ関数を両側で使う」ことで構造的に成り立たせる：
//   api（生成）＝ pitchToExplicitNote（絶対音→度数＋オクターブ）
//   web（実音化）＝ explicitNotePitch（度数＋オクターブ→絶対音）
// どちらも「その打点の時刻に鳴っているコード」のルートと質で解く。乱数・時刻は使わない。
import { canonicalQuality, normRoot, QUALITY_INTERVALS } from "./index";
import { generateHandFrameBand, splitIntoCells, type BandChord, type HandFrameBandOptions, type HandFrameRhythm } from "./handFrameBand";
import { pmEngineTag } from "./engineVersion";
import type { Feel } from "./index";

/** 明示の音のルートの基準＝C3（48）。ルートの位置＝48＋調の主音 pc＋（主音からルートへの上向きの半音 0..11）。
 *  調を基準にするので、調を変えると全音が同じ半音だけ動く（形が崩れない）。調＝C（0）なら 48＋ルートの pc。api/web で同一。 */
export const EXPLICIT_ROOT_REF = 48;
const mod12 = (x: number) => ((x % 12) + 12) % 12;
/** ルートの実音（48 帯）。key＝調の主音 pc。 */
export function explicitRootRef(root: number | string, key = 0): number {
  const k = mod12(Math.round(key));
  return EXPLICIT_ROOT_REF + k + mod12(normRoot(root) - k);
}

/** 明示の音＝度数トークン＋オクターブ（EXPLICIT_ROOT_REF からの ±12 の数）＋その音の強さ。 */
export interface ExplicitNote { deg: string; oct: number; vel?: number }

// 質に依らない固定半音のトークン（ベースの度数語彙＋長3度/完全5度を質に依らず書く M3/P5）。
// 同じ半音に複数あるときの写しの優先は EXPLICIT_FIXED_BY_SEMI。
const FIXED_SEMI: Readonly<Record<string, number>> = {
  b2: 1, "#1": 1, "2": 2, b3: 3, M3: 4, "4": 5, "#4": 6, b5: 6, P5: 7, "#5": 8, b6: 8, "6": 9, "#6": 10, b7: 10, "#7": 11,
};
const EXPLICIT_FIXED_BY_SEMI = ["R", "b2", "2", "b3", "M3", "4", "#4", "P5", "#5", "6", "b7", "#7"] as const;

const intervalsOf = (quality: string): readonly number[] => QUALITY_INTERVALS[canonicalQuality(quality ?? "")] ?? [0, 4, 7];
/** 質の7度（4番目の構成音が 6度〜長7度のときだけ・add9 等は無し）。 */
const seventhOf = (ivals: readonly number[]): number | null => (ivals.length > 3 && ivals[3]! >= 9 && ivals[3]! <= 11 ? ivals[3]! : null);

/** 度数トークン→ルートからの半音（0..11）。R/3/5/7 は質依存・それ以外は固定半音。未知＝例外（黙って根音にしない）。 */
export function explicitDegreeSemis(deg: string, quality: string): number {
  const iv = intervalsOf(quality);
  if (deg === "R") return 0;
  if (deg === "3") return iv[1] ?? 4;
  if (deg === "5") return iv[2] ?? 7;
  if (deg === "7") return seventhOf(iv) ?? 10; // 三和音の 7＝短7度（既存の度数語彙と同じ既定）
  const s = FIXED_SEMI[deg];
  if (s === undefined) throw new Error(`explicitDegreeSemis: unknown degree token ${JSON.stringify(deg)}`);
  return s;
}

/** 明示の音→絶対音。pitch = explicitRootRef(root, key) + 度数の半音 + 12×oct。 */
export function explicitNotePitch(n: { deg: string; oct: number }, root: number | string, quality: string, key = 0): number {
  if (!Number.isInteger(n.oct)) throw new Error(`explicitNotePitch: oct must be an integer (got ${n.oct})`);
  return explicitRootRef(root, key) + explicitDegreeSemis(n.deg, quality) + 12 * n.oct;
}

/** 絶対音→明示の音（explicitNotePitch の逆）。コードの R/3/5/7 なら質依存トークン、それ以外は固定半音トークン。 */
export function pitchToExplicitNote(pitch: number, root: number | string, quality: string, key = 0): { deg: string; oct: number } {
  if (!Number.isInteger(pitch)) throw new Error(`pitchToExplicitNote: pitch must be an integer (got ${pitch})`);
  const iv = intervalsOf(quality);
  const ref = explicitRootRef(root, key);
  const semi = mod12(pitch - ref);
  const sev = seventhOf(iv);
  let deg: string;
  if (semi === 0) deg = "R";
  else if (iv[1] === semi) deg = "3";
  else if (iv[2] === semi) deg = "5";
  else if (sev === semi) deg = "7";
  else deg = EXPLICIT_FIXED_BY_SEMI[semi]!;
  const oct = (pitch - ref - explicitDegreeSemis(deg, quality)) / 12;
  return { deg, oct };
}

// ---------------------------------------------------------------------------
// 写し＝ピアノ伴奏の生成結果 → 和音パターンの形
// ---------------------------------------------------------------------------
/** 和音パターンの形（web ChordPatternContent のうち、ここで書くフィールドだけ）。 */
export interface ExplicitChordPattern {
  mode: "strum";
  voicing: { tones: ("R" | "3" | "5" | "7")[]; openClose: "close"; octave: 0; top: number; style: "keyboard" };
  steps: number;
  /** 右手＝打点ごとに明示の音。dur＝16分の数（端数あり＝生成どおりの長さ）。 */
  hits: { step: number; dur: number; notes: ExplicitNote[] }[];
  /** 左手＝1音1件の custom（oct つき）。 */
  lh: { mode: "custom"; hits: { step: number; dur: number; deg: string; oct: number; vel: number }[] };
  program: number;
  followChords: true;
  pedal?: { start: number; dur: number }[];
  gen: {
    engine: "handframe"; version: string; seed: number; level: number; preset: string; cellBeats: 2 | 4; register: "source" | "piano"; rhFrom?: number;
    /** 生成の設定（別案・弾き直しで同じ設定を使う） */ offbeatSingles: boolean; humanize: boolean;
    /** 人が決めた打点（画面 B・触ったときだけ） */ rhythm?: HandFrameRhythm;
    /** 弾き直しの文脈＝生成に使った進行（長さつき）・テンポ・調 */ chords: BandChord[]; tempo: number; key: number;
  };
}

const toStep = (beats: number): number => {
  const s = Math.round(beats * 4);
  if (Math.abs(beats * 4 - s) > 1e-6) throw new Error(`handFrameToChordPattern: start ${beats} is not on the 16th grid`);
  return s;
};

/**
 * 進行（長さつき・4/4）からピアノ伴奏を生成し、和音パターンの形に写す。
 * 音の時刻は格子の上（揺れは feel で返す）。長さは 16分の数の端数で持つ（×4/×0.25 は浮動小数で誤差なし）。
 */
export function handFrameToChordPattern(chords: readonly BandChord[], opts: HandFrameBandOptions & { key?: number }): {
  content: ExplicitChordPattern; feel: Feel | null; warnings: string[];
} {
  const { cells, cellBeats } = splitIntoCells(chords);
  const r = generateHandFrameBand(chords, opts);
  const byStep = new Map<number, { dur: number; notes: ExplicitNote[] }>();
  const lhHits: ExplicitChordPattern["lh"]["hits"] = [];
  let endBeats = 0;
  r.notes.forEach((n, i) => {
    const c = r.content.notes[i]!;
    const cell = cells[n[5]]!;
    const step = toStep(c.start);
    const dur = c.dur * 4;
    const { deg, oct } = pitchToExplicitNote(c.pitch, cell.root, cell.quality, opts.key ?? 0);
    endBeats = Math.max(endBeats, c.start + c.dur);
    if (n[4] === "L") { lhHits.push({ step, dur, deg, oct, vel: c.vel }); return; }
    const h = byStep.get(step);
    if (!h) byStep.set(step, { dur, notes: [{ deg, oct, vel: c.vel }] });
    else {
      if (h.dur !== dur) throw new Error(`handFrameToChordPattern: notes at step ${step} have different lengths`);
      h.notes.push({ deg, oct, vel: c.vel });
    }
  });
  const totalBeats = cells.length * cellBeats;
  const content: ExplicitChordPattern = {
    mode: "strum",
    voicing: { tones: ["R", "3", "5"], openClose: "close", octave: 0, top: 72, style: "keyboard" },
    steps: Math.max(totalBeats * 4, Math.ceil(endBeats * 4 - 1e-9)),
    hits: [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([step, h]) => ({ step, dur: h.dur, notes: h.notes })),
    lh: { mode: "custom", hits: lhHits },
    program: 0,
    followChords: true,
    gen: {
      engine: "handframe", version: pmEngineTag().version, seed: opts.seed, level: opts.level ?? 2, preset: opts.preset ?? "mid", cellBeats, register: opts.register ?? "piano", ...(opts.rhFrom != null ? { rhFrom: opts.rhFrom } : {}),
      offbeatSingles: opts.offbeatSingles !== false, humanize: opts.humanize !== false, ...(opts.rhythm ? { rhythm: opts.rhythm } : {}),
      chords: chords.map((c) => ({ root: c.root, quality: c.quality, beats: c.beats })), tempo: opts.tempo, key: opts.key ?? 0,
    },
  };
  if (r.content.pedal) content.pedal = r.content.pedal;
  return { content, feel: r.feel, warnings: r.warnings };
}

/** 和音パターンの形（明示の音）から打点（画面 B のマス目）を読み取る。rhythmOfBand と同じ結果（web が持つのはこちら）。 */
export function rhythmOfExplicit(c: Pick<ExplicitChordPattern, "hits" | "lh">): HandFrameRhythm {
  return {
    rh: [...c.hits].sort((a, b) => a.step - b.step).map((h) => ({ step: h.step, kind: h.notes.length >= 2 ? "grab" : "single" })),
    lh: [...new Set(c.lh.hits.map((h) => h.step))].sort((a, b) => a - b),
  };
}

/** 進行（拍の位置つき）をピアノ伴奏の生成器の形（長さつき）にする。api と web の弾き直しで共有。無ければ null。 */
export function bandChordsFromProgression(
  chords: readonly { root?: number | string | null; quality?: string | null; start?: number | null }[] | null | undefined, totalBeats: number,
): BandChord[] | null {
  const src = (chords ?? [])
    .filter((c) => c && c.root != null && typeof c.start === "number" && c.start < totalBeats)
    .map((c) => ({ root: c.root!, quality: c.quality ?? "", start: Math.max(0, c.start!) }))
    .sort((a, b) => a.start - b.start);
  if (!src.length) return null;
  src[0]!.start = 0; // 頭にコードが無ければ最初のコードを頭から鳴らす
  const band = src.map((c, i) => ({ root: c.root, quality: c.quality, beats: (src[i + 1]?.start ?? totalBeats) - c.start })).filter((c) => c.beats > 1e-9);
  return band.length ? band : null;
}

/** 画面 B の弾き直し：来歴（進行・テンポ・調・種・設定）から同じ生成器で作り直す。patch で種・設定・打点を変える。
 *  rhythm:null＝人の指定を捨てて生成に戻す。feel＝揺れ on なら生成の feel（跳ねは元の content の値を保つ）。 */
export function regenerateHandFrameContent<C extends ExplicitChordPattern & { feel?: Feel | null }>(
  content: C,
  patch: { seed?: number; rhFrom?: number | null; humanize?: boolean; offbeatSingles?: boolean; rhythm?: HandFrameRhythm | null } = {},
): C {
  const g = content.gen;
  const rhythm = patch.rhythm === null ? undefined : patch.rhythm ?? g.rhythm;
  const rhFrom = patch.rhFrom === null ? undefined : patch.rhFrom ?? g.rhFrom;
  const r = handFrameToChordPattern(g.chords, {
    tempo: g.tempo, key: g.key, seed: patch.seed ?? g.seed, level: g.level, preset: g.preset as HandFrameBandOptions["preset"],
    register: g.register, ...(rhFrom != null ? { rhFrom } : {}),
    humanize: patch.humanize ?? g.humanize, offbeatSingles: patch.offbeatSingles ?? g.offbeatSingles, ...(rhythm ? { rhythm } : {}),
  });
  const { feel: oldFeel, ...rest } = content;
  const swing = oldFeel?.swing;
  const feel = r.feel ? { ...r.feel, ...(swing ? { swing } : {}) } : swing ? { swing } : null;
  const next = { ...rest, ...r.content } as unknown as C;
  if (feel) (next as { feel?: Feel }).feel = feel;
  return next;
}

