# ジャンル別ベースライン語彙（型番表） — B2

- 作成: 2026-07-14
- 担当視点: ベース演奏／ポピュラー編曲
- 位置づけ: ベース生成器の「候補出し」語彙。**機械は候補まで・仕上げは人間**の原則に沿い、型（テンプレ）を並べて選ばせるための素材。
- 既知（本docでは再説しない前提）: キック骨格＋差分、アプローチノート、スネアで音価を切る、音域窓 33..55（MIDI）、5度は原則上へ。
- 範囲限定: **音符レベルのみ**（度数・リズム・キック絡み）。音作り（歪み・コンプ・アンプ・ピック/指）は対象外。

---

## 0. 記譜の約束（テキスト譜フォーマット）

### グリッド
- 1小節 = 4拍 × 16分4分割 = **16スロット**。4/4前提。
- 区切り: 拍を `|` で。例 `[ x x x x | x x x x | x x x x | x x x x ]`。
- スロット位置の呼称（1拍を4等分）: `1 e & a`（ワン・イー・アンド・ア）。

### 度数トークン（音高）
| 記号 | 意味 |
|---|---|
| `R` | ルート（1度・原則オクターブ下＝窓の下側） |
| `8` | オクターブ上のルート（オクターブ奏法の上側） |
| `3` / `b3` | 長3度／短3度 |
| `5` | 5度（原則**上**へ。低い時のみ下5度） |
| `b7`/`7` | 短7度／長7度 |
| `4` `2` `6` `b6` | その他コードトーン／スケール音 |
| `#` `b` 付き（例 `#1`,`b2`） | 半音アプローチ（クロマチック経過音） |

### 音価・奏法トークン（リズム）
| 記号 | 意味 |
|---|---|
| `.` | 休符（スロット無音） |
| `-` | 直前音の**タイ／伸ばし**（サステイン継続） |
| `x` | ゴーストノート（ミュートした無音程パーカッシブ） |
| `/` | 直後音への**スライドアップ**（グリスで入る） |
| `\` | 直後音への**スライドダウン** |

読み方の例: `[ R - - - | 5 - - - | R - - - | 5 - - - ]` = 各拍頭にルート／5度を置き、拍いっぱい伸ばす（全音符寄り2分割）。

### キック絡みの符号（本docの独自ラベル）
- **interlock（相補）**: キックの隙間をベースが埋め、合わさって1つのグルーヴになる（ファンク定型）。
- **unison（同相）**: ベースの発音位置をキックと**完全一致**させ、低域の押しを最大化（EDM・ロック定型）。
- **counter（逆相）**: キックが無い裏拍にベースを置き、キックと交互に鳴らす（ディスコのオクターブ裏、ハウスのオフビート）。
- 実務原則: **1拍目＝the one は原則 unison**（ここでポケットの基準を作る）。裏や埋めで interlock/counter を混ぜる。出典: 後掲 pocket/interlock 論。

---

## 1. ロック（8分ルート弾き）

推進力＝8分の連打とルート主体。ダウンピッキング（重い・詰まる）とオルタネイト（軽い・速い）の差はアタックの均質さで、音符レベルでは同じ8分連打。ギャロップ（付点8分＋16分＝D-u-u）で疾走感。

| 型ID | 度数×リズム（16分グリッド） | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **RK-8ROOT** | `[ R . R . \| R . R . \| R . R . \| R . R . ]` | 120–170 | unison（キック四つ打ち／8ビートに同相） | Aメロ〜サビ全般の土台 |
| **RK-GALLOP** | `[ R . R R \| R . R R \| R . R R \| R . R R ]` | 150–200 | interlock（8分キックの隙間を16分で埋める） | 疾走サビ・ハードロック |
| **RK-DRIVE5** | `[ R . R . \| R . R . \| 5 . 5 . \| 5 . 5 . ]` | 120–160 | unison | 2小節で動きを付ける（ルート→5度） |
| **RK-PEDAL** | `[ R . R . \| R . R . \| R . R . \| R . #1 R ]` | 130–180 | unison＋末尾counter | ペダル維持、小節末にクロマ差し込み |

要点: ダウンピック指定なら 8分を**均等・詰め気味**、オルタネイトなら 16分ギャロップまで許容。5度は上へ（RK-DRIVE5）。

---

## 2. J-popバラード（全音符＋アプローチ・5度跳び）

隙間の美学。基本は各コード頭でルートを伸ばし（whole/half note）、コード切替の**直前**にアプローチノートで次ルートへ橋を架ける。ソウルバラードでは拍頭R＋裏に3度を軽く置いて厚みを出す定型あり（出典後掲）。

| 型ID | 度数×リズム | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **BL-WHOLE** | `[ R - - - \| - - - - \| - - - - \| - - - - ]` | 60–90 | unison（1拍目のみ、以降タイ） | 静かなAメロ・イントロ |
| **BL-HALF5** | `[ R - - - \| - - - - \| 5 - - - \| - - - - ]` | 60–90 | unison（1・3拍） | Bメロ、少し動かす |
| **BL-APPROACH** | `[ R - - - \| - - - - \| 5 - - - \| - - #1 R> ]` | 60–95 | 末尾でcounter | コード切替直前の橋渡し（`#1`→次小節`R`へ半音着地） |
| **BL-SOUL3** | `[ R - 3 - \| - - - - \| 5 - - - \| - - - - ]` | 65–95 | 1拍目unison | サビで厚みを増す（拍頭R＋裏3度） |
| **BL-OCTLIFT** | `[ R - - - \| - - - - \| R - - 8 \| - - 5 R> ]` | 60–90 | 1拍目unison | サビ前の高揚（オクターブ上げ→5度→次R） |

要点: `R>` は「次小節ルートへ解決」の目印。5度跳びは上5度で開放感、跳びすぎ回避に音域窓を尊守。

---

## 3. シティポップ／ディスコ（オクターブ奏法・16分シンコペ・動くライン）

心臓＝**オクターブ奏法**。低R→高8を往復し、16分でシンコペを絡める。ディスコ定石は「2発目のオクターブを16分で食う」（8分＋16分の連結、運指は人差→人差→中）。指ディスコは動く経過音でラインが歌う。

| 型ID | 度数×リズム | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **CP-OCT8** | `[ R . 8 . \| R . 8 . \| R . 8 . \| R . 8 . ]` | 100–125 | counter（低Rは四つ打ちキックにunison、高8は裏でcounter） | ディスコ基本オクターブ |
| **CP-OCT16** | `[ R . 8 8 \| R . 8 8 \| R . 8 8 \| R . 8 8 ]` | 105–125 | interlock（裏を16分2連で食う＝Thriller型末尾食い） | 前ノリを強めたいサビ |
| **CP-WALK** | `[ R . 8 . \| 5 . R . \| 6 . 8 . \| 5 . #4 R> ]` | 95–120 | counter＋末尾walk | シティポップの歌うオクターブ＋経過音ライン |
| **CP-SYNCOP** | `[ R . . 8 \| . R . 8 \| . R . 8 \| . R . 8 ]` | 105–125 | counter（オフで食い込むシンコペ） | ダンサブルなBメロ・間奏 |
| **CP-CHROMA** | `[ R . 8 . \| R . 8 . \| b7 . 6 . \| b6 . 5 R> ]` | 95–120 | interlock | コード内でクロマ下降する動くライン |

要点: 低Rは1拍目でキックとunison＝ポケット基準、上8を裏に置いて counter で軽さを出す。シティポップは CP-WALK/CP-CHROMA のように**経過音でメロディックに**動かすのが個性。

---

## 4. ファンク（1拍目重視＋16分ゴースト・スライド）

「the one」を最重視。1拍目を確実に踏み、以降は16分グリッド上でゴースト（`x`）とシンコペで隙間を埋める。アクセントを16分1つ動かすだけで性格が激変。スライドで隣接ルート/オクターブへ滑り込む。

| 型ID | 度数×リズム | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **FK-ONE** | `[ R . x x \| . R x . \| x . R x \| . x R> . ]` | 90–120 | interlock（キックの逆を16分ゴーストで埋める） | ファンク基本グルーヴ |
| **FK-OCTPOP** | `[ R x 8 x \| . R x 8 \| x . R x \| 8 . x R> ]` | 95–120 | interlock | オクターブ＋ゴーストの跳ねる定番 |
| **FK-SLIDE** | `[ /R . . x \| . R x . \| x . /8 . \| . x . R> ]` | 90–115 | interlock（1拍目へスライドで入る） | サビ頭・ホーンと絡む所 |
| **FK-16LOCK** | `[ R x x R \| x x R x \| x R x x \| R x x . ]` | 100–120 | interlock（16分マシンガン＋キック相補） | 高密度ブリッジ・間奏 |
| **FK-SPACE** | `[ R . . . \| . . x x \| R . . . \| . x x . ]` | 85–110 | unison（1拍目のみ、あとは休符で間） | スロウファンク・脱力グルーヴ |

要点: `x`（ゴースト）は無音程パーカッション、音符レベルでは「発音位置だけ持つが音高なし」。1拍目Rは必ず立てる（the one）。FK-SPACE のように**休符で間を作る**のもファンクの語彙。

---

## 5. EDM系（オフビート・ロー持続）

2系統。①**オフビート・プラック**（キックの裏＝8分オフに短いプラック、サイドチェイン前提のスペース設計）。②**ロー持続**（サブが伸びっぱなし、キック衝突時に自然に譲る）。音符レベルでは前者＝裏拍点、後者＝タイ多用。

| 型ID | 度数×リズム | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **ED-OFFBEAT** | `[ . . R . \| . . R . \| . . R . \| . . R . ]` | 120–128 | counter（四つ打ちキックの**裏8分**に置く＝定番オフビート） | ハウス／プログレのドロップ |
| **ED-OFF16** | `[ . . R . \| . R . R \| . . R . \| . R . R ]` | 122–128 | counter | テックハウスの刻むオフビート |
| **ED-SUSTAIN** | `[ R - - - \| - - - - \| - - - - \| - - - - ]` | 120–140 | unison＋サイドチェイン（キック着弾で自動的に引く） | メロディック/プログレの土台 |
| **ED-PULSE** | `[ R . R . \| R . R . \| R . R . \| R . R . ]` | 124–130 | unison（キックの倍速で脈動＝deadmau5型、SC必須） | ビッグルーム・盛り上げ |
| **ED-ROOT5** | `[ . . R . \| . . 5 . \| . . R . \| . . 8 . ]` | 120–126 | counter | オフビートに5度/オクターブで色付け |

要点: EDMは**キックとベースの周波数/時間衝突回避**が設計の核。counter系はそもそも時間で衝突しない。unison系（ED-SUSTAIN/PULSE）はサイドチェイン（音作り領域なので本docでは「衝突時は譲る」設計意図のみ記す）を前提に。

---

## 6. ボカロック（高速8分・ルート駆動）

J-rock／パンクの系譜＝**8分ルート連打**を基調に、疾走テンポで押す。RK系の高速版だが、コード展開が速い曲が多くルート追従の切替が密。サビ前の駆け上がりで一気に上げる。

| 型ID | 度数×リズム | テンポ域 | キック絡み | 適用セクション |
|---|---|---|---|---|
| **VR-8DRIVE** | `[ R . R . \| R . R . \| R . R . \| R . R . ]` | 160–200 | unison（8ビート／ツーバスに同相） | 高速Aメロ・サビの推進 |
| **VR-GALLOP** | `[ R . R R \| R . R R \| R . R R \| R . R R ]` | 170–210 | interlock（16分ギャロップでツーバスと噛む） | 疾走サビ・間奏 |
| **VR-CHORDFAST** | `[ R . R . \| 5 . 5 . \| R . R . \| 5 . 5 . ]` | 160–195 | unison | コード切替が速い展開（1小節内でR→5） |
| **VR-PUSH** | `[ R . R . \| R . R . \| R . R . \| R R 5 8> ]` | 165–200 | 末尾interlock | サビ頭へ駆け上げ（末尾R-R-5-8で上へ） |

要点: 音域窓 33..55 だと高速で上オクターブは指/低域が痩せる→基本は下側R、盛り上げの `8>` だけ上げる。ルート駆動を崩さず、動きは末尾フィルに集約。

---

## 7. フィルとしてのベース（セクション末の駆け上がり／下がり）

フィル＝句（4/8小節）の末尾で groove を破り、次セクションへ橋を架ける短い走句。手法＝**walk up/down**（隣ルートへ音階/クロマで接続）、アルペジオ、クロマチック経過音。着地は次コードのルートへ半音アプローチが定石。

| 型ID | 度数×リズム（末尾1小節） | 方向 | 用途 |
|---|---|---|---|
| **FL-WALKUP** | `[ R . . . \| . . . . \| 5 . 6 . \| b7 . #7 R> ]` | 上行 | サビ入り・盛り上げ。半音`#7`→次`R` |
| **FL-WALKDN** | `[ R . . . \| . . . . \| b7 . 6 . \| 5 . #4 R> ]` | 下行 | 落ち着かせて次へ。`#4`→次`R` |
| **FL-RUNUP16** | `[ R . . . \| . . . . \| 5 6 b7 7 \| 8 b7 5 R> ]` | 上→折返 | 派手な間奏明け。16分スケール走句 |
| **FL-CHROMA** | `[ R . . . \| . . . . \| . . . . \| b6 6 b7 R> ]` | 半音接続 | ジャンル問わず。3連続クロマで次Rへ |
| **FL-OCTDROP** | `[ 8 . . . \| . . . . \| 8 . 5 . \| 3 . 2 R> ]` | 上→下 | 高所から着地。ドラマチックな締め |

要点: フィルは「句の末尾＝1〜2小節だけ」。常用すると土台が崩れる。着地音は必ず次セクション頭のコードルート（`R>`）へ。walk は原調スケール音＋直前クロマが安全。

---

## 8. 生成器への設計含意

1. **型 = (度数パターン, リズムパターン, テンポ域, キック絡みラベル, 適用セクション) の5タプル**。上表がそのままシード辞書になる。度数は相対なのでキー非依存、配置時に窓 33..55 へ写像。
2. **キック絡みラベルで自動結線**: 既存のキック骨格を入力に取り、`unison`＝キック位置へ発音コピー、`interlock`＝キックの休みスロットへゴースト/経過音を挿入、`counter`＝キック裏（オフビート）へ配置。B2の型はこのラベルで既存ベース生成器のキック差分ロジックに接続できる。
3. **1拍目 the one 原則**: どの型でも小節頭（少なくとも句頭）はキックとunisonにしてポケット基準を作る。ここを崩す型（FK-SPACE等）は「意図的な脱力」フラグ付きの例外扱い。
4. **フィルは末尾スロット限定の別レイヤー**: 句境界（4/8小節末）検出時のみ FL-* を差し込み、着地音を次コードルートへ半音アプローチで固定。既知の「アプローチノート」機能をそのまま流用。
5. **5度は上優先**を全型で維持（RK-DRIVE5, BL-HALF5, CP-WALK 等）。窓の上端超過時のみ下5度へ折返し。
6. **候補の出し方（思想準拠）**: ユーザーには「ジャンル×セクション」で複数型を並べて提示し、選ばせる。単一自動決定はしない（機械は候補まで）。テンポ域が合う型のみフィルタして提示。
7. **ボカロック/ロックの高速域**: テンポ>160では上オクターブ多用は低域が痩せる→基本下R、上げは末尾フィルに集約（VR-PUSH型）。生成時テンポで上オクターブ密度を自動抑制。

---

## 9. 出典（URL）

### ロック／ピッキング・8分
- Bass Road, "Straight Eighths Rock with a Pick": https://bassroad.net/straight-eighths-rock-with-a-pick/
- TalkingBass, "Improve Your Alternate Two Finger Picking": https://www.talkingbass.net/bass-technique-alternate-picking/
- Wikipedia, "Alternate bass"（ルート↔5度交替の定義）: https://en.wikipedia.org/wiki/Alternate_bass

### バラード／アプローチノート・全音符
- Wikipedia, "Whole note"（バラードで拍頭R・3拍でR/5/octの長音）: https://en.wikipedia.org/wiki/Whole_note
- How To Play Bass, "The Five Types Of Approach Notes": https://how-to-play-bass.com/five-types-approach-notes
- No Treble, "Build Better Bass Lines with Dead Notes and Approach Notes": https://www.notreble.com/buzz/2026/04/22/build-better-bass-lines-with-dead-notes-and-approach-notes/
- TalkBass, "Bass Line Construction: Target Approach": https://www.talkbass.com/threads/bass-line-construction-target-approach.125536/

### シティポップ／ディスコ・オクターブ・16分シンコペ
- TalkingBass, "Disco Bass Octaves"（2発目を16分で食う／運指 index-index-middle）: https://www.talkingbass.net/disco-bass-octaves/
- Bass Musician Magazine, "BASS LINES: DISCO – Basic Bass Patterns": https://bassmusicianmagazine.com/2019/08/bass-lines-disco-basic-bass-patterns/
- Premier Guitar, "Rhythm Rules: Syncopated 16th-Note Rhythms": https://www.premierguitar.com/rhythm-rules-syncopated-16th-note-rhythms
- Composer Code, "Syncopation in Music"（Thrillerの末尾食いオクターブ言及）: https://composercode.com/syncopation-in-music-the-key-to-better-rhythms/

### ファンク／ゴースト・スライド
- TalkingBass, "How To Play Funky Ghost Note Basslines": https://www.talkingbass.net/bass-technique-ghost-notes/
- TalkingBass, "How To Build A Great Funky Bass Line": https://www.talkingbass.net/how-to-build-a-funky-bass-line/
- Soundbrenner, "Funk groove"（the one基準・16分グリッド・アクセント1つで激変）: https://www.soundbrenner.com/blogs/articles/funk-groove
- Wikipedia, "Funk"（後期ファンクの16分シンコペ・オクターブ跳躍）: https://en.wikipedia.org/wiki/Funk

### EDM／オフビート・ロー持続・キック衝突
- Attack Magazine, "Low-End Theory: Exploring Eight Common Bassline Styles"（ハウスのbass域と kick=sub の棲み分け、deadmau5倍速パルス＋サイドチェイン）: https://www.attackmagazine.com/technique/tutorials/low-end-theory-exploring-eight-common-bassline-styles/
- EDMProd, "9 Killer Tips for Writing Better Bass Lines": https://www.edmprod.com/bass-lines-tips/
- Stealify Sounds, "Deep House Bassline Tutorial"（root on beat→offbeatへ移す、pluck ADSR）: https://stealifysounds.com/blogs/news/elevate-your-tracks-deep-house-bassline-tutorial-essentials

### ボカロック／J-rock 高速8分
- Vocaloid Database, "j-rock" タグ: https://vocadb.net/T/4933/j-rock
- Melodigging, "J-Rock"（ジャンル特徴）: https://www.melodigging.com/genre/j-rock

### キック絡み（interlock / pocket / the one）
- Soundfly Flypaper, "Rhythm Section Essentials: Locking in with Bass and Drums": https://flypaper.soundfly.com/write/rhythm-section-locking-in-with-bass-and-drums/
- Soundbrenner, "Pocket"（kick とベースの同期＝ポケット定義）: https://www.soundbrenner.com/blogs/articles/pocket
- Bass Musician Magazine, "How to Lock in With a Drummer": https://bassmusicianmagazine.com/2025/06/how-to-lock-in-with-a-drummer-bassists-guide-to-groove-and-timing-mastery/

### フィル／walk up・down
- TalkingBass, "4 Simple Bass Fills For Beginners"（フィル＝セクション遷移で使う）: https://www.talkingbass.net/4-simple-bass-fills-beginners/
- School of Rock, "Guide to Playing Walking Bass Lines": https://www.schoolofrock.com/resources/bass-guitar/guide-to-playing-walking-bass-lines
- No Treble, "How To Turn Bass Scales Into Musical Lines, Grooves, and Fills": https://www.notreble.com/buzz/2025/07/16/how-to-turn-bass-scales-into-musical-lines-grooves-and-fills/

---

## 10. 収録型カウント（12本以上要件の確認）

RK×4 ＋ BL×5 ＋ CP×5 ＋ FK×5 ＋ ED×5 ＋ VR×4 ＋ FL×5 = **33型**（すべて16分グリッド・度数表記のテキスト譜つき）。要件「代表12本以上」を満たす。
