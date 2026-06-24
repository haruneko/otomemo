// スケジュールリポジトリ（#6）：schedule 表の CRUD を所有。
// 期日→ジョブ enqueue の駆動(tickSchedules)は集約跨ぎ＝Core/scheduler.ts に残す（ここは CRUD のみ）。
import { randomUUID } from "node:crypto";
import { type Db, now, parseJsonColumn } from "./util";

export interface Schedule {
  id: string;
  neta_id: string | null;
  intent: string;
  params: unknown;
  every_sec: number;
  enabled: boolean;
  last_run: string | null;
  next_run: string;
  created: string;
}

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as string,
    neta_id: (row.neta_id as string) ?? null,
    intent: row.intent as string,
    params: parseJsonColumn(row.params, "schedule.params"),
    every_sec: row.every_sec as number,
    enabled: !!row.enabled,
    last_run: (row.last_run as string) ?? null,
    next_run: row.next_run as string,
    created: row.created as string,
  };
}

export class ScheduleRepo {
  constructor(private readonly db: Db) {}

  addSchedule(input: { neta_id?: string | null; intent: string; params?: unknown; every_sec: number }): Schedule {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO schedule (id,neta_id,intent,params,every_sec,enabled,last_run,next_run,created)
         VALUES (@id,@neta_id,@intent,@params,@every_sec,1,NULL,@next,@created)`,
      )
      .run({
        id,
        neta_id: input.neta_id ?? null,
        intent: input.intent,
        params: input.params == null ? null : JSON.stringify(input.params),
        every_sec: input.every_sec,
        next: ts, // next_run=now＝次 tick で初回を即実行（UX：登録したら進み始める）
        created: ts,
      });
    return this.getSchedule(id)!;
  }

  getSchedule(id: string): Schedule | null {
    const row = this.db.prepare(`SELECT * FROM schedule WHERE id=?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToSchedule(row) : null;
  }

  listSchedules(netaId?: string): Schedule[] {
    const rows = (
      netaId
        ? this.db.prepare(`SELECT * FROM schedule WHERE neta_id=? ORDER BY created DESC`).all(netaId)
        : this.db.prepare(`SELECT * FROM schedule ORDER BY created DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToSchedule);
  }

  setScheduleEnabled(id: string, enabled: boolean): boolean {
    return this.db.prepare(`UPDATE schedule SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id).changes > 0;
  }

  deleteSchedule(id: string): boolean {
    return this.db.prepare(`DELETE FROM schedule WHERE id=?`).run(id).changes > 0;
  }
}
