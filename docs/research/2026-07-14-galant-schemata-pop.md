# ガラント・スキーマを「2声骨格テンプレ辞書」に落とす — ポップス転用可能性の判定（M10）

- 作成: 2026-07-14
- 種別: research（理論研究＋設計含意）
- 目的: Gjerdingen のガラント・スキーマ理論を、本ツールの「メロ骨格（スケール度数の2拍単位構造線・downbeatアンカー）＋ベースライン」という2声骨格モデルに接続し、句単位の骨格候補プール（テンプレ辞書）として実装する妥当性を判定する。
- 立場: 思想「機械は候補まで、仕上げは人間」。スキーマは**足場テンプレ**であり完成形ではない。

---

## 0. 要旨（結論先出し）

- ガラント・スキーマは、まさに本ツールが持つべきデータ構造そのもの＝**「上声度数列 × 下声度数列 × 拍配置 × 機能（開始/中間/終止） × 連結文法」**の4声部要約（実際は主に2声：ソプラノとバス）で定義される。18世紀の職人が「限られた定型の組合せで書く」ために使った暗黙知を、明示的なテンプレ辞書に落としたものが Gjerdingen の仕事であり、本ツールの狙いと構造的に一致する。
- **ポップスでも骨格レベルでは生き残っている**。特に Prinner（上声 6-5-4-3／バス 4-3-2-1 の平行10度下行）と Romanesca 系（バス下行 1-5-6-3…）は、現代ポップの4和音ループ（axis / I–V–vi–IV、doo-wop、カノン進行）の**バス配線と一致**する。ただし18世紀の「機能＝開始/終止の文法」は、ポップのループ的・非終止的和声観（Nobile, Doll）では**弱まる/組み替わる**。→ スキーマは「バス＋対位の骨格テンプレ」として転用可、「終止文法エンジン」としてはそのまま転用不可。
- **J-pop（王道進行 IVM7–V7–iii7–vi、小室進行 vi–IV–V–I）**は、スキーマ単体では説明しきれないが、**Prinner の下行10度＋Fonte/Monte の下降シーケンス感覚＋Cadence 図式**の合成として骨格対を近似できる。特に王道進行のバス 4-5-3-6 は「Prinner 頭（4→…）＋偽終止（V→vi）」のハイブリッドとして骨格化できる。
- **実装判定: GO（限定つき）**。スキーマ辞書を「句単位の骨格候補プール」として現行のランダムウォーク＋フォーム回帰に差すのは有効。ただし押し付け防止のため、(a) 度数は**移調・旋法適応・装飾許容**の抽象テンプレに正規化、(b) スキーマ選択は確率的＋フォーム役割（Aメロ=opening系, サビ=cadence多用）でバイアス、(c) 連結文法は**ソフト制約**（違反ペナルティ）に留める。

---

## 1. 主要スキーマのカタログ化（2声骨格テンプレ）

Gjerdingen 記法の約束: 各スキーマは 2〜4 個の「ステージ（event）」の連なりで、各ステージにソプラノ度数とバス度数を割り付ける。度数は 1..7（旋法音）。強拍/弱拍の交替（metric）で「どのステージが小節頭（downbeat）に来るか」が決まる。以下、`S:` = ソプラノ（上声）度数列、`B:` = バス（下声）度数列、`拍:` = 強弱配置、`機能:` = 句内位置。

出典（度数の要約は下記に依拠、細部は Gjerdingen 2007 *Music in the Galant Style* 各章）:
Wikipedia "Galant Schemata" <https://en.wikipedia.org/wiki/Galant_Schemata> / Open Music Theory "Galant Schemas" <https://viva.pressbooks.pub/openmusictheory/chapter/galant-schemas/> / Gjerdingen ch.2 "The Romanesca"（PDF）<https://music.arts.uci.edu/abauer/5.2/readings/Gjerdingen%20_Music_in_the_Galant_Style_Ch_2.pdf>

### 1-A. 開始（Opening gambit）
| ID | S（上声） | B（下声） | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Romanesca** | 1 – 7 – 1 – (5/1) | 1 – 5 – 6 – 3 | 強-弱-強-弱 | 開始 | バス下行が本体。leaping/stepwise/galant の3変種。上声は 1・5 を強調 |
| **Do–Re–Mi** | 1 – 2 – 3 | 1 – 7 – 1（or 1–5–1） | 強-弱-強 | 開始 | 1→3 への段階上行。堂々とした開始 |
| **Meyer** | 1 – 7 ‖ 4 – 3 | 1 – 2 ‖ 7 – 1 | 弱-強‖弱-強 | 開始 | 「開＝1-7 / 閉＝4-3」の対。構造的主題に人気 |
| **Jupiter**（Meyer変種） | 1 – 2 ‖ 4 – 3 | 1 – 2 ‖ 7 – 1 | 弱-強 | 開始 | モーツァルト40/41番 |
| **Sol–Fa–Mi** | 5 – 4 ‖ 4 – 3 | 1 – 2 ‖ 7 – 1 | 弱-強 | 開始 | Meyer より控えめ |
| **Aprile / Pastorella** | 3 – 2 ‖ 4 – 3 | 1 – 2 ‖ 7 – 1 | 弱-強 | 開始 | Meyer 族 |

### 1-B. 中間・応答（Continuation / riposte）
| ID | S | B | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Prinner** | 6 – 5 – 4 – 3 | 4 – 3 – 2 – 1 | 強-弱-強-弱 | 中間（応答=riposte） | **平行10度下行**。開始への「返し」。最重要 |
| **Modulating Prinner** | 2 – 1 – 7 – 6（新調） | 7 – 6 – 5 – 4 | – | 中間 | V へ転調する変種 |
| **Fonte** | 4 – 3 ‖ 4 – 3（下方反復） | 7 – 1 ‖ (7–1) 一段下 | 弱-強 | 中間（下降シーケンス） | ii をトニック化→I。上声 3-2 / 2-1 とも記述 |
| **Monte** | 5 – 4 – 3 ‖ 一段上反復 | 7 – 1 ‖ 一段上 | 弱-強 | 中間（上昇シーケンス） | Fonte の上行版 |
| **Fenaroli** | 4 – 3 – 7 – 1（or 7-1-4-3） | 7 – 1 – 2 – 3 | 弱-強 | 中間/前終止 | バス上行。ペダル的にも |
| **Ponte** | 5 – 7 – 2（and back） | 5 – 5 – 5 | 強-弱 | 中間（V保続） | ドミナント延長＝「橋」 |

### 1-C. 前終止・終止準備（Pre-cadential）
| ID | S | B | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Indugio** | 2 … 4 – 6 – 1 – 7 | 4 … 4 – 4 – #4 – 5 | 強-弱 | 前終止（PD延長→半終止） | サブドミナント（ii6/IV）を引き延ばす「渋滞」 |
| **Comma** | 2 – 7 | 4 – 5 | 弱-強 | 前終止小片 | V への小さな結び |
| **Passo Indietro** | 7 – 1 系（後退） | 4 – 3 | 強-弱 | 前終止 | 「一歩後退」＝終止前の踏み込み直し |

### 1-D. 終止（Cadence）
| ID | S | B | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Cadenza Semplice** | 1 – 2 – 2 – 1 | 3 – 4 – 5 – 1 | 弱-強 | 終止（単純正格） | – |
| **Cadenza Composta** | 1 – 2 – 3 – 2 – 1 | 3 – 4 – 5 – 5 – 1 | 弱-強 | 終止（複合＝6/4-5/3付） | サビ終わり相当 |
| **Cadenza Doppia** | 4 – 3 – 2 – 1 | 5 – 5 – 5 – 1（反復ドミナント） | 強-弱 | 終止（二重） | ドミナントを二度打つ荘重な終止 |
| **Converging cadence** | 7 – 2（上声上行）| 4 – 5（バス上行・♭? #4-5） | – | 半終止 | 開いた終止 |

### 1-E. 後終止・保続（Post-cadential）
| ID | S | B | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Quiescenza** | ♭7 – 6 – 7 – 1 | 1 – 1 – 1 – 1（トニック保続） | 弱-強 | 後終止（トニック延長） | 大終止の後の「静けさ」。♭7 でサブドミ的彩り |
| **Fenaroli（ペダル用法）** | 4-3-7-1 | 1 保続 | – | 保続 | ドミナント/トニックペダル上 |

### 1-F. 悲嘆・特殊
| ID | S | B | 拍 | 機能 | 備考 |
|---|---|---|---|---|---|
| **Morte**（半音下行嘆きバス） | 保続/下行 | ♭下行（例 8-7-♭7-6…） | – | 中間（嘆き） | Sanguinetti/近年研究。lament bass の一種。出典: Cambridge *Eighteenth-Century Music* "The Morte" <https://www.cambridge.org/core/journals/eighteenth-century-music/article/abs/morte-a-galant-voiceleading-schema-as-emblem-of-lament-and-compositional-buildingblock/2CFE5B5CCA0E3F5FA06E07E6943606BD> |

### 1-G. 連結の文法（opening → continuation → cadence）
ガラント句は概ね **[opening] → [continuation/riposte] → [cadence]** の3幕構成。典型連鎖:
- Romanesca / Do-Re-Mi / Meyer（開始）→ **Prinner**（応答）→ Cadenza（終止）
- Meyer 開始 → Fonte または Monte（中間シーケンスで緊張）→ Converging cadence（半終止）→ 反復後 Cadenza Composta（正格終止）
- Prinner は「開始への返答」なので**単独で句頭には立ちにくい**（文法的に前段を要求）。
- Indugio / Ponte は終止直前の**引き延ばし**として cadence の前に差し込む。
- Quiescenza は cadence の**後**にのみ来る（後終止）。
出典: Open Music Theory "Opens and Closes" <https://openmusictheory.github.io/schemataOpensAndCloses> / Yu 2023 "Revisiting the Galant in Gjerdingenian Schemata", *Music Analysis* <https://onlinelibrary.wiley.com/doi/10.1111/musa.12222>

---

## 2. ポップスへの転用実証（どのスキーマが生き残るか）

### 2-A. 4和音ループ＝スキーマのバス骨格の残存
現代ポップの支配的4和音ループは、スキーマのバス配線と直接対応する。
- **Axis / I–V–vi–IV**（Am–F–C–G 等の回転）: Richards は POP 音楽の「Axis progression」を、どの和音から始めても同じ循環をなす**旋法/調中心が曖昧なループ**として理論化。開始/終止の階層を持たない「回転体」である点が18世紀と決定的に違う。出典: Richards, MTO 23.3 <https://mtosmt.org/issues/mto.17.23.3/mto.17.23.3.richards.html> / Wikipedia "I–V–vi–IV" <https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression>
- **Prinner の残存**: 上声 6-5-4-3／バス 4-3-2-1 の平行10度下行は、doo-wop 系や下行クリシェ、そして多くのサビの「落ちていく」旋律骨格に生きている。Open Music Theory は galant schema と現代4和音スキーマを地続きに扱う（"Four-Chord Schemas"）。<https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/>
- **Romanesca の残存**: バス 1-5-6-3（→カノン進行 I–V–vi–iii の頭と一致）。パッヘルベル＝Romanesca 系の子孫であり、J-pop カノン進行の直系祖先。stepwise Romanesca 解説: <https://essaysonmusic.com/the-stepwise-romanesca-the-basics/>

### 2-B. ポップ和声理論との接続（Nobile / Doll）
- **Nobile**（*A Structural Approach to the Analysis of Rock Music*, CUNY 2014／後に OUP 単著）: ロックの和声は「特定和音の同一性」でなく**構文・形式上の機能**で捉えるべきとし、IV・♭VII・II・ある種の I すら V の位置（ドミナント機能）を担いうると論じる。→ スキーマの「機能ラベル（開始/中間/終止）」は**和音名でなく句内位置で定義**すべき、という本ツールの骨格思想を裏づける。出典: <https://academicworks.cuny.edu/gc_etds/83/>
- **Doll**（*Hearing Harmony*）: ポップ進行を「機能（プロット）」の観点で分類。ループの中でも聴き手は緊張/解決の弧を感じる＝スキーマの機能配置は死んでいない、ただし**終止駆動でなくループ内相対**として作動。
- **含意**: 18世紀の「終止文法エンジン」はポップにそのまま移らない。だが「上声×バスの対位テンプレ＋句内での役割」は移る。→ 本ツールは**スキーマを対位テンプレとして採り、終止文法はソフト化**するのが正解。

### 2-C. 生き残り度サマリ
| スキーマ | ポップ残存度 | 生き残る形 |
|---|---|---|
| Prinner | 高 | 下行クリシェ／サビの落下旋律、平行10度 |
| Romanesca | 高 | カノン進行の頭、パッヘルベル系ループ |
| Cadenza（Semplice/Composta） | 中〜高 | セクション末の正格終止感 |
| Fonte / Monte | 中 | 転調ブリッジ、シーケンシャルな上昇/下降サビ前 |
| Do-Re-Mi / Meyer | 中 | Aメロの登り出し骨格 |
| Ponte / Quiescenza | 中 | ドミナント/トニック保続（サビ前の溜め、アウトロ） |
| Indugio | 低〜中 | ビルドアップの「渋滞」（ブレイク前） |
| Fenaroli / Comma / Passo Indietro | 低 | 断片的、意識されにくい |
| Cadenza Doppia / Morte | 死語寄り | 荘重終止/嘆きバスは特殊ジャンル限定 |

---

## 3. J-pop / アニソン文脈（王道進行・小室進行の骨格対）

### 3-A. 王道進行 IVM7 – V7 – iii7 – vi（例: FM7–G7–Em7–Am）
- バス度数: **4 – 5 – 3 – 6**。上声の「王道感」骨格は多くの場合 **1 – 2 – 7 – 1**（度数）や **6 – 5 – 5 – 6** 系（サビ頭で高音保持→落として偽終止で浮く）。
- スキーマ的説明:
  - 頭 IVM7→V7（バス 4→5）は **Indugio/Comma 的な前終止の登り**（サブドミ→ドミナント）。
  - V7→iii7→vi（5→3→6）は**正格終止を裏切る偽終止（V→vi）＋iii を経由する下行**で、Prinner の「4-3-2-1」を**部分的に折り返した**形。純粋スキーマ一発では出ず、**「前終止（Comma/Indugio）＋deceptive cadence」のハイブリッド**として骨格化するのが素直。
- 出典: Royal road progression, Wikipedia <https://en.wikipedia.org/wiki/Royal_road_progression> / 王道進行(4536)解説 <https://akutsuki-music.com/chord7/> / YOASOBI「夜に駆ける」コード考察 <https://note.com/31memomemo/n/n1d261685221e>

### 3-B. 小室進行 vi – IV – V – I（例: Am–F–G–C）
- バス度数: **6 – 4 – 5 – 1**。「マイナー始まり→I で解決」の弧。上声骨格は **1 – 1 – 2 – 3**（登り解決）や **3 – 1 – 2 – 1** 等。
- スキーマ的説明:
  - vi→IV（6→4）は**Prinner の頭（la→…下降10度）の断片**、
  - IV→V→I（4→5→1）は **Cadenza Semplice のバス 4-5-1** そのもの。
  - つまり小室進行は「**Prinner 断片 ＋ 単純正格終止**」の合成としてきれいに骨格化できる。
- 出典: 小室進行(6451)解説 <https://er-music.jp/theory/704/> / <https://trivisionstudio.com/chord-progression-6451/> / アニソン・ボカロ例 <https://utaten.com/live/komuro-progress/>

### 3-C. カノン進行 I–V–vi–iii–IV–I–IV–V
- バス頭 **1-5-6-3** ＝ **Romanesca そのもの**。後半 4-1-4-5 は Prinner 断片＋Cadence。J-pop の「王道の泣き」はガラント Romanesca の直系。

### 3-D. 判定
王道/小室/カノンは、**単一スキーマではなく2〜3スキーマの断片連結**として骨格対（上声×バス）を近似できる。→ 辞書は「フルスキーマ」だけでなく**「半句断片（head/tail fragment）」粒度**も持つべき（後述 §4）。

---

## 4. 2声テンプレ辞書の仕様（実装スキーマ）

各エントリは移調・旋法非依存の抽象度数テンプレ。JSON 例（度数は 1..7、`b`/`#` で変位、`|` はステージ区切り、`~` は装飾許容の骨格音）。

```jsonc
{
  "id": "prinner",
  "role": "continuation",          // opening | continuation | precadence | cadence | postcadence
  "soprano": [6, 5, 4, 3],          // 上声骨格度数（downbeatアンカー音）
  "bass":    [4, 3, 2, 1],          // 下声骨格度数
  "meter":   ["S","W","S","W"],     // 各ステージの強弱（Sが小節頭候補）
  "spanBeats": 8,                    // 2拍/ステージ×4 = 8拍（=4小節 or 2小節、フォーム側で伸縮）
  "counterpoint": "parallel10",     // 上下の対位タイプ（接点UIに直結）
  "prev": ["romanesca","doremi","meyer"],   // 前に来られる（ソフト）
  "next": ["cadenza_semplice","cadenza_composta"], // 後に来られる（ソフト）
  "modeFit": {"major": 1.0, "minor": 0.9},
  "popFreq": "high",                 // high | mid | low | dead
  "tags": ["descent","cliche","10th"]
}
```

辞書に持たせる全カラム:
- **id / role**（機能＝開始/中間/前終止/終止/後終止）
- **soprano[] / bass[]**（骨格度数列。downbeat アンカー）
- **meter[]**（強弱＝どの度数が小節頭に落ちるか）
- **spanBeats / stages**（フォームへ配置する時の伸縮単位）
- **counterpoint**（parallel10 / parallel6 / contrary / pedal など＝**接点表示UIの対位ラベルに直結**）
- **prev[] / next[]**（連結文法。ハード禁止でなく**ソフト遷移確率**）
- **modeFit**（長/短調・旋法適合度）
- **popFreq**（現代ポップ使用頻度感: high/mid/low/dead。§2-C の表を初期値に）
- **fragments**（head/tail の半句断片ID＝王道/小室のような合成用）

初期エントリ（優先実装順）:
1. `romanesca`(open, popFreq:high) 2. `prinner`(cont, high) 3. `cadenza_semplice`/`cadenza_composta`(cad, high/mid) 4. `doremi`(open, mid) 5. `fonte`/`monte`(cont, mid) 6. `ponte`/`quiescenza`(pedal, mid) 7. `meyer`(open, mid) 8. `indugio`(precad, low-mid)。断片: `komuro=prinner_head+cadenza`, `oudou=comma_head+deceptive`。

---

## 5. 生成への結線案（骨格生成にスキーマ辞書を差す）

現行: 骨格は「ランダムウォーク＋フォーム回帰」で度数構造線を引く。ここにスキーマ辞書を**句単位の骨格候補プール**として差す。

### 5-A. パイプライン
```
(1) フォーム役割決定   : section(Verse/Pre/Chorus…) → role分布のバイアス
                         Verse=opening厚め, Pre=continuation/precadence, Chorus=cadence多用+強opening
(2) スキーマ選択(句ごと): role分布 × prev/next遷移確率 × modeFit × popFreq で重み付きサンプル
                         → 句を [open]→[cont]→[cad] のマルコフ鎖で並べる（フォーム回帰＝各セクション末はcadenceへ収束）
(3) フォームへ配置     : 選んだスキーマの spanBeats を、そのセクションの小節数へ伸縮（stage=2拍単位を保持）
                         → soprano[]/bass[] を downbeatアンカーとして刻む（=既存の骨格構造線に一致）
(4) 表面化            : 既存の表面レイヤ（8分/16分/休符/pickup/arc）でアンカー間を装飾
(5) ベース同時決定    : bass[] がそのままベース骨格に落ちる（下記利点）
```

### 5-B. ベースが同時に決まる利点
- スキーマは本質的に**2声（上声×バス）ワンセット**。上声骨格を選んだ瞬間にベース骨格が確定するので、現行の「メロ骨格×ベースの対位（接点）」が**設計上ズレない**。接点UIの対位ラベル（parallel10 等）はスキーマの `counterpoint` を**そのまま表示**でき、「なぜこの強拍が10度なのか」を理論名で説明できる（＝候補提示ツールとして根拠が出せる＝思想適合）。
- ランダムウォークだと上声とベースの整合を後付けで縫う必要があるが、スキーマなら**最初から縫われた対位**が手に入る。

### 5-C. 押し付けがましくなる危険と対策（両論）
危険:
- (a) 度数を literal に貼ると「18世紀くさい」「どの曲も同じ骨格」になる＝機械が完成品を押し付ける（思想違反）。
- (b) 終止文法を強制すると、ループ的ポップ（axis）の非終止感を殺す。
- (c) prev/next をハード制約にすると探索が痩せ、ばらつき（seed違い）が出ない。

対策:
- 度数テンプレは**アンカー骨格のみ**。表面化・オクターブ選択・装飾・pickup は既存レイヤに任せ、**同じスキーマでも表面で別物**にする。
- 連結文法は**ソフト（遷移確率＋違反ペナルティ）**。「Prinner を句頭に置く」等の破格も低確率で許し、seed 差でバリエーションを出す（メモリ:サンプルは複数seed/進行違い）。
- popFreq と section バイアスで「死語スキーマ（Cadenza Doppia/Morte）」は既定で沈める。ユーザーが明示選択したときだけ浮かせる。
- スキーマ由来はあくまで**候補の1系統**。ランダムウォーク骨格・コーパス辞書骨格（既存 phrase 辞書）と**並べて出す**（機械は候補まで）。ユーザーが選んで人間が仕上げる。
- **旋法適応**: modeFit で長短を切替え、Prinner 6-5-4-3 は自然短調なら ♭6-5-4-♭3 に自動変位。ポップの旋法（ドリアン/ミクソ）へは §2-B の「和音名でなく機能」原則で緩く写像。

### 5-D. 既存資産との関係
- 既存の**phrase 辞書（period/sentence, 4小節句）**は「表面〜中景の実旋律統計」、スキーマ辞書は「骨格〜対位の理論テンプレ」。**層が違うので共存**。スキーマで骨格を張り→phrase 辞書で表面を装飾、の二段が理想。
- 接点表示UI（メロ骨格×ベース強拍の音程）は、スキーマ導入で「対位ラベルの根拠名（Prinner/平行10度）」を得る＝**説明性が上がる**。

---

## 6. サンプル：スキーマ連結の8小節2声骨格（度数テキスト、3本）

記法: 各小節を `|` 区切り。1小節=2ステージ（強拍/裏拍相当の骨格2点、2拍単位アンカー）。`S=`上声, `B=`下声。度数は音階度（長調基準、括弧は旋法変位）。

### サンプル1: 王道J-pop風（Romanesca → Prinner → Cadenza Composta）
```
小節:   1        2        3        4        5        6        7        8
S:    1  7  |  1  5  |  6  5  |  4  3  |  1  2  |  3  2  |  1  2 3| 2  1
B:    1  5  |  6  3  |  4  3  |  2  1  |  3  4  |  5  5  |  1  1  | 5  1
       └Romanesca(開始)─┘ └──Prinner(応答)──┘ └───Cadenza Composta(終止)───┘
対位:  10度基調 →         平行10度下行 →        4-5-1 正格終止
```

### サンプル2: 小室進行系マイナー（Prinner断片 → Comma/前終止 → 偽終止で浮かす → 正格）
```
小節:   1        2        3        4        5        6        7        8
S:   b3  b3 |  1  1 |  2  2  | b3 b3 |  2  7 | b3  1 |  2  2  | 1  1
B:    6   6 |  4  4 |  5  5  |  1  1 |  4  5 |  6  6 |  5  5  | 1  1
      vi     IV     V       I(小室一周) IV-V  vi(偽終止) V     I(正格で締め)
      └───小室=Prinner頭+Cadence───┘ └──前終止→deceptive→正格終止──┘
対位:  6→4=下行, 4-5-1=Cadenza Semplice バス
```

### サンプル3: 転調ブリッジ風（Do-Re-Mi開始 → Fonte下降シーケンス → Converging半終止）
```
小節:   1        2        3        4        5        6        7        8
S:    1  2  |  3  3  |  4  3  |  3  2  |  4  3(調下) |2 1| 7  2  | 2  —
B:    1  7  |  1  1  |  7  1  |  6  5(下段) |7  1 |  6 5|  4  5  | 5  —
       └Do-Re-Mi(開始 1→3)┘ └───Fonte(下降ゼクエンツ、二段目一歩下)───┘ └Converging半終止(→V開放)┘
対位:  上行10度 → 下降シーケンスで緊張蓄積 → 7-2/4-5 で開いて次句へ
```

（いずれも**アンカー骨格**。実運用では表面化レイヤで8分/16分・pickup・arc を付与し、同一骨格から複数seedで別旋律を出す。ベースは B 行がそのまま骨格になる。）

---

## 7. 設計含意（まとめ）

1. **データ構造は流用可**: スキーマ＝(soprano[], bass[], meter[], role, prev/next, counterpoint) は本ツールの骨格＋対位モデルにそのまま乗る。→ 辞書化 GO。
2. **機能はロールラベルで、和音名でなく句内位置で**（Nobile 支持）。ポップのループ和声にも移植可能になる。
3. **連結文法はソフト制約**（マルコフ＋ペナルティ）。ハード化は押し付け・ばらつき喪失を招く。
4. **フル＋断片の二粒度**を持て。王道/小室/カノンは断片合成でしか綺麗に出ない。
5. **ベース同時確定が最大の利点**＝接点UIと設計整合。対位ラベルに理論名が付き、説明性（候補提示ツールの根拠）が上がる。
6. **表面はスキーマに任せない**。同一骨格×複数seedで別物にするのが「18世紀くささ」回避の要。
7. 既存 **phrase 辞書（表面統計）とスキーマ辞書（骨格理論）は層違いで共存**。骨格=スキーマ→表面=phrase の二段化が理想の次スライス。

---

## 出典一覧（URL）
- Gjerdingen, *Music in the Galant Style* (Oxford, 2007) 概要: <https://global.oup.com/academic/product/music-in-the-galant-style-9780190095819>
- Gjerdingen ch.2 "The Romanesca"（PDF, UC Irvine）: <https://music.arts.uci.edu/abauer/5.2/readings/Gjerdingen%20_Music_in_the_Galant_Style_Ch_2.pdf>
- Wikipedia "Galant Schemata"（各スキーマの度数要約）: <https://en.wikipedia.org/wiki/Galant_Schemata>
- Open Music Theory "Galant Schemas": <https://viva.pressbooks.pub/openmusictheory/chapter/galant-schemas/>
- Open Music Theory "Schemata — Opens and Closes"（連結文法）: <https://openmusictheory.github.io/schemataOpensAndCloses>
- Open Music Theory "Four-Chord Schemas"（ポップ4和音との接続）: <https://viva.pressbooks.pub/openmusictheory/chapter/4-chord-schemas/>
- Yu, "Revisiting the Galant in Gjerdingenian Schemata", *Music Analysis* 2023: <https://onlinelibrary.wiley.com/doi/10.1111/musa.12222>
- "The Morte: A Galant Voice-Leading Schema…", *Eighteenth-Century Music* (Cambridge): <https://www.cambridge.org/core/journals/eighteenth-century-music/article/abs/morte-a-galant-voiceleading-schema-as-emblem-of-lament-and-compositional-buildingblock/2CFE5B5CCA0E3F5FA06E07E6943606BD>
- Nobile, *A Structural Approach to the Analysis of Rock Music* (CUNY, 2014): <https://academicworks.cuny.edu/gc_etds/83/>
- Richards, "Tonal Ambiguity in Popular Music's Axis Progressions", *MTO* 23.3: <https://mtosmt.org/issues/mto.17.23.3/mto.17.23.3.richards.html>
- Wikipedia "I–V–vi–IV progression"（axis）: <https://en.wikipedia.org/wiki/I%E2%80%93V%E2%80%93vi%E2%80%93IV_progression>
- "The Stepwise Romanesca: The Basics", Essays on Music: <https://essaysonmusic.com/the-stepwise-romanesca-the-basics/>
- Wikipedia "Royal road progression"（王道進行）: <https://en.wikipedia.org/wiki/Royal_road_progression>
- 王道進行(4536)解説（あくつき音楽）: <https://akutsuki-music.com/chord7/>
- YOASOBI「夜に駆ける」コード考察（王道系メロと度数）: <https://note.com/31memomemo/n/n1d261685221e>
- 小室進行(6451)解説（ER-MUSIC）: <https://er-music.jp/theory/704/>
- 小室進行とアニソン・ボカロ例: <https://utaten.com/live/komuro-progress/> / <https://trivisionstudio.com/chord-progression-6451/>
</content>
</invoke>
