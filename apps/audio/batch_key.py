import sys, warnings, json
warnings.filterwarnings("ignore")
import numpy as np, librosa
sys.path.insert(0, ".")
from analyze import estimate_key, btc_chords

PC={"C":0,"C#":1,"Db":1,"D":2,"D#":3,"Eb":3,"E":4,"F":5,"F#":6,"Gb":6,"G":7,"G#":8,"Ab":8,"A":9,"A#":10,"Bb":10,"B":11}
PCn=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
MAJ_STEPS=[0,2,4,5,7,9,11]; MIN_STEPS=[0,2,3,5,7,8,10]
def dia_roots(root,mode): 
    st=MAJ_STEPS if mode=="major" else MIN_STEPS
    return {(root+s)%12 for s in st}
def chord_root(l): return PC.get(l.split(":")[0]) if l not in ("N","X") else None

# (ファイル, 既知キー root, mode)
TESTS=[
 ("/tmp/pd_test/bach_prelude1_Cmaj.ogg","C","major"),
 ("/tmp/pd_test/bach_prelude2_Cmin.ogg","C","minor"),
 ("/tmp/pd_test/satie_gym1_Dmaj.ogg","D","major"),
 ("/tmp/pd_test/satie_gym3_Amin.ogg","A","minor"),
 ("/tmp/pd_test/joplin_mapleleaf_Abmaj.ogg","Ab","major"),
 ("/tmp/pd_test/beethoven_furelise_Amin.ogg","A","minor"),
]
print(f"{'曲':28} {'既知':7} {'librosa調':10} {'一致':6} {'コードが既知調に収まる率':8}")
exact=relok=0
covs=[]
for path,kroot,kmode in TESTS:
    y,sr=librosa.load(path, sr=22050, mono=True)
    k=estimate_key(y,sr)  # {key,mode,confidence}
    dr,dm=PC[k["key"]],k["mode"]
    kr=PC[kroot]
    is_exact = (dr==kr and dm==kmode)
    # 相対調許容
    rel = ((kmode=="major" and dm=="minor" and dr==(kr-3)%12) or
           (kmode=="minor" and dm=="major" and dr==(kr+3)%12))
    exact+= is_exact; relok+= (is_exact or rel)
    # コード：既知調のダイアトニック根音に収まる時間割合
    ch=btc_chords(path)
    known=dia_roots(kr,kmode)
    tot=sum(e-s for s,e,l in ch if chord_root(l) is not None)
    inb=sum(e-s for s,e,l in ch if chord_root(l) in known)
    cov=inb/tot*100 if tot else 0; covs.append(cov)
    mark = "✅" if is_exact else ("〜相対" if rel else "✗")
    name=path.split("/")[-1][:26]
    print(f"{name:28} {kroot+' '+kmode[:3]:7} {k['key']+' '+k['mode'][:3]:10} {mark:6} {cov:5.0f}%")
n=len(TESTS)
print(f"\nlibrosa調 完全一致: {exact}/{n} ({exact/n*100:.0f}%) / 相対調まで許容: {relok}/{n} ({relok/n*100:.0f}%)")
print(f"BTCコードが既知調に収まる率(平均): {np.mean(covs):.0f}%  ＝コード認識が正しい調のピッチを捉えてるか")
