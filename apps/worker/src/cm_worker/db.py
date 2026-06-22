import sqlite3

# ジョブ表（docs/design.md #16）。ワーカーは job をポーリングして消化する。
# **DDL 権威は api(`apps/api/src/db.ts`)**。本番は api 先起動でそちらが作る（docs/design アーキ是正 決定4）。
# ここはワーカー単独起動/テスト用の保険。**api と一字一句一致させること**（特に job_result の FK＝
# #97 蘇生対策の前提）。先勝ちの IF NOT EXISTS なので、ズレると環境依存の地雷になる。
JOB_SCHEMA = """
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
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")  # WAL 単一ライター競合を即例外でなく待たせる
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(JOB_SCHEMA)
    return conn
