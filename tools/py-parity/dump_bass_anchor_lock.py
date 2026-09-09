#!/usr/bin/env python3
"""py-parity dump（M3-3g）＝phrase_maker `_lock_bass_roots_to_sheet` の参照値を JSON へ焼く。

なぜ要るか（計画 §6-1 の1行目）：この関数は **RNG も hash も使わない純関数**（源流 docstring の
"Deterministic: no rng / hash()" ＋ grep で `rng`/`random`/`hash(` 0件）なので、otomemo 側の移植と
**列で突き合わせられる**（＝データ一致が成立する数少ない箇所）。参照値をコミットしておけば、
あとから誰でも「○件一致」を抜き打ちで検算できる（計画 §6-3 の末尾）。

使い方（otomemo リポジトリのルートから）：
    tools/py-parity/run_dump.sh          # venv を焼いたラッパ
    # または
    ~/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python \
        tools/py-parity/dump_bass_anchor_lock.py

出力＝`tools/py-parity/cases/<id>.json`（1ケース1ファイル・コミット対象）。
  input    … 体（grammar line）の onset 列＋base ピッチ＋コード区間＋キック/アクセント/つまみ
  expected … `_lock_bass_roots_to_sheet` を通した後の (step, pitch, kind, anchor, role) 列
TS 側（packages/music-core/test/anchor-lock-parity.test.ts）は input から同じ expected を出す。

⚠ 一次資料は `ensemble.py:1111-1179` の docstring と本体。**phrase_maker のファイルは読むだけ・変更禁止**。
"""
from __future__ import annotations

import json
import os
import sys
import types

# ---------------------------------------------------------------------------
# sys.path＝`ensemble.py:62-69` の挿入順を再現する（計画 §11-2）。
#   向こうは「bass_rock_riff/chords が正準の chords_theory/Chord を持つので先に挿す」順序依存があり、
#   さらに `import walking_v2` が実行時に `experiments/core` を先頭へ挿す（＝`chordlib` は
#   `core/chordlib.py` に解決される＝実測確認済み）。ここではその順序をそのまま焼く。
# ---------------------------------------------------------------------------
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

import chords_theory as CT   # noqa: E402  bass_rock_riff/chords
import chord_follow as CF    # noqa: E402  build_line / segment / chord_at / _clamp
import theory as TH          # noqa: E402  REG_LO / REG_HI
import ensemble as ENS       # noqa: E402  _lock_bass_roots_to_sheet（移植の一次資料）

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases")

# ---------------------------------------------------------------------------
# ケース表（計画 §11-3 の 3＝kick パターン × コード進行 × grammar セル3型 × 案B on/off）。
#   最初の1件（smoke）＝4/4・pedal_answer・kick [0,8]・進行 Am F C G（計画 §11-3 の 2 が名指し）。
# ---------------------------------------------------------------------------
KICKS = {
    "k08": [0, 8],                  # 素の4つ打ちでない2点＝(c) 挿入が拍頭で起きる
    "k4beat": [0, 4, 8, 12],        # 4つ打ち＝全拍頭
    "ksynco": [0, 6, 10, 14],       # シンコペ＝案B が効く（6/10/14 は gstep%4!=0）
    "kdense": [0, 3, 6, 8, 11, 14],  # 密＝(a)(b)(c) が全部混ざる
    "krest": [0, 5, 9, 13],         # 休符 step に当たるシンコペ kick＝案B（拍頭でない無音キックは休む）が効く
    "kempty": [],                   # 空＝源流の fallback [0,4,8,12]（parts.py:142）
}
PROGS = {
    "amfcg": ("Am F C G", 1.0),      # 1小節1コード
    "sevenths": ("Dm7 G7 Cmaj7 A7", 1.0),  # 7th＝非ルート度数の remap が効く
    "fast": ("C Am F G", 0.5),        # 半小節1コード＝step 粒度の読みが効く（拍頭で stale しない）
}
GRAMMARS = ["pedal_answer", "gallop_pedal", "octave_call_response"]

CASES = []
for gname in GRAMMARS:
    for pname, (prog, bpc) in PROGS.items():
        for kname, kick in KICKS.items():
            for rest in (False, True):
                CASES.append({
                    "id": f"{gname}__{pname}__{kname}__{'restB' if rest else 'restA'}",
                    "grammar": gname,
                    "progression": prog,
                    "bars_per_chord": bpc,
                    "kick": kick,
                    "accents": [],
                    "rest_on_syncopated_kick": rest,
                })
# アクセント有りも数件だけ（otomemo は M3 でアクセントを持たないが、移植関数自体は源流に忠実＝分岐を残す）
for rest in (False, True):
    CASES.append({
        "id": f"pedal_answer__amfcg__kdense__acc__{'restB' if rest else 'restA'}",
        "grammar": "pedal_answer",
        "progression": "Am F C G",
        "bars_per_chord": 1.0,
        "kick": [0, 3, 6, 8, 11, 14],
        "accents": [0, 8],
        "rest_on_syncopated_kick": rest,
    })


def dump_case(case: dict) -> dict:
    chords = CT.parse_progression(case["progression"])
    segs, total_steps = CF.segment(chords, case["bars_per_chord"])
    onsets, base = CF.build_line(case["grammar"], segs, total_steps)
    n_bars = total_steps // CF.STEPS_PER_BAR
    # rs は `.kick` と `.accents` しか読まれない（`ensemble.py:1138-1140`）。RhythmSpec と同じく
    # tuple(sorted(set)) 化して集合順非依存にする（計画 §6-1 の実測列）。
    rs = types.SimpleNamespace(
        kick=tuple(sorted(set(case["kick"]))),
        accents=tuple(sorted(set(case["accents"]))),
    )
    inp = {
        "steps_per_bar": CF.STEPS_PER_BAR,
        "n_bars": n_bars,
        "total_steps": total_steps,
        "reg_lo": TH.REG_LO,
        "reg_hi": TH.REG_HI,
        "kick": list(rs.kick),
        "accents": list(rs.accents),
        "rest_on_syncopated_kick": case["rest_on_syncopated_kick"],
        "segs": [
            {"root_pc": s.chord.root_pc, "quality": s.chord.quality,
             "start_step": s.start_step, "length_steps": s.length_steps}
            for s in segs
        ],
        "onsets": [
            {"step": o["step"], "kind": o["kind"], "anchor": bool(o["anchor"]),
             "role": o["role"], "pitch": base[i]}
            for i, o in enumerate(onsets)
        ],
    }
    out_onsets, out_base = ENS._lock_bass_roots_to_sheet(
        onsets, base, segs, rs, n_bars, case["rest_on_syncopated_kick"],
    )
    expected = [
        {"step": o["step"], "kind": o["kind"], "anchor": bool(o["anchor"]),
         "role": o["role"], "pitch": out_base[i]}
        for i, o in enumerate(out_onsets)
    ]
    return {"case": case, "input": inp, "expected": expected}


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    n = 0
    for case in CASES:
        data = dump_case(case)
        path = os.path.join(OUT_DIR, case["id"] + ".json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")
        n += 1
    index = {"generated_by": "tools/py-parity/dump_bass_anchor_lock.py",
             "source": "phrase_maker experiments/ensemble/ensemble.py:1111-1179 _lock_bass_roots_to_sheet",
             "cases": [c["id"] for c in CASES]}
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"dumped {n} cases -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
