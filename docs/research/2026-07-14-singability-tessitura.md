# 歌いやすさの定量境界：声域・tessitura・歌唱難度（M7）

- 日付: 2026-07-14
- 種別: 外部調査＋理論研究（声楽・歌唱科学）
- 目的: メロ候補生成で「人が歌えないメロ」を候補段階で弾く／ボカロモードでは制約を外すための、**声域・tessitura・歌唱難度の定量境界**を確定する。
- 前提（既調査・再調査不要）: 句境界の呼吸 ≈ 0.7秒（Salomoni 2016）、句末長音化は歌の普遍（Tierney PNAS 2011）。本稿は **音域・tessitura・難度の定量化**に絞る。
- 思想: 「機械は候補まで、仕上げは人間」。本稿の数値は**足切り＝候補のふるい**であって、良し悪しの断定ではない。境界近傍はソフト減点にとどめる。

---

## 0. 用語と記号

- **音名表記**: 本稿は科学的表記（C4 = 中央ハ = 261.6 Hz）を主に用い、括弧で日本のカラオケ表記（mid1C=C3、mid2C=C4、hiC=C5、hihiC=C6 の並び）を併記する。
  - 対応: C3=mid1C / A3=mid1A / C4=mid2C / A4=hiA / C5=hiC / F5=hiF / C6=hihiC。
- **音域 (range)**: 最低音〜最高音の全幅。「一瞬でも出せる」端点を含む。
- **tessitura（テッシトゥーラ／声の重心）**: 曲がメロの**大半の時間を滞在する音高帯**。声種分類では range より tessitura の方が重要とされる（KT Vocal Studio ほか）。
- **パッサッジョ (passaggio)**: 地声（modal/chest）↔ 中声/裏声（head/mix）の切替点。primo passaggio（第一）＝胸声→中声、secondo passaggio（第二）＝中声→頭声。**跳躍がこの点をまたぐと難しい**。

---

## 1. 声種別の実用音域（ポップス実態）

クラシックの声種（ソプラノ〜バス）は「訓練された端点」を含み、ポップスの実用レンジより広い。作曲支援の既定値は**ポップスの実用帯**＝地声中心・8割の曲が収まる帯を採る。

### 1-1. クラシック声種の平均レンジと tessitura（参照上限）

| 声種 | 平均レンジ | Hz | tessitura（快適帯） |
|---|---|---|---|
| ソプラノ | C4–C6 | 261.6–1046.5 | C5–A5 |
| メゾソプラノ | G3–B5 | 196–987.8 | A3–G5 |
| アルト | E3–G5 | 164.8–784 | F3–E5 |
| テノール | C3–C5 | 130.8–523.3 | D3–B4 |
| バリトン | A2–A4 | 110–440 | B2–G4 |
| バス | E2–E4 | 82.4–329.6 | F2–D4 |

出典: vocalrangetester.com（Average Vocal Range）。

### 1-2. ポップス実用レンジ（地声/裏声の別・日本のJ-pop実態）

弾き語りすとLABO（男女別・低め/平均/高め）より。**「平均」帯が J-pop の約8割をカバー**。裏声（ファルセット/ミックス）の上端を併記。

**女性**（地声上端 / 裏声上端）
| 区分 | 最低音 | 地声上端 | 裏声上端 |
|---|---|---|---|
| 低め | F3 (mid1F) | C5 (hiC) | D5 (hiD) |
| 平均 | G3 (mid1G) | D5 (hiD) | E5 (hiE) |
| 高め | A3 (mid1A) | E5 (hiE) | F5 (hiF) |

**男性**（地声上端 / 裏声・ミックス上端）
| 区分 | 最低音 | 地声上端 | 裏声上端 |
|---|---|---|---|
| 低め | C3 (mid1C) | F#4 (mid2F#) | B4 (hiB) |
| 平均 | D3 (mid1D) | A4 (hiA) | D5 (hiD) |
| 高め | F3 (mid1F) | Db5 (hiC#) | F5 (hiF) |

- 女性の曲は多くが**1.8オクターブ以内**に収まり、幅より「発声コントロール（息の安定・声帯閉鎖）」が支配的。
- 男性の未訓練者は実用**約1.5オクターブ**、訓練目標が2オクターブ（D3–D5）。現代J-popは歴史的水準より高音化傾向。
- 男性J-popの「標準的サビ最高音」は **hiA (A4) 付近**が一つの壁（ここを超えると歌える人が急減、というカラオケ音域サイトの選曲区分と整合）。

出典: 弾き語りすとLABO（女性 / 男性）、onikichosa.com（hiAで選曲幅が広がる＝A4が実用上限の目安）。

### 1-3. パッサッジョ（地声/裏声の境界＝難所）

| 声区 | primo passaggio（第一） | secondo passaggio（第二） |
|---|---|---|
| 男性（テノール系） | C#4–E4（lyric ≈ D4） | F#4–A4（lyric tenor ≈ G4） |
| 女性（ソプラノ系） | Eb4–G4（≈ Eb4） | Eb5–G5（C#5–F#5） |

- ポップス実務では男性 **E4–B4**、女性 **Bb4–F5** あたりを「切替が起きる帯（ミックス要求域）」として扱う流儀もある（sagemusic 等）。
- 設計含意: **跳躍がパッサッジョをまたぐ**と難度が跳ね上がる。特に下から上へこの帯を**跳んで越える**（跳躍着地がパッサッジョ上）のが辛い。難度スコアの主要因に採用（§3, §4）。

出典: en.wikipedia.org/wiki/Passaggio、sagemusic.co、singwise.com。

---

## 2. tessitura の定量定義

### 2-1. 定義（本ツールでの操作的定義）

tessitura = メロの**音高滞在分布の重心と広がり**。音符ごとに (音高 × その音の持続長) で重み付けした分布を作り、

- **重心 (T_center)** = Σ(pitch_i × dur_i) / Σ(dur_i)（デュレーション重み付き平均音高）
- **滞在帯 (T_band)** = 累積デュレーションの 10〜90 パーセンタイル音高（曲が実際に「居る」帯）
- **端点滞在率** = レンジ上端3半音以内 / 下端3半音以内に滞在する累積デュレーション比率

「range が広くても tessitura が狭ければ歌いやすい」を捉えるため、**range より T_band を主指標**にする（Ammirante & Russo, KT Vocal Studio と整合）。

### 2-2. 快適 tessitura の位置（声種別・§1の tessitura 列を採用）

各声種の tessitura 列（例: 女性平均域なら A3–D5 相当、男性平均域なら D3–A4 相当）に **T_band が収まれば快適**。目安として:

- **快適**: T_center が声種 tessitura の中央 ±2〜3半音、T_band が tessitura 内。
- **やや疲労（高すぎ）**: T_center が secondo passaggio 以上に張り付く。高音側は「一瞬なら映えるが滞在すると疲れる」。
- **やや疲労（低すぎ）**: T_center が最低音+2半音以内に張り付く。低音は音量・明瞭度が出ず、地声下端は声帯閉鎖が甘くなり不明瞭。

### 2-3. 音域端に滞在してよい時間の目安（設計上のヒューリスティック）

厳密な公式は文献に存在しない（歌唱の vocal load 研究は「2時間タスク」等の長時間スケールで、フレーズ内秒数の閾値は未確立）。ただし生理から次の設計値を置く（**要・耳較正**、思想どおりソフト減点）:

- **高音（secondo passaggio 以上・レンジ上端3半音以内）**: 連続滞在は概ね **1フレーズ（≈2〜4秒）まで**を快適上限とし、以降は減点。長い保持音を上端に置くのは「山場の一撃」に限定するのが自然。
- **超高音（レンジ上端 or それ超）**: **単発ヒット（1音・長くて1拍）**向き。ここに滞在させない。
- **高音の連続（サビで上端付近を何小節も）**: 累積で疲労域。上端滞在率が高いほど累積減点。
- 生理的根拠: 高ピッチ・大音量の持続は声帯の摩擦熱・接触圧を上げ、粘性上昇→必要呼気圧増→（女性は前部声門隙間）で疲労が加速する（vocal fatigue 研究）。フレーズ間の 0.7秒 呼吸（既調査）で回復窓を確保できる設計なら緩和される。

出典: nature.com（voice fatigue subtyping, 2025）、PMC8758045（Physical Aspects of Vocal Health）、blog.rayvox.co.uk。

---

## 3. 歌唱難度の要因（定量化のための因子）

歌唱難度は複数因子の和。主要因は **跳躍・音域端・音節密度・母音×高音**。

### 3-1. 跳躍幅 × 方向（vocal constraints）

- 小さい音程は大跳躍より容易（速度–正確性トレードオフ：単一の声帯セットからの大跳躍は制約される）。
- **非対称（Ammirante & Russo）**: 声域の**低部での跳躍は声楽で相対的に多い**が、**中〜高部での跳躍は避けられる**。→ 高い所での大跳躍ほど辛い。難度は「跳躍幅 × 着地音高（高いほど重い）」の積で効かせる。
- **上行大跳躍**が特に難しい（下行より）。方向係数で上行を重くする。
- **パッサッジョまたぎ**（§1-3）の跳躍は追加ペナルティ。

出典: Ammirante & Russo「Towards a Vocal Constraints Model of Melodic Expectancy」(2023, Music & Science)、同 corpus study（跳躍分布の声楽的制約）。

### 3-2. 速いパッセージでの音節密度

- 等時・規則的なリズムは可変リズムより歌いやすく記憶しやすい。
- **音節密度**（音節/秒）が高い＝早口ほど難。とくに **1拍に16分4つ（≈170–185 BPM の詰め込み）** は人間には高負荷（ボカロ実態、§5）。
- テンポ × 音符密度 × 子音連続（日本語なら開音節優位で緩和されるが、子音クラスタは負荷）。

### 3-3. 母音と高音の関係（母音×ピッチ）

- **高音で狭母音（/i/ /u/ = closed vowels）は辛い**。狭母音は第一フォルマント(R1)が低く、上昇する f0 と衝突する。前寄り母音は高音で相対的に楽、後ろ寄りは低音で楽。
- ソプラノは E5 以上で**母音修正（aggiustamento）＝顎を開け舌を下げ R1 を f0 に追従**させる。結果、**高音では母音の明瞭度が犠牲**になる（R1:f0 チューニング）。
- 設計含意: 歌詞が乗る場合、**サビ最高音に /i//u/ を割り当てるメロ候補は減点**（または歌詞側に「開母音を推奨」フラグ）。ボカロは母音修正不要なので緩和（§5）。

出典: Chan & Do (2021)「Vowel Modification (Aggiustamento) in Soprano Voices」Music & Science、lloydwhanson.com（Soprano Formant Change）、singwise.com、voicescience.org（Formant Tuning）。

### 3-4. 音域端での跳躍

- レンジ端に**跳んで着地**（特に上端へ上行跳躍）は 3-1 + §1-3 の複合で最難。単発ヒットならOK、連発は不可。

---

## 4. 既存の歌唱難度／singability 指標

文献で共有される難度因子（歌唱合成・視唱・作曲研究の合流）:

- 一般的難度因子: 長さ・音高レベル・音域幅・音程幅・旋律的整合(congruity)・リズム複雑度・速度・反復。（Iowa State “Melodic Material” ほか教育リソース）
- **Ammirante & Russo の vocal constraints モデル**: メロ期待は声楽的に制約され、次の音は「歌える音（modal register 内の絶対音高）」が期待される。跳躍は低域で許容・中高域で回避、大跳躍は速度–正確性で制約。→ **難度＝modal register からの逸脱 × 跳躍 × 音高位置**として定式化できる。
- 歌唱合成の評価軸: pitch/F0 accuracy、duration RMSE、intelligibility、singability（歌詞リズムとメロリズムの整合）。→ 本ツールの「歌える候補」判定は intelligibility（母音×高音）と singability（音節×リズム）に対応。

**まとめ（本ツールの合成難度）**: `D = w1·跳躍項 + w2·音域端/tessitura項 + w3·音節密度項 + w4·母音×高音項 + w5·パッサッジョまたぎ項`。各項は §3 の因子から算出、重みは耳較正で調整（初期値 §6-1）。

出典: Ammirante & Russo (2023) doi:10.1177/20592043231179410、iastate.pressbooks.pub（Melodic Material）、arxiv 2601.13910（Singing Voice Synthesis review）。

---

## 5. ボカロ例外（人声制約を外す）

ボカロは声帯・呼吸・母音修正の生理制約が無い。実態統計（ランキング上位＝人気曲の傾向）:

- **音域**: TOP級で **hihiC (C6) 到達**（例: シャルル, グッバイ宣言）。多くが **hiG〜hiG#** をピーク。全体に **J-pop より高い声区**を要求。広い音域の曲ほど人気傾向。
- **テンポ/密度**: ハイテンポ系の定番が **170–185 BPM**、**1拍=16分4つ**の詰め込み。人気曲は普通のボカロ曲より「発声時間が短い・テンポが速い・早口・リズムのばらつきが大きい」。
- **人間との差**: 人気ボカロは人が歌う曲より**テンポ高・発声時間短**。「人間が出せない高音」が個性・強み。

→ ボカロモードでは **上端を大幅に開放（〜C6/hihiC）**、**跳躍・音節密度・母音×高音のペナルティを大幅減または無効化**する（§6-3）。ただし「カラオケで歌う前提のボカロ曲」も存在するため、モードは二段（人間可 / フルボカロ）にできると実務的。

出典: 三浦ほか「ボーカロイドの人気曲における歌詞とメロディの関係の解析」(CiNii, 週刊VOCALOIDランキング 2007–2011 分析)、blaxeason.com（ボカロ音域TOP50）、core-ms.net（170–185 BPM/16分詰め込み）、vocapitch.com（ぼかぴ 音域DB）、ja.wikipedia ボカロ。

---

## 6. 成果物：仕様と既定値表

### 6-1. 歌唱難度スコア仕様（singability difficulty）

音符列（pitch, onset, dur, 任意で lyric母音）と **対象声種プロファイル**（§6-2）を入力に、0（易）〜1（難/不可）を返す。

| 項 | 算出 | 効かせ方（初期重み） | 備考 |
|---|---|---|---|
| range_fit | 音域端超過（半音数） | 上端超過は強、下端超過は中。端超えは**ハード寄り**（候補足切り候補） | 一瞬の単発は緩和 |
| tessitura | T_center/T_band と声種tessituraの乖離、端点滞在率 | w=0.20 | §2。滞在長で累積 |
| leap | 跳躍幅×着地音高×方向（上行重い）×パッサッジョまたぎ | w=0.30（最重） | §3-1, §3-4 |
| syllable_density | 音節/秒（テンポ×音符密度） | w=0.20 | §3-2。閾≈ 8分×高速/16分連続 |
| vowel_high | 高音(secondo passaggio超)×狭母音(/i//u/) | w=0.15 | §3-3。歌詞無ければ0 |
| passaggio | またぎ回数・またぎ保持 | w=0.15 | §1-3 |

- 出力運用: **端超え・超高音単発以外の連続・大跳躍着地が上端** の複合が閾値超で「候補から外す/警告」。それ以外は**ソフト減点で並べ替え**（弾きすぎない＝思想遵守）。
- 全重みは **耳較正で調整**（本稿値は初期値）。

### 6-2. 声種別レンジ・tessitura 既定値表（人間モード既定）

「平均」帯を既定、地声上端を実用上限、裏声上端を「単発なら可」の上端とする。

| プロファイル | 最低音 | tessitura（快適 T_band 目標） | 地声上端（実用上限） | 裏声/ミックス上端（単発可） | パッサッジョ帯 |
|---|---|---|---|---|---|
| 女性・平均（既定・女声） | G3 (mid1G) | A3–D5 | D5 (hiD) | E5 (hiE) | Bb4–F5 / secondo Eb5–G5 |
| 女性・低め | F3 | F3–C5 | C5 (hiC) | D5 (hiD) | 同上やや下 |
| 女性・高め | A3 | B3–E5 | E5 (hiE) | F5 (hiF) | 同上 |
| 男性・平均（既定・男声） | D3 (mid1D) | D3–A4 | A4 (hiA) | D5 (hiD) | E4–B4 / secondo F#4–A4 |
| 男性・低め | C3 | C3–F#4 | F#4 (mid2F#) | B4 (hiB) | 同上やや下 |
| 男性・高め | F3 | F3–Db5 | Db5 (hiC#) | F5 (hiF) | 同上 |

- **既定値の意味**: T_band がこの tessitura に収まる候補を優先。地声上端超は減点開始、裏声上端超は「単発ヒット限定」、それ以上は人間モードでは足切り。
- 端滞在の目安（§2-3）: 上端3半音以内の連続滞在 > 1フレーズ（≈2–4秒）で減点、超高音は単発（≤1拍）。

### 6-3. ボカロモード緩和表

| 因子 | 人間モード | ボカロモード（緩和後） |
|---|---|---|
| 上端 | 声種の裏声上端（例 hiD/hiE） | **hihiC (C6) まで開放**（フルボカロ）。「歌える前提ボカロ」は hiF 程度に留める二段目 |
| range_fit ペナルティ | 端超えハード寄り | 大幅緩和（上端 C6 まで無罰、超で軽微） |
| leap（跳躍） | 大跳躍・上行・またぎに強ペナ | **ペナルティ 0〜大幅減**（声帯制約なし） |
| syllable_density | 8分高速/16分連続で減点 | **170–185 BPM・16分4連まで無罰**（早口が個性） |
| vowel_high（母音×高音） | 高音×狭母音を減点 | **無効化**（母音修正不要） |
| passaggio またぎ | 減点 | **無効化**（声区が無い） |
| tessitura | 快適帯で誘導 | 広域を許容（広音域＝人気傾向を尊重）。ただし「山場設計」の観点は残す |

---

## 7. 設計含意（このツールへの落とし込み）

1. **主指標は tessitura（T_band/T_center）＝ range ではない**。「広いが狭く居る」メロを正しく易しく評価する。
2. **難度スコアはソフト減点が基本、足切りは複合条件のみ**（端超え連続＋上行大跳躍着地が上端 等）。思想「機械は候補まで」を守り、弾きすぎない。
3. **跳躍項が最重**（w=0.30）。幅だけでなく **着地音高・上行/下行・パッサッジョまたぎ**を掛ける（Ammirante & Russo）。
4. **歌詞があるときだけ母音×高音項が生きる**。サビ最高音に /i//u/ を置く候補は減点 or 「開母音推奨」フラグを返す。歌詞前なら 0。
5. **声種プロファイルを frame の宣言に足す**（key/mode と同様に voice_profile を持たせ、生成→評価→再生を貫通）。既定は男性平均/女性平均。
6. **ボカロモードは frame フラグ一つ**で §6-3 の緩和表を適用。二段（人間可/フルボカロ）にすると実務的。
7. **端滞在時間・重みは全て要・耳較正**。本稿の秒数/重みは初期値。品質変更後は耳確認（MEMORY 方針）。
8. 呼吸 0.7秒（既調査）と接続: 高音連続の疲労は**フレーズ間 0.7秒の回復窓**があれば緩和。難度項と呼吸配置を連動させると自然。

---

## 出典（URL）

- vocalrangetester.com Average Vocal Range: https://vocalrangetester.com/average-vocal-range/
- KT Vocal Studio, Ranges and Tessitura for the Contemporary Voice: https://ktvocalstudio.com/ranges-tessitura-contemporary-voice/
- 弾き語りすとLABO 女性の音域: https://hikigatarisuto-labo.jp/female-vocal-range/
- 弾き語りすとLABO 男性の音域: https://hikigatarisuto-labo.jp/high-pitched-tone-j-pop-men/
- カラオケ音域調査（hiAで選曲幅）: https://onikichosa.com/oke-hia-pop/
- Passaggio (Wikipedia): https://en.wikipedia.org/wiki/Passaggio
- Sage Music, The Passaggio: https://www.sagemusic.co/blog/passaggio-important-part-singing-voice/
- SingWise, Vocal Range/Registers/Voice Type: https://www.singwise.com/articles/understanding-vocal-range-vocal-registers-and-voice-type-a-glossary-of-vocal-terms
- Ammirante & Russo (2023), Towards a Vocal Constraints Model of Melodic Expectancy, Music & Science: https://doi.org/10.1177/20592043231179410
- Chan & Do (2021), Vowel Modification (Aggiustamento) in Soprano Voices, Music & Science: https://journals.sagepub.com/doi/10.1177/20592043211055168
- Lloyd W. Hanson, Soprano Formant Change: https://lloydwhanson.com/formants-made-easy/soprano/soprano-formant-change/
- SingWise, Vowels/Formants/Modifications: https://www.singwise.com/articles/vowels-formants-modifications
- Voice Science, Formant Tuning: https://www.voicescience.org/lexicon/formant-tuning/
- Iowa State, Melodic Material: Range, Interval, Gesture: https://iastate.pressbooks.pub/comprehensivemusicianship/chapter/7-1-melodic-material-tutorial/
- Synthetic Singers review (arXiv): https://arxiv.org/pdf/2601.13910
- 三浦ほか「ボーカロイドの人気曲における歌詞とメロディの関係の解析」(CiNii): https://cir.nii.ac.jp/crid/1050292572119204096
- ボカロ音域データTOP50 (Blackseason): https://blaxeason.com/rank-vocalo/
- ぼかぴ ボカロ最高音・音域DB: https://vocapitch.com/
- ボカロ調楽曲の作り方（170–185 BPM）: https://core-ms.net/2026/06/29/vocaloid-style-production/
- Voice fatigue subtyping (Nature Sci Rep 2025): https://www.nature.com/articles/s41598-025-10565-2
- Physical Aspects of Vocal Health (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC8758045/
