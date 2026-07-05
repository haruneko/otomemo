# メロディ・ライン拡張 AIモデル調査（symbolic / 制御性重視）

調査日: 2026-06-28
目的: gen_melody の拡張 or 自作V2エンジンの補助（候補出し / 変奏 / 装飾 / 補完）として使える、
**調・コード進行・骨格・style・小節数で条件づけられる** symbolic(MIDI/ABC) メロAIを探す。
評価軸の優先順: (1)入手性・ライセンス商用可 → (2)可動性(CPU可/GPU要) → (3)★制御性 → (4)統合容易性。
方法: Web検索5系統 + 個別fetch。各事実は出典URL付き。param数が未公表のものは「不明」と明記。

---

## 結論（先に）

我々の価値＝**制御性**と既存の**V2骨格→表面エンジン**を踏まえると、補助として一番使えるのは:

1. **Music SketchNet** … 骨格/表面の二層を**pitch-contour と rhythm の分離潜在**で直接制御。CC0で商用フリー。
   V2の【骨格】=contour・【表面】=rhythm という層分けと 1:1 対応。チェックポイント同梱・軽量。
2. **Composer's Assistant 2 (CA2)** … MIT・**学習コーパスがPDのみ(著作権クリーン)**・CPU可。
   小節×トラック単位の inpainting で「コード/他トラックを固定→メロ小節だけ補完」。候補出し本命。
3. **Anticipatory Music Transformer (AMT)** … Apache-2.0・HF配布・780M/360M/128M。
   旋律を固定→伴奏生成、区間 infill。ただし条件は**音符イベント**であって"コード記号"ではない＋
   著者自身が**学習データ丸暗記/再現リスク**を明言（注意）。
4. **MelodyT5** … MIT・HF配布・ABC。harmonization/melodization/variation/segment 等7タスク単一モデル。
   ABCの `K:` で調指定。**変奏(variation)タスク**を持つので V2 の変奏補助に直結。

→ **最有力 = Music SketchNet（V2の骨格/表面思想と完全一致・CC0で著作権安全・軽量）**。
　汎用候補出し/補完は **CA2（MIT＋PDコーパスで法的に最も安全）** を併用。
　AMT/MuseCoco 等の大型LMは制御が"イベント/属性"止まりかつ丸暗記リスクがあり、本命に置かない。

---

## 上位候補（詳細）

### 1. Music SketchNet (SketchVAE + SketchInpainter + SketchConnector) — ISMIR 2020
- リンク: https://github.com/RetroCirce/Music-SketchNet ／ paper https://arxiv.org/abs/2008.01291
- 何ができる: 単旋律の **inpainting/補完**。欠落小節を周辺文脈から埋め、ユーザの
  **pitch-contour および/または rhythm スケッチで誘導**できる。SketchVAEが1小節を
  **pitch-contour 潜在 と rhythm 潜在に分離** → これが制御ノブ。
- 入手・ライセンス: **CC0-1.0（パブリックドメイン献呈）= 商用無制限**。
  **学習済みチェックポイント同梱**(`model_backup.zip`, Google Drive) + 学習データ + IrishFolkSong。
- 可動性: PyTorch、Jupyterパイプライン。CPU/GPU・依存版はREADME未明記(要確認)。モデルは小規模。
- 制御性: ★高。**pitch-contour＋rhythm を明示条件**（pitchのみ/rhythmのみ/両方/無し選択可）。
  欠落小節を埋める形式なので「既存メロの変奏」は mask-and-regenerate で実現。
- 統合アイデア: V2の【骨格】(2拍構造線)を **pitch-contour 条件**、【表面】リズムを **rhythm 条件**
  として渡し、SketchInpainterに表面音を埋めさせる＝V2の表面生成の対抗/候補生成器。層対応が綺麗。
- 著作権: Irishフォーク(概ね伝統/PD)+CC0コード＝本群で**最も低リスク**。(データのPD明記はREADMEに無し=軽微gap)

### 2. Composer's Assistant 2 (CA / CA2) — REAPER + T5 infilling
- リンク: https://github.com/m-malandro/composers-assistant-REAPER ／ paper https://arxiv.org/html/2407.14700v1
- 何ができる: マルチトラック曲の **小節×トラック単位 infilling**。一部 track-measure の音符を消し、
  残り(他トラック・他小節)を固定したまま埋める。
- 入手・ライセンス: **MIT（商用可）**。**学習済み重みはGitHub Releasesで配布**(v2.1.0)。
- 可動性: T5型 encoder-decoder。大モデル=512-dim/16+16層(≈CAの3.5倍param)。
  REAPER横で**ローカルNNサーバ**として動作。**CPU動作可**、CUDA推奨。外部送信なし。
- 制御性: ★高(infill系の本命)。コード/伴奏トラック＋他トラックを固定→**メロ track-measure だけ補完**。
  CA2の細粒度制御: 横(リズム)密度6段、縦密度5段+1音あたりpitch-class、跳躍/順次傾向7段、
  音域strict/loose、オクターブ複製抑止トークン、1D/2Dリズム条件。
  ※条件は「他トラックの**実音符**」であって抽象的なコード記号ではない。
- 統合アイデア: gen_melody の「コード進行を別トラックで固定→メロを補完/差し替え候補」を実装。
  既存メロの一部小節をmaskして変奏候補を出す用途にも。symbolic I/O前提に合致。
- 著作権: **本群で最もクリーン**。READMEが「**PDと許諾ライセンスのMIDIのみ**で学習」と明記。

### 3. Anticipatory Music Transformer (AMT) — Stanford CRFM / Thickstun
- リンク: https://github.com/jthickstun/anticipation ／ paper https://arxiv.org/abs/2306.08620 ／
  blog https://crfm.stanford.edu/2023/06/16/anticipatory-music-transformer.html
- HFチェックポイント(全て `license: apache-2.0`):
  small=128M https://huggingface.co/stanford-crfm/music-small-800k ／
  medium=360M https://huggingface.co/stanford-crfm/music-medium-800k ／
  large=780M https://huggingface.co/stanford-crfm/music-large-800k
- 何ができる: 「anticipatory」＝**与えた未来イベントに非同期で条件づけ**て自己回帰生成。
  旋律をcontrolとして渡し**伴奏生成**、開始/終了を与え**区間 infill**(2-5秒ずつ)、楽器単位の人/AI分担。
  blog例「コードとドラムを与えてメロ＋ベース生成」。
- 入手・ライセンス: コード Apache-2.0、HF重みも apache-2.0。商用は法的に可だが**著者は商用に注意喚起**。
- 可動性: HF `AutoModelForCausalLM` で標準ロード。PyTorch+transformers。READMEはGPU前提(`.cuda()`)。
  GPT-2級(128-780M)なのでCPU推論は技術的には可だが遅い。VRAM明示なし。
- 制御性: ★中〜高だが注意。条件は**ノートトークン(イベント)**であり、コード/旋律をMIDI制御イベントに
  レンダリングして渡す方式。**調/テンポを"ラベル"で渡すネイティブUIは無い**。infill/伴奏条件は強力。
- 統合アイデア: V2が出した骨格/コードをMIDIイベント化→AMTに区間infillや伴奏anticipationさせ、
  メロの装飾候補や対旋律候補を得る。ただし下記リスクで「直接生成の主役」には不可。
- 著作権: ⚠️ **著者自身がメモリ化/丸暗記を明言**「再現を防ぐ技術的保証なし」「人作曲とほぼ同一な出力を観測」。
  Lakh MIDIは名目CC-BY 4.0だが実態は著作物の派生transcription多数。**当プロジェクトの"統計のみ"方針と相性が悪い直接生成**。

### 4. MelodyT5 — unified score-to-score (ABC) — ISMIR 2024
- リンク: https://github.com/sanderwood/melodyt5 ／ HF https://huggingface.co/sander-wood/melodyt5 ／
  paper https://arxiv.org/abs/2407.02277
- 何ができる: 単一モデルで **7タスク**(cataloging/generation/**harmonization**/**melodization**/
  segmentation/transcription/**variation**)。入出力はABC。
- 入手・ライセンス: **MIT（商用可・要帰属）**。HFに `weights.pth`。
- 可動性: Python3.7.9/PyTorch1.13.1+CUDA11.6、`inference.py`。CPU推論は未確認。param数未公表(不明)。
- 制御性: ★中〜高。ABCの `K:` で**調**、harmonizationで**コード**生成、melodization=コード→メロ、
  variation=既存メロの変奏、`%%input`/`%%output`で infill/continuation。
- 統合アイデア: ABCブリッジを噛ませれば、V2メロの**変奏(variation)**・**harmonization**・
  **melodization(コード→メロ候補)** を1モデルで取れる。ABC I/O整備が前提コスト。
- 著作権: MelodyHub(261,900 ABC, 公開楽譜由来 https://huggingface.co/datasets/sander-wood/melodyhub )。
  メモリ化は明示議論なし。

---

## 次点・用途別メモ

- **ImprovRNN (Magenta)** … 唯一**コード文字列を明示入力**(`--backing_chords="C G Am F"`)してメロ生成。
  Apache-2.0コード、`.mag`チェックポイント~5.6MB、**CPU可**。だが **magenta/magenta は2026-01-06 ARCHIVED(read-only)・TF1世代**。
  品質も控えめ。すぐ試せる「コード→メロ」のベースラインとしては有用。
  https://github.com/magenta/magenta/blob/main/magenta/models/improv_rnn/README.md
  （注: チェックポイント自体のライセンスはmagenta-jsに明記なし＝コードApache-2.0のみ確認。要確認）
- **GETMusic (Microsoft muzic)** … MIT。GETScoreで**"chords"トラック→lead生成**等 any-to-any。
  ただし**公式チェックポイントDLリンクが切れている(issue #203, 未修正)**＋学習コーパス非公開(リスク高)。
  https://github.com/microsoft/muzic/tree/main/getmusic
- **FIGARO** … MIT・重み配布(2.3GB)。"expert description"に**コード/楽器/styleを明示**して条件生成。
  ただし infill ではなく大域条件生成。Lakh学習。 https://github.com/dvruette/figaro
- **Polyffusion** … MIT・重み配布。piano-rollの潜在拡散で**コード/textureをcross-attn条件**、
  8小節単位、inpaintingでメロ補完可。POP909学習(実曲=統計のみ抽出)。 https://github.com/aik2mlj/polyffusion
- **MuseCoco (Microsoft)** … MIT。属性条件が最も豊富(**Key/Bar数/TimeSig/Tempo/Genre/Emotion/PitchRange等**)。
  ただし大モデル1.2B(実質GPU必須)、infillでなく属性/テキスト条件生成。
  https://github.com/microsoft/muzic/tree/main/musecoco
- **MIDI-GPT (MMMの後継, Metacreation)** … MIT・一部重み配布・**CPU可**・小節×トラックinfill。
  ただし条件は密度/ポリフォニー等の**属性**で、コード記号条件モードは無し。学習コーパス非公開。
  https://github.com/Metacreation-Lab/MIDI-GPT
- **WuYun** … **骨格誘導メロ生成**(骨格抽出→inpaintで装飾infill)。`inference_real.py`が
  **人間メロの実骨格を受けて装飾**＝V2と思想一致。だが**チェックポイント非配布(自前学習)・GPU必須・LICENSE未記載**。
  https://github.com/nextlab-zju/wuyun ／ https://arxiv.org/abs/2301.04488
- **MusicFrameworks** … 構造/コード/contour/rhythm 階層条件でフル尺メロ。POP909。
  公式でなく再実装repo https://github.com/XaryLee/Controllable-Melody-Generation (ライセンス未確認)。
- **melody-reduction-algo (ISMIR 2025)** … **決定的(最短経路)な骨格抽出** + reductionを条件にした
  **構造保存変奏**生成。決定的部分はCPU・著作権クリーン＝V2の骨格抽出器として相性良。
  https://github.com/ZZWaang/melody-reduction-algo ／ https://arxiv.org/abs/2508.01571
- **CMT (Chord-Conditioned Melody Transformer)** … 設計上コード条件で rhythm→pitch を分離生成。
  だが**重み非配布・LICENSE無し**(全権利保留)＝法・工数コスト大。https://github.com/ckycky3/CMT-pytorch
- **Theme Transformer** … MIT・重み配布だが**theme/motif条件であってコード条件ではない**。POP909。
  https://github.com/atosystem/ThemeTransformer
- **MidiTok** … MIT・トークナイザのみ(REMI/REMI+/MMM等)。自前LMを組む時の土台。
  https://github.com/Natooz/MidiTok

---

## 著作権・リテラル複製の注意（プロジェクト方針＝統計のみ）

- **AccoMontage系** … コア＝**実フレーズのDB検索＋DP再結合**(phrase montage)＝**リテラル断片再利用**。
  本群で最も著作権リスク高。メロ用途でないが注意対象として記録。https://arxiv.org/abs/2108.11213
- **AMT** … 著者がメモリ化/丸暗記を明言。直接生成での流用は当方針(統計のみ)と衝突。
- **POP909学習(MelodyT5の一部由来・Polyffusion・MusicFrameworks・Theme Transformer)** … 実商用曲。
  統計のみ抽出・コーパスやリテラル旋律は再配布しない。
- **クリーン側** … Music SketchNet(CC0+Irishフォーク)、CA2(PD+許諾MIDIのみ)、music21(コーパス無し)、
  IrishMAN/TunesFormer(thesession等のPD)。これらが当方針に最も適合。

## 決定的エンジン側の素材（V2を太らせる用）
- **music21**(BSD): `Trill/Turn/Mordent/Appoggiatura/Tremolo` に `realize()` で装飾を実音符展開。
  ただし「どこに経過/刺繍音を入れるか」は自前実装(該当APIは無し)。コーパス無し＝著作権ゼロ。
  https://music21.org/music21docs/moduleReference/moduleExpressions.html
- **melody-reduction-algo**: 骨格抽出を決定的に。V2の learnSkeleton/骨格抽出の対照・補強に。

---

## 統合の現実解（提案）
1. **すぐ**: ImprovRNN(コード→メロ baseline, CPU/Apache) を比較用に走らせ V2 候補出しの当て馬に。
2. **本命の補助**: Music SketchNet を**V2の骨格(contour)＋表面(rhythm)を渡す表面生成器**として PoC。
   ABCでなくMIDI/潜在で扱え、CC0で安全。V2の層分けと一致するのが決め手。
3. **汎用候補出し/補完**: CA2 を「コード/他トラック固定→メロ小節 infill」サーバとして。MIT＋PDで法的に最安全。
4. **変奏/harmonization のワンストップ**: MelodyT5(ABCブリッジ前提)を variation/melodization 補助に。
5. 大型LM(AMT/MuseCoco/GETMusic)は制御がイベント/属性止まり＋丸暗記/コーパスリスクで**主役にしない**。
