#!/usr/bin/env python
"""F1 実測: allin1 で構成解析（セクション境界＋機能ラベル）。CPU実行時間を出す。
使い方: venv-f1/bin/python f1_allin1.py <audio> [demix_dir]
"""
import sys, time, json

audio = sys.argv[1]
demix = sys.argv[2] if len(sys.argv) > 2 else "/tmp/f1_demix"
spec = "/tmp/f1_spec"

t0 = time.time()
from allin1 import analyze
t_imp = time.time() - t0

t1 = time.time()
res = analyze(
    audio, device="cpu", demix_dir=demix, spec_dir=spec,
    keep_byproducts=True, multiprocess=False,
)
t_run = time.time() - t1

segs = [{"start": round(s.start, 2), "end": round(s.end, 2), "label": s.label} for s in res.segments]
out = {
    "file": audio.split("/")[-1],
    "bpm": res.bpm,
    "n_beats": len(res.beats),
    "n_downbeats": len(res.downbeats),
    "first_downbeats": [round(x, 3) for x in res.downbeats[:6]],
    "n_segments": len(segs),
    "segments": segs,
    "timing_sec": {"import": round(t_imp, 1), "analyze": round(t_run, 1)},
}
print(json.dumps(out, ensure_ascii=False, indent=2))
