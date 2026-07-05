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


def test_transform_copies_content_deterministic():
    # #85 S2c 変換は決定的（Claude不要）。content は C基準のまま、移調/拍子は frame ヒント
    import cm_worker.jobs as jobs

    res = jobs.handle_transform({"fit_context": {"notes": [{"pitch": 60, "start": 0, "dur": 1}]}})
    assert res["items"][0]["kind"] == "melody"
    assert res["items"][0]["content"]["notes"][0]["pitch"] == 60


def test_resolve_fit_context_lyric_mora(tmp_path):
    # #85 S2b 歌詞ネタ→ condition で音数(モーラ)に解決
    import uuid

    from cm_worker.db import connect
    from cm_worker.worker import _resolve_fit_context

    conn = connect(str(tmp_path / "t.sqlite"))
    # neta 表は TS API 所有なので worker DB には無い。テスト用に最小列だけ用意。
    conn.execute(
        "CREATE TABLE IF NOT EXISTS neta (id TEXT PRIMARY KEY, kind TEXT, content TEXT, text TEXT, created TEXT, updated TEXT)"
    )
    nid = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO neta (id, kind, text, created, updated) VALUES (?,?,?,?,?)",
        (nid, "lyric", "はしる\nきみと\n", "t", "t"),
    )
    conn.commit()
    p = _resolve_fit_context(conn, {"condition": {"fit_to": [nid], "by": "syllable"}})
    assert p["fit_context"]["mora_counts"] == [3, 3]
    # condition 無しは素通り
    assert _resolve_fit_context(conn, {"context": "x"}) == {"context": "x"}


def test_resolve_chat_history_injects_recent_turns(tmp_path):
    # #99 本丸：consult が前ターンを踏まえられるよう chat_thread の直近履歴を history に焼く。
    # 特に直前 AI 生成の data.neta.content（実ノート）を含む＝「さっきのメロを直して」が成立。
    from cm_worker.db import connect
    from cm_worker.worker import _resolve_chat_history

    conn = connect(str(tmp_path / "t.sqlite"))

    def add(role, kind, text, data, created):
        conn.execute(
            "INSERT INTO chat_message (id, thread, role, kind, text, data, created) VALUES (?,?,?,?,?,?,?)",
            (created, "chat:x", role, kind, text, json.dumps(data) if data else None, created),
        )

    add("user", "chat", "6/8 マイナーの曲つくって", None, "2026-06-24T10:40:00Z")
    add(
        "ai", "content", "「①テーマ旋律」ができました",
        {"neta": {"kind": "melody", "title": "①テーマ旋律",
                  "content": {"notes": [{"pitch": 67, "start": 0, "dur": 1.5}]}}},
        "2026-06-24T10:41:00Z",
    )
    conn.commit()

    p = _resolve_chat_history(conn, {"chat_thread": "chat:x", "instruction": "直して"})
    h = p["history"]
    assert "ユーザー" in h and "6/8 マイナー" in h
    assert "①テーマ旋律" in h
    assert "67" in h  # 実ノートが含まれる＝直すべきメロが Claude に渡る
    # 時系列順（ユーザー発言が AI 生成より前）
    assert h.index("6/8 マイナー") < h.index("①テーマ旋律")


def test_resolve_chat_history_noop_without_thread(tmp_path):
    from cm_worker.db import connect
    from cm_worker.worker import _resolve_chat_history

    conn = connect(str(tmp_path / "t.sqlite"))
    # chat_thread 無し＝素通り（退化しない）
    assert _resolve_chat_history(conn, {"context": "x"}) == {"context": "x"}
    # 履歴ゼロのスレッドも history を生やさない
    assert "history" not in _resolve_chat_history(conn, {"chat_thread": "chat:none"})


def test_resolve_chat_history_safe_when_table_missing(tmp_path):
    # best-effort：chat_message 表が無い古い DB でも consult を壊さない（#43 失敗は無音にしない＝logのみ）
    import sqlite3

    from cm_worker.worker import _resolve_chat_history

    conn = sqlite3.connect(str(tmp_path / "bare.sqlite"))
    conn.row_factory = sqlite3.Row
    p = {"chat_thread": "chat:x", "instruction": "直して"}
    assert _resolve_chat_history(conn, p) == p  # 例外を握り潰して素通り


def test_gen_chords_rule_handler():
    # #86 ルールベースのコード生成（Claude不要・items形）
    import cm_worker.jobs as jobs

    res = jobs.handle_gen_chords_rule({"frame": {"bars": 4, "mood": "切ない"}, "seed": 1})
    assert res["items"][0]["kind"] == "chord_progression"
    # マイナーmood→マイナー和音 等の musical correctness は TS 側(generate.test.ts)で担保。
    assert "chords" in res["items"][0]["content"]


def test_gen_pair_rule_confirm_proposes_rest():
    # #93 方向確認：confirm かつ複数案 → 1案だけ作り _propose で残りを承認待ちに
    import cm_worker.jobs as jobs

    res = jobs.handle_gen_pair_rule({"count": 4, "confirm": True, "frame": {"bars": 4}, "seed": 1})
    assert len([it for it in res["items"] if it["kind"] == "section"]) == 1  # 1案のみ
    prop = res["_propose"]
    assert prop["intent"] == "gen_pair_rule"
    assert prop["params"]["count"] == 3 and prop["params"]["confirm"] is False


def test_run_once_propose_enqueues_waiting(tmp_path):
    # #93 _propose を返すと「承認待ち」ジョブが積まれる（承認で answerJob が残りを継続）
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "gen_pair_rule", {"count": 3, "confirm": True, "frame": {"bars": 4}, "seed": 1})
    run_once(conn)
    assert conn.execute("SELECT status FROM job WHERE id='j1'").fetchone()["status"] == "done"  # 1案は確定
    w = conn.execute(
        "SELECT intent, question, parent_job_id, params FROM job WHERE status='waiting'"
    ).fetchone()
    assert w["intent"] == "gen_pair_rule" and w["parent_job_id"] == "j1"
    assert "残り2案" in w["question"]
    p = json.loads(w["params"])
    assert p["count"] == 2 and p["confirm"] is False


def test_handle_find_similar_with_candidates():
    # #92 候補を渡せば近い順に返す（DB無しでも動く）
    import cm_worker.jobs as jobs

    a = [{"pitch": p, "start": i, "dur": 1} for i, p in enumerate([60, 62, 64, 65])]
    transposed = [{"pitch": n["pitch"] + 5, "start": n["start"], "dur": 1} for n in a]
    res = jobs.handle_find_similar(
        {"melody": a, "candidates": [{"id": "x", "notes": [{"pitch": 60, "start": 0, "dur": 1}]}, {"id": "y", "notes": transposed}]}
    )
    # 近い順の順位付け(移調不変)は TS 側(music-s2.test.ts melodySimilarity)で担保。ここは委譲の配線を検証。
    assert "similar" in res and len(res["similar"]) == 2


def test_handle_fit_to_chords():
    # #91 補正ハンドラ：melody/chords を受けて補正済み melody items を返す
    import cm_worker.jobs as jobs

    res = jobs.handle_fit_to_chords(
        {"melody": [{"pitch": 61, "start": 0, "dur": 1}], "chords": [{"root": 0, "quality": "", "start": 0, "dur": 1}]}
    )
    assert res["items"][0]["kind"] == "melody"
    # fit_context 経由でも動く
    res2 = jobs.handle_fit_to_chords({"fit_context": {"notes": [{"pitch": 61, "start": 0, "dur": 1}], "chords": [{"root": 0, "quality": "", "start": 0, "dur": 1}]}})
    assert res2["items"][0]["kind"] == "melody"


def test_gen_pair_rule_builds_fitting_pairs():
    # #86 ルールのみでコード+合うメロのペアをcount個・当てはまり保証
    import cm_worker.jobs as jobs

    res = jobs.handle_gen_pair_rule(
        {"count": 2, "structure": "section", "frame": {"bars": 4, "mood": "切ない"}, "seed": 7}
    )
    kinds = [it["kind"] for it in res["items"]]
    assert kinds.count("chord_progression") == 2 and kinds.count("melody") == 2 and kinds.count("section") == 2
    mels = [it for it in res["items"] if it["kind"] == "melody"]
    assert all("fit" in m["meta"] and m["meta"]["fit"]["score"] >= 0.6 for m in mels)  # 当てはまり保証
    assert len([e for e in res["edges"] if e["type"] == "compose"]) == 4  # 2 section × (chord+melody)


def test_gen_pair_rule_full_arrangement():
    # #86 parts でベース・ドラムも一式（ルールのみで1セクションのラフ）
    import cm_worker.jobs as jobs

    res = jobs.handle_gen_pair_rule(
        {"count": 1, "parts": ["melody", "bass", "drums"], "frame": {"bars": 4}, "seed": 3}
    )
    kinds = [it["kind"] for it in res["items"]]
    assert kinds.count("chord_progression") == 1 and kinds.count("rhythm") == 1
    assert kinds.count("melody") == 1 and kinds.count("bass") == 1  # メロとベースは別kind(#bass S1)
    assert kinds.count("section") == 1
    # section に 4パーツ(chord/melody/bass/drums)が compose
    assert len([e for e in res["edges"] if e["type"] == "compose"]) == 4


def test_hasmusic_or_text():
    import cm_worker.jobs as jobs

    assert jobs.hasmusic_or_text({"content": {"chords": [1]}})
    assert jobs.hasmusic_or_text({"text": "歌詞"})
    assert not jobs.hasmusic_or_text({"content": {}})
    assert not jobs.hasmusic_or_text({})


def test_gen_pair_rule_robust_to_claude_param_drift():
    # #86 Claudeが渡すparamsの揺れ（key="C"文字列・time_signature・parts名）でも落ちず効く
    import cm_worker.jobs as jobs

    res = jobs.handle_gen_pair_rule(
        {"frame": {"time_signature": "6/8", "mood": "切ない", "key": "C"}, "count": 1, "parts": ["chord_progression", "melody"]}
    )
    # param揺れ(time_signature/key="C")の解釈は TS normalizeFrame が担保(generate.test.ts)。
    # ここは worker が落ちず chord+melody を chain し fit meta を同梱することを検証。
    ch = next(it for it in res["items"] if it["kind"] == "chord_progression")
    assert "chords" in ch["content"]
    mel = next(it for it in res["items"] if it["kind"] == "melody")
    assert mel["meta"]["fit"]["score"] > 0


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
