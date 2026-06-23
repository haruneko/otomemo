// メロの「エッセンス」抽出（design #12-M / spec §3）。連想記憶の材料＝**抽象/相対/統計の層のみ**
// （著作権セーフ：絶対ピッチ＋絶対リズムの同時一致＝複製は持たない）。コード進行の度数列指紋の対応物。
import type { Note } from "./fit";

export interface MelodyEssence {
  intervals: number[]; // E2 音程列（移調不変）＝"らしさ"の主力
  contour: number[]; // E1 輪郭（Parsons：-1下行/0同/1上行）
  rhythm: number[]; // E3 リズム指紋（IOI＝オンセット間隔の列・拍）
  pcHist: number[]; // E4 ピッチクラス分布（12次元・dur重み・正規化）
}

function sorted(notes: Note[]): Note[] {
  return [...(notes ?? [])].filter((n) => typeof n.pitch === "number").sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
}

export function melodyEssence(notes: Note[]): MelodyEssence {
  const ns = sorted(notes);
  const intervals: number[] = [];
  const contour: number[] = [];
  const rhythm: number[] = [];
  for (let i = 0; i < ns.length - 1; i++) {
    const d = ns[i + 1]!.pitch - ns[i]!.pitch;
    intervals.push(d);
    contour.push(Math.sign(d));
    rhythm.push(Math.round(((ns[i + 1]!.start ?? 0) - (ns[i]!.start ?? 0)) * 1000) / 1000);
  }
  const pcHist = new Array(12).fill(0) as number[];
  let wsum = 0;
  for (const n of ns) {
    const w = n.dur ?? 1;
    const pc = ((n.pitch % 12) + 12) % 12;
    pcHist[pc] = (pcHist[pc] ?? 0) + w;
    wsum += w;
  }
  if (wsum > 0) for (let i = 0; i < 12; i++) pcHist[i]! /= wsum;
  return { intervals, contour, rhythm, pcHist };
}

// 列の編集距離（置換コスト＝|差|を cap）。リズム/輪郭の類似に使う。
function editDist(a: number[], b: number[], subCap: number): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j - 1]! + Math.min(Math.abs(a[i - 1]! - b[j - 1]!), subCap),
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
      );
  return dp[m]![n]!;
}

// 輪郭（方向）の類似 0..1（移調にも tempo にも不変＝身振りが同じか）。
export function contourSim(a: number[], b: number[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  return Math.max(0, 1 - editDist(a, b, 1) / Math.max(a.length, b.length));
}

// リズム指紋（IOI列）の類似 0..1（音高に依らずノリが同じか）。八分単位で量子化して比較。
export function rhythmSim(a: number[], b: number[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const q = (x: number[]) => x.map((v) => Math.round(v * 2)); // 八分(0.5拍)単位に量子化
  return Math.max(0, 1 - editDist(q(a), q(b), 2) / (2 * Math.max(a.length, b.length)));
}

// ピッチクラス分布の類似 0..1（ヒストグラム交差＝多用する音/旋法が近いか）。
export function pcSim(a: number[], b: number[]): number {
  let inter = 0;
  for (let i = 0; i < 12; i++) inter += Math.min(a[i] ?? 0, b[i] ?? 0);
  return Math.max(0, Math.min(1, inter)); // 両方正規化済＝交差は 0..1
}
