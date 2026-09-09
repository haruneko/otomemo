#!/usr/bin/env python3
"""py-parity dump（M3-3b）＝phrase_maker `chord_follow` の5ガードの参照値を JSON へ焼く。

なぜデータ一致を主張してよいか（計画 §6-1 の2行目）：`chord_follow` の base line と diverge は
**RNG 0件**（`networkx` は `solve_fingering` のメトリクス用に import されているだけで音の経路では未使用）。
つまり `build_line`＋`apply_boundaries` は純関数＝列で突き合わせられる。

使い方（otomemo リポジトリのルートから）：
    tools/py-parity/run_dump_chord_follow.sh

出力＝`tools/py-parity/cases-chord-follow/<id>.json`（1ケース1ファイル・コミット対象）。
  input    … 1小節セル列（文法を2小節→2セルへ割ったもの）・コード区間（root_pc/quality/chord_tones）・窓
  expected … `build_line`（①強拍コードトーン強制＋度数 remap）→`apply_boundaries`（③区間末の接近音化）
             を通したあとの (step, pitch, kind, anchor, role) 列＋`validate` の主要メトリクス

⚠ 一次資料は `bass_rock_riff/chords/chord_follow.py` と `chords_theory.py`。**phrase_maker は読むだけ・変更禁止**。
   sys.path の順は `dump_bass_anchor_lock.py`（3g）と同じものを焼いてある（計画 §11-2）。
"""
from __future__ import annotations

import json
import os
import sys

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

import chords_theory as CT   # noqa: E402
import chord_follow as CF    # noqa: E402
import theory as TH          # noqa: E402
import fretboard as FB       # noqa: E402  LOW_LIMIT / HIGH_LIMIT（④演奏可能域）

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases-chord-follow")

GRAMMARS = ["pedal_answer", "gallop_pedal", "octave_call_response"]

# 進行＝**クオリティ表を踏ませる**ために選ぶ（層B 25 クオリティのうち otomemo と重なる面を広く踏む）。
PROGS = {
    "amfcg":    ("Am F C G", 1.0),                   # 三和音・1小節1コード
    "sevenths": ("Dm7 G7 Cmaj7 A7", 1.0),            # 7th＝b7/3度の remap が効く
    "fast":     ("C Am F G", 0.5),                   # 半小節1コード＝step 粒度の読み
    "altered":  ("Caug F#dim7 Bm7b5 E7b9", 1.0),     # 5度族が♮5でない＝remap_deg の分岐
    "suspow":   ("C5 Dsus4 Gsus2 Aadd9", 1.0),       # 3度を持たない＝has_third の分岐
    "colour":   ("Ebmaj9 Am6 D7b5 G7#5", 1.0),       # 6th/9th/whole-tone スケール
}

CASES = []
for gname in GRAMMARS:
    for pname, (prog, bpc) in PROGS.items():
        for loop in (True, False):
            CASES.append({
                "id": f"{gname}__{pname}__{'loopA' if loop else 'loopB'}",
                "grammar": gname,
                "progression": prog,
                "bars_per_chord": bpc,
                "loop": loop,
            })


def dump_case(case: dict) -> dict:
    chords = CT.parse_progression(case["progression"])
    segs, total_steps = CF.segment(chords, case["bars_per_chord"])
    cells = CF._bar_cells(case["grammar"])          # 2小節文法 → 1小節セル×2（源流 `:83-90`）
    onsets, base = CF.build_line(case["grammar"], segs, total_steps)
    pitches = list(base)
    before_roles = [o["role"] for o in onsets]
    approaches = CF.apply_boundaries(onsets, pitches, segs, loop=case["loop"])
    metrics = CF.validate(onsets, pitches, loop=case["loop"])
    inp = {
        "steps_per_bar": CF.STEPS_PER_BAR,
        "total_steps": total_steps,
        "reg_lo": TH.REG_LO,
        "reg_hi": TH.REG_HI,
        "low_limit": FB.LOW_LIMIT,
        "high_limit": FB.HIGH_LIMIT,
        "loop": case["loop"],
        "cells": [
            [{"step": s, "kind": k, "deg": d, "anchor": bool(a), "role": r}
             for (s, k, d, a, r) in cell]
            for cell in cells
        ],
        "segs": [
            {"root_pc": s.chord.root_pc, "quality": s.chord.quality,
             "bass_pc": s.chord.bass_pc,
             "chord_tones": list(CT.CHORD_TONES[s.chord.quality]),
             "scale": sorted(s.chord.scale_offsets()),
             "start_step": s.start_step, "length_steps": s.length_steps}
            for s in segs
        ],
    }
    return {
        "case": case,
        "input": inp,
        "expected": [
            {"step": o["step"], "kind": o["kind"], "anchor": bool(o["anchor"]),
             "role": o["role"], "role_before": before_roles[i], "pitch": pitches[i],
             "strong": bool(o["strong"])}
            for i, o in enumerate(onsets)
        ],
        "approaches": list(approaches),
        "metrics": {
            "strong_total": metrics["strong_total"], "strong_hit": metrics["strong_hit"],
            "strong_rate": metrics["strong_rate"],
            "non_integ": len(metrics["non_integ"]), "passing": len(metrics["passing"]),
            "unplayable": len(metrics["unplayable"]),
            "boundary_total": metrics["boundary_total"], "boundary_ok": metrics["boundary_ok"],
        },
    }


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    n = 0
    for case in CASES:
        data = dump_case(case)
        with open(os.path.join(OUT_DIR, case["id"] + ".json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")
        n += 1
    index = {"generated_by": "tools/py-parity/dump_chord_follow.py",
             "source": "phrase_maker experiments/bass_rock_riff/chords/chord_follow.py (build_line / apply_boundaries / validate)",
             "cases": [c["id"] for c in CASES]}
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"dumped {n} cases -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
