#!/usr/bin/env python
"""F1 実測: beat_this で拍/ダウンビート推定。CPU実行時間とBPM/位相を出す。
使い方: venv-f1/bin/python f1_beatthis.py <audio> [dbn0|dbn1]
"""
import sys, time, json
import numpy as np

audio = sys.argv[1]
use_dbn = (len(sys.argv) > 2 and sys.argv[2] == "dbn1")

t0 = time.time()
from beat_this.inference import File2Beats
t_imp = time.time() - t0

f2b = File2Beats(checkpoint_path="final0", device="cpu", dbn=use_dbn)
t_load = time.time() - t0

t1 = time.time()
beats, downbeats = f2b(audio)
t_infer = time.time() - t1

beats = np.asarray(beats, dtype=float)
downbeats = np.asarray(downbeats, dtype=float)

# BPM = median inter-beat interval
if len(beats) > 3:
    ibi = np.diff(beats)
    bpm = 60.0 / float(np.median(ibi))
else:
    bpm = None
# beats per bar (from downbeat spacing / beat spacing)
if len(downbeats) > 2 and len(beats) > 3:
    dbi = float(np.median(np.diff(downbeats)))
    ibi_med = float(np.median(np.diff(beats)))
    bpb = dbi / ibi_med if ibi_med else None
else:
    bpb = None

out = {
    "file": audio.split("/")[-1],
    "dbn": use_dbn,
    "n_beats": int(len(beats)),
    "n_downbeats": int(len(downbeats)),
    "bpm_median": round(bpm, 2) if bpm else None,
    "beats_per_bar_est": round(bpb, 2) if bpb else None,
    "first_beats": [round(x, 3) for x in beats[:8].tolist()],
    "first_downbeats": [round(x, 3) for x in downbeats[:6].tolist()],
    "timing_sec": {"import": round(t_imp, 1), "load_model": round(t_load, 1), "infer": round(t_infer, 1)},
}
print(json.dumps(out, ensure_ascii=False, indent=2))
