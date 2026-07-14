// 連想エンジン S1（design.md「連想エンジン」）：度数化／調推定(上位2・決め打たない)／進行の似ている度合い。
// framework非依存・依存なし・決定的（ゴールデンテスト可）。web は workspace 経由で共用する想定。
import { type Chord, type Degree, type KeyCandidate, chordPcs, normRoot, rankKeys } from "./theory";

export type { Chord, Degree, KeyCandidate };
// S2 機能/カデンツ解析（function.ts は toDegrees/detectKeyFromChords を呼ぶ＝呼び出し時参照で循環OK）。
export * from "./function";
// 名前あて＋名前付き進行DB。
export * from "./progressions";
export * from "./identify";
// 代替コード。
export * from "./substitute";
// ラインクリシェ／ペダル（WP-C3スライス2＝内声/ベースの半音線語彙）。
export * from "./lineCliche";
// シティポップ拡張和声プリセット（WP-C3スライス3＝テンション付与＋分数化＋やり過ぎ警告）。
export * from "./citypop";
// 感情シフト（単体コード）。
export * from "./emotion";
// 感情語→パラメータプリセット（WP-E1・実在ノブ推奨値の提案）。
export * from "./emotionMap";
// 説明・命名（機能解析＋名前あての束ね）。
export * from "./explain";
// メロ×コードの当てはまり判定＋外し音補正（土台v・メロが変→直す/ハモ付けの足場）。
export * from "./fit";
// ハモ付け（メロ→合うコード候補）。
export * from "./harmonize";
// 継続（次のコード候補）。
export * from "./continuation";
export * from "./generate";
// 調プラン（セクション間の転調設計・WP-C2）。
export * from "./keyPlan";
// 構成テンプレ＋エネルギープラン（WP-X1）。
export * from "./formLibrary";
export * from "./energyPlan";
export * from "./similarity";
export * from "./chordname";
export * from "./melodyEssence";
export * from "./loopCheck"; // WP-X2 ゲームBGMループ境界チェック
export * from "./similarityWarning"; // WP-M8 旋律類似の独自性警告（除外ゲート＋緑/黄/赤トリアージ）

/** コード列 → C基準（調相対）の度数列。(root - key) mod 12。quality は保持。 */
export function toDegrees(chords: Chord[], key: number): Degree[] {
  const k = ((Math.trunc(key) % 12) + 12) % 12;
  return (chords ?? []).map((c) => ({
    degree: ((normRoot(c.root) - k) % 12 + 12) % 12,
    quality: c.quality ?? "",
  }));
}

/**
 * コード列 → 調の候補をスコア降順で上位 top件（既定2）。Krumhansl-Schmuckler 相関。
 * 調は relative major/minor 等で本質的に曖昧なので**1個に決め打たず複数候補を返す**（要件）。
 * 各コードを構成音pcに展開し dur 重み＋ルート加点で pcヒストグラム→24調プロファイルと相関（rankKeys）。
 */
export function detectKeyFromChords(chords: Chord[], top = 2): KeyCandidate[] {
  const hist = new Array(12).fill(0) as number[];
  for (const c of chords ?? []) {
    const w = typeof c.dur === "number" && c.dur > 0 ? c.dur : 1;
    for (const pc of chordPcs(c.root, c.quality ?? "")) hist[pc] = (hist[pc] ?? 0) + w;
    const rb = normRoot(c.root);
    hist[rb] = (hist[rb] ?? 0) + w; // 調中心の手がかり＝ルートに加点
  }
  return rankKeys(hist, top);
}

// 2つの度数の置換コスト（0=同一 … ~1.5=度数も品質も別）。度数=半音circular距離(上限2)を0..1、品質不一致+0.5。
// quality を「族」へ正規化（3度＋種別）。三和音とその7th拡張は同族＝近い（素描＝トライアドで書いても当たる）。
function qualityClass(q: string): string {
  const s = (q || "").toLowerCase();
  if (s.startsWith("dim") || s.includes("7b5") || s.includes("m7-5")) return "dim";
  if (s.startsWith("aug") || s.startsWith("+")) return "aug";
  if (s.startsWith("sus")) return "sus";
  if (s.startsWith("m") && !s.startsWith("maj")) return "min"; // m/m7/m6/min（短3度）
  return "maj"; // ""/maj7/7/6/9/add…（長3度）
}
function degCost(a: Degree, b: Degree): number {
  const d = Math.abs(a.degree - b.degree) % 12;
  const circ = Math.min(d, 12 - d);
  const dd = a.degree === b.degree ? 0 : Math.min(circ, 2) / 2;
  // quality 不一致：同族（三和音↔7th等・3度が同じ）は軽い、別族（major↔minor↔dim）は重い。
  const qd =
    (a.quality || "") === (b.quality || "")
      ? 0
      : qualityClass(a.quality || "") === qualityClass(b.quality || "")
        ? 0.15
        : 0.5;
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
