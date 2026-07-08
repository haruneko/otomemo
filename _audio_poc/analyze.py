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

# --- stem pyin（単音ピッチ抽出＝**ボーカルもベースも同型**：fmin/fmax を帯域で差し替えるだけ。#S12改3）---
def pyin_stem(wav, fmin, fmax):
    y, sr = librosa.load(wav, mono=True)
    f0, voiced, vprob = librosa.pyin(y, fmin=fmin, fmax=fmax, sr=sr)
    times = librosa.times_like(f0, sr=sr)  # 各フレームの時刻(秒)
    hop_sec = 512.0 / sr  # pyin 既定 hop_length=512
    return f0, voiced, times, hop_sec

# ボーカル＝声域(C2≈65〜E6≈1300Hz)。音域とメロで共有。
def pyin_vocal(vocal_wav):
    return pyin_stem(vocal_wav, 65, 1300)

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

# --- ドラム stem → 多帯域独立オンセット検出（kick/snare/hihat）。#S12改 perception 層。 ---
# 生オンセット [[t_sec, "kick"|"snare"|"hihat", strength]] を返すだけ＝拍子/量子化/折り畳みは TS純関数側。
# v1(単一onset検出→帯域比で排他分類)は同時発音(kick+hihat等)が1ラベルに潰れ hihat が全曲最少になる
# 実測バグ＝v2で**帯域ごとに独立検出**（同時刻に複数kindを許す）。包絡は帯域内95%tileで正規化し、
# **クロス帯域優勢ゲート**（同時刻の最強帯域の一定割合未満のピーク＝ブリード）で漏れ誤検出を落とす。
# 帯域/ゲートは実3曲（LostMemory/DeepSea/SURFACE）の較正で選定＝research/2026-07-08-drum-pattern-extraction.md
_DRUM_BANDS = {"kick": (25, 110), "snare": (250, 1500), "hihat": (6000, None)}
_DRUM_DOMINANCE = {"kick": 0.5, "snare": 0.6, "hihat": 0.4}

def drum_onsets(drums_wav, delta=0.20, min_strength=0.12):
    y, sr = librosa.load(drums_wav, mono=True)
    if y.size == 0:
        return []
    hop = 512
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    envs, peaks = {}, {}
    for kind, (lo, hi) in _DRUM_BANDS.items():
        hi = hi or sr / 2
        m = (freqs >= lo) & (freqs < hi)
        sub = librosa.amplitude_to_db(S[m], ref=np.max)
        env = librosa.onset.onset_strength(S=sub, sr=sr, hop_length=hop)
        ref = float(np.percentile(env[env > 0], 95)) if np.any(env > 0) else 1.0
        envs[kind] = env / (ref + 1e-9)
        peaks[kind] = librosa.util.peak_pick(envs[kind], pre_max=3, post_max=3,
                                             pre_avg=5, post_avg=5, delta=delta, wait=2)
    out = []
    kinds = list(_DRUM_BANDS)
    for kind in kinds:
        env = envs[kind]
        n = len(env)
        for f in peaks[kind]:
            s = float(env[f])
            if s < min_strength:
                continue
            f0, f1 = max(0, f - 1), min(n, f + 2)
            vmax = max(float(envs[k2][f0:f1].max()) for k2 in kinds)
            if s < _DRUM_DOMINANCE[kind] * vmax:
                continue  # 他帯域が圧倒的＝ブリードとみなす
            t = librosa.frames_to_time(f, sr=sr, hop_length=hop)
            out.append([round(float(t), 3), kind, round(s, 3)])
    # クラッシュ：高域(6kHz+)の**長い減衰**でハット(短い)と区別。セクション頭に入る＝小節頭(1拍目)の
    # 強い位相アンカー＋区間境界のマーカー（オーナー指摘）。減衰0.30s以上＋90%tile超のラウドさ。
    hi = freqs >= 6000
    envhi = S[hi].sum(axis=0)
    ost = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[hi], ref=np.max), sr=sr, hop_length=hop)
    onf = librosa.onset.onset_detect(onset_envelope=ost, sr=sr, hop_length=hop, units="frames", delta=0.3, wait=2)
    p90 = float(np.percentile(envhi, 90)) if envhi.size and np.any(envhi > 0) else 1.0
    nhi = len(envhi)
    for f in onf:
        peak = float(envhi[f:f + 3].max()) if f < nhi else 0.0
        thr = 0.35 * peak
        j = f
        while j < nhi and envhi[j] > thr:
            j += 1
        decay = (j - f) * hop / sr
        if decay >= 0.30 and peak >= p90:
            t = librosa.frames_to_time(f, sr=sr, hop_length=hop)
            out.append([round(float(t), 3), "crash", round(min(9.0, peak / (p90 + 1e-9)), 3)])
    return sorted(out, key=lambda x: x[0])

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

    # 5.5 ベース：分離済み bass stem に**低域pyin**→ボーカルと同じRLE量子化（#S12改3・機構共有）。
    #     帯域＝5弦B0≈31〜E4≈330Hz（実測でfmax400は倍音/ブリードを拾い G4等の外れ→330に締め）。単音・粒短め min_note_sec=0.06。
    bass_notes = []
    bass_wav = stems.get("bass", "")
    if bass_wav and os.path.exists(bass_wav):
        bf0, bvoiced, btimes, bhop = pyin_stem(bass_wav, 35, 330)
        bass_notes = vocal_melody(bf0, bvoiced, btimes, bhop, min_note_sec=0.06)

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
        "bass_notes": bass_notes,                    # #S12改3 [[start,end,midi]]＝低域pyin量子化ベース（TS側で区間絶対音ネタへ）
        "chord_labels_seq": labs[:120],
        "chord_freq_top": freq,
        "timing_sec": {"separate": round(t_sep,1), "chords": round(t_chord,1), "total": round(time.time()-t0,1)},
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
