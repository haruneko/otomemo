// コーパス統計 → 生成バイアス（S6-b・spec§1-2「弱マルコフを制約内のバイアスで後付け」の実装）。
// 実例旋律群から「歩幅(スケール度)の分布」を学習し、genMelody のモチーフ輪郭の重みに差し替える。
// ＝ルールで詰め切れない"肌触り"を実例の統計で持ち上げる。無コーパスなら既定にfallback（degrade gracefully）。
import { learnBarRhythms, learnMoveTransitions, type BarRhythmModel, type MoveModel } from "./melodyCells";
import type { Core } from "../core";

type Note = { pitch: number; start?: number; dur?: number };

// 注（J3・2026-07-11 Task#15）：learnStepWeights / learnStepWeightsFromLibrary / cScaleArr は撤去。
// これらは旧経路④のモチーフ歩幅バイアス（genMelody opts.stepWeights）専用で、④撤去＝V2 一本化により死んだ。
// 生成のコーパスバイアスは learnMotifModelFromLibrary（V2/③が消費する rhythm+move モデル）に一元化。

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
