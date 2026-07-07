#!/usr/bin/env python
"""アナリーゼ POC ランナー：音源1曲 → 分離(Demucs) → BPM/調/音域(librosa/pyin) →
コード進行(BTC) → 事実の JSON。Claude(会話側)がこの JSON をアナリーゼ文に言語化して正解照合する。

使い方: .venv/bin/python analyze.py <audio> [workdir]
※ ffmpeg 必須（mp3読込）。初回は Demucs/BTC のモデルDL。
"""
import sys, os, json, subprocess, warnings, time
warnings.filterwarnings("ignore")
import numpy as np
import librosa

HERE = os.path.dirname(os.path.abspath(__file__))
BTC = os.path.join(HERE, "BTC-ISMIR19")
PY = os.path.join(HERE, ".venv", "bin", "python")

# --- Krumhansl-Schmuckler 調推定（chroma 平均 × 長短プロファイルの相関） ---
_MAJ = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
_MIN = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
_PC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
def estimate_key(y, sr):
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    def corr(prof):
        p = (prof - prof.mean()); best=(-9,0)
        for r in range(12):
            c = np.roll(chroma, -r); c = c - c.mean()
            v = float((c*p).sum() / (np.linalg.norm(c)*np.linalg.norm(p)+1e-9))
            if v>best[0]: best=(v,r)
        return best  # (相関, root)
    cmaj, cmin = corr(_MAJ), corr(_MIN)
    if cmaj[0] >= cmin[0]:
        return {"key": _PC[cmaj[1]], "mode": "major", "confidence": round(cmaj[0],3)}
    return {"key": _PC[cmin[1]], "mode": "minor", "confidence": round(cmin[0],3)}

# --- ボーカル pyin（f0/有声を1回だけ計算し音域とメロで共有）---
def pyin_vocal(vocal_wav):
    y, sr = librosa.load(vocal_wav, mono=True)
    f0, voiced, vprob = librosa.pyin(y, fmin=65, fmax=1300, sr=sr)
    times = librosa.times_like(f0, sr=sr)  # 各フレームの時刻(秒)
    hop_sec = 512.0 / sr  # pyin 既定 hop_length=512
    return f0, voiced, times, hop_sec

# --- 音域：有声gate→5/95%tile clip→音名 ---
def vocal_range(f0, voiced):
    m = voiced & ~np.isnan(f0)
    f = f0[m]
    if f.size < 20:
        return {"note_low": None, "note_high": None, "voiced_ratio": round(float(m.mean()),3)}
    lo, hi = np.percentile(f,5), np.percentile(f,95)
    return {"note_low": librosa.hz_to_note(float(lo)), "note_high": librosa.hz_to_note(float(hi)),
            "hz_low": round(float(lo),1), "hz_high": round(float(hi),1),
            "voiced_ratio": round(float(m.mean()),3)}

# --- メロ量子化：pyin f0 → 半音丸め → 連続同一半音を1ノートに（RLE）＋短すぎるノートを捨てる。
#     view-only（持ち出さない）＝弾く用でなく「見る/検算で鳴らす」用。basic-pitch は精度upの将来案。
def vocal_melody(f0, voiced, times, hop_sec, min_note_sec=0.09):
    n = len(f0)
    midi = [None]*n
    for i in range(n):
        if voiced[i] and not np.isnan(f0[i]) and f0[i] > 0:
            midi[i] = int(round(69 + 12*np.log2(float(f0[i])/440.0)))
    notes = []
    i = 0
    while i < n:
        m = midi[i]; j = i
        while j < n and midi[j] == m:
            j += 1
        if m is not None:
            start = float(times[i]); end = float(times[j-1]) + hop_sec
            if end - start >= min_note_sec:
                notes.append([round(start,3), round(end,3), m])  # [start_sec, end_sec, midi]
        i = j
    return notes

# --- f0 輪郭（量子化が外した時の fallback 表示用）。~20点/秒にダウンサンプル。無声は None。---
def f0_contour(f0, voiced, times, per_sec=20):
    n = len(times)
    if n == 0:
        return []
    total = float(times[-1]) or 1.0
    step = max(1, int(round(n / (per_sec * total))))
    out = []
    for k in range(0, n, step):
        hz = float(f0[k]) if (voiced[k] and not np.isnan(f0[k])) else None
        out.append([round(float(times[k]),2), (round(hz,1) if hz else None)])
    return out

# --- コード：BTC の推論を test.py から流用（フルmixに対して） ---
def btc_chords(audio):
    sys.path.insert(0, BTC)
    cwd = os.getcwd(); os.chdir(BTC)
    try:
        import torch
        from btc_model import BTC_model
        from utils.hparams import HParams
        from utils.mir_eval_modules import audio_file_to_features, idx2voca_chord
        cfg = HParams.load("run_config.yaml")
        cfg.feature["large_voca"] = True; cfg.model["num_chords"] = 170
        idx = idx2voca_chord()
        model = BTC_model(config=cfg.model); model.eval()
        ck = torch.load("./test/btc_model_large_voca.pt", map_location="cpu", weights_only=False)
        mean, std = ck["mean"], ck["std"]; model.load_state_dict(ck["model"])
        feat, fps, _ = audio_file_to_features(audio, cfg)
        feat = (feat.T - mean) / std
        n = cfg.model["timestep"]; pad = n - (feat.shape[0] % n)
        feat = np.pad(feat, ((0,pad),(0,0)), mode="constant")
        segs = []; start = 0.0; prev = None
        with torch.no_grad():
            t_in = torch.tensor(feat, dtype=torch.float32).unsqueeze(0)
            inst = feat.shape[0] // n
            for t in range(inst):
                sa,_ = model.self_attn_layers(t_in[:, n*t:n*(t+1), :])
                pred,_ = model.output_layer(sa); pred = pred.squeeze()
                for i in range(n):
                    cur = pred[i].item()
                    if prev is None: prev = cur; continue
                    if cur != prev:
                        segs.append([round(start,2), round(fps*(n*t+i),2), idx[prev]])
                        start = fps*(n*t+i); prev = cur
        return segs
    finally:
        os.chdir(cwd)

# --- 分離：demucs を Python API で（torchaudio.save/torchcodec を避け soundfile 保存） ---
# #S12: 4stem 全部を1回の分離から保存（vocals だけでなく drums/bass も＝追加分離コストゼロ）。
def separate_stems(audio, work):
    import torch, soundfile as sf
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    m = get_model("htdemucs"); m.eval()
    wav, sr = librosa.load(audio, sr=m.samplerate, mono=False)
    if wav.ndim == 1: wav = np.stack([wav, wav])
    ref = torch.tensor(wav, dtype=torch.float32); mean = ref.mean(); std = ref.std() + 1e-8
    mix = ((ref - mean) / std)[None]
    with torch.no_grad():
        src = apply_model(m, mix, device="cpu", progress=True)[0]
    src = src * std + mean
    paths = {}
    for name in ("vocals", "drums", "bass"):
        if name in m.sources:
            mono = src[m.sources.index(name)].mean(0).numpy()
            p = os.path.join(work, f"{name}.wav"); sf.write(p, mono, sr); paths[name] = p
    return paths

# --- ドラム stem → オンセット検出＋帯域分類（kick/snare/hihat）。#S12 perception 層。 ---
# 生オンセット [[t_sec, "kick"|"snare"|"hihat", strength]] を返すだけ＝拍子/量子化/折り畳みは TS純関数側。
def drum_onsets(drums_wav):
    y, sr = librosa.load(drums_wav, mono=True)
    if y.size == 0:
        return []
    env = librosa.onset.onset_strength(y=y, sr=sr)
    tenv = librosa.times_like(env, sr=sr)
    ons = librosa.onset.onset_detect(onset_envelope=env, sr=sr, backtrack=True, units="time")
    win = int(0.05 * sr)  # 50ms 窓で帯域エネルギー比を見る
    out = []
    for t in ons:
        i0 = int(t * sr)
        seg = y[i0:i0 + win]
        if seg.size < 16:
            continue
        spec = np.abs(np.fft.rfft(seg * np.hanning(seg.size))) ** 2
        freqs = np.fft.rfftfreq(seg.size, 1.0 / sr)
        def band(lo, hi):
            return float(np.sum(spec[(freqs >= lo) & (freqs < hi)]))
        e_low = band(20, 150); e_mid = band(150, 3000); e_high = band(6000, sr / 2)
        tot = e_low + e_mid + e_high + 1e-9
        rl, rm, rh = e_low / tot, e_mid / tot, e_high / tot
        # 低域優勢=kick／高域優勢かつ低域小=hihat／それ以外(広帯域ノイズ)=snare
        if rl >= rm and rl >= rh and rl > 0.4:
            kind = "kick"
        elif rh >= rm and rl < 0.15:
            kind = "hihat"
        else:
            kind = "snare"
        k = int(np.argmin(np.abs(tenv - t)))
        strength = float(env[k]) if k < env.size else 1.0
        out.append([round(float(t), 3), kind, round(strength, 3)])
    return out

def main():
    audio = os.path.abspath(sys.argv[1])
    work = os.path.abspath(sys.argv[2]) if len(sys.argv)>2 else "/tmp/audio_poc_work"
    meter = int(sys.argv[3]) if len(sys.argv) > 3 else 4  # 拍子=ユーザー指定（既定4/4）。beat×meter で小節を引く。
    os.makedirs(work, exist_ok=True)
    name = os.path.splitext(os.path.basename(audio))[0]
    t0 = time.time()

    # 1. 分離（4stem＝vocals/drums/bass を1回で保存）
    stems = separate_stems(audio, work)
    vocals = stems.get("vocals", "")
    t_sep = time.time()-t0

    # 2. BPM＋**実ビート時刻**（フルmix）。固定BPMのドリフト回避のため beat_track の実ビートを出す。
    #    拍を綺麗に：tightness を上げて拍間隔を安定化（揺れ低減）＋BPMヒント(argv[4])があれば start_bpm で固定。
    y, sr = librosa.load(audio, mono=True)
    bpm_hint = None
    if len(sys.argv) > 4:
        try:
            v = float(sys.argv[4])
            bpm_hint = v if v > 0 else None
        except ValueError:
            bpm_hint = None
    if bpm_hint:
        tempo_raw, beats = librosa.beat.beat_track(y=y, sr=sr, start_bpm=bpm_hint, tightness=160)
    else:
        tempo_raw, beats = librosa.beat.beat_track(y=y, sr=sr, tightness=140)
    tempo = float(np.atleast_1d(tempo_raw)[0])
    beat_times = [round(float(t),3) for t in librosa.frames_to_time(beats, sr=sr)]
    key = estimate_key(y, sr)

    # 3. ボーカル：pyin を1回→音域＋メロ量子化＋f0輪郭（view-only）
    if os.path.exists(vocals):
        f0, voiced, ftimes, hop_sec = pyin_vocal(vocals)
        vr = vocal_range(f0, voiced)
        melody_notes = vocal_melody(f0, voiced, ftimes, hop_sec)
        melody_f0 = f0_contour(f0, voiced, ftimes)
    else:
        vr = {"error":"no vocal stem"}; melody_notes = []; melody_f0 = []

    # 4. コード（フルmix・BTC）
    t1 = time.time(); chords = btc_chords(audio); t_chord = time.time()-t1

    # 5. ドラム：分離済み drums stem からオンセット検出＋帯域分類（#S12・拍子/量子化は TS 側）
    d_onsets = drum_onsets(stems["drums"]) if "drums" in stems else []

    labs = [c[2] for c in chords]
    from collections import Counter
    freq = Counter(labs).most_common(12)
    out = {
        "file": os.path.basename(audio),
        "duration_sec": round(len(y)/sr,1),
        "bpm": round(tempo,1),
        "meter": meter,                             # ユーザー指定拍子（beats/bar）
        "beat_times": beat_times,                   # 実ビート時刻(秒)＝小節線導出の土台
        "key": key,
        "vocal_range": vr,
        "melody_notes": melody_notes,               # [[start,end,midi]]＝量子化メロ（view-only）
        "melody_f0": melody_f0,                      # [[t,hz|null]]＝生輪郭（量子化fallback表示）
        "chords_timeline": chords,                  # [start,end,label]（全体・切出は overlay 側）
        "drum_onsets": d_onsets,                     # #S12 [[t_sec, kick|snare|hihat, strength]]（生・拍子/量子化は TS）
        "chord_labels_seq": labs[:120],
        "chord_freq_top": freq,
        "timing_sec": {"separate": round(t_sep,1), "chords": round(t_chord,1), "total": round(time.time()-t0,1)},
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
