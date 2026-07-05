"""#1 運用堅牢化: handler 失敗を静かにしない（job.error 記録＋warning）。

「失敗しても壊さない」既存契約は保ったまま、**無音にしない（warning を出す）**ことを固定する。
"""

import logging

import cm_worker.worker as worker
from cm_worker.db import connect


def test_run_once_warns_on_handler_failure(tmp_path, caplog):
    """handler 失敗は job.error へ記録（従来）＋ warning も残す（静かな失敗を検知）。"""
    conn = connect(str(tmp_path / "t.sqlite"))
    now = "2026-06-23T00:00:00+00:00"
    conn.execute(
        "INSERT INTO job (id, intent, params, status, created, updated) VALUES (?,?,?,?,?,?)",
        ("j1", "nope", "{}", "queued", now, now),
    )
    conn.commit()
    with caplog.at_level(logging.WARNING):
        worker.run_once(conn)

    row = conn.execute("SELECT status FROM job WHERE id='j1'").fetchone()
    assert row["status"] == "failed"
    assert any("j1" in r.message for r in caplog.records)
