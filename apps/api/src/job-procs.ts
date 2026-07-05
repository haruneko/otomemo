// #100④-S6+ バッチジョブ（research/collect/audio_analyze）の**実プロセスを止められる**ようにする登録簿。
// 実行器がジョブ開始時に AbortController を登録し、spawn に signal を渡す。削除/停止時に abort→
// spawn 側が detached プロセスグループごと SIGKILL する（timeout kill と同じ経路）。
// チャットのターンは別系統（chat-session が長命 claude を kill）＝こちらは単発バッチ専用。
const controllers = new Map<string, AbortController>();

/** ジョブ開始：AbortController を登録し signal を返す（spawn に渡す）。 */
export function beginJobProc(jobId: string): AbortSignal {
  const ac = new AbortController();
  controllers.set(jobId, ac);
  return ac.signal;
}

/** ジョブ終了（正常/異常問わず）：登録解除。 */
export function endJobProc(jobId: string): void {
  controllers.delete(jobId);
}

/** 実行中なら abort（→ spawn 側がプロセスを殺す）。登録が有れば true。 */
export function killJobProc(jobId: string): boolean {
  const ac = controllers.get(jobId);
  if (!ac) return false;
  ac.abort();
  controllers.delete(jobId);
  return true;
}

/** そのジョブの実プロセスが走行中か。 */
export function isJobProcRunning(jobId: string): boolean {
  return controllers.has(jobId);
}
