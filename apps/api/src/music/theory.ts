// 連想エンジンの理論素片（framework非依存・依存なし）。design.md「連想エンジン」。
// worker theory.py / web music.ts の QUALITY_INTERVALS と一致させる（C基準・度数はルートから半音）。

export type Chord = { root: number | string; quality?: string; start?: number; dur?: number; bass?: number };
/** 調相対の度数（degree=調主音からの半音 0-11）＋コード品質。進行はこれで保持＝移調不変。 */
export type Degree = { degree: number; quality: string };
export type KeyCandidate = { key: number; mode: "major" | "minor"; score: number };

export const QUALITY_INTERVALS: Record<string, number[]> = {
  // ※ web `apps/web/src/music.ts` の同名と**キー集合を一致**させる（property test で担保・design「決定A」）。
  // 三和音
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  // 7th
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], // ハーフディミニッシュ
  dim7: [0, 3, 6, 9], // フルディミニッシュ7
  aug7: [0, 4, 8, 10], // =7#5
  "7b5": [0, 4, 6, 10],
  mM7: [0, 3, 7, 11], // m(maj7)
  "7sus4": [0, 5, 7, 10],
  // 6th
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  // テンション（9系は 9度=14→pc2）
  "9": [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  m9: [0, 3, 7, 10, 2],
  add9: [0, 4, 7, 2],
  "69": [0, 4, 7, 9, 2], // 6/9
  m69: [0, 3, 7, 9, 2],
  // altered / extended dominant
  "7b9": [0, 4, 7, 10, 1],
  "7#9": [0, 4, 7, 10, 3],
  "7#11": [0, 4, 7, 10, 6],
  "13": [0, 4, 7, 10, 2, 9],
  m11: [0, 3, 7, 10, 2, 5],
  "maj7#11": [0, 4, 7, 11, 6],
};

const PC_BY_NAME: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** root を 0-11 ピッチクラスへ。int はそのまま、"C#"/"Db" 等の音名も解釈（worker norm_root と同じ）。 */
export function normRoot(root: number | string): number {
  if (typeof root === "number") return ((Math.trunc(root) % 12) + 12) % 12;
  const s = String(root).trim();
  if (!s) return 0;
  let base = PC_BY_NAME[s[0]!.toUpperCase()] ?? 0;
  for (const ch of s.slice(1)) {
    if (ch === "#" || ch === "♯") base++;
    else if (ch === "b" || ch === "♭") base--;
  }
  return ((base % 12) + 12) % 12;
}

/** コードの構成ピッチクラス（0-11）。未知 quality はトライアド扱い。 */
export function chordPcs(root: number | string, quality: string): number[] {
  const r = normRoot(root);
  const ivals = QUALITY_INTERVALS[quality] ?? [0, 4, 7];
  return ivals.map((i) => (r + i) % 12);
}

// Krumhansl-Schmuckler の長調/短調プロファイル（C基準。調Kはこれを回して使う）。
export const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// スケール（worker theory.py と一致）。
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
export const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** 調のスケール構成ピッチクラス集合。 */
export function scalePcs(key: number, mode: "major" | "minor"): Set<number> {
  const base = mode === "minor" ? MINOR_SCALE : MAJOR_SCALE;
  const k = ((Math.trunc(key) % 12) + 12) % 12;
  return new Set(base.map((i) => (k + i) % 12));
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

/** pcヒストグラム(len12) → 24調プロファイルとの KS相関で上位 top件（コード列・ノート列で共用）。 */
export function rankKeys(hist: number[], top = 2): KeyCandidate[] {
  if (hist.every((x) => x === 0)) return [{ key: 0, mode: "major", score: 0 }];
  const cands: KeyCandidate[] = [];
  for (let key = 0; key < 12; key++) {
    cands.push({ key, mode: "major", score: pearson(hist, hist.map((_, p) => KS_MAJOR[((p - key) % 12 + 12) % 12]!)) });
    cands.push({ key, mode: "minor", score: pearson(hist, hist.map((_, p) => KS_MINOR[((p - key) % 12 + 12) % 12]!)) });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, Math.max(1, top));
}
