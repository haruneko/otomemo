"""ルールベース生成（#86）。まずコード進行＝機能和声で。

C基準で生成（design #14：chord も C基準保存・調はヒント）。frame.key/meter/bars/mood で
長短・拍長・小節数を決める。戻りは #85 の items 形。Claudeは関与しない（決定的）。
"""

import random

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
    frame = frame or {}
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
