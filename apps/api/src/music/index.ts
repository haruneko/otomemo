// 連想エンジン S1（design.md「連想エンジン」）：度数化／調推定(上位2・決め打たない)／進行の似ている度合い。
// framework非依存・依存なし・決定的（ゴールデンテスト可）。web は workspace 経由で共用する想定。
import {
  type Chord,
  type Degree,
  type KeyCandidate,
  chordPcs,
  normRoot,
  KS_MAJOR,
  KS_MINOR,
} from "./theory";

export type { Chord, Degree, KeyCandidate };

/** コード列 → C基準（調相対）の度数列。(root - key) mod 12。quality は保持。 */
export function toDegrees(chords: Chord[], key: number): Degree[] {
  const k = ((Math.trunc(key) % 12) + 12) % 12;
  return (chords ?? []).map((c) => ({
    degree: ((normRoot(c.root) - k) % 12 + 12) % 12,
    quality: c.quality ?? "",
  }));
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

/**
 * コード列 → 調の候補をスコア降順で上位 top件（既定2）。Krumhansl-Schmuckler 相関。
 * 調は relative major/minor 等で本質的に曖昧なので**1個に決め打たず複数候補を返す**（要件）。
 * 各コードを構成音pcに展開し dur 重み＋ルート加点で pcヒストグラム→24調プロファイルと相関。
 */
export function detectKeyFromChords(chords: Chord[], top = 2): KeyCandidate[] {
  const hist = new Array(12).fill(0) as number[];
  for (const c of chords ?? []) {
    const w = typeof c.dur === "number" && c.dur > 0 ? c.dur : 1;
    for (const pc of chordPcs(c.root, c.quality ?? "")) hist[pc] = (hist[pc] ?? 0) + w;
    const rb = normRoot(c.root);
    hist[rb] = (hist[rb] ?? 0) + w; // 調中心の手がかり＝ルートに加点
  }
  if (hist.every((x) => x === 0)) return [{ key: 0, mode: "major", score: 0 }];
  const cands: KeyCandidate[] = [];
  for (let key = 0; key < 12; key++) {
    const majProf = hist.map((_, p) => KS_MAJOR[((p - key) % 12 + 12) % 12]!);
    const minProf = hist.map((_, p) => KS_MINOR[((p - key) % 12 + 12) % 12]!);
    cands.push({ key, mode: "major", score: pearson(hist, majProf) });
    cands.push({ key, mode: "minor", score: pearson(hist, minProf) });
  }
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, Math.max(1, top));
}

// 2つの度数の置換コスト（0=同一 … ~1.5=度数も品質も別）。度数=半音circular距離(上限2)を0..1、品質不一致+0.5。
function degCost(a: Degree, b: Degree): number {
  const d = Math.abs(a.degree - b.degree) % 12;
  const circ = Math.min(d, 12 - d);
  const dd = a.degree === b.degree ? 0 : Math.min(circ, 2) / 2;
  const qd = (a.quality || "") === (b.quality || "") ? 0 : 0.5;
  return dd + qd;
}

/**
 * 進行の「似ている度合い」＝度数列の重み付き編集距離（小さいほど近い）。worker similar.py の発想を度数へ。
 * 度数化を通してから渡せば移調不変（同じ機能なら調が違っても距離0）。挿入/削除=1、置換=degCost。
 */
export function progressionDistance(a: Degree[], b: Degree[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const sub = dp[i - 1]![j - 1]! + degCost(a[i - 1]!, b[j - 1]!);
      dp[i]![j] = Math.min(sub, dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1);
    }
  }
  return dp[m]![n]!;
}
