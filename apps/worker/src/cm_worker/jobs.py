"""ジョブのハンドラ登録簿（docs/design.md #16 意図カタログ）。

実現性が解けた intent から順にハンドラを足していく。
今は依存なしで確実なものだけ:
- mora_count: かな歌詞のモーラ数え（#13、長音ー/促音っ/撥音ん は各1モーラ）
- echo: 配管確認用
将来: embed / analyze_mp3 / generate_* / research / collect / plan ...
"""

import os
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


HANDLERS: dict[str, Callable[[dict], dict]] = {
    "mora_count": handle_mora_count,
    "echo": handle_echo,
    "brainstorm": handle_brainstorm,
}
