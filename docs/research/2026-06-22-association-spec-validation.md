# 検証レポート：連想ユースケース「8機構の地図」を末端まで叩く＋具体仕様に落とす

調査日: 2026-06-22 / 対象: creative_manager（個人用作曲支援ツール）
種別: **懐疑的検証＋具体仕様の起草**（read-only・プロダクトのコードは不変）。
検証対象: `docs/research/2026-06-22-association-usecases.md`（8機構の地図 M1〜M8）。
原則: 楽観で「できる」と言わない。末端の**関数呼び出し列・検索クエリ・データ**まで辿り、繋がらない所を名指しする。落ちてない所は **未確定** と印を付ける。
前提（1行）: ドメイン（度数/距離/変形/当てはまり）は TypeScript、Python は信号処理（embeddings=cm-search・音声・pyopenjtalk）限定。

---

## 0. 地図の前提を実コードで叩いた結果（先出し・地図の3つの事実誤認を訂正）

| # | 地図の記述 | 実コードの事実 | 影響 |
|---|---|---|---|
| **訂正1** | 「ドメインは **apps/api core (TS)**」 | **音楽ドメイン TS は `apps/web/src/music.ts` に在る**（apps/api/src は core.ts/db.ts/mcp.ts＝CRUD/検索ハブ/MCPで、音楽算術は無い）。`music.ts` に `QUALITY_INTERVALS`/`transpose`/`chordToMidi`(tonal)/`chordsOf`/相対ベース解決 `resolveRelativeBass`/`band`/`degreeInterval` がある。**だが `analyze_fit`/`detect_key`/`melody_similarity`/度数化/機能解析は TS に**無い****（全部 Python 側）。 | 「TS移植」は**まだ1個も済んでいない**。music.ts は再生/MIDI/相対ベースまで。連想機構の土台はゼロから書く。所属を「TS=apps/web/src/music.ts（新規ファイル分割もあり得る）」に固定すべき。 |
| **訂正2** | 「cm-search の anisotropy で**絶対閾値で足切り不能・M1の生命線が折れている**」 | **既に解かれている**。`search.py:140` で `rel=score−floor`（floor=候補集合min）を返し（spread較正）、TS `/search` が `rel≥CM_SEM_MIN_REL`(env既定0.07) でゲート＋キーワード(LIKE) ∪ 意味 を RRF 融合し `matchType: exact|semantic|both`、両系統0件で「該当なし」を返す（design.md #65 Stage1 実装済）。 | M1意味retrievalの一次足切りは**動く**。地図の批判#1「生命線が折れている」は**過去の話**。残る本当の問題は別（↓訂正3）。 |
| **訂正3** | 「Claude NL→閉じたタグ語彙→決定的足切りで M1 が成立」 | **タグ語彙が無い／embedに乗っていない**。`search.py:_text_of` が embed する文書テキストは `kind + title + text + mood + content(音名/コード記号)`。**`tag`/`neta_tag` テーブルの値は embed テキストに入っていない**（`_text_of` に tags が無い）。`mood` は単一TEXT自由記述・`facets()` は distinct を返すだけで**閉じた語彙は未定義**。 | **M1の「様式/ムードで引く」は現状ほぼ動かない**：embedされるのは音名列とユーザーが書いた自由mood/textだけ。「シティポップっぽい進行」を引くには (a)進行DBに genre/artist/mood タグを**付与しembedテキストに含める** か (b)閉じたタグ語彙＋curated付与 が要る。**地図が「成立する」と言った前提（閉じたタグ語彙）は存在しない＝要設計**。 |

> 結論（0節）：**地図の機構の畳み方は概ね妥当**だが、(a)TS移植は1個も終わってない＝全部新規実装、(b)anisotropyは解決済みで批判#1は古い、(c)逆に**M1意味/様式の本当のボトルネックは「タグ語彙＋embed対象」の不在**で、ここが地図で hand-wavy。

---

## 1. ユースケース別 末端トレース（worked-example・呼べる粒度）

記法: `関数名(引数型) -> 戻り型`。**[既存]**=実装済（流用元明記）/**[移植]**=Python→TS移植/**[新規]**=未実装。検索は `query形 / 対象index / ランキング式 / 粒度`。

### UC-C1 「この進行に似てる」（M2 構造類似）

入力: `chords=[{root,quality,start,dur}]`（C基準）＋進行DB。
1. `toDegrees(chords, key) -> Degree[]` **[新規TS]**：各コードを (度数root_pc=root−key mod 12, quality) の C基準度数へ。content は既に C基準保存（design#16）なので key=0 なら恒等。
2. `progressionDistance(a: Degree[], b: Degree[]) -> number` **[新規TS, similar.py の DP を度数列へ移植]**：`_edit_distance` と同型。置換コスト=`degCost((r1,q1),(r2,q2))`（root距離 min(|Δpc|,12−|Δpc|) ＋ quality不一致ペナルティ）、挿入/削除=1。
3. `findSimilarProgressions(target: Degree[], db: ProgEntry[], top=5) -> {id,label,sim}[]` **[新規TS, find_similar 同型]**：`sim = 1 − dist/(maxCost·max(len))`。降順 top。
- 出力: 近い順 top5。
- **検索**: query=度数列 / index=進行DBの度数列 / ランキング=編集距離→sim / 粒度=進行まるごと。**純TS整数演算・embedding不要**。
- **充足: 満たす（要・進行DB）**。melody_similarity の DP がそのまま移る（事実：similar.py L13-25 は純整数DP）。

### UC-C7 「メロ固定でおしゃれコードに（リハーモ）」（M4 制約付き変形＝核心 worked-example）

入力: `melody=[{pitch,start,dur}]`, `origChords`, `key`。
1. `analyzeFit(melody, origChords, key) -> {in_chord_rate, non_chord_tones, score, issues}` **[移植: analyze.py:analyze_fit]**（基準スコア取得）。
2. 小節（=コード区間）ごとにメロ音集合を集める `melodyPCsPerSegment(melody, origChords) -> Map<segIdx, Set<pc>>` **[新規TS]**。
3. `legalChordsForSegment(melPCs: Set<pc>, key, mode) -> ChordCand[]` **[新規TS]**：各セグメントで「メロ音を**コードトーンまたは許容テンション**として含むコード」を列挙。実装＝`for root in 0..11: for q in QUALITY_INTERVALS: if melPCs ⊆ (chord_pcs(root,q) ∪ tensions(root,q)): push`。tensions = 9th/11th/13th を許容集合に足す表 **[新規データ：テンション許容表]**。
4. `reharmCandidates(origDegrees, legalPerSeg, style) -> ChordSeq[]` **[新規TS]**：おしゃれ系の変形規則（トライトーンサブ=V7→♭II7、ii-V挿入、借用 ♭VI/♭VII/iv、II7→IIm7 質替え）を origDegrees に適用し、legalPerSeg と交差した候補列を生成。**規則表 = SUBSTITUTIONS（新規データ）**。
5. 各候補列を `analyzeFit(melody, realize(cand), key)` で再検証し `score ≥ origScore − ε` のみ残す（**当てはまり保証**）。
6. （任意）`rankByStyle(cands, "おしゃれ")` **[未確定]**：「おしゃれ度」のランキング式が**未確定**（テンション数・非ダイアトニック数の重み付き和で近似可だが評価基準が無い）。
7. Claude が数案から1つ選び「なぜおしゃれか」を説明（机上の analyze_progression 出力を読む）。
- **充足: 部分**。1〜5（合法リハーモ列挙＋当てはまり保証）は**確実に末端まで繋がる**。6「おしゃれ度ランキング」は**未確定**（主観・評価基準なし）。SUBSTITUTIONS表とtensions表が**新規データ要**。

### UC-C5 「3つ目のコードの代替」（M4 等価クラス）

1. `toDegrees(chords,key)` → 3つ目の度数 d3。
2. `substitutesOf(degree d3, key, mode) -> {degree, kind}[]` **[新規TS, SUBSTITUTIONS表引き]**：機能代理（I↔vi↔iii, IV↔ii, V↔vii）/相対/セカンダリドミナント(V/x)/裏コード(♭II7)/借用/質替え を決定的列挙。
3. 前後コードの機能整合で並べ替え（任意）→ Claude が文脈で1つ選択。
- **充足: 満たす**。データ不要・SUBSTITUTIONS表のみ（純TS）。

### UC-C2 「この進行につながる」/ UC-D5「先が無い→次を作る」（M3 機能的継続）

1. `analyzeProgressionTS(chords,key) -> {degrees:[{roman,function,cadence?}]}` **[移植: analyze_progression（music21撤廃版＝度数→ローマ数字は表引き、`_function_of` 流用）]**。
2. 末尾機能 f_last を取得 → `nextChordCandidates(f_last, transitionModel, key, mode) -> {degree, prob}[]` **[新規TS]**：(a)機能マルコフ（generate.py:`_FUNC_NEXT` を流用可）＋(b)**コーパス由来の度数 bigram 遷移確率**（進行DBから集計＝**新規データ・要DB**）。
3. メロがあれば各候補を `analyzeFit` で整合フィルタ。
- **充足: 部分**。機能マルコフ fallback（generate.py 既存ロジック）は即だが**凡庸**。コーパス bigram（自然さの肝）は**進行DBが薄いと出ない＝要データ**。

### UC-C4「後ろだけ違う」/ UC-E5「頭2小節固定で残り作り直し」（M4 部分固定＋M2/M3）

1. `toDegrees`→固定区間 [0,k) を距離0制約に。
2. 区間 [k,n) のみ `legalChordsForSegment`（メロ固定なら）or `nextChordCandidates`（連続）で再生成 or `findSimilarProgressions` の**接尾辞だけ違う近傍**を引く。
- **充足: 満たす（メロ固定時）／部分（DB近傍は要DB）**。部分固定はDP距離を「前半固定」に変えるだけ（実装容易）。

### UC-C6「ベタ→ひねる（意外性）」（M4 低頻度側）

1. `nextChordCandidates` の遷移確率を**昇順**（低確率＝意外）で提示。
- **充足: 部分**。**遷移確率＝コーパス由来が前提＝要データ**。DBが無いと「意外」の定義が成り立たない（地図はここを楽観）。

### UC-D3「メロだけ→合うコード数案（ハモ付け）」（M5・核心 worked-example）

入力: `melody=[{pitch,start,dur}]`, `key`, `meter`。
1. `segmentByBeat(melody, meter) -> Segment[]`（小節 or 2拍単位）**[新規TS]**。
2. 各セグメント候補: `legalChordsForSegment(segPCs, key, mode) -> ChordCand[]` **[新規TS]**（UC-C7 と共通）。各候補に**適合スコア** = `fitScore(segPCs, cand)`（=メロ音のうちコードトーン率・拍頭重み）**[新規TS, analyze_fit の在和音率ロジックを1セグメントへ縮約]**。
3. セグメント列を Viterbi/ビーム探索でつなぐ `harmonize(segments, candsPerSeg, transitionPrior) -> ChordSeq[top-n]` **[新規TS]**：状態=各セグのコード候補、放出=適合スコア、遷移=コーパス bigram プライア（MySong型）。**遷移プライア＝進行DB bigram（要データ）**。
4. 上位n案を `realize` → Claude が選択・説明。
- **充足: 部分**。適合スコア＋合法列挙は末端まで繋がる（analyze_fit 既存ロジック）。**遷移プライアが要データ**、Viterbi 本体は**新規**。データ無しでも「適合のみ greedy」で動くが凡庸（FACT: MySong は ~300リードシートのHMM＋適合ブレンドで音楽家同等＝小データで動く実証点。`mysong CHI2008`）。

### UC-D2「メロが変→直して」（M修復）

1. `fitToChords(melody, chords, key) -> {items:[補正melody], meta:{fit_before, fit}}` **[既存: correct.py:fit_to_chords]**（other音だけスナップ・経過/刺繍/掛留は不変）。
- **充足: 満たす（既存・要移植）**。correct.py がほぼ完成。「変の線引き」は analyze_fit の other 判定に委譲済。

### UC-D4「歌詞→メロ数パターン」（M6）

1. `moraAccent(lyric: str) -> {mora:[{kana,accent}]}` **[新規Python: pyopenjtalk]**（モーラ列＋アクセント核）。Python越境＝正当（言語処理）。
2. `layoutNotes(moraCount, meter, bars) -> beatSlots[]` **[新規TS]**（1モーラ=1音符・1:1）。
3. `contourConstraints(accentNuclei) -> 制約` **[新規TS]**（核手前まで上行・核直後下行）＋`chordToneConstraint(chords)` で音高候補。
4. `genMelodyConstrained(slots, contour, chords, n=数案) -> Melody[]` **[新規TS, gen_melody のコードトーン拘束を拡張]**。
5. `analyzeFit` で各案フィルタ → Claude がニュアンス選択。
- **充足: 部分（新規・Python1点）**。モーラ抽出(Python)は pyopenjtalk で確定（FACT: r9y9/pyopenjtalk）。輪郭制約とアクセント整合は**後付けスコアリング**（ハード生成でなく候補フィルタ＝ReLyMe/Orpheus型）。1〜5の連鎖は組めるが**新規実装量が最大級**。

### UC-G3「歌詞モーラ数 vs メロ音数の適合検査」（M6/G）

1. `moraAccent(lyric)` の `mora.length` ↔ `melody.notes.length` を照合 `checkProsodyFit(moraCount, noteCount) -> {ok, diff, msg}` **[新規TS＋Python(モーラ)]**。
- **充足: 満たす（モーラ=Python・照合=TS）**。単純カウント照合。

### UC-A「様式っぽさ（ミスチル/シティポップ/90年代）」（M1＋指紋）

1. `nlToStyleTags(query) -> tag[]` **[Claude]**：「シティポップっぽい」→閉じた語彙 `{citypop, 80s, ...}`。**閉じた語彙が未定義＝未確定（要設計）**。
2. `searchByTags(tags) -> neta[]`：現状 `/search` は mood/text を embed するが**tag テーブルは embed されない**（訂正3）。→ **タグを embed テキストに含める改修 or タグ完全一致フィルタ（core.listNeta は tag フィルタ未対応＝要確認）が要**。
3. 指紋: `artistFingerprint(songs: Degrees[][]) -> vector` **[新規TS]** = [度数1-2gram頻度｜カデンツ頻度｜借用/セカンダリ頻度｜旋律音程分布｜リズム頻度] 連結。`fingerprintDistance(a,b) -> number`＋背景分布(全体/ジャンル)差し引き。
- **充足: 満たせない（現状）／部分（データ＋語彙＋embed改修すれば）**。**アーティスト別コーパス（1人十数〜数十曲の度数解析）が無い**（進行DBは6件のみ）。FACT: 作曲家同定は中央値4作曲家251インスタンスで動く（`arxiv 2506.12440`）が、**交絡（era/genre/国籍を学ぶ）**で同時代弁別困難。**最難・最欲・現状ゼロ**。

### UC-B「感情（切ない/単体コード感情シフト）」（M1進行／M4単体）

- 進行: `searchByTags(["切ない"])` → 訂正3と同じ（mood embed には乗るが**閉じた語彙未定義**）。
- 単体: `emotionShift(chord, "切なく"|"明るく", key) -> ChordCand[]` **[新規TS, ルール表]**：長↔短反転・テンション付加(add9/sus)・借用。**データ不要・決定的**。
- **充足: 単体=満たす（ルール）／進行=部分（mood embedは動くが語彙未定義）**。FACT: Valence(明暗)は Arousal(激しさ)より当てにくい r=0.67<0.81（`MERメタ分析 10.1145/3796518`）＝「明るい/切ない」は曖昧、語彙を絞り強度は粗く。

### UC-E1/E2「ビルドアップ/落ちサビ」（M7 エネルギー操作）

1. `energyCurve(notes|children) -> {register,density,tension,dynamics}[]` **[新規TS]**（小節ごと合成カーブ抽出）。
2. `applyEnergy(target, curve: "rise"|"drop") -> notes` **[新規TS]**（密度↑/音域↑/dynamics↑ or 局所急落）。
- **充足: 部分（新規・定義が操作的）**。FACT: エネルギーは register/density/harmonic tension/dynamics の合成で操作的に定義可（`edmprod tension`）。「落ちサビ」和語の厳密定義は出典薄＝局所急落と割り切る（地図と同じINFER）。

### UC-E4「Aと対照的なB」（M2逆＝非類似）

1. `findContrasting(targetMelody, candidates) -> 距離最大の候補` **[既存ロジック逆: melody_similarity を昇順]**。
- **充足: 満たす（既存逆向き）**。

### UC-F1/F2「合うリズム/歩くベース」（M1タグ＋M4ルール）

- リズム: `searchByTags(genre)` でパターン引き＋拍子整合（gen_drums 既存）。**タグ語彙問題に依存**。
- ベース: `resolveRelativeBass(pattern, chords, key)` **[既存: music.ts]**（ウォーキング=approach度数、ルート弾き=R度数）。**既に TS にある**。
- **充足: ベース=満たす（既存）／リズム検索=部分（語彙）**。

### UC-G1「なぜ切ない？/進行の名前」（M8 説明/命名）

1. `analyzeProgressionTS(chords)` ＋ `findProgression(name)` **[既存: progressions.py:find_progression（要移植 or MCP経由）]** ＋ moodタグ → Claude が言語化。
- **充足: 満たす**。機械が事実、Claude が物語（地図通り）。find_progression は既存。

### UC-G2「前の曲とかぶってない？（自コーパス重複）」（M2）

1. `findSimilar(targetMelody, ownNetaMelodies, top)` **[既存: similar.py:find_similar]** ＋進行は `findSimilarProgressions`。
- **充足: 満たす（メロ既存・進行は新規移植）**。

---

## 2. 充足判定サマリ（A〜G）と hand-wavy の名指し

| UC | 判定 | 末端まで繋がるか／繋がらない理由 |
|---|---|---|
| A 様式っぽさ | **満たせない（現状）** | アーティストコーパス無し・閉じたタグ語彙無し・tagがembedに乗ってない。指紋関数は新規。 |
| B 感情(単体) | **満たす** | emotionShift ルール表（新規だが決定的・データ不要）。 |
| B 感情(進行) | **部分** | mood は embed に乗るが**閉じた語彙未定義**＝検索品質が主観依存。 |
| C 似てる/代替/部分固定 | **満たす** | progressionDistance＋SUBSTITUTIONS（純TS・要進行DB）。 |
| C 継続/意外性 | **部分** | **コーパス遷移 bigram が要データ**。fallbackは凡庸。 |
| C リハーモ | **部分** | 合法列挙＋当てはまり保証は◎、**「おしゃれ度」ランキングが未確定**。 |
| D ハモ付け | **部分** | 適合＋合法列挙◎、**遷移プライアが要データ**、Viterbi新規。 |
| D メロ修復 | **満たす** | fit_to_chords 既存。 |
| D 歌詞→メロ | **部分** | pyopenjtalk(Python)＋輪郭/拘束(TS) 全部新規・実装量最大。 |
| E ビルド/落ちサビ | **部分** | エネルギーカーブ新規・落ちサビ定義は操作的割り切り。 |
| E 対照B | **満たす** | melody_similarity 逆向き。 |
| E 部分固定 | **満たす** | DP前半固定。 |
| F ベース | **満たす** | resolveRelativeBass 既存（TS）。 |
| F リズム検索 | **部分** | タグ語彙問題。 |
| G 説明/命名 | **満たす** | analyze_progression＋find_progression＋Claude。 |
| G 重複検出 | **満たす** | find_similar 既存。 |
| G 譜割り検査 | **満たす** | モーラ(Python)＋カウント照合(TS)。 |

**hand-wavy（地図が楽観・名指し）**:
1. **「閉じたタグ語彙→決定的足切りで M1 成立」**＝語彙が無く・tag が embed に乗ってない。**M1 様式/ムード retrieval の前提が実在しない**（§0 訂正3）。最大の hand-wavy。
2. **「TS移植容易」**＝1個も移植されてない。analyze_fit/melody_similarity/detect_key/analyze_progression/progressions は全部 Python。地図は「素地がほぼ完成」と書くが**TS側はゼロ**（Python資産はMCP経由で呼べるが、ドメイン境界＝TSの方針と矛盾）。
3. **「おしゃれ度／意外性のランキング」**＝評価基準が無く未確定。
4. **コーパス遷移確率**＝M3/M5/C意外性が全部これに依存するのに進行DBは6件。

---

## 3. M1意味retrieval の成立性検証（anisotropy＋タグ語彙）

- **anisotropy 足切り：成立する（解決済）**。FACT(search.py:140 / design.md #65)：`rel=score−floor`(集合内spread較正)＋`CM_SEM_MIN_REL` ゲート＋LIKE∪意味のRRF融合＋両系統0件で「該当なし」。地図の批判#1「生命線が折れている」は**古い**。
- **だが「様式/ムードで意味的に引く」は別問題で、現状ほぼ成立しない**：
  - embed 対象テキスト = `kind + title + text + mood + content(音名/コード記号)`（search.py:`_text_of` L70-79）。**`tag`/`neta_tag` は embed に含まれない**。
  - よって「シティポップっぽい進行」を引くには、進行DB各件に genre/mood/artist を **mood か text に書く（embedに乗る）** か、**tag を `_text_of` に足す改修**が要る。
  - 「閉じたタグ語彙」は**未定義**。`facets()` は distinct を返すだけ。Claude が NL→語彙写像する先の語彙が無い。
- **語彙設計の要否：必須（成立条件）**。閉じた小語彙が無いと M1 は成立しない。具体候補（§5）。
  - **一次検索は「タグ完全一致フィルタ」を推奨**（Claude が NL→閉じたタグ→ exact フィルタ）。embedding は補助（spread較正済の semantic レーン）。これは design#65 のハイブリッド（exact∪semantic）の exact 側に**タグ一致を足す**形＝既存ハブに乗る。ただし **core.listNeta は tag フィルタ未実装の可能性**（mood/kind フィルタはある、tag は要確認）＝**未確定**。

---

## 4. 関数カタログ（重複排除した実装仕様・主要）

`name(input)->output ／ 機構 ／ TS|Py ／ 既存流用|移植|新規 ／ 依存データ`

**土台（最優先・全機構の共通座標）**
1. `toDegrees(chords:ChordEntry[], key:int, mode):Degree[]` ／共通 ／TS ／**新規**（music.ts に QUALITY_INTERVALS あり流用）／ なし
2. `chordPcs(root,quality):Set<pc>` ／共通 ／TS ／**移植**(theory.chord_pcs)／ なし ※music.ts に QUALITY_INTERVALS は既出、関数化のみ
3. `scalePcs(key,mode):Set<pc>` ／共通 ／TS ／**移植**(theory.scale_pcs)／ なし
4. `detectKey(notes):{key,mode}` ／共通 ／TS ／**新規**（自作KS・key-degree研究。music21撤廃）／ なし
5. `analyzeProgressionTS(chords,key):{degrees:[{roman,function,cadence}]}` ／M3/M8 ／TS ／**移植**(analyze_progression＋`_function_of`、ローマ数字は度数表引きで music21 排除)／ なし

**判定・修復（M修復/M4/M5の前提）**
6. `analyzeFit(melody,chords,key):{in_chord_rate,non_chord_tones,score,issues}` ／④ ／TS ／**移植**(analyze.py:analyze_fit 純Python・numpy不使用)／ なし
7. `fitToChords(melody,chords,key):{items,meta}` ／M修復 ／TS ／**移植**(correct.py:fit_to_chords)／ なし
8. `fitScore(segPCs:Set<pc>, cand:ChordCand):number` ／M5 ／TS ／**新規**(analyze_fit在和音率を1セグメントへ縮約)／ なし

**構造類似（M2）**
9. `progressionDistance(a:Degree[],b:Degree[]):number` ／M2 ／TS ／**移植**(similar.py:_edit_distance を度数列へ・degCost差替)／ なし
10. `findSimilarProgressions(target,db,top):{id,label,sim}[]` ／M2 ／TS ／**移植**(find_similar 同型)／ **進行DB**
11. `melodySimilarity(a,b):number` ／M2 ／TS ／**移植**(similar.py:melody_similarity)／ なし
12. `findSimilar(target,candidates,top)` ／M2/G ／TS ／**移植**(find_similar)／ 自コーパス

**変形（M4）**
13. `substitutesOf(degree,key,mode):{degree,kind}[]` ／M4 ／TS ／**新規**(SUBSTITUTIONS表)／ **代理規則表**
14. `legalChordsForSegment(melPCs,key,mode):ChordCand[]` ／M4/M5 ／TS ／**新規**(chordPcs∪tensions 列挙)／ **テンション許容表**
15. `reharmCandidates(degs,legalPerSeg,style):ChordSeq[]` ／M4 ／TS ／**新規**(SUBSTITUTIONS適用×legal交差×analyzeFit検証)／ 規則表
16. `emotionShift(chord,dir,key):ChordCand[]` ／B単体 ／TS ／**新規**(長短反転/テンション/借用)／ なし

**継続・ハモ付け（M3/M5）**
17. `nextChordCandidates(funcLast,model,key,mode):{degree,prob}[]` ／M3 ／TS ／**新規**(機能マルコフ=generate._FUNC_NEXT流用＋bigram)／ **遷移bigram**
18. `harmonize(segments,candsPerSeg,prior):ChordSeq[topN]` ／M5 ／TS ／**新規**(Viterbi/ビーム)／ **遷移bigram**

**歌詞・エネルギー（M6/M7）**
19. `moraAccent(lyric):{mora:[{kana,accent}]}` ／M6 ／**Py** ／**新規**(pyopenjtalk)／ なし
20. `genMelodyConstrained(slots,contour,chords,n):Melody[]` ／M6 ／TS ／**新規**(gen_melody拘束拡張)／ なし
21. `energyCurve / applyEnergy` ／M7 ／TS ／**新規**／ なし

**指紋（A・最難）**
22. `artistFingerprint(songs):vector` ／A ／TS ／**新規**／ **アーティスト別コーパス**
23. `fingerprintDistance(a,b, background):number` ／A ／TS ／**新規**／ 背景分布

---

## 5. 検索カタログ（query形・index・ランキング・粒度・anisotropy対策）

| 検索 | query形 | 対象index | ランキング式 | 粒度 | 純TS or cm-search越境 |
|---|---|---|---|---|---|
| 似た進行 | 度数列 | 進行DBの度数列 | `1−dist/(maxCost·max(len))` (progressionDistance) | 進行まるごと | **純TS（整数DP）** |
| 似たメロ/重複検出 | 音程列 | 自/DBメロの音程列 | melody_similarity | メロまるごと/動機 | **純TS** |
| 対照B | 音程列 | 候補メロ | 1−similarity（最小化） | メロ | **純TS** |
| 後ろだけ違う | 度数列・前半固定 | 進行DB | 接尾辞距離（前半距離0制約） | 接尾辞 | **純TS** |
| 様式/ムード（M1意味） | NL→閉じたタグ＋embed | tag(要embed化)＋mood/text embed | exact(タグ一致)∪semantic(rel≥CM_SEM_MIN_REL) RRF | 進行/リズムまるごと | **cm-search越境**＋TSハブ |
| 名前付き進行 | 別名文字列 | NAMED_PROGRESSIONS aliases | 部分一致（find_progression） | 進行 | **純TS（既存ロジック）** |
| 遷移プライア（継続/ハモ付け） | 末尾度数/機能 | 進行DBの度数 bigram | 条件付き確率 P(next\|prev) | コード遷移 | **純TS（DB集計）** |

**anisotropy対策（M1のみ該当）**: spread較正(`rel=score−floor`)＋`CM_SEM_MIN_REL`ゲートは**実装済（search.py:140）**。残課題は**(a)tag を embed テキストに含める or タグ完全一致フィルタを exact レーンに追加 (b)閉じたタグ語彙の定義**。
**未確定**: core.listNeta が tag フィルタ対応か（exact側にタグ一致を足せるか）＝要コード確認。

---

## 6. データ要件（具体量・今あるか・どの仕入れ研究で賄うか）

| データ | 具体量 | 今あるか | 賄い | 用途 |
|---|---|---|---|---|
| **進行DB（度数列＋タグ）** | 初期 20〜40件→成長 | **6件のみ**(progressions.py) | jp-sources研究 段階1（Songle/集計リスト→度数列正規化） | M2/M3/M5/C/F/A |
| **コーパス遷移 bigram** | 進行DBから集計（DBに従属） | 無し（DB薄い） | 同上DBの派生 | M3継続・C意外性・M5ハモ付け |
| **閉じたタグ語彙** | mood 10〜20語＋genre 10〜15語＋era（80s/90s/00s）＋artist | **未定義**（mood自由TEXT・tag table空運用） | curated＋Claude写像。mood候補=`切ない/悲しい/明るい/元気/疾走/壮大/静か/緊張/穏やか/ノスタルジック`、genre候補=`citypop/jpop/rock/ballad/funk/jazz/edm/folk/anime` | M1/B進行/F |
| **tag を embed に含める改修** | search.py `_text_of` に tags 追加（小） | 無し | コード改修（1行追加級） | M1成立条件 |
| **代理規則表 SUBSTITUTIONS** | 機能代理/相対/セカンダリ/裏/借用/質替え＝〜30エントリ | 無し（engine研究に方針あり） | engine研究§3.2 を表に落とす（データ不要・規則） | M4/C5/C7 |
| **テンション許容表** | quality毎の 9/11/13 許容 pc | 無し | 規則（chord_pcs拡張） | M4/M5 legalChords |
| **アーティスト別コーパス** | 1人 十数〜数十曲の度数解析 | **無し** | jp-sources研究をアーティスト別索引（度数列正規化＝著作権安全） | A指紋（最難） |
| **メロ付き(メロ,進行)ペア** | ハモ付けの「似たメロretrieval」用 | 無し（importは可） | import_midi＋自コーパス蓄積 | M5(c)層・任意 |

---

## 7. カバレッジ総括表（A〜G）

| 群 | 満たす | 部分 | 満たせない | 不足ピース |
|---|---|---|---|---|
| A 様式 | | | ● | アーティストコーパス＋閉じた語彙＋tag-embed＋指紋関数 |
| B 感情 | 単体● | 進行○ | | 閉じたmood語彙（進行側） |
| C 進行連想 | 似てる/代替/部分固定● | 継続/意外性/リハーモ○ | | 進行DB＋遷移bigram＋おしゃれ度基準 |
| D メロ⇔コード | 修復● | ハモ付け/歌詞→メロ○ | | 遷移bigram・Viterbi新規・pyopenjtalk連携 |
| E アレンジ | 対照B/部分固定● | ビルド/落ちサビ○ | | エネルギーカーブ実装・落ちサビ定義 |
| F 別要素 | ベース● | リズム検索○ | | タグ語彙 |
| G メタ | 説明/重複/譜割り● | | | （ほぼ充足・モーラ=Python） |

**「満たせない／データ不足」名指しリスト**:
- **A 様式っぽさ**: アーティスト別コーパス（現状ゼロ）／閉じたタグ語彙（未定義）／tag が embed に乗ってない／指紋関数（新規）／交絡分離（背景分布差し引き＝INFER）。
- **M1意味検索（B進行/F/A）**: 閉じたタグ語彙が無い＋tag が `_text_of` に含まれない＝**様式/ムード検索が実質動かない**。
- **M3継続/C意外性/D5ハモ付け遷移**: コーパス遷移 bigram（進行DB6件では出ない）。
- **C7リハーモ**: 「おしゃれ度」ランキング基準が未確定。
- **core.listNeta の tag フィルタ対応**: 未確認（exact側にタグ一致を足せるか）。

---

## 8. 批判（adversarial・地図の破綻点と評価方法）

1. **【高】TS資産は実在しない**。地図は analyze_fit/melody_similarity 等を「素地がほぼ完成・TS移植容易」とするが、**TS側は1個も無い**（全部 Python・MCP経由のみ）。「ドメインはTS」を守るなら**全部移植＝新規実装**。MCP経由で Python を呼ぶなら「ドメイン境界TS」原則と矛盾＝**どちらかに決める設計判断が未着手**（地図に無い）。
2. **【高】M1の前提（閉じたタグ語彙）が実在しない**。地図は「Claude NL→閉じたタグ→決定的足切り」で成立と書くが、語彙が無く・tag が embed に乗ってない。**様式/ムード検索の worked-example が現状 step2 で詰まる**。
3. **【高】1機構では足りない箇所**: A様式は M1（retrieval）だけでは絶対に出ず、**指紋（新規）＋コーパス（データ）＋交絡分離（手法）**の3点が同時に要る。地図は「M1で寄せる」と軽く書くが実質は別物。
4. **【中】データ依存の連鎖**: M3/M5/C意外性が全部「コーパス遷移確率」に乗るのに、それは進行DB（6件）に従属。**DBが育つまでこの4UCは凡庸 or 動かない**。地図の「即できる」表記は DB前提を隠している。
5. **【中】おしゃれ度/意外性/落ちサビは評価基準が無い**＝出力の正否を測れない。

**評価方法（worked-exampleを固定ケース化できるか）**:
- **可（決定的なもの）**: progressionDistance（「カノンとカノン亜種の距離 < カノンと小室の距離」）、substitutesOf（「Vの裏は♭II7を含む」）、emotionShift（「Cを切なくは Cm/Am系を含む」）、fitToChords（「other音だけ動く・before<after」）、譜割り照合。**ゴールデンテストにできる**＝TDD赤の起点に最適。
- **不可（主観）**: ハモ付けの「自然さ」、リハーモの「おしゃれ度」、様式の「っぽさ」＝**試聴1回に圧縮**するしかない（先行研究方針）。固定ケース化できない＝silentに「できた」と言わない。

---

## 9. 最初に実装すべき関数（1つ）

**`progressionDistance(a:Degree[], b:Degree[]) -> number`（＋前段 `toDegrees`）**。

理由（事実ベース）:
- **純TS整数演算・embedding/データ依存ゼロ**＝ドメイン境界TSの正しい側で完結。similar.py:`_edit_distance`(L13-25) を degCost 差替で移すだけ＝実装リスク最小。
- **ゴールデンテスト可**（§8）＝TDD赤を即書ける（「カノン vs カノン亜種 < カノン vs 小室」）。進行DB6件でも距離は計算できる（DB成長を待たない）。
- UC-C1/C4/E5/G2（似てる/後ろだけ/部分固定/重複検出）が**これ1個で同時に立つ**＝最小縦スライスの心臓。Claudeの仕事は「似てるの軸」解釈のみ＝#86「候補から選ぶ」を最小実証。
- 依存の前段 `toDegrees` は QUALITY_INTERVALS が既に music.ts にある＝差分小。

TDD起点: `toDegrees` の単体（C基準恒等・移調不変）→ `progressionDistance` のゴールデン（同型=0／カノン亜種<小室）。
