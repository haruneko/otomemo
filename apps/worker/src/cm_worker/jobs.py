"""ジョブのハンドラ登録簿（docs/design.md #16 意図カタログ）。

実現性が解けた intent から順にハンドラを足していく。
今は依存なしで確実なものだけ:
- mora_count: かな歌詞のモーラ数え（#13、長音ー/促音っ/撥音ん は各1モーラ）
- echo: 配管確認用
将来: embed / analyze_mp3 / generate_* / research / collect / plan ...
"""

import json
import os
import re
import shutil
import subprocess
from typing import Callable

# 小書き（拗音などを直前のかなに結合して1モーラにする）
_SMALL = set("ァィゥェォャュョヮぁぃぅぇぉゃゅょゎ")


def split_mora(kana: str) -> list[str]:
    """かな文字列をモーラ列に分割。長音ー・促音っ・撥音ん はそれ自体が1モーラ。"""
    moras: list[str] = []
    i = 0
    n = len(kana)
    while i < n:
        ch = kana[i]
        if ch.isspace():
            i += 1
            continue
        nxt = kana[i + 1] if i + 1 < n else ""
        if nxt and nxt in _SMALL:
            moras.append(ch + nxt)
            i += 2
        else:
            moras.append(ch)
            i += 1
    return moras


def handle_mora_count(params: dict) -> dict:
    text = params.get("text", "")
    moras = split_mora(text)
    return {"mora_count": len(moras), "moras": moras}


def handle_echo(params: dict) -> dict:
    return {"echo": params}


CLAUDE_BIN = os.environ.get("CM_CLAUDE_BIN", "claude")


def claude_prompt(prompt: str, timeout: int = 120) -> str:
    """`claude -p`（print/非対話モード）をsubprocessで叩く。Max認証を流用＝APIキー不要。"""
    binary = shutil.which(CLAUDE_BIN) or CLAUDE_BIN
    proc = subprocess.run(
        [binary, "-p", prompt],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude failed ({proc.returncode}): {proc.stderr.strip()[:300]}")
    return proc.stdout.strip()


def handle_brainstorm(params: dict) -> dict:
    """壁打ち（docs/design.md 意図カタログ）。ネタ文脈＋依頼で方向性を提案。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "このネタの作曲の方向性を簡潔に3つ提案して。"
    prompt = (
        "あなたは作曲の壁打ち相手。簡潔・箇条書きで答える。\n\n"
        f"# 対象ネタ\n{context}\n\n# 依頼\n{instruction}"
    )
    return {"suggestions": claude_prompt(prompt)}


def _extract_options(text: str) -> list[dict]:
    """Claudeの出力から JSON 配列 [{title, body}] を頑健に取り出す。"""
    raw = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if m:
        raw = m.group(1).strip()
    s, e = raw.find("["), raw.rfind("]")
    if s != -1 and e != -1 and e > s:
        raw = raw[s : e + 1]
    data = json.loads(raw)
    out: list[dict] = []
    for o in data if isinstance(data, list) else []:
        if isinstance(o, dict):
            out.append({"title": str(o.get("title", ""))[:80], "body": str(o.get("body", ""))})
    return out


def handle_suggest(params: dict) -> dict:
    """壁打ち（構造化）。案を JSON 配列で返し、UIで選択可能にする。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この対象を発展させる案を出す。"
    n = int(params.get("n", 3))
    prompt = (
        "作曲の壁打ち相手として、対象の発展案を出す。\n"
        f'出力は JSON 配列のみ。各要素は {{"title": 短い見出し, "body": 本文}}。{n}個。\n'
        "前置き・説明・コードフェンスは付けず、JSON配列だけを返すこと。\n\n"
        f"# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        options = _extract_options(text)
    except Exception:  # noqa: BLE001
        options = []
    if not options:
        options = [{"title": "提案", "body": text}]
    return {"options": options}


HANDLERS: dict[str, Callable[[dict], dict]] = {
    "mora_count": handle_mora_count,
    "echo": handle_echo,
    "brainstorm": handle_brainstorm,
    "suggest": handle_suggest,
}
