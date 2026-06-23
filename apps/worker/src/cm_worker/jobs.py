"""ジョブのハンドラ登録簿（docs/design.md #16 意図カタログ）。

実現性が解けた intent から順にハンドラを足していく。
今は依存なしで確実なものだけ:
- mora_count: かな歌詞のモーラ数え（#13、長音ー/促音っ/撥音ん は各1モーラ）
- echo: 配管確認用
将来: embed / analyze_mp3 / generate_* / research / collect / plan ...
"""

import base64
import io
import json
import os
import re
import shutil
import signal
import subprocess
from typing import Callable

# 音楽ドメイン（生成/判定/補正/類似）は **TS 一本化**（アーキ是正 S2）。worker は api の /music/:op に
# 委譲する＝Python に二重実装しない。呼び出し側は従来の関数名のまま（in-process→HTTP に差し替え）。
from urllib.request import Request as _Request, urlopen as _urlopen

_CM_API_URL = os.environ.get("CM_API_URL") or f"http://{os.environ.get('CM_HOST') or '127.0.0.1'}:8787"


def _music(op: str, payload: dict):
    """api の TS 音楽エンジンに委譲（決定的記号エンジン）。None の引数は送らない（既定に委ねる）。"""
    body = json.dumps({k: v for k, v in payload.items() if v is not None}).encode()
    headers = {"Content-Type": "application/json"}
    tok = os.environ.get("CM_TOKEN")
    if tok:
        headers["x-cm-token"] = tok
    req = _Request(f"{_CM_API_URL}/music/{op}", data=body, headers=headers, method="POST")
    with _urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def gen_chords(frame=None, seed=None) -> dict:
    return _music("gen_chords", {"frame": frame, "seed": seed})


def gen_melody(frame=None, chords=None, seed=None) -> dict:
    return _music("gen_melody", {"frame": frame, "chords": chords, "seed": seed})


def gen_bass(frame=None, chords=None, seed=None) -> dict:
    return _music("gen_bass", {"frame": frame, "chords": chords})


def gen_drums(frame=None, seed=None) -> dict:
    return _music("gen_drums", {"frame": frame, "seed": seed})


def analyze_fit(melody, chords, key=None) -> dict:
    return _music("analyze_fit", {"melody": melody, "chords": chords, "key": key})


def fit_to_chords(melody, chords, key=None) -> dict:
    return _music("fit_to_chords", {"melody": melody, "chords": chords, "key": key})


def find_similar(target, candidates, top=5):
    return _music("find_similar", {"target": target, "candidates": candidates, "top": top})

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
# 旧 cm-music-mcp は廃止（アーキ是正 S2＝音楽ドメインTS一本化）。音楽ツールは creative-manager(TS) に集約。
# 後方互換: CM_MUSIC_MCP_URL が残っていても無視する（参照しない）。
# #102 S1 creative-manager MCP（既存ネタの読取面＋音楽ドメイン）。cold-start 無し＝claude -p が stdio で spawn。
# CM_MCP_STDIO_CMD が spawn コマンド、CM_MCP_STDIO_ARGS が JSON 配列の引数。CM_DB は環境継承で本番DB。
CM_MCP_STDIO_CMD = os.environ.get("CM_MCP_STDIO_CMD")
CM_MCP_STDIO_ARGS = os.environ.get("CM_MCP_STDIO_ARGS")
# creative-manager の許可ツール。**書込(create/update/delete/place_child/link)は意図的に除外**
# ＝Claude に書込口を与えない（変異は proposals→承認→TS core で1箇所適用・#102）。
# 音楽ツール(分析/生成)は純関数＝読取扱いで許可（cm-music の置換）。
_NETA_READ_TOOLS = [
    "list_neta", "get_neta", "facets", "get_composition", "get_relations",
    # 連想エンジン（read-only・#20）。
    "identify_progression", "analyze_progression", "explain_progression", "substitute_chord", "emotion_shift",
    "harmonize", "next_chord", "find_progressions",
    # 当てはまり判定/補正/調推定/類似（旧 cm-music の analysis を TS 集約）。
    "analyze_fit", "fit_to_chords", "detect_key", "melody_similarity", "find_similar",
    # 生成（決定的記号エンジン・TS一本化）。
    "gen_chords", "gen_melody", "gen_bass", "gen_drums", "gen_named_progression",
]


def _mcp_args() -> list[str]:
    """agentic Chat の claude -p に creative-manager MCP(stdio) を接続する引数（音楽ドメインTS一本化後）。
    CM_MCP_STDIO_CMD 未設定なら [] ＝後退ゼロ（dispatch にフォールバック）。--max-turns でループ打ち切り。"""
    if not CM_MCP_STDIO_CMD:
        return []
    servers = {
        "creative-manager": {
            "command": CM_MCP_STDIO_CMD,
            "args": json.loads(CM_MCP_STDIO_ARGS) if CM_MCP_STDIO_ARGS else [],
        }
    }
    allowed = [f"mcp__creative-manager__{t}" for t in _NETA_READ_TOOLS]
    cfg = json.dumps({"mcpServers": servers})
    max_turns = os.environ.get("CM_AGENTIC_MAX_TURNS", "8")
    return [
        "--mcp-config", cfg,
        "--allowedTools", ",".join(allowed),
        "--permission-mode", "bypassPermissions",
        "--max-turns", max_turns,
    ]


def claude_prompt(prompt: str, timeout: int = 120, tools: bool = False) -> str:
    """`claude -p`（print/非対話モード）をsubprocessで叩く。Max認証を流用＝APIキー不要。
    tools=True かつ CM_MCP_STDIO_CMD があれば creative-manager(TS) の音楽/読取ツールを agentic に使える。"""
    binary = shutil.which(CLAUDE_BIN) or CLAUDE_BIN
    args = [binary, "-p", prompt] + (_mcp_args() if tools else [])
    # start_new_session=True で子を新プロセスグループのリーダーに＝timeout 時に killpg で claude＋
    # 孫(MCP stdio = pnpm ... mcp)ごと殺す（孤児プロセス乱立を断つ・design「アーキ是正 決定4」）。
    proc = subprocess.Popen(
        args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True
    )
    try:
        out, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        proc.communicate()
        raise
    if proc.returncode != 0:
        raise RuntimeError(f"claude failed ({proc.returncode}): {(err or '').strip()[:300]}")
    return (out or "").strip()


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


def _validate_notes(data: dict) -> list[dict]:
    """dict（{"notes":[...]}）から notes を整形（#61 consult と handle_gen_melody で共有）。"""
    notes = data.get("notes") if isinstance(data, dict) else None
    out: list[dict] = []
    for n in notes or []:
        if isinstance(n, dict) and {"pitch", "start", "dur"} <= n.keys():
            out.append(
                {"pitch": int(n["pitch"]), "start": float(n["start"]), "dur": float(n["dur"])}
            )
    return out


def _extract_notes(text: str) -> list[dict]:
    """Claude出力テキストから {"notes":[{pitch,start,dur}]} を頑健に取り出す。"""
    raw = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if m:
        raw = m.group(1).strip()
    s, e = raw.find("{"), raw.rfind("}")
    if s != -1 and e != -1 and e > s:
        raw = raw[s : e + 1]
    return _validate_notes(json.loads(raw))


def handle_gen_melody(params: dict) -> dict:
    """メロディ生成（Stage1, docs/design.md #12）。Cメジャー基準・拍・GMノートのJSONをClaudeに吐かせる。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容に合う8〜16拍の単旋律メロディ。"
    prompt = (
        "作曲家として、対象に合うメロディを作る。\n"
        '出力は JSON オブジェクトのみ：'
        '{"notes":[{"pitch":整数(C基準MIDI番号 60=C4), "start":拍(0始まりfloat), "dur":拍(float)}]}\n'
        "ハ長調(Cメジャー)基準・単旋律・8〜16拍。前置き/説明/コードフェンス禁止、JSONのみ。\n"
        f"{_frame_block(params)}"
        f"{_fit_block(params)}"
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


_KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _frame_block(params: dict) -> str:
    """#85 S1 枠（frame）をプロンプトへ反映。content は C基準のまま、拍子/長さ/BPM/雰囲気の枠で作らせる。
    枠が無ければ空文字（従来通り）。指定したら最後まで効かせる（要件「指定したら効く」）。"""
    f = params.get("frame")
    if not isinstance(f, dict):
        return ""
    parts = []
    if f.get("meter"):
        parts.append(f"拍子={f['meter']}")
    if isinstance(f.get("bars"), (int, float)) and f["bars"] > 0:
        parts.append(f"長さ={int(f['bars'])}小節")
    if isinstance(f.get("tempo"), (int, float)) and f["tempo"] > 0:
        parts.append(f"BPM={int(f['tempo'])}")
    if f.get("mood"):
        parts.append(f"雰囲気={f['mood']}")
    key = f.get("key")
    if isinstance(key, int) and 0 <= key <= 11:
        parts.append(f"調={_KEY_NAMES[key]}（ただし出力ノートは C基準のまま）")
    if not parts:
        return ""
    return "# 枠（必ず守る）\n" + " / ".join(parts) + "\n"


def _fit_block(params: dict) -> str:
    """#85 S2b 合わせる相手(fit_context)をプロンプトへ。worker が解決済みなので handler はこれを尊重するだけ。"""
    fc = params.get("fit_context")
    if not isinstance(fc, dict):
        return ""
    parts = []
    if fc.get("mora_counts"):
        parts.append(f"各フレーズの音数(モーラ)={fc['mora_counts']} に合わせて音符の数を決める")
    if fc.get("lyric"):
        parts.append(f"歌詞:\n{fc['lyric']}")
    if fc.get("chords"):
        parts.append(f"このコード進行に合うように: {json.dumps(fc['chords'], ensure_ascii=False)}")
    if fc.get("notes"):
        parts.append(f"このメロディに合うように: {json.dumps(fc['notes'], ensure_ascii=False)}")
    if not parts:
        return ""
    return "# 合わせる相手（必ず尊重）\n" + "\n".join(parts) + "\n"


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
        f"{_frame_block(params)}"
        f"{_style_block('chord_progression', context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        chords = _validate_chords(_extract_json(text))
    except Exception:  # noqa: BLE001
        chords = []
    return {"content": {"chords": chords}}


def _validate_chords(data: dict) -> list[dict]:
    """dict（{"chords":[...]}）から chords を C基準で整形（#61 consult と handle_gen_chord で共有）。"""
    return [
        {
            "root": _root_pc(c["root"]),
            "quality": str(c.get("quality", "")),
            "start": float(c["start"]),
            "dur": float(c["dur"]),
        }
        for c in (data.get("chords") or [])
        if isinstance(c, dict) and {"root", "start", "dur"} <= c.keys()
    ]


def handle_gen_rhythm(params: dict) -> dict:
    """ドラムのリズム生成。GMドラムのステップグリッドJSONをClaudeに吐かせる。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容に合う1小節(16ステップ)のドラムパターン。"
    prompt = (
        "作曲家として、対象に合うドラムのリズムを作る。\n"
        '出力は JSON のみ：{"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}}\n'
        "GMドラム(Kick36/Snare38/HiHat42/OpenHat46/Clap39/Tom45)・16ステップ(0..15)・JSONのみ。\n"
        f"{_frame_block(params)}"
        f"{_style_block('rhythm', context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        rhythm = _validate_rhythm(_extract_json(text))
    except Exception:  # noqa: BLE001
        rhythm = {"steps": 16, "lanes": []}
    return {"content": {"rhythm": rhythm}}


def _validate_rhythm(data: dict) -> dict:
    """dict（{"rhythm":{steps,lanes}}）から rhythm を整形（#61 consult と handle_gen_rhythm で共有）。"""
    r = (data.get("rhythm") if isinstance(data, dict) else None) or {}
    lanes = [
        {
            "name": str(la["name"]),
            "midi": int(la["midi"]),
            "hits": [int(h) for h in (la.get("hits") or []) if isinstance(h, (int, float))],
        }
        for la in (r.get("lanes") or [])
        if isinstance(la, dict) and "name" in la and "midi" in la
    ]
    return {"steps": int(r.get("steps", 16)), "lanes": lanes}


def _variation_content(kind: str, v: dict):
    """1バリエーション dict から kind の content を組む（既存バリデータ再利用）。空なら None。"""
    try:
        if kind == "chord_progression":
            ch = _validate_chords(v)
            return {"chords": ch} if ch else None
        if kind == "melody":
            no = _validate_notes(v)
            return {"notes": no} if no else None
        if kind == "rhythm":
            r = _validate_rhythm(v)
            return {"rhythm": r} if r.get("lanes") else None
    except Exception:  # noqa: BLE001
        return None
    return None


def handle_gen_variations(params: dict) -> dict:
    """#85 S2a 構造を返す生成。1回の呼び出しで count 個のバリエーションを作り、各々が kinds の
    パーツ(コード/メロ/リズム)を持つ。structure(flat/pair/section)で items+edges へ組む。
    コード+メロは**同一呼び出しで噛み合わせる**（条件付けの基本形）。
    返り {items:[{kind,content,label}], edges:[{type,from,to,position?}]}。"""
    try:
        count = max(1, min(8, int(params.get("count") or 1)))
    except Exception:  # noqa: BLE001
        count = 1
    kinds = [
        k for k in (params.get("kinds") or ["chord_progression"])
        if k in ("chord_progression", "melody", "rhythm")
    ] or ["chord_progression"]
    structure = params.get("structure") or ("section" if len(kinds) > 1 else "flat")
    context = params.get("context", "")
    instruction = params.get("instruction") or ""

    field_desc = []
    if "chord_progression" in kinds:
        field_desc.append(
            '"chords":[{"root":"C".."B","quality":""or"m"or"7"or"maj7"or"m7"or"dim"or"sus4","start":拍,"dur":拍}]'
        )
    if "melody" in kinds:
        field_desc.append('"notes":[{"pitch":整数(C基準60=C4),"start":拍,"dur":拍}]')
    if "rhythm" in kinds:
        field_desc.append('"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}')
    fitline = (
        "各バリエーション内のコードとメロは互いに噛み合わせること。"
        if {"chord_progression", "melody"} <= set(kinds)
        else ""
    )
    prompt = (
        f"作曲家として、対象に合う**{count}種類**のバリエーションを作る。各バリエーションは下記パーツを持つ。\n"
        f"{fitline}ハ長調(C)基準・拍ベース。前置き/説明/コードフェンス禁止、JSONのみ。\n"
        '出力は JSON のみ：{"variations":[{"label":"短い見出し",' + ",".join(field_desc) + "}]}\n"
        f"{_frame_block(params)}"
        f"{_fit_block(params)}"
        f"{_style_block(kinds[0], context)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt, timeout=180)
    try:
        variations = _extract_json(text).get("variations") or []
    except Exception:  # noqa: BLE001
        variations = []

    items: list[dict] = []
    edges: list[dict] = []
    for v in variations[:count]:
        if not isinstance(v, dict):
            continue
        label = str(v.get("label") or "案")[:24]
        part_idx = []
        for k in kinds:
            content = _variation_content(k, v)
            if content is None:
                continue
            items.append({"kind": k, "content": content, "label": label})
            part_idx.append(len(items) - 1)
        if not part_idx:
            continue
        # #86 検品：コード+メロが揃ったら analyze_fit を melody item の meta に同梱（content は汚さない）
        by_kind = {items[pi]["kind"]: pi for pi in part_idx}
        if "chord_progression" in by_kind and "melody" in by_kind:
            mi, ci = by_kind["melody"], by_kind["chord_progression"]
            fr = params.get("frame") if isinstance(params.get("frame"), dict) else {}
            fit = analyze_fit(
                items[mi]["content"]["notes"], items[ci]["content"]["chords"], key=fr.get("key")
            )
            items[mi]["meta"] = {"fit": fit}
        if structure == "section":
            sec_i = len(items)
            items.append({"kind": "section", "label": label})  # container（content無し）
            for ord_, pi in enumerate(part_idx):
                edges.append({"type": "compose", "from": sec_i, "to": pi, "position": ord_})
        elif structure == "pair":
            for a in range(len(part_idx)):
                for b in range(a + 1, len(part_idx)):
                    edges.append({"type": "relation", "from": part_idx[a], "to": part_idx[b]})
    return {"items": items, "edges": edges}


def handle_gen_chords_rule(params: dict) -> dict:
    """#86 ルールベースのコード進行生成（機能和声・Claude非依存・決定的）。frame で長短/拍長/小節。
    返りは #85 items 形。Claude案(gen_chord)と判定器(analyze_progression)で比較するための"ルール案"。"""
    return gen_chords(params.get("frame"), seed=params.get("seed"))


def handle_find_similar(params: dict) -> dict:
    """#92 これに近い過去メロを探す（記号類似・移調不変）。target=params.melody or fit_context.notes。
    候補は params.candidates、無ければ DB の melody ネタ（最大200・自分は除く）。返り {similar:[{id,label,similarity}]}。"""
    fc = params.get("fit_context") if isinstance(params.get("fit_context"), dict) else {}
    target = params.get("melody") or fc.get("notes") or []
    candidates = params.get("candidates")
    if candidates is None:
        candidates = []
        db = os.environ.get("CM_DB")
        self_id = params.get("target_neta_id")
        if db:
            try:
                from .db import connect

                conn = connect(db)
                rows = conn.execute(
                    "SELECT id, title, content FROM neta WHERE kind='melody' LIMIT 200"
                ).fetchall()
                for r in rows:
                    if r["id"] == self_id:
                        continue
                    try:
                        c = json.loads(r["content"]) if r["content"] else {}
                    except Exception:  # noqa: BLE001
                        continue
                    if c.get("notes"):
                        candidates.append({"id": r["id"], "label": r["title"], "notes": c["notes"]})
                conn.close()
            except Exception:  # noqa: BLE001
                candidates = []
    return {"similar": find_similar(target, candidates, top=int(params.get("top") or 5))}


def handle_fit_to_chords(params: dict) -> dict:
    """#86後続 補正。外し音をコードに合わせて直す（決定的）。melody/chords は params 直接 or
    condition.fit_to 解決済みの fit_context（notes/chords）から。返り #85 items 形。"""
    fc = params.get("fit_context") if isinstance(params.get("fit_context"), dict) else {}
    melody = params.get("melody") or fc.get("notes") or []
    chords = params.get("chords") or fc.get("chords") or []
    frame = params.get("frame") if isinstance(params.get("frame"), dict) else {}
    return fit_to_chords(melody, chords, key=frame.get("key"))


def handle_gen_pair_rule(params: dict) -> dict:
    """#86 ルールのみで「コード進行＋伴奏パーツ(メロ/ベース/ドラム)」を count 案（Claude非依存・即時・
    当てはまり保証）。コードを土台に各パーツを拘束生成し、メロ/ベースは analyze_fit を meta に同梱。
    params.parts（既定["melody"]）で要素を選ぶ。返り #85 items 形。"""
    frame = params.get("frame") if isinstance(params.get("frame"), dict) else {}
    try:
        count = max(1, min(8, int(params.get("count") or 1)))
    except Exception:  # noqa: BLE001
        count = 1
    parts = [p for p in (params.get("parts") or ["melody"]) if p in ("melody", "bass", "drums")] or ["melody"]
    structure = params.get("structure") or "section"
    seed = params.get("seed")
    # #93 方向確認：confirm かつ複数案なら、まず1案だけ作り、残りは承認待ちに回す
    confirm = bool(params.get("confirm")) and count > 1
    gen_count = 1 if confirm else count
    items: list[dict] = []
    edges: list[dict] = []
    for i in range(gen_count):
        s = (seed + i) if isinstance(seed, int) else None
        chords = gen_chords(frame, seed=s)["items"][0]["content"]["chords"]
        label = f"案{i + 1}"
        part_idx = [len(items)]
        items.append({"kind": "chord_progression", "content": {"chords": chords}, "label": label})
        for part in parts:
            part_idx.append(len(items))
            if part == "melody":
                notes = gen_melody(frame, chords=chords, seed=s)["items"][0]["content"]["notes"]
                fit = analyze_fit(notes, chords, key=frame.get("key"))
                items.append({"kind": "melody", "content": {"notes": notes}, "label": label, "meta": {"fit": fit}})
            elif part == "bass":
                bn = gen_bass(frame, chords=chords, seed=s)["items"][0]["content"]["notes"]
                fit = analyze_fit(bn, chords, key=frame.get("key"))
                items.append({"kind": "bass", "content": {"notes": bn}, "label": f"{label}ベース", "meta": {"fit": fit}})
            elif part == "drums":
                dr = gen_drums(frame, seed=s)["items"][0]["content"]["rhythm"]
                items.append({"kind": "rhythm", "content": {"rhythm": dr}, "label": f"{label}ドラム"})
        if structure == "section":
            si = len(items)
            items.append({"kind": "section", "label": label})
            for pos, pi in enumerate(part_idx):
                edges.append({"type": "compose", "from": si, "to": pi, "position": pos})
        else:  # pair：コードと各パーツを related で結ぶ
            for pi in part_idx[1:]:
                edges.append({"type": "relation", "from": part_idx[0], "to": pi})
    out = {"items": items, "edges": edges}
    if confirm:
        # 1案はこのジョブで materialize 済み。残り count-1 案を承認待ちに（承認で answerJob が継続）。
        rest = dict(params)
        rest.update({"count": count - 1, "confirm": False, "seed": (seed + 1) if isinstance(seed, int) else None})
        out["_propose"] = {"ask": f"この方向でいい？（承認で残り{count - 1}案を作ります）",
                           "intent": "gen_pair_rule", "params": rest}
    return out


def handle_gen_lyric(params: dict) -> dict:
    """#85 S2c 歌詞生成。fit_context.mora_counts があれば音数に合わせる。frame.mood で雰囲気。
    返り {items:[{kind:"lyric", text, label}]}（count 案）。"""
    try:
        count = max(1, min(8, int(params.get("count") or 1)))
    except Exception:  # noqa: BLE001
        count = 1
    context = params.get("context", "")
    instruction = params.get("instruction") or "テーマに合う歌詞。"
    prompt = (
        f"作詞家として、対象に合う歌詞を**{count}案**作る。\n"
        '出力は JSON のみ：{"lyrics":["歌詞案1（改行可）","歌詞案2"]}\n'
        "前置き/説明/コードフェンス禁止、JSONのみ。\n"
        f"{_frame_block(params)}"
        f"{_fit_block(params)}"
        f"\n# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
    try:
        lyrics = _extract_json(text).get("lyrics") or []
    except Exception:  # noqa: BLE001
        lyrics = []
    items = [
        {"kind": "lyric", "text": ly, "label": (ly.splitlines()[0][:24] if ly.strip() else "歌詞案")}
        for ly in lyrics[:count]
        if isinstance(ly, str) and ly.strip()
    ]
    return {"items": items, "edges": []}


def handle_fetch(params: dict) -> dict:
    """#85 S2c 取ってくる（抽出）。参考(曲名/特徴/説明)から、その特徴的な部分を楽曲 content として
    推定し書き起こす（research の参考曲リストと違い content そのものを吐く）。返り {items}。"""
    target = params.get("target") or "chord_progression"
    context = params.get("context", "")
    is_mel = target == "melody"
    instruction = params.get("instruction") or (
        "この曲の象徴的なメロを推定して。" if is_mel else "この曲のコード進行を推定して。"
    )
    fmt = (
        '{"items":[{"label":"...","notes":[{"pitch":整数(C基準60=C4),"start":拍,"dur":拍}]}]}'
        if is_mel
        else '{"items":[{"label":"...","chords":[{"root":"C".."B","quality":"...","start":拍,"dur":拍}]}]}'
    )
    kind = "melody" if is_mel else "chord_progression"
    prompt = (
        f"DTM/作曲のアシスタントとして、参考から特徴的な{'メロディ' if is_mel else 'コード進行'}を"
        "**ハ長調(C)基準・拍ベース**で推定し書き起こす。\n"
        f"出力は JSON のみ：{fmt}\n前置き/説明/コードフェンス禁止、JSONのみ。\n"
        f"{_frame_block(params)}"
        f"\n# 参考\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt, timeout=180)
    try:
        raw = _extract_json(text).get("items") or []
    except Exception:  # noqa: BLE001
        raw = []
    items = []
    for it in raw:
        if not isinstance(it, dict):
            continue
        content = _variation_content(kind, it)
        if content is None:
            continue
        items.append({"kind": kind, "content": content, "label": str(it.get("label") or "抽出")[:24]})
    return {"items": items, "edges": []}


def handle_transform(params: dict) -> dict:
    """#85 S2c 変換（移調・拍子替え）＝AI不要の決定的処理。content は C基準保存なので、移調/拍子は
    frame（ヒント）の付け替えで表現する。元ネタ(fit_context)を写し、reapResults が job.params.frame を
    新ヒントとして付与する。返り {items:[{kind, content}]}（frame は reap が付ける）。"""
    fc = params.get("fit_context") or {}
    items = []
    if isinstance(fc.get("chords"), list) and fc["chords"]:
        items.append({"kind": "chord_progression", "content": {"chords": fc["chords"]}, "label": "変換"})
    if isinstance(fc.get("notes"), list) and fc["notes"]:
        items.append({"kind": "melody", "content": {"notes": fc["notes"]}, "label": "変換"})
    if isinstance(fc.get("rhythm"), dict) and fc["rhythm"].get("lanes"):
        items.append({"kind": "rhythm", "content": {"rhythm": fc["rhythm"]}, "label": "変換"})
    return {"items": items, "edges": []}


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


def handle_collect(params: dict) -> dict:
    """情報収集（#82・design#16 の「収集」）。research が「参考曲を調べる」のに対し、collect は
    テーマに沿って**試せる断片/アイデア**（コード進行例・リズム・歌詞フレーズ・音色/技法）を集める。
    出力は research と同じ {summary, references[]}＝reapResults が reference ネタとして回収する。"""
    topic = params.get("topic") or params.get("context") or ""
    instruction = params.get("instruction") or f"「{topic}」で試せる断片・アイデアを集める。"
    prompt = (
        "DTM/作曲のアシスタントとして、必要なら web を使い、テーマに沿って**すぐ試せる断片や"
        "アイデア**を集める（コード進行例・リズムパターン・歌詞フレーズ・音色や技法のヒント等）。\n"
        '出力は JSON のみ：{"summary":"集めた要点（数行）",'
        '"references":[{"title":"アイデア名","artist":"","why":"なぜ使えるか","points":"使い方/具体"}]}\n'
        "references は3〜6件。前置き/説明/コードフェンス禁止、JSONのみ。\n\n"
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


# GM ch10 ドラム番号 → レーン名（#81 取り込み rhythm 用）
_GM_DRUM = {
    35: "Kick", 36: "Kick", 37: "RimShot", 38: "Snare", 39: "Clap", 40: "Snare",
    41: "Tom", 43: "Tom", 45: "Tom", 47: "Tom", 48: "Tom", 50: "Tom",
    42: "HiHat", 44: "PedalHat", 46: "OpenHat", 49: "Crash", 57: "Crash", 51: "Ride", 53: "Ride",
}


def _track_notes_by_channel(track, tpb: int) -> dict:
    """1トラックの note_on/off を channel ごとの {pitch,start,dur,vel}(beats基準) に分解。"""
    by_ch: dict[int, list[dict]] = {}
    t = 0
    ongoing: dict[tuple[int, int], tuple[int, int]] = {}
    for msg in track:
        t += msg.time
        if msg.type == "note_on" and msg.velocity > 0:
            ongoing[(msg.channel, msg.note)] = (t, msg.velocity)
        elif msg.type == "note_off" or (msg.type == "note_on" and msg.velocity == 0):
            ch = getattr(msg, "channel", 0)
            st = ongoing.pop((ch, msg.note), None)
            if st is not None:
                start_tick, vel = st
                by_ch.setdefault(ch, []).append(
                    {
                        "pitch": msg.note,
                        "start": round(start_tick / tpb, 3),
                        "dur": round(max(1, t - start_tick) / tpb, 3),
                        "vel": vel,
                    }
                )
    return by_ch


def _drum_rhythm(notes: list[dict]) -> dict:
    """ドラムnote列 → rhythm content（pitchごとにlane、hitsは16分step）。"""
    lanes: dict[int, dict] = {}
    max_step = 0
    for n in notes:
        step = round(n["start"] * 4)
        max_step = max(max_step, step)
        lanes.setdefault(
            n["pitch"], {"name": _GM_DRUM.get(n["pitch"], f"Drum{n['pitch']}"), "midi": n["pitch"], "hits": set()}
        )["hits"].add(step)
    steps = max(16, ((max_step // 16) + 1) * 16)
    return {
        "rhythm": {
            "steps": steps,
            "lanes": [
                {"name": l["name"], "midi": l["midi"], "hits": sorted(l["hits"])}
                for l in sorted(lanes.values(), key=lambda x: -x["midi"])
            ],
        }
    }


def handle_import_midi(params: dict) -> dict:
    """MIDIをトラック×チャンネルで分割し melody/rhythm ネタの素材に（design#16）。
    params: {midi_b64, filename}。返り {tracks:[{kind,title,content}]}。
    ch10(0-index 9)=ドラム→rhythm、他=melody。コード進行の自動検出は後回し。"""
    import mido

    b64 = params.get("midi_b64") or ""
    fname = (params.get("filename") or "midi").rsplit("/", 1)[-1]
    base = re.sub(r"\.midi?$", "", fname, flags=re.I) or "midi"
    try:
        mid = mido.MidiFile(file=io.BytesIO(base64.b64decode(b64)))
    except Exception:  # noqa: BLE001
        return {"tracks": []}
    tpb = mid.ticks_per_beat or 480
    out: list[dict] = []
    for idx, track in enumerate(mid.tracks):
        tname = track.name.strip() if getattr(track, "name", "") else ""
        for ch, notes in _track_notes_by_channel(track, tpb).items():
            if not notes:
                continue
            label = tname or f"Track{idx + 1}"
            if ch == 9:
                out.append({"kind": "rhythm", "title": f"{base} - {tname or 'ドラム'}", "content": _drum_rhythm(notes)})
            else:
                out.append({"kind": "melody", "title": f"{base} - {label}", "content": {"notes": notes[:1000]}})
    return {"tracks": out[:24]}


_CONSULT_FALLBACK = "うまく汲み取れませんでした。もう少し具体的に教えてください。"
_CONSULT_CONTENT = {
    "melody": lambda d: {"notes": _validate_notes(d)},
    "chord_progression": lambda d: {"chords": _validate_chords(d)},
    "rhythm": lambda d: {"rhythm": _validate_rhythm(d)},
}


def _consult_nonempty(neta_kind: str, content: dict) -> bool:
    if neta_kind == "melody":
        return bool(content.get("notes"))
    if neta_kind == "chord_progression":
        return bool(content.get("chords"))
    if neta_kind == "rhythm":
        return bool(content.get("rhythm", {}).get("lanes"))
    return False


def hasmusic_or_text(item: dict) -> bool:
    """#86 S2b agentic item が中身を持つか（音楽content か text）。container はこの判定外。"""
    c = item.get("content") if isinstance(item.get("content"), dict) else {}
    if c.get("notes") or c.get("chords") or (c.get("rhythm") or {}).get("lanes"):
        return True
    return bool(isinstance(item.get("text"), str) and item.get("text", "").strip())


# #102 S2 既存ネタの変異提案（proposals）。**提案であって適用ではない**＝適用は承認後に web→既存HTTP
# 書込が1箇所で担う。worker は形だけ検証して返す（DBは読まない／書かない）。op ごとの必須 args：
_PROPOSAL_OPS = {
    "update_content": ("content",),  # args.content（新content）
    "transform": (),                  # args（移調/拍子等のパラメータ or 結果content）
    "fit_to": (),                     # args（補正パラメータ or 結果content）
    "place_child": ("parent_id",),    # 対象を parent の子として配置
    "remove_child": ("parent_id",),   # 対象を parent から外す
    "link": ("to_id",),               # 対象→to_id を関連付け
    "unlink": ("to_id",),             # 対象→to_id の関連を外す
    "delete": (),                     # 対象を削除（args 不要）
}


_CONTENT_OPS = ("update_content", "transform", "fit_to")


def _normalize_proposal_content(content):
    """変異 content を生成経路と同じ検証/正規化に通す（#102・design「素通しで updateNeta へ
    直行しない」）。content の形(notes/chords/rhythm)で判別し _validate_* を流用。音楽形なのに
    中身が空＝不正は None。非音楽(lyric text 等)はそのまま。"""
    if not isinstance(content, dict):
        return None
    if "notes" in content:
        notes = _validate_notes(content)
        return {"notes": notes} if notes else None
    if "chords" in content:
        chords = _validate_chords(content)
        return {"chords": chords} if chords else None
    if "rhythm" in content:
        rhythm = _validate_rhythm(content)
        return {"rhythm": rhythm} if rhythm.get("lanes") else None
    return content  # 非音楽 content は素通し可（lyric の text 更新等）


def _validate_proposals(raw: list) -> list[dict]:
    """proposal の配列を検証し、有効な要素だけを順序保持で返す（#43同型・要素ごとに落とす）。
    各要素は {op, target_id, args, rationale}。op 未知／target_id 欠落／必須 args 欠落は除外。
    content系 op の args.content は生成経路と同じ正規化に通す（不正な content の提案は落とす）。"""
    out: list[dict] = []
    for p in raw if isinstance(raw, list) else []:
        if not isinstance(p, dict):
            continue
        op = p.get("op")
        required = _PROPOSAL_OPS.get(op)
        if required is None:  # 未知 op
            continue
        target_id = p.get("target_id")
        if not (isinstance(target_id, (str, int)) and str(target_id).strip()):
            continue  # target_id 必須
        args = p.get("args") if isinstance(p.get("args"), dict) else {}
        if any(not args.get(k) for k in required):  # 必須 args 欠落
            continue
        # content系：content があれば正規化を通す。update_content は content 必須なので
        # 正規化失敗＝提案ごと落とす。transform/fit_to は content 任意（無ければ承認後にルールで適用）。
        if op in _CONTENT_OPS and "content" in args:
            norm = _normalize_proposal_content(args.get("content"))
            if norm is None:
                continue  # 不正 content の提案は落とす
            args = {**args, "content": norm}
        out.append({
            "op": op,
            "target_id": str(target_id),
            "args": args,
            "rationale": str(p.get("rationale", "")),
        })
    return out


def handle_consult(params: dict) -> dict:
    """相談（#61 統合）。Claudeに「会話/発展案/生成/多段」を判断させ判別ユニオンを返す。
    壁打ち(suggest)＋おまかせ(plan)を畳んだ Chat の単一窓口。空/不正は chat フォールバック。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容について相談に乗って。"
    agentic = bool(CM_MCP_STDIO_CMD)  # creative-manager(TS) の音楽/読取ツールが使えるか（cm-music廃止後）
    neta_read = bool(CM_MCP_STDIO_CMD)  # creative-manager read-only ツールで既存ネタを読めるか（#102 S1）
    tools = agentic or neta_read      # MCP を claude -p に載せるか（どちらかでも有れば載せる）
    # #routing A：楽曲生成は【特定 vs 汎用】を先に見分ける。
    # 特定(名前/参照/旋法/様式)はルールに渡さず Claude の知識でコードを書き起こす（ルールはダイアトニック
    # 度数表だけで丸の内のE7/Gm7等の非ダイアトニックを原理的に出せない）。汎用(枠だけ)はルールへ。
    specific = (
        "  ◆**特定/名前/参照/旋法/様式**（丸の内・カノン・小室・王道4536・ツーファイブ・ブルース(12小節)・"
        "ドリアン/リディアン等の旋法・『〇〇進行』『あの曲っぽい』など固有名や非ダイアトニックを含む）→"
        "**ルールに渡さず自分の知識で正確に書き起こす**。"
        '{"type":"content","neta_kind":"chord_progression",'
        '"content":{"chords":[{"root":"C".."B","quality":""or"m"or"7"or"maj7"or"m7"or"m7b5"or"dim"or"sus4","start":拍,"dur":拍}]}}'
        "（名前どおりの実コードを正確に。例 丸の内進行=FM7-E7-Am7-Gm7-C7）。迷ったら特定扱いで自分が書く。\n"
    )
    if agentic:
        music_block = (
            "- 楽曲を作る → まず【特定か汎用か】を見分ける：\n"
            f"{specific}"
            "  ◆特定が**名前付き定番進行**（丸の内/カノン/小室/王道4536/ツーファイブ/12小節ブルース 等）なら"
            "**gen_named_progression(name) を必ず使う**（記憶で書かない＝非ダイアトニックも正確に確定realize）。"
            "返りが {items:[]} の未知名のときだけ自分の知識で書く。\n"
            "  ◆**汎用/枠だけ/当てはめ**（明るい/切ない/6/8で/N個/このコードに合うメロ/一式 等、固有名なし）→"
            "**creative-manager のMCPツールを使う**（gen_chords→gen_melody→analyze_fit で点検→必要なら作り直す）。\n"
            '  いずれも最終結果を {"type":"items","items":[{"kind":"chord_progression|melody|bass|rhythm|section",'
            '"content":...,"label":"短い見出し"}],"edges":[{"type":"compose","from":idx,"to":idx,"position":数}]} で返す'
            "（特定で自分が書いた進行も analyze_fit で当てはまりを点検して所見を持つ）。frame.key は整数(0-11)。\n"
        )
    else:
        music_block = (
            "- 楽曲を作る → まず【特定か汎用か】を見分ける：\n"
            f"{specific}"
            "  ◆**汎用/枠だけ/当てはめ**（固有名なし・雰囲気＋構造の枠だけ）→ "
            '{"type":"plan","subtasks":[{"intent":"gen_pair_rule|gen_chords_rule|gen_lyric|fetch|transform|research|collect","params":{"frame":{...},"count":N,"parts":[...]}}]}'
            "（汎用の音符生成はルール gen_pair_rule 優先）\n"
        )
    # #102 S1：既存ネタを読む手段。read-only ツール(検索/読取)のみ＝在庫を踏まえて答えられる。
    # 書込は出来ない（変異は後続 S2 の proposals で承認制）。
    neta_block = (
        "- 既存ネタについて聞かれた／今ある素材を踏まえて答えたい → "
        "creative-manager のツールで読める（list_neta=一覧, get_neta=中身, facets=検索の軸, "
        "get_composition=曲の構成, get_relations=関連）。**読むだけ**（ツールでの書込は不可）。\n"
        "- コード進行について『これ何進行?／なぜ切ない・構造は?／○番目の代替は?／このコードもっと切なく・明るく』"
        "→ identify_progression（名前あて）/ explain_progression（度数・機能・終止の事実→君が「なぜ」を語る）/ "
        "substitute_chord（代替候補・実コードで）/ emotion_shift（単体の感情シフト）。**決定的に正しい候補が返る**ので"
        "それを元に選ぶ・説明する（自分で音を捏造しない）。\n"
        "- 既存ネタを**直す/配置する/関連づける/削除する**よう頼まれた → ツールで対象を読んで特定し、"
        "**変更は提案として返す**（その場では適用しない＝ユーザーが承認してから反映）：\n"
        '  {"type":"proposals","summary":"何をするかの要約","proposals":[{"op":..., "target_id":"対象ネタID", "args":{...}, "rationale":"理由"}]}\n'
        "  op と args：update_content{content:新content} / transform{...移調や拍子のパラメータ} / "
        "fit_to{...コードに合わせる補正} / place_child{parent_id,position} / remove_child{parent_id} / "
        "link{to_id,type} / unlink{to_id,type} / delete{}。target_id は read ツールで得た実在IDを使う。\n"
    )
    prompt = (
        "あなたは作曲アシスタント。ユーザーの発言に応じ、次のいずれか1つだけを JSON で返す"
        "（前置き・説明・コードフェンス禁止、JSONのみ）。\n"
        '- 会話・助言・壁打ち → {"type":"chat","text":"..."}\n'
        '- 発展案を複数 → {"type":"options","options":[{"title":"見出し","body":"本文"}]}（2〜4個）\n'
        f"{music_block}"
        f"{neta_block if neta_read else ''}"
        "判断基準：作って/生成して＝楽曲（特定/名前/旋法/様式なら自分で書く・汎用枠だけならルール）、"
        "案・アイデア請求＝options、それ以外＝chat。\n\n"
        f"# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt, timeout=240 if tools else 120, tools=tools)
    try:
        data = _extract_json(text)
    except Exception:  # noqa: BLE001
        return {"type": "chat", "text": text.strip()}  # 非JSON＝そのまま会話

    t = data.get("type") if isinstance(data, dict) else None
    if t == "chat":
        return {"type": "chat", "text": str(data.get("text", "")).strip() or _CONSULT_FALLBACK}
    if t == "options":
        opts = [
            {"title": str(o.get("title", ""))[:80], "body": str(o.get("body", ""))}
            for o in (data.get("options") or [])
            if isinstance(o, dict)
        ]
        return {"type": "options", "options": opts} if opts else {"type": "chat", "text": _CONSULT_FALLBACK}
    if t == "items":
        # #86 S2b agentic：ツールで推敲した一式。**items は index を保存（compact しない）**＝
        # edge の from/to(index) とズレないように。非dict だけ除く。実検証は reap(core.ts)が担う
        # （無効itemは null-idMap で詰めず index 保持・両端非nullでedge）。
        raw_items = data.get("items") if isinstance(data.get("items"), list) else []
        items = [it if isinstance(it, dict) else {} for it in raw_items]  # 非dict→空dict(reapで弾く)・index保存
        edges = [
            {"type": str(e.get("type", "relation")), "from": int(e["from"]), "to": int(e["to"]),
             **({"position": e["position"]} if isinstance(e.get("position"), (int, float)) else {})}
            for e in (data.get("edges") or [])
            if isinstance(e, dict) and isinstance(e.get("from"), int) and isinstance(e.get("to"), int)
        ]
        # 中身のある item が1つでもあるか（空dict だけなら chat フォールバック）
        has_real = any(
            it.get("kind") and (it.get("kind") in ("section", "song") or hasmusic_or_text(it))
            for it in items
        )
        return {"type": "items", "items": items, "edges": edges} if has_real else {"type": "chat", "text": _CONSULT_FALLBACK}
    if t == "proposals":
        # #102 S2 既存ネタの変異提案。検証して返すだけ（承認＝web、適用＝既存HTTP書込が1箇所）。
        props = _validate_proposals(data.get("proposals"))
        if not props:
            return {"type": "chat", "text": _CONSULT_FALLBACK}
        return {"type": "proposals", "summary": str(data.get("summary", "")), "proposals": props}
    if t == "content":
        nk = data.get("neta_kind")
        builder = _CONSULT_CONTENT.get(nk)
        if builder:
            try:
                content = builder(data.get("content") or {})
            except Exception:  # noqa: BLE001
                content = {}
            if _consult_nonempty(nk, content):
                return {"type": "content", "neta_kind": nk, "content": content}
        return {"type": "chat", "text": _CONSULT_FALLBACK}
    if t == "plan":
        subs = [
            s
            for s in (data.get("subtasks") or [])
            if isinstance(s, dict) and s.get("intent") and s.get("intent") != "consult"
        ]
        return (
            {"type": "plan", "subtasks": subs, "plan": f"{len(subs)}個のタスクに分解しました"}
            if subs
            else {"type": "chat", "text": _CONSULT_FALLBACK}
        )
    return {"type": "chat", "text": _CONSULT_FALLBACK}  # type 不明


def handle_plan(params: dict) -> dict:
    """おまかせ（plan）。依頼を実行可能な小タスク(intent)へ分解する。子ジョブは worker が enqueue する。"""
    request = params.get("instruction") or params.get("context") or ""
    prompt = (
        "あなたは作曲アシスタントのプランナー。依頼を実行可能な小タスクに分解する。\n"
        "使える intent と用途:\n"
        "- research: テーマの参考曲を調べて学びをまとめる（作る前の下調べ）\n"
        "- collect: 試せる断片/アイデア（コード進行例・リズム・歌詞フレーズ等）を集める\n"
        "■ 音符を作る生成は**ルールベースを優先**（音楽的な当てはまり・調・コードが保証される）:\n"
        "- gen_pair_rule: ルールのみで**コード進行＋それに合うパーツ(メロ/ベース/ドラム)を一式**生成。"
        'params: count(案の数)/parts(["melody"],["melody","bass","drums"]等)/structure("section"|"pair")/frame{meter,key,bars,mood}。'
        "『コードに合うメロ』『一式/セクションのラフ』『N案』はこれ1つ。"
        "ユーザーが方向を決めかねている/たくさん作る前に確認したそうなら params.confirm=true "
        "（まず1案だけ作って『この方向でいい?』と聞き、承認で残りを作る）。\n"
        "- gen_chords_rule: ルールのみでコード進行（機能和声）。frame{meter,key,bars,mood}\n"
        "- gen_lyric: 歌詞を作る（params.count／歌詞に合わせるなら condition）\n"
        "- fetch: 参考曲などからコード進行/メロを取ってくる（params.target）\n"
        "- transform: 既存ネタを移調/拍子替え（決定的・params.condition.fit_to＋frame）\n"
        "- suggest: 既存内容への改善案を出す ／ research/collect: 下調べ/収集\n"
        "（gen_melody/gen_chord/gen_rhythm/gen_variations は Claude生成で当てはまり保証が無いので、"
        "音楽生成は基本ルールベース(gen_pair_rule/gen_chords_rule)を選ぶ。）\n"
        "既存ネタに『合わせる/修正/変換』なら params.condition={fit_to:[netaのid], by:'syllable'|'harmony'} を付ける。\n"
        "必要なら『調べてから作る』のように順に並べてよい（例: research → gen_pair_rule）。\n"
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
    "gen_variations": handle_gen_variations,
    "gen_chords_rule": handle_gen_chords_rule,
    "gen_pair_rule": handle_gen_pair_rule,
    "fit_to_chords": handle_fit_to_chords,
    "find_similar": handle_find_similar,
    "gen_lyric": handle_gen_lyric,
    "fetch": handle_fetch,
    "transform": handle_transform,
    "research": handle_research,
    "collect": handle_collect,
    "import_midi": handle_import_midi,
    "plan": handle_plan,
    "consult": handle_consult,
}
