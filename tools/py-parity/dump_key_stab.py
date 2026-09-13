#!/usr/bin/env python3
"""py-parity dump（M6a-6a）＝鍵盤の「キックの隙間刺し」の参照値を JSON へ焼く。

源流は2本あるが**同じ知識**（計画 §4-3 R2＝二重計上しない）：
  - legacy：`ensemble.py` `rock_piano` の sheet 分岐（`:2128-2161`）＝comp_steps = onsets − kick・
    アクセントは vel 80／他 70・onsets ⊆ kick なら 1.5/3.5 拍（＝16分 step 6,14・vel 74/71）。
  - p11：`gesture/gesture_p11.py` `build_rock`（`:587-618`）＝同じ comp_steps・accents は role="anchor"・
    空なら slot 6,14。band=False（6b の低域譲りは範囲外）。
両方を同じ入力で走らせ、TS の1本（`keyStab.ts`）が両方と一致することを突き合わせる。

なぜデータ一致を主張してよいか：どちらも RNG を読まない（legacy の Breath は時刻/vel の揺れだけ＝
ここでは揺れ 0 の Breath を渡して打点と vel の骨だけ取り出す／build_rock は docstring が「level/rng/b 非依存」）。

使い方（otomemo リポジトリのルートから）：tools/py-parity/run_dump_key_stab.sh
⚠ phrase_maker は読むだけ・変更禁止。
"""
from __future__ import annotations

import json
import os
import sys
import types

PM_ROOT = os.path.expanduser("~/projects/phrase_maker")
_EXP = os.path.join(PM_ROOT, "experiments")
for _p in (
    os.path.join(_EXP, "bass_rock_riff", "chords"),
    os.path.join(_EXP, "bass_rock_riff"),
    os.path.join(_EXP, "bass_walking"),
    os.path.join(_EXP, "bass_walking", "v2"),
    os.path.join(_EXP, "drums", "gen2", "src"),
    os.path.join(_EXP, "piano", "gen2"),
    os.path.join(_EXP, "ensemble"),
    PM_ROOT,
):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import ensemble as ENS  # noqa: E402
from experiments.core.chart import RhythmSpec  # noqa: E402

G = ENS._load_gesture()  # 源流 ensemble が実際に掴む gesture_p11（isolated load）

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases-key-stab")
TEMPO = 120


class ZeroBreath:
    """揺れ 0（打点と vel の骨だけを取り出す）。"""

    def time_offset(self, t):
        return 0.0

    def vel_offset(self, t):
        return 0.0


ONSETS = {
    "o4": (0, 4, 8, 12),
    "orock": (0, 4, 6, 8, 10, 12, 14),
    "o8th": (0, 2, 4, 6, 8, 10, 12, 14),
    "odense": (0, 3, 4, 6, 8, 11, 12, 14),
    "ohalf": (0, 8),
    "opush": (0, 4, 8, 12, 14),
}
KICKS = {
    "kempty": (),
    "k08": (0, 8),
    "k4": (0, 4, 8, 12),
    "ksynco": (0, 6, 10),
    "kdense": (0, 3, 6, 8, 11, 14),
    "k8th": (0, 2, 4, 6, 8, 10, 12, 14),
}
ACCENTS = {"anone": (), "aback": (4, 12)}


def legacy_bar0(rs):
    chart = ENS.Chart("parity", "rock", "C", TEMPO, "straight", [("C", 4), ("Am", 4)], rhythm=rs)
    stem = ENS.rock_piano(chart, ZeroBreath())
    bd = chart.beat_dur()
    seen = []
    for n in stem.notes:
        beat = (n.start - 0.006) / bd
        if beat >= 4 - 1e-6:
            continue
        step = round(beat * 4)
        row = {"step": step, "vel": n.velocity}
        if row not in seen:
            seen.append(row)
    return seen


def rock_events(rs):
    vd = {"rh": [60, 64, 67], "bass": 36}
    container = types.SimpleNamespace(onsets=rs.onsets, kick=rs.kick, accents=rs.accents)
    events, tag = G.build_rock(vd, container, "mid", 0, None, False, 0)
    slots = []
    for e in events:
        if e["hand"] != "R":
            continue
        row = {"step": e["slot"], "role": e["role"]}
        if row not in slots:
            slots.append(row)
    lh = [{"step": e["slot"], "pitch": e["pitch"], "hold": e["hold"]} for e in events if e["hand"] == "L"]
    return slots, list(tag[1]), lh


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    cases = []
    for on, onsets in ONSETS.items():
        for kn, kick in KICKS.items():
            for an, acc in ACCENTS.items():
                cid = f"{on}__{kn}__{an}"
                rs = RhythmSpec(cid, 16, onsets, kick, acc)
                slots, comp_steps, lh = rock_events(rs)
                cases.append({
                    "id": cid,
                    "input": {"onsets": list(onsets), "kick": list(kick), "accents": list(acc)},
                    "build_rock": {"slots": slots, "comp_steps": comp_steps, "lh": lh},
                    "legacy": legacy_bar0(rs),
                })
    with open(os.path.join(OUT_DIR, "cases.json"), "w", encoding="utf-8") as fh:
        json.dump({
            "generated_by": "tools/py-parity/dump_key_stab.py",
            "source": "phrase_maker ensemble.py rock_piano sheet branch (:2128-2161) + piano/gesture/gesture_p11.py build_rock (:587-618, band=False)",
            "tempo": TEMPO,
            "cases": cases,
        }, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"dumped {len(cases)} cases -> {OUT_DIR}")


if __name__ == "__main__":
    main()
