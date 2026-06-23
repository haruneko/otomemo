"""#1 運用堅牢化: best-effort 失敗の可視化・DB接続リーク・kill後ハング（design 決定4）。

ここは「失敗しても生成は続ける（[]で壊さない）」という既存契約は保ったまま、
**無音にしない（warning を出す）／接続を漏らさない／kill 後に待ち続けない**ことを固定する。
"""

import json
import logging
import subprocess

import pytest

import cm_worker.db as db
import cm_worker.jobs as jobs
import cm_worker.worker as worker
from cm_worker.db import connect


class _FakeResp:
    """urlopen の戻り（context manager＋read）を最小に模す。"""

    def __init__(self, payload):
        self._payload = payload

    def read(self, *a):
        return json.dumps(self._payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _LeakConn:
    """execute で必ず例外＝close まで到達しない経路を再現。close されたか記録。"""

    def __init__(self):
        self.closed = False

    def execute(self, *a, **k):
        raise RuntimeError("db boom")

    def close(self):
        self.closed = True


def test_style_examples_closes_conn_on_inner_error(monkeypatch):
    """検索は成功するが DB 読みで例外＝従来は conn.close() を踏まず接続リーク。finally で必ず閉じる。"""
    leak = _LeakConn()
    monkeypatch.setenv("CM_DB", "/tmp/whatever.sqlite")
    monkeypatch.setattr("urllib.request.urlopen", lambda url, timeout=None: _FakeResp([{"neta_id": "x"}]))
    monkeypatch.setattr(db, "connect", lambda path: leak)

    out = jobs._style_examples("melody", "夜の歌")

    assert out == []  # 契約: 失敗しても [] で壊さない
    assert leak.closed is True  # リーク是正: 例外経路でも接続を閉じる


def test_style_examples_warns_on_search_failure(monkeypatch, caplog):
    """検索 HTTP が落ちたとき [] を返すのは従来通り。ただし無音にせず warning を残す。"""
    monkeypatch.setenv("CM_DB", "/tmp/whatever.sqlite")

    def _boom(url, timeout=None):
        raise OSError("connection refused")

    monkeypatch.setattr("urllib.request.urlopen", _boom)
    with caplog.at_level(logging.WARNING):
        out = jobs._style_examples("melody", "夜の歌")

    assert out == []
    assert any("style_examples" in r.message for r in caplog.records)


def test_run_once_warns_on_handler_failure(tmp_path, monkeypatch, caplog):
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


class _StuckPopen:
    """1回目 communicate は timeout、2回目（kill 後）の communicate 呼びを記録。"""

    def __init__(self):
        self.pid = 4242
        self.returncode = -9
        self.second_call_kwargs = None
        self._calls = 0

    def communicate(self, timeout=None):
        self._calls += 1
        if self._calls == 1:
            raise subprocess.TimeoutExpired(cmd="claude", timeout=timeout)
        self.second_call_kwargs = {"timeout": timeout}
        return ("", "")


def test_claude_prompt_bounds_communicate_after_kill(monkeypatch):
    """timeout で killpg した後の communicate にも timeout を付ける（パイプ詰まりで常駐が固まらない）。"""
    stuck = _StuckPopen()
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: stuck)
    monkeypatch.setattr(jobs.os, "getpgid", lambda pid: pid)
    monkeypatch.setattr(jobs.os, "killpg", lambda pgid, sig: None)

    with pytest.raises(subprocess.TimeoutExpired):
        jobs.claude_prompt("hi", timeout=1)

    assert stuck.second_call_kwargs is not None
    assert stuck.second_call_kwargs["timeout"] is not None  # 無制限待ちにしない
