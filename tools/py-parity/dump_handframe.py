#!/usr/bin/env python3
"""py-parity dump＝phrase_maker `experiments/piano/fingersim/handframe.py`（ピアノ伴奏の生成器本体）の参照値を JSON へ焼く。

正典＝docs/drafts/2026-09-16-handframe-evolution-design.md §5 S2。
  (i)  既定構成（全ノブ既定）の generate_handframe
  (ii) バンド用の右手の構成（handframe_band.generate_handframe_band が生成器へ渡す引数をそのまま横取り）＋左手
  追加  つまみの分岐の被覆（rolling / offbeat / motif / held / approach の集合版 / 弧）
各ケース＝入力（コード列・小節ごとの和音の材料・器の打点・つまみ）と出力（notes / orn / diag）。
入力のうち呼び出し関数（voicing_fn・accent_table）は値に展開して持つ（小節ごとの結果・slot ごとの値）。

個別検分用：生成器内の math.exp の引数と結果を全件記録（exp.json）＝TS の Math.exp と最後の桁まで同じかを見る。
使い方：tools/py-parity/run_dump_handframe.sh
⚠ phrase_maker は読むだけ・変更禁止。
"""
from __future__ import annotations

import dataclasses
import importlib.util
import json
import math
import os
import sys

EX = os.path.expanduser("~/projects/phrase_maker/experiments")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "cases-handframe")


def _load(n, p):
    s = importlib.util.spec_from_file_location(n, p)
    m = importlib.util.module_from_spec(s)
    sys.modules[n] = m
    s.loader.exec_module(m)
    return m


HFB = _load("_pp_hfb", os.path.join(EX, "piano/fingersim/handframe_band.py"))
G = _load("_pp_g11", os.path.join(EX, "piano/gesture/gesture_p11.py"))
HF = HFB.HF
CH = HFB.CHART
RS = CH.RhythmSpec
PA = HF.PA

HALF = dataclasses.replace(CH.meter("4/4"), beats_per_bar=2, subdivisions=8, beat_steps=(0, 4), pulse_steps=(0, 2, 4, 6))
C8 = "b: x.....x.\ns: ....X...\na: ..x...x."
C16 = "b: x.......x.......\ns: ....X.......X...\na: ..x...x...x...x."
PROG_HALF = ["Fmaj7", "Fmaj7", "G", "G", "Em7", "Em7", "Am7", "G"] * 2
PROG_BAR = ["Fmaj7", "G", "Em7", "Am7"] * 2
PROG_JAZZ = ["Dm7", "G7", "Cmaj7", "Cmaj7", "Bm7b5", "E7", "Am7", "A7"]
TEMPO = 96

EXP_LOG = []


class _MathSpy:
    def __getattr__(self, k):
        return getattr(math, k)

    def exp(self, x):
        y = math.exp(x)
        EXP_LOG.append([x, y])
        return y


HF.math = _MathSpy()

# sorted(key=(score, diag)) の同順位（score が同じで diag が並びを決めた組）を数える＝個別検分。
TIES = {"pairs": 0, "calls": 0}
CASE_TIES = []
_orig_sample = HF.sample_topk


def _spy_sample(moves, rng, k=3, diag=None):
    if moves:
        TIES["calls"] += 1
        ordered = sorted(moves, key=lambda m: (m.score, m.diag))
        for a, b in zip(ordered[: k + 1], ordered[1: k + 1]):
            if a.score == b.score:
                TIES["pairs"] += 1
    return _orig_sample(moves, rng, k=k, diag=diag)


HF.sample_topk = _spy_sample


def jsonable(x):
    if isinstance(x, (frozenset, set)):
        return sorted(jsonable(v) for v in x)
    if isinstance(x, (list, tuple)):
        return [jsonable(v) for v in x]
    if isinstance(x, dict):
        return {str(k): jsonable(v) for k, v in x.items()}
    return x


def material(tokens, meter, cont_txt):
    toks, vds = G.build_bar_material(tokens, 1, "close")
    cont = RS.from_grid_text("c", cont_txt)
    return toks, vds, cont, meter.step_dur(TEMPO), meter.bar_dur(TEMPO)


def encode_input(toks, vds, cont, seed, kw):
    kw = dict(kw)
    vfn = kw.pop("voicing_fn", None)
    acc = kw.pop("accent_table", None)
    arc = kw.pop("arc", None)
    kw.pop("emit", None)
    grid = kw.get("grid", 16)
    return dict(
        toks=list(toks),
        vds=[dict(rh=list(v["rh"]), allowed=sorted(v["allowed"]), deg=dict(v["deg"]),
                  voicing=(list(vfn(v)) if vfn else None)) for v in vds],
        onsets=list(cont.onsets), seed=seed,
        accent=([acc(s, grid) for s in range(grid)] if acc else None),
        arc=(dataclasses.asdict(arc) if arc is not None else None),
        kw=jsonable(kw),
    )


def run_case(name, toks, vds, cont, seed, kw):
    EXP_LOG.clear()
    p0, c0 = TIES["pairs"], TIES["calls"]
    notes, orn, diag = HF.generate_handframe(toks, vds, cont, TEMPO, seed, **kw)
    CASE_TIES.append([name, TIES["calls"] - c0, TIES["pairs"] - p0])
    return dict(name=name, input=encode_input(toks, vds, cont, seed, kw),
                out=dict(notes=jsonable(notes), orn=jsonable(orn), diag=jsonable(diag))), list(EXP_LOG)


def band_calls(toks, vds, cont, seed, level=2, **args):
    """generate_handframe_band が生成器へ渡す引数を横取りする（humanize=False＝既定の emit）。"""
    calls = []
    orig = HF.generate_handframe

    def spy(t, v, c, tempo, s, **kw):
        calls.append(kw)
        return orig(t, v, c, tempo, s, **kw)

    HF.generate_handframe = spy
    try:
        dens = HFB.grab_density_cfg(cont, level)
        HFB.generate_handframe_band(toks, vds, cont, TEMPO, seed, bass_max=48, humanize=False, **dens, **args)
    finally:
        HF.generate_handframe = orig
    return calls


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    cases = []
    exp_all = []

    def add(name, toks, vds, cont, seed, kw):
        c, e = run_case(name, toks, vds, cont, seed, kw)
        cases.append(c)
        exp_all.extend(e)

    half = material(PROG_HALF * 2, HALF, C8)
    bar = material(PROG_BAR * 2, CH.meter("4/4"), C16)
    jazz = material(PROG_JAZZ, CH.meter("4/4"), C16)

    # (i) 既定構成
    for seed in (1234, 1, 99):
        t, v, c, sd, bd = bar
        add(f"default_bar_s{seed}", t, v, c, seed, dict(bass_max=48, step_dur=sd, bar_dur=bd, grid=16))
    t, v, c, sd, bd = half
    add("default_half_s1234", t, v, c, 1234, dict(bass_max=48, step_dur=sd, bar_dur=bd, grid=8))

    # (ii) バンド用の右手（F-A / F-C と同じ引数）＋左手
    HFB.METER = HALF
    t, v, c, sd, bd = half
    for i, kw in enumerate(band_calls(t, v, c, 1234, preset="mid", sustain_pedal=True)):
        add(f"band_half_mid_{'RL'[i]}", t, v, c, 1234, kw)
    for seed in (7, 2024):
        add(f"band_half_mid_R_s{seed}", t, v, c, seed, band_calls(t, v, c, seed, preset="mid", sustain_pedal=True)[0])
    add("band_half_dry_R", t, v, c, 1234, band_calls(t, v, c, 1234, preset="loose", sustain_pedal=False)[0])
    HFB.METER = CH.meter("4/4")
    t, v, c, sd, bd = bar
    for i, kw in enumerate(band_calls(t, v, c, 1234, preset="mid", sustain_pedal=True)):
        add(f"band_bar_mid_{'RL'[i]}", t, v, c, 1234, kw)
    add("band_bar_grip_L4_R", t, v, c, 5, band_calls(t, v, c, 5, level=4, preset="grip", sustain_pedal=True)[0])
    t, v, c, sd, bd = jazz
    add("band_jazz_mid_R", t, v, c, 31, band_calls(t, v, c, 31, preset="mid", sustain_pedal=True)[0])
    # 弧（既定 OFF の分岐・参考）
    t, v, c, sd, bd = bar
    add("band_bar_arc_R", t, v, c, 1234, band_calls(t, v, c, 1234, preset="mid", sustain_pedal=True, arc=PA.PhraseSpec())[0])
    add("band_bar_arc_reg_R", t, v, c, 1234, band_calls(t, v, c, 1234, preset="mid", sustain_pedal=True,
                                                       arc=PA.PhraseSpec(k_reg=0.4, k_motif=0.5))[0])

    # 追加：つまみの分岐の被覆
    t, v, c, sd, bd = jazz
    base = dict(bass_max=48, step_dur=sd, bar_dur=bd, grid=16)
    add("knob_rolling_motif", t, v, c, 11, dict(base, grab_policy="rolling", dyad_on=True, lambda_skip=0.3,
                                                motif_bias=0.6, clash_guard="held", approach=True,
                                                landing_bonus=-0.2, landing_offstrong=0.4))
    add("knob_offbeat_wide", t, v, c, 12, dict(base, grab_policy="offbeat", wide_motion=True, line_motion=True,
                                               dyad_on=True, dyad_break=True, tension=True,
                                               colour_allowed=[frozenset(HFB.allowed_colour(HFB.CL.parse_scaled_chord(x))) for x in t],
                                               floor=52, span_mode="stretch"))
    add("knob_structure_only_L", t, v, c, 13, dict(base, hand="L", structure_only=True, hold_all_reseed=True,
                                                   voicing_fn=lambda vd: HFB._shell_lift(vd, 48)))

    for c_ in cases:
        with open(os.path.join(OUT_DIR, c_["name"] + ".json"), "w") as f:
            json.dump(c_, f, ensure_ascii=False, separators=(",", ":"))
    # 同じ引数の exp は1件に畳む（並びは初出順）
    seen = set()
    uniq = []
    for x, y in exp_all:
        if x not in seen:
            seen.add(x)
            uniq.append([x, y])
    meta = dict(generated_by="tools/py-parity/dump_handframe.py", python=sys.version,
                source="phrase_maker experiments/piano/fingersim/handframe.py (+ handframe_band.py argument capture)",
                cases=[c_["name"] for c_ in cases], exp_calls=len(exp_all), exp_unique=len(uniq),
                topk_calls_equal_score_adjacent_per_case=CASE_TIES)
    with open(os.path.join(OUT_DIR, "exp.json"), "w") as f:
        json.dump(uniq, f, separators=(",", ":"))
    with open(os.path.join(OUT_DIR, "meta.json"), "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(meta["exp_calls"], meta["exp_unique"], CASE_TIES)


if __name__ == "__main__":
    main()
