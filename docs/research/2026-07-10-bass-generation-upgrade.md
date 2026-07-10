# ベース生成の強化：ドラムに噛む・音楽的なベースラインの理論裏取り

目的＝`genBass`（`apps/api/src/music/generate.ts:919-953`）を「ドラムに噛む・音楽的なベースライン」へ強化するための理論裏取り。将来 `gen_bass` に**ドラムのステップ列（genDrums 出力＝16分グリッドの kick/snare lanes）を入力**として渡す前提。**実装はしない＝調査とドキュメント化のみ**。最終更新 2026-07-10。

姉妹doc：[2026-07-10-melody-groove-drum-interaction](2026-07-10-melody-groove-drum-interaction.md)（メロ×ドラム）。**本docは同じ設計原理を踏襲**＝①既定=係数0で従来bit一致②「揃えすぎ禁止」（Keil participatory discrepancies／phenomenal accent 理論、詳細は姉妹docの[②理論](2026-07-10-melody-groove-drum-interaction.md#-理論キーワード別各に出典url)）③ドラム content 無しなら全て無効。他関連：[2026-07-07-drums-bass-extraction-plan](2026-07-07-drums-bass-extraction-plan.md)（実録音からのベース抽出＝本docの「生成」の逆方向）・[sixteenth-rhythm](sixteenth-rhythm.md)（シンコペの2段モデル）。

---

## ① 要約（到達点）

- **ベース×キックのロック＝メロ以上に強く支持されるが「完全一致」は定石ではない。** 実務の合意は「完全ユニゾンは grooveの瞬間として必要だが、曲全体でやると tension&release が死ぬ」。ロックの実像は**「キックのオンセット集合を骨格として共有しつつ、ベースが埋め/食い/休符で差分を作る」**。ジャンル差が大きい：ファンク=相互に絡む interlock、ポップ/ロック=1・3拍で衝突同期＋8分駆動、EDM(four-on-the-floor)=**逆相**（キックの裏8分にベース）すらある＝「ロック係数」は符号付きが正しい。
- **知覚的根拠が強い（メロのA/B/Cより硬い）**：低音ほどタイミング知覚が鋭い（Hove 2014 PNAS）・ビートの神経同調は低周波音で増強される（Lenc 2018 PNAS）＝**「リズムは低音が運ぶ」は聴覚系の性質**。ベースこそドラム結線の本命で、`genBass` がドラム非参照な現状は理論的に一番の欠落。
- **語彙＝ルート運びだけでは不足、だが増やす方向は確立済**：ルート/5度/オクターブ（安全系）＋**アプローチノート**（コードチェンジ直前の半音/全音接近＝「beat 4=接近音・beat 1=ターゲット」の定石）＋経過音。ポップスは「ルート主体＋チェンジ際だけ動く」が実務の中心。
- **ベース×スネア＝「音を置く」より「音の切れ目を合わせる」**：2・4拍で穴を空ける/音価をスネアに揃えて切ると backbeat が抜けて groove が出る（"leave a hole on 2 and 4"）。ゴーストノート（低velocityのデッドノート）はファンクの推進力＝velocity対応が前提（現行 bass notes は vel 無し）。
- **音域・声部＝現行 `36+pc` 固定は2つの副作用**：(a)ルートより5度が下に出る転回（例 root=G43→5度D38＝完全4度下）が**持続音だと 6/4（第二転回）的な不安定**を生む（交互ベースの図形内なら idiomatic で問題なし）。(b)オクターブ跳躍の語彙が物理的に存在しない（コメントに「たまにオクターブ上」とあるが実装は pc を 36..47 に張り付けるのみ）。低音域では密な音程が濁る（low interval limit）ので、動きは5度/オクターブ優先・3度は上のオクターブで。
- **設計方針＝メロ研究と同型が成立する**：メロのA（キック食い）のベース版は「食い」でなく**「オンセット集合の共有（coincidence）」が主・食い（anticipation）が従**。既定=係数0で従来bit一致、`kickLock`（符号付き）/`approach`/`snareGap` の3ノブ素案を④に。

---

## ② 理論（キーワード別・各に出典URL）

### ベース×キックのロック＝ locking in / pocket（調査1）
- **「lock in with the kick」の多義性**：実務家の間でも「キックの位置だけ弾く」「キック位置＋α」「1拍目だけ合わせる」「キックを補完する何か」まで幅がある（[TalkBass: The kick drum's relation to the bass?](https://www.talkbass.com/threads/the-kick-drums-relation-to-the-bass.872563/)）。＝「lock=完全一致」は俗説で、**一致の度合いはスタイルパラメータ**。
- **完全ユニゾンの功罪**：ユニゾンの瞬間は groove と結束に必要だが、全編ユニゾンは装飾の自由と tension&release を殺す（[Soundfly: Rhythm Section — "Locking in" with Bass and Drums](https://flypaper.soundfly.com/write/rhythm-section-locking-in-with-bass-and-drums/)）。姉妹docの「揃えすぎ禁止」（[Keil PDs](https://www.researchgate.net/publication/229720708_Participatory_Discrepancies_and_the_Power_of_Music)）と同じ結論が実務側からも出る。
- **実曲の実像（制作解説）**：Chic「Good Times」はベース句の**1音目と3音目だけ**キックが重なる＝部分一致で「フレージング感」を作る。Bruno Mars「24K Magic」は1・3拍で衝突同期。逆に Robert Miles「Children」（ドリームハウス）は4つ打ちキックの**裏8分にベースを置く**＝一致ゼロで緊張を作る（[MusicRadar: kick & bass close listening](https://www.musicradar.com/tutorials/music-production-tutorials/how-close-listening-to-chic-and-a-selection-of-other-artists-can-teach-us-about-the-integral-relationship-between-the-kick-and-bass)）。
- **pocket の作法**：ベーシストは「キックパターンに合わせ、音価を選び、ダウンビートを信頼できるものにする」ことで pocket を作る。funk では「隙間もリズムの一部」（[Soundbrenner: Pocket](https://www.soundbrenner.com/blogs/articles/pocket)／[Soundbrenner: Funk groove](https://www.soundbrenner.com/blogs/articles/funk-groove)）。
- **EDM の分業**：kick と bass は周波数もオンセットも**衝突させない設計が第一**（sidechain は後処理）。「音選びと配置で衝突を減らせば sidechain は一滴で足りる」（[Samples From Mars: sidechain kicks](https://samplesfrommars.com/blogs/tips-tricks/18999227-how-to-use-sidechain-compression-to-make-kicks-cut-through-the-mix)／[Audient: beginner's guide to sidechaining](https://audient.com/tutorial/the-beginners-guide-to-sidechaining/)）。＝EDM系 mood では「ロック」でなく「回避（offbeat）」が定石。

### 低音がリズムを運ぶ知覚的根拠（調査1の土台・ベース版の「なぜ」）
- **Hove et al. 2014 (PNAS)**：同時2声のタイミング逸脱検出は低い声部で優位・タッピング同期も低声部に引かれる。機序は蝸牛レベル＝「重要なリズム情報を最低声部に置く」慣習は聴覚系の性質に根ざす（[PNAS 10.1073/pnas.1402039111](https://www.pnas.org/doi/10.1073/pnas.1402039111)／[PMC4104866](https://pmc.ncbi.nlm.nih.gov/articles/PMC4104866/)）。
- **Lenc et al. 2018 (PNAS)**：ビートの神経トラッキング（周波数タグ付けEEG）は**低周波音で増強**＝ベース帯域がビート知覚を駆動（[PNAS 10.1073/pnas.1801421115](https://www.pnas.org/doi/10.1073/pnas.1801421115)）。
- **microtiming の実測（Danielsen/RITMO）**：groove 演奏の onset 非同期は 0〜50ms 程度、検出閾は 20〜30ms。ベース×ドラムの非同期（±80ms 操作）は瞳孔径（認知負荷）とタッピング安定性に効く（[Danielsen et al., All About That Bass Drum? (Ann NY Acad Sci)](https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/nyas.70306)／[Microtiming and Mental Effort (RG)](https://www.researchgate.net/publication/337896378_Microtiming_and_Mental_Effort_Onset_Asynchronies_in_Musical_Rhythm_Modulate_Pupil_Size)／[ZGMTH: Microtiming in Early Funk](https://www.gmth.de/zeitschrift/artikel/1224.aspx)）。＝グリッド上の「どのstepに置くか」（本doc）と ms オーダーの humanize（[2026-07-09-brushup-audit-5areas](2026-07-09-brushup-audit-5areas.md) E）は別層で、本docは前者のみ扱う。

### ベースライン構築の語彙（調査2）
- **土台＝ルート、次いで5度・オクターブ**：「ルート弾きは全員の出発点」「root+5th はルート単独の次に頻出のパターンで、カントリー/ポルカから classical〜metal まで遍在」（[MusicRadar: write basslines around root notes](https://www.musicradar.com/how-to/write-bassline-root-notes)／[StudyBass: Roots and Fifths](https://www.studybass.com/lessons/common-bass-patterns/roots-and-fifths/)／[Yamaha: Roots, Fifths and Octaves](https://hub.yamaha.com/guitars/bass/the-importance-of-roots-fifths-and-octaves-in-bass-playing/)）。5度は品質（maj/min）非依存で「ほぼ常に機能する」安全音。
- **オクターブ跳躍**：同じ pc のままエネルギーを注入する定番。「上へ跳ぶ=エネルギーが上がる合図、下へ跳ぶ=コードが巨大に感じる」（[MasterClass: How to Write a Bass Line](https://www.masterclass.com/articles/how-to-write-a-bass-line)／[Native Instruments: How to write a bassline](https://blog.native-instruments.com/how-to-write-a-bassline/)）。ディスコ/ハウスの8分オクターブ往復は様式そのもの。
- **アプローチノート（コードチェンジ直前の接近）**：ターゲット（次コードのルート）へ半音上/下（chromatic）・全音（scale）・5度上（dominant）から接近する。**「beat 1=ターゲット、beat 4=接近音」がウォーキングの骨法**で、半音接近は弱拍に置けば out-of-key でも耳が許す（[StudyBass: Chromatic Approach Notes](https://www.studybass.com/lessons/common-bass-patterns/chromatic-approach-notes/)／[TalkingBass: Using Approach Notes](https://www.talkingbass.net/approach-notes/)／[How To Play Bass: Five Types of Approach Notes](https://how-to-play-bass.com/five-types-approach-notes)）。ポップスでも「チェンジ際だけ動く」形で常用（[MusicRadar 同上]＝「常に次のルートをターゲットにするから外れ音が許される」）。
- **ウォーキング的経過**：コードトーン（R/3/5）＋スケール音＋半音経過で次のルートへ線を引く（[TalkingBass: Walking Bass Lines #2 — Chord Tones](https://www.talkingbass.net/walking-bass-lines-chord-tones/)／[Fundamental Changes: What is a Walking Bass Line?](https://www.fundamental-changes.com/walking-bass-line/)）。ジャズ専有ではなく rock/R&B/country でも使う（同上）。ポップスでは常時ウォークでなく**フィル（小節の後半だけ歩く）**が現実的。
- **3度の使い分け**：ラインの中間で使うと旋律的になるが、小節頭で3度を弾くと第一転回（slash chord）に聞こえる＝転回はアレンジ判断であり生成器の既定にはしない。「深い音域では power chord的（R/5/8）に、上がるほど3度/7度を導入」が低域の定石（[BassOx: Why Do Bass Chords Sound Muddy?](https://www.bassox.com/why-do-bass-chords-sound-muddy/)）。

### ベースとスネアの関係（調査3）
- **バックビートは「置く」より「切る/空ける」**：「2・4に穴を残すとスネアの crack が抜けて groove が生まれる」「音の終端をスネアの backbeat にロックしてみよ」＝**音価の設計**が本丸。verse では2・4で切り、曲が進むにつれ長く保持して build する技法も（[Premier Guitar: The Space Between — A Bassist's Guide to Note Length](https://www.premierguitar.com/the-space-between-a-bassists-guide-to-note-length)）。周波数的にもスネア帯（100-200Hz）とベース上部が被るため「低く・邪魔しない」が推奨（同上）。
- **弾く場合もある**：ベースが2・4を弾く/食うのはファンクのシンコペとして普通（スネアと同時に鳴っても低域が主役を奪わなければ成立）。＝メロのB（[姉妹doc③B](2026-07-10-melody-groove-drum-interaction.md)）と同じく「合わせる/外す」は両方が技法で、既定は「外す（穴/切り）」が安全。
- **ゴーストノート（デッドノート）**：主アクセント間の極小音量の音。「featured でなく felt」。ファンクベースの percussive な feel はミュートしたゴーストノートに由来（[Soundbrenner: Ghost notes](https://www.soundbrenner.com/blogs/articles/ghost-notes)／[Wikipedia: Funk](https://en.wikipedia.org/wiki/Funk)）。**前提=velocity**：現行 bass notes は vel フィールド無し（drums lanes は vel あり）＝ゴースト実装には notes への vel 追加が先行条件。

### リズムの語彙化＝fig をドラム由来に（調査4）
- メロ研究のA（キック食い）は「push の対象拍を実キックに差し替える」だったが、**ベースは一段強い関係が成立する**：ベースのリズム骨格そのものをキックのオンセット集合から導出してよい（「bassists create pocket by matching the drummer's kick pattern」[Soundbrenner: Pocket](https://www.soundbrenner.com/blogs/articles/pocket)）。メロでは「全オンセット整列=ユニゾン化で平板」が副作用だったが、ベース×キックのユニゾンは**土台として許容度が高い**（低域は同帯域で分業する方が濁らない）。
- ただし上記の通り**完全一致は定石でない**ので、「キック集合を骨格に、(a)拍頭ルートの保証（キックが無くても1拍目は弾く＝"the one"）、(b)間引き（sparse mood）、(c)追加（8分駆動・オクターブ往復・アプローチノート）で変形」が正しい導出。4つ打ち検出時は offbeat モード（キックの裏8分）を別語彙として持つ（[MusicRadar 同上・Robert Miles例]）。
- **現行 fig 語彙との関係**：`BASS_FIGS`（rhythm.ts:42-47＝♩/二分/♪♪/付点）は「拍単位の図形を毎拍頭から敷く」方式で、**小節を跨ぐシンコペ・拍頭を外すオンセットが構造的に出せない**。ドラム由来導出はこの制約を自然に外す（キックが step6=「2拍目の裏」にあればベースもそこに置ける）。fig 語彙は「ドラム無し時の既定経路」として温存（bit一致の要）。

### 音域・声部（調査5）
- **音域の慣習**：エレキベースの実音は E1(41Hz)〜G2(98Hz) が開放弦帯、実用上限は G3 前後（[guitartuner.io: Bass Guitar Tuning](https://guitartuner.io/resources/bass-guitar-tuning)）。現行の `36+pc`（C2..B2）は帯域としては妥当だが**1オクターブに張り付き**＝オクターブ跳躍・音域アーチが不可能。
- **low interval limit**：低域ほど音程が知覚的に潰れ濁る。5度/オクターブは低くても分離するが、2度/3度は濁る（[BassOx 同上]）＝経過音/3度は音域の上側（C3付近以上）で使う。
- **5度下の転回感**：交互ベース（R-5-R-5）では**5度をルートの下に置く（=4度下）のが伝統的で idiomatic**（[Wikipedia: Alternate bass](https://en.wikipedia.org/wiki/Alternate_bass)）＝図形の中で振動する限り転回とは聞かれない。しかし**持続音や小節頭で5度が最低音に座ると第二転回（6/4）＝不安定**：「5度がベースだと和音の同一性の規定が弱く、bass との4度が要解決の緊張を作る。強拍での使用は避けられる」（[Wikipedia: Second inversion](https://en.wikipedia.org/wiki/Second_inversion)／[David Kulma: Six-Four Chords](https://davidkulma.com/musictheory/secondinversiontriads)）。**現行コードの副作用**＝`(root+7)%12` を 36..47 窓に張るため root=G(43) の5度 D は 38＝ルートの下に出る。8分交互 fig 内なら無害だが、♩や二分の「間」で5度が下に持続すると 6/4 的な浮きが出る＝「5度は原則ルートの上（root+7、窓を+12許容）」が安全側。

---

## ③ 妥当性評価（効く条件・やり過ぎの副作用）

### 1. キックロック（オンセット骨格の共有）
- **妥当性：非常に強い。** 知覚（低音がビートを運ぶ）と実務（pocket=キックに合わせる）が一致。メロのAより確度が高く、ベース強化の第一手。
- **効く条件**：キックがシンコペ的（裏8分/16分に食う）なほど効果が出る＝現行 genDrums の busy 系（step 6,7,10,14 のキック）と好相性。ドラムとベースを**同じ composition 内で**生成する時に真価（[結線思想＝modeと同じ](2026-07-10-melody-groove-drum-interaction.md)）。
- **副作用**：①完全一致は tension&release を殺す（Soundfly）＝ロック率に上限 or 差分保証。②4つ打ちキックに全ロック＝ただの4分ルートで死ぬ→**four-on-the-floor 検出で offbeat 語彙へ切替**（符号付きノブ）。③キック位置は拍頭以外＝「拍頭=ルート」の現行ピッチ規則が崩れる→「小節頭・コードチェンジ頭=ルート」に規則を付け替える。

### 2. 語彙の拡張（アプローチ/オクターブ/経過）
- **妥当性：確立された実務。** 特に「チェンジ直前の接近音→次ルート着地」はポップスの最小コストで最大効果（1小節に1音の追加で「進行を聴いている」感が出る）。
- **効く条件**：コードが1〜2小節単位で動く進行（現行 gen_chords の典型出力）。チェンジ直前の最後のオンセット（beat 4 か その裏）を接近音に置換。
- **副作用**：①半音接近を強拍/長音に置くと out-of-key が露出＝**弱拍・短音価限定**。②毎チェンジで機械的にやると「歩き癖」でくどい＝確率ノブ（既定0）。③オクターブ跳躍は跳び先で音域窓（E1..G3）を割らないようクランプ。3度は転回に聞こえるため小節頭では使わない。

### 3. スネアとの関係（音価ゲート・ゴースト）
- **妥当性：支持される。ただし第一手は「音を足す」でなく「音価を切る」。** onset 列を変えず dur だけ短縮＝低リスク（メロBの「velocityのみ」に対応するベース版の安全手）。
- **効く条件**：ベースが二分/全音符で伸びる sparse 系で、スネア 2・4 の直前で切ると backbeat が抜ける。
- **副作用**：①切りすぎるとブツ切れ（sustain の支えが消える）＝最小 dur 保証。②ゴーストノートは vel 未対応の現状では実装不可＋synth/SF2 での低 vel の鳴り確認が必要＝後回し（まず音価ゲート）。

### 4. fig 語彙の置換 vs 変調
- **判断：置換でなく「第二経路の追加」。** fig 方式（拍単位敷き詰め）とドラム由来導出は構造が違い、fig を「変調」してキックに寄せるのは歪む（fig は拍頭アンカー前提）。**ドラム入力がある時だけ導出経路、無い時は従来 fig 経路**＝既定bit一致が構造的に保証される。メロA（pushの対象拍差し替え＝既存機構の精緻化）とは違い、ベースは新経路が正解。

### 5. 音域・声部
- **妥当性：明確（音響物理＋和声理論）。** 5度は上向き既定・交互図形内のみ下向き許容。オクターブ跳躍の追加は音域窓の拡張（36..47 → 例 33..55 ≒ A1..G3）とセット。
- **副作用**：窓を広げると synth 側の音作り（現行 C2 基準）と乖離しうる＝web/合成側の鳴りを耳確認（[modeの結線と同じ教訓](2026-07-10-melody-groove-drum-interaction.md)）。

---

## ④ 実装含意 / アルゴリズム素案

**入力形**：`gen_drums` の content ＝ `{rhythm: {steps, bars, beatsPerStep, lanes:[{name, midi, hits:[stepIndex], vel}]}}`（generate.ts:1019）。kick=midi36/name"Kick"、snare=midi38/name"Snare"。step→拍＝ `step * beatsPerStep`。ドラムは1小節分（bars=1）なので**小節ループとして各小節に敷いて解釈**する。

**シグネチャ案**：`genBass(frame, chords, seed, drums?, opts?)`。`drums` 無し or 係数0 → 現行コードパスに一切触れない＝**bit一致**（push/swing/humanize と同じ流儀）。呼び出し元は mcp.ts:521-523・http.ts:200/250 の3箇所（composition 生成 http.ts:250 が「ドラムを先に生成→ベースに渡す」結線の本命）。

**ノブ案**（各 0..1、既定0）：
- `kickLock`（符号付き -1..1）：+はキック骨格の採用率、−はオフビート（キック裏8分）率。
- `approach`：コードチェンジ直前オンセットを接近音化する確率。
- `snareGap`：スネア直前で音価を切る強さ。

```
// --- 前処理（小節共通）：ドラム→ステップ集合 ---
kickSteps  = lanes(midi=36).hits        // 例 {0, 8, 10}
snareSteps = lanes(midi=38).hits        // 例 {4, 12}
fourOnFloor = kickSteps ⊇ {0,4,8,12}    // 4つ打ち検出
stepToBeat(s) = s * beatsPerStep

// --- 経路分岐：drums が無い/係数0 → 従来 fig 経路（bit一致） ---
if (!drums || kickLock === 0) { 従来の pickFig ループ（generate.ts:935-950 のまま） }

// --- A. オンセット骨格の導出（kickLock > 0） ---
for each bar:
  onsets = {0}                              // "the one"＝小節頭は常に弾く（キック不在でも）
  for s of kickSteps: if rng() < kickLock: onsets.add(s)      // キック骨格の採用
  // 差分保証（揃えすぎ禁止）：busy mood なら 8分裏を確率で追加（キックに無い音＝ベース側の差分）
  if bias.busy >= 1.5: for b of [2,6,10,14]∖kickSteps: if rng() < 0.3: onsets.add(b)
  if bias.long >= 1.5: onsets = {0} ∪ (onsets ∩ {0..7})       // sparse は前半のみ＝支え
  // dur = 次のオンセットまで（レガート基準）

// --- A'. オフビート語彙（kickLock < 0 or fourOnFloor && EDM系mood） ---
  onsets = {2,6,10,14}（8分裏）または {0,...} からキックstepを除いた8分  // Robert Miles型

// --- B. ピッチ規則（現行 root/5度 の付け替え＋語彙追加） ---
for each onset o (beat t = stepToBeat(o)):
  isAnchor = (o === 0) || chordChangesAt(t)      // 小節頭 or チェンジ頭
  if isAnchor: pitch = bassRoot(root)             // ルート
  else: pitch = rng.choices([root, root+7, root+12], [w_r, w_5, w_oct])
        // 5度は「上」= root+7。交互図形（前音がroot直後）に限り root-5 許容。
        // オクターブは busy/エネルギー高で重み増（ディスコ往復）。
  window = [33, 55]  // A1..G3 に拡張（従来窓 36..47 は kickLock=0 経路で維持＝bit一致）

// --- C. アプローチノート（approach > 0） ---
lastOnsetBeforeChange = 小節内でコードチェンジ直前の最後のオンセット
if rng() < approach and その音が弱拍・短めなら:
  target = nextChordRootPitch
  pitch = rng.choice([target-1, target+1, target-2])   // 半音下/上・全音下
  // 長音・強拍には適用しない（out-of-key 露出ガード）

// --- D. スネアゲート（snareGap > 0・onset列は不変＝低リスク第一手） ---
for each note n:
  nextSnareBeat = min over snareSteps of stepToBeat(s) where beat(s) > n.start
  if n.start + n.dur > nextSnareBeat and rng() < snareGap:
    n.dur = max(0.25, nextSnareBeat - n.start)   // スネア頭で切る＝穴を空ける（最小16分保証）
```

**実装順の推奨**（メロ研究の「B→A→C」に対応）：
1. **D スネアゲート**（onset不変・dur のみ＝最低リスク、姉妹docのB=velocityのみ に相当）
2. **A キック骨格＋B ピッチ規則**（本命・新経路なので従来経路と併存しやすい）
3. **C アプローチノート**（和声知識が要る＝chordAt で次コードを引く。効果大だが露出リスクも）
4. ゴーストノート（vel フィールド追加が先行条件・synth の鳴り確認込み）は**後回し**。

**注意（契約面）**：bass notes に `vel` を足す場合は #85 items 形と web/MIDI 書き出しの `vel ?? 100` 経路（humanize と同じ）を踏襲。ドラム受け渡しは content そのまま（step↔拍の自己記述 `beatsPerStep` があるので frame と独立に換算可能）。6/8（compound）は kickSteps の意味が変わる（12step）ため**当面 4/4 のみ**＝姉妹doc・push/swing と同じ除外方針。

---

## ⑤ 残論点・要検証

1. **kickLock の既定値と上限**＝「完全一致は死ぬ」の定量化。1小節あたりキック採用数の上限や差分保証（ベースにしか無い音を最低1つ）をどう入れるか、耳で較正（理論スコアでは測れない＝[melody-eval-ceiling]）。
2. **オフビート語彙の発動条件**＝fourOnFloor 検出だけで良いか、mood（EDM/ダンス系）も条件に足すか。現行 genDrums は4つ打ちを出さない（王道8ビート系のみ）＝当面死にパスになる可能性。
3. **アプローチノートの音価/位置**＝beat4 の♩か、その裏の♪か。テンポ依存（速い曲は♪だと忙しい）。実機で耳確認。
4. **交互ベース（R-5下）の判別**＝「図形の中の5度下は無害・持続の5度下は 6/4」の境界を実装でどう引くか（前後 onset 間隔で判定する素案だが要検証）。
5. **音域窓の拡張（36..47→33..55）と synth の鳴り**＝web 側の音作りが C2 基準。G3 付近が痩せないか耳確認（[modeの結線教訓]＝品質変更後は耳確認必須）。
6. **コーパス統計での既定値決め**＝自作/解析済み音源の demucs bass+drums stem（[2026-07-07-drums-bass-extraction-plan](2026-07-07-drums-bass-extraction-plan.md)＝追加コストゼロで取れる）から「ベース onset がキック step と共有される率」「2・4での発音率」「音価分布」を**統計のみ**抽出（リテラルなライン非保存）＝kickLock/snareGap の既定強度の実測根拠に。
7. **ゴーストノートの表現力**＝SF2/synth で vel 30-50 のベースがゴーストらしく鳴るか（減衰・ミュート感が無いと只の小さい音）。鳴らないなら実装しても無意味＝先に音を確認。
8. **microtiming（ms オーダー）**＝本docはグリッド内配置のみ。ベースの humanize（キックに対し数ms遅らせる等、[MusicRadar 同上]の「few ticks later」）は humanize 器（[2026-07-09-brushup-audit-5areas](2026-07-09-brushup-audit-5areas.md) E）の守備範囲として分離。

---

## 出典（本文内URLの再掲・グループ別）
- **ロック/pocket/実務**：[Soundfly: Locking in with Bass and Drums](https://flypaper.soundfly.com/write/rhythm-section-locking-in-with-bass-and-drums/)／[TalkBass: kick drum's relation to the bass](https://www.talkbass.com/threads/the-kick-drums-relation-to-the-bass.872563/)／[MusicRadar: Chic kick & bass](https://www.musicradar.com/tutorials/music-production-tutorials/how-close-listening-to-chic-and-a-selection-of-other-artists-can-teach-us-about-the-integral-relationship-between-the-kick-and-bass)／[Soundbrenner: Pocket](https://www.soundbrenner.com/blogs/articles/pocket)／[Soundbrenner: Funk groove](https://www.soundbrenner.com/blogs/articles/funk-groove)
- **知覚/実証**：[Hove et al. 2014 (PNAS)](https://www.pnas.org/doi/10.1073/pnas.1402039111)／[同 PMC4104866](https://pmc.ncbi.nlm.nih.gov/articles/PMC4104866/)／[Lenc et al. 2018 (PNAS)](https://www.pnas.org/doi/10.1073/pnas.1801421115)／[Danielsen: All About That Bass Drum (Ann NY Acad Sci)](https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/nyas.70306)／[Microtiming and Mental Effort (RG)](https://www.researchgate.net/publication/337896378_Microtiming_and_Mental_Effort_Onset_Asynchronies_in_Musical_Rhythm_Modulate_Pupil_Size)／[ZGMTH: Microtiming in Early Funk](https://www.gmth.de/zeitschrift/artikel/1224.aspx)／[Keil: Participatory Discrepancies (RG)](https://www.researchgate.net/publication/229720708_Participatory_Discrepancies_and_the_Power_of_Music)
- **ライン構築語彙**：[MusicRadar: basslines around root notes](https://www.musicradar.com/how-to/write-bassline-root-notes)／[StudyBass: Roots and Fifths](https://www.studybass.com/lessons/common-bass-patterns/roots-and-fifths/)／[Yamaha: Roots, Fifths and Octaves](https://hub.yamaha.com/guitars/bass/the-importance-of-roots-fifths-and-octaves-in-bass-playing/)／[MasterClass: How to Write a Bass Line](https://www.masterclass.com/articles/how-to-write-a-bass-line)／[Native Instruments: How to write a bassline](https://blog.native-instruments.com/how-to-write-a-bassline/)／[StudyBass: Chromatic Approach Notes](https://www.studybass.com/lessons/common-bass-patterns/chromatic-approach-notes/)／[TalkingBass: Approach Notes](https://www.talkingbass.net/approach-notes/)／[How To Play Bass: Five Types of Approach Notes](https://how-to-play-bass.com/five-types-approach-notes)／[TalkingBass: Walking Bass Lines #2](https://www.talkingbass.net/walking-bass-lines-chord-tones/)／[Fundamental Changes: Walking Bass Line](https://www.fundamental-changes.com/walking-bass-line/)
- **スネア/ゴースト**：[Premier Guitar: The Space Between — Note Length](https://www.premierguitar.com/the-space-between-a-bassists-guide-to-note-length)／[Soundbrenner: Ghost notes](https://www.soundbrenner.com/blogs/articles/ghost-notes)／[Wikipedia: Funk](https://en.wikipedia.org/wiki/Funk)
- **音域/転回**：[guitartuner.io: Bass Tuning Frequencies](https://guitartuner.io/resources/bass-guitar-tuning)／[BassOx: Why Do Bass Chords Sound Muddy?](https://www.bassox.com/why-do-bass-chords-sound-muddy/)／[Wikipedia: Alternate bass](https://en.wikipedia.org/wiki/Alternate_bass)／[Wikipedia: Second inversion](https://en.wikipedia.org/wiki/Second_inversion)／[David Kulma: Six-Four Chords](https://davidkulma.com/musictheory/secondinversiontriads)
- **EDM**：[Samples From Mars: sidechain](https://samplesfrommars.com/blogs/tips-tricks/18999227-how-to-use-sidechain-compression-to-make-kicks-cut-through-the-mix)／[Audient: sidechaining guide](https://audient.com/tutorial/the-beginners-guide-to-sidechaining/)
