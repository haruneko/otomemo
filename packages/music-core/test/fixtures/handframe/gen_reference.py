#!/usr/bin/env python3
"""ピアノ伴奏（phrase_maker 試作 #1）の基準音を JSON に落とす。phrase_maker は読むだけ・エンジン無改変。

試作 #1 ＝ listen7 `hf_listen7.py` の h1_half_mid（listen11 base と完全一致を確認済み）と同じ引数で、
打鍵の揺れだけ外す（humanize=False）。出力＝このディレクトリの JSON（テストは phrase_maker 無しで走る）。
  F-A: reference_half_mid.json    2拍でコードが替わる進行（HALF 疑似拍子）
  F-C: reference_bar_rounded_mid.json  同じ進行を1小節に丸めた 4/4 版
実行: python3 gen_reference.py   （phrase_maker e186970・~/projects/phrase_maker）
時刻は秒（tempo 96）。拍に直すなら sec * tempo / 60。float は Python repr で書く＝JSON.parse で同じ double。
"""
import os, sys, json, importlib.util, dataclasses
EX = os.path.expanduser("~/projects/phrase_maker/experiments")
HERE = os.path.dirname(os.path.abspath(__file__))
def _load(n, p):
    s = importlib.util.spec_from_file_location(n, p); m = importlib.util.module_from_spec(s); sys.modules[n] = m; s.loader.exec_module(m); return m
HFB = _load("_ref_hfb", os.path.join(EX, "piano/fingersim/handframe_band.py"))
G = _load("_ref_g11", os.path.join(EX, "piano/gesture/gesture_p11.py"))
CH = HFB.CHART; RS = CH.RhythmSpec
HALF = dataclasses.replace(CH.meter("4/4"), beats_per_bar=2, subdivisions=8, beat_steps=(0, 4), pulse_steps=(0, 2, 4, 6))
C8 = "b: x.....x.\ns: ....X...\na: ..x...x."
C16 = "b: x.......x.......\ns: ....X.......X...\na: ..x...x...x...x."
PROG_HALF = ["Fmaj7", "Fmaj7", "G", "G", "Em7", "Em7", "Am7", "G"] * 2
PROG_BAR = ["Fmaj7", "G", "Em7", "Am7"] * 2
TEMPO = 96
def run(name, meter, meter_label, tokens, cont_txt, level, cell_beats):
    HFB.METER = meter
    cont = RS.from_grid_text(name, cont_txt)
    toks, vds = G.build_bar_material(tokens, 1, "close")
    dens = HFB.grab_density_cfg(cont, level)
    seed = HFB.stable_seed("l7|" + name) if hasattr(HFB, "stable_seed") else 1234
    args = dict(preset="mid", sustain_pedal=True, humanize=False)
    notes, pedals, _d = HFB.generate_handframe_band(toks, vds, cont, TEMPO, seed, bass_max=48, **dens, **args)
    out = dict(
        source="phrase_maker e186970 experiments/piano/fingersim/handframe_band.py generate_handframe_band",
        prototype="listen7 hf_listen7.py " + name + " (listen #1) with humanize=False",
        tempo=TEMPO, meter=meter_label, cellBeats=cell_beats, seed=seed, level=level, container=cont_txt,
        chordsPerCell=tokens, bassMax=48, args=args, timeUnit="sec",
        notes=[dict(pitch=int(p), start=s, end=e, vel=v, hand=h, cell=int(b)) for (p, s, e, v, h, b) in notes],
        pedal=[dict(down=dn, up=up) for (dn, up) in pedals],
    )
    with open(os.path.join(HERE, "reference_" + name[3:] + ".json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(name, "notes", len(notes), "pedal", len(pedals))
run("h1_half_mid", HALF, "4/4 (2-beat cells)", PROG_HALF * 2, C8, 2, 2)
run("h1_bar_rounded_mid", CH.meter("4/4"), "4/4", PROG_BAR * 2, C16, 2, 4)
