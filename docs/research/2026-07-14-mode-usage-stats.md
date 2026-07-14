# 旋法・借用和音の使用統計 → モードパレット既定値（C7・2026-07-14）

自前コーパスの実測＋公開研究統計から、**frame の mode を長短2択から旋法パレットへ拡張するための既定値**と
**借用和音の挿入位置規則**を仕様化する。データは読み取りのみ・DB無変更。集計スクリプトは scratchpad（使い捨て）。

- 対象DB: `data/cm.sqlite`（2026-07-14・c57c37e 正規化後）
- 進行コーパス: `neta(kind=chord_progression, scope=library)` **210件**（major 128 / minor 82、count加重で265本：major 154 / minor 111）。長さ 3〜16・中央値5。root は調主音相対（tonic=0）・mode は行に保存。
- メロ句辞書: `neta(kind=melody, scope=library)` **1344句**（major 736 / minor 608、count加重 2622/2291）。notes は C 正規化（`normalizeToC`）・mode 保存あり。

---

## 1. 実測①：進行コーパスの度数分布（count加重・和音スロット比）

### 1-1. 長調（スロット総数 1097）

| 度数 | 率 | 位置内訳（first/mid/penult/last） | 備考 |
|---|---|---|---|
| I | 31.6% | 64/196/40/47 | |
| IV | 20.7% | 28/129/46/24 | penult 最多＝IV→V/IV→I 前置 |
| V | 17.6% | 15/101/33/44 | last 最多＝終止 |
| vi | 10.5% | 25/65/9/16 | 開始2位群（王道進行系の頭） |
| ii | 4.6% | 3/36/8/3 | |
| iii | 3.8% | 2/30/6/4 | |
| **♭VII** | **2.3%** | 4/18/2/1 | 借用筆頭（下記1-3） |
| II (V/V) | 2.0% | 3/15/1/3 | 二次ドミナント |
| v | 1.5% | 3/7/2/4 | ミクソ痕跡/ii代理 |
| VI (V/ii) | 1.4% | 2/11/2/0 | |
| i | 0.9% | 0/6/2/2 | 同主短ピボット |
| ♭III | 0.8% | 0/5/2/2 | |
| III (V/vi) | 0.7% | 1/6/0/1 | |
| ♭VI | 0.6% | 1/4/1/1 | |
| iv | 0.3% | 0/3/0/0 | SDm（自前では希少＝後述の公開統計とギャップ） |

### 1-2. 短調（スロット総数 613）

| 度数 | 率 | 位置内訳（first/mid/penult/last） | 備考 |
|---|---|---|---|
| i | 27.7% | 50/69/20/31 | |
| ♭VI | 16.8% | 21/37/35/10 | **penult 最多**＝♭VI→♭VII / ♭VI→V の前置 |
| ♭III | 12.4% | 15/44/9/8 | |
| **V (長/7)** | **9.8%** | 5/32/6/17 | 和声的短音階の借音。last 2位 |
| ♭VII | 9.8% | 2/23/16/19 | **last 最多級**＝エオリアン終止 |
| v | 4.4% | 5/10/5/7 | 自然短のまま |
| **IV (長)** | **4.2%** | 1/22/1/2 | **ドリアン痕跡。中間専用**（終止に出ない） |
| iv | 3.4% | 4/9/4/4 | |
| I | 2.1% | 1/5/3/4 | ピカルディ含む |
| ♭II | 2.0% | 2/4/4/2 | ナポリ/フリジア |
| vii/VII | 2.0% | 1/5/2/4 | |
| II | 1.1% | 0/7/0/0 | |

### 1-3. 終止パターン（末尾2和音・3和音、count加重上位）

| 長調 末尾2 | 数 | 長調 末尾3 | 数 |
|---|---|---|---|
| IV→V | 27 | I→IV→V | 15 |
| V→I | 16 | IV→V→I | 12 |
| IV→I | 15 | IV→I→V | 11 |
| I→IV | 13 | I→IV→I | 9 |
| V→vi | 10 | IV→V→vi | 8 |

| 短調 末尾2 | 数 | 短調 末尾3 | 数 |
|---|---|---|---|
| ♭VI→♭VII | 18 | i→♭VI→♭VII | 15 |
| ♭VII→i | 12 | ♭VI→♭VII→i | 11 |
| ♭VI→V | 9 | i→♭VI→V | 5 |
| V→i | 5 | ♭VI→V→i | 4 |
| ♭VI→v | 5 | iv→v→i | 3 |

短調の終止は **エオリアン・ケーデンス（♭VI→♭VII→i）が V→i を上回る**。ボカロ民族調 study
（`docs/research/2026-07-06-vocaloid-folk-study.md`＝i–♭VI–♭VII 核・V回避）と完全に整合し、
`genChords` の短調 loop 既定 `[1,6,7]` は自前コーパス実測の第1位パターンそのもの。

開始和音：長調 I 64 > IV 28 > vi 25 > V 15、短調 i 50 > ♭VI 21 > ♭III 15。

### 1-4. 借用・非ダイアトニック和音の「進行含有率」と平均位置（count加重）

進行単位で「その和音を1回以上含む率」と、含む場合の平均相対位置（0=頭・1=末尾）。

**長調（154本中）**

| 和音 | 含有率 | 平均位置 | 文脈（自前実測） |
|---|---|---|---|
| ♭VII | 13.6% | 0.43 | 前=I(9)/♭III(4)、**次=I が 20/24**＝♭VII→I 直行 |
| v | 8.4% | 0.53 | ミクソ/ii代理 |
| II (V/V) | 7.8% | 0.52 | 中間の接着 |
| III (V/vi) | 5.2% | 0.47 | 王道進行の変形（4536→45(III)6） |
| ♭III | 5.2% | 0.59 | |
| ♭VI | 3.9% | 0.52 | 前=vi(4)＝vi→♭VI 半音下降 |
| VI (V/ii) | 3.9% | 0.43 | |
| i | 2.6% | 0.77 | 末尾寄り＝同主短への転落 |
| iv | 0.6% | 0.49 | 自前では希少（公開統計・J-pop 定石とギャップ→§3） |

**短調（111本中）**

| 和音 | 含有率 | 平均位置 | 文脈 |
|---|---|---|---|
| V (長/7) | 36.9% | 0.56 | 終止部の D 機能＝和声的短音階。DIATONIC_MINOR に登録済で妥当 |
| IV (長) | 13.5% | 0.50 | **ドリアン色。中間限定**（last 2/26 のみ） |
| ♭II | 9.0% | 0.55 | |
| vii/VII | 9.0% | 0.66 | 導音系・終止前 |
| II | 3.6% | 0.49 | 中間のみ |

---

## 2. 実測②：メロ句辞書の mode 分布と度数使用

mode 分布：major 736（加重2622）/ minor 608（加重2291）＝**長短ほぼ半々**。style ラベルは content に無し
（irish/pop909/falcom 混合・C正規化済）。

音符 pc ヒストグラム（count加重・音符総数 major 55349 / minor 48816）：

| 長調 度数 | 率 | | 短調 度数 | 率 |
|---|---|---|---|---|
| 1 | 20.6% | | 1 | 21.5% |
| 5 | 18.6% | | 5 | 19.3% |
| 3 | 18.3% | | 4 | 16.4% |
| 2 | 16.6% | | ♭3 | 15.0% |
| 6 | 13.9% | | ♭7 | 13.4% |
| 7 | 5.6% | | 2 | 8.5% |
| 4 | 5.4% | | ♭6 | 2.8% |
| **♭7** | **0.4%** | | **♮6（ドリアン）** | **0.9%** |
| ♭6 | 0.3% | | **♮7（導音）** | **0.8%** |
| ♭3 | 0.1% | | ♮3 | 0.6% |
| #4 | 0.1% | | ♭2 | 0.4% |
| ♭2 | 0.1% | | #4 | 0.3% |

読み：
- **長調メロの ♭7 は 0.4%＝メロ側にミクソリディア痕跡はほぼ無い**（辞書の出自＝irish/POP909/falcom が
  長短枠で正規化済のため）。長調は 1-2-3-5-6（メジャーペンタ）+7+4 の順＝教科書どおり。
- **短調メロの ♮6 は 0.9%・導音♮7 は 0.8%**＝辞書の短調は**ほぼ純エオリアン**。ドリアン/和声的短音階の
  痕跡は僅少。旋律側の旋法色は辞書からは供給されない＝**旋法一級化はコード側主導で行い、メロは
  scalePcs 差替に追従させる**のが正しい分担（後述§4）。
- 長短どちらも 1・5 が2割ずつ＝主音/属音アンカーは mode 不問で安定。

---

## 3. 公開統計による補強（自前コーパスは210件と薄い）

### 3-1. de Clercq & Temperley「A corpus analysis of rock harmony」(Popular Music 30/1, 2011)

RS 5×20 コーパス（Rolling Stone 500 から各年代20曲×5＝100曲・9924和音・人手ローマ数字分析）。
出典: https://davidtemperley.com/wp-content/uploads/2015/11/declercq-temperley-pm11.pdf
（スライド: https://www.midside.com/presentations/declercq_2010_nemcog_slides.pdf）

**Table 2（全和音root分布）**：

| Root | 比率 | | Root | 比率 |
|---|---|---|---|---|
| I | .328 | | ♭VI | .040 |
| IV | .226 | | ♭III | .026 |
| V | .163 | | III | .019 |
| **♭VII** | **.081** | | ♭II | .005 |
| VI | .072 | | VII | .004 |
| II | .036 | | #IV | .003 |

**Table 4（トニック除外・pre-tonic / post-tonic 分布）**：

| Root | 全体 | pre-tonic | post-tonic |
|---|---|---|---|
| IV | .336 | **.396** | .356 |
| V | .241 | .269 | .240 |
| ♭VII | .119 | .132 | **.159** |
| VI | .107 | .050 | .102 |
| ♭VI | .059 | .071 | .036 |
| II | .053 | .041 | .044 |
| ♭III | .038 | .017 | .032 |

読み：ロックでは **IV > V > ♭VII が pre-tonic/post-tonic とも同順の三強**（機能和声の非対称が崩れている）。
♭VII は post-tonic 偏重（I の直後に降りる）、VI は pre-tonic を避ける、V はやや pre-tonic 偏重。
自前実測の「長調 ♭VII の次は I が 20/24」は DT の ♭VII→I 386回（Table 3）と同型。

**Table 7（トニック終止トライグラム上位）**：IV-V-I 352 / V-IV-I 292 / ♭VII-IV-I 146 / VI-IV-I 126 /
フラット系（♭VII·♭VI·I 絡み）103+60 / ♭III-♭VI-I 66 / II-V-I 63 / IV-♭VII-I 39。
（※ フラット系2行はPDF抽出順の都合で 103/60 の対応が入れ替わっている可能性あり。計163と読む。）

**Table 8（年代推移）**：♭VII は 1950s .007 → 1960s以降 .06〜.11 に定着。♭III/♭VI/♭II も60s以降増
（ハードロック/メタルのフラット側和声）。**Table 9（共起相関）**：{♭VII, ♭III, ♭VI} が相互相関
.37〜.48 の一群、{II, VI, III} がもう一群＝**フラット側（エオリアン/ミクソ）とシャープ側（メジャー機能系）の
2つの旋法クラスタ**が統計的に現れる。→ 借用は単発でなく**同じ側の仲間を連れてくる**のが自然。

### 3-2. Temperley「Scalar Shift in Popular Music」(MTO 17.4, 2011)

出典: https://mtosmt.org/issues/mto.11.17.4/mto.11.17.4.temperley.html

- ロックの音組織は **supermode**（Ionian∪Aeolian＝♭2 と #4 だけを除く10音）で捉えるのが実態に合う。
  RS 200曲の集計で ♭2̂・#4̂ が他のどの度数よりも有意に少ない。
- 五度の線（line of fifths）上のシャープ側=明るい/フラット側=暗いの「happiness axis」。旋法は固定の枠
  でなく**曲中でフラット側⇔シャープ側へシフトする**（セクション区切り・気分転換・緊張形成）。
- 「一貫してドリアンの曲を10曲挙げるのは難しい」＝**純旋法の曲は稀。旋法はスケール集合の"寄せ"**。
- 関連: Mediant mixture（♭3̂/3̂ 混用・ブルーノート）https://mtosmt.org/issues/mto.17.23.1/mto.17.23.1.temperley.html
- 旋法スキーマの教科書的整理（Aeolian i–♭VI–♭VII 等）: https://viva.pressbooks.pub/openmusictheory/chapter/modal-schemas/

### 3-3. J-pop の同主短調借用（定性・実務系ソース）

- SoundQuest「パラレル・マイナー」: https://soundquest.jp/quest/chord/chord-mv2/parallel-minor/
  ＝J-pop 実務での借用元は同主短調（♭III・♭VI・♭VII・iv）が主流という整理。
- 借用和音の定石解説: https://dtm-hyper.com/arrange/borrowedchord.html
- iv/♭VI/♭VII の「安全な入れ方」（メジャー曲に切なさ）: https://note.com/noveng_musiq/n/ne96b5734b0b3
  ＝**IV→iv→I**（Lemon・白日型）が最頻出の型、♭VI・♭VII はサビ前/セクション終わりに置くのが定石とする実務知。
- 王道進行（IV△7→V7→iii7→vi）: https://ja.wikipedia.org/wiki/王道進行 ＝J-popサビの長短二重性
  （メジャー2つ+マイナー2つ交互）。自前長調コーパスの vi 開始 25/154・IV 開始 28/154 と整合。

**ギャップの明示**：自前コーパス（U-FRET系J-pop）で長調 iv は 0.6% しか出ない。これはコーパスが
サビ/イントロの主要ループ中心で、iv が「1拍だけ挟むパッシング借用」として採譜から落ちやすいため
と考えられる。J-pop 実務定石（IV→iv→I）と DT の ♭VI .040/♭III .026 を合わせ、**iv/♭VI は実測より
厚めに既定値を張る**（過小推定バイアスの補正）。

---

## 4. 仕様化：モードパレット既定値と借用挿入規則

### 4-1. モードパレット（frame key+mode の選択肢）

現行 `frame.mode ∈ {major, minor}` は**維持**（検出系 rankKeys が KS 長短2プロファイルのため）。
旋法は **mode の下の「パレット」**として一級化する（mode=major の Mixolydian、mode=minor の Dorian）。
scalePcs 集合差替で安く実装できる（既存研究 #7 旋法の結論どおり）。

| パレット | 親mode | スケール(半音) | 特徴度数 | 特徴和音 | 適用ジャンル/気分の既定 | 根拠 |
|---|---|---|---|---|---|---|
| Ionian（既定） | major | 0 2 4 5 7 9 11 | 4̂ 7̂ | IV, V, vi | 汎用・明るい・王道 | 現行 MAJOR_SCALE |
| **Mixolydian** | major | 0 2 4 5 7 9 **10** | **♭7̂** | **♭VII**, v, IV | ロック・おおらか・土臭い・祭 | DT ♭VII=.081/pre-tonic 3位・自前含有13.6% |
| Aeolian（既定） | minor | 0 2 3 5 7 8 10 | ♭6̂ ♭7̂ | ♭VI, ♭VII, ♭III | 切ない・民族調・疾走ボカロ | 現行 MINOR_SCALE・vocaloid-folk study |
| **Dorian** | minor | 0 2 3 5 7 **9** 10 | **♮6̂** | **IV(長)**, ii(m), ♭VII | おしゃれ・浮遊・ファンク・都会の哀愁 | 自前短調 IV含有13.5%・Temperley（純ドリアン曲は稀＝"色"として） |
| Harmonic色 | minor | Aeolian+♮7(終止のみ) | ♮7̂ | V(7), vii° | 演歌的引力・クラシカル | 自前 V 含有36.9%＝**既に DIATONIC_MINOR に実装済**。パレットでなく終止ノブ |

方針：
- **Lydian/Phrygian は載せない**（supermode 外の #4̂/♭2̂ が核＝ポップスの実測で最少度数。要望が出たら追加）。
- Temperley の知見どおり**旋法は固定枠でなくシフト**＝パレットはセクション単位で切替可能にする
  （Verse=Dorian → Chorus=Aeolian 等。de Clercq の「verse短調→chorusで相対長調」観察とも整合）。
- メロ句辞書は長短2値のまま（§2＝辞書に旋法色が無い実測）。**旋法色はコード側＋scalePcs 追従で出す**。
  Dorian は minor 辞書＋scale の ♭6→♮6 差替、Mixolydian は major 辞書＋7→♭7 差替で運用。

### 4-2. 借用和音の挿入位置規則（どの機能位置に差すと自然か）

長調（mode=major のまま使える「色ノブ」）：

| 借用 | 差す位置 | 規則 | 既定確率の目安 | 根拠 |
|---|---|---|---|---|
| **♭VII** | **post-tonic（Iの直後）または pre-tonic（Iの直前）** | I→♭VII→I / IV→♭VII→I。次は必ず I 系へ | rock系 mood で 0.10–0.15 | DT post-tonic .159（V に迫る）・自前「次=I が 20/24」・IV-♭VII-I 39 |
| **iv** | **penult（IV→iv→I）** ＝ IV の位置の後半分割か IV 自体の差替 | 直後は I（またはI△7）。V の前には置かない | 切ない系 mood で 0.2（実測0.6%は過小＝実務定石で補正） | J-pop定石（Lemon/白日型）・既存 borrow ノブの設計と一致 |
| **♭VI** | **vi の直後（vi→♭VI の半音下降）またはサビ前終止（♭VI→♭VII→I）** | ♭VII とセットで使う | 0.05–0.10 | DT ♭VI .040・トライグラム ♭VI/♭VII系 計163・自前「前=vi 4/6」 |
| ♭III | ♭VI と同時採用時のみ候補に足す | 単発で差さない（フラット群は共起） | ♭VI 採用時 0.3 | DT Table 9 相関 ♭III–♭VI .482・♭III–♭VII .367 |
| II(V/V)・III(V/vi)・VI(V/ii) | 目標和音の直前 | 既存 secondaryDom ノブどおり | 現行維持 | 自前含有 7.8/5.2/3.9% |

短調：

| 借用/色 | 差す位置 | 規則 | 根拠 |
|---|---|---|---|
| V(長/7) | penult（D機能位置）のみ | 中間の v は自然短のまま＝「終止だけ導音」 | 自前：V の last 17/60・平均位置0.56。実装済（DIATONIC_MINOR） |
| IV(長)＝Dorian色 | **mid のみ。終止に置かない** | i→IV→i / i→IV→♭VII 等の浮遊。last は禁止に近い | 自前：IV(長) last 2/26・平均位置0.50 |
| ♭II | 終止前の彩り（♭II→i / II→♭II→I） | 頻度低・フリジア/ナポリ風 | 自前含有 9.0%・平均位置0.55 |
| ピカルディ I | last のみ | 曲末専用 | 自前 I last 4/13 |

終止型の既定（実測順位に合わせる）：
- 長調: full(V→I) / plagal(IV→I) は現行どおり。**IV→V→I が最多**＝penult の IV 前置を厚く。
- 短調: **エオリアン終止（♭VI→♭VII→i）を full と同格の第一級カデンツに**（実測で V→i より多い）。
  現行は loop=[1,6,7] でしか出ない＝cadence 選択肢 `aeolian` の追加が妥当。

### 4-3. genChords への旋法一級化の含意（`apps/api/src/music/generate.ts` L193〜）

1. **入口**：`opts.palette?: "ionian"|"mixolydian"|"aeolian"|"dorian"`（未指定＝mode から ionian/aeolian）。
   frame.mode の正準2値は変えない＝検出(rankKeys)・移調(design.md「配置移調は一意」)・句辞書 mode との
   互換を全部保つ。**既定OFF＝bit一致**の流儀（borrow/secondaryDom と同じ）。
2. **スケール**：`scalePcs`（`apps/api/src/music/theory.ts` L29）に palette 対応の集合を追加
   （MIXO=[0,2,4,5,7,9,10]・DORIAN=[0,2,3,5,7,9,10]）。genMelody/genBass の経過音・E-rule の
   in-scale 判定・fit 系も**同じ集合を参照**させる（差替が生成だけだと旋法音が評価でペナルティ＝矛盾）。
3. **和音表**：DIATONIC_MIXO `{1:[0,""], 4:[5,""], 5:[7,"m"], 7:[10,""], 2:[2,"m"], 6:[9,"m"]}`・
   DIATONIC_DORIAN `{1:[0,"m"], 4:[5,""], 7:[10,""], 3:[3,""], 2:[2,"m"], 5:[7,"m"]}` を追加。
   ミクソ/ドリアンは T-S-D 文法より**循環が本体**（DT：pre-tonic IV>V>♭VII＝機能非対称の崩れ）
   → loop パス既定を palette 別に：mixo=[1,7,4]（I–♭VII–IV）・dorian=[1,4]（i–IV）or [1,7,4,7]。
   非loop時は D 機能候補に ♭VII を混ぜる（mixo: V候補→[♭VII厚め, v]）。
4. **借用ノブの拡張**：既存 `borrow`（iv差替）に加え `borrowFlat7`（♭VII を post/pre-tonic に挿入）・
   `borrowFlat6`（終止部を ♭VI→♭VII→I 化）。§4-2 の位置規則をそのまま実装（挿入位置は候補位置の
   フィルタ→rng）。**フラット群の共起**（DT Table 9）＝ borrowFlat6 採用時は ♭III も候補に足す。
5. **カデンツ**：`cadence` に `"aeolian"`（短調: penult=♭VI・last′=♭VII→i、長調: ♭VI→♭VII→I）を追加。
   短調の実測第1位終止を full の陰から出す。
6. **メロ側**：句辞書は変更不要（§2）。realize 時の scale 差替のみ＝**旋法はコードとスケールの2点で
   注入し、辞書は長短のまま**。将来メロに ♭7̂ を望むなら CT/経過音の重みで scale 内 ♭7 を許すだけで足りる。
7. **順序**：design.md 先行更新 → theory.ts の scale/表をテスト先行（palette 未指定＝現行 bit一致の
   ゴールデン）→ genChords 配線 → E-rule/fit の集合共有 → 耳確認（mode 結線は実機フローでしか出ない）。

### 4-4. 限界

- 自前進行コーパスは 210件（加重265）＝ J-pop ギター譜出自の偏り・借用の過小採譜あり。既定確率は
  DT/実務定石で補正した値（§4-2）を採り、**自前実測は「位置規則」の根拠**として使うのが安全。
- DT コーパスはロック（RS500）＝ J-pop より ♭VII 厚め/ iv 薄めの可能性。両者で挟んで既定値を置いた。
- メロ句辞書の旋法色の薄さは出自（長短正規化済コーパス）由来＝「J-popメロに旋法色が無い」ことの
  証明ではない。

## 出典

- de Clercq & Temperley (2011) "A corpus analysis of rock harmony", Popular Music 30/1:
  https://davidtemperley.com/wp-content/uploads/2015/11/declercq-temperley-pm11.pdf
- 同スライド: https://www.midside.com/presentations/declercq_2010_nemcog_slides.pdf
- Temperley (2011) "Scalar Shift in Popular Music", MTO 17.4: https://mtosmt.org/issues/mto.11.17.4/mto.11.17.4.temperley.html
- Temperley (2017) "Mediant Mixture and 'Blue Notes'", MTO 23.1: https://mtosmt.org/issues/mto.17.23.1/mto.17.23.1.temperley.html
- Open Music Theory「Modal Schemas」: https://viva.pressbooks.pub/openmusictheory/chapter/modal-schemas/
- SoundQuest「パラレル・マイナー」: https://soundquest.jp/quest/chord/chord-mv2/parallel-minor/
- DTMハイパー初心者講座「借用和音」: https://dtm-hyper.com/arrange/borrowedchord.html
- NOVENG MUSiQ「iv・♭VI・♭VII の安全な入れ方」: https://note.com/noveng_musiq/n/ne96b5734b0b3
- Wikipedia「王道進行」: https://ja.wikipedia.org/wiki/王道進行
- 社内: `docs/research/2026-07-06-vocaloid-folk-study.md`（i–♭VI–♭VII エオリアン核）
