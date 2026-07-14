# ドラム定型ビート×テンポ域 パターンライブラリ（型辞書＋選択表）

作成: 2026-07-14 / 担当: ドラム打ち込み・リズムアレンジ（研究タスク D5）
対象: creative_manager のドラム生成器（バックビート基本＋4/4・6/8＋スイング）に「ジャンル定型ライブラリ」を後付けするための仕様素材。

---

## 0. この文書の使い方（設計含意サマリ）

- 現状の生成器は「バックビート系の基本＋4/4/6/8＋スイング」しか持たず、**ジャンル定型のカタログが無い**。本書はそれを埋めるための **型辞書（§7）** と **選択表（§8）** を提供する。
- 各型は **16分グリッドのテキスト譜**（K/S/HH＝キック/スネア/ハイハット）＋ **テンポ適正域** ＋ **ジャンル/セクション文脈** ＋ **ハイハット密度・開閉** ＋ **ライド切替条件** を持つ。
- 実装への落とし込み方針:
  1. 型は「GMノート列（onset＋velocity＋楽器）」に展開する純データとして持つ（§1 のノート対応）。
  2. スイング/微小timingは既存の **feel 層（applyFeel）** に委譲し、型自体は**素の格子（straight）で保持**する（三連系だけは格子を triplet にする）。二重に揺らさない。
  3. セクション役割（verse/pre/chorus/bridge）は「型ID候補リスト」を返す選択表（§8）で解決し、**遷移の定番（§6）** をデフォルト提案にする。
  4. コード生成器のセクション役割・強度カーブと同じ語彙（intensity/density）で束ねると、他トラックと結線しやすい。

---

## 1. 記譜規約（グリッドと記号）

### 4/4 の 16 分グリッド（1 小節 = 16 セル）
ヘッダは細分ラベル。ビートは 1・5・9・13 セル目（下では `1 . . . 2 . . . 3 . . . 4 . . .`）。

```
      1 e & a 2 e & a 3 e & a 4 e & a
```

レーン記号（レーンごとに意味が違う。混同回避のため）:

- **HH レーン**: `x`=クローズドHH / `o`=オープンHH / `X`=アクセント(強)HH or ペダル / `R`=ライド(通常) / `B`=ライドベル / `-`=無音
- **SN レーン**: `S`=スネア(バックビート・アクセント) / `g`=ゴーストノート(弱) / `s`=サイドスティック/クロススティック(リムのみ) / `-`=無音
- **KK レーン**: `K`=キック / `-`=無音
- 補助レーン: `T`=タム / `C`=クラッシュ / `%`=タンバリン/シェイカー/クラップ等（都度注記）

### 三連(シャッフル)の格子（1 小節 = 12 セル）
各拍を三連 3 分割。ラベル `1 . a 2 . a 3 . a 4 . a`（`.`=三連中、`a`=三連裏）。中抜き（1つ目と3つ目を叩く）がシャッフルの核。

### 6/8 の格子（1 小節 = 6 セル＝8分×6）
ラベル `1 2 3 4 5 6`。付点4分の 2 拍子感（大ビート＝1 と 4）。

> GM ノート対応（実装用）: キック=36(C2) / スネア=38(D2) / サイドスティック=37 / クローズドHH=42(F#2) / ペダルHH=44(G#2) / オープンHH=46(A#2) / ライド=51(E3) / ライドベル=53 / タンバリン=54 / ハンドクラップ=39 / ロータム=45・47、ハイタム=48・50、フロアタム=41・43。出典: [Sound Programming – GM Drum Note Numbers](https://soundprogramming.net/file-formats/general-midi-drum-note-numbers/) / [Computer Music Resource – GM Percussion Key Map](https://computermusicresource.com/GM.Percussion.KeyMap.html)。

---

## 2. 8ビート系（エイトビート＝日本の教則の中核概念）

日本のドラム教則では「8ビート／16ビート／シャッフル」を三本柱に据えるのが定番で、8ビートはハイハットを8分で刻む最基本。バリエーションはキックの食い込み（シンコペ）と、ハイハットの開閉・裏打ちで作る。ポップスの大半は 8分・16分の格子に乗る。出典: [drumhelper – 15 Common Drum Beats](https://drumhelper.com/learning-drums/common-drum-beats-and-patterns/) / [Open Music Theory – Drumbeats](https://viva.pressbooks.pub/openmusictheory/chapter/drumbeats/)。

### 型1: `beat8.basic`（8ビート基本）
テンポ域: **70–140 BPM**（万能）。文脈: J-pop/ロック/歌モノ verse の初期値。HH密度=8分(8打)・全クローズド。ライド切替=なし（サビで型2/型16へ）。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - - S - - - - - - - S - - -
KK    K - - - - - - - K - - - - - - -
```

### 型2: `beat8.offbeat_hh`（8ビート裏打ちハイハット／ディスコ・アイドル）
テンポ域: **100–132 BPM**。文脈: アイドル/シティポップ/ディスコ。オープンHHを裏(&)で開く＝推進力。HH密度=8分だが**裏を開く**。サビや Bメロで多用。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-o  - - o - - - o - - - o - - - o -
SN    - - - - S - - - - - - - S - - -
KK    K - - - - - - - K - - - - - - -
```

### 型3: `beat8.syncopated`（8ビート・キック食い込み／J-pop verse定番）
テンポ域: **80–150 BPM**。文脈: J-pop/ボカロの A メロ。キックを「&of3」「4」へ食わせて歌の隙間を突く。HH密度=8分。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - - S - - - - - - - S - - -
KK    K - - - - - - - K - K - K - - -
```

---

## 3. 16ビート系

16分でハイハットを刻む（片手または両手）。スロー〜ミドルのファンク/R&B/シティポップ/バラードの土台。片手16分は少し遅めのテンポで扱いやすい。出典: [Mystic Alankar – Pop Drum Patterns](https://mysticalankar.com/blogs/blog/rhythm-makers-crafting-irresistible-pop-drum-patterns) / [drumhelper](https://drumhelper.com/learning-drums/common-drum-beats-and-patterns/)。

### 型4: `beat16.basic`（16ビート基本）
テンポ域: **70–110 BPM**（速いと片手16分が破綻→型5/型11へ）。文脈: シティポップ/バラードのサビ、R&B。HH密度=16分(16打)・全クローズド。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x x x x x x x x x x x x x x x x
SN    - - - - S - - - - - - - S - - -
KK    K - - - - - K - K - - - - - - -
```

### 型5: `beat16.ghost`（16ビート・ゴースト入り／ファンク・シティポップ）
テンポ域: **75–115 BPM**。文脈: ファンク/シティポップ/ネオソウル。スネアにゴースト(`g`)を散らして粘りを出す。velocity は `g`≈25–40, `S`≈100 目安。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x x x x x x x x x x x x x x x x
SN    - - g - S - g - - g - - S - g -
KK    K - - - - - K - K - - K - - - -
```

---

## 4. 4つ打ち系（four-on-the-floor）

キックを4分すべてで踏む。ハウス/テクノ/トランス/EDM/ダンス歌謡/アイドルの基幹。ハウスの基本は「全拍キック＋2・4クラップ＋裏でオープンHH」。出典: [Sweetwater – Four on the Floor](https://www.sweetwater.com/insync/four-floor/) / [MusicRadar – four-to-the-floor grooves](https://www.musicradar.com/how-to/how-to-program-6-different-four-to-the-floor-grooves)。

### 型6: `four.house`（ハウス系4つ打ち）
テンポ域: **118–128 BPM**（ハウス）/ **128–140 BPM**（テクノ・トランス）。文脈: EDM/ダンス歌謡/アイドルのサビ。スネアの代わりに**クラップ**を2・4、裏(&)でオープンHH。HH密度=裏の開き＋任意で16分シェイカー。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-o  - - o - - - o - - - o - - - o -
CLAP  - - - - S - - - - - - - S - - -   (S=クラップ/スネアで代替)
KK    K - - - K - - - K - - - K - - -
```

### 型7: `four.rock`（ロック4つ打ち／バンド系）
テンポ域: **120–170 BPM**。文脈: 4つ打ちロック/邦ロック/ボカロの疾走サビ。キック4分＋バックビート＋8分HH。ハウスと違い**生スネア**で叩く。HH密度=8分（サビはライド or 開き）。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - - S - - - - - - - S - - -
KK    K - - - K - - - K - - - K - - -
```

---

## 5. ハーフタイム／ダブルタイム／シャッフル系

### 型8: `halftime.basic`（ハーフタイム）
テンポ域: **見かけ 120–170 BPM（体感は半分）**。文脈: サビ前の落とし/ヘヴィなBメロ/エモ・オルタナ。バックビートを**3拍目のみ**に置き、重心を下げる。半分の速さの粘り。出典: [Modern Drummer – Half-Time Shuffle](https://www.moderndrummer.com/article/april-2013-half-time-shuffle/)。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - - - - - - S - - - - - - -
KK    K - - - - - - - - - - - K - - -
```

### 型9: `doubletime.basic`（ダブルタイム）
テンポ域: **見かけ 70–110 BPM（体感は倍）**。文脈: サビでの疾走感演出/パンク寄りの盛り上げ。バックビートを**毎拍の裏**へ倍増し、二倍速に聞かせる。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - S - - - S - - - S - - - S -
KK    K - - - K - - - K - - - K - - -
```

### 型10: `shuffle.basic`（シャッフル＝三連中抜き）
テンポ域: **80–140 BPM**。文脈: ブルース/ロカビリー/レトロ歌謡/シティポップの跳ね。**格子は12セル(三連)**。ハイハットは各拍の1つ目と3つ目（中抜き）。※既存 feel 層のスイングで straight から生成する手もあるが、跳ねが主役の型は三連格子で持つ方が明瞭。出典: [beat-note – Shuffle Drum Grooves](https://beat-note.app/blog/genre/technique/2024/08/14/shuffle-drum-grooves/)。

```
      1 . a 2 . a 3 . a 4 . a
HH-c  x . x x . x x . x x . x
SN    - - - S - - - - - S - -
KK    K - - - - - K - - - - -
```

### 型11: `shuffle.halftime`（ハーフタイムシャッフル／Purdie・Rosanna型）
テンポ域: **80–100 BPM**（原曲 Rosanna ≈ 82–86 BPM）。文脈: AOR/シティポップ/ファンク・バラードの高級グルーヴ。**三連ゴースト**を全面に敷き、メインのバックビートは3拍目。Porcaro が Purdie シャッフル＋Bonham"Fool in the Rain"＋Bo Diddley を合成した型。ゴースト密度が命。出典: [Wikipedia – Rosanna shuffle](https://en.wikipedia.org/wiki/Rosanna_shuffle) / [arXiv 2411.06892 – Timing and Dynamics of the Rosanna Shuffle](https://arxiv.org/pdf/2411.06892)。

```
      1 . a 2 . a 3 . a 4 . a
HH-c  x . x x . x x . x x . x
SN    - g g - g g S - g - g g
KK    K - - - - - - - - K - -
```

---

## 6. ブレイクビート（Amen 抽象型・構造のみ）

**注意（著作権）**: Amen ブレイクは特定録音の6秒サンプルであり、リテラルな引用・サンプルは避ける。ここでは「2小節フレーズで、後半の小節でスネアを8分ぶん後ろへずらして"つんのめる"」という**構造ルールのみ**を抽象化して持つ。原型は約 136–138 BPM の4小節、前半=標準ファンク、後半=スネアを4拍目で8分遅らせて不安定化。出典: [Wikipedia – Amen break](https://en.wikipedia.org/wiki/Amen_break) / [MusicRadar – program an Amen-style break](https://www.musicradar.com/tuition/tech/how-to-program-an-amen-style-break-637374) / [Ethan Hein – Building the Amen break](https://www.ethanhein.com/wp/2023/building-the-amen-break/)。

### 型12: `break.amen_abstract`（2小節・構造抽象）
テンポ域: **90–110 BPM（ヒップホップ解釈）/ 160–180 BPM（DnB解釈）**。文脈: DnB/ジャングル/ブレイクコア/ビートミュージック。片手16分HHにゴースト散布、後半小節でスネア位置を前後にジッタさせる。

小節A（相対的に素直）:
```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - g - S - - - - - g - S - - -
KK    K - - - - - K - - - - - - - K -
```
小節B（ずらして"つんのめる"）:
```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - g S - - g - - g - - g S -
KK    K - - - - - K - - K - - - - - -
```

---

## 7. モータウン／ラテン簡略型／6/8／ロック極型

### 型13: `motown.four_on_snare`（モータウン／全拍スネア）
テンポ域: **110–140 BPM**。文脈: モータウン/オールディーズ/レトロ歌謡/元気なポップ。**バックビートを4拍すべて**に置き（"four on the snare"）、タンバリンを裏で足す。明るく前のめり。出典: [drumeo – Four on the Floor（Motownの起源言及）](https://www.drumeo.com/beat/how-to-play-4-on-the-floor/)。

```
      1 e & a 2 e & a 3 e & a 4 e & a
%Tmb  - - x - - - x - - - x - - - x -
SN    S - - - S - - - S - - - S - - -
KK    K - - - - - - - K - - - - - - -
```

### 型14: `bossa.basic`（ボサノバ簡略・2小節）
テンポ域: **110–170 BPM（ゆったりは 110 前後）**。文脈: ボサ/ラテン歌謡/静かな間奏。スネアは**クロススティック(サイドスティック)でクラーベ的**に、キック=サーフド代替で1・3、ハイハット/ライドは8分キープ。生々しいバックビートは使わない。出典: [Liberty Park Music – Bossa Nova notation](https://www.libertyparkmusic.com/guide-drum-kit-notation-latin-music-bossa-nova/) / [MusicRadar – bossa nova beats](https://www.musicradar.com/how-to/how-to-program-and-transfer-authentic-bossa-nova-beats)。

小節A:
```
      1 e & a 2 e & a 3 e & a 4 e & a
HH/R  x . x . x . x . x . x . x . x .
SS    s - - - - - s - - - - - s - - -
KK    K - - - - - - - K - - - - - - -
```
小節B（クラーベ裏返し）:
```
      1 e & a 2 e & a 3 e & a 4 e & a
HH/R  x . x . x . x . x . x . x . x .
SS    - - s - - - s - - - - - s - - -
KK    K - - - - - - - K - - - - - - -
```

### 型15: `samba.simplified`（サンバ簡略）
テンポ域: **95–130 BPM（体感は速い）**。文脈: 陽性ラテン/カーニバル風/賑やかな間奏。16分をシェイカー/HHで敷き、キック(サーフド代替)は**2拍目を強調**、スネア(タンボリン代替)を16分で散らす。出典: [drumsettips – Bossa/Samba](https://drumsettips.org/bossa-nova-drum-style-latin-drum-set-beats/)。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH/%  x x x x x x x x x x x x x x x x
SN    - - g - g - - g - - g - g - - g
KK    K - - K K - - K K - - K K - - K   (2・4拍頭にアクセント)
```

### 型16: `six8.ballad`（6/8 バラード）
テンポ域: **付点4分 = 50–80 BPM（8分 = 150–240）**。文脈: パワーバラード/ゴスペル/R&B/演歌的スロー。6/8 は複合拍子で、**キック=1拍目、スネア=4つ目の8分、ハイハットは6つ全部**。ゆっくりだと最も情感が出る拍子。出典: [drumhelper – 6/8 Drum Beats](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/) / [Native Instruments – 6/8 time](https://blog.native-instruments.com/6-8-time-signature/)。

```
      1 2 3 4 5 6
HH-c  x x x x x x
SN    - - - S - -
KK    K - - - - -
```
（盛り上げ派生 `six8.ballad_ride`: HHをライド`R`へ、5・6にキック追加で推進）

### 型17: `dbeat.basic`（D-beat／クラスト・パンク）
テンポ域: **160–220 BPM**。文脈: ハードコア/クラスト/メロディックパンク/激しめ邦ロック間奏。"da-da-CRACK" の転がるキック＋2・4スネア。Discharge の Tezz 由来。出典: [Wikipedia – D-beat](https://en.wikipedia.org/wiki/D-beat)。

```
      1 e & a 2 e & a 3 e & a 4 e & a
HH-c  x . x . x . x . x . x . x . x .
SN    - - - - S - - - - - - - S - - -
KK    K - K - - - K - K - K - - - K -
```

### 型18: `blast.traditional`（ブラストビート／トラディショナル）
テンポ域: **180 BPM 超（実質 ≥200）**。文脈: エクストリームメタル/デスコア/瞬間的な最大強度演出。キックとスネアを**8分で交互**に連打、ハイハットはキックと同時。長時間は非人間的なので短尺スポットで。出典: [Grokipedia – Blast beat](https://grokipedia.com/page/Blast_beat) / [Wikipedia – D-beat（境界の言及）](https://en.wikipedia.org/wiki/D-beat)。

```
      1 e & a 2 e & a   (超高速・1拍群を反復)
HH-c  x . x . x . x .
SN    - - S - - - S -
KK    K - - - K - - -
```
（トラディショナル型＝K/Sを交互。ハンマー型＝K/S同時で更に高密度。抽象化のため交互型を代表に）

---

## 8. 型ID辞書（一覧）

| 型ID | 通称 | 拍子/格子 | テンポ域(BPM) | HH密度 | 主用途セクション |
|---|---|---|---|---|---|
| `beat8.basic` | 8ビート基本 | 4/4・16 | 70–140 | 8分クローズド | verse汎用 |
| `beat8.offbeat_hh` | 裏打ちHH | 4/4・16 | 100–132 | 8分・裏開き | サビ/Bメロ |
| `beat8.syncopated` | 8ビート食い込み | 4/4・16 | 80–150 | 8分 | J-pop Aメロ |
| `beat16.basic` | 16ビート基本 | 4/4・16 | 70–110 | 16分クローズド | サビ/シティポップ |
| `beat16.ghost` | 16ビート・ゴースト | 4/4・16 | 75–115 | 16分＋ゴースト | ファンク/ネオソウル |
| `four.house` | ハウス4つ打ち | 4/4・16 | 118–140 | 裏開き＋16分% | ダンスサビ |
| `four.rock` | ロック4つ打ち | 4/4・16 | 120–170 | 8分 | 疾走サビ |
| `halftime.basic` | ハーフタイム | 4/4・16 | 見120–170 | 8分 | 落とし/重Bメロ |
| `doubletime.basic` | ダブルタイム | 4/4・16 | 見70–110 | 8分 | 疾走演出 |
| `shuffle.basic` | シャッフル | 4/4・12三連 | 80–140 | 三連中抜き | 跳ね歌謡/ブルース |
| `shuffle.halftime` | ハーフタイムシャッフル | 4/4・12三連 | 80–100 | 三連ゴースト | AOR/シティポップ |
| `break.amen_abstract` | ブレイク抽象 | 4/4・16×2 | 90–110/160–180 | 16分＋ジッタ | DnB/ビート物 |
| `motown.four_on_snare` | モータウン全拍S | 4/4・16 | 110–140 | 8分ライド＋% | レトロ元気ポップ |
| `bossa.basic` | ボサ簡略 | 4/4・16×2 | 110–170 | 8分HH/ライド | ラテン/間奏 |
| `samba.simplified` | サンバ簡略 | 4/4・16 | 95–130 | 16分% | 陽性ラテン |
| `six8.ballad` | 6/8バラード | 6/8・6 | 付点♩50–80 | 8分全打 | パワーバラード |
| `dbeat.basic` | D-beat | 4/4・16 | 160–220 | 8分 | パンク/激間奏 |
| `blast.traditional` | ブラスト | 高速・8 | ≥200 | 8分 | 瞬間最大強度 |

---

## 9. ジャンル/テンポ/セクション役割 → 候補型（選択表）

「まず候補を出す→人が選ぶ」方針（機械は候補まで）。各セルは**優先順**の候補列。

### 9-1. J-pop / ボカロ（王道）
| セクション | 候補型（優先順） | 慣習メモ |
|---|---|---|
| intro | `beat8.basic` / `four.rock`(疾走曲) | 薄めに、HH間引きも可 |
| A(verse) | `beat8.syncopated` / `beat8.basic` / `beat16.ghost`(スロー) | キック食い込みで歌の隙間を突く |
| B(pre) | `halftime.basic`(落とし) / `beat8.offbeat_hh`(上げ) | サビ前で一段テンションを操作 |
| サビ(chorus) | `four.rock` / `beat8.offbeat_hh` / `beat16.basic` | **サビでライド or 開きHH**が定番。HHをライド`R`へ替え密度と明度UP |
| C(bridge) | `halftime.basic` / `six8.ballad`(転調バラード化) | 対比で拍子/密度を変える |
| outro | サビ型を継続 or `beat8.basic`へ減衰 | クラッシュ増→フェード |

### 9-2. バラード / スロー
| セクション | 候補型 |
|---|---|
| verse | `six8.ballad` or `beat16.basic`(ドラム薄め/サイドスティック) |
| サビ | `six8.ballad_ride`(ライド化) / `beat16.basic`(オープン混ぜ) |
| 盛り | `doubletime.basic` で一時的に倍テンポ感 |

### 9-3. ダンス / EDM / アイドル
| セクション | 候補型 |
|---|---|
| verse | `beat8.offbeat_hh` / `four.house`(キック間引き) |
| build | `four.house`＋16分% クレッシェンド、スネアロール |
| drop/サビ | `four.house` / `four.rock` |

### 9-4. バンド / ロック
| セクション | 候補型 |
|---|---|
| verse | `beat8.basic` / `beat8.syncopated` |
| サビ | `four.rock` / `beat8.offbeat_hh`（ライド切替） |
| 激所 | `dbeat.basic` / `blast.traditional`（短尺スポット） |

### 9-5. ファンク / R&B / シティポップ
| セクション | 候補型 |
|---|---|
| verse | `beat16.ghost` / `shuffle.halftime` |
| サビ | `beat16.basic`(オープン混) / `motown.four_on_snare`(明るく) |
| 間奏 | `bossa.basic` / `samba.simplified`（色替え） |

---

## 10. 型間の互換・遷移（同曲内の定番遷移）

「verse=8ビート → chorus=?」の定番は**密度アップ／シンバル明度アップ／裏の開き**の3操作に集約できる。ドラムパターンの切替はセクションの高揚を作る主要装置。出典: [MTO 30.2 Geary – Formal Functions of Drum Patterns](https://mtosmt.org/issues/mto.24.30.2/mto.24.30.2.geary.html) / [loudlandsmusic – Timekeeping Cymbal Patterns](https://www.loudlandsmusic.com/blog/common-timekeeping-cymbal-patterns)。

- **8ビート(verse) → 4つ打ち/裏打ち(chorus)**: 邦ロック/アイドルの王道。`beat8.syncopated → four.rock` or `→ beat8.offbeat_hh`。
- **8ビート → 16ビート(chorus)**: シティポップ/ミドル。`beat8.basic → beat16.basic`。HHを8分→16分に倍化＝密度アップ。
- **クローズドHH → ライド(chorus)**: 最も安全な"サビ上げ"。同じ型のまま **HHレーンを `R`(ライド) に差し替える**だけで明度と空気量が増す。**ライド切替条件の一般則**＝(a)サビ/クライマックス、(b)テンポが速く16分HHが窮屈、(c)開放感/レガートが欲しい、(d)キックと分離して抜けを出したい。
- **ハーフタイム(pre) → 通常/ダブル(chorus)**: `halftime.basic → four.rock`/`doubletime.basic`。落として一気に開ける定番のダイナミクス設計。
- **6/8 のまま verse→chorus**: バラードは拍子を保ち、HHをライド化＋キック密度増（`six8.ballad → six8.ballad_ride`）。拍子を変えない対比。
- **同曲内の色替え（bridge）**: `bossa.basic`/`samba.simplified`/`shuffle.*` を一時挿入し、サビでメイン型へ戻ると効果的。

### ハイハット密度・開閉の一般則
- verse=8分/16分クローズドで抑制 → chorus=裏をオープン(`o`)or ライド(`R`)で開放。
- クレッシェンド区間はHHを 8分→16分へ倍化、または `o` の頻度を上げる。
- 静かな箇所はHHを間引き（4分のみ）or サイドスティックへ。

---

## 11. 実装への設計含意（まとめ）

1. **型は straight 格子＋GMノート列で保持**。スイング・微小timing・ヒューマナイズは既存 feel 層(applyFeel)に一任し二重掛けを避ける。三連が主役の `shuffle.*` だけ12格子で持つ（feel のスイングでは跳ねの主張が足りない）。
2. **HHレーンは差し替え可能なパラメータ**にする（closed/open/ride/密度8-or-16）。サビ上げ＝レーン属性の切替で表現でき、型を増やさず済む。
3. **選択表(§9)は「候補リスト＋優先度」を返す**。単一決め打ちにせず、seed/進行違いで複数出す（ばらつき提示）。
4. **遷移(§10)を intensity カーブに紐づける**。verse→pre→chorus の強度指標を、密度(HH 8→16)・明度(closed→ride)・バックビート数(2→4)にマップ。コード/ベース生成器のセクション役割語彙と共有する。
5. **ブレイク/サンプル系は構造ルールのみ**（Amen 抽象型は「後半小節でスネアを8分ずらす」規則）。リテラルなフレーズ/サンプルは保存しない（著作権）。
6. **テンポ域を型のメタに持ち、レンジ外なら代替型を提案**（例: 16分HHが 115BPM 超で窮屈→`shuffle.halftime` か HH を8分/ライドへ）。

---

## 12. 代表パターン本数チェック

テキスト譜を持つ代表型 = **18 本**（型1〜18）＝要求「15本以上」を満たす。うち Amen 抽象・ボサは2小節構成。

---

## 出典（URL）

- General MIDI ドラムマップ: [Sound Programming – GM Drum Note Numbers](https://soundprogramming.net/file-formats/general-midi-drum-note-numbers/) / [Computer Music Resource – GM Percussion Key Map](https://computermusicresource.com/GM.Percussion.KeyMap.html)
- 基本ビート概念: [drumhelper – 15 Common Drum Beats](https://drumhelper.com/learning-drums/common-drum-beats-and-patterns/) / [Open Music Theory – Drumbeats](https://viva.pressbooks.pub/openmusictheory/chapter/drumbeats/) / [Mystic Alankar – Pop Drum Patterns](https://mysticalankar.com/blogs/blog/rhythm-makers-crafting-irresistible-pop-drum-patterns)
- 4つ打ち/ハウス/モータウン: [Sweetwater – Four on the Floor](https://www.sweetwater.com/insync/four-floor/) / [MusicRadar – four-to-the-floor grooves](https://www.musicradar.com/how-to/how-to-program-6-different-four-to-the-floor-grooves) / [drumeo – How to Play Four on the Floor](https://www.drumeo.com/beat/how-to-play-4-on-the-floor/)
- シャッフル/ハーフタイムシャッフル: [Modern Drummer – Half-Time Shuffle](https://www.moderndrummer.com/article/april-2013-half-time-shuffle/) / [Wikipedia – Rosanna shuffle](https://en.wikipedia.org/wiki/Rosanna_shuffle) / [arXiv 2411.06892 – Timing and Dynamics of the Rosanna Shuffle](https://arxiv.org/pdf/2411.06892) / [beat-note – Shuffle Drum Grooves](https://beat-note.app/blog/genre/technique/2024/08/14/shuffle-drum-grooves/)
- Amen/ブレイク（構造のみ）: [Wikipedia – Amen break](https://en.wikipedia.org/wiki/Amen_break) / [MusicRadar – program an Amen-style break](https://www.musicradar.com/tuition/tech/how-to-program-an-amen-style-break-637374) / [Ethan Hein – Building the Amen break](https://www.ethanhein.com/wp/2023/building-the-amen-break/)
- ボサ/サンバ: [Liberty Park Music – Bossa Nova notation](https://www.libertyparkmusic.com/guide-drum-kit-notation-latin-music-bossa-nova/) / [MusicRadar – bossa nova beats](https://www.musicradar.com/how-to/how-to-program-and-transfer-authentic-bossa-nova-beats) / [drumsettips – Bossa/Samba](https://drumsettips.org/bossa-nova-drum-style-latin-drum-set-beats/)
- 6/8バラード: [drumhelper – 6/8 Drum Beats](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/) / [Native Instruments – 6/8 time](https://blog.native-instruments.com/6-8-time-signature/)
- D-beat/ブラスト: [Wikipedia – D-beat](https://en.wikipedia.org/wiki/D-beat) / [Grokipedia – Blast beat](https://grokipedia.com/page/Blast_beat)
- セクション役割/シンバル切替: [MTO 30.2 Geary – Formal Functions of Drum Patterns](https://mtosmt.org/issues/mto.24.30.2/mto.24.30.2.geary.html) / [loudlandsmusic – Timekeeping Cymbal Patterns](https://www.loudlandsmusic.com/blog/common-timekeeping-cymbal-patterns)
