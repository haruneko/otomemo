# メロディ×リズム隊（ドラム）の相互作用：理論の裏取りと実装含意

目的＝将来 `gen_melody` に**ドラムのステップ列（キック/スネア/ハイハットの16分グリッド）を入力**として渡し、メロのオンセット/アクセント/密度をバイアスしたい。その3挙動 **A. キック食い込み／B. スネアのバックビート／C. 密度の相補** に確立した音楽理論・慣習があるかを出典付きで裏取りする。**実装はしない＝調査とドキュメント化のみ**。最終更新 2026-07-10。

関連既存doc：[sixteenth-rhythm](sixteenth-rhythm.md)（16分＝シンコペ/走句/microtiming の2段モデル）・[melody-heuristics](melody-heuristics.md)（groove(anticipate)は「未配線」と記載）・[2026-07-08-drum-pattern-extraction](2026-07-08-drum-pattern-extraction.md)／[2026-07-08-drum-transcription-journey](2026-07-08-drum-transcription-journey.md)（バックビート=スネア2,4 でグリッドを決める実測）・[2026-07-09-brushup-audit-5areas](2026-07-09-brushup-audit-5areas.md)（E=グルーヴ/humanize器）。本docはこれらの「メロ単体」「ドラム単体」を**メロ⇄ドラムの結線**として橋渡しする。

---

## ① 要約（到達点）

- **A（キック食い込み）＝理論的に強く支持される。** キックのオンセットは Lerdahl & Jackendoff の言う **phenomenal accent（現象的アクセント）**を作り、拍節構造の入力になる。メロを弱拍→キック位置へ16分前借りする挙動は **division-level syncopation / anticipation（前借り・食い）**そのもので、pop/EDM 制作実務の定石。**ただしエンジンは既に `push` ノブでこれを内部生成している**ので、ドラム入力は「push の対象拍を固定([0,1,2])でなく実キック位置に置き換える」精緻化として乗る。**やり過ぎの副作用＝全オンセットをキックに揃えると「ユニゾン化」して平板・シンコペの緊張が消える**（アクセント理論上、逆説的アクセント＝ズレが groove の源）。
- **B（スネアのバックビート）＝支持されるが「揃える/外す」は文脈依存。** バックビート（2・4拍のスネア）は accentual syncopation で、popの土台。メロのフレーズ・アクセント（velocity や長音の着地）をバックビートに合わせると「乗る」が、**メロは downbeat（1・3）を強調するのが素の重力**で、常時スネアに寄せると単調。**「合わせて立てる」も「外して呼吸する」も両方が実際の技法**＝ノブで選ばせるのが正しい。
- **C（密度の相補）＝編曲法として確立（call-and-response / hocket / textural density）だが、"良い groove=常に疎"ではない。** ドラムが詰まった小節でメロを疎に、空いた小節で動く＝会話的な埋め合いは hocket/コンプリメンタリー・リズムの原理。実証研究では**リズム密度が microtiming の効き方を左右する moderator**＝密度は groove 体験の一次変数。**副作用＝機械的に「詰→疎／疎→詰」を反転させるとフレーズ構造（AABB・句の問い/答え）を壊す**。密度相補はフレーズ境界を尊重した上での弱いバイアスに留めるべき。
- **最重要の設計原理（3挙動に共通）＝「揃えすぎない」。** groove は **participatory discrepancies（Keil）／expressive microtiming（Iyer）**＝わずかなズレが身体的な引き込みを生む、というのが実証の核。完全整列は groove を殺す。よって3挙動すべて**既定=従来動作（OFF）＋係数/ノブで弱く効かせる**が唯一正しい方針。

---

## ② 理論（キーワード別・各に出典URL）

### 拍節理論：metrical hierarchy と 2種のアクセント（A・B の土台）
Lerdahl & Jackendoff (1983) は律動を規定するアクセントを **phenomenal（現象的）／structural（構造的）／metrical（拍節的）**の3種に分ける。
- **phenomenal accent**＝音の知覚属性（長さ・音量・音色・音高）が変化する時点で生じる表層のアクセント。**単一の瞬間を強調し、シンコペーションを可能にする**。
- **metrical accent**＝強拍/弱拍の周期的な心的スキーム上の拍。**phenomenal accent は metrical accent の知覚入力として働く**＝不規則な現象的ストレスが規則的な拍節格子と照合される。
- 出典：[White, Empirical Musicology Review（tonal stability × metrical accent）](https://emusicology.org/article/id/4709/)／[Roeder, "phenomenal accent"（MTO）](https://www.mtosmt.org/classic/mto.01.7.1/roeder_accent.html)／[Palmer & Krumhansl, Mental Representations for Musical Meter (PDF)](http://www.brainmusic.org/EducationalActivities/Palmer_meter1990.pdf)／[Metrical Structure Hierarchy 図（L&J 1983）](https://www.researchgate.net/figure/A-Metrical-Structure-Hierarchy-Lerdahl-Jackendoff-1983-Each-horizontal-row-of-dots_fig1_2793579)

**エンジン含意：** ドラムのキック/スネアのオンセットは、まさに **phenomenal accent の外部供給源**。今のエンジンは拍子由来の `strongPositions`（metrical accent）にコードトーンをスナップしているが、これは metrical 側のみ。ドラム入力を足すと「現象的アクセントの実在位置」を初めて参照できる。

### Syncopation の定義（LHL 尺度）と anticipation（A の核）
Longuet-Higgins & Lee (1984) の **LHL syncopation model** が操作的定義：拍節木の各位置に metric weight を割り当て（遅い拍節レベルほど高い重み、最初のイベント=0が最大）、**弱位置に onset があり、続く強位置に onset が無い（休符/タイ）とき**、両者の重み差がシンコペーション値。総和がリズムのシンコペ度。
- 出典：[Song & Simpson ほか, Modelling perceived syncopation in pop drum patterns (SAGE, full)](https://journals.sagepub.com/doi/full/10.1177/2059204318791464)／[Sioros & Guedes, Syncopation as Transformation (PDF)](https://www.researchgate.net/profile/George-Sioros/publication/275886115_Syncopation_as_Transformation/links/557af01c08ae8d0481931ef1/Syncopation-as-Transformation.pdf)／[Fitch & Rosenfeld, syncopation & complexity (PDF)](https://web.uvic.ca/~aschloss/course_mat/MUS%20511/ARTICLES%20AND%20REFS%20FOR%20320/FitchRosenfeld20071.pdf)
- **anticipation / push beat**＝強拍の音を1細分（16分/8分）だけ前へずらす前借り。既存 [sixteenth-rhythm.md](sixteenth-rhythm.md) の「division-level syncopation＝16分前借り」と同義。pop ボーカルは拍頭すらオフに聞こえるほどオフビート寄り（[OpenMusicTheory pop rhythm](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/)）。

### Backbeat（2・4拍）と melody accent（B の核）
バックビート＝4/4の**2・4拍をスネアで強調**＝pop/rock/funk/R&B/hip-hop の土台。これは**四拍子における accentual syncopation**（弱拍を強調し規則性を崩して推進力を生む）。一方 **メロ/コードの素の重力は1拍（downbeat）が最強・3拍が次点**（"on" beats）、2・4は弱い "off" beats。つまりバックビートは「ドラムが弱拍を叩き、メロは強拍に着地」する**相補**が既定で、両者を同位置に寄せるのは意図的な効果。
- 出典：[Open Music Theory: Drumbeats](https://viva.pressbooks.pub/openmusictheory/chapter/drumbeats/)／[Wikipedia: Beat (music) — on/off beats, backbeat](https://en.wikipedia.org/wiki/Beat_(music))／[Ethan Hein, The backbeat: a literature review](https://www.ethanhein.com/wp/2013/the-backbeat-a-literature-review/)／[Biamonte, Rhythmic functions in pop-rock (Routledge Companion, PDF)](https://music.arts.uci.edu/abauer/6.2/readings/Routledge_Companion_Popular_Music_Analysis__Biamonte_rhythmic_fctns-13_chapter.pdf)

### Groove / in the pocket / microtiming（3挙動すべての「揃えすぎ禁止」根拠）
- **Keil: Participatory Discrepancies (PDs)**＝演奏の微小な非同期（microtiming）が聴き手の身体的 entrainment を促し、それが groove の本質。[Participatory Discrepancies and the Power of Music (RG)](https://www.researchgate.net/publication/229720708_Participatory_Discrepancies_and_the_Power_of_Music)
- **Iyer: Embodied cognition & expressive microtiming**＝リズム知覚/産出は全身的経験で、数msオーダーの timing 感度が groove を成す。[Butterfield, The Power of Anacrusis (MTO, Iyer/Keil を総括)](https://mtosmt.org/issues/mto.06.12.4/mto.06.12.4.butterfield.html)
- **in the pocket**＝キック/ベースの着地・バックビートの座り・音の長短・詰めすぎない「余白」で groove が深くなる（"leave room and avoid crowding every subdivision"）。[Bobby Owsinski: Groove vs Pocket](https://bobbyowsinskiblog.com/groove-pocket/)／[Soundbrenner: Pocket](https://www.soundbrenner.com/blogs/articles/pocket)
- **microtiming の実証（既存doc）**＝聴き手は long-range correlated な揺れを無相関ランダムより好む（[Hennig, PMC3202537](https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537/)）＝[sixteenth-rhythm.md](sixteenth-rhythm.md) 済。**帰結：完全整列（quantize してキックに全部揃える）は groove を殺す。**

### Complementary rhythm / call-and-response / hocket / textural density（C の核）
- **hocket**＝メロディの隙間を別パートが埋め合い、密度が上がりすぎないよう相補的リズムを作る（例：スネアのループに相補的なタムのループ）。[Red Bull Music Academy: The Evolution of Hocketing](https://daily.redbullmusicacademy.com/2018/02/the-evolution-of-hocketing/)
- **call-and-response / 層間の対話**＝レイヤー間でモチーフを呼応させ、密度をずらして掛け合う。[Musosoup: Rhythm vs Melody](https://musosoup.com/blog/rhythm-vs-melody)／[Biamonte, rhythmic functions (PDF)](https://music.arts.uci.edu/abauer/6.2/readings/Routledge_Companion_Popular_Music_Analysis__Biamonte_rhythmic_fctns-13_chapter.pdf)
- **rhythmic density は groove の一次変数**＝Senn ほか (2017) は、microtiming の情動効果が**リズム密度で調整（moderate）される**ことを実証（密度で微小ズレの効き方が変わる＝密度と groove は不可分）。[Senn et al., Rhythmic Density Affects Listeners' Emotional Response to Microtiming (Frontiers)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01709/full)／[同 PMC5643849](https://pmc.ncbi.nlm.nih.gov/articles/PMC5643849/)

### クラシック/対位法の下地（軽く）
- 音価の**疎密（diminution/prolongation）**と**アゴーギク（agogic accent＝長い音価が作るアクセント）**は phenomenal accent の一種で、L&J の「長さによるアクセント」に対応。既存 [motif-research.md](motif-research.md)（WuYun の decorative/prolongation 層）・[skeleton-theory-detail.md](skeleton-theory-detail.md) と接続。C の「疎密で埋め合う」は対位法の**相補リズム（一方が動くとき他方は止まる）**の pop 版。

### 制作実務（pop/EDM）
- ドラムループ/MIDI を先に置き、その上でメロを書く＝実務の定番出発点。melody は genre/情感でシンコペにも直線的にもできる。要素を拍の少し前に置くと urgency（＝push/anticipation）、少し後で relaxed swing。[EDMtips: Drum Programming](https://edmtips.com/drum-programming/)／[EDMprod: 5 Tips for Working With Drums](https://www.edmprod.com/5-tips-working-drums/)／[Mystic Alankar: Programming Rhythms](https://mysticalankar.com/blogs/blog/programming-rhythms-drums-that-fit-any-genre)

---

## ③ A/B/C 各挙動の妥当性評価（条件・副作用）

### A. キックに食い込む（オンセット/シンコペをキック位置へ寄せる）
- **理論的妥当性：強い。** キックは phenomenal accent の実在点。メロを弱拍からキックへ16分前借り＝anticipation は LHL シンコペの典型で、pop/EDM の推進力の源。
- **効く条件：** キックがシンコペ的に置かれている小節（例：1拍と「1と2の間」など裏に食うキック）で、メロの**弱位置 onset をその16分前へ寄せる**と噛む。前ノリ＝urgency。
- **やり過ぎの副作用：** ①**全オンセットをキックに揃えると「ユニゾン化」＝平板**。シンコペは「弱拍に音・強拍に無音」という**ズレ**が本質（LHL）で、キックと完全同期は逆にシンコペを消す。②既存 `push` ノブと**二重適用**の恐れ（下記整合）。③終止音・句頭を動かすとフレーズが崩れる（エンジンは既に終止/句頭を timing 保護）。
- **既存 `push` との整合（重要）：** melodyCells.ts の `push` は既に division-level syncopation を内部生成し、**対象拍を push 量で固定**（`push>0.75→[0,1,2] / >0.4→[0,2] / else [2]`、6/8除外、終端不変）。ドラム入力版は「**固定拍リストを実キック stepのある拍に差し替える**」精緻化。**push とドラム食いを同時に全開にしない**（片方を選ぶ or 合成上限を設ける）。

### B. スネアのバックビート（強拍アクセントを2・4へ / 外して呼吸）
- **理論的妥当性：支持されるが二面。** 「メロのアクセントをバックビートに合わせて立てる」も「外して downbeat に着地し呼吸する」も**両方が実技法**。素のメロ重力は downbeat（1・3）強調なので、バックビート強調は意図的な効果（accentual syncopation の重ね掛け）。
- **効く条件：** サビの推進・ノリを強めたい時は、2・4拍付近の onset に**velocity アクセント**を与える（音を増やすより velocity で立てる方が安全）。逆に、バラード/静的部では downbeat 着地＋2・4は休符で「呼吸」。
- **やり過ぎの副作用：** ①**毎小節2・4を機械的に強調すると単調**（バックビートは繰り返しが前提だが、メロまで律儀に乗ると予測可能に）。②onset を増やして揃えると密度が上がり C と衝突。③エンジンの humanize は既に `onStrong` で強拍+8/裏-4 の posBoost を持つ＝**メトリカル強拍**の velocity 差はある。B は「メトリカル強拍」でなく「スネアの実在位置」に velocity を足す拡張＝posBoost の第2項として設計するのが自然。
- **推奨：** B は**onset を動かさず velocity（アクセント）だけ**をバイアスする実装が最も低リスク（音符列＝ピッチ/リズムは不変、強弱だけドラムに呼応）。

### C. 密度の相補（詰→疎・疎→動く）
- **理論的妥当性：編曲法として確立（hocket/call-and-response/相補リズム）。** かつ密度は groove の一次変数（Senn 2017）。
- **効く条件：** ドラムフィル/詰まった小節でメロを長音・休符へ（場を譲る）、ドラムが空いた小節（例：キック/スネアだけでハイハット薄）でメロが16分走句で動く＝会話。セクション境界（Aメロ疎→サビ密）とも整合。
- **やり過ぎの副作用：** ①**フレーズ構造（AABB・句の問い/答え・[melody-heuristics.md](melody-heuristics.md) の C）を壊す**：機械的に小節ごと密度反転すると、反復すべき句が歪む。→**句境界を尊重し、句内の弱いバイアスに留める**。②densityを下げすぎると間延び／上げすぎると忙しい＝「余白」の pocket 原則に反する。③ドラム密度の測り方（ハイハット16分刻みは"密"でも体感は薄い）＝**キック/スネアの onset 数**で測るべき、ハイハットは重み低め。
- **既存 `density`/`breathe`/`runs`/`foreground` との整合：** エンジンは既に density（細かさ）・breathe（句頭遅延=間）・runs（走句）・foreground（自由材料）を持つ。C は「**小節ごとの density/runs 係数をドラム密度で弱く変調**」＝新ノブでなく既存ノブの**小節別スケーリング**として乗せられる。

---

## ④ 実装含意 / アルゴリズム素案（擬似コード）

前提の入力形（タスク記載）：ドラム content ＝ `{steps, lanes:[{name, midi, hits:[stepIndex]}]}`、1 step = 16分。判別は name または GM 番号（36=kick、38/40=snare、42/44/46=hihat 等）。

**共通の前処理：ドラムを「拍節プロファイル」に畳む（小節ごと）**
```
stepsPerBar = 16 (4/4)  // meter で可変、6/8は当面 A/B 対象外(既存 push/swing も compound 除外)
for each bar:
  kickSteps[bar]  = lanes(kick).hits ∩ this bar    // 例 {0, 6, 10}
  snareSteps[bar] = lanes(snare).hits ∩ this bar   // 例 {4, 12} = 2,4拍
  onsetDensity[bar] = |kickSteps| + |snareSteps| + 0.3*|hihatSteps|  // ハット低重み
gridToBeat(step) = step / 4      // 16分step→拍(0.0,0.25,...)
```
**既定＝全係数0で従来 bit 一致**（push/swing/humanize と同じ流儀）。新ノブ案：`drumLock`(A) / `backbeat`(B) / `converse`(C)、各 0..1。ドラム content が無ければ全て無効（従来経路）。

### A 素案：キック食い（既存 push を「実キック位置」で駆動）
```
// melodyCells の push ブロックを一般化。対象拍リストを固定でなく実キックから作る。
if drumLock > 0 and kickSteps available and not compound:
  for each note n (除く 終止音・句頭):     // 既存 push と同じ保護
    beatOfN = floor(n.start)               // n が属する拍
    // その拍にキックが「拍頭より16分前(step-1)」に食っているか
    anticipatedKick = kickSteps contains (beatOfN*4 - 1)  // 前の拍の第4 16分
    if anticipatedKick and n.start == beatOfN (拍頭ちょうど):
      if rng() < drumLock:
        n.start -= 0.25                     // 16分前借り＝キックに食い込む
        (前音を越えない・タイ処理は既存 push と同じ)
// 重複防止：opts.push と drumLock は max を取る等で二重前借りを禁止
```
- **副作用ガード：** 1小節で前借りする音数に上限（例 ≤2）＝全ユニゾン化を防ぐ。`drumLock` と `push` は排他 or 合成上限。

### B 素案：バックビート・アクセント（velocity のみ、onset 不変）
```
// humanize の posBoost を「ドラム由来」に拡張。音符列は一切動かさない。
for each note n:
  step = round(n.start * 4)
  onSnare = snareSteps contains step  (or step±0 tolerance)
  onKick  = kickSteps  contains step
  drumBoost = backbeat * (onSnare ? +12 : onKick ? +6 : 0)
  n.vel = clamp(base + posBoost(metrical) + drumBoost, 55, 118)
// "外して呼吸" 版は別ノブ or 負係数：backbeat<0 で 2,4拍の onset を弱める/休符寄り
```
- **低リスク＝最優先候補。** ピッチ/リズム不変で strength=0 が bit 一致、web/MIDI は既に `vel ?? 100` 対応済（humanize と同経路）。

### C 素案：密度の相補（既存 density/runs を小節別スケール）
```
medianDensity = median(onsetDensity[all bars])
for each bar (句境界を跨がない単位で):
  rel = onsetDensity[bar] / medianDensity
  // ドラム密 → メロ疎、ドラム疎 → メロ密（会話）
  densityScale[bar] = 1 - converse * (rel - 1) * K   // K≈0.3, clamp [0.5,1.5]
  → V2 の density/runs をこの小節係数で弱く変調（句の反復構造は保持）
```
- **副作用ガード：** ①句境界（phrases[]）内で密度を一定化 or 句単位で平均、AABB を壊さない。②スケール幅を狭く（±0.5以内）。③密度は kick+snare 主体で測る（hihat 低重み）。

**結線の層（[feedback: modeは生成の層をまたいで結線] と同じ思想）：** ドラムは `gen_drums`→content→**メロ生成の入力**として渡す。frame（調/拍子/テンポ）は共有済なので step→拍の換算は frame で閉じる。**耳確認必須**（velocity/timing は実機フローでしか質が出ない）。

---

## ⑤ 残論点・要検証

1. **push × drumLock の合成規則**（二重前借りの禁止方法）＝ max か、drumLock 有効時は push を無効化か。実機で「食いすぎ＝走る」の閾値を耳で。
2. **B「合わせる vs 外す」の既定**＝ジャンル/セクション依存。ノブの符号（正=乗せ/負=呼吸）で両対応にするか、別ノブか。
3. **密度の測り方の妥当性**＝hihat 16分の重み係数（0.3 は仮）。実ドラムパターンで「体感密度」と onset 数の相関を要実測（[2026-07-08-drum-pattern-extraction.md](2026-07-08-drum-pattern-extraction.md) の抽出結果を教師に）。
4. **句境界の取得**＝C は phrases[] 依存。ドラムのフィル/クラッシュ位置（[2026-07-08-drum-transcription-journey.md](2026-07-08-drum-transcription-journey.md) の crash 区切り）を句境界のヒントに使えるか。
5. **「揃えすぎ」の定量ガード**＝1小節あたりキック整列 onset 数の上限、密度スケール幅の上限を、耳で較正（[melody-eval-ceiling] の通り理論スコアでは質を測れない＝最終は耳）。
6. **6/8（compound）対応**＝既存 push/swing は compound 除外。A/B も当面 4/4 のみ、6/8 は別途。
7. **実測の裏取り**＝他者コーパス（POP909 等）から「メロ onset がキック/スネア step とどれだけ共有されるか」の**統計のみ**抽出（リテラル旋律は非保存）＝A/B の既定強度を数値で決める材料。今は理論+実務ガイド止まり。

---

## 出典（本文内URLの再掲・グループ別）
- **拍節/アクセント**：[White (EMR)](https://emusicology.org/article/id/4709/)／[Roeder phenomenal accent (MTO)](https://www.mtosmt.org/classic/mto.01.7.1/roeder_accent.html)／[Palmer & Krumhansl (PDF)](http://www.brainmusic.org/EducationalActivities/Palmer_meter1990.pdf)／[L&J metrical hierarchy 図](https://www.researchgate.net/figure/A-Metrical-Structure-Hierarchy-Lerdahl-Jackendoff-1983-Each-horizontal-row-of-dots_fig1_2793579)
- **シンコペ(LHL)**：[Modelling perceived syncopation (SAGE)](https://journals.sagepub.com/doi/full/10.1177/2059204318791464)／[Syncopation as Transformation (Sioros & Guedes, PDF)](https://www.researchgate.net/profile/George-Sioros/publication/275886115_Syncopation_as_Transformation/links/557af01c08ae8d0481931ef1/Syncopation-as-Transformation.pdf)／[Fitch & Rosenfeld (PDF)](https://web.uvic.ca/~aschloss/course_mat/MUS%20511/ARTICLES%20AND%20REFS%20FOR%20320/FitchRosenfeld20071.pdf)／[OpenMusicTheory pop rhythm](https://viva.pressbooks.pub/openmusictheory/chapter/rhythm-and-meter-in-pop-music/)
- **バックビート**：[OMT Drumbeats](https://viva.pressbooks.pub/openmusictheory/chapter/drumbeats/)／[Wikipedia Beat (music)](https://en.wikipedia.org/wiki/Beat_(music))／[Ethan Hein backbeat lit review](https://www.ethanhein.com/wp/2013/the-backbeat-a-literature-review/)／[Biamonte rhythmic functions (PDF)](https://music.arts.uci.edu/abauer/6.2/readings/Routledge_Companion_Popular_Music_Analysis__Biamonte_rhythmic_fctns-13_chapter.pdf)
- **groove/microtiming/pocket**：[Keil Participatory Discrepancies (RG)](https://www.researchgate.net/publication/229720708_Participatory_Discrepancies_and_the_Power_of_Music)／[Butterfield Power of Anacrusis (MTO)](https://mtosmt.org/issues/mto.06.12.4/mto.06.12.4.butterfield.html)／[Owsinski Groove vs Pocket](https://bobbyowsinskiblog.com/groove-pocket/)／[Soundbrenner Pocket](https://www.soundbrenner.com/blogs/articles/pocket)／[Hennig (PMC3202537)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537/)
- **相補/密度**：[Hocketing (RBMA)](https://daily.redbullmusicacademy.com/2018/02/the-evolution-of-hocketing/)／[Musosoup Rhythm vs Melody](https://musosoup.com/blog/rhythm-vs-melody)／[Senn et al. Rhythmic Density & Microtiming (Frontiers)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01709/full) ／[同 PMC5643849](https://pmc.ncbi.nlm.nih.gov/articles/PMC5643849/)
- **制作実務**：[EDMtips Drum Programming](https://edmtips.com/drum-programming/)／[EDMprod Working With Drums](https://www.edmprod.com/5-tips-working-drums/)／[Mystic Alankar Programming Rhythms](https://mysticalankar.com/blogs/blog/programming-rhythms-drums-that-fit-any-genre)
</content>
</invoke>
