# ピアノ／鍵盤系コード楽器のコンピング（伴奏）語彙 型辞書

- 作成: 2026-07-22
- 種別: research（外部調査＋実務語彙の型辞書化＋仕様化）
- 任務: 鍵盤系コード楽器（ピアノ／エレピ／パッド）の**「音符の置き方（パターン・ボイシング）」**の語彙をゼロから立ち上げる。度数×リズムの型辞書として、`chord_pattern` / `genComping` に乗せられる形にする。
- 対象思想: 「機械は候補まで・仕上げは人間」。進行は度数で扱う。
- **スコープ限定（重要）**: タイミングの人間味（swing/humanize＝micro-timing）は既存の feel 層 `applyFeel` の担当。本書は**どの拍に・どの音を置くか**（マクロなグリッド配置とボイシング）に集中する。両者の住み分けは §5 で明記。
- **重複回避**: テンション／ルートレス／US／分数コードは `2026-07-14-citypop-extended-voicings.md`、内声クリシェ／ペダルは `2026-07-14-cliche-pedal-lines.md` で既出＝本書では**参照のみで再定義しない**。本書の新規性は「伴奏リズム型 × 左右手分業 × 音色別奏法」。

---

## 0. 記法（本書内の約束）

### 0-1. 16分グリッドのテキスト譜
4/4・1小節＝16ステップ。ステップと拍の対応（`e & a` はドラム式の16分カウント）:

```
step#   1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16
拍       1  e  &  a  2  e  &  a  3  e  &  a  4  e  &  a
```

- **拍頭（オンビート）**= step 1/5/9/13（＝拍 1・2・3・4）
- **8分裏（&）**= step 3/7/11/15（＝1.5・2.5・3.5・4.5拍）
- 「2.5拍／4.5拍の前借り（アンティシペーション）」＝ step 7 / step 15。

各型は2段で書く:
- `LH:`（左手＝ベース／土台）
- `RH:`（右手＝和音）

記号:
- `R` `5` `3` `7` `10` = そのコードの度数（`10`=3rdの1oct上＝10度）。ベース側は主にコードルート（R）と5度。
- `■` = 右手で和音を1つ打つ（＝その step で全声部アタック）。`□` = 前の音を保持（タイ／サステイン）。`·` = 休符。
- 和音の中身（ボイシング）は各型のキャプションで指定（例「RH=クローズ3声 [3,5,R(oct)]」）。度数の縦積みは低→高。

### 0-2. コード度数の約束
- コード進行の度数（I, IIm, V7…）は既出2doc準拠。本書は**1コード内の「どう置くか」**が主眼なので、例は基本 1コード＝1〜2小節持続を仮定して書く（進行が速い場合は型を圧縮）。

---

## 1. 伴奏リズム型 辞書（ジャンル×テンポ帯 × 左右手）

10〜15型。各型は「LH（土台）× RH（和音の置きリズム）」の組。**度数×リズムの一般定石（scènes à faire）**として記述＝特定曲のリテラル引用はしない。[Cooper][RagNet][Jonny][piano-ology]

### 型1. バラード白玉（ペダル・トーン持続）— ballad-block
最も素直。LHルート全音符、RH和音を拍頭に置いて伸ばす。静かなAメロ／イントロ。テンポ 60–85。
```
LH:  R  ·  ·  ·  □  ·  ·  ·  □  ·  ·  ·  □  ·  ·  ·   (R を全音符保持)
RH:  ■  □  □  □  ■  □  □  □  ■  □  □  □  ■  □  □  □   (各拍頭で和音・伸ばす)
```
- RH=クローズ3〜4声（例 [R,3,5] or [3,5,R(oct)]）。サステイン多め。[Cooper Ballad][heartandharmony]

### 型2. バラード8分アルペジオ（分散和音）— ballad-arp8
「しっとり系はアルペジオが最適解」。LHルート持続、RHでコード音を8分で下から上へ分散。テンポ 60–90。[RagNet][onngaku]
```
LH:  R  ·  ·  ·  ·  ·  ·  ·  □  ·  ·  ·  ·  ·  ·  ·   (小節頭 R、半分で5度に替える版も)
RH:  R  ·  5  ·  10 ·  5  ·  R  ·  5  ·  10 ·  5  ·   (1-5-10-5 の分散を反復)
```
- 分散の型は `1-5-10-5`（王道）／`1-5-10-高R-10-5` 等。**右手の最低音は3rd以上を確保**（低域の濁り回避・§2）。

### 型3. ミッドバラード16分うねり（ロール／R&B）— ballad-arp16
16分の連続分散でうねりを作る。R&B／ソウル系バラード。LHは8分刻みのオクターブや持続。テンポ 65–95。[Cooper R&B]
```
LH:  R  ·  ·  ·  5  ·  ·  ·  R  ·  ·  ·  5  ·  ·  ·
RH:  R  5  10 高5 R  5  10 高5 R  5  10 高5 R  5  10 高5  (16分の途切れない分散)
```
- 「rolling chords」＝右手を絶えず動かす。テンションを混ぜやすい（9th を分散に差す）。

### 型4. ロック8ビート（オクターブ土台＋8分刻み）— rock8
LH=ルートのオクターブを刻む／伸ばす、RH=和音を8分でリズミックに刻む。テンポ 90–140。[Cooper Rock][piano-ology]
```
LH:  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·   (オクターブ R を8分 or 拍頭)
RH:  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·   (8分で和音を刻む・やや短め)
```
- RH=パワー寄り3声。強拍（1/3拍）を張り、裏を軽く＝ビート感。

### 型5. ロック白玉＋アクセント（サビの厚み）— rock-sustain
サビで和音を伸ばし土台の厚みを作る。LHオクターブ、RH白玉＋要所で打ち直し。テンポ 90–140。
```
LH:  R  ·  ·  ·  □  ·  ·  ·  5  ·  ·  ·  □  ·  ·  ·
RH:  ■  □  □  □  □  □  □  □  ■  □  □  □  □  □  □  □   (半小節ごとに打ち直し・伸ばす)
```

### 型6. シティポップ・エレピコンピング（裏食いシンコペ）— citypop-comp
エレピの十八番。**強拍アンカー＋2.5/4.5拍の前借り**で跳ねる。ルートレス色音は既出doc参照。テンポ 85–115。[Jonny Pop][ep-forum]
```
LH:  R  ·  ·  ·  ·  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·   (R 保持・時々5度へ)
RH:  ■  □  ·  ·  ·  ·  ■  □  ·  ·  ■  □  ·  ·  ■  ·   (拍1＋2.5拍前借り＋3.5拍＋4.5拍)
```
- 「短い和音と長い和音を混ぜる／オン拍とオフ拍を混ぜる」＝コンピングの単調化回避の鉄則。[freejazzlessons][jazzpianoblog]

### 型7. シティポップ・ハーフタイム16分（カッティング的）— citypop-16cut
ギターのカッティングを鍵盤で。16分の隙間に短い和音を差す、ファンク／AOR。テンポ 90–110。
```
LH:  R  ·  ·  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·  ·  ·
RH:  ■  ·  ■  ·  ·  ■  ·  ■  ·  ■  ·  ·  ■  ·  ■  ·   (16分の抜き差し・全部staccato)
```
- 全音符ではなく**歯切れ（staccato）**が命。drop2など開いた4声が合う（既出doc §4-2）。

### 型8. 4つ打ちダンス／EDM オフビートスタブ — dance-offbeat
四つ打ちキックの隙間を突く。**8分裏（&）に和音スタブ**＝ハウス／EDMの定番。テンポ 118–130。[alloutemo][Cooper EDM]
```
LH:  R  ·  ·  ·  R  ·  ·  ·  R  ·  ·  ·  R  ·  ·  ·   (拍頭オクターブ＝キックと同期)
RH:  ·  ·  ■  ·  ·  ·  ■  ·  ·  ·  ■  ·  ·  ·  ■  ·   (各拍の裏＝&＝step3/7/11/15 を短く突く)
```
- staccato必須。ステレオ広め・明るい音色。「オフビートを積極的にアクセント」。[jazzpianoblog]

### 型9. ハウス・ピアノスタブ（アンティシペーション和音）— house-anticip
サビ／ドロップで前借り和音の連打。90年代ハウスピアノ。テンポ 120–128。
```
LH:  R  ·  ·  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·  ·  ·
RH:  ■  ·  ·  ·  ·  ·  ■  ·  ■  ·  ·  ·  ·  ·  ■  ·   (拍1・2.5前借り・拍3・4.5前借り)
```

### 型10. アニソン／ボカロ Aメロ（8分刻み＋拍頭アンカー）— anison-verse
疾走J-POP／アニソンのAメロ。LHオクターブ8分、RH和音を8分で軽く刻む（4つ打ちよりピアノ寄り）。テンポ 130–175。
```
LH:  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·  R  ·   (8分オクターブ＝推進)
RH:  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·  ■  ·
```

### 型11. アニソン／ボカロ サビ（16分密＋白玉対比）— anison-chorus
サビは密度を上げる。RHを16分アルペジオ or 刻みで埋め、パッド／ストリングスが白玉で下支え（＝密と白玉の対比）。テンポ 130–180。
```
LH:  R  ·  ·  ·  5  ·  ·  ·  R  ·  ·  ·  5  ·  ·  ·
RH:  R  5 10 高5 R  5 10 高5 R  5 10 高5 R  5 10 高5   (16分アルペジオで埋める)
```
- 別トラックのパッドが白玉で面を作る（型14）＝「動＝ピアノ／面＝パッド」の対比。

### 型12. ゴスペル／ソウル ストライド（boom-chuck）— gospel-stride
低音（R）→和音（RH）を交互に跳ねる。ゴスペル／古いポップ。テンポ 90–130。[Cooper Gospel][dummies]
```
LH:  R  ·  ·  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·  ·  ·   (拍1でR、拍3で5＝跳躍)
RH:  ·  ·  ·  ·  ■  ·  ·  ·  ·  ·  ·  ·  ■  ·  ·  ·   (拍2・拍4で和音＝裏を埋める)
```
- LH（強拍・低）とRH（弱拍・中）が交互＝「ズン・チャッ」。カントリー／フォークも同型（boom-chuck）。[Cooper Country][tpsmts]

### 型13. スイング・ジャズ コンピング（チャールストン）— jazz-charleston
最小のジャズ和音置き。**拍1＋2.5拍の2打（チャールストン）**が原型。テンポ自由。[piano-ology][freejazzlessons]
```
LH:  (シェル or ベースは別・§2)
RH:  ■  ·  ·  ·  ·  ·  ■  ·  ·  ·  ·  ·  ·  ·  ·  ·   (拍1・2.5拍＝チャールストン)
```
- 逆チャールストン＝「2.5拍・拍3」。毎小節ずらして単調を避ける。ルートレス／シェルは既出doc §4-1。

**型の早見（テンポ×密度）**

| 型ID | ジャンル/場面 | LH土台 | RH置き | 密度 | テンポ帯 |
|---|---|---|---|---|---|
| ballad-block | バラードAメロ | R白玉 | 拍頭白玉 | 疎 | 60–85 |
| ballad-arp8 | バラード全般 | R持続 | 8分分散 | 中 | 60–90 |
| ballad-arp16 | R&B/ソウルバラ | 8分R/5 | 16分分散 | 密 | 65–95 |
| rock8 | ロックAメロ/サビ | oct 8分 | 8分刻み | 中 | 90–140 |
| rock-sustain | ロックサビ | oct | 白玉+打直し | 中 | 90–140 |
| citypop-comp | シティポップ | R持続 | 裏食いシンコペ | 中 | 85–115 |
| citypop-16cut | AOR/ファンク | R/5 | 16分カッティング | 中 | 90–110 |
| dance-offbeat | 4つ打ち/EDM | oct 拍頭 | 裏スタブ | 疎 | 118–130 |
| house-anticip | ハウスサビ | R/5 | 前借り連打 | 中 | 120–128 |
| anison-verse | アニソンAメロ | oct 8分 | 8分刻み | 中 | 130–175 |
| anison-chorus | アニソンサビ | R/5 8分 | 16分密 | 密 | 130–180 |
| gospel-stride | ゴスペル/カントリー | R↔5跳躍 | 裏で和音 | 中 | 90–130 |
| jazz-charleston | ジャズ | シェル別 | チャールストン | 疎 | 自由 |

---

## 2. 左手・右手の分業則（音域配置・濁り回避）

### 2-1. 音域の役割分担（レジスタ）
- **左手＝土台**：おおむね **C2–C3**（ベース〜低中域）。ルート／5度／オクターブ。
- **右手＝和音**：おおむね **C4–C5**（中高域）。3声〜4声のボイシング。[Jonny Guide][robin-hoffmann]
- 両手が **C3〜C4（中央ド周辺）** で交差する帯は「濁りやすい特異点」＝密な和音を置かない。

### 2-2. ロー・インターバル・リミット（low interval limit＝低域で狭い音程を作らない）
低い音域ほど倍音が濁るため、**その音程を鳴らしてよい下限**が決まっている。厳密な規則ではなく濁り回避のガイド。[robin-hoffmann][funnelljazz]
- 目安（下側の音の位置／概略）:
  - **短2度**: だいたい E3 より上でないと濁る
  - **短3度**: C3 付近が下限
  - **長3度**: G2〜B♭2 付近が下限
  - **完全4度**: F2 付近
  - **完全5度**: B♭1 付近（5度・8度は低くても比較的濁らない＝ベースが5度/8度中心の理由）
- 実務結論: **低域（C3以下）では 3度・7度の近接（＝コードの色）を置かず、5度・8度・オクターブに留める**。色音（3/7/テンション）は C3 以上の右手側へ。

### 2-3. ルート＋10度（R10）の定石
左手でルートと3rd（の1oct上＝10度）を掴むと、オクターブより**豊かで濁らない**土台になる（Bud Powell 系）。[learncolorpiano][pianogroove]
- 例（C）: 左手 `C2 + E3`（＝R と 10th）。3rd をオクターブ上げることで §2-2 の「低域で長3度は濁る」を回避しつつ和音の明暗を土台に持てる。
- 届かない場合は分散（R→10th とロールで弾く）＝ラグ／ゴスペルの手癖。
- 機械実装上は「LHボイシング＝ oct(R+R) / R10(R+10th) / R5(R+5th) / single(R)」の選択肢に落ちる。

### 2-4. 分業の一般定石（まとめ）
1. **ルートは左手（or 別ベーストラック）に任せ、右手はルートを重複させない**（ルートレスの動機・既出doc §4-1）。
2. **右手の最低音は3rd以上**（低域の濁り回避）。分散和音でも右手最低音を C3 未満に落とさない。
3. **下は広く・上は狭く**（倍音列に倣うスペーシング。既出doc §4-4 のバリデータと共有）。
4. **メロディ音域（歌）と右手最上声がぶつかる帯は右手を下げる／間引く**。

---

## 3. リズム置きの定石（どの拍に和音を置くか・セクション役割）

### 3-1. アンカーと前借り
- **強拍アンカー**：拍1（と拍3）に必ず和音の芯を置くと、どんなにシンコペっても構造が崩れない。[jazzpianoblog]
- **アンティシペーション（前借り）**：本来 拍3 に来る和音を **2.5拍（step7）** に、拍1（次小節）を **4.5拍（step15）** に食わせる＝ポップスで最頻のシンコペ。「striking just before the beat＝駆動感・緊張」。[oboe][unison]
- **チャールストン**：拍1＋2.5拍の2点（型13）。ジャズ・ファンクの最小コンピング原子。[piano-ology]

### 3-2. 長短の対比（単調化回避）
- 「**全部長い or 全部短いは退屈**。長い和音と短い和音、オン拍とオフ拍を混ぜよ」＝コンピングの第一原則。[freejazzlessons][jazzpianoblog]
- 具体: 白玉で伸ばした後に、次コード直前で短いスタブを差す／2拍白玉＋2拍刻み、など。

### 3-3. セクション役割（verse疎／chorus密）
- **verse＝疎**（要素を抜く）／**chorus＝密**（埋める）が基本。ただし逆張り（verse刻み→chorus白玉で開放）も有効。[ledgernote][soundfly]
- ピアノ単体の対比手段: verse=白玉/アルペジオ疎 → chorus=8分/16分刻み＋オクターブ土台。
- 段階ビルド: 「1番Aメロ＝ピアノのみ疎 → 1番サビ＝ドラム/ベース入り密 → 2番＝パッド追加」。伴奏型は**セクションタグ**に紐づけて切替えるのが定石。

### 3-4. ハーモニックリズム（和音の変わる速さ）との整合
- 和音が速く動く（1小節2コード以上）区間では、刻み型は**変わり目にアタックを合わせる**（＝各コード start にヒット）。既存 `genSectionInst` の pad ロジック（コード変わり目＝アタック）と同じ発想。

---

## 4. 音色 × 奏法の対応（ピアノ／エレピ／パッドの差分）

同じコード列でも音色で「置き方」が変わる。

| 音色 | 奏法の芯 | 推奨型 | ボイシング/レジスタ | 注意 |
|---|---|---|---|---|
| **アコピ** | 打鍵の減衰を活かす。分散・刻み・白玉すべて可 | ballad-*, rock*, gospel-stride | 両手フル（LH C2-C3 / RH C4-C5） | ペダルで繋ぐ／低域濁り注意 |
| **エレピ（Rhodes/Wurli）** | **中域コンピング＋シンコペ**が本領。高域がよく鳴るので厚く積まない | citypop-comp, jazz-charleston, house | **右手を軽く・小さめボイシング**。ルートレス色音向き | 高midがミックスを埋める＝**声部を間引く**。サステイン多用可 [ep-forum][bluedogmusic] |
| **パッド／ストリングス** | **サステイン＝面**。刻まない。ハーモニックリズムでだけ動く | pad（白玉・型1系の伸ばし） | close 3-4声、中高域。アタック緩 | 刻み系は不自然。既存 `genSectionInst` role=pad が該当 |
| **ブラス/シンセスタブ** | **短く突く**。裏拍のキメ | dance-offbeat, stab | 中高域、staccato | 既存 role=stab（裏の&を突く）が該当 |

要点:
- **エレピ vs アコピ**: 同じコンピングでもエレピは**より少ない音数・より軽いタッチ**（高域が鳴る分ミックスで濁りやすい）。「lighten up on the left hand・smaller voicings」。[bluedogmusic]
- **エレピ vs パッド**: エレピ＝リリース感のある**打鍵＋減衰**（刻める）／パッド＝**アタックもリリースも緩い持続**（刻めない・面のみ）。同じ進行を「動＝エレピ／面＝パッド」で重ねるのがシティポップ／アニソンの厚みの作り方。
- 実装対応: 音色（program）に応じて**既定パターン型を切替える**のが自然（EP→comp、Strings→pad、Brass→stab）。

---

## 5. GM MIDI で「それっぽく」鳴らす制約（feel層との住み分け）

GM SF2 再生で機械生成をそれっぽく聞かせる要点。**タイミングの揺れは feel 層 `applyFeel` 担当なので本書＝置き方は「配置とベロシティ設計」に限定**。

### 5-1. ベロシティ層（本書の担当＝置き方の一部）
- **左手強め・右手軽め**が基本バランス（土台を支え、和音は被せ物）。ただしメロディが別トラックなら和音全体を控えめに（伴奏は脇役）。[unison][hyperbits]
- **和音内のベロシティ差**: 4声なら1声だけ強く（例トップ or バス＝95前後）、他を弱く（75–85）＝「和音が呼吸する」。全声部同値だと機械的。[unison][beatsden]
- **アクセント設計**: 強拍（拍1/3）や backbeat（2/4）を+10〜12。既存の3値語彙 `CHORD_ACCENT=112 / 普通=100 / CHORD_SOFT=64`（`music.ts`）がちょうどこの層＝**型ごとにどの step を accent/soft にするかを定義できる**。
- これは**タイミングでなく強弱**なので feel 層と衝突しない＝本書（置き方）の管轄。

### 5-2. 和音のロール（アルペジエート）は入れるべきか＝**feel層に寄せる**
- 実機コツ: 和音を完全に縦一列でなく**下から10–25ms/音ずらす**と「手を転がした」実在感が出る。[unison][hyperbits]
- **判断**: これは micro-timing＝**feel 層 `applyFeel` の管轄**。本書の型辞書（step配置）には**入れない**。型は「どの step に和音を置くか」まで＝縦は揃えて出し、ロール/揺れは feel が後段で付ける。
  - 住み分けの原則: **本書＝マクロ配置（16分グリッド上のstep）＋ベロシティ設計**／**feel層＝サブグリッドのズレ（swing/humanize/chord roll）**。二重にロールを入れない。
- 例外的に「ロール前提の奏法（ゴスペルの R10 分散、ハープ的グリス）」は**マクロに別stepで書く**（＝型の一部）。連続16分アルペジオ（型3/11）はこれ。微小ロールとは区別。

### 5-3. GM 特有の濁り回避
- GM ピアノ／ストリングスは低域が濁りやすい＝ §2-2 の low interval limit を**より保守的に**（右手最低音を C3〜C4 に）。
- パッド系（Strings/Pad）は**アタックが遅い**＝スタブ（16分1個）を割り当てると出音が痩せる。パッドは白玉限定（§4）。

---

## 6. 設計含意（Otomemo への乗せ方）

### 6-1. 現状の起点（実コードで確認済）
- `chord_pattern` の `ChordPatternContent`＝`{ mode:"strum"|"arp", voicing, steps, hits[], program }`。`hits` が既に **16分グリッドの step×dur** ＝**本書の型辞書がそのまま `hits` パターンに落ちる**（`music.ts:602`）。
- `voicing`＝`{ tones, openClose, octave, top?, powerChord?, arpDir?, arpOctaves?, arpReset? }`。実音化 `voiceToTop` は top狙い音で最上声を決め下へ密に積む（`music.ts:635`）。**LHは無い＝右手和音のみ**。
- `genChordPattern`（api `generate.ts:927`）は mood/tempo で per（小節頭/8分/拍頭）を選ぶだけ＝**リズム型は3段階のみ・左手なし・ジャンル無知**。
- `genSectionInst`（`generate.ts:1358`）に pad（変わり目アタック）/stab（裏の&）が既にある＝**本書 §4 の pad/stab と一致**＝拡張の足場。

### 6-2. 乗せ方の方針（型辞書＝データで持つ）
1. **リズム型はデータ（型辞書）で持つ**のが正解。`hits`（step×dur）＋step別 accent/soft の配列を**型ID→パターン**の辞書に。§1の表がそのまま JSON 化できる（`{ id, hits:[{step,dur,vel}], genre, tempoRange, mode }`）。ジャンル×テンポで型を引く純ロジック＝外部モデル不要。既出2docの「辞書＋バリデータ」路線と同型。
2. **左手（ベース土台）フィールドの追加**が最大の欠損。現状 voicing は右手のみ。案:
   - `bassVoicing?: "single"|"oct"|"R5"|"R10"|"none"` と `bassHits?`（LH独自リズム）を content に足す。**既定は現状維持（bassなし＝別ベーストラック任せ）＝OFFでbit一致**。
   - あるいは chord_pattern はRHのまま据え置き、LHは既存 `bass` kind の生成と結線（責務分離）。**どちらが良いかは要判断**（single-neta で完結させたいか、bassトラック前提か）。
3. **音色→既定型のマッピング**: `program` から既定パターン型を選ぶ（EP→citypop-comp、Strings→pad、Brass→stab、Piano→genre/tempoで選択）。§4の表を関数化。
4. **セクション役割との結線**: verse=疎型／chorus=密型を section タグで自動選択（§3-3）。既存の section 結線に乗る。

### 6-3. 新ノブ案（既定OFF＝bit一致の原則を厳守）
現 `genChordPattern` を壊さず、opts で段階拡張（`genDrums` の style/fill と同じ「opts無し＝従来経路bit一致」パターン）:
- `pattern?: 型ID`（§1辞書から選択。未指定＝従来の per 3段階＝bit一致）
- `bass?: "none"|"single"|"oct"|"R10"|"R5"`（未指定/none＝現状の右手のみ＝bit一致）
- `syncopation?: 0..1`（0＝拍頭のみ／上げると前借り step7/15 を有効化。既定0＝bit一致）
- `sectionRole?: "verse"|"chorus"`（密度切替。未指定＝従来）
- `accentMap?`（step別 accent/soft。未指定＝全声部 vel省略＝現 vel??100 でbit一致）

### 6-4. 声部進行（voice leading）— 別レイヤの改善余地
- 本書は「リズム置き」中心だが、`genComping`/`voiceToTop` は**コードが変わっても top狙い音の最寄りで積むだけ＝共通音保持/最小移動の最適化は未**（backlog §「テンション込みvoicing」で既出の残タスク）。
- リズム型辞書とは独立に、**進行内でボイシングを最小移動させる後処理**を足せる（既出citypop doc §4-4 の A↔B交互・共通音保持）。**これは本書の管轄外＝別タスク**として切る。

### 6-5. feel層との契約（再掲・重要）
- 本書の型辞書＝**マクロ配置（step）＋ベロシティ設計**まで。**chord roll・swing・micro-timing は一切入れない**（`applyFeel` が後段で付ける）。二重適用を避ける。型辞書のvelは「意図した強弱」、feelのvelランダム化は「人間味」＝層が違う。

### 6-6. 著作権
- 型は一般定石（度数×リズムの scènes à faire）のみ。特定曲のリテラルな伴奏フィギュアは保存しない。ジャンル語彙・統計のみ採用（既出2doc・CLAUDE.md準拠）。

---

## 出典（URL）

- 10 Piano Rhythm Patterns for Popular Genres (Cooper Piano): https://cooperpiano.com/10-piano-rhythm-patterns-for-popular-genres/
- Great Left-Hand Accompaniment Patterns (dummies): https://www.dummies.com/article/academics-the-arts/music/instruments/piano/great-left-hand-accompaniment-patterns-for-the-piano-or-keyboard-153052/
- Pop & Contemporary Piano Accompaniment Patterns (Piano With Jonny): https://pianowithjonny.com/courses/pop-contemporary-piano-accompaniment-patterns-1/
- Jazz Piano Comping Guide – Beginner to Pro (Piano With Jonny): https://pianowithjonny.com/piano-lessons/jazz-piano-comping-guide-beginner-to-pro/
- Jazz Piano Chord Voicings – The Complete Guide (Piano With Jonny): https://pianowithjonny.com/piano-lessons/jazz-piano-chord-voicings-the-complete-guide/
- Pop Ballad Accompaniment for Piano and Keyboard (keyboardimprov, PDF): http://keyboardimprov.com/wp-content/uploads/2016/01/PopBalladAccompaniment_Complete_Book.pdf
- Simple Accompaniment Patterns on Piano (Heart and Harmony): https://www.heartandharmony.com/simple-accompaniment-patterns-on-piano/
- Accompaniment Patterns You Can Use on Piano and Guitar (Tamara's Piano Studio): https://www.tpsmts.com/accompaniment-patterns-you-can-use-on-piano-and-guitar/
- Take the A Train: Comping Rhythm Patterns (Piano-ology): https://piano-ology.com/jazz-piano-lessons/take-the-a-train-comping-rhythm-patterns/
- Major 1-4 Comping Pattern #4 (Piano-ology): https://piano-ology.com/pop-rock-piano-lessons/major-1-4-chord-progression-comping-pattern-4/
- 2 Essential Syncopation Tricks (FreeJazzLessons): https://www.freejazzlessons.com/syncopation/
- How to comp chords (Jazz Piano Blog): https://jazzpianoblog.com/how-to-comp-chords-on-the-piano/
- Syncopation Techniques – Mastering Pop Piano Rhythms (oboe.com): https://oboe.com/learn/mastering-pop-piano-rhythms-9i8b7f/syncopation-techniques-1
- Low Interval Limits (Robin Hoffmann): https://www.robin-hoffmann.com/dfsb/low-interval-limits/
- Low Interval Limits (funnelljazz, PDF): https://funnelljazz.eu/wp-content/uploads/2020/12/Low-Interval-Limits.pdf
- Left Hand Patterns – How to Use a 10th Voicing (LearnColorPiano): https://www.learncolorpiano.com/left-hand-patterns-how-to-use-a-10th-voicing/
- How To Play 10th Intervals For Jazz Piano (PianoGroove): https://www.pianogroove.com/blues-piano-lessons/how-to-play-10th-intervals/
- The Rhodes Less Traveled – Scott Healy (Blue Dog Music / Keyboard Mag): https://www.bluedogmusic.com/rhodes-less-traveled-4023
- Rhodes Voicing Question (The Electric Piano Forum): https://ep-forum.com/smf/index.php?topic=10607.0
- Four on the floor (Wikipedia): https://en.wikipedia.org/wiki/Four_on_the_floor_(music)
- Four on the Floor Beat guide (Alloutemo): https://alloutemo.co.uk/four-on-the-floor-beat/
- How to Humanize MIDI Like a True Professional (Unison Audio): https://unison.audio/how-to-humanize-midi/
- Layering Pianos: How to Make MIDI Piano Sound Real (Hyperbits): https://hyperbits.com/blog/layering-pianos/
- How to humanize your MIDI chords in 3 easy steps (Beats Den): https://beatsden.com/how-to-huminize-your-chords-with-3-easy-steps/
- High-Level Song Arrangement Tips (LedgerNote): https://ledgernote.com/columns/music-theory/song-arrangement-tips/
- Scaffolding: Structure to Map Energy Flow (Soundfly/Flypaper): https://flypaper.soundfly.com/write/scaffolding-song-structure/
- ピアノ伴奏パターン（RAG Music）: https://www.ragnet.co.jp/piano-accompaniment-pattern
- ピアノでコード伴奏パターンを増やす9つの型（Steinway Center Takasaki）: https://www.steinwaycentertakasaki.jp/piano-chord-accompaniment-patterns/
- ピアノの伴奏のアルペジオパターンを覚えよう（onngaku-music）: https://onngaku-music.net/archives/4045
- ポップスのピアノ伴奏を作ろう（Hanaポップスピアノ）: https://pops-piano.cupram.com/
