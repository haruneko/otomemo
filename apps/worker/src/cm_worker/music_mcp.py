"""cm-music-mcp（#86 Stage2）：cm-music を MCP ツールとして HTTP 公開（agentic Chat 用）。

- localhost 専有・**read-only**（DB 書込なし＝materialize は既存 reap が担う）。
- 厳密 inputSchema（型ヒント由来）が Claude の param 揺れの**外側ガード**。根治は music.normalize 層。
- 常駐させて music21 cold-start を1回に（claude -p が --mcp-config で接続）。
"""

import os

from mcp.server.fastmcp import FastMCP

from . import music

_HOST = os.environ.get("CM_MUSIC_MCP_HOST", "127.0.0.1")
_PORT = int(os.environ.get("CM_MUSIC_MCP_PORT", "8790"))
mcp = FastMCP("cm-music", host=_HOST, port=_PORT)


@mcp.tool()
def analyze_fit(melody: list[dict], chords: list[dict], key: int | None = None) -> dict:
    """メロディが各コードに当てはまっているか判定（"提案"の前提）。
    melody=[{pitch:C基準MIDI番号, start:拍, dur:拍}]、chords=[{root:0-11, quality, start:拍, dur:拍}]、key=0-11(任意)。
    返り {in_chord_rate, non_chord_tones:[{type,pos,pitch}], scale_outside_rate, score, issues}。"""
    return music.analyze_fit(melody, chords, key)


@mcp.tool()
def detect_key(notes: list[dict]) -> dict:
    """ノート列(=[{pitch,start,dur}])から調を推定。返り {key:0-11, mode:"major"|"minor"}。"""
    return music.detect_key(notes)


@mcp.tool()
def analyze_progression(chords: list[dict], key: int | None = None) -> dict:
    """コード進行の機能(T/S/D)・ローマ数字を解析。chords=[{root:0-11, quality, ...}]。"""
    return music.analyze_progression(chords, key)


@mcp.tool()
def gen_chords(frame: dict | None = None, seed: int | None = None) -> dict:
    """機能和声ルールでコード進行を生成（Claude非依存・決定的）。
    frame={key:0-11?, meter:"6/8"?, bars:int?, mood:str?}。返り #85 items 形 {items:[{kind:"chord_progression",content:{chords}}]}。"""
    return music.gen_chords(frame, seed)


@mcp.tool()
def gen_melody(frame: dict | None = None, chords: list[dict] | None = None, seed: int | None = None) -> dict:
    """コードトーン拘束でメロを生成。chords を渡すとそれに合わせる（当てはまり保証）。
    frame={meter?,bars?,mood?}。返り #85 items 形 {items:[{kind:"melody",content:{notes}}]}。"""
    return music.gen_melody(frame, chords, seed)


def run() -> None:  # pragma: no cover
    mcp.run(transport="streamable-http")


if __name__ == "__main__":  # pragma: no cover
    run()
