"""#86後続 補正：外し音をコードトーンへ寄せる（決定的）。

analyze_fit で「other（跳躍がらみ＝正当でない非和声音）」と判定された音だけを、その時刻のコードの
最寄り構成音へスナップする。経過/刺繍/掛留（正当な非和声音）とコードトーンは触らない。
"""

from .analyze import analyze_fit
from .normalize import normalize_chords
from .theory import chord_pcs


def _nearest_pitch(pitch: int, allowed_pcs: set[int]) -> int:
    """pitch に最も近い MIDI 音で、ピッチクラスが allowed_pcs に入るもの（±6半音内、無ければ元のまま）。"""
    for d in range(0, 7):
        for cand in ((pitch - d), (pitch + d)) if d else (pitch,):
            if 0 <= cand <= 127 and cand % 12 in allowed_pcs:
                return cand
    return pitch


def fit_to_chords(melody: list[dict], chords: list[dict], key: int | None = None) -> dict:
    """非和声音のうち正当でない(other)音をコードトーンへスナップ。返り #85 items 形（補正済み melody）と
    meta に before/after の当てはまり。経過/刺繍/掛留・コードトーンは不変。"""
    notes = sorted([n for n in (melody or []) if "pitch" in n], key=lambda n: float(n.get("start", 0)))
    chords = normalize_chords(chords)
    before = analyze_fit(notes, chords, key)
    bad = {round(float(n.get("pos", -999)), 3) for n in before["non_chord_tones"] if n["type"] == "other"}

    def chord_at(t):
        for c in chords:
            if float(c["start"]) <= t < float(c["start"]) + float(c["dur"]):
                return c
        return None

    out = []
    for n in notes:
        t = round(float(n.get("start", 0)), 3)
        ch = chord_at(t)
        if ch is not None and t in bad:
            tones = chord_pcs(ch["root"], ch["quality"])
            out.append({**n, "pitch": _nearest_pitch(int(n["pitch"]), tones)})
        else:
            out.append(dict(n))

    after = analyze_fit(out, chords, key)
    return {
        "items": [{"kind": "melody", "content": {"notes": out}, "label": "補正",
                   "meta": {"fit_before": before["score"], "fit": after}}],
        "edges": [],
    }
