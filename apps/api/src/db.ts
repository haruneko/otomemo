import Database from "better-sqlite3";

// スキーマ（docs/design.md #14）。合成辺と関連辺は分離。
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS neta (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  title   TEXT,
  content TEXT,
  text    TEXT,
  "key"   INTEGER,
  mode    TEXT,
  tempo   REAL,
  meter   TEXT,
  bars    INTEGER,
  mood    TEXT,
  scope   TEXT NOT NULL DEFAULT 'project',
  created TEXT NOT NULL,
  updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_neta_kind ON neta(kind);
CREATE INDEX IF NOT EXISTS idx_neta_mood ON neta(mood);

CREATE TABLE IF NOT EXISTS tag (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS neta_tag (
  neta_id TEXT    NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tag(id)  ON DELETE CASCADE,
  PRIMARY KEY (neta_id, tag_id)
);

-- 合成（入れ子・DAG）：子は複数の親で使い回せる。
-- PKに position を含め、同じ子を別位置に反復配置できる（#54）。
CREATE TABLE IF NOT EXISTS compose_edge (
  parent_id TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  child_id  TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  position  REAL    NOT NULL DEFAULT 0,
  ord       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id, position)
);

-- 関連（意図的に張ったもののみ。似てる連関は保存せず検索で計算＝S3）
CREATE TABLE IF NOT EXISTS relation_edge (
  from_id TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  to_id   TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  type    TEXT NOT NULL DEFAULT 'related',
  PRIMARY KEY (from_id, to_id, type)
);

-- 投げた仕事（docs/design.md #16）。TSが積み、Pythonワーカーが消費。
CREATE TABLE IF NOT EXISTS job (
  id             TEXT PRIMARY KEY,
  target_neta_id TEXT,
  level          TEXT NOT NULL DEFAULT 'atomic',
  intent         TEXT NOT NULL,
  instruction    TEXT,
  params         TEXT,
  status         TEXT NOT NULL DEFAULT 'queued',
  priority       INTEGER NOT NULL DEFAULT 0,
  progress       TEXT,
  notify_level   TEXT,
  parent_job_id  TEXT,
  question       TEXT,
  result_summary TEXT,
  error          TEXT,
  created        TEXT NOT NULL,
  updated        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_status ON job(status);
CREATE TABLE IF NOT EXISTS job_result (
  job_id  TEXT NOT NULL REFERENCES job(id) ON DELETE CASCADE,
  neta_id TEXT REFERENCES neta(id) ON DELETE CASCADE,
  ord     INTEGER NOT NULL DEFAULT 0,
  role    TEXT,
  data    TEXT
);
CREATE TABLE IF NOT EXISTS asset (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL,
  name    TEXT,
  path    TEXT NOT NULL,
  size    INTEGER,
  mime    TEXT,
  meta    TEXT,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_kind ON asset(kind);
CREATE TABLE IF NOT EXISTS song (
  neta_id     TEXT PRIMARY KEY REFERENCES neta(id) ON DELETE CASCADE,
  stage       TEXT,
  next_action TEXT,
  updated     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS neta_asset (
  neta_id  TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  role     TEXT NOT NULL DEFAULT 'attachment',
  created  TEXT NOT NULL,
  PRIMARY KEY (neta_id, asset_id, role)
);
CREATE INDEX IF NOT EXISTS idx_neta_asset_neta ON neta_asset(neta_id);
CREATE TABLE IF NOT EXISTS schedule (
  id        TEXT PRIMARY KEY,
  neta_id   TEXT REFERENCES neta(id) ON DELETE CASCADE,
  intent    TEXT NOT NULL,
  params    TEXT,
  every_sec INTEGER NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  last_run  TEXT,
  next_run  TEXT NOT NULL,
  created   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedule_due ON schedule(enabled, next_run);

-- #70 Chat履歴の永続化。thread = 対象neta id ／ 'global'。data=JSON(構造化ペイロード)。
CREATE TABLE IF NOT EXISTS chat_message (
  id      TEXT PRIMARY KEY,
  thread  TEXT NOT NULL,
  role    TEXT NOT NULL,
  kind    TEXT,
  text    TEXT,
  data    TEXT,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_message(thread, created);
`;

export function openDb(path = ":memory:"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// 既存DBのスキーマ進化（CREATE TABLE IF NOT EXISTS では変わらない箇所）。
function migrate(db: Database.Database): void {
  // project/library 分離：既存 neta に scope 列を増設（既定 project＝既存は全部 project に）。
  const cols = db.prepare(`PRAGMA table_info(neta)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === "scope")) {
    db.exec(`ALTER TABLE neta ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'`);
  }
  // #54: compose_edge の旧PK (parent_id, child_id) → (parent_id, child_id, position) へ再構築。
  // SQLiteはPK変更不可なので新テーブルを作って移し替える（既存辺は無損失）。
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='compose_edge'`)
    .get() as { sql: string } | undefined;
  if (row && !/parent_id\s*,\s*child_id\s*,\s*position/i.test(row.sql)) {
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec(`
        CREATE TABLE compose_edge_new (
          parent_id TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
          child_id  TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
          position  REAL    NOT NULL DEFAULT 0,
          ord       INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (parent_id, child_id, position)
        );
        INSERT INTO compose_edge_new (parent_id, child_id, position, ord)
          SELECT parent_id, child_id, position, ord FROM compose_edge;
        DROP TABLE compose_edge;
        ALTER TABLE compose_edge_new RENAME TO compose_edge;
      `);
    })();
    db.pragma("foreign_keys = ON");
  }
}
