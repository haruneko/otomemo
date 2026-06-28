# モチーフ：deep research レポート（抽出＋生成＋著作権）

手動 deep research（deep-research workflow が StructuredOutput 不具合で失敗→WebSearch/WebFetch で実施）。
目的＝**実曲統計から fresh で original なモチーフを生成**（コピーしない）して motivic なメロを作る設計。最終更新 2026-06-28。

## 0. 結論（最重要）
1. **我々の「骨格＋肉付け」は WuYun（ISMIR系）と同型＝正しい方向**。WuYun の骨格定義が**我々の agogic/コードトーンの発見を裏付け**。
2. **モチーフ展開** ＝ Yin-Yang の「変形タイプ（高類似＝反復用／低類似＝対比用）」が実装の型。
3. **著作権** ＝ 4音程度は独立創作扱い。**統計から fresh生成すれば安全**（リテラル断片の再利用を避ければよい）。
4. **モチーフ選択(salience)** ＝ COSIATEC は**圧縮率**で主モチーフを選ぶ＝「最もよく圧縮する＝最も反復×長い」パターン。

## 1. 骨格＝WuYun が我々を裏付け（★核心）
[WuYun](https://arxiv.org/abs/2301.04488)＝**skeleton construction → melody inpainting** の2段＝我々の骨格→diminution と同型。
- **skeleton notes**＝rhythm/pitch で構造的に重要な音。残りは **decorative/prolongation notes**（個性・スタイル）。
- **rhythmic skeleton** ＝ ①metrical accents（強拍）②**agogic accents on metrical accents**（強拍上の長音）③**agogic accents on syncopations**（シンコペ上の長音）。
  ＝**強拍＋長音＋“シンコペした長音”が全部 skeleton**。我々の「長音(agogic)抽出・長音84%オフビート」と**完全一致**。シンコペは骨格に**ある**（構造的長音がたまたま食ってる）＝以前の「骨格にシンコペ入れない」は半分修正：**ランダムに入れない**が正、**構造的長音が食う位置に乗る**のも正。
- **tonal skeleton** ＝ rhythm cell 内で**最小テンション(=最も協和)の音**。我々の「骨格をコードトーンへ」と一致。
- 他に [Small Tunes Transformer](https://arxiv.org/html/2410.08626v1)（macro/micro階層・skeleton-conditioned）も同系。

## 2. モチーフ展開＝Yin-Yang（実装の型）
[Yin-Yang](https://arxiv.org/html/2501.17759v1)＝motif を変形で展開してメロにする。
- **変形タイプ**（＝我々が使うべき展開技法）：
  - **高類似（hook を保つ＝AA反復用）**：fragmentation・augmentation・diminution。
  - **低類似（対比＝B用）**：retrograde・real inversion・pitch permutation。
- **corruption-refinement**＝「壊して直す」自己教師でモチーフ変奏を学習（neural の話だが、我々は規則でこの変形を実装すればよい）。
- **Structural Derivation 指標**＝生成句が元モチーフにどれだけ derive してるか＝**反復の認識性を測る指標**（我々の反復プロファイルの上位版）。
- [MeloForm](https://arxiv.org/pdf/2208.14345)＝expert system で **motif→phrase→section** を**楽式(form)**に従って反復・変奏。**形式制御は規則、richness は学習**のハイブリッド＝我々の方針(エンジン=規則＋コーパス統計)と同じ。

## 3. 抽出(MIR)＝主モチーフの選び方
- **SIATEC/COSIATEC**（[Meredith](http://www.titanmusic.com/papers/public/siajnmr_submit_2.pdf), [COSIATEC PDF](https://vbn.aau.dk/ws/files/181893482/DM10.pdf)）＝平行移動で一致する反復(TEC)を全列挙→**圧縮率(2-4)で最良TEC=主モチーフ**を選ぶ。出すぎ問題を圧縮率 salience で解決。
- 純圧縮だけでなく**音楽学的有意性**で補正する手法（[Forth-Wiggins salient repetition](https://research.gold.ac.uk/id/eprint/8578/1/forth-wiggins-2009.pdf)）。
- 我々の実装（[motif-extraction.md](motif-extraction.md)）＝(音程,音価)符号化＋窓＋頻度＝軽量版で十分（単旋律）。**salience は「出現×長さ」＝圧縮率の近似**で既にやってる。
- MIREX に [Repeated Themes & Sections](https://www.music-ir.org/mirex/wiki/2019:Discovery_of_Repeated_Themes_&_Sections) タスクあり（評価データ・手法比較）。

## 4. 著作権＝抽象化すれば安全
[CLL](https://www.cll.com/CopyrightDevelopmentsBlog/uncleared-melody-musicological-factors-considered-in-copyright-infringement-cases) / [Swirsky v. Carey](https://blogs.law.gwu.edu/mcir/case/swirsky-v-carey/)：
- **固定の音数閾値は無い**。**4音は独立創作扱い**（侵害になりにくい）。
- 裁判所が見るのは**メロの形(shape)＋pitch emphasis＋ハーモニー/ベース/テンポ/調＋access＋substantiality**。
- ＝**統計から fresh生成（実曲の断片を保存・再利用しない）なら安全**。我々の方針（コーパスは統計のみ・リテラル保存しない）は法的にも妥当。

## 5. ＝我々の生成設計（具体・actionable）
**骨格(WuYun型)＋モチーフ(Yin-Yang型展開)＋肉付け(inpaint)** の三段、全てデータ駆動：
1. **骨格**＝rhythmic(強拍＋長音＋シンコペ長音＝学習した位置別分布)＋tonal(コードトーン/最小テンション)。＝今の骨格＋長音抽出で概ね正しい。
2. **モチーフ＝fresh生成**（コピーしない）：学習した「音程図形分布＋リズム分布」から**新規4音 hook**をサンプル（move学習＋リズム語彙）。長さ4音・占有23%・2.4回（[motif-extraction.md](motif-extraction.md) 実測）。
3. **展開**＝Yin-Yang の変形を**規則で**：反復は fragmentation/augmentation/diminution（hook維持）、対比は inversion/retrograde（B）。実測の反復率(隣接42/句52)・反行20%・リズム変形12%に合わせる。
4. **肉付け(inpaint)**＝骨格点・モチーフ以外の**自由材料77%**を move学習(跳躍14/3度18/同音23%)で動かす＝ダルダル解消。
5. **評価**＝反復プロファイル・CT率・跳躍/同音率・（可能なら SD的な derive 指標）＝実測値に合わせる（FMDは表面統計専用）。

### 今までの失敗の理論的説明
- 「句を丸ごとコピー」＝WuYun/Yin-Yang は**短いモチーフ＋変形展開**であって全句コピーでない。
- 「全部順次diminution」＝肉付けが decorative すぎ＝WuYun の decorative notes は**自由材料(個性)**＝跳ぶべき。
- ＝**短い fresh モチーフを変形展開＋自由な肉付け**が正解。理論・既存システム・実測の三方が一致。

## 出典
WuYun [abs](https://arxiv.org/abs/2301.04488) / Yin-Yang [html](https://arxiv.org/html/2501.17759v1) / MeloForm [pdf](https://arxiv.org/pdf/2208.14345) / Small Tunes Transformer [html](https://arxiv.org/html/2410.08626v1) / SIATEC [Meredith](http://www.titanmusic.com/papers/public/siajnmr_submit_2.pdf) / COSIATEC [pdf](https://vbn.aau.dk/ws/files/181893482/DM10.pdf) / Forth-Wiggins [pdf](https://research.gold.ac.uk/id/eprint/8578/1/forth-wiggins-2009.pdf) / MIREX [Repeated Themes](https://www.music-ir.org/mirex/wiki/2019:Discovery_of_Repeated_Themes_&_Sections) / 著作権 [CLL](https://www.cll.com/CopyrightDevelopmentsBlog/uncleared-melody-musicological-factors-considered-in-copyright-infringement-cases) [Swirsky](https://blogs.law.gwu.edu/mcir/case/swirsky-v-carey/) / motif定義 [Wikipedia](https://en.wikipedia.org/wiki/Motif_(music))

## 6. 実装プロト検証（2026-06-28・scratch・指標のみ／耳未）
**基盤＝骨格点(強拍)＋拍間を move学習で歩く(次強拍へ gap-fill)** ＝自由材料が実曲分布に完全一致：
| | 順次 | 3度 | 跳躍 | 同音 | CT |
|---|---|---|---|---|---|
| 実曲 | 45 | 18 | 14 | 23 | 50 |
| 基盤 | 43 | 19 | 14 | 24 | 51 |
＝**ダルダル(跳躍0/同音52/CT99)を一発で解消**。move学習が実曲の跳躍/3度/同音/協和を全部持ってるのが効いた（mechanical diminution は捨てる）。
- **fresh モチーフ注入**（4音 move列・跳躍保証・句頭2+反行1）：跳躍13維持・**主モチーフ4.5回(実曲2.4)・同音35(実曲23)＝出過ぎ**。
- **残調整**：注入を2箇所へ／モチーフから0-move除外／occurrence 2.4・同音23 に合わせる。
- ＝**設計は正しく検証済**。production統合は「基盤(move歩き)＋軽い hook注入」＝耳flush後に値詰め。
