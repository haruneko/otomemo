# 局所調・転調検出の手法サーベイ（R2）

作成日: 2026-07-15 ／ 種別: 外部Web調査＋手元資産の実コード確認
関連: 音源アナリーゼ機能（BTC→`chords_timeline`→`key_segments`）。後続の実測プロト **F3** がそのまま実装できる粒度を目標。

---

## TL;DR

- **推奨（本命）**: **コード列ベースの局所調検出を DP（動的計画法／Viterbi 型）で解く**。
  各時間窓に既存資産 **`resolveTonic`（継続長ヒートマップ）を per-window スコアラとして再利用**し、
  「窓ごとの適合度」＋「調を切り替えるコスト（切替ペナルティ）」＋「最小滞在長」を一本のコスト関数に束ねて
  全体最適の `key_segments` を出す。入力はコード記号のみ・純TS・追加依存ゼロ・既存資産再利用で実装コスト最小。
  理論的裏付けは **Gedizlioğlu & Erol 2024（正則化）** と **arXiv:2606.03459 "Tonal Parsimony"（modulation cost + tonal vocabulary の DP）** が示した
  「切替に罰則を課すと過剰分割（＝借用を転調と誤認）が消える」という結論と一致。両論文とも MIDI/コード列ベースで
  **正則化ありが素の HMM を上回る（89.9% vs 82.6%）**と報告。
- **次点（後で精度が足りなければ）**: **HMM（Papadopoulos & Peeters 型）で調状態列を Viterbi 復号**。
  自己遷移確率を高く（＝転調ペナルティ）した 24 状態 HMM。DP 案と数理的にはほぼ等価だが、確率で書くぶん実装がやや重い。
  POC で「クロマ単独 80%／BTC コード頻度 95%整合」だった以上、**まずはコード記号ベースで十分**という判断。
- **不採用**: クロマ→窓相関の Krumhansl 生窓（music21 windowed）は**小窓でノイズが多い**（KS プロファイルは大領域向き）。
  DNN の局所調（frame-wise key）専用実装は成熟品が乏しく、ライセンス/依存も重い＝現段階では過剰。

---

## 1. 手法比較表

| 手法 | 入力 | 精度報告 | 計算量 | 実装難度 | ライセンス | 出典 |
|---|---|---|---|---|---|---|
| **HMM（Papadopoulos & Peeters）** クロマ→コード→調を同時推定、beat/bar 同期、自己遷移高で調変化を抑制 | クロマ（→コード） | MIREX2005 グローバル調 91.4%（クラシック1252抜粋）。局所調も同枠組み | O(T·K²) Viterbi、K=24 | 中（HMM＋前段クロマ/コード） | 論文（実装は各自） | Papadopoulos & Peeters, IEEE TASLP 2011 / CBMI 2007 |
| **正則化（Gedizlioğlu & Erol 2024）** 小節単位で全体最適、`R(S)=Σsubsection-cost + λ(|S|−2)²/M` で過剰分割を抑制 | MIDI（PC分布） | **89.9%（MIREX指標）> HMM 82.6%**（Lakh MIDI 80曲、有意差 p=.026） | O(N²)〜DP | 中（λチューニング要） | 論文（コード明記なし） | Gedizlioğlu & Erol, *Musicae Scientiae* 2024 |
| **Tonal Parsimony（DP: modulation cost + tonal vocabulary）** コード記号列を DP で調割当、非語彙コードで転調 or 未割当、最小セグメント強制 | **コード記号** | 本文で DP 最適性を主張（数値は論文本体） | O(N·K)〜O(N·K²) DP | **低〜中（コード記号のみ・前段不要）** | **CC-BY 4.0**（論文）、コードは明記なし | arXiv:2606.03459（2026） |
| **窓相関 Krumhansl/Temperley（music21 WindowedAnalysis）** 窓ごとに 24 プロファイルと相関、最大相関の調 | クロマ/PC分布 | プロファイル別グローバル調: KS 78.0% / TKP 85.4% / Bellman-Budge 73.2%。**小窓ではノイズ大** | O(W·K) 窓数×24 | 低（既製あり） | music21: BSD | music21 `analysis.windowed`/`discrete`; White MTO 2018 |
| **essentia Key（temperley/krumhansl/edma）** HPCP→プロファイル相関。グローバル調が主、窓で局所化可 | 音声/HPCP | プロファイル依存（クラシック=temperley、EDM=edma が最良） | 低（C++最適化） | 低（呼ぶだけ）/中（局所化は自作） | **AGPL-3.0**（要注意） | essentia `streaming_Key`, `KeyExtractor` |
| **DNN 局所調（frame-wise key）** CNN/CRNN でフレーム毎に調出力 | 音声/クロマ | 成熟した公開実装が乏しい（MIR で研究は薄い） | 高（GPU/推論） | 高（学習/依存重） | モデル依存 | （survey では該当する軽量・実用実装を確認できず） |
| **★自前 `resolveTonic` 窓化（本命の中核）** 継続長ヒートマップを窓スコアラにし DP で束ねる | **コード記号（+dur）** | 手元 POC で「BTC コード頻度→調」95%整合（librosa 80%）→窓化で局所化見込み | O(N·K)〜O(N·K²) | **最低（既存資産再利用・純TS）** | 自前（制約なし） | 本ドキュメント §4 / `apps/api/src/common-progressions.ts:35` |

> 注: 他者コーパス（Lakh 等）からは**統計値のみ**を引用。リテラルな旋律/進行は保存していない。

---

## 2. 手法の要点（サーベイ本文）

### 2.1 HMM 系（Catteau / Papadopoulos-Peeters / Rocher）
- **考え方**: 時間軸（beat または bar 同期）を隠れ状態列とみなし、各時刻の隠れ状態＝「調（±コード）」。
  観測（クロマ or コード）から状態を Viterbi 復号する。Papadopoulos & Peeters はコードと調を**同時推定**する結合モデル。
- **転調抑制の肝**: **自己遷移確率を高く**（＝調を変えるのに確率的コストを課す）。これが「短い借用を転調と読まない」核。
- **温度感**: MIREX2005 のグローバル調で 91.4%（クラシック）。局所調は同じ枠組みの拡張。
- **含意**: 数理は DP と同型。ただし前段でクロマ→コードの HMM を持つと重い。**我々は既に BTC がコードを出す**ので、
  HMM の前段（クロマ→コード）は不要。「コード列→調」だけを DP/HMM で解けばよい＝軽い。

### 2.2 正則化（Gedizlioğlu & Erol 2024, *Musicae Scientiae*）
- **問題意識**: 「窓を小さくすると転調が頻発・不当（over-segmentation）」を明示的に叩く。
- **手法**: 小節単位で**前後を同時に見る全体最適**。コスト `R(S) = Σ(subsection cost) + λ·(|S|−2)²/M`。
  `|S|`＝セグメント数、`M`＝小節数、`λ`＝正則化強度。**λ を上げるほどセグメント数を絞る**（＝転調に慎重）。
  プロファイルは Krumhansl-Kessler(1982) を simulated annealing で微調整。
- **結果**: MIREX 指標で **89.9%（正則化）> 82.6%（HMM）**、有意差あり（Lakh MIDI 80曲、注釈者3名・一致率85%）。
- **含意**: 「**切替に二乗ペナルティ**を課すと精度が上がる」＝我々の切替コスト設計の直接の根拠。

### 2.3 Tonal Parsimony（arXiv:2606.03459, 2026, CC-BY）
- **手法**: **コード記号列**を入力に、**DP** で各位置に調を割当。目的は 2 項の綱引き:
  - **modulation cost**（調を跨ぐ罰）
  - **tonal vocabulary**（各調の使える和音集合。非語彙コードが来たら転調 or 未割当）
- **最小セグメント**: 1 コードだけの調割当を防ぐ最小長を課す旨。
- **含意**: **入力がコード記号だけで完結**する点が我々と完全一致。DP 定式化・切替コスト・最小滞在の三点セットがそのまま雛形。

### 2.4 窓相関（Krumhansl / Temperley プロファイル・music21）
- **手法**: 窓ごとに PC 分布を作り、24 キープロファイルとの Pearson 相関の最大を採る。
  `WindowedAnalysis` は窓幅（1拍/2拍/1小節/2小節…）を変えて重なり窓を評価できる。
- **プロファイル別グローバル調精度**: KS 78.0% / Temperley-Kostka-Payne 85.4% / Bellman-Budge 73.2%。
- **弱点**: **KS は大領域で安定・小領域でノイジー**（music21 公式が明記）。窓を小さくすると当たらなくなる＝
  局所調には**平滑化/切替コストが必須**（生窓は不可）。essentia の temperley/edma も同系（音声HPCP版）。

### 2.5 DNN（frame-wise key）
- MIR での**局所調専用**の軽量・実用実装は今回の調査では見当たらず（RF 通信の "modulation" 検索に流れる程度で、音楽局所調の成熟品は薄い）。
  学習データ・GPU・依存の重さに対して得るものが不透明。**現段階では非推奨**。

---

## 3. 推奨アルゴリズム仕様（F3 がそのまま実装できる粒度）

### 3.1 契約（I/O）
```ts
// 入力: BTC の出力（既存）
type ChordSpan = [startSec: number, endSec: number, symbol: string]; // 例 [0, 2.1, "Am"]
type ChordsTimeline = ChordSpan[];

// 出力: 局所調セグメント
interface KeySegment {
  start: number;   // 秒
  end: number;     // 秒
  key: number;     // トニックのピッチクラス 0-11（C=0）
  mode: "major" | "minor";
  confidence: number; // 0..1（勝ち調のスコア / 総スコア 等で正規化）
}
type KeySegments = KeySegment[];
```

### 3.2 前処理: コード記号 → `{root, quality, dur}`
- BTC 記号（"Am", "F", "G7", "Csus4"…）を **`{root:PC, quality}`** にパース（既存の記法に合わせる）。
- **`dur = endSec - startSec`**（`resolveTonic` の継続長重みにそのまま入る）。
- 拍/小節が取れるなら **bar 単位**に丸める（正則化論文が bar 単位で最良）。テンポ不明なら秒窓で代用。

### 3.3 コアアルゴリズム（DP＝切替コスト付き最短経路）

**状態**: 24 調 `k ∈ {0..11}×{major,minor}`。**時刻**: コード変化点（またはビート/小節）ごとのステップ `t = 0..T-1`。

```
# 1) 窓スコア（emission）: 各時刻 t で「窓 [t-H, t+H] のコード列」を resolveTonic 相当で採点
#    resolveTonic は "勝者1個" を返すが、ここでは 24 調すべてのスコアが要る。
#    → resolveTonic の内部スコア表 score["root:M/m"] を 24 次元ベクトルとして取り出す
#      （＝関数を1本分岐で「argmax でなくスコア表を返す」版にするだけ。既存ロジック不変）。
emit[t][k] = windowScore(chords, center=t, halfWidth=H)[k]   # 継続長重み ＋ 開始/解決先ボーナス

# 2) 遷移コスト: 調を変えたら固定罰。相対/平行/近親調は割引（任意）。
trans(kPrev, k) = 0                        if k == kPrev
                = SWITCH_COST              if k != kPrev  (基本)
                = SWITCH_COST * DISCOUNT   if k は kPrev の近親調（相対/平行/属/下属）  # 任意の精緻化

# 3) Viterbi（コスト＝負のスコア＋遷移罰 の最小化）
dp[0][k]   = -emit[0][k]
dp[t][k]   = -emit[t][k] + min_over_kPrev( dp[t-1][kPrev] + trans(kPrev,k) )
back[t][k] = argmin kPrev
# 復号: 最終列を backtrace → 時刻ごとの調ラベル列

# 4) 最小滞在長で後処理平滑化: MIN_DWELL 未満の島は両隣の強い方に吸収
#    （＝借用/セカンダリドミナントの1〜2コードを転調に昇格させない最後の砦）
smooth(labels, MIN_DWELL)

# 5) 連結 → KeySegment[] 化。confidence = 窓スコアの正規化平均。
```

### 3.4 初期値と根拠

| パラメータ | 初期値 | 根拠 |
|---|---|---|
| 窓半幅 `H` | **±2小節（計 ~4小節）**、秒なら中庸テンポで ±4〜6秒 | 転調確定は「4小節超＋カデンツ」が理論相場（§4）。窓もそのオーダー。小窓は KS がノイジー（music21）。 |
| 切替コスト `SWITCH_COST` | **窓内トニック三和音1個ぶんの継続長スコアと同オーダー**（例: 平均コード長×1.0〜2.0） | 「1〜2コードの借用では調を跨がない／数小節続けば跨ぐ」の分岐点をこの高さで作る。Gedizlioğlu の λ二乗罰と同趣旨。 |
| 近親調割引 `DISCOUNT` | 0.5（相対/平行/属/下属のみ）※初期は 1.0（割引なし）で単純開始も可 | J-pop の平行調往復・属方向転調を過剰に罰しない。ただし最初は無効化して素の挙動を測るのが安全。 |
| 最小滞在長 `MIN_DWELL` | **2小節（またはコード4個 or 4秒）相当** | tonicization は「1〜2コード」＝これ未満は転調にしない、が理論の相場（§4）。 |

> **チューニング指針**: まず `DISCOUNT=1.0`（近親割引オフ）で `SWITCH_COST` と `MIN_DWELL` だけを動かし、
> 既知転調曲で転調点が ±1〜2小節に乗るよう合わせる。過剰分割が残れば `SWITCH_COST`↑、
> 転調を見逃すなら↓。Gedizlioğlu の知見どおり「まず切替罰を効かせる」。

---

## 4. 借用 vs 転調の区別規則

音楽理論の相場（複数の music theory 教材で一致）:
- **転調(modulation)**: 新しい調で**カデンツ（PAC/IAC/HC）が起きる**＋**おおむね4小節超**居座る。調号の中心が移る。
- **転旋/一時的転調(tonicization)**: **1〜2コードの短いよそ見**（セカンダリドミナント V/x → x 等）。カデンツ無し、すぐ元調へ。
- **モーダルインターチェンジ/借用和音**: 平行調から**単発で借りる**（例 長調での ♭VI, iv, ♭VII）。調は変わらない。

**検出アルゴリズムへの落とし込み（三段の砦）**:
1. **切替コスト `SWITCH_COST`**: 短いよそ見では「跨ぐより留まる方が安い」ようにする＝Viterbi が自然に留まる。
2. **最小滞在長 `MIN_DWELL`（2小節）**: DP 後の平滑化で、これ未満の調の島を両隣に吸収＝1〜2コードの借用は昇格させない。
3. **（任意・強化）カデンツ検出ボーナス**: セグメント末に新調の V→I（属→主）があれば転調スコアに加点。
   理論の「カデンツの有無」を明示的に効かせたい時の上積み（F3 の初期版では省いて良い）。

**具体トレース（J-pop の典型ケース）**:
- 「C の中に一瞬 `D7`（=V/V）→ `G`」→ `D7` は G 調語彙の V。だが 1 コード＝`MIN_DWELL` 未満＆切替罰で吸収 → **C 調のまま**（正解: これはただの属方向のよそ見）。
- 「サビ頭から 8 小節ずっと E♭ 系」→ 継続長が積み上がり emit が E♭ に大きく振れ、切替罰を払っても跨ぐ価値がある → **転調**として E♭ セグメントが立つ（正解）。

---

## 5. J-pop 特有の事情（検出上どう見えるか）

| 転調型 | 見え方 | 検出の注意 |
|---|---|---|
| **半音上げ/全音上げ（トラックドライバー転調）** サビ終盤で全体を+1〜+2半音、ピボット無し・直接転調 | コード列全体が丸ごと平行移動。emit のピークが隣接調へジャンプ | ピボット和音が無い＝境界が鋭い。窓が境界を跨ぐと一瞬曖昧 → **窓中心の重み**と `MIN_DWELL` で境界後に安定。切替罰が高すぎると見逃す→ `SWITCH_COST` を上げすぎない。 |
| **短3度上げ（+3半音）** ドラマチックなサビ転調 | 同上、+3 のジャンプ。相対調と紛れにくい | 近親割引 `DISCOUNT` の対象外（属/下属/相対/平行のみ割引）＝素直に転調検出されやすい。 |
| **サビ転調（Aメロ↔サビで調が違う）** 構造境界で調が動く | セクション境界に転調点が集中 | セクション境界（別機能の構造解析）が取れるなら**境界で切替罰を割引**すると精度↑（F3 の伸びしろ）。 |
| **平行調の往復（C↔Am 等）** 長短の行き来 | 相対調は**PC集合が同一**＝クロマでは区別不能。`resolveTonic` は「最も長く鳴る三和音の root+長短」で分離 | ここが `resolveTonic` の強み（相対ペアに縛らず継続長で長短を割る）。近親割引を効かせると往復を過剰に平滑化しうる → 平行調だけ割引を弱める余地。 |

**含意**: J-pop の主役は「半音/全音/短3度の直接転調（emit ジャンプ）」＝**継続長ベースの emit + 切替罰 DP と相性が良い**。
最難関は「相対調の往復」だが、これは `resolveTonic` が長短を継続長で割る設計なのでコード列ベースが有利（クロマ単独では原理的に無理）。

---

## 6. 自前 `resolveTonic` 窓化 との比較（結論: 本命）

**手元資産の実コード確認**（読むだけ）:
- `apps/api/src/common-progressions.ts:35` `resolveTonic(chords: {root,quality,dur?}[]) → {tonic, mode}`
  - `:37-42` 各コードを `root:M/m` の 24 枠に**継続長 `dur`（無ければ出現数1）で加点**。長短は `_isMinQ/_isMajQ`（`:33-34`）で判定。
  - `:43-44` **開始コードに +0.6、末尾コードに +0.3** のボーナス（トニック/解決先バイアス）。
  - `:45-48` argmax で勝者 1 調を返す。
  - コメント（`:29-32`）に設計思想: 「相対長短(Gm↔B♭)は音集合では区別不能→**最も強い三和音の root+長短**を継続長重みで選ぶ」「Dm 中心(D Phrygian 的)も拾える」。
- 呼び出し元: `:104`（`commonProgressions` 各曲のメイン調）、`:198`（`songCoreLoops`）。コメント `:192` に「出現数重みだとループ先頭 ♭VI を主音と誤検出→**dur 重みが正**」の実測知見。

**窓化に必要な最小改修**（F3 の実装メモ・本タスクではコード変更しない）:
- `resolveTonic` を「argmax 版」に加えて「**24次元スコアベクトルを返す版**」に分岐（内部 `score` Map をそのまま返すだけ、ロジック不変）。これが DP の `emit[t][k]`。
- 窓は `chords_timeline` を時刻中心 `[t-H, t+H]` でスライスして渡す。`dur` は既に秒で入る。
- 開始/末尾ボーナス（`:43-44`）は**窓の端**に効く＝局所トニックバイアスとして自然に働く（グローバル用の設計が局所でも意味を持つ）。

| 観点 | `resolveTonic` 窓化 + 切替罰 DP | HMM（次点） | 窓相関 KS 生窓 |
|---|---|---|---|
| 精度期待 | 高（POC で「コード頻度→調」95%整合の延長。継続長重みで相対調も割れる） | 高（同型の数理） | 中（小窓ノイジー・平滑化必須） |
| 実装コスト | **最低**（既存関数の分岐＋DP＋平滑化の純TS。依存ゼロ） | 中（確率モデル・学習/手調整） | 中〜高（前段クロマ or 別ライブラリ） |
| 既存資産再利用 | **最大**（`resolveTonic` の設計思想・実測知見をそのまま継承） | 低 | 低 |
| ライセンス | 自前（制約なし） | 自前実装なら制約なし | music21=BSD/essentia=**AGPL** |

**結論**: **`resolveTonic` 窓化 + 切替コスト DP + 最小滞在平滑化** が本命。
理由=(1) 入力がコード記号だけで閉じる（BTC 出力に直結）、(2) 継続長重みが相対調の長短を割れる＝J-pop の平行調往復に強い、
(3) 正則化/Tonal-Parsimony 論文が「切替罰＋最小長で過剰分割が消える」を実証済み＝設計に理論的裏付け、
(4) 実装コスト最小・依存ゼロ・AGPL 回避。精度が頭打ちなら HMM（次点）へ、それでも足りなければカデンツ加点や DNN を検討。

---

## 7. 評価軸（F3 実測で何を測れば合否が出るか）

**測定指標**:
1. **転調点の時間精度**: 正解転調点に対し、検出転調点が **±1小節以内 / ±2小節以内**に乗る率（境界 F1）。合格ライン初期値: ±2小節で 80%。
2. **セグメント調の正解率**（MIREX 系）: 各時刻の調ラベルが正解と一致する割合。重み付き（完全一致/属5度/相対/平行に部分点）も併記。
   参照値: 正則化論文 89.9%、HMM 82.6%（データは違えど桁感の目安）。
3. **過剰分割率**: 正解より多い転調を出した回数（借用の誤昇格＝False modulation）。理論上は「1〜2コード借用を転調にしない」を 0 件に近づける。
4. **見逃し率**: 実際の転調を検出できなかった率（半音上げ等の直接転調の取りこぼし）。

**評価曲の選び方**（既知転調曲）:
- **半音/全音上げ（トラックドライバー転調）**: サビ終盤+1〜+2半音の J-pop バラード（境界が鋭い＝時間精度の試金石）。
- **短3度上げ**のサビ転調曲。
- **平行調往復（C↔Am 型）**: 相対調の長短割りが効くかの試金石（クロマ単独手法との差が出る）。
- **借用のみ（転調なし）**: セカンダリドミナント/モーダルインターチェンジを多用するが**転調しない**曲＝過剰分割ゼロを確認する陰性対照。
- **転調なしの単純曲**: セグメント1個を返すか（false positive ゼロ）。
- 正解は**手元でのアノテーション**（他者コーパスからはリテラル進行を保存せず、統計/構造のみ）。BTC のコード誤りが混入するので、コード認識精度と分けて評価（「正解コードを与えた場合」と「BTC 出力そのまま」の二条件）。

**合否判定**: (a) 既知転調曲で転調点が ±2小節 80%以上、(b) 陰性対照（借用のみ/転調なし）で過剰分割ゼロ、(c) 平行調往復で長短を取り違えない。
この3点が揃えば F3 は合格＝グローバル単一調から `key_segments` へ移行してよい。

---

## 8. 出典URL一覧

- Papadopoulos & Peeters, "Local Key Estimation from an Audio Signal Relying on Harmonic and Metrical Structures", IEEE TASLP 2011: https://www.researchgate.net/publication/239766671
- Papadopoulos & Peeters, "Local Key Estimation Based on Harmonic and Metrical Structures", HAL: https://hal.science/hal-00511452v1/document ／ https://hal.science/hal-00655781v2/document
- Papadopoulos & Peeters, "Large-Scale Study of Chord Estimation Algorithms Based on Chroma and HMM", CBMI 2007: http://recherche.ircam.fr/anasyn/peeters/ARTICLES/Papadopoulos_2007_CBMI.pdf
- Gedizlioğlu & Erol, "A regularization algorithm for local key detection", *Musicae Scientiae* 2024: https://journals.sagepub.com/doi/full/10.1177/10298649241245075
- "Tonal parsimony in chord-sequence analysis: combining modulation cost and tonal vocabulary", arXiv:2606.03459 (CC-BY 4.0): https://arxiv.org/pdf/2606.03459
- music21 `analysis.windowed`: https://music21.org/music21docs/moduleReference/moduleAnalysisWindowed.html
- music21 `analysis.discrete`（KrumhanslSchmuckler/TemperleyKostkaPayne 等プロファイル）: https://music21.org/music21docs/moduleReference/moduleAnalysisDiscrete.html
- White, "Feedback and Feedforward Models of Musical Key", MTO 24.2 (2018): https://mtosmt.org/issues/mto.18.24.2/mto.18.24.2.white.html
- essentia `streaming_Key`（temperley/krumhansl/edma、AGPL-3.0）: https://essentia.upf.edu/reference/streaming_Key.html
- essentia `KeyExtractor`: https://essentia.upf.edu/reference/std_KeyExtractor.html
- 理論: Tonicization vs Modulation（Open Music Theory）: https://openmusictheory.github.io/Modulation.html ／ https://musictheory.pugetsound.edu/mt21c/TonicizationVersusModulation.html
- モーダルインターチェンジ/借用和音: https://www.thejazzpianosite.com/jazz-piano-lessons/jazz-chords/borrowed-chords/
- Truck Driver's Gear Change（半音/全音上げ転調）: https://tvtropes.org/pmwiki/pmwiki.php/Main/TruckDriversGearChange

（手元資産・実コード確認: `apps/api/src/common-progressions.ts:35`（`resolveTonic`）／呼び出し `:104`,`:198`／設計コメント `:29-34`,`:192`）
