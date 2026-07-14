import sqlite3

# DDL 権威は api(`apps/api/src/db.ts`) のみ（docs/design アーキ是正 決定4）。
# 旧 JOB_SCHEMA（job/job_result/chat_message の保険DDL）は worker のジョブポーリング廃止
# （worker脳撤去 2026-07-05）で撤去済み。ここは接続設定だけの薄いヘルパ（現利用はテストのみ）。


def connect(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")  # WAL 単一ライター競合を即例外でなく待たせる
    conn.execute("PRAGMA foreign_keys=ON")
    return conn
