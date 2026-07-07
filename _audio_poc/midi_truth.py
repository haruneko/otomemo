import sys, warnings, json
warnings.filterwarnings("ignore")
import numpy as np, pretty_midi as pm
from collections import Counter

mid = pm.PrettyMIDI(sys.argv[1])
notes = [n for inst in mid.instruments if not inst.is_drum for n in inst.notes]
pcs_all = [n.pitch % 12 for n in notes]
PC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

# --- 調（Krumhansl・全ノートのpc重み） ---
hist = np.zeros(12)
for n in notes: hist[n.pitch%12] += (n.end-n.start)
MAJ=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
MIN=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
def best(prof):
    p=prof-prof.mean(); b=(-9,0)
    for r in range(12):
        c=np.roll(hist,-r); c=c-c.mean()
        v=float((c*p).sum()/(np.linalg.norm(c)*np.linalg.norm(p)+1e-9))
        if v>b[0]: b=(v,r)
    return b
cM,cm=best(MAJ),best(MIN)
key = (PC[cM[1]]+" major",round(cM[0],3)) if cM[0]>=cm[0] else (PC[cm[1]]+" minor",round(cm[0],3))

# --- テンポ・尺・音域 ---
tempo = float(np.atleast_1d(mid.estimate_tempo())[0]) if notes else 0
try: bpm_hdr = float(mid.get_tempo_changes()[1][0])
except Exception: bpm_hdr=None
dur = mid.get_end_time()
pitches=[n.pitch for n in notes]
rng=(pm.note_number_to_name(min(pitches)), pm.note_number_to_name(max(pitches))) if pitches else None

# --- コード：拍ごとに鳴ってるpcセット→テンプレ最良一致 ---
TEMPL={"":{0,4,7},"m":{0,3,7},"7":{0,4,7,10},"m7":{0,3,7,10},"maj7":{0,4,7,11},
       "dim":{0,3,6},"aug":{0,4,8},"sus4":{0,5,7},"m7b5":{0,3,6,10}}
beat=60.0/(bpm_hdr or tempo or 120)
def chord_at(t0,t1):
    pcs={n.pitch%12 for n in notes if n.start< t1 and n.end> t0}
    if not pcs: return None
    best=(-9,None)
    for root in range(12):
        for q,iv in TEMPL.items():
            tmpl={(root+i)%12 for i in iv}
            inter=len(pcs&tmpl); score=inter-0.5*len(pcs-tmpl)-0.3*len(tmpl-pcs)
            if score>best[0]: best=(score,PC[root]+q)
    return best[1]
seq=[]; t=0.0
while t<dur and len(seq)<200:
    c=chord_at(t,t+beat*2)  # 2拍窓
    if c and (not seq or seq[-1]!=c): seq.append(c)
    t+=beat*2

print(json.dumps({
  "source":"piano2.mid (正解ソース)",
  "key_estimated": key[0], "key_confidence": key[1], "user_said":"Am",
  "bpm_header": bpm_hdr, "bpm_estimated": round(tempo,1),
  "duration_sec": round(dur,1), "note_range": rng, "num_notes": len(notes),
  "chord_progression": seq[:80],
  "chord_freq_top": Counter(seq).most_common(10),
}, ensure_ascii=False, indent=2))
