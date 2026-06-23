// #92 メロディ類似度（記号・移調不変）。音程列の重み付き編集距離（簡易 Mongeau-Sankoff）。
// worker similar.py を忠実移植（design「アーキ是正 決定1」＝ドメインTS一本化）。
import type { Note } from "./fit";

function intervals(notes: Note[]): number[] {
  const ns = [...(notes ?? [])]
    .filter((n) => typeof n.pitch === "number")
    .sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const out: number[] = [];
  for (let i = 0; i < ns.length - 1; i++) out.push(ns[i + 1]!.pitch - ns[i]!.pitch);
  return out;
}

function editDistance(a: number[], b: number[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = dp[i - 1]![j - 1]! + Math.min(Math.abs(a[i - 1]! - b[j - 1]!), 2); // 置換=音程差(上限2)
      dp[i]![j] = Math.min(sub, dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1);
    }
  }
  return dp[m]![n]!;
}

/** 2メロの類似度 0..1（1=同型・移調しても高い）。 */
export function melodySimilarity(aNotes: Note[], bNotes: Note[]): number {
  const a = intervals(aNotes);
  const b = intervals(bNotes);
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dist = editDistance(a, b);
  return Math.max(0, 1 - dist / (2 * Math.max(a.length, b.length)));
}

export interface SimilarCandidate {
  id?: string;
  label?: string;
  notes: Note[];
}
/** target に近い順に候補を返す。 */
export function findSimilar(
  targetNotes: Note[],
  candidates: SimilarCandidate[],
  top = 5,
): { id?: string; label?: string; similarity: number }[] {
  const scored = (candidates ?? []).map((c) => {
    const { notes: _drop, ...rest } = c;
    return { ...rest, similarity: Math.round(melodySimilarity(targetNotes, c.notes ?? []) * 1000) / 1000 };
  });
  scored.sort((x, y) => y.similarity - x.similarity);
  return scored.slice(0, Math.max(1, top));
}
