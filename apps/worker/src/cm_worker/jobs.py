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
import logging
import os
import re
from typing import Callable

log = logging.getLogger(__name__)

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


def _validate_notes(data: dict) -> list[dict]:
    """dict（{"notes":[...]}）から notes を整形（#61 consult / 変異提案の正規化で共有）。"""
    notes = data.get("notes") if isinstance(data, dict) else None
    out: list[dict] = []
    for n in notes or []:
        if isinstance(n, dict) and {"pitch", "start", "dur"} <= n.keys():
            out.append(
                {"pitch": int(n["pitch"]), "start": float(n["start"]), "dur": float(n["dur"])}
            )
    return out


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


def _validate_chords(data: dict) -> list[dict]:
    """dict（{"chords":[...]}）から chords を C基準で整形（#61 consult / 変異提案の正規化で共有）。"""
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


def _validate_rhythm(data: dict) -> dict:
    """dict（{"rhythm":{steps,lanes}}）から rhythm を整形（#61 consult / 変異提案の正規化で共有）。"""
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


HANDLERS: dict[str, Callable[[dict], dict]] = {
    "mora_count": handle_mora_count,
    "echo": handle_echo,
    "gen_chords_rule": handle_gen_chords_rule,
    "gen_pair_rule": handle_gen_pair_rule,
    "fit_to_chords": handle_fit_to_chords,
    "find_similar": handle_find_similar,
    "transform": handle_transform,
    "import_midi": handle_import_midi,
}
