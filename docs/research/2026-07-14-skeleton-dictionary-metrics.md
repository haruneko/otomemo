# 骨格メロディの「型」——実曲から何を数えれば骨格辞書になるか（計測仕様の確定）

- 日付: 2026-07-14
- 任務: M1（骨格メロディの机上理論調査）
- 種別: 理論研究・調査（`docs/research/` 格納ルール準拠）
- 位置づけ: 「機械は候補・選択肢まで、仕上げは人間」思想の下、**骨格層**（2拍単位・スケール度数インデックス・downbeat アンカー）の生成品質を、実曲コーパスから抽出する**統計的裏付け**で底上げするための計測仕様を確定する。リテラルな旋律は保存せず統計のみ抽出（著作権）。

---

## 0. 要約（設計含意の先出し）

1. 「骨格」は音楽理論では **reduction（還元）** と呼ばれる確立した概念。Schenker（背景/中景/前景の層）・GTTM の **time-span reduction（TSR）**・Narmour の closure が三大系譜。いずれも「**強拍・協和・長い音・フレーズ末=構造音、弱拍・不協和・短い音・装飾=非構造音**」という共通の直観を形式化している。本ツールの「downbeat アンカー骨格」はこの直観の妥当な実装。出典は §1。
2. だが Schenker/GTTM の完全な木構造を実装するのは重い。**ポップスの骨格辞書には「2拍グリッド上の強拍サンプリング＋和声フィルタ」で十分**——これが先行コーパス研究（Temperley RS200、POP909、Essen）の実際の運用。数えるべきは度数の分布ではなく**度数の遷移（bigram/trigram）と位相付き着地**である（§2, §5）。
3. フォーム回帰（AABA/period/sentence）は骨格レベルで「**2小節 basic idea を単位に、輪郭を保存し終止だけ差し替える**」のが古典理論の規範（Caplin）。period=前後半で「弱終止→強終止」、sentence=「2小節→2小節反復→4小節断片化＋加速」。本ツールの period リテラル複写は妥当だが、**終止だけ差し替える「変奏複写」を持つべき**（§3, §5）。
4. 表面装飾は非和声音（NCT）理論で完全に整理済み。**経過音=弱拍・順次・同方向、刺繍音=弱拍・上下往復、倚音=強拍・跳躍進入順次解決**。装飾が「骨格音のどこに付くか」は metric position で決まる（強拍倚音 vs 弱拍経過）。骨格→表面の展開規則はここから直接コード化できる（§4）。
5. §5 に「骨格辞書の計測仕様（数える項目リスト・単位・正規化・位相アンカー定義）」を確定。§6 に理論から手書きしたサンプル骨格 6 本（型名付き）。

---

## 1. 骨格 / reduction の理論系譜

### 1.1 Schenker 的還元（背景・中景・前景）

Schenkerian analysis は楽曲を再帰的に還元し、**前景 Vordergrund → 中景 Mittelgrund → 背景 Hintergrund** の層に分ける。背景に残る骨格が Urlinie（基礎線, `3-2-1` や `5-4-3-2-1` の下降）と Bassbrechung。装飾（prolongation）は上の層で剥がれていく。
- 重要な警告: **「目立つ音（prominent）」と「構造音（structural）」は同義でない**。旋律最上声の目立つ動きが深層では内声、目立たない音が構造ソプラノになることがある（MTO Heyer, ジャズへの応用）。→ 単純な「一番高い音を拾う」式の骨格抽出は誤る。
- ポップ/ロックへの応用は「Urlinie と prolongation が伝統的階層を弱める」ため **ハイブリッドモデルが要る**（PapersFlow の総説）。純 Schenker は重すぎる、という現場感が裏取れる。
- 出典:
  - Schenkerian analysis（Wikipedia, 層の定義） https://en.wikipedia.org/wiki/Schenkerian_analysis
  - Heyer, "Applying Schenkerian Theory to Mainstream Jazz"（prominent≠structural） https://mtosmt.org/issues/mto.12.18.3/mto.12.18.3.heyer.html
  - Schenkerian Analysis 研究ガイド（pop-rock 応用の課題） https://papersflow.ai/research/topics/musicology-and-musical-analysis/schenkerian-analysis

### 1.2 GTTM の time-span reduction（TSR）

Lerdahl & Jackendoff の GTTM は 4 要素（grouping / metrical / time-span reduction / prolongational reduction）で構成。**TSR は拍節構造とグルーピングから「二分木」を作り、各 time-span で最も構造的に重要な 1 音（head）を残す**。木を上へ辿ると装飾が剥がれ、本質旋律が抽出される——これはまさに本ツールの「骨格」。
- 重要点: TSR の head 選択は **metrical strength（強拍）と harmonic stability（協和・和声内音）** に強く依存する。→ 「downbeat アンカー＋和声フィルタ」で骨格を取るのは GTTM 準拠。
- 計算実装が存在: Hamanaka らの GTTM 分析器（機械学習で自動化）、および最近の「Automatic Melody Reduction via Shortest Path Finding」（arXiv 2508.01571）は、構造音 vs 装飾音を **和声文脈・メトリック位置（downbeat）・pitch salience** の複数基準を同時に重み付けし、最短経路問題として解く。POP909・GTTM DB で評価。
- 出典:
  - GTTM 概説（4 要素・TSR 二分木） https://chromatone.center/theory/composition/generative/
  - Hamanaka, Melody morphing / GTTM time-span tree（head=本質音、装飾トリム） https://gttm.jp/hamanaka/en/melody-morphing-method/
  - Automatic Melody Reduction via Shortest Path Finding（構造音基準＝harmonic/metric/salience） https://arxiv.org/pdf/2508.01571

### 1.3 Narmour の implication-realization と closure

Narmour の I-R は bottom-up の旋律期待モデル。**closure（区切り）**が構造音を生む：closure は「メトリックアクセント上の強い非和声不協和＋加算的持続」等で決まり、16 の melodic archetype（Process, Duplication, Reversal…）が連鎖する。
- 骨格抽出への含意: **closure が起きる点（フレーズ末・長い音・強拍の協和音）に構造音が置かれる**。度数遷移を数えるとき、closure 点（＝フレーズ境界の着地音）を特別扱いすべき根拠。
- 出典:
  - The Implication-Realization Model（Narmour 本人ページ） https://web.sas.upenn.edu/enarmour/the-implication-realization-model/
  - Implication-Realization（Wikipedia, archetype 一覧・A+A→A / A+B→C） https://en.wikipedia.org/wiki/Implication-Realization

### 1.4 系譜のまとめ（三者の共通項＝骨格の定義）

| 基準 | Schenker | GTTM/TSR | Narmour |
|---|---|---|---|
| 強拍・metric accent | 中景で残る | head 選択の主因 | closure 条件 |
| 和声内音（協和） | prolongation の骨 | head 安定条件 | closure 条件 |
| 長い持続 | — | time-span の親 | 加算的持続で closure |
| フレーズ末の着地 | Urlinie の終点 | grouping 末の head | 最強 closure |

→ **本ツールの「2拍 downbeat アンカー＋（後述）和声フィルタ＋フレーズ末着地の特別扱い」は三系譜すべてと整合する。** 完全な木構造は不要、強拍サンプリングで近似してよい（ポップスは 4/4・規則的拍節が >90%、POP909）。

---

## 2. 度数遷移の統計——先行コーパスが何を数えたか

### 2.1 Temperley & de Clercq RS200（ロック 200 曲）

- コーパス: Rolling Stone「500 Greatest Songs」から 200 曲の**旋律＋和声トランスクリプション**。転調曲・ラップ（旋律情報なし）は除外。
- 数えたもの:
  - **旋律スケール度数の全体分布**（key-finding の基礎）
  - 和音（root）の分布・和音の**メトリック配置**
  - 有名な知見: **「和声は長調だが旋律は短調」曲が多い**（メジャーキーでも旋律は `♭3・♭7` を多用）。→ ポップ骨格辞書は「和声のモードと旋律のモードを別々に数える」べき。
- 含意: 骨格辞書は **scale-degree の単純ヒストグラムだけでなく、和音 root に対する相対度数（chord-relative degree）も数える**と key-finding／和声整合が上がる。
- 出典:
  - Temperley & de Clercq, "Statistical Analysis of Harmony and Melody in Rock Music", JNMR 42(3) https://www.tandfonline.com/doi/abs/10.1080/09298215.2013.788039
  - RS200 コーパス公開ページ（rockcorpus） https://rockcorpus.midside.com/
  - de Clercq & Temperley, "A corpus analysis of rock harmony", Popular Music https://davidtemperley.com/wp-content/uploads/2015/11/declercq-temperley-pm11.pdf

### 2.2 Essen Folksong Collection（民謡 6000+ 曲）

- 内容: key/pitch/meter/小節線/休符/**フレーズ分割**を注記した 6000 曲超。major(n=5416)/minor(n=754) を分けて統計。
- 数えたもの・知見:
  - **melodic arch（アーチ型輪郭）**: Huron (1996) がフレーズ単位で「上昇→頂点→下降」が最頻という統計を提示。**フレーズ内輪郭の規範＝アーチ**。
  - Li & Huron (2006) は **scale-degree n-gram（1st・2nd order）** で旋律をモデル化し、**scale degree 表現が interval 表現より予測精度で優位**と報告。→ 骨格辞書は **interval bigram でなく scale-degree bigram/trigram で数えるべき**（理論的裏付け）。
  - 度数分布は Bach fugue と r=.92、art-song と r=.99 の高相関＝**西洋調性旋律の度数分布は普遍性が高い**。
- 出典:
  - Li & Huron, "Melodic Modeling: A Comparison of Scale Degree and Interval"（scale-degree 優位） https://quod.lib.umich.edu/i/icmc/bbp2372.2006.101/3/--melodic-modeling-a-comparison-of-scale-degree-and-interval
  - Verosky, "Essen as a Corpus of Early Musical Experience"（規模・注記・相関値） https://emusicology.org/article/id/4636/
  - Brinkman, "History, Form, and Use of the Essen Folksong Collection" https://www.scsmt.org/2021_conf_files/brinkman_2021_slides.pdf

### 2.3 POP909（中国語ポップ 909 曲）

- 内容: ボーカル旋律＋lead＋伴奏の MIDI。**beat/downbeat/key/chord/フレーズ境界/セクション構造**を注記。>90% が 4/4、少数 3/4・6/8。
- 3 段階の構造ラベル解像度: **旋律=16分音符 / 和音=4分音符 / フレーズ=小節**。24-grid 量子化。
- 含意: **本ツールの「2拍＝骨格グリッド、8分/16分＝表面グリッド、小節＝フレーズ」という多層時間軸は POP909 の解像度階層と一致**。骨格辞書の位相アンカーは POP909 の downbeat 注記と同じ発想で取れる。
- 出典:
  - POP909: A Pop-song Dataset for Music Arrangement Generation（arXiv 2008.07142） https://ar5iv.labs.arxiv.org/html/2008.07142
  - POP909 リポジトリ https://github.com/music-x-lab/POP909-Dataset

### 2.4 「度数遷移の統計」で数える最終項目（先行研究の総合）

- 開始度数（フレーズ頭）分布 / 終止度数（フレーズ末）分布 —— **別々に**（closure 点は特別）。
- scale-degree **bigram**（遷移行列）と **trigram**（3音型）—— interval でなく度数で。
- **chord-relative degree**（和音 root からの相対）分布 —— 和声整合のため。
- 音域内**重心**（tessitura の中心度数）とレンジ。
- major/minor（および和声モード vs 旋律モード）で層別。

---

## 3. フォーム回帰——骨格レベルの反復・変奏の型

古典形式論（Caplin, *Classical Form* / *Analyzing Classical Form*）が骨格反復の規範を明快に定義している。単位は **2小節 basic idea**。

### 3.1 Sentence（文）＝ 8 小節規範

- **presentation（提示, 1–4小節）**: 2小節 basic idea → その反復（3–4小節）。反復は主題を「提示」するが**終止しない**ため継続要求が生まれる。
- **continuation（継続, 5–8小節）**: 2 つの規範動作 —
  - **fragmentation（断片化）**: 単位が短くなる（2小節→1小節→半小節）。
  - **harmonic acceleration（和声加速）**: 和音交替が速くなる。
  - **liquidation（清算）**: 特徴的動機を系統的に削り、cadence（終止）へ。
- 骨格含意: **前半＝2拍/2小節骨格の反復、後半＝同じ骨格素材の断片化＋着地への加速。** 本ツールの sentence 実装は「後半で単位を割って終止へ寄せる」べき。

### 3.2 Period（楽節）＝ 弱終止→強終止の対

- basic idea を**対照的 idea と並置**し、前半楽句は弱い終止（HC など）、後半楽句は強い終止（PAC）で閉じる。
- 骨格含意: period は「前半骨格をほぼ**リテラル複写**し、**終止音だけ差し替える**」。本ツールの「period=後半が前半のリテラル複写」は方向として正しいが、**厳密には終止のみ変奏（antecedent=半終止＝`2` や `5` で浮かす／consequent=完全終止＝`1` に落とす）** が規範。→ **「終止差し替え型 period」を辞書に別型として持つべき**。

### 3.3 AABA（32小節・ポップ規範）

- A（8小節）が 3 回、B（bridge, 8小節）が対照。A は**骨格をほぼ保存**、B は**輪郭・音域・度数遷移を変える**（対照）。
- 保存されるもの/変わるもの（骨格レベル）:
  - 保存: 2小節 basic idea の輪郭、開始度数、フレーズ配置。
  - 変わる: 終止度数（antecedent/consequent の別）、B での音域シフト・度数遷移。

### 3.4 まとめ：骨格反復の 3 変換

| 変換 | 単位 | 保存 | 変化 |
|---|---|---|---|
| リテラル複写（period antecedent 内など） | 2小節 | 全度数 | なし |
| 終止差し替え（antecedent→consequent） | 2小節×2 | 冒頭輪郭 | 終止度数のみ |
| 断片化＋加速（sentence continuation） | 2→1→½小節 | 動機の核 | 長さ・和声速度・終止 |
| 対照（AABA の B） | 8小節 | 曲全体の調・拍節 | 音域・度数遷移・輪郭 |

- 出典:
  - Caplin, *Analyzing Classical Form*（OUP 公式・sentence/period 定義） https://global.oup.com/academic/product/analyzing-classical-form-9780199987290
  - Caplin 要約（presentation/continuation/fragmentation/liquidation） http://shanahdt.github.io/MUSI4331/lessons/phrases1.html
  - Sentence 構造ノート（basic idea 2小節・反復・継続） https://music.arts.uci.edu/abauer/16B_15/notes/Theme_Form.pdf

---

## 4. 骨格→表面の関係——装飾が骨格のどこに付くか

非和声音（NCT）理論が「表面装飾が骨格音のどの位置・どの拍に付くか」を完全に規定している。**装飾の種類はほぼ metric position（強拍/弱拍）で決まる。**

| 装飾 | 進入 | 離脱 | 拍位置 | 骨格に対する付き方 |
|---|---|---|---|---|
| 経過音 passing | 順次 | 順次・**同方向** | 主に**弱拍**（強拍もあり） | 2 骨格音の**間**を埋める（度数差 2 以上を段階化） |
| 刺繍音 neighbor | 順次 | 順次・**逆方向**（元へ戻る） | 主に**弱拍** | **同一骨格音**の上下往復（度数保持のまま揺らす） |
| 倚音 appoggiatura | **跳躍**（多く上行） | 順次・逆方向 | **常に強拍（accented）** | 骨格音の**直前・強拍**に非和声を置き解決 |
| 逸音 escape tone | 順次 | **跳躍**・逆方向 | **弱拍（unaccented）** | 骨格音から離れて跳ぶ |
| 先取音 anticipation | 任意 | 同音保持 | **弱拍** | 次の骨格音を早め取り |
| 掛留 suspension | 保持 | 順次下行 | **強拍**（拍頭で保持→解決） | 前骨格音を強拍に残し遅れて解決 |

### 骨格→表面の展開規則（実装可能な形）

1. **強拍の骨格音は原則そのまま置く**（＝ downbeat アンカーの根拠, §1）。
2. **骨格音 A→B の度数差が 2 以上** → 間に**経過音（弱拍・順次・同方向）**を挿入して段階化。
3. **同じ骨格音が連続** → **刺繍音（弱拍・上下往復）**で表面を揺らす。
4. **骨格音を強拍で強調** → 直前に**倚音（跳躍進入・強拍・順次解決）**を付ける＝ポップの「タメ／ため息」表現。
5. **フレーズ末の骨格着地音**（closure, §1.3）には掛留・先取で終止を装飾できるが、**着地度数そのものは動かさない**（骨格の identity 保存）。
6. 装飾は**弱拍優位**（経過・刺繍・逸音・先取は弱拍）＝ 骨格＝強拍という §1 の直観の裏返し。強拍を使う装飾（倚音・掛留）は「わざと不協和を強拍に置く」表現的例外。

- 出典:
  - Non-chord Tones（accented=強拍/unaccented=弱拍の分類, 各 NCT の進入離脱） https://intmus.github.io/inttheory19-20/09-non-chord-tones/a1-nonchordtones.html
  - Nonharmonic Tones（passing/neighbor/appoggiatura/escape/suspension 定義） https://pressbooks.pub/harmonyandmusicianshipwithsolfege/chapter/nonharmonic-tones/
  - Embellishing Tones（Open Music Theory） https://elliotthauser.com/openmusictheory/embellishingTones.html

---

## 5. 骨格辞書の計測仕様（数える項目リスト）——確定案

実曲コーパス（POP909 系・自作 MIDI・許諾ある素材）から抽出する。**リテラル旋律は保存せず、以下の統計・型のみを保存**（著作権）。

### 5.1 前処理・位相アンカー定義

- **拍節グリッド**: 小節→拍→半拍。骨格グリッド＝**2拍単位**（4/4 なら 1・3拍目＝小節前半/後半の downbeat）。表面グリッド＝8分/16分。POP909 と同じ多層解像度。
- **位相アンカー（phase anchor）の定義**: 各 2拍スロットの **強拍頭（onset が拍頭に最も近い音、なければ直前から保持中の音＝carry-forward）** を骨格音として 1 個サンプリング。
  - carry-forward 注意（既知の地雷, MEMORY 参照）: 強拍に onset が無く前音が持続中なら**その持続音の度数**を採る。休符なら「休符スロット」を明示（欠損として数える）。
  - **弱起（アナクルーシス）補正**: フレーズ頭が弱起なら、最初の強拍を位相 0 とし、弱起音は「pickup」として別枠で数える（骨格本体に混ぜない）。
- **度数化（正規化）**: 各骨格音を **key に対する scale degree（0–6 のダイアトニック index＋クロマ変質フラグ ♭3/♯4/♭7 等）** に変換。key/mode は frame 宣言（本ツールは key+mode を宣言済）を使う。
- **和音相対度数**: 同時に **chord root に対する相対度数（chord-relative）** も記録（Temperley 知見）。

### 5.2 数える項目リスト（単位付き）

| # | 項目 | 単位 | 正規化 | 根拠 |
|---|---|---|---|---|
| 1 | 開始度数 | 度数 index | key 相対 | §2.4 開始/終止分離 |
| 2 | 終止度数（フレーズ末 closure） | 度数 index | key 相対 | Narmour closure §1.3 |
| 3 | 度数 **bigram** 遷移行列 | 度数→度数 の頻度 | 行方向確率正規化 | Li&Huron scale-degree 優位 §2.2 |
| 4 | 度数 **trigram**（3音型） | 度数×3 | 頻度→確率 | §2.2 |
| 5 | chord-relative degree 分布 | 度数 index | chord root 相対 | Temperley §2.1 |
| 6 | tessitura 重心・レンジ | 半音 or 度数 | フレーズ内平均・幅 | §2.2 |
| 7 | フレーズ内輪郭型 | {arch/ascending/descending/flat/wave} | 4–8 スロット列を分類 | Huron arch §2.2 |
| 8 | 反復変換型 | {literal/cadence-swap/fragment-accel/contrast} | §3.4 の 4 分類 | Caplin §3 |
| 9 | 反復単位長 | 小節（2 が規範） | — | Caplin basic idea §3.1 |
| 10 | mode 層別 | {major, minor, 和声≠旋律} | 別集計 | Temperley §2.1 |
| 11 | 装飾密度（骨格音あたり NCT 数） | 個/骨格音 | スロット別 | §4（骨格→表面較正用） |
| 12 | 装飾種×拍位置 同時分布 | {passing…}×{強/弱拍} | 頻度 | §4 展開規則の重み |

### 5.3 保存フォーマット（辞書エントリの粒度）

- **キー**: `(mode, form-role, phrase-length)` 例 `(major, chorus, 4bar)`。
- **値**: 上記 1–12 の統計テーブル（bigram 行列・分布・輪郭型ヒストグラム）。**リテラル度数列は保存しない**が、**匿名化した「型テンプレ」**（輪郭記号列＋開始/終止度数＋変換型）は自作ネタなら可、他者コーパスからは統計のみ。
- 生成時の使い方: (a) 開始度数を分布からサンプル → (b) bigram/trigram でランダムウォーク（フォーム回帰は §3.4 の変換を適用）→ (c) 終止度数を closure 分布で拘束 → (d) 輪郭型 (#7) を制約として reject sampling → (e) §4 規則で表面へ展開。**「候補を複数出す」思想**に沿い seed 違いで N 本出す。

### 5.4 既存実装への含意（差分）

- 現状「ランダムウォーク＋period リテラル複写」→ **bigram/trigram 重みでウォーク**（一様乱数をやめる）。
- period に **cadence-swap 型**（終止だけ差し替え）を追加（§3.2）。
- sentence に **fragment-accel 型**（後半で単位割り＋加速）を追加（§3.1）。
- 骨格→表面展開を **§4 の metric-position 規則**でルール化（現状の装飾ロジックの根拠付け）。
- 終止度数を closure 分布で拘束（着地ジッタ対策, MEMORY 既知課題と接続）。

---

## 6. 理論から手書きした骨格メロディ・サンプル（6 本）

表記法: 各音は `度数@拍位置`。度数は key 相対 scale degree（1=主音, 5=属音, ♭3 等は変質）。拍位置は `小節.拍`（4/4, 2拍骨格グリッド＝各小節の 1拍目・3拍目）。`|` は小節境界。型名を明記。

### サンプル 1 —— アーチ型 period（major, 4小節, verse 想定）
```
antecedent : 1@1.1  3@1.3 | 5@2.1  6@2.3   (上昇して 6 で浮かす＝弱終止 HC 感)
consequent : 1@3.1  3@3.3 | 5@4.1  1@4.3   (同じ上昇輪郭→終止だけ 1 に落とす＝PAC)
```
型: アーチ型 period / 変換=**cadence-swap**（冒頭 `1 3 5` 保存、終止 `6`→`1`）。輪郭=前半 arch 上行、後半で解決。

### サンプル 2 —— 下降型 sentence（major, 4小節圧縮, chorus 想定）
```
presentation : 5@1.1  5@1.3 | 5@2.1  3@2.3    (basic idea = 5 保持→ 3、を提示反復)
continuation : 3@3.1  2@3.3 | 1@4.1 1@4.3     (断片化＝1音単位で下降加速し 1 へ着地)
```
型: 下降型 sentence / 変換=**fragment-accel**。頂点 `5` から段階下降＝典型サビの「高く始まって落ちる」輪郭。

### サンプル 3 —— aaba（AABA の 1 コーラス縮図, minor, 8小節）
```
A1: 1@1.1 ♭3@1.3 | 5@2.1 ♭3@2.3      (短調の 1-♭3-5-♭3, 旋律短調)
A2: 1@3.1 ♭3@3.3 | 5@4.1 4@4.3       (A をほぼ複写、終止側を 4 で開く=弱終止)
B : ♭7@5.1 ♭6@5.3 | 5@6.1 4@6.3      (bridge=音域上げ＋下降で対照, ♭7 から)
A3: 1@7.1 ♭3@7.3 | 5@8.1 1@8.3       (A 回帰、1 に完全着地)
```
型: aaba / A=**literal〜cadence-swap**、B=**contrast**（度数遷移と開始度数を変える）。minor 層。

### サンプル 4 —— アーチ型 8小節ロング period（major, ballad verse）
```
antecedent : 1@1.1 2@1.3 | 3@2.1 3@2.3 | 5@3.1 4@3.3 | 3@4.1 2@4.3   (山なり→ 2 で半終止)
consequent : 1@5.1 2@5.3 | 3@6.1 3@6.3 | 5@7.1 4@7.3 | 2@8.1 1@8.3   (同輪郭→ 1 で全終止)
```
型: アーチ型 period（8小節）/ 変換=**cadence-swap**。頂点=5小節目（Huron arch: フレーズ中盤〜後半に頂点）。

### サンプル 5 —— 上昇プラトー型 sentence（major, リフト系サビ）
```
presentation : 3@1.1 5@1.3 | 3@2.1 5@2.3     (3⇄5 の振動 basic idea を反復)
continuation : 5@3.1 6@3.3 | 6@4.1 5@4.3     (断片化して 6 へ持ち上げ, 頂点保持=plateau)
```
型: 上昇プラトー型 sentence / 変換=**fragment-accel**、頂点 `6` で保持＝盛り上がりの「張り」。終止を 1 に落とさず宙吊り（次セクションへ橋渡し）。

### サンプル 6 —— 刺繍・保持型 flat period（pop pre-chorus, 度数保持で緊張ため）
```
antecedent : 5@1.1 5@1.3 | 6@2.1 5@2.3       (5 を軸に上刺繍 6, ほぼ静止=溜め)
consequent : 5@3.1 5@3.3 | 4@4.1 3@4.3       (静止から 4-3 で下降開放, サビ前の落とし)
```
型: flat/wave 型 period / 変換=**cadence-swap**（前半静止、後半だけ下降解決）。輪郭=ほぼ平坦＝ pre-chorus の「動かないで溜める」定石。表面展開時は 5 の上に刺繍音（弱拍）を多く付ける想定（§4-3）。

### サンプルの設計含意
- 6 本は §5.2 の項目（開始度数=`1/5/3`、終止=`1/6/4/2`、輪郭=arch/descending/flat、変換=literal/cadence-swap/fragment-accel/contrast、mode=major/minor）を**網羅的にカバー**するよう選んだ＝**辞書の型ラベルの spanning set の最小例**。
- 実装テスト時、これらを「手書き正解」として **bigram 抽出→再生成が同型を返すか**の回帰テストに使える（TDD の赤→緑素材）。

---

## 7. 残タスク（忘れ防止・Task 化候補）

1. **計測パイプライン実装**（§5.2 の 1–12 を MIDI から抽出、自作コーパス優先）。carry-forward／弱起補正は既知の地雷（MEMORY）を踏襲。
2. **bigram/trigram ウォーク**への置換（一様乱数の撤去）＋ closure 終止拘束。
3. **period に cadence-swap 型 / sentence に fragment-accel 型**を追加（§3, §5.4）。
4. **骨格→表面展開の metric-position ルール化**（§4 の表をコード化）。
5. **サンプル 6 本を回帰テスト固定値**に採用（§6）。
6. （後回し）他者コーパス（POP909/RS200/Essen）からの統計抽出は**統計のみ・リテラル非保存**を厳守。まず自作ネタで型辞書の器を作る。

---

## 出典一覧（URL）

- Schenkerian analysis（Wikipedia） https://en.wikipedia.org/wiki/Schenkerian_analysis
- Heyer, Applying Schenkerian Theory to Mainstream Jazz（MTO） https://mtosmt.org/issues/mto.12.18.3/mto.12.18.3.heyer.html
- Schenkerian Analysis 研究ガイド（pop-rock 応用） https://papersflow.ai/research/topics/musicology-and-musical-analysis/schenkerian-analysis
- GTTM 概説（Chromatone） https://chromatone.center/theory/composition/generative/
- Hamanaka, Melody morphing / GTTM time-span tree https://gttm.jp/hamanaka/en/melody-morphing-method/
- Automatic Melody Reduction via Shortest Path Finding（arXiv 2508.01571） https://arxiv.org/pdf/2508.01571
- Narmour, Implication-Realization Model（本人ページ） https://web.sas.upenn.edu/enarmour/the-implication-realization-model/
- Implication-Realization（Wikipedia） https://en.wikipedia.org/wiki/Implication-Realization
- Temperley & de Clercq, Statistical Analysis of Harmony and Melody in Rock Music（JNMR 42(3)） https://www.tandfonline.com/doi/abs/10.1080/09298215.2013.788039
- RS200 / rockcorpus https://rockcorpus.midside.com/
- de Clercq & Temperley, A corpus analysis of rock harmony https://davidtemperley.com/wp-content/uploads/2015/11/declercq-temperley-pm11.pdf
- Li & Huron, Melodic Modeling: Scale Degree vs Interval https://quod.lib.umich.edu/i/icmc/bbp2372.2006.101/3/--melodic-modeling-a-comparison-of-scale-degree-and-interval
- Verosky, Essen as a Corpus of Early Musical Experience https://emusicology.org/article/id/4636/
- Brinkman, History/Form/Use of the Essen Folksong Collection https://www.scsmt.org/2021_conf_files/brinkman_2021_slides.pdf
- POP909（arXiv 2008.07142） https://ar5iv.labs.arxiv.org/html/2008.07142
- POP909 リポジトリ https://github.com/music-x-lab/POP909-Dataset
- Caplin, Analyzing Classical Form（OUP） https://global.oup.com/academic/product/analyzing-classical-form-9780199987290
- Caplin 要約（phrases/cadences） http://shanahdt.github.io/MUSI4331/lessons/phrases1.html
- Sentence 構造ノート（UC Irvine） https://music.arts.uci.edu/abauer/16B_15/notes/Theme_Form.pdf
- Non-chord Tones（Integrated Music Theory） https://intmus.github.io/inttheory19-20/09-non-chord-tones/a1-nonchordtones.html
- Nonharmonic Tones（Solfège Pressbook） https://pressbooks.pub/harmonyandmusicianshipwithsolfege/chapter/nonharmonic-tones/
- Embellishing Tones（Open Music Theory） https://elliotthauser.com/openmusictheory/embellishingTones.html
```
