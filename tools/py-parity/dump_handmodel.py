#!/usr/bin/env python3
"""py-parity dump（M6a-6d）＝phrase_maker `experiments/piano/fingersim/handmodel.py`（手の物理モデル）の参照値を JSON へ焼く。

なぜデータ一致を主張してよいか（計画 §6-1）：`import itertools` のみ・RNG 0件・`round()` は6箇所（:120,121,261,262,305,306）
＝TS 側は銀行家丸め（Python の round(x, 4) と同じ規則）で突き合わせる。

定数の出典（handmodel.py:12-19 のヘッダ）：pianoplayer（marcomusy）hand.py の frest/weights/bfactor/最大ストレッチ閾値
＝MIT License（Copyright (c) 2017 Marco Musy）。帰属は otomemo リポジトリ直下の NOTICE.md。Parncutt et al. 1997 の reach 表。

ケースは全部**列挙で決める**（乱数なし）。使い方：tools/py-parity/run_dump_handmodel.sh
⚠ phrase_maker は読むだけ・変更禁止。
"""
from __future__ import annotations

import importlib.util
import itertools
import json
import os

PM_ROOT = os.path.expanduser("~/projects/phrase_maker")
SRC = os.path.join(PM_ROOT, "experiments", "piano", "fingersim", "handmodel.py")
_spec = importlib.util.spec_from_file_location("_parity_handmodel", SRC)
HM = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(HM)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases-handmodel")


def ba_json(r):
    if r is None:
        return None
    return {"cost": r["cost"], "assign": [[f, p] for f, p in r["assign"].items()], "wrist_x": r["wrist_x"], "span": r["span"]}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    out = {
        "generated_by": "tools/py-parity/dump_handmodel.py",
        "source": "phrase_maker experiments/piano/fingersim/handmodel.py (pianoplayer-derived constants: MIT, Copyright (c) 2017 Marco Musy)",
        "constants": {
            "FREST": HM.FREST, "WEIGHTS": HM.WEIGHTS, "BFACTOR": HM.BFACTOR,
            "WEAK": [[k, v] for k, v in HM.WEAK.items()],
            "REACH": [[list(k), list(v)] for k, v in HM.REACH.items()],
            "REACH6": [[list(k), list(v)] for k, v in HM.REACH6.items()],
            "MAXPRAC_15": HM.MAXPRAC_15, "SOLO_BAND": HM.SOLO_BAND, "THUMB_PASS_PENALTY": HM.THUMB_PASS_PENALTY,
        },
    }

    # best_assignment / can_grab：1〜3音は窓 0..17 を全列挙、4音は間引き、5音（None）も少し。基準音は白鍵 60・黒鍵 61。
    ba = []
    for base in (60, 61):
        for n in (1, 2, 3, 4, 5):
            combos = list(itertools.combinations(range(0, 18), n))
            if n == 4:
                combos = combos[::7]
            elif n == 5:
                combos = combos[::400]
            for c in combos:
                ps = [base + x for x in c]
                for hand in ("R", "L"):
                    ba.append({"pitches": ps, "hand": hand, "out": ba_json(HM.best_assignment(ps, hand)), "can": HM.can_grab(ps, hand)})
    # 並び不問・重複・空（sorted(set(int(p)))）
    for ps in ([67, 60, 64], [60, 60, 64], [], [64.0, 60.0]):
        for hand in ("R", "L"):
            ba.append({"pitches": ps, "hand": hand, "out": ba_json(HM.best_assignment(ps, hand)), "can": HM.can_grab(ps, hand)})
    out["best_assignment"] = ba

    # assignment_cost：指と音の組を直に（到達不能の None を含む）
    ac = []
    for fingers in itertools.combinations(range(1, 6), 2):
        for d in range(0, 19):
            for base in (60, 61):
                for hand in ("R", "L"):
                    pairs = [[fingers[0], base], [fingers[1], base + d]]
                    r = HM.assignment_cost([tuple(p) for p in pairs], hand)
                    ac.append({"pairs": pairs, "hand": hand, "out": None if r is None else list(r)})
    out["assignment_cost"] = ac

    out["shift_cost"] = [{"a": a, "b": b, "out": HM.shift_cost(a, b)} for a in (60.0, 61.5, 64.25) for b in (55.0, 58.0, 59.0, 60.0, 61.9, 62.0, 64.99, 65.0, 69.5)]
    out["is_black"] = [{"p": p, "out": HM.is_black(p)} for p in range(-13, 25)]
    out["thumb_cross_span"] = [{"f": f, "out": HM.thumb_cross_span(f)} for f in (2, 3, 4, 5)]
    out["reach_band"] = [{"lo": lo, "hi": hi, "mode": m, "out": list(HM._reach_band(lo, hi, m))} for (lo, hi) in HM.REACH for m in ("comfort", "stretch", "relaxed")]

    # free_finger_reach：held 有り（交差で空になる所を含む）／held 無し（SOLO_BAND＝round が効く）
    ffr = []
    assigns = [{1: 60, 3: 64, 5: 67}, {1: 60}, {2: 62, 4: 65}, {1: 61, 5: 78}, {3: 63}, {1: 60, 2: 61, 3: 62}]
    for a in assigns:
        keys = sorted(a)
        helds = [[]] + [[k] for k in keys] + [keys]
        for held in helds:
            for finger in range(1, 6):
                for hand in ("R", "L"):
                    for mode in ("comfort", "stretch", "relaxed"):
                        ffr.append({"assign": [[f, p] for f, p in a.items()], "held": held, "finger": finger, "hand": hand, "mode": mode,
                                    "out": list(HM.free_finger_reach(a, held, finger, hand, mode))})
    out["free_finger_reach"] = ffr

    # constrained_assignment
    ca = []
    helds = [{}, {1: 60}, {3: 64}, {5: 72}, {1: 60, 5: 72}, {2: 62, 3: 64}, {1: 48, 2: 50, 3: 52}]
    news = [[62], [64, 67], [55], [70, 74], [61, 63, 66], [66], [59, 76]]
    for h in helds:
        for nps in news:
            for hand in ("R", "L"):
                ca.append({"held": [[f, p] for f, p in h.items()], "new": nps, "hand": hand, "out": ba_json(HM.constrained_assignment(h, nps, hand))})
    out["constrained_assignment"] = ca

    # partial_cost
    pc = []
    for h in ({1: 60, 5: 72}, {3: 64}, {}, {2: 61, 4: 66}):
        for finger in range(1, 6):
            for pitch in (55, 58, 60, 61, 63, 66, 70, 73, 80):
                for hand in ("R", "L"):
                    pc.append({"assign": [[f, p] for f, p in h.items()], "held": sorted(h), "finger": finger, "pitch": pitch, "hand": hand,
                               "out": HM.partial_cost(h, sorted(h), finger, pitch, hand)})
    out["partial_cost"] = pc

    # held_still_feasible
    hs = []
    # 末尾3つ＝両指とも休止位置の帯（SOLO_BAND）内なのに組の MaxPrac を超える＝(b) の間引きが効く所（x=60 で 4-5／3-4／2-3）。
    for h in ({1: 60, 3: 64, 5: 67}, {1: 60, 5: 78}, {2: 62, 4: 65}, {1: 55, 2: 70, 3: 71}, {4: 66},
              {4: 61, 5: 67}, {3: 58, 4: 64}, {2: 55, 3: 62}):
        for x in (58.0, 60.0, 62.5, 64.0, 66.0, 71.0):
            for hand in ("R", "L"):
                hs.append({"held": [[f, p] for f, p in h.items()], "x": x, "hand": hand, "out": sorted(HM.held_still_feasible(h, x, hand))})
    out["held_still_feasible"] = hs

    with open(os.path.join(OUT_DIR, "handmodel.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        fh.write("\n")
    print("dumped", {k: len(v) for k, v in out.items() if isinstance(v, list)})


if __name__ == "__main__":
    main()
