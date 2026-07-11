// 連関リポジトリ（#6）：relation_edge 表（ネタ間の related など・compose とは別の弱い参照）を所有。
import type { Relation } from "../types";
import { type Db } from "./util";

export class RelationRepo {
  constructor(private readonly db: Db) {}

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

  // 逆向き（このネタを to に持つ from 側）。realized_from は「メロ→骨格」で張るため、骨格側から
  // 表面化済みメロ一覧へ辿るにはこの逆引きが要る（design #20 見える化・双方向）。type 未指定=全種。
  getBacklinks(id: string, type?: string): { from: string; type: string }[] {
    const rows = type
      ? this.db
          .prepare(`SELECT from_id AS "from", type FROM relation_edge WHERE to_id = ? AND type = ? ORDER BY type, from_id`)
          .all(id, type)
      : this.db
          .prepare(`SELECT from_id AS "from", type FROM relation_edge WHERE to_id = ? ORDER BY type, from_id`)
          .all(id);
    return rows as { from: string; type: string }[];
  }
}
