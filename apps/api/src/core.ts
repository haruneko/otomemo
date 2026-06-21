import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  Neta,
  NetaInput,
  NetaPatch,
  ListQuery,
  Facets,
  CompositionNode,
  Relation,
  Job,
  JobInput,
  JobQuery,
  JobResult,
} from "./types";

const now = (): string => new Date().toISOString();

/**
 * 操作コア（docs/design.md #20 ツールカタログ）。
 * これが HTTP API ＝ MCP ツール ＝ 実装すべき操作の集合。
 */
function hasMusic(content: unknown): boolean {
  const c = content as {
    notes?: unknown[];
    chords?: unknown[];
    rhythm?: { lanes?: { hits?: unknown[] }[] };
  } | null;
  if (!c) return false;
  if (Array.isArray(c.notes)) return c.notes.length > 0;
  if (Array.isArray(c.chords)) return c.chords.length > 0;
  if (c.rhythm?.lanes) return c.rhythm.lanes.some((l) => (l.hits?.length ?? 0) > 0);
  return false;
}

export class Core {
  constructor(private db: Database.Database) {}

  createNeta(input: NetaInput): Neta {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO neta (id, kind, title, content, text, "key", mode, tempo, meter, bars, mood, created, updated)
         VALUES (@id, @kind, @title, @content, @text, @key, @mode, @tempo, @meter, @bars, @mood, @created, @updated)`,
      )
      .run({
        id,
        kind: input.kind,
        title: input.title ?? null,
        content: input.content == null ? null : JSON.stringify(input.content),
        text: input.text ?? null,
        key: input.key ?? null,
        mode: input.mode ?? null,
        tempo: input.tempo ?? null,
        meter: input.meter ?? null,
        bars: input.bars ?? null,
        mood: input.mood ?? null,
        created: ts,
        updated: ts,
      });
    for (const t of input.tags ?? []) this.addTag(id, t);
    if (input.from_job) this.recordJobResult(input.from_job, id);
    return this.getNeta(id)!;
  }

  /** ジョブの結果として作られた neta を job_result に記録し、ジョブの対象へ relation を張る（design #16/原則3）。 */
  private recordJobResult(jobId: string, netaId: string): void {
    const ord =
      (this.db.prepare(`SELECT COUNT(*) c FROM job_result WHERE job_id = ?`).get(jobId) as {
        c: number;
      }).c;
    this.db
      .prepare(`INSERT INTO job_result (job_id, neta_id, ord, role) VALUES (?, ?, ?, 'result')`)
      .run(jobId, netaId, ord);
    const job = this.db.prepare(`SELECT target_neta_id FROM job WHERE id = ?`).get(jobId) as
      | { target_neta_id: string | null }
      | undefined;
    if (job?.target_neta_id) this.link(job.target_neta_id, netaId, "result");
  }

  getJobResults(jobId: string): JobResult[] {
    return this.db
      .prepare(`SELECT neta_id, role FROM job_result WHERE job_id = ? ORDER BY ord`)
      .all(jobId) as JobResult[];
  }

  /**
   * 生成ジョブの結果をネタ化する（done の gen_* で job_result がまだ無く中身があるもの）。
   * - plan の子（parent_job_id 有り）：即ネタ化（クライアントが受け取らないので）。
   * - 親なし（NetaCard の同期生成）：通常はクライアントが createNeta(from_job) で受け取るので触らない。
   *   ただし一定時間(120s)経っても未受領なら、クライアントが落ちた等とみなし回収（漏れ防止）。
   * これで二重作成のレースを避けつつ「投げて放置→受け取る」の取りこぼしも無くす。
   */
  reapResults(): number {
    const kindOf: Record<string, string> = {
      gen_melody: "melody",
      gen_chord: "chord_progression",
      gen_rhythm: "rhythm",
    };
    // #67 生成ネタの表示名：指示文があればそれ、無ければ種類の日本語ラベル（生kindを出さない）。
    const labelOf: Record<string, string> = {
      gen_melody: "メロ案",
      gen_chord: "コード案",
      gen_rhythm: "リズム案",
    };
    const genTitle = (intent: string, instruction: string | null): string => {
      const first = (instruction ?? "").trim().split(/\r?\n/)[0]?.trim() ?? "";
      return first ? first.slice(0, 24) : (labelOf[intent] ?? "案");
    };
    const staleBefore = new Date(Date.now() - 120_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT j.id, j.intent, j.instruction, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent IN ('gen_melody','gen_chord','gen_rhythm')
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all(staleBefore) as {
      id: string;
      intent: string;
      instruction: string | null;
      result: string | null;
    }[];
    let n = 0;
    for (const r of rows) {
      let content: unknown;
      try {
        content = (JSON.parse(r.result ?? "{}") as { content?: unknown }).content;
      } catch {
        continue;
      }
      if (!hasMusic(content)) continue;
      this.createNeta({
        kind: kindOf[r.intent]!,
        title: genTitle(r.intent, r.instruction),
        content,
        from_job: r.id,
      });
      n += 1;
    }

    // #9 参考曲エージェント：research の結果（references 非空）を reference ネタとして回収。
    // gen_* と同じガード（parent有り＝plan子は即時／単独は120s未受領で回収）で二重作成を防ぐ。
    const refRows = this.db
      .prepare(
        `SELECT j.id, j.result_summary AS result
         FROM job j
         WHERE j.status='done' AND j.intent='research'
           AND (j.parent_job_id IS NOT NULL OR j.updated < ?)
           AND NOT EXISTS (SELECT 1 FROM job_result r WHERE r.job_id = j.id)`,
      )
      .all(staleBefore) as { id: string; result: string | null }[];
    for (const r of refRows) {
      let parsed: { summary?: string; references?: unknown[] };
      try {
        parsed = JSON.parse(r.result ?? "{}") as { summary?: string; references?: unknown[] };
      } catch {
        continue;
      }
      if (!Array.isArray(parsed.references) || parsed.references.length === 0) continue;
      this.createNeta({
        kind: "reference",
        title: "参考曲",
        text: parsed.summary ?? "",
        content: { summary: parsed.summary ?? "", references: parsed.references },
        from_job: r.id,
      });
      n += 1;
    }
    return n;
  }

  getNeta(id: string): Neta | null {
    const row = this.db.prepare(`SELECT * FROM neta WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToNeta(row) : null;
  }

  updateNeta(id: string, patch: NetaPatch): Neta | null {
    if (!this.getNeta(id)) return null;
    const sets: string[] = [];
    const params: Record<string, unknown> = { id, updated: now() };
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = @${col.replace(/"/g, "")}`);
      params[col.replace(/"/g, "")] = val;
    };
    if (patch.kind !== undefined) set("kind", patch.kind);
    if (patch.title !== undefined) set("title", patch.title);
    if (patch.content !== undefined)
      set("content", patch.content == null ? null : JSON.stringify(patch.content));
    if (patch.text !== undefined) set("text", patch.text);
    if (patch.key !== undefined) set(`"key"`, patch.key);
    if (patch.mode !== undefined) set("mode", patch.mode);
    if (patch.tempo !== undefined) set("tempo", patch.tempo);
    if (patch.meter !== undefined) set("meter", patch.meter);
    if (patch.bars !== undefined) set("bars", patch.bars);
    if (patch.mood !== undefined) set("mood", patch.mood);
    sets.push("updated = @updated");
    this.db.prepare(`UPDATE neta SET ${sets.join(", ")} WHERE id = @id`).run(params);
    if (patch.tags !== undefined) {
      this.db.prepare(`DELETE FROM neta_tag WHERE neta_id = ?`).run(id);
      for (const t of patch.tags) this.addTag(id, t);
    }
    return this.getNeta(id);
  }

  deleteNeta(id: string): boolean {
    return this.db.prepare(`DELETE FROM neta WHERE id = ?`).run(id).changes > 0;
  }

  addTag(netaId: string, name: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO tag (name) VALUES (?)`).run(name);
    const tag = this.db.prepare(`SELECT id FROM tag WHERE name = ?`).get(name) as {
      id: number;
    };
    this.db
      .prepare(`INSERT OR IGNORE INTO neta_tag (neta_id, tag_id) VALUES (?, ?)`)
      .run(netaId, tag.id);
  }

  removeTag(netaId: string, name: string): void {
    this.db
      .prepare(
        `DELETE FROM neta_tag WHERE neta_id = ? AND tag_id = (SELECT id FROM tag WHERE name = ?)`,
      )
      .run(netaId, name);
  }

  listNeta(q: ListQuery = {}): Neta[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.kind) (where.push(`n.kind = @kind`), (params.kind = q.kind));
    if (q.mode) (where.push(`n.mode = @mode`), (params.mode = q.mode));
    if (q.meter) (where.push(`n.meter = @meter`), (params.meter = q.meter));
    if (q.mood) (where.push(`n.mood = @mood`), (params.mood = q.mood));
    if (q.key !== undefined) (where.push(`n."key" = @key`), (params.key = q.key));
    if (q.q) (where.push(`(n.title LIKE @like OR n.text LIKE @like)`), (params.like = `%${q.q}%`));
    if (q.tags?.length) {
      const placeholders = q.tags.map((_, i) => `@tag${i}`).join(", ");
      where.push(
        `(SELECT COUNT(*) FROM neta_tag nt JOIN tag t ON t.id = nt.tag_id
          WHERE nt.neta_id = n.id AND t.name IN (${placeholders})) = @tagcount`,
      );
      q.tags.forEach((t, i) => (params[`tag${i}`] = t));
      params.tagcount = q.tags.length;
    }
    params.limit = q.limit ?? 100;
    params.offset = q.offset ?? 0;
    const sql = `SELECT n.* FROM neta n ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY n.updated DESC, n.id LIMIT @limit OFFSET @offset`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map((r) =>
      this.rowToNeta(r),
    );
  }

  facets(): Facets {
    const distinct = (col: string): unknown[] =>
      (
        this.db
          .prepare(`SELECT DISTINCT ${col} AS v FROM neta WHERE ${col} IS NOT NULL ORDER BY v`)
          .all() as { v: unknown }[]
      ).map((r) => r.v);
    return {
      kind: distinct("kind") as string[],
      mood: distinct("mood") as string[],
      meter: distinct("meter") as string[],
      key: distinct(`"key"`) as number[],
      tags: (this.db.prepare(`SELECT name FROM tag ORDER BY name`).all() as { name: string }[]).map(
        (r) => r.name,
      ),
    };
  }

  placeChild(parentId: string, childId: string, position = 0, ord = 0): void {
    // #54: 同じ子を別位置に複数置ける。同位置への再配置は冪等（ord を更新）。
    this.db
      .prepare(
        `INSERT INTO compose_edge (parent_id, child_id, position, ord) VALUES (?, ?, ?, ?)
         ON CONFLICT(parent_id, child_id, position) DO UPDATE SET ord = excluded.ord`,
      )
      .run(parentId, childId, position, ord);
  }

  // position 指定で1インスタンスのみ解除。未指定なら (parent,child) の全インスタンス。
  removeChild(parentId: string, childId: string, position?: number): void {
    if (position === undefined) {
      this.db
        .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ?`)
        .run(parentId, childId);
    } else {
      this.db
        .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ? AND position = ?`)
        .run(parentId, childId, position);
    }
  }

  /** 合成ツリーを再帰取得（DAGなので訪問済みガードでサイクル防止）。 */
  getComposition(id: string, seen = new Set<string>()): CompositionNode | null {
    const neta = this.getNeta(id);
    if (!neta) return null;
    if (seen.has(id)) return { neta, children: [] };
    seen.add(id);
    const rows = this.db
      .prepare(
        `SELECT child_id, position, ord FROM compose_edge WHERE parent_id = ? ORDER BY ord, position`,
      )
      .all(id) as { child_id: string; position: number; ord: number }[];
    const children = rows
      .map((r) => ({
        position: r.position,
        ord: r.ord,
        node: this.getComposition(r.child_id, seen),
      }))
      .filter((c): c is { position: number; ord: number; node: CompositionNode } => c.node !== null);
    return { neta, children };
  }

  link(fromId: string, toId: string, type = "related"): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO relation_edge (from_id, to_id, type) VALUES (?, ?, ?)`)
      .run(fromId, toId, type);
  }

  unlink(fromId: string, toId: string, type = "related"): void {
    this.db
      .prepare(`DELETE FROM relation_edge WHERE from_id = ? AND to_id = ? AND type = ?`)
      .run(fromId, toId, type);
  }

  getRelations(id: string): Relation[] {
    return this.db
      .prepare(`SELECT to_id AS "to", type FROM relation_edge WHERE from_id = ? ORDER BY type, to_id`)
      .all(id) as Relation[];
  }

  // --- ジョブ（投げて→進めて→受け取る。生産側）---

  enqueueJob(input: JobInput): Job {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO job (id, target_neta_id, level, intent, instruction, params, status, priority, notify_level, created, updated)
         VALUES (@id, @target, @level, @intent, @instruction, @params, 'queued', @priority, @notify, @created, @updated)`,
      )
      .run({
        id,
        target: input.target_neta_id ?? null,
        level: input.level ?? "atomic",
        intent: input.intent,
        instruction: input.instruction ?? null,
        params: input.params == null ? null : JSON.stringify(input.params),
        priority: input.priority ?? 0,
        notify: input.notify_level ?? null,
        created: ts,
        updated: ts,
      });
    return this.getJob(id)!;
  }

  getJob(id: string): Job | null {
    const row = this.db.prepare(`SELECT * FROM job WHERE id = ?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToJob(row) : null;
  }

  // #45: ジョブが人に質問して待つ（status=waiting＋question）。
  askQuestion(jobId: string, question: string): Job | null {
    this.db
      .prepare(`UPDATE job SET status='waiting', question=@q, updated=@u WHERE id=@id`)
      .run({ id: jobId, q: question, u: now() });
    return this.getJob(jobId);
  }

  // #45: 待機中ジョブへの回答。回答を載せた継続ジョブを積み、元ジョブを done にする。
  answerJob(jobId: string, answer: string): Job | null {
    const orig = this.getJob(jobId);
    if (!orig) return null;
    const cont = this.enqueueJob({
      intent: orig.intent,
      target_neta_id: orig.target_neta_id ?? undefined,
      instruction: `${orig.instruction ?? ""}\n[回答] ${answer}`.trim(),
      notify_level: orig.notify_level ?? undefined,
    });
    this.db
      .prepare(`UPDATE job SET parent_job_id=@p, updated=@u WHERE id=@id`)
      .run({ id: cont.id, p: jobId, u: now() });
    this.db
      .prepare(`UPDATE job SET status='done', updated=@u WHERE id=@id`)
      .run({ id: jobId, u: now() });
    return this.getJob(cont.id);
  }

  listJobs(q: JobQuery = {}): Job[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.status) (where.push(`status = @status`), (params.status = q.status));
    if (q.target) (where.push(`target_neta_id = @target`), (params.target = q.target));
    params.limit = q.limit ?? 100;
    const sql = `SELECT * FROM job ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY created DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map((r) =>
      this.rowToJob(r),
    );
  }

  private rowToJob(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      target_neta_id: (row.target_neta_id as string) ?? null,
      level: row.level as string,
      intent: row.intent as string,
      instruction: (row.instruction as string) ?? null,
      params: row.params == null ? null : JSON.parse(row.params as string),
      status: row.status as string,
      priority: row.priority as number,
      progress: (row.progress as string) ?? null,
      notify_level: (row.notify_level as string) ?? null,
      parent_job_id: (row.parent_job_id as string) ?? null,
      question: (row.question as string) ?? null,
      result: row.result_summary == null ? null : JSON.parse(row.result_summary as string),
      error: (row.error as string) ?? null,
      created: row.created as string,
      updated: row.updated as string,
    };
  }

  private rowToNeta(row: Record<string, unknown>): Neta {
    const tags = (
      this.db
        .prepare(
          `SELECT t.name FROM tag t JOIN neta_tag nt ON nt.tag_id = t.id WHERE nt.neta_id = ? ORDER BY t.name`,
        )
        .all(row.id) as { name: string }[]
    ).map((r) => r.name);
    return {
      id: row.id as string,
      kind: row.kind as string,
      title: (row.title as string) ?? null,
      content: row.content == null ? null : JSON.parse(row.content as string),
      text: (row.text as string) ?? null,
      key: (row.key as number) ?? null,
      mode: (row.mode as string) ?? null,
      tempo: (row.tempo as number) ?? null,
      meter: (row.meter as string) ?? null,
      bars: (row.bars as number) ?? null,
      mood: (row.mood as string) ?? null,
      tags,
      created: row.created as string,
      updated: row.updated as string,
    };
  }

  // --- asset（#77 SoundFont等のファイル資産。実体は data/assets/、ここはメタ）---
  addAsset(input: {
    kind: string;
    name?: string | null;
    path: string;
    size?: number | null;
    mime?: string | null;
    meta?: unknown;
  }): Asset {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO asset (id,kind,name,path,size,mime,meta,created)
         VALUES (@id,@kind,@name,@path,@size,@mime,@meta,@created)`,
      )
      .run({
        id,
        kind: input.kind,
        name: input.name ?? null,
        path: input.path,
        size: input.size ?? null,
        mime: input.mime ?? null,
        meta: input.meta == null ? null : JSON.stringify(input.meta),
        created: now(),
      });
    return this.getAsset(id)!;
  }

  listAssets(kind?: string): Asset[] {
    const rows = (
      kind
        ? this.db.prepare(`SELECT * FROM asset WHERE kind=? ORDER BY created DESC`).all(kind)
        : this.db.prepare(`SELECT * FROM asset ORDER BY created DESC`).all()
    ) as Record<string, unknown>[];
    return rows.map(rowToAsset);
  }

  getAsset(id: string): Asset | null {
    const row = this.db.prepare(`SELECT * FROM asset WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToAsset(row) : null;
  }

  deleteAsset(id: string): boolean {
    return this.db.prepare(`DELETE FROM asset WHERE id=?`).run(id).changes > 0;
  }

  // --- schedule（#80 proactive: 見てない間に継続研究/収集を進める）---
  addSchedule(input: {
    neta_id?: string | null;
    intent: string;
    params?: unknown;
    every_sec: number;
  }): Schedule {
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
    const row = this.db.prepare(`SELECT * FROM schedule WHERE id=?`).get(id) as
      | Record<string, unknown>
      | undefined;
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
    return (
      this.db.prepare(`UPDATE schedule SET enabled=? WHERE id=?`).run(enabled ? 1 : 0, id).changes > 0
    );
  }

  deleteSchedule(id: string): boolean {
    return this.db.prepare(`DELETE FROM schedule WHERE id=?`).run(id).changes > 0;
  }

  // 期日が来た schedule に research/collect ジョブを積む（main の reap interval から呼ぶ）。
  // spam防止：同 schedule の未消化(queued/running)ジョブがあるものは飛ばす。
  tickSchedules(): number {
    const ts = now();
    const due = this.db
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
      const sc = rowToSchedule(s);
      const neta = sc.neta_id ? this.getNeta(sc.neta_id) : null;
      const theme = neta ? (neta.title ?? neta.text ?? "") : "";
      this.enqueueJob({
        intent: sc.intent,
        target_neta_id: sc.neta_id ?? undefined,
        instruction: theme || undefined,
        params: { ...(sc.params as Record<string, unknown> | null), schedule_id: sc.id },
        notify_level: "quiet",
      });
      const next = new Date(Date.now() + sc.every_sec * 1000).toISOString();
      this.db.prepare(`UPDATE schedule SET last_run=?, next_run=? WHERE id=?`).run(ts, next, sc.id);
      n += 1;
    }
    return n;
  }

  // --- chat（#70 Chat履歴の永続化。thread=対象neta id or 'global'）---
  addChatMessage(input: {
    thread: string;
    role: string;
    kind?: string | null;
    text?: string | null;
    data?: unknown;
  }): ChatMessage {
    const id = randomUUID();
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO chat_message (id, thread, role, kind, text, data, created)
         VALUES (@id, @thread, @role, @kind, @text, @data, @created)`,
      )
      .run({
        id,
        thread: input.thread,
        role: input.role,
        kind: input.kind ?? null,
        text: input.text ?? null,
        data: input.data == null ? null : JSON.stringify(input.data),
        created: ts,
      });
    return rowToChatMessage(
      this.db.prepare(`SELECT * FROM chat_message WHERE id = ?`).get(id) as Record<string, unknown>,
    );
  }

  listChatMessages(thread: string, limit = 200): ChatMessage[] {
    const rows = this.db
      .prepare(`SELECT * FROM chat_message WHERE thread = ? ORDER BY created, rowid LIMIT ?`)
      .all(thread, limit) as Record<string, unknown>[];
    return rows.map(rowToChatMessage);
  }

  clearChatThread(thread: string): void {
    this.db.prepare(`DELETE FROM chat_message WHERE thread = ?`).run(thread);
  }
}

export interface ChatMessage {
  id: string;
  thread: string;
  role: string;
  kind: string | null;
  text: string | null;
  data: unknown;
  created: string;
}

function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    thread: row.thread as string,
    role: row.role as string,
    kind: (row.kind as string) ?? null,
    text: (row.text as string) ?? null,
    data: row.data == null ? null : JSON.parse(row.data as string),
    created: row.created as string,
  };
}

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
    params: row.params == null ? null : JSON.parse(row.params as string),
    every_sec: row.every_sec as number,
    enabled: !!row.enabled,
    last_run: (row.last_run as string) ?? null,
    next_run: row.next_run as string,
    created: row.created as string,
  };
}

export interface Asset {
  id: string;
  kind: string;
  name: string | null;
  path: string;
  size: number | null;
  mime: string | null;
  meta: unknown;
  created: string;
}

function rowToAsset(row: Record<string, unknown>): Asset {
  return {
    id: row.id as string,
    kind: row.kind as string,
    name: (row.name as string) ?? null,
    path: row.path as string,
    size: (row.size as number) ?? null,
    mime: (row.mime as string) ?? null,
    meta: row.meta == null ? null : JSON.parse(row.meta as string),
    created: row.created as string,
  };
}
