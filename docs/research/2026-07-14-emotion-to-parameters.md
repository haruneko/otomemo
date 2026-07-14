# 感情 → 音楽パラメータ変換表（E1）

- 作成: 2026-07-14
- 目的: 「切ない曲がほしい」等の**感情語**を、生成エンジンが受け取れる**具体パラメータ**（key/mode・tempo・register・density・swing・articulation・和声語彙・エネルギー設計）へ翻訳する変換規則と根拠を確定する。
- 思想整合: 「機械は候補まで・仕上げは人間」。本表は**初期プリセット＝足場**であって完成形ではない。個人差・文脈依存が大きいので、必ず複数バリエーション（seed違い・進行違い）で提示し、最終判断は耳に委ねる（§6 過信警告）。

---

## 1. 基盤：どのモデルで感情を受けるか

### 1.1 結論＝「二次元（valence-arousal）を内部座標に、離散語（GEMS的）を入口に」ハイブリッド

- **入口（ユーザー言語）は離散的**。人は「切ない」「疾走感」といった**言葉**で注文する。GEMS（Geneva Emotional Music Scale, Zentner et al. 2008）は音楽が誘発する情動に特化した9尺度（wonder / transcendence / nostalgia / tenderness / tranquility / joy / power / tension / sadness）を持ち、聴取者が実際に選ぶ語に近い。被験者は感情の**報告**に GEMS を好むという実測がある。
- **内部（パラメータ写像）は二次元**。valence（快‐不快）× arousal（覚醒‐鎮静）の円環モデルは、パラメータへ連続的に写像しやすく、判別精度（excerpt間距離）も離散・GEMSより高い。テンポ→arousal、mode→valence のように**軸ごとにパラメータを直結**できるのが実装上の決定的な利点。
- したがって本ツールは **語 → (V, A) 座標 + 離散タグ → パラメータ** の二段変換にする。二次元だけでは落ちる情報（後述§4「切ない＝正負混合」）は離散タグと混合フラグで補う。

根拠:
- 次元 vs 離散 vs GEMS の比較（判別精度は次元が最大、報告好適性はGEMS）: https://pmc.ncbi.nlm.nih.gov/articles/PMC10644370/ , https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1287334/full
- Eerola & Vuoskoski 2011「離散と次元モデルの比較」: https://journals.sagepub.com/doi/10.1177/0305735610362821
- GEMS/Zentner 概説: https://pmcharrison.github.io/intro-to-music-and-science/emotion.html

### 1.2 Juslin の cue utilization（演奏手がかりの感情別プロファイル）

Juslin は、演奏者が **テンポ・音量（sound level）・アーティキュレーション・音色（timbre）・音の立ち上がり（attack）** を確率的な手がかりとして使い、聴取者もそれらを重み付けして感情を読む、というレンズモデル（Brunswik）を実証した。**どの手がかりも単独では決定的でなく（probabilistic）、複数の冗長な手がかりの束で伝わる**のが核心。実装含意＝「1パラメータで感情を決めない。束で設計する」。

演奏プロファイル（本ツールの articulation / density / velocity 設計に直結）:

| 感情 | 音量 | アーティキュレーション | attack | 音色 | 手がかりのばらつき |
|---|---|---|---|---|---|
| 悲しみ Sad | 低 | レガート | 遅い立ち上がり | 柔らかい/暗い | 小（均質） |
| 幸福 Happy | 高 | スタッカート | 速い立ち上がり | 明るい | 大 |
| 怒り Anger | 大 | やや硬い/速い運び | 速い | 鋭い | 中〜大 |
| 恐れ Fear | 小〜変動 | 不規則 | 変動 | 細い | 大（不安定） |

根拠:
- Juslin 2000 Cue Utilization（原論文PDF）: http://www.brainmusic.org/EducationalActivitiesFolder/Juslin_emotion2000.pdf
- Juslin 1997 合成演奏での聴取判断: https://journals.sagepub.com/doi/10.1177/102986499700100205

### 1.3 Gabrielsson & Lindström：構造特徴 × 感情レビューと**手がかりの重要度順**

100本超の研究レビューから、作曲された構造が担う感情への寄与を整理。**重要度の序列（概ね）＝ mode ＞ tempo ＞ register ＞ dynamics ＞ articulation ＞ timbre**。ただし順位は感情ごとに変動する（valence判断では tempo が mode を上回る場面もある、§2.2）。

根拠:
- Gabrielsson & Lindström (2001) 章: https://www.researchgate.net/publication/231382175_The_Influence_of_Musical_Structure_on_Emotional_Expression
- Handbook章（2010改訂）: https://academic.oup.com/book/38621/chapter/335187128

---

## 2. 構造特徴 × 感情の実証（軸ごとの写像根拠）

### 2.1 長短調 ↔ valence
- 長調＝高valence（明・快）、短調＝低valence（暗・哀）。脳は自動的に短和音を悲しみ、長和音を幸福へ結びつける傾向。ただしこれは**西洋伝統の文化的学習**に強く依存（§6）。
- 出典: 前掲 Eerola & Vuoskoski, Bittersweet研究 https://pubmed.ncbi.nlm.nih.gov/21707144/

### 2.2 テンポ ↔ arousal（と一部valence）
- 速テンポ＝高arousal（怒り・幸福）、遅テンポ＝低arousal（悲しみ・平穏）。
- 重要：**テンポは valence判断で mode を上回りうる**。mode と tempo が矛盾する刺激（速×短調 / 遅×長調）ではテンポの方が valence 判断を左右する。→「短調でも速ければ negative一辺倒にならない」＝疾走感・エモの土台（§3）。
- Eerola/Vuoskoski の primary cues 研究では、各cueの寄与は概ね**線形**で、評価分散の77–89%を説明。
- 出典: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3726864/ （primary musical cues, linear/additive）, EEG tempo研究 https://www.nature.com/articles/s41598-025-92679-1

### 2.3 音域・音高 ↔ 明暗/覚醒
- 高register＝明るさ・喜び・覚醒（ときに緊張/恐れ）、低register＝暗さ・重さ・厳粛。
- 広いピッチレンジ＝喜び・高揚・気まぐれと正の相関。狭いレンジ＝抑制・内省。
- 出典: 前掲 Gabrielsson & Lindström レビュー要旨。

### 2.4 不協和 ↔ 緊張（tension）
- 知覚される不協和と緊張は強く相関。不協和は roughness（うなり/干渉）と harmonicity低下に由来し、negative affect を誘発。作曲上は「期待の逸脱→緊張→解決」の道具。
- **快‐不快は文化・熟達で変わるが、緊張の知覚自体は比較的頑健**（不協和＝緊張は文化差が小さい）。→テンションノート/借用和音は「valenceを揺らさず緊張だけ足す」レバーとして使える。
- 出典: https://www.nature.com/articles/s41598-020-65615-8 （familiarity/expertise は pleasantness に効くが tension には効きにくい）, https://www.tandfonline.com/doi/full/10.1080/25742442.2024.2396980

### 2.5 リズム規則性 ↔ 安定/緊張
- 規則的・予測可能なリズム＝安定・安心・低緊張、明快さ。不規則/シンコペ/複雑拍＝緊張・興奮・不安。ドラム density と swing の設計に直結（規則＝ストレート八分・低swing、不安＝裏拍強調・不定形）。
- 出典: 前掲 dissonance×rhythm研究、Gabrielsson & Lindström。

---

## 3. 日本語の感情語彙を V-A 平面＋特徴へ

J-POP/ボカロ文脈の語は、**単純な四象限に収まらず「混合」や「運動性」を含む**のが特徴。分析記事・作曲実務知見から対応付ける。

- **切ない**: valence わずかに負〜混合、arousal 中。短調基調＋下降バス＋半音下降（ノンダイアトニック経由）で「沈み込み」。音数は少なめが有効。→ §4の混合ケースの代表。
  出典: https://www.audio-technica.co.jp/always-listening/articles/sad-chord-progressions/ , https://cidermusic.jp/sad_melody_chord_5/
- **エモい**: emotional由来の造語。「寂しく切ないが哀愁があって懐かしい」＝**複数感情の混在**（nostalgia＝bittersweet に最も近い）。valence 混合、arousal 中。長調ベースに借用/分数コードで陰影。
  出典: https://utaten.com/live/chord-progression-emo/ , https://keiichi.blog/emo-code-4types-3steps/
- **疾走感**: valence 中〜やや正、arousal 高。速テンポ＋短調でも「小室進行」等で切なさと推進力を両立。八分主体の細かい density＋ストレート。
  出典: https://trivisionstudio.com/chord-progression-6451/
- **浮遊感**: arousal 低〜中、valence 中立。キー外コード/分数コード/sus・add9 等で調性の重力を弱める。曖昧・非解決。
  出典: https://spar-c.com/2025/02/18/vocaloid-chord-progressions/ , https://wellen.jp/compose/chord-emoi/
- **儚い/透明感**: arousal 低、valence 中立〜微負。高register・広い音間・薄いtexture・弱velocity。
- **懐かしい（ノスタルジー）**: bittersweet の学術的中核。valence 混合、arousal 低〜中。長調＋モーダル借用、ミドルテンポ。
  出典: https://link.springer.com/chapter/10.1007/978-3-319-39666-8_11

---

## 4. 二次元で足りない例（切ない＝正負混合）への対処

**問題**: 「切ない」「エモい」「懐かしい」は valence 単一値では表せない。快と不快が**同時に**立つ（bittersweet）。矛盾手がかり（fast-minor / slow-major）で被験者は幸福ボタンと悲哀ボタンを同時押しし続ける＝正負が**分離して共存**することが実証済み。

**対処（実装規則）**:
1. **valence を単一スカラーにせず `valence_pos` と `valence_neg` の2成分**として持つ（または `mix=true` フラグ＋主/副valence）。
2. **矛盾手がかりを意図的に配合**：短調 × やや速め、または 長調 × 遅め＋モーダル借用。これが混合感情の生成レバー。
3. **層で分ける**：和声＝陰（短調/借用）、リズム＝陽（推進）のように層ごとに逆符号を割り当てると「切ないのに前に進む」が出る（＝疾走系エモの正体）。
4. 二次元座標は**近似の初期値**とだけ扱い、混合語は必ず「陽寄り/陰寄り」2バリエーションを出して人間に選ばせる。

出典: https://pubmed.ncbi.nlm.nih.gov/21707144/ （Bittersweet, conflicting cues）, https://www.researchgate.net/publication/311459486_Nostalgia_and_Mixed_Emotions_in_Response_to_Music

---

## 5. 仕様化：感情語 → パラメータプリセット表

凡例:
- **V/A**: valence(−1..+1) / arousal(0..1)。mix=混合。
- **mode**: 推奨旋法。**tempo**: BPM目安。**register**: 中心音域。**density**: 音数密度（音符/拍の目安）。**artic**: アーティキュレーション。**swing**: 0=ストレート〜0.6。**harmony**: 和声語彙。
- 値は**初期プリセット＝候補の出発点**。太字の根拠は前掲§1–4。

| 感情語 | V | A | mode | tempo(BPM) | register | density | artic | swing | harmony（和声語彙） | なぜそうなるか（1行） |
|---|---|---|---|---|---|---|---|---|---|---|
| 明るい / happy | +0.8 | 0.7 | Ionian(長) | 120–140 | 中〜高 | 中〜高 | staccato寄り | 0–0.2 | ダイアトニック中心・I/IV/V | 長調＋速＋高音域＋歯切れ＝Juslin/G&Lの幸福プロファイル一式 |
| 悲しい / sad | −0.7 | 0.25 | Aeolian(短) | 60–80 | 中〜低 | 低 | legato | 0 | 短調・下降バス・sus解決遅延 | 短調＋遅＋低音量legato＝悲しみの手がかり束、音数減で沈む |
| 切ない（bittersweet） | mix(−0.3陰) | 0.45 | 短(自然/和声)＋一時長借用 | 78–96 | 中 | 低〜中 | legato基調・要所tenuto | 0–0.15 | 半音下降・分数コード・IV→iv | 陰の和声に微かな陽（借用長）を挿し、下降で沈める＝混合の代表 |
| エモい | mix(±0) | 0.55 | 長ベース＋モーダル借用 | 85–110 | 中 | 中 | legato+抑揚 | 0–0.2 | 王道進行(4536)/小室・分数・add9 | 懐かしさ(陽)と哀愁(陰)を同居＝nostalgia型bittersweet |
| 疾走感 | +0.3 | 0.85 | 短(推進) | 150–180 | 中〜高 | 高(八分主体) | ややstaccato・均一運動 | 0 | 小室進行(vi-IV-V-I的)・循環 | 速テンポでarousal最大化＋短調の切なさ、テンポがvalenceを持ち上げ矛盾を推進へ |
| 浮遊感 | 0 | 0.35 | Lydian/sus的・調性希薄 | 80–100 | 中〜高 | 低〜中 | legato・非解決 | 0–0.1 | sus2/sus4・add9・分数・非解決 | キー外/非解決で調性の重力を抜く＝快でも不快でもない宙吊り |
| 儚い / 透明感 | −0.1 | 0.25 | Ionian/Lydian薄化 | 66–84 | 高 | 低(間を空ける) | legato弱奏 | 0 | 開離ボイシング・add9・空虚5度 | 高音域＋薄texture＋弱velocityで質量を消す |
| 懐かしい / ノスタルジー | mix(+0.1陽) | 0.4 | 長＋モーダル借用 | 76–96 | 中 | 中 | legato | 0–0.2 | IV/iv交替・♭VII・6th | bittersweet中核、長調の温かさに翳りを一滴 |
| 怒り / 攻撃的 | −0.5 | 0.9 | Phrygian/短 | 140–180 | 低〜中 | 高・硬い | 硬いstaccato/アクセント | 0 | 不協和・♭II(Phrygian)・パワー | 大音量・速・鋭attack・不協和＝Juslin怒り＋緊張 |
| 恐れ / 不安 | −0.6 | 0.6 | Locrian/減・半音階 | 変動/rubato | 低or極端 | 不規則 | 不規則・弱→急 | 0 | 減和音・トライトーン・不定調 | 不協和＝緊張＋リズム不規則＝予測不能で不安 |
| 荘厳 / 崇高 | +0.4 | 0.5 | 長/Mixolydian | 60–80 | 広い(低〜高) | 中 | tenuto・重厚 | 0 | 開離・IV-I・♭VII・ペダル | 広register＋規則リズム＋豊かな響き＝wonder/power(GEMS) |
| 穏やか / 安らぎ | +0.5 | 0.2 | Ionian/Dorian | 60–76 | 中 | 低 | legato | 0–0.1 | 順次進行・sus解決・7thの柔 | 遅＋低arousal＋規則リズム＝tranquility、不協和を避ける |
| 高揚 / 楽しい pop | +0.7 | 0.8 | 長 | 124–138 | 中〜高 | 高 | staccato・跳ねる | 0.2–0.5 | I-V-vi-IV・ドミナント推進 | 速＋長＋swingで運動性、幸福cueに躍動を追加 |
| クール / 都会的 | +0.1 | 0.5 | Dorian/Mixolydian | 90–115 | 中 | 中 | 抑制legato・裏拍 | 0.1–0.4 | m7/M7/9th・分数・借用 | テンション豊かで解決を急がない＝洗練、valence中立で醒めた質感 |
| 情熱 / ドラマチック | mix(+0.2) | 0.75 | 短→長への転調含む | 100–130 | 広い | 中〜高 | 抑揚大・rubato可 | 0 | 二次ドミナント・借用・転調 | 覚醒高＋和声の起伏で振幅、緊張と解決を大きく取る |
| 決意 / 前向き | +0.6 | 0.65 | 長/Mixolydian | 110–132 | 中 | 中 | tenuto・力強い | 0–0.2 | IV-V-I・sus4→解決・上行 | 上行と明確な解決＝valence正・中高arousal、迷いの無い規則リズム |
| 幻想的 / dreamy | +0.2 | 0.35 | Lydian | 80–104 | 高 | 中(細かい装飾) | legato・残響的 | 0–0.1 | #11・add9・分数・非機能進行 | Lydianの#4で非日常の明るさ、非解決で夢の宙吊り |

（17語。混合語は §4 の規則で2バリエーション展開すること）

---

## 6. 過信警告（必読）

1. **文化・学習依存**：長調=幸福/短調=悲哀は西洋伝統の学習に強く依存する。不協和の**快不快**も文化的熟達で変わる（緊張の知覚は比較的頑健だが快不快は動く）。非西洋・実験的文脈では崩れる。出典: https://www.nature.com/articles/s41598-020-65615-8
2. **個人差が大きい**：同一曲でも聴き手の性格・記憶・その日の気分で反応が割れる。プリセットは**母集団の傾向**であって個人の正解ではない。
3. **手がかりは確率的・冗長**：どの1パラメータも感情を決定しない（Juslin）。束で設計し、1ノブで結論を出さない。
4. **文脈・歌詞・アレンジが上書きする**：モデレート・テンポでも歌詞や音色で印象は反転しうる。構造値は前提であって最終ではない。
5. **二次元は近似**：GEMS的な豊かさ（畏敬・超越・郷愁）は V-A に潰れる。混合語は§4のフラグで守る。
6. **ツール思想との整合**：本表は**候補を出す足場**。単一seed・単一進行で断定せず、seed違い/進行違い/長短のバリエーションを必ず提示し、仕上げは人間に返す。

---

## 7. 設計含意（実装への落とし込み）

- **感情入力APIは `{ word, V, A, mix, tags[] }` を返すパーサ**にする。語→座標の辞書＝§5表を初期テーブルとして持つ。
- **パラメータ生成は軸直結の合成**：A→tempo/density/velocity、V→mode/harmony選択、tension→テンション/借用/不協和度、mix→層ごとの符号反転。
- **mode の権威が最大だがvalue判断ではtempoが競合**（§2.2）。矛盾配合を「バグ」でなく「表現レバー」として露出する。
- **混合語は必ず陽寄り/陰寄り2案**を生成（§4）。
- **プリセットは編集可能な出発点**としてUIに出し、ロックしない（思想整合）。
- 将来: 自前コーパスの重み（E-corpus）で日本語感情語↔実データの写像を補正すると、辞書の文化バイアスを実測で矯正できる（別トラック）。

---

## 出典一覧（主要）

- Gabrielsson & Lindström (2001/2010) 構造×感情レビュー: https://www.researchgate.net/publication/231382175_The_Influence_of_Musical_Structure_on_Emotional_Expression , https://academic.oup.com/book/38621/chapter/335187128
- Juslin (2000) Cue Utilization: http://www.brainmusic.org/EducationalActivitiesFolder/Juslin_emotion2000.pdf
- Juslin (1997) 合成演奏の判断方策: https://journals.sagepub.com/doi/10.1177/102986499700100205
- Eerola & Vuoskoski (2011) 離散 vs 次元: https://journals.sagepub.com/doi/10.1177/0305735610362821
- Primary musical cues（線形・加法性, 77–89%分散）: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3726864/
- 次元/離散/GEMS比較: https://pmc.ncbi.nlm.nih.gov/articles/PMC10644370/
- GEMS/Zentner 概説: https://pmcharrison.github.io/intro-to-music-and-science/emotion.html
- 不協和×緊張（文化・熟達の影響）: https://www.nature.com/articles/s41598-020-65615-8 , https://www.tandfonline.com/doi/full/10.1080/25742442.2024.2396980
- Bittersweet 矛盾手がかり同時押し: https://pubmed.ncbi.nlm.nih.gov/21707144/
- Nostalgia = mixed emotion: https://link.springer.com/chapter/10.1007/978-3-319-39666-8_11
- テンポとEEG/覚醒: https://www.nature.com/articles/s41598-025-92679-1
- 日本語感情語（切ない/エモい/疾走/浮遊）: https://www.audio-technica.co.jp/always-listening/articles/sad-chord-progressions/ , https://cidermusic.jp/sad_melody_chord_5/ , https://utaten.com/live/chord-progression-emo/ , https://keiichi.blog/emo-code-4types-3steps/ , https://trivisionstudio.com/chord-progression-6451/ , https://spar-c.com/2025/02/18/vocaloid-chord-progressions/ , https://wellen.jp/compose/chord-emoi/
