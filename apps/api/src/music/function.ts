// 連想エンジン S2（design.md「連想エンジン」）：度数→機能(T/S/D)・ローマ数字・カデンツ(終止)検出。
// music21非依存・決定的。worker analyze.py の _function_of を移植し、ローマ数字とカデンツを自作で足す。
import { type Chord, type Degree } from "./theory";
import { toDegrees, detectKeyFromChords } from "./index";

export type Mode = "major" | "minor";
// SUB＝短調の♭VII(下主音・subtonic)。旧は"D"扱い＝♭VII→iを完全終止と誤ラベル・substituteがV⇔♭VIIを
// 機能代理扱いする温床だった（A5/A8・design#12-M 2026-07-08）。
export type Func = "T" | "S" | "D" | "SUB" | "?";
// modal＝導音を持たない旋法終止（短調の ♭VII→i / v→i）。authentic とは区別する。
export type CadenceType = "authentic" | "plagal" | "half" | "deceptive" | "modal" | "none";

// 度数(0-11・調主音から半音) → ローマ数字の基底。ダイアトニックは素の数字、非ダイアトニックは臨時記号。
const MAJOR_ROMAN: Record<number, string> = {
  0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV", 6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII",
};
const MINOR_ROMAN: Record<number, string> = {
  0: "I", 1: "bII", 2: "II", 3: "III", 4: "#III", 5: "IV", 6: "#IV", 7: "V", 8: "VI", 9: "#VI", 10: "VII", 11: "#VII",
};

// 機能：メジャー I/iii/vi=T, ii/IV=S, V/vii=D。マイナー i/bIII/bVI=T, ii/iv=S, V/vii°=D, ♭VII=SUB。非ダイアは ?。
// 短調に 11(vii°)=D を追加（旧: 本物の導音ドミナントが"?"＝終止が検出されなかった・A6）。
const MAJOR_FUNC: Record<number, Func> = { 0: "T", 4: "T", 9: "T", 2: "S", 5: "S", 7: "D", 11: "D" };
const MINOR_FUNC: Record<number, Func> = { 0: "T", 3: "T", 8: "T", 2: "S", 5: "S", 7: "D", 11: "D", 10: "SUB" };

export function functionOf(degree: number, mode: Mode = "major"): Func {
  const d = ((Math.trunc(degree) % 12) + 12) % 12;
  return (mode === "minor" ? MINOR_FUNC : MAJOR_FUNC)[d] ?? "?";
}

// 品質が短調系(m/dim/m7/m7b5/m6/min)なら小文字、長調系なら大文字。
function isMinorQuality(q: string): boolean {
  return /^(m|min|dim)/.test(q) && !/^maj/.test(q);
}

export function romanOf(deg: Degree, mode: Mode = "major"): string {
  const d = ((Math.trunc(deg.degree) % 12) + 12) % 12;
  let base = (mode === "minor" ? MINOR_ROMAN : MAJOR_ROMAN)[d] ?? "?";
  const q = deg.quality || "";
  if (isMinorQuality(q)) base = base.toLowerCase();
  // 品質の図形：dim は °、それ以外は素の品質文字（7/maj7/sus4…）をそのまま添える。小文字化済み接頭の m は二重に出さない。
  let suffix = q;
  if (q === "dim") (base = base + "°"), (suffix = "");
  else if (isMinorQuality(q)) suffix = q.replace(/^m(in)?/, ""); // 既に小文字化で minor は表現済み
  return base + suffix;
}

// 品質が「導音を持つドミナント系」か＝長三和音/7/maj7等（m/min/dim系でない）。短調のv(m)を弾く鍵。
function isDomQuality(q: string): boolean {
  const s = q || "";
  return !/^(m|min|dim)/.test(s) || /^maj/.test(s);
}
// 「本物のドミナント」＝導音を持つ和音：V系(度数7・長/属系品質) or vii°(度数11・dim/♭5系)。
function isRealDominant(deg: Degree): boolean {
  const d = ((deg.degree % 12) + 12) % 12;
  if (d === 7) return isDomQuality(deg.quality || "");
  if (d === 11) return /dim|b5/.test(deg.quality || "");
  return false;
}

/** 終止（最後の2和音）の型を判定。**品質込み**＝♭VII→i/v→i は modal・V7→i/vii°→i は authentic
 *（旧: 度数の機能ラベルだけ見て ♭VII→i を authentic、♭VII終わりを half と誤ラベル。A5/A6/A7・2026-07-08）。 */
export function cadenceOf(degrees: Degree[], mode: Mode = "major"): { type: CadenceType; at: number } {
  const n = (degrees ?? []).length;
  if (n < 2) return { type: "none", at: -1 };
  const prev = degrees[n - 2]!;
  const last = degrees[n - 1]!;
  const at = n - 2;
  const ld = ((last.degree % 12) + 12) % 12;
  const pd = ((prev.degree % 12) + 12) % 12;
  if (ld === 0) {
    if (isRealDominant(prev)) return { type: "authentic", at }; // V(7)→I / vii°→I
    if (pd === 5) return { type: "plagal", at }; // IV/iv→I
    if (mode === "minor" && (pd === 10 || pd === 7)) return { type: "modal", at }; // ♭VII→i / v(m)→i＝導音なし
  }
  if (pd === 7 && isDomQuality(prev.quality || "") && (ld === 9 || (functionOf(ld, mode) === "T" && ld !== 0))) return { type: "deceptive", at }; // V→vi / V→♭VI
  if (isRealDominant(last)) return { type: "half", at }; // …→V（♭VII終わりは half にしない）
  return { type: "none", at: -1 };
}

export type ProgressionAnalysis = {
  key: number;
  mode: Mode;
  degrees: { degree: number; quality: string; roman: string; function: Func }[];
  cadence: { type: CadenceType; at: number };
};

/** コード進行の機能解析を束ねる。調未指定なら detectKeyFromChords の第1候補を使う。 */
export function analyzeProgression(chords: Chord[], opts: { key?: number; mode?: Mode } = {}): ProgressionAnalysis {
  let key = opts.key;
  let mode = opts.mode;
  if (key === undefined || mode === undefined) {
    const top = detectKeyFromChords(chords, 1)[0]!;
    key = key ?? top.key;
    mode = mode ?? top.mode;
  }
  const degs = toDegrees(chords, key);
  const degrees = degs.map((d) => ({
    degree: d.degree,
    quality: d.quality,
    roman: romanOf(d, mode!),
    function: functionOf(d.degree, mode!),
  }));
  return { key, mode, degrees, cadence: cadenceOf(degs, mode) };
}
