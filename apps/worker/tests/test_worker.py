import json
from datetime import datetime, timezone

from cm_worker.db import connect
from cm_worker.jobs import split_mora
from cm_worker.worker import run_once


def _enqueue(conn, intent, params, job_id="j1"):
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO job (id, intent, params, status, created, updated) VALUES (?,?,?,?,?,?)",
        (job_id, intent, json.dumps(params), "queued", now, now),
    )
    conn.commit()


def test_split_mora():
    assert split_mora("はしる") == ["は", "し", "る"]
    assert split_mora("きゃー") == ["きゃ", "ー"]  # 拗音1 + 長音1
    assert split_mora("がっこう") == ["が", "っ", "こ", "う"]  # 促音は1モーラ
    assert split_mora("せんせい") == ["せ", "ん", "せ", "い"]


def test_run_once_processes_mora_job(tmp_path):
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "mora_count", {"text": "よるをかける"})
    assert run_once(conn) == 1
    row = conn.execute("SELECT status, result_summary FROM job WHERE id='j1'").fetchone()
    assert row["status"] == "done"
    assert json.loads(row["result_summary"])["mora_count"] == 6


def test_run_once_no_queued(tmp_path):
    conn = connect(str(tmp_path / "t.sqlite"))
    assert run_once(conn) == 0


def test_unknown_intent_marks_failed(tmp_path):
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "nope", {})
    run_once(conn)
    row = conn.execute("SELECT status, error FROM job WHERE id='j1'").fetchone()
    assert row["status"] == "failed"
    assert "no handler" in row["error"]
