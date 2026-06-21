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


def handle_consult(params: dict) -> dict:
    """相談（#61 統合）。Claudeに「会話/発展案/生成/多段」を判断させ判別ユニオンを返す。
    壁打ち(suggest)＋おまかせ(plan)を畳んだ Chat の単一窓口。空/不正は chat フォールバック。"""
    context = params.get("context", "")
    instruction = params.get("instruction") or "この内容について相談に乗って。"
    prompt = (
        "あなたは作曲アシスタント。ユーザーの発言に応じ、次のいずれか1つだけを JSON で返す"
        "（前置き・説明・コードフェンス禁止、JSONのみ）。\n"
        '- 会話・助言・壁打ち → {"type":"chat","text":"..."}\n'
        '- 発展案を複数 → {"type":"options","options":[{"title":"見出し","body":"本文"}]}（2〜4個）\n'
        "- 楽曲要素を作る（メロ/コード/リズムを作って等）→ "
        '{"type":"content","neta_kind":"melody|chord_progression|rhythm","content": その種類のJSON}\n'
        '    melody: {"notes":[{"pitch":整数(60=C4),"start":拍float,"dur":拍float}]}（ハ長調基準・単旋律）\n'
        '    chord_progression: {"chords":[{"root":"C".."B","quality":""or"m"or"7"or"maj7"or"m7"or"dim"or"sus4","start":拍float,"dur":拍float}]}（ハ長調基準）\n'
        '    rhythm: {"rhythm":{"steps":16,"lanes":[{"name":"Kick","midi":36,"hits":[0,4,8,12]}]}}（GMドラム）\n'
        "- 一式そろえる等の多段依頼 → "
        '{"type":"plan","subtasks":[{"intent":"gen_melody|gen_chord|gen_rhythm|gen_variations|research|collect","params":{"context":"...","instruction":"..."}}]}（2〜5個。N種類/ペアは gen_variations 1つで）\n'
        "判断基準：作って/生成して＝content、案・アイデア請求＝options、まとめて一式＝plan、それ以外＝chat。\n\n"
        f"# 対象\n{context}\n\n# 依頼\n{instruction}"
    )
    text = claude_prompt(prompt)
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
        "- gen_melody / gen_chord / gen_rhythm: メロ/コード/リズムを1つ生成する\n"
        "- gen_variations: 枠付きで**N種類のバリエーションを一括**生成（『6/8でコード進行を4種、各々に合うメロも』等）。"
        'params に count(個数)/kinds(["chord_progression","melody"]等)/structure("section"|"pair"|"flat")/frame{meter,key,tempo,bars,mood}\n'
        "- suggest: 既存内容への改善案を出す\n"
        "『N種類』『それぞれに合う』『ペア/セット』なら gen_variations を1つ使うのが最適（個別 gen_* を並べない）。\n"
        "必要なら『調べてから作る』のように順に並べてよい（例: research → gen_variations）。\n"
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
    "research": handle_research,
    "collect": handle_collect,
    "import_midi": handle_import_midi,
    "plan": handle_plan,
    "consult": handle_consult,
}
