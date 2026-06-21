"""cm-music-mcp（#86 Stage2）スモーク：ツール登録と inputSchema の厳格さ。"""

import asyncio


def test_mcp_tools_registered():
    from cm_worker import music_mcp

    tools = asyncio.run(music_mcp.mcp.list_tools())
    names = {t.name for t in tools}
    assert {"analyze_fit", "detect_key", "analyze_progression", "gen_chords", "gen_melody"} <= names


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
