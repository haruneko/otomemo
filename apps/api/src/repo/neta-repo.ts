// ネタリポジトリ（#6・中心集約）：neta / neta_tag / tag を所有。データアクセスに専念。
// createNeta(原子化＋job_resultマーカー) と copyNeta(compose 再帰) は集約跨ぎの orchestration＝
// Core 側に残し、ここの insertRow / addTag / getNeta 等の primitive を使って組み立てる。
import type { Neta, NetaInput, NetaPatch, ListQuery, Facets } from "../types";
import { findSimilar } from "../music/similarity";
import { type Db, now, parseJsonColumn } from "./util";

// param揺れ対策（#86）：常駐LLMが content を「JSON文字列」で渡す事故の根治。
// オブジェクト/配列にparseできる文字列だけ実体化（生テキスト＝歌詞等は壊さない）。
// これが無いと JSON.stringify(文字列) で二重エンコードされ、読み戻しが文字列のまま＝web が content.notes 等を読めず「保存できない」。
export function coerceContent(c: unknown): unknown {
  if (typeof c !== "string") return c;
  const s = c.trim();
  if (!(s.startsWith("{") || s.startsWith("["))) return c; // 明らかなJSONオブジェクト/配列のみ対象
  try {
    const v = JSON.parse(s);
    return v !== null && typeof v === "object" ? v : c;
  } catch {
    return c;
  }
}

// 複数プロジェクト（design「prj: 名前空間タグ」）：プロジェクト所属は `prj:<名前>` タグで表す。
export const PROJECT_TAG_PREFIX = "prj:";
export const isProjectTag = (name: string): boolean => name.startsWith(PROJECT_TAG_PREFIX);

export class NetaRepo {
  constructor(private readonly db: Db) {}

  // neta 行の生 INSERT（トランザクション/タグ/job_result マーカーは呼び出し側=Core が原子化する）。
  insertRow(id: string, input: NetaInput, ts: string): void {
    this.db
      .prepare(
        `INSERT INTO neta (id, kind, title, content, text, "key", mode, tempo, meter, bars, mood, scope, created, updated)
         VALUES (@id, @kind, @title, @content, @text, @key, @mode, @tempo, @meter, @bars, @mood, @scope, @created, @updated)`,
      )
      .run({
        id,
        kind: input.kind,
        title: input.title ?? null,
        content: input.content == null ? null : JSON.stringify(coerceContent(input.content)),
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
  }

  getNeta(id: string): Neta | null {
    const row = this.db.prepare(`SELECT * FROM neta WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToNeta(row) : null;
  }

  setScope(id: string, scope: "project" | "library"): Neta | null {
    if (!this.getNeta(id)) return null;
    this.db.prepare(`UPDATE neta SET scope = ?, updated = ? WHERE id = ?`).run(scope, now(), id);
    return this.getNeta(id);
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
    if (patch.content !== undefined) set("content", patch.content == null ? null : JSON.stringify(coerceContent(patch.content)));
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
    const tag = this.db.prepare(`SELECT id FROM tag WHERE name = ?`).get(name) as { id: number };
    this.db.prepare(`INSERT OR IGNORE INTO neta_tag (neta_id, tag_id) VALUES (?, ?)`).run(netaId, tag.id);
  }

  removeTag(netaId: string, name: string): void {
    this.db
      .prepare(`DELETE FROM neta_tag WHERE neta_id = ? AND tag_id = (SELECT id FROM tag WHERE name = ?)`)
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
    // 未仕分け＝どの器(prj:*)にも属さない＝prj: で始まるタグを1つも持たない。
    if (q.unassigned) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM neta_tag nt JOIN tag t ON t.id = nt.tag_id
          WHERE nt.neta_id = n.id AND t.name LIKE 'prj:%')`,
      );
    }
    params.limit = q.limit ?? 100;
    params.offset = q.offset ?? 0;
    // 手動並べ替え：orderProject 指定時は neta_order を LEFT JOIN。position のある行を先に position 昇順、
    // 未設定(NULL=まだ並べ替えてない/新規)は既定 updated DESC へフォール＝並べ替え前は現状と同一。
    const ordered = q.orderProject !== undefined;
    if (ordered) params.orderProject = q.orderProject;
    const join = ordered
      ? `LEFT JOIN neta_order o ON o.neta_id = n.id AND o.project = @orderProject`
      : "";
    const orderBy = ordered
      ? `ORDER BY (o.position IS NOT NULL), o.position ASC, n.updated DESC, n.id`
      : `ORDER BY n.updated DESC, n.id`;
    const sql = `SELECT n.* FROM neta n ${join} ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ${orderBy} LIMIT @limit OFFSET @offset`;
    return (this.db.prepare(sql).all(params) as Record<string, unknown>[]).map((r) => this.rowToNeta(r));
  }

  /** 手動並べ替えの保存（被せ表 neta_order）。渡された順に position=index を全上書き（小さい一覧前提）。 */
  reorderNeta(project: string, orderedIds: string[]): void {
    const del = this.db.prepare(`DELETE FROM neta_order WHERE project = ?`);
    const ins = this.db.prepare(
      `INSERT INTO neta_order (project, neta_id, position) VALUES (?, ?, ?)`,
    );
    this.db.transaction(() => {
      del.run(project);
      orderedIds.forEach((id, i) => ins.run(project, id, i));
    })();
  }

  /** メロ連想（S4c・spec§6）：scope（既定 library＝連想元）の melody を候補に、多層類似で近い順に。 */
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
        notes: (n.content as { notes?: { pitch: number; start?: number; dur?: number }[] } | null)?.notes ?? [],
      }))
      .filter((c) => c.notes.length > 0);
    return findSimilar(notes, candidates, top, true); // 多層（音程＋リズム＋輪郭）
  }

  // facets は既定で project。意味タグ(tags)とプロジェクトタグ(prj:→projects)を分離して返す。
  facets(scope: "project" | "library" | "all" = "project"): Facets {
    // 列名は補間するので **allowlist 必須**（将来 facets(userInput) 直呼びでも注入を作らない）。
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
    const allTags = (this.db.prepare(`SELECT name FROM tag ORDER BY name`).all() as { name: string }[]).map(
      (r) => r.name,
    );
    return {
      kind: distinct("kind") as string[],
      mood: distinct("mood") as string[],
      meter: distinct("meter") as string[],
      key: distinct(`"key"`) as number[],
      tags: allTags.filter((n) => !isProjectTag(n)),
      projects: allTags.filter(isProjectTag).map((n) => n.slice(PROJECT_TAG_PREFIX.length)),
    };
  }

  private rowToNeta(row: Record<string, unknown>): Neta {
    const tags = (
      this.db
        .prepare(`SELECT t.name FROM tag t JOIN neta_tag nt ON nt.tag_id = t.id WHERE nt.neta_id = ? ORDER BY t.name`)
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
}
