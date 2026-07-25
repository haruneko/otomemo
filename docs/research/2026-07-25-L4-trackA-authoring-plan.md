# L4 トラックA 起草計画 — バラード/Jロック/EDM × verse/chorus × 3パートを「別型4件」に（2026-07-25）

- **この doc の役割**＝L4量産計画（`2026-07-25-pattern-library-L4-quantity-plan.md`）のトラックA＝オーナー選定3ジャンル
  （バラード `genre:ballad`／Jロック `genre:vocarock`（オーナー裁定：rockに混ぜず vocarock 扱い）／EDM `genre:edm`）の
  **起草リストのみ**。パターンの中身（テキスト譜）の起草・コード変更・seed 実行は**含まない**＝名寄せ・型ID案・出典指定・タグ方針まで。
- 目標＝各ジャンル × 主要場面（verse/chorus）× 3パート（chord_pattern/bass/rhythm）で**候補カード4件以上・別型**
  （別型＝distinct `pat:<型ID>`。L4計画 §0 のセル定義）。
- **分類は横串の共通語彙に従う（2026-07-25 オーナー裁定・SSOT＝design.md「Task2/L1＞共通分類の横串統一」）**：場面は7種固定
  （intro/verse/prechorus/chorus/interlude/bridge/outro＝UI日本語 イントロ/Aメロ/**Bメロ**/サビ/間奏/**Cメロ**/アウトロ）で全パート共通、
  ジャンルは類型にまとめ重なりは co-tag で吸収、フィル語彙もジャンル非依存。本doc内の verse/chorus 等はこの共通語彙の内部タグ。
- 実測の源＝`apps/api/src/music/chordLibrary.ts`（COMP_TYPES 26型・genre/roles）／`bassLibrary.ts`（BASS_TYPES 28型）／
  `drumLibrary.ts`（BEAT_PATTERNS 18型・roles無し）／`apps/api/scripts/seed-pattern-library.ts`（タグ付与）を本日 main で直接数えた値。
- 制約（コンセプト既定の硬い線）＝他者コーパスのリテラル転写禁止。新型は**一般定石**を語彙doc4本と同じ流儀
  （度数×16分グリッドのテキスト譜＋出典URL）で研究docに起こしてから辞書化する。

---

## 0. 前提の実測（検索がどう引くか・co-tag が安全な根拠）

- 検索は**生タグ一致**：import ダイアログは `genre:<g>`／`scene:<r>` の AND 絞り（`PatternImportDialog.tsx:83-84`）、
  ライブラリ取得も `genre:<g>` 生タグ（`patternLibrary.ts:24`）。**生成器の GENRE_ALIAS を検索は知らない**
  ＝`genre:vocarock` で引けるのは vocarock タグを持つネタだけ（現状ベース4型のみ）。
- タグの出所は seed：chord/bass は `genre:${t.genre}`（単数）＋`scene:${role}`（roles 全部）、drum は
  `genre:` を genres 配列ぶん複数・**scene 無し**（`seed-pattern-library.ts:49/69/88`・drum は roles 非所持ゆえ）。
- **辞書の genre/genres フィールドの消費者は seed のみ**（grep 実測：`t.genre`/`t.genres` の参照は
  `seed-pattern-library.ts` の title/tags だけ。生成器の型選抜は GENRE_TABLE 経由＝`chordLibrary.ts:204`／
  `bassLibrary.ts:118`／`drumLibrary.ts:193`）。**ゆえに co-tag（ジャンルタグ併記）は出音・生成経路に一切影響しない**
  ＝L4計画 §3-2 の「GENRE_TABLE は据え置き」と両立する安全な操作。
- UI ラベルは対応済み：`apps/web/src/genres.ts:25-26` に `edm:"EDM"`／`vocarock:"ボカロック"` が既在
  ＝新タグを焼けばダイアログのジャンル絞り（データ駆動・`PatternImportDialog.tsx:73`）に日本語ラベル付きで自動出現する。
  ※「Jロック」の表示名を `vocarock`（現ラベル「ボカロック」）のままにするかはオーナー語彙の裁定（§7-1）。

---

## 1. カバレッジ実測（今N件・対象3ジャンル×verse/chorus×3パート＝18セル）

genre タグ＝seed が焼く値（chord/bass は型の `genre`、drum は `genres`）で集計。カッコ内＝セルを構成する型ID。

| ジャンル | パート | verse 今 | chorus 今 |
|---|---|---|---|
| ballad | chord_pattern | **2**（PB-WHOLE, PB-ARP8） | **1**（PB-ARP16） |
| ballad | bass | **2**（BL-WHOLE, BL-HALF5） | **2**（BL-SOUL3, BL-OCTLIFT） |
| ballad | rhythm | **1**※scene軸なし（beat16.basic。six8.ballad は 6/8 で seed 除外） | 同左 |
| vocarock | chord_pattern | **0** | **0** |
| vocarock | bass | **2**（VR-8DRIVE, VR-CHORDFAST） | **2**（VR-8DRIVE, VR-GALLOP） |
| vocarock | rhythm | **0**※scene軸なし | 同左 |
| edm | chord_pattern | **0**（EDM相当は `genre:dance` の DN-OFFBEAT/DN-ANTICIP＝verse1/chorus2） | **0** |
| edm | bass | **2**（ED-OFFBEAT, ED-OFF16） | **3**（ED-SUSTAIN, ED-PULSE, ED-ROOT5） |
| edm | rhythm | **0**（`genre:dance` なら beat8.offbeat_hh／four.house／four.rock＝3） | 同左 |

**18セル全て4件未達**（最大は edm bass chorus の3）。うち「4件揃える」ための欠員合計＝genre タグ視点で 18セル×4−今 ＝
おおよそ 72−19 だが、1型が複数セルを埋める効率と co-tag で大半を吸収できる（§2）。「済」セルは無し。

補足（L4計画 §1 と数字が違う箇所の断り）：L4計画 §1-1 は GT-BALLAD を folk に数えている（型の genre は folk・
`chordLibrary.ts:179`）。ballad の GENRE_TABLE（:207）には GT-BALLAD が居るが、**seed タグは型 genre 由来なので
`genre:ballad` 検索には出ない**＝本 doc は「タグで引ける数」で統一（検索がタグ一致だから）。

---

## 2. 起草リスト（今N → 目標4 → 足す型。各行が1セル）

記法：〔co〕＝既存型へのジャンルタグ併記（§3）、〔研〕＝語彙docに譜例が既にある未実装分、〔新〕＝新規起草（§4）、
〔roles〕＝既存型の roles（scene）拡張。

### 2-1. バラード（genre:ballad）

| パート×場面 | 今 | 足す型 | 後 |
|---|---|---|---|
| chord × verse | 2（PB-WHOLE, PB-ARP8） | 〔co〕GT-BALLAD（+`genre:ballad`）／〔研〕PB-WHOLE-R10 | **4** |
| chord × chorus | 1（PB-ARP16） | 〔研〕PB-LH8OCT／〔新〕PB-BLOCK8／〔新〕PB-SUSBLD | **4** |
| bass × verse | 2（BL-WHOLE, BL-HALF5） | 〔新〕BL-2BEAT／〔新〕BL-ARPUP | **4** |
| bass × chorus | 2（BL-SOUL3, BL-OCTLIFT） | 〔新〕BL-ARPUP（verse/chorus 両適格）／〔新〕BL-8ROOT | **4** |
| rhythm（scene 導入後 verse/chorus とも） | 1（beat16.basic） | 〔新〕ballad.rim8／〔新〕ballad.soft16／〔新〕halftime.ballad | **4** |

- GT-BALLAD co-tag の根拠：型名「弾き語りバラード」・GENRE_TABLE の ballad 行に既に登用済（`chordLibrary.ts:207`）
  ＝生成器は前からバラード語彙として扱っている。タグだけが folk 単独＝検索と生成の非対称を直すだけ。
- rhythm 3新型は L4計画 §2-3 の候補そのまま（4/4 でバラードを埋める＝6/8 問題（同 §4-D）は据え置き・別裁定）。

### 2-2. Jロック（genre:vocarock）

| パート×場面 | 今 | 足す型 | 後 |
|---|---|---|---|
| chord × verse | 0 | 〔co〕AN-VERSE・GT-DOWN8・GT-POWER16（+`genre:vocarock`）／〔新〕GT-MUTE8 | **4** |
| chord × chorus | 0 | 〔co〕AN-CHORUS・GT-DOWN8・GT-POWER16／〔新〕AN-SYNC（genre:anison＋co vocarock） | **4** |
| bass × verse | 2（VR-8DRIVE, VR-CHORDFAST） | 〔新〕VR-OCTRUN／〔新〕VR-LINE8 | **4** |
| bass × chorus | 2（VR-8DRIVE, VR-GALLOP） | 同上2型（verse/chorus 両適格） | **4** |
| rhythm × verse | 0 | 〔co〕beat8.basic・beat8.syncopated・halftime.basic・dbeat.basic（+`genre:vocarock`） | **4** |
| rhythm × chorus | 0 | 〔co〕four.rock・beat8.offbeat_hh・dbeat.basic／〔新〕beat8.ride | **4** |

- co-tag の音楽的根拠（安易な全面併記はしない・落とした型も明記）：
  - **AN-VERSE/AN-CHORUS**（tempo130-175/180）：生成器は既に `vocarock→anison` エイリアスで同一視（`chordLibrary.ts:226`）
    ＝ボカロ系高速8分/16分でテンポ帯も vocarock ベース（VR-* 160-210・`bassLibrary.ts:93-96`）と重なる。
  - **GT-DOWN8**（100-180「パンク/ハードロックの推進」）・**GT-POWER16**（120-200 パワーコード刻み）：高速バンドサウンドの
    定番でテンポ帯が届く。
  - **見送り**＝PR-8TH・GT-BACKBEAT（tempoMax140＝vocarock 相場に届かない）・GT-DOWN16（70-110）・PR-SUS（90-140）。
  - ドラム：jpop/rock の主力4型＋裏打ちサビ（beat8.offbeat_hh は rock GENRE_TABLE の prechorus/chorus 登用済・
    `drumLibrary.ts:195`）＋高速系 dbeat.basic（160-220＝vocarock テンポ帯に唯一届く既存型）。
    **dbeat をボカロックの棚に入れるかは音楽的裁量が濃い**→裁定（§7-1）。見送り＝doubletime.basic（70-110・意味が逆転する）。

### 2-3. EDM（genre:edm）

| パート×場面 | 今 | 足す型 | 後 |
|---|---|---|---|
| chord × verse | 0 | 〔co〕DN-OFFBEAT（+`genre:edm`）／〔新〕DN-PLUCK8・DN-GATE16・DN-PAD4 | **4** |
| chord × chorus | 0 | 〔co〕DN-OFFBEAT・DN-ANTICIP／〔新〕DN-PLUCK8・DN-GATE16（verse/chorus 両適格） | **4** |
| bass × verse | 2（ED-OFFBEAT, ED-OFF16） | 〔新〕ED-GATE8／〔roles〕ED-PULSE に verse を追加 | **4** |
| bass × chorus | 3（ED-SUSTAIN, ED-PULSE, ED-ROOT5） | 〔新〕ED-GATE8（verse/chorus 両適格） | **4** |
| rhythm × verse | 0 | 〔co〕beat8.offbeat_hh・four.house・halftime.basic（+`genre:edm`）／〔新〕four.edm16 | **4** |
| rhythm × chorus | 0 | 〔co〕four.house・four.rock／〔新〕four.edm16・four.clapride | **4** |

- タグ割れの解消方針＝**リネームではなく co-tag を推す**（論点2の提案・裁定は §7-2）：
  - chord の DN-* は scenes 文言が「4つ打ち/EDM」「ハウスサビ」（`chordLibrary.ts:153-156`）＝実質 EDM。ただし
    `dance` を `edm` にリネームすると (i) 既存 `genre:dance` 絞りが空になる、(ii) drum の dance タグはアイドル系
    （four.house は genres:["dance","idol"]・`drumLibrary.ts:55`）と同居＝dance「4つ打ち」（`genres.ts:21` のラベル）は
    EDM より広い語。**dance タグ据え置き＋EDM適合型へ `genre:edm` 併記**が非破壊・可逆で、3パートとも
    `genre:edm` で棚が揃う（ベースは既に edm）。
  - drum co-tag の根拠：beat8.offbeat_hh（裏打ち・EDMヴァースの定番）・four.house（4つ打ち本体）・
    four.rock（4つ打ち＋生ドラム＝ビッグルーム/ロックEDMサビ）・halftime.basic（EDMヴァースのハーフ落とし）。
  - ED-PULSE roles 拡張の根拠：8分パルスはサビ専用ではなく verse の低エネルギー版としても定石
    （bass doc §5 の型は verse/chorus 通用の書き方）。roles 追加は seed の scene タグと生成器 GENRE_TABLE の
    候補プールに影響しない（GENRE_TABLE は型ID直書き・`bassLibrary.ts:123` に ED-PULSE は prechorus/chorus のみ＝据え置き）。
    ※厳密には pickBassType の role 既定 fallback にも変化なし（GENRE_TABLE 経由のため）。roles はネタタグ専用の意味になる
    ＝design.md に「roles＝ライブラリ scene タグの SSOT・GENRE_TABLE とは独立」と明記して下ろす（§6 手順2）。

---

## 3. co-tag 一覧（既存型へのジャンルタグ併記・計17件）

chord/bass の型は `genre` が**単数フィールド**（`chordLibrary.ts:35`／`bassLibrary.ts:28`）なので、co-tag には
`coGenres?: string[]` のデータ欄追加（＋seed がタグ展開）が要る（§6）。drum は `genres` 配列既在＝値を足すだけ。

| kind | 型ID | 併記するタグ | 根拠（読んだ場所） |
|---|---|---|---|
| chord | GT-BALLAD | genre:ballad | GENRE_TABLE ballad 行に登用済（chordLibrary.ts:207）・scenes「弾き語りバラード」 |
| chord | AN-VERSE | genre:vocarock | GENRE_ALIAS vocarock→anison（chordLibrary.ts:226）・tempo130-175 |
| chord | AN-CHORUS | genre:vocarock | 同上・tempo130-180 |
| chord | GT-DOWN8 | genre:vocarock | scenes「パンク/ハードロックの推進」・tempo100-180 |
| chord | GT-POWER16 | genre:vocarock | パワーコード刻み・tempo120-200＝VR帯域と整合 |
| chord | DN-OFFBEAT | genre:edm | scenes「4つ打ち/EDM（裏スタブ）」（chordLibrary.ts:153） |
| chord | DN-ANTICIP | genre:edm | scenes「ハウスサビ（前借り連打）」（chordLibrary.ts:155） |
| rhythm | beat8.basic | genre:vocarock | drum doc §9-1「J-pop/ボカロ」・GENRE_ALIAS vocaloid→jpop（drumLibrary.ts:200） |
| rhythm | beat8.syncopated | genre:vocarock | 同上（J-pop verse 定番） |
| rhythm | four.rock | genre:vocarock, genre:edm | jpop/rock サビ登用（drumLibrary.ts:194-195）／4つ打ち生ドラム＝EDMサビ変形 |
| rhythm | halftime.basic | genre:vocarock, genre:edm | rock prechorus/bridge 登用／EDMヴァースのハーフ定石 |
| rhythm | beat8.offbeat_hh | genre:vocarock, genre:edm | rock prechorus/chorus 登用（裏打ちサビ）／EDM裏打ち |
| rhythm | dbeat.basic | genre:vocarock | tempo160-220＝vocarock 帯域に唯一届く既存型（**裁量濃・裁定へ**） |
| rhythm | four.house | genre:edm | 4つ打ちハウス本体（drumLibrary.ts:55） |

計＝chord 7・rhythm 10（タグ延べ）・bass 0。

---

## 4. 新規起草する型の一覧（計21型＝研2＋新19。**中身の譜はここでは書かない**）

仮ID・一般定石名・埋まるセル・出典（起草時に参照する語彙docの節。〔研〕は譜例既在、〔新〕は同節の流儀＋一般定石で
新規に書き（必要なら出典URLを追補）、リテラル転写はしない）。

### chord_pattern（9型）

| 仮ID | 種 | 一般定石名 | 埋まるセル（genre×roles案） | 出典節 |
|---|---|---|---|---|
| PB-WHOLE-R10 | 研 | 白玉＋LH=ルート+10度 | ballad × intro/verse | piano doc §2-3（R10定石）＋§1型1 |
| PB-LH8OCT | 研 | RH白玉系＋LHオクターブ8分交互 | ballad × chorus | piano doc §2-1/§2-4（分業則）＋§1型3 |
| PB-BLOCK8 | 新 | バラード8分ブロック（拍頭+裏の長短対比） | ballad × chorus | piano doc §3-2（長短対比）/§3-3（chorus密） |
| PB-SUSBLD | 新 | パワーバラード白玉＋2拍打ち直し（バラードテンポ帯） | ballad × chorus/bridge | piano doc §1型5（rock-sustain）の低速変形＝一般定石 |
| GT-MUTE8 | 新 | パームミュート8分（低ダイナミクスAメロ） | vocarock/rock × verse | guitar doc §4（ミュート打）＋§2（8分系） |
| AN-SYNC | 新 | アニソン前借りシンコペ（サビ前展開） | anison＋co:vocarock × prechorus/chorus | piano doc §3-1（前借り）・L4計画 §2-1B |
| DN-PLUCK8 | 新 | シンセ pluck 8分刻み | dance＋co:edm × verse/chorus | L4計画 §2-1B・piano doc §4（音色差分） |
| DN-GATE16 | 新 | トランスゲート（16分オンオフ刻み） | dance＋co:edm × verse/chorus | 一般定石（起草時に出典URL追補）・guitar doc §2 の16分系記法流用 |
| DN-PAD4 | 新 | パッド拍打ち直し（サイドチェイン・ポンピング近似） | dance＋co:edm × verse | piano doc §4（パッド）＋vel層 §5-1 で近似 |

予備（4件目標には不要・余力あれば）：GT-ARPBASS〔研・guitar doc §5.2〕＝ballad/folk intro/verse。
ただし指弾き系は現行 arp での近似可否確認が先（L4計画 §2-1A の注記どおり）＝トラックAの必須枠から外す。

### bass（6型＋roles拡張1件）

| 仮ID | 種 | 一般定石名 | 埋まるセル | 出典節 |
|---|---|---|---|---|
| BL-2BEAT | 新 | バラード2分（R/5交互・穏） | ballad × verse | bass doc §2 の流儀・L4計画 §2-2 |
| BL-ARPUP | 新 | 分散上行（R-5-8-10） | ballad × verse/chorus | bass doc §2（5度跳び系の拡張）・L4計画 §2-2 |
| BL-8ROOT | 新 | サビ8分ルート（穏やかな推進） | ballad × chorus | bass doc §1（8分ルート）の低速適用＝一般定石 |
| VR-OCTRUN | 新 | 高速オクターブ駆動 | vocarock × verse/chorus | bass doc §6・L4計画 §2-2 |
| VR-LINE8 | 新 | 8分＋経過音下降ライン（コード間接続） | vocarock × verse/chorus | bass doc §6＋§7（walk down の型内化） |
| ED-GATE8 | 新 | サイドチェイン風8分（裏長め） | edm × verse/chorus | bass doc §5・L4計画 §2-2 |
| （ED-PULSE） | roles | 既存型の roles に verse 追加 | edm × verse | bassLibrary.ts:90・§2-3 の根拠 |

### rhythm（6型）

| 仮ID | 種 | 一般定石名 | 埋まるセル（roles案） | 出典節 |
|---|---|---|---|---|
| ballad.rim8 | 新 | サイドスティック8ビート | ballad × verse/chorus | drum doc §9-2・§2（8ビート系）＋SideStick（drumLibrary.ts DRUM:37） |
| ballad.soft16 | 新 | 静16ビート（HH弱・キック疎） | ballad × verse | drum doc §3（16ビート系）・§9-2 |
| halftime.ballad | 新 | ハーフタイム・バラード | ballad × chorus/bridge | drum doc §5（ハーフタイム）・L4計画 §2-3 |
| beat8.ride | 新 | ライド8ビート（サビ展開） | jpop/rock＋co:vocarock × chorus | drum doc §10（HH→ライドの定番遷移）・L4計画 §2-3 |
| four.edm16 | 新 | 4つ打ち＋16分ハット | dance/edm × verse/chorus | drum doc §4・§9-3・L4計画 §2-3 |
| four.clapride | 新 | 4つ打ち＋クラップ/ライド変形 | dance/edm × chorus | drum doc §4・§9-3・L4計画 §2-3 |

---

## 5. ドラム scene タグの機械導出（論点3・この3ジャンルぶんの具体化）

方式＝**BeatPattern に `roles?: Role[]` をデータ欄として追加**し、seed が chord/bass と同様に `scene:` タグ化する
（L4計画 §1-3(i) の前者案）。GENRE_TABLE 逆引き**だけ**では足りない理由＝drum GENRE_TABLE（`drumLibrary.ts:193-199`）
には vocarock/edm の行が無く（jpop/rock/dance/ballad/funk のみ・エイリアスにも vocarock 無し・edm→dance のみ :200）、
逆引きは既存5ジャンルの初期値にしか使えない。よって：

1. **初期値＝GENRE_TABLE 逆引き**（機械導出・既存型）。3ジャンル関連の逆引き実測：
   - ballad 行 → beat16.basic＝{intro, verse, prechorus, chorus}（six8.ballad は 6/8 除外）
   - dance 行（edm の代理）→ beat8.offbeat_hh＝{intro, verse}／four.house＝{intro, verse, prechorus, chorus, outro}／
     four.rock＝{chorus}／halftime.basic＝{bridge}
   - rock 行（vocarock の代理）→ beat8.basic＝{intro, verse}／beat8.syncopated＝{verse}／
     halftime.basic＝{prechorus, bridge}／beat8.offbeat_hh＝{prechorus, chorus}／four.rock＝{chorus, outro}
2. **本計画の上書き**（§2 の各表の roles 案）＝4件目標に必要な追加分：halftime.basic に verse（EDMヴァース）、
   dbeat.basic に verse/chorus（vocarock）、four.rock は chorus のまま、新6型は §4 の roles 案。
3. **roles は seed 専用**＝genDrums/pickBeatPattern は GENRE_TABLE のまま（生成器不変・bit一致）。design.md に
   「BeatPattern.roles＝ライブラリ scene タグの SSOT・GENRE_TABLE（生成器第二経路）とは独立」と明記。
4. 導出＋上書きの結果一覧をオーナーが眺めて直す（L4計画 §4-C の運用）＝scene 割当は軽い裁量を含むため。

導入効果＝import ダイアログの scene 絞りはデータ駆動（母集団に scene: が在れば出る・`PatternImportDialog.tsx:75`）
なので、ドラムにも場面絞り UI が自動出現する。

---

## 6. 規模見積りと実施順（SDD+TDD・L4計画 §3-3 準拠）

**規模**：新規21型（chord 9＝研2+新7／bass 6／drum 6）＋co-tag 17件＋roles拡張1件（ED-PULSE）。
seed 後の件数＝chord 26→35・bass 28→34・drum 17→23（**計 71→92**）。
スキーマ追記2点（データ欄のみ・生成器コード不変）＝CompType `coGenres?: string[]`／BeatPattern `roles?: Role[]`。
※BassType の coGenres は今回不要（bass co-tag 0件）だが、欄はどうせなら3辞書同形で切るかは実装時判断。

**実施順**（1スライス・上から下へ）：

1. **研究doc起草**：新19型の一般定石＋出典URL＋度数/格子テキスト譜を語彙doc4本の流儀で書く（研2型は既在譜の辞書化のみ）
   → `docs/research/README.md` に索引追加。
2. **design.md へ下ろす**：型リスト・co-tag 表・coGenres/roles 欄・「GENRE_TABLE 据え置き（生成器第二経路の出音不変）」・
   ドラム scene タグ導出方式（§5）を明記。
3. **テスト先行（赤）**：辞書の型数（26→35 等）・16セル検証・ID一意・新型の style/pattern 直指定で生成器が解決すること・
   seed の件数とタグ期待値（例：`genre:vocarock` の chord が5件・`scene:` タグがドラムに付く・co-tag 型は genre タグ2個）。
4. **辞書へ型追加＋co-tag/roles データ追加＋seed のタグ展開**（コード変更は seed のタグ組み立てのみ）→ 緑。
5. **再seed**（`CM_DB=<path> npx tsx scripts/seed-pattern-library.ts`）→ import ダイアログで実機確認
   （3ジャンル×verse/chorus×3パートの18セルが全て4件以上・Playwright 実測の流儀）。
6. **耳確認プローブ束**：新21型＋co-tag 妥当性（特に dbeat/vocarock・halftime/edm）を一括 MIDI 化してオーナーの
   耳確認を1回にまとめる（`data/quality-probe-20260722/` の流儀・型ごとに個別依頼しない）。

---

## 7. オーナー裁定点（着手前にまとめて確認）

1. **vocarock の co-tag 線引き**（論点1）：AN-VERSE/AN-CHORUS/GT-DOWN8/GT-POWER16（chord）＋
   beat8.basic/beat8.syncopated/four.rock/halftime.basic/beat8.offbeat_hh（drum）の併記は妥当か。
   特に **dbeat.basic をボカロックの棚に入れるか**（テンポは合うが D-beat＝パンク色が濃い）。
   PR-8TH/GT-BACKBEAT はテンポ帯不足で見送った＝拾うなら tempo 帯拡張の耳較正込み。
   あわせて UI 表示「ボカロック」（genres.ts:26）のままで良いか（「Jロック」に変えるならラベル1行の変更）。
2. **EDM のタグ寄せ方式**（論点2）：推奨＝dance 据え置き＋EDM適合型へ `genre:edm` co-tag（非破壊・可逆・
   idol と同居する dance の語を壊さない）。対案＝chord の DN-* とドラム4つ打ち系を `edm` へリネーム
   （棚は1本化するが既存 dance 絞りが空になり、dance=「4つ打ち」ラベルの守備範囲と食い違う）。
3. **ドラム scene タグ**（論点3）：BeatPattern.roles 導入＋機械導出初期値（§5-1）＋本計画上書き（§5-2）で
   進めて良いか。導出結果一覧はレビューに出す（「この型はサビ向き」の裁量はオーナー）。
4. **バラードのドラムを 4/4 の3新型で埋める**（六八 six8.ballad は据え置き＝L4計画 §4-D の 6/8 工事は別スライスのまま）で良いか。
5. **新型21の採否と較正**：content 正しさ・タグ・件数までは機械が保証。鳴りの採否（特に DN-GATE16/DN-PAD4 の
   シンセ近似・GT-MUTE8 のミュート近似・vel/strumMs の要耳較正群）はプローブ束（§6 手順6）で。

---

## 出典（本docが読んだファイル）
- 正典計画：`docs/research/2026-07-25-pattern-library-L4-quantity-plan.md`（§1 実測・§2 候補型・§3 方式(a)・§4 裁定点）
- 実装実測：`apps/api/src/music/chordLibrary.ts`（COMP_TYPES・GENRE_TABLE:204・GENRE_ALIAS:226）／`bassLibrary.ts`
  （BASS_TYPES:62-97・GENRE_TABLE:118）／`drumLibrary.ts`（BEAT_PATTERNS:36-101・GENRE_TABLE:193-199・GENRE_ALIAS:200）／
  `apps/api/scripts/seed-pattern-library.ts`（タグ付与 :49/:69/:88・冪等削除 :31）
- 検索/UI 実測：`apps/web/src/components/patternLibrary.ts`（生タグ検索 :24）／`PatternImportDialog.tsx`
  （genre/scene AND 絞り :83-84・データ駆動 scene :75）／`apps/web/src/genres.ts`（edm/vocarock ラベル既在 :25-26）
- 語彙doc（起草の出典）：`2026-07-22-piano-comping-vocabulary.md`／`2026-07-22-guitar-comping-vocabulary.md`／
  `2026-07-14-bass-genre-vocabulary.md`／`2026-07-14-drum-pattern-genre-library.md`
