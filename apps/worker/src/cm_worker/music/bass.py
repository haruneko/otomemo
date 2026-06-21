"""ベース kind の相対モード解決（design「ベース kind=bass・2モード」S2）。

相対ベース＝度数をコードに当てて再生時に解決する依存型コンテンツ。
content: {mode:"relative", steps:N, pattern:[{step, degree, dur(step数)}]}。
語彙 degree ∈ {R, 3, 5, 7, 8, approach}（これ以上増やさない）。
オクターブは自動（選ばせない）＝エレキ4弦ベース準拠。最低音 E1(MIDI 28)、
最低オクターブ帯 E1..D#2(MIDI 28..39)。各度数の pc をこの帯の代表音へ＝band(pc)。
解決後は melody と同じ notes 形（実音高で解決済み）になり、同じ経路で鳴る。
"""

from .theory import QUALITY_INTERVALS, chord_pcs, norm_root

BASS_FLOOR = 28          # E1（エレキ4弦ベースの最低音）
_STEP_TO_BEAT = 0.25     # 1step=16分=0.25拍

# degree → コード品質インターバルの「何度目か」（3=3度=index1, 5=5度=index2, 7=7度=index3）
_DEGREE_CHORD_INDEX = {"3": 1, "5": 2, "7": 3}


def band(pc: int) -> int:
    """ピッチクラス(0-11)を最低オクターブ帯 E1..D#2(28..39) の代表音 MIDI へ。
    band(pc)=28+((pc-4) mod 12)。E(4)→28（床）, C(0)→36, G(7)→31。"""
    return BASS_FLOOR + ((int(pc) - 4) % 12)


def _chord_at(t: float, chords):
    """拍 t でアクティブなコードを引く（無ければ None）。"""
    for c in chords or []:
        s = float(c.get("start", 0))
        d = float(c.get("dur", 0))
        if s <= t < s + d:
            return c
    return None


def _degree_pc(degree: str, root: int, quality: str) -> int | None:
    """度数→ピッチクラス。R=ルート、3/5/7=コードトーン（quality から）、8=ルート。
    approach は文脈依存なのでここでは扱わない（None を返す対象外）。"""
    if degree in ("R", "8"):
        return root
    idx = _DEGREE_CHORD_INDEX.get(degree)
    if idx is None:
        return root  # 未知度数はルート扱い（安全）
    ivals = QUALITY_INTERVALS.get(str(quality), [0, 4, 7])
    if idx < len(ivals):
        return (root + ivals[idx]) % 12
    # コードに該当度数が無い（トライアドの7度など）→ 在和音から近いトーンへフォールバック
    pcs = sorted(chord_pcs(root, quality))
    return pcs[min(idx, len(pcs) - 1)]


def _next_root_pc(entries, i: int, chords, key: int) -> int:
    """approach 用：次の「解決ルート」pc を引く＝歩くベースが向かう先。
    まず次のコードチェンジ（このエントリ以降に始まり root が変わる最初のコード）のルートへ寄せる。
    無ければ次エントリ位置のコード、それも無ければ現コード、最後に key の tonic。"""
    t = float(entries[i].get("step", 0)) * _STEP_TO_BEAT
    cur = _chord_at(t, chords)
    cur_root = norm_root(cur.get("root", 0)) if cur is not None else int(key) % 12
    # このエントリより後に始まる、ルートが変わる最初のコードへ向かう
    for c in sorted(chords or [], key=lambda x: float(x.get("start", 0))):
        s = float(c.get("start", 0))
        r = norm_root(c.get("root", 0))
        if s > t and r != cur_root:
            return r
    # コードが進まない（単体プレビュー等）→ 次エントリ位置のコード or 現コード
    if i + 1 < len(entries):
        nt = float(entries[i + 1].get("step", 0)) * _STEP_TO_BEAT
        nc = _chord_at(nt, chords)
        if nc is not None:
            return norm_root(nc.get("root", 0))
    return cur_root


def resolve_relative_bass(pattern, chords=None, key: int | None = None):
    """相対ベースの pattern をコード(or key の tonic)に当てて実音高 notes へ解決。

    各 pattern エントリ {step, degree, dur(step数)} を、step の拍位置でアクティブなコードへ当て、
    degree→pc→band で E1..D#2 帯へ配置。8 は +12（ルート帯+1oct）。approach は次の解決ルートへ
    半音で寄せる（直前音に近い側）。床(28)未満は出さない。返りは melody と同じ {pitch,start,dur}。
    chords が空/None なら key の tonic を I コードとみなす（単体プレビュー）。
    """
    if not pattern:
        return []
    k = int(key) % 12 if key is not None else 0
    entries = sorted(pattern, key=lambda e: float(e.get("step", 0)))
    notes = []
    prev_pitch = None
    for i, e in enumerate(entries):
        step = float(e.get("step", 0))
        start = round(step * _STEP_TO_BEAT, 3)
        dur = round(float(e.get("dur", 1)) * _STEP_TO_BEAT, 3)
        degree = str(e.get("degree", "R"))
        ch = _chord_at(start, chords)
        root = norm_root(ch.get("root", 0)) if ch is not None else k
        quality = str(ch.get("quality", "")) if ch is not None else ""

        if degree == "approach":
            target_pc = _next_root_pc(entries, i, chords, k)
            target = band(target_pc)
            up, down = target + 1, target - 1
            ref = prev_pitch if prev_pitch is not None else target
            # 解決先へ半音で寄せる＝target±1 のうち直前音に近い側
            pitch = up if abs(up - ref) <= abs(down - ref) else down
        else:
            pc = _degree_pc(degree, root, quality)
            pitch = band(pc)
            if degree == "8":
                pitch += 12

        # 床(28)より下は出さない（approach の半音下などをオクターブ上げで救済）
        while pitch < BASS_FLOOR:
            pitch += 12
        notes.append({"pitch": pitch, "start": start, "dur": dur})
        prev_pitch = pitch
    return notes
