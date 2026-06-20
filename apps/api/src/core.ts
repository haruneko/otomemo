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
    this.db
      .prepare(
        `INSERT INTO compose_edge (parent_id, child_id, position, ord) VALUES (?, ?, ?, ?)
         ON CONFLICT(parent_id, child_id) DO UPDATE SET position = excluded.position, ord = excluded.ord`,
      )
      .run(parentId, childId, position, ord);
  }

  removeChild(parentId: string, childId: string): void {
    this.db
      .prepare(`DELETE FROM compose_edge WHERE parent_id = ? AND child_id = ?`)
      .run(parentId, childId);
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
}
