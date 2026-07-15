# アナリーゼ教育論サーベイ（R1）— 何を読み取ると学びになるか／良い分析文の型

- 日付: 2026-07-15
- 種別: 外部Web調査（実務家・音楽理論教育のアナリーゼ手法サーベイ）
- 位置づけ: アナリーゼ機能 v2 設計の上流。後続 **D1「読み筋レンズ転用マップ」**（機械検出 facts → Claude 言語化）へ、下記「見どころ類型表」をそのまま入力できる粒度で残す。
- 前提の反省（v1）: 「BPM / 調 / コード名の要約 = メタ情報の羅列」は有用性が低かった。値打ちは **実測の具体（小節の中でどう動いているか）** と **その曲固有の学び**。合格基準 = 所見文が"なるほど"を最低1つ生むか。
- 著作権規約: 他者曲のリテラルな旋律／進行はサンプル保存しない。ここに残すのは **手法・類型・書き方の型のみ**。

---

## TL;DR

1. **実務家のアナリーゼは順序が確立している**＝「フォーム（構成）→ ハーモニー（機能）→ メロディ（輪郭・モチーフ）→ リズム／グルーヴ → アレンジ／プロダクション」。上位ほど骨格・安定、下位ほど表面・具体。日本の作曲教本もBerklee系プロデュース分析も、順序と観点はほぼ一致する。[JBG][EDMProd][Bennett]
2. **「見どころ」は"逸脱と反復"に宿る**。ダイアトニックからの逸脱（借用和音・セカンダリードミナント・偽終止・転調・ペダル）と、期待に対するリズム／構造の逸脱（シンコペ・拍ずらし・セクション対比）、そして反復の妙（フック・モチーフ変形）。**「教科書どおり」の箇所は学びが薄く、「ここだけ規則を外した」箇所に学びが宿る**。[PianoOwl][RWU][Making Music]
3. **良い分析文は「事実 → 解釈 → 転用」の3層**。技術的観察は"証拠"にすぎず、それが何を生んでいるか（解釈）と自作でどう使うか（転用）まで書いて初めて学びになる。[Obscure Sound][Harvard][SFCM]
4. **v1が薄かった理由が説明できる**＝メタ情報の羅列は「事実」層で止まっていた。所見は **1曲につき"逸脱1点"を選び、事実→解釈→転用まで通す** べき。全項目を均等に語らず、その曲固有の一点に寄せる（Beato/Bennett 方式）。[Beato][Bennett]
5. **初学者には認知負荷管理が要る**＝一度に語る観点は絞る。intrinsic load（課題本来の難しさ）は変えられないが、提示設計で extraneous load は下げられる。**構成 → 一番効いている一点 → 転用、の順で"少なく・深く"** が指針。[CLT][Price]

---

## 1. 実務家／教育のアナリーゼの「型」（見る順序と観点）

複数系統（日本の作曲教本・EDMプロデュース分析・Berklee系プロダクション分析・ポピュラー音楽学）で、**順序と観点はほぼ収束する**。共通の背骨は「マクロ（構成）→ 中核（和声・旋律）→ 微視（リズム・音色）」。

### 1-A. 共通の分析順序（収束版）

| 順 | レイヤー | 見る観点 | 理論の要否 |
|---|---|---|---|
| 1 | **フォーム／構成** | セクション区切り（Intro/A/B/サビ/間奏/Outro）と**各セクションの小節数**。長さの不揃い・サビ前の仕掛け。 | 不要（耳と数えるだけ） |
| 2 | **ハーモニー** | コード進行を **機能（T/S/D）で分類**。逸脱（借用・セカンダリー・転調）の所在。 | 要（ただし分析しながら習得可） |
| 3 | **メロディ** | 音域・輪郭（コンター）・モチーフの反復／変形／跳躍。スケール。 | 中（コンターは理論不要） |
| 4 | **リズム／グルーヴ** | キック/スネア/ハット、ベースのリズム、裏拍アクセント。**セクション切替時のリズム変化**。 | 不要 |
| 5 | **アレンジ／プロダクション** | 楽器数の推移、帯域配分（低中高）、テクスチャの出し入れ、音色・エフェクト。 | 不要〜中 |

出典: JBG音楽院の「プロが名曲から作曲テクニックを抽出する5ステップ」は上記1→5とほぼ同一で、**「ステップ1(構成)とステップ4(リズム)は理論不要で着手でき、2・3の理論は分析を通じて同時に習得できる」** と明記する。[JBG] EDMProd の 5-Point Technique（Composition / Arrangement & Instrumentation / Sound Design & Production / Mixing / Mastering）も同じマクロ→微視の流れ。[EDMProd]

### 1-B. ポピュラー音楽分析の学術枠組み

- **Covach**：形式決定の第一因子を**ハーモニー**に置く。「simple verse–chorus form（ヴァースとサビが同一進行）」対「contrasting（異なる進行）」の区別を提示。基本スキームがロックの形式分析の土台になるとする。[Covach via UNT]
- **de Clercq**：ポピュラー音楽の**機能和声**を Nashville Number System（度数表記）で扱う枠組み。ローマ数字／通奏低音の代替として、コマーシャル音楽の実務表記を分析に接続。著書 *The Practice of Popular Music* は Harmony / Rhythm / Melody / Form の4本柱で構成。[de Clercq NNS][Routledge]
- **形式のあいまいさ**：de Clercq は pop/rock の形式が単一正解を持たない（ambiguity）ことを積極的に扱う。→ **「これはBメロかサビか」を一意に決めない所見**が誠実。[de Clercq MTO]

### 1-C. Berklee系／プロデューサー系のプロダクション分析

- Joe Bennett（Berklee）系の song production analysis：**Form/Arrangement, Instrumentation, Texture Variation, Production Techniques** の4軸で、参照曲を**小節ごと（bar-by-bar）にスプレッドシート**で観察。狙いは soundalike（そっくり再現）ではなく **emulation = 枠組み／分析レンズを自作へ転用すること**。[Bennett]
- 学術寄りの「聴感上顕著なパラメータ」8分類：**tempo / orchestration & texture / harmony / form / vocal & lyric profiles / global & local production effects / vocal doubling & backing / loudness & compression**。→ 機械検出と言語化の"観点チェックリスト"として流用可能。[Bennett（8 categories）]
- Rick Beato *What Makes This Song Great?*：**ステム（分離トラック）を使い、その曲で"一番効いている一点"に寄せて語る**（例：フラット6thが旋律に憂いを差す、Lydianのベースライン、サイドチェイン）。全部を均等に説明せず、**曲固有の決め手**を1〜数点掘る。→ 所見文の理想形。[Beato]

---

## 2. 「見どころ」類型表 — 機械検出 facts → 言語化 の対応マップ

**設計原則**：見どころは「期待からの逸脱」と「反復の妙」に集中する。ダイアトニック／規則的リズム／均一アレンジという**"予測"に対して外れた点**が学びの核。以下は D1（読み筋レンズ転用マップ）へそのまま渡せる粒度。

**「検出に要る facts」列は、本プロジェクトのMIRが出す実測（chord-timeline / key / melody-contour / drums / bass / section-form）に対応させてある。**

### 2-A. ハーモニー系（chord-timeline + key から検出）

| ID | 見どころ | 検出に要る事実（facts） | なぜ学びになるか | 例（類型のみ） |
|---|---|---|---|---|
| **H1** 借用和音／モーダルインターチェンジ | key外だが平行調から借りたコード（例: 長調中のマイナーiv, ♭VII, ♭VI）が chord-timeline に出現 | ダイアトニックでは出せない"色"を1コードで足す手法。マイナーivは郷愁／哀感を差す等、**逸脱＝感情の語彙**だと体感できる。[PianoOwl][Making Music] | 長調サビ末のiv、Aメロの♭VII |
| **H2** セカンダリードミナント | 一時的にトニック以外へ解決するドミナント7（V/V, V/ii…）。chord-timeline上、非ダイアトニックの属7 → 次の度数へ解決 | 「一瞬だけ別の調をチラ見せ→戻る」テンションの作り方。**進行に推進力と期待を仕込む最小単位**。[RWU] | サビ前のV/V |
| **H3** 偽終止（deceptive cadence） | Dの後がI（正格）でなくvi/♭VIへ逸れる進行がsection境界に | 「解決すると見せて外す」＝期待の裏切りで先へ引っ張る。**終止をどこで"回避"するかが構成の推進力**。[Making Music] | サビ折り返しのV→vi |
| **H4** ペダルポイント／保続 | ベース(bass)が同一ルートを保持したまま上部chordが動く（bass一定 × chord変化） | 動と静の同居。緊張の溜め・浮遊感の作り方。**ベース1音を固定するだけで上物の意味が変わる**。 | サビ前のドミナントペダル |
| **H5** 転調／局所調変化 | key推定が曲中で変わる（section間でトニックがシフト）※R2の局所調検出と接続 | セクション間の"景色替え"。半音上げサビ等の高揚、または部分転調の陰影。**構成の起伏を和声で作る手段**。 | 最終サビの全音上げ |
| **H6** 進行の型と逸脱 | 頻出進行（I–V–vi–IV等）を基準に、**どこで型を外したか** | 王道進行を基準線に置くと「外した一点」が際立つ。**"型を知る→崩す"がオリジナリティの入口**。[FlowingData][aboutmusictheory] | 王道進行の3コード目だけ差し替え |

### 2-B. メロディ系（melody-contour から検出）

| ID | 見どころ | 検出に要る事実（facts） | なぜ学びになるか | 例（類型のみ） |
|---|---|---|---|---|
| **M1** モチーフの反復→変形→跳躍 | 短フレーズの反復と、その微変形・大跳躍のパターン（contourの相似と差分） | 「印象に残る旋律」の共通構造＝**繰り返して安心させ、少しずらして飽きさせず、跳躍で山を作る**。[JBG] | Aメロ動機のサビでの拡大 |
| **M2** 音域設計／レンジ | セクション別の最高音・音域幅（contourのレンジ推移） | サビで音域を上げ／広げてエネルギーを稼ぐ設計。**盛り上がりは音の高さと幅で作れる**。 | Bメロで溜め、サビ頭で最高音 |
| **M3** 非和声音／テンションの置き方 | メロが和音構成音から外れる位置（melody × chord のズレ） | 刺さる音（♭6th等）が"憂い"を差す。**わざと当てない音が表情を生む**。[Beato] | サビ頂点でのb6th |
| **M4** メロとリズムの掛かり（アンティシペーション） | メロ発音がコード変化より前に食う（melody onset が拍/コード頭を先取り） | 前ノリの推進力。**同じ音でも"いつ出すか"で表情が変わる**。 | サビ頭の食い |

### 2-C. リズム／グルーヴ系（drums + bass から検出）

| ID | 見どころ | 検出に要る事実（facts） | なぜ学びになるか | 例（類型のみ） |
|---|---|---|---|---|
| **R1** シンコペーション／裏拍アクセント | キック/スネア/メロの裏拍・弱拍アクセント配置 | 拍の重心をずらすグルーヴ。**"どこを外すか"がノリの正体**。[JBG] | サビのキックの食い |
| **R2** セクション切替時のリズム変化 | section境界でのドラムパターン／密度の変化（fill・抜き） | 変化点の"合図"の作り方。**構成の継ぎ目はリズムで演出される**。[JBG] | サビ前フィル、Bメロのハット半分抜き |
| **R3** ベースとキックの噛み合い | bass onset と kick onset の一致／ずらし | ローの一体感 or あえてのズレ。**土台の設計思想が出る**。 | ルート同期 vs 走るベース |

### 2-D. フォーム／アレンジ系（section-form + 楽器推移から検出）

| ID | 見どころ | 検出に要る事実（facts） | なぜ学びになるか | 例（類型のみ） |
|---|---|---|---|---|
| **F1** セクション小節数の非対称 | 各section小節数（8/8/... に対する不揃い、サビ前の増減） | ヒット曲は意外に小節数が揃わない。**"1小節足す/削る"で緊張を操作**。[JBG] | サビ前2小節の溜め |
| **F2** アレンジの出し入れ（帯域/密度） | section別の楽器数・帯域配分（低中高）の推移 | 引き算で次の盛り上がりを作る設計。**足すより抜くが効く**。[JBG][EDMProd][Bennett] | 落ちサビの間引き |
| **F3** フック／反復構造 | サビ内の反復単位・コール&レスポンス・タイトルフックの位置 | 覚えやすさの工学。**反復の設計が"つかみ"を作る**。[Hit Songs Deconstructed] | サビ頭2小節フックの3連呼 |
| **F4** テクスチャ対比（simple vs contrasting） | ヴァースとサビの**進行が同一か異なるか**（Covach区分） | 同一進行でメロ/アレンジだけ変えて対比を作るか、進行ごと変えるか。**対比の作り方の2大戦略**。[Covach] | 同一進行 verse–chorus |

> **D1への含意**：既存9レンズは、上表の facts列を入力に「その曲でどのIDが発火したか」を判定し、発火したものだけをClaudeへ渡す。**全ID横断ではなく、逸脱として最も顕著な1〜2件に絞る**のが v1 反省（羅列回避）への直接の答え。

---

## 3. 良い分析文の構造 —「事実 → 解釈 → 転用」

学術・ブログ・YouTube解説を横断すると、良い分析文は共通して **技術的観察を"証拠"として扱い、主張（解釈）を支え、聞き手の行動（転用）に落とす**。単なる観察の列挙は分析ではない。[Obscure Sound][Harvard][SFCM]

### 3-A. 3層モデル

1. **事実（Observation / Evidence）**：小節・拍・度数まで具体的に。「サビ末でivが借用されている」。← 機械検出 facts がここを埋める。
2. **解釈（Interpretation / Significance）**：それが**何を生んでいるか**。「直前の明るいIVに対し、同じ根音の短三度化で"翳り"が差し、サビの多幸感に一滴の哀愁を混ぜている」。← "なるほど"の本体。
3. **転用（Application / Takeaway）**：**自作でどう使うか**。「明るいサビに切なさを一滴足したい時、サビ末のIVをivに差し替える手が使える」。← 学びの確定。

> Harvard/Obscure Sound は「technical observations = evidence（証拠）」「明確なclaim（主張）を立てて観察で支える」と説く。[Harvard][Obscure Sound] SFCM は分析の目的を「部分がどう組み合わさっているかを理解すること」とする。[SFCM] Bennett は emulation（枠組みの転用）を目的に据える＝3層目を制度化。[Bennett]

### 3-B. 焦点の絞り（Beato/Bennett 方式）

- **全観点を均等に語らない**。1曲につき「一番効いている一点（逸脱1件）」を選び、そこを事実→解釈→転用まで**深く**通す。残りは1行のコンテキストで足りる。[Beato]
- v1が薄かったのは「BPM/調/コード名 = 事実層の羅列」で 2・3層に届かなかったから。**所見は"深さ優先・網羅は捨てる"**。

---

## 所見文テンプレ候補（構造の骨のみ・数百字規模）

### テンプレA — 逸脱1点フォーカス型（推奨・汎用）

```
【この曲の一番の見どころ】{セクション}の{小節/拍}で {逸脱の事実（度数・機能で）}。
【何が起きているか】直前は {基準＝期待される進行/リズム}。そこを {どう外したか} ことで、
  {生まれている効果＝感情・推進力・色}。← ここが"なるほど"
【自作への転用】{どんな場面で} {この手を} 使うと {狙える効果}。まず {最小の実験手順}。
【この曲のあらまし（1行）】{key/BPM/構成を1行}。※メタ情報は前景化しない
```
（狙い：v1反省の直接対策。事実→解釈→転用を1点に集中。メタは末尾1行に降格。）

### テンプレB — 構成の起伏フォーカス型（アレンジ/フォームが主役の曲）

```
【構成の設計】{各セクション小節数を数字で}。{非対称/仕掛けのある箇所} が目を引く。
【出し入れ】{どのセクションで何を抜き/足したか（帯域・楽器数）}。→ {次のセクションの盛り上がりをどう準備したか}。
【切替の合図】{セクション境界のリズム/フィル/転調} が継ぎ目をどう演出しているか。
【転用】盛り上げたい{場面}の前に {引き算/溜め} を置く、が転用点。
```

### テンプレC — フック/反復フォーカス型（キャッチーさが主役）

```
【つかみ】サビの {反復単位（何小節が何回）} と {フック位置}。覚えやすさの正体。
【反復と変形】{モチーフが反復→どこで変形/跳躍したか}。安心と意外のバランス。
【メロの山】{音域の最高点/音域幅の推移} がどこでエネルギーを稼ぐか。
【転用】{反復回数・変形の入れ方} を自作サビの設計テンプレとして使う。
```

---

## 4. 初学者向けの提示順の指針（認知負荷ベース）

認知負荷理論：負荷は intrinsic（課題本来の難しさ・変えられない）／ extraneous（提示のまずさ・下げられる）／ germane（理解に使う良い負荷）に分かれる。分析課題は intrinsic が高いので、**提示設計で extraneous を削り、一度に扱う要素を絞る**のが定石。旋律コンター識別も「同時に複数コンターを追う」と負荷が急増する＝**同時に問う観点を増やさない**。[CLT][Price][fNIRS]

### 提示順（少なく・深く）

1. **まず全体像を1枚**：構成（セクション×小節数）だけ先に見せる。理論ゼロで入れ、地図を持たせる（extraneous を下げる足場）。[JBG][CLT]
2. **次に"一番効いている一点"だけ**：逸脱1件を事実→解釈→転用で深掘り（テンプレA）。ここに認知資源を集中させる。
3. **最後に転用の1手**：自作でどう試すかを1つだけ。行動に落として germane load に変える。
4. **メタ情報は前景化しない**：BPM/調/コード名は"あらまし1行"へ降格。羅列は学びを生まない（v1反省）。
5. **一意に決めすぎない**：形式のあいまいさは断定せず併記（「Bメロ寄りだがサビの助走とも取れる」）。誤断定より誠実で、負荷も過剰にしない。[de Clercq]
6. **理論用語は"効果"とセットで**：「セカンダリードミナント」より先に「一瞬よそ見して戻る緊張」を言い、用語は後置。用語だけ渡すと extraneous load。

> 実装含意：Claude言語化は **(1)構成1枚 → (2)逸脱1点の深掘り → (3)転用1手** の3ブロック固定が、初学者の消化量として妥当。ブロックごとに"1トピック"を守る。

---

## 出典URL一覧

- [JBG] 楽曲分析(アナリーゼ)のやり方。プロが名曲から作曲テクニックを抽出する5ステップ — JBG音楽院: https://jbg-ongakuin.com/staff-blog/20250609/
- [EDMProd] How To Analyze Music Using The 5-Point Technique — EDMProd: https://www.edmprod.com/analyze-music/
- [Bennett] Teaching Song Production Analysis (#apme2018) — Joe Bennett: https://joebennett.net/2018/06/25/teaching-song-production-analysis-apme2018/
- [Beato] What Makes This Song Great? / Rick Beato — Open Culture: https://www.openculture.com/2018/04/what-makes-this-song-great.html ／ Wikipedia: https://en.wikipedia.org/wiki/Rick_Beato
- [Covach via UNT] Form in Popular Song, 1990–2009（Covach の simple/contrasting verse–chorus 区分を含む学位論文）: https://digital.library.unt.edu/ark:/67531/metadc822808/m2/1/high_res_d/dissertation.pdf
- [de Clercq NNS] The Nashville Number System: A Framework for Teaching Harmony in Popular Music — Trevor de Clercq: https://digitalcollections.lipscomb.edu/jmtp/vol33/iss1/1/
- [de Clercq MTO] Embracing Ambiguity in the Analysis of Form in Pop/Rock Music — MTO: https://mtosmt.org/issues/mto.17.23.3/mto.17.23.3.de_clercq.pdf
- [Routledge] The Practice of Popular Music (Harmony/Rhythm/Melody/Form) — de Clercq: https://www.routledge.com/The-Practice-of-Popular-Music-Understanding-Harmony-Rhythm-Melody-and-Form-in-Commercial-Songwriting/deClercq/p/book/9781032362892
- [PianoOwl] Borrowed Chords & Modal Interchange: Beyond Diatonic Harmony: https://pianoowl.com/docs/borrowed-chords
- [RWU] Chord Borrowing I: The Secondary Dominant — Composing Music: From Theory to Practice: https://rwu.pressbooks.pub/musictheory/chapter/chord-borrowing-i-the-diatonic-secondary-dominant/
- [Making Music] The Secret Chord: An Intro to Modal Interchange（偽終止・♭VI等）: https://makingmusic4ever.com/index.php/2025/09/17/the-secret-chord-modal-interchange/
- [FlowingData] Analysis of chords used in popular songs（王道進行の頻度統計）: https://flowingdata.com/2012/06/20/analysis-of-chords-used-in-popular-songs/
- [aboutmusictheory] Harmonic analysis（chordと調・他chordの関係）: https://www.aboutmusictheory.com/harmonic-analysis.html
- [Hit Songs Deconstructed] Hit Songs Deconstructed（構成/フック/アレンジの分解フレーム）: https://www.hitsongsdeconstructed.com/
- [Obscure Sound] Writing about Music: Techniques for Analyzing and Interpreting: https://www.obscuresound.com/2023/07/writing-about-music-techniques-for-analyzing-and-interpreting-musical-pieces-in-essays/
- [Harvard] Writing about Music: A Guide to Writing in A&I 24 — Harvard Writing Project: https://writingproject.fas.harvard.edu/file_url/152
- [SFCM] What Does Musical Analysis Tell Us? — San Francisco Conservatory of Music: https://sfcm.edu/study/majors/academics/music-theory-and-musicianship/sfcm-theory/online-materials/essays/what_does_analysis_tell_us
- [CLT] Cognitive Load Theory and Music Instruction: https://www.researchgate.net/publication/247513607_Cognitive_load_theory_and_music_instruction
- [Price] The Application of Cognitive Load Theory to Teaching Music Reading（intrinsic/extraneous/germane）: https://openscholar.uga.edu/record/15742/files/price_sylvia_t_201005_edd.pdf
- [fNIRS] Cognitive Load Changes during Music Listening（コンター識別で複数同時追跡時に負荷急増）: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6210363/
- 日本語アナリーゼ手法の補助参照: Phonim「アナリーゼをしてみよう」 https://phonim.com/post/music-analysis/ ／ うちやま作曲教室「曲分析の重要性」 https://sakkyoku.info/beginner/musical-analysis/ ／ sairie「とっつきやすい楽曲分析の方法」 https://sairie.com/pianoplus/analyse-point/
