"""ルールベース生成（#86）。まずコード進行＝機能和声で。

C基準で生成（design #14：chord も C基準保存・調はヒント）。frame.key/meter/bars/mood で
長短・拍長・小節数を決める。戻りは #85 の items 形。Claudeは関与しない（決定的）。
"""

import random

from .normalize import normalize_frame
from .theory import chord_pcs, norm_root, scale_pcs

# 度数 → (ルートpc, quality)。C基準（key=0）。
_DIATONIC_MAJOR = {1: (0, ""), 2: (2, "m"), 3: (4, "m"), 4: (5, ""), 5: (7, ""), 6: (9, "m"), 7: (11, "dim")}
_DIATONIC_MINOR = {1: (0, "m"), 2: (2, "dim"), 3: (3, ""), 4: (5, "m"), 5: (7, "7"), 6: (8, ""), 7: (10, "")}

# 機能 → 度数候補（先頭ほど主要：T=I, S=IV, D=V）
_FUNC_DEGREES = {"T": [1, 6, 3], "S": [4, 2], "D": [5, 7]}
# 機能の遷移（T/S/D マルコフ）。典型進行＝T→離れる(S/D優先)・S→D・D→T、で動きを出す。
_FUNC_NEXT = {
    "T": ["S", "S", "D", "D", "T"],   # トニックは離れやすく
    "S": ["D", "D", "D", "S", "T"],   # サブドミナント→ドミナント
    "D": ["T", "T", "T", "D"],        # ドミナント→トニックで解決
}

_MINOR_HINT = ("切な", "悲", "暗", "哀", "泣", "sad", "dark", "melanchol", "minor", "マイナー")


def _beats_per_bar(meter) -> float:
    """拍子 → 1小節の拍数（四分=1.0 単位）。4/4→4, 6/8→3, 3/4→3。"""
    try:
        n, d = str(meter).split("/")
        return int(n) * (4.0 / int(d))
    except Exception:  # noqa: BLE001
        return 4.0


def gen_chords(frame: dict | None = None, seed: int | None = None) -> dict:
    """機能和声ルールでコード進行を生成。返り #85 items 形：
    {items:[{kind:"chord_progression", content:{chords:[{root,quality,start,dur}]}, label}]}。"""
    frame = normalize_frame(frame)
    rng = random.Random(seed)
    mood = str(frame.get("mood") or "")
    minor = any(h in mood.lower() or h in mood for h in _MINOR_HINT)
    table = _DIATONIC_MINOR if minor else _DIATONIC_MAJOR
    b = frame.get("bars")
    try:
        bars = int(b) if isinstance(b, (int, float)) else 4
    except Exception:  # noqa: BLE001
        bars = 4
    bars = max(1, min(16, bars))  # 不正・範囲外は 1..16 に丸め（0/負も1へ・一貫）
    bpb = _beats_per_bar(frame.get("meter"))

    # 機能マルコフで度数列を作る（T始まり・T終わり）
    funcs = ["T"]
    for _ in range(bars - 1):
        funcs.append(rng.choice(_FUNC_NEXT[funcs[-1]]))
    if bars >= 2:
        funcs[-1] = "T"  # 終止＝主和音へ解決
    degrees = []
    for f in funcs:
        cands = _FUNC_DEGREES[f]
        # 主要度数を出やすく（先頭重み）
        degrees.append(rng.choices(cands, weights=[3, 2, 1][: len(cands)], k=1)[0])
    degrees[0] = 1  # 開始は主和音(I/i)
    if bars >= 2:
        degrees[-1] = 1  # 終止も主和音(I/i)で解決

    chords = []
    for i, deg in enumerate(degrees):
        root, quality = table[deg]
        chords.append({"root": root, "quality": quality, "start": round(i * bpb, 3), "dur": round(bpb, 3)})

    label = (mood + "コード進行").strip() if mood else ("マイナーの進行" if minor else "コード進行")
    return {"items": [{"kind": "chord_progression", "content": {"chords": chords}, "label": label[:24]}], "edges": []}


def _chord_at(t: float, chords):
    for c in chords or []:
        s = float(c.get("start", 0))
        d = float(c.get("dur", 0))
        if s <= t < s + d:
            return c
    return None


def gen_melody(frame: dict | None = None, chords=None, seed: int | None = None) -> dict:
    """#86 ルールベースのメロディ生成。コードトーン拘束＝拍頭はコードトーン、間はスケール音で
    順次つなぐ（コードに合うことを"保証"）。chords を渡せばそれに合わせる。C基準。返り #85 items 形。"""
    frame = normalize_frame(frame)
    rng = random.Random(seed)
    mood = str(frame.get("mood") or "")
    minor = any(h in mood.lower() or h in mood for h in _MINOR_HINT)
    scale = scale_pcs(0, "minor" if minor else "major")
    b = frame.get("bars")
    bars = max(1, min(16, int(b))) if isinstance(b, (int, float)) and b else 4
    bpb = _beats_per_bar(frame.get("meter"))
    total = max(1, int(round(bars * bpb)))

    notes = []
    prev = 72  # C5 付近から
    for beat in range(total):
        t = float(beat)
        ch = _chord_at(t, chords)
        downbeat = (beat % max(1, int(round(bpb)))) == 0
        if ch is not None and (downbeat or rng.random() < 0.7):
            allowed = chord_pcs(ch.get("root", 0), ch.get("quality", ""))  # 拍頭/大半はコードトーン
        else:
            allowed = scale  # 間はスケール音（経過/刺繍）
        cands = [p for p in range(prev - 7, prev + 8) if 60 <= p <= 84 and p % 12 in allowed]
        if not cands:
            cands = [p for p in range(60, 85) if p % 12 in allowed] or [prev]
        weights = [1.0 / (1 + abs(p - prev)) for p in cands]  # 小さい音程を優先（順次進行）
        prev = rng.choices(cands, weights=weights, k=1)[0]
        notes.append({"pitch": prev, "start": t, "dur": 1.0})

    label = (mood + "メロ").strip() if mood else "メロディ"
    return {"items": [{"kind": "melody", "content": {"notes": notes}, "label": label[:24]}], "edges": []}


def gen_bass(frame: dict | None = None, chords=None, seed: int | None = None) -> dict:
    """#86 ルールベースのベースライン。強拍=コードのルート、弱拍=5度（C2基準・低域）。
    コードに合うことを保証（root/5th はコードトーン）。melody kind で返す（notes content）。"""
    frame = normalize_frame(frame)
    b = frame.get("bars")
    bars = max(1, min(16, int(b))) if isinstance(b, (int, float)) and b else 4
    bpb = _beats_per_bar(frame.get("meter"))
    total = max(1, int(round(bars * bpb)))
    per_bar = max(1, int(round(bpb)))
    notes = []
    for beat in range(total):
        ch = _chord_at(float(beat), chords)
        root = norm_root(ch.get("root", 0)) if ch else 0
        pc = root if (beat % per_bar == 0) else (root + 7) % 12  # 強拍ルート / 弱拍5度
        notes.append({"pitch": 36 + pc, "start": float(beat), "dur": 1.0})  # C2(36)基準の低域
    return {"items": [{"kind": "melody", "content": {"notes": notes}, "label": "ベース"}], "edges": []}


# GMドラム番号
_GM = {"Kick": 36, "Snare": 38, "HiHat": 42, "OpenHat": 46}


def gen_drums(frame: dict | None = None, seed: int | None = None) -> dict:
    """#86 ルールベースのドラム（GMバックビート＋seedで小変化）。16ステップ1小節パターン。
    返り {items:[{kind:"rhythm", content:{rhythm:{steps,lanes}}}]}。"""
    frame = normalize_frame(frame)
    rng = random.Random(seed)
    kick = {0, 8}
    snare = {4, 12}
    hihat = {0, 2, 4, 6, 8, 10, 12, 14}  # 8分ハット
    # 小変化：キックを1つ足す（裏拍）／たまにオープンハット
    kick.add(rng.choice([6, 10, 11, 14]))
    # #84 S4 レーン既定ベロシティ＝ハットは打数多く煩いので控えめ（音量バランス）
    lanes = [
        {"name": "Kick", "midi": _GM["Kick"], "hits": sorted(kick), "vel": 115},
        {"name": "Snare", "midi": _GM["Snare"], "hits": sorted(snare), "vel": 105},
        {"name": "HiHat", "midi": _GM["HiHat"], "hits": sorted(hihat), "vel": 55},
    ]
    return {"items": [{"kind": "rhythm", "content": {"rhythm": {"steps": 16, "lanes": lanes}}, "label": "ドラム"}], "edges": []}
