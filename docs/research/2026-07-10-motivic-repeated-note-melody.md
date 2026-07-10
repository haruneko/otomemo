# 反復音を含むモチーフ的旋律（ラーラシドラ／シーソッソッ）＝理論調査とエンジン再設計提案

2026-07-10。オーナー（作曲家・修羅場P）の耳の指摘＝「ラーラシドラ／シーソッソッのような**反復音を動機の一部として使う旋律**が今のエンジンから出なさそう」を受けた深掘り。**理論（なぜ耳に良いか・出典付き）→ ギャップ分析（実コード file:line＋実測）→ 再設計提案（案比較・推奨・段階・TDD受入条件）**。実装はしない＝本docは理論と計画まで。結線シリーズ（ドラム/ベース/役割）に続く「メロ動機層」の本丸調査。

---

## 0. TL;DR

- **理論**：反復音フックは「音高の弧」と別系統の、**発話プロソディ×リズム前景化×動機の経済**で機能するゲシュタルト。反復はそれ自体が快（mere exposure・処理流暢性）で、反復音は「音高情報を消してリズム/歌詞を前景化する」最強の圧縮。sentence（提示→反復→展開）の骨法が理論の芯。現代popはまさにこの方向（音高複雑性の低下・音符密度の増加＝speech-like化、Hamilton & Pearce 2024）。
- **ギャップ**：現行V2は「骨格＋2小節ブロック発展＋なめらかアーチ選別」の**単一美学**で、反復音を**動機生成（`:625`/`:686`）・選別（`:657`）・近景レンダ（`:761`＝本調査の新発見）・後処理（`:992`）の4層で潰す**。さらに**アーティキュレーション層が無い**（dur=次onsetまで埋めるレガート固定 `:775-780`）ため「ソッソッ」の「ッ」が表現不能。実測：`foreground=1` でも同音率17.8→17.5%＝no-op。**seedMotifでオーナー例を渡しても3/3 seedで原形の音程列が非再現**＝動機の同一性が保存されない（これが根本問題）。
- **提案**：4案比較の結論＝**Phase1: `hook`ノブ＋アーティキュレーション層（案A+C）→ Phase2: 動機保存レンダ＝動機の一級市民化（案B）→ Phase3: 観点別選別・観点別候補（案D）**。全て既定0/未指定=bit一致の新経路として足す。ただし正直に書く：現行の「輪郭(mv)を後処理が個別音単位で上書きする」生成観は動機の同一性と**本質的に相性が悪く**、長期的には案B（動機オブジェクト＋保護契約）への転換が必要。案A/Cはその入り口（保護マスク機構がBの基盤になる）。

---

## 1. オーナー例の分析（何が起きている旋律か）

ソルフェージュ＝ラ(A)ラ(A)シ(B)ド(C)ラ(A)／シ(B)ソ(G)ソ(G)。「ー」=長音、「ッ」=短く切る（スタッカート的）。

```
前半:  ラー  ラ  シ  ド  ラ      後半:  シー  ソッ  ソッ
move:  (0)   0  +2  +1  -3            +2   -4    0
機能:  [反復音アンカー][順次上行][開始音へ回帰]  [緊張][3度下行][反復音クローズ]
```

- **音程集合が極小**：同度・2度・3度のみ。跳躍なし。歌唱容易性は最高クラス（Temperley の proximity 原理そのもの、§2.4）。
- **反復音が2箇所とも「構造上の要所」にある**：句頭のアンカー（ラーラ＝これから動く土台の宣言）と句末のクローズ（ソッソッ＝リズムで終わる）。装飾ではなく**動機の骨**。
- **前半と後半が「問いと答え」**：どちらも「反復音＋少数の動き」という同型ゲシュタルト＝ sentence の basic idea + varied repetition の骨法（§2.1）。
- **弧ではない**：単一頂点のアーチ（現行V2の美学）ではなく、「平らに留まる→少し動く→戻る/切る」という**足場型（pedal/anchor型）の輪郭**。
- **「ッ」が動機の一部**：ソッソッの反復は**短い発音＋隙間**で初めて2音に聞こえる。同音をレガートで繋ぐと1つの長い音に縮退する＝アーティキュレーションは反復音フックの**成立条件**（§2.5）。

＝この旋律の「良さ」は、現行エンジンが最適化している軸（なめらか・アーチ・跳躍回収）の**どれでもない**。別の軸の理論が要る。

---

## 2. 理論：なぜ反復音フックは耳に良い/歌える/フックになるのか

### 2.1 動機の経済＝Schoenberg の motive / Grundgestalt と sentence

Schoenberg にとって motive は「作品の胚（germ）」であり、**旋律は少数の動機の反復と変奏の経済でできる**（Grundgestalt＝基礎形象）。彼が定式化し Caplin が精緻化した **sentence（楽節）** は「**提示（basic idea 2小節）→ 反復（varied repetition 2小節）→ 継続（断片化・リズム加速・和声加速）→ カデンツ**」という展開型で、**「反復してから展開する」こと自体が可聴の構造**になる（[Caplin, Analyzing Classical Form の解説レビュー](https://mtosmt.org/issues/mto.14.20.1/mto.14.20.1.aziz.html)・[BaileyShea, A Taxonomy of Sentence Structures](https://symposium.music.org/index.php/54/item/10629-a-taxonomy-of-sentence-structures)・[Art of Composing: Sentence vs Period](https://www.artofcomposing.com/question/sentence-vs-period-differences)）。

反復音はこの経済の極限＝**音高0個の変化で動機を宣言する**。ラーラは「同じものが2回来た」という最小の反復構造を動機の内部に埋め込み、聴き手の予測機械を1拍で起動する。重要：**動機の同一性（identity）は音程列の逐語性で決まる**。反復音を「別の音に散らす」ことは動機の同一性の破壊であり、Schoenberg 的には展開ですらない。

**含意**：本プロジェクトの sentence 実装（`form:"sentence"`・fragment）は形式レベルでは正しい方向だが、**動機内部の反復（音レベル）**が欠けている。sentence は「動機の反復」を核に持つのに、その動機自体が反復音を持てない。

### 2.2 反復そのものの快＝mere exposure と処理流暢性

- Margulis の実験：現代音楽（Berio/Carter）の抜粋に**人工的に反復を挿入しただけ**で、聴取者は原曲より「楽しい・面白い・芸術的」と評価した（[Margulis 2013, Aesthetic Responses to Repetition in Unfamiliar Music](https://doi.org/10.2190/em.31.1.c)・[On Repeat 書評 MTO](https://www.mtosmt.org/issues/mto.14.20.4/mto.14.20.4.albrecht.html)・[Margulis エッセイ](https://classx.org/why-we-love-repetition-in-music-elizabeth-hellmuth-margulis/)）。反復は Zajonc の mere exposure（接触するほど好きになる）に加え、**注意の焦点を音のニュアンス層へシフトさせる**。
- Nunes らの Billboard 分析（1958-2012）：**歌詞の反復が多い曲ほど処理流暢性が上がり、#1到達確率が高く、#1到達が速い**（[Nunes, Ordanini & Valsesia 2015, The Power of Repetition, J. Consumer Psychology](https://myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2014.12.004)）。実験系（Study 1-2）で反復→流暢性の因果も確認。
- Burns のフック類型論（この分野の古典）：フックの定義は「**繰り返される部分**」であり、類型の筆頭に「**1音の反復（repetition of one note）ないし音列の反復**」が明記されている（[Burns 1987, A typology of 'hooks' in popular records, Popular Music 6/1](https://www.tagg.org/xpdfs/burns87.pdf)・[Cambridge](https://www.cambridge.org/core/journals/popular-music/article/abs/typology-of-hooks-in-popular-records/865047E7758CFBF25D9CD24D09FA454F)）。

**含意**：「反復＝手抜き/足踏み」ではなく「反復＝フックの定義そのもの」。現行エンジンの anti-unison（同音を bug として散らす）は、この理論と正面衝突している。

### 2.3 反復音の特殊な働き＝発話プロソディとリズム前景化

- **Deutsch の speech-to-song 錯覚**：話し言葉の一句を**そのまま反復するだけ**で「歌」に聞こえ始める。移調したり音節をシャッフルすると錯覚は起きない（[Deutsch, Henthorn & Lapidis 2011, Illusory transformation from speech to song, JASA 129:2245](https://deutsch.ucsd.edu/pdf/JASA-2011_129_2245-2252.pdf)・[Wikipedia: Speech-to-song illusion](https://en.wikipedia.org/wiki/Speech-to-song_illusion)）。＝**反復こそが「歌」の知覚を作る**実証。音高がほぼ平坦（狭い音域・反復音的）な素材でも、反復されれば旋律として聴かれる。
- 反復音は**音高情報を局所的にゼロにする**ことで、聴き手の注意をリズム・アーティキュレーション・歌詞音節へ向ける＝**リズムフック化**。ソッソッの快はピッチでなく「ッ」のタイミングにある。Burns の類型でも rhythm hook は melodic hook と並ぶ独立カテゴリ。
- **現代popの実証トレンド**：Billboard年間チャート上位曲（1950-2023）の主旋律を分析した結果、**音高面の複雑性は一貫して低下し、音符密度（notes/sec）は上昇**＝旋律が「しゃべるように」なっている（[Hamilton & Pearce 2024, Trajectories and revolutions in popular melody, Scientific Reports 14:14749](https://www.nature.com/articles/s41598-024-64571-x)・[PDF](https://www.marcus-pearce.com/assets/papers/HamiltonPearce2024.pdf)）。反復音を含む語り型の旋律は例外でなく主流の方向。

**含意**：反復音動機は「歌詞を持つ歌もの」で特に強い（音節の台になる）。エンジンは歌詞を知らないが、**プロソディの器**（同音連打＋アクセント＋切り）を作れる必要がある。

### 2.4 期待と充足＝gap-fill・proximity・予測報酬

- **Meyer の gap-fill**（1973）：大きな跳躍（gap）は逆方向の順次進行（fill）を期待させる。**Narmour の Implication-Realization**（1990）が形式化：小さい音程は同方向の継続を、大きい音程は方向転換と回帰を含意する（[Narmour, The Implication-Realization Model](https://web.sas.upenn.edu/enarmour/the-implication-realization-model/)・[Wikipedia: Melodic expectation](https://en.wikipedia.org/wiki/Melodic_expectation)）。ただし gap-fill の知覚的実在には批判もある（[Questioning a Melodic Archetype: Do Listeners Use Gap-Fill to Classify Melodies?](https://www.researchgate.net/publication/271681259_Questioning_a_Melodic_Archetype_Do_Listeners_Use_Gap-Fill_to_Classify_Melodies)＝統計的には von Hippel & Huron の「平均回帰」で説明可能）。
- **Temperley の確率モデル**：旋律の確率は (a) 狭い音域 (b) **隣接音程は小さい（proximity）** (c) キープロファイル、の積でよく説明できる（[Temperley 2008, A Probabilistic Model of Melody Perception, Cognitive Science 32](https://davidtemperley.com/wp-content/uploads/2015/11/temperley-cs08.pdf)）。**同度（音程0）は proximity の最頻値近傍**＝反復音は統計的にもっとも「ありえる」次音のひとつであり、実コーパスの音程分布で unison は常に上位（POP909 自実測でも同音23%、§3.4）。
- **Huron の ITPRA／予測報酬**：正しく予測できた事象は正の情動で報われる（prediction effect）。反復は予測を確実に当てさせる装置＝**反復音の2音目は「予測成功の快」を最小コストで配る**（[Huron, Sweet Anticipation 書評 MTO](https://mtosmt.org/issues/mto.09.15.3/mto.09.15.3.aversa.html)・[Pearce による書評](https://www.marcus-pearce.com/assets/papers/huron06-review.pdf)）。快の設計は「予測できる土台（反復）×少数の裏切り（3度跳躍・新音）」の交互＝オーナー例の「ラーラ（土台）→シド（動き）→ラ（回帰）」はこの教科書的構成。
- **earworm 研究**：頭に残る旋律は「**ありふれた全体輪郭＋少数の特異な音程特徴**」＋速めのテンポ（[Jakubowski et al. 2017, Dissecting an Earworm, Psychology of Aesthetics, Creativity, and the Arts](https://www.apa.org/pubs/journals/releases/aca-aca0000090.pdf)）。フック性は「変な旋律」でなく「覚えやすい骨格に1点の個性」。フック=想起可能性の実証系としては [Burgoyne et al. 2013, Hooked: A Game for Discovering What Makes Music Catchy](https://www.researchgate.net/publication/263738566_Hooked_A_Game_for_Discovering_What_Makes_Music_Catchy)・[van Balen 博士論文 ch.7](https://jvbalen.github.io/pdf/thesis-CH7.pdf)（曲内でもセクションによって想起速度が有意に違う＝フックは局所的性質）。

**含意**：gap-fill・proximity は現行エンジンに実装済みで正しい。欠けているのは対をなす**「予測の土台」側＝反復**。両者は排他でなく交互に使う関係。

### 2.5 アーティキュレーション＝反復音の成立条件

- KTH の演奏ルール研究（実測ベース）：**同音連打（repeated notes）は間に micropause を挿入しないと成立しない**＝実演奏では反復音の発音長は IOI の約60%、スタッカートは約40%、レガートは IOI 依存の key overlap（[Bresin 2001, Articulation Rules For Automatic Music Performance, ICMC](https://quod.lib.umich.edu/cgi/p/pod/dod-idx/articulation-rules-for-automatic-music-performance.pdf?c=icmc;idno=bbp2372.2001.001;format=pdf)・[Bresin & Battel 2000, Articulation Strategies in Expressive Piano Performance, JNMR 29(3)](https://www.tandfonline.com/doi/abs/10.1076/jnmr.29.3.211.3092)）。
- ＝「ソッソッ」の「ッ」は装飾でなく**物理**。同音をレガート（dur=次onsetまで）で繋ぐとMIDI/シンセ上は1つの長音に縮退し、反復音フックは**聞こえなくなる**。反復音の一級市民化はアーティキュレーション層とセットでしか成立しない。

### 2.6 小括＝反復音フックの理論要件

1. **動機内の反復音は逐語保存**されること（同一性・§2.1）
2. 反復音は**句頭アンカー/句末クローズ等の構造位置**に置かれること（§1）
3. 反復（予測の土台）と**少数の動き（3度中心・順次）**が交互であること（§2.4）
4. 同音連打には**micropause/スタッカート**が伴うこと（§2.5）
5. 動機は**曲中で数回、変形を保って回帰**すること（§2.2、実測2.4回/8小節＝motif-extraction.md §4.5）

---

## 3. ギャップ分析：現行エンジンの何が反復音動機を阻むか

対象＝`apps/api/src/music/melodyCells.ts` の `genMotifMelodyV2`（本番経路）。行番号は 2026-07-10 時点。

### 3.1 生成観の総括

V2の生成観＝「**骨格（構造音・POP909学習）＋2小節ブロックで動機を A/A'/B/A'' 発展＋弧（B塊を音域ピークへ）＋輪郭(mv)を近景レンダ＋後処理でCT/禁則/単一頂点を整える**」。この設計は「なめらかで歌えるアーチ」を出すことに最適化されており、その限りで成功している。問題は、この単一美学が**反復音フック（足場型ゲシュタルト）を4層で構造的に排除する**こと。

### 3.2 抑制機構インベントリ（file:line）

| # | 層 | 場所 | 機構 | 反復音への効果 |
|---|---|---|---|---|
| 1 | 動機生成 | `mkMotif` `:625` | `if (m === 0) m = r() < 0.5 ? 1 : -1` | move=0 を**動機の語彙から全面排除**。モチーフは定義上反復音を持てない |
| 2 | 動機変奏 | `varyTail` `:686-687` | 同上＋跳躍を±2にクランプ | 変奏（A'）でも反復音は生まれない |
| 3 | 選別 | `score` `:635-658`（return `:657`） | range≈5・方向転換≈2・単一頂点(中央やや後)・跳躍≤1・音数≈6 を最良とする | 「なめらか単峰アーチ」単一美学。仮に反復音動機が生成できても range/dirs が小さく**選別で負ける** |
| 4 | 近景レンダ | `render` `:761` | `if (p === prev) p = snapList(prev ± 1段)` | **【本調査の新発見】** mv=0 や snap衝突による同音を**レンダ段で強制的に隣接音へ散らす**。`freeVary`（`:697-706`）や `seedMotif`（`:793`）が move=0 を保持しても**ここで無効化される**＝`foreground` が実測 no-op の真犯人 |
| 5 | 後処理① | `:974-1004`（anti-unison `:992-1002`） | 強拍CTスナップ結果が直前と同音なら別のコード音へ | 監査Bで「足踏み(bug)」として導入。散発的同音をさらに削る（同音28→21%実測） |
| 6 | 後処理(掃除) | `:1159` | 弱拍濁り掃除の候補から `q === prev || q === next` を除外 | 掃除でも同音を作らない方針＝反同音バイアスの一貫 |
| 7 | dur | `render` `:775-780`（4/4）・`:767-773`（6/8） | dur=次onsetまで埋める（短gapは全埋め・大gapのみ1.6/1.05でカット） | **アーティキュレーション概念が無い**＝レガート固定。同音連打は仮に出ても縮退して聞こえない。スタッカート・micropause・アクセント（velはhumanize/backbeatの副次のみ）が表現不能 |
| 8 | 補完 | `extractMotif16` `:498-507` → `:793` | ユーザー部分メロの mv を抽出（mv=0は保持される）が、#4 のレンダで潰される | **ユーザーが反復音動機を弾いて渡しても発展部で反復音が保存されない** |

対照的に、**同音を意図して作る機構は expression の掛留（suspension）のみ**（`:1121-1123`＝前音保持）。ただし対象は強拍NCTで確率的・散発的＝動機ではない。

### 3.3 実測（本調査で再現・追加）

方法＝`genMotifMelodyV2` を直接駆動（8小節 C-G-Am-F×2・4/4・seed 1..40・スクリプトは scratchpad、手順：`loadMotifModel16`/`loadSkeletonModel` を渡し opts のみ変える）。親タスクの実測（40seed：同音19%・順次46%・3度24%・大跳躍11%）と整合。

| 実験 | 結果 | 含意 |
|---|---|---|
| 既定の隣接同音率 | **17.8%**（40seed） | 一見 POP909 の23%に近いが下記の通り**性質が違う** |
| `foreground=1` | **17.5%**＝変化なし | freeVary の move=0 保持は render `:761` で無効化＝**no-op 確認**（機構#4） |
| 同音の出所 | mv列に0は存在しない（機構#1-2）のに出力に同音がある | 同音は**後処理の衝突残渣**（anti-unisonの逃げ先が無い場合・gapFill `placeNear`・単一頂点の均し `:1043-1056`・カデンツ着地等）＝設計でなく副産物 |
| 同音の組織化 | A塊(bars0-1)の同音位置がA''塊(bars6-7・同一動機)で再現する率 **61%**、ただし**1.1個/2小節ブロックと希薄** | 決定的な輪郭潰れが反復で写っているだけ。「句頭ラーラ/句末ソッソッ」のような**アタック反復のフック**ではない |
| dur≤0.3（スタッカート相当） | **7.5%**（16分格子の残渣のみ） | アーティキュレーション不在の定量確認（機構#7） |

### 3.4 決定打＝seedMotif 実験（オーナー例の往復）

オーナー例を `seedMotif`（`ons:[0,1,1.5,2,2.5,4,5,5.5]`, `mv:[0,0,+2,+1,-3,+2,-4,0]`＝A A B C A / B G G 相当）として V2 に渡した（Am・C-G-Am-F×2）：

| seed | 出力（提示ブロック） | 判定 |
|---|---|---|
| 1 | C C **C** E G / B D D | 反復音は部分残存するが「シ→ド」の順次上行(+2,+1)が消え +4/+3 に変形 |
| 7 | E **F G** E E / D D D | 冒頭の反復音（ラーラ）が消え、上行に変形。後半は3連同音化 |
| 23 | G G **G** E E / G D D | 反復が3連化・「シド」の動きが下行に反転 |

＝**3/3 seed で原形の音程列（度数輪郭）が再現されない**。反復音の有無・位置も seed 依存で揺れる。原因は機構#4（render の反同音＋個別音CTスナップ）と後処理各パスが**動機を「音の列」でなく「個別の音」として上書きする**こと。**補完(complete_melody)経路＝「ユーザーの動機を種に発展」の約束が、反復音動機に対しては守られていない。**

### 3.5 コーパス・既存researchとの接続

- `docs/research/2026-07-09-melody-theory-gaps-and-plan.md` は既に「**同音反復ゼロの犯人＝`mkMotif` の move=0 潰し・実曲の同音23%との乖離はこの1行に集約**」と特定済み（同doc §1 #4・Step5）。本調査はこれに**render `:761`・後処理・アーティキュレーション不在**を加え、「1行の解除では出ない」ことを実測で示した（foreground no-op）。
- `docs/research/motif-extraction.md` §4.5（POP909実測）：主モチーフ平均**3.6音**・**2.4回/8小節**・占有**23%**・モチーフ内跳躍5%＝「短い動機を数回、逐語で戻す」実像。反復音を許した動機語彙はこの枠にそのまま載る。
- `docs/research/melody-corpus-findings.md` M9：同音回帰は上下対称・±3度内93%＝反復音は実曲の恒常成分。
- 直近の runs 修正（`:754-758`＝走句の同音潰れをスケール段移動で解消）は**走句（表面層）**の話で、本件（**動機層**の反復音）とはレイヤが別＝競合しない。

### 3.6 根本診断

1. **動機の表現力不足**：`Motif16 = {ons, mv, run}` は「リズム＋輪郭」であって「音程の図形＋反復音＋アーティキュレーション」ではない。mv=0 が意味を持てない。
2. **動機の非保存パイプライン**：render と後処理6パスが動機を個別音単位で上書きする。保護機構は「終止・カデンツ着地・単一頂点」だけ（`cadenceIdx`/`locked` の前例はある＝拡張可能）。
3. **選別の単一美学**：score はアーチ型の歌謡性のみを測る。フック性（反復・リズム特徴性・プロソディ）の観点が無い。
4. **アーティキュレーション層の不在**：ピッチとリズムは分離済みだが「発音長・切り・アクセント」の層が無い。

---

## 4. 再設計提案

設計思想との整合（前提）：**機械は候補/選択肢まで・仕上げは人間／改善は選択肢・ばらつき・足場に振る／新ノブは既定0=bit一致**。以下すべて「既定を壊さず新しいモード/ノブとして足す」を基本とする。ただし §3.6-2 の通り、**生成観（個別音上書き）の部分的転換なしに動機フックは成立しない**＝案Bを本丸として正直に置く。

### 案A：`hook` ノブ＝反復音の解禁ゲート

抑制機構#1〜#6を `hook: 0..1`（既定0）でゲート緩和する。

- `mkMotif :625`／`varyTail :686`：`if (m === 0 && r() >= hookKeep) m = ±1`＝move=0 を確率保持（hook=1 で保持率≈コーパス同音23%相当に較正）。
- `render :761`：**動機由来（mv[i]===0）の同音は素通し**、snap衝突由来の偶発同音のみ従来どおり散らす（区別は mv列参照で可能＝動機がソース・オブ・トゥルース）。
- 後処理 anti-unison `:992` と掃除 `:1159`：動機由来同音の位置集合（保護マスク）をスキップ。
- `score :657`：hook>0 時は `-|range-5|` と方向転換項を緩め、**反復音ペア数・リズム特徴性を加点**する hook 項を混ぜる（`runs`/`density` の再重み付けと同型のパターン）。

**効き**：中〜大（反復音が動機に入り、A/A''反復で「同じ場所に同じ反復音」が戻る）。**再利用**：既存ノブ様式（density/runs/foreground の前例）をそのまま踏襲。**破壊**：なし（hook=0 bit一致）。**規模**：小〜中（各ゲート数行＋保護マスク集合の導入 ~80-120行）。**限界**：保護マスクを持たない限り後処理が壊す＝マスク実装が実質必須で、それは案Bの部分実装に等しい。

### 案B：動機の一級市民化＝動機保存レンダ（本丸）

`Motif16` を明示的な動機オブジェクトへ拡張し、**「動機の中は音の列でなく図形」**として扱う。

- **表現**：`Motif { ons, deg[]（スケール度数列・0基準・反復音=同値）, art[]（legato|staccato|restAfter）, accent[]?, run[] }`。mv（差分）でなく**度数列（絶対形）**にするのが肝＝反復音・回帰（ラ…ラ）が第一級で表現でき、移高は全要素+kで済む。
- **動機保存レンダ**：現行の「個別音を CT/スケールへ snap」を、**動機単位の配置最適化**に置換＝「この動機をどのスケール段に移高すると（強拍のCT率・対ベース・音域の総コストが）最小か」を選ぶ。動機**内部**の音程関係は不変。ハーモニーへの適応は「音を曲げる」でなく「置き場所を選ぶ」（Schoenberg の sequence の計算的等価物。POP909 の移高反復＝popで最重要の展開技法、motif-extraction.md §1）。
- **保護契約**：動機の構成音は後処理（禁則・gap-fill・単一頂点・anti-unison・掃除）の**書き換え対象外**（`cadenceIdx`/`locked` と同じ流儀の `motifProtected: Set<index>`）。後処理は動機**間**の接続音だけを直す。禁則が動機内に出る場合は**音でなく移高をやり直す**（動機単位のリトライ）。
- **展開**：既存 varyTail/invert/fragment/sequence を動機オブジェクト上の演算として整理し、**exact repetition を第一級の展開**に追加（実測2.4回/8小節・23%占有を目標分布に）。sentence 形式（`:862-873`）は既にあるので、その動機供給源を差し替えるだけで「反復音動機×sentence」が成立する。
- **経路**：`motifMode: "preserve"`（仮）等の opt-in 新経路として並設＝既定は従来レンダ＝bit一致。補完（`completeMelody :1270`）は preserve を既定にする価値が高い（ユーザー動機の同一性保証＝§3.4 の是正）。

**効き**：大（§2.6 の要件1・2・3・5を構造的に満たす。オーナー例の往復再現が可能になる）。**再利用**：骨格・ブロック発展・後処理の枠組み・sentence・seedMotif は全部生きる。壊すのは render の内側と後処理の適用範囲だけ。**破壊**：新経路なら既定bit一致は守れるが、**二重レンダの保守コスト**が発生（旧 genMotifMelody/v1 と同じ「保持して回帰防止」戦略で許容範囲）。**規模**：大（週粒・耳セッション必須）。

### 案C：アーティキュレーション層の追加（リズム・ピッチ・発音の分離）

- 動機に `art[]` を持たせ、render 後の**独立した後段パス**で dur を変換：`legato=現行値／staccato=IOI×0.4／repeated-note=IOI×0.6（micropause）`（Bresin 実測値 §2.5 を初期値に）。`articulation: 0..1` ノブで適用強度（既定0＝dur無変換＝bit一致）。swing/humanize/backbeat が確立した「後段タイムマップ」様式そのまま。
- 反復音連打には自動で micropause を入れる（`articulation>0` 時）＝「ソッソッ」の物理的成立。velocity アクセント（連打頭を強く）は backbeat 実装（`:1252-1262`）の流儀を流用。
- 単独では反復音を**生まない**（ピッチ側の解禁＝案A/Bが前提）が、無しでは反復音フックが**聞こえない**＝A/Bの成立条件。

**効き**：単独では小、A/Bと合わせて必須。**破壊**：なし。**規模**：小（~60-100行）。

### 案D：選別スコアの多目的化＋観点別候補

- `score :657` を観点分解：`archScore`（現行）＋`hookScore`（反復音ペア数・リズム特徴性＝onset パターンの自己相似・動機圧縮率＝短い動機で全体を説明できる度合い）＋`prosodyScore`（連打の位置＝句頭/句末アンカー性）。
- `genMelodyCandidates`（`generate.ts :724`・既定k=3）を**観点別の最良**で返す：候補1=アーチ型（従来）・候補2=フック型・候補3=中間、のように。＝設計思想「選択肢を出す・ばらつきに振る」への直結。総合1点に畳まない（評価方針＝E-rule の原則とも一致）。
- 既定は従来スコアのみ＝bit一致。

**効き**：中（材料は mkMotif が作るので単独では出ない＝案A前提）。**規模**：小〜中。**価値**：オーナーの選択体験に直接効く（「アーチかフックか」を耳で選べる）。

### 4.1 比較表

| 案 | 音楽的効き | 既存資産の再利用 | 破壊/リスク | bit一致 | 規模 | 耳較正 |
|---|---|---|---|---|---|---|
| A: hookノブ | 中〜大（反復音が動機に入る） | ◎（ノブ様式の前例踏襲） | 低（ゲートのみ）だが保護マスク無しでは効き半減 | hook=0で完全一致 | 小〜中 | 要（hookKeep率・score緩和量） |
| B: 動機保存レンダ | **大（根治・往復再現）** | ○（骨格/発展/形式は全部生きる） | 中（新経路の保守・後処理契約の変更） | 新経路opt-inで一致 | 大 | **必須**（週粒・移高コスト重み） |
| C: アーティキュレーション | 単独小・A/Bの成立条件 | ◎（後段パス様式の前例踏襲） | 低 | articulation=0で一致 | 小 | 要（gate値40/60%の日本語歌もの適性） |
| D: 多目的選別 | 中（選択体験に直結） | ◎（genBest/candidates流用） | 低 | 既定従来スコアで一致 | 小〜中 | 不要（候補提示のみ） |

### 4.2 推奨＝B を本丸に、A+C で入り口を作る3段階

**Phase 1（クイックウィン・1-2日粒）＝案A+C**
`hook` ノブ（mkMotif/varyTail のゲート解除＋render `:761` の動機由来素通し＋**最小の保護マスク**＝動機由来同音のindex集合を後処理2箇所がスキップ）＋ `articulation` 後段パス。これだけで「反復音を含む動機が出る・連打が聞こえる」の最低ラインが立つ。mcp `gen_melody` に2ノブ追加（density/swing と同格）。

**Phase 2（本丸・週粒）＝案B**
動機オブジェクト（度数列＋art）と動機保存レンダの新経路。`completeMelody` を preserve 既定に（ユーザー動機の同一性保証）。sentence 形式と統合＝「反復音動機の提示→移高反復→断片化→カデンツ」。Phase 1 の保護マスクはここで動機保護契約に昇格＝捨てにならない。

**Phase 3（仕上げ）＝案D**
観点別スコアと観点別候補（アーチ型/フック型）。ROLE_PRESETS（`generate.ts :127-133`）へ hook の役割別既定値（例：chorus/prechorus で hook>0）を**耳セッション後に**入れる。

**正直な注記**：Phase 1 だけでは「材料は出るが組織は弱い」（§3.3 の教訓＝散発は組織にならない）。オーナー例レベルの「反復音フックが動機として立つ」は Phase 2 が本体。Phase 1 は独立価値（ばらつき増・アーティキュレーションは全メロに効く）を持つので先行する意味はある。

### 4.3 TDD受入条件（何を測れば「反復音フックが出る」と言えるか）

既存様式（ノブ未指定=bit一致の回帰テスト先行・統計スイープは項目別・総合点にしない）に従う。

1. **bit一致（回帰）**：`hook`/`articulation`/`motifMode` 未指定 → 既存出力と deep-equal・全既存テスト緑。
2. **動機反復音率**：hook=1・seed 1..100 スイープで、**動機（mkMotif出力）の move=0 率が 15-30% 帯**（コーパス23%±）。出力全体の隣接同音率は 20-30% 帯（現17.8%から有意増）。
3. **動機の組織化**：A塊の反復音位置が A'/A'' で**同位置再現 ≥90%**（現61%・かつ動機由来に限る）。指標＝ブロック内16分位置の同音ペア集合の一致率。
4. **往復再現（Phase 2 の合格線）**：オーナー例 `seedMotif`（A A B C A / B G G）→ 提示ブロックの**度数輪郭列が逐語再現**（移高は許す・3/3 seed）。§3.4 の逆転。
5. **アーティキュレーション**：articulation=1 で同音連打間 gap ≥ 0.05拍が100%・staccato音の dur/IOI ≈ 0.4±0.1。既定0で dur 完全不変。
6. **ガードレール維持**：E-rule（`evalMelody.ts :20-88`）の noForbiddenLeaps=1.0・gapFill ≥ 既定同等帯・inRange 維持（反復音解禁で跳躍回収・音域が壊れないこと）。単一頂点は**動機保護と衝突する場合は保護優先**＝契約変更を design.md に明記（頂点の複数化は反復音フックでは正常）。
7. **決定性**：同seed同出力（makeRng のみ・全ノブで）。

### 4.4 耳較正の要否

**必須**。理論スコアはメロの質を測れない（ガードレール止まり＝project-melody-eval-ceiling の確定知見）ため、以下は耳でしか決められない：
- hook の既定値と役割別プリセット値（入れすぎ＝くどい。コーパス23%は上限目安）
- articulation の gate値（Bresin の40/60%はピアノ実測＝歌もの/シンセでの適性は要確認）
- Phase 2 の移高コスト重み（和声適合 vs 動機同一性のトレードオフ）
- 「反復音＋スタッカート」が bass/drums 結線（drumLock/backbeat）と噛んだときのグルーヴ
サンプルは複数seed・進行違い・長短で出す（単一乱数で誤判断しない＝既定運用）。

---

## 5. 実装に最も重要なファイル（file:line）

すべて `apps/api/` 起点。行番号は 2026-07-10 時点。

| ファイル:行 | 何か |
|---|---|
| `src/music/melodyCells.ts:625` | mkMotif の move=0 潰し（抑制#1・hookゲート対象） |
| `src/music/melodyCells.ts:686-687` | varyTail の move=0 潰し＋跳躍クランプ（抑制#2） |
| `src/music/melodyCells.ts:635-658` | score＝単一美学の選別（抑制#3・案Dの改修点、return は `:657`） |
| `src/music/melodyCells.ts:727-783` | render＝近景レンダ。**`:761` の反同音**（抑制#4・新発見）と `:775-780` の dur レガート固定（抑制#7・案Cの挿入点） |
| `src/music/melodyCells.ts:974-1004` | 後処理①強拍CT＋anti-unison（`:992-1002`・抑制#5・保護マスク対象） |
| `src/music/melodyCells.ts:1159` | 弱拍掃除の反同音バイアス（抑制#6・保護マスク対象） |
| `src/music/melodyCells.ts:697-706, 877` | freeVary と foreground 発火＝move=0 を保持するが `:761` で無効（no-op の構図） |
| `src/music/melodyCells.ts:793, 498-507` | seedMotif 受口と extractMotif16＝補完の動機同一性（Phase 2 で preserve 既定に） |
| `src/music/melodyCells.ts:862-873, 710-718` | sentence 役割と fragment＝反復音動機の統合先 |
| `src/music/melodyCells.ts:1066-1091, 1093-1133` | cadenceIdx／expression の locked＝**保護マスクの実装前例**（掛留 `:1121-1123` は現状唯一の意図的同音） |
| `src/music/melodyCells.ts:1270-1319` | completeMelody＝往復再現テストの対象 |
| `src/music/generate.ts:486, 626` | genMelody opts 型と V2 呼び出し＝ノブ透過の配線点 |
| `src/music/generate.ts:123-133` | ROLE_PRESETS＝役割別 hook 既定値の将来の置き場（耳後） |
| `src/music/generate.ts:724-730` | genMelodyCandidates（既定k=3）＝案Dの観点別候補の挿入点 |
| `src/mcp.ts:520-524` | gen_melody スキーマ＝`hook`/`articulation` ノブの露出点 |
| `src/music/evalMelody.ts:20-88` | E-rule＝受入条件6のガードレール（gapFill `:37`） |
| `src/music/motifModelData.ts` | MOVE_TRANS_DATA＝move遷移の学習データ（unison を含む実分布・hookKeep 較正の参照） |

関連 research：`2026-07-09-melody-theory-gaps-and-plan.md`（#4 motif-driven前景・`:625` の先行特定）／`motif-extraction.md` §4.5（動機の実測統計＝目標分布）／`melody-corpus-findings.md` M9（同音回帰の実像）／`2026-07-10-melody-16th-scalar-run.md`（走句の同音潰れ修正＝別レイヤ）。
