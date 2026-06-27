// コーパス統計 → 生成バイアス（S6-b・spec§1-2「弱マルコフを制約内のバイアスで後付け」の実装）。
// 実例旋律群から「歩幅(スケール度)の分布」を学習し、genMelody のモチーフ輪郭の重みに差し替える。
// ＝ルールで詰め切れない"肌触り"を実例の統計で持ち上げる。無コーパスなら既定にfallback（degrade gracefully）。
import { MOVES, DEFAULT_STEP_WEIGHTS, toScaleDegree, scaleArray } from "./generate";
import { scalePcs } from "./theory";
import { learnBarRhythms, learnMoveTransitions, type BarRhythmModel, type MoveModel } from "./melodyCells";
import type { Core } from "../core";

type Note = { pitch: number; start?: number; dur?: number };

// C基準メジャースケール配列（コーパスは normalizeToC 済みを想定）。
export function cScaleArr(): number[] {
  return scaleArray(scalePcs(0, "major"));
}

// 旋律群 → 歩幅(スケール度)の重み（MOVES に整列・ε平滑）。空/無音は既定にfallback。
// mult[i]＝旋律 i の重み（パターンの出現回数）。定番フレーズほど分布に効かせる。既定は各1。
export function learnStepWeights(melodies: Note[][], scaleArr: number[] = cScaleArr(), mult?: number[]): number[] {
  const moves = MOVES as readonly number[];
  const hist = moves.map(() => 0);
  melodies.forEach((mel, mi) => {
    const w = mult?.[mi] ?? 1; // 出現回数で重み付け＝頻度バイアス
    const ns = [...(mel ?? [])].filter((n) => typeof n.pitch === "number").sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (let i = 1; i < ns.length; i++) {
      const a = toScaleDegree(ns[i - 1]!.pitch, scaleArr);
      const b = toScaleDegree(ns[i]!.pitch, scaleArr);
      const delta = b.idx - a.idx + (b.oct - a.oct) * scaleArr.length;
      const m = Math.max(-2, Math.min(3, delta)); // MOVES の範囲へ丸め
      hist[moves.indexOf(m)]! += w;
    }
  });
  const total = hist.reduce((a, b) => a + b, 0);
  if (total < 4) return [...DEFAULT_STEP_WEIGHTS]; // データ不足は既定
  return hist.map((c) => c + 0.2); // ε平滑（rng.choices は相対重み）
}

// library の melody(style タグ)からエッセンスの歩幅分布を学習。パターンは content.count で頻度重み付け。
// コーパス未投入なら既定（null＝呼び側が既定使用）。辞書は少件数なので全件読む。
export function learnStepWeightsFromLibrary(core: Core, style?: string): number[] | null {
  const mels = core.listNeta({ kind: "melody", scope: "library", tags: style ? [style] : undefined, limit: 99999 });
  const items = mels
    .map((n) => ({ notes: (n.content as { notes?: Note[] } | null)?.notes ?? [], count: (n.content as { count?: number } | null)?.count ?? 1 }))
    .filter((x) => x.notes.length > 1);
  if (items.length === 0) return null;
  return learnStepWeights(items.map((x) => x.notes), cScaleArr(), items.map((x) => x.count));
}

// library の melody から motif モデル（1小節8分リズム語彙＋move遷移 P(m2|m1)＝gap-fill）を学習。
// genMotifMelody 用。コーパス未投入なら null（呼び側が旧経路へ degrade）。
export function learnMotifModelFromLibrary(core: Core, style?: string): { rhythm: BarRhythmModel; move: MoveModel } | null {
  const mels = core.listNeta({ kind: "melody", scope: "library", tags: style ? [style] : undefined, limit: 99999 });
  const seqs: number[][] = [];
  const patterns: string[] = [];
  for (const n of mels) {
    const notes = ((n.content as { notes?: Note[] } | null)?.notes ?? []).filter((x) => typeof x.pitch === "number").sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    if (notes.length < 2) continue;
    seqs.push(notes.map((x) => x.pitch));
    // 1小節(4拍)を8分8枠に量子化した onset 列（小節境界＝start を4拍で割る・4/4前提）
    const byBar = new Map<number, Set<number>>();
    for (const x of notes) { const st = x.start ?? 0; const bar = Math.floor(st / 4); const slot = Math.round((st - bar * 4) * 2); if (slot >= 0 && slot < 8) (byBar.get(bar) ?? byBar.set(bar, new Set()).get(bar)!).add(slot); }
    for (const [, slots] of byBar) { const g = Array(8).fill("."); for (const s of slots) g[s] = "x"; patterns.push(g.join("")); }
  }
  if (seqs.length === 0 || patterns.length === 0) return null;
  return { rhythm: learnBarRhythms(patterns), move: learnMoveTransitions(seqs) };
}
