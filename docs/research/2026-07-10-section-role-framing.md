# セクション役割（intro/verse/pre-chorus/chorus/bridge）と隣接文脈をメロ生成に入力する理論裏取り（2026-07-10）

調査のみ・実装なし。対象＝`Frame`（apps/api/src/music/generate.ts:49-58）にセクション概念を足すための理論根拠と設計案。
他者コーパス（POP909/Billboard 等）からは**統計のみ**参照（リテラル非保存）。

---

## ① 要約

- **セクション役割別のメロ特性は実証研究で裏が取れる**。サビ＝音高が高い・ラウド・ダイナミックレンジが狭い・音色多様（Billboard 649曲/7762セクションの回帰、van Balen 2013）。セクション末＝V→I 58%・長い音符が集中（whole音符以上の72%がセクション末句末 vs 中間句末6.4%）・主音着地、半終止はセクション中間のみ（POP909、Dai/Dannenberg 2020）。pre-chorus＝srdc の departure 拡張＝「溜めて上げる」機能（Summach 2011）。
- **本エンジンの既存ノブでほぼ表現できる**。density/repetition/motifBars/breathe/expression/foreground/phrasing/form/cadence/pickup が役割別プリセットにそのまま写像可能。**足りないのは1つだけ＝音域（tessitura）シフト**：V2 の register 窓は `tpBase=clamp(60+tonicPc,60,65)` 固定でノブが無い。「サビで上げる」には `registerShift`（半音数）の新設が必要（sp 差し替えで下流が追従する設計は Round2/3 で確立済＝安い）。
- **モチーフ共有も既存APIで成立**。POP909 ではセクションの 20% が前セクションの完全反復・29% が suffix 反復・18% が prefix 反復＝素材共有が標準。V2 には `seedMotif`/`keepFirstBlocks`（genMotifMelodyV2 opts）と `extractMotif16`（部分メロ→Motif16 逆抽出）が既にあり、「前セクションのモチーフを種にする」は**新機構なしで配線問題**。
- **接続（セクション末→次頭）も既存で大半カバー**。genChords の `cadence`（half=開く/deceptive=続く感/full=締める）＋メロの B1 和声追従（最終コードに主音が無ければ 2̂/5̂ で開く）＋次セクション側の `pickup`（弱起）で、理論の推奨（中間は半終止で開き・最後は完全終止）と一致する。
- **設計案＝Frame に `section?: SectionContext`（role＋prev/next 文脈＋seedMotif）を optional で足す3点構成で足りる**。役割→ノブのプリセットは「既定値の差し替え」であり、**ユーザー明示ノブ＞role プリセット＞従来既定**の優先順位で後方互換（role 未指定＝bit一致）を守る。

---

## ② 理論（出典付き）

### 2-1. セクション別のメロ特性（実証）

**サビ（chorus）は音高が高く・強く・密度が高い**
- van Balen, Burgoyne, Wiering, Veltkamp「An Analysis of Chorus Features in Popular Song」(ISMIR 2013)。Billboard データセット（Hot 100 から無作為抽出 649曲・7762セクション、verse=総時間34%/chorus=24%）で、セクションの「chorusness」（SALAMI の2名アノテータ混同行列由来の連続値）に効く知覚特徴を PGM＋回帰で分析。
  - 結果（回帰係数・全て p<10⁻¹⁵）：**pitch centroid +0.10（サビは音高が高い）**・sharpness +0.11・roughness +0.12・MFCC variance +0.12（音色多様）・**loudness IQR −0.33（ダイナミックレンジが狭い＝一様に強い）**。
  - 副次所見：**セクション位置（曲内 0..1）が sharpness/pitch centroid と正相関**＝「曲が進むほど周波数方向に強度が上がる」over-time intensification が Billboard コーパスに存在。
  - URL: https://archives.ismir.net/ismir2013/paper/000180.pdf
- 補強：フック（catchiness）研究。van Balen, Burgoyne, Bountouridis, Müllensiefen, Veltkamp「Corpus Analysis Tools for Computational Hook Discovery」(ISMIR 2015)。Hooked! ゲームの認知データを corpus-relative 記述子で説明＝フック=曲内で相対的に目立つ（音高・反復）区間。URL: https://zenodo.org/records/1415038 ／ツール: https://github.com/jvbalen/catchy

**セクション境界の和声・音価・度数（POP909 実測）**
- Dai, Zhang, Dannenberg「Automatic Analysis and Influence of Hierarchical Structure on Melody, Rhythm and Harmony in Popular Music」(CSMC+MuMe 2020)。POP909 の句（4 or 8小節が大半）→セクション（1曲2-3個が大半）の2階層を自動抽出（人手一致92%）し、位置別に統計。
  - **和声**：長調でセクション末の進行の 58% が V→I（完全終止）。V→I 遷移確率＝句末 0.89／セクション中間の句末 0.84／**セクション末 0.94** vs 他位置平均 0.47。**半終止（V止め）はセクション中間の句末に多く、セクション末にはほぼ出ない**＝「半終止は続きを要求する」の実測。
  - **メロ度数**（I コード上）：**1̂ はセクション末に集中（確率~0.75）**、句頭・句中では 3̂ が優勢（~0.4）＝「頭は 3̂・締めは 1̂」。
  - **音価**：句頭・句中の音価分布は全体と同じ（短い音中心）だが**句末は長い音**。全音符以上の出現は「セクション中間の句末」6.4% vs 「セクション末の句末」**72%**＝セクション末で強いリズム減速（sectional final lengthening）。
  - **セクション間反復**：セクションの 20% が直前セクションの完全反復・29% が suffix 反復（AAB→AB）・18% が prefix 反復（ABB→AB）。
  - URL: https://arxiv.org/abs/2010.07518 （PDF: https://www.cs.cmu.edu/afs/cs/Web/People/rbd/papers/dai-mume2020.pdf ）

**pre-chorus の機能＝溜め・上昇**
- Summach「The Structure, Function, and Genesis of the Prechorus」(Music Theory Online 17.3, 2011)。pre-chorus は Everett の srdc（statement–restatement–departure–conclusion）の **departure（離脱）が拡張されて独立した部位**で、機能は momentum の蓄積＝サビへの助走。和声的にはドミナント準備の引き延ばし・旋律的には反復の細分化と上行。URL: https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html
- 教科書的整理（verse/chorus/bridge の定義と対比機能）：Open Music Theory「Verse-Chorus Form」。chorus=歌詞・旋律とも最も記憶される部位で音楽的強度最大、verse=物語進行で低強度、bridge=調域・和声の対比と再突入（retransition）。URL: https://viva.pressbooks.pub/openmusictheory/chapter/verse-chorus-form/

### 2-2. セクション間のモチーフ関連

- 上記 Dai 2020 の 20/29/18% 統計＝**pop はセクションを丸ごと・部分的に使い回すのが標準**。「verse と chorus が同一モチーフの変形」はこの suffix/prefix 反復の下位ケース。
- 生成系の先行実装：
  - **MusicFrameworks**（Dai, Jin, Gomes, Dannenberg「Controllable Deep Melody Generation via Hierarchical Music Structure Representation」ISMIR 2021）。曲を section→phrase の階層に分解し、各セクションは「basic melody（骨格）＋リズム枠」という **music framework** を持ち、**framework をセクション間で転写・変形**してから表面を生成＝長期反復構造を担保。本エンジンの骨格（skeleton）＋モチーフ（Motif16）の2層と同型の発想。URL: https://arxiv.org/abs/2109.00663
  - **MELONS**（Zou et al. 2021）。小節間の8種の関係（反復・移調反復・リズム保持ピッチ変更等）を**構造グラフ**として先に生成し、それに条件付けてメロを生成。「リズム保持・ピッチ変更」が関係タイプとして一級＝verse→chorus 変形の代表形。URL: https://arxiv.org/abs/2110.05020
- **本エンジンとの適合**：`genMotifMelodyV2` は既に `seedMotif?: Motif16`（外部モチーフを種にする）と `keepFirstBlocks`（先頭ブロックを逐語保持）を持ち、`extractMotif16`（melodyCells.ts:498）で実音ノート列→Motif16（リズム枠＋move列）へ逆抽出できる。**「前セクションのメロから extractMotif16 → 次セクションの seedMotif に渡す」だけでモチーフ共有が成立**する。seedMotif はリズム/輪郭を保持しつつ骨格（コード・register）に沿って再レンダリングされるので、「リズム保持・音域移動・ピッチ再解釈」という定石の変形が構造的に出る。corpusBias.ts の motifModel（コーパス統計）とは独立の機構なので干渉しない。

### 2-3. 隣接セクションの接続

- **和声側**：Dai 2020 の実測（半終止=セクション中間・V→I=セクション末）は、genChords の `cadence:"half"` を「次に続くセクションの末尾」に、`"full"` を「ブロックの締め」に割り当てる運用と一致。`"deceptive"`（V→vi）は「1番サビ→2番へ続く感」（design.md のユースケース記載どおり）。
- **メロ側**：本エンジンは既に「最終コードに主音が含まれる時のみ主音着地・含まれなければ最寄りコード音（V なら 2̂/5̂＝開き）」（design.md 短調ドミナント節・B1和声追従）なので、**cadence を half にすればメロは自動で開く**＝接続のためのメロ側新機構は不要。
- **次セクション頭への導き**：弱起（anacrusis/pickup）が正攻法。`frame.pickup`（既存）は「拍0の前に upbeat を置き最初の強拍へ歩進で滑り込む」＝次セクション側に付ければ「サビ頭への食い」になる。前セクション最終音と次セクション開始音の音程接続は、`genSkeletonFromModel` の `opts.start`（開始骨格音の指定・melodyCells.ts:240）が既にあるため、**prevEndPitch を start の近傍候補に使う配線**で表現できる。
- **ドラムフィル**はセクション接続の常套だが本調査の範囲外（メロ層ではない）。`2026-07-10-melody-groove-drum-interaction.md` の系譜で別途。

### 2-4. エネルギー曲線（tension/energy arc）

- **Farbood「A Parametric, Temporal Model of Musical Tension」(Music Perception 29(4), 2012)**。緊張感は多パラメータの時間的統合で予測できる：**寄与因子＝ pitch height（音高）・onset frequency（音数密度）・loudness・harmony・tempo・メロディ期待**。連続応答実験で高相関。→「セクション役割ごとに register/density/loudness を単調に動かす」ことが tension arc の操作として実証的に妥当。URL: http://mp.ucpress.edu/content/29/4/387 （近年の追試実装 TenseMusic: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0296385 ）
- van Balen 2013 の「セクション位置と sharpness/pitch centroid の正相関」＝曲レベルの強度上昇はコーパスにも観測される。
- **定式化**：intro→verse→pre-chorus→chorus のビルドは「energy(役割) の単調非減少列＋chorus で極大・bridge で対比（低下 or 別方向）・outro で減衰」というスカラー1本で近似できる。Farbood の因子のうち本エンジンで操作可能なのは pitch height（register）・onset frequency（density）・syncopation（push）・（humanize の velocity は将来 loudness 相当）。

---

## ③ 妥当性評価

**効く条件**
- 実測が最も強いのは（a）**サビ=高音域**（van Balen: pitch centroid 正係数）と（b）**セクション末の締め方**（Dai: V→I 0.94・1̂ 着地・長音価72%）。この2つは効果が大きくかつ既存機構（cadence・B1追従・句末着地）と整合するので、最初に入れる価値が高い。
- pre-chorus の「上昇感」は register の漸増＋motifBars 短縮（畳みかけ）＋breathe 0（隙間を詰める）の合成で出る見込みだが、こちらは理論記述（Summach）ベースで実測係数が無い＝**耳較正が必須**。

**副作用・リスク**
1. **プリセットが強すぎると全曲同構造化**。役割→ノブ写像を固定値にすると「どの曲もサビで+5半音・density0.7」になり、設計思想（選択肢を出す・ばらつき）と衝突する。→ プリセットは**既定値の差し替えに留め、幅（±）を持たせて seed でばらす**。かつ優先順位を「ユーザー明示ノブ＞role プリセット＞従来既定」に固定。
2. **音域シフトの歌唱可能域超え**。tpBase+5半音は Round3 で潰した「B5金切り域」を再導入しうる。→ registerShift 適用後も `tpBase' = clamp(tpBase+shift, 60, 70)` 程度の飽和が要る（Round3 Option D と同じ手筋）。
3. **seedMotif の経路差**。現状 seedMotif は completeMelody（補完）経路での利用が主で、V2 通常経路で「種だけ渡して keepFirstBlocks=0（逐語保持なし・発展のみ）」の意味論はテストで固定されていない。配線前に意味論の仕様化＋テストが必要。
4. **energy 自動アーク適用は哲学と衝突**。曲全体の energy 曲線をエンジンが勝手に敷くと「仕上げは人間」から外れる。→ energy はセクション単位の提案値（role 既定）に留め、曲全体アークの自動最適化はやらない。
5. **POP909 は中華ポップ**（Dai 2020 も「西洋ポップでも同様と推測されるが比較は将来課題」と明記）。数値（58%・72%等）は目安であり、日本ポップ向けの再較正は自作コーパス（P2 トラック）で。

**やらなくていいこと（過剰設計の回避）**
- セクション役割ごとの**新しい生成アルゴリズム**は不要。MusicFrameworks/MELONS の知見も「構造は条件付け（conditioning）で渡す」であり、本エンジンの「骨格＋モチーフ＋ノブ」で同じ因子分解が既にできている。
- 隣接文脈のためにメロ生成器へ「前セクション全ノート」を渡す必要はない。**モチーフ（Motif16）と最終音（1音）と終止型（enum）だけで十分**＝接続情報は低次元で足りる。

---

## ④ 実装含意

### 4-1. Frame 拡張の具体型（案）

```ts
// generate.ts に追加（全フィールド optional・未指定＝従来動作）
export type SectionRole =
  | "intro" | "verse" | "prechorus" | "chorus" | "bridge" | "interlude" | "outro";

export interface SectionContext {
  role?: SectionRole;           // このセクションの役割（ノブ既定値の差し替え元）
  prevRole?: SectionRole;       // 直前セクションの役割（接続の判断材料）
  nextRole?: SectionRole;       // 直後セクションの役割（末尾の開き/締めの判断材料）
  seedMotif?: { pitch: number; start: number; dur?: number }[];
                                // 前セクションの代表モチーフ（実音）。extractMotif16 で Motif16 化して V2 opts.seedMotif へ
  prevEndPitch?: number;        // 前セクション最終音（骨格開始音の近傍候補＝genSkeletonFromModel opts.start へ）
  energy?: number;              // 0..1。未指定＝role からの既定。プリセット強度のスケーラ
}

export interface Frame {
  // 既存 key/mode/meter/tempo/bars/mood/pickup/expression はそのまま
  section?: SectionContext;     // ★追加。undefined＝従来動作（bit一致）
}
```

- `normalizeFrame` は section.role が enum 外なら**黙って落とす**（既存の頑健化方針＝不正 meter→4/4 と同じ）。
- 最小案として「`Frame.role?: SectionRole` 1フィールドだけ」も可だが、prev/next と seedMotif は接続・モチーフ共有に必須なので、まとめて `section` に畳む方が Frame 直下の肥大を防ぐ。
- **role→mood ではない**：mood は雰囲気（密度バイアス・長短推定）、role は構造上の位置。直交として扱う。

### 4-2. 役割→既存ノブのプリセット対応表（初期値案・全て耳較正前提）

出典対応：↑register/密度＝van Balen 2013、末尾の cadence/着地＝Dai 2020、prechorus の畳みかけ＝Summach 2011、対比＝Open Music Theory。

| ノブ（V2 opts / genChords opts） | intro | verse | prechorus | chorus | bridge | outro | 根拠 |
|---|---|---|---|---|---|---|---|
| `density`（音数密度） | 0.3 | 0.45 | 0.55 | 0.65 | 0.5 | 0.3 | Farbood: onset frequency↑=tension↑／van Balen |
| **`registerShift`（★新設・半音）** | −2 | 0 | +1〜2 | **+3〜5** | ±（対比） | −2 | van Balen: pitch centroid 正係数 |
| `repetition`（動機反復） | — | 0.85（既定） | 0.9 | **0.9（フック反復）** | 0.6（対比） | — | hook 研究＝反復が catchiness の芯 |
| `motifBars`（モチーフ長） | 2 | 2 | **1（畳みかけ＝上昇感）** | 1–2 | 2–4 | — | Summach: departure の細分化 |
| `breathe`（句頭遅延） | 0.5 | 0.3 | **0（詰める）** | 0.1 | 0.3 | 0.5 | 溜め＝隙間を詰める |
| `expression`（強拍倚音） | 0.15 | 0.25（既定） | 0.25 | **0.15（シラビック=素直）** | 0.4（歌い回し） | — | サビ=キャッチー＝拍頭明瞭 |
| `foreground`（自由材料） | — | 0.3 | 0.15 | **0.1（反復重視）** | **0.5（新素材＝対比）** | — | bridge=対比の定義 |
| `phrasing` | — | symmetric | asymmetric 可 | **symmetric（問い/答え明確）** | asymmetric | — | 句構造の可聴性 |
| `form` | — | — | "sentence"（断片化=加速） | — | — | — | sentence=起承転結の加速 |
| `runs` / `push` | — | 低 | 中 | 中 | — | — | ジャンル依存が強い＝role では触らない選択も可 |
| `cadence`（genChords） | — | **half（開く）** | **half / D止め** | full（ラスト）/ **deceptive（1番）** | half | full | Dai: 半終止=中間・V→I=末尾 |
| `pickup`（次セクション側） | — | — | — | **1（サビ頭へ弱起）** | — | — | anacrusis=接続の常套 |

- **★新設が必要なのは `registerShift` のみ**。現状 V2 の tessitura は `tpBase = clamp(60 + tonicPc, 60, 65)`（generate.ts:462）固定でノブが無い。`tpBase' = clamp(tpBase + shift, 58, 70)` のような飽和付きシフトにする（Round2 で「下流 clamp は全て sp[0]/sp[last] 参照＝sp 差し替えで追従」が確認済なので、変更点は sp 構築の1行＋ opts 透過）。
- プリセットは**「未指定ノブの既定値」を差し替えるだけ**。呼び出しで density 明示があればそちらが勝つ（優先順位：明示ノブ＞role プリセット＞従来既定）。`energy` はプリセット値を線形スケールする係数（energy=0.5 が表の値・1.0 で強め）。

### 4-3. モチーフ共有・接続の配線（新機構なし）

1. **モチーフ種**：`section.seedMotif`（実音ノート列）→ `extractMotif16()` → `genMotifMelodyV2` opts `seedMotif`。`keepFirstBlocks` は渡さない（0）＝逐語保持ではなく「同じ動機の別レンダリング」＝verse↔chorus のリズム保持・音域移動・ピッチ再解釈（MELONS の関係タイプ相当）。**要事前テスト**：V2 通常経路で seedMotif のみ指定時の挙動を仕様化（現状は補完経路が主用途）。
2. **開始音の接続**：`section.prevEndPitch` → `genSkeletonFromModel` opts `start`（既存・melodyCells.ts:240）の候補近傍として使う。順次 or 3度以内で入るのが無難（跳躍入場は role=chorus のときのみ許容等）。
3. **末尾の開き**：`section.nextRole` があり自分が verse/prechorus なら genChords 側へ `cadence:"half"` を推奨既定にする（コードとメロ両方に一貫して効く＝B1 和声追従で自動）。

### 4-4. role の SSOT（データモデル）

- `Neta`（types.ts:4-24）に role カラムは**足さない**（design 原則「スキーマ変更は高い」・frame.style の前例に従う）。
- 案A（推奨）：**tags の名前空間タグ `role:chorus`**（`prj:` 名前空間の前例あり・検索ファセットにも乗る）。
- フォールバック：section の title からの推定（「Aメロ→verse／Bメロ→prechorus／サビ→chorus／イントロ→intro／間奏→interlude／Cメロ・大サビ→bridge」）。UI 入力の手間ゼロで日本語慣習に乗れるが、推定は表示して確認可能にする。
- prev/next は **song コンテナの children（position 順・CompositionNode）から導出**できる＝保存不要。SectionEditor の `genPart()`（SectionEditor.tsx:346-367）が frame を組む所で、親 song を辿って prevRole/nextRole/seedMotif（前セクションのメロレーン先頭ネタ）を詰める。

### 4-5. design.md の更新箇所（実装時・変更は上位から）

1. **#16「生成リクエストモデル（枠＋動作＋構造）(#85)」**（design.md:169 付近）：frame 定義 `{key?, meter?, tempo?, bars?, mood?, style?}` に `section?`（role/prevRole/nextRole/seedMotif/prevEndPitch/energy）を追記。
2. **#12-M の決定ブロック列**（design.md:1149 以降の「→ …（日付）」スタイル）：「→ セクション役割の一級化＋registerShift ノブ（2026-07-1x）」を新規追記。既定＝未指定＝従来 bit 一致・プリセット優先順位・registerShift の飽和則を正準として書く。
3. **mcp.ts の `frameSchema`**（mcp.ts:65-74）：`section` オブジェクトを optional 追加（gen_melody/gen_chords/complete_melody/assemble が自動で受ける）。gen_chords は `cadence` 既定の role 連動も description に明記。
4. **#14 データスキーマ**：Neta 変更なし・tags `role:` 名前空間の追記のみ（`prj:` の節に並記）。
5. **#19 SectionEditor**：genPart の frame 組み立てに section 文脈を足す旨（song 親からの prev/next 導出）。

### 4-6. 後方互換

- `frame.section` 未指定＝全経路で従来動作（bit 一致）。role プリセットは「undefined のノブにだけ」効く。
- `registerShift` 未指定＝shift 0＝現行 tpBase＝bit 一致。
- 既存テスト（api 666+ 緑）はそのまま通る設計。追加テストは (a) normalizeFrame の section 頑健化 (b) role プリセットが明示ノブに負ける (c) registerShift の飽和 (d) seedMotif-only の V2 経路仕様化、の4本が先行（TDD）。

---

## ⑤ 残論点

1. **registerShift の飽和値と shift 量の耳較正**（+3〜5 半音は仮値。Round3 の B5 金切り域の轍を踏まないこと。歌唱前提なら実効音域と合わせて decided by ear）。
2. **seedMotif の V2 通常経路の意味論**：keepFirstBlocks=0 で「発展のみ」になるか、リズム語彙の再抽選と衝突しないか＝実装前にテストで固定。
3. **プリセット値そのもの**は全て仮置き（理論の方向のみ実証・大きさは未実証）。40seed×role 別の分布実測（既存の批判レビュー・ループの手筋）＋耳セッションで較正。
4. **role の入力 UX**：tags `role:` を SectionEditor でどう出すか（title 推定の自動表示＋ワンタップ確定が有力）。曲テンプレ（intro-verse-prechorus-chorus…の雛形生成）は別スコープ。
5. **energy の扱い**：セクション単位の係数に留めるか、song_state / plan_next（次の一手ナビ）で「曲全体のアーク可視化」として出すか。自動適用は設計思想（仕上げは人間）と衝突するため提案止まりが本線。
6. **フックの明示機構**（サビ頭2小節のリズム逐語反復を1番/2番で固定する等）は今回の3点構成の外。seedMotif＋repetition 高で近似できるかを先に実測してから判断。
7. **日本ポップでの数値再較正**：POP909/Billboard の統計は方向の根拠。自作コーパス（P2 トラック・句辞書 ~1523）にセクションラベルを足せば同じ統計（役割別 register/密度/終止）を自前で取れる＝将来の較正パス。

### ⑤-実装確定（2026-07-10・SDD+TDD で実装済）

調査 ①〜④ を実装に落とした確定事項（正準は design #12-M「セクション役割の一級化」・コードは `generate.ts`/`melodyCells.ts`/`mcp.ts`/`http.ts`/`SectionEditor.tsx`）。

- **Frame 拡張**：`section?: SectionContext {role?, prevRole?, nextRole?, seedMotif?, prevEndPitch?, energy?}`。`SectionRole = intro|verse|prechorus|chorus|bridge|interlude|outro`。`normalizeFrame`→`normalizeSection` が別表記（`pre_chorus`/`pre-chorus`/大文字）を `prechorus` 等へ吸収し enum 外は黙って落とす。全フィールド空の section は undefined 化（＝bit一致）。
- **プリセット表の最終初期値**（`SECTION_PRESETS`・energy=0.5 基準・全て耳較正前提）：

  | ノブ | intro | verse | prechorus | chorus | bridge | interlude | outro |
  |---|---|---|---|---|---|---|---|
  | density | 0.3 | 0.45 | 0.55 | **0.65** | 0.5 | 0.4 | 0.3 |
  | registerShift | −2 | 0 | +2 | **+4** | 0 | 0 | −2 |
  | repetition | — | 0.85 | 0.9 | 0.9 | 0.6 | — | — |
  | motifBars | 2 | 2 | 1 | 2 | 2 | — | — |
  | breathe | 0.5 | 0.3 | 0 | 0.1 | 0.3 | 0.3 | 0.5 |
  | expression | 0.15 | 0.25 | 0.25 | 0.15 | 0.4 | — | — |
  | foreground | — | 0.3 | 0.15 | 0.1 | 0.5 | — | — |
  | phrasing | — | symmetric | asymmetric | symmetric | asymmetric | — | — |

  §4-2 の範囲（chorus registerShift「+3〜5」等）から中央〜やや保守で単一値を採用。chorus motifBars は 1–2 のうち 2（フック反復の可聴性優先）。`applySectionPreset` は **opts で undefined のノブにだけ**被せる＝**明示ノブ＞role プリセット＞従来既定**。role が無い section（seedMotif/prevEndPitch のみ）は preset 非適用。
- **registerShift の飽和仕様（★確定）**：`tpBase0 = clamp(60+tonicPc, 60, 65)`（従来）→ `tpBase = clamp(tpBase0 + registerShift, 58, 70)`。sp 窓上端 = `tpBase+12 ≤ 82`＝**Round3 の B5(83) 金切り域を再導入しない**。registerShift=0＝tpBase 不変＝bit一致。`registerShift` は `genMelody` opts の一級ノブでもあり、明示指定が preset に勝つ（飽和テストの直接レバー＝巨大シフトで最高音 ≤ 82 を確認）。`energy` 明示時のみ density/registerShift を線形スケール（`0.5+(v-0.5)*energy/0.5`／`round(v*energy/0.5)`）。**曲全体アークの自動適用はしない**（⑤-4 の結論どおり提案止まり）。
- **seedMotif 配線の経路（★確定）**：`f.section.seedMotif`（実音）→ `extractMotif16(notes, compound?3:4)` → `genMotifMelodyV2` opts `seedMotif`。**`keepFirstBlocks` は渡さない（=0）**＝先頭ブロック(role 0=A) が種 M そのもの＝「同じ動機の別レンダリング」。role とは独立に seedMotif 有無で発火（role 無しでもモチーフ共有可）。接続は `section.prevEndPitch` → 新 opts `skelStart` → `genSkeletonFromModel` opts `start`（未指定=62=bit一致）。**テストで先頭ブロックの onset 集合が `extractMotif16(seed).ons` と一致することを固定**（②の懸念「seedMotif-only の V2 経路の意味論」を仕様化）。
- **配線点**：`genMelody` V2 分岐（`applySectionPreset` + registerShift 飽和 + extractMotif16）／MCP `frameSchema.section`（role を書くだけで効く旨を description に明示）／http `gen_melody`・`/gen/section` は frame 透過（section は frame に載る・explicit `registerShift` も透過）／web `SectionEditor.genPart()` は Section ネタ tags `role:` を読み `frame.section.role` へ。
- **テスト**：`apps/api/test/section-context.test.ts` に (a)未指定=bit一致 (b)明示ノブ＞プリセット (c)chorus register↑＋飽和 (d)seedMotif 配線 (e)verse/chorus の density 既定差 (f)決定性 ＋ role 頑健化（不正 role/別表記）。**api 736・web 317 全緑・tsc クリーン**。
- **残（耳較正パス）**：プリセット値と registerShift 量の 40seed×role 分布実測＋耳セッション（③③）。ロール入力 UX（tags `role:` の SectionEditor 表示・title 推定）と prev/next 自動導出（song children）と曲テンプレは**後続タスク（スコープ外）**。

### 参考（一次出典まとめ）
- van Balen et al. 2013 (ISMIR): https://archives.ismir.net/ismir2013/paper/000180.pdf
- Dai, Zhang, Dannenberg 2020 (CSMC+MuMe): https://arxiv.org/abs/2010.07518
- Summach 2011 (MTO 17.3): https://mtosmt.org/issues/mto.11.17.3/mto.11.17.3.summach.html
- Open Music Theory「Verse-Chorus Form」: https://viva.pressbooks.pub/openmusictheory/chapter/verse-chorus-form/
- van Balen et al. 2015 (ISMIR, Hook Discovery): https://zenodo.org/records/1415038
- Dai et al. 2021 (ISMIR, MusicFrameworks): https://arxiv.org/abs/2109.00663
- Zou et al. 2021 (MELONS): https://arxiv.org/abs/2110.05020
- Farbood 2012 (Music Perception): http://mp.ucpress.edu/content/29/4/387
- TenseMusic (PLOS One 2024): https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0296385
