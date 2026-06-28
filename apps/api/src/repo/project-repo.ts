// プロジェクトリポジトリ：project 表（器の説明＋AIへの指示）を所有。識別子=prj: を剥がした名前。
// 器の所属自体は従来どおり neta の prj: タグ（NetaRepo）。ここは説明/指示の overlay（song overlay と同型）。
import { type Db, now } from "./util";

export interface Project {
  name: string;
  description: string | null;
  instructions: string | null;
  created: string;
  updated: string;
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    name: row.name as string,
    description: (row.description as string) ?? null,
    instructions: (row.instructions as string) ?? null,
    created: row.created as string,
    updated: row.updated as string,
  };
}

export class ProjectRepo {
  constructor(private readonly db: Db) {}

  getProject(name: string): Project | null {
    const row = this.db.prepare(`SELECT * FROM project WHERE name=?`).get(name) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToProject(row) : null;
  }

  // upsert（部分更新は既存を温存＝COALESCE）。説明だけ／指示だけの更新を許す。
  setProject(name: string, patch: { description?: string | null; instructions?: string | null }): Project {
    const ts = now();
    this.db
      .prepare(
        `INSERT INTO project (name, description, instructions, created, updated)
         VALUES (@name, @description, @instructions, @ts, @ts)
         ON CONFLICT(name) DO UPDATE SET
           description  = COALESCE(@description, description),
           instructions = COALESCE(@instructions, instructions),
           updated      = @ts`,
      )
      .run({
        name,
        description: patch.description ?? null,
        instructions: patch.instructions ?? null,
        ts,
      });
    return this.getProject(name)!;
  }
}
