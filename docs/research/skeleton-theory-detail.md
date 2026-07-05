# 骨格旋律と装飾の理論：細部リファレンス

作成: 2026-06-27 ／ 種別: **構造化リファレンス（網羅リスト・生成モデル設計用）**

目的＝「**構造音(structural melody)の選び方**」と「**その間を埋める/動かす装飾(elaboration)の語彙**」を、生成モデルに落とせる粒度で網羅する。概観は姉妹文書 [`skeleton-melody-musicology.md`](./skeleton-melody-musicology.md) にある。本書は **規則・語彙の一覧表**（概観の作文でなく、辞書）。

各表の列＝**①規則/技法名（原語併記）／②定義（簡潔）／③生成への含意（どの構造音をどう動かす/埋めるか）**。

---

## 1. Schenker：プロロンゲーション語彙（構造音の選定＋装飾技法）

骨格＝**Ursatz（基本構造）**＝ Urlinie(順次下降の上声) ＋ Bassbrechung(I–V–I の低音アルペジオ)。装飾(prolongation)はこの背景を前景へ展開する操作。**「どの構造音を結ぶか」「どう埋めるか」**で技法が分類される。

### 1-A. 背景構造（＝骨格そのもの・構造音の枠）

| ①技法/概念 | ②定義 | ③生成への含意 |
|---|---|---|
| **Ursatz（基本構造）** | Urlinie ＋ Bassbrechung の対位法的結合＝曲全体の最深層 | 曲の骨格の最上位枠。上声=順次下降線、低音=I–V–I を必ず置く |
| **Urlinie（基本旋律線）** | 三和音の音(3̂/5̂/8̂)から 1̂ への**順次下降**。基本線に跳躍は無い | 骨格の上声は「跳ばずに step で 1̂ へ降りる線」。アルペジオでなく順次連結 |
| **Kopfton（頭音）** | Urlinie の最初の音。必ず主和音の構成音(3̂/5̂/8̂) | 骨格線の開始ピッチ＝この3択。線の長さ(3/5/8線)を決める |
| **Bassbrechung（低音分散）** | I–V–I の低音アルペジオ＝Urlinie を支える和声基盤 | 骨格の和声枠。構造音は基本この上で協和 |
| **Stufe（音度）** | 複数の三和音を1つの和声機能としてまとめる抽象単位 | 構造音の和声的拠り所＝局所コードでなく機能で見る |

### 1-B. Urlinie の3形と各制約

| ①線の形 | ②定義 | ③生成への含意 |
|---|---|---|
| **3線（3̂–2̂–1̂）** | Kopfton=3度から下降。最短・最頻 | 短い骨格(2〜4小節)の既定。3̂→2̂(V上)→1̂ の3点を骨格に置く |
| **5線（5̂–4̂–3̂–2̂–1̂）** | Kopfton=5度。中央で 3̂ を経由 | 中規模。頂点が高め＝アーチを作りやすい。2̂ は V 上に揃える |
| **8線（8̂–7̂–6̂–5̂–4̂–3̂–2̂–1̂）** | Kopfton=8度（オクターブ）。最長・稀 | 大規模のみ。全音階下降＝強い終止志向 |
| 共通制約 | 2̂ は支配機能(V)上、1̂ は主機能(I)上に着地。順次下降を崩さない | 骨格の終止＝必ず 2̂(V)→1̂(I)。これが終止感の源 |

### 1-C. 装飾技法（構造音“間”を埋める／声部を動かす）

| ①技法（原語） | ②定義（どの構造音間を・どう） | ③生成への含意 |
|---|---|---|
| **Zug / Linear progression（線的進行）** | 2つの和声音の間を**一方向の順次**で埋める（Terzzug=3度幅, etc.） | 構造音Aから構造音Bへ step で直線的に繋ぐ＝骨格肉付けの主力 |
| **Passing tone（経過音 / Durchgang）** | 2つの和声音の間を step で通過（戻らない）。非和声・弱位置 | 構造音間の隙間を1音で埋める最小装飾。順次で入り順次で抜ける |
| **Neighbor, complete（完全刺繍 / Nebennote）** | 1つの和声音を step 上/下に離れ**同じ音へ戻る**（X–N–X） | 構造音を1つだけ持つ装飾（保留＝ピッチ不変の彩り） |
| **Neighbor, incomplete（不完全刺繍）** | 戻りが無い刺繍（片側のみ）＝アポジャトゥーラ的に滑り込む/抜ける | 強拍の非和声→解決の「滑り込み」表情。骨格音に step で寄せる |
| **Arpeggiation / Brechung（分散）** | 和音構成音を旋律として継起＝和声を水平展開（協和保ったまま） | 構造音を跳躍で繋ぐ層。**ただし上声骨格(Urlinie)は順次優先**＝多用注意 |
| **Register transfer（音域転換 / Höher-・Tieferlegung）** | 声部をオクターブ上/下へ移す（機能は保持） | 骨格線が音域を跳ぶ表現。同一構造音の8va移動として扱う |
| **Coupling（連結 / Koppelung）** | オクターブ隔てた2音域を結合（音域転換の結果、両域が独立に進む） | 高/低2レジスタを並走させる骨格＝メロの「上下2層」 |
| **Unfolding（展開 / Ausfaltung）** | 単一声部が2つの線(上声と内声)を往復＝複合旋律。和音を水平に展開 | 1本のメロに内声を織り込む。骨格を「2声の折りたたみ」として埋める |
| **Reaching over（被せ / Übergreifen）** | 内声(下降音)を上声の**上**に被せ、見かけ上昇を作る（音域転換併用） | 上行する旋律線を「上から音を継ぎ足す」で構成＝上昇骨格の作り方 |
| **Initial ascent（初期上昇 / Anstieg）** | 下降開始前に Kopfton まで**上行**で到達する導入 | 骨格の前奏部＝1̂/3̂から Kopfton へ step 上行してから下降に入る |
| **Interruption（中断 / Unterbrechung）** | Urlinie が 2̂ で一旦止まり(半終止)、Kopfton へ戻ってやり直し、改めて 1̂ へ完全下降 | period の「問い(2̂で開)→答え(1̂で閉)」の構造そのもの。骨格を2分割 |
| **Motion from/to inner voice（内声からの/への運動）** | 内声音と上声音の間を結ぶ（内声音を上声へ繰り上げ、or 上声を内声へ降ろす） | 構造音を内声起点/着地で結ぶ＝声部間の橋渡し装飾 |
| **Mixture（混合 / Mischung）** | 同主調の長/短を交換（借用） | 構造音/和声に陰影。骨格度数は保ち音質だけ変える |
| **Substitution（代理）** | 期待される構造音を別の音で代理 | 構造音の意図的なずらし（例外的彩り） |
| **Diminution（細分 / Verminderung）** | 長い音価の構造音を短い音群へ分割（意味は保持） | 骨格→前景の「肉付け」操作の総称。装飾を時間的に詰める |

**Schenker 出典**:
- [Glossary of Schenkerian analysis (Wikipedia)](https://en.wikipedia.org/wiki/Glossary_of_Schenkerian_analysis)
- [Linear progression (Wikipedia)](https://en.wikipedia.org/wiki/Linear_progression)
- [Unfolding (music) (Wikipedia)](https://en.wikipedia.org/wiki/Unfolding_(music))
- [Register transfer (SchenkerGUIDE)](http://www.schenkerguide.com/registertransfer.html)
- [Tom Pankhurst's Schenkerian Glossary](https://www.schenkerguide.com/glossarytest.php)
- [Schenkerian analysis (Wikipedia)](https://en.wikipedia.org/wiki/Schenkerian_analysis)

---

## 2. Narmour：含意実現モデル（I-R）— 全アーキタイプ

2軸で旋律の3音連鎖を分類：**(a) registral direction（方向）＝継続(同方向)/反転(逆方向)**、**(b) intervallic motion（音程サイズ）＝類似(同程度)/差異(変化)**。

**閾値ルール（最重要）**：
- **小音程（≦完全4度, P4以下）→ 継続を含意（Process系）**：似たサイズで同方向が続くと期待。
- **大音程（≧完全5度, P5以上）→ 反転を含意（Reversal系）**：方向が変わり小音程へ縮むと期待。
- **三全音（tritone）＝境界・文脈依存**（小/大どちらにも数えうる）。

### 2-A. 主要3アーキタイプ

| ①記号 | ②定義（方向／音程サイズ） | ③生成への含意 |
|---|---|---|
| **P（Process／過程）** | 同方向 ＋ 類似サイズ（小→小 or 大→大）＝含意が実現 | 小さく動いたら同方向に小さく続ける＝順次の連鎖。骨格肉付けの既定 |
| **D（Duplication／反復）** | 同方向(lateral) ＋ **同一**音程＝同じ音の反復(3音以上)も含む | 音/音程の反復＝モチーフ反復。停滞・強調に使う |
| **R（Reversal／反転）** | 逆方向 ＋ 差異サイズ（大→小）＝大跳躍後に逆へ小さく戻る | **post-skip reversal / gap-fill**。大跳躍の直後は逆向き step で回復 |

### 2-B. 派生アーキタイプ（含意が部分実現/部分否定）

| ①記号 | ②定義（前音程→後音程／方向） | ③生成への含意 |
|---|---|---|
| **IP（Intervallic Process／音程的過程）** | 小→類似の小、**方向は反転** | 小さく動いて折り返す＝局所のジグザグ。順次内の向き替え |
| **VP（Registral/Vector Process）** | 小→**大**、方向は同じ | 小から大へ加速しつつ同方向＝盛り上げ・跳躍への助走 |
| **IR（Intervallic Reversal／音程的反転）** | 大→小、**方向は同じ** | 大跳躍後、同方向のまま小さく＝部分的回復（完全反転でない） |
| **VR（Registral/Vector Reversal）** | 大→**さらに大**、方向は反転 | 大跳躍を逆向きの更に大跳躍で＝劇的・不安定。多用しない |
| **ID（Intervallic Duplication）** | 小→**同一**の小、方向は反転 | 同サイズで折り返す反復＝刺繍的ジグザグ |

### 2-C. 不完全形

| ①記号 | ②定義 | ③生成への含意 |
|---|---|---|
| **Monad（単項）** | 1音のみ＝含意を生まない | 孤立音（曲頭/休符後）。期待を起こさない |
| **Dyad（二項）** | 2音＝含意はあるが実現が無い | 句末の宙吊り。次を待たせる（open 終止的） |

**派生は「prospective（順向）/retrospective（逆向）」の2次元**を持ちうる（聴後に再解釈）。

**Narmour 出典**:
- [Implication-Realization (Wikipedia)](https://en.wikipedia.org/wiki/Implication-Realization)
- [The Implication-Realization Model — Eugene Narmour](https://web.sas.upenn.edu/enarmour/the-implication-realization-model/)
- [Royal, Review of Narmour (MTO 1.6)](https://mtosmt.org/issues/mto.95.1.6/mto.95.1.6.royal.html)
- 閾値(小=≦P4/大=≧P5/三全音=境界): [Royal review](https://mtosmt.org/issues/mto.95.1.6/mto.95.1.6.royal.html)

---

## 3. Fux / 種対位法：装飾の層（骨格→肉付けの段階そのもの）

cantus firmus（CF）＝最も骨格的な「良い旋律線」の規則集。各 species が CF に**段階的に装飾を足す**＝「骨格→肉付け」の教科書的モデル。

### 3-A. Cantus Firmus（CF）の完全旋律規則（＝骨格線の規則）

| ①規則 | ②定義 | ③生成への含意 |
|---|---|---|
| 長さ | おおむね 8〜16 音、全音符 | 骨格線の長さ目安 |
| 開始/終止 | 主音で始まり主音で終わる | 骨格は tonic 枠で閉じる |
| 順次主体 | 大半を**順次(step)**で動く。跳躍は時々 | 構造線は step 優先（Schenker の melodic fluency と一致） |
| 単一クライマックス | 最高音は**1つだけ**（最高音を反復しない）＝頂点 | アーチ構造。骨格に頂点を1つ課す |
| 跳躍の回復(leap recovery) | 跳躍直後は**逆向きの step**で埋め戻す | gap-fill。大跳躍の後は逆行で回復（Narmour R と一致） |
| 連続跳躍 | 同方向の跳躍2連続を避ける／同方向の動きは4音まで | 跳躍を散らす。直線的暴走を防ぐ |
| 許容旋律音程 | 長短2度・長短3度・完全4度・完全5度・短6度(上行のみ)・完全8度 | 骨格跳躍はこの集合に限定 |
| 禁則音程 | **三全音・短7度・長7度・8度超の跳躍**、増/減/半音階音程 | これらの骨格跳躍を禁止 |
| 三全音の輪郭禁止 | 三全音/7度を**音の連なりで輪郭づける**のも避ける | 局所だけでなく数音スパンの輪郭も監視 |
| 音域 | 概ねオクターブ内 | 骨格レンジの上限 |
| 反復禁止 | 音群の反復・機械的シーケンスを避ける | 骨格の単調反復を避ける |
| 導音処理 | 7̂(導音)は 1̂ へ解決 | 終止周辺の声部進行 |

### 3-B. 各 species が足す装飾（＝肉付けの段階）

| ①種(species) | ②比率 / 足す装飾 | ③不協和の扱い（どこで・どう） | ③'生成への含意 |
|---|---|---|---|
| **1種** | 1:1。**協和音のみ**（対音を骨格に当てる） | 不協和なし。全て協和 | 骨格＋対声部＝構造音の確定。装飾ゼロの土台 |
| **2種** | 2:1。**経過音**を導入 | 強拍(downbeat)は必ず協和。弱拍(upbeat)は協和 or **不協和なら前後を step で**＝経過音/刺繍 | 構造音間に弱拍 passing/neighbor を1つ挿す |
| **3種** | 4:1。4分音符の**経過・刺繍**、cambiata/二重刺繍 | 弱位置で step 経由なら不協和可。cambiata（changing note）で跳躍を挟む定型 | 構造音間を4音の順次/刺繍で密に埋める |
| **4種** | 掛留(syncopation/suspension)。タイで強拍に持ち越し | **強拍に不協和**(掛留)を許し、**下行 step で解決**。弱拍は協和 | 強拍の非和声→下行解決＝サスペンションの表情（滑り込み） |
| **5種** | 華麗(florid)。1〜4種＋掛留を**混合** | 各層の規則を文脈で混用 | 全装飾語彙を句機能で配分＝最終的な肉付け |

**段階の含意**：1種=構造音、2種=経過、3種=経過/刺繍の密度、4種=掛留(強拍非和声→下行解決)、5種=混合。**我々の3層（骨格/制約/変奏）の「制約層＝2-4種の装飾規則」「変奏層＝5種の配分」に対応**。

**Fux 出典**:
- [The rules of counterpoint: CF through 5th species (Global Music Theory)](https://globalmusictheory.com/the-rules-of-counterpoint-cantus-firmus-through-5th-species/)
- [First-Species Counterpoint (Open Music Theory)](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/)
- [Species Counterpoint in Two Voices (Wikibooks)](https://en.wikibooks.org/wiki/Music_Theory/Counterpoint/Species_Counterpoint/In_Two_Voices)
- [Fuxian First Species Counterpoint (Strasheela)](https://strasheela.sourceforge.net/strasheela/doc/Example-FuxianFirstSpeciesCounterpoint.html)

---

## 4. GTTM：head 選好規則（どの音を構造 head に選ぶか）

time-span reduction＝各時間幅で**最重要音(head)を1つ選ぶ**階層木。選好規則(TSRPR)が「どの音を構造音にするか」を決める。prolongational reduction が tension/relaxation の木を与える。

### 4-A. Time-Span Reduction Preference Rules（TSRPR）＝head 選定規則

| ①規則 | ②定義（どの音を head に） | ③生成への含意 |
|---|---|---|
| **TSRPR1 metrical position** | より**強い拍位置**の音を head に | 強拍の音を構造音に選ぶ（拍頭優先） |
| **TSRPR2 local harmony** | (a)相対的に**協和**で、(b)局所トニックに**近い**音を head に | コードトーン・トニック近接を構造音に |
| **TSRPR3 registral extremes** | (弱く) **高い旋律音/低い低音**を head に | 音域の極（頂点/最低音）を構造音に＝アーチの頂点 |
| **TSRPR4 parallelism** | モチーフ/リズムが**並行**な時間幅は head も**並行に** | 反復句は同じ位置の音を構造音に＝自己相似を保つ |
| **TSRPR5 metrical stability** | より安定な**拍構造**を生む head を | 構造選択と拍構造を整合させる |
| **TSRPR6 prolongational stability** | より安定な**プロロンゲーション**を生む head を | 緊張/弛緩木が自然になる選択 |
| **TSRPR7 cadential retention** | **カデンツ**の音を保持（特別扱い） | 終止音(2̂/1̂)を必ず構造音に残す |
| **TSRPR8 structural beginning** | 群の**冒頭**に近い音を head に（冒頭機能） | 句頭の音を構造音に |
| **TSRPR9 structural ending > beginning** | 曲全体では**終止**を冒頭より優先 | 最終的な拠り所は終止音 |

### 4-B. Prolongational Reduction Preference Rules（PRPR）＝緊張/弛緩

| ①規則/概念 | ②定義 | ③生成への含意 |
|---|---|---|
| **PRPR1 time-span importance** | time-span で重要な音を prolongation でも重要に | 2つの還元を整合（骨格の一貫性） |
| **PRPR3 prolongational connection** | 最も**安定な接続**を作る音を選ぶ | 構造音間を「弛緩へ向かう」自然な連結に |
| **PRPR5 parallelism** | 並行箇所は並行に解析 | 反復構造の緊張曲線も揃える |
| **PRPR6 normative structure** | カデンツ群は「開始→緊張→解決」の規範形を持つ | 句に標準的な緊張アーチを課す |
| **tension / relaxation** | 構造点から**離れる=緊張(tensing)**、構造点へ**向かう=弛緩(relaxing)** | 句中で緊張を高め句末で解決＝呼吸 |
| **strong / weak prolongation, progression** | 同一和音の保持=strong、変化を伴う保持=weak、進行=progression | 構造音間の関係3型＝肉付けの種別 |

**GTTM 出典**:
- [Generative theory of tonal music (Wikipedia)](https://en.wikipedia.org/wiki/Generative_theory_of_tonal_music)
- [Melody Expectation Method based on GTTM (ISMIR 2008)](https://archives.ismir.net/ismir2008/paper/000142.pdf)
- [Distance in Pitch-Sensitive Time-span Tree (ICMC-SMC 2014)](https://www.fun.ac.jp/~hirata/Papers/ICMCSMC2014-matsubara.pdf)

---

## 5. 生成モデルに効きそうな具体規則 top10（抽出）

骨格生成 (`genSkeleton`) ＋ 制約/変奏層 (`genContour`) への直接適用候補。

1. **骨格上声＝順次下降線(Urlinie)**：構造音をアルペジオで跳ぶのでなく、Kopfton(3̂/5̂/8̂)から 1̂ へ **step で繋ぐ**。3線が既定、長尺で5線。[Schenker]
2. **終止＝2̂(V上)→1̂(I上)の順次着地**：open は 2̂/5̂ で留め、close は 1̂ へ降ろす。終止感を構造から出す。[Schenker/GTTM TSRPR7,9]
3. **単一クライマックス(アーチ)を骨格に課す**：最高音は曲(句)で1つだけ、反復しない。頂点後は下降して 1̂ へ。[Fux/GTTM TSRPR3]
4. **跳躍後は逆向き step で回復(gap-fill / post-skip reversal)**：大跳躍(≧P5)の直後は反転して小さく埋める＝Narmour R。[Narmour/Fux]
5. **小音程→同方向継続(Process)、大音程→反転(Reversal)の閾値=P4/P5**：contour マルコフの遷移をこの閾値でバイアス。三全音は境界扱い。[Narmour]
6. **構造音=強拍×協和×トニック近接**：head 選定を「強拍位置 ∧ コードトーン ∧ 局所トニックに近い」で行う。[GTTM TSRPR1,2]
7. **禁則跳躍を骨格で排除**：三全音・短7/長7・8度超を構造音間の跳躍から除外。数音スパンの輪郭でも三全音/7度を避ける。[Fux]
8. **interruption で period を2分割**：4小節句を「前半=2̂で半終止(open) / 後半=1̂で完全終止(close)」に割る＝問い/答え。[Schenker Unterbrechung/GTTM PRPR6]
9. **装飾を species 段階で層化**：2種=弱拍 passing/neighbor、4種=強拍掛留(非和声→下行 step 解決＝滑り込み表情)、5種=句機能で混合配分。[Fux]
10. **反復句は構造音も並行に(parallelism)**：A-A や consequent は head 位置を揃え、自己相似を保つ。変奏は位置駆動で(consequent=模続,句末=拡大/断片化)。[GTTM TSRPR4/PRPR5]

---

## 出典（総覧）
- Schenker: [Glossary](https://en.wikipedia.org/wiki/Glossary_of_Schenkerian_analysis) / [Linear progression](https://en.wikipedia.org/wiki/Linear_progression) / [Unfolding](https://en.wikipedia.org/wiki/Unfolding_(music)) / [Register transfer (SchenkerGUIDE)](http://www.schenkerguide.com/registertransfer.html) / [Schenkerian analysis](https://en.wikipedia.org/wiki/Schenkerian_analysis) / [Fundamental structure](https://en.wikipedia.org/wiki/Fundamental_structure)
- Narmour I-R: [Wikipedia](https://en.wikipedia.org/wiki/Implication-Realization) / [Narmour 公式](https://web.sas.upenn.edu/enarmour/the-implication-realization-model/) / [Royal review (MTO)](https://mtosmt.org/issues/mto.95.1.6/mto.95.1.6.royal.html)
- Fux 種対位法: [Global Music Theory](https://globalmusictheory.com/the-rules-of-counterpoint-cantus-firmus-through-5th-species/) / [Open Music Theory](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/) / [Wikibooks](https://en.wikibooks.org/wiki/Music_Theory/Counterpoint/Species_Counterpoint/In_Two_Voices)
- GTTM: [Wikipedia](https://en.wikipedia.org/wiki/Generative_theory_of_tonal_music) / [ISMIR 2008 melody expectation](https://archives.ismir.net/ismir2008/paper/000142.pdf) / [ICMC-SMC 2014 time-span tree](https://www.fun.ac.jp/~hirata/Papers/ICMCSMC2014-matsubara.pdf)
</content>
</invoke>
