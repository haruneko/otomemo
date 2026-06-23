// 定期スケジューラ（tick）：期日の来た schedule から継続調査ジョブを enqueue する**生産者の駆動**。
// design「アーキ是正 決定3」＝Core から分離。Core の db/getNeta/enqueueJob を使う。rowToSchedule に
// 依存せず必要列だけ読む（schedule CRUD と疎結合・循環回避）。
import type { Core } from "./core";

export function tickSchedules(core: Core): number {
  const ts = new Date().toISOString();
  const due = core.db
    .prepare(
      `SELECT * FROM schedule s
         WHERE s.enabled=1 AND s.next_run <= ?
           AND NOT EXISTS (
             SELECT 1 FROM job j
             WHERE j.status IN ('queued','running')
               AND json_extract(j.params,'$.schedule_id') = s.id
           )`,
    )
    .all(ts) as Record<string, unknown>[];
  let n = 0;
  for (const s of due) {
    const id = s.id as string;
    const intent = s.intent as string;
    const netaId = (s.neta_id as string | null) ?? null;
    const everySec = s.every_sec as number;
    let params: Record<string, unknown> | null = null;
    try {
      params = s.params ? (JSON.parse(s.params as string) as Record<string, unknown>) : null;
    } catch {
      params = null;
    }
    const neta = netaId ? core.getNeta(netaId) : null;
    const theme = neta ? (neta.title ?? neta.text ?? "") : "";
    core.enqueueJob({
      intent,
      target_neta_id: netaId ?? undefined,
      instruction: theme || undefined,
      params: { ...params, schedule_id: id },
      notify_level: "quiet",
    });
    const next = new Date(Date.now() + everySec * 1000).toISOString();
    core.db.prepare(`UPDATE schedule SET last_run=?, next_run=? WHERE id=?`).run(ts, next, id);
    n += 1;
  }
  return n;
}
