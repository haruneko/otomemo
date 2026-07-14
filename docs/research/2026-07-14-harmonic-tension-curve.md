# 和声的緊張の定量化 →「進行の張力プロファイル」仕様（任務C3）

作成: 2026-07-14 / 分類: research（和声認知・計算音楽学）
思想的前提: **機械は候補まで、仕上げは人間**。張力カーブは「審判」ではなく
「山場をどこに置くかを見る**設計レンズ**」。既知の結論（理論スコアでは曲の質は測れない＝ガードレール止まり）を踏襲する。

---

## 0. 結論先出し（実装の要点）

1. **フル張力モデル（Lerdahl/TPS）は木構造（prolongational）が必須で重い**。ソロツールの度数列レンズにはオーバースペック。
2. **軽量代替 = Tonal Interval Space（TIS）が本命**。コード（=pc集合）と key を DFT で 6 次元ベクトル（TIV）に変換し、
   **ユークリッド距離・角度距離**だけで「不協和・キー距離・機能距離・声部進行」を算出できる。度数＋品質＋key文脈**だけ**から計算可能。
3. **実証済みの重み初期値**（TIS版, Entropy 2020）: 不協和 **0.402** / 階層 **0.246** / 調距離 **0.202** / 声部進行 **0.193**（ρ=0.750, R²=0.563）。
   木構造を捨てるなら階層項を落として **不協和 : 調距離 : 声部進行 ≈ 0.45 : 0.30 : 0.25** に再正規化して使う（下§5.3）。
4. テンションノート（9/11/13th）は **TIVノルム ‖T‖ が自動で増える**＝「不協和項」に自然に乗る。別ロジック不要（§4）。
5. **ポップのカーブ帯は T–PD–D–T の地形**（Aメロ低 → Bメロ上昇（PD→D）→ サビ頭で解決 → サビ中盤に一山）。偽終止/サブドミ終止は「D→解決しない気持ちよさ」として**減点しない**（§3, §5.4）。
6. **限界**: モデルは機能和声（クラシック）由来。ポップのモーダル・ループ（機能希薄・循環）では張力が平坦化し、**カーブが意味を失う条件がある**（§6）。レンズは「機能進行モード」限定で信頼、ループ物では参考値に降格。

---

## 1. Lerdahl の Tonal Pitch Space / 張力モデル

出典:
- Fred Lerdahl, *Tonal Pitch Space*, Oxford UP, 2001. https://global.oup.com/academic/product/tonal-pitch-space-9780195178296
- Fred Lerdahl & Carol L. Krumhansl, "Modeling Tonal Tension", *Music Perception* 24(4), 2007, 329–366.
  誌: https://online.ucpress.edu/mp/article/24/4/329/95267/Modeling-Tonal-Tension
  PDF: https://static1.squarespace.com/static/58812885e6f2e1da63d1291b/t/589177f3f7e0abd41ebd1e75/1485928480330/Modeling+Tonal+Tension.pdf

### 1.1 4成分
Lerdahl の張力理論は4つの成分の合成で「聴取中の張力の上下」を予測する:
1. **prolongational structure（階層的緊張）** — 木構造で「どの和音がどの上位和音に従属するか」。従属和音は上位から張力を**継承**する。
2. **tonal pitch space（調的距離）** — 任意の2和音間の距離を組合せ的に計算する「chordal distance rule（CDR）」。
3. **surface (psychoacoustic) dissonance（表面的不協和）** — 転回・非和声音・不安定な音度による付加。
4. **melodic / harmonic attraction（引力）** — 次の和音・音への「引かれ具合」。

### 1.2 Chordal Distance Rule（CDR）
和音 x→y の基本距離:

```
δ(x → y) = i + j + k
```
- **i** = 調（region）の変化量。keyのcircle-of-fifths上で x のキーから y のキーまでのステップ数（同一キー内なら i=0）。
- **j** = キー内の**和音のcircle-of-fifths**上の距離（根音を五度圏 I–V–ii–vi–iii–vii–IV で並べたときのステップ数）。
- **k** = **basic space**（下）上で、y に在って x に無い pc（非共通ピッチクラス）の数（レベル a–e を通して数える）。

**basic space**（C majorの I=C を例に、上ほど安定）:
```
a 八度:  C
b 五度:  C           G
c 三和音: C     E     G
d 全音階: C  D  E  F  G  A  B
e 半音階: C C#D D#E F F#G G#A A#B   (全12)
```
和音が変わると a–c 層の充填 pc が変わり、その差分が k。
テキスト上の代表値（同一キー内, 転回なし）: **δ(I→V)=5**（i=0, j=1, k=4 相当）、δ(I→IV)=5、五度関係は「近い」、
遠い和音（iii, vii°）ほど δ が大きい。**距離は非対称でなく対称**（δ(x→y)=δ(y→x)）である点に注意。

### 1.3 Surface dissonance（表面張力）
和音そのものの心理音響的不安定さを整数で**加算**する。付与要因:
- **転回**（根音が最低音でない）＝ +1 相当。
- **メロディ（最上声部）が和音の不安定音度**（例: 第7音・非根音）＝ +1 相当。
- **非和声音（nonharmonic / 掛留・経過）** ＝ +1〜 相当。
（正確な整数割当は TPS 原著の "surface dissonance rule"。二次資料での検証・修正提案あり:
York大 D.Henry 2017 "Lerdahl's Surface Tension Rule: Validation or Modification"
https://yorkspace.library.yorku.ca/server/api/core/bitstreams/66f8ed55-8b38-4784-9606-41b532f64e7b/content ）

### 1.4 階層的（prolongational）張力
イベント y の総張力は「y が従属する上位イベント列の張力の総和 + そこからの局所距離」:
```
T(y) = T_prol(上位) + δ(親 → y)      （継承 + 局所付加）
```
＝ **木の深さに沿って張力が積み上がる**。これが「終止に向けて張力が解ける」構造を表現する。**木構造の抽出（GTTMのタイムスパン/prolongational還元）が前提**＝ここが計算的に重い。

### 1.5 引力（attraction）
音 p1→p2 の**旋律的引力** ∝ (安定度比) × (半音距離の逆二乗):
```
α(p1→p2) = (s2 / s1) × 1 / (dist_semitone)^2
```
（s = basic space 上の各音の anchoring strength）。和声的引力は和音のvoice-leading引力の総和。張力の「解決の方向感」を与える。

### 1.6 L&K 2007 の実証（予測 vs 聴取者評定）
- 古典的全音階曲で予測し、次に半音階的トナリティへ拡張。聴取者は各抜粋の張力をリアルタイム記録。
- **モデル予測と聴取データは概ね一致**（本モデルは張力の上下をよく予測すると報告）。後続の TIS 研究（§2.3）が Lerdahl 版を **ρ=0.677, R²=0.458** と再測しており、これが実質のベンチマーク値。
- 意義: 「和声的張力は**個別成分の重み付き和**として定量化でき、聴取者評定と中〜高相関する」ことが確立された。ただし相関は 0.6〜0.75 台＝**説明率 5 割前後**で頭打ち（＝ガードレール、審判にならない根拠）。

---

## 2. 軽量代替 — Tonal Interval Space（TIS）

出典:
- G. Bernardes et al., "A multi-level tonal interval space for modelling pitch relatedness and musical consonance", 2016.
  ハブ: https://sites.google.com/site/tonalintervalspace
- **本命**: "A Computational Model of Tonal Tension Profile of Chord Progressions in the Tonal Interval Space", *Entropy* 22(11):1291, 2020.
  https://www.mdpi.com/1099-4300/22/11/1291 / PMC全文: https://pmc.ncbi.nlm.nih.gov/articles/PMC7712964/

### 2.1 TIV（Tonal Interval Vector）の作り方
1. 和音（またはキー）を **12次元クロマベクトル**（pc C..B の 0/1、または重み）で表す。
2. **離散フーリエ変換（DFT）** して低次 6 係数を取り、**6次元の複素ベクトル TIV** を得る。
3. 各次元は **2音程（dyad）の協和度の実測評定で重み付け**（知覚的基盤の付与）。

→ **キーもコードも同じ空間の点**。度数＋品質から pc 集合は一意に出る（key文脈で度数→実pc）ので、**木構造なしで即計算できる**。

### 2.2 2つの基本計量
```
ユークリッド距離: μ(T1,T2) = sqrt( Σ_{k=1..6} |T1k − T2k|^2 )
角度距離:        θ(T1,T2) = arccos( (T1·T2) / (‖T1‖‖T2‖) )
```
- μ は「和音間の移動量（不協和・声部進行）」向き、θ は「キー/機能への整列（帰属）」向き。
- **不協和 c = ‖T‖**（原点＝空間中心 からのユークリッド距離）。単一pcで最小、全12pcで最大。**音を足すほどノルムが伸びる**（§4の要）。

### 2.3 張力の合成式と実証重み（Entropy 2020）
瞬時張力 M:
```
M = ω1·d1 + ω2·d2 + ω3·d3 + ω4·c + ω5·m + ω6·h
```
- **d1** = 連続する和音間のユークリッド距離（進行の跳躍）
- **d2** = 和音とキーの角度距離（キーからの遠さ）
- **d3** = (和音−キー) と機能三和音（I,IV,V）との角度距離（機能からの遠さ）
- **c**  = ‖T‖（和音自体の不協和）
- **m**  = 声部進行コスト  m = Σ_voices [ 1/e^{0.05·s} ] · μ(note_i, note_{i-1})（s=半音移動量）
- **h**  = 階層的張力 h = Σ_{k} μ(T_i, T_k)/N（親和音群との距離平均）※木がある場合のみ

**Experiment 1 で最適化された4成分重み**（実装の初期値として採用）:
| 成分 | 重み |
|---|---|
| 不協和 dissonance (c) | **0.402** |
| 階層 hierarchical (h) | **0.246** |
| 調距離 tonal distance (d2) | **0.202** |
| 声部進行 voice leading (m) | **0.193** |

- 性能: **ρ=0.750, R²=0.563**（聴取者手描きカーブの56.3%を説明）。
  比較: **Lerdahl版 ρ=0.677 / R²=0.458**、MorpheuS **ρ=0.700 / R²=0.489** を上回る。
- Experiment 2（大域カーブの原型選択）: **88.3%** が参加者選択と一致。

→ **結論: TISは度数列＋品質＋keyだけで計算でき、実証相関はLerdahl以上。ソロツールの張力レンズはTISを採る。**

参考（Lerdahl版の自動計算実装）: Herremans/Chew ほか "Automatically calculating tonal tension"
https://oro.open.ac.uk/72732/1/CSMC_2020_camera_ready_v2.pdf （MorpheuS の張力3指標: cloud diameter / cloud momentum / tensile strain）。

---

## 3. ポップスでの張力設計の実態

出典:
- Drew Nobile, "Teleology in Verse–Prechorus–Chorus Form, 1965–2020", *MTO* 28.3, 2022.
  https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html （PDF: https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.pdf ）
- Max Martin プリコーラス論（実務）: https://melodic-math.com/blog/pre-chorus-structure-max-martin
- Philip Tagg, *Everyday Tonality II*（loop/機能希薄）: https://tagg.org/html/FFabBk.htm
- 偽終止/サブドミ終止: Songtive Blog https://blog.songtive.com/creating-emotional-impact-plagal-deceptive-cadences/ ; Wikipedia Plagal cadence https://en.wikipedia.org/wiki/Plagal_cadence

### 3.1 セクション別の張力配置（VPC形式の地形）
Nobile の分析: Verse–Prechorus–Chorus に大域的な **T–PD–D–T** の和声軌道が乗る。
- **Verse**: 主和音圏（T）中心 = **張力低・安定**。
- **Prechorus**: 不安定な pre-dominant（IV / ii / vi）で始まり **dominant（D）で終わる** = **張力を上昇**させ、サビへ放出待ち。
  エネルギーは「段丘状（terraced）」＝ Verse→Prechorus で一度**エネルギーが落ち**（低エネの緊張）、サビで一気にピークへ跳ぶ。
- **Chorus**: **頭で T へ解決**（到達感）。ただしサビが「もう一度の反復」でなく「到達」に聞こえるのは、内部にもう一山を作るから（bridge/最終サビ前の retransition も同様の役割）。

**実務の型（Max Martin系）**: プリコーラスは主和音を**避け**、ドミナント/サスで宙吊りにしてサビ頭の解決を最大化する。

### 3.2 「解決しない気持ちよさ」
- **偽終止 V–vi**: 解決を期待させて逸らす。**サプライズの快**＝ここでモデル的には「D の張力が解けず持続」＝**張力の高止まりを"良"として扱う文脈がある**。減点対象にしない。
- **プラガル/サブドミ終止 IV–I**: 「二重解決（V–I の後に IV–I を足す）」で完結感＋温かみ。gospel/pop で常用。**弱い解決＝低張力の余韻**として設計に載る。
- 含意: **終止の「解決度」はセクション役割で意味が反転**する。サビ頭は強解決を、Bメロ末や間奏は「未解決の持続」を良とする。→ レンズは**役割別の目標カーブ帯**で評価する（§5.4）。

---

## 4. テンションノート（9th/11th/13th）と張力の定量化

出典（感覚的不協和・roughness）:
- "The pleasantness of sensory dissonance is mediated by musical style and expertise", *Sci. Rep.* 2018.
  https://www.nature.com/articles/s41598-018-35873-8
- "Mild Dissonance Preferred Over Consonance in Single Chord Perception", 2016. https://pmc.ncbi.nlm.nih.gov/articles/PMC4934671/

### 4.1 定量化の2ルート
1. **TISノルム（推奨・軽量）**: 拡張和音は pc を足す＝ **‖TIV‖ が増える**＝ **c（不協和項）が自動で上がる**。
   9th/11th/13th を「実際に鳴らす pc 集合」に含めてクロマベクトルを作れば、**別式なしで張力に反映**される。
   （3和音 → 7th → 9th …と積むほど c 単調増、ただし6次元DFTの協和重みで**増分は逓減**＝知覚に沿う。）
2. **roughness（心理音響, 精緻版）**: 隣接部分音の臨界帯域内うなりを積分（Plomp–Levelt/Sethares型）。
   voicing（オクターブ位置・間隔）依存を出したい時のみ。度数レンズでは voicing 未確定が多いので**通常は不要**、ルート1で十分。

### 4.2 知覚の非単調性（重要）
- **強い不協和 ≠ 悪、ではない**: minor9/major9/minor7 は「軽度不協和」で**むしろ選好が高い**（Sci.Rep. 2018 / mild-dissonance研究）。
- したがって拡張和音は「**張力を足す**」だけであって「**質を下げる**」ではない。レンズは c を**中立に加算**し、審判化させない。
- 実装: テンション付加は **c にキャップ付き逓減加算**（例: 7th=+w, 9th=+0.6w, 11th=+0.4w, 13th=+0.3w、既定 w は TIV実測で校正）。11thは根/3rdと半音衝突しやすいので voicing 依存フラグを別途持つと安全。

---

## 5. 仕様 — 「進行の張力プロファイル」計算仕様

### 5.1 入力
```
key:      { tonic: pc(0–11), mode: 'major'|'minor'|modal }
progression: [
  { degree: 'I'|'ii'|'V'|... , quality: 'maj'|'min'|'dom7'|'maj7'|'min7'|'m7b5'|... ,
    tensions?: ['9','11','13','b9',...], inversion?: 0|1|2|3,
    beatPos?: number, durBeats?: number,
    sectionRole?: 'verse'|'prechorus'|'chorus'|'bridge'|'intro'|'outro' }
]
```
度数＋品質＋key から **実pc集合** を一意に決定 → クロマベクトル化。

### 5.2 計算パイプライン（TISベース）
```
1. 各コード i の pc集合 → 12次元クロマ → DFT → TIV  T_i（6次元複素）
2. key の pc集合（またはトニック単音） → TIV  K
3. 成分:
   c_i  = ‖T_i‖                                   … 和音自体の不協和（tensions は 5.1→pc に反映済）
   d2_i = θ(T_i, K)                               … キーからの角度距離
   d1_i = μ(T_i, T_{i-1})   (i>0, 先頭は0)          … 進行の跳躍
   ss_i = surfaceTension(inversion, melodyDeg)     … 任意: Lerdahl表面張力（軽量近似, 整数）
   (h_i = 木がある時のみ。度数レンズでは既定 off)
4. 正規化: 各成分を系列内 min–max（または zスコア）で 0..1 に。
5. 合成: tension_i = Σ w_c·c_i + w_d2·d2_i + w_d1·d1_i (+ w_ss·ss_i)
6. 平滑化: durBeats で時間軸に展開し、隣接を軽く移動平均（聴感の慣性を模す）
出力: [{ index, degree, tension_0to1 }] = 張力カーブ
```

### 5.3 重み初期値（出典付き）
| 記号 | 成分 | 初期値 | 由来 |
|---|---|---|---|
| w_c | 不協和 c | **0.45** | Entropy2020 の 0.402 を木なしで再正規化 |
| w_d2 | 調距離 d2 | **0.30** | 同 0.202 を再正規化 |
| w_d1/w_ss | 進行跳躍＋表面 | **0.25** | 声部進行 0.193 の代替（度数のみで voicing 不定のため d1 とLerdahl表面張力で近似） |
| (w_h) | 階層 h | **0（既定off）** | 元 0.246。木抽出コストが高い＝プロ用ノブに退避 |

> 校正方針: 上の初期値は **暫定**。TDD で「既知の進行 → 期待カーブ帯」のゴールデンテストを先に置き、重みは後で耳＋少数評定でチューニング（勝手に固定しない）。

### 5.4 セクション役割別・目標カーブ帯（設計レンズの核）
「審判」ではなく「**この帯に入っているか／どこに山があるか**」を見る。値は 0..1 の張力、**幅を持った帯**。
| 役割 | 頭 | 中盤 | 終端 | 形の狙い |
|---|---|---|---|---|
| **verse** | 0.15–0.40 | 0.15–0.45 | 0.20–0.45 | 低め安定・平坦〜微起伏。主和音圏 |
| **prechorus** | 0.35–0.55 | 0.45–0.70 | **0.65–0.90** | 右肩上がり。末尾を D で高く（サビ直前の宙吊り） |
| **chorus** | **0.15–0.35（解決）** | **0.55–0.80（一山）** | 0.30–0.55 | 頭で解決 → 中盤にピーク → 収束。反復でなく到達に |
| **bridge** | 0.40–0.65 | 0.55–0.85 | **0.70–0.95** | 連続的に貯めて最終サビへ放出（retransition） |
| **intro/outro** | 0.10–0.35 | — | 0.10–0.40 | 低張力の枠。outro は plagal 余韻可 |

判定ルール:
- **解決系終止（V–I, サビ頭）**: 「頭が帯の下端に入るか」で見る。
- **未解決の快（V–vi 偽終止 / IV–I / D持続）**: 役割が prechorus/bridge/末尾なら**高張力を"良"**とし、減点しない。verse で高止まりなら「意図的か？」の**注意フラグ**（禁止ではない）。

### 5.5 レンズ = 候補進行の並べ替え
複数の候補進行（生成・代理和音差替の結果）を**張力カーブで序列化**する:
```
score(candidate) = − fitToBand(curve, targetBand[role])          // 帯からの逸脱（小さいほど良）
                   + peakPlacementReward(curve, role)             // 山が狙い位置にあるか
                   + Δrelief(cadence, role)                       // 解決/未解決の役割適合
                   − monotonyPenalty(curve)                       // のっぺり平坦の減点
```
- 返すのは**順位付き候補**（＝機械は候補まで）。**単一"正解"は出さない**。
- UIは「この候補はBメロの帯によく乗る」「こっちはサビ頭の解決が弱い」等、**カーブを重ねて見せる足場**として提示。
- ばらつき担保: 山の位置・解決度が異なる候補を**わざと混ぜて**出す（seed違い・代理差替違い）。

---

## 6. 限界（明記）

1. **クラシック機能和声が前提**。TIS/Lerdahl の距離・機能項（d2, d3）は「トニックへの引力・五度圏機能」を仮定する。
2. **モーダル・ループ（機能希薄・循環）で意味が薄れる**（Tagg のloop論）: Aeolian/Dorian ループ（例 i–VII–VI–VII、I–V–vi–IV）は「outgoing/medial/incoming」という**metrical位置**で回るだけで機能的な緊張解決が乏しい。
   → TISカーブは**平坦化**し、山谷がほぼ消える／進行の跳躍 d1 だけが微振動する。**このときカーブは設計情報をほとんど持たない**。
3. **破綻/降格の条件**（レンズを「参考値」に落とすべきトリガ）:
   - 進行が3–4和音の反復ループで、キー角度距離 d2 のレンジが小さい（例 Δd2 < しきい）＝機能運動が乏しい。
   - 明確な V（属七・導音）が不在、または借用/モーダル交換が支配的。
   - ペダル/ドローン・サスペンド多用で「解決点」が定義できない。
   → この場合は **カーブ帯判定を無効化**し、代わりに「テクスチャ/密度/レジスター」等**非和声の張力代理**（生成の別レンズ）に委ねる旨をUIに明示。
4. **相関の天井**: 最良でも R²≈0.56（TIS）〜0.46（Lerdahl）。**説明できない約半分**が曲の"良さ"の本体。
   ＝**張力カーブは山場の設計を助けるが、良し悪しは判定できない**（既知の結論と一致）。審判化させない設計を堅持する。
5. **voicing/timbre/dynamics 非対象**: 度数レンズは pc 集合まで。実際の張力は音域・音色・強弱・リズム密度で大きく動く＝**和声張力は全体張力の一因子**にすぎない。

---

## 7. 設計含意（creative_manager への落とし込み）

- **採用**: TIS（DFT→6D TIV→μ/θ）を「張力プロファイル」計算器として純TSで実装（外部モデルサーバー不要＝評価は既存重み路線と整合）。
- **成分4本**（不協和c / 調距離d2 / 進行跳躍d1 / 表面張力ss）、**木(h)は既定off・プロノブ**。重み初期値は §5.3、**ゴールデンテスト先行（TDD）**で校正。
- **役割別カーブ帯（§5.4）を正準テーブル化**。生成・代理差替の**候補並べ替えレンズ**として結線（§5.5）。単一正解を返さない。
- **モーダルループ検出（§6-3）でレンズを自動降格**。ここを実装しないと「機能希薄な良進行」を不当に低評価する事故が起きる＝要ガード。
- backlog候補: (a) roughness版cのvoicing対応、(b) prolongational木の軽量近似（h復活）、(c) 少数聴取評定による重み再校正。

---

## 参照URL一覧
- Lerdahl & Krumhansl 2007, Modeling Tonal Tension: https://online.ucpress.edu/mp/article/24/4/329/95267/Modeling-Tonal-Tension ／ PDF https://static1.squarespace.com/static/58812885e6f2e1da63d1291b/t/589177f3f7e0abd41ebd1e75/1485928480330/Modeling+Tonal+Tension.pdf
- Lerdahl 2001, Tonal Pitch Space (OUP): https://global.oup.com/academic/product/tonal-pitch-space-9780195178296
- TIS 張力モデル (Entropy 2020): https://www.mdpi.com/1099-4300/22/11/1291 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC7712964/
- Tonal Interval Space (Bernardes hub): https://sites.google.com/site/tonalintervalspace
- Automatically calculating tonal tension / MorpheuS: https://oro.open.ac.uk/72732/1/CSMC_2020_camera_ready_v2.pdf
- Henry 2017, Surface Tension Rule 検証: https://yorkspace.library.yorku.ca/server/api/core/bitstreams/66f8ed55-8b38-4784-9606-41b532f64e7b/content
- Nobile 2022, VPC teleology (MTO 28.3): https://mtosmt.org/issues/mto.22.28.3/mto.22.28.3.nobile.html
- Max Martin prechorus (実務): https://melodic-math.com/blog/pre-chorus-structure-max-martin
- Tagg, Everyday Tonality II (loop/機能希薄): https://tagg.org/html/FFabBk.htm
- 偽終止/プラガル終止: https://blog.songtive.com/creating-emotional-impact-plagal-deceptive-cadences/ ／ https://en.wikipedia.org/wiki/Plagal_cadence
- 感覚的不協和の選好: https://www.nature.com/articles/s41598-018-35873-8 ／ https://pmc.ncbi.nlm.nih.gov/articles/PMC4934671/
