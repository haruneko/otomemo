#!/usr/bin/env python3
"""py-parity dump（M5）＝phrase_maker ギター gen2 の chordtheory／chordfollow／chug ロックの参照値を JSON へ焼く。

なぜデータ一致を主張してよいか（計画 §6-1 の1行目・4行目）：
  - `_lock_guitar_chug_to_sheet`（`ensemble.py:2678-2740`）＝源流 docstring "Deterministic: no rng / hash()"。
  - `chordfollow.build_skeleton`／`assign_pitches`（`guitar/gen2/chords/chordfollow.py`）＝RNG 0件
    （gen2 で `import random` を持つのは naive/humanize/stress/fuzz のみ）。
  - `chordtheory.parse_chord`＝表引きだけ。
  ＝列で突き合わせられる。

使い方（otomemo リポジトリのルートから）：
    tools/py-parity/run_dump_guitar.sh

出力＝`tools/py-parity/cases-guitar/`（コミット対象）
  chordtheory.json … 全 32 クオリティ × ルート3種 ＋ 分数コード（tone_pcs/scale_pcs/perfect_fifth/pedal_pc）
  <id>.json        … grammar × 進行 × キック：build_skeleton →（キックがあれば）_lock_guitar_chug_to_sheet
                     → assign_pitches を通した onset 列と音高

⚠ **phrase_maker は読むだけ・変更禁止**。ギターのモジュールは `ensemble.load_guitar()`（`_load_isolated`＝
   bass 側の同名 `theory`/`riff` と衝突させない読み込み）で掴む＝源流の ensemble が実際に鳴らしている組と同じ。
   sys.path の順は `dump_bass_anchor_lock.py`（3g）と同じものを焼いてある。
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

import ensemble as ENS  # noqa: E402  _lock_guitar_chug_to_sheet / load_guitar

GT, GR, GSF, GCT, GCF = ENS.load_guitar()

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases-guitar")

GRAMMARS = ["power_chug", "pedal_answer", "gallop"]
# rock_guitar（`ensemble.py:2755`）の palm_gate 表そのもの。
PALM = {"power_chug": 0.80, "gallop": 0.65, "pedal_answer": 0.85}
TEMPO = 150

PROGS = {
    "amfcg": ("Am F C G", 4.0),                       # 1小節1コード
    "fast": ("C Am F G", 2.0),                        # 半小節1コード
    "altered": ("Bdim Caug E7 Am", 4.0),              # 5度が♮5でない＝POWER の5度落とし
    "slash": ("C/G D/F# Em7 Cmaj7", 4.0),             # 分数＝ペダルが低音
    "nasty": ("Am E7 F G7 Dm B7 Em", 2.0),            # 源流 PRESETS の chromatic-nasty
}
KICKS = {
    "nolock": None,                                   # ロック無し＝build_skeleton→assign_pitches のみ
    "k4beat": ([0, 4, 8, 12], []),
    "ksynco": ([0, 6, 10, 14], []),
    "kdense": ([0, 3, 6, 8, 11, 14], []),
    "kempty": ([], []),                               # 源流の fallback [0,4,8,12]
    "k4acc": ([0, 4, 8, 12], [4, 12]),                # アクセント権限の一本化
}

CASES = []
for g in GRAMMARS:
    for pname, (prog, bpc) in PROGS.items():
        for kname, kk in KICKS.items():
            CASES.append({"id": f"{g}__{pname}__{kname}", "grammar": g, "progression": prog,
                          "beats_per_chord": bpc, "kick": None if kk is None else kk[0],
                          "accents": None if kk is None else kk[1]})


def chord_json(c):
    return {"name": c.name, "root_pc": c.root_pc, "quality": c.quality,
            "tone_pcs": sorted(c.tone_pcs), "scale_pcs": sorted(c.scale_pcs),
            "perfect_fifth": bool(c.perfect_fifth), "bass_pc": c.bass_pc, "pedal_pc": c.pedal_pc}


def dump_case(case):
    chords = GCT.parse_progression(case["progression"])
    sf = GSF.SubFeel("parity", "straight8", TEMPO, 2, case["grammar"], (0, 4, 8, 12), PALM[case["grammar"]])
    onsets, meta = GCF.build_skeleton(sf, chords, case["beats_per_chord"])
    if case["kick"] is not None:
        rs = types.SimpleNamespace(kick=tuple(sorted(set(case["kick"]))), accents=tuple(sorted(set(case["accents"]))))
        onsets = ENS._lock_guitar_chug_to_sheet(onsets, meta, chords, rs, sf)
    pitches, voics = GCF.assign_pitches(onsets, chords)
    return {
        "case": case,
        "input": {"tempo": TEMPO, "palm_gate": PALM[case["grammar"]], "total_steps": meta["total_steps"],
                  "steps_per_chord": meta["steps_per_chord"], "n_bars": meta["n_bars"],
                  "step_dur": meta["step_dur"], "chords": [chord_json(c) for c in chords]},
        "expected": [
            {"step": o["step"], "kind": o["kind"], "anchor": bool(o["anchor"]), "role": o["role"],
             "deg": o["deg"], "voicing": list(o["voicing"]), "strong": bool(o["strong"]),
             "chord_idx": o["chord_idx"], "start": o["start"], "dur": o["dur"],
             "pitch": pitches[i], "voic": list(voics[i])}
            for i, o in enumerate(onsets)
        ],
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    # chordtheory 表（全クオリティ × ルート3種 ＋ 分数）
    syms = []
    for q in GCT._QUALITY.keys():
        for r in ("C", "A", "Bb"):
            syms.append(r + q)
    syms += ["C/G", "D/F#", "Am/C", "Bdim/D", "G7/B", "Caug/E", "E5/B", "Fmaj7/E"]
    with open(os.path.join(OUT_DIR, "chordtheory.json"), "w", encoding="utf-8") as fh:
        json.dump({"source": "phrase_maker experiments/guitar/gen2/chords/chordtheory.py (_QUALITY / parse_chord)",
                   "chords": [chord_json(GCT.parse_chord(s)) for s in syms]}, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    for case in CASES:
        with open(os.path.join(OUT_DIR, case["id"] + ".json"), "w", encoding="utf-8") as fh:
            json.dump(dump_case(case), fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")
    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"generated_by": "tools/py-parity/dump_guitar.py",
                   "source": "phrase_maker ensemble.py:2678-2740 _lock_guitar_chug_to_sheet + guitar/gen2/chords/chordfollow.py (build_skeleton / assign_pitches)",
                   "cases": [c["id"] for c in CASES]}, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print(f"dumped {len(CASES)} cases + chordtheory -> {OUT_DIR}")


if __name__ == "__main__":
    main()
