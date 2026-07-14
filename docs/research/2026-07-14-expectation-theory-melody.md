# 期待理論 →「意外さと納得の配分」操作規則（M5）

作成: 2026-07-14 / 種別: 理論研究（外部・出典付き）
目的: **評価ではなく配置設計**。どこに意外さ(surprise)を置き、どこで納得(resolution)させるかを、メロ生成器の
**骨格層（度数の構造線）／表面層（リズム・装飾）**のどちらに効かせるかまで含めて操作規則に落とす。

> 前提の再確認（このプロジェクトの既知の結論）: 言語モデルの perplexity による「メロの自然さ評価」は
> クローズ済み＝**変な候補を弾くガードにしかならず、質は測れない（天井）**。本ドキュメントは評価器を作る話ではなく、
> **生成時に期待の起伏を意図的にデザインする**ための規則集である。思想「機械は候補まで、仕上げは人間」に従い、
> 規則は「候補の重み付け・並べ替え」に使う前提で書く（決定論的な正解生成ではない）。

---

## 0. 3行サマリ（先に結論）

- **句のICカーブは「句頭=中〜高／句中=順次で予測を積む／句末=低IC(終止で納得)」が基本形**。骨格層で度数の着地を、表面層でリズムの緩急を担う。
- **跳躍は充填(gap-fill)で返す**（大跳躍の約72%が反対方向へ反転／von Hippel & Huron 2000）。これは骨格層の度数遷移の重み表にする。
- **サビ/フックは「ありふれた土台 × 一点の意外さ」**。pop 実証（Contrastive/Absolute-Surprise）は、サビ手前で surprise を上げ、サビ頭で落として"到着"させる型を支持。**意外さは1句1点まで**。過剰適用は平板化とモチーフ破壊を招く。

---

## 1. IDyOM（Pearce）— 情報量(IC)とエントロピー(H)

### 1.1 計算法
- IDyOM は**可変次数 n-gram（PPM: Prediction by Partial Matching）**ベースの統計モデル。各イベント e に対し、直前の文脈から
  条件付き確率 P(e | 文脈) を出し、
  - **情報量（Information Content, IC） = −log₂ P(e | 文脈)** … その音が「どれだけ意外だったか」（surprise, 事後）。
  - **エントロピー H = Σ P(x)·(−log₂ P(x))** … 次に何が来るかの**不確実性**（uncertainty, 事前）。文脈が次音をどれだけ絞れているか。
  - IC と H は別物：H は「予想のしにくさ」（分布の広さ）、IC は「実際に来た音の裏切り度」。
- **LTM（長期モデル）＝コーパス全体で学習**（様式的知識）と、**STM（短期モデル）＝いま鳴っている曲だけで逐次学習**（曲内の反復・モチーフを拾う）を併用し、両者を統合（LTM+）。→ **統計学習＝反復するほどICが下がる**という性質が STM 側に自然に入る。
- **ビューポイント（viewpoint）**：pitch そのものだけでなく interval（音程）・contour（輪郭）・scale-degree（度数）・onset/duration など複数表現を組み合わせて予測（multiple-viewpoint system）。学習/実装は Common Lisp 版 [mtpearce/idyom](https://github.com/mtpearce/idyom)、Python 再実装 **IDyOMpy**（Guo & Pearce 系）[ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0165027024002929) / [PubMed 39709074](https://pubmed.ncbi.nlm.nih.gov/39709074/)。
- 総説：Pearce & Wiggins, "Auditory Expectation: The Information Dynamics of Music Perception and Cognition", *Topics in Cognitive Science* (2012) [Wiley](https://onlinelibrary.wiley.com/doi/full/10.1111/j.1756-8765.2012.01214.x)（PDF: [marcus-pearce.com](https://www.marcus-pearce.com/assets/papers/PearceWigginsMP06.pdf)）。

### 1.2 実曲での IC 分布（句頭/句末/フック位置）
- **句境界（グルーピング境界）は「IC も H も高いイベントの直前」で知覚される**。すなわち**新しい句の頭の音は高IC/高H**（文脈が切れて予測が当たらない）。IDyOM は Essen 民謡 1,705曲・音楽学者の句注釈に対し、**ICプロファイルのピーク＝句境界**として境界検出できる（907 の西洋調性旋律で学習）。Hansen, Pearce et al. (2021) "Predictive Uncertainty Underlies Auditory Boundary Perception" [PDF](https://www.marcus-pearce.com/assets/papers/HansenEtAl2021.pdf)。
- 逆に**句の内部＝順次進行主体で IC は低め**（予測が積み上がる）。**終止音（cadence）は低IC＝最も予測可能＝「納得」**。＝句の中で IC は「頭で持ち上がり→中盤で下降→終止で底」を描くのが典型で、次の句頭でまた跳ね上がる鋸歯状。
- **フック位置の設計含意**：フックを「到着＝納得」に感じさせたいなら**フック直前で IC を持ち上げ（不確実性を作り）→フック頭で落とす**。逆にフックそのものに刺さりが欲しいなら**フック内に一点だけ高IC音**を置く（後述サビ研究）。
- IDyOM は Narmour/Schellenberg の**静的ルールモデルより、聴取者の期待評定・反応時間を有意に良く予測**する（統計学習が期待の主因）。Pearce & Wiggins (2006), "Expectation in Melody: The Influence of Context and Learning" [PDF](https://www.marcus-pearce.com/assets/papers/PearceWigginsMP06.pdf)。

---

## 2. Narmour I-R / Schellenberg / Margulis — 跳躍と方向反転の定量

### 2.1 Narmour Implication-Realization（I-R）
- 小さい音程は「同種の継続」を含意（implication）、大きい音程は「反転（reversal）」を含意。ボトムアップのゲシュタルト原理：
  **Registral Direction（方向）／Intervallic Difference（音程差）／Registral Return（原音域回帰）／Proximity（近接）／Closure（閉じ）**。
  Narmour, *The Analysis and Cognition of Basic Melodic Structures* (1990)。レビュー [ResearchGate](https://www.researchgate.net/publication/249988032_A_Review_and_Empirical_Assessment_The_Analysis_and_Cognition_of_Basic_Melodic_Structures_Eugene_Narmour)。
- **gap-fill（跳躍→充填）**：大きな跳躍（gap）は、**反対方向への順次進行で埋め戻される**ことを含意。

### 2.2 Schellenberg の簡約（定量の芯）
- Schellenberg (1996/1997) は I-R を**2因子に圧縮**して予測精度を維持/向上：
  - **Pitch Proximity（近接）**：次音は直前音に**音程的に近い**ほど期待される（＝順次進行志向）。
  - **Pitch Reversal（反転）**：**小音程は同方向の小音程を、大音程は反対方向の小音程を含意**。
- 回帰での寄与（squared semipartial）：**Proximity sr²≈0.364、Reversal sr²≈0.144**（Proximity が支配的）。
  Schellenberg (1997) "Simplifying the Implication-Realization Model of Melodic Expectancy" [ResearchGate](https://www.researchgate.net/publication/230746009_Simplifying_the_Implication-Realization_Model_of_Melodic_Expectancy)。
- **跳躍→解決先の分布（実証）**：von Hippel & Huron (2000) — 各種文化の旋律で**大跳躍の約72%が方向反転を伴う**。ただし相当部分は
  **音域制約(tessitura)＋平均回帰(regression to the mean)の副産物**で、能動的 gap-fill ではない可能性を指摘。
  [Why Do Skips Precede Reversals?](https://www.researchgate.net/publication/224982434_Why_Do_Skips_Precede_Reversals_The_Effect_of_Tessitura_on_Melodic_Structure)。
  → 設計含意：**跳躍後は「反対方向へ順次」を高確率で置く**が、それは「規則を守った=正解」ではなく「統計的自然」。**跳躍後に非充填を選ぶと"意外さ"の資源になる**（＝ここが一点サプライズの置き場）。

### 2.3 Margulis 2005（張力への接続）
- 一次因子 **stability（安定）・proximity（近接）・direction（方向）**＋二次因子 **mobility（可動性：同音反復の扱い）**で
  各時点の期待度を単一関数として出力。**張力を3種に分解**：
  - **surprise-tension**（意外さ由来／期待度に反比例）、**denial-tension**（期待した解決が来ない／保留・遅延）、**expectancy-tension**（強い含意が生む前のめり）。
  Margulis (2005) "A Model of Melodic Expectation", *Music Perception* [UC Press](https://online.ucpress.edu/mp/article-abstract/22/4/663/62196/A-Model-of-Melodic-Expectation)。
- 設計含意：**「意外さ」と「遅延(denial)」は別レバー**。前者は音を裏切る、後者は**期待を作って解決を先延ばす**（サスペンション/引き延ばし）。

---

## 3. Huron『Sweet Anticipation』— 統計学習と期待違反の快

- **ITPRA**：期待の情動は Imagination（想像）・Tension（緊張・事前）・Prediction（予測が当たると報酬）・Reaction（反射・事後即時）・Appraisal（評価・事後熟慮）の5系統。Huron (2006), MIT Press [MIT](https://mitpress.mit.edu/9780262083454/sweet-anticipation/) / 書評 [MTO](https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html)。
- **予測が当たること自体が報酬（prediction response）**＝**予測可能性は快**。だから土台は"ありふれて"いてよい。
- **限界的対比(limbic contrast)**：予測違反はまず**否定的な即時反応(Reaction)**を生むが、直後の**Appraisal で「安全だった／面白い」と再評価**され、コントラストで**強い正の情動（frisson 等）に反転**しうる。＝**意外→即・解決/安心**の並びが快の正体。
- **schematic（様式）vs veridical（その曲固有）**：**偽終止(deceptive cadence)は、来ると知っていても意外に響き続ける**（schematic 期待は消えない）。＝反復モチーフ（veridical=覚えた）と、様式的期待（schematic）は別レイヤーで共存できる。
- **遅延解決・サスペンション**：緊張を作って解決を遅らせると、解決時の報酬が増幅（denial-tension→resolution）。シンコペ・掛留・偽終止はこの機構の利用。

---

## 4. サビ/フック研究との接続（pop 実証）

- **Absolute-Surprise Hypothesis**：曲全体の**平均ハーモニック・サプライズが高い曲ほど選好が高い**傾向。
- **Contrastive-Surprise Hypothesis**：**サビ/プレコーラスで surprise が"下がる"曲ほど選好が高い**（＝手前で溜めて、サビで落として"到着"させる）。
- McGill Billboard コーパス上位四分位の曲で、**平均サプライズ増**（Absolute）**かつ プレコーラス→サビで surprise ドロップ**（Contrastive）を確認。
  Miles, Rosen, Grzywacz ら "Behavioral evidence of a harmonic surprise effect on preference in popular music" [ScienceDirect](https://www.sciencedirect.com/science/article/pii/S2666518222000158)。
- **快の非単調性（sweet spot / 逆U）**：Gold, Pearce, Salimpoor et al. (2019) — **不確実性(H) × 意外さ(IC) の相互作用**が快を予測。
  「**低不確実性の文脈での高サプライズ**」または「**高不確実性の文脈での低サプライズ**」で報酬が最大化＝**Wundt 型の逆U**。
  "Uncertainty and Surprise Jointly Predict Musical Pleasure…", *Current Biology* [Cell](https://www.cell.com/current-biology/fulltext/S0960-9822(19)31258-8)。
- **設計含意（フックの黄金型）**：**「ありふれた・低不確実性の土台（安定した進行・順次骨格） × 一点の高サプライズ」**。土台を固めるほど、置いた一点が効く（逆に混沌の中の意外さは埋もれて快にならない）。

---

## 5. 生成時の操作規則（本題）

以下は**候補の重み付け／並べ替え**に使う規則。値は初期ターゲット（要・耳較正）。層の別を必ず明記する。

### (a) 句内IC目標カーブ（句頭 / 句中 / 句末の目標帯）

| 句内位置 | ICターゲット帯（相対） | 狙い | 効かせる層 |
|---|---|---|---|
| **句頭**（1〜2音目） | **中〜高**（そのフレーズ内の上位帯） | 新規性・区切り感を出す。跳躍やスケール外の入り、リズムの食いを許容 | 主に**骨格層**（句頭度数の選択）＋補助で表面（アウフタクト） |
| **句中**（展開部） | **低〜中**（順次で予測を積む） | proximity 支配。予測可能性＝Prediction 報酬を稼ぐ土台 | **骨格層**（順次の度数線）＋**表面層**（8分の走句・装飾） |
| **句末 直前**（山） | **一時的に高**（denial を1回） | 解決の手前で溜める。掛留/経過音/偽終止候補 | **表面層**（リズム遅延・掛留）＋和声（偽終止は骨格寄り） |
| **句末**（着地） | **低**（そのフレーズの下位帯＝最も予測可能） | 終止＝納得。和声内音・安定度数（1/3/5、調性の主音・属音圏）へ着地 | **骨格層**（着地度数の固定） |

- 形の要点：**IC は句頭で立ち上がり→句中で下がり→句末直前で一瞬跳ねて→終止で底**、という鋸歯＋末尾のこぶ。次句頭でまた立ち上がる。
- サビ全体では、**サビ直前（プレコーラス末）の IC を持ち上げ、サビ頭で落とす**（Contrastive-Surprise）。＝句カーブの上に**セクション規模のカーブ**を重ねる。

### (b) 跳躍→充填 規則表（跳躍幅 × 方向 → 次音候補の重み）

直前の音程を trigger に、次音候補（骨格の度数遷移）へ与える相対重み。基準は Schellenberg（proximity 支配＋reversal）と von Hippel/Huron（大跳躍≈72%反転）。**すべて骨格層に効かせる**。

| 直前の跳躍 | 次音: 同方向・順次(step) | 次音: 反対方向・順次(step, =充填) | 次音: 同方向・跳躍 | 次音: 反対方向・跳躍 |
|---|---|---|---|---|
| **2度（step）** | **高**（proximity＝継続） | 中 | 低 | 低 |
| **3〜4度（小skip）** | 中 | **中〜高**（緩い充填） | 低〜中 | 低 |
| **5〜6度（跳躍）** | 低 | **高（充填）** | 低 | 低 |
| **7度以上/オクターブ** | 極低 | **最高（充填必須寄り）** | 極低 | 低 |

- 実装：この表は候補生成の**事前重み**。ただし**「充填しない」選択肢を意図的に残す**（＝(c) の一点サプライズ資源）。
- **着地は和声内音を優先**（跳躍先が非和声音なら、その次で順次解決を強く要求）。
- 表面層への波及：大跳躍の直後は**音価を長めに（着地を聴かせる）**、細かい装飾は跳躍前後で控える（跳躍を埋もれさせない）。

### (c) 一点サプライズの配置規則（位置・種類・頻度上限）

「意外さ」は**希少資源**。ばら撒くと平板化する（§6）。

- **位置**：
  - 1フレーズにつき**最大1点**。
  - 曲スケールでは**サビ頭 または フック直前**に主サプライズを集中（Contrastive-Surprise）。A メロは低刺激で土台化。
  - **反復モチーフの3回目で崩す**（rule of three：2回で期待を作り、3回目で裏切る）。
- **種類**（骨格/表面の別）：
  1. **スケール外音・借用/クロマチック経過音** — 骨格層（度数の逸脱）。強め。直後に順次解決を必須化。
  2. **想定外跳躍（充填規則を破る）** — 骨格層。中〜強。
  3. **リズムのシンコペ・食い・意図的な休符（欠落）** — **表面層**。骨格を壊さず刺激だけ足せる＝低リスクの第一候補。
  4. **偽終止(deceptive cadence)・遅延解決** — 和声＋骨格。schematic なので**知っていても効く**（§3）。denial-tension を作る。
- **頻度上限（律儀すぎ防止のガード）**：
  - 高IC音（スケール外・非充填跳躍）は**フレーズ密度 ≤ 1点**、**曲全体で音数の概ね ≤ 5〜10%**を目安（超えると"混沌"側＝逆Uの右肩下がり）。
  - **各サプライズには直後に解決（低IC着地）をセットで用意**（意外→即・納得＝limbic contrast の快）。解決の当てのない意外さは置かない。
- **不確実性(H)の管理**：土台は**低H（安定進行・順次骨格）**に保ち、その上で高IC音を置く（Gold et al. の逆U：低不確実文脈×高サプライズが快）。Hを上げすぎ（無調的な広い分布）ると学習不能で不快。

### (d) 層の担当まとめ

- **骨格層（度数の構造線）**＝**意外さと納得の「音程・和声的」配分**を担う：句頭/句末の度数帯、跳躍→充填、スケール外音、偽終止。ICカーブの骨。
- **表面層（リズム・装飾）**＝**低リスクで刺激を足す/引く**：シンコペ・食い・休符・音価の緩急・装飾密度。骨格を壊さず ITPRA の tension/prediction を演出。まずここで意外さを試すのが安全。

---

## 6. 過剰適用の警告（平板化する条件）

期待理論に**律儀すぎると必ず退屈になる**。以下が平板化の発火条件：

1. **全部を「期待通り」にする**：proximity と gap-fill を毎回守る＝すべて予測可能＝**Prediction 報酬が飽和して無刺激**。逆Uの左（低覚醒）へ落ちる。→ **必ず一点は裏切る**（(c)）。
2. **IC最小化をモチーフに適用してしまう**：ICを一律に下げようとすると、反復モチーフは「予測可能＝低IC」なのに毎回"別の自然な音"に置き換わり、**モチーフ同一性が壊れる**。
   - モチーフの反復は**veridical 期待（その曲固有の記憶）**を作る営みで、schematic な IC 規則とは別レイヤー（Huron §3）。STM が反復を学習して IC は自然に下がる＝**反復は「低ICだから悪い」ではなく音楽的に必須**。
   - **鉄則：IC/充填規則は「モチーフ骨格を固定した上で、その周辺の充填・装飾・接続にのみ」適用する**。骨格そのものを規則で毎回書き換えない。
3. **意外さの撒きすぎ**：高IC音を各所に置く＝**混沌**＝逆Uの右（学習不能・不快）。埋もれて一点も効かなくなる。土台の低H・低ICがあって初めてサプライズが立つ（§4 Gold et al.）。
4. **サビも全部"意外"にする誤り**：pop 実証はむしろ**サビ＝ありふれた低サプライズ土台への「到着」**を支持（Contrastive）。**サビを凝りすぎない**のが正解のことが多い。
5. **反復とのテンション設計**：反復（同一）と発展（変化）の綱引きは、**「2回維持→3回目で崩す」「モチーフ骨格は保ち表面だけ変える」**で調停する。全反復＝退屈、全変化＝散漫、その中間に置く。

---

## 7. 設計含意（このツールへの落とし込み）

- 生成器は**「骨格ICカーブ・テンプレート」**を持つべき：句頭中高→句末低の鋸歯＋セクション規模のサビ手前ピーク。候補ランクにこのカーブとの適合を（唯一でなく一因子として）足す。※ IC評価は§冒頭どおり**質の測定ではなく配分の当て込み**に使う。
- **跳躍→充填の重み表(b)** を骨格の度数遷移サンプラの事前分布にする。「充填しない候補」も低確率で残す＝サプライズ在庫。
- **一点サプライズ**は明示パラメータ化：位置（句/セクション）・種類（4類）・層（骨格/表面）・「直後に解決を要求」フラグ。頻度上限を器側で担保。
- **表面層のサプライズ（シンコペ・休符）を第一候補**に（骨格非破壊・低リスク）。骨格の逸脱（スケール外・非充填跳躍）は"ここぞ"で。
- 思想「機械は候補まで、仕上げは人間」に整合：規則は**候補の起伏を設計して並べ替える**ためで、正解を確定しない。**モチーフ骨格は人間/上位が固定し、器はその周辺だけ規則適用**（§6-2 の鉄則）。

---

## 出典（URL）

- Pearce & Wiggins (2012) *Topics in Cognitive Science* — IDyOM 総説: https://onlinelibrary.wiley.com/doi/full/10.1111/j.1756-8765.2012.01214.x
- Pearce & Wiggins (2006) Expectation in Melody（IDyOM vs Narmour/Schellenberg, PDF）: https://www.marcus-pearce.com/assets/papers/PearceWigginsMP06.pdf
- Hansen, Pearce et al. (2021) Predictive Uncertainty Underlies Auditory Boundary Perception（境界＝高IC/高H, PDF）: https://www.marcus-pearce.com/assets/papers/HansenEtAl2021.pdf
- IDyOM 実装（Lisp）: https://github.com/mtpearce/idyom
- IDyOMpy（Python 再実装）: https://www.sciencedirect.com/science/article/abs/pii/S0165027024002929 / https://pubmed.ncbi.nlm.nih.gov/39709074/
- Schellenberg (1997) Simplifying the I-R Model（Proximity/Reversal 2因子）: https://www.researchgate.net/publication/230746009_Simplifying_the_Implication-Realization_Model_of_Melodic_Expectancy
- Schellenberg (2002) Expectancy in Melody: Tests of Children and Adults（PDF）: https://www.brainmusic.org/EducationalActivities/Schellenberg_melody2002.pdf
- von Hippel & Huron (2000) Why Do Skips Precede Reversals?（大跳躍≈72%反転／tessitura）: https://www.researchgate.net/publication/224982434_Why_Do_Skips_Precede_Reversals_The_Effect_of_Tessitura_on_Melodic_Structure
- Margulis (2005) A Model of Melodic Expectation, *Music Perception*: https://online.ucpress.edu/mp/article-abstract/22/4/663/62196/A-Model-of-Melodic-Expectation
- Huron (2006) *Sweet Anticipation*, MIT Press（ITPRA）: https://mitpress.mit.edu/9780262083454/sweet-anticipation/ / 書評: https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html
- Miles, Rosen, Grzywacz — Harmonic surprise effect on preference in pop（Absolute/Contrastive-Surprise）: https://www.sciencedirect.com/science/article/pii/S2666518222000158
- Gold, Pearce, Salimpoor et al. (2019) Uncertainty and Surprise Jointly Predict Musical Pleasure, *Current Biology*（逆U/相互作用）: https://www.cell.com/current-biology/fulltext/S0960-9822(19)31258-8
