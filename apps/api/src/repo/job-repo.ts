// ジョブリポジトリ（#6）：job / job_result を所有（投げる→進める→受け取るの生産側）。
// neta を跨ぐ jobOutcome / reapResults は横断サービス＝Core 側に残す（ここは job 自己完結のみ）。
import { randomUUID } from "node:crypto";
import type { Job, JobInput, JobQuery, JobResult } from "../types";
import { type Db, now, parseJsonColumn } from "./util";

export class JobRepo {
  constructor(private readonly db: Db) {}

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
    const row = this.db.prepare(`SELECT * FROM job WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? rowToJob(row) : null;
  }

  getJobResults(jobId: string): JobResult[] {
    return this.db
      .prepare(`SELECT neta_id, role FROM job_result WHERE job_id = ? ORDER BY ord`)
      .all(jobId) as JobResult[];
  }

  // #45: ジョブが人に質問して待つ（status=waiting＋question）。
  askQuestion(jobId: string, question: string): Job | null {
    this.db
      .prepare(`UPDATE job SET status='waiting', question=@q, updated=@u WHERE id=@id`)
      .run({ id: jobId, q: question, u: now() });
    return this.getJob(jobId);
  }

  // #45/#85 S3: 待機中ジョブへの回答。回答を載せた継続ジョブを積み、元ジョブを done にする。
  // 元 params（frame/count/condition）を必ず引き継ぐ（#85 指摘6：枠を消さない）。
  // 構造化回答（フォーム＝Record）は frame へ畳む（#85 指摘5）。文字列回答は instruction へ。
  answerJob(jobId: string, answer: string | Record<string, unknown>): Job | null {
    const orig = this.getJob(jobId);
    if (!orig) return null;
    const baseParams: Record<string, unknown> =
      orig.params && typeof orig.params === "object" ? { ...(orig.params as Record<string, unknown>) } : {};
    let instruction = orig.instruction ?? "";
    if (typeof answer === "string") {
      instruction = `${instruction}\n[回答] ${answer}`.trim();
    } else {
      // フォーム回答を畳む。count/kinds/structure/condition は params トップレベル（worker が
      // そこを読む）、それ以外（meter/key/tempo/bars/mood…）は frame へ上書きマージ。
      const topLevel = new Set(["count", "kinds", "structure", "condition", "target"]);
      const prevFrame =
        baseParams.frame && typeof baseParams.frame === "object" ? (baseParams.frame as Record<string, unknown>) : {};
      const framePart: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(answer)) {
        if (topLevel.has(k)) baseParams[k] = v;
        else framePart[k] = v;
      }
      baseParams.frame = { ...prevFrame, ...framePart };
    }
    const cont = this.enqueueJob({
      intent: orig.intent,
      target_neta_id: orig.target_neta_id ?? undefined,
      instruction: instruction || undefined,
      params: Object.keys(baseParams).length ? baseParams : undefined,
      notify_level: orig.notify_level ?? undefined,
    });
    this.db.prepare(`UPDATE job SET parent_job_id=@p, updated=@u WHERE id=@id`).run({ id: cont.id, p: jobId, u: now() });
    this.db.prepare(`UPDATE job SET status='done', updated=@u WHERE id=@id`).run({ id: jobId, u: now() });
    return this.getJob(cont.id);
  }

  // 運用ヘルス（/health 用）：滞留(queued)・実行中・直近失敗・最古queuedの待ち秒。可観測性の最小限。
  healthStats(): { queued: number; running: number; failed: number; oldestQueuedAgeSec: number | null } {
    const count = (sql: string): number => (this.db.prepare(sql).get() as { c: number }).c;
    const queued = count(`SELECT COUNT(*) c FROM job WHERE status='queued'`);
    const running = count(`SELECT COUNT(*) c FROM job WHERE status='running'`);
    const failed = count(`SELECT COUNT(*) c FROM job WHERE status='failed'`);
    const oldest = this.db
      .prepare(`SELECT created FROM job WHERE status='queued' ORDER BY created ASC LIMIT 1`)
      .get() as { created: string } | undefined;
    const oldestQueuedAgeSec = oldest
      ? Math.max(0, Math.round((Date.now() - new Date(oldest.created).getTime()) / 1000))
      : null;
    return { queued, running, failed, oldestQueuedAgeSec };
  }

  listJobs(q: JobQuery = {}): Job[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (q.status) (where.push(`status = @status`), (params.status = q.status));
    if (q.target) (where.push(`target_neta_id = @target`), (params.target = q.target));
    params.limit = q.limit ?? 100;
    const sql = `SELECT * FROM job ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map(rowToJob);
  }

  // プロジェクト（prj: タグ）配下ネタを対象にしたジョブ＝ワークスペースの「投げて受け取る」可視化用。
  listForProjectTag(projectTag: string, limit = 50): Job[] {
    const rows = this.db
      .prepare(
        `SELECT j.* FROM job j
         JOIN neta_tag nt ON nt.neta_id = j.target_neta_id
         JOIN tag t       ON t.id = nt.tag_id AND t.name = @tag
         ORDER BY j.created DESC LIMIT @limit`,
      )
      .all({ tag: projectTag, limit }) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    target_neta_id: (row.target_neta_id as string) ?? null,
    level: row.level as string,
    intent: row.intent as string,
    instruction: (row.instruction as string) ?? null,
    params: parseJsonColumn(row.params, "job.params"),
    status: row.status as string,
    priority: row.priority as number,
    progress: (row.progress as string) ?? null,
    notify_level: (row.notify_level as string) ?? null,
    parent_job_id: (row.parent_job_id as string) ?? null,
    question: (row.question as string) ?? null,
    result: parseJsonColumn(row.result_summary, "job.result_summary"),
    error: (row.error as string) ?? null,
    created: row.created as string,
    updated: row.updated as string,
  };
}
