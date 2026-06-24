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
  JobOutcome,
} from "./types";
import { reapResults } from "./reaper";
import { tickSchedules } from "./scheduler";
import { findSimilar } from "./music/similarity";
import { now, parseJsonColumn } from "./repo/util";
import { AssetRepo, type Asset, type SongOverlay } from "./repo/asset-repo";

// repo に移した型を従来の import 元(core)からも引けるよう再公開（呼び出し側 無改修）。
export type { Asset, SongOverlay } from "./repo/asset-repo";

// 複数プロジェクト（design「prj: 名前空間タグ」）：プロジェクト所属は `prj:<名前>` タグで表す。
// 意味タグ(mood/ジャンル)とは別軸＝facets/検索で分離する。
export const PROJECT_TAG_PREFIX = "prj:";
export const isProjectTag = (name: string): boolean => name.startsWith(PROJECT_TAG_PREFIX);

/**
 * 操作コア（docs/design.md #20 ツールカタログ）。
 * これが HTTP API ＝ MCP ツール ＝ 実装すべき操作の集合。
 * 消費者ロジック（reap=生成結果のネタ化）は reaper.ts に分離（design「アーキ是正 決定3」）。
 */
export class Core {
  // 合成ルート（#6）：集約ごとの repo を保持。新コードは core.asset 等の名前空間APIを使える。
  // 既存の フラットAPI(core.addAsset 等) は下で repo へ委譲＝呼び出し側 無改修（回帰ゼロ）。
  readonly asset: AssetRepo;
  // db は同一パッケージの reaper/scheduler から読む（readonly＝外部からは書けない）。
  constructor(readonly db: Database.Database) {
    this.asset = new AssetRepo(db);
  }

  createNeta(input: NetaInput): Neta {
    const id = randomUUID();
    const ts = now();
    // 原子化：neta 行＋タグ＋job_result マーカーを1トランザクションに（部分失敗で「マーカー無しネタ」が
    // 残り次の reap が重複生成する事故を断つ・design「アーキ是正 決定3」）。
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO neta (id, kind, title, content, text, "key", mode, tempo, meter, bars, mood, scope, created, updated)
           VALUES (@id, @kind, @title, @content, @text, @key, @mode, @tempo, @meter, @bars, @mood, @scope, @created, @updated)`,
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
          scope: input.scope ?? "project", // 既定 project（新規キャプチャ/生成は作業ネタ）
          created: ts,
          updated: ts,
        });
      for (const t of input.tags ?? []) this.addTag(id, t);
      if (input.from_job) this.recordJobResult(input.from_job, id);
    })();
    return this.getNeta(id)!;
  }

  /** ネタを複製（既定 project へ・子孫も deep copy）。library を使う＝project にコピー（元は不変）。
   * section/song は子(compose_edge)も再帰コピー。同じ子の使い回し(#54)はメモで1コピー＝関係を保つ。 */
  copyNeta(id: string, scope: "project" | "library" = "project"): Neta | null {
    const memo = new Map<string, string>(); // 元id→コピーid（共有childは1回・循環も安全に止まる）
    const copyRec = (srcId: string): string | null => {
      const cached = memo.get(srcId);
      if (cached) return cached;
      const src = this.getNeta(srcId);
      if (!src) return null;
      const made = this.createNeta({
        kind: src.kind,
        title: src.title,
        content: src.content,
        text: src.text,
        key: src.key,
        mode: src.mode,
        tempo: src.tempo,
        meter: src.meter,
        bars: src.bars,
        mood: src.mood,
        scope,
        tags: src.tags.filter((t) => t !== "取込"), // ライブラリ由来マーカーは引き継がない
      });
      memo.set(srcId, made.id);
      const edges = this.db
        .prepare(`SELECT child_id, position, ord FROM compose_edge WHERE parent_id = ? ORDER BY ord, position`)
        .all(srcId) as { child_id: string; position: number; ord: number }[];
      for (const e of edges) {
        const childNew = copyRec(e.child_id);
        if (childNew) this.placeChild(made.id, childNew, e.position, e.ord);
      }
      return made.id;
    };
    const newId = copyRec(id);
    return newId ? this.getNeta(newId) : null;
  }

  /** ネタの scope を切替（自作を連想元にする＝library へ移す等）。 */
  setScope(id: string, scope: "project" | "library"): Neta | null {
    if (!this.getNeta(id)) return null;
    this.db.prepare(`UPDATE neta SET scope = ?, updated = ? WHERE id = ?`).run(scope, now(), id);
    return this.getNeta(id);
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
   * ジョブとその子ジョブ全体の決着を返す（Chat がディスパッチ後もそのチャットで完了を待てるように）。
   * settled = 自分＋子が全て終端(done/failed)。neta = 自分＋子の job_result から集めた生成ネタ。
   * plan の子（parent_job_id=自分）と、items を reap した自分自身、の両方を1度に拾える。
   */
  jobOutcome(jobId: string): JobOutcome {
    const ids = [jobId];
    const children = this.db
      .prepare(`SELECT id FROM job WHERE parent_job_id = ? ORDER BY created`)
      .all(jobId) as { id: string }[];
    for (const ch of children) ids.push(ch.id);

    const jobs: { id: string; intent: string; status: string }[] = [];
    let failed = 0;
    let pending = 0;
    for (const id of ids) {
      const j = this.getJob(id);
      if (!j) continue;
      jobs.push({ id: j.id, intent: j.intent, status: j.status });
      if (j.status === "failed") failed++;
      else if (j.status !== "done") pending++;
    }
    const neta: Neta[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
      for (const r of this.getJobResults(id)) {
        if (r.neta_id && !seen.has(r.neta_id)) {
          const n = this.getNeta(r.neta_id);
          if (n) (neta.push(n), seen.add(r.neta_id));
        }
      }
    }
    return { settled: pending === 0, failed, jobs, neta };
  }

  /**
   * 生成ジョブの結果をネタ化する（done の gen_* で job_result がまだ無く中身があるもの）。
   * - plan の子（parent_job_id 有り）：即ネタ化（クライアントが受け取らないので）。
   * - 親なし（NetaCard の同期生成）：通常はクライアントが createNeta(from_job) で受け取るので触らない。
   *   ただし一定時間(120s)経っても未受領なら、クライアントが落ちた等とみなし回収（漏れ防止）。
   * これで二重作成のレースを避けつつ「投げて放置→受け取る」の取りこぼしも無くす。
   */
  /** 受け取り（reap）：生成結果のネタ化。消費者ロジックは reaper.ts に分離（Core は委譲のみ）。 */
  reapResults(): number {
    return reapResults(this);
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
    // #97 reap蘇生防止：job_result.neta_id は ON DELETE CASCADE。そのまま消すと job_result 行が
    // 道連れで消え、reap の冪等チェック(NOT EXISTS job_result)が崩れて生成ネタが復活する。
    // 参照を先に NULL にして行を残す＝reap は「回収済み」と見続ける（NULL先消しで cascade も不発）。
    this.db.prepare(`UPDATE job_result SET neta_id = NULL WHERE neta_id = ?`).run(id);
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
    // scope 既定 project（ネタ帳は作業ネタを見る）。library/all は明示。
    if (q.scope !== "all") (where.push(`n.scope = @scope`), (params.scope = q.scope ?? "project"));
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

  /** メロ連想（S4c・spec§6）：scope（既定 library＝連想元）の melody を候補に、多層類似で近い順に。
   * 「このメロ、前のとかぶってない/似てる？」＝重複検出・連想の入口。 */
  similarMelodies(
    notes: { pitch: number; start?: number; dur?: number }[],
    scope: "project" | "library" | "all" = "library",
    top = 5,
    excludeId?: string,
  ): { id?: string; label?: string; similarity: number }[] {
    const mels = this.listNeta({ kind: "melody", scope, limit: 500 });
    const candidates = mels
      .filter((n) => n.id !== excludeId)
      .map((n) => ({
        id: n.id,
        label: n.title ?? undefined,
        notes: ((n.content as { notes?: { pitch: number; start?: number; dur?: number }[] } | null)?.notes ?? []),
      }))
      .filter((c) => c.notes.length > 0);
    return findSimilar(notes, candidates, top, true); // 多層（音程＋リズム＋輪郭）
  }

  // facets は既定で project（ネタ帳=project と一致させる。library 値が混じると UI で0件選択肢が出る）。
  facets(scope: "project" | "library" | "all" = "project"): Facets {
    // 列名は補間するので **allowlist 必須**（将来 facets(userInput) 直呼びでも注入を作らない）。
    // scope 値は文字列補間でなく **bind パラメータ**で渡す（同上）。
    const COLS = new Set(["kind", "mood", "meter", '"key"']);
    const scopeSql = scope === "all" ? "" : " AND scope = @scope";
    const distinct = (col: string): unknown[] => {
      if (!COLS.has(col)) throw new Error(`facets: column not allowed: ${col}`);
      const stmt = this.db.prepare(
        `SELECT DISTINCT ${col} AS v FROM neta WHERE ${col} IS NOT NULL${scopeSql} ORDER BY v`,
      );
      const rows = (scope === "all" ? stmt.all() : stmt.all({ scope })) as { v: unknown }[];
      return rows.map((r) => r.v);
    };
    return {
      kind: distinct("kind") as string[],
      mood: distinct("mood") as string[],
      meter: distinct("meter") as string[],
      key: distinct(`"key"`) as number[],
      // 全タグを意味タグ（tags）と プロジェクトタグ（prj:）に分離。意味タグは prj: を出さない＝汚さない。
      ...(() => {
        const all = (this.db.prepare(`SELECT name FROM tag ORDER BY name`).all() as { name: string }[]).map(
          (r) => r.name,
        );
        return {
          tags: all.filter((n) => !isProjectTag(n)),
          projects: all.filter(isProjectTag).map((n) => n.slice(PROJECT_TAG_PREFIX.length)),
        };
      })(),
    };
  }

  // 合成の子孫 id 集合（compose_edge を BFS）。循環判定用。
  private descendantIds(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const rows = this.db
        .prepare(`SELECT child_id FROM compose_edge WHERE parent_id = ?`)
        .all(cur) as { child_id: string }[];
      for (const r of rows) if (!out.has(r.child_id)) (out.add(r.child_id), stack.push(r.child_id));
    }
    return out;
  }

  placeChild(parentId: string, childId: string, position = 0, ord = 0): void {
    // section に section を入れる等のネストを許すが、**循環は禁止**（自分自身／子孫を親に置けない）。
    if (childId === parentId) throw new Error("自分自身は子にできない");
    if (this.descendantIds(childId).has(parentId)) throw new Error("循環になる配置はできない");
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

  // #45/#85 S3: 待機中ジョブへの回答。回答を載せた継続ジョブを積み、元ジョブを done にする。
  // 元 params（frame/count/condition）を必ず引き継ぐ（#85 指摘6：枠を消さない）。
  // 構造化回答（フォーム＝Record）は frame へ畳む（#85 指摘5）。文字列回答は instruction へ。
  answerJob(jobId: string, answer: string | Record<string, unknown>): Job | null {
    const orig = this.getJob(jobId);
    if (!orig) return null;
    const baseParams: Record<string, unknown> =
      orig.params && typeof orig.params === "object"
        ? { ...(orig.params as Record<string, unknown>) }
        : {};
    let instruction = orig.instruction ?? "";
    if (typeof answer === "string") {
      instruction = `${instruction}\n[回答] ${answer}`.trim();
    } else {
      // フォーム回答を畳む。count/kinds/structure/condition は params トップレベル（worker が
      // そこを読む）、それ以外（meter/key/tempo/bars/mood…）は frame へ上書きマージ。
      const topLevel = new Set(["count", "kinds", "structure", "condition", "target"]);
      const prevFrame =
        baseParams.frame && typeof baseParams.frame === "object"
          ? (baseParams.frame as Record<string, unknown>)
          : {};
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
    this.db
      .prepare(`UPDATE job SET parent_job_id=@p, updated=@u WHERE id=@id`)
      .run({ id: cont.id, p: jobId, u: now() });
    this.db
      .prepare(`UPDATE job SET status='done', updated=@u WHERE id=@id`)
      .run({ id: jobId, u: now() });
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
      content: parseJsonColumn(row.content, "neta.content"),
      text: (row.text as string) ?? null,
      key: (row.key as number) ?? null,
      mode: (row.mode as string) ?? null,
      tempo: (row.tempo as number) ?? null,
      meter: (row.meter as string) ?? null,
      bars: (row.bars as number) ?? null,
      mood: (row.mood as string) ?? null,
      scope: (row.scope as "project" | "library") ?? "project",
      tags,
      created: row.created as string,
      updated: row.updated as string,
    };
  }

  // --- asset（#77 SoundFont等のファイル資産。実体は data/assets/、ここはメタ）---
  // --- asset / song / neta_asset：AssetRepo へ委譲（#6。新コードは core.asset を直接使ってよい）---
  addAsset(input: Parameters<AssetRepo["addAsset"]>[0]): Asset {
    return this.asset.addAsset(input);
  }
  listAssets(kind?: string): Asset[] {
    return this.asset.listAssets(kind);
  }
  getAsset(id: string): Asset | null {
    return this.asset.getAsset(id);
  }
  deleteAsset(id: string): boolean {
    return this.asset.deleteAsset(id);
  }
  updateSong(netaId: string, patch: { stage?: string | null; next_action?: string | null }): SongOverlay | null {
    return this.asset.updateSong(netaId, patch);
  }
  getSong(netaId: string): SongOverlay | null {
    return this.asset.getSong(netaId);
  }
  linkAsset(netaId: string, assetId: string, role = "attachment"): boolean {
    return this.asset.linkAsset(netaId, assetId, role);
  }
  unlinkAsset(netaId: string, assetId: string, role?: string): boolean {
    return this.asset.unlinkAsset(netaId, assetId, role);
  }
  getNetaAssets(netaId: string): (Asset & { role: string })[] {
    return this.asset.getNetaAssets(netaId);
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
  /** 期日スケジュールから継続調査ジョブを enqueue。駆動ロジックは scheduler.ts に分離（委譲のみ）。 */
  tickSchedules(): number {
    return tickSchedules(this);
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

  // フリーChatの会話セッション一覧（thread='global' か 'chat:*'）。最終時刻・件数・冒頭プレビュー付き。
  // ネタ別スレッド(thread=neta id)は対象外（ネタから辿るため）。
  listChatThreads(): { thread: string; last: string; count: number; preview: string | null }[] {
    const rows = this.db
      .prepare(
        `SELECT m.thread AS thread, MAX(m.created) AS last, COUNT(*) AS count,
           (SELECT x.text FROM chat_message x
              WHERE x.thread = m.thread AND x.role = 'user' AND x.text IS NOT NULL
              ORDER BY x.created LIMIT 1) AS preview
         FROM chat_message m
         WHERE m.thread = 'global' OR m.thread LIKE 'chat:%'
         GROUP BY m.thread ORDER BY last DESC`,
      )
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      thread: r.thread as string,
      last: r.last as string,
      count: Number(r.count),
      preview: (r.preview as string) ?? null,
    }));
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
    data: parseJsonColumn(row.data, "chat.data"),
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
    params: parseJsonColumn(row.params, "schedule.params"),
    every_sec: row.every_sec as number,
    enabled: !!row.enabled,
    last_run: (row.last_run as string) ?? null,
    next_run: row.next_run as string,
    created: row.created as string,
  };
}

