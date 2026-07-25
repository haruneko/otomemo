# 6/8 無国籍民族調 伴奏語彙 型辞書（world68）

- 作成: 2026-07-25 / 担当: T5統合（研究役T1-T4のfindings＝`2026-07-25-68-world-research-findings.md` の清書）
- 計画・受け入れ基準: `2026-07-25-68-world-accompaniment-research-plan.md`（§2 スキーマ制約・§5 受け入れ基準・§6 著作権チェックリスト）
- 任務: 「6/8 無国籍民族調」のコード刻み／ベース／打楽器の伴奏型を、**度数×12セルのテキスト譜**（既存語彙4docと同体裁）で辞書化する。**本docは語彙のみ＝実装はしない**（待ち工事は §10）。
- **無国籍の定義（T4・D1）**: 「どの実在文化も名乗らない」＝汎用建材（旋法・ドローン+開放5度・6/8リルト・循環オスティナート・打楽器の層抽象）だけで民族調の空気を作り、署名記号（記名的装飾・特定伝統固有の音階/音質・特定伝承曲）を捨てる。「薄く混ぜて誤魔化す」ではない。この線引きは著作権線（リテラル転写禁止）と倫理線を同時に満たす。
- **著作権**: 全採録が {一般定石／骨格抽象／統計／規格} のみ・**採譜0**（証明表＝§12）。特定曲名・特定伝承曲名は型ID・譜・キャプションに一切出さない（「ジグ的」「タランテラ的」等の様式名＝リズム族の一般名は可）。
- **オーナー確認の仮置き**（計画§9・回答が来たら本docを寄せる）: ②ジャンル語＝`genre:world68`・日本語ラベル「民族調(6/8)」／③空気の重心＝エオリアン/ドリアン主軸＋ハーモニックマイナー（フリジアンドミナント含む）を辛味として少数／④テンポ重心＝遅い叙情系・速い舞曲系の両方に最低2型ずつ・中速リルトを最厚／⑤打楽器はGMドラムキットの代用マッピング（民族打楽器の実音色は音源側の別工事）。

---

## 0. 記法（12セル格子・本書内の約束）

### 0-1. 6/8 の 12 セルグリッド（16分基底）

6/8 は **1小節＝12セル（16分基底）**。メロ側の統一（`2026-07-10-68-grid-unify-16th.md`）と実装の `meterSteps`（6/8→stepsPerBar 12・beatStep 6）に揃える。既存ドラムdocの 6セル記法（8分基底）は**不採用**。

```
step#   1  2  3  4  5  6  7  8  9 10 11 12
8分     ①     ②     ③     ④     ⑤     ⑥
大拍    ●                 ●
```

- **大拍（付点4分）＝step 1 と 7**（6/8 は2大拍。3/4 の step 1,5,9 と区別＝「6/8らしさ」の必要条件は低音レーンが 1,7 を打つこと・§3）
- **8分＝奇数step**（1,3,5,7,9,11）。6/8 の第n八分音符 → step(2n−1)
- **16分裏＝偶数step**
- **ヘミオラ（3対2）＝step 1,5,9**（4step間隔アクセント＝12セルで正確に表現できる）
- シチリアーナ型（付点8分+16分+8分＝3+1+2）＝ step 1,4,5（後半は 7,10,11）

### 0-2. テンポの規約

**テンポは全て付点4分（＝大拍）BPM** で書く。web教則の 8分パルス表記は ÷約3 で換算済（T2）。タランテラ系の accelerando（加速）は固定BPM格子で表現できないため**運用注記**とする（格子内の型は不変＝スキーマ拡張は不要）。

### 0-3. 度数トークンとレーン記号

コード／ベース譜（piano vocab §0-1 の12セル版）:

- `R` `3` `5` `6` `8` `10` `12` `15` ＝ コード度数。`8`=ルートの1oct上、`10`=3rdの1oct上、`12`=5thの1oct上、`15`=ルートの2oct上
- `A` ＝ 次コードのルートへの接近音（半音 or 2度・上下どちらも可）
- `■` ＝ 和音を1つ打つ（全声部アタック・ボイシングはキャプション指定）／`□` ＝ 保持（タイ）／`·` ＝ 休符
- ストラムレーン `ST:` ＝ `D`=ダウンストローク（全声部）／`U`=アップストローク（上位声部中心）／`d`=パームミュート弱ストローク
- 2段表記 `LH:`（左手/低域・ドローンや親指ベース）＋`RH:`（右手/上声）。1段の場合は `AR:`（アルペジオ）または `ST:`（ストラム）

ベースの**キック絡み符号**（bass vocab §0 の 6/8 版・低太鼓Dum=step1,7 を「the one」とする）:

- `unison` ＝ 大拍(1,7)一致／`interlock` ＝ 大拍の隙間(奇数step裏)を埋める／`counter` ＝ 大拍を外して独立線を出す

打楽器レーン（レーン×12セル・GMノート番号併記）:

- `DU:` ＝ Dum（低・胴中央）… `D`=打
- `TK:` ＝ Tek/ka（高・縁）… `T`=Tek（強・縁）／`t`=tek（弱）／`k`=ka（最弱・指）
- `SH:` ＝ シェイカー/持続層 … `x`=打
- `TB:` ＝ タンバリン … `x`=打／`X`=強打（シェイク併用）
- `CL:` ＝ 手拍子 … `C`=打

### 0-4. GM 代用表（フレームドラム族の実音は出せないため代用・音源側は別工事＝仮置き⑤）

| 役割 | 第一候補 | 代用 |
|---|---|---|
| Dum（低） | ロー・フロアタム **41** | キック 36／ローコンガ 64 |
| Tek（高・縁） | サイドスティック **37** | ハイボンゴ 60／ミュートハイコンガ 62 |
| ka（最弱） | クローズドHH **42** | ハイタム 50 |
| タンバリン | **54** | — |
| シェイカー | カバサ **69** | マラカス 70 |
| 手拍子 | ハンドクラップ **39** | — |
| その他彩り | クラベス 75／コンガ 62-64／ボンゴ 60-61／トライアングル 81 | — |

出典: GM Percussion 規格（[soundprogramming.net](https://soundprogramming.net/file-formats/general-midi-drum-note-numbers/)／[computermusicresource.com](https://computermusicresource.com/GM.Percussion.KeyMap.html)・既存ドラムdoc §1 で検証済のURL）＋ Jazz-Soft GM Chart（T3）。

---

## 1. 横断前提：旋法・和声の芯（T1）

伴奏語彙の本丸は「どのコードに特性音を置くか」。**旋法色はコード側＋scale差替で注入し、メロは長短のまま**（repo実測: メロ句辞書に旋法色ほぼ無し＝♭7 0.4%等・`2026-07-14-mode-usage-stats.md`）。pop用の supermode 制約（Phrygian/Lydian除外）は world68 に**非適用**＝♭2・増2度こそ建材。

### 1-1. 旋法パレット（A1）— 各コード型の「旋法注記」の参照元

| 旋法 | 特性音 | 特性和音（コンプに置く） | 置き所／回避 | 空気 |
|---|---|---|---|---|
| エオリアン（基準） | ♭6,♭7 | ♭VI・♭VII・♭III（全長三和音） | ♭VI/♭VII三和音・**導音を足さない**・root+5ドローン | 切ない/疾走 |
| ドリアン | **♮6** | IV長・ii短・♭VIImaj7 | ♮6は**中間で**IV長／終止に置かない（IV7→♭VIImaj7 は相対長調 ii-V-I に崩れる） | おしゃれ/浮遊 |
| フリジアン | **♭2** | ♭II長（ナポリ的） | ♭II長を i の隣に／♭2は動く上声・ドローンrootへの短2度は緊張→解決 | 暗/緊張/異国 |
| ハモマイ／フリジアンドミナント | 導音♮7／♭2と3の**増2度** | V(7)・vii°／（Phr.dom）I長＋上の♭II（I–♭II交替） | 導音は**終止のみ**／Phr.dom は I長＋♭II・ベースはroot中心 | 演歌引力／中東・増2度 |
| ミクソリディアン | **♭7** | ♭VII長・v短・IV | ♭VII長コンプ・**導音を足さない**・I–♭VII–IV | おおらか/土/祭 |

- **増2度（♭2→3）が重心スイッチ**: ケルト寄り＝Dorian/Mixo/Aeolian（増2度なし）／中東・バルカン寄り＝Phr.dom/ハモマイ（増2度あり）。仮置き③＝前者主軸・後者は辛味少数。
- **旋法はシフトする**（純旋法曲は稀）＝verse=Dorian/Aeolian → chorus で別旋法へ、は許容。

### 1-2. ドローン／開放5度（A2）

root+5（3度抜き）は長短曖昧＝**同一ベッドの上で上声/scale差替だけで Aeolian/Dorian/Phrygian を切り替えられる**。ドローンは主音を強制し旋法を保持する。♭2/maj7 と root の短2度衝突は「回避」でなく**緊張→解決**として使う＝持続ドローンには混ぜず**動く上声**に置き、節目で安定構成音に着地（ペダルポイントの定石）。持続単位＝フレーズ長（4/8小節・モーダルヴァンプ）。低域の濁りは piano vocab §2 のロー・インターバル・リミットで回避。

### 1-3. 進行と和音交替速度（A3）— 全型共通の前提

- 進行型: i–♭VII／i–♭VI–♭VII／i–iv／ドリアン i–IV／ミクソ I–♭VII–IV／Phr.dom I–♭II
- **和音交替は疎・リズムが主役**。**既定＝1小節1和音（step1オンセット）／上限＝1小節2和音（step1,7）／8分単位の和音替えは作らない**。本書の全譜例はこの前提（`■`の打ち直し＝同一和音の再アタック or 大拍での和音替え）。
- 終止＝**エオリアン終止 ♭VI→♭VII→i を第一級**（自前コーパス実測で V→i を上回る・`2026-07-14-mode-usage-stats.md` §1-3／`2026-07-06-vocaloid-folk-study.md`）。
- **密度則（T4・D1）**: 民族色（非ダイアトニック・scale色）は **4小節に1〜2個**。入れすぎ＝特定文化コピー/クリシェ・入れなさすぎ＝民族調に聞こえない。基本は明暗単純進行・7th回避。

出典（T1）: flupe Modal Harmony／filmmusictheory Phrygian Dominant／Wikipedia [Phrygian dominant scale](https://en.wikipedia.org/wiki/Phrygian_dominant_scale)・[Power chord](https://en.wikipedia.org/wiki/Power_chord)・[Pedal point](https://en.wikipedia.org/wiki/Pedal_point)／HubGuitar Drones（[hubguitar.com](https://hubguitar.com/)）／Open Music Theory Modal Schemas（[viva.pressbooks.pub/openmusictheory](https://viva.pressbooks.pub/openmusictheory/)）／MTO Temperley Scalar Shift（[mtosmt.org](https://mtosmt.org/)）ほか §12。

---

## 2. グルーヴ類型×テンポ域（T2・B1/B2）— 各型の tempo 割当の根拠

| 類型 | onset/アクセント（step） | 付点4分BPM | 空気 |
|---|---|---|---|
| (i) 遅い叙情ロール | onset填め・**1強7中** | 30–60 | バラード/ゴスペル系の6/8 |
| (ii) 中速リルト（DUM-da-da） | **1強7強**＋3,5/9,11を転がす | 60–96 | フォークの揺れ（**最厚**＝仮置き④） |
| (iii) 速いジグ的駆動 | 全奇数step 1-11・**1強7中** | 100–132 | 舞曲・8分駆動 |
| (iv) 跳ね（単ジグ長短／タランテラ的） | 長短=**1,5,7,11**／全奇数+1,7強・加速は運用 | 100–132 | 跳ね/追い込み |
| (v) シチリアーナ型（3+1+2） | **1,4,5,7,10,11** | 40–60 | 田園/短調の緩 |
| (vi) ヘミオラ（3対2） | **1,5,9** | 母体に従属 | 句末/サビ前の仕掛け |
| (vii) ドローン+オスティナート | **1**（時に7） | 全域 30–132 | 最小密度層 |

**6/8らしさの必要条件（B3）**: ①低音レーン（ベース/Dum）が **step1と7** を打つ（3/4は1,5,9）。②細分は3分割感（8分=奇数step）。③層分け＝低(1,7)／高tek(3,5,9,11)／持続(シェイカー8 or 16分)／手拍子(1,7 or 1,5,9)。**ヘミオラは常用せず句末・サビ前の仕掛け**（横＝1小節丸ごと1,5,9／縦＝一部レーンだけ1,5,9・低音は1,7保持で擦れを作る）。

遅い側の錨＝既存 `six8.ballad`（付点4分50–80・`2026-07-14-drum-pattern-genre-library.md` 型16）。出典（T2）: Open Music Theory Compound Meters／Wikipedia [Jig](https://en.wikipedia.org/wiki/Jig)・[Siciliana](https://en.wikipedia.org/wiki/Siciliana)・[Tarantella](https://en.wikipedia.org/wiki/Tarantella)・[Hemiola](https://en.wikipedia.org/wiki/Hemiola)ほか §12。

---

## 3. コード刻み 型辞書（10型）

各型＝型ID／度数×12セル譜／テンポ域（付点4分BPM）／roles（intro/verse/prechorus/chorus/interlude/bridge/outro の7分類）／出典／旋法注記。ボイシングは §1 の縛り（導音を足さない・♭VI/♭VII は長三和音・7th回避基調）に従う。

### 型C1. `w68-ch-drone5`（開放5度ドローン＋上声）
- テンポ域: **30–132**（類型vii・全域） / roles: **intro/verse/bridge/outro**
- 出典: [Wikipedia – Pedal point](https://en.wikipedia.org/wiki/Pedal_point) / HubGuitar Drones（[hubguitar.com](https://hubguitar.com/)）
- 旋法注記: LH=R+5のみ（3度抜き）＝長短曖昧ベッド。旋法は上声/scale差替で決める（§1-2）。♭2・maj7 はドローンに混ぜず動く上声へ。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
LH:    R  □  □  □  □  □  □  □  □  □  □  □   (R+5 を全タイ・和音が替わっても保続)
RH:    ■  □  □  □  □  □  ■  □  □  □  □  □   (上声のみ大拍で置く・薄い2-3声)
```

### 型C2. `w68-ch-pad`（大拍パッド）
- テンポ域: **30–96**（類型i-ii） / roles: **intro/verse/outro**
- 出典: piano vocab 型1 ballad-block の6/8版（`2026-07-22-piano-comping-vocabulary.md`）/ Beta Monkey Slow 6/8（[betamonkeymusic.com](https://www.betamonkeymusic.com/)）
- 旋法注記: ♭VI/♭VII/♭III は長三和音のまま白玉に。導音を足さない。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
LH:    R  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·
RH:    ■  □  □  □  □  □  ■  □  □  □  □  □   (大拍で和音・間は伸ばす)
```

### 型C3. `w68-ch-arp6`（6音循環アルペジオ・山型）
- テンポ域: **40–96**（類型i-ii・vの緩域含む） / roles: **verse/chorus/interlude**（疎に単独=verse／ストラムの下の層=chorus。§9 の distinct 戦略）
- 出典: AcousticGuitar（[acousticguitar.com](https://acousticguitar.com/)）/ NationalGuitarAcademy（[nationalguitaracademy.com](https://www.nationalguitaracademy.com/)）＝6/8アルペジオの一般教材
- 旋法注記: 3度（10）を含む＝旋法確定はここで起きる。曖昧にしたい場面は 10→9(=2ndのoct上) や 12 に差し替え可。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
AR:    R  ·  5  ·  8  ·  10 ·  8  ·  5  ·   (R-5-8-10-8-5 の山型を8分で循環)
```

### 型C4. `w68-ch-thumb`（親指ベース＋上声ロール）
- テンポ域: **60–96**（類型ii） / roles: **verse/prechorus**
- 出典: NationalGuitarAcademy fingerpicking（[nationalguitaracademy.com](https://www.nationalguitaracademy.com/)）/ goodguitarist（[goodguitarist.com](https://goodguitarist.com/)）
- 旋法注記: 親指=R/5 で土台（曖昧）、指=上声2音。特性音は指側に。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
LH:    R  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·   (親指＝大拍)
RH:    ·  ·  8  ·  10 ·  ·  ·  8  ·  10 ·   (指＝大拍の間を転がす)
```

### 型C5. `w68-ch-strum-all`（全ダウン8分ストラム）
- テンポ域: **60–132**（類型ii-iii） / roles: **chorus/interlude**
- 出典: strumming.com（[strumming.com](https://strumming.com/)）/ Riffhard（[riffhard.com](https://riffhard.com/)）＝6/8基本ストラムの一般教材
- 旋法注記: アクセント=1,7。和音は §1-3 の進行型・全長三和音基調。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
ST:    D  ·  D  ·  D  ·  D  ·  D  ·  D  ·   (アクセント=step1,7)
```

### 型C6. `w68-ch-strum-dud`（D-U-D-D-U-D リルト）
- テンポ域: **60–96**（類型ii） / roles: **chorus/prechorus**
- 出典: goodguitarist 6/8 strumming（[goodguitarist.com](https://goodguitarist.com/)）/ strumming.com（[strumming.com](https://strumming.com/)）
- 旋法注記: 同上（C5）。アップ（U）は上位声部のみ＝リルトの軽さ。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
ST:    D  ·  U  ·  D  ·  D  ·  U  ·  D  ·   (down=1,5,7,11 / up=3,9)
```

### 型C7. `w68-ch-strum-jig`（ジグ的跳ねストラム D-DU-DU）
- テンポ域: **100–132**（類型iii-iv） / roles: **chorus/interlude**
- 出典: irish-folk-songs（[irish-folk-songs.com](https://www.irish-folk-songs.com/)）/ [Wikipedia – Jig](https://en.wikipedia.org/wiki/Jig)（リズム骨格のみ）
- 旋法注記: ケルト寄り運用＝Dorian/Mixo/Aeolian（増2度なし・§1-1）。i–♭VII／I–♭VII–IV が好相性。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
ST:    D  ·  ·  ·  D  ·  U  ·  D  ·  U  ·   (頭は長く＝step3休符・後半転がす)
```

### 型C8. `w68-ch-strum-sync`（シンコペ・ストラム）
- テンポ域: **60–96**（類型ii） / roles: **prechorus/chorus**
- 出典: strumming.com（[strumming.com](https://strumming.com/)）/ goodguitarist（[goodguitarist.com](https://goodguitarist.com/)）
- 旋法注記: 同C5。step3 を抜く＝前のめりの揺れ。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
ST:    D  ·  ·  ·  U  ·  D  ·  U  ·  D  ·   (down=1,7,11 / up=5,9 / rest=3)
```

### 型C9. `w68-ch-pm`（パームミュート薄刻み）
- テンポ域: **60–132**（類型ii-iii） / roles: **intro/verse/prechorus**
- 出典: Riffhard palm mute（[riffhard.com](https://riffhard.com/)）
- 旋法注記: ミュート主体＝和声色は最小。R+5中心のボイシングで曖昧ベッドとしても使える。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
ST:    D  ·  d  ·  d  ·  D  ·  d  ·  d  ·   (D=1,7のみ開放・d=ミュート弱)
```

### 型C10. `w68-ch-roll12`（12音フルロール・幻想）
- テンポ域: **30–60**（類型i・速いと破綻） / roles: **chorus/bridge**（遅い曲のサビの厚み・ブリッジの彩り）
- 出典: AcousticGuitar / piano vocab 型3 ballad-arp16 の6/8版（`2026-07-22-piano-comping-vocabulary.md`）
- 旋法注記: 全セル分散＝scale音を通るので旋法が最も露出する型。特性音の通過は4小節1-2個の密度則（§1-3）内で。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
AR:    R  3  5  8  10 12 15 12 10 8  5  3   (16分で途切れない山型ロール)
```

---

## 4. ベース 型辞書（8型）

各型＝型ID／度数×12セル譜／テンポ域／roles／**キック絡み符号**（unison/interlock/counter・低太鼓Dum=1,7 基準）／出典。度数は R/5/6/8 中心（3度を避ける＝旋法曖昧の維持・特性音はコード側）。

### 型B1. `w68-bs-anchor`（大拍アンカー）
- テンポ域: **30–132**（全域） / roles: **intro/verse/outro** / 符号: **unison**
- 出典: StudyBass roots and fifths（[studybass.com](https://www.studybass.com/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  ·  ·  R  ·  ·  ·  ·  ·
```

### 型B2. `w68-bs-drone`（1発保続ドローン）
- テンポ域: **30–96** / roles: **intro/verse/bridge** / 符号: **unison**
- 出典: [Wikipedia – Pedal point](https://en.wikipedia.org/wiki/Pedal_point) / HubGuitar Drones（[hubguitar.com](https://hubguitar.com/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  □  □  □  □  □  □  □  □  □  □  □   (主音保続・上物の和音が替わっても維持=モーダルヴァンプ)
```

### 型B3. `w68-bs-r5`（R–5交互＝ウンパ）
- テンポ域: **40–132** / roles: **verse/prechorus** / 符号: **unison**
- 出典: StudyBass roots and fifths（[studybass.com](https://www.studybass.com/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  ·  ·  5  ·  ·  ·  ·  ·
```

### 型B4. `w68-bs-r56`（R–5–6＝6付加）
- テンポ域: **60–96** / roles: **prechorus/chorus** / 符号: **interlock**（6が大拍の隙間step11を埋める）
- 出典: StudyBass root-fifth-sixth（[studybass.com](https://www.studybass.com/)）
- 注記: 6 は旋法に従う（Dorian=♮6／Aeolian=♭6）＝scale側の差替で色が変わる（§1-1）。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  ·  ·  5  ·  ·  ·  6  ·
```

### 型B5. `w68-bs-approach`（小節末アプローチ）
- テンポ域: **40–96** / roles: **verse/prechorus** / 符号: **counter**（step11=大拍外のオンセットで次の頭を予告）
- 出典: StudyBass approach notes（[studybass.com](https://www.studybass.com/)）/ bass vocab のアプローチ定石6/8版（`2026-07-14-bass-genre-vocabulary.md`）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  ·  ·  5  ·  ·  ·  A  ·   (A=次和音ルートへ2度/半音接近→次小節step1で解決)
```

### 型B6. `w68-bs-oct`（オクターブ跳ね）
- テンポ域: **60–132** / roles: **chorus/interlude** / 符号: **unison**（1,7一致＋11で跳ね足し）
- 出典: StudyBass octaves（[studybass.com](https://www.studybass.com/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  ·  ·  8  ·  ·  ·  5  ·
```

### 型B7. `w68-bs-hemi`（ヘミオラベース）
- テンポ域: **60–132**（母体従属・類型vi） / roles: **prechorus/chorus**（句末・サビ前の仕掛け限定＝常用しない・§2） / 符号: **interlock**
- 出典: [Wikipedia – Hemiola](https://en.wikipedia.org/wiki/Hemiola) / UEN hemiola 教材（[uen.org](https://www.uen.org/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  ·  ·  5  ·  ·  ·  R  ·  ·  ·   (1,5,9=3対2。ドラム低層は1,7保持で擦れを作る)
```

### 型B8. `w68-bs-jig`（奇数step歩行・山型）
- テンポ域: **100–132**（類型iii） / roles: **chorus/interlude** / 符号: **interlock**
- 出典: StudyBass walking の度数定石（[studybass.com](https://www.studybass.com/)）/ thesession（[thesession.org](https://thesession.org/)・ジグ伴奏の一般論のみ）
- 注記: 度数は例（山型アーチ）。6 は旋法の ♮6/♭6 に従う。3度は使わない（旋法曖昧の維持）。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
BS:    R  ·  5  ·  6  ·  8  ·  6  ·  5  ·
```

---

## 5. 打楽器 型辞書（8型）

各型＝型ID／レーン×12セル譜（GMノート番号は §0-4 の代用表・レーン名に併記）／テンポ域／roles／出典。全て**族としての骨格抽象**（Dum-tek 層構造＝低・高・持続・手拍子）であり、特定伝承リズム名のリテラル再現ではない（先例＝`break.amen_abstract` の「構造のみ」方式）。

### 型D1. `w68-dr-shaker`（持続層のみ）
- テンポ域: **30–132**（全域） / roles: **intro/verse/bridge/outro**
- 出典: [drumhelper – 6/8 Drum Beats](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/)

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
SH:    x  ·  x  ·  x  ·  x  ·  x  ·  x  ·   (シェイカー69・8分。派生=全12セルの16分)
```

### 型D2. `w68-dr-clap-beat`（大拍手拍子＋シェイカー）
- テンポ域: **40–96** / roles: **intro/verse**
- 出典: [drumhelper – 6/8 Drum Beats](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/)（層構成の一般論）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
SH:    x  ·  x  ·  x  ·  x  ·  x  ·  x  ·   (シェイカー69)
CL:    C  ·  ·  ·  ·  ·  C  ·  ·  ·  ·  ·   (手拍子39・大拍)
```

### 型D3. `w68-dr-dumtek-a`（Dum-tek骨格A・大拍対比型）
- テンポ域: **60–96**（類型ii） / roles: **verse/interlude**
- 出典: worldpercussion（[worldpercussion.net](https://worldpercussion.net/)）/ babayagamusic doum-tek 骨格（[babayagamusic.com](https://babayagamusic.com/)）＝フレームドラム族の一般教材（骨格抽象）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
TK:    ·  ·  k  ·  k  ·  T  ·  k  ·  k  ·   (縁37/42・弱kaの中に大拍Tek)
DU:    D  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·   (低41・頭のみ)
```

### 型D4. `w68-dr-dumtek-b`（Dum-tek骨格B・交互の波型）
- テンポ域: **60–96**（類型ii） / roles: **chorus/interlude**
- 出典: babayagamusic doum-tek（[babayagamusic.com](https://babayagamusic.com/)）/ threewinds（[threewinds.wordpress.com](https://threewinds.wordpress.com/)）（骨格抽象）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
TK:    ·  ·  k  ·  t  ·  T  ·  t  ·  k  ·   (弱→中→強→中→弱の波・音色2種交互)
DU:    D  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·   (低41)
```

### 型D5. `w68-dr-jigskel`（ジグ的骨格・8分駆動）
- テンポ域: **100–132**（類型iii） / roles: **verse/interlude**（薄い駆動層）
- 出典: [Wikipedia – Jig](https://en.wikipedia.org/wiki/Jig)（リズム骨格のみ）/ OAIM バウロン奏法の一般論（[oaim.ie](https://www.oaim.ie/)・骨格抽象＝down-upの往復と1,7アクセントだけを採る）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
TK:    ·  ·  k  ·  k  ·  ·  ·  k  ·  k  ·   (縁37・往復の中間)
DU:    D  ·  ·  ·  ·  ·  D  ·  ·  ·  ·  ·   (低41・大拍アクセント)
```

### 型D6. `w68-dr-tarantella`（タランテラ的骨格・追い込み）
- テンポ域: **100–132**（類型iv） / roles: **chorus/interlude**
- 出典: [Wikipedia – Tarantella](https://en.wikipedia.org/wiki/Tarantella)（骨格のみ）/ SFConservatory・Melodigging（T2・一般論）
- 注記: 本来の accelerando（漸次加速）は固定BPM格子で表現不可＝**運用注記**（セクション毎のテンポ設定で近似）。格子内の型は12セルに収まる。

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
TB:    X  ·  x  ·  x  ·  X  ·  x  ·  x  ·   (タンバリン54・X=強+シェイク)
DU:    D  ·  ·  ·  ·  ·  D  ·  ·  ·  ·  ·   (低41・1,7強)
```

### 型D7. `w68-dr-clap-hemiola`（手拍子ヘミオラ）
- テンポ域: **60–132**（母体従属・類型vi） / roles: **prechorus/chorus**（仕掛け限定・§2）
- 出典: [Wikipedia – Hemiola](https://en.wikipedia.org/wiki/Hemiola) / UEN hemiola 教材（[uen.org](https://www.uen.org/)）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
SH:    x  ·  x  ·  x  ·  x  ·  x  ·  x  ·   (シェイカー69・8分＝6/8を保持)
CL:    C  ·  ·  ·  C  ·  ·  ·  C  ·  ·  ·   (手拍子39・1,5,9=3対2)
DU:    D  ·  ·  ·  ·  ·  D  ·  ·  ·  ·  ·   (低41・1,7保持＝縦ヘミオラの擦れ)
```

### 型D8. `w68-dr-full`（フルキット＝低+高+持続の全層）
- テンポ域: **60–132**（類型ii-iii） / roles: **chorus/outro**
- 出典: [drumhelper – 6/8 Drum Beats](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/) / worldpercussion（[worldpercussion.net](https://worldpercussion.net/)）（層構成の一般論）

```
step#  1  2  3  4  5  6  7  8  9 10 11 12
SH:    x  x  x  x  x  x  x  x  x  x  x  x   (シェイカー69・16分全打)
TK:    ·  ·  T  ·  T  ·  ·  ·  T  ·  T  ·   (縁37・細分裏)
DU:    D  ·  ·  ·  ·  ·  D  ·  ·  ·  ·  ·   (低41・大拍)
```

---

## 6. 型ID一覧（26型）

| 型ID | 通称 | パート | テンポ(付点4分) | roles | 符号 |
|---|---|---|---|---|---|
| `w68-ch-drone5` | 開放5度ドローン | chord | 30–132 | intro/verse/bridge/outro | — |
| `w68-ch-pad` | 大拍パッド | chord | 30–96 | intro/verse/outro | — |
| `w68-ch-arp6` | 6音循環アルペジオ | chord | 40–96 | verse/chorus/interlude | — |
| `w68-ch-thumb` | 親指ベース+上声 | chord | 60–96 | verse/prechorus | — |
| `w68-ch-strum-all` | 全ダウンストラム | chord | 60–132 | chorus/interlude | — |
| `w68-ch-strum-dud` | D-U-D-D-U-D | chord | 60–96 | chorus/prechorus | — |
| `w68-ch-strum-jig` | ジグ的跳ねストラム | chord | 100–132 | chorus/interlude | — |
| `w68-ch-strum-sync` | シンコペストラム | chord | 60–96 | prechorus/chorus | — |
| `w68-ch-pm` | パームミュート薄 | chord | 60–132 | intro/verse/prechorus | — |
| `w68-ch-roll12` | 12音フルロール | chord | 30–60 | chorus/bridge | — |
| `w68-bs-anchor` | 大拍アンカー | bass | 30–132 | intro/verse/outro | unison |
| `w68-bs-drone` | 保続ドローン | bass | 30–96 | intro/verse/bridge | unison |
| `w68-bs-r5` | R–5交互 | bass | 40–132 | verse/prechorus | unison |
| `w68-bs-r56` | R–5–6 | bass | 60–96 | prechorus/chorus | interlock |
| `w68-bs-approach` | 小節末アプローチ | bass | 40–96 | verse/prechorus | counter |
| `w68-bs-oct` | オクターブ跳ね | bass | 60–132 | chorus/interlude | unison |
| `w68-bs-hemi` | ヘミオラベース | bass | 60–132 | prechorus/chorus | interlock |
| `w68-bs-jig` | 奇数step歩行 | bass | 100–132 | chorus/interlude | interlock |
| `w68-dr-shaker` | 持続層のみ | drum | 30–132 | intro/verse/bridge/outro | — |
| `w68-dr-clap-beat` | 大拍手拍子+シェイカー | drum | 40–96 | intro/verse | — |
| `w68-dr-dumtek-a` | Dum-tek骨格A | drum | 60–96 | verse/interlude | — |
| `w68-dr-dumtek-b` | Dum-tek骨格B | drum | 60–96 | chorus/interlude | — |
| `w68-dr-jigskel` | ジグ的骨格 | drum | 100–132 | verse/interlude | — |
| `w68-dr-tarantella` | タランテラ的骨格 | drum | 100–132 | chorus/interlude | — |
| `w68-dr-clap-hemiola` | 手拍子ヘミオラ | drum | 60–132 | prechorus/chorus | — |
| `w68-dr-full` | フルキット全層 | drum | 60–132 | chorus/outro | — |

verse/chorus 適格数（受け入れ基準§5-2）: chord＝verse 5（drone5/pad/arp6/thumb/pm）・chorus 6（arp6/strum-all/strum-dud/strum-jig/strum-sync/roll12）／bass＝verse 4（anchor/drone/r5/approach）・chorus 4（r56/oct/hemi/jig）／drum＝verse 4（shaker/clap-beat/dumtek-a/jigskel）・chorus 4（dumtek-b/tarantella/clap-hemiola/full）＝**全パート4以上**。

---

## 7. 場面×型 選択表（T4・D2）

「まず候補を出す→人が選ぶ」方針。各セルは優先順の候補列。密度は**新型でなく層追加/開放/幅出しで上げる**のが原則（§8）。

| 場面 | 密度 | chord | bass | drum |
|---|---|---|---|---|
| intro | 最小 | `w68-ch-drone5` / `w68-ch-pad` / `w68-ch-pm` | `w68-bs-drone` / `w68-bs-anchor` | `w68-dr-shaker` / `w68-dr-clap-beat` / （無し＝ドローンだけも可） |
| verse | 疎 | `w68-ch-arp6` / `w68-ch-thumb` / `w68-ch-drone5` / `w68-ch-pm` | `w68-bs-anchor` / `w68-bs-r5` / `w68-bs-drone` / `w68-bs-approach` | `w68-dr-dumtek-a` / `w68-dr-shaker` / `w68-dr-jigskel`(速) / `w68-dr-clap-beat` |
| prechorus | 中（上げ or 溜め） | `w68-ch-strum-sync` / `w68-ch-strum-dud` / `w68-ch-thumb` | `w68-bs-r56` / `w68-bs-hemi`(仕掛け) / `w68-bs-approach` | `w68-dr-clap-hemiola`(サビ前仕掛け) / `w68-dr-dumtek-a` |
| chorus | 密 | `w68-ch-strum-dud` / `w68-ch-strum-jig`(速) / `w68-ch-strum-all` / `w68-ch-roll12`(遅) ＋下層に `w68-ch-arp6` | `w68-bs-oct` / `w68-bs-jig`(速) / `w68-bs-r56` / `w68-bs-hemi`(句末) | `w68-dr-full` / `w68-dr-tarantella`(速) / `w68-dr-dumtek-b` / `w68-dr-clap-hemiola`(句末) |
| interlude | 中〜密（色替え） | `w68-ch-strum-jig` / `w68-ch-arp6` | `w68-bs-jig` / `w68-bs-oct` | `w68-dr-dumtek-a/b` / `w68-dr-tarantella` |
| bridge | 対比（落とす） | `w68-ch-drone5` / `w68-ch-roll12` / （無し＝打楽器だけ） | `w68-bs-drone` / （無し） | `w68-dr-shaker` / （無し＝ドローンだけ） |
| outro | 減衰 | `w68-ch-pad` / `w68-ch-drone5` | `w68-bs-anchor` | `w68-dr-full`→`w68-dr-shaker` へ減衰 |

- intro/bridge の「ドローンだけ」「打楽器だけ」＝1パート単独も第一級の候補（D2）。
- 旋律の民族色は 4小節に1〜2個（§1-3 密度則）。verse で色を置きすぎない。

---

## 8. 型間遷移（T4・D3）

- **保存する層＝大拍（step1,7）＋ドローン＋旋法**。ここを崩すと「6/8らしさ」と「無国籍の芯」が同時に壊れる。verse→chorus で型が替わっても、低音レーンの 1,7 とドローンの主音、scale はまたいで維持する。
- **変えてよい層＝細分密度・明度・層数**。サビ上げの操作は「コード刻みの細分を増やす（pad→strum）」「打楽器の層を足す（dumtek-a→full）」「ベースを跳ねさせる（anchor→oct）」「手拍子を足す」＝**型を増やさずレーン/密度の属性で上げる**。
- **1型が疎/密パラメータで両場面適格**（例: `w68-ch-arp6` は単独=verse・ストラム下の層=chorus）＝L4 の「セル内 distinct 4件」目標に効く戦略。辞書化の際は roles を両場面に付けてよい。
- **ヘミオラ（`w68-bs-hemi`/`w68-dr-clap-hemiola`）は遷移点限定**＝句末・サビ前の1〜2小節に差す仕掛けであり、常用ループにしない（§2 B3）。縦ヘミオラでは低音レーンが 1,7 を保持して擦れを作る。
- 定番遷移の例: `w68-ch-arp6 + w68-bs-anchor + w68-dr-dumtek-a`（verse）→ prechorus 末に `w68-dr-clap-hemiola` 1小節 → `w68-ch-strum-dud + w68-bs-oct + w68-dr-full`（chorus）。

---

## 9. 設計含意（待ち工事の明記のみ・**本docでは実装しない**）

実装は別スライス（裁定Dの上書き工事・オーナー確認①の承認後に design.md へ下ろす）:

1. **chord/bass 辞書の grid:12 対応**: `chordLibrary.ts:37`・`bassLibrary.ts:29,57` は grid:16 固定＋16セル厳格検証＝`grid: 16 | 12` へ拡張が必要（drumLibrary.ts は `grid: 16 | 12` 既対応・`six8.ballad` が先例）。
2. **seed の 6/8 解禁**: `seed-pattern-library.ts:26,78` が非4/4を除外＝解除。
3. **L3 ピッカー/プレビューの 4/4 前提解除**。
4. 型データはこの doc の12セル譜から写経できる形（度数×位置×vel）＝MMA等の先行エンジンと同構造（`2026-07-22-accompaniment-style-engines.md`）。
5. **feel 層との住み分け**: 型は素の格子で保持し、揺れ/ヒューマナイズは applyFeel に委譲（既存4docと同方針・二重に揺らさない）。
6. **打楽器音色**: GM代用（§0-4）で一旦出す＝フレームドラム実音色は音源側の別工事（仮置き⑤）。
7. **タランテラ的 accelerando**: 格子外の運用（セクション毎テンポ）＝生成器は関知しない。
8. 6/8 フィルは対象外（`2026-07-14-drum-fill-vocabulary.md` と同じ扱い・backlog 候補として言及のみ）。
9. 耳確認は辞書化→seed→プローブMIDI束のスライス後（研究の完了条件に含めない・計画§8-5）。

---

## 10. 12×bars 整数チェック（受け入れ基準§5-4）

全26型のテキスト譜をセル数カウント＝**全型 12セル×1小節ちょうど**（派生の16分シェイカーも12セル内）。**【スキーマ拡張要】該当なし**（findings どおり）。24枠相当の装飾（8分のさらに3分割）・自由リズムのルバートは今回のfindingsに採録候補が無く、型としても収録していない。タランテラの加速はテンポ運用（§9-7）であり格子の外＝マーク不要。

---

## 11. 受け入れ基準セルフチェック（計画§5・Fable監査用の自己申告）

| # | 基準 | 判定 |
|---|---|---|
| 1 | 記法節が冒頭（12セル・大拍1,7・8分=奇数step・ヘミオラ1,5,9・付点4分BPM） | ✅ §0 |
| 2 | 型数: chord 10≥8・bass 8≥8・drum 8≥8／verse・chorus 各4適格以上 | ✅ §6 集計 |
| 3 | 各型に 12セル譜・テンポ域(付点4分min–max)・roles・出典URL1本以上（＋ベースは符号） | ✅ §3-§5（各型の定型見出し） |
| 4 | 12×bars 整数・外れは【スキーマ拡張要】マーク | ✅ §10（該当0） |
| 5 | 出典×採録タイプ対応表・「採譜」行0・特定曲名/伝承曲名が型ID/譜に不在 | ✅ §12 |
| 6 | 体裁＝記法→型辞書→選択表→遷移→設計含意→出典・待ち工事明記 | ✅ §0→§3-5→§7→§8→§9 |
| 7 | README 索引1行追加 | ✅（同時コミット） |

制限事項（正直な申告）: T1-T4 のfindingsは出典を**サイト名/記事名**で記録しており、記事単位のフルURLが残っていないものがある。本docでは repo検証済URL（Wikipedia・drumhelper・soundprogramming 等）はフルURLで、それ以外は**ドメインURL＋記事名/内容**で継承した（T5はweb再検索をしない取り決めのため）。監査で記事単位の実在確認が要る場合は §12 の行単位で当たれる。

---

## 12. 出典×採録タイプ対応表（採譜0の証明・計画§6の一次証跡）

採録タイプ＝{一般定石／骨格抽象／統計／規格} の4種のみ。**「採譜」（特定曲・特定伝承曲のtranscription）タイプの行は 0**。特定曲名・特定伝承曲名は本docの型ID・譜・キャプションに現れない（様式名 jig/tarantella/siciliana はリズム族の一般名＝可）。

| 出典 | URL | 採録タイプ | 採った内容 |
|---|---|---|---|
| flupe Modal Harmony | [flupe.com](https://flupe.com/) | 一般定石 | 旋法の特性音・特性和音（§1-1） |
| filmmusictheory | [filmmusictheory.com](https://filmmusictheory.com/) | 一般定石 | フリジアンドミナントの I–♭II 運用 |
| Wikipedia Phrygian dominant | [URL](https://en.wikipedia.org/wiki/Phrygian_dominant_scale) | 一般定石 | 増2度の位置と空気 |
| Wikipedia Power chord | [URL](https://en.wikipedia.org/wiki/Power_chord) | 一般定石 | root+5の長短曖昧 |
| Wikipedia Pedal point | [URL](https://en.wikipedia.org/wiki/Pedal_point) | 一般定石 | ドローン上の緊張→解決（C1/B2） |
| HubGuitar Drones | [hubguitar.com](https://hubguitar.com/) | 一般定石 | ドローンの旋法保持 |
| Quora/masterguitarguide（ケルト系進行） | [masterguitarguide.com](https://masterguitarguide.com/) | 一般定石 | I–♭VII–IV 等の非機能循環 |
| MTO Temperley Scalar Shift | [mtosmt.org](https://mtosmt.org/) | 統計 | 旋法シフトの一般性 |
| Open Music Theory（Modal Schemas/Compound Meters/Drumbeats） | [viva.pressbooks.pub/openmusictheory](https://viva.pressbooks.pub/openmusictheory/) | 一般定石 | 旋法スキーマ・複合拍子の拍構造 |
| LANDR/HelloMusicTheory/LearnJazzStandards | [landr.com](https://www.landr.com/) ほか | 一般定石 | 旋法の空気の対応 |
| repo `2026-07-14-mode-usage-stats.md` | （repo内） | 統計 | 短調度数分布・エオリアン終止＞V→i |
| repo `2026-07-06-vocaloid-folk-study.md` | （repo内） | 統計 | i–♭VI–♭VII 循環・V/導音回避 |
| dummies Compound Time | [dummies.com](https://www.dummies.com/) | 一般定石 | 6/8=2大拍の数え方 |
| Wikipedia Jig / Slip jig | [URL](https://en.wikipedia.org/wiki/Jig) | 骨格抽象 | 8分駆動・1,7アクセントの骨格のみ |
| Wikipedia Siciliana | [URL](https://en.wikipedia.org/wiki/Siciliana) | 骨格抽象 | 3+1+2（step1,4,5）骨格のみ |
| Wikipedia Tarantella | [URL](https://en.wikipedia.org/wiki/Tarantella) | 骨格抽象 | 全奇数+1,7強・加速の存在（運用注記） |
| FolkWorks/tradschool（アイリッシュ舞曲類型） | [tradschool.com](https://tradschool.com/) | 一般定石 | 舞曲類型とテンポ域 |
| SFConservatory/Melodigging Tarantella | [melodigging.com](https://melodigging.com/) | 一般定石 | タランテラ的類型のテンポ・骨格 |
| Study.com/Douglas Niedt/UEN Hemiola | [uen.org](https://www.uen.org/) | 一般定石 | ヘミオラ=1,5,9・句末仕掛け |
| Wikipedia Hemiola | [URL](https://en.wikipedia.org/wiki/Hemiola) | 一般定石 | 3対2の定義 |
| OAIM/WonderHowTo（バウロン） | [oaim.ie](https://www.oaim.ie/) | 骨格抽象 | down-up往復と大拍アクセントのみ（D5） |
| Beta Monkey Slow 6/8 | [betamonkeymusic.com](https://www.betamonkeymusic.com/) | 一般定石 | 遅い6/8の空気・密度 |
| Luis Dias Sicilienne&Pastorale | （記事名のみ・T2メモ） | 一般定石 | シチリアーナ=田園/短調緩 |
| Riffhard/strumming.com/goodguitarist/irish-folk-songs | [strumming.com](https://strumming.com/) ほか | 一般定石 | 6/8ストラム族（C5-C9） |
| AcousticGuitar/NationalGuitarAcademy | [acousticguitar.com](https://acousticguitar.com/) ほか | 一般定石 | 6音循環/親指ベース/ロール（C3/C4/C10） |
| StudyBass（roots-fifths/root-fifth-sixth/approach/octaves） | [studybass.com](https://www.studybass.com/) | 一般定石 | ベース度数定石（B1-B8） |
| Minnix/threewinds/worldpercussion | [worldpercussion.net](https://worldpercussion.net/) | 骨格抽象 | Dum/Tek/Ka の層抽象 |
| babayagamusic doum-tek | [babayagamusic.com](https://babayagamusic.com/) | 骨格抽象 | doum-tek骨格（D3/D4）＝音色列のみ |
| csmaccath/thesession | [thesession.org](https://thesession.org/) | 一般定石 | ジグ伴奏の一般論（B8）※個別チューンは見ない |
| classical-music（タランテラ） | （記事名のみ・T3メモ） | 一般定石 | タランテラ的骨格の一般形 |
| GM Percussion（Jazz-Soft/soundprogramming/computermusicresource） | [URL](https://soundprogramming.net/file-formats/general-midi-drum-note-numbers/) | 規格 | GMノート番号（§0-4） |
| MMA styles / sciurius mma-grooves | [mellowood.ca/mma](https://www.mellowood.ca/mma/) | 規格（構造参照） | 度数×位置×volの持ち方＝12枠互換の裏付け |
| drumhelper 6/8 | [URL](https://drumhelper.com/learning-drums/6-8-drum-beats-and-patterns/) | 一般定石 | 6/8の層構成（D1/D2/D8） |
| melodigging Pagan Folk | [melodigging.com](https://melodigging.com/) | 一般定石 | 汎用建材/署名記号の線引き（D1） |
| Premier Guitar Pedal Points & Ostinatos | [premierguitar.com](https://www.premierguitar.com/) | 一般定石 | オスティナート運用 |
| jdwasabi（ゲーム音楽の文化的流用回避） | [jdwasabi.com](https://jdwasabi.com/) | 一般定石 | 署名記号を捨てる回避則 |
| musekinote（民族コード進行） | [musekinote.com](https://musekinote.com/) | 一般定石 | 非機能循環・密度則（4小節1-2個） |
| yukito-life（ケルト風） | [yukito-life.blog](https://yukito-life.blog/) | 一般定石 | ケルト寄り運用の一般論 |
| ACE Studio Arranging | [acestudio.ai](https://acestudio.ai/) | 一般定石 | 場面別密度の段差 |
| repo `2026-07-14-drum-pattern-genre-library.md` | （repo内） | 一般定石 | six8.ballad テンポ錨50–80・体裁雛形 |
| repo `2026-07-22-piano/guitar/bass vocabulary` | （repo内） | 一般定石 | 記法・符号・feel層住み分け |

- **未取得（403で一次未確認・本文不引用）**: cora.ucc.ie「Scoring Alien Worlds」・academia.edu「World Instruments for Non-ethnographic Association」＝概念の存在のみ言及（T4）。本docの型には使っていない。
- **採譜タイプの行数: 0**。他者コーパス（irish 186句等）はリテラルを見ず統計参照のみ（`2026-06-29-melody-corpus-and-deform.md` の運用どおり）。
