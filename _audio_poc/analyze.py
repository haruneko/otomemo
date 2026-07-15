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

# ボーカル＝声域(C2≈65〜E6≈1300Hz)。音域とメロで共有。（PESTO 失敗時のフォールバック f0）
def pyin_vocal(vocal_wav):
    return pyin_stem(vocal_wav, 65, 1300)

# --- ボーカル f0 = PESTO（MIR-1K 学習の歌声モデル）。pyin よりオクターブ跳ねが実質ゼロで
#     note-F 0.76(vs pyin 0.57)・音域推定が正解に一致・CPU も速い（研究:
#     docs/research/2026-07-15-vocal-transcription-benchmark.md）。契約は pyin_stem と同型
#     (f0[Hz], voiced[bool], times[sec], hop_sec) ＝後段の量子化(vocal_melody)/音域(vocal_range) は無改修流用。
#     ※ベース低域は PESTO 未検証ゆえ据え置き（pyin_stem のまま）。
def pesto_vocal(vocal_wav):
    import torch, pesto
    y, sr = librosa.load(vocal_wav, sr=44100, mono=True)
    ts, pit, conf, _ = pesto.predict(torch.tensor(y), sr, step_size=10.0)  # step 10ms
    f0 = pit.numpy()
    times = ts.numpy() / 1000.0        # PESTO の timesteps は ms → 秒へ
    voiced = conf.numpy() >= 0.5       # 有声ゲート（本実測で 0.5 が妥当）
    return f0, voiced, times, 0.01

# =========================================================================
# ボーカル採譜の生歌較正（2026-07-15）＝VADゲート＋断片化対策。
# 背景: PESTO の conf≥0.5 は「音程の確からしさ」でありVADではない。Demucs vocal
# stem の伴奏滲みを PESTO が追跡し、イントロ/間奏でも幽霊ノートが出る（voiced率0.74・
# 密度がほぼ一様）。加えてビブラート/ポルタメントが半音RLEで細切れ（dur中央0.17s）。
# 対策: (A) 歌区間判定を「PESTO conf ∧ stem RMS 相対閾値 [∧ pyin voiced]」に強化。
#       (B) RLE前に f0 メディアンフィルタ＋RLE後に同音マージ／孤立短断片除去。
# f0値は常に PESTO（歌区間の"どの音程か"はPESTOが担う）。閾値は下の定数で較正可能。
# =========================================================================
# --- VADゲート定数（歌区間判定の較正パラメータ・ハードコード避け定数化） ---
VAD_RMS_PERCENTILE = 42     # vocal stem frame RMS の曲内相対閾値（pXX 以上を歌とみなす。
                            #   較正: 42 で 蜿蜒 の幽霊が落ち voiced 0.75→0.58・密度二極化、
                            #   かつ LostMemory 回帰 note-F 0.755（≥0.74 floor）を維持。上げると回帰が割れる）
VAD_USE_PYIN = False        # pyin voiced_flag も AND 併用するか（+~30s/曲。実測で幽霊除去は energy 単独で
                            #   十分・pyin併用は LostMemory note-F を下げるだけ＝既定 OFF・下の実測参照）
VAD_MEDIAN_F0 = True        # 半音RLE前に f0 メディアンフィルタ（ビブラート断片化抑制）
VAD_MEDIAN_MS = 130         # メディアン窓（ms・較正: 130 でビブラート周期を潰しつつ実音は温存）
# --- 断片化後処理定数 ---
NOTE_MERGE_GAP = 0.10       # 同音でこの gap 以内の隣接ノートを1つに結合（s）
NOTE_ABSORB_DUR = 0.14      # これ以下の短ノートは優勢な隣接持続音の割れとみなし除去（spike/dip/±半音揺れ）
NOTE_ABSORB_RATIO = 2.5     # 隣接ノートが blip の何倍以上なら"優勢"（持続音の割れ）とみなすか
NOTE_ABSORB_NB_MIN = 0.30   # 優勢隣接の最小絶対dur（s）＝持続音のみ吸収先に（速い実フレーズは温存）
NOTE_MIN_ISOLATED = 0.10    # 孤立短断片の最大 dur（s・これ以下かつ前後gap大なら除去）
NOTE_ISOLATED_GAP = 0.12    # 孤立判定の前後 gap 下限（s）

def stem_energy_mask(vocal_wav, times, percentile=VAD_RMS_PERCENTILE):
    """vocal stem の frame RMS を曲内相対閾値でゲートし f0 時刻グリッドへ整合。
    イントロ/間奏の伴奏滲み（低エネルギー）を歌区間から外す＝幽霊ノートの主犯対策。"""
    y, sr = librosa.load(vocal_wav, sr=44100, mono=True)
    hop = 512
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rtimes = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop)
    nz = rms[rms > 1e-5]
    thr = float(np.percentile(nz, percentile)) if nz.size else 0.0
    rms_at = np.interp(np.asarray(times, dtype=float), rtimes, rms)  # f0 grid へ線形整合
    return rms_at >= thr, thr

def pyin_voiced_mask(vocal_wav, times):
    """pyin の保守的な voiced_flag を f0 時刻グリッドへ整合（AND併用オプション用）。"""
    _, voiced, ptimes, _ = pyin_vocal(vocal_wav)
    v = np.nan_to_num(np.asarray(voiced, dtype=float), nan=0.0)
    return np.interp(np.asarray(times, dtype=float), ptimes, v) >= 0.5

def median_f0(f0, times, win_ms=VAD_MEDIAN_MS):
    """有声 f0 の対数領域メディアンフィルタ。ビブラート/ポルタメントの微振動で
    半音RLEが割れる断片化を抑える。無声（NaN/0）は素通し。"""
    from scipy.signal import medfilt
    f0 = np.asarray(f0, dtype=float)
    times = np.asarray(times, dtype=float)
    dt = float(np.median(np.diff(times))) if len(times) > 1 else 0.01
    k = max(1, int(round((win_ms / 1000.0) / max(dt, 1e-6))))
    if k % 2 == 0:
        k += 1
    if k < 3:
        return f0
    valid = np.isfinite(f0) & (f0 > 0)
    if valid.sum() < k:
        return f0
    lg = np.where(valid, np.log2(np.where(valid, f0, 1.0)), np.nan)
    idx = np.where(valid, np.arange(len(lg)), 0)  # nearest(前方)-fill で穴埋め
    np.maximum.accumulate(idx, out=idx)
    filled = lg[idx]
    filled = np.where(np.isnan(filled), float(np.nanmedian(lg[valid])), filled)
    sm = medfilt(filled, k)
    out = f0.copy()
    out[valid] = np.power(2.0, sm[valid])         # 無声フレームは書き換えない
    return out

def _same_pitch_merge(seq, merge_gap):
    out = [list(seq[0])]
    for s, e, m in seq[1:]:
        if m == out[-1][2] and s - out[-1][1] <= merge_gap:
            out[-1][1] = max(out[-1][1], e)       # 同音・近接 → 前ノートを延長
        else:
            out.append([s, e, m])
    return out

def postprocess_notes(notes, merge_gap=NOTE_MERGE_GAP, absorb_dur=NOTE_ABSORB_DUR,
                      absorb_ratio=NOTE_ABSORB_RATIO, absorb_nb_min=NOTE_ABSORB_NB_MIN,
                      min_isolated=NOTE_MIN_ISOLATED, isolated_gap=NOTE_ISOLATED_GAP):
    """RLE後の断片化対策（ビブラート/ポルタメント/オクターブ跳ねの細切れ潰し）:
    ①同音で gap≤merge_gap を結合 ②完全孤立の短断片を除去 ③持続音を割った短ノート
    （spike/dip/±半音揺れ）を"優勢な"隣接持続音へ吸収 → ④再度同音結合。
    吸収は「隣接が blip の absorb_ratio 倍以上 かつ 絶対 absorb_nb_min 秒以上」の時だけ発火
    ＝速い実フレーズ（短ノートの連なり）は温存し、持続音の中の揺れ断片だけ畳む。"""
    if not notes:
        return notes
    ns = _same_pitch_merge(sorted((list(x) for x in notes), key=lambda x: x[0]), merge_gap)
    # ② 前後gap大の完全孤立短断片を除去
    tmp = []
    for i in range(len(ns)):
        s, e, m = ns[i]
        gap_b = s - ns[i - 1][1] if i > 0 else 1e9
        gap_a = ns[i + 1][0] - e if i < len(ns) - 1 else 1e9
        if (e - s) <= min_isolated and gap_b >= isolated_gap and gap_a >= isolated_gap:
            continue
        tmp.append([s, e, m])
    ns = tmp
    # ③ "優勢な"持続音に隣接した短ノート（held音を割った揺れ断片）を**除去**（境界は動かさない
    #    ＝onset安全）。速い実フレーズ（短ノートの連なり＝隣接も短い）は絶対dur guard で温存。
    bridge = merge_gap * 2

    def dominated(i):
        d = ns[i][1] - ns[i][0]
        ok = False
        if i > 0 and ns[i][0] - ns[i - 1][1] <= bridge:
            nd = ns[i - 1][1] - ns[i - 1][0]
            ok = ok or (nd >= absorb_ratio * d and nd >= absorb_nb_min)
        if i < len(ns) - 1 and ns[i + 1][0] - ns[i][1] <= bridge:
            nd = ns[i + 1][1] - ns[i + 1][0]
            ok = ok or (nd >= absorb_ratio * d and nd >= absorb_nb_min)
        return ok

    changed = True
    while changed and len(ns) >= 2:
        changed = False
        best_i, best_dur = None, 1e9
        for i in range(len(ns)):
            if (ns[i][1] - ns[i][0]) <= absorb_dur and dominated(i) and (ns[i][1] - ns[i][0]) < best_dur:
                best_dur, best_i = (ns[i][1] - ns[i][0]), i
        if best_i is None:
            break
        ns.pop(best_i)                             # blip 除去（隣接ノートの境界は不変）
        changed = True
    # ④ 除去で残った持続音の同音断片を再結合（held音のディップ跡を1本へ・gap は absorb_dur まで許容）
    ns = _same_pitch_merge(ns, max(merge_gap, absorb_dur))
    return [[round(s, 3), round(e, 3), int(m)] for s, e, m in ns]

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

    # 3. ボーカル：PESTO f0 を1回→音域＋メロ量子化＋f0輪郭（view-only）。
    #    PESTO の import/実行が失敗したら従来 pyin へ自動フォールバック（f0_engine にどちらか記録）。
    f0_engine = None
    if os.path.exists(vocals):
        try:
            f0, voiced, ftimes, hop_sec = pesto_vocal(vocals)
            f0_engine = "pesto"
        except Exception as e:
            print(f"[warn] PESTO f0 failed ({e!r}); falling back to pyin", file=sys.stderr)
            f0, voiced, ftimes, hop_sec = pyin_vocal(vocals)
            f0_engine = "pyin"
        # --- 生歌較正: VADゲート（stem RMS 相対閾値 ∧ conf/voiced [∧ pyin]）＋断片化対策。
        #     エンジン非依存で PESTO/pyin 両経路に適用（f0値は各エンジン、歌区間判定を強化）。
        emask, _rms_thr = stem_energy_mask(vocals, ftimes)
        voiced = np.asarray(voiced) & emask
        if VAD_USE_PYIN and f0_engine != "pyin":
            voiced = voiced & pyin_voiced_mask(vocals, ftimes)
        if VAD_MEDIAN_F0:
            f0 = median_f0(f0, ftimes)
        vr = vocal_range(f0, voiced)
        melody_notes = postprocess_notes(vocal_melody(f0, voiced, ftimes, hop_sec))
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
        "f0_engine": f0_engine,                      # "pesto"|"pyin"|null＝ボーカルf0の採譜器（追加のみ・後方互換）
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
