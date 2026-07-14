# 盗作境界と独自性警告の実務仕様（M8）

作成日: 2026-07-14 / 種別: research（音楽著作権・旋律類似度の実務）

> **【重要な免責】これは法的助言ではない。** 本書は制作時の「注意喚起（ヒヤリ検知）」の設計根拠をまとめたもので、
> 侵害/非侵害の判定でも、法律相談の代替でもない。実際の懸念があれば必ず弁護士・JASRAC等に相談すること。
> 本ツールの警告は「ここは念のため耳と目で確かめよ」という**足場**であって、機械が白黒つけるものではない
> （設計思想＝機械は候補・足場まで、仕上げと判断は人間）。

---

## 0. 要旨（先に結論）

- **法は「音数の閾値」で線を引いていない。** 米国の substantial similarity も日本の記念樹事件も、
  「短い断片が偶然でなく本質的表現として一致しているか」を総合判断する。近年の潮流（Blurred Lines の反動 →
  Dark Horse・Stairway・Ed Sheeran）は **「ありふれた構成要素（building blocks）は独占させない」** 方向に強く振れている。
- よって本ツールの警告は **「法的閾値」ではなく「人間が確認すべき赤旗（red flag）」** として設計する。
  数値はあくまでトリアージ。**閾値超え＝侵害ではない。閾値超え＝耳で確かめる合図。**
- 誤警告（ありふれた進行・音型への過剰反応）が最大の害。**除外規則（scènes à faire / de minimis 相当）を
  警告器の一部として一級実装する**のが実務上いちばん効く。

---

## 1. 法的な線引きの「実態」

### 1.1 日本：記念樹事件（どこまでも行こう vs 記念樹）

- 経緯：小林亜星『どこまでも行こう』の権利者が、服部克久『記念樹』を無断編曲として提訴。
- **一審（東京地裁 平成12=2000年）**：フレーズ単位の類似は認めつつ「全体として同一性なし」で請求棄却。
- **控訴審（東京高裁 平成14=2002年9月）で逆転**：
  - **メロディーの約72%が同じ高さの音**、かつ**冒頭と末尾の何音かが一致**。
  - この顕著な類似が**偶然の一致とは考えにくい（不自然・不合理）**として**依拠**を認定。
  - **「表現上の本質的特徴の同一性」**を編曲権侵害の判断基準として提示（この基準を初めて示した判決と理解されている）。
  - 最高裁は上告不受理 → 高裁判決確定。
- 実務含意：日本の判例は**「本質的特徴の同一性」＋「依拠」**の二本立て。
  一審と控訴審で結論が割れた事実そのものが、**「どこからが危険か」は連続的でグレー**であることを示す。
  72%という数字は**判決が事後に述べた記述**であって「72%で違法」という閾値ではない。ただし
  **音高一致率が7割に達し、冒頭・末尾という記憶に残る箇所が揃うと危険帯**、という実務的な目安にはなる。
- 出典：
  - 記念樹事件 - Wikipedia https://ja.wikipedia.org/wiki/記念樹事件
  - MONOLITH LAW OFFICE（英語解説・複製/翻案の線引き） https://monolith.law/en/internet/music-copyright
  - 判例研究（北大 PDF） https://lex.juris.hokudai.ac.jp/coe/pressinfo/journal/vol_2/2_7.pdf
  - 骨董通り法律事務所コラム「パクリと侵害の微妙な関係」 https://www.kottolaw.com/column/000051.html

### 1.2 米国：substantial similarity の「振れ」

米国は (1) 依拠（access + copying）と (2) 不法な盗用（substantial similarity）を要求。
陪審制のため**判決が振れやすい**。近年の代表例：

| 事件 | 争点となった要素 | 一審 | 最終結果 | 教訓 |
|---|---|---|---|---|
| **Blurred Lines**（Williams v. Gaye, 2015-2018） | "groove/feel"、ベース・打楽器・全体の雰囲気 | 侵害・約740万ドル | 控訴審も評決維持（ただし強い反対意見） | **「雰囲気/フィール」まで保護しうる**と受け取られ業界が萎縮。反動の起点 |
| **Dark Horse**（Gray v. Perry, 2019-2022） | **8音のオスティナート** | 侵害・280万ドル | **評決取消 → 第9巡回区が非侵害確定** | 短い**音型は "building block"で独占不可**（Stairway 準拠） |
| **Stairway to Heaven**（Skidmore v. Led Zeppelin, 2020） | 下降クロマチック/分散和音 | 非侵害 | 大法廷で非侵害確定・**inverse ratio rule 廃止** | ありふれた素材はパブリックドメイン |
| **Thinking Out Loud**（Structured Asset Sales / Townsend v. Sheeran, 2023） | I–iii–IV–V 系のコード進行＋和声リズム | 非侵害 | 陪審が非侵害 | **コード進行・和声リズムは共通の建材** |
| **Shape of You**（英, Sheeran v. Chokri, 2022） | 上行マイナー・ペンタの最初の4音（"Oh I"フレーズ） | — | 非侵害 | **短く・ありふれ・当然の音型**は依拠の証拠にならない |

- 米国の潮流：**Blurred Lines のショック → 以後は "building blocks は独占させない" へ強く揺り戻し**。
  短い音型・定番進行・スケール断片・ありふれたリズムは、単独では侵害の根拠になりにくい。
- 出典：
  - WIPO Magazine "Blurred Lines: inspiration vs appropriation" https://www.wipo.int/en/web/wipo-magazine/articles/blurred-lines-the-difference-between-inspiration-and-appropriation-39329
  - ForensisGroup（Williams v. Gaye の鑑定・専門家証言解説） https://www.forensisgroup.com/resources/expert-legal-witness-blog/copyright-law-in-the-spotlight-the-williams-v-gaye-blurred-lines-case
  - National Law Review（Dark Horse 8音オスティナート） https://natlawreview.com/article/dark-horse-victory-katy-perry-central-district-california-overturns-28m-copyright
  - Gray v. Perry - Wikipedia https://en.wikipedia.org/wiki/Gray_v._Perry
  - WIPO Magazine（Sheeran "Thinking Out Loud"） https://www.wipo.int/en/web/wipo-magazine/articles/in-the-courts-ed-sheeran-succeeds-in-music-copyright-infringement-case-but-its-not-over-yet-56446
  - Billboard（Sheeran "Shape of You" UK 勝訴・"first four notes... commonplace"） https://www.billboard.com/business/legal/ed-sheeran-wins-uk-copyright-case-shape-of-you-1235055890/

### 1.3 「ありふれた音型」の抗弁：scènes à faire と de minimis

- **scènes à faire**：ジャンル上ありふれた/慣習的/必然的な要素は保護されない
  （例：ロング・ショート・ロングのリズム、定番コード進行、特定テンポ、反復フック、強拍/弱拍の交替）。
- **de minimis**：一致箇所が**短すぎる/小さすぎる**ときは侵害を免れる。
- **merger（融合）**：表現の選択肢が乏しく、アイデアと表現が融合している短断片は保護が薄い。
- Ed Sheeran の主張が象徴的：「使える音とコードは限られ、毎日6万曲がリリースされる以上、偶然の一致は必ず起きる」。
- 出典：
  - Cardozo AELJ "Scènes à Faire in Music Copyright Cases" https://cardozoaelj.com/2022/04/11/scenes-a-faire-in-music-copyright-cases-why-dont-the-courts-make-a-scene-about-music/
  - Marquette IP Law Review "Scènes à Faire in Music" https://scholarship.law.marquette.edu/iplr/vol23/iss1/8/

---

## 2. 音楽学的な実務：鑑定でどんな指標が使われるか

法廷の**専門家（forensic musicologist）**が実際に用いる観点：

1. **旋律の音高列の一致**（移調不変で比較 = 相対音程で見る）。記念樹の「音高72%一致」がこの類型。
2. **連続一致音数 / 最長共通部分列**：「何音が連続して/順序を保って一致するか」。長いほど偶然説が崩れる。
3. **リズム込みの一致**：音高だけでなく**音価・アクセント・和声リズム**が揃うか。
   Blurred Lines では Judith Finell が**「偶然の域を超える"実質的に類似した"8つの特徴」**を列挙して立証した
   （逆に反対側の Joe Bennett はベースを音符単位で並べ「音・リズム・フレージング・使用スケールが違う」と反証）。
4. **顕著な/記憶に残る箇所の一致**：フック、冒頭2小節、サビ頭、終止など「聴き手が同定に使う場所」の一致は重み大。
   記念樹でも**冒頭と末尾**の一致が効いた。
5. **和声・コード進行**：ただし定番進行は building block 扱いで**単独では弱い**（Sheeran 各件）。
6. **依拠（access）の状況証拠**：発表時期・流通・接触可能性。「独立創作」の反証が効く。

**古典的な具体例（My Sweet Lord / He's So Fine, Bright Tunes v. Harrisongs, 1976）**：
2つの短い動機（モチーフA と モチーフB）の**組み合わせと反復順序**が実質同一と判断され、
**「意図せず＝subconscious（潜在意識下）でも侵害は成立する」**と判示。依拠さえあれば故意不要、という点が M8④に直結。
- 出典：
  - Bright Tunes v. Harrisongs（GWU MCIR） https://blogs.law.gwu.edu/mcir/case/bright-tunes-music-v-harrisongs-music/
  - Performing Songwriter（事件解説） https://performingsongwriter.com/george-harrison-my-sweet-lord/

**計算論的な鑑定支援（MIR）で使われる代表手法**（本ツールの実装方針と対応）：
- **相対音程/音程列でのエンコード**（移調不変）＝絶対音高の脆弱性を回避。
- **編集距離系**：Mongeau–Sankoff（音楽向けに音価・和声を重み付けした編集距離）、Smith–Waterman（局所アラインメント＝部分一致に強い）。
- **n-gram 重複**：旋律を音程/音価の n-gram に分解し重複率を測る。テキスト剽窃検知の音楽版。
- **cardinality/originality スコア**：生成物が学習/既存曲をどれだけ「なぞった」かを測る指標（自作コーパス照合＝④に直結）。
- 出典：
  - MelodySim (arXiv 2505.20979) https://arxiv.org/abs/2505.20979
  - Fine-Grained Music Plagiarism Detection (arXiv 2107.09889) https://arxiv.org/pdf/2107.09889
  - Music Plagiarism Detection via Bipartite Graph Matching https://www.researchgate.net/publication/353375093_Music_Plagiarism_Detection_via_Bipartite_Graph_Matching

---

## 3. 実用的な警告閾値の提案（注意喚起であり法的閾値ではない）

**大原則**：単一指標で赤にしない。**「移調不変の音高列一致」×「リズム一致」×「位置（顕著箇所）」×「連続長」**を
掛け合わせ、**除外規則（§5）を通過したものだけ**を警告する。3段階（緑/黄/赤）のトリアージにする。

### 3.1 一次指標（既存エンジンの出力を流用）

- **A. 連続一致音数（移調不変・相対音程）**
  既存の音程ヒストゲートを通過した候補に対し、**最長の連続一致（LCS/局所アライン）**を数える。
- **B. n-gram 重複率**（音程 n-gram、n=3〜5）
  旋律を相対音程 n-gram に分解し、既存曲との**重複 n-gram 数 / 自曲 n-gram 数**。
- **C. 輪郭＋リズム同時一致**（音高輪郭 up/down/same と音価パターンの AND 一致長）。
- **D. 位置重み**：一致箇所がフック/サビ頭/冒頭2小節/終止に重なると重み ×1.5〜2。

### 3.2 危険帯の目安（rule of thumb / 実務ヒューリスティック）

> これらは判例から逆算した**経験則**であり、法的基準でも安全圏の保証でもない。ジャンル・テンポ・素材のありふれ度で上下する。

| 判定 | 目安（除外規則§5通過後） | 意味 |
|---|---|---|
| 🟢 緑（無警告） | 連続一致 ≤ 5音、n-gram 重複率 < 15%、輪郭+リズム同時一致 < 1小節 | ふつう。気にしなくてよい |
| 🟡 黄（要確認） | **連続一致 6〜7音**、または n-gram 重複率 **15〜30%**、または輪郭+リズム同時一致 **約2小節**、または**顕著箇所（サビ頭/冒頭）で5〜6音一致** | 「なんか聴いたことある」帯。耳で確認・出典を思い出す |
| 🔴 赤（強い注意） | **連続一致 ≥ 8音**（記憶に残るフレーズ丸ごと級）、または n-gram 重複率 **> 30%**、または**輪郭+リズムが3小節以上同時一致**、または**サビ頭/冒頭+終止の同時一致** | 記念樹型（本質的特徴の同一＋顕著箇所）。作り直し/意図的引用なら許諾を検討 |

補足の根拠：
- **8音級**を赤の主閾値にするのは Dark Horse（**8音オスティナートですら**「独占不可」と争われた＝8音は"短い断片"の上限付近）と
  記念樹（**冒頭・末尾＋高一致率**で侵害）の両端から。「8音が短い」のは**ありふれた音型のとき**であって、
  **特徴的な音型で8音連続一致すれば十分危険**、という非対称を反映して**§5の除外を先に通す**設計にする。
- **音高一致率 70% 超**（記念樹の72%）を、フレーズ〜セクション単位の**補助赤フラグ**として併用。
- リズム同時一致を必須要素の一つにするのは、鑑定が**リズム込みの一致**を重視するため（音高だけの一致は誤警告が多い）。

### 3.3 出し方（UX）

- 警告は**モーダルで止めない**。インライン注記＋「聴き比べ（A/B）」導線。判断は人間に返す（設計思想）。
- **必ず「一致箇所」を可視化**（どの音列が、どの既存曲/自作のどこと、どの程度）。数字だけ出さない。
- **緑を"安全証明"と誤読させない**文言（"検知なし＝権利上安全、ではありません"）。

---

## 4. 自作既出との「無意識の焼き直し」検知（cryptomnesia 対策）

My Sweet Lord が示す通り、**潜在意識下の再利用でも法的には侵害になりうる**。他者曲だけでなく
**自分の過去作コーパスに対しても同じ照合をかける**のが実務価値が高い（自己模倣の自覚・マンネリ回避にも効く）。

設計：
1. **自作フレーズ辞書を照合対象に含める**（既存の 4小節フレーズ辞書＝~1523件＋自作ネタDBを流用）。
   相対音程＋音価で正規化して索引。
2. **新作の各フレーズ（骨格/表面の両層）を、他者統計コーパスと自作コーパスの両方に問い合わせ**、§3.1 の指標を出す。
   - 他者ヒット → §3.2 の危険帯（権利リスク）。
   - **自作ヒット → 別チャンネルの「焼き直し注記」**（権利問題ではなく "また同じ手癖" のシグナル）。色分けを分ける。
3. **自作ヒットは骨格層で特に見る**：手癖は2拍構造線（骨格）に出やすい。表面（8分/16分/休符）の一致は
   偶然も多いので閾値を緩める。層ラベル（骨格/表面）を注記に明記。
4. **「意図的な自己引用（セルフオマージュ）」フラグ**：ユーザーが承認したら以後その一致を抑制（ホワイトリスト）。
5. 記録：焼き直し検知のログを残し、**時系列で"手癖の固着"を可視化**（作曲品質トラックの一部として）。

出典（潜在意識下でも侵害）：Bright Tunes v. Harrisongs https://blogs.law.gwu.edu/mcir/case/bright-tunes-music-v-harrisongs-music/

---

## 5. 誤警告を避ける除外規則（最重要・警告器の一級機能）

**ありふれた進行/音型への過剰反応が最大の実害。** 以下を**警告を出す前のゲート**として実装する
（scènes à faire / de minimis / merger の工学的近似）。

### 5.1 コーパス頻度による除外（データ駆動の "ありふれ度"）
- 一致した音型/n-gram が**大規模コーパスで高頻度**なら**除外 or 大幅減点**。
  「多くの曲に出る＝building block」＝法的にも保護が薄い。**自前学習の重み（E-corpus）を流用**して頻度を出す。
- 具体：n-gram の**コーパス出現率が上位◯%（例 上位10%）なら独自性ゼロ扱い**で警告しない。

### 5.2 素材そのものの除外（構造的 scènes à faire）
- **スケール順次進行**（ドレミ…／ペンタの上行下行）、**分散和音（アルペジオ）そのまま**、
  **クロマチック下降/上行**、**定番コード進行**（I–V–vi–IV, ii–V–I, カノン進行 等）、
  **反復オスティナート単体**は**音高一致でも警告しない**（Shape of You/Stairway/Dark Horse/Thinking Out Loud の教訓）。
- **単純リズム**（ロング・ショート・ロング等）**単独**の一致は無視。

### 5.3 短さ・断片性による除外（de minimis 近似）
- **除外規則§5.1/§5.2 を通っても、連続一致 ≤ 5音は原則 緑**（顕著箇所ボーナスが無い限り）。
- 一致が**非連続で散発**（間に不一致を挟む）なら重みを下げる。まとまった連続塊のみ重視。

### 5.4 誤警告を減らす合成ルール
- **AND 条件を課す**：赤は「音高一致」だけでは出さない。**音高一致 ∧ リズム一致 ∧ (連続長 or 位置)** が揃って初めて赤。
- **和声/コード進行の一致は単独で赤にしない**（building block）。旋律一致に対する**補助証拠**としてのみ加点。
- **移調・テンポ差・装飾音の揺れに頑健**に（相対音程＋音価比で正規化＝既存エンジンの移調不変性を活用）。
- **ジャンル文脈**：同一ジャンルで定番の音型は減点（genre practice としての scènes à faire）。

出典：
- Skidmore v. Led Zeppelin / building blocks（Dark Horse 判決が引用） https://en.wikipedia.org/wiki/Gray_v._Perry
- Ed Sheeran "commonplace building blocks"（Thinking Out Loud, WIPO） https://www.wipo.int/en/web/wipo-magazine/articles/in-the-courts-ed-sheeran-succeeds-in-music-copyright-infringement-case-but-its-not-over-yet-56446
- Marquette "Scènes à Faire in Music" https://scholarship.law.marquette.edu/iplr/vol23/iss1/8/

---

## 6. 本ツールへの設計含意（まとめ）

1. **警告器 = 既存類似度エンジン（移調不変・多層＋音程ヒストゲート）＋ §5 除外ゲート＋ §3 トリアージ表**。
   エンジン単体は「似ている度」しか出せない。**§5 の除外を前段に噛ませて初めて "警告" になる。**
2. **照合先を2系統**：他者統計コーパス（権利リスク）と**自作コーパス（焼き直し）**。UI で色/チャンネルを分ける。
3. **緑/黄/赤の3段階トリアージ**。数値は補助、**必ず一致箇所を可視化し、A/B 聴き比べに落とす**。判断は人間。
4. **閾値は "耳で確かめる合図" であって法的線ではない**旨を UI 文言に固定表示。
   緑を安全証明と誤読させない。
5. **層ラベル（骨格/表面）を注記に必須**：自己模倣は骨格に出る、偶然一致は表面に多い、で閾値を変える。
6. **ホワイトリスト（意図的引用/セルフオマージュ）** と**コーパス頻度による自動除外**で誤警告を抑える。
7. 将来：鑑定的な**「8つの類似特徴を列挙」型のレポート**（Finell 方式）を自動生成すると、
   人間が最終判断する足場として強い（数値の羅列より説得的）。

> 再掲：**本書は法的助言ではない。** 警告はすべて「制作時の注意喚起」であり、侵害/非侵害の結論ではない。
> 実リスクは専門家（弁護士・JASRAC 等）へ。

---

## 参考（主要出典一覧）

- 記念樹事件 - Wikipedia https://ja.wikipedia.org/wiki/記念樹事件
- MONOLITH LAW OFFICE「音楽メロディの盗作はどこから」 https://monolith.law/en/internet/music-copyright
- 北大 判例研究（記念樹） https://lex.juris.hokudai.ac.jp/coe/pressinfo/journal/vol_2/2_7.pdf
- 骨董通り法律事務所「パクリと侵害の微妙な関係」 https://www.kottolaw.com/column/000051.html
- WIPO「Blurred Lines: inspiration vs appropriation」 https://www.wipo.int/en/web/wipo-magazine/articles/blurred-lines-the-difference-between-inspiration-and-appropriation-39329
- ForensisGroup（Williams v. Gaye 鑑定） https://www.forensisgroup.com/resources/expert-legal-witness-blog/copyright-law-in-the-spotlight-the-williams-v-gaye-blurred-lines-case
- National Law Review（Dark Horse 8音オスティナート） https://natlawreview.com/article/dark-horse-victory-katy-perry-central-district-california-overturns-28m-copyright
- Gray v. Perry - Wikipedia https://en.wikipedia.org/wiki/Gray_v._Perry
- WIPO（Ed Sheeran "Thinking Out Loud"） https://www.wipo.int/en/web/wipo-magazine/articles/in-the-courts-ed-sheeran-succeeds-in-music-copyright-infringement-case-but-its-not-over-yet-56446
- Billboard（Ed Sheeran "Shape of You" UK 勝訴） https://www.billboard.com/business/legal/ed-sheeran-wins-uk-copyright-case-shape-of-you-1235055890/
- Bright Tunes v. Harrisongs（My Sweet Lord・潜在意識下の侵害） https://blogs.law.gwu.edu/mcir/case/bright-tunes-music-v-harrisongs-music/
- Cardozo AELJ「Scènes à Faire in Music」 https://cardozoaelj.com/2022/04/11/scenes-a-faire-in-music-copyright-cases-why-dont-the-courts-make-a-scene-about-music/
- Marquette IPLR「Scènes à Faire in Music」 https://scholarship.law.marquette.edu/iplr/vol23/iss1/8/
- MelodySim (arXiv 2505.20979) https://arxiv.org/abs/2505.20979
- Fine-Grained Music Plagiarism Detection (arXiv 2107.09889) https://arxiv.org/pdf/2107.09889
- Music Plagiarism Detection via Bipartite Graph Matching https://www.researchgate.net/publication/353375093_Music_Plagiarism_Detection_via_Bipartite_Graph_Matching
