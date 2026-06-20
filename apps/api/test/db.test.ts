import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import { openDb } from "../src/db";

// #54: 旧PK (parent_id, child_id) の compose_edge を持つ既存DBを、
// openDb の migrate が無損失で (parent_id, child_id, position) へ再構築することを検証。
describe("compose_edge migration (#54)", () => {
  const path = `/tmp/cm-migr-${process.pid}-${Date.now()}.sqlite`;
  afterEach(() => {
    for (const p of [path, `${path}-wal`, `${path}-shm`]) rmSync(p, { force: true });
  });

  it("rebuilds old (parent,child) PK to (parent,child,position) with no data loss", () => {
    // 旧スキーマのDBファイルを用意
    const old = new Database(path);
    old.exec(`
      CREATE TABLE neta (id TEXT PRIMARY KEY, kind TEXT NOT NULL, mood TEXT);
      CREATE TABLE compose_edge (
        parent_id TEXT NOT NULL, child_id TEXT NOT NULL,
        position REAL NOT NULL DEFAULT 0, ord INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (parent_id, child_id)
      );
      INSERT INTO neta (id, kind) VALUES ('p','section'),('c','melody');
      INSERT INTO compose_edge VALUES ('p','c',0,0);
    `);
    old.close();

    const db = openDb(path); // ← migrate が走る
    const ddl = (
      db.prepare(`SELECT sql FROM sqlite_master WHERE name='compose_edge'`).get() as { sql: string }
    ).sql;
    expect(ddl).toMatch(/parent_id\s*,\s*child_id\s*,\s*position/i);

    // 既存の辺は保持
    const rows = db.prepare(`SELECT parent_id, child_id, position FROM compose_edge`).all();
    expect(rows).toEqual([{ parent_id: "p", child_id: "c", position: 0 }]);

    // 反復配置（旧PKならUNIQUE違反になっていた）が通る
    db.prepare(`INSERT INTO compose_edge (parent_id, child_id, position, ord) VALUES ('p','c',4,1)`).run();
    const count = (db.prepare(`SELECT count(*) c FROM compose_edge`).get() as { c: number }).c;
    expect(count).toBe(2);
    db.close();
  });
});
