# 曲全体のエネルギー設計（多次元アーク）の仕様 — 任務X1

作成: 2026-07-14 / 分類: research（編曲・プロダクション）
前提: セクション役割つきの生成プリセット思想を「曲全体のアーク」へ拡張する。
既知（再調査不要）: サビ=高音域・高密度・狭ダイナミックレンジ（van Balen 2013 / Billboard 649曲回帰）、pre-chorus=srdc departureの拡張（Summach）。

---

## 0. 結論サマリ（設計含意ファースト）

- **エネルギーは単一スカラーではなく多次元ベクトル**。ポップスでは「生ラウドネス（dB）」の
  セクション差はごく小さく（数dB程度）、知覚上のエネルギー差は主に**密度・レイヤ数・音域・
  リズム細分化**という編曲次元が担う（[Sound on Sound](https://www.soundonsound.com/sound-advice/dynamic-range-loudness), [van Balen 2013](https://archives.ismir.net/ismir2013/paper/000180.pdf)）。
  → **生成プリセットは「音量を上げる」ではなく「レイヤ/密度/音域で上げる」を第一手段にせよ。**
- **知覚エネルギーは絶対値でなく前セクションとの差分**で決まる（[EDMProd](https://www.edmprod.com/tension/), [Mastering The Mix](https://www.masteringthemix.com/blogs/learn/how-to-give-your-chorus-a-bigger-impact)）。
  → **エネルギープランは絶対目標値でなく「前セクション比（Δ）」で持つ。**
- **アークは段階的右肩上がり＋最終サビピーク＋落ちサビの直前dip**が王道
  （[Soundfly Flypaper](https://flypaper.soundfly.com/write/scaffolding-song-structure/), [J-pop 落ちサビ慣習](https://posts.yakuaru.com/Common%20Japanese%20Song%20Composition%20Terminologies%20%E3%82%B5%E3%83%93%20%E8%90%BD%E3%81%A1%E3%82%B5%E3%83%93%20A%E3%83%A1%E3%83%AD%201%E7%95%AA%20%E3%83%95%E3%83%AC%E3%83%BC%E3%82%BA%20and%20others)）。
- **思想的注意**: 自動アークは「機械は候補まで・仕上げは人間」に抵触しうる。→ **プランは提案（見せて人が崩す）として出す**（§6）。

---

## 1. エネルギーの構成次元（実測研究つき）

エネルギー/覚醒（arousal）は複数の音響次元の合成である。MIR研究では valence/arousal が
**ラウドネス・音色（timbre）・リズム・ピッチ関連特徴の組合せ**と結びつくとされ、特に
**リズムの分節（rhythmic articulation）とピッチレンジ（音域）が arousal 次元に高度に有意な効果**を持つ
（[PLOS One / 音響特徴と感情](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0251692)、MIR arousal特徴の総括: [ISMIR系サーベイ](https://www.researchgate.net/publication/360960408_To_catch_a_chorus_verse_intro_or_anything_else_Analyzing_a_song_with_structural_functions)）。

本ツールで扱う 5 次元と、その実測的裏付け:

| # | 次元 | 定義（本ツールでの操作対象） | 実測的裏付け |
|---|------|------------------------------|--------------|
| D1 | **音数密度** | 単位小節あたりの発音数（メロ＋伴奏の onset 密度） | サビは他区間より onset/密度が高い傾向。R&B/rapでは「verse=最小限、chorus=密なボーカルハモ＋鍵盤で RMS が上がる」という編曲実務（[Sound on Sound](https://www.soundonsound.com/sound-advice/dynamic-range-loudness)） |
| D2 | **音域（レジスタ）** | メロ／伴奏それぞれの音高中心・上限 | サビ=高音域は既知（van Balen 2013 / Billboard 649）。ピッチレンジは arousal に高度有意（[PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0251692)） |
| D3 | **レイヤ数（声部・楽器の抜き差し）** | 同時に鳴る楽器トラック数 | 「イントロは少数、時間とともにボーカル/ドラム/ベースが加わりエネルギーが上がる」「全楽器同時鳴りの super loop が最高エネルギー＝多くは最終サビ」（[Deviant Noise](https://deviantnoise.net/education/music-production/arrangement/), [Hyperbits](https://hyperbits.com/blog/song-arrangement/)） |
| D4 | **ラウドネス/ダイナミクス** | セクション平均ラウドネス（LU）と局所ダイナミックレンジ | **ポップの section 間差は数dBと小さい**（クラシックは20dB）。トップ40は最ラウドなサビで K≈-8dB、全体 K≈-11dB（[Sound on Sound](https://www.soundonsound.com/sound-advice/dynamic-range-loudness)）。サビは**狭ダイナミックレンジ**（既知 van Balen） |
| D5 | **リズム細分化** | ハイハット/刻みの分解能（8分→16分）、フィルの密度 | サビ手前で hi-hat を細かく、シンコペで前進感、フィルで予告（[Ace Studio](https://acestudio.ai/blog/music-arrangement/), [J-pop編曲](https://blog.flat.io/jpop-anime-chord-progressions/)）。timbre variety が chorusness と強相関（[van Balen 2013](https://archives.ismir.net/ismir2013/paper/000180.pdf)） |

**van Balen 2013 の含意（既知の補強）**: Billboard データセットの構造注釈区間を対象に、
「chorusness」を頑健・解釈可能な特徴で回帰。**音色（timbre）と音色の多様性（timbre variety）が
harmony や絶対ピッチ高より chorusness と強く相関**し、コーラス/山場は**同一曲内の他区間より
ラウド**（[van Balen 2013 PDF](https://archives.ismir.net/ismir2013/paper/000180.pdf)）。
→ サビ設計では「音域を上げる」だけでなく**音色を明るく・多様に**（ダブリング/ハモ/ギター追加）
することがエネルギーの本体。

---

## 2. 典型アーク形（実曲統計・教則の裏付け）

### 2.1 標準形: 段階的右肩上がり＋最終サビピーク
曲は時間とともに上下しつつ**終盤（多くは最終サビ）で最高エネルギー**に達し、
その後 outro で減衰する（[Deviant Noise](https://deviantnoise.net/education/music-production/arrangement/)）。
全楽器が同時に鳴る「super loop」が最高点で、これが最終サビになりやすい（[Hyperbits](https://hyperbits.com/blog/song-arrangement/)）。
Soundfly は曲構造を「エネルギーフローの地図（scaffolding）」として設計せよと説く
（[Flypaper](https://flypaper.soundfly.com/write/scaffolding-song-structure/)）。

- 1番より2番の各セクションを**わずかに厚く**（要素追加でスパイス）するのが定石（[Gearspace](https://gearspace.com/board/audio-student-engineering-production-question-zone/1025600-how-make-second-verse-chorus-different-than-first.html)）。
- 最終サビは「全部入れる・バッキングボーカルをダブル・リードギター追加」で押し切る（[Deviant Noise](https://deviantnoise.net/education/music-production/arrangement/)）。

### 2.2 落ちサビ（final chorus 前の dip）
J-pop の王道: **最終サビ（ラスサビ）の直前に伴奏を抜いた「落ちサビ」を置く**。
ボーカルを親密に聴かせ、直後のラスサビとの**対比（contrast）**で山を最大化する
（[落ちサビ解説](https://posts.yakuaru.com/Common%20Japanese%20Song%20Composition%20Terminologies%20%E3%82%B5%E3%83%93%20%E8%90%BD%E3%81%A1%E3%82%B5%E3%83%93%20A%E3%83%A1%E3%83%AD%201%E7%95%AA%20%E3%83%95%E3%83%AC%E3%83%BC%E3%82%BA%20and%20others), [和英比較](https://www.tetsu7017.com/blog/comparison-of-japanese-and-english-names-of-music-composition-terms/)）。
しばしば Cメロ（bridge）→落ちサビ→ラスサビの順で、リズム/音色/転調で変化をつける
（[ONLIVE Studio](https://blog.onlive.studio/song-structure-150)）。
EDM の「chorus/drop 直前を相対的に小さくする」原理と同型（[EDMProd build-up](https://www.edmprod.com/ultimate-guide-build-ups/)）。

### 2.3 イントロ/アウトロの位置づけ
- **イントロ**: 最小レイヤ。フックの提示と「空きスペース」の確保（後で埋める余地）（[Deviant Noise](https://deviantnoise.net/education/music-production/arrangement/)）。
- **アウトロ**: 最終サビのピーク後に**減衰（wind down）**。super loop から要素を引く逆再生的処理（[Hyperbits](https://hyperbits.com/blog/song-arrangement/)）。

### 2.4 局所トランジション技法
サビ直前で**ドラムを1〜2拍抜く**と、復帰時の打点でサビの体感インパクトが増す（[Deviant Noise](https://deviantnoise.net/education/music-production/arrangement/)）。
riser / フィル / crash でpre-chorus を持ち上げる（[Ace Studio](https://acestudio.ai/blog/music-arrangement/)）。

---

## 3. 楽器の抜き差しの定石（レイヤリング）

**Subtractive arrangement（引き算編曲）**: まずフル編成を作り、各セクションで要素を「引いて」
足場（scaffolding）を作る。ビルドの前提は「引いてあること」（[Flypaper](https://flypaper.soundfly.com/write/scaffolding-song-structure/)）。

J-pop/ボカロの慣習（[ONLIVE](https://blog.onlive.studio/song-structure-150), [Flat J-pop](https://blog.flat.io/jpop-anime-chord-progressions/), [Ace Studio](https://acestudio.ai/blog/music-arrangement/), [Gearspace](https://gearspace.com/board/audio-student-engineering-production-question-zone/1025600-how-make-second-verse-chorus-different-than-first.html)）:

| 遷移 | 足す（＋） | 引く（−） | 主眼の次元 |
|------|-----------|-----------|-----------|
| intro→Aメロ | ボーカル、控えめドラム | パッド/リフを間引く | D3 レイヤ最小維持 |
| Aメロ→Bメロ | ハイハット細分化、カウンターメロ、riser | — | D5 リズム、D1 密度 |
| Bメロ→サビ | フル刻み、ダブリング/ハモ、ギター追加、crash | （直前1〜2拍ドラム抜き） | D3・D2・D1 一斉up |
| 1番サビ→2番Aメロ | — | 1番より1枚だけ薄く（対比の余白を作る） | D3 |
| 2番各所 | 1番＋α（オブリ、副旋律、フィル）で「厚く」 | — | D1・D5 |
| Cメロ/bridge | 転調・新音色・リズム変化 | 定常パターンを崩す | 対比（新規性） |
| bridge→落ちサビ | — | 伴奏を大幅に抜く（ボーカル＋最小伴奏） | D3・D4 dip |
| 落ちサビ→ラスサビ | 全部入り＋バックVoダブル＋リード | — | 全次元 max |
| ラスサビ→outro | — | 段階的に要素を引く | D3 減衰 |

**2番の扱いに定石の分岐がある点に注意**: 「1番より厚く（要素追加でスパイス）」（[Gearspace](https://gearspace.com/board/audio-student-engineering-production-question-zone/1025600-how-make-second-verse-chorus-different-than-first.html)）が主流だが、
「2番Aメロは対比の余白づくりに一旦薄く」も併用される。→ **プリセットは両プロファイルを持ち、
ユーザーに選ばせる**（§6 の提案止まり思想と整合）。

---

## 4. 対比の原理（差分がエネルギーを作る）

**知覚エネルギーは絶対値でなく隣接セクションの差分で決まる**、という編曲・ミックスの共通見解:

- 「drop は、直前が静かで低エネルギーでないとインパクトが出ない。逆に静かな区間も、
  直前が高エネルギーでないと安らぎに感じない」（[EDMProd](https://www.edmprod.com/tension/)）。
- 「サビを巨大に鳴らすには、pre-chorus/build を**比較して小さく**しなければならない。
  verse がサビと同じ大きさなら、ラウドなサビは無意味」（[Mastering The Mix](https://www.masteringthemix.com/blogs/learn/how-to-give-your-chorus-a-bigger-impact)）。
- 「song energy は relative な量。よく書けた曲では微細なエネルギー変動も知覚できる」（[Secrets of Songwriting](https://www.secretsofsongwriting.com/2021/03/08/controlling-the-energy-level-of-a-song/)）。

**設計含意（最重要）**:
1. エネルギープランは**Δ（前セクション比）で保持**する。絶対目標値は補助。
2. **各次元で十分な差をつける**（音量だけでなく音域・レイヤ・密度・帯域で）。
3. ピークを効かせるには**直前を意図的に落とす**（落ちサビ／pre-chorus dip／ドラム抜き）。
   → アークは単調増加ではなく「谷を掘ってから山」。

---

## 5. 仕様化 — エネルギープラン・テンプレ

### 5.1 データモデル
各セクションに**エネルギーベクトル**を持たせ、値は**前セクション比 Δ**（−2…+2 の相対段階、0=前と同等）で表現。
併せて絶対レンジ目安（low/mid/high/peak）を補助的に持つ。

```
EnergyVector = {
  density:   Δ,   // D1 音数密度
  register:  Δ,   // D2 音域（メロ中心/上限）
  layers:    Δ,   // D3 同時楽器数
  loudness:  Δ,   // D4 ラウドネス/ダイナミクス（幅の狭さも）
  subdiv:    Δ,   // D5 リズム細分化
}
SectionPlan = { role, absLevel: low|mid|high|peak, delta: EnergyVector, layerAdd:[], layerDrop:[] }
```

### 5.2 テンプレA: スタンダード J-pop（Aメロ/Bメロ/サビ＋落ちサビ）
絶対レベルは low=1 … peak=5 の目安。Δは前セクション比。

| セクション | absLevel | density | register | layers | loudness | subdiv | layerAdd / layerDrop |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Intro | 2 | – | – | – | – | – | 最小編成 |
| A(1) | 2 | 0 | 0 | +1 | 0 | 0 | +Vo, +軽ドラム |
| B(1) | 3 | +1 | +1 | +1 | +1 | +1 | +hat細分, +riser |
| Chorus(1) | 4 | +1 | +1 | +1 | +1 | +1 | +ダブリング/ハモ, +Gt, (直前1拍ドラム抜き) |
| A(2) | 2 | −1 | 0 | −1 | −1 | −1 | −1枚薄く（対比の余白）※or「+α厚く」を選択 |
| B(2) | 3 | +1 | +1 | +1 | +1 | +1 | +オブリ, +フィル |
| Chorus(2) | 4 | +1 | +1 | 0 | 0 | 0 | 1番サビ＋α |
| Cメロ/bridge | 3 | 0 | ±1 | 0 | 0 | ±1 | 転調/新音色/リズム変化 |
| **落ちサビ** | **2** | **−2** | **0** | **−2** | **−2** | **−2** | **伴奏大幅DROP（Vo＋最小）** |
| **ラスサビ** | **5(peak)** | **+2** | **+1** | **+2** | **+1** | **+2** | **全部入り＋バックVoダブル＋リード** |
| Outro | 2 | −2 | 0 | −2 | −1 | −1 | 段階的に引く |

要点: 谷（落ちサビ）→山（ラスサビ）で**Δが最大化**。ピークの正体は音量でなく layers/density/subdiv。

### 5.3 テンプレB: バラード
- 全体にダイナミックレンジ広め（ポップ平均より section 間差を大きく取ってよい）。
- レイヤ増加は**ゆっくり**（ピアノ弾き語り→ストリングス→リズム隊）。density より **register と layers** で山を作る。
- 落ちサビ相当は「一旦アカペラ/ピアノのみ」まで落とすと対比が最大。

| セクション | absLevel | density | register | layers | loudness | subdiv |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| Intro(Pf) | 1 | – | – | – | – | – |
| A(1) | 1 | 0 | 0 | 0 | 0 | 0 |
| B(1) | 2 | 0 | +1 | +1 | +1 | 0 |
| Chorus(1) | 3 | +1 | +1 | +2(+Str/Dr) | +1 | +1 |
| 間奏/2番 | 2〜3 | ±1 | +1 | +1 | ±1 | ±1 |
| 落ちサビ | 1 | −2 | 0 | −2(Pf/Voのみ) | −2 | −1 |
| ラスサビ | 4(peak) | +1 | +1 | +2 | +1 | +1 |
| Outro | 2 | −1 | 0 | −2 | −1 | −1 |

### 5.4 テンプレC: 4つ打ち系（EDM/ダンス・ボカロ）
- **build-up→drop** 構造が主。pre-chorus(build) を**相対的に小さく**して drop のインパクトを作る（[EDMProd build-up](https://www.edmprod.com/ultimate-guide-build-ups/)）。
- subdiv（riser/白玉スネアの加速/hatロール）と layers の一気投入がエネルギーの主役。density は drop で最大。

| セクション | absLevel | density | register | layers | loudness | subdiv | 備考 |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Intro | 2 | – | – | – | – | – | フック提示 |
| Verse | 2 | 0 | 0 | 0 | 0 | 0 | 4つ打ちkeep |
| Build(pre) | 3→↓ | +1 | +1 | −1 | −1 | +2 | **layers/loudnessを一旦絞る**, riser/snareロール加速 |
| Drop(Chorus) | 5(peak) | +2 | +1 | +2 | +2 | +1 | フルシンセ/ベース解放 |
| Breakdown | 2 | −2 | 0 | −2 | −1 | −1 | 谷を作る |
| Build2 | 3→↓ | +1 | +1 | −1 | −1 | +2 | 同上 |
| Drop2/last | 5(peak) | +2 | +1 | +2 | +2 | +1 | 最終ピーク |
| Outro | 2 | −2 | 0 | −2 | −1 | −1 | 減衰 |

### 5.5 レイヤ追加/削除の計画表（プリセット共通ルール）
生成/配置時に、Δ.layers を**具体トラック操作**へ写像する既定表:

| 目標 Δ.layers | 追加/削除する要素（優先順） |
|:---:|---|
| +2 | ダブリング/ハモ → リードGt/シンセ → パッド厚み → パーカス追加 |
| +1 | カウンターメロ/オブリ → hat/刻み追加 → ベース動き増 |
| 0 | 維持（音色替えのみ可） |
| −1 | 刻み/オブリを間引く → パッド薄く |
| −2 | ドラム/ベース抜き（Vo＋和音楽器のみ）＝落ちサビ/breakdown |

---

## 6. 警告 — 「仕上げは人間」思想との整合（提案止まりにする理由）

自動エネルギーアークは**曲の情動設計そのもの**であり、機械が「完成」させると本ツールの
中核思想「機械は候補まで・仕上げは人間」に正面衝突する。したがって:

- エネルギープランは**提案（見せて人が崩す）**として提示する。プランは「たたき台の地図」であって命令ではない。
- Δ 値・レイヤ計画は**編集可能なプランUIとして露出**し、ユーザーがセクション単位で上書き・反転できる。
  （例: 「2番Aメロを薄く」vs「厚く」の分岐は §3 の通り定石が割れる＝機械が決め切らない）
- 対比の原理（§4）は「一律右肩上がり」への安全弁: 単調増加を推すのではなく**谷→山**の選択肢も
  必ず並置し、どこを落とすかは人に委ねる。
- 実測の裏付け（§1）は**ガードレール**として使う（例: サビで音域が下がる案には注意フラグ）。
  スコアで序列化して「最良の1本」に収束させない。

---

## 出典
- van Balen, Burgoyne et al. "An Analysis of Chorus Features in Popular Song", ISMIR 2013 — https://archives.ismir.net/ismir2013/paper/000180.pdf
- 音響特徴と感情（arousal＝ピッチレンジ/リズム分節が高度有意）, PLOS One — https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0251692
- 構造機能分析サーベイ, ISMIR系 — https://www.researchgate.net/publication/360960408_To_catch_a_chorus_verse_intro_or_anything_else_Analyzing_a_song_with_structural_functions
- Dynamic Range & Loudness War（section間差は数dB、K値目安）, Sound on Sound — https://www.soundonsound.com/sound-advice/dynamic-range-loudness
- ポップ音楽ラウドネスの経年トレンド, PMC — https://pmc.ncbi.nlm.nih.gov/articles/PMC6957604/
- Tension and Energy（差分＝相対）, EDMProd — https://www.edmprod.com/tension/
- Bigger Chorus Impact（対比で山を作る）, Mastering The Mix — https://www.masteringthemix.com/blogs/learn/how-to-give-your-chorus-a-bigger-impact
- Controlling Energy Level（relativeな量）, Secrets of Songwriting — https://www.secretsofsongwriting.com/2021/03/08/controlling-the-energy-level-of-a-song/
- EDM Build-Up ガイド, EDMProd — https://www.edmprod.com/ultimate-guide-build-ups/
- Song Arrangement（super loop＝最高エネルギー）, Hyperbits — https://hyperbits.com/blog/song-arrangement/
- How to Arrange Music（レイヤ蓄積・ドラム抜き・最終サビ全部入り）, Deviant Noise — https://deviantnoise.net/education/music-production/arrangement/
- Scaffolding: Energy Flow / Subtractive arrangement, Soundfly Flypaper — https://flypaper.soundfly.com/write/scaffolding-song-structure/
- Music Arrangement Explained（J-pop: 薄verse/密pre/爆発chorus, riser/フィル）, Ace Studio — https://acestudio.ai/blog/music-arrangement/
- J-pop & anime 編曲/進行, Flat — https://blog.flat.io/jpop-anime-chord-progressions/
- 曲構成（Cメロ→落ちサビ→ラスサビ）, ONLIVE Studio — https://blog.onlive.studio/song-structure-150
- 落ちサビ用語解説, yakuaru — https://posts.yakuaru.com/Common%20Japanese%20Song%20Composition%20Terminologies%20%E3%82%B5%E3%83%93%20%E8%90%BD%E3%81%A1%E3%82%B5%E3%83%93%20A%E3%83%A1%E3%83%AD%201%E7%95%AA%20%E3%83%95%E3%83%AC%E3%83%BC%E3%82%BA%20and%20others
- 音楽用語 和英比較（落ちサビ=drop chorus）, tetsu7017 — https://www.tetsu7017.com/blog/comparison-of-japanese-and-english-names-of-music-composition-terms/
- 2番の作り分け（1番より厚く/対比）, Gearspace — https://gearspace.com/board/audio-student-engineering-production-question-zone/1025600-how-make-second-verse-chorus-different-than-first.html
