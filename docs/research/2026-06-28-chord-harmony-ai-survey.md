# コード/和声ライン拡張のための「使えるAI」調査

調査日: 2026-06-28 / 対象: gen_chords・harmonize（メロ→和声）・リハーモナイズの拡張候補。
評価軸: ①公開/入手性・ライセンス ②可動性(CPU/サイズ/依存) ③★制御性(調/メロ/style/構造で条件づけ) ④統合容易性。

核となる価値は「制御性」。決定的TSエンジン(機能和声)は既にあるので、AIは
「メロ確定 → 和声付け(harmonization)」「再和声で候補出し」を担うのが筋。

---

## 上位候補

### 1. AutoHarmonizer (sander-wood) ★本命: メロ→コード進行
- リンク: https://github.com/sander-wood/autoharmonizer
  論文: "Generating Chord Progression from Melody with Flexible Harmonic Rhythm and Controllable Harmonic Density" (EURASIP JASMP 2023, arXiv:2112.11122)
- 何ができる: **メロディ → コード進行（リードシート）**を生成。出力は music21 でパース可能なスコア（コード記号付き）。
- 学習データ: **Wikifonia リードシート（ポップ/ジャズ寄り）** ＝我々のポップ用途に直結。
- 入手・ライセンス: **MIT**。事前学習済み重み同梱（weights.zip / weights.z01）。データ・コード・サンプル公開。
- 可動性: Keras/TensorFlow(2.2系, tensorflow-gpu指定)。Python。**CPU可（要 requirements 調整、TF依存が重い）**。モデルは小〜中規模(BLSTM/seq系)。
- ★制御性: **harmonic density(`RHYTHM_DENSITY` 0-1=コード密度=1音あたり何コード)・flexible harmonic rhythm** を制御可。調の明示条件づけは「無い」（メロから推定。我々の detect_key で前処理→移調して与える運用で吸収可能）。
- 統合アイデア: `harmonize` / `fit_to_chords` の対抗実装。入力メロ MIDI→musicXML、推定/指定キーへ移調して投入、density を style パラメタに対応づけ。ルール出力との **候補2本立て**（決定的=安定線、AI=意外性）。著作権: 重み/出力に Wikifonia 由来の literal メロは載らない（コードのみ生成）ので統計利用に近く安全側。

### 2. AccoMontage2 (billyblu2000) ★制御性が一番濃い: メロ→コード＋伴奏
- リンク: https://github.com/billyblu2000/AccoMontage2
  論文: "AccoMontage2: A Complete Harmonization and Accompaniment Arrangement System" (arXiv:2209.00353)
  （原系列: zhaojw1998/AccoMontage, ISMIR2021＝リードシート→ピアノ伴奏。phrase選択+style transfer+DP）
- 何ができる: **リードメロ → コード進行（harmonizationモジュール）→ テクスチャ伴奏**。コードだけ出力可（`chord_gen.mid`）/ 伴奏込み(`textured_chord_gen.mid`)。
- 入手・ライセンス: **MIT**。バイナリデータ/チェックポイントは Google Drive 別DL。5k+ コード進行データセット付属。
- 可動性: **pure python、CPU可**。依存は requirements.txt（FluidSynth は wav 化のみ＝任意）。
- ★制御性（最強）:
  - **chord style 4種**: `pop_standard` / `pop_complex` / `r&b` / `dark` ＝我々の style 軸に直マップ
  - **調**: tonic(C/G/A…)+mode(major/minor) を指定
  - **構造**: フレーズ列を `'A8B8A8B8'`（4/8小節）で指定 ＝ gen_chords の小節/構造条件と一致
  - **テクスチャ**: 横(リズム密度)・縦(声部数 0-4)
- 統合アイデア: 「メロ確定 → 和声付け」の本命UX。style/key/構造/小節を**そのまま条件づけ**できるのが大きい。コードだけ取り出して gen_chords の候補に、伴奏まで使えば gen_bass/gen_drums 前段の叩き台にも。DP+検索ベースなので**準決定的**（同条件で再現性が高い＝制御性思想と相性良い）。

### 3. ChatMusician (m-a-p) — 汎用LLM、テキスト条件づけが柔軟
- リンク: https://huggingface.co/m-a-p/ChatMusician （Base: m-a-p/ChatMusician-Base）
  論文: arXiv:2402.16153
- 何ができる: **ABC記譜**を「第二言語」として扱う LLaMA2-7B 継続事前学習モデル。**chords / melodies / motifs / musical forms** をテキスト条件にして作曲。melody harmonization・chord-conditioned generation を明示サポート（プロンプト例あり）。
- 入手・ライセンス: **MIT**（7B, LLaMA2ベース。LLaMA2の利用規約も一応留意）。
- 可動性: **実質GPU必須**(fp16/CUDA, vLLM/SGLang)。CPUは量子化(llama.cpp/Ollama)で理論上可だが遅い。常時起動機のリソース次第。
- ★制御性: 自然言語＋ABCで自由度は高いが **prompt任せ＝非決定的**。我々の「決定的に従う」思想とは逆向き。キー/コードをABCで固定注入すれば従わせられるが、検証コストが高い。
- 統合アイデア: 即採用より「reharmonize候補のブレスト役」。既に Claude をクライアント脳に据える設計（MCP）なので、**わざわざ別7B LLMを抱える価値は薄い**（Claude自身にABC harmonization をさせる方が運用が軽い）。優先度低。

### 4. DeepChoir (sander-wood) — メロ+コード → 多声ボイシング(合唱)
- リンク: https://github.com/sander-wood/deepchoir （ICASSP 2023, "Chord-Conditioned Melody Harmonization with Controllable Harmonicity"）
- 何ができる: **メロ＋コード記号を入力 → 3声部ハーモニー**を生成（JSBコラール学習）。
- 入手・ライセンス: **MIT**、重み同梱。Keras/TF。CPU可（要調整）。
- ★制御性: **harmonicity 0-1**（メロとの協和度）。**コードは入力側**＝「コード進行を作る」のではなく「決まったコードを声部に開く=ボイシング/編曲」用途。
- 統合アイデア: gen_chords ではなく **ボイシング/コーラス展開**の部品。学習元がコラール（クラシック合唱）なのでポップには寄せが要る。harmonize の声部展開オプションとして将来検討。

---

## 参考: 非ML / データソース系（制御性の素材）

- **Hooktheory Trends API** — https://www.hooktheory.com/api/trends/docs
  ポップ5000曲の transcription 由来「次コード確率」「特定進行を含む曲」を返すオンラインAPI。OAuth2/APIキー、10req/10s 制限。**決定的な次コード提案(Markov的)に直結**＝制御性思想と非常に相性良い。ただし(a)オンライン依存・常時起動機の外部API、(b)TheoryTab本体データのAPIは未提供(将来予定)、(c)**データ規約上、確率統計の利用に留め literal 進行/曲を保存しない**こと。`next_chord`/`find_progressions` の裏付けデータとして有用。
- 他に見たが優先度低: CMT (ckycky3, コード→メロ＝逆方向)・MelodyDiffusion・GridMLMelHarm(NeuraLLMuse, 離散拡散harmonization・新しめ)・MusicBERT/M2BERT(理解タスク用エンコーダ＝分類/解析向き、生成ではない)・Chordinator(seq2seqメロ→コード, 重み公開状況не明)。

## 著作権メモ
- AutoHarmonizer / AccoMontage / DeepChoir はいずれも **MIT＋コードのみ生成**（literal メロを吐かない）ため、CLAUDE.md の「他者コーパスからは統計のみ」方針に整合。AccoMontage の phrase選択は「伴奏テクスチャ」を検索合成するので、伴奏MIDIを製品出力に混ぜる場合は出典データの扱いを再確認（コード列だけ使うなら安全）。
- Hooktheory はAPI規約に従い**統計のみ**利用、進行/曲の保存はしない。

## 結論（我々に一番使えるのはどれか）
- **第一候補 = AccoMontage2**: 調・style(4種)・小節/構造・密度を**そのまま条件づけ**でき、コードだけ取り出せて、pure-python/CPU/MIT、準決定的。「制御性」要件への適合度が最も高い。
- **併用 = AutoHarmonizer**: ポップ・リードシート学習でメロ→コードが軽量・MIT・重み同梱。`harmonize` の素直な実装に最適。AccoMontageが重ければこちらを先に。
- ChatMusician/DeepChoir は補助（前者=ブレスト、後者=ボイシング展開）で優先度低。Hooktheory は `next_chord` の確率裏付けデータとして検討。

## 残タスク（Task化候補）
1. AccoMontage2 を CPU で実起動 → コード列のみ抽出する最小ラッパーの PoC（key+style+構造を渡す）。
2. AutoHarmonizer を CPU で起動し、detect_key→移調→harmonize→逆移調の前後処理を検証。
3. 出力コード記号 → 我々の機能和声/度数表現への変換マッピング（gen_chords スキーマ整合）。
4. 「ルール出力 vs AI出力」を analyze_progression/E-rule で評価し候補ランキングする橋渡し。
