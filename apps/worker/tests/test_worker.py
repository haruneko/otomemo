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


def test_frame_block_renders_and_empty():
    # #85 S1 枠をプロンプト片へ。枠なしは空文字（従来通り）
    import cm_worker.jobs as jobs

    s = jobs._frame_block({"frame": {"meter": "6/8", "bars": 8, "tempo": 120, "key": 9, "mood": "切ない"}})
    assert "拍子=6/8" in s and "8小節" in s and "BPM=120" in s and "調=A" in s and "切ない" in s
    assert jobs._frame_block({}) == ""
    assert jobs._frame_block({"frame": {}}) == ""


def test_gen_chord_prompt_includes_frame(monkeypatch):
    # frame を渡すと gen のプロンプトに枠が入る（指定したら効く）
    import cm_worker.jobs as jobs

    captured = {}

    def fake(p, timeout=120):
        captured["p"] = p
        return '{"chords":[{"root":"C","quality":"","start":0,"dur":4}]}'

    monkeypatch.setattr(jobs, "claude_prompt", fake)
    jobs.handle_gen_chord({"context": "夜", "frame": {"meter": "6/8"}})
    assert "拍子=6/8" in captured["p"]


def test_collect_parses_summary_and_references(monkeypatch):
    # #82 collect は research と同じ {summary, references[]} を返す（reapが reference化）
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: (
            '{"summary":"夜の街の断片","references":['
            '{"title":"IVM7→IIIm7","why":"切ない","points":"Aメロ頭で"},'
            '{"title":"裏拍ハット","why":"疾走感","points":"16分"}]}'
        ),
    )
    res = jobs.handle_collect({"topic": "夜の街"})
    assert res["summary"] == "夜の街の断片"
    assert [r["title"] for r in res["references"]] == ["IVM7→IIIm7", "裏拍ハット"]


def test_import_midi_splits_tracks_and_drums():
    # #81 MIDIをトラック×チャンネルで melody/rhythm に分割
    import base64
    import io

    import mido

    import cm_worker.jobs as jobs

    mid = mido.MidiFile(ticks_per_beat=480)
    mel = mido.MidiTrack()
    mid.tracks.append(mel)
    mel.append(mido.Message("note_on", note=60, velocity=100, time=0, channel=0))
    mel.append(mido.Message("note_off", note=60, velocity=0, time=480, channel=0))
    mel.append(mido.Message("note_on", note=64, velocity=90, time=0, channel=0))
    mel.append(mido.Message("note_off", note=64, velocity=0, time=480, channel=0))
    dr = mido.MidiTrack()
    mid.tracks.append(dr)
    dr.append(mido.Message("note_on", note=36, velocity=100, time=0, channel=9))
    dr.append(mido.Message("note_off", note=36, velocity=0, time=120, channel=9))
    buf = io.BytesIO()
    mid.save(file=buf)
    b64 = base64.b64encode(buf.getvalue()).decode()

    res = jobs.handle_import_midi({"midi_b64": b64, "filename": "song.mid"})
    kinds = [t["kind"] for t in res["tracks"]]
    assert "melody" in kinds and "rhythm" in kinds
    mel_t = next(t for t in res["tracks"] if t["kind"] == "melody")
    assert [n["pitch"] for n in mel_t["content"]["notes"]] == [60, 64]
    assert mel_t["content"]["notes"][1]["start"] == 1.0  # 2音目は1拍目から
    dr_t = next(t for t in res["tracks"] if t["kind"] == "rhythm")
    assert dr_t["content"]["rhythm"]["lanes"][0]["midi"] == 36
    assert "song" in dr_t["title"]


def test_import_midi_bad_data_returns_empty():
    import cm_worker.jobs as jobs

    assert jobs.handle_import_midi({"midi_b64": "not-base64-!!", "filename": "x"})["tracks"] == []


def test_collect_registered_and_runs(tmp_path, monkeypatch):
    # HANDLERS に collect があり run_once で消化される
    import cm_worker.jobs as jobs

    assert "collect" in jobs.HANDLERS
    monkeypatch.setattr(
        jobs, "claude_prompt", lambda p, timeout=120: '{"summary":"s","references":[{"title":"t"}]}'
    )
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "collect", {"topic": "x"})
    assert run_once(conn) == 1
    row = conn.execute("SELECT status, result_summary FROM job WHERE id='j1'").fetchone()
    assert row[0] == "done"
    assert "references" in row[1]


def test_suggest_fallback_on_non_json(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120: "JSONじゃない返答")
    res = jobs.handle_suggest({"context": "x"})
    assert len(res["options"]) == 1
    assert res["options"][0]["body"] == "JSONじゃない返答"


def test_research_parses_references(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: (
            '{"summary":"夜系の要点","references":['
            '{"title":"曲A","artist":"X","why":"進行が近い","points":"IVmで翳り"},'
            '{"title":"曲B","artist":"Y","why":"質感","points":"低BPM"}]}'
        ),
    )
    res = jobs.handle_research({"topic": "夜の曲"})
    assert res["summary"] == "夜系の要点"
    assert [r["title"] for r in res["references"]] == ["曲A", "曲B"]
    assert res["references"][0]["points"] == "IVmで翳り"


def test_research_fallback_on_non_json(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120: "JSONじゃない調査メモ")
    res = jobs.handle_research({"topic": "x"})
    assert res["summary"] == "JSONじゃない調査メモ"
    assert res["references"] == []


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


def test_gen_chord_parses_chords(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "_style_block", lambda kind, ctx: "")
    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '{"chords":[{"root":"C","quality":"","start":0,"dur":4},'
        '{"root":"A","quality":"m","start":4,"dur":4}]}',
    )
    chords = jobs.handle_gen_chord({"context": "x"})["content"]["chords"]
    assert len(chords) == 2
    assert chords[0] == {"root": 0, "quality": "", "start": 0.0, "dur": 4.0}  # "C" -> 0
    assert chords[1]["root"] == 9  # "A" -> 9


def test_gen_rhythm_parses_lanes(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "_style_block", lambda kind, ctx: "")
    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '{"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}}',
    )
    rhythm = jobs.handle_gen_rhythm({"context": "x"})["content"]["rhythm"]
    assert rhythm["steps"] == 16
    assert rhythm["lanes"][0] == {"name": "Kick", "midi": 36, "hits": [0, 4, 8, 12]}


def test_plan_decomposes_and_enqueues_children(tmp_path, monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '{"subtasks":[{"intent":"gen_chord","params":{"context":"夜の歌"}},'
        '{"intent":"gen_rhythm","params":{"context":"夜の歌"}},'
        '{"intent":"plan","params":{}}]}',  # 自己再帰や未知は弾かれる
    )
    conn = connect(str(tmp_path / "t.sqlite"))
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO job (id, intent, params, status, target_neta_id, created, updated) "
        "VALUES ('j1','plan','{}','queued','t1',?,?)",
        (now, now),
    )
    conn.commit()
    assert run_once(conn) == 1
    assert conn.execute("SELECT status FROM job WHERE id='j1'").fetchone()["status"] == "done"
    kids = conn.execute(
        "SELECT intent, target_neta_id FROM job WHERE parent_job_id='j1' ORDER BY intent"
    ).fetchall()
    assert [k["intent"] for k in kids] == ["gen_chord", "gen_rhythm"]
    assert all(k["target_neta_id"] == "t1" for k in kids)  # 対象を引き継ぐ（浮かない）


def _consult(monkeypatch, reply: str):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120: reply)
    return jobs.handle_consult({"context": "夜の曲", "instruction": "x"})


def test_consult_chat(monkeypatch):
    res = _consult(monkeypatch, '{"type":"chat","text":"いいと思う"}')
    assert res == {"type": "chat", "text": "いいと思う"}


def test_consult_non_json_is_chat(monkeypatch):
    res = _consult(monkeypatch, "JSONじゃない普通の返答")
    assert res["type"] == "chat" and res["text"] == "JSONじゃない普通の返答"


def test_consult_options(monkeypatch):
    res = _consult(monkeypatch, '{"type":"options","options":[{"title":"案A","body":"b"}]}')
    assert res["type"] == "options" and res["options"][0]["title"] == "案A"


def test_consult_content_chord(monkeypatch):
    res = _consult(
        monkeypatch,
        '{"type":"content","neta_kind":"chord_progression","content":'
        '{"chords":[{"root":"C","quality":"","start":0,"dur":4}]}}',
    )
    assert res["type"] == "content" and res["neta_kind"] == "chord_progression"
    assert res["content"]["chords"][0] == {"root": 0, "quality": "", "start": 0.0, "dur": 4.0}


def test_consult_content_melody(monkeypatch):
    res = _consult(
        monkeypatch,
        '{"type":"content","neta_kind":"melody","content":{"notes":[{"pitch":60,"start":0,"dur":1}]}}',
    )
    assert res["type"] == "content" and res["neta_kind"] == "melody"
    assert res["content"]["notes"][0]["pitch"] == 60


def test_consult_empty_content_falls_back_to_chat(monkeypatch):
    res = _consult(
        monkeypatch,
        '{"type":"content","neta_kind":"melody","content":{"notes":[]}}',
    )
    assert res["type"] == "chat"  # 空は作らない（#43同型）


def test_consult_plan_filters_self_recursion(monkeypatch):
    res = _consult(
        monkeypatch,
        '{"type":"plan","subtasks":[{"intent":"gen_chord","params":{}},{"intent":"consult","params":{}}]}',
    )
    assert res["type"] == "plan"
    assert [s["intent"] for s in res["subtasks"]] == ["gen_chord"]  # consult は弾く


def test_run_once_consult_plan_enqueues_children(tmp_path, monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120: '{"type":"plan","subtasks":[{"intent":"gen_rhythm","params":{"context":"夜"}}]}',
    )
    conn = connect(str(tmp_path / "c.sqlite"))
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO job (id, intent, params, status, target_neta_id, created, updated) "
        "VALUES ('jc','consult','{}','queued','t9',?,?)",
        (now, now),
    )
    conn.commit()
    assert run_once(conn) == 1
    kids = conn.execute("SELECT intent, target_neta_id FROM job WHERE parent_job_id='jc'").fetchall()
    assert [k["intent"] for k in kids] == ["gen_rhythm"]
    assert kids[0]["target_neta_id"] == "t9"


def test_research_returns_summary(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180: "- 要点1\n- 要点2")
    res = jobs.handle_research({"topic": "シューゲイザーのギター音作り"})
    assert "要点1" in res["summary"]
