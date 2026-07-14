# フレーズ輪郭の類型辞書（Contour Template Dictionary）

- 日付: 2026-07-14
- 種別: research（計算音楽学 / 旋律輪郭）
- 任務ID: M4
- 目的: 骨格層（度数の構造線）を「輪郭の型」でバイアス生成するための**類型辞書**を定義する。
- スコープ外（既知・再調査不要）: 輪郭の**測り方**（cosine contour・輪郭図形の計測）は調査済み。今回は**類型（型の在庫と使い分け）**が的。

---

## 0. 要旨（3行）

- フレーズ輪郭は Huron の3点還元（開始 I・中間平均 M・終止 F）で**9類型**に整理でき、実データでは **凸（arch, I<M>F）が最頻**、次いで下行・上行・凹の4型でほぼ全体を占める（残り5型は各 ≤1.2%）。
- 位置で使い分けが出る: **曲頭/句頭=上行や凸で開く**・**句末/セクション末=下行で閉じる**（終止＝音高低下）。感情は **上行=高揚/覚醒、下行=沈静/解決**が実証寄り。
- 辞書は「型ID × パラメタ（頂点位置・終止相対音高・振幅）× 頻度 × 適用文脈（セクション役割）」＋生成ノブ（contour指定で骨格DPをバイアス）で持つ。度数列サンプルを型別に2本ずつ添付。

---

## 1. Huron のフレーズ輪郭9類型（型の在庫）

### 1.1 分類原理
Huron (1996/2006) は各フレーズを **3点に還元**する：
- **I** = フレーズ最初の音
- **M** = 中間音すべての平均音高
- **F** = フレーズ最後の音

I・M・F の大小関係（>, <, =）の組み合わせで **9類型**に分類する。=（水平）判定には**許容幅ε（トレランス）**が要る（下記1.4の批判点）。

### 1.2 9類型の定義（I–M–F の関係）

| # | 型ID(英) | 型ID(和) | I–M–F | 形 |
|---|---|---|---|---|
| 1 | `convex` | 凸（アーチ/山） | I < M > F | 上って下る（∩） |
| 2 | `concave` | 凹（谷/V） | I > M < F | 下って上る（∪） |
| 3 | `ascending` | 上行 | I < M < F | 右肩上がり |
| 4 | `descending` | 下行 | I > M > F | 右肩下がり |
| 5 | `horizontal-ascending` | 水平→上行 | I = M < F | 平ら後に上げ |
| 6 | `horizontal-descending` | 水平→下行 | I = M > F | 平ら後に下げ |
| 7 | `ascending-horizontal` | 上行→水平 | I < M = F | 上げ後に平ら |
| 8 | `descending-horizontal` | 下行→水平 | I > M = F | 下げ後に平ら |
| 9 | `horizontal` | 水平 | I = M = F | 平坦 |

出典: [The arxiv review of Huron typology (2026)](https://arxiv.org/html/2604.13119v1) が9類型の I/M/F 関係を明示。原典は D. Huron, "The melodic arch in Western folksongs," *Music Perception* 14(1), 1996, 及び *Sweet Anticipation* (2006)。 [The Melodic Arch in Western Folksongs (ResearchGate)](https://www.researchgate.net/publication/239063783_The_Melodic_Arch_in_Western_Folksongs)

### 1.3 出現頻度（民謡=Essen コーパス）

Huron (1996) は **Essen Folksong Collection**（欧州中心・6000曲超、句・拍・休符注釈付き）で検証。

- **主要4型（凸・下行・上行・凹）が支配的**。残り5型（水平系）は**各 ≤1.2%**で稀。
- Huron の主張は「**凸（arch）が過剰に多い**＝西洋フレーズはアーチ優勢」。原論文の序列では **凸 > 下行 > 上行 > 凹**（許容幅設定に依存）。
- 追試（35,793句・Essen 再解析、arxiv レビュー内）の4型分布例:

| 型 | 句数 | 割合 |
|---|---|---|
| 凸 convex | 10,233 | 28.6% |
| 下行 descending | 9,714 | 27.1% |
| 上行 ascending | 8,012 | 22.4% |
| 凹 concave | 7,834 | 21.9% |

出典: [Melodic contour does not cluster (arxiv 2026)](https://arxiv.org/html/2604.13119v1) / [Cosine contours, Cornelissen ISMIR2021](https://archives.ismir.net/ismir2021/paper/000016.pdf)（Essen 概説）

### 1.4 重要な但し書き（辞書設計への警告）
- **「4つに固まる」は人工物の疑い**: 上記 arxiv 論文は「Huron の**非公開トレランスε**のせいで4型に凝集して見えるだけで、実データの輪郭は**連続的で明確なクラスタを作らない**」と批判。ε≈1.4半音ならもっと連続分布になる、と。
- **設計含意**: 型は**離散カテゴリ**ではなく**連続空間の代表点（プロトタイプ）**として扱え。生成では「型に完全一致」を目標にせず「型へ寄せるバイアス（引力）」にする。cosine contour（既知）で連続量として測り、型は人間向けラベル/初期値として使う。
- 参考: Adams (1976) の輪郭類型は境界4点（初・終・最高・最低）の順序で **15型**を演繹（より細かい・別系統）。 [Adams Melodic Contour Typology](https://kupdf.net/download/adams-melodic-contour-typology_59ed725a08bbc5702aeb8c39_pdf)

---

## 2. 句の位置別の輪郭使い分け（実証）

| 位置 | 傾向 | 根拠/機序 |
|---|---|---|
| 曲頭・句頭 | **上行 or 凸で開く**（上向きの inflection＝継続の含意） | 上向き線は「続く」を示唆。アーチは前半で頂点へ上げる。 |
| 句中央〜2/3 | **頂点（クライマックス）**を置く | アーチの頂点は句の中央〜2/3地点に来るのが一般的。 |
| 句末 | **下行で閉じる**（終止＝音高低下） | 句末の下向き＝解決/落ち着き。周期（antecedent/consequent）でも consequent 末は下降で終止。 |
| セクション末（特に最終句） | **明確な下行で終止**（主音回帰） | 「最終句の下向き＝答え/閉じ」。前句の上向き含みと対比。 |

- アーチ優勢の本質＝「フレーズは**上げてから下げて閉じる**」。Huron の arch はこの位置依存を句スケールで畳んだもの。
- 出典: [Music Theory Authority — Contour & Phrase Structure](https://musictheoryauthority.com/melodic-contour-phrase-structure) / [Fiveable — Melodic Contour & Structure](https://fiveable.me/music-theory-and-composition/unit-7/melodic-contour-structure/study-guide/a3zftW43ZKLRhlQt) / [W.W.Norton — The Structure of Melody](https://nerd.wwnorton.com/ebooks/epub/enjmusic4ess/EPUB/content/1.2.1-chapter01.xhtml)

**設計含意**: 型の選択は**セクション役割 × 句の位置**でデフォルトを持て（例: verse 句頭=凸/上行、句末=下行；chorus 冒頭句=上行で突き上げ、最終句=下行で締め）。

---

## 3. 輪郭と歌詞・感情の対応（実証寄り）

| 方向 | 感情/覚醒 | 根拠 |
|---|---|---|
| 上行（rising） | 緊張・期待・興奮の高まり、**高覚醒**、ポジティブ寄り価数 | 音声の高覚醒（怒り・恐れ・喜び）は上向き輪郭・高F0と相関。上行=「happiness」に対応する分類実験あり。 |
| 下行（falling） | 弛緩・解決・メランコリー、沈静 | 下行=「sadness」対応。句末下降＝落ち着き。 |
| 高音高（register） | 明るさ・喜び・高揚 | 高ピッチ=brightness/joy、低ピッチ=depth/melancholy。 |

- 注意: 音楽の感情は「基本感情」より**アフェクト（覚醒×価数）**として説明する方が頑健、という立場（構成主義）。**輪郭方向は主に「覚醒/緊張の増減」を担い、価数は調性・和声・歌詞と共同で決まる**と捉えるのが安全。
- 歌詞連動: 上行で「上げる/昇る/夢/空」等の上方・高揚語、下行で「落ちる/沈む/終わり」等に音画（word painting）を当てる古典技法。実証は個別的だが、上記の方向×覚醒の一般則と整合。
- 出典: [Music & felt emotions — pitch level & arousal (soundQuality.org)](https://soundquality.org/2021/03/music-and-felt-emotions-how-systematic-pitch-level-variations-affect-the-experience-of-pleasantness-and-arousal/) / [Music Communicates Affects, Not Basic Emotions (PMC5836201)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5836201/) / [Expectancy and musical emotion (arxiv 1708.03687)](https://arxiv.org/pdf/1708.03687)

**設計含意**: contour ノブは「感情スライダ」の代理になり得る。ただし単独で価数を決めない。上行＝高揚、下行＝沈静を**覚醒軸のバイアス**として露出し、価数は key/mode/歌詞と結線（memory: modeは生成の層をまたいで結線、と整合）。

---

## 4. J-pop / ボカロの輪郭傾向（分析記事ベース）

厳密な計量コーパス研究は乏しいが（要注意=一次統計は弱い）、実務・分析記事から次の傾向：

- **サビ（chorus）＝上行で突き上げ＋最高音を配置**: pre-chorus で上昇コードで緊張を溜め、サビ頭で「爆発」。サビは verse と**跳躍（disjunct motion）**で差別化、明るい高音を張る。→ サビ冒頭句は **上行/凸で高頂点**、全曲の**音域ピークはサビ**に来やすい。
- **ボカロ系（denpa 含む）＝広音域・大跳躍・速い音符**: hook-first の短い catchy モチーフ、順次進行を跳躍と装飾で punctuate、クライマックスで転調。歌唱生理の制約が薄いぶん**輪郭の振幅（range）と跳躍が大きい**＝人間歌唱より凸/凹の起伏が急。
- J-pop メロは「明快で歌える輪郭・戦略的跳躍・日本語プロソディに合う音節配置」。→ **句内は順次中心、句境界や見せ場で跳躍**。
- 出典: [How to Write J-Pop Songs (Lyric Assistant)](https://lyricassistant.com/how-to-write-j-pop-songs/) / [Melodigging — Vocaloid genre](https://www.melodigging.com/genre/vocaloid) / [Melodigging — J-Pop genre](https://www.melodigging.com/genre/j-pop) / [Bandcamp Daily — Japan Vocaloid scene](https://daily.bandcamp.com/lists/japan-vocaloid-scene-report)

**設計含意**: セクション役割デフォルトを J-pop 寄りに調整。verse=控えめ振幅の凸/水平寄り、pre=上行で緊張、chorus=大振幅の上行/凸＋音域ピーク、ボカロプリセットは range と leap 上限を引き上げる。

---

## 5. 辞書仕様（Contour Template Dictionary）

### 5.1 型スキーマ（1エントリ）

```jsonc
{
  "id": "convex",                 // 型ID（1章の英名）
  "label_ja": "凸(アーチ)",
  "imf": "I<M>F",                 // Huron の3点関係（人間向けラベル）
  "params": {
    "peak_pos": 0.6,             // 頂点の相対位置(句頭0.0〜句末1.0)。凸/凹で有効
    "start_deg": 1,              // 開始の相対音高(度数, スケール度 or 中心からの相対)
    "end_deg": 1,                // 終止の相対音高(度数)。句末=1(主音)で閉じ、5等で開き
    "amplitude": 5,             // 振幅(頂点-谷の度数差の目安)。J-pop chorus>verse
    "leap_budget": "low|mid|high" // 跳躍許容(ボカロ=high)
  },
  "freq_prior": 0.286,          // コーパス事前確率(§1.3, 民謡値。用途で上書き)
  "context": {                   // 適用文脈(セクション役割×位置)のデフォルト重み
    "verse":   { "phrase_head": 0.9, "phrase_tail": 0.3 },
    "prechorus":{ "any": 0.4 },
    "chorus":  { "opening": 0.8, "final": 0.5 },
    "outro":   { "final": 0.7 }
  }
}
```

### 5.2 パラメタの意味（キー3つ）
- **頂点/谷の位置 `peak_pos`**: 凸=頂点位置、凹=谷位置。既定 0.55〜0.66（アーチは中央〜2/3）。
- **終止の相対音高 `end_deg`**: **閉じ=主音/低め（1, または低5）**、**開き=高め（3,5,^1）**。句末・セクション末は低く。
- **開始の相対音高 `start_deg`** と **振幅 `amplitude`**: 開始位置＋振幅で I と頂点/谷の高さが決まる。ボカロは amplitude と leap を上げる。

### 5.3 頻度事前分布（prior）の使い方
- §1.3 は**民謡**の値。用途別に**上書き prior**を持つ（J-pop chorus は上行/凸を持ち上げ、水平系を下げる）。
- prior は**初期バイアス**であって拘束でない（§1.4 の連続性警告）。

### 5.4 適用文脈（セクション役割マップ・推奨デフォルト）

| 役割 | 句頭 | 句末 | 最終句 | 主推し型 |
|---|---|---|---|---|
| verse | 凸/水平 | 下行 | 下行 | 起伏控えめ |
| prechorus | 上行 | 上行(開き) | — | 上行(緊張蓄積) |
| chorus | 上行/凸(高頂点) | 凸/下行 | 下行(締め) | 大振幅・音域ピーク |
| bridge | 凹/水平 | 上行(開き) | 上行 | 変化・引っ張り |
| outro | 下行 | 下行 | 下行(主音) | 沈静・解決 |

---

## 6. 生成ノブ案（contour で骨格生成をバイアス）

骨格層＝2拍構造線（度数）を出す DP/探索に、輪郭を**ソフト制約**で注入する。

### 6.1 ノブ（ユーザー露出）
- **`contour` (型ID or 連続ベクトル)**: 型を選ぶ or cosine contour 係数を直接指定。
- **`peak_pos` (0–1)**: 頂点/谷の位置スライダ。
- **`end_openness` (閉じ⇄開き)**: `end_deg` を主音側↔上音側へ。終止感の強弱。
- **`range/amplitude`**: 音域の広さ（ボカロで拡大）。
- **`arousal` (沈静⇄高揚)**: 上行/下行方向へ全体を傾ける感情スライダ（§3）。価数は key/mode と結線。

### 6.2 バイアスの掛け方（実装方針）
1. 型パラメタから**目標輪郭曲線 target(t)**（正規化位置 t∈[0,1] → 相対音高）を生成（凸=下向き2次、上行=単調増、cosine係数指定も可）。
2. 骨格DPのコストに **輪郭適合項** を加算: `cost += λ * Σ_i dist(skeletonPitch_i , target(t_i))`。
   - dist は cosine contour 空間 or 度数差の二乗。λ で「型への引力」強度を調整（§1.4より**硬く一致させない**＝λは中庸）。
3. **境界を優先固定**: 開始度数・終止度数（`start_deg`/`end_deg`）は強めの制約、途中は緩め＝人間の「候補まで」思想に合う（頂点は一点に固定せず窓で許容）。
4. **セクション役割から prior/context を引いて型を自動提案**（§5.4）＋ユーザー上書き可＝「機械は候補、仕上げは人間」。
5. サンプルは**複数 seed × 型違い**で出す（memory: サンプルはバリエーション、と整合）。

### 6.3 評価との接続
- 生成後、cosine contour（既知の測り方）で**実輪郭 vs 目標型の距離**を出し、型ラベルの再判定・逸脱量を表示（骨格の机のレンズに載る「輪郭適合」指標）。E-rule 側の一項目として純TSで計算（memory: 評価は既存重みで、と整合）。

---

## 7. 型別サンプル（度数列・各2本）

表記: アラビア数字＝スケール度（1=主音…7=導音）、`^`=オクターブ上、`v`=オクターブ下。左が句頭、右が句末。4/4想定・8音程度の骨格線（表面装飾なし）。

### 凸 convex（I<M>F・頂点≈0.6・句末閉じ）
- A(verse系): `1 3 5 6 5 3 2 1`（1で開き→6で頂点→1で閉じ、典型アーチ）
- B(chorus系/大振幅): `5 ^1 ^2 ^3 ^2 ^1 5 3`（高域で突き上げ→やや下げて締め）

### 凹 concave（I>M<F・谷≈0.5・句末開き）
- A: `5 3 2 1 2 3 5 6`（下って底1→上げて開いたまま＝bridge向き）
- B: `^1 6 5 3 5 6 ^1 ^2`（高→谷→高で戻し、引っ張る）

### 上行 ascending（I<M<F・単調上げ）
- A(prechorus): `1 2 3 4 5 5 6 7`（じわ上げ→導音で開いて緊張、サビへ）
- B(chorus頭): `3 5 6 ^1 ^1 ^2 ^2 ^3`（跳躍込みで突き上げ、最高音を句末側へ）

### 下行 descending（I>M>F・単調下げ・閉じ）
- A(句末/最終句): `^1 7 6 5 4 3 2 1`（主音への典型下降終止）
- B(outro): `5 5 4 3 3 2 2 1`（緩やか沈静・主音で解決）

### 水平系（稀・保留/装飾用）
- 水平→上行 horizontal-ascending A: `3 3 3 3 4 5 6 ^1`（前半平ら→後半上げ）
- 水平 horizontal A: `3 3 4 3 3 2 3 3`（3中心の平坦・語り/ラップ寄り）

（度数は中心=主音の相対。実運用では key/mode と結線し、chord tone/scale へ量子化。ボカロプリセットは amplitude と `^` 跳躍を増やす。）

---

## 8. 設計含意まとめ（骨格層への落とし込み）

1. **型は連続空間のプロトタイプ**として持つ（離散カテゴリ扱い禁物・§1.4）。cosine contour（既知）で測り、型はラベル/初期値。
2. 辞書 = **型ID × params（peak_pos / start・end_deg / amplitude / leap）× freq_prior × context(役割×位置)**。
3. 生成は**ソフト制約（引力λ）**＝境界固定・中間緩め。「候補まで・仕上げは人間」に一致。
4. デフォルトは**セクション役割×句位置**から自動提案（verse控えめ凸→句末下行、pre上行、chorus大振幅上行＋音域ピーク、outro下行）。
5. **arousal スライダ**を contour 方向に結線（上行=高揚/下行=沈静）。価数は key/mode/歌詞と共同決定。
6. サンプルは**seed×型違いの複数**で提示。生成後に輪郭適合をレンズ表示（E-rule 一項目）。

### 未確定・次の一手（保留候補）
- J-pop/ボカロの**一次コーパス統計**が薄い＝自前 356 コード/1523 フレーズ辞書からセクション役割別に**輪郭 prior を自作学習**すると強い（memory: 評価は自前重みで、と整合）。→ backlog/Task 化候補。
- ε（水平判定幅）の自前決定＝自コーパスで連続分布を確認し、型ラベルの実用境界を較正。

---

## 出典一覧（URL）
- Huron 9類型と I/M/F・4型集中の批判: https://arxiv.org/html/2604.13119v1 （Melodic contour does not cluster, 2026）
- 民謡アーチ原典系: https://www.researchgate.net/publication/239063783_The_Melodic_Arch_in_Western_Folksongs
- Essen コーパス概説 / cosine contour（測り方・既知）: https://archives.ismir.net/ismir2021/paper/000016.pdf
- Adams 15型（別系統）: https://kupdf.net/download/adams-melodic-contour-typology_59ed725a08bbc5702aeb8c39_pdf
- 位置別使い分け: https://musictheoryauthority.com/melodic-contour-phrase-structure ／ https://fiveable.me/music-theory-and-composition/unit-7/melodic-contour-structure/study-guide/a3zftW43ZKLRhlQt ／ https://nerd.wwnorton.com/ebooks/epub/enjmusic4ess/EPUB/content/1.2.1-chapter01.xhtml
- 輪郭×感情: https://soundquality.org/2021/03/music-and-felt-emotions-how-systematic-pitch-level-variations-affect-the-experience-of-pleasantness-and-arousal/ ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC5836201/ ／ https://arxiv.org/pdf/1708.03687
- J-pop/ボカロ傾向: https://lyricassistant.com/how-to-write-j-pop-songs/ ／ https://www.melodigging.com/genre/vocaloid ／ https://www.melodigging.com/genre/j-pop ／ https://daily.bandcamp.com/lists/japan-vocaloid-scene-report
