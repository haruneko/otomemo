"""判定（#86 の要）：メロ×コードの当てはまり・調検出・進行の機能。

analyze_fit は純Python（高速・~0.01ms）。detect_key / analyze_progression は music21。
コードは入力で既知（content の root/quality）なので、和声推定の最難関を踏まない。
"""

from .normalize import normalize_chords
from .theory import KEY_NAMES, MAJOR_SCALE, MINOR_SCALE, chord_pcs, norm_root, scale_pcs


def _on_beat(start: float) -> bool:
    return abs(start - round(start)) < 1e-6


def _chord_at(t: float, chords: list[dict]):
    for c in chords:
        s = float(c.get("start", 0))
        d = float(c.get("dur", 0))
        if s <= t < s + d:
            return c
    return None


def _classify_nct(approach, departure) -> str:
    """非和声音の種類（到来/離脱の音程で）。経過/刺繍/掛留/その他。"""
    if approach is None or departure is None:
        return "other"
    a, b = approach, departure
    if a == 0 and -2 <= b < 0:
        return "suspension"  # 掛留：同音保続→下行解決
    if abs(a) <= 2 and abs(b) <= 2 and a != 0 and b != 0:
        if (a > 0) == (b > 0):
            return "passing"  # 経過：同方向の順次
        return "neighbor"     # 刺繍：逆方向（戻る）
    return "other"            # 跳躍がらみ（倚音/逸音等）＝要注意


def detect_key(notes: list[dict]) -> dict:
    """Krumhansl-Schmuckler で調を推定（music21）。空なら C major。"""
    if not notes:
        return {"key": 0, "mode": "major", "name": "C major"}
    try:
        from music21 import note as m21note
        from music21 import stream

        s = stream.Stream()
        for n in notes:
            nn = m21note.Note(int(n["pitch"]))
            nn.quarterLength = max(0.0625, float(n.get("dur", 1.0)))
            s.append(nn)
        k = s.analyze("key")
        return {"key": k.tonic.pitchClass, "mode": k.mode, "name": f"{k.tonic.name} {k.mode}"}
    except Exception:  # noqa: BLE001
        return {"key": 0, "mode": "major", "name": "C major"}


def analyze_fit(melody: list[dict], chords: list[dict], key: int | None = None) -> dict:
    """メロが各コードに当てはまっているかを定量化（"提案"の前提）。
    返り {in_chord_rate, non_chord_tones[{type,pos,pitch}], scale_outside_rate, score, issues[]}。"""
    notes = sorted([n for n in (melody or []) if "pitch" in n], key=lambda n: float(n.get("start", 0)))
    chords = normalize_chords(chords)  # #86 root音名→pc 等の揺れを吸収（口1/口2共通の正規化層）
    if not notes:
        return {"in_chord_rate": 0.0, "non_chord_tones": [], "scale_outside_rate": 0.0, "score": 0.0, "issues": []}

    det = detect_key(notes)
    key_pc = det["key"] if key is None else norm_root(key)  # "C" 等の文字列keyも許容
    mode = det["mode"]
    sc = scale_pcs(key_pc, mode)

    covered = 0.0       # コードが鳴っている区間の音価重み合計
    in_chord = 0.0      # うちコードトーン
    just_out = 0.0      # うち非和声音だが正当（経過/刺繍/掛留）
    total = 0.0
    outside = 0.0       # スケール外の音価
    ncts: list[dict] = []
    issues: list[dict] = []

    for i, n in enumerate(notes):
        pc = int(n["pitch"]) % 12
        start = float(n.get("start", 0))
        w = float(n.get("dur", 1.0)) * (1.5 if _on_beat(start) else 1.0)
        total += w
        if pc not in sc:
            outside += w
        c = _chord_at(start, chords)
        if c is None:
            continue  # コード無し区間は当てはまり判定の対象外
        covered += w
        if pc in chord_pcs(c.get("root", 0), c.get("quality", "")):
            in_chord += w
            continue
        # 非和声音：種類を判定
        approach = pc_interval(notes[i - 1], n) if i > 0 else None
        departure = pc_interval(n, notes[i + 1]) if i + 1 < len(notes) else None
        kind = _classify_nct(approach, departure)
        ncts.append({"type": kind, "pos": start, "pitch": int(n["pitch"])})
        if kind in ("passing", "neighbor", "suspension"):
            just_out += w
        else:
            issues.append(
                {"pos": start, "pitch": int(n["pitch"]), "type": kind,
                 "msg": f"{start:g}拍: {KEY_NAMES[pc]} がコード({_chord_label(c)})から浮いている(非和声音/その他)"}
            )

    in_chord_rate = (in_chord / covered) if covered else 0.0
    scale_outside_rate = (outside / total) if total else 0.0
    good = in_chord + 0.6 * just_out
    score = (good / covered) if covered else (1.0 - scale_outside_rate)
    score = max(0.0, min(1.0, score * (1.0 - 0.25 * scale_outside_rate)))
    if scale_outside_rate > 0.2:
        issues.append({"pos": -1, "pitch": -1, "type": "scale",
                       "msg": f"スケール外の音が多い({scale_outside_rate:.0%}・{det['name']})"})

    return {
        "key": key_pc, "mode": mode,
        "in_chord_rate": round(in_chord_rate, 3),
        "non_chord_tones": ncts,
        "scale_outside_rate": round(scale_outside_rate, 3),
        "score": round(score, 3),
        "issues": issues,
    }


def pc_interval(a: dict, b: dict) -> int:
    """a→b のピッチ差（半音・符号つき）。"""
    return int(b["pitch"]) - int(a["pitch"])


def _chord_label(c: dict) -> str:
    return f"{KEY_NAMES[int(c.get('root', 0)) % 12]}{c.get('quality', '')}"


def analyze_progression(chords: list[dict], key: int | None = None) -> dict:
    """コード進行の機能解析（ローマ数字・T/S/D）。music21。コードは既知なので高精度。"""
    out: list[dict] = []
    if not chords:
        return {"key": key or 0, "degrees": out}
    key_pc = 0 if key is None else int(key)
    try:
        from music21 import chord as m21chord
        from music21 import key as m21key
        from music21 import roman

        k = m21key.Key(KEY_NAMES[key_pc % 12])
        for c in chords:
            pcs = sorted(chord_pcs(c.get("root", 0), c.get("quality", "")))
            ch = m21chord.Chord([p + 60 for p in pcs])
            try:
                rn = roman.romanNumeralFromChord(ch, k)
                fig = rn.figure
                func = _function_of(rn.scaleDegree)
            except Exception:  # noqa: BLE001
                fig, func = "?", "?"
            out.append({"chord": _chord_label(c), "roman": fig, "function": func})
    except Exception:  # noqa: BLE001
        return {"key": key_pc, "degrees": [{"chord": _chord_label(c)} for c in chords]}
    return {"key": key_pc, "degrees": out}


def _function_of(degree: int) -> str:
    """音度→機能（T/S/D）。I/iii/vi=T、ii/IV=S、V/vii=D。"""
    return {1: "T", 3: "T", 6: "T", 2: "S", 4: "S", 5: "D", 7: "D"}.get(int(degree), "?")
