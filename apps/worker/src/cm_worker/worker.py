"""ジョブワーカー（docs/design.md #15）。SQLite の job 表をポーリングして消化。

run_once() は1件処理してテスト可能に。run_loop() は常駐用。
TS が job を積み（生産者）、ここが消費する（producer/consumer 境界＝ジョブ表）。
"""

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone

from .jobs import HANDLERS


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _enqueue_children(
    conn: sqlite3.Connection, parent_id: str, subtasks: list, target: str | None = None
) -> int:
    """plan の結果から子ジョブを queued で積む（見てない間も進む）。次以降のループで消化される。
    結果が元の対象に紐づくよう、plan の target_neta_id を子に引き継ぐ（design 原則3）。"""
    n = 0
    for st in subtasks:
        if not isinstance(st, dict):
            continue
        intent = str(st.get("intent", ""))
        if intent not in HANDLERS or intent == "plan":
            continue
        conn.execute(
            "INSERT INTO job (id, intent, params, status, level, parent_job_id, target_neta_id, "
            "priority, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                str(uuid.uuid4()),
                intent,
                json.dumps(st.get("params") or {}, ensure_ascii=False),
                "queued",
                "atomic",
                parent_id,
                target,
                0,
                _now(),
                _now(),
            ),
        )
        n += 1
    return n


def run_once(conn: sqlite3.Connection) -> int:
    """queued を優先度順に1件処理。処理したら1、無ければ0。"""
    row = conn.execute(
        "SELECT * FROM job WHERE status='queued' ORDER BY priority DESC, created LIMIT 1"
    ).fetchone()
    if row is None:
        return 0

    job_id = row["id"]
    conn.execute("UPDATE job SET status='running', updated=? WHERE id=?", (_now(), job_id))
    conn.commit()

    try:
        handler = HANDLERS.get(row["intent"])
        if handler is None:
            raise ValueError(f"no handler for intent: {row['intent']}")
        params = json.loads(row["params"]) if row["params"] else {}
        result = handler(params)
        conn.execute(
            "UPDATE job SET status='done', result_summary=?, progress=NULL, updated=? WHERE id=?",
            (json.dumps(result, ensure_ascii=False), _now(), job_id),
        )
        if row["intent"] == "plan" and isinstance(result.get("subtasks"), list):
            _enqueue_children(conn, job_id, result["subtasks"], row["target_neta_id"])
    except Exception as e:  # noqa: BLE001
        conn.execute(
            "UPDATE job SET status='failed', error=?, updated=? WHERE id=?",
            (str(e), _now(), job_id),
        )
    conn.commit()
    return 1


def run_loop(conn: sqlite3.Connection, interval: float = 1.0) -> None:  # pragma: no cover
    while True:
        if run_once(conn) == 0:
            time.sleep(interval)
