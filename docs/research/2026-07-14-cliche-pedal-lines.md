# ラインクリシェ／ペダルポイント 型辞書（内声ライン語彙 C5）

- 日付: 2026-07-14
- 任務: C5 ／ 内声の動き（ライン）の語彙をゼロから立ち上げる
- 対象思想: 「機械は候補まで・仕上げは人間」。コード進行は度数で扱う。
- スコープ: (1) ラインクリシェの型辞書、(2) ペダルポイントの型辞書、(3) J-pop/アニソン/ゲーム音楽での使用文脈、(4) 静的進行への適用条件、(5) 仕様化（型ID×度数列×コード列×声部位置×文脈）＋自動付与規則案＋押し付け注意、(6) 度数表記サンプル8本以上。

度数表記の約束（本ドキュメント内）:
- 音度は `1̂ 2̂ 3̂ 4̂ 5̂ 6̂ 7̂`。半音の派生は `#5̂`（増5度）`♭7̂`（短7度＝ミクソ的な下げた7）`♮7̂`（導音＝長7度）で書く。
- コードは度数記号（メジャーキー=大文字 `I IV V`、そのキー内のマイナー=小文字 `ii iii vi`）。単独マイナーキーを主語にするときは主和音を `i` と書く。
- スラッシュはベース音の度数を後置（例 `I/5̂` = Iの第2転回、ベースに5̂）。
- 「動く声部」を **➘/➚**（下降/上昇）とその音度列で示す。

---

## 0. 総論 — クリシェとペダルは「静止を装飾する二つの相補技法」

- **ラインクリシェ（line cliché）**: ある固定コードの上で、**構成音のうち1音だけを半音で動かす**ことで、和音を替えずに“進行している感”を作る常套句。フランス語 cliché＝「決まり文句」。動きは半音、最典型は下降。[TJPS][SoundQuest][HubGuitar][sakkyoku]
- **ペダルポイント（保続音／pedal point）**: 逆に、**1音（多くはベース）を保続したまま上の和音を動かす**。保続音は最初コード内音として始まり、途中で非和声音になり、再び回収される。トニック(1̂)かドミナント(5̂)に置くのが定石。[Wikipedia][DiscMakers][SoundQuest-slash]
- 両者は「静的な和声区間（同一コード持続・循環・ワンコード）に、線的な動きを一本差して聴感の退屈を殺す」という同じ目的の裏表。クリシェは上物を動かし、ペダルはベースを止める。[imaginary-studio]

この語彙が本ツールに無いのは痛手で、**度数進行を『縦（コード）』だけでなく『横（声部の半音線）』でも記述できる**ようにするのが C5 の狙い。

---

## 1. ラインクリシェの型

半音線を「どの声部（上声/内声/ベース）に、どの向き（下降/上昇）で、長調/短調のどちらで」置くかで分類する。

### 1-A. マイナー下降クリシェ（最重要・最頻出）
主和音の**ルート音**を起点に半音で降ろす。動く音度列は `1̂ ➘ ♮7̂ ➘ ♭7̂ ➘ 6̂`。
- コード列: `i – i(maj7) – i7 – i6`（例 Am: Am–AmM7–Am7–Am6、動く音 A→G#→G→F#）[HubGuitar][SoundQuest][sakkyoku]
- メジャーキーの中では **vi**（トニック代理）上でやるのが定番（例 Cメジャーで Am 起点）。「ただのマイナーが一気にドラマチックになる」と各所が口を揃える。[sakkyoku][modern-guitar-dive]
- 3rd は絶対に動かさない（メジャー↔マイナーが反転して目的が崩れる）。動かすのはルート（＝短調では実質トップ or 内声に配置される主音）。[SoundQuest][sakkyoku]
- 洋楽典拠: “My Funny Valentine”, James Bond Theme, “Michelle”(Beatles), “Stairway to Heaven” 導入。[Songtive][SoundQuest]

### 1-B. メジャー下降クリシェ（オクターブ→7th 型）
メジャー主和音の**ルート（オクターブ上）**を半音で降ろす。`1̂ ➘ ♮7̂ ➘ ♭7̂`。
- コード列: `I – I(maj7) – I7 → IV`（例 C–CM7–C7→F、動く音 C→B→B♭→A）。C7 が IV へのドッキング（セカンダリドミナント）になり自然に IV へ落ちる。[Basschat][er-music]
- 用途: イントロ／Aメロの導入。“Something”(Beatles) 型。

### 1-C. メジャー上昇クリシェ（オーギュメント・クライム）
メジャー主和音の**5度**を半音で上げる。`5̂ ➚ #5̂ ➚ 6̂ ➚ ♭7̂`。
- コード列: `I – I+ – I6 – I7`（例 C–Caug–C6–C7、動く音 G→G#→A→A#）。最後の I7 でやはり IV へ着地しやすい。[gakkiii][sakkyoku-aug][chiebukuro]
- 邦楽では I6 の代わりに `VIm/1̂`、I+ の代わりに `♭13` テンションで書く流派もある（同じ半音線）。着地後は `IV–IIIm–VIm–IIm–V7` の循環に繋ぐパターンが多い。[chiebukuro]
- 効果: 段階的な高揚・ウキウキ感。イントロ/アウトロ/Aメロなど“耳を引く場所”に。[SoundQuest][hikigatari]

### 1-D. ベースライン・クリシェ（上物固定・ベース半音）
本来のクリシェ定義（1音だけ動かす）からは外れる亜種だが定番。上の三和音を保ったままベースを半音で歩かせる。[SoundQuest]
- 下降例: `I – I/♮7̂ – I/♭7̂ – IV/6̂`（C–C/B–C/B♭–F/A…）や、短調 `i – i/♮7̂ – i/♭7̂ – VI/6̂`（“Stairway”下降・“Dear Prudence”）。[Basschat][Songtive]
- 上昇例: `I – I/2̂ – I/3̂ …` の順次上行ベース。
- ペダルの「止める」に対し、こちらは「歩かせる」。実質は**下降ベースライン語彙**でもあり、ペダルの対極として辞書化する価値あり。

### 声部位置の別（1-A〜1-C 共通の演奏差）
同じ半音線でも置く声部で表情が変わる。[pianogroove][TJPS]
- **上声（ソプラノ）**: 線がメロディ級に前へ出る＝フック狙い。ただし歌メロと衝突しやすい。
- **内声（アルト/テナー）**: 最も“上品”で気付かせずに効かせる定番。ジャズの標準置き場。
- **ベース**: 1-D（ベースライン・クリシェ）。土台が動くので体感が最も強い。

---

## 2. ペダルポイントの型

保続音の音度で二分。ベース保続が最頻だが、最高音保続（インヴァーテッド）・内声保続（インターナル）・二音保続（ダブル）もある。[Wikipedia][DiscMakers]

### 2-A. トニックペダル（1̂ を保続）
ベースに 1̂ を敷いたまま上を動かす。上の和音は**トニック/サブドミナント寄り**にシフトして聴こえ、安定・地に足の着いた広がり。[beyondmusictheory]
- コード列例: `I – IV/1̂ – V/1̂ – I`（1̂ ペダル上に I·IV·V を積む）／ ワンコード的な浮遊。
- 文脈: **イントロ**、Aメロの静的部、アンビエント/RPGフィールドの土台。テンションを自然に混ぜられる。[anikiblog][4th-signal]
- 典拠: Van Halen “Jump” 冒頭（C ペダル上に F/G/C）。[DiscMakers]

### 2-B. ドミナントペダル（5̂ を保続）
ベースに 5̂ を敷いたまま上を動かす。上の和音は**サブドミナント/ドミナント寄り**に聴こえ、**トニックへ解決する力を溜める**＝緊張と期待。[secretsofsongwriting][sakkyoku-pedal]
- コード列例: `I/5̂ – IV/5̂ – V – V7 → I`（例 C/G–F/G–G–G7→C）。
- 文脈: **Bメロ→サビ手前の「溜め」**、サビ直前4小節を丸ごと 5̂ ペダルで踏み続けると強力なエネルギービルダー。ヴァースが V で終わりサビが I で始まる曲で特に効く。[secretsofsongwriting]
- 典拠: ゲーム音楽の緊張演出（DQ「おおぞらをとぶ」等でペダル解説）。[sleepfreaks][senzoku]

### 2-C. その他の保続バリエーション
- **インヴァーテッド（最高音保続）**: 高い 1̂/5̂ を鳴らし続け下で和音が動く。The Supremes “You Keep Me Hangin' On”（オクターブ E を A/G/F の上で）。[Wikipedia]
- **インターナル（内声保続）**: 真ん中で保続。Beatles “Blackbird” の鳴り続ける G。[DiscMakers]
- **ダブルペダル（二音保続）**: 現代ポップ頻出。Oasis “Wonderwall” の D と G を踏み続ける `Em7 – G – Dsus4 – A7sus4`。[DiscMakers]

---

## 3. J-pop / アニソン / ゲーム音楽での使用例・文脈

- **マイナー下降クリシェ（1-A）**: J-popバラードの Aメロ/イントロで vi 起点が定番。「やさしいキスをして」「涙がキラリ☆」等が SoundQuest で例示。感情の陰りを一気に足す。[SoundQuest]
- **上昇クリシェ（1-C）**: Mr.Children「and I love you」Aメロで `I–I+–I6`。クマムシ「あったかいんだからぁ♪」。WANDS「世界が終わるまでは」（スラムダンク主題歌）もクリシェ曲として頻出。[wellen][sakkyoku-aug][guitarist-muscle]
- **クリシェ総論の邦楽言及**: 「I–Iaug–I6–I7 はインパクトが強くイントロ/アウトロ/Aメロ向き」「I–IM7–I7 は印象が強く使いやすいのでイントロ定番」。[wellen][hikigatari]
- **ペダルポイント（ゲーム音楽）**: RPGの浮遊・飛行・広大なフィールドでトニックペダル、緊張場面/ボス前でドミナントペダル。ドラクエIII「おおぞらをとぶ」がペダル解説の教材。ベースに置く音は「ド・ラ（トニック系）かソ（ドミナント）」が定石と明言。[sleepfreaks][senzoku]
- **文脈の要点**: クリシェもペダルも「イントロ・Aメロ・溜め」という**動きの少ない場所**に差すのが共通見解。サビのように和声が忙しく回る所には基本入れない。[anikiblog][4th-signal]

---

## 4. 適用条件 — 「静的な区間のどこに差すと効くか」

ラインを差して効くのは、和声が止まっている＝**線的動きが不足している**区間。具体的判定条件:

1. **同一コード持続** ≥ 2小節（例 Aメロ頭の伸ばし、ワンコード）→ クリシェの一等地。
2. **短い循環（ループ）で主和音に居座る**区間（vi 中心のループ等）→ vi起点のマイナー下降クリシェ。
3. **主音/主和音のロングトーン土台**（イントロ、アンビエント）→ トニックペダル。
4. **サビ手前でドミナント(V)に居続ける“溜め”4〜8小節**→ ドミナントペダル。
5. **上物は動かしたいがコードは替えたくない**（コード感を保ちたい）→ ベース保続（ペダル）か、逆にベース半音（1-D）。

差してはいけない所: サビ等の**和声が既に毎小節動いている密な区間**（クリシェは冗長、ペダルはベースの躍動を殺す）。[anikiblog]

---

## 5. 仕様化

### 5-1. 型辞書（型ID × ライン度数列 × 対応コード列 × 声部位置 × 適用文脈）

| 型ID | 種別 | ライン度数列（動く音） | 対応コード列（度数） | 声部位置 | 長/短 | 適用文脈 |
|---|---|---|---|---|---|---|
| `LC-min-desc` | クリシェ | `1̂➘♮7̂➘♭7̂➘6̂` | `i – iM7 – i7 – i6` | 上声/内声 | 短調・またはメジャー内 vi | Aメロ/イントロ/バラード、陰り付与 |
| `LC-min-desc-res` | クリシェ | `1̂➘♮7̂➘♭7̂➘6̂→` | `i – iM7 – i7 – i6 → IV` | 内声 | 短調 | 上に同じ＋i6が II/IV へ橋渡し |
| `LC-maj-desc` | クリシェ | `1̂➘♮7̂➘♭7̂` | `I – IM7 – I7 → IV` | 上声/内声 | 長調 | イントロ/Aメロ、IVへ自然着地 |
| `LC-maj-asc-aug` | クリシェ | `5̂➚#5̂➚6̂➚♭7̂` | `I – I+ – I6 – I7 → IV` | 内声 | 長調 | イントロ/アウトロ/Aメロ、高揚 |
| `LC-bass-desc` | ベース線 | `1̂➘♮7̂➘♭7̂➘6̂` | `I – I/♮7̂ – I/♭7̂ – IV/6̂` | ベース | 長/短 | 下降ベース土台、静的Aメロ |
| `LC-bass-asc` | ベース線 | `1̂➚2̂➚3̂` | `I – I/2̂ – I/3̂` | ベース | 長 | 順次上行の推進 |
| `PED-tonic` | ペダル | `1̂` 保続 | `I – IV/1̂ – V/1̂ – I` | ベース(or最高音) | 長/短 | イントロ/静的Aメロ/フィールド |
| `PED-dominant` | ペダル | `5̂` 保続 | `I/5̂ – IV/5̂ – V – V7 → I` | ベース | 長/短 | Bメロ→サビ手前の「溜め」 |
| `PED-double` | ペダル | 上二音（例 4̂5̂ or 1̂5̂）保続 | `vi7 – I – IV(sus) – V(sus)` | 上二声保続 | 長 | ギターポップの浮遊感 |
| `PED-inverted` | ペダル | 高位 1̂ or 5̂ 保続 | `I(hi) 上で IV/V が動く` | 最高音 | 長/短 | 執拗な反復・切迫感 |

補足: `LC-*` の最終音（6̂ や ♭7̂）は次コードへの橋になる（i6→IV/ii、I7→IV）。辞書の各行は「差し込むと自動でどのコードに着地したがるか」も持たせると生成が繋がる。

### 5-2. 「既存進行にラインを自動付与する」生成規則案

入力: 度数コード列＋小節割り＋（あれば）メロディ度数列＋セクションタグ。

1. **静的区間検出**: §4の条件1〜5でスキャン。同一コード≥2小節、または主和音ループ、または V 溜めを候補区間として抽出。
2. **型の第一次選択**（コード種と向きの規則）:
   - 対象がマイナー三和音 → `LC-min-desc`（第一候補）。
   - 対象がメジャー三和音・イントロ/Aメロ → `LC-maj-desc` か `LC-maj-asc-aug`（上昇は高揚が欲しい時）。
   - Vで溜める区間 → `PED-dominant`。主音土台/イントロ → `PED-tonic`。
   - ベースを動かしたい/上物固定したい → `LC-bass-desc`。
3. **動かす声部の禁則**: **3rd は動かさない**（コード品質を反転させるため）。動かすのはルート系（1̂/オクターブ）か 5̂ のみ。[SoundQuest][sakkyoku]
4. **声部位置の既定**: 既定は**内声**（気付かせず効かせる）。フック狙い指定なら上声、土台を動かすなら `LC-bass-*`。
5. **半音線→コードラベル写像**: 動く音度列を各拍/半小節へ割り付け、`iM7 / i7 / i6 / I+ / I6 / I7 / I/♮7̂…` の度数ラベルに変換して出力（本ツールは度数で扱う思想に合致）。
6. **リズム配置**: 元の和声リズムに同期（1小節1歩 or 半小節1歩）。だらだら動かさない。
7. **メロ衝突チェック（重要）**: メロディ度数列がある場合、その拍で鳴る旋律音と、クリシェの動く音（例 ♮7̂/♭7̂）が短2度/減衝突しないか検査。衝突する型は候補から降格。
8. **着地の接続**: 型の最終音を次コードへ橋渡し（`i6→IV`, `I7→IV`, `PED-dominant→I`）。
9. **出力は複数候補**（型違い・声部違い・長さ違いを2〜4本）。単一解を押し付けない。

### 5-3. 押し付けになる危険 — 注意（設計含意）

- **cliché＝決まり文句**。名は体を表し、乱発すると一気に安っぽく・古臭くなる。**1セクションに1本まで**を既定にし、曲全体での使用回数に上限を持たせる。[SoundQuest]
- **静的区間限定**。動いている進行に無理やり差すと逆効果。§4の検出に通らない区間には出さない。[anikiblog]
- **3rd 禁則は絶対**（品質反転）。写像段で機械的に守らせる。[SoundQuest][sakkyoku]
- **メロ非対応の危険**: メロが自然7度で伸びている所にクリシェが♭7を置くと濁る。メロ度数が無い状態での自動付与は「提案止まり・要耳確認」を明示。
- **ペダルはベースを占有する**。既存ベースラインが躍動している曲に PED を上書きすると殺してしまう。ペダルは**上書きでなく“別アレンジ候補”として提示**。
- 思想準拠: 機械は**型と候補まで**。声部レジスター・実際のボイシング・最終採否は人間。C5辞書は「横（線）の語彙を度数で提示する足場」であって完成品ではない。

---

## 6. 度数表記サンプル（型別・計11本）

キーは断りなければ Cメジャー／Aマイナーを基準。`|` は小節、`:` の後が動く声部の実音列。

1. **`LC-min-desc`（Amで）**: `Am | AmM7 | Am7 | Am6` ／度数 `i – iM7 – i7 – i6` ／内声 ➘ `A–G#–G–F#`
2. **`LC-min-desc-res`（Am→D）**: `Am | AmM7 | Am7 | Am6 → D` ／`i – iM7 – i7 – i6 → IV`（Am6の6th=F#がDのコードトーンへ橋渡し）
3. **メジャーキー内 vi 起点（Cメジャー）**: `Am | AmM7 | Am7 | D7` ／`vi – viM7 – vi7 – II7`（内声 A→G#→G→F#、最後 II7 で二次ドミナント）
4. **`LC-maj-desc`（C→F）**: `C | CM7 | C7 → F` ／`I – IM7 – I7 → IV` ／上声 ➘ `C–B–B♭(→A)`
5. **`LC-maj-asc-aug`（C→F）**: `C | Caug | C6 | C7 → F` ／`I – I+ – I6 – I7 → IV` ／内声 ➚ `G–G#–A–A#`
6. **上昇クリシェ→循環（邦楽定番）**: `C | Caug | C6 | C7 | F | Em | Am | Dm | G7` ／`I – I+ – I6 – I7 – IV – iii – vi – ii – V7`
7. **`LC-bass-desc`（下降ベース土台）**: `C | C/B | C/B♭ | F/A` ／`I – I/♮7̂ – I/♭7̂ – IV/6̂` ／ベース ➘ `C–B–B♭–A`
8. **`LC-bass-desc`（短調・Stairway型）**: `Am | Am/G# | Am/G | D/F#` ／`i – i/♮7̂ – i/♭7̂ – IV/6̂` ／ベース ➘ `A–G#–G–F#`
9. **`PED-tonic`（トニックペダル・イントロ）**: `C | F/C | G/C | C` ／`I – IV/1̂ – V/1̂ – I` ／ベース保続 `C……`
10. **`PED-dominant`（サビ前の溜め）**: `C/G | F/G | G | G7 → C` ／`I/5̂ – IV/5̂ – V – V7 → I` ／ベース保続 `G……→C`
11. **`PED-double`（ダブルペダル・ギターポップ）**: `Em7 | G | Dsus4 | A7sus4` ／`vi7 – I – V(sus) – II7(sus)`（G と D を上で踏み続ける／Wonderwall型）

（型カバレッジ: 1-A×3、1-B×1、1-C×2、1-D×2、2-A×1、2-B×1、2-C×1 ＝ 全型に最低1本）

---

## 7. 設計含意（本ツールへの取り込み方針・要約）

- コード進行の度数表現に、**声部の半音線という「横」の次元**を追加する第一歩。型辞書(§5-1)をそのままデータ化すれば `substitute_chord` / `harmonize` 系の隣に「ラインを差す」候補生成器が置ける。
- 生成器は §5-2 の手順（静的検出→型選択→3rd禁則→声部→写像→メロ衝突→複数候補）を純ロジックで実装可能。外部モデル不要。
- 既存の「セクション役割（イントロ/Aメロ/溜め/サビ）」結線と噛み合わせると、文脈条件（§4）を役割タグで自動判定できる。
- **鉄則**: 提案は複数・静的区間限定・1セクション1本・3rd不動・メロ衝突は降格・ペダルは別アレンジ提示。cliché の本質は「常套句」＝出しすぎたら負け。

---

## 出典（URL）

- TJPS “Line Clichés”: https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chord-progressions/line-cliches/
- HubGuitar “The Minor Line Cliché”: https://hubguitar.com/fretboard/minor-line-cliche
- PianoGroove “The Minor Line Cliché Tutorial”: https://www.pianogroove.com/jazz-piano-lessons/the-minor-line-cliche-tutorial/
- Songtive Blog “What Are Line Clichés”: https://www.songtive.com/blog/what-are-line-cliches-in-music-and-how-do-you-use-them/
- Basschat “Songs featuring line clichés”: https://www.basschat.co.uk/topic/220776-songs-featuring-line-cliches/
- SoundQuest「ライン・クリシェ」: https://soundquest.jp/quest/chord/chord-mv4/line-cliche/
- SoundQuest「スラッシュコード ❷ペダルポイント」: https://soundquest.jp/quest/chord/chord-mv3/slash-chord-2/
- sakkyoku.info「クリシェの技法解説」: https://sakkyoku.info/theory/cliche-01/
- sakkyoku.info「オーギュメントコード」: https://sakkyoku.info/theory/augmented-triad/
- sakkyoku.info「ペダルポイントの解説」: https://sakkyoku.info/theory/pedal-point/
- Modern Guitar Dive「コード進行のクリシェ」: https://modern-guitar-dive.jp/3076
- gakkiii「クリシェ（5度音上昇型と3度音上下型）」: https://gakkiii.hatenablog.com/entry/2020/01/30/180000
- Yahoo!知恵袋「上昇クリシェ I△→Iaug→I6→I7 まとめ」: https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13254839658
- wellen「クリシェが使用された有名なJPOP3曲」: https://wellen.jp/compose/cliche/
- 弾き語りすとLABO「クリシェ」: https://hikigatarisuto-labo.jp/cliche/
- ギタリストマッスル「クリシェが輝く名曲12選」: https://guitarist-muscle.com/cliche/
- あにPブログ「ペダルポイントの活用法」: https://anikiblog.com/blogs/pedal-point-harmony-techniques/
- あにPブログ「クリシェを使った印象的なコード進行」: https://anikiblog.com/blogs/cliche-chord-progressions-chromatic-movement/
- イマジナリースタジオ「クリシェとペダルポイント」: https://www.imaginary-studio.jp/column/cliche-and-pedal-point/
- わくわく作曲先生「ペダルポイントの使い方1」: https://www.4th-signal.com/compose/pedal-point1/
- Sleepfreaks「ドラゴンクエスト おおぞらをとぶ 7.ペダルポイント」: https://sleepfreaks-dtm.com/chord-analize/heavenly-flight-7/
- 洗足オンラインスクール RPG: https://www.senzoku-online.jp/RPG/
- Wikipedia “Pedal point”: https://en.wikipedia.org/wiki/Pedal_point
- Disc Makers Blog “The Pedal Point: A Quick Study”: https://blog.discmakers.com/2022/02/pedal-point/
- Secrets of Songwriting “Building Song Energy By Using a Dominant Pedal”: https://www.secretsofsongwriting.com/2013/04/18/building-song-energy-by-using-a-dominant-pedal/
- Beyond Music Theory “How Pedal Point Can Be Used In Your Music”: https://www.beyondmusictheory.org/pedal-point/
