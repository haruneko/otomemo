# 歌詞(lyrics)ライン拡張のための外部AI/ツール調査 — メロ整合・日本語モーラ/アクセント

調査日: 2026-06-28 / 対象: creative_manager の `gen_lyric` 拡張（核＝制御性、日本語歌詞、`mora_count` 既存）
手法: Web 5アングル並列調査（メロ条件付き歌詞生成 / 日本語prosodyツール / 歌詞↔メロアラインメント・替え歌 / LLMのモーラ制約限界 / 日本語歌詞生成モデル・歌唱適合）。各主張に出典URL付記。

---

## 結論（最初に）

**「日本語ネイティブで、モーラ/音価整合＋ピッチアクセント整合まで効く、開放された melody→lyric モデル」は2026-06時点で存在しない。** これは確認された“空白”であり、自前で組むしかない。よって採るべきは **「汎用LLM（意味/テーマ/書き換え）＋ 日本語prosody検証ツール（OpenJTalk系でモーラ数・アクセント）＋ generate-check-repair ループ」** という構成。専用モデル（SongComposer等）は中英のみで、アーキ参照価値はあるが日本語化は自前負担。

切り分けの核心（複数出典で一致）:
- LLMが**できる**: テーマ・意味・情景・トーン・大まかな構造・**外部カウンタが現状値/目標値を教えれば**「この行を7モーラに、意味は保て」の書き換え。
- LLMが**できない（外部ツール必須）**: **正確なモーラ数**（サブワードトークン化が根本原因。英語音節で hit率 ~38–57%※低信頼）／**ピッチアクセント高低**（辞書統治、テキストから推論不可）。
  - ※日本語のモーラ計数は英語音節より**決定的**（かな≒1:1、拗音ゃゅょは前のかなに合一、撥音ん・促音っ・長音ーは各1モーラ）。**ルールベースのモーラカウンタはほぼ厳密** → だからこそ「LLMに数えさせず外部で数える」が正解。

---

## 上位候補（用途別）

### A. 日本語prosody検証ツール（★最重要・即戦力）— モーラ数とアクセントを実テキストから取る

これがこの調査の最大の収穫。`gen_lyric` の“検証/整合”層をこれで作る。

**A-1. pyopenjtalk（＋marine）** — Pythonの定番
- リンク: https://github.com/r9y9/pyopenjtalk / https://pypi.org/project/pyopenjtalk/
- 何ができる: `extract_fullcontext(text)` がHTSフルコンテキストラベルを返し、**モーラ数・アクセント型・アクセント句境界・モーラ位置**が全部取れる。`/F:` フィールド = `<モーラ数>_<アクセント型>`（例 こんにちは → `F:5_5`）、`/A:` = アクセント核までの距離。`g2p(text, kana=True)` でかな列も。`run_marine=True` でDNN（marine）による高精度アクセント推定に差し替え可（v0.3.0+）。
- 入手/ライセンス/日本語: **MIT**（同梱Open JTalkはModified BSD、marineはApache2.0）。辞書(naist-jdic)同梱で再配布可。日本語**専用**。
- 可動性: `pip install pyopenjtalk`、完全ローカル・実行時ネット不要。C/C++コア（ビルド要、prebuiltホイールあり: pyopenjtalk-prebuilt / pyopenjtalk-plus）。
- 制御性: 任意漢字テキスト→モーラ数・アクセント型を厳密に出す。弱点=OOV・複合語アクセント連濁はルール辞書ゆえ誤りうる（→marineで緩和）。
- 統合: **Python sidecar** として呼ぶのが最短。出典: README (https://github.com/r9y9/pyopenjtalk/blob/master/README.md) / HTSラベル解説 https://www.negi.moe/negitalk/openjtalk.html

**A-2. VOICEVOX ENGINE（／AivisSpeech Engine）** — ★Node/TSパイプライン向け（Python不要）
- リンク: https://voicevox.github.io/voicevox_engine/api/ / https://github.com/VOICEVOX/voicevox_engine
- 何ができる: HTTPサーバ。`/accent_phrases` にテキストPOST → `accent_phrases` JSON（各句に `moras` 配列＋整数 `accent`＝1始まりアクセント核位置）。**モーラ＋アクセントをJSONで言語非依存に取得**。
- 入手/ライセンス: エンジンはオープン（LGPL/MIX）。frontendエンドポイントのみ使うなら音声モデル不要。商用は要クレジット。
- 可動性: **Docker化したサーバ**。我々の **Node/TS API から fetch でPOST** するだけ。重めの依存だがアクセント推定はDNNで良質。
- 統合: creative_manager は TS。**A-2が一番素直**（sidecar HTTP）。AivisSpeech Engineが同API形状。

**A-3. jpreprocess（Rust）** — Python不要のインプロセス志向
- リンク: https://github.com/jpreprocess/jpreprocess
- OpenJTalkフロントエンドのRust再実装。同じJPCommonフルコンテキストラベル（モーラ＋アクセント）。**BSD-3**。Pythonバインディングあり、公式Node/WASMは無いがRustゆえWASM/native-addon化が現実的。Node常駐機でPythonを避けたいなら本命の自前ビルド先。

**A-4. 補助**: UniDic+fugashi（形態素単位の `accent_type`、BSD、~770MB重）/ jamorasep（かな→モーラ分割、MIT）/ jaconv（かな正規化、MIT）。
- 出典: https://github.com/polm/unidic-py / https://github.com/polm/fugashi / https://github.com/tachi-hi/jamorasep
- ★注意: **NHK日本語発音アクセント新辞典は商用のみ・機械可読再配布不可**（https://www.monokakido.jp/ja/dictionaries/nhkaccent2/index.html）。アクセントの開放ソースは UniDic `accent_type`(BSD) か OpenJTalk辞書に頼る。
- ★重要な但し書き: **語彙のピッチアクセント（高低）は“歌の音高”そのものではない**。歌ではメロが優先。ツールは“話し言葉の”アクセント型・モーラ構造を出すだけで、メロ制約への写像は我々の自作層。

---

### B. メロ条件付き歌詞生成モデル（melody→lyric）— アーキ参照、ただし日本語なし

**B-1. SongComposer** ⭐（開放モデルで最もI/Oが合致）
- リンク: 論文 https://arxiv.org/abs/2402.17645 (ACL 2025) / コード https://github.com/pjlab-songcomposer/songcomposer / 重み https://huggingface.co/Mar2Ding/songcomposer_sft
- 何ができる: 記号音楽LLM。**melody→lyric**, lyric→melody, 継続, text→song。音声でなく**記号タプル**で動く。語単位タプル `⟨pitch⟩,dur,rest,word|...` ＋ヘッダ `bpm... Total N lines.` で、**音高＋音価＋休符に歌詞を1ノート1語で整合**。pitch MIDI48–83。
- 入手: コードApache-2.0、重みは学術＋商用可と明記。デモ https://pjlab-songcomposer.github.io
- 可動性: ローカル。ベース=InternLM2-**7B**、HF Transformers（要CUDA、fp16で~16GB+）。
- 制御性: 強い（音価・休符・音高で条件付け、語=ノート整合、bpm/行数明示）。ただしモーラ数は**ノート枠経由で暗黙**、明示トークンは無し。
- 日本語: **無**（中英のみ。SongCompose dataset も中英）。→ **我々の「実音I/O」原則とアーキは一致するが、日本語化は自前**。

**B-2. Microsoft Muzic ファミリ**（MIT・ローカル・中英）
- リンク: https://github.com/microsoft/muzic
- **SongMASS**（AAAI2021, 双方向 lyric↔melody, DPでsyllable→note整合）/ **TeleMelody**（EMNLP2022, lyric→melodyのみ, テンプレ経由でrhythm/tonality/chord/cadenceを明示制御＝**制約に最も優しい**）/ **ReLyMe**（後述・歌唱規則層）。いずれ日本語なしだが**コードMIT**で移植素材として最良。

**B-3. その他 melody→lyric 研究**（コード有/無まちまち、いずれ英中心）
- Lyra（Amazon, 教師なし melody→lyric, 制約付きデコードでrhythm整合, コード公開 https://github.com/amazon-science/unsupervised-melody-to-lyrics-generation）
- REFFLY（NAACL2025, メロ制約の歌詞**編集/翻訳**, コード https://github.com/changhongw/mlm）
- note→syllableエンコーダ-デコーダ（EACL2024 Findings, 著者は日本拠点だが英/記号データ、コード未確認 https://arxiv.org/abs/2310.00863）
- `<SYL:s>` 明示トークンで**音節数を語/句/行/段で制御**（Interspeech2025, GPT-2ベース, 重み未確認 https://arxiv.org/abs/2411.13100）

---

### C. 日本語ネイティブの先行研究・替え歌（アルゴリズム参照）

**C-1. Watanabe et al. 2018（産総研・後藤）「A Melody-Conditioned Lyrics LM」** ★日本語 melody→lyric の本命参照
- リンク: https://aclanthology.org/N18-1015/ / コード https://github.com/KentoW/melody-conditioned-lyrics-language-model
- 入力メロに条件付けて**日本語歌詞を生成**。1000曲の**モーラ–ノート精密アラインメント**コーパスを構築し、**歌詞境界をメロ（句）境界に合わせて**各セグメントのモーラ数=ノート数で生成。**コード公開・日本語・モーラ単位**＝直接参考になる唯一級。

**C-2. Orpheus（東大→明大 嵯峨山/深山）** — 日本語prosodyの権威（向きは lyric→melody・逆）
- リンク: https://www.orpheus-music.org/ / 論文 https://link.springer.com/chapter/10.1007/978-3-642-04052-8_47
- 日本語歌詞→**ピッチアクセントを尊重して**メロ生成。「はし(橋/箸)」例。**各モーラの高低アクセントに隣接ノートの音高運動を従わせる**制約を、HMM上の**DP/Viterbi最適経路探索**の経路制約として実装。1モーラ=1ノートが基線。**アクセント↔contour衝突の正準的解法**＝我々の歌唱性ルールの設計図。

**C-3. Abe & Ito 2012「Japanese Lyrics Writing Support」** — 制約フィルタの日本語実装
- リンク: http://www.apsipa.org/proceedings_2012/papers/120.pdf
- ユーザ指定の **(a)モーラ数 (b)韻 (c)語アクセント** を満たす候補文をN-gramで生成・ランキング。**行ごとのモーラ数（=ノート数）とアクセントをハード制約**で。LyriSys(IUI2017)も同系。論文のみ。

**C-4. 替え歌の実務パイプライン**（OSS/個人）
- MusicXMLの `<lyric><text>` を**かな置換**して1モーラ1ノートで再割当→NEUTRINO/NNSVS/Sinsy/OpenUTAU/VOICEVOXで歌唱合成。新歌詞は**元のモーラ数/句構造を保つ**必要、メリスマ/字余りは自動処理しない（元XMLの割当前提）。
- 出典: https://qiita.com/shimajiroxyz/items/98d9305c0a4256f6eac5 / TalSing（同モーラ数のみ置換→NNSVS）

---

### D. 歌唱性(singability)メトリクス（純TS評価器に流用可）

我々の評価は外部モデルでなく自前重み/理論で、という方針に合致。
- **Syllable Count Distance (SCD)**: 目標/参照のモーラ数差の正規化距離（→日本語は syllable を**mora**に置換）。出典 https://arxiv.org/pdf/2308.13715
- **Joint Wording & Formatting for Singable M2L**（ACL2023）: ノート数↔音節数・行/書式整合を歌唱目的に。https://arxiv.org/pdf/2307.02146
- **ReLyMe規則**（最も実装的）: ①1ノート=1モーラ(0/1) ②キーワードは強拍/補助語は弱拍 ③休符・長音は語中でなく句境界に ④反復区は音高遷移を相似に。tone↔pitch一致を3/2/1/0で採点。→ 日本語は **stress→pitch-accent(高低)** に読み替え。https://arxiv.org/pdf/2207.05688
- REFFLY歌唱性: 各ノートに0/1音節、多音節語のノートは半音符以下、多音節語は休符を跨がない。

---

### E. 日本語の周辺（参考）

- 消費者向けで**唯一“音数”を区間別に指定→行ごと再生成**できるのは **Shikaki（シカキ）** https://shikaki.diatonic.codes/ （無料Web、API/モデル非公開）。**UX参照価値大**。
- 日本語歌詞生成の研究: Okashi(PRICAI2024, J-pop構造/意味, **コード非公開**) / Uta-AI(HF重みあり, 趣味級 https://huggingface.co/yukiarimo/Uta-AI)。
- Suno/Udio: 日本語ボーカル可だが**記号メロ→歌詞の制御APIなし**。出力レンダラとして扱う。VOCALOID/Synthesizer Vは**作詞と合成を分離**＝ノート↔モーラは構造上ハード制約だが歌詞は人/外部が書く。
- データセット: **公開の日本語 lyric-melody ペアは存在せず**（DALI/LMD/SongComposeは非日本語、FruitsMusicは生成用途不可）。自前で統計のみ抽出が必要（著作権方針通り）。

---

## 我々への統合提案（gen_lyric 拡張の設計）

**メロ確定 → 歌詞をモーラ/アクセント整合で生成、の組み方:**

1. **メロから制約抽出（既存資産で）**: 各フレーズのノート数・音価・休符位置・強拍位置・音高contourを出す。→ 各行の**目標モーラ数列**＋休符/句境界＋アクセント整合に使うcontour。
2. **LLMで草案**（意味/テーマ/トーン/韻アイデア/おおまかな行構造）。`mora_count` の目標を**プロンプトに渡すが信用しない**。
3. **日本語prosody検証層（新規・★A-2 VOICEVOX Engine sidecar 推奨／TSと相性）**: 草案を `/accent_phrases` に投げ、(i)**実モーラ数**、(ii)**アクセント核位置**を取得。
   - モーラ数 ≠ 目標 → 差分（「3行目は8で、6が目標、2多い」）を**LLMに返して書き換え（generate-check-repair）**。
   - アクセント↔メロ衝突（下降アクセントを上行で歌わせる等）→ ReLyMe/Orpheus流のスコアで**警告/減点**し、語選択を促す。
4. **歌唱性スコアラ（純TS, D節の式）**: SCD(mora版)＋強拍キーワード＋休符=句境界＋アクセント-contour一致。`analyze_fit` 系の隣に置けば既存評価基盤と整合。

**専用モデル vs 汎用LLMの線引き（実装判断）:**
- 専用モデル導入は**今は不要/過剰**（日本語版が無く、7Bローカル運用コスト大）。SongComposer/Watanabe2018/Orpheus は**アルゴリズム参照**に留める。
- 汎用LLM＋**OpenJTalk系の決定的検証＋repairループ**で、制御性（モーラ数/アクセント/韻/テーマ）の大半は取れる。**「数える/アクセント引く」だけ外部ツール**に出すのが費用対効果最良。

**最短の一手**: VOICEVOX Engine（or pyopenjtalk sidecar）を立て、`mora_count` を“LLM自己申告”から“OpenJTalk実測”に置換 → そのうえで generate-check-repair を `gen_lyric` に追加。次にアクセント整合チェック（ReLyMe式の純TSスコア）。

---

## 信頼度メモ（要検証）
- 「LLMの音節hit率 38%/57%」は arXiv 2411.13100 の検索要約由来で**未一次確認**（英語音節、日本語モーラではない）。引用前にPDF確認推奨。
- 一部 arXiv ID（2604.17105 トークン化×音韻、2601.09631 ギリシャ詩 verify-refine）は**2026年付で要一次確認**（IDの実在は未検証）。論旨（サブワード化が音節/長さ制御を阻害／verify-refineが有効）は他出典と整合。
- PitchBench (https://github.com/shewiiii/pitchbench) のモデル別スコアは画像(scores.png)中で未取得。
- 一次PDF（Orpheus DP式、Watanabe2018アラインメント前処理）はfetch非対応で、HTML要旨・二次解説から採取。式の厳密値が要るなら各PDFをローカルで開く。

主要出典は本文中に列挙。索引: https://github.com/taishi-i/awesome-japanese-nlp-resources
