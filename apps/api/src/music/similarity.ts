// #92 メロディ類似度（記号・移調不変）。音程列の重み付き編集距離（簡易 Mongeau-Sankoff）。
// worker similar.py を忠実移植（design「アーキ是正 決定1」＝ドメインTS一本化）。
import type { Note } from "./fit";
import { melodyEssence, contourSim, rhythmSim } from "./melodyEssence";

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

// 多層類似度（S4b・spec§7-9）：音程(主)＋リズム指紋＋輪郭の重み付き合成。
// 「同じ音程でもリズムが違えば別物寄り」＝音程だけより人の感覚に近い。0..1。
const LAYER_W = { interval: 0.5, rhythm: 0.3, contour: 0.2 };
export function melodySimilarityLayered(
  aNotes: Note[],
  bNotes: Note[],
  w: { interval: number; rhythm: number; contour: number } = LAYER_W,
): number {
  const ea = melodyEssence(aNotes);
  const eb = melodyEssence(bNotes);
  const s =
    w.interval * melodySimilarity(aNotes, bNotes) +
    w.rhythm * rhythmSim(ea.rhythm, eb.rhythm) +
    w.contour * contourSim(ea.contour, eb.contour);
  return Math.max(0, Math.min(1, s));
}

export interface SimilarCandidate {
  id?: string;
  label?: string;
  notes: Note[];
}
/** target に近い順に候補を返す。layered=true で多層類似（音程＋リズム＋輪郭）を使う。 */
export function findSimilar(
  targetNotes: Note[],
  candidates: SimilarCandidate[],
  top = 5,
  layered = false,
): { id?: string; label?: string; similarity: number }[] {
  const sim = layered ? melodySimilarityLayered : melodySimilarity;
  const scored = (candidates ?? []).map((c) => {
    const { notes: _drop, ...rest } = c;
    return { ...rest, similarity: Math.round(sim(targetNotes, c.notes ?? []) * 1000) / 1000 };
  });
  scored.sort((x, y) => y.similarity - x.similarity);
  return scored.slice(0, Math.max(1, top));
}
