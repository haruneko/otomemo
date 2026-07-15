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

---

## 組込実施（2026-07-15）— タスク A4

**結論: 組込完了。母艦 `_audio_poc/.venv` にボーカル f0 = PESTO を本番投入（フォールバック付き）。** 実装は上の「組込案」どおり、f0 フロントエンドのみ差し替え・後段の RLE 量子化/音域は無改修流用。

### venv 変更内容（母艦 `.venv` のみ・venv-f1/f2 は不変）
- `uv pip install --no-deps "pesto-pitch==2.0.1"`（venv-f2 の実物と同一版・PyPI パッケージ名 `pesto-pitch`、import 名 `pesto`）。
- **`--no-deps`** で入れた理由＝母艦 `.venv` は pesto の依存を既に全て満たしていた（torch 2.12.1+cpu / torchaudio 2.11.0+cpu / numpy 2.4.6 / omegaconf 2.3.1 / scipy 1.18.0 / tqdm 4.68.3）。既存依存に一切触れず pesto 本体 1 パッケージだけ追加＝torch を巻き添え更新しないための予防。
- 導入後、`analyze.py` の import 群（numpy/librosa/torch/soundfile/demucs）＋ `import pesto` が全て通ることを確認。既存依存は破壊せず。

### analyze.py の変更（diff 要約・vocal f0 のみ）
1. 新関数 `pesto_vocal(vocal_wav)` を追加。契約は `pyin_stem` と同型 `(f0[Hz], voiced[bool], times[sec], hop_sec)`。`pesto.predict(torch.tensor(y), sr, step_size=10.0)` → `f0=pit`, `voiced=conf>=0.5`, `times=ts/1000`（**PESTO の timesteps は ms 返し**＝実測で 0,10,20… ms を確認。秒へ変換必須）, `hop_sec=0.01`。
2. `main()` のボーカル節を `pesto_vocal` 優先＋**graceful fallback**に変更＝`try: pesto_vocal / except Exception: pyin_vocal`。`vocal_range`/`vocal_melody`/`f0_contour` は無改修で新 f0 を食う。
3. 出力 facts に **`f0_engine: "pesto"|"pyin"|null`** を1フィールド追加（追加のみ・後方互換）。melody_notes/melody_f0/vocal_range のスキーマは不変。
4. **ベース低域 pyin（`pyin_stem(bass,35,330)`）は据え置き**（PESTO 歌声モデルは超低域未検証）。

### 回帰確認の実測値
- **(a) 本番コードパス経由の note-F（評価ハーネス再利用）**: `analyze.pesto_vocal → analyze.vocal_melody` の出力を F2 の `evallib`（GT track8・offset 2.45・mir_eval）で採点＝**note-F 0.761 / P 0.812 / R 0.716 / onF 0.773 / n_est 544**。F2 実測 0.761 を**完全再現**（≥0.7 クリア）。
- **(b) フル analyze.py 実走**（`data/assets/8c70788d….mp3`＝LostMemory・329.4s、Demucs 再分離込み）: JSON 壊れず全キー健在、`f0_engine="pesto"`、`vocal_range = C4–C5`（hz 256.6–513.3・voiced 0.558）＝F2 正解 C4–B4 級に一致（生 f0 の 5/95%tile ゆえ上端が B4→C5 と半音広いだけ）。`melody_notes=554`（pesto の n_est≈544 と整合）、`bass_notes=493`（pyin 据え置きで不変）、drum/chords/key/bpm 健在。timing: separate 133.7s（Demucs・並行負荷下）+ chords 2.1s + total 164.8s。pesto f0 自体は 10–20s。
- **フォールバック動作確認**: `builtins.__import__` で `import pesto` を強制失敗させると `except` が発火し pyin へ自動フォールバック＝`f0_engine="pyin"`・従来の音域 G#3–G#5 を再現。正常系/異常系の両方 OK。

### 反映タイミング（重要）
- analyze.py は **spawn 型**（api がジョブごとに `.venv/bin/python analyze.py` を起動）＝**api 再起動不要**、次のアナリーゼジョブから新コードが自動的に使われる。今回このタスクでは api 再起動はしていない。
- 残（オーナー手番）: 組込案の注意どおり、**生歌を含む別曲での耳＋数値の追検証を1回**（正解 MIDI 不要・pyin 出力との差分＋試聴）。step 10ms 化でノート境界が pyin(23ms) より僅かに細かい点の耳確認も同時に。

---

## 生歌較正（2026-07-15）— VADゲート＋断片化対策

**背景**: PESTO 投入後、実プロダクション曲（畑亜貴「蜿蜒 on and on and」5:11・生歌）で初の生歌実走 → オーナー耳判定「メロディ全然とれてない」。データ診断で外れ方は2型と特定:
1. **幽霊ノート（主犯）**: 10秒ビンのノート数が曲全体でほぼ一様（≈21個/ビン）＝イントロ/間奏でも採譜し続け。voiced率0.75。原因＝**PESTO の conf≥0.5 は「音程の確からしさ」でありVADではない** → Demucs vocal stem の伴奏滲みを PESTO が追跡。
2. **断片化**: dur中央0.17s・42%が≤0.15s＝ビブラート/ポルタメントが半音RLEで細切れ。

**対策（実装・`analyze.py`）**: f0値は常に PESTO のまま、**歌区間判定と粒度**だけ強化。定数は全て `analyze.py` 冒頭にモジュール定数化（較正しやすく）。
- **(A) VADゲート**: `voiced = (PESTO conf≥0.5) ∧ (vocal stem frame RMS ≥ 曲内 p42)`。stem 自身のRMS分布に対する**相対閾値**でイントロ/間奏の低エネルギー滲みを歌区間から外す（`stem_energy_mask`）。pyin voiced_flag の AND 併用（オプション a・`VAD_USE_PYIN`）も実装したが**実測で棄却**（下記）。
- **(B) 断片化対策**: ①半音RLE前に f0 対数領域メディアンフィルタ130ms（ビブラート周期を潰し実音は温存・`median_f0`）②RLE後に同音・近接gap結合 ③完全孤立の短断片除去 ④**優勢な隣接持続音に割り込んだ短ノート（spike/dip/±半音揺れ）を除去**（`postprocess_notes`）。④は「隣接が blip の2.5倍以上 かつ 絶対0.30s以上」の時だけ発火＝速い実フレーズ（短ノートの連なり）は温存し、持続音内の揺れ断片だけ畳む。除去は**境界を動かさない onset安全操作**（隣接ノートへ吸収して境界を動かすと onset±50ms 判定を壊し note-F が落ちるため）。

### 採用ゲート方式 = **energy 単独（pyin AND は棄却）**

| 方式 | LostMemory note-F | 蜿蜒 voiced | 蜿蜒 le≤0.15 | 判定 |
|---|---|---|---|---|
| energy 単独（採用） | **0.747** | 0.575 | 0.245 | ✓ 回帰 floor 維持・幽霊除去両立 |
| energy ∧ pyin voiced | 0.721 | 0.501 | 0.254 | ✗ **回帰 floor 0.74 を割る**・幽霊除去は energy 単独と同等 |

pyin 併用は LostMemory の実音まで削り note-F を 0.74 未満へ落とすだけで、幽霊除去の追加効果は無し。かつ +~30s/曲のコスト増。**energy 単独を既定**（`VAD_USE_PYIN=False`）。

### before / after 実測（両曲・end-to-end `analyze.py` フル実走）

| 指標 | LostMemory（回帰・GT track8） | | 蜿蜒（生歌・GT無し） | |
|---|---|---|---|---|
| | before | after | before | after |
| note-F | 0.761 | **0.747** | — | — |
| P / R | 0.812 / 0.716 | 0.851 / 0.666 | — | — |
| voiced率 | 0.557 | 0.556 | **0.746** | **0.575** |
| ノート数 | 544 | 483 | 619 | 463 |
| dur中央(s) | 0.16 | 0.26 | **0.17** | **0.22** |
| ≤0.15s率 | 0.445 | **0.253** | **0.433** | **0.245** |
| 音域 p5–p95 | C4–C5 | **C4–B4** | A♯3–C♯5 | A♯3–C♯5 |
| 密度 polar(上位/下位1/4) | — | — | **2.9** | **4.8** |
| total実行(s) | — | 111.3 | — | 108.5 |

- **受け入れ基準の到達**:
  1. **回帰**: LostMemory note-F **0.747 ≥ 0.74** ✓（現行0.761 から −0.014・"多少の低下は許容"の範囲）。副産物で**音域推定が C4–C5 → C4–B4 ＝ GT に完全一致**（VADが範囲汚しも除去）。P 0.812→0.851（偽ノート減）・R 0.716→0.666（ゲート/畳みの取りこぼし）。
  2. **幽霊除去**: 蜿蜒 voiced **0.746 → 0.575**（目安0.4–0.6内）✓。密度は before 全ビン17–27の一様（polar 2.9）→ after は間奏/イントロが 5–6・歌区間 15–24 と**明確な二極**（polar 4.8）✓。
  3. **断片化**: 蜿蜒 ≤0.15s率 **0.433 → 0.245（≤0.25達成）** ✓。dur中央 **0.17 → 0.22**（+29%改善だが目標0.25には一歩届かず）△。**未達の理由＝LostMemory の GT 実音が dur中央0.155s・≤0.15s率0%（min 0.155s）で"実音そのものが短い"曲**であり、蜿蜒 の dur中央を 0.25 まで押すにはこの帯域の畳みを強めるしかなく、それは LostMemory の実音を削って回帰 floor 0.74 を割る（sweep で確認）。**回帰 floor を優先し dur中央は 0.22 で留める**判断。蜿蜒 自体が速い旋律主体で中央0.25は元々厳しい。
  4. **JSON健全・実行時間**: 両曲とも全キー健在・`f0_engine="pesto"`・total 108–111s（Demucs分離82–83sが支配）。追加コスト（RMS load 1–2s＋median/後処理<1s、pyin OFF）は誤差＝**+30s以内 目安を大きく満たす** ✓。

- **不変**: melody_notes/melody_f0/vocal_range/f0_engine のスキーマ、bass 経路（低域pyin据え置き）、他 facts は無改修。フォールバック（pesto失敗→pyin）経路にも VADゲート＋後処理は共通適用（エンジン非依存）。
- **較正の再現**: 母艦 `_audio_poc/.venv`（pesto導入済）。蜿蜒 音源/stem は実験中のみキャッシュし**測定完了後に削除**（著30-4運用・生歌の採譜リテラルは非保存）。LostMemory は既存 F2 ハーネス（`scratchpad/f2work/` GT track8・offset 2.45・mir_eval）で採点。
- 残（オーナー手番）: **蜿蜒 の耳確認**（数値は改善したが生歌の質は耳が最終審級）。既存の 蜿蜒 analysis ネタの再生成はオーナー相談で（本タスクはローカル実走検証のみ・ネタは触っていない）。定数（p42/median130/absorb系）は生歌をもう数曲通しての再較正余地あり。
