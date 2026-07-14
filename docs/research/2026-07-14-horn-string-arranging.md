# ホーン／ストリングス編曲の定型 仕様（X6）

- 作成: 2026-07-14
- 目的: creative_manager が扱うレイヤー（単音メロ＋コード＋ベース＋ドラム）に対し、**セクション楽器（ホーン隊／ストリングス）の書法**を仕様化する。MIDIレベル生成（GM音色）を前提に、役割型 × ボイシング規則 × リズムテンプレの辞書、および「コード列＋メロ → セクション譜候補」変換規則、出し入れ計画（エネルギー設計との接続）、16分グリッド表記のサンプル4本を定義する。
- 位置づけ: 研究ドキュメント。実装（`@cm/music-core` のセクション生成器）の設計含意まで踏み込むが、正準は `docs/design.md`。ここは書法の根拠と定型の棚。

---

## 0. 出典（一次情報）

ホーン書法
- Sound on Sound "Top Brass" Part 1–3（実務のホーン編曲・少人数セクション・ユニゾン／オクターブ主義）: https://www.soundonsound.com/techniques/top-brass-part-1 / https://www.soundonsound.com/techniques/top-brass-part-2 / https://www.soundonsound.com/techniques/top-brass-part-3
- hornarrangements.com "The Basics of Pop/R&B/Soul/Funk/Jazz Horn Arranging": https://www.hornarrangements.com/basicshornarranging.html
- Evan Rogers "Writing Horns For Pop Songs": https://www.evanrogersmusic.com/blog-contents/big-band-arranging/writing-horns-for-pop-songs
- Taming the Saxophone "Block Voicing for Jazz Arranging": https://tamingthesaxophone.com/theory/arranging/jazz-blockvoicing

ストリングス書法
- Wikipedia "String arrangement / String section": https://en.wikipedia.org/wiki/String_arrangement
- Berklee "Writing String Pads": https://www.berklee.edu/berklee-today/fall-2018/writing-string-pads
- Sound on Sound "Arranging For Strings" Part 1・4: https://www.soundonsound.com/techniques/arranging-strings-part-1 / https://www.soundonsound.com/techniques/arranging-strings-part-4
- Tim Davies (deBreved) "Divisi – Divide and Conquer" / "String Section Sizes": https://www.timusic.net/debreved/dived-and-conquer/ / https://www.timusic.net/debreved/string-section-sizes/
- Taming the Saxophone "Composing and Orchestration For Strings": https://tamingthesaxophone.com/theory/arranging/composition-strings

リズム／グルーヴ
- Premier Guitar "Syncopated 16th-Note Rhythms": https://www.premierguitar.com/rhythm-rules-syncopated-16th-note-rhythms
- Guitar World "Improve your syncopation (funk)": https://www.guitarworld.com/lessons/improve-your-syncopation-funk-guitar

J-pop／アニソン構造
- Chromatic Dreamers "Japanese Song Structure"（A-melo→B-melo→サビ）: https://chromaticdreamers.com/japanese-song-structure/

音域・移調・GM
- Orchestra Library "Ranges of Orchestral Instruments": https://orchestralibrary.com/reftables/rang.html
- IBMT "Instrumental Transpositions and Ranges": https://smbutterfield.github.io/ibmt17-18/12-reading-scores/a1-insttransandrange.html
- General MIDI Patch List: https://media.rainpos.com/13196/GeneralMIDIPatchList.pdf
- Wikipedia "General MIDI": https://en.wikipedia.org/wiki/General_MIDI

> 注: 出典は書法の「相場」を裏取りするために引用。旋律・モチーフのリテラルなコピーは行わない（統計・原則のみ）。

---

## 1. 役割の型（role）

セクションが曲中で担う機能。**1トラック＝1役割**を原則とし、混在させない（混ぜると出し入れ計画が破綻する）。

| role | 定義 | 主な担当 | 質感 | 典型の居場所 |
|---|---|---|---|---|
| **stab** | 和音を短く突く。リズム楽器化した和音ヒット | ホーン隊が本命／ストリングスはスタッカート | 打点・ドライブ。「短いほど良い」 | サビ、Aメロのキメ、間奏 |
| **pad** | 持続和音で床を張る | ストリングスが本命／ホーンは持続不可（息） | 面・接着剤 | Bメロ〜サビ、静→動の橋 |
| **counter** | 歌の隙間に入る対旋律（オブリガート） | 単一楽器または薄いユニゾン | 会話・呼応 | 歌のロングトーン／小節末の間 |
| **unison run** | セクション全員で決めフレーズ（走句・キメ） | ホーン隊のオクターブ・ユニゾン | 一撃・宣言 | イントロ頭、サビ入り、転換点 |
| **sweetener** | サビ2回し目以降の彩り。控えめな上物 | ハイストリングス／薄いホーン | 差分・ご褒美 | 最後のサビ、2番サビ |

原則（Top Brass, hornarrangements.com）:
- **ホーンは短い音が命。stab / run が主戦場**。pad はホーンに不向き（息が続かない・濁る）。
- **ストリングスは長い音が得意。pad / counter / sweetener が主戦場**。stab もやるがアクセントは弱い。
- counter は**歌が止まっている所にだけ入れる**（歌と同時に動かすと情報過多）。これが最重要の出し入れ原則。

---

## 2. ボイシング規則

### 2-1. ホーン隊

実務セクション（少人数が基本。ポップスのホーンは 2〜4管）:

| 編成 | 構成 | GM代替 | 用途 |
|---|---|---|---|
| 2管 | tp + tenor sax（オクターブ下でダブル） | 57 Trumpet + 67 Tenor Sax | 最小・ラフでビーフィー |
| 3管（上から） | tp / tenor / tb | 57 / 67 / 58 | ミッドレンジの和音の定番 |
| 3管（別型） | tp / alto / tenor | 57 / 66 / 67 | 明るめ・ソウル系 |
| 4管 | tp×2 + tenor + tb | 57×2 / 67 / 58 | ファンク／ビッグな決め |
| セクション一発 | Brass Section 単体 | 62 Brass Section | 手軽・GMでの近道 |

ボイシング原則（Top Brass Part 3, block voicing）:
1. **90%はユニゾンかオクターブ**。ポップ／ファンクのホーンラインはペンタ／ブルース由来の単線が主。まず単線で書き、必要な所だけ和音化する。
2. 和音化するときは **close voicing（密集）**。3音なら上から tp / tenor / tb で1オクターブ以内に収める。
3. **リードが必ず最上声**（メロ＝一番上）。内声はリードの下にぶら下げる。
4. **重さ／音域が振り切れたらオクターブに逃がす**。tp が高すぎ・tb が低すぎなら3度6度でなくオクターブ・ユニゾンに。
5. 4声ブロックは **ドロップ2**（上から2番目を1オクターブ下げる）で開いて濁りを抜く（ジャズ寄り）。ポップスでは多用しない。
6. 平行**完全5度・完全8度の連続は内声で避ける**（stabの塊なら許容範囲、動く時ほど注意）。

音域（concert pitch＝MIDIノート。中央ド C4=MIDI60 表記）:

| 楽器 | GM# | 実用下限 | 実用上限 | 快適域（ここに置く） | 備考 |
|---|---|---|---|---|---|
| Trumpet | 57 | E3(52) | C6(84) | G3(55)〜G5(79) | リード担当。ハイは C6 まで無理させない |
| Trombone | 58 | E2(40) | Bb4(70) | G2(43)〜D4(62) | セクションの底 |
| Alto Sax | 66 | Db3(49) | Ab5(80) | G3(55)〜D5(74) | 明るい内声 |
| Tenor Sax | 67 | Ab2(44) | E5(76) | C3(48)〜C5(72) | tpのオクターブ下ダブルに好適 |
| French Horn | 61 | C2(36) | F5(77) | C3(48)〜C5(72) | 柔らかい pad/サステイン寄り |
| Brass Section | 62 | — | — | C3(48)〜C5(72) | 和音を丸ごと。一発物向け |

### 2-2. ストリングス

配置（上から vn1 / vn2 / va / vc、任意で cb）:

| 楽器 | GM(独奏) | GM(合奏) | 実用域 | メロ／pad 快適域 | 役割 |
|---|---|---|---|---|---|
| Violin 1 | 41 | 49/50 | G3(55)〜A7(105) | D4(62)〜E6(88) | 最上声・メロ／輝き |
| Violin 2 | 41 | 49/50 | G3(55)〜A7(105) | G3(55)〜A5(81) | vn1の3度6度下・ハモリ |
| Viola | 42 | 49/50 | C3(48)〜E6(88) | C4(60)〜C5(72) | 中身・接着 |
| Cello | 43 | 49/50 | C2(36)〜C6(84) | C2(36)〜A4(69) | 根音／5度・低メロ |
| Contrabass | 44 | — | E1(28)〜G3(55) | 実音は記譜の1oct下 | cvを1oct下でダブル |

GM近道: 個別4声を張らずとも **49 String Ensemble 1** に和音を置けば「ストリングスパッド」は一発で出る。表情を作る時だけ 4パート divisi に展開する（GMでは 41/42/43 のソロ音色を各パートに割る）。

ボイシング原則（Berklee, SOS, deBreved）:
1. **中央ド周辺（C4=60 の上下オクターブ）は中立ゾーン**。歌の音域と重なるのでテンション（9th/11th/13th）を置いてもよい。密集（1オクターブ内）も中立。
2. **cello と vn1 の間が10度超のワイド配置で音場が広がる**。低域は根音＋5度を cello に、中身（3rd/7th/tension）を C4 付近の viola/vn2 に、輝きを vn1 に。
3. **divisi簡略**: 「**vn1は常にユニゾン（メロor最上声）、vn2・va・vc を必要に応じて割る**」が定石。全部を律儀に4声で埋めない。声部の**スイートスポット**と声部進行で音を配る。
4. **オクターブ重ね**でサイズを出す（vn1 と va を1オクターブ、cello と cb を1オクターブ）。サビの厚みはほぼこれ。
5. 低域は濁りやすい: **cello より下（C3=48 以下）で3度を積まない**。根音・5度・オクターブに留める（弦でも管でも共通の低域ルール）。
6. pad は**声部進行を滑らかに**（共通音保持・最短距離移動）。ロングトーンは動きの少なさが正義。

---

## 3. リズム型（テンプレ）

16分グリッド表記の規約:
- 1小節=16スロット。`x`=発音（stab/attack）、`-`=継続（タイ／ロングトーン）、`.`=休符。
- 位置は `1 e & a  2 e & a  3 e & a  4 e & a`（各拍4分割）。
- ベロシティ記号: `X`=アクセント強(100–115)、`x`=中(80–95)、`o`=弱/ゴースト(55–70)。

### 3-1. ファンク／ソウルのホーンスタブ（stab）

```
T1  1 e & a  2 e & a  3 e & a  4 e & a
     X . . x  . . X .  . x . .  X . x .    ← 定番の裏食い（& と a を突く）
```
- 特徴: **拍頭を避け、& と a（裏）を突く**。短い音（16分1個）で即ミュート。
- ソウル寄りは間を広く: `X . . . . . X . . . X . . . . .`（1拍目頭＋2裏＋3のa）。
- 「ホーンは短いほど良い」を厳守。長い stab は stab でなく pad になる。

### 3-2. シティポップのホーン（stab／short line）

```
     1 e & a  2 e & a  3 e & a  4 e & a
     . . X -  . . x .  . . X -  . . x .    ← &で入って16分ぶんだけ伸ばす、上品な裏
```
- 特徴: ファンクより**丸く・少なめ**。裏に置くが刺々しくしない。7th/9th を含むリッチな和音を close で。

### 3-3. アニソン／J-popのブラスヒット（unison run / stab）

```
     1 e & a  2 e & a  3 e & a  4 e & a
     X . . .  X . . .  X . X .  X - - -    ← キメ：4分連打→3裏で走って着地しロングトーン
```
- 特徴: **オンビート寄りの一撃**。サビ入りや転換で全管ユニゾン＋オクターブ。最後は伸ばして次へ橋渡し。

### 3-4. ストリングス pad（持続）

```
     1 e & a  2 e & a  3 e & a  4 e & a
     x - - -  - - - -  - - - -  - - - -    ← 1小節1発、コード変わり目で更新
```
- 特徴: コードの拍に合わせてアタック、あとは伸ばす。**発音点＝ハーモニックリズム**に一致させる。

### 3-5. ストリングス刻み（rhythmic ostinato）

```
     1 e & a  2 e & a  3 e & a  4 e & a
     x x x x  x x x x  x x x x  x x x x    ← 16分トレモロ／スピッカート。疾走サビ・アニソン
```
- 特徴: 同音連打で推進力。ドラムの16分と噛ませる。GMでは 45 Tremolo Strings も可。

---

## 4. J-pop／アニソン実務の定石

構造は **Aメロ → Bメロ → サビ（＝サビ/Chorus）** の三段ビルドが基本（Chromatic Dreamers）。セクションの出し入れをこの段に貼る。

定石（Berklee/SOS/現場の相場）:
1. **サビでストリングス追加**が王道。Aメロは薄く（or 無し）、Bメロで pad が忍び込み、**サビで一気にハイストリングス＋オクターブ厚**で開ける。「入れる」より「**それまで我慢して差分で効かせる**」。
2. **ラスサビ（最後の大サビ）でブラスヒット＋ストリングス全部乗せ**。半音／全音の**転調（アニソン頻出）**と同時に投入して臨界に。
3. **Bメロ（Pre-Chorus）は tension builder**。ストリングスのロングトーンをじわ上げ（音域を徐々に上げる／divisiを増やす）でサビへ助走。
4. **ブラスヒットはオンビートの一撃**（3-3）。ロック的な歪みギター・ドラムのキメと**同じ場所を突く**（ユニゾンのキメ）。
5. **counterは歌の休符に置く**。Aメロのフレーズ末、サビのロングトーン中に短い対旋律を差す（歌と衝突させない）。
6. **sweetenerは2番以降**。1番と同じ譜面に「上物のハイストリングス／薄いブラス」を1レイヤー足すだけで新鮮に聞こえる（作り直さない）。

---

## 5. GM MIDI での再現

### 5-1. 音色番号（GM Level 1、1-based）

| 用途 | GM# | 名称 |
|---|---|---|
| リードtp | 57 | Trumpet |
| tp代替(柔) | 60 | Muted Trumpet |
| tb | 58 | Trombone |
| ホルン(pad寄り) | 61 | French Horn |
| セクション一発 | 62 | Brass Section |
| alto/tenor | 66 / 67 | Alto Sax / Tenor Sax |
| シンセブラス | 63 / 64 | SynthBrass 1/2 |
| Vn/Va/Vc ソロ | 41 / 42 / 43 | Violin / Viola / Cello |
| cb | 44 | Contrabass |
| 弦合奏 | 49 / 50 | String Ensemble 1/2 |
| 弦トレモロ/ピチカート | 45 / 46 | Tremolo / Pizzicato Strings |
| シンセ弦 | 51 / 52 | SynthStrings 1/2 |

> 出典差異に注意: 0-based（0=Piano…56=Trumpet）と1-based（1=Piano…57=Trumpet）で±1ずれる。**内部データは0-basedで持ち、GM表記は+1して表示**が安全（実装含意）。

### 5-2. 音域制限（GMでも守る）

GM音源はどのノートも鳴るが、**§2の実用域に収めないと「打ち込み臭」＝非現実的な音**になる。生成時に各パートのMIDIノートを実用域へクランプ（超えたらオクターブ折返し）する。特に:
- tp を C6(84) 超で伸ばさない、tb を E2(40) 未満に置かない。
- 弦の3度積みを C3(48) 以下でやらない（低域濁り）。

### 5-3. ベロシティでアクセント

- stab: アクセントを**110前後、裏の弱い突きは70前後**にして食いを表現（§3のX/x/o）。ベタ打ちは stab に聞こえない。
- pad/ロングトーン: 発音を弱め（70–85）に入れ、**CC11(Expression)でスウェル**（0→上げ）すると弦の自然な立ち上がりになる。GMで表情の8割はここ。
- unison run: 全ノート同ベロシティ（100–110）で揃えると「一枚岩のキメ」。逆にバラすと緩む。
- ヒューマナイズは stab では**タイミングを揃える**方向（キメは合わせる）、pad では**わずかにバラす**方向。

---

## 6. 仕様化：辞書と変換規則

### 6-1. 役割型 × ボイシング × リズム 辞書（生成テンプレのスキーマ案）

```jsonc
// SectionTemplate（@cm/music-core に置く想定。値は例）
{
  "id": "funk_horn_stab_4pc",
  "family": "horn",                 // horn | strings
  "role": "stab",                   // stab | pad | counter | unison_run | sweetener
  "voicing": {
    "instruments": [                // 上声→下声。GM#と実用域(MIDI)
      { "gm": 57, "part": "tp",    "range": [55, 79] },
      { "gm": 57, "part": "tp2",   "range": [52, 76] },
      { "gm": 67, "part": "tenor", "range": [48, 72] },
      { "gm": 58, "part": "tb",    "range": [43, 62] }
    ],
    "type": "close",                // close | octave | unison | drop2 | wide_string
    "lead": "top",                  // メロ＝最上声
    "maxSpan": 12                   // 上下声の許容音程(半音)
  },
  "rhythm": {                       // 16分16スロット。x=attack,-=tie,.=rest
    "grid16": "X..x..X..x..X.x.",
    "velo":   "A..m..A..m..A.m.",  // A=accent(110) m=mid(88) g=ghost(65)
    "articulation": "staccato"      // staccato | sustain | tremolo
  },
  "placement": { "sections": ["chorus","fill"], "energyMin": 0.6 }
}
```

辞書の初期エントリ（最小セット）:
- `funk_horn_stab_4pc`（3-1）／`citypop_horn_stab_3pc`（3-2）／`anison_brass_hit_unison`（3-3）
- `strings_pad_4part`（3-4）／`strings_16th_ostinato`（3-5）／`strings_hi_sweetener`
- `horn_counter_solo`（tenor or tp 単線 counter）／`strings_counter_vc`（チェロ対旋律）

### 6-2. 「コード列 ＋ メロ → セクション譜候補」変換規則

入力: `chords[]`（各小節/各拍のコード＋根音）、`melody[]`（単音・ノート＋タイミング）、`section`（verse/pre/chorus…）、`energy`（0–1）、`family`（horn/strings）。

手順:
1. **role決定**: `section`と`energy`から role を選ぶ（§7の表）。歌の音符密度が高い区間では counter を抑制（歌の休符スロットを検出して counter 可否を判定）。
2. **リズム選択**: `family`＋`role`＋ジャンルタグでテンプレの `rhythm.grid16` を引く。stab は**ドラムのキック/スネアのキメと衝突する所を優先**（キメユニゾン）。pad は**ハーモニックリズム（コード変わり目）にattackを一致**。
3. **和音音の抽出**: 各attackスロット直下の有効コードから chord tone を取得。stab/pad は `root, 3rd, 5th, 7th(+9/13は中立ゾーンのみ)`。
4. **ボイシング割付**:
   - ホーン: リード声部に**メロの音（またはコードの最上テンション）**を置き、下声を close で埋める。声部が実用域外→オクターブ折返し。3声はまず**メロのユニゾン/オクターブ**を試し、和音が要る所だけ close 3声。
   - ストリングス: `vc=root(+5th)`、`va/vn2=中身(3rd/7th/tension、C4付近)`、`vn1=メロ or 最上声`。サイズが要れば `vn1×2`・`vc+cb` をオクターブダブル。divisiは vn1 ユニゾン固定で他を割る。
5. **音域クランプ**: 全ノートを §2実用域へ。はみ出しはオクターブ移動、それでも濁る低域3度は削る。
6. **ベロシティ**: `rhythm.velo` をベロシティにマップ（A/m/g）。pad は CC11 スウェルを付与。
7. **候補を複数返す**（設計思想: 機械は選択肢まで）: 同一入力に対し「薄い/厚い」「stab寄り/pad寄り」「ジャンル別リズム」で **2〜4候補**を出す。seed違い・ボイシング広狭違いでばらつかせる。

出力: `SectionScore { part, gm, notes[{pitch,startTick,durTick,velocity}], cc[] }` の配列。単音メロ・コード・ベース・ドラムと同じMIDIレイヤーに合流。

### 6-3. 出し入れ計画（エネルギー設計との接続）

セクション楽器は**「常に鳴らさない」ことで効く**。曲全体のエネルギー曲線に role を貼る（§7）。実装は既存の section role / energy 情報（トラック間結線シリーズで導入済のセクション役割）に**セクション譜レイヤーをぶら下げる**：各セクションの `energy` と `role` から本辞書を引き、鳴らす/黙るを決める。sweetener は「同一譜面＋1レイヤー追加」で差分生成（作り直さない）。

---

## 7. 出し入れ計画テーブル（エネルギー × セクション）

| 曲セクション | energy目安 | ホーン | ストリングス | 意図 |
|---|---|---|---|---|
| イントロ | 0.3–0.6 | unison run（掴み）or 無 | pad 薄 or 無 | 掴みだけ、以降のため温存 |
| Aメロ(1番) | 0.2–0.4 | 無 | 無 or ごく薄pad | 歌を裸に。差分の原資を貯める |
| Bメロ(Pre) | 0.4–0.6 | 無 or 小counter | pad じわ上げ（音域↑/divisi増） | tension builder、助走 |
| サビ(1番) | 0.7–0.9 | stab（裏キメ） | pad厚＋オクターブ | 開放。ここで初投入が効く |
| 間奏 | 0.5–0.8 | stab / run 主役 | 刻み ostinato | 器楽で魅せる |
| Aメロ(2番) | 0.3–0.5 | 小stab可 | 薄pad | 1番より一段だけ厚く |
| サビ(2番) | 0.75–0.9 | stab | pad厚＋**sweetener**(ハイ弦) | 差分で新鮮に |
| ラスサビ | 0.9–1.0 | ブラスヒット全開＋転調 | 全部乗せ＋オクターブ＋16分刻み | 臨界。全弾投入 |
| アウトロ | 可変 | run で締め or 減衰 | pad 減衰 | 収束 |

原則: **一度に全部入れない／単調増加で厚くする／最後に全弾**。counter は歌の休符スロットのみ。

---

## 8. 16分グリッド表記サンプル 4本

キー=C（例）。ノートは concert MIDI（C4=60）。`x`=attack `-`=tie `.`=rest。ベロ `A`=110 `m`=88 `g`=65。

### サンプル1: ファンクのホーンスタブ（4管close、stab／サビ or 間奏）
コード: | Cm7 | F7 |（各1小節）
```
pos    1 e & a  2 e & a  3 e & a  4 e & a
tp   : X . . x  . . X .  . x . .  X . x .   ← Cm7:上からG5/Eb5/Bb4/C4系, リード=最上
tp2  : X . . x  . . X .  . x . .  X . x .   （tpの3度下 or ユニゾン）
tenor: X . . x  . . X .  . x . .  X . x .   （close内声）
tb   : X . . x  . . X .  . x . .  X . x .   （底=root/5th, G2/C3付近）
velo : A . . m  . . A .  . m . .  A . m .
```
- 2小節目 F7 も同リズムでボイシングだけ平行移動（全声が同型で動く close block）。
- 全管**同一リズム＝一枚岩のキメ**。裏(& / a)食い。短くミュート。

### サンプル2: シティポップのホーン（3管、上品stab／Aメロ後半のアクセント）
コード: | Fmaj7 | G7 |
```
pos    1 e & a  2 e & a  3 e & a  4 e & a
tp   : . . X -  . . x .  . . X -  . . x .   ← Fmaj7: A5(3rd)を上に、9th/7th内声
alto : . . X -  . . x .  . . X -  . . x .   （E5=7th 付近）
tenor: . . X -  . . x .  . . X -  . . x .   （C4/A3付近, root寄り）
velo : . . A -  . . m .  . . A -  . . m .
```
- 少なめ・丸め。7th/9thを含むリッチな close。刺さない裏。

### サンプル3: アニソンのブラスヒット＋ストリングス（unison run＋pad／サビ入り）
コード: | C | G |（1小節ずつ）
```
pos      1 e & a  2 e & a  3 e & a  4 e & a
Brass  : X . . .  X . . .  X . X .  X - - -   ← 全管ユニゾン+oct: C5/C4、キメ後ロング
Str vn1: x - - -  - - - -  - - - -  - - - -   ← pad: E5(3rd)ロング, CC11スウェル
Str vn2: x - - -  - - - -  - - - -  - - - -   （C5）
Str va : x - - -  - - - -  - - - -  - - - -   （G4=5th, C4付近中立域）
Str vc : x - - -  - - - -  - - - -  - - - -   （C3=root, +cb oct下）
velo Br: A . . .  A . . .  A . A .  A - - -
velo St: m(→CC11で上げ)
```
- ブラス＝オンビートの一撃（ドラム/ギターのキメと同位置）。弦＝床のロング。役割分離。

### サンプル4: バラードのストリングス（4声pad＋チェロcounter／Bメロ→サビ）
コード: | Am7 | Fmaj7 | G | Csus4 C |
```
pos      1 e & a  2 e & a  3 e & a  4 e & a
vn1    : x - - -  - - - -  x - - -  - - - -   ← 最上声, 声部進行滑らか(共通音保持)
vn2    : x - - -  - - - -  x - - -  - - - -   （3rd/7th, C4付近中立域, テンション可）
va     : x - - -  - - - -  x - - -  - - - -   （中身）
vc     : x - - .  . x - -  . . x -  x . x -   ← counter: 歌の休符に短い対旋律
velo   : m..（pad弱め→CC11で膨らませる） / vc counter は m
```
- vn/va は pad（コード変わり目でattack、あとタイ）。**vc だけ動く counter**＝歌の隙間に。
- 低域濁り回避: vc は root/5th/オクターブ中心、C3(48)以下で3度を積まない。

---

## 9. 設計含意（実装への申し送り）

1. **セクション譜は既存レイヤーの上物**。単音メロ／コード／ベース／ドラムは触らず、`SectionScore` を追加トラックとして合流（GMマルチトラックMIDI）。トラック間結線の section role/energy に**セクション生成器をぶら下げる**。
2. **辞書駆動**（§6-1スキーマ）。role × voicing × rhythm を JSON テンプレ化し、`gen_section(chords, melody, section, energy, family)` が候補配列を返す。**候補は複数**（設計思想＝機械は選択肢まで、仕上げは人間）。seed／広狭／ジャンルでばらつかせる。
3. **音域クランプは必須の純関数**（TDD対象）。各GMパートの実用域テーブル（§2）を契約として持ち、はみ出しをオクターブ折返し。低域3度削りも規則化。→ MIDI入出力・トランスポーズ同様「テスト先行」の対象。
4. **GM番号は0-based保持／表示+1**。データ契約として固定（§5-1）。
5. **出し入れがUX価値の核**。「鳴らす/黙る」判定（§7テーブル）を第一級に。ベタ塗り（常時鳴り）を防ぐガードを入れる。sweetenerは差分生成（既存譜＋1レイヤー）。
6. **ベロシティ／CC11が表情の8割**（GMの限界内）。stab=アクセント差＋タイミング整列、pad=弱め入り＋スウェル、run=ベロ揃え。ここを生成器の出力に必ず含める。
7. **耳較正が最終ゲート**。理論スコアはセクションの「質」を測れない（メロ評価の天井と同じ）。生成後は実機で耳確認（api再起動→試聴）を前提に。

---

## 10. 残タスク（backlog候補）

- [ ] `SectionTemplate` スキーマ確定 → `docs/design.md` に節を追加（正準化）。
- [ ] 音域クランプ純関数のテスト先行実装（§2テーブルを契約に）。
- [ ] 辞書初期エントリ8種（§6-1）を JSON 化。
- [ ] `gen_section` 変換規則（§6-2）の縦スライス実装＋複数候補出力。
- [ ] 出し入れ計画（§7）を section role/energy 結線に接続。
- [ ] GM番号 0/1-based 変換の契約テスト。
- [ ] 実機耳較正（サビ弦追加・ファンクstab・アニソンヒットの3ケース試聴）。

> 索引更新: 本docを `docs/research/README.md` に1行追加すること（散逸防止ルール）。
