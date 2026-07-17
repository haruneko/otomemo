import json, sys, warnings, re
warnings.filterwarnings("ignore")
import numpy as np, pretty_midi as pm
PC={"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11}
def parse_audio(lab):  # "A:min","G","F:maj7","D:min7","N"
    if lab in ("N","X"): return None
    root=lab.split(":")[0]; q=lab.split(":")[1] if ":" in lab else ""
    ismin = q.startswith("min")
    return (PC.get(root), ismin)
def parse_midi(lab):   # "Am","G","Fmaj7","Dm7","Esus4"
    m=re.match(r"([A-G]#?)(.*)", lab); 
    if not m: return None
    root=m.group(1); rest=m.group(2)
    ismin = rest.startswith("m") and not rest.startswith("maj")
    return (PC.get(root), ismin)

# audio timeline
aud=json.load(open("/tmp/audio_result.json"))
atl=[(s,e,parse_audio(l)) for s,e,l in aud["chords_timeline"]]
def aud_at(t):
    for s,e,c in atl:
        if s<=t<e: return c
    return None

# midi chord-at (2拍窓の逐次・piano2.mid)
mid=pm.PrettyMIDI("/tmp/piano2.mid")
notes=[n for inst in mid.instruments if not inst.is_drum for n in inst.notes]
bpm=87.0; beat=60.0/bpm
TEMPL={"":{0,4,7},"m":{0,3,7},"7":{0,4,7,10},"m7":{0,3,7,10},"maj7":{0,4,7,11},"dim":{0,3,6},"aug":{0,4,8},"sus4":{0,5,7},"m7b5":{0,3,6,10}}
PCn=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
def midi_at(t):
    pcs={n.pitch%12 for n in notes if n.start<t+beat*2 and n.end>t}
    if not pcs: return None
    best=(-9,None)
    for root in range(12):
        for q,iv in TEMPL.items():
            tmpl={(root+i)%12 for i in iv}
            sc=len(pcs&tmpl)-0.5*len(pcs-tmpl)-0.3*len(tmpl-pcs)
            if sc>best[0]: best=(sc,(root, q.startswith("m") and not q.startswith("maj")))
    return best[1]

# 0.5s刻みで root/triad 一致
dur=min(aud["duration_sec"], mid.get_end_time())
root_ok=tri_ok=n=0
for t in np.arange(2.0, dur-2, 0.5):  # 頭2秒(N/イントロ)除外
    a=aud_at(t); mv=midi_at(t)
    if a is None or mv is None: continue
    n+=1
    if a[0]==mv[0]: root_ok+=1
    if a[0]==mv[0] and a[1]==mv[1]: tri_ok+=1
print(f"照合フレーム数: {n}")
print(f"root(根音)一致率: {root_ok/n*100:.1f}%")
print(f"三和音(根音+長短)一致率: {tri_ok/n*100:.1f}%")

# --- オフセット探索：MIDIを -15〜+15秒ずらして root一致が最大になる所を探す ---
print("\n=== オフセット探索（MIDIをずらす） ===")
best=(-1,0)
for off in np.arange(-15,15.01,0.5):
    ok=nn=0
    for t in np.arange(3.0, dur-3, 0.5):
        a=aud_at(t); mv=midi_at(t+off)
        if a is None or mv is None: continue
        nn+=1
        if a[0]==mv[0]: ok+=1
    if nn and ok/nn>best[0]: best=(ok/nn,off)
print(f"最良オフセット {best[1]:+.1f}s で root一致 {best[0]*100:.1f}%")
# その最良オフセットで三和音一致も
off=best[1]; ro=tr=nn=0
for t in np.arange(3.0, dur-3, 0.5):
    a=aud_at(t); mv=midi_at(t+off)
    if a is None or mv is None: continue
    nn+=1
    if a[0]==mv[0]: ro+=1
    if a[0]==mv[0] and a[1]==mv[1]: tr+=1
print(f"オフセット{off:+.1f}s: root {ro/nn*100:.1f}% / 三和音(根音+長短) {tr/nn*100:.1f}% ({nn}フレーム)")
