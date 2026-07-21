// コーパス統計 → 生成バイアス（S6-b・spec§1-2「弱マルコフを制約内のバイアスで後付け」の実装）。
// 実例旋律群から「歩幅(スケール度)の分布」を学習し、genMelody のモチーフ輪郭の重みに差し替える。
// ＝ルールで詰め切れない"肌触り"を実例の統計で持ち上げる。無コーパスなら既定にfallback（degrade gracefully）。
//
// 【著作権（2026-07-21）】他者コーパス(POP909 pop / game)の literal メロは cm.sqlite から撤去し git外へ退避。
// 生成が要る"肌触り"は**統計モデル(rhythm+move の count Map)だけ**を事前計算して data/corpus-stats/motif-model.json
// (gitignore=git外) に焼き、実行時はそれを load する（＝復元不能な統計・CLAUDE.md「統計のみ抽出」準拠）。
// PD の irish 句は library に残置可（placeable）。**self-authored を library へ足したら build-motif-model.ts を再実行**
// （現状 stats 優先ゆえ live 追加は模型へ入らない・"自分の素材は薄い"前提の割り切り）。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { learnBarRhythms, learnMoveTransitions, type BarRhythmModel, type MoveModel } from "./melodyCells";
import type { Core } from "../core";

type Note = { pitch: number; start?: number; dur?: number };
export type MotifModel = { rhythm: BarRhythmModel; move: MoveModel };

// 注（J3・2026-07-11 Task#15）：learnStepWeights / learnStepWeightsFromLibrary / cScaleArr は撤去（旧経路④専用・死んだ）。

// 純関数：melody neta 群 → motif モデル（1小節8分リズム語彙＋move遷移 P(m2|m1)＝gap-fill）。
// V2（genMotifMelodyV2）の motifModel 用。素材が無ければ null（呼び側は既定16分語彙で生成）。
export function buildMotifModel(mels: { content: unknown }[]): MotifModel | null {
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

// シリアライズ＝**配列で順序保持**（Map 挿入順＝weightedPickNum のサンプリング順を厳密に保つ。object 化は
// 数値キーが昇順へ並び替わりサンプリングが変わるため不可）。build スクリプトと load が対で使う。
export interface MotifModelStat { rhythm: [string, number][]; move: [number, [number, number][]][] }
export function serializeMotifModel(m: MotifModel): MotifModelStat {
  return { rhythm: [...m.rhythm.patterns], move: [...m.move.trans].map(([k, v]) => [k, [...v]]) };
}
export function deserializeMotifModel(s: MotifModelStat): MotifModel {
  return { rhythm: { patterns: new Map(s.rhythm) }, move: { trans: new Map(s.move.map(([k, v]) => [k, new Map(v)])) } };
}

// 事前計算済み統計（data/corpus-stats/motif-model.json）の load。key=style（undefined→"__all__"）。
// テスト（VITEST）は load せず live library を使う＝テストは自前の library で完結（本番stats に汚染されない）。
let _motifStats: Record<string, MotifModelStat> | null | undefined;
function statsPath(): string { return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data", "corpus-stats", "motif-model.json"); }
export function loadMotifModelFromStats(style?: string): MotifModel | null {
  if (process.env.VITEST) return null; // テストは in-memory library を使う
  if (_motifStats === undefined) { try { _motifStats = JSON.parse(readFileSync(statsPath(), "utf8")) as Record<string, MotifModelStat>; } catch { _motifStats = null; } }
  const s = _motifStats?.[style ?? "__all__"];
  return s ? deserializeMotifModel(s) : null;
}

// library の melody から motif モデルを得る。**事前計算済み統計を優先**（他者literal撤去後の runtime 経路＝
// 焼いた __all__ を返す＝生成 bit 不変）。統計が無い（未焼き/テスト）ときだけ在DB library から計算。
export function learnMotifModelFromLibrary(core: Core, style?: string): MotifModel | null {
  const fromStats = loadMotifModelFromStats(style);
  if (fromStats) return fromStats;
  return buildMotifModel(core.listNeta({ kind: "melody", scope: "library", tags: style ? [style] : undefined, limit: 99999 }));
}
