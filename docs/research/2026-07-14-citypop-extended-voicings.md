# シティポップ／フュージョンの拡張和声・ボイシング語彙 仕様（C6）

- 作成: 2026-07-14
- 種別: research（外部調査＋和声分析＋仕様化）
- 目的: 度数＋品質（三和音/7th中心）しか扱えない現状に、**テンション（9/11/13）・アッパーストラクチャ・分数コード・鍵盤ボイシング**の語彙を足し、`genre=citypop` プリセットとして機械が「候補」を出せるようにする。
- 思想の遵守: 機械は候補まで、仕上げは人間。本仕様は「変換表＋辞書＋やり過ぎ警告」を与えるが、最終決定（どのテンションを実際に鳴らすか、声部を人が動かすか）は人に残す。

---

## 0. 前提と記法

- 度数はキー中心のローマ数字（大文字=メジャー系、小文字=マイナー系の慣例だが、本書は品質を明示するので大文字で書き品質を後置する）。
- テンション: 9=長9度, ♭9, ♯9, 11=完全11度, ♯11, 13=長13度, ♭13。
- アボイドノート=そのコード機能・スケール上で「ぶつかる／機能を殺す」ため**持続では避ける**音（経過は可）。
- 分数コード表記 `X/Y` = 上部和音X・ベースY（例 `F/G` = Fトライアド on G）。日本の実務で「オンコード」とも呼ぶ。
- US = Upper Structure Triad（上部三和音）。`US♭VII/C7` のように「C7の上に♭VIIのメジャートライアド」。

---

## 1. コード機能別 テンション付与規則（トニック/サブドミ/ドミナント）

シティポップは**機能和声の骨格の上に、ジャズ由来のカラートーン**を薄く敷くのが基本。三和音→拡張の対応を機能ごとに定める。

### 1-1. トニック系（T: IMaj7, IIIm7, VIm7）
- **IMaj7 → IMaj7(9) / IMaj7(9,13)**。9と13は常に安全。
  - アボイド: **11（=4度, IMaj上のF）** はMaj3rdと半音でぶつかる → 付けない（♯11なら可、後述リディアン）。
- **IMaj7(♯11)**（=リディアン化）: I を浮遊・都会的にしたい時。IVがしばらく来ないセクションで有効。ただし多用は「宙吊り」で着地感を失う。
- **IIIm7 → IIIm7(11)**。9（=IIImの9=F♯…キー上は♯扱いになりがち）は**♭9的にぶつかる**ため基本アボイド、11は安全。
- **VIm7 → VIm7(9,11)**。9・11とも安全でエオリアン的な陰り。13(=キーの♯4/♭5相当)はドリアン化したい時のみ。

### 1-2. サブドミナント系（SD: IIm7, IVMaj7, IVm(SDm)）
- **IIm7 → IIm7(9,11)**。ドリアンで9・11とも安全。**IIm7(9)** はシティポップの ii-V の顔。
  - 13（ドリアンの長13）は明るく開くが、直後のV7へ行く時は9・11で締める方が自然。
- **IVMaj7 → IVMaj7(9) / IVMaj7(♯11)**。IVはリディアンが母体なので**♯11が自然**（Maj7(9,♯11,13)まで乗る＝リディアン総取り）。これがシティポップの「上品な浮遊」の正体（出典: sakkyoku.info sus4／うちやま）。
- **サブドミナントマイナー IVm6 / IVm7 / ♭VIMaj7**: 泣きの半音下降を作る要。**IVm6(9)**（=IImの♭5でなくメジャー6を持つ）や **♭VIIMaj7 / ♭VIMaj7** で借用。IVm7(9) の9は安全、11はぶつかる（アボイド）。

### 1-3. ドミナント系（D: V7, III7, secondary dominant）
- **V7 → V7(9,13)**（ナチュラルテンション）がシティポップの標準ドミナント。**V7(13)** は開放的、**V7(9)** は素直。
  - アボイド: **11（完全11度=Cの上のF相当）** は3rdと半音 → sus4にするか避ける。
- **オルタード（V7alt: ♭9,♯9,♭13,♯11）** はトニックマイナーやドラマチックな解決前に。長く鳴らすとフュージョン色が強くなりすぎるので**着地直前の1拍**が実務。
- **セカンダリドミナント（III7, VI7, II7, VII7）**: 解決先がマイナーなら **♭9／♭13** を優先（III7(♭9)→VIm）。解決先がメジャーなら 9,13。
- **sus4化（V7sus4, V13sus4）**: 3rdを保留し緊張を和らげる。分数コード `IV/V`・`IIm7/V` で表現（次章）。シティポップ／AOR頻出。

> 設計含意: テンションは「機能×スケール」で決まる。エンジンは各度数に **母体スケール（イオニアン/ドリアン/リディアン/ミクソ/エオリアン/オルタード）** を持たせ、そのスケール音のみをテンション候補に、非スケール半音衝突を**アボイド判定**すればよい。

---

## 2. アッパーストラクチャトライアド（US）辞書

「シェル（ルート＋3rd＋7th、または左手）＋右手メジャー/マイナートライアド」でテンションを一撃で作る。ドミナントで最強に効く。

### 2-1. ドミナント7th 上の US（Cで例示。度数はコードルートからの上部三和音ルート）
（出典: jazztutorial, Wikipedia "Upper structure", jazzguitar.be）

| US（三和音） | 対C7 例 | 生成テンション | サウンド／用途 |
|---|---|---|---|
| **US II（長）** | D/C7 | 9, ♯11, 13 | リディアン♭7。**フュージョンの定番**、明るく開く |
| US ♭III（長） | E♭/C7 | ♯9, 5, ♭7 | ブルージー（♯9） |
| US ♭V / ♯IV（長） | G♭/C7 | ♭9, ♯9(=♭5系), 13 | オルタード寄り |
| US ♭VI（長） | A♭/C7 | ♭13, root, ♯9 | オルタード（強い緊張→マイナー解決） |
| US VI（長） | A/C7 | 13, ♭9, 3 | ♭9系ドミナント |
| US ♯iv（短） | F♯m/C7 | ♭5, ♭7, ♭9系 | 代理・トライトーン系 |
| US i（短） | Cm/C7 | root, ♯9, 5 | マイナー借用感 |

- **実務の二枚看板**: 「明るく開くなら **US II（D/C7）**」「暗く締めるなら **US ♭VI（A♭/C7）** か US VI（A/C7）」。

### 2-2. メジャー7th 上の US（シティポップの浮遊感の核）
- **US II / IMaj7**（例 D/CMaj7）= 9, ♯11, 13 → **リディアンの一撃**。IVMaj7 や 浮遊トニックに最適。
- **US V / IMaj7**（G/CMaj7）= 9, (7), … 素直に9・13を足す穏当版。
- **US iii(短) / IMaj7**（Em/CMaj7）= 7,9,3 の柔らかい上積み。

### 2-3. マイナー7th 上の US
- **US ♭III(長) / IIm7 or VIm7**（例 Dm7 上に F）= 単なる内声だが 9 を含めた開き。
- **US ♭VII(長) / m7**（Dm7 上に C）= ドリアン11・13 の開放。
- **US IV(短?)** 系は暗くなるので選択的。

> 設計含意: US辞書は `{ chordQuality, usRootInterval, usQuality } -> tensionsProduced` の表で持てる。ボイシング生成器は「シェル（左手/下部）＋USトライアド（右手/上部）」の2ブロックで出力できるので、**度数進行を壊さずに"citypop度"を可変**にできる（US適用率をノブ化）。

---

## 3. 分数コード（オンコード）辞書

シティポップ／AOR／ソウルで単体コードとして機能する頻出型。ベースの動きと sus 感がキモ。

| 分数コード | 構成 | 実質 | 機能／用途 | 出典 |
|---|---|---|---|---|
| **IV/V**（例 F/G） | G,+F A C | **V7sus4(9) omit3** に近い | ドミナントの柔化。**サビ頭・転回の定番**。解決も宙吊りも可 | guitar-hakase, sakkyoku |
| **IIm7/V**（例 Dm7/G） | G,+D F A C | **G7sus4(9)** | 同上、より厚い。ii-Vを1コードで圧縮 | 同上 |
| **I/V**（C/G） | G,+C E G | V上のトニック=**懸垂**、装飾的解決前 | ペダルトニック | — |
| **♭VII/I**（B♭/C） | C,+B♭ D F | Cミクソ／sus的、ファンク単体和音 | R&B/ファンク色 | — |
| **IV/III / VIm on other bass** | ベース経過で下降ライン作り | クリシェ的ベースライン | — |
| **IIIm/♭III など passing** | 半音/全音のベース経過 | ライン・クリシェ | — |
| **V/IV**（G/F） | F,+G B D | IV上のドミナント感（リディアン♭7的） | 明るい経過 | — |
| **♭VI/♭VII → I**（A♭/B♭→C） | サブドミナントマイナー的上昇 | 王道の泣き上昇 | — |

- **最重要は IV/V と IIm7/V**：「サブドミ→ドミナント」の彩りとして V を sus 化する語彙。**シティポップのサビ・Aメロ折返しで頻出**（sakkyoku.info「ドミナントsus4→ドミナント」）。
- ベース保続（ペダル）型（`X/I`, `X/V`）は「進行を止めずに色だけ変える」ので、機械の候補提示に向く。

> 設計含意: 分数コードは `{ upperTriad(度数,品質), bass(度数) }` で表現。既存の "度数＋品質" 表現を **bass度数フィールド** で拡張すればMIDI化は容易（ベース＝bass度数、上部＝upperTriad）。sus解決の有無（F/G→C か F/G止め）は人に委ねる＝候補として両方出す。

---

## 4. ボイシング型（鍵盤系実務）と声部間隔規則

### 4-1. 左手ルートレス（Type A / Type B）
- ベース（別トラック or 左手最下）にルートを任せ、鍵盤和音は**ルート省略**で色音（9/11/13）を入れる（出典: thejazzpianosite, pianogroove, pianowithjonny）。
- **Type A**: 下から **3-5-7-9**（最低音が3rd）。
- **Type B**: 下から **7-9-3-5**（最低音が7th）。
- ii-V-I では **A↔B を交互**にすると声部移動が最小（ボイスリーディング最適）。
  - 例（C key）: Dm9=**F A C E**(A) → G13=**F A B E**(B, 9省き13足す変種) → CMaj9=**E G B D**(A)。
- 実装レンジ: おおむね **C3〜C5**（両手中央域）に色音を収める。下は濁る、上は薄い。

### 4-2. 右手4声（クローズ／drop2）
- **クローズ4声**: 1オクターブ内に4音（例 CMaj7=C E G B）。メロディ下のブロックコードに。
- **drop2**: クローズの**上から2番目の音を1オクターブ下げる**→開いて鳴りが良くなる。
  - 例 CMaj7 クローズ(C E G B, top=B) の2番目=G を落とす → **G C E B**。中低域で濁らず、シティポップのエレピ／ギターに合う。
  - **drop2は最低音と次音の間隔が広がる**ので4〜7弦（ギター）や両手分担に自然。
- **drop3 / drop2&4** はより広い開き（ビッグバンド的）。citypopでは drop2 が主。

### 4-3. 4度積み（クォータル／モーダル）
- 完全4度を積む（例 C-F-B♭-E♭…）と**機能を曖昧化した浮遊**。McCoy Tyner/フュージョン由来。
- シティポップでは **sus4・m7・IVMaj7♯11 の上**で効く。トニックの長時間保続やイントロのパッドに。
- 4度3〜4声（例 So What voicing: E A D G + C）。**機能を薄めるので、進行の要所では使わずパッド／繋ぎに**。

### 4-4. 声部間隔（スペーシング）の規則
- **下は広く、上は狭く**（倍音列に倣う）: 最低音間隔は**長3度以上（できれば4度〜）**、上部は3度・2度で密に。
- **低音域で長3度未満（短2度・短3度）を作らない**（濁る）。特に **C3以下では3rdと7thを近接させない**。
- **9th と ルート** を同オクターブで隣接（短2度）に置かない（ルートレスが好まれる理由）。
- **♯11 と 5th** は半音衝突 → どちらか省略（普通は5thを省く）。
- **メロディと最上声部**が長2度以内でぶつかる時は上声を1つ落とす（drop）か省略。
- **共通音保持＋最小移動**（ボイスリーディング）を優先＝コード変わってもできるだけ動かさない。

> 設計含意: ボイシング辞書は `{ voicingType: rootlessA|rootlessB|closed|drop2|quartal, tones:[度数...], octaveRange }`。生成器は「進行（度数＋品質＋テンション）」→「ボイシング型を選び声部配置」の2段。**スペーシング規則はバリデータ**（低域短2度・♯11/5共存・メロ衝突）として実装＝やり過ぎ／濁り検出に流用できる。

---

## 5. 日本のシティポップ和声 頻出語彙（曲・進行）

分析記事・楽曲から抽出（**統計・語彙のみ抽出、リテラルな旋律は保存しない**）。

- **王道進行 `IVMaj7 - V7 - IIIm7 - VIm7`**（4536）: J-POP/シティポップの背骨。IVMaj7で浮遊、V7で押し、IIIm7→VIm7で切なく落ちる（出典: Wikipedia "Royal road progression", akutsuki-music, nicovideo大百科）。
- **丸サ進行（Just The Two of Us 進行）`IVMaj7 - III7 - VIm7 - (♭VII7 or Vm7) - I7`**: III7が VIm7 への一時ドミナント、I7が IVMaj7 への一時ドミナント（部分転調感）。フュージョン/ネオシティポップ頻出（出典: onlive.studio blog）。
- **ii-V-i / ii-V 連鎖**: Plastic Love（竹内まりや, Gm系で i-IV-ii-v ループ＝繰返しでii-V-i化）、大橋純子「テレフォン・ナンバー」、藤井風/Nakata系まで（出典: jaslikesjazz "The Chords of City-Pop"）。
- **循環コード（山下達郎系）**: I-VIm-IIm-V 系のターンアラウンドを Maj7/9 で厚化。サビの推進（出典: YouTubeシティポップ講座、ticketjam 山下達郎解説, note craftsoundstudio）。
- **IV→IVm（サブドミナントマイナー）／♭VIIMaj7 借用**: 泣きの半音下降（E→E♭→D…）。角松敏生/山下達郎の甘い転回。
- **IVMaj7(♯11) のリディアン浮遊**: 「IVをIVMaj7にするとシティポップの上品さ」（出典: sakkyoku.info）。
- **F/G（IV/V）等の分数ドミナント**: サビ頭の宙吊り、AメロからBメロの橋渡し。
- **ギター実務**: セブンス・ナインス・Maj7フォーム、ハイポジションの3〜4声（テンション入り）、カッティングでの sus/9th（出典: guitarmagazine.jp「シティ・ポップ頻出ギターコードフォーム帳」）。

---

## 6. 仕様：ジャンルプリセット `genre=citypop`

### 6-1. 変換表（度数進行 → 拡張進行）
入力は「度数＋基本品質（triad/7th）」。出力は「品質＋テンション（＋任意でUS／分数）」。**確定ではなく候補**（各行に強度パラメータ）。

| 入力（機能/度数） | 既定の拡張出力（citypop） | 任意の強め候補 |
|---|---|---|
| I（triad/Maj） | **IMaj7(9)** | IMaj7(9,13) / IMaj9→I6/9 |
| I（浮遊させたい） | IMaj7(9,♯11) | US II/IMaj7（D/C） |
| IIm | **IIm7(9)** | IIm7(9,11) / Dm9 |
| IIIm | IIIm7 | IIIm7(11) / III7(♭9)（セカンダリD化） |
| IV（Maj） | **IVMaj7(9)** | IVMaj7(9,♯11)（リディアン） / US II/IVMaj |
| IVm（SDm） | **IVm6 or IVm7(9)** | ♭VIIMaj7 / ♭VIMaj7 借用 |
| V（7） | **V7(9,13)** | V7sus4→V7 / V7alt（着地直前） / **IV/V・IIm7/V** |
| VIm | **VIm7(9)** | VIm7(9,11) |
| VII°/VIIm7♭5 | IIm7♭5 として ii-V化 | — |
| （ターンアラウンド） | I6/9 - VIm9 - IIm9 - V13 | 王道 IVMaj7-V7-IIIm7-VIm7 に差替 |

適用ノブ（0.0〜1.0）:
- `tensionDensity`（9→13→♯11の順に足す量）
- `usRate`（USトライアドで置換する率）
- `slashRate`（V を IV/V・IIm7/V に化ける率）
- `borrowRate`（SDm・♭VIIMaj7 等の借用頻度）
- `voicingOpenness`（closed→drop2→quartal）

### 6-2. ボイシング辞書（品質→推奨ボイシング）
```
IMaj7(9)      : rootlessA  [3,5,7,9]  range C3–C5
IMaj9/6-9     : drop2      [1,5,7,9]→drop2
IIm7(9)       : rootlessB  [7,9,3,5]
V7(9,13)      : rootlessA  [3,13,7,9]  (5省略, ♯11なら5省略)
V7alt         : US ♭VI/VI トライアド on 3-7シェル
IVMaj7(9,♯11) : quartal or drop2 (5省略で♯11を活かす)
VIm7(9,11)    : rootlessA/quartal
IV/V (F/G)    : bass=V, upper=IVトライアド(＋9)  range: bassG2, upper C4付近
```
規則（§4-4のバリデータを共有）:
- 低域（<C3）で短2度・短3度を作らない。
- ♯11採用時は5thを省く。9採用時はルートを鍵盤に置かない（ベース任せ）。
- ii-V-I はルートレス A↔B 交互で最小移動。

### 6-3. やり過ぎ警告（アンチパターン検出）
「全部maj9化の平板さ」を避けるためのlint。

1. **均一Maj9警告**: 連続コードの多数（例 60%以上）が Maj7(9) 系で、テンション構成が同型 → 「色が平板。V や IIm にドミナント緊張／11・13の差を付けよ」。
2. **♯11乱発警告**: ♯11（リディアン）が連続3コード以上 → 「宙吊りで着地感喪失。トニックは素直な9/13へ」。
3. **テンション過積み警告**: 1コードに9,11,13＋altを同時全部盛り → 「濁り＆機能不明瞭。3〜4声に間引け」。
4. **アボイド衝突**: Maj上の11、V7上の11（sus化してないのに）、m7(♭9)相当、♯11と5thの共存 → フラグ。
5. **低域濁り**: C3以下で短2/短3度、または3rdと7thの近接 → フラグ。
6. **sus解決なし放置**: IV/V・sus4系が長時間続きトニック/3rd解決が皆無 → 「宙吊り過多、どこかで解決を」。
7. **ベース停滞**: 分数コードのペダルが8小節以上動かない → 「静的すぎ、ラインを動かす候補を」。
8. **全ルートレスで低音消失**: 別トラックにルート/ベースが無いのに全コードがルートレス → 「土台が抜ける」。

> 警告は**ブロックせず候補と併記**（思想遵守）。「平板です→こう崩す選択肢」を出すところまでが機械の仕事。

---

## 7. 設計含意（実装への落とし込み・要点）

1. **コード表現の拡張**: 既存「度数＋品質」に `tensions:[9,♯11,13...]`, `bass度数`, `voicing型` の3フィールドを足すだけで本仕様の大半が乗る。スキーマ変更はテスト先行（CLAUDE.md TDD）。
2. **母体スケール駆動**: 各機能に母体スケールを持たせ、テンション候補＝スケール音、アボイド＝半音衝突で機械判定。US辞書・分数辞書はその上の糖衣。
3. **ノブで"citypop度"を連続可変**: tension/us/slash/borrow/openness の5ノブ。**プリセット=これらの既定値セット**。他ジャンルプリセット（jazz強め/歌謡薄め）も同じ枠で表現可能。
4. **バリデータ＝ボイシング規則＝やり過ぎ警告** を1つの声部間隔／衝突チェッカに集約（DRY）。生成器と警告器で共用。
5. **候補主義**: 変換は必ず複数候補（素直/強め/US/分数）を返す。sus解決の有無・実テンション採否は人へ。MEMORYの「選択肢を出す・仕上げは人間」に一致。
6. **注意（著作権）**: 曲からは進行・語彙の統計のみ採用。リテラル旋律・特定曲の完コピ配置は保存/生成しない。

---

## 出典（URL）

- The Chords of City-Pop (JasLikesJazz): https://jaslikesjazz.wordpress.com/2022/05/18/the-chords-of-city-pop/
- Upper structure (Wikipedia): https://en.wikipedia.org/wiki/Upper_structure
- Upper Structure Triads for Jazz Piano (jazztutorial): https://jazztutorial.com/articles/upper-structure-chord-voicings-for-jazz-piano
- Upper Structure Triads (jazzguitar.be): https://www.jazzguitar.be/blog/upper-structure-triads/
- Rootless Chord Voicings (The Jazz Piano Site): https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chord-voicings/rootless-voicings/
- Rootless Voicings Complete Guide (Piano With Jonny): https://pianowithjonny.com/piano-lessons/rootless-voicings-for-piano-the-complete-guide/
- Rootless Chord Voicings (PianoGroove): https://www.pianogroove.com/jazz-piano-lessons/rootless-chord-voicings/
- Drop 2 Voicings (FreeJazzLessons): https://www.freejazzlessons.com/drop-2-voicings/
- Royal road progression / 王道進行 (Wikipedia): https://en.wikipedia.org/wiki/Royal_road_progression
- 王道進行 (ニコニコ大百科): https://dic.nicovideo.jp/a/%E7%8E%8B%E9%81%93%E9%80%B2%E8%A1%8C
- 丸サ進行（Just The Two of Us進行）解説 (ONLIVE Studio): https://blog.onlive.studio/what-is-marusa-chord-progression-10
- sus4コードの成り立ちと活用（うちやま作曲教室）: https://sakkyoku.info/theory/sus4/
- サブドミナントマイナー（うちやま作曲教室）: https://sakkyoku.info/theory/subdominant-minor/
- 分数コード(オンコード)（guitar-hakase）: https://guitar-hakase.com/renshu/chord/on-chord/
- シティ・ポップ頻出ギター・コード・フォーム帳（ギター・マガジンWEB）: https://guitarmagazine.jp/for_beginners/2022-1021-city-pop-guitar-chord/
- 山下達郎シティポップ徹底解説（ticketjam/Cal-cha）: https://ticketjam.jp/magazine/music/jpop/citypop/44314
- City Pop的コード進行（note / craft sound studio）: https://note.com/craftsoundstudio/n/n2056e0897977
