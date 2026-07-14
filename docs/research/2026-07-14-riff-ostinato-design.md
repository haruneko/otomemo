# リフ／オスティナート設計の型（楽器リフ＝歌でない反復核）

- 作成: 2026-07-14
- 担当: リフ/オスティナート研究（外部調査＋設計含意）
- 位置づけ: 作曲支援ツールの生成規則ネタ。思想＝「機械は候補まで・仕上げは人間」。
- スコープ外（既知・再調査不要）: 反復音モチーフ（歌メロのフック）・動機の経済（Schoenberg）。
  本ドキュメントの的は **楽器リフ（vocalでない反復核）＝ギター/シンセ/ピアノ/ゲームBGMの刻み**。
- 用語: 本稿では **riff＝主に前景で聴かせる短い反復楽句**、**ostinato＝背景で回り続ける反復音型**を
  ゆるく区別するが、生成規則としては同一の型辞書で扱う（前景/背景はミックス/配置の属性）。

---

## 0. 要点（先に結論）

- リフは **2部構造が基底**＝「提示ジェスチャ＋対照/終止ジェスチャ」。ハードコアパンクのリフ解析でも
  全リフが initiating statement と contrasting gesture の対で説明される（Easley 2015）。→ 生成は「1拍〜2拍の核 motif を作り、
  反復/変形/移調/終止改変の4スキームで小節に伸ばす」が最小規則。
- 和声との関係は **3類型**: (A) 和声非依存ペダル/ペンタリフ（コードが変わっても不動）、
  (B) コード追従リフ（同一リズム型を各コードのコードトーンへ写像）、(C) 単音ドローン＋装飾。
- catchiness は melody だけでなく **rhythm・timbre・timing** で増強される（学術レビュー）。
  → リフの「引き」はピッチ以上に **リズム型と音色/ゲート**が効く。設計は音程だけで完結させない。
- リフとメロの共存は **音域分離＋リズムの隙間補完（call & response）** が定石。メロが動く区間はリフを薄く/低く、
  メロが伸びる/休む隙間でリフを前に出す。

---

## 1. リフの構造特性（型の座標軸）

### 1.1 長さ
- **1小節**: 最頻。ループBGM・EDM・多くのロック（例: 反復核が1小節で自己完結）。記憶負荷が最小＝catchy。
- **2小節**: 「1小節提示＋1小節の応答/終止」型。2部構造がそのまま長さに現れる最も自然な単位。
- **4小節**: フレーズ級。前半2小節を後半で変形/移調（model & sequential）。ヴァースの土台やゲームの主題級オスティナート。
- 生成含意: 既定は **2小節**。核 motif は 1拍〜1小節、それを反復規則で2小節に伸ばす。4小節は「2小節×変形」で作る。

### 1.2 音数
- catchy リフは **音数が少ない**（3〜6音）。ブレビティ＝即想起。ペンタ由来のリフは5音以内に収まりやすい。
- 密度は音数ではなく **16分グリッドの充填率**で管理（後述の表記）。刻み系は充填率高・単音リフは低〜中。

### 1.3 輪郭（contour）
- 反復核は輪郭が単純（上行/下行/往復/ジグザグの1パターン）。輪郭の「型」を固定し、和声で高さだけ動かすとコード追従に、
  高さも固定するとペダルになる。
- 終止ジェスチャで輪郭を **わずかに崩す（terminal alteration）** と閉じ感が出る（Easley: statement and terminal alteration）。

### 1.4 和声との関係（3類型）— 本稿の中核
- **(A) 和声非依存ペダル/ペンタリフ**: ルート/5度のペダル音＋ペンタトニックの上物。コードが変わっても同じ音列を維持。
  ペダル上でコードが動くと上物が意図的にテンションを生む（pedal point の定義そのもの）。ロック/メタルの駆動リフの主流。
- **(B) コード追従リフ**: リズム型と輪郭型を固定し、各コードの **コードトーン（1-3-5-7）へ度数写像**。EDMプラック/アルペジオ、
  ピアノリフの多く。コード進行の色を直接鳴らす。
- **(C) 単音ドローン＋装飾**: 1音を保続（ドローン）し、周囲に短い装飾を散らす。哀愁/緊張の下地（ゲーム/アンビエント）。

---

## 2. 様式別の型

### 2.1 ロックギターリフ
- **パワーコード型**: 5度（ルート＋P5）を刻む。和声非依存に近い（3度を含まないので長短どちらのコンテキストでも成立）。
  リズムが主役。ダウンピッキングの8分/16分刻み＋シンコペのアクセント。
- **単音型（ペダルトーン）**: 開放弦/ルートを pedal にして上物を動かす。8分/16分で駆動、速いテンポ向き。
  ペンタトニックが上物のガイド。
- **リズム型（rhythm riff）**: ピッチ変化を最小にし、ゴースト/ミュートと休符配置でグルーヴを作る。catchiness の rhythm 寄与を最大化。
- 定石: ロックリフは長調の使用も実は多い（短調偏重は俗説）。key/mode を短調固定にしない。

### 2.2 シンセリフ
- **EDMプラック**: 速attack/短decay/no sustainの打点音。arpeggiator で1〜2小節ループ。ゲートタイムで密度と粒立ちを制御
  （短ゲート＝速いハープ的グリス、長ゲート＝音が重なりレガート化）。
- **アルペジオ型**: コードを up/down/updown で分散。オクターブ範囲とステップサイズがパラメータ。トランス/テクノの背骨。
  → 生成上は **(B) コード追従**の典型。コード列を入れると自動でコードトーン分散が出せる。

### 2.3 ピアノリフ（J-pop/ボカロ頻出）
- **高速アルペジオ**: 16分の分散和音を右手で回す。コード追従(B)＋ペダル低音(C)の複合。ボカロ/J-popのイントロ・間奏の顔。
- **白玉＋装飾**: 保続和音（白玉）に短い装飾音（経過/刺繍）を差す。歌の隙間補完に向く（メロ主役の区間で薄く効かせる）。
- ボカロ文脈は「ピアノ主導のイントロリフ→歌でリフ後退→間奏でリフ復帰」という **前景/背景スイッチ**が定石。

### 2.4 ゲーム音楽のオスティナート（戦闘曲の刻み）
- **弦/シンセの刻みオスティナート**が曲の骨格そのものになる（例: スタッカートの速い反復が推進力）。
- 4/4・一定テンポの駆動が基本。ループ前提なので **継ぎ目（loop point）で破綻しない**設計が必須。
- チップチューン期の名残で **アルペジオでコードを代用**（1音源で和音を高速トグル）＝(B)の極端形。
- アダプティブ音楽ではオスティナートを層（percussion/strings/arp）で足し引きし、緊張度を可変にする。

---

## 3. 和声進行の上での振る舞い（pedal riff vs 移調追従）

| | 維持（pedal/stationary riff） | 移調追従（transposed/chord-following） |
|---|---|---|
| 定義 | コードが変わっても同一音列を保持。ルート/5度ペダル | リズム型を固定し、各コードのコードトーンへ写像 |
| 和声知覚 | ペダル上でコードが動き、上物が意図的テンション | コードの色を直接鳴らす（追従） |
| 向く進行 | ルート保続系（Im–bVII–bVI 等、ペダル可能な近接コード）、モーダル | 明確な機能進行・ダイアトニック |
| 様式 | ロック/メタル駆動、モーダルなゲームBGM | EDMアルペジオ、ピアノリフ、ポップ |
| 使い分け | 進行がペダル音を共有する/近接する時に「不動」で緊張と統一感 | コードが遠く動く/色を聴かせたい時に「追従」 |
| リスク | 遠いコードで上物がぶつかり過ぎる（意図なら可） | 追従しすぎるとリフの同一性（catchiness）が薄れる |

- 実務ハイブリッド: **輪郭とリズムは固定（同一性を担保）／衝突する数音だけコードトーンへ寄せる**（部分追従）。
  ロックの「初期ジェスチャ＋その移調版」の2ジェスチャ構成もこのハイブリッドの一種。
- 判定規則案: コード列のルート集合がペダル候補音（多くはIまたはV）と半音以内で共有/近接なら **維持**、
  そうでなければ **移調追従**。テンションを狙うモード曲は維持を優先。

---

## 4. リフとメロの共存（棲み分けの定石）

- **音域分離**: リフとメロを別オクターブ/別帯域へ。リフが歌の1.5–4kHz帯を避け、低め（暖かさ）か高め（きらめき）へ逃がす。
- **リズムの相補（call & response）**: メロが動く区間はリフを薄く/保続へ、メロが伸びる/休む隙間でリフを前へ。
  「lead を殺さない」オーケストレーション原則＝同時にフルで動かさない。
- **役割固定**: リフは背景図形（background figure）として、メロを覆わずにリズム/和声の interest を供給する（jazz の riff 用法）。
- 定量の目安（設計初期値、耳較正で調整）:
  - メロのオンセット密度が高い小節 → リフ充填率を下げる（例: 16分刻み→8分/白玉へ間引き）。
  - メロが2拍以上保続/休符 → リフ充填率を上げる（応答フィルを差す）。
- 実証状況の注記: 「メロが動く時リフは薄く」は編曲実務の定石で、査読級の定量エビデンスは薄い。
  catchiness 研究は rhythm/timbre/timing が寄与すると示すが、共存最適の数値までは未確立。→ ツールでは可変ノブにして人間が耳で決める。

---

## 5. 仕様化

### 5.1 リフ型辞書（型ID × 長さ × 和声依存度 × 様式 × テンポ域）

和声依存度: `indep`=非依存ペダル / `follow`=コード追従 / `drone`=単音ドローン装飾 / `hybrid`=部分追従

| 型ID | 名称 | 長さ | 和声依存度 | 様式 | テンポ域(BPM) | 備考 |
|---|---|---|---|---|---|---|
| RIFF-RK-PWR | パワーコード刻み | 1–2小節 | indep | ロックG | 90–180 | 5度、リズム主役、3度なしで長短両対応 |
| RIFF-RK-PED | 単音ペダルトーン | 2小節 | indep | ロックG | 120–200 | ルート/開放弦pedal＋ペンタ上物、16分駆動 |
| RIFF-RK-RHY | リズムリフ | 1小節 | indep | ロックG | 90–160 | ピッチ最小、ゴースト/休符でグルーヴ |
| RIFF-SY-PLK | EDMプラック | 1–2小節 | follow | シンセ | 120–150 | 短ゲート打点、arp、コードトーン分散 |
| RIFF-SY-ARP | アルペジオ | 2小節 | follow | シンセ | 120–174 | up/down/updown、oct範囲可変、トランス背骨 |
| RIFF-PN-ARP | 高速ピアノアルペジオ | 2小節 | follow(+drone低音) | ピアノ | 130–200 | ボカロ/J-pop顔、16分分散＋ペダル低音 |
| RIFF-PN-DEC | 白玉＋装飾 | 2–4小節 | drone/follow | ピアノ | 60–120 | 保続和音＋刺繍/経過、歌の隙間補完 |
| RIFF-GM-OST | 戦闘刻みオスティナート | 1–2小節 | indep/hybrid | ゲームBGM | 140–190 | スタッカート駆動、ループ堅牢、層で足し引き |
| RIFF-GM-ARP | チップ和音アルペジオ | 1小節 | follow | ゲームBGM | 120–180 | 和音を高速トグルで代用、モーダル可 |
| RIFF-DR-DRN | ドローン＋装飾 | 4小節 | drone | 汎用 | 60–110 | 1音保続、哀愁/緊張の下地 |

各型のパラメータ枠（生成入力）:
`{型ID, 長さ小節, key, mode, テンポ, 和声依存度, グリッド分解能(8分/16分), 充填率目標, 輪郭型(up/down/arch/zigzag/pedal), 終止改変on/off, 音域(octave), ゲート}`

### 5.2 「コード列→リフ候補」生成規則案

入力: コード列（度数で正規化。例 Im–bVII–bVI–V）、key/mode、型ID、テンポ。

1. **核 motif 生成**: 型IDの輪郭型＋グリッド分解能＋充填率から1拍〜1小節の核リズム＋度数列を作る。
   音数は3–6に制限（catchiness）。
2. **和声依存度で写像**:
   - `indep`: 核をそのまま反復。ペダル音（I or V）を下に敷く。上物度数は固定。
   - `follow`: 核のリズム/輪郭を固定し、各コード区間で度数をそのコードのコードトーン(1-3-5-7)へ量子化。
   - `drone`: 保続音（コード共通音 or ルート）＋核を装飾として周囲に配置。
   - `hybrid`: 輪郭/リズム固定、ぶつかる数音のみコードトーンへ寄せる（部分追従）。
3. **維持/追従の自動判定**（indep/follow未指定時）: コード列のルート集合がペダル候補(I/V)と半音以内で共有/近接
   → 維持(indep)。遠く動く/機能進行明快 → 追従(follow)。モード曲は維持優先。
4. **2部構造化**: 小節1=提示、小節2=対照/終止。4スキームから選択
   （反復＋対照 / 提示＋終止反復 / 提示＋終止改変 / model＋移調）。既定は「提示＋終止改変」で閉じ感。
5. **ループ適性補正（ゲームBGM時）**: 最終拍のオンセットがループ先頭と衝突/重複しないよう終端16分を空ける、
   もしくは先頭へ滑らかに接続する経過音を置く。継ぎ目クリック回避。
6. **メロ共存補正**: メロtrackがある区間は充填率を下げる（16分→8分間引き、または保続化）。
   メロ休符区間に応答フィルを許可。音域はメロと別オクターブへ既定シフト。
7. **候補を複数出す**（思想遵守）: 同一入力で seed 違い・輪郭違い・充填率違いを最低3本。単一解を出さない。

### 5.3 ループ適性（ゲームBGM文脈）チェックリスト
- 小節数は 2 のべき（1/2/4）でループ長を作る。
- 継ぎ目: 末尾オンセットと先頭オンセットが過密にならない（末尾16分を1つ空ける or 経過音で接続）。
- 保続音はループ境界で切れない長さに。
- 層構成: percussion / 刻み / arp を独立トラックにして足し引き（アダプティブ）。緊張度ノブ＝層数。
- 単調回避: 4回ループごとに microvariation（ゴースト、装飾、オクターブ跳躍）を1点だけ差す枠を持つ。

---

## 6. 度数×16分グリッド表記のサンプル6本

表記規約:
- 1小節＝16セル（4/4・16分音符）。`|` は拍頭。
- セル値: 度数（`1 2 3 4 5 6 7`, オクターブ上は `1^`, 下は `5.`）。`-`＝直前音を保続、`.`＝休符。
- `b3` 等は短3度。上段＝上物/リフ本体、下段(bass:)＝ペダル/ドローン。度数は key の主音基準。

### サンプル1: RIFF-RK-PED 単音ペダルトーン（indep, Aマイナー, 160BPM, 2小節）
ルート pedal(1) を刻み、間に mブルースペンタの上物を差す駆動リフ。コード Im–bVII でも上物不動。
```
b小節1:  1  1  b3 1 | 1  1  4  1 | 1  1  5  1 | 1  1  b7 1
小節2:  1  1  b3 1 | 1  1  4  1 | 1  1  5  b7| 5  4  b3 1     ← 終止改変(下行で閉じる)
bass:   1  -  -  - | 1  -  -  - | 1  -  -  - | 1  -  -  -     ← ペダル維持
```

### サンプル2: RIFF-RK-PWR パワーコード刻み（indep, Eマイナー, 140BPM, 1小節×2）
5度(1+5)を刻み、リズムが主役。休符で溝を作る。コードが動いてもリズム型は不変。
```
小節1:  1  1  .  1 | .  1  1  . | 1  .  1  1 | .  1  .  .
(各オンセット=power chord: root+P5, 3度なし)
小節2:  1  1  .  1 | .  1  1  . | 1  .  1  1 | .  b7 b7 .    ← 末尾をbVIIへ寄せる(hybridの萌芽)
```

### サンプル3: RIFF-SY-ARP EDMアルペジオ（follow, Cメジャー, 128BPM, 2小節, updown）
コード追従。各拍でコードトーンを16分upで分散。進行 I–V–vi–IV。
```
コード:  C(I)          G(V)          Am(vi)         F(IV)
度数:   1  3  5  1^ | 5  7  2^ 5 | 6. 1  3  6  | 4  6  1^ 4  ← 各コードの1-3-5を分散
bass:   1  -  -  -  | 5. -  -  - | 6. -  -  -  | 4. -  -  -
(2小節目は同型を1オクターブ上/downパターンで応答=call&response)
```

### サンプル4: RIFF-PN-ARP 高速ピアノアルペジオ（follow+drone, Aマイナー, 150BPM, 2小節）
ボカロ頻出。右手16分分散、左手ルートペダル。進行 Am–F–C–G。
```
コード:  Am            F             C              G
右手:   6. 1  3  5  | 4. 6  1  4  | 3. 5  1^ 3  | 5. 7  2^ 5
右手2:  6  3  1  6. | 4  1  6. 4.| 5  1^ 5  3  | 2^ 7  5  2   ← 折り返し(updown)
bass:   6. -  -  -  | 4. -  -  - | 1  -  -  -  | 5. -  -  -    ← 低音ペダル
```

### サンプル5: RIFF-GM-OST 戦闘刻みオスティナート（indep, Dマイナー, 174BPM, 2小節）
弦スタッカートの推進オスティナート。ルート/5度中心、ループ堅牢（末尾16分を空ける）。
```
小節1:  1  1  1  1 | 5  5  5  5 | b6 b6 b6 b6| 5  5  5  5
小節2:  1  1  1  1 | 5  5  5  5 | 4  4  4  4 | 5  5  5  .    ← 末尾を空けてループ継ぎ目確保
bass:   1  -  1  - | 5. -  5. - | b6.-  b6.- | 5. -  5. -
(層: これに perc と 上物arp を足し引きして緊張度可変)
```

### サンプル6: RIFF-DR-DRN ドローン＋装飾（drone, Eフリジアン風, 80BPM, 4小節相当を2小節に圧縮表記）
1音保続＋刺繍/経過の装飾。哀愁/緊張の下地。コードは上で自由に動かせる。
```
装飾:   .  .  b2 1 | .  .  .  b2| 1  .  .  b7.| .  .  1  .    ← 主音周りの刺繍(半音b2が緊張)
drone:  1  -  -  - | 1  -  -  - | 1  -  -  -  | 1  -  -  -    ← 保続ドローン(切らさない)
```

---

## 7. 設計含意（ツールへの落とし込み）

- **型辞書(5.1)をネタ辞書として保持**。生成入力は §5.1 のパラメータ枠。frame は key+mode 宣言（既存方針と整合）。
- **和声依存度(indep/follow/drone/hybrid)を第一級パラメータに**。これがリフ生成の分岐の主軸。§5.2-3 で自動判定も可。
- **catchiness はピッチだけで測れない**。リズム型/音色/ゲート/充填率を生成・評価の変数に含める（理論スコアだけで質を測らない＝既知の天井）。
- **共存(§4)は可変ノブ**。定量の定石はエビデンス薄なので、初期値＋耳較正。メロ密度→リフ充填率の逆相関を既定に。
- **候補を複数（seed/輪郭/充填率違い）**。単一解を出さない（思想＝機械は候補まで）。
- **ループ適性(§5.3)はゲームBGM型で必須チェック**。継ぎ目・層足し引き・microvariation枠。
- 未解決/次の調査候補: (a) メロ×リフ共存の定量最適（査読エビデンス不足）、(b) 型別 catchiness の実測、
  (c) hybrid 部分追従の「どの音を寄せるか」自動選択の閾値較正。

---

## 出典（URL）

構造/pedal point/ペンタ:
- Premier Guitar「The Art of Repetition: Pedal Points and Ostinatos」 https://www.premierguitar.com/lessons/the-art-of-repetition-a-guide-to-pedal-points-and-ostinatos
- fretjam「Guitar Pedal Point」 https://www.fretjam.com/pedal-point.html
- Music Theory Academy「Pedal Point」 https://www.musictheoryacademy.com/understanding-music/pedal-point/
- Guitar Music Theory (Desi Serna)「Major/Minor Pentatonic」 https://www.guitarmusictheory.com/the-difference-between-major-and-minor-pentatonic-scales-patterns-roots/

リフ・スキーム類型 / 移調追従 vs 維持:
- Easley, MTO 21.1「Riff Schemes, Form, and the Genre of Early American Hardcore Punk」 https://mtosmt.org/issues/mto.15.21.1/mto.15.21.1.easley.html
- Everett, MTO 10.4「Rock's Tonal Systems」 https://mtosmt.org/retrofit/mto.04.10.4/mto.04.10.4.w_everett.php
- Spicer, MTO 23.2「Fragile, Emergent, and Absent Tonics in Pop and Rock Songs」 https://mtosmt.org/issues/mto.17.23.2/mto.17.23.2.spicer.html
- MusicRadar「Play guitar pedal tone riffs」 https://www.musicradar.com/how-to/play-guitar-pedal-tone-riffs
- GuitarPlayer「Rock riffs are not mostly minor」 https://www.guitarplayer.com/lessons/if-you-think-the-vast-majority-of-rock-riffs-are-in-minor-keys-then-think-again

catchiness / hook / riff:
- 査読レビュー「The perceived catchiness of music affects the experience of groove」PMC11095763 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11095763/
- 査読「Exploring differences between groove and catchiness」PMC12521210 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12521210/
- School of Composition「Hooks and Riffs」 https://www.schoolofcomposition.com/hooks-and-riffs-in-music/
- Wikipedia「Hook (music)」 https://en.wikipedia.org/wiki/Hook_(music)

シンセ/アルペジオ/EDM:
- EDMProd「Arpeggiators: Secret Tricks」 https://www.edmprod.com/arpeggiators/
- Sound on Sound「Making The Most Of Arpeggiators」 https://www.soundonsound.com/techniques/making-most-arpeggiators
- MusicRadar「How to produce synth arpeggiator parts」 https://www.musicradar.com/how-to/synth-arpeggiators
- ModeAudio「The Joy Of Arps: Synthwave Score」 https://modeaudio.com/magazine/the-joy-of-arps-creating-a-synthwave-score

ゲームBGM/オスティナート:
- pillowmath「Video Game Music: Ostinato and Repetition」 https://pillowmath.github.io/musings/ostinato-repetition.html
- Musicians Institute「How to Compose Video Game Music」 https://www.mi.edu/in-the-know/composition-tips-and-software-for-creating-video-game-music/
- AudioPlugin.Deals「Music Composition for Video Games: Battle Music」 https://audioplugin.deals/blog/episode-2-music-composition-for-video-games-intro-to-battle-music/
- nesdev「Games that simulated chords with arpeggios」 https://forums.nesdev.org/viewtopic.php?t=11024

メロ共存/カウンターメロディ/call&response:
- Wikipedia「Call and response (music)」 https://en.wikipedia.org/wiki/Call_and_response_(music)
- Soundfly Flypaper「Call and Response Melodies With Yourself」 https://flypaper.soundfly.com/play/how-to-write-call-and-response-melodies-with-yourself/
- Toshi Clinch「Melody & Countermelody」 https://www.toshiclinchproductions.com/melody-countermelody
- VI-CONTROL「Not stifle the main melody in orchestration」 https://vi-control.net/community/threads/how-can-we-not-stifle-the-main-melody-in-an-orchestration.138103/

ボカロ様式（背景）:
- Vocaloid Wiki「DECO*27」 https://vocaloid.fandom.com/wiki/DECO*27
