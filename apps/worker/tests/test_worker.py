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

    monkeypatch.setattr(jobs, "claude_prompt", lambda prompt, timeout=120, **kw: "- 案A\n- 案B")
    res = jobs.handle_brainstorm({"context": "夜を駆ける歌詞", "instruction": "明るくして"})
    assert "案A" in res["suggestions"]


def test_run_once_brainstorm(tmp_path, monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda prompt, timeout=120, **kw: "提案テキスト")
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
        lambda p, timeout=120, **kw: '[{"title":"案1","body":"ほんぶん1"},{"title":"案2","body":"b2"}]',
    )
    res = jobs.handle_suggest({"context": "夜", "instruction": "x"})
    assert [o["title"] for o in res["options"]] == ["案1", "案2"]


def test_suggest_strips_code_fence(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs, "claude_prompt", lambda p, timeout=120, **kw: '```json\n[{"title":"a","body":"b"}]\n```'
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


def test_gen_lyric_items(monkeypatch):
    # #85 S2c 歌詞生成 → lyric items（text）
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs, "claude_prompt", lambda p, timeout=120, **kw: '{"lyrics":["夜を駆ける\\n君と","朝が来る"]}'
    )
    res = jobs.handle_gen_lyric({"count": 2})
    assert [it["kind"] for it in res["items"]] == ["lyric", "lyric"]
    assert res["items"][0]["text"].startswith("夜を駆ける")


def test_fetch_extracts_chords(monkeypatch):
    # #85 S2c 取ってくる → コード進行 content を吐く（research と違う）
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=180, **kw: '{"items":[{"label":"サビ","chords":[{"root":"C","quality":"","start":0,"dur":4}]}]}',
    )
    res = jobs.handle_fetch({"target": "chord_progression", "context": "あの曲"})
    assert res["items"][0]["kind"] == "chord_progression"
    assert res["items"][0]["content"]["chords"]


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


def test_fit_block_renders_and_empty():
    import cm_worker.jobs as jobs

    s = jobs._fit_block({"fit_context": {"mora_counts": [3, 3], "chords": [{"root": "C"}]}})
    assert "音数" in s and "コード進行" in s
    assert jobs._fit_block({}) == ""


def test_gen_variations_builds_items_and_edges(monkeypatch):
    # #85 S2a 1回でN個・各々コード+メロ→ section に compose
    import json as _json

    import cm_worker.jobs as jobs

    payload = _json.dumps(
        {
            "variations": [
                {
                    "label": "案A",
                    "chords": [{"root": "C", "quality": "", "start": 0, "dur": 4}],
                    "notes": [{"pitch": 60, "start": 0, "dur": 1}],
                },
                {
                    "label": "案B",
                    "chords": [{"root": "A", "quality": "m", "start": 0, "dur": 4}],
                    "notes": [{"pitch": 64, "start": 0, "dur": 1}],
                },
            ]
        }
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180, **kw: payload)
    res = jobs.handle_gen_variations(
        {"count": 2, "kinds": ["chord_progression", "melody"], "structure": "section"}
    )
    kinds = [it["kind"] for it in res["items"]]
    assert kinds.count("section") == 2
    assert kinds.count("chord_progression") == 2 and kinds.count("melody") == 2
    comp = [e for e in res["edges"] if e["type"] == "compose"]
    assert len(comp) == 4  # 2 section × 2 part


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


def test_mcp_args_gated_by_env(monkeypatch):
    # cm-music 廃止後：CM_MCP_STDIO_CMD 無し=MCP引数なし(後退ゼロ)、有り=creative-manager 一本
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", None)
    assert jobs._mcp_args() == []
    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")
    monkeypatch.setattr(jobs, "CM_MCP_STDIO_ARGS", '["--filter","@cm/api","mcp"]')
    args = jobs._mcp_args()
    assert "--mcp-config" in args and "--max-turns" in args and "--permission-mode" in args
    allowed = args[args.index("--allowedTools") + 1]
    # 音楽ツールは creative-manager(TS) に集約（旧 cm-music の置換）
    assert "mcp__creative-manager__analyze_fit" in allowed and "mcp__creative-manager__gen_chords" in allowed


def test_mcp_args_neta_read_only(monkeypatch):
    # #102 S1：CM_MCP_URL があれば creative-manager の read-only ネタツールを agentic に追加。
    # 書込ツール(update/delete/place_child/link 等)は **絶対に** allowedTools に入れない（承認前にDBを変えない）。
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", None)
    monkeypatch.setattr(jobs, "CM_MCP_STDIO_ARGS", None)
    assert jobs._mcp_args() == []  # 無ければ後退ゼロ

    # neta だけ設定（music 無し）でも read-only ツールが付く（stdio spawn）
    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")
    monkeypatch.setattr(jobs, "CM_MCP_STDIO_ARGS", '["--filter","@cm/api","mcp"]')
    args = jobs._mcp_args()
    cfg = args[args.index("--mcp-config") + 1]
    assert "creative-manager" in cfg
    import json as _json
    parsed = _json.loads(cfg)
    cm = parsed["mcpServers"]["creative-manager"]
    assert cm["command"] == "pnpm" and cm["args"] == ["--filter", "@cm/api", "mcp"]
    allowed = args[args.index("--allowedTools") + 1]
    # read-only は入る
    for t in ("list_neta", "get_neta", "facets", "get_composition", "get_relations"):
        assert f"mcp__creative-manager__{t}" in allowed, t
    # 書込は1つも入らない（read-only原則・承認制の構造保証）
    for t in ("create_neta", "update_neta", "delete_neta", "place_child",
              "remove_child", "link", "unlink", "update_song"):
        assert f"mcp__creative-manager__{t}" not in allowed, t

    # 音楽ツール(分析/生成)も creative-manager に集約（cm-music 廃止＝1サーバ1言語）
    for t in ("analyze_fit", "fit_to_chords", "detect_key", "gen_chords", "gen_named_progression", "melody_similarity"):
        assert f"mcp__creative-manager__{t}" in allowed, t


def test_handle_consult_agentic_items_preserves_index(monkeypatch):
    # #86 S2b agentic：不正itemが先頭でも edge の index がズレない（compactしない）
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")  # agentic ON（creative-manager）
    payload = (
        '{"type":"items","items":[{"bad":1},'
        '{"kind":"chord_progression","content":{"chords":[{"root":0,"quality":"","start":0,"dur":4}]}},'
        '{"kind":"section"}],"edges":[{"type":"compose","from":2,"to":1,"position":0}]}'
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: payload)
    res = jobs.handle_consult({"instruction": "コードに合うメロ"})
    assert res["type"] == "items"
    assert len(res["items"]) == 3  # 不正item(空dict)も残して index 保存
    assert res["edges"][0]["from"] == 2 and res["edges"][0]["to"] == 1  # section→chord がズレない


def test_handle_consult_proposals_validates_and_drops(monkeypatch):
    # #102 S2：既存ネタの変異は type:proposals で返す（提案＝適用ではない）。
    # 不正 proposal は要素ごと落とし、残りは活かす。op/target_id/args を検証。
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")  # 読取面ON
    payload = (
        '{"type":"proposals","summary":"3件の提案",'
        '"proposals":['
        '{"op":"fit_to","target_id":"n1","args":{"content":{"notes":[{"pitch":60,"start":0,"dur":1}]}},"rationale":"外し音を補正"},'  # 有効
        '{"op":"place_child","target_id":"n2","args":{"parent_id":"s1","position":0}},'  # 有効
        '{"op":"frobnicate","target_id":"n3","args":{}},'  # 無効 op→落とす
        '{"op":"delete","args":{}},'  # target_id 欠落→落とす
        '{"op":"link","target_id":"n4","args":{"to_id":"n5","type":"ref"}}'  # 有効
        ']}'
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: payload)
    res = jobs.handle_consult({"instruction": "n1をコードに合わせて直して、n2をs1に置いて"})
    assert res["type"] == "proposals"
    ops = [p["op"] for p in res["proposals"]]
    assert ops == ["fit_to", "place_child", "link"]  # 無効2件は除去・順序保持
    assert res["proposals"][0]["target_id"] == "n1"
    assert res["summary"] == "3件の提案"


def test_handle_consult_proposals_normalizes_content(monkeypatch):
    # #102 変異 content は生成経路と同じ正規化に通す（素通し禁止）。空 content の提案は落とす。
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")
    payload = (
        '{"type":"proposals","proposals":['
        '{"op":"update_content","target_id":"n1","args":{"content":{"notes":[{"pitch":"60","start":"0","dur":"2"}]}}},'  # 文字列→数値に正規化
        '{"op":"update_content","target_id":"n2","args":{"content":{"notes":[]}}}'  # 空→落とす
        ']}'
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: payload)
    res = jobs.handle_consult({"instruction": "n1の音を直して"})
    assert res["type"] == "proposals"
    assert len(res["proposals"]) == 1  # 空 content の n2 は除去
    note = res["proposals"][0]["args"]["content"]["notes"][0]
    assert note["pitch"] == 60 and isinstance(note["pitch"], int)  # "60"→60
    assert note["dur"] == 2.0  # "2"→2.0（生成経路と同じ整形）


def test_handle_consult_proposals_all_invalid_falls_back_to_chat(monkeypatch):
    # #102 S2：全 proposal が不正なら会話を壊さず chat フォールバック（#43同型）。
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", "pnpm")
    payload = '{"type":"proposals","proposals":[{"op":"bogus","target_id":"x"},{"op":"delete"}]}'
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: payload)
    res = jobs.handle_consult({"instruction": "全部消して"})
    assert res["type"] == "chat" and res["text"]


def test_handle_consult_dispatch_without_env(monkeypatch):
    # env 無し＝従来 dispatch(plan)＝後退ゼロ
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "CM_MCP_STDIO_CMD", None)
    monkeypatch.setattr(
        jobs, "claude_prompt",
        lambda p, timeout=120, **kw: '{"type":"plan","subtasks":[{"intent":"gen_pair_rule","params":{}}]}',
    )
    res = jobs.handle_consult({"instruction": "コードに合うメロ"})
    assert res["type"] == "plan"


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


def test_gen_variations_attaches_fit_analysis(monkeypatch):
    # #86 コード+メロが揃ったら analyze_fit を melody item の meta に同梱
    import json as _json

    import cm_worker.jobs as jobs

    payload = _json.dumps(
        {
            "variations": [
                {
                    "label": "案A",
                    "chords": [{"root": "C", "quality": "", "start": 0, "dur": 4}],
                    "notes": [{"pitch": 60, "start": 0, "dur": 1}, {"pitch": 64, "start": 1, "dur": 1}],
                }
            ]
        }
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180, **kw: payload)
    res = jobs.handle_gen_variations(
        {"count": 1, "kinds": ["chord_progression", "melody"], "structure": "pair", "frame": {"key": 0}}
    )
    mel = next(it for it in res["items"] if it["kind"] == "melody")
    assert "meta" in mel and "fit" in mel["meta"]
    assert mel["meta"]["fit"]["in_chord_rate"] == 1.0  # C,E は C コードトーン


def test_gen_variations_flat_single_kind(monkeypatch):
    # 単一kind・structure既定=flat ＝ edge なし
    import json as _json

    import cm_worker.jobs as jobs

    payload = _json.dumps(
        {"variations": [{"label": f"案{i}", "chords": [{"root": "C", "quality": "", "start": 0, "dur": 4}]} for i in range(3)]}
    )
    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180, **kw: payload)
    res = jobs.handle_gen_variations({"count": 3, "kinds": ["chord_progression"]})
    assert len([it for it in res["items"] if it["kind"] == "chord_progression"]) == 3
    assert res["edges"] == []


def test_collect_parses_summary_and_references(monkeypatch):
    # #82 collect は research と同じ {summary, references[]} を返す（reapが reference化）
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120, **kw: (
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
        jobs, "claude_prompt", lambda p, timeout=120, **kw: '{"summary":"s","references":[{"title":"t"}]}'
    )
    conn = connect(str(tmp_path / "t.sqlite"))
    _enqueue(conn, "collect", {"topic": "x"})
    assert run_once(conn) == 1
    row = conn.execute("SELECT status, result_summary FROM job WHERE id='j1'").fetchone()
    assert row[0] == "done"
    assert "references" in row[1]


def test_suggest_fallback_on_non_json(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: "JSONじゃない返答")
    res = jobs.handle_suggest({"context": "x"})
    assert len(res["options"]) == 1
    assert res["options"][0]["body"] == "JSONじゃない返答"


def test_research_parses_references(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120, **kw: (
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

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: "JSONじゃない調査メモ")
    res = jobs.handle_research({"topic": "x"})
    assert res["summary"] == "JSONじゃない調査メモ"
    assert res["references"] == []


def test_gen_melody_parses_notes(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120, **kw: '{"notes":[{"pitch":60,"start":0,"dur":1},{"pitch":64,"start":1,"dur":0.5}]}',
    )
    res = jobs.handle_gen_melody({"context": "夜の歌"})
    notes = res["content"]["notes"]
    assert len(notes) == 2
    assert notes[0] == {"pitch": 60, "start": 0.0, "dur": 1.0}


def test_gen_melody_handles_garbage(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: "メロはこちら（JSONなし）")
    assert jobs.handle_gen_melody({"context": "x"})["content"]["notes"] == []


def test_gen_chord_parses_chords(monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(jobs, "_style_block", lambda kind, ctx: "")
    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120, **kw: '{"chords":[{"root":"C","quality":"","start":0,"dur":4},'
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
        lambda p, timeout=120, **kw: '{"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}}',
    )
    rhythm = jobs.handle_gen_rhythm({"context": "x"})["content"]["rhythm"]
    assert rhythm["steps"] == 16
    assert rhythm["lanes"][0] == {"name": "Kick", "midi": 36, "hits": [0, 4, 8, 12]}


def test_plan_decomposes_and_enqueues_children(tmp_path, monkeypatch):
    import cm_worker.jobs as jobs

    monkeypatch.setattr(
        jobs,
        "claude_prompt",
        lambda p, timeout=120, **kw: '{"subtasks":[{"intent":"gen_chord","params":{"context":"夜の歌"}},'
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

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=120, **kw: reply)
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
        lambda p, timeout=120, **kw: '{"type":"plan","subtasks":[{"intent":"gen_rhythm","params":{"context":"夜"}}]}',
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

    monkeypatch.setattr(jobs, "claude_prompt", lambda p, timeout=180, **kw: "- 要点1\n- 要点2")
    res = jobs.handle_research({"topic": "シューゲイザーのギター音作り"})
    assert "要点1" in res["summary"]
