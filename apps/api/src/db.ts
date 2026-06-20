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

-- 合成（入れ子・DAG）：子は複数の親で使い回せる
CREATE TABLE IF NOT EXISTS compose_edge (
  parent_id TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  child_id  TEXT NOT NULL REFERENCES neta(id) ON DELETE CASCADE,
  position  REAL    NOT NULL DEFAULT 0,
  ord       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, child_id)
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
`;

export function openDb(path = ":memory:"): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
