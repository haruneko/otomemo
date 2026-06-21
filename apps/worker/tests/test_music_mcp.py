"""cm-music-mcp（#86 Stage2）スモーク：ツール登録と inputSchema の厳格さ。"""

import asyncio


def test_mcp_tools_registered():
    from cm_worker import music_mcp

    tools = asyncio.run(music_mcp.mcp.list_tools())
    names = {t.name for t in tools}
    assert {
        "analyze_fit", "detect_key", "analyze_progression",
        "gen_chords", "gen_named_progression", "gen_melody", "fit_to_chords",
        "melody_similarity", "find_similar",
    } <= names


def test_mcp_inputschema_strict_key_integer():
    # key の inputSchema が integer 型＝Claudeの param 揺れ("C"文字列)の外側ガード
    from cm_worker import music_mcp

    tools = asyncio.run(music_mcp.mcp.list_tools())
    af = next(t for t in tools if t.name == "analyze_fit")
    key_schema = af.inputSchema["properties"]["key"]
    types = {o.get("type") for o in key_schema.get("anyOf", [])} or {key_schema.get("type")}
    assert "integer" in types


def test_mcp_tool_wraps_music_function():
    # ツール本体は cm-music の関数を呼ぶだけ（ロジックは music 側でテスト済み）
    from cm_worker import music_mcp

    res = music_mcp.gen_chords({"bars": 4}, seed=1)
    assert res["items"][0]["kind"] == "chord_progression"


def test_mcp_gen_named_progression_marunouchi():
    # #98 名前付き進行ツール＝確定realize（記憶でなくDBから）
    from cm_worker import music_mcp

    res = music_mcp.gen_named_progression("丸の内", {"meter": "4/4"})
    pairs = [(c["root"], c["quality"]) for c in res["items"][0]["content"]["chords"]]
    assert pairs == [(5, "maj7"), (4, "7"), (9, "m7"), (7, "m7"), (0, "7")]
