# メロディ生成＝音楽理論上の不足箇所と実装計画（2026-07-09）

> **実装状況（2026-07-09 追記・本人が着手に転換）**：Step1〜5＋#8＋#9 を**全て実装・配線・UI露出まで完了**（コミット ac70d2a〜02d3388・api658緑/web312緑）。
> 全ノブ既定＝従来bit一致（回帰ゼロ）。露出ノブ＝`expression`(表情)/`phrasing`(句割り)/`cadence`(genChords終止型)/`runs`(走句)/`push`(食い)/`foreground`(自由さ)/`breathe`(入り遅れ)＋`analyze voiceleading`。
> **残**＝(a) 品質変更ノブの**耳セッションで既定値/プリセット較正**（expression/runs/push/foreground/breathe・churn回避で既定0据え置き中）(b) Step2第2段階＝骨格 genSkeletonFromModel の句割り追従（表面のカデンツ着地は済＝任意の磨き）(c) #6 テンション/avoid-note(B)・#7 旋法(C・P2後)(d) Step4 Phase3＝POP909量子化再計測でrun/前借り統計をデータ差替（要ローカルPOP909）。正典＝design#12-M。

コード実読（melodyCells.ts / skeleton.ts / degree.ts / generate.ts / mcp.ts / evalMelody.ts ほか）と
research doc 突合（motif-extraction / sixteenth-rhythm / self-check-log / 2026-07-07-next-dev-plan /
harmony-cadence-theory / backlog）に基づく総点検。**この doc 単体で別モデルが実装に着手できる**ことを目的に、
不足9項目のフィジビリ格付け → 推奨順序 → Step別の具体的修正方針（design骨子・先行テスト・変更点・検証）まで残す。

---

## 0. 前提＝現行アーキテクチャの要点（裏取り済・行番号は 2026-07-09 時点）

- 主経路は **V2 `genMotifMelodyV2`**（`apps/api/src/music/melodyCells.ts:499-850`）。MCP `gen_melody`
  （`apps/api/src/mcp.ts:494-504`）は常に useV2:true。legacy（`buildMotif`/`planSkeleton`/`applyExpression` 系）は
  他拍子・コード無しのフォールバック専用（`generate.ts:496-559`）。
- V2 の構成: 骨格 `genSkeletonFromModel`（`melodyCells.ts:239-284`・POP909学習 SKELETON_MODEL_DATA・hA/hB動機反復）
  → 表面 `mkMotif`（`:553-608`・RHYTHM16_DATA 16枠語彙＋move Markov）→ `genBest` 12本選別（`:634`・score `:611-631`）
  → `render`（`:667-715`・強拍=最近CT/弱拍=スケール歩行）→ ブロック発展 A/A'/B/A''（`:729-739`）
  → 後処理 ①強拍CT→②禁則→③gap-fill→④単一頂点→⑤検証（`:742-833`）→ swing 後段（`:835-848`）。
- 候補: `genMelodyCandidates`（`generate.ts:569`）n=8 → corpusTypicality ランク → 類似≥0.9除外 top3。
  opts は `Parameters<typeof genMelody>[3]` で透過＝**genMelody にノブを足せば候補経路へ自動で通る**。
- 評価: E-rule `evalMelody`（`evalMelody.ts:20-93`・8指標）/ E-corpus `corpusTypicality`（`:98-128`）。
  ランク軸は E-corpus のみ（gaming回避・`generate.ts:564` 付近に明記）。

### 方法論ガード（研究docで確定済・**違反禁止**）
1. **E-rule 総合点の最適化は gaming**（self-check-log R2 で実証）。総合スコア導入禁止・1本に潰さない。
2. **耳FBなしの表面 micro 調整は churn**（R-dwell で打ち切り済）。→ 各改善は**ノブ/型として露出**し、
   **既定値＝従来挙動と完全 bit 一致**（density/swing の前例）。既定値の昇格は耳セッション後の別コミット。
3. 決定的（同seed同出力）・音域[60,84]・他者コーパスは統計のみ（リテラル保存禁止）。
4. 修正はルール通り上から: **design.md #12-M 追記 → テスト赤 → 実装**。main 直。

---

## 1. 不足9項目とフィジビリ格付け

効果=実曲統計とのgap縮小×ユーザー価値／費用=実装規模＋データ作業／リスク=回帰・耳確認要否。

| # | 項目 | 再利用できる既存資産 | 新規規模 | リスク | 効果 | 総合 |
|---|---|---|---|---|---|---|
| 1 | **強拍非和声の能動配置**（倚音/掛留） | `classifyNCT`/`isResolvedNct`（`degree.ts:55-76`・5型分類完備だがV2未使用）、v1倚音（`melodyCells.ts:363-375`）、後処理パス規約（`:742-744`） | 小（後処理1パス＋ノブ透過 ~60行） | 低（既定0=bit一致） | **S**＝強拍CT ~100%→実曲57-90%へ。backlog「装飾を型に＝最重要」直撃 | **S** |
| 2 | **句構造(P0-b)のV2配線** | `planSkeleton`（`skeleton.ts:44-74`）完成済＝phrasing対称/非対称・role・cadenceDegree・breath 全部返すが **legacy専用＝V2で死んでいる**。http.ts:195 は受けるだけの死にパラメータ | 小〜中 | 中（骨格の2小節固定unitsに触る。既定symmetric=従来一致で封じる） | **S**＝ユーザー明言must（next-dev-plan P0-b） | **S** |
| 9 | **骨格休符（句頭遅延入場）** | SKELETON_REST_BY_POS＋v1 restMask（`melodyCells.ts:314-324`）＝ほぼコピー元 | 極小（~25行） | 低（既定off） | A＝実曲86%曲頭休 vs V2常時鳴り | **A+**（#2に同梱） |
| 5 | **カデンツ多様性**（半終止/偽終止/変終止） | planSkeleton cadenceDegree、B1コード追従着地（`melodyCells.ts:680-689`）、genChords の D→T 強制（`generate.ts:107`）、harmony-cadence-theory.md | 小〜中 | 低（opt-in enum） | A＝セクション接続の実需 | **A**（#2依存） |
| 3 | **16分細分層** | **語彙は16枠で既にある**（RHYTHM16_DATA・走句パターン含む）。gen出力0%の犯人は選別抑圧＝score の n16Pen=0.7/runPen=0.8（`:627-628`）＋音数上限（`:584-585`）。v1 `anticipate`（`:385-399`）、swing後段パスの前例 | 中（Phase1-2データ不要／Phase3で再計測） | 中〜高（**耳確認必須**） | **S**＝gen 0% vs 実曲44-56%（self-check-log「本物のgap・最優先級」） | **A**（本丸1） |
| 4 | **motif-driven前景** | blockループ roleOf（`:729`）、varyTail/invert、motif-extraction.md §4.5 実測（モチーフ占有23%・2.4回/8小節・自由材料77%に跳躍14%/同音23%） | 中〜大（自由材料roleの導入） | 高（出力の性格が変わる＝**耳必須**） | **S**＝跳躍0%/同音52%（脱ダルダルの正解） | **A**（本丸2） |
| 8 | メロ×低音の声部進行チェック | evalMelody の項目別metricパターン、genBass出力 | 小（純関数1本＋analyze露出） | 極低（**分析レンズのみ・生成非介入**＝耳不要） | B（backlog和声③「完全に未監視」） | **B+**（隙間に安く） |
| 6 | テンション(9/11/13)・avoid-note | chordPcs（7th品質まで）、genChords 7thパレット | 中（chord-scale簡易表＋snap候補拡張） | 中（ctOf/ctP/nearestChordTonePitch 全snap関数に触る・耳必須） | B（色気。#1・#3後で効く） | **B** |
| 7 | 教会旋法・ペンタトニック | scalePitchList は任意Set対応。scalePcs が major/自然短限定（`theory.ts:29-34`） | 中 | 中（SKELETON_MODEL_DATA が長短学習＝旋法ミスマッチ未知） | C | **C**（P2自作コーパス後に） |

### 重要な発見（計画の土台になる非対称）
- **legacy と V2 の機能逆転**: 倚音・句構造・骨格休符・expression ノブは全部 legacy/v1 側にあり、
  主経路 V2 ほど理論的仕上げが薄い。→ 上位3項目は「新発明」でなく**既存資産のV2への配線/移植**＝フィジビリ高。
- **16分は「ゼロから実装」ではない**: 語彙・走句処理（run→方向保持 `:598`・run後gap-fill `:606`）は実装済。
  score の抑圧を解除して狙って出せるノブにするだけで Phase1 が成立する。
- **同音反復ゼロの犯人**: `mkMotif` の `if (m === 0) m = r() < 0.5 ? 1 : -1`（`:601`）が move=0 を潰している。
  実曲の同音23%との乖離はこの1行に集約（Step5 の鍵）。

---

## 2. 推奨実装順序

クイックウィン（各1-2日粒・独立リリース可）→ 本丸（週粒・耳セッション挟む）。

1. **Step 1**: #1 強拍非和声ノブ `expression` — 最小コスト最大効果・依存なし
2. **Step 2**: #2＋#9 句構造V2配線＋骨格休符 — ユーザーmust・P0-b完了
3. **Step 3**: #5 カデンツ選択器 — Step2 の句配線が前提
4. **Step 4**: #3 16分細分層（runs＋push）— 本丸1・耳セッション必須
5. **Step 5**: #4 motif-driven前景 — 本丸2・Step4と同じ地帯を触るため直後
6. 随時: #8 声部進行レンズ（依存ゼロ・隙間に）
7. 後回し: #6 テンション（Step4-5後）→ #7 旋法（P2後）

全Step共通の型: design.md #12-M 追記 → 「ノブ未指定=従来bit一致」の回帰テストを最初に書く →
実装 → ユニット＋統計スイープ（項目別・総合点にしない）→ 耳確認ポイントを記録（既定値は据え置き）。

---

## 3. Step別 修正方針

### Step 1: 強拍非和声の能動配置（`expression` ノブ）

**位置づけ**: V2主経路内の後処理オプション（新規パス・思想は legacy `applyExpression`/v1倚音の移植）。

**問題**: 後処理①（`melodyCells.ts:777`）が終止以外の全強拍を無条件CT化＝強拍CT率~100%。
実曲は57-90%（POP909実測57%・v1コメント `:364` 参照）。「綺麗すぎる/自動生成感」の主因のひとつ。

**design.md #12-M 追記骨子**（新節「V2表情層＝強拍非和声」）:
- `expression` 0..1（既定 undefined=0=従来完全一致）。後処理⑤（`:833`）の後・swing（`:835`）の**前**に表情パスを1本追加。
- 対象: 強拍CT音のうち「次音が順次(≤2半音)先でその時点のCT」の位置。確率 expr で
  (a) 前音と同音なら **suspension**（保持）／(b) それ以外は **appoggiatura**（次音=解決音の1スケール度上・spAt準拠）。
- 適用前に `classifyNCT`（`degree.ts:55`）で判定し `isResolvedNct` 保証＋隣接音と `isForbiddenIv`（`:755`）
  チェック＝禁則を再導入しない。終止音・句末着地は不変（後処理規約(a) `:743` 継承）。決定的（makeRng(seed+定数)）。
- E-ruleとの関係を明記: expr>0 で `chordToneStrong` が下がるのは**仕様**（総合点で選ばない原則の再確認）。

**先行テスト**（melody-cells-v2.test.ts）:
- expression未指定/0 → 既存出力と deep-equal（回帰ゼロ）
- expression=1・固定seed → 強拍に非CTが存在し、全てが classifyNCT ∈ {appoggiatura, suspension, passing, neighbor}（"other"=0）かつ次音が順次CT
- 終止音pitch不変・禁則跳躍ゼロ維持・決定性
- スイープ: seed 1..100・expr=0.4 で強拍CT率 0.55..0.95 帯

**変更点**:
- `melodyCells.ts`: `genMotifMelodyV2` opts に `expression?: number`（`:505`）＋ `:833` 後に表情パス（~40行）
- `generate.ts`: `genMelody` opts型（`:386`）＋V2呼び出し（`:471`）へ透過
- `mcp.ts`: `gen_melody`（`:496-499`）に `expression: z.number().min(0).max(1).optional()`（density/swing と同格）
- `http.ts`: `:192-196` に `expression: num(b.expression)`

**検証**: ユニット＋スイープ＋耳確認=「expr 0/0.3/0.6 の3本聴き比べ。もたれ感が出るか・気持ち悪い掛留が出ないか」。

### Step 2: 句構造(P0-b)のV2配線＋骨格休符

**位置づけ**: legacy資産 `planSkeleton` のV2主経路への配線＋verb露出。骨格休符は v1→V2 移植（既定off）。

**問題**: `planSkeleton`（`skeleton.ts:44-74`）は問い/答え・句末カデンツ度数・息継ぎ・対称/非対称を返す完成品だが
legacy 専用。V2 は (i) `genSkeletonFromModel` 内の `u%2===1` 固定 phraseEnd（`melodyCells.ts:267,274`）、
(ii) blockループの last のみ toTonic（`:733,:738`）で句構造が暗黙・対称固定。
`gen_melody`（MCP）は phrasing を受けない＝**チャット到達不能**（next-dev-plan P0-b の残作業そのもの）。

**design.md 追記骨子**（新節「句構造のV2配線＝P0-b完了」）:
- `planSkeleton` を V2 の句SSOTに。generate.ts V2分岐（`:433-476`）で
  `planSkeleton(bars, f.meter, { phrasing: opts?.phrasing })` → Phrase[] を
  `phrases?: { startBar; bars; role; cadenceDegree; isLast }[]` 形式で `genMotifMelodyV2` 新optsへ。
- **第1段階（実装済 2026-07-09・当初案から改訂）**: 「固定ブロック末で着地」は非対称でブロック(mb=2)と句割り([3,3,2]等)がズレるため**棄却**。
  代わりに **句末着地を「ブロックに紐づけない独立パス」として句境界の実beatで、後処理⑤の後・expressionの前に実行**
  （expression と同じ配置＝実証済みパターン）。各句の**最終onset**を cadenceDegree のpc（1=主音/5=属音）へ B1和声追従で着地
  （そのpcがコードにあれば採用・無ければ最寄りコード音）。approach音の禁則は着地保護で `placeNonForbidden` 回収・単一頂点維持。
  expression は cadence 着地indexを除外。＝**対称/非対称どちらも正しい位置で呼吸**。gen_melody(MCP)に phrasing enum を追加（従来欠落）。
  正典＝design#12-M「句構造(P0-b)のV2配線」。**残（第2段階）**＝骨格(genSkeletonFromModel の u%2 固定句末)の句割り追従＋骨格休符(#9)。
- **骨格休符**: `skeletonRest?: number`（0..1・既定0=off）。v1 `:314-324` を移植し SKELETON_REST_BY_POS を
  **句頭相対スロット**で引く（v1は曲頭相対＝句が取れなかったため。ここが移植時の改良点）。
  notes組立後（`:740` sort直後・後処理①の前）に rest域onset drop＋直前音dur切り。
- **第2段階（別タスクとして design に「次」と記載）**: 非対称句割りへ blockループ自体を追従（可変長ブロック）。

**先行テスト**:
- phrasing未指定 → 既存出力bit一致（既存property群も緑のまま）
- bars=8, phrasing="asymmetric" → asymmetricBars=[3,3,2]（`skeleton.ts:27-40`）の句末（bar2末/bar5末）で
  着地音がその時点のコード構成音かつ息継ぎgap>0.4 が存在
- antecedent句末の着地pcが「主音でない率」が seed sweep で有意に上がる（cadenceDegree=5 の効きの証拠）
- skeletonRest=1・固定seed → rest域内 onset ゼロ＋曲頭2拍無音のseedが存在（rest率0.855）。未指定→不変
- mcp.test.ts: gen_melody が phrasing を受理

**変更点**:
- `melodyCells.ts`: `genMotifMelodyV2` opts `phrases`/`skeletonRest`、blockループ（`:730-739`）の着地度数、
  `genSkeletonFromModel`（`:239`）に `phraseEndSlots`
- `generate.ts`: V2分岐で planSkeleton → phrases 変換 → 透過
- `mcp.ts`: gen_melody に `phrasing: z.enum(["symmetric","asymmetric"]).optional()` ＋ skeletonRest 露出
  （ユーザー向け命名は「breathe/ためる」等 describe で補足）
- `http.ts`: 既存 `:195` phrasing がそのまま生きる（動作変化を design に明記）

**検証**: スイープ=休符率/句末長音率 vs SKELETON_REST_BY_POS・実曲。
耳確認=「8小節asymmetricが3+3+2に聞こえるか」「前楽節末が『問い』に聞こえるか」「遅延入場が気持ちいいか」。

### Step 3: カデンツ選択器（half / deceptive / plagal / full）

**位置づけ**: メロ側=Step2の句配線の拡張（V2主経路）／和声側=genChords拡張。両方opt-in。
harmony-cadence-theory.md 盲点①②の正準化。

**design.md 追記骨子**:
- `cadence` 語彙: `"full"`(PAC=V→I・1̂) / `"half"`(最終V・2̂/5̂) / `"deceptive"`(V→vi・1̂をviの3度で受ける) /
  `"plagal"`(IV→I)。句末ごとに (a)和音 (b)上声着地度数 の2軸で定義（理論docの表を転記）。
- 和声側: `genChords`（`generate.ts:93-140`）に `cadence?`。既に `:107` で末尾 D→T 強制済＝ここを型で分岐
  （half=最終V／deceptive=最終2つ V→vi・短調はV→♭VI／plagal=IV→I／full=従来）。
- メロ側: Step2 の cadenceDegree 経路を上書きするだけ。deceptive は「1̂着地だが最終コード=viの3度として鳴る」＝
  B1コード追従ガード（`melodyCells.ts:683`）が既にこの意味論を持つため差分極小。
- ユースケース正準例: 「Aメロ末=half・1番サビ末=deceptive・ラスト=full」。

**先行テスト**: gen_chords cadence="deceptive" → 最終2和音 root/quality が V→vi（key移調込み）／"half" → 最終V。
gen_melody（chords=V終わり）で着地がV構成音。cadence未指定→両関数とも従来bit一致。

**変更点**: `generate.ts`（genChords `:103-128` 分岐＋genMelody透過）、`melodyCells.ts`（Step2 の cadenceDegree 消費部のみ）、
`mcp.ts`（gen_chords/gen_melody に cadence enum）、`http.ts` 透過。

**検証**: ユニット中心（和声は決定的に検証可能）。耳確認=「偽終止で『続く感』が出るか」1点。

### Step 4: 16分細分層（本丸1・`runs`＋`push` ノブ）

**位置づけ**: V2主経路（mkMotif/score/選別）＋後段パス。Phase3のみデータ作業。sixteenth-rhythm.md の実装確定。

**現状認識（designに明記すること）**: 語彙は16枠済（RHYTHM16_DATA は16分裏slot・走句パターンを実際に含む）。
gen出力0%の原因は**選別抑圧**＝score の `n16Pen=0.7`/`runPen=0.8`（`:627-628`）と音数上限 2..4/小節（`:584-585`）。
density は総量ノブであり「走句らしさ」（実曲=16分onset連続率~66%・孤立稀）と「前借り」（位置固定の食い）を
狙って出せない。

- **Phase 1（データ不要）**: `runs` 0..1（既定 undefined=従来一致）。効き:
  (a) rhythmVocab を走句含有量で再重み付け（density の densW `:520` と同型・`w * pow(runLen16+1, k(runs))`）
  (b) n16Pen/runPen を runs 連動で減衰（density連動 `:627-628` と並置）
  (c) 受入音数上限 hiN を runs で拡張。
  ピッチは既存の走句処理（run→rdir方向保持 `:598`・run後gap-fill `:606`）をそのまま使う＝**新ピッチ論理なし**。
- **Phase 2（前借り＝division-level syncopation）**: v1 `anticipate`（`:385-399`）をV2後段に移植した `push` 0..1。
  **位置固定**（毎小節同じ拍のonsetを16分ぶん前へ＝研究doc「毎小節同じ拍を同じ量」）。
  swingパス（`:835-848`）の直前に配置・swing同様のdur精算。compound(6/8)は対象外。
- **Phase 3（データ）**: POP909量子化再計測（sixteenth-rhythm.md §4-1 交絡除去）→ 位置別run確率・run長分布・
  前借り位置率を `motifModelData.ts` に `RUN16_DATA`/`PUSH_DATA` として同梱（統計のみ）。
  Phase1のヒューリスティック重みを学習分布へ差替。前提=POP909ローカル所在（project-corpus-handoff 参照）。

**評価目標**（sixteenth-rhythm.md §4-4）: 16分音価率 44-56%・16分onset連続率 ~66%・孤立16分稀。

**先行テスト**:
- runs/push 未指定 → bit一致。runs=1/push=1 でも決定性・音域・禁則ゼロ・単一頂点の既存propertyが緑
- runs=1・seed sweep → 16分裏onset率 > 0.15 かつ「16分onsetのうち隣接0.25以内」率 > 0.5（走句性）
- push=0.5 → 前借りonsetが**毎小節同一拍位置**・終端不変
- corpusTypicality が runs>0 でクラッシュせず、スコアが下がらない（16枠語彙で測っている前提の確認）

**変更点**: `melodyCells.ts`（mkMotif `:553-608`・score `:611-631`・後段pushパス新設・opts `:505`）、
`generate.ts`（透過）、`mcp.ts`（runs/push。ユーザー向け語彙は「走り」「ツッコミ」等）、`http.ts`、
（Phase3で）`motifModelData.ts`。

**検証**: 統計スイープ（上記3目標値・seed 200本）＋**耳セッション必須**
（runs 0/0.4/0.8 × push 0/0.5 のマトリクスを実機SectionEditorで。既定は0据え置き・推奨プリセットをdocに記録）。

### Step 5: motif-driven前景（本丸2・概要）

**位置づけ**: `genMotifMelodyV2` blockループ（`:729-739`）の構造拡張。Step4直後に着手（同じ地帯）。

- roleOf に「自由材料」role を追加し、モチーフ露出を実測構造へ寄せるノブ `foreground`
  （既定=従来の A/A'/B/A''）。目標=motif-extraction.md §4.5: モチーフ占有23%・2.4回/8小節・反行20%・リズム変形12%。
- 自由材料は mkMotif を跳躍/同音許容の緩和スコアで別サンプル（跳躍14%/同音23%目標）。
- **鍵**: `:601` の `if (m === 0) m = ...` が同音反復を全潰ししている＝自由材料側でこの潰しを解除する。
- 耳セッション必須。詳細designは Step4 完了後に（mkMotif がどう変わったかに依存するため）。

### 随時: #8 メロ×低音の声部進行レンズ（生成非介入）

- 純関数 `analyzeVoiceLeading(melody, bass)`: 並行5度/8度・対斜・声部交差の検出（backlog和声③）。
- evalMelody 隣に新設・MCP `analyze` へ露出。生成には介入しない＝耳確認不要・どのStepの隙間でも可。

---

## 4. やらないこと（再確認・研究docの確定事項）

- E-rule総合点での自動採用／総合スコア導入（gaming実証済）
- 耳FBなしの既定値変更・表面micro最適化（churn実証済）
- 外部ニューラルメロAI・常設外部評価サーバー・完成トラック一括生成
- 他者コーパスのリテラル保存（統計のみ）
- #7 旋法対応（P2自作コーパス後に本人の癖と一緒に検討が筋）

## 5. 残置（今回スコープ外・別途）

- #6 テンション/avoid-note（Step4-5後に着手判断）
- 進行コーパスの質是正（2コード断片/長短分裂＝melody-chord-audit M5/M6・データ作業）
- complete_melody の 6/8 発展作り込み・局所infill（backlog）
- P2 自作mp3コーパス（next-dev-plan キーストーン・本計画と独立に進められる）
