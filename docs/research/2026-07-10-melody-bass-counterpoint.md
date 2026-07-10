# メロディ×ベースの対位：理論の裏取りと実装含意

目的＝将来 `gen_melody`（V2実体＝`apps/api/src/music/melodyCells.ts` の `genMotifMelodyV2`）に**ベーストラックの notes を入力**として渡し、メロ×ベースの**対位（反行・補完・衝突回避）**をバイアスとして効かせるための理論裏取り。**実装はしない＝調査とドキュメント化のみ**。最終更新 2026-07-10。

**本研究の核＝評価と生成の非対称を埋める**：エンジンには既に `analyze_voiceleading`（`apps/api/src/music/voiceLeading.ts`・#8 2026-07-09）＝メロ×低音の並行5度/8度・隠伏(直行)5度/8度・声部交差を数える**評価器**があるのに、**生成側（genMelody）はベースを一切見ない**（入力は frame+chords+seed+opts のみ・`generate.ts:403`）。評価できる指標を生成の選好関数に転用するのが本丸。

関連既存doc：[2026-07-10-melody-groove-drum-interaction](2026-07-10-melody-groove-drum-interaction.md)（姉妹研究＝メロ×ドラム。**設計原理「既定=係数0でbit一致・揃えすぎ禁止」を本docも踏襲**）・[melody-heuristics](melody-heuristics.md)・[skeleton-melody-musicology](skeleton-melody-musicology.md)（Urlinie/骨格）・[harmony-cadence-theory](harmony-cadence-theory.md)。

---

## ① 要約（到達点）

- **二声対位の定石＝「反行・斜行を優先、並行完全協和（5度/8度）は避ける」は pop でも“外声間”では概ね有効。** ただし禁止でなく**選好**。パワーコード/フォーク/EDM では並行5度は様式そのもの＝罰は「持続する並行完全協和」だけに限定し、単発は許す。根拠は Huron (2001) の知覚原理（tonal fusion＝完全協和の並行は2声が1声に溶けて独立性が消える）＝様式非依存の知覚事実。
- **外声（メロ×ベース）は和声の骨格＝最重要ペア。** クラシック和声法では「ソプラノ×バスの対位が曲の流れを決める」が通説。pop では**ベースがルート運び（機能的・保守的）**な分、上声は自由＝「ベースが跳ぶ（4度/5度のルート進行）時、メロは順次・逆向きに動く」が自然に反行を生む。実務ガイド（MusicRadar/Secrets of Songwriting）も「ベース＝もう一つのメロディ、反行が独立感を生む」と一致。
- **補完リズム＝姉妹研究Cと同じ原理（hocket/call-and-response）だが、ベース版は既定でほぼ充足済み。** 現 `genBass` は拍頭中心の疎なルート弾き＝メロの隙間を埋め合う関係は自然成立。効かせ所は「ベースがフィルで動く区間（将来の busy なベース）でメロを止める」の**小節別 density 変調**のみ＝ドラム版Cと**同一機構に統合**すべき（二重適用禁止）。
- **衝突回避が最も実利が大きい。** ①同時発音の **b9（interval%12==1・メロが上）**＝ジャズ理論の avoid note の根拠＝強拍の持続音でのみ罰する（経過音は許す＝既存 avoid-note 掃除と同じ流儀）。②**低音程限界（low interval limit）**＝現レジスタ設計（メロ≥55・ベース36-47）では構造的にほぼ抵触しない＝ガードだけ残す。③声部交差＝現設計では起き得ない（メロ下限55 > ベース上限47）。④ユニゾン/オクターブ重複＝単発は pop で普通（サビのメロ×ベース oct 重ねは効果）、**並行で続く**時だけ独立性が死ぬ。
- **乗せ方＝「候補音スコアに対ベース項を加算」が本命。** V2 は強拍CTスナップ・後処理①・placeNonForbidden など**既に候補列挙＋距離最小化**で書かれており、そこへ `counter`（仮称・0..1）係数の追加項を足すだけで**係数0＝追加項0＝argmin不変＝bit一致**が成る。生成後リライト方式は補助（評価器の spots をそのまま修正対象にできる利点）だが、修正が既存後処理（禁則・単一頂点・カデンツ保護）と衝突しやすい。文献上も両方式に先例あり（Farbood&Schöner=逐次確率、Herremans&Sörensen=生成後最適化）。

---

## ② 理論（項目別・各に出典URL）

### 1. 二声対位の運動原理と pop 転用

種対位法（Fux 系教程）の運動分類＝**反行(contrary)／斜行(oblique)／類似(similar)／並行(parallel)**。定石：
- **反行が最良**（変化と声部独立を保つ）・斜行も良い。完全協和（P5/P8/P1）へは**斜行か反行でのみ**進入。並行運動は不完全協和→不完全協和のみ可。
- **並行5度/8度の禁止**の理由＝「完全協和は溶け合いすぎて2声が1声に聞こえる＝旋律の独立性が犠牲になる」＋連続する安定響きが変化を殺す。
- 出典：[Open Music Theory: First-Species Counterpoint](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/)／[Wikibooks: Counterpoint/First Species](https://en.wikibooks.org/wiki/Counterpoint/First_Species)／[Wikiversity: First species counterpoint](https://en.wikiversity.org/wiki/Counterpoint/First_species_counterpoint)

**知覚的裏付け（様式非依存）**：Huron (2001) "Tone and Voice" は伝統的声部書法の規則群を6つの知覚原理から導出。並行完全協和の回避＝**tonal fusion**（完全協和ほど2音が融合し1つの音像になる：P1>P8>P5 の順に融合が強い）、類似運動の制限＝**pitch co-modulation**（同方向に一緒に動くと1つのストリームに統合されやすい）。つまり「並行5度/8度禁止」の実体は様式規則でなく**「2声を2声として聞かせたいなら」の知覚条件**。
- 出典：[Huron, Tone and Voice (Music Perception 19(1), 2001)](https://online.ucpress.edu/mp/article/19/1/1/62106/Tone-and-Voice-A-Derivation-of-the-Rules-of-Voice)／[同PDF](https://scispace.com/pdf/tone-and-voice-a-derivation-of-the-rules-of-voice-leading-3ikgvmsx01.pdf)

**pop での折り合い**：並行5度は中世・フォーク・ロック等の様式素材（パワーコード＝P5+P8 の並行そのもの）。「声部の独立が意図でない/重要でない様式では並行5度はOK」が現代の整理。pop/jazz も声部進行への配慮はある（程度がまちまち）＝**「外声のメロ×ベース」に限れば独立性が欲しい場面が多い**ので、罰は残すが弱く・様式ノブで切れるように。
- 出典：[Wikipedia: Consecutive fifths](https://en.wikipedia.org/wiki/Consecutive_fifths)／[School of Composition: What is wrong with parallel fifths?](https://www.schoolofcomposition.com/whats-wrong-with-parallel-fifths/)／[Wikipedia: Voice leading](https://en.wikipedia.org/wiki/Voice_leading)

### 2. 外声（メロ×ベース）の関係

- クラシック和声法の通説＝**外声（ソプラノ×バス）が和声情報の大半を運び、曲の流れを決める**。和声分析も「外声を読めば和音と転回が判る」。二声書法の教育（species）がそのまま「四声の外声ペア」の訓練になる建付け。
- 出典：[Puget Sound: Voice Leading](https://musictheory.pugetsound.edu/mt21c/VoiceLeading.html)／[Fiveable: Harmony and Voice Leading I](https://fiveable.me/ap-music-theory/unit-4/harmony-voice-leading-i/study-guide/0m8OiGeqjebWSd6bMZ0W)／[Wikipedia: Voice leading](https://en.wikipedia.org/wiki/Voice_leading)
- **pop 編曲での実際**：ベースは概ね**ルート運び**（コードのルートを拍頭で・4度/5度の根音進行）。このときメロは (a) ベースと逆方向へ動く（下降進行 over 上行ベース等）＝反行が「独立感・広がり」を生む、(b) ベースが保続（ペダル）ならメロは自由に動く＝斜行、(c) 同方向でも**異なる度数**（similar）なら並行の平板さは避けられる。実務ガイドは「ベースライン＝もう一つのメロディとして扱え」「反行を混ぜるとメロに自由と形が出る」。
- 出典：[MusicRadar: use motion to make a melody and bassline complement each other](https://www.musicradar.com/news/practical-music-theory-use-motion-to-make-a-melody-and-bassline-complement-each-other)／[Secrets of Songwriting: Melody and Bass need to work together](https://www.secretsofsongwriting.com/2010/05/10/melody-and-bass-they-need-to-work-together/)／[同: Using Bass Lines to Craft a Better Song Melody](https://www.secretsofsongwriting.com/2011/09/30/using-bass-lines-to-craft-a-better-song-melody/)／[Hooktheory: Counterpoint from Bach to James Blake](https://www.hooktheory.com/blog/counterpoint-music/)
- **含意**：pop は基本ホモフォニー＝メロを対位に律儀に従わせる必要はない。効かせ所は「**ベースのルートが動く強拍**」＝そこで反行/斜行を選好するだけで外声対位の背骨は立つ。

### 3. 補完リズム（rhythmic complementarity）＝メロ×ベース版

- 原理は姉妹研究Cと同一：**hocket**（一方の隙間を他方が埋める）・**call-and-response**（フレーズの呼応）。ベース実務では「常時弾くとメロを溺れさせる＝休符を入れよ・キーとなる歌詞ではミュート」「隙間（silence）がベースラインの最強の資産」＝**ベース側**が場を譲る教えとして確立。逆向き（ベースが動く時メロが止まる）は「ドラム&ベースが会話する隙間をメロが縫う」の裏返しで、walking フィル/ランの区間でメロが長音になる編曲慣習。
- 出典：[Mixed In Key: How to write a bassline](https://mixedinkey.com/captain-plugins/wiki/how-to-write-a-bassline/)／[Mastering.com: How to Write a Bassline](https://mastering.com/how-to-write-a-bassline/)／[Soundfly: Rhythm Section “Locking in”](https://flypaper.soundfly.com/write/rhythm-section-locking-in-with-bass-and-drums/)／[Wikipedia: Call and response](https://en.wikipedia.org/wiki/Call_and_response_(music))／[RBMA: The Evolution of Hocketing](https://daily.redbullmusicacademy.com/2018/02/the-evolution-of-hocketing/)
- **姉妹研究Cとの整合・重複整理（重要）**：ドラム版C＝「kick+snare の小節別 onset 密度でメロ density/runs を変調」。ベースは通常**キックにロック**する（実務の出発点＝キック位置にベース音）ので、**ベース密度はドラム密度と強く相関＝別々に係数を掛けると二重適用**になる。→ 密度相補は「**リズム隊（drums∪bass）の統合密度**」1本に畳み、係数も1つ（`converse`）にするのが正しい。ベース固有に残るのは**ピッチ次元**（運動方向・音程衝突）のみ＝本docの担当はそちら。

### 4. 衝突回避（同時発音の音程）

- **b9/半音衝突**：ジャズ理論の avoid note ＝「コードトーンの半音上に長く乗る音」。**♭9（短9度・interval%12==1 でメロが上）は最も不快な音程**とされ、テンションの可否も「コードトーンと♭9を作るか」で決まる。例外＝ドミナント上ではルート/5度に対する♭9は許容（3rd/7th に対しては不可）。経過音なら可・**強調（長音/強拍）**が駄目、という運用も確立＝既存の「弱拍の露出した濁り掃除」（melodyCells.ts 2026-07-09・passing は残す）と同じ流儀をベース実音に拡張すればよい。
  - 出典：[Jazz Library: What is an avoid note?](https://jazz-library.com/articles/avoid-notes/)／[The Jazz Piano Site: Avoid Notes](https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-improvisation/avoid-notes/)／[同: Available Tensions](https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chords/available-tensions/)
- **低音程限界（low interval limit）**：音程ごとに「これより低いと濁る」下限がある（例：短3度は C3/E♭3 あたりが下限・m2/M2 はさらに高い）。目安「5度/8度以外の音程の上音は E3 前後より下に置かない」。絶対則でなくリスク領域。
  - 出典：[Robin Hoffmann: Low Interval Limits](https://www.robin-hoffmann.com/dfsb/low-interval-limits/)／[Sweetwater: Low Interval Limit](https://www.sweetwater.com/insync/low-interval-limit/)／[Film Music Theory: What is a Low Interval Limit?](https://filmmusictheory.com/article/what-is-a-low-interval-limit/)
  - **現エンジンでの実態**：メロ音域＝tonic基準 [tpBase-5, tpBase+12]・tpBase∈[60,65] → 最低55（G3）。ベース＝36+pc（36-47）。同時対 = 最小8半音差・メロ側は E3 より常に上＝**LIL には構造的にほぼ抵触しない**。将来ベース生成がオクターブ上（48-59）で動くようになった時に効いてくる＝ガード式だけ用意しておく価値。
- **声部交差**：`analyzeVoiceLeading` は voiceCrossings を数えるが、現レジスタ（メロ≥55 > ベース≤47）では発生し得ない＝生成側の対策不要（評価器が将来の入力＝実録りMIDI等で意味を持つ）。
- **ユニゾン/オクターブ重複**：単発の oct 一致は pop では強調の技法（サビでベースとメロの pc 一致は force を出す）。問題は tonal fusion の観点で**並行して続く**とき（=parallelOctaves の検出対象そのもの）。単発を罰しない・連続を罰する、で評価器と整合。

### 5. 生成アルゴリズムへの乗せ方（方式比較の文献）

- **生成後リライト（最適化）方式**：Herremans & Sörensen は Fux 規則（旋律18+和声15）を 0..1 のサブスコアに量子化した**重み付き目的関数**にし、変数近傍探索(VNS)で生成後の楽譜を反復改善（Optimuse/FuX）。長所＝規則を評価関数として一元管理（＝我々の analyzeVoiceLeading をそのまま目的関数に使える形）。短所＝反復コスト・他の不変量（終止保護等）を壊さない move 設計が必要。
  - 出典：[Herremans & Sörensen, Composing fifth species counterpoint with VNS (ESWA 2013)](https://www.sciencedirect.com/science/article/abs/pii/S0957417413003692)／[同 preprint PDF](http://www.dorienherremans.com/sites/default/files/paper_preprint_cp5.pdf)／[first species VNS (RG)](https://www.researchgate.net/publication/239805642_Composing_first_species_counterpoint_with_a_variable_neighbourhood_search_algorithm)
- **逐次候補選好（in-loop）方式**：Farbood & Schöner は Palestrina 対位を Markov 連鎖で捉え、cantus firmus 条件付きで**次音の確率分布**として対位規則を表現・合成。＝「候補音のスコアに対位項を足す」方式の先例。長所＝一発生成・決定点が明確。短所＝局所判断（後の並行を先読みしない）。
  - 出典：[Farbood & Schöner, Palestrina-Style Counterpoint Using Markov Chains (ICMC 2001)](https://www.media.mit.edu/publications/analysis-and-synthesis-of-palestrina-style-counterpoint-using-markov-chains/)／[PDF](https://opera.media.mit.edu/papers/MFarbood-ICMC.pdf)
- **整数計画による厳密制約**の先例もある（並行禁止をハード制約に）＝我々には過剰。
  - 出典：[Formulating First Species Counterpoint With Integer Programming](https://www.academia.edu/119791745/Formulating_First_Species_Counterpoint_With_Integer_Programming)

---

## ③ 妥当性評価（効く条件・副作用）

### 効く条件
- **ベースのルートが動く強拍**が主戦場。現 `genBass` は「拍頭=ルート・間=5度」＝コードチェンジ点で必ず動く。そこでメロが同方向・完全協和着地（例：ベース C→G と同時にメロも G 系へ上がる）になった時だけ矯正が要る＝**機会は少なく、直せば効きが分かる**。`analyzeVoiceLeading` の代用低音（chords ルートを36+pcに置く）でも同じ判定ができる＝**ベーストラックが無い時も chords から擬似ベースで駆動可能**（http.ts:207 と同じ手）。
- **b9 掃除は常時安全に効く**：既存の avoid-note 掃除は「コードpc集合の半音上」だけを見る＝ベースが5度を弾いている瞬間の衝突（コード外の実音）は見えていない。ベース実音参照で穴が埋まる。
- **oct/ユニゾン重複**は「サビで意図的に重ねる」用途もある＝符号付きノブ（罰にも報酬にもなる）が正しい。

### 副作用（対位に律儀すぎると歌メロが死ぬ）
1. **反行の強制はメロの輪郭を壊す**。V2 の設計は「モチーフの move 列をコミットして反復（同一性）」が核＝対ベース項が強いと **A と A' で違う音に snap され反復が崩れる**。係数は弱く（tie-break〜距離項の2-3割）、かつ**モチーフの mv 列自体は触らない**（snap 先の選好のみ）に限定すべき。
2. **並行5度の全排除は pop らしさを削る**。持続する並行だけ罰する（連続2機会以上）・単発は無視。パワーコード的な「メロがルートの5度上をなぞる」サビは様式として有効。
3. **補完リズムの二重適用**（③-3 の通り）＝ドラム版Cと必ず統合。ベースだけ見て density を下げると、ドラム版と重なって間延びする。
4. **休符/斜行の過大評価**：analyzeVoiceLeading は「動かない遷移は機会でない」と数える＝生成側で斜行ばかり選ぶとスコアは上がるがメロは棒立ち。**スコアを最大化しない**（ガードレールとしてのみ使う）＝[melody-eval-ceiling] の教訓と同じ。
5. **後処理パイプとの相互作用**：V2 の後処理は 強拍CT→禁則→gap-fill→単一頂点→検証→カデンツ→表情→掃除→push→swing→humanize の順で不変量を守る設計。対ベース項を**複数のパスにばら撒くと収束が読めない**＝挿入点は「強拍snap（render + 後処理①）」と「弱拍掃除の拡張」の**2点に限定**が安全。

---

## ④ 実装含意 / アルゴリズム素案（擬似コード）

### 入力形と結線
```
gen_melody opts に追加：
  bass?: {pitch, start, dur}[]   // ベーストラックの notes（無ければ chords ルートの擬似低音 36+pc で代用可＝評価器と同じ）
  counter?: number  // 0..1 対位係数。既定0＝追加項ゼロ＝argmin不変＝bit一致（push/swing/humanize と同じ流儀）
generate.ts の V2 分岐で bassPitchAt(t) 閉包を作り genMotifMelodyV2 へ渡す（chordPcsAt と同じパターン）：
  bassPitchAt(t) = 時刻tで鳴っているベース音（voiceLeading.ts の pitchAt と同一ロジック＝評価と生成で同じ標本化）
```

### 共通：対ベース項（analyzeVoiceLeading の指標をそのまま選好関数化）
```
// 候補 c を時刻 t に置くときの対位ペナルティ。prevMel/prevBass = 直前標本（評価器と同じ隣接遷移）。
counterTerm(c, t, prevMel, prevBass):
  bl = bassPitchAt(t);  if bl == null: return 0
  iv0 = (prevMel - prevBass) mod 12; iv1 = (c - bl) mod 12   // 評価器と同じ「隣接標本の音程対」
  du = c - prevMel; dl = bl - prevBass                        // メロ/ベース各声部の進行
  pen = 0
  // (1) 並行完全協和（評価器の parallelFifths/Octaves と同じ条件）
  if sameDir(du, dl) and iv0 == iv1 and iv1 in {0, 7}: pen += W_PAR      // W_PAR ≈ 3
  // (2) 隠伏（同方向＋上声跳躍で完全協和へ突入＝directFifths/Octaves と同条件）
  else if sameDir(du, dl) and |du| > 2 and iv1 in {0, 7}: pen += W_DIR   // W_DIR ≈ 1.5
  // (3) b9衝突（強拍・非経過のみ。ドミナントの root/5th 相手は免除＝jazz運用）
  if iv1 == 1 and onStrong(t): pen += W_B9                               // W_B9 ≈ 4
  // (4) 反行ボーナス（ベースが動く時、逆方向を優遇＝罰でなく負項）
  if dl != 0 and sign(du) == -sign(dl): pen -= W_CONTRA                  // W_CONTRA ≈ 0.5
  return pen
```

### 挿入点A（本命）：V2 後処理①「強拍CTスナップ＋anti-unison」
現行（melodyCells.ts 889-904行）は既に**候補列挙＋距離最小化**：コード音候補 q を走査し `d=|q-tgt|` 最小を選ぶ。ここに1項足すだけ：
```
d = |q - tgt| + counter * counterTerm(q, t, prevMel, prevBass)
```
- **counter=0 で完全に従来と同じ argmin＝bit一致**（tie-break も現行「d<bd のみ更新」を維持）。
- 強拍＝コード音制約は不変（規約(b)）。対ベース項は「どのコード音か（3rd寄せ/5th寄せ/oct選び）」だけを変える＝**和声も輪郭も大きくは動かない**のに外声対位が立つ、が狙い。

### 挿入点B：render() の強拍 snap（`p = ctOf(want, pcs)`）
`ctOf` は最近接1点を返す＝候補スコア化に書き換え（chord pc 全候補から `|cand-want| + counter*counterTerm(...)` 最小）。挿入点Aより上流＝モチーフ反復の内部に効くため、**counter が強いと反復同一性を崩す**（③-1）。A で足りなければ導入、の二段構え。

### 挿入点C：弱拍の濁り掃除の拡張（b9のみ）
```
// 既存 isClash(p,t) = 「コードpcの半音上」。ベース実音を追加：
isClashBass(p, t) = bassPitchAt(t) != null and (p - bassPitchAt(t)) mod 12 == 1
// 既存掃除ループの isClash 判定に OR で足す。passing（両側step同方向）は残す既存条項をそのまま流用。
```
これは係数でなく**判定条件の拡張**＝bass 未指定なら従来と bit一致。最も低リスクで実利あり。

### 代替：生成後リライト方式（比較）
```
counterpointRewrite(notes, bass, coef):
  rep = analyzeVoiceLeading(notes, bass)        // 既存評価器をそのまま流用
  for spot in rep.spots:                        // 違反箇所だけ局所修正
    i = spot.t の弱拍メロ音（強拍・終止・カデンツ・頂点は触らない）
    placeNonForbidden(i, target=現ピッチ, anchors=[隣接音, bass音]) 相当で最寄り安全音へ
  （coef = 修正を適用する確率 or 修正回数上限）
```
- 長所：評価器と**定義が完全一致**（同じ関数で検出）・生成コアに手を入れない。
- 短所：修正が後処理の不変量（単一頂点・カデンツ着地・禁則）と衝突しやすく、**再検証ループが要る**（fixForbidden の収束ループと同じ構図が増える）。V2 は「後処理の順序と規約」が既に精密なので、**パスを増やすより既存パスの選好に係数を足す（挿入点A/C）方が筋が良い**。
- 折衷＝**生成N本→analyzeVoiceLeading でランク**（genBest の N=12 選別と同じイディオム・生成コード不変）。ただし seed 間の差は対位以外の質も動く＝ランク軸の1つに留める。

### 補完リズム（密度相補）＝ドラム版Cへ統合
ベース onset 密度は単独で使わず、姉妹研究Cの `onsetDensity[bar]` に `+ 0.5*|bassOnsets[bar]|`（キックとの重複 onset は1回だけ数える）として合流。係数は `converse` 1本のまま＝**二重適用を構造的に禁止**。

### 既定値の提案
- `counter` 既定 0（bit一致）。効かせる時も 0.2-0.4 目安（距離項1半音 ≈ W_CONTRA 2個分の弱さ）。
- b9 掃除（挿入点C）は bass 入力がある時**常時 on** でよい（濁りは様式でなくバグに近い）。ただし passing 免除・「安全候補が無ければ残す」の既存防御を必ず流用。
- 耳確認必須（[feedback: modeは生成の層をまたいで結線]）：counter 0 / 0.3 / 1.0 の3水準で同一seed比較＝反復同一性が崩れていないかを聴く。

---

## ⑤ 残論点・要検証

1. **W_PAR/W_DIR/W_B9/W_CONTRA の較正**＝理論からは比しか出ない。同一seedで counter スイープ→ analyze_voiceleading スコアと耳の両方で決める（スコア最大化はしない＝ガードレール運用）。
2. **prevBass/prevMel の標本化粒度**＝評価器は onset 和集合で標本化。生成中は「決定点の直前 onset」で近似するか、評価器と同じ pitchAt を使うか。ズレると「生成では良いのに評価で違反」が残る＝**評価器の pitchAt を export して共用**が安全。
3. **並行「持続」の判定窓**＝単発許容・連続2機会以上で罰、の「機会」の数え方（評価器は du==0&&dl==0 を機会から除外）。生成側で同じ定義を保てるか。
4. **擬似ベース駆動の既定**＝bass 未指定時に chords ルート(36+pc)で counterTerm を駆動するか（評価器はそうしている）。生成まで既定で効かせると「bass無し生成」の挙動が変わる＝**既定は bass 明示時のみ**が安全側。
5. **ドラム版との統合順序**＝密度相補（converse）はドラムdoc実装時に bass onset を合流させる設計で先に合意しておく（後から足すと係数の意味が変わる）。
6. **将来のベース高域化**＝ベースが 48-59 域で動く生成になったら low interval limit ガード（メロ－ベース間 m2/m3 が E3 以下）と声部交差ガードが実効化する。voiceCrossings が0でなくなった時が導入タイミング。
7. **他者コーパスでの実測**＝POP909 等からメロ×ベース（無ければメロ×コードルート）の運動比率（反行/斜行/類似/並行）と同時 b9 率の**統計のみ**抽出→ counter 既定強度と W 比の教師に（リテラル旋律非保存・著作権方針どおり）。

---

## 出典（本文内URLの再掲・グループ別）
- **対位法の運動規則**：[OMT First-Species Counterpoint](https://viva.pressbooks.pub/openmusictheory/chapter/first-species-counterpoint/)／[Wikibooks First Species](https://en.wikibooks.org/wiki/Counterpoint/First_Species)／[Wikiversity First species](https://en.wikiversity.org/wiki/Counterpoint/First_species_counterpoint)
- **知覚的裏付け**：[Huron, Tone and Voice (Music Perception 2001)](https://online.ucpress.edu/mp/article/19/1/1/62106/Tone-and-Voice-A-Derivation-of-the-Rules-of-Voice)／[同PDF](https://scispace.com/pdf/tone-and-voice-a-derivation-of-the-rules-of-voice-leading-3ikgvmsx01.pdf)
- **並行5度と pop**：[Wikipedia Consecutive fifths](https://en.wikipedia.org/wiki/Consecutive_fifths)／[School of Composition parallel fifths](https://www.schoolofcomposition.com/whats-wrong-with-parallel-fifths/)／[Wikipedia Voice leading](https://en.wikipedia.org/wiki/Voice_leading)
- **外声の優位・pop実務**：[Puget Sound Voice Leading](https://musictheory.pugetsound.edu/mt21c/VoiceLeading.html)／[Fiveable Harmony & Voice Leading](https://fiveable.me/ap-music-theory/unit-4/harmony-voice-leading-i/study-guide/0m8OiGeqjebWSd6bMZ0W)／[MusicRadar melody×bassline motion](https://www.musicradar.com/news/practical-music-theory-use-motion-to-make-a-melody-and-bassline-complement-each-other)／[Secrets of Songwriting melody & bass](https://www.secretsofsongwriting.com/2010/05/10/melody-and-bass-they-need-to-work-together/)／[同 bass→melody](https://www.secretsofsongwriting.com/2011/09/30/using-bass-lines-to-craft-a-better-song-melody/)／[Hooktheory counterpoint](https://www.hooktheory.com/blog/counterpoint-music/)
- **補完リズム**：[Mixed In Key bassline](https://mixedinkey.com/captain-plugins/wiki/how-to-write-a-bassline/)／[Mastering.com bassline](https://mastering.com/how-to-write-a-bassline/)／[Soundfly locking in](https://flypaper.soundfly.com/write/rhythm-section-locking-in-with-bass-and-drums/)／[Wikipedia call and response](https://en.wikipedia.org/wiki/Call_and_response_(music))／[RBMA hocketing](https://daily.redbullmusicacademy.com/2018/02/the-evolution-of-hocketing/)
- **衝突回避**：[Jazz Library avoid notes](https://jazz-library.com/articles/avoid-notes/)／[TJPS Avoid Notes](https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-improvisation/avoid-notes/)／[TJPS Available Tensions](https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chords/available-tensions/)／[Robin Hoffmann LIL](https://www.robin-hoffmann.com/dfsb/low-interval-limits/)／[Sweetwater LIL](https://www.sweetwater.com/insync/low-interval-limit/)／[Film Music Theory LIL](https://filmmusictheory.com/article/what-is-a-low-interval-limit/)
- **生成アルゴリズム**：[Herremans & Sörensen VNS 5th species (ESWA)](https://www.sciencedirect.com/science/article/abs/pii/S0957417413003692)／[同 preprint](http://www.dorienherremans.com/sites/default/files/paper_preprint_cp5.pdf)／[first species VNS](https://www.researchgate.net/publication/239805642_Composing_first_species_counterpoint_with_a_variable_neighbourhood_search_algorithm)／[Farbood & Schöner ICMC 2001](https://www.media.mit.edu/publications/analysis-and-synthesis-of-palestrina-style-counterpoint-using-markov-chains/)／[同PDF](https://opera.media.mit.edu/papers/MFarbood-ICMC.pdf)／[Integer Programming counterpoint](https://www.academia.edu/119791745/Formulating_First_Species_Counterpoint_With_Integer_Programming)
