// 連想エンジンの理論素片（framework非依存・依存なし）。design.md「連想エンジン」。
// worker theory.py / web music.ts の QUALITY_INTERVALS と一致させる（C基準・度数はルートから半音）。

export type Chord = { root: number | string; quality?: string; start?: number; dur?: number };
/** 調相対の度数（degree=調主音からの半音 0-11）＋コード品質。進行はこれで保持＝移調不変。 */
export type Degree = { degree: number; quality: string };
export type KeyCandidate = { key: number; mode: "major" | "minor"; score: number };

export const QUALITY_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
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
