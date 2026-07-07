// 連想エンジンの理論素片（framework非依存・依存なし）。design.md「連想エンジン」。
// 不変の音楽知識（QUALITY_INTERVALS/normRoot/chordPcs/音名）は @cm/music-core に集約し
// api/web で共有（負債D3・design 決定2b）。ここでは re-export して既存 import 面を不変に保つ。
import { PITCH_NAMES } from "@cm/music-core";
export { QUALITY_INTERVALS, normRoot, chordPcs } from "@cm/music-core";

export type Chord = { root: number | string; quality?: string; start?: number; dur?: number; bass?: number };
/** 調相対の度数（degree=調主音からの半音 0-11）＋コード品質。進行はこれで保持＝移調不変。 */
export type Degree = { degree: number; quality: string };
export type KeyCandidate = { key: number; mode: "major" | "minor"; score: number };

// Krumhansl-Schmuckler の長調/短調プロファイル（C基準。調Kはこれを回して使う）。
export const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// スケール（worker theory.py と一致）。
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
// KEY_NAMES は音名配列（PITCH_NAMES）と同一＝@cm/music-core の1本を別名で公開。
export const KEY_NAMES = PITCH_NAMES;

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
