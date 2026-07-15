# ボーカルメロ採譜ベンチマーク（F2）— pyin(現行) vs basic-pitch vs torchcrepe vs PESTO vs ROSVOT

- 日付: 2026-07-15
- 目的: 音源アナリーゼの現行ボーカルメロ抽出（Demucs vocal stem → librosa.pyin f0 → 半音丸め＋RLE量子化、`_audio_poc/analyze.py` の `vocal_melody`）に**勝てる採譜器があるか**を自作曲の MIDI 正解で横並び実測する。負けなら入れない（負けない既定）。
- 結論の一言: **PESTO が明確に勝つ**（note-F 0.76 vs 現行 pyin 0.57、しかも現行より速い）。採用推奨。

---

## TL;DR（結論5行）

1. **勝者 = PESTO**。実ボーカル stem で note-F 0.761（pyin 0.568）、音域推定は正解に完全一致（p5–p95 = C4–B4）、オクターブ跳ね ≒ 0、CPU 16.6s と **pyin(31s) より速い**。MIT・pip 一発・既存 `.venv`（torch+torchaudio 有り）にそのまま載る。
2. **torchcrepe(full)** は raw f0 の素性は最良（frame exact 0.890）だが note-F 0.702 で PESTO に一歩及ばず、かつ **CPU 459s（実時間の1.4倍＝リアルタイム以下）で非現実**。PESTO の下位互換。
3. **basic-pitch** は実ボーカルで note-F 0.555（pyin とほぼ同等以下）。ポリフォニック前提ゆえ倍音/オクターブを拾い 973 ノート乱発、precision 0.45、音域が A3–B5(50–83) に膨張。feasibility の ~49% と整合＝**入れる価値なし**。
4. **ROSVOT**（歌特化・ACL'24）は導入断念を記録。inference が `cuda:{rank}` 決め打ち＋分散初期化（NATSpeech 系ハーネス）＋Google Drive のチェックポイント zip 依存で、**CPU-only 化には非自明な改造が要る**。PESTO が既に勝っているため深追いせず。
5. **合成ラウンドトリップ検証**（正解 MIDI→サイン波→再採譜）で GT と評価系の妥当性を確認済み。クリーン信号なら3者とも高精度（basic-pitch すら 0.996）＝実ボーカルでの差は「実声質へのロバスト性」の差であって GT ミスマッチではない。

---

## 正解データの出所と限界（正直な記録・最重要）

- **正解 MIDI**: `/tmp/piano2.mid`（POC 記録の LostMemory フルアレンジ多重トラック、10トラック・324.1s）。`_audio_poc/compare.py` が参照していた同一ファイルが `/tmp` に残存していた。
- **音源**: `data/assets/8c70788d-…​.mp3`（asset テーブル label = "LostMemory"、329.5s）。MIDI 324.1s とほぼ一致＝この mp3 は piano2.mid をレンダーしたもの（または同一素材）と強く推定。
- **ボーカルトラックの同定**: 10トラックのうち **track 8**（A3–C5・617ノート・完全モノフォニック・vocal 帯域）を、Demucs で分離した vocal stem に pyin をかけた f0 輪郭と各トラックを相関比較して選定。track 8 が corr 0.70／octave-equiv hit 0.78 で突出（次点 track 0 が 0.37）。他は 0.06–0.24。**track 8 = リードボーカルで確定**。
- **時間アラインメント**: mp3 と MIDI は **一定オフセット +2.45s**（MIDI が 2.45s 先行）で整合し、曲を4分割しても octave-equiv hit 0.85–0.96 と**ドリフト無し**＝クリーンな定数シフト。全ツールの推定を audio 時間軸のまま、GT を `[start−2.45, end−2.45]` にずらして比較。
- **限界（過大評価の可能性）**:
  - 正解は**1曲・LostMemory のみ**。曲ごとの一般化は測れていない（他自作曲は MIDI 正解が見つからず）。
  - この mp3 のボーカルは MIDI に時間ロックした一定オフセット＝**ソフトシンセ/ボカロ的なレンダーの可能性が高い**。生歌（強いビブラート・子音・しゃくり・息）ではどのツールも絶対値は下がる。**得られるのは相対順位**であって絶対 note-F ではない。PESTO は MIR-1K（実歌唱）学習なので生歌でも優位は保つと見るが、要・実曲追検証。
  - note-F は onset±50ms × pitch±50cent（mir_eval `precision_recall_f1_overlap`, offset 無視）。RLE 量子化の閾値（min_note_sec=0.09）は現行実装のまま3つの f0 系（pyin/crepe/pesto）で共通＝**フロントエンド f0 の質だけを比較**する土俵。basic-pitch と ROSVOT は自前のノート化を使う。

---

## 比較表（実ボーカル stem・LostMemory・329s）

| ツール | note-F | P | R | onset-F | 輪郭 exact | 輪郭 corr | 音域 p5–p95 | ノート数 | CPU時間 | raw f0 exact/octeq | 導入 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **正解(track8)** | — | — | — | — | — | — | **60–71 (C4–B4)** | 617 | — | — | — |
| pyin（現行） | 0.568 | 0.538 | 0.601 | 0.645 | 0.864 | 0.715 | 56–76 (G#3–E5) | 689 | 31.1s | 0.821 / 0.885 | 既存 |
| **PESTO** | **0.761** | 0.812 | 0.716 | 0.773 | 0.968 | 0.988 | **60–71 (完全一致)** | 544 | **16.6s** | 0.840 / 0.841 | pip 一発 |
| torchcrepe(full) | 0.702 | 0.724 | 0.681 | 0.708 | 0.976 | 0.992 | 60–72 | 580 | 459.2s | **0.890 / 0.890** | pip |
| basic-pitch(onnx) | 0.555 | 0.453 | 0.715 | 0.602 | 0.735 | 0.700 | 50–83 (膨張) | 973 | 9.8s | — | pip(TF回避) |
| ROSVOT | 導入断念 | | | | | | | | | | GPU前提 |

- **輪郭 exact** = 最終ノートを10ms格子にラスタライズし、GT が鳴っている frame での「同一半音一致率(|Δ|<0.5)」。**corr** = 同 frame の Pearson 相関。**raw f0** = RLE 量子化前の素の f0 輪郭の同一半音/オクターブ等価一致率。
- CPU時間の注記: **並行負荷あり**（別エージェントの venv-f1＝allin1/beat_this が同居、16コア機）。特に torchcrepe(full) の 459s はその影響も乗るが、それでも実時間 329s の 1.4 倍でリアルタイム以下＝対話用途に非現実なのは動かない。pyin/PESTO/basic-pitch は実時間内。

## 合成ラウンドトリップ（正解 MIDI→サイン波→再採譜・GT と評価系の妥当性検証）

| ツール | note-F | P | R | 輪郭 exact | 音域 | raw f0 exact/octeq | CPU |
|---|---|---|---|---|---|---|---|
| pyin | 0.944 | 1.000 | 0.895 | 0.999 | 60–71 | 0.976 / 0.976 | 45.9s |
| PESTO | 0.960 | 1.000 | 0.922 | 1.000 | 60–71 | **1.000 / 1.000** | 15.2s |
| basic-pitch | **0.996** | 1.000 | 0.992 | 0.999 | 60–71 | — | 10.8s |

- クリーン単音サイン波なら3者とも高精度＝**GT・オフセット・評価スクリプトは正しい**。全員が音域 60–71 を完全再現し corr=1.0。
- **basic-pitch はクリーン信号だと最良(0.996)**。実ボーカルでの崩壊(0.555)は「倍音/息/ビブラート/子音＝実声質へのロバスト性の欠如」であって、ノート化ロジック自体の欠陥ではない。
- **pyin はクリーンサイン波でも raw octeq 0.976（≒2% frame がオクターブ誤り）**。pyin のオクターブ不安定は入力の綺麗さに関係なく内在。PESTO は 1.000（皆無）。

---

## 曲ごとの所見（どこで外すか）

- **pyin（現行）の主敗因＝オクターブ跳ね**: 実 stem で raw f0 の exact 0.821 に対し octeq 0.885 ＝**約6% の frame が正しい pitch class だがオクターブ違い**。これが (a) 音域推定を C4–B4 → G#3–E5 に不当に広げ（`vocal_range` 特徴が汚れる）、(b) RLE で偽ノートを生み note-F を落とす。合成でも 2% 残る＝構造的欠陥。
- **basic-pitch**: ポリフォニック採譜モデルゆえボーカルの倍音・オクターブ上下を別ノートとして拾う。973 ノート（GT の 1.58 倍）、precision 0.45、音域が A3(50)–B5(83) に膨張。単旋律ボーカルには過剰。
- **torchcrepe(full)**: f0 輪郭の素性は全ツール中最良（raw exact 0.890）だが、periodicity 0.5 の有声判定が PESTO の confidence より粗く、note の precision で PESTO に負ける（0.724 vs 0.812）。決定打は **CPU 459s** の遅さ。
- **PESTO**: 既定モデル `mir-1k_g7`（MIR-1K＝実歌唱で学習）。オクターブ跳ねが実質ゼロ、confidence の有声判定が綺麗で偽ノートが少ない（544 ノート＝GT に最も近い）、音域を完全再現。唯一の弱点は raw exact が crepe よりわずかに低い(0.840)が、量子化後の輪郭 exact は 0.968 まで上がり実害なし。

---

## analyze.py への組込案（勝者 = PESTO）

方針: **f0 フロントエンドだけ差し替え、後段の RLE 量子化（`vocal_melody`）と `vocal_range` はそのまま流用**。最小改造で note-F と音域推定の両方が改善する。

- 依存: `pip install pesto-pitch`（MIT）。既存 `_audio_poc/.venv` は torch 2.12.1+cpu / torchaudio 2.11.0+cpu を既に持つので追加は pesto 本体＋依存のみ。CUDA 不要・CPU 16s/曲。
- 変更点（`analyze.py`）:
  - `pyin_vocal(vocal_wav)` を PESTO 版に差し替え、`(f0, voiced, times, hop_sec)` の同じ契約で返す。
    ```python
    # 疑似コード
    import pesto, torch, librosa
    def pesto_vocal(vocal_wav):
        y, sr = librosa.load(vocal_wav, sr=44100, mono=True)
        ts, pit, conf, _ = pesto.predict(torch.tensor(y), sr, step_size=10.0)  # 10ms
        f0 = pit.numpy(); times = ts.numpy()          # ts は秒
        voiced = conf.numpy() >= 0.5                   # 有声ゲート（本実測で 0.5 が妥当）
        return f0, voiced, times, 0.01
    ```
  - `vocal_melody(...)` と `vocal_range(...)` は無改造で PESTO の f0 を食わせる。fmin/fmax による帯域制約は PESTO には不要（内部で処理）。
  - `f0_contour(...)`（view-only 輪郭）も同 f0 で綺麗になる。
- 注意:
  - **ベース stem の低域 pyin（`pyin_stem(bass, 35, 330)`）は据え置き推奨**。PESTO は歌声モデルで、超低域ベースは未検証。今回のベンチはボーカルのみ。
  - PESTO は step_size 10ms 固定で pyin(hop 23ms) より frame 密＝ノート境界が僅かに細かくなる。min_note_sec=0.09 の量子化はそのままで問題ないが、実曲で耳確認を1回。
  - 絶対 note-F はボカロ的レンダー1曲での値。**実装後、生歌を含む別曲で耳＋数値の追検証を1回**（正解 MIDI 不要、pyin 出力との差分＋試聴で可）。

## ROSVOT 導入断念の記録

- clone は成功（`RickyL-2000/ROSVOT`, ACL'24, MIT ライセンス表記あり）。
- 断念理由（CPU 非現実）:
  1. `inference/rosvot.py:251` が `device = torch.device(f"cuda:{int(rank)}")` 決め打ち。`init_process_group`/`DistributedSampler`/`move_to_cuda` を使う NATSpeech 系分散推論ハーネスで、**CPU-only 化はデバイス処理の非自明な改造が必要**。
  2. チェックポイント（ROSVOT＋RWBD＋RMVPE）が **Google Drive の zip** 配布＝取得が不安定、かつ hparams/config フレームワークの結線も要る。
  3. 依存が torch(cu118)＋tensorflow 2.9＋pyworld 等と重い。
- 判断: PESTO が既に pyin/crepe/basic-pitch を上回って勝っており、ROSVOT に CPU 移植コストを払う前に**採用候補は確定**。ROSVOT は将来 GPU 環境が出来た時 or v2.0 リリース時に再評価（backlog 候補）。

---

## 再現メモ（作業環境・成果物）

- 機材: WSL2・16コア・CPU のみ・空きディスク 910G。
- venv: 新規 `_audio_poc/venv-f2`（uv 作成、torch 2.12.1+cpu / torchaudio 2.11.0+cpu / torchcrepe / pesto-pitch / basic-pitch[onnx 手動] / librosa / mir_eval）。既存 `.venv`・`venv-f1` は不変。
  - basic-pitch は cp312 の TensorFlow wheel が無く、`--no-deps` ＋ `onnxruntime` で **ONNX バックエンド**を成立させた（フル TF 回避）。
  - torchaudio は pesto/torchcrepe が引く版が CUDA/ABI 不整合を起こしたため、既存 `.venv` 実績の torch 2.12.1+cpu / torchaudio 2.11.0+cpu ペアに固定して解消。
- Demucs vocal 分離: `htdemucs`・CPU 91s（analyze.py と同設定を別スクリプトで再現、既存 venv は読み取り実行のみ）。
- 作業ファイル一式（スクラッチ、非コミット）: `…/scratchpad/f2work/`（separate.py, run_pyin.py, run_crepe.py, run_pesto.py, run_bp.py, evallib.py, eval_run.py, synth.py 等）。
