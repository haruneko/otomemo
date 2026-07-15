# 歌詞先行メロディ生成 アプローチB＝Orpheus型・専用DPエンジン路線（設計＋難易度測定）

- 作成: 2026-07-15（Fable設計・コード変更なし・読みと設計のみ）
- 位置づけ: 「歌詞→メロ」をどう作るかの路線比較のうち **B路線＝歌詞から出発する専用エンジンを新設（V2は触らない）** の設計書。並行してA路線（V2拡張）・C路線（難易度監査）が別走行。
- 理論正典: `docs/research/2026-07-14-jp-prosody-melody-rules.md`（M3。Orpheusの層分離＝アクセント整合を硬い制約で刈り・和声/跳躍/音域を柔らかいコストに・DP最尤探索。R-01〜14／A-01〜10）
- 直近の実測資産: `2026-07-15-kariuta-accent-feasibility.md`（pyopenjtalkでモーラ20/20・核・句境界・spawn 0.13〜0.23s）／`2026-07-15-prior-informed-transcription.md`（corpus-Viterbi復号＝**実装済み** `apps/api/src/music/melody-decode.ts`）
- 思想: 機械は候補まで・複数案・決定的（seed付き乱択は可）。

---

## 0. TL;DR

**設計骨子＝「二段DP・骨格の上でOrpheusを回す」**。

1. **リズム層（Stage R）**: pyopenjtalk（`accent.ts`＋`accent.py`＝実装済）でモーラ列・アクセント核・アクセント句境界を取り、R規則（R-01〜11）で**モーラ→拍グリッド割付を先に確定**（Orpheusと同じ「リズムは前段で固定」。ただし密度・弱起・句末伸ばしの直積で**行ごと複数案**を持つ）。
2. **音高層（Stage P）**: 各 onset スロット×音域窓内ピッチの格子で **Viterbi/DP**。**硬い制約＝アクセント核の下がり目（DOWN）で上昇遷移を刈る**（A-01のみhard・UP/FLATはsoft＝過剰平板化を避ける）。**柔らかいコスト＝コードトーン事前（corpusStats chordRelStrong/Weak）＋度数bigram（loadNoteTransitions）＋跳躍規則＋音域tessitura＋母音開口度×音高＋句末カデンツ**。`melody-decode.ts` のViterbi骨格・コスト重み・corpus結線を写経元に転用（コピー改変・直接importは格子が違い不可）。
3. **「正しいが平板」への答え＝骨格ガイド項**: `genSkeletonFromModel`（コーパス学習・arch輪郭・フォーム反復・倚音色付け＝全部実装済）で**構造線を先に引き、DPのemissionに「骨格からの距離」項を入れる**。Orpheus型DPを「骨格の装飾実現器」に格下げする＝大域輪郭・頂点・モチーフ反復は骨格層とリフレイン複写（M9文法）が担い、DPは「その骨格を、この歌詞で正しく歌う」だけを解く。人間製骨格（SkeletonContent＝骨格の机）を注入すれば「自分のフックに歌詞を乗せる」が同じ経路で成立。
4. **多様性**: 構造レバー（リズム密度×骨格seed×輪郭型×句割り×終止開/閉）の直積サンプル＝大域多様性 ＋ **Gumbel摂動付きViterbi（perturb-and-MAP）**＝seed決定的な局所多様性。n本生成→`melodySimilarity` で似すぎ除外→top-k（`genMelodyCandidates` と同じ流儀）。N-best Viterbiは「1音違いの近傍解」しか出ないため不採用。

**難易度＝M+（Lの下限）**。根拠: (a) 状態空間は行あたり数百・全曲でも10万オーダーの評価＝計算は自明、(b) 部品の再利用率が異常に高い（アクセント抽出・モーラ分割・Viterbi雛形・コーパス事前・骨格生成・整合検査・VOICEVOX耳確認＝**全て実装済み**。新規はリズム割付とDP格子の2純関数＋結線のみ）、(c) 「使える最小版」＝3スライス・新規約900行＋テスト＝2〜3セッション、(d) ただし重み較正と「歌に聞こえるか」は耳依存で、そこがL側に膨らむ余地。XLでない理由＝Orpheus本体の重い部分（韻律HMM・和声生成・歌唱合成）は全部既存資産が肩代わりする。

---

## 1. 入出力契約

```
入力: {
  lyrics: string[]            // 行単位（かな or 漢字混じり。漢字はpyopenjtalkが読みを確定）
  frame?: Frame               // key/mode/tempo/meter/bars/voice_profile/palette（normalizeFrame 既存）
  chords?: Chord[]            // 任意。無ければ genChords(frame,seed) で自前調達（既存流儀）
  skeleton?: SkeletonContent  // 任意＝人間製/機械候補の骨格注入（骨格の机と同契約）
  seed?: number               // 明示=1本決定的／null=多様候補k本
  opts?: { density?: 0..1; accentStrict?: 0..1; k?: number; phrasing?; contour?; ... }
}
出力: GenResult items[] = { kind:"melody", content:{ notes:[{pitch,start,dur,syllable}] }, label }
      ＝ syllable 埋め込み済み（set_lyric 不要のワンショット）＋ meta.fitReport（自己検査結果）
```

- 歌詞1行＝1フレーズ（ブレス単位）が既定。bars 未指定時は行のモーラ数と density から自動（8モーラ≈2小節が8分基調の標準密度）。
- データモデルは design #13 の裁定（歌詞は独立エンティティにしない・`Note.syllable` 埋め込みが正典・同じ音違う歌詞は別メロネタ）にそのまま従う＝**新スキーマ不要**。

## 2. リズム層（Stage R）＝モーラ→音価

**判断: R規則ベースのテンプレ割付を前段で確定し、DP内同時最適化はしない（v1）。**

- 理由①: 日本語歌の譜割りは1モーラ=1音符原則（R-01 hard）でテンプレ性が強く、リズムを連続最適化しても得るものが少ない。Orpheus自身もリズムを入力テンプレに固定している（M3 §1.1）。
- 理由②: モーラ×音高×拍位置の3次元同時DPは組めるが（状態はまだ小さい）、コスト設計が音高×リズムで干渉し較正が泥沼化する。**層の分離はM3 §7-6の明示原則**（混ぜると重み調整が破綻）。
- ただし**行ごとにリズム候補を複数持ち、候補ごとに音高DPを回して上位を取る**＝疑似同時最適化（階層化）。これが多様性の一軸を兼ねる。
- 将来拡張（backlog）: onset ごとに {前倒し/ジャスト/後ろ} ×3 の微小オフセット格子を音高DPに直積（状態×3で済む）＝シンコペ最適化。v1はやらない。

### 割付アルゴリズム（`planLyricRhythm`・新規純関数）

1. **アクセント句分解**: `extractAccents`（実装済 `apps/api/src/accent.ts`・pyopenjtalk spawn 0.13〜0.23s）→ 行ごとの `{moras, kernel}[]`。失敗時は `analyzeMoras`＋内蔵ヒューリスティックへ graceful fallback（`analyzeLyricFit` と同じ既存流儀）。
2. **役割付与**: `prosody.ts roleOf` 流用＝ー→tie（直前音価延長・新アタックなし）／っ→rest（詰め）／ん→独立onset（R-02/03/04）。
3. **句割り整列**: 行→`planSkeleton`（実装済）の句へ写像。**アクセント句頭（内容語頭）を強拍アンカーに**（R-09）、句頭が PICKUP_WORDS／助詞なら**弱起へ**（R-10・`suggestLyricRhythm` の pickup 判定流用＋アクセント句境界で強化）。
4. **密度**: unit ∈ {1拍（4分基調・バラード）, 0.5拍（8分基調・J-pop標準）, 0.25拍（16分・ボカロ早口）} を density ノブと tempo から選ぶ。字余り（モーラ>枠）は細分＞弱拍2モーラ相乗り＞特殊拍タイ吸収の順（R-07）。
5. **句末**: 最終onsetの音価を伸ばし（R-11 長音化）、句末に休符（ブレス≈0.7s相当＝skeleton.ts breath と同思想）。字足らずは句末伸ばしで吸収（R-08）。
6. 出力: `RhythmPlan = { slots:[{startBeat, dur, moraIdx, role, strong, apRel}] }` を行ごとに2〜4案。`apRel ∈ {UP,DOWN,FLAT,BOUNDARY}` は隣接モーラ対の朗読関係（`accentContour` 実装済を流用）を slot 対に事前焼き込み＝**DPはこの列を見るだけ**。

`suggestLyricRhythm`（実装済・basic/subdivide/tail の3テンプレ）はモーラ分類と役割付けの土台として流用するが、**拍グリッドへの絶対配置・小節割り・弱起の実配置が未実装**＝ここがStage Rの新規実装の本体（見積 §7）。

## 3. 音高層（Stage P）＝アクセント制約付きViterbi

### 3.1 状態空間

```
格子: 行ℓの onset スロット i=0..N-1（tie/rest はDP対象外＝音価処理のみ）
候補集合 P_i = { p ∈ (scalePitches ∪ chordTones(t_i)) : lo ≤ p ≤ hi }   // |P_i| ≈ 15〜22
状態 s = (p, g)   g ∈ {none, leap+, leap-}   // 直前が跳躍(|≥5|)かの2次情報＝gap-fill用
```

- 音域窓 [lo,hi] は voice_profile（WP-M4）＋ M7 tessitura doc の実用帯。scalePitches は `scalePitchList`（実装済）、コードトーンは調外も許す（`nearestChordTonePitch` A2/A3 の教訓＝短調Vの導音・セカンダリードミナントの色音に乗れる集合にする）。
- 規模: 行あたり onset 10〜16 × 状態 ~60 → Viterbi評価 ~6万/行・全8行でも50万未満＝**ミリ秒オーダー、性能問題なし**。
- 行間の連続性: 行ℓ+1 の初期分布に行ℓ最終音からの遷移コストを接続（V2 の `skelStart=prevEndPitch` と同思想）。ブレスでマルコフ連鎖はソフトリセット（遷移重みを半減）。

### 3.2 硬い制約（許容遷移の刈り込み）

| 朗読関係（slot i→i+1・同一アクセント句内） | 刈る遷移 | 根拠 |
|---|---|---|
| **DOWN**（核直後） | **q > p を禁止**（-∞） | A-01最重＝語義誤解（箸/橋型）。Orpheusの核心 |
| BOUNDARY（アクセント句境界） | 刈らない | 句頭は低リセット＝跳躍上昇の解放点。むしろここが跳躍の置き場 |
| UP / FLAT | 刈らない（softコストへ） | **重要な設計判断（§5）**＝UPまで刈ると朗読の音写に直行する |

- `accentStrict` ノブ（0..1・既定0.5）: 1.0=Orpheus純正（UP×下降も刈る）／0.5=既定（DOWNのみhard）／0=全部soft（＝警告器 `analyzeLyricFit` と等価な採点だけ）。**hardでもユーザー上書き可**（M3の思想）。
- 平板⓪↔尾高②の取り違え（kariuta実測 §3）は語内コンターが同一なので**DOWN刈りには実質無害**。ただし「句内の語境界直後のDOWN」（助詞の下がり）は取り違えリスクがあるため**hardにせずsoftへ落とす**（実測 §4-2 の注意をそのまま採用）。
- 音楽側のhard: |q−p|=6（三全音）と |q−p|>12 は禁止（E-rule ①と同じ）。

### 3.3 柔らかいコスト（log-linear・melody-decode と同型）

```
総コスト = Σᵢ E(i,pᵢ) + Σᵢ T(i, sᵢ→sᵢ₊₁) + Gumbel(seed,τ)      // argmax = Viterbi

E(i,p) =  w_chord(strongᵢ) · log P_chordRel( (p−rootᵢ) mod 12 | strong/weak )   // loadSkeletonPriors 実装済
        − w_range · max(0, tessitura窓からの半音距離)                            // melody-decode W_RANGE と同じ
        − w_skel(i) · (p − skel(tᵢ))² / (2σ_s²)                                  // ★骨格ガイド項（§5）
        − w_open · openPenalty( openness(moraᵢ), 音高帯(p) )                     // 高音×狭母音(i/u)を減点（L1 V2の生成側転用・opennessSeq 実装済）
        + w_cad · [i=N−1] · bonus( deg(p) = cadenceDegreeℓ )                     // planSkeleton の句末 5̂/1̂・最終行は 1̂

T(p→q) =  w_big · log P_bigram( rel(p) → rel(q) )                               // loadNoteTransitions（tonic相対pc "4>2"）・transProb 実装済
        − w_acc · [apRelᵢ=UP ∧ q<p] · (1 + |q−p|/2)                             // A-03 soft
        − w_flat · [apRelᵢ=FLAT ∧ |q−p|≥5]                                      // A-05 soft
        − w_leap · [8 ≤ |q−p| ≤ 12]                                             // 大跳躍のコスト（禁止は3.2）
        − w_gf   · [g=leap± ∧ 逆向きstepで回収しない]                            // gap-fill（E-rule ②をhard-ish に）
```

初期重み（較正の出発点＝**melody-decode の実証済み値を移植**）: `w_chord` strong 0.6 / weak 0.25、`w_big` 0.5、`w_range` 0.3、新規: `w_skel` 0.8（句頭・頂点スロット）/ 0.4（中間）、`w_acc` 1.0、`w_flat` 0.5、`w_open` 0.2、`w_cad` 2.0、`w_leap` 0.8、`w_gf` 0.6、Gumbel温度 τ=0.35。melody-decode 同様、**事前全体を1本のλでスケールする退避路**（λ=0で「アクセントhard＋骨格＋カデンツのみ」の素の解）を持つ＝較正とA/Bが1ノブで回る。

### 3.4 melody-decode.ts の転用実査（実コード確認済）

| 部品 | melody-decode の実体 | B での扱い |
|---|---|---|
| Viterbi本体（V/back/argmax/traceback） | L154-179・格子＝seg×±1半音の3候補 | **構造をコピー改変**。格子が「時間秒×3候補」→「拍slot×20候補×leapフラグ」に変わるため直接importは不可 |
| `transProb`（bigram照合） | L97-104 | **そのまま流用可**（共通util化 or 写経・~10行） |
| `priorPct`＋`PriorBin` | L90-94 | 同上 |
| コード時刻引き・強拍判定 | L52-88（秒ベース） | Bは拍グリッド自前（RhythmPlan が strong を焼き込み済）＝不要 |
| 重み定数・λ退避路の思想 | L17-26 | **初期値と設計思想を移植**（実測較正済みの資産価値が大きい） |

結論: **「エンジンをimport」ではなく「検証済みの設計・重み・corpus結線パターンの写経元」として転用**。corpusStats（`loadNoteTransitions`/`loadSkeletonPriors`/`hasCorpusStats`）への結線コードは reaper.ts の結線と同型がそのまま書ける。

## 4. 多様性の出し方（Viterbi最尤=1本 問題）

| 手法 | 判定 | 理由 |
|---|---|---|
| N-best（list Viterbi） | **不採用** | 実装が重い割に「1音だけ違う近傍解」が並ぶ＝候補として無意味（既知の欠点） |
| 温度付きFFBS（forward-filtering backward-sampling） | 採用可だが次点 | 理論的に正しい posterior サンプル。logsumexp実装が一手間 |
| **Gumbel摂動＋Viterbi（perturb-and-MAP）** | **採用（局所多様性）** | E(i,p) に seed 由来の Gumbel(0,τ) を足して argmax するだけ＝**Viterbi本体無改造**・seed決定的・τで最尤〜ばらけを連続制御 |
| **構造レバー直積（大域多様性）** | **採用（主軸）** | リズム密度×骨格seed×輪郭型(arch/asc/desc/valley＝SkelContour実装済)×句割り(period/sentence)×終止(開/閉) から候補ごとに1組サンプル |

生成フロー: n=8〜12本（構造レバー×Gumbel）→ 完全重複除去 → `melodySimilarity < 0.9` で似すぎ除外 → `corpusTypicality`＋`evalMelody`＋fitScore の複合で並べ替え → top-k（既定3）。**`genMelodyCandidates`（generate.ts L621-660）の枠組みそのまま**＝「候補まで・審判しない」哲学も既存実装が体現済み。

多様性の本質論: 局所ノイズ（Gumbel）は「同じ骨格の別の歌い回し」しか出さない。**候補が本当に違って聞こえるのは骨格と輪郭が違うとき**＝大域レバーが主・ノイズが従。これは「サンプルはバリエーション（複数seed・進行違い・長短）」のオーナー方針の実装形。

## 5. 最難関「正しいが平板」への答え

**問題の正体**: アクセント整合＋和声＋跳躍最小のDPは局所マルコフ＝「その場その場で無難な音」を選ぶ。欠けるのは (1)大域輪郭 (2)反復/モチーフ性 (3)頂点＝いずれも**1次マルコフでは原理的に表現できない大域構造**。Orpheusが「正しいが歌にならない」と言われる根はここで、コスト重みをいくら弄っても解けない（重み較正の問題ではなく表現力の問題）。

**答え＝大域構造は骨格層に外注し、DPは装飾実現に徹する**（4点セット）:

1. **骨格ガイド項 `w_skel`**（§3.3）: `genSkeletonFromModel`（実装済・実コード確認済）が既に持つもの＝コーパス学習の度数遷移・arch輪郭（sin包絡＝頂点を中央帯へ）・Kopfton→主音のUrlinie近似・フォーム反復（period/aaba/sentence＝skelFormPlan）・距離条件付き変奏（M9文法 literalProbByDist）・強拍倚音の色付け（skelColor）。**この構造線からの二乗距離をemissionに入れる**＝大域輪郭と頂点設計が骨格から降りてくる。アクセント制約は「骨格の周りをこの歌詞でどう歌うか」を刈る。V2と同じ「骨格→表面」の思想で、**表面実現器だけを歌詞駆動DPに差し替えた**形。
   - w_skel は**全slot均一にしない**（句頭・頂点slotで強く 0.8、中間 0.4）。均一だとアクセントと骨格の板挟みで中庸に潰れる（WP-M1のsoft包絡の轍＝カデンツアンカーに負ける、の逆版）。
2. **リフレイン複写（R-13×M9）**: 同一/類似歌詞行（正規化かな一致 or 母音列類似）を検出し、2回目以降は**1回目の解のリズムを保存して音高だけ現コードへ再フィット**（`refitIdxToChord`・`pickSkelCopyMode` 実装済＝「リズムがモチーフ同一性を担う」M9 §7-4）。**モチーフ性はDPで作らず複写で作る**。earworm実証（M6「反復は最も頑健な記憶予測子・大域は平凡でよい」）と整合。
3. **頂点×母音**: `w_open`（開口度×音高整合）が「頂点にア段・高音に狭母音を避ける」を引き寄せる（L1 V2メトリクスの生成側転用）。骨格archの頂点と歌詞のア段が重なる行頭合わせは、リズム層の行→句写像で吹き寄せる（サビ行を arch 頂点句に割り当てる等＝v2拡張）。
4. **人間の骨格を注入する口**: `skeleton?: SkeletonContent`（骨格の机 S6 と同契約・`skeletonToV2Skel` 実装済）＝「自分で書いたフックの構造線に歌詞を正しく乗せる」ユースケース。**これがB路線の思想的な本丸**＝フックの霊感は機械が出さない（melody-eval-ceiling の結論どおり）。機械骨格は叩き台、人間骨格は仕上げ足場。

**正直な限界**: この4点でも「フックが書ける」保証はない。B路線の勝ち筋は**アクセント正しさ×量×操作性**（=候補の足場品質）であって、耳を掴む一撃は選ぶ側（人間）の仕事。「正しいが平板」は**完全には消えない・骨格の質まで薄めるのが上限**、と明記しておく。

## 6. 受け入れ基準案

### 機械指標（自動・回帰スイート化）

1. **自己無矛盾（最重要オラクル）**: 生成候補を `analyzeLyricFit`（pyopenjtalk accents 自動注入＝実装済）に通し **A-01(red) hits = 0**（hard刈りの検証）・fit score ≥ 0.9・accentStrict=0.5 既定で A-03 発生率 ≤ 10%。**生成器と警告器が独立実装なので、これが本物のクロスチェックになる**（同じ規則表M3から別経路で実装済＝二重実装が初めて資産化する）。
2. **E-rule床**: `evalMelody` score ≥ 0.7・禁則跳躍0・chordToneStrong 0.6〜0.8帯（コーパス実測 強拍CT 65.8% に整合＝高すぎも減点対象）。
3. **らしさ**: `corpusTypicality` が同 frame/chords の V2 出力（`gen_melody useV2`）と同帯（−20%以内）＝コーパス感を失っていない。
4. **モーラ契約**: 全モーラ1:1割付（tie/rest除く）・`analyzeMoras` round-trip 一致・syllable 全埋め。
5. **決定性と多様性**: 同seed同入力でビット一致／k候補の相互 `melodySimilarity` < 0.9／λ=0退避路が「アクセントhard＋骨格のみ」の素の解に一致。
6. **性能**: 8行16小節 k=3 で DP < 500ms・accent spawn 込み < 2s。

### 耳の的（オーナー手番・VOICEVOX sing パイプ＝#13c 実装済を使う）

7. 同じ歌詞4〜8行で k=3 を歌わせて A/B: (a) **聞き取り**＝歌詞が字幕なしで聞き取れる・語義誤解ゼロ（箸/橋型の実地確認）、(b) **脱・朗読**＝「読み上げの音写」に聞こえない（accentStrict 1.0 vs 0.5 vs 0 の3段掃引で平板↔自由の帯を耳決め）、(c) **対V2**＝「V2生成＋flowLyric 後乗せ」との比較で優劣、(d) 的＝**3案中1つは『このまま叩き台にできる』率 ≥ 50%**（完成品は求めない＝思想どおり）。
8. 重み較正: λ・w_skel・τ の3ノブだけ耳で回す（他は melody-decode 実証値に固定）＝較正の自由度を意図的に絞る。

## 7. スライス分割と難易度測定（定量）

| スライス | 内容 | 新規コード | テスト | 依存資産（全て実装済） |
|---|---|---|---|---|
| **B1** `planLyricRhythm` | 行→拍グリッド割付（弱起/強拍アンカー/特殊拍/句末/密度3種/apRel焼込） | ~300行 | ~250行 | accent.ts・prosody.ts(analyzeMoras/roleOf/accentContour)・planSkeleton・meter.ts |
| **B2** `lyricMelodyDP` | アクセントhard刈り＋柔コストViterbi＋Gumbel摂動＋骨格ガイド＋行間接続 | ~400行 | ~300行 | melody-decode.ts(写経元)・corpusStats・genSkeletonFromModel・scalePitchList・voiceProfile |
| **B3** 結線＝MCP verb `gen_melody_from_lyrics` | accent spawn→R→骨格→P→k本→syllable埋込＋fitReport 自己検査＋chat allowlist（CHAT_VERBS 追加＝BUG#1型再発防止） | ~200行 | ~150行 | mcp.ts流儀・genChords・normalizeFrame・genMelodyCandidates枠組 |
| B4 | リフレイン複写＋構造レバー直積＋複合ランキング | ~200行 | ~150行 | melodySimilarity・refitIdxToChord・corpusTypicality |
| B5 | 耳較正（VOICEVOX A/B・λ/w_skel/τ掃引）＋UI露出（任意） | 較正のみ | — | sing パイプ #13c |

- **使える最小版＝B1〜B3**: 新規 ~900行＋テスト ~700行・**2〜3セッション**（Fable設計監督＋実装は委譲可の複雑度。DPは melody-decode の既検証パターンの変奏）。
- フル（B4〜B5込み）: 新規 ~1300行・4〜5セッション＋オーナー耳手番。
- **耳較正依存度＝中**: リズム層は規則で決まる（較正不要）。音高層はノブを3本（λ/w_skel/τ）に絞る設計で泥沼を回避。ただし「歌に聞こえるか」の最終判定は理論スコアの天井（melody-eval-ceiling）の外＝耳必須。
- **総合難易度＝M+（Lの下限）**。S/M/L/XL の物差し: 骨格の机S6（11スライス）より小さく、feel層リファクタ（4ステージ）よりやや大きい。

### A路線（V2拡張）との本質比較

| 観点 | B（専用DP・本設計） | A（V2に歌詞制約注入） |
|---|---|---|
| 構造適合 | ◎ 歌詞→リズム→音高の因果順そのまま。モーラ1:1が骨組み | △ V2の表面実現（リズム語彙・セル駆動）は**音符数が歌詞から決まらない**＝1:1原則と根本衝突。onset数を縛るとリズム語彙が崩壊、縛らないと flowLyric 後乗せ＝A-01衝突の後追い修正 |
| アクセント整合 | ◎ hard刈り＝構造的に保証（A-01=0が証明可能） | △ 生成後の修正 or 生成中のリジェクトサンプリング＝保証なし・歩留まり依存 |
| 既存への侵襲 | ◎ V2無傷（generate.ts 1401行・melodyCells 1635行に触らない）＝bit一致文化で回帰ゼロ | ✗ V2中枢への侵襲＝回帰リスク大・bit一致テストの大量書換え |
| 規則の増築性 | ◎ R/A規則の追加＝コスト項の足し算（log-linearの利点） | △ 手続き的生成への規則注入は都度アドホック |
| 表現の豊かさ | △ v1は素直な譜割り（メリスマR-12・16分装飾・runs/push/humanize/ドラムベース結線ノブは無い）。**feel層（applyFeel）とhumanizeは出力Note[]に後段適用で共有可** | ◎ V2の表情資産をそのまま使える |
| 保守 | △ エンジン2本持ち。ただし二重化は「表面実現」層だけ＝骨格・コーパス事前・評価器・feelは共有 | ◎ 1本 |
| 副産物 | ◎ 生成器⇔警告器のクロスチェック成立／人間骨格×歌詞の直結ユースケース | — |

**Bの本質的優位＝「歌詞がリズムを決める」を第一原理に置けること**。Aは「メロにあとから歌詞を都合させる」の高機能版にしかならない（design #13 の譜割り一体論＝「同じ音符列に別歌詞は成立しない」がまさにこの構造を言っている）。**Bの本質的劣位＝表面の表情はV2に届かない**（当面は「正しく歌える素直な候補」まで）。

## 8. リスクの正直な記録

1. **重み較正の泥沼**: 対策済み設計（melody-decode 実証値から出発・ノブをλ/w_skel/τの3本に制限・λ=0退避路）でも、アクセントsoft項×骨格項×bigramの三つ巴は耳数回では収束しない可能性。→ 最悪でも accentStrict=1.0（純Orpheus）と 0（骨格だけ）の両端は必ず「使える」ので、中間帯の探索は漸進でよい。
2. **「正しいが平板」の残存**: 骨格ガイドでも、DPがアクセントと骨格の板挟みで中庸に潰れる帯がある（§5-1の重み傾斜が対策だが未実証）。**B路線最大の未知数はここ**＝B2完了時点でVOICEVOX即試聴して早期に測る（B5を待たない）。
3. **平板/尾高・助詞下がりの誤爆**: pyopenjtalk実測の弱点（kariuta §3/§4）。語内DOWNのみhard・語境界後DOWNはsoftで回避済みだが、断片的な歌詞（文脈薄）では同綴異義が逆に倒れる→ `accents` 上書き口（既設）で人間が最終確定＝設計維持。
4. **英字・造語**: `Yeah`→スペルアウト崩壊（実測済）。かな上書き必須＝入力契約に「読み(かな)推奨」を明記（design #13 のL1裁定＝読みが音数の正準、と同じ線）。
5. **メリスマ・字余りの表現幅**: v1は basic 割付のみ＝R-07細分/R-12メリスマはB4以降。サビ末の「あーぁ↗↘」が出せないのは候補の魅力を確実に削る＝早めに積む。
6. **エンジン2本の乖離**: V2側の改善（新ノブ・palette等）がBに自動では届かない。共有面（Frame契約・骨格・corpus・feel・評価器）を守り、表面実現だけの分岐に閉じ込める規律が要る（design.md に境界を明記してから実装＝SDD）。
7. **リズム前段固定の理論的妥協**: 最適な譜割りは音高と相互依存（頂点に長音を置きたい等）。階層化＝行ごとリズム複数案×DPで近似するが、厳密同時最適ではない。実害が出たら §2 の微小オフセット直積拡張（状態×3）で追う。

## 9. 実装時の正準手順（SDD）

着手時は本docを設計正準とし、(1) design.md に「#13d 歌詞先行メロ生成B（専用DP）」節を先に書く（§1契約・§3コスト・§7スライス）→ (2) B1/B2はテスト先行（アクセントhard刈り・モーラ1:1・λ=0退避路・決定性がテストの芯）→ (3) B3でCHAT_VERBS追加を忘れない（BUG#1型）→ (4) B2完了時点でVOICEVOX試聴（リスク2の早期検証）。research README への索引追加は着手セッションで（本タスクはREADME編集禁止のため未追加）。
