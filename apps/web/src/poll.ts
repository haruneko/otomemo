// ジョブ待ちの共通プリミティブ（アーキ是正 S5）。生成/取込/ワーカー待ちは長く、アンマウント後に
// setState すると React 警告＋リーク。各所で個別に書いていた alive ガード／getJob ポーリングを集約。
import { useEffect, useRef, type MutableRefObject } from "react";
import { api } from "./api";

/** アンマウント後の setState を防ぐ alive ref。長い非同期(生成/待ち)の前後で `alive.current` を見る。 */
export function useAlive(): MutableRefObject<boolean> {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

/** 単一ジョブを done/failed までポーリング（alive で中断）。終端した job を返す。timeout/中断は null。 */
export async function pollJob(
  jobId: string,
  alive: MutableRefObject<boolean>,
  opts: { tries?: number; intervalMs?: number } = {},
): Promise<Awaited<ReturnType<typeof api.getJob>> | null> {
  const tries = opts.tries ?? 90;
  const intervalMs = opts.intervalMs ?? 1500;
  for (let i = 0; i < tries && alive.current; i++) {
    const j = await api.getJob(jobId);
    if (j.status === "done" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/** ジョブ done を待って content を返す（生成導線の共通形）。失敗/timeout/中断は null。 */
export async function pollJobContent(jobId: string, alive: MutableRefObject<boolean>): Promise<unknown> {
  const j = await pollJob(jobId, alive);
  return j?.status === "done" ? (j.result as { content?: unknown } | null)?.content ?? null : null;
}
