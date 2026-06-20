import sqlite3

# ジョブ表（docs/design.md #16）。ワーカーは job をポーリングして消化する。
# neta 等の表は TS API が所有。ここでは job/job_result のみ IF NOT EXISTS で確保。
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
  job_id  TEXT NOT NULL,
  neta_id TEXT,
  ord     INTEGER NOT NULL DEFAULT 0,
  role    TEXT,
  data    TEXT
);
"""


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(JOB_SCHEMA)
    return conn
