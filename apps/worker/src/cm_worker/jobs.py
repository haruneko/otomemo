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


def _extract_notes(text: str) -> list[dict]:
    """Claude出力から {"notes":[{pitch,start,dur}]} を頑健に取り出す。"""
    raw = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if m:
        raw = m.group(1).strip()
    s, e = raw.find("{"), raw.rfind("}")
    if s != -1 and e != -1 and e > s:
        raw = raw[s : e + 1]
    data = json.loads(raw)
    notes = data.get("notes") if isinstance(data, dict) else None
    out: list[dict] = []
    for n in notes or []:
        if isinstance(n, dict) and {"pitch", "start", "dur"} <= n.keys():
            out.append(
                {"pitch": int(n["pitch"]), "start": float(n["start"]), "dur": float(n["dur"])}
            )
    return out


def handle_gen_melody(params: dict) -> dict:
    """メロディ生成（Stage1, docs/design.md #12）。Cメジャー基準・拍・GMノートのJSONをClaudeに吐かせる。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容に合う8〜16拍の単旋律メロディ。"
    prompt = (
        "作曲家として、対象に合うメロディを作る。\n"
        '出力は JSON オブジェクトのみ：'
        '{"notes":[{"pitch":整数(C基準MIDI番号 60=C4), "start":拍(0始まりfloat), "dur":拍(float)}]}\n'
        "ハ長調(Cメジャー)基準・単旋律・8〜16拍。前置き/説明/コードフェンス禁止、JSONのみ。\n"
        f"{_style_block('melody', context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        notes = _extract_notes(text)
    except Exception:  # noqa: BLE001
        notes = []
    return {"content": {"notes": notes}}


def _extract_json(text: str) -> dict:
    """Claude出力から JSON オブジェクトを頑健に取り出す。"""
    raw = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if m:
        raw = m.group(1).strip()
    s, e = raw.find("{"), raw.rfind("}")
    if s != -1 and e != -1 and e > s:
        raw = raw[s : e + 1]
    return json.loads(raw)


def _style_examples(kind: str, context: str, k: int = 2) -> list:
    """作風寄せ（few-shot）。意味検索で近い過去ネタ(同種)の content を best-effort で集める。"""
    db = os.environ.get("CM_DB")
    if not context or not db:
        return []
    try:
        from urllib.parse import quote
        from urllib.request import urlopen

        from .db import connect

        base = os.environ.get("CM_SEARCH_URL", "http://127.0.0.1:8788")
        with urlopen(f"{base}/search?q={quote(context)}&k=8", timeout=5) as r:
            hits = json.load(r)
        conn = connect(db)
        out: list = []
        for h in hits:
            row = conn.execute(
                "SELECT kind, content FROM neta WHERE id=?", (h.get("neta_id"),)
            ).fetchone()
            if row and row["kind"] == kind and row["content"]:
                try:
                    out.append(json.loads(row["content"]))
                except Exception:  # noqa: BLE001
                    pass
            if len(out) >= k:
                break
        conn.close()
        return out
    except Exception:  # noqa: BLE001
        return []


def _style_block(kind: str, context: str) -> str:
    exs = _style_examples(kind, context)
    if not exs:
        return ""
    body = "\n".join(json.dumps(e, ensure_ascii=False) for e in exs)
    return f"\n# あなたの過去の作風（参考。真似しすぎない）\n{body}\n"


_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _root_pc(r) -> int:
    """コードのrootを 0–11 ピッチクラスへ（design #16 正準）。"C#"/"Db" 等も解釈。"""
    if isinstance(r, (int, float)):
        return int(r) % 12
    s = str(r).strip()
    if not s:
        return 0
    pc = _PC.get(s[0].upper(), 0)
    for ch in s[1:]:
        if ch in "#＃♯":
            pc += 1
        elif ch in "bｂ♭":
            pc -= 1
        else:
            break
    return pc % 12


def handle_gen_chord(params: dict) -> dict:
    """コード進行生成。C基準の記号(root+quality)・拍のJSONをClaudeに吐かせる。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容に合うコード進行（4〜8個）。"
    prompt = (
        "作曲家として、対象に合うコード進行を作る。\n"
        '出力は JSON のみ：{"chords":[{"root":"C".."B","quality":""or"m"or"7"or"maj7"or"m7"or"dim"or"sus4","start":拍float,"dur":拍float}]}\n'
        "ハ長調基準・4〜8個・前置き/説明/コードフェンス禁止、JSONのみ。\n"
        f"{_style_block('chord_progression', context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        data = _extract_json(text)
        chords = [
            {
                "root": _root_pc(c["root"]),
                "quality": str(c.get("quality", "")),
                "start": float(c["start"]),
                "dur": float(c["dur"]),
            }
            for c in (data.get("chords") or [])
            if isinstance(c, dict) and {"root", "start", "dur"} <= c.keys()
        ]
    except Exception:  # noqa: BLE001
        chords = []
    return {"content": {"chords": chords}}


def handle_gen_rhythm(params: dict) -> dict:
    """ドラムのリズム生成。GMドラムのステップグリッドJSONをClaudeに吐かせる。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容に合う1小節(16ステップ)のドラムパターン。"
    prompt = (
        "作曲家として、対象に合うドラムのリズムを作る。\n"
        '出力は JSON のみ：{"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}}\n'
        "GMドラム(Kick36/Snare38/HiHat42/OpenHat46/Clap39/Tom45)・16ステップ(0..15)・JSONのみ。\n"
        f"{_style_block('rhythm', context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        r = _extract_json(text).get("rhythm") or {}
        lanes = [
            {
                "name": str(la["name"]),
                "midi": int(la["midi"]),
                "hits": [int(h) for h in (la.get("hits") or []) if isinstance(h, (int, float))],
            }
            for la in (r.get("lanes") or [])
            if isinstance(la, dict) and "name" in la and "midi" in la
        ]
        rhythm = {"steps": int(r.get("steps", 16)), "lanes": lanes}
    except Exception:  # noqa: BLE001
        rhythm = {"steps": 16, "lanes": []}
    return {"content": {"rhythm": rhythm}}


def handle_research(params: dict) -> dict:
    """参考曲エージェント / 情報収集（docs/design.md #9・line 226）。
    テーマ→参考曲を構造化（title/artist/why/points）＋全体要約。必要なら web を使う。
    返り値 {summary, references[]}：summary は Chat/Tray の peek 互換、references はネタ化用。"""
    topic = params.get("topic") or params.get("context") or ""
    instruction = params.get("instruction") or f"「{topic}」の参考になる曲を挙げ、作曲面の学びをまとめる。"
    prompt = (
        "DTM/作曲のリサーチャーとして、必要なら web を使って調べる。\n"
        "テーマに対する参考曲を挙げ、各曲の作曲的な学び（コード進行/リズム/構成/音色など）を簡潔にまとめる。\n"
        '出力は JSON のみ：{"summary":"全体の要点（数行）",'
        '"references":[{"title":"曲名","artist":"アーティスト","why":"なぜ参考になるか","points":"作曲的ポイント"}]}\n'
        "references は2〜5曲。前置き/説明/コードフェンス禁止、JSONのみ。\n\n"
        f"# テーマ\n{topic}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt, timeout=180)
    try:
        data = _extract_json(text)
        summary = str(data.get("summary", "")).strip()
        references = [
            {
                "title": str(r["title"])[:120],
                "artist": str(r.get("artist", "")),
                "why": str(r.get("why", "")),
                "points": str(r.get("points", "")),
            }
            for r in (data.get("references") or [])
            if isinstance(r, dict) and r.get("title")
        ]
    except Exception:  # noqa: BLE001
        summary, references = text.strip(), []
    return {"summary": summary or text.strip(), "references": references}


def handle_plan(params: dict) -> dict:
    """おまかせ（plan）。依頼を実行可能な小タスク(intent)へ分解する。子ジョブは worker が enqueue する。"""
    request = params.get("instruction") or params.get("context") or ""
    prompt = (
        "あなたは作曲アシスタントのプランナー。依頼を実行可能な小タスクに分解する。\n"
        "使える intent: gen_melody / gen_chord / gen_rhythm / suggest / research\n"
        '出力は JSON のみ：{"subtasks":[{"intent":"...","params":{"context":"...","instruction":"..."}}]}\n'
        "2〜5個・各 params.context に対象内容・instruction に具体指示。JSONのみ。\n\n"
        f"# 依頼\n{request}"
    )
    text = claude_prompt(prompt)
    try:
        subs = _extract_json(text).get("subtasks") or []
        subtasks = [s for s in subs if isinstance(s, dict) and "intent" in s]
    except Exception:  # noqa: BLE001
        subtasks = []
    return {"subtasks": subtasks, "plan": f"{len(subtasks)}個のタスクに分解しました"}


HANDLERS: dict[str, Callable[[dict], dict]] = {
    "mora_count": handle_mora_count,
    "echo": handle_echo,
    "brainstorm": handle_brainstorm,
    "suggest": handle_suggest,
    "gen_melody": handle_gen_melody,
    "gen_chord": handle_gen_chord,
    "gen_rhythm": handle_gen_rhythm,
    "research": handle_research,
    "plan": handle_plan,
}
