# humanize ノブの知覚較正値（D3）

作成: 2026-07-14 ／ 領域: リズム知覚・演奏科学（microtiming / velocity）
目的: 非破壊 feel 層の **humanize ノブ** の既定値を、知覚科学の実測に基づいて数値で確定する。
（スイング比の連続性・テンポ依存＝Friberg/Benadon 系は D2 で確定済み。本稿は扱わない。）

結論（先出し）:
- **ランダムな揺らぎ単体はグルーヴを上げない**。上げるのは「系統的パターン」か、あるいは何もしない完全 quantize。よって既定は **「弱く系統的・ランダム最小」** が科学的に正しい。
- ランダム成分を入れるなら **白色ノイズより 1/f（長距離相関）** が知覚上好まれる。
- 量は **JND（約6〜20ms）を目安に、部位ごとに「聞こえる直前」で止める**。低音・鋭いアタックほどタイトに。

---

## ① ランダム揺らぎ vs 系統的ずれ — 研究の定説

### 定説A: 「参加的不一致（PD）＝微小非同期がグルーヴの源」説は**否定的〜中立**
Senn & Kilchenmann らのプロ演奏（funk/swing）を段階スケーリングして専門家/非専門家に評価させた実験:
- 原演奏の microtiming 量: **funk sΔt ≈ 0.026 拍、swing ≈ 0.068 拍**（テンポ120で概ね funk ±15〜30ms／swing ±20〜50ms 相当）。
- **完全 quantize（−100%）と原演奏（±0%）の groove 評価は同等に高い**。「タイミングのズレがグルーヴに必須」という予測は支持されなかった。
- **誇張（+40% 以上）で groove は低下**。専門家は +40% で苛立ち反応、非専門家は +80% 以上で有意に苛立つ。→ 効くのは"足す"より"壊さない"。
- 出典: Senn et al. 2016, Frontiers in Psychology / PMC5050221
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5050221/

### 定説B: 単純ドラムパターンの大規模評価でも microtiming 残差は無効果
248 パターン×665 名×8329 評価: **syncopation と event density は groove を上げるが、beat salience・残差 microtiming・リズム変動性は groove に効果なし**。
- 出典: Senn et al. 2018, PLOS ONE / PMC6025871
  https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0199604

### 定説C: グリッド上の単純ドラムでは「量子化が好まれる／microtiming は有害」
Frühauf/Kopiez/Platz "Music on the timing grid" では、微小タイミングは perceived groove を**むしろ下げる**方向。
- 出典: https://www.researchgate.net/publication/237423294

### 定説D: 「減らす」ほうが好まれることすらある
ジャズ・トリオの相互同期研究: **原演奏や完全 quantize より、非同期を 19ms 未満に"縮めた"刺激のほうが好まれた**。
- 出典: The Tight-interlocked Rhythm Section, PMC5706983
  https://pmc.ncbi.nlm.nih.gov/articles/PMC5706983/

### 定説E: ランダムを入れるなら「1/f（長距離相関）」＞「白色ノイズ」
Hennig ら: 人間の演奏ゆらぎは 1/f 型の長距離相関を持ち、**リスナーは 1/f humanize を白色ノイズ humanize より明確に好む**（39名比較）。「市販ソフトの humanize は単なる無相関乱数＝白色ノイズで、人間らしさに届いていない」と明言。
- 出典: Hennig et al. 2011, PNAS / PMC3202537
  https://ncbi.nlm.nih.gov/pmc/articles/PMC3202537
  Max Planck 解説: https://www.ds.mpg.de/4049023/240205_humanizing

**設計含意（①）:**
- 既定は **quantize を壊さない＝系統オフセット弱め＋ランダム最小**。ランダムで"グルーヴを作ろう"としない。
- ランダム成分は **白色でなく 1/f 相関**（前の値を引きずる、拍→小節スケールで相関）にする。実装は前値に係数を掛けて累積する簡易 AR/フラクタルで近似可。
- 「盛る」ノブより「原型を保つ」ことを既定に。誇張は +40% 相当を上限アラートの目安に。

---

## ② 量の閾値（JND・心地よい範囲・破綻域）

### JND（知覚できる最小ずれ）
- **等時列のタイミング識別 JND ≒ 6ms（絶対）**（IOI 100〜240ms 帯）、IOI 240ms 超では **約 2.5%（相対）**。音楽経験は感度にほぼ無影響。
  出典: Friberg & Sundberg 1995（JASA）。要約: https://www.diva-portal.org/smash/get/diva2:1246650/SUMMARY01.pdf
- **anisochrony 検出**: IOI < 約250〜400ms では **一定閾（≈6ms）**、それ以上は Weber 比（∆t/t 一定）。つまり**速い分割ほど相対 JND は急増するが、絶対ずれ ≈6ms は一定**。
  出典: Ehrlé & Samson 2005, Brain and Cognition
  https://pubmed.ncbi.nlm.nih.gov/15878734/
- **2音の非同期・時間順序判断**: 理想条件で最小 ~2ms、どちらが先か判る境界は概ね **~20ms**。

### 心地よい範囲・破綻域（実測からの整理）
- **"感じるが聞こえない"域 = おおむね 1 JND 以下〜同程度**。部位により 3〜15ms。
- **破綻域**: 原演奏の +40%（専門家）／+80%（一般）で苛立ち。原演奏 microtiming が既に ±15〜50ms なので、**単発のズレが概ね 40〜60ms を超えると"ヨレ"として顕在化**。
- **テンポ依存**: 絶対 ms 基準（Friberg の 6ms 一定域）が支配的な速い分割では **ms を固定**し、拍比でスケールさせない。遅いテンポ（IOI>240ms＝おおむね ♩<250bpm の 8分より遅い層）では 2.5% 相対で緩める余地。

**設計含意（②）:**
- ノブの内部単位は **ms（拍比でなく絶対時間）** を基本に。速い曲で拍比スケールすると音符が潰れる。
- ランダム SD の既定は **各部位の JND のおおむね半分〜1JND** に置く（＝"感じるが聞けない"）。上限は 40ms 手前で頭打ち＋警告。

---

## ③ 部位差（低音ほどタイト、が定説か → おおむね YES）

- **鋭いアタック（kick/snare/hihat）ほど許容ずれが小さい**。柔らかい立ち上がり（弓/息、ベースの丸い頭）は許容が大きい。
  - 非同期検出 JND の実測傾向: **Kick/Snare/Hi-hat ≈ 19〜24ms、Bass/Guitar ≈ 31〜35ms**（鋭いほど厳しい）。
- **P-center（知覚上の打点）**: 速いアタック音が複合音の打点を"アンカー"する。kick と滑らかな音を重ねると**非同期があっても打点は鋭い音側に固定**。→ **kick はタイトの基準杭**にすべき。
  出典: Danielsen et al. 2026, Annals NYAS "All About That Bass Drum?"
  https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/nyas.70306
- **弓/息物のほうが非同期は許される**（bowed string の非同期は drum より受容されやすい）。
- **snare は kick より microtiming のズレが悪く評価される**（同量でも snare のヨレは目立つ）。バックビートは正確さが命。
- **非対称性**: 「早い(pushed)」より「遅い(laid-back)」ズレのほうが受容されやすい。ベースが約 30ms 先行(push)しても quantize と同等評価になる例あり＝**方向で許容が違う**。
  出典: The Asymmetrical Influence of Timing Asynchrony of Bass Guitar and Drum Sounds on Groove（Frühauf/Kopiez 系）
  https://www.researchgate.net/publication/312240936

**設計含意（③）:**
- **タイト順（ランダム小 → 大）: Kick ≦ Bass ≦ Snare < Hihat < Melody/Lead**。
  - Kick=基準杭（最小）。Snare は"量は小さいが方向は laid-back 寄り"（早めは禁物）。Bass は kick に食いつく（小）。Melody は最も自由。
- **ベースは kick にロック**（同じ系統オフセットを共有）させ、独立ランダムを増やさない＝低音の濁り回避。
- 方向ノブ（ahead/behind）は **既定 laid-back(=遅らせ) 側 0〜+ を安全**、early(-) 側は控えめに。

---

## ④ ベロシティ（系統的メトリカルアクセント＋ランダム成分）

- **系統成分（メトリカルアクセント）が主役**: ドラマーは拍位置に応じて打鍵速度を系統的に変える。アクセント/非アクセントで打点速度が明確に差（被験者間で 3.5〜10 m/s のレンジ）。バックビート(2・4)、ダウンビートを系統的に強く。
  出典: Dahl, "Playing the Accent" http://www.sofiadahl.net/pdf/paper2-accents2.pdf
  Elad/Senn 系ドラム intensity マッピング: https://www.tandfonline.com/doi/full/10.1080/09298215.2022.2150649
- **ランダム成分**: 実務基準として Logic の Humanize 既定は **velocity ±10（127中, ≈±8%）／timing ±5ms**。これは "そこそこ効くが壊さない" 定番。
  出典: https://www.macprovideo.com/article/audio-software/7-ways-to-humanize-beats-and-midi-regions-in-logic-pro-x

**設計含意（④）:**
- ベロシティは **①系統アクセント曲線（拍階層マップ）を先に敷く → ②その上に小さいランダム（SD ≈ 5〜8 / 127, ≈4〜6%）** の二層。ランダム単独で"人間らしさ"を出そうとしない（①と同じ思想）。
- ランダム velocity も可能なら 1/f 寄り（連続音符で相関）。ハイハットの表情は主にここで作る。

---

## ⑤ 先行実装の慣習（DAW / ハード）

- **Akai MPC スイング**: MPC3000 は **50 / 54 / 58 / 62 / 66 / 71%** の固定段。50=ストレート、54=軽いはね、58=重いシャッフル。16分ペアの前後比。
  https://www.audeobox.com/learn/mpc-software/mpc-drum-programming/
- **MPC Humanize（ソフト）**: Timing=Amount(Pulses)＋Eagerness(− ahead / + behind)、Velocity=Strength(%)、Note Length=Length(%)。数値既定は非公開（要マニュアル/実機）。
  https://support.akaipro.com/en/support/solutions/articles/69000863026
- **Logic Pro Humanize**: MIDI Transform の Humanize プリセットが **timing ±5ms・velocity ±10** を既定（編集可）。Swing Quantize は 1/16・65% あたりから、が定番助言。
  https://www.soundonsound.com/techniques/quantisation-groove-functions-logic
- 実務では **ドラム 62% / ベース 58%** のように**層ごとに別スイング**、velocity はドラム間でばらつかせるのが定番。
  https://unison.audio/how-to-humanize-midi/

**設計含意（⑤）:**
- ノブ既定は Logic 準拠の **timing ±5ms / velocity ±8%** を"標準"アンカーに据えると、ユーザーの体感と整合しやすい。
- スイングは層別（feel 層で既に対応）。humanize はスイングの"上"に薄く乗せる独立層に。

---

## ⑥ 仕様化 — humanize 既定値表

前提と単位:
- **timing SD** = ランダムのガウス標準偏差（ms, 絶対時間）。理想は 1/f 相関を付与。**±表示は概ね ±2SD の実効幅**。
- **系統オフセット** = 部位共通の方向づけ（+ = laid-back/遅らせ, − = push/早め）。既定は"弱く"。
- **velocity 変動** = 系統アクセント曲線に加える**ランダム SD（/127）**。系統アクセントは別テーブル（拍階層）で常時ON。
- テンポ帯は絶対 ms を基本に固定。速い帯は潰れ回避で微減、遅い帯は微増可。

### 既定値表（"弱く系統的・ランダム最小" ポリシー）

| 部位 | timing SD (ms) 既定 | 系統オフセット 既定 | velocity ランダム SD (/127) | 備考（根拠） |
|---|---|---|---|---|
| Kick | **3**（範囲 2–5） | 0（基準杭） | 6 | 打点アンカー。最小。P-center を動かさない |
| Snare | **4**（3–7） | **+4（laid-back 寄り）** | 8 | 量は小・方向のみ。early 禁物、backbeat 強アクセント |
| Hi-hat | **7**（5–12） | 0〜+2 | 10 | 表情の主担当。ランダム最大枠。swing は feel 層側 |
| Bass | **4**（3–6） | Kick に追従（共有） | 7 | kick にロック。独立ランダムを増やさない＝低音濁り回避 |
| Melody/Lead | **10**（6–15） | +5（歌わせる laid-back） | 8 | 最も自由。表情・タメを許容 |
| Chords/Pad | **8**（5–12） | +3 | 7 | アタック柔・許容大。塊で動かす |

### テンポ帯補正（timing SD への倍率）

| テンポ帯 | 倍率 | 理由 |
|---|---|---|
| Fast（♩≧140） | ×0.7 | 速い分割は絶対 6ms 前後で潰れる。ms を詰める |
| Mid（♩90–140） | ×1.0 | 基準（上表そのまま） |
| Slow（♩≦90 / IOI>240ms） | ×1.3 | Weber 相対域、2.5% まで緩められる余地 |

### ノブ設計の指針
- **主ノブは1本（Humanize 量 0–100%）**: 上表の SD/velocity を一括スケール。既定 **20–30%**（＝"弱く"）。
- **系統/ランダム比を内部固定**（系統を厚め、ランダムを薄め）。ユーザーには"Feel(系統) / Loose(ランダム)" の副ノブを任意で。
- **早め方向にリミッタ**: push 側は控えめ上限。laid-back 側を広く。
- **1/f トグル**（既定ON）: ランダムを長距離相関に。OFF で白色（比較用）。
- **上限ガード**: 単発ずれが ~40ms・全体で原型の +40% を超えたら"ヨレ警告"。

---

## 出典一覧（URL）
- Senn et al. 2016, Frontiers Psychol.（PD スケーリング・専門家閾値）: https://pmc.ncbi.nlm.nih.gov/articles/PMC5050221/
- Senn et al. 2018, PLOS ONE（248パターン大規模・残差無効果）: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0199604
- Frühauf/Kopiez/Platz, Music on the timing grid: https://www.researchgate.net/publication/237423294
- Tight-interlocked Rhythm Section（19ms 未満縮小が好まれる）: https://pmc.ncbi.nlm.nih.gov/articles/PMC5706983/
- Hennig et al. 2011, PNAS（1/f > 白色ノイズ）: https://ncbi.nlm.nih.gov/pmc/articles/PMC3202537 ／ https://www.ds.mpg.de/4049023/240205_humanizing
- Friberg & Sundberg 1995（JND ~6ms / 2.5%）要約: https://www.diva-portal.org/smash/get/diva2:1246650/SUMMARY01.pdf
- Ehrlé & Samson 2005（anisochrony テンポ依存）: https://pubmed.ncbi.nlm.nih.gov/15878734/
- Danielsen et al. 2026, NYAS（P-center / bass drum アンカー）: https://nyaspubs.onlinelibrary.wiley.com/doi/10.1111/nyas.70306
- Asymmetrical Influence of Bass/Drum Asynchrony（非対称・方向依存）: https://www.researchgate.net/publication/312240936
- Dahl, Playing the Accent（アクセント打鍵速度）: http://www.sofiadahl.net/pdf/paper2-accents2.pdf
- Drum-kit timing/intensity mapping: https://www.tandfonline.com/doi/full/10.1080/09298215.2022.2150649
- MPC スイング段: https://www.audeobox.com/learn/mpc-software/mpc-drum-programming/
- MPC Humanize: https://support.akaipro.com/en/support/solutions/articles/69000863026
- Logic Humanize（±5ms/±10vel）: https://www.macprovideo.com/article/audio-software/7-ways-to-humanize-beats-and-midi-regions-in-logic-pro-x
- Logic Quantise/Groove: https://www.soundonsound.com/techniques/quantisation-groove-functions-logic
