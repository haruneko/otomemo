# シンコペーションの「快の逆U」— 定量とセクション別ターゲット帯（D4）

作成: 2026-07-14 / 分野: リズム知覚（グルーヴ研究）
目的: リズム生成（ドラム/ベース/メロ）で使うシンコペ量の**最適帯**を設計値に落とす。
前提（既知・再調査せず）: LHL（Longuet-Higgins & Lee 1984）の基本、Witek 2014 の存在。
思想: **機械は候補まで・仕上げは人間**。よってシンコペ量は「審判（採点で弾く）」にせず「**ノリのレンズ（並べ替え）**」として使う。

---

## 0. 3行サマリ（結論先出し）

- グルーヴ（快＋身体動員）は**シンコペ量に対して逆U**。ピークは**中程度**、上限を越えると崩壊する（低い＝退屈、高い＝解釈不能）。
- だが「量」だけでは決まらない。**パターン（どの拍・どの楽器・楽器間の噛み合い）が主**。ランダムに撒いても快は増えない（Sioros 2022）。
- 実装は「**全層いっぺんに盛らない**」＝ハット≈0、バックビートは基本据える、シンコペはキック/ベース/上物へ**分散配置**。層別ターゲット帯＋テンポ交互作用で運用する。

---

## 1. Witek et al. 2014 — 逆Uの原典と定量

出典: Witek MAG, Clarke EF, Wallentin M, Kringelbach ML, Vuust P (2014). *Syncopation, Body-Movement and Pleasure in Groove Music.* PLoS ONE 9(4): e94446.
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0094446 ／ https://pubmed.ncbi.nlm.nih.gov/24740381/

**刺激**: ファンクのドラムブレイク **50個**。34は実録音の採譜、2はGarageBandテンプレ、14はスペクトルを広げるために人工構成。
**シンコペ指数**: LHL を土台にした**改変版**＝「より非階層的なメーターモデル＋楽器別の重みを追加」してポリフォニックなドラムブレイクに対応させたもの。
**シンコペ値域**: **0〜81**（このスケール上で50刺激が分布）。解析では **Low / Medium / High の3カテゴリ**（各カテゴリほぼ同数）に量子化。

**結果（逆U）**:
- **快（pleasure）**も**動きたさ（wanting to move）**も、シンコペ増加につれ上昇するが**最適点で頭打ち**、以降は下降 → **中程度でピーク**。
- 効果は**ダンス好き**な回答者でより強い（身体動員との結合が個人特性で変わる）。
- メカニズム解釈: 予測（メーター）と逸脱（シンコペ）の**均衡点**でドーパミン系の報酬・運動系の巻き込みが最大。低＝退屈、高＝メーター崩壊で予測不能。

**設計含意**: 逆Uは**頑健な一次原理**として採用してよい。ただし Witek のスケール（0〜81）は「改変LHL＋楽器重み」由来なので、**絶対値は自前の指標に移植不可**。相対形（中庸が最良）だけ持ち込む。

---

## 2. 追試・拡張 — 逆Uの頑健性・最適点の移動・テンポ交互作用

### 2-1. Sioros/Stupacher ら 2022「簡潔刺激セット」— 数値の落とし所
出典: Stupacher J, Wrede O, Vuust P (2022). *A brief and efficient stimulus set to create the inverted U-shaped relationship between rhythmic complexity and the sensation of groove.* PLoS ONE 17(5): e0266902.
https://pmc.ncbi.nlm.nih.gov/articles/PMC9119456/ ／ https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0266902

指標は **Fitch & Rosenfeld (2007) / Matthews et al. (2019) 系のシンコペ指数**（音onset後に来る、より弱い拍位置の休符を検出しその重み差を積算）。3水準の実測:

| 複雑度 | シンコペ指数 | パルス明瞭度 | グルーヴ平均(SD) |
|---|---|---|---|
| Low | **0** | 0.72 | 41.3 (24.4) |
| **Moderate** | **4** | 0.31 | **61.2 (23.7)** |
| High | **18** | 0.28 | 20.1 (20.5) |

**含意（超重要）**: 「中庸」の絶対値は**指数の定義に強く依存**する。この指数系では **0 → 4 → 18** で「Low→Peak→崩壊」。つまり**ピークは軸の下寄り**（0と18の中点=9ではなく4）。**最適帯はスパンの3〜4割あたりに寄った非対称な山**。自前スコアでも「レンジ中央」ではなく「**やや低め寄り**」を初期ターゲットにする。

### 2-2. Matthews ら 2019 — 音楽経験と和声との交互作用
出典: Matthews TE, Witek MAG, Heggli OA, Penhune VB, Vuust P (2019). *The sensation of groove is affected by the interaction of rhythmic and harmonic complexity.* PLoS ONE 14(1): e0204539.
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0204539

- リズム複雑度は快・動きたさに対し**逆U**（原典を再現）。
- **和声複雑度との交互作用**: 中・低複雑度の和音は同程度。**高複雑度の和音はリズムの効果を減衰**（＝和声を盛りすぎるとリズムのノリが立たなくなる）。
- **音楽訓練の効果**: 訓練者ほど「シンコペ→動きたさ」の結合が強く、快も大きく、**逆Uがより顕著**。和声感度も高い。

**含意**: これは**層別配分**の実証根拠。**同時に全部盛ると飽和**する。リズムを効かせたい局面では和声（テンションの厚み）を抑える等、**予算の付け替え**が要る。

### 2-3. 「Sweet spot」総説 2022 — 最適点の移動
出典: Stupacher J, Matthews TE, Pando-Naude V, et al. (2022). *The sweet spot between predictability and surprise: musical groove in brain, body, and social interactions.* Front. Psychol. 13:906190.
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.906190/full

- 逆Uは複数研究で頑健。「予測可能性↔驚き」の均衡＝**中程度の複雑度が最強のグルーヴ**。
- **専門性で最適点が右（高複雑度側）へシフト**: 訓練者は高グルーヴ音で運動関連皮質の活動が大きく、逆Uがより顕著。**熟達で許容シンコペ帯が上方向に広がる**。

### 2-4. テンポ交互作用
出典: Etani T, Marui A, Kawase S, Keller PE (2018). *Optimal Tempo for Groove: Its Relation to Directions of Body Movement and Japanese nori.* Front. Psychol. 9:462.
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00462/full

- ドラムブレイクの**グルーヴ最適テンポ ≈ 100〜120 BPM**（身体運動＝歩行の自然テンポ2 Hz≒120 BPM と一致）。
- 「高シンコペは低・中シンコペより身体動員が下がる」を再確認（逆Uと整合）。

**含意**: **同じシンコペ指数でも体感ノリはテンポ依存**。100〜120 BPMは指数を高めに許容、そこから外れる（特に速い）ほど許容帯を**下げる**。テンポ補正を最適帯に掛ける。

### 2-5. 再現の限界（過信への歯止め）
- Sioros ら 2022「Patterns Matter」: **deadpan にランダム・シンコペを撒いても快は増えない**。むしろ量が増えると下がった（§3参照）。
- 参考: *Null effect of perceived drum pattern complexity on the experience of groove* (PLoS ONE 2024, e0311877) https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0311877 — 「知覚された複雑度」単独ではグルーヴを説明しないケース。**指数を採点の絶対軸にするのは危険**という補強。
- 参考: 4/4 など**一般的拍子ほどリズム複雑度がグルーヴを強く予測**（Nature Comm. Psychology 2025, s44271-025-00360-0）https://www.nature.com/articles/s44271-025-00360-0 — 変拍子では逆Uが弱まる＝**軸は拍子文脈込みで解釈**。

---

## 3. Sioros ら 2022「Patterns Matter」— 量より配置

出典: Sioros G, Miron M, Davies M, Gouyon F, Madison G (2022). *Syncopation and Groove in Polyphonic Music: Patterns Matter.* Music Perception 39(5): 503–531. https://doi.org/10.1525/mp.2022.39.5.503
関連: Witek ら *Syncopation affects free body-movement in musical groove* https://ora.ox.ac.uk/objects/uuid:b74266b2-0504-4162-ad68-746f90527ace

ファンク/ロック採譜（**ベース・ドラム・ギター/キー**の3楽器 MIDI）を素材に、原曲／シンコペ除去版／擬似ランダム付加版を比較。

- **除去するとグルーヴ低下**（シンコペは効いている＝必要）。
- **ランダム付加はグルーヴを増やさない**、むしろ量が増えると**低下**（＝量の単調増ではない）。
- **原曲のシンコペ分布の特徴**:
  - **ハイハットはほぼ無シンコペ**、キック/スネア → ベース → ギター/キー の順に**シンコペが増える**。
  - **バックビート（拍2・4のスネア）はほぼ据え置き**（10例中1回しか動かない）。
  - 原曲のシンコペは**長い十字リズム/メトリック・シフトのパターン**を作る（ファンク常套）。ランダム版は楽器間で一様にばらけるだけ＝**噛み合わない**。

**含意（層別配分の核心）**:
1. **時間軸のアンカーを残す**: ハット刻みとバックビートで**メーターの床**を張り、その上で他層をずらす。全層を同時に外すとメーターが消え、逆Uの右肩（崩壊）に落ちる。
2. **シンコペは楽器を跨いで"模様"を作る**: バラバラでなく、ベースと上物が**同じ counter-meter を共有**すると効く。
3. **配分の傾斜**: ハット≈0 < ドラム(キック/スネア)小 < **ベース中** < 上物/メロ 中〜やや高。

---

## 4. 指標の計算仕様 — LHLの密度スコア化と他指標比較

### 4-1. LHL の度数化（グリッド×メトリック重み）
出典（既知の原典）: Longuet-Higgins HC, Lee CS (1984). *The rhythmic interpretation of monophonic music.*
実装レビュー: Hoesl F, Senn O (2018). *Modelling perceived syncopation in popular music drum patterns.* Musicae Scientiae. https://journals.sagepub.com/doi/full/10.1177/2059204318791464

**手順**:
1. **グリッド**: 1小節を最小分解能（例 4/4 を16分＝16セル、必要なら32分）で離散化。
2. **メトリック重み** w(pos): 拍子の階層で各位置に重みを付与。4/4・16分の例（大きいほど強拍）:
   - 小節頭 =0、拍(4分)頭 =−1、8分裏 =−2、16分位置 =−3（Wは通常0を最強に、負で弱くする流儀。実装は自プロジェクトの既存符号に合わせる）。
3. **シンコペ検出**: **「onset（音）→ 次が休符/タイの継続、かつ後続位置の重みが前の onset より強い」**組を探す。
4. **1事象の重み**: `s = w(強い後続位置) − w(弱いonset位置)`（正値）。
5. **小節/曲スコア**: すべての事象の `s` を積算 → 総和。

**密度スコア化（セクション/曲単位で比較可能にする）**:
- `syncScore_raw = Σ s`（区間内総和）
- **正規化1（時間密度）**: `syncPerBar = Σ s / 小節数` … セクション長に非依存。**セクション比較の主指標**推奨。
- **正規化2（音符密度）**: `syncPerNote = Σ s / onset数` … 「刻みの細かさ」由来の水増しを排除。**音数の多い上物**を公平に測るのに有効。
- **層別**: 各楽器で別々に算出 → `syncPerBar[drums], [bass], [mel]`。**合算だけでなく層別ベクトルを持つ**（§3の配分制御に必須）。
- **ポリフォニック補正（Witek流）**: 楽器ごとに顕著性重み（低域/バックビートは高salience）を掛けてから積算すると体感に寄る。

### 4-2. 他指標との比較（どれを何に使うか）
出典: Gómez, Melvin, Rappaport, Toussaint (2005) *Mathematical Measures of Syncopation* https://research.cs.queensu.ca/home/daver/MyPDF/MeasureSycopa.pdf ／ Song, Simpson ら *An Experimental Comparison of Formal Measures of Rhythmic Syncopation* https://www.researchgate.net/publication/279235158

- **LHL**: メトリック階層の重みで計算。隣接階層の効果を**間接的**に取り込む。**多拍子階層を評価できる**のが強み。既に部分利用しており本命。
- **WNBD (Weighted Note-to-Beat Distance, Gómez 2005)**: onset から**拍レベルまでの距離**で測る。遅い階層を無視。**人間知覚との一致が比較的良い**という報告。**単純軸（拍からのズレ）で説明したい時の照合用**。
- **Off-beatness / TOB (Toussaint 2005)**: 拍子の約数で決まる「オンビート集合」外の onset 数。Keith 測度より知覚に近いとの報告。**計算が軽い**＝候補大量スクリーニングの粗フィルタ向き。
- **運用**: **主軸=LHL密度（層別）**、**副軸=WNBD or off-beatness を「second opinion」**として持ち、両者が乖離する候補（例: LHL高だがoff-beatness低）は「特殊な噛み合い」として**人間に見せる価値がある**とマークする。単一指標の過信を避ける（§2-5の Null効果への保険）。

---

## 5. ジャンル相場（定量が薄い領域・注意付き）

厳密な「ジャンル別シンコペ指数の平均表」は査読文献に乏しい（探索したが公開データセット横断の数値表は未発見）。定性〜半定量の相場のみ:
- **高シンコペ**: ファンク、EDM、ヒップホップ、ジャズ（グルーヴ系ジャンルはシンコペが署名的特徴）。Witek の素材が**ファンク**なのは「高帯までサンプルが取れる」ため。
- **中シンコペ**: ロック/ポップロック。アンティシペーション型（拍頭を8分先取り）が定型（*Anticipatory Syncopation in Rock: A Corpus Study* https://www.academia.edu/49827182）。
- **低シンコペ**: バラード、フォーク、賛美歌系（オンビート主体、メーターの床を強く張る）。

出典: 総説 Front. Psychol. 2022 906190（ジャンルとグルーヴの対応記述）、pop/rock 転写慣習 https://openmusictheory.github.io/syncopation.html

**含意**: **ジャンルは最適帯の"中心"を移動させるオフセット**として扱う（絶対値ではなく相対位置）。ファンク志向なら中心を上げ、バラード志向なら下げる。数値は自前コーパスの実測で**後日キャリブレーション**すべき（backlog候補: 手持ち素材のジャンル別 syncPerBar を測って相場表を作る）。

---

## 6. 仕様化 — 設計値に落とす

指標: `syncPerBar`（LHL密度・層別・0基準の正値スケール）を採用。**以下の帯は Sioros 2022 の「0→4→18で山が下寄り」という非対称性を写した相対値**。自前コーパス実測で必ずキャリブレーションする前提の初期値。

### 6-1. セクション役割別ターゲット帯（相対・0.0〜1.0 正規化 = そのジャンルの実用レンジ内での位置）

| セクション | 狙い | ターゲット帯(正規化) | 根拠 |
|---|---|---|---|
| **Intro / Verse** | 予測の床を張る・語りを立てる | **0.15–0.35**（低〜中低） | 低複雑度側。歌詞の可読性優先、後の対比の余白を残す |
| **Pre-chorus / Build** | 期待を溜める | **0.30–0.50**（中低→中） | Verseから漸増、Chorusへ受け渡す |
| **Chorus** | 快と身体動員の最大化 | **0.40–0.60**（**ピーク帯・やや下寄り**） | 逆Uの頂点。ただし山は非対称でレンジ中央より下 |
| **Bridge** | 新奇・逸脱 | **0.50–0.75**（中→高、崩壊の手前） | 一時的に上限へ寄せてよい。訓練者・熱心なリスナー向けに右シフト許容 |
| **Outro** | 解決/離脱 | **0.10–0.30**（低） | メーターへ回帰 |

補正ルール:
- **テンポ補正**: 100–120 BPM は帯を +0.05〜+0.10 許容。<80 or >140 BPM は −0.05〜−0.15 引き締め（§2-4）。
- **和声補正**: 同区間の和声テンションが高い時はリズム帯を **−0.10**（Matthews 2019 の減衰＝予算付け替え）。
- **ジャンル・オフセット**: ファンク系 +0.15 / ロック ±0 / バラード −0.15（中心移動、§5）。
- **経験者モード**（任意）: 最適点を右へ +0.05〜+0.10（§2-3）。

### 6-2. 候補リズムの「ノリ」並べ替えレンズ（審判にしない）
思想（機械は候補まで）に従い、**弾かず並べ替える**:
- 生成した候補群それぞれに `syncPerBar` を測り、**セクション目標帯からの距離**でソート（帯内を上位、外れは下位に沈めるが**消さない**）。
- **表示**: 各候補に「ノリ度メーター」（低い＝素直/中＝跳ねる/高い＝攻める、の3ゾーン背景）を添え、目標帯をハイライト。人間は帯外も選べる。
- **second opinion 表示**: LHL と WNBD/off-beatness が乖離した候補に「特殊な噛み合い」バッジ → 面白い外れ値として**むしろ拾わせる**（§4-2）。
- **並べ替えは可逆・非破壊**（既存の"ステージ相対レンズ無停止A/B"思想と同型）。採点で候補を殺さない。

### 6-3. メロ/ベース/ドラムの層別配分（全層同時高＝飽和を防ぐ）
Sioros 2022 の実測分布を規範化。**セクションの目標帯を"予算"として層に配る**:

| 層 | 既定の相対配分 | ルール |
|---|---|---|
| **ハイハット/刻み** | ≈ 0（ほぼ据える） | メーターの床。ここは動かさない（§3） |
| **バックビート(スネア2・4)** | ≈ 0（原則据え置き） | 崩すのは Bridge 等で意図的な時のみ |
| **キック** | 低〜中 | ゴーストや食いで軽く |
| **ベース** | **中**（配分の主役の一つ） | 上物と counter-meter を**共有**させる（バラバラ厳禁） |
| **メロ/上物** | 中〜やや高 | セクション帯の残り予算をここに寄せる |

飽和ガード（実装ルール）:
- **合算上限**: `Σ_layers syncPerBar` がセクション目標帯を超えたら、**ハット/バックビートから順に据え置き側へ差し戻し**、崩壊（右肩落ち）を防ぐ。
- **同時全層高を禁止**: 3層すべてが各自の高帯にある構成は候補から**降格**（ランダム一様＝噛み合わないの回避、§3）。
- **噛み合いボーナス**: ベースと上物のシンコペが**同一メトリック位置/counter-meter を共有**する候補は上位へ（"模様を作る"を評価）。
- **アンカー保証**: どのセクションでも「刻み or バックビートのどちらか」は必ず床として残す不変条件を持つ。

---

## 7. 設計含意まとめ（実装への持ち帰り）

1. **逆Uは一次原理として採用可**。ただし絶対値は指標依存。**相対（中庸が最良・山は下寄り非対称）**だけ持ち込む。
2. **量より配置**。`syncPerBar` は**層別ベクトル**で持ち、合算だけで判断しない。ランダム付加は快を生まない。
3. **指標は LHL密度を主軸、WNBD/off-beatness を second opinion**。乖離候補は"面白い外れ値"として人間に見せる。
4. **セクション帯＋テンポ/和声/ジャンル/経験の補正**で目標帯を動かす。§6-1の初期値は**自前コーパス実測でキャリブレ必須**（backlog化推奨）。
5. **飽和ガード**: ハット≈0・バックビート据え置き・ベース中・上物中〜高。全層同時高は降格。アンカー床を不変条件に。
6. **思想順守**: シンコペ指標は**採点で候補を殺す審判にしない**。目標帯ハイライト＋ノリメーターで**並べ替えるレンズ**に留め、仕上げは人間に返す。

### 未解決 / 後続タスク候補（backlog行き）
- 自前コーパスのジャンル別 `syncPerBar` 実測 → §5の相場表・§6の正規化レンジを実データで確定。
- 層別 counter-meter「共有」検出のアルゴリズム具体化（噛み合いボーナスの実装仕様）。
- テンポ補正カーブの実測較正（100–120帯の許容量を耳で確認）。

---

## 出典一覧（URL）
- Witek et al. 2014, PLoS ONE 9(4):e94446 — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0094446 ／ https://pubmed.ncbi.nlm.nih.gov/24740381/
- Stupacher, Wrede, Vuust 2022（簡潔刺激セット）, PLoS ONE 17(5):e0266902 — https://pmc.ncbi.nlm.nih.gov/articles/PMC9119456/ ／ https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0266902
- Matthews et al. 2019, PLoS ONE 14(1):e0204539 — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0204539
- Stupacher, Matthews et al. 2022（総説 sweet spot）, Front. Psychol. 13:906190 — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.906190/full
- Etani et al. 2018（最適テンポ）, Front. Psychol. 9:462 — https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.00462/full
- Sioros et al. 2022（Patterns Matter）, Music Perception 39(5):503–531 — https://doi.org/10.1525/mp.2022.39.5.503 ／ https://ora.ox.ac.uk/objects/uuid:b74266b2-0504-4162-ad68-746f90527ace
- Null effect of perceived drum pattern complexity 2024, PLoS ONE e0311877 — https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0311877
- 4/4 and more（common meters）2025, Comm. Psychology s44271-025-00360-0 — https://www.nature.com/articles/s44271-025-00360-0
- Hoesl & Senn 2018（ドラムのシンコペ知覚モデル）— https://journals.sagepub.com/doi/full/10.1177/2059204318791464
- Gómez et al. 2005（数理シンコペ測度 / WNBD）— https://research.cs.queensu.ca/home/daver/MyPDF/MeasureSycopa.pdf
- 形式的シンコペ測度の実験比較 — https://www.researchgate.net/publication/279235158
- Anticipatory Syncopation in Rock: A Corpus Study — https://www.academia.edu/49827182
- pop/rock シンコペ転写慣習 — https://openmusictheory.github.io/syncopation.html
