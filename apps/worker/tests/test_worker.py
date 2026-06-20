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


def test_brainstorm_handler(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda prompt, timeout=120: "- 案A\n- 案B")
    res = jobs.handle_brainstorm({"context": "夜を駆ける歌詞", "instruction": "明るくして"})
    assert "案A" in res["suggestions"]


def test_run_once_brainstorm(tmp_path, monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda prompt, timeout=120: "提案テキスト")
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "brainstorm", {"context": "夜の歌", "instruction": "壁打ち"})
    assert run_once(conn) == 1
    row = conn.execute("SELECT status, result_summary FROM job WHERE id='j1'").fetchone()
    assert row["status"] == "done"
    assert json.loads(row["result_summary"])["suggestions"] == "提案テキスト"


def test_suggest_parses_json_options(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '[{"title":"案1","body":"ほんぶん1"},{"title":"案2","body":"b2"}]',
    )
    res = jobs.handle_suggest({"context": "夜", "instruction": "x"})
    assert [o["title"] for o in res["options"]] == ["案1", "案2"]


def test_suggest_strips_code_fence(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs, "claude_prompt", lambda p, timeout=120: '```json\n[{"title":"a","body":"b"}]\n```'
    )
    assert jobs.handle_suggest({"context": "x"})["options"][0]["title"] == "a"


def test_suggest_fallback_on_non_json(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120: "JSONじゃない返答")
    res = jobs.handle_suggest({"context": "x"})
    assert len(res["options"]) == 1
    assert res["options"][0]["body"] == "JSONじゃない返答"


def test_gen_melody_parses_notes(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '{"notes":[{"pitch":60,"start":0,"dur":1},{"pitch":64,"start":1,"dur":0.5}]}',
    )
    res = jobs.handle_gen_melody({"context": "夜の歌"})
    notes = res["content"]["notes"]
    assert len(notes) == 2
    assert notes[0] == {"pitch": 60, "start": 0.0, "dur": 1.0}


def test_gen_melody_handles_garbage(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120: "メロはこちら（JSONなし）")
    assert jobs.handle_gen_melody({"context": "x"})["content"]["notes"] == []


def test_research_returns_summary(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180: "- 要点1\n- 要点2")
    res = jobs.handle_research({"topic": "シューゲイザーのギター音作り"})
    assert "要点1" in res["summary"]
