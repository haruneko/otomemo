# ドラム表現力・humanize 編集UXのスコープ確定（設計思考piece）

作成: 2026-07-18 ／ 領域: プロダクト設計（リズムエディタUX・feel層露出）／ 実装なし（read-only調査＋設計提案）
オーナーの枠組み: 3軸＝①音符分割（16分より細かい連打・ロール）②ベロシティ（強弱）③発音位置（microtiming/humanize）。
仮説「**分割＋ベロ少しで足りる（細かい発音位置編集はスキップできる）**」の検証と、ほどよい線引きの提案。

---

## 0. 結論（先出し）

**仮説はほぼ正しい。ただし1点だけ修正**：軸③は「スキップ」ではなく「**既存エンジンの露出**」にする（新規開発ゼロに近い）。

3軸は一見同格に見えるが、実コードを読むと**コスト構造がまったく違う**：

| 軸 | エンジン | 保存形式 | 再生 | 編集UI | 結論 |
|---|---|---|---|---|---|
| ③発音位置/humanize | **済**（知覚較正済1/f・部位別プロファイル） | **済**（content.feel） | **済**（applyFeel配線済） | **無し** | **露出のみ（作らない・つなぐ）** |
| ②ベロシティ | **済**（生成側velCurve） | **済**（velCurve） | **×（webが捨てている）** | 無し | **回収＋最小UI（3値）** |
| ①分割（sub-16th） | 部分（フィル型に32分あり） | 可能（beatsPerStep自己記述） | **×（16分ハードコード）** | 無し | **唯一の新規UX。長押し1ジェスチャで最小実装** |

つまり「ドラムに人間味と連打を」という要望の**過半は既に作ってあって、web再生・編集面が受け取っていないだけ**。
最初に出荷すべきは新機能ではなく**表現の回収（P0）**。その後に「ノリ行（P1）」「連打の長押し（P2）」。
**per-hit の発音位置ナッジUIは作らない**（理由は§4＝知覚科学が支持しない＋SSOT契約を壊す）。

---

## 1. 現状の実測（expose vs build の土台）

### 1a. humanizeエンジン＝完成品がある
- `packages/music-core/src/index.ts:127-271` — feel層。`Feel = {swing, swingUnit, humanize, seed}`（131-136）、
  **部位別プロファイル**（142-149: kick sd3/snare sd4+laid-back4ms/hihat sd7/bass sd4/melody sd10、limit 20-40ms）、
  テンポ帯倍率（156-158）、**1/f（Voss-McCartney）ピンクノイズ**（183-196）、単調スイングワープ（200-218）、
  ヨレ警告（`HUMANIZE_YORE_MS=40`・151）。全部決定的（seed）・純関数・straight格子SSOTの上の非破壊層。
- 知覚較正の根拠 = `docs/research/2026-07-14-humanize-perception-defaults.md`：
  **ランダム揺れ単体はグルーヴを上げない**（Senn 2016/2018）・入れるなら1/f（Hennig）・JND≈6ms・
  部位別閾 K/S/HH≈19-24ms、bass/gt≈31-35ms・**+40%誇張で専門家が苛立つ**。
- 再生配線も済：`apps/web/src/audio.ts:1099,1243` で `applyFeel(notes, feel, {compound, tempo})`。
  MIDI書き出しも同経路（`SectionEditor.tsx:452-453` が `sectionFeel()` を渡す）。

**欠けているもの（2つだけ）**：
1. **UI**。humanize/swingノブは**メロ生成の引き出しの中**にしかない（`TinkerSheet.tsx:208,287`＝gen_melodyのパラメータとして送られ、apiが `content.feel` に書く）。「置いたドラムを後から揺らす」直接操作が無い。design.md:1541 の残タスク「**明示的なセクションfeel UI**」がまさにこれ。
2. **part配線**。`audio.ts:1099,1243` は `FeelCtx.part` を渡していない＝せっかくの部位別プロファイル（kick=基準杭/snare=laid-back/hihat=表情担当）が**本番で休眠**し、全パートdefaultプロファイル（sd8）で一様に揺れている。テストでは効いている（`packages/music-core/test/feel.test.ts:117-158`）。

### 1b. ベロシティ＝生成は書くが web が捨てる
- スキーマ：webの `RhythmLane = {name, midi, hits: number[], vel?}`（`apps/web/src/music.ts:191-196`）＝**レーン単一vel**。
  一方 api の `OutLane = {name, midi, hits, vel, velCurve?: number[]}`（`apps/api/src/music/drumLibrary.ts:18`）＝
  **per-hitベロシティが既にある**。フィル/ビルドアップは `velCurve` で 16分→32分＋v70→124 の単調クレッシェンドを生成する
  （`generate.ts:1440-1461`・`2026-07-14-drum-fill-vocabulary.md:274`）。
- **web は velCurve を1箇所も読まない**（grep 0件）。`rhythmToNotes`（`music.ts:257-268`）は `drumVel(l.midi, l.vel)` のみ
  ＝**生成済みフィルのクレッシェンドが再生でもMIDIでも平坦になっている**。ゴーストはレーン分割（`SnareGhost` vel28）で
  生き残るが、velCurve系（ビルドアップの盛り上げ）は死ぬ。
- ついでの地雷：`RhythmEditor.tsx:35-50` の toggle は `hits` だけ書き換えて velCurve に触らない＝velCurve付きネタを
  1タップ編集すると **hits と velCurve の index がずれる**（現状は読み手がいないので無症状の時限爆弾）。

### 1c. 分割（sub-16th）＝スキーマは既に語れる、UI/再生が16分固定
- content は `beatsPerStep` で格子解像度を自己記述する（`generate.ts:1364,1403,1417`）。シャッフル型は**三連12格子**
  （`drumLibrary.ts:24-25,68-73`・triplet=true）として既に生成される。
- しかし web の再生 `rhythmToNotes` は `start: step/4` **ハードコード**（`music.ts:261`）＝beatsPerStep無視。
  4/4の12格子（シャッフル型）は**3拍に圧縮されて誤再生**になるはず（16分格子・6/8=12stepは偶然一致で無事）。
  エディタ `RhythmEditor.tsx:12-19` も拍子から16分格子を決め打ち＝12格子ネタは表示も崩れる。
- 生成側の結線（gen_bass/gen_melodyのドラム入力）は `beatsPerStep` を正しく読む（`sectionContext.ts:124-152`、
  design.md:294,308）＝**web再生だけが二級市民**。

---

## 2. ほどよい線＝どこで止めるか（意見）

### 原則：このアプリのドラム編集は「打ち込みDAW」ではなく「候補を直す・味付けする」面
- 優先度メモ（[feedback-priority-melody-first]）：打ち込み（ドラム/ベース）はAI支援の優先度低・メロが本丸。
  ドラムUXに注ぎ込む予算は小さくあるべき。
- 設計思想：機械は候補まで・仕上げは人間。ドラムの「仕上げ」で人間がやりたいのは
  **(a) アクセントの付け替え (b) 節目の連打 (c) 全体のノリ** の3つで、per-hit の ms 調整ではない。
- モバイル片手親指：新しいモード・新しい画面を増やさない。**既存グリッド上のジェスチャ1つ**（長押し）に全部載せる。

### 各軸の判定
- **③per-hit発音位置編集 = 作らない（確信度高）**。§4で詳述。
- **②ベロシティ = 「少し」で正しいが、その少しの中身は連続値でなく3値**（ゴースト/普通/アクセント）。
  研究（humanize-perception-defaults §④）＝人間らしさの主役は**系統的メトリカルアクセント**であり微細な連続値ではない。
  3値なら片手タップで回せて、velCurve への写像も一意。スライダーやFL式ベロシティレーンは過剰。
- **①分割 = 唯一の新規UX。ただし「セル内分割」だけに限定**。1セル（16分）を2分割（=32分連打）・3分割（≈バズ/ドラッグ）。
  拍3連・半拍3連は**セルをまたぐ**ので対象外＝スイングノブ（3連2/3まで連続可変・`index.ts:132`）と
  12格子シャッフル型が既にカバーする領域。フラム（グレース音）も対象外＝GM SF2のワンショットでは
  32分ダブルと聴感が変わらず、フィル型のゴーストレーン方式（design.md:315）で足りる。

---

## 3. 各軸の設計

### 3①. 分割UX（FL式「同じノートを割る」のモバイル翻訳）

**インタラクション（新ジェスチャは長押し1つ）**：
- タップ＝on/off（現行 `RhythmEditor.tsx:35` 不変）。
- **既存ヒットを長押し → セル直上にミニポップオーバー**（チップ5個・1行）：
  `［強く］［弱く］［2連］［3連］［消す］`
  - 「2連」＝セルを32分×2に分割。「3連」＝セル内3分割（120bpmで IOI≈42ms＝バズ/ドラッグの近似として実用）。
  - 再度長押し→「戻す」で単発へ。分割セルはFL同様**セル内に細いバーをn本描く**（20pxセルに2-3本は描ける）。
  - ロール（連続32分）は「2連を並べる」＝EDMビルドの手作業版。連打の一括塗りは作らない（フィル生成が担う）。
- 空セル長押しは何もしない（誤爆防止）＝置いてから割る、の2段。

**保存（スキーマ爆発なし・加算のみ）**：
- `RhythmLane` に **`divs?: Record<string, number>`**（step→分割数 2|3）を追加。
  - hits整列配列でなく**stepキーのマップ**にする＝1b で見た velCurve の「hitsと並走する配列は編集でずれる」失敗を
    繰り返さない。hits に無い step の divs エントリは無視（防御）。
  - 旧consumer（`parseDrums`・`sectionDrums`・syncopationReport）は divs を読まない＝**アンカー1打として見える**。
    これは正しい退化：ベース/メロ結線はロールの装飾でなく骨格に噛むべき（velCurve と同じ「加算のみ・bit安全」の流儀＝design.md:315）。
- 全体格子を32分化する案（steps×2）は**却下**：セル数倍増でモバイル操作性が死ぬ＋16格子前提の全結線
  （`parseDrums`、gen_bass/melodyノブ、シンコペスコア）に波及。beatsPerStepの二重格子問題（`generate.ts:1428`）も悪化。

**再生（rhythmToNotes 1箇所）**：
- div=n のヒット → n音に展開（IOI=セル長/n・durも/n）。**サブヒットのvelは先頭=本velocity、2打目以降×0.85**
  （実奏のディドル＝2打目弱の近似）。ロールのクレッシェンドは velCurve 側の仕事（下記②）。

### 3②. ベロシティUX（3値・velCurve回収）

- **P0（UI以前）**：`rhythmToNotes` が `velCurve[i] ?? vel` を読む＋セル描画を vel で濃淡（ゴースト=薄・アクセント=濃/縁取り）。
  これだけで**生成済みフィル/ビルドアップのダイナミクスが即・耳に届く**（コード数行・スキーマ変更ゼロ）。
  同時に toggle の velCurve 整列維持（hits編集時に同indexを同時に挿抜する純関数ヘルパ＋契約テスト＝TDD対象）。
- **P1（編集）**：長押しポップオーバーの`［強く］［弱く］`＝3状態トグル：
  - 普通（既定）＝velCurve省略（レーンvel＝`drumVel`既定）
  - アクセント＝`min(127, base+18)`（backbeatブーストの流儀＝design.md:309 の +12/+6 と同スケール感）
  - ゴースト＝`28`（フィル辞書の `V.ghost=28`・`drumLibrary.ts:32` と同値＝生成物と編集物で語彙統一）
  - 保存は**既存 velCurve に書く**＝生成と編集が同じ表現・新フィールド無し。
- 連続値スライダー・ベロシティレーン（FL下段グラフ）・ランプ描画ツールは**作らない**。
  ロールの盛り上げが欲しければフィル生成（velCurveランプ生成済）を使うのが「機械は候補まで」の分業。

### 3③. humanize露出（作らず、つなぐ）

- **「ノリ」行を1本**、セクションエディタ（またはTinkerSheet共通引き出し）に置く：
  - `跳ね`＝スライダー0..1（既存swing・エンジン直結）
  - `人間味`＝seg 4択 `OFF/弱/中/強` → humanize 0 / 0.15 / 0.25 / 0.35
    （既定OFF=bit一致。中=0.25が研究の推奨帯20-30%。0.35超は`onWarn`のヨレ警告帯に入るので上限を強=0.35で切る）
  - 保存＝セクション共有 `content.feel`（design.md:1543-1545 の正準どおり・全トラック同一ワープ＝アンサンブル一貫）。
    現在 `sectionFeel()` は先頭子のfeelを拾うだけ（`SectionEditor.tsx:393-395`）→セクション自身のcontent.feelを
    優先読みに（`feelOf` は既にsection contentを想定・`music.ts:21-28`）。
- **part配線を足す**：`audio.ts` の applyFeel 呼びを part別に分けて `FeelCtx.part` を渡す
  （drums はレーンmidiで kick/snare/hihat、他は part フィールドで bass/melody/chords）。
  休眠中の部位別較正（kickタイト・snare laid-back・hihat表情）が起き、**同じノブ値で揺れの質が上がる**。
- **per-noteのタイミングナッジUIは作らない**。論拠：
  1. **知覚科学が支持しない**：ランダム/残差microtimingはグルーヴを上げない（Senn 2016/2018・PMC5050221/PMC6025871）。
     完全quantizeと原演奏の評価は同等。効くのは系統的パターン＝エンジンが既にやっている（1/f＋部位別offset）。
     手で1音を8ms動かして得られる音楽的利得は、JND≈6msの縁でほぼゼロ。
  2. **SSOT契約を壊す**：「notesは常にストレート格子」（design.md:1543,1548）はスイング衝突・backbeat照合抜け・
     corpusTypicality歪み・quantize不能を一掃した契約。per-hitオフセットのデータ層追加はこのクラスのバグを呼び戻す。
  3. **ミニDAW化の一里塚**：ナッジUIはズーム・アンドゥ粒度・スナップ設定を芋づるで要求する。モバイル片手の器に載らない。
  - 例外ケース（意図的な前ノリ等）は既に**compositional層のノブ**（push/pickup＝格子上の値）で表現できる＝層の割り当て（design.md:1544）どおり。

---

## 4. オーナー仮説への回答

> 「分割＋ベロ少し」で足りるのでは。細かい発音位置はいらないのでは。

**YES、ただし補題つき**：
- 「細かい発音位置編集はいらない」＝**正しい**。しかも消極的なスキップではなく積極的な不採用
  （知覚研究・SSOT契約・モバイル制約の3点で裏が取れる）。
- ただし発音位置の**摘まみ1本（人間味）は要る**し、それは**ほぼタダ**（エンジン・保存・再生配線まで済＝残りはUI1行とpart引数）。
  「発音位置＝per-hit編集」と「発音位置＝全体のノリ」を区別すると、前者を捨て後者を拾うのが正解。
- 「ベロ少し」＝**正しい**が、その半分は新規でなく**回収**（生成が既に書いているvelCurveをwebが捨てている）。
  編集は3値で十分＝連続値UIは作らない。
- 「分割」＝**正しい、唯一の本当に新しいUX**。ただしセル内分割（2連/3連）に限定し、
  拍3連/シャッフルは既存のスイング＋12格子型に委譲、フラムは不採用。

## 5. フェーズ計画（表現力/工数の高い順）

| フェーズ | 中身 | 新規UI | 効果 |
|---|---|---|---|
| **P0 表現の回収** | rhythmToNotesが `velCurve`＋`beatsPerStep` を読む（12格子誤再生の是正込み）・velのセル濃淡描画・toggleのvelCurve整列ガード | なし | 生成済みフィル/ビルド/シャッフルが**設計どおりに鳴る**。数行級で最大の耳インパクト |
| **P1 ノリ行** | 跳ねスライダー＋人間味4seg（セクションfeel UI・design.md:1541の残の回収）・applyFeelへのpart配線 | 1行 | ドラムだけでなく全パートが同一ワープで人間化（アンサンブル一貫） |
| **P2 連打の長押し** | 長押しポップオーバー（強く/弱く/2連/3連/消す）・`divs`保存・再生展開・サブヒット減衰 | 1ジェスチャ | 連打・バズ・アクセント差し替え＝ドラム仕上げの残り全部 |
| 保留（backlog） | 拍3連のセル跨ぎ編集・ロールランプ塗り・グルーヴ抽出(GrooVAE系＝既に優先度低判定 design.md:1278)・per-partノブ露出 | — | 需要が耳で確認されてから |
| **作らない** | per-hitタイミングナッジ・ベロシティレーン/スライダー・32分全体格子・フラム(グレース)・humanizeのper-lane設定 | — | §3③の論拠 |

P0→P1→P2 は独立に出荷可能。P0は事実上バグ修正（意図した表現が落ちている）なので単独で先行してよい。
テストはCLAUDE.mdどおり契約テスト先行：velCurve整列ヘルパ・divs展開のrhythmToNotes・feel part分割適用のbit一致（feel無し=恒等）。

## 6. 設計含意（上位ドキュメントへの反映が要る点）

- design.md「フィール層分離」節：セクションfeel UIの正準（保存位置=セクションcontent.feel・子より優先）を追記してから実装。
- design.md:315（velCurve「旧consumerは無視」）：webが**読むようになる**＝「加算のみ」から「再生正準」への昇格を明記。
- `divs` はスキーマ追加＝schemas.ts/mcp.tsのrhythm形にoptionalで追記（未指定=bit一致の鉄則維持）。
- モック（分割＋3値ベロ＋ノリ行の操作イメージ）：`scratchpad/drum-expressiveness-mock.html`（セッション作業物・正準ではない）。

## 7. コード楽器への拡張（同じ仕事か？＝オーナー問いへの回答）

追記: 2026-07-18 ／ 対象: `ChordPatternEditor`（chord_pattern／section_inst も同経路）。
問い＝「ドラムの表現力をやるなら、コード楽器も**あんま変わらない**（ほぼ同じ仕事）か、それとも別物か」。

### 7-0. 結論（先出し）

**軸③（humanize）は文字通り同じ仕事＝P1を1回やれば両方（＋ベースも）受益。軸②は思想同じ・中身別
（ドラム=回収バグ修正／コード=小さな新設）。軸①はコードに持ち込まない（ボイシング＋arpが既にその席に座っている）。**
総合すると「あんま変わらない」は**半分正しい**：追加費用の大半はゼロ（P1共通）か薄い派生（P2の3値ベロ）で、
ドラムと同時にやると単独でやるより確実に安い。ただし「コードの表現力の本丸」はドラム3軸の外＝
**既に作ってあるボイシング軸**（§7-4）であり、ドラム式の軸はコードでは脇役。

### 7-1. 軸③ humanize ＝ **完全に共通（SHARED・追加作業ゼロ）**

- エンジンには **chords プロファイルが既に居る**：`packages/music-core/src/index.ts:147`
  `chords: { sd: 8, offset: 3, limit: 35 }`＝研究の bass/gt 閾 31-35ms 帯に較正済み。ドラム同様**本番で休眠**。
- 休眠の原因も同一：`apps/web/src/audio.ts:1099,1243` の applyFeel が `FeelCtx.part` を渡さない＝全パート default。
  パート印は合成時に付与済み（`music.ts:672`＝chord_pattern/riff/section_inst → MixPart `"chord"`）なので、
  P1 の part 配線で **MixPart→HumanizePart の写像1行**（`"chord"`→`"chords"`）を足せばコード楽器は**タダで**起きる。
- ノリ行UI（跳ね＋人間味）はセクション共有 `content.feel` ＝楽器非依存の設計なので、コード用の追加UIは**不要**。
- 副次効果：和音ブロック（strum＝全声部同 start・`music.ts:541`）に per-note の揺れが乗ると声部間に
  微小のばらけ（緩いストラム感）が出る。前音ガード（`index.ts:257`・+0.02拍）内なので破綻しない。

**判定：P1 に含めて終わり。コード専用の工数=写像1行。**

### 7-2. 軸② ベロシティ ＝ **同じ思想・別のバグクラス（DISTINCT・ただし薄い）**

ドラムは「生成が書いた velCurve を web が捨てる」＝**回収**だった。コードは事情が違う：

- **生成が最初から何も書かない**：`genChordPattern`（`generate.ts:859-873`）も `genSectionInst`（`generate.ts:1290-1322`）も
  hits は `{step, dur}` のみ。スキーマも同じ＝`ChordHit = { step; dur }`（`music.ts:424`）に vel が**存在しない**。
- **解決も素通し**：`resolveChordPattern`（`music.ts:511-553`）は vel 無しの Note を吐き、再生の既定
  `n.vel ?? 100`（`music.ts:1139`）で**全打・全声部フラット100**。ストラムに強弱勾配も時間勾配も無い（`music.ts:541`＝全声部同 start/dur/vel 同値）。
- **beatsPerStep 問題は存在しない**：chord_pattern に beatsPerStep フィールドが無く、格子は 16分固定
  （`BASS_STEP_TO_BEAT=0.25`・`music.ts:307,519-520`）。12格子誤再生のクラスはドラム専用＝**P0 はドラムだけでよい**。

つまりコード側は「捨てている表現の回収」が**無い**（回収すべき信号がそもそも無い）。やるなら**小さな新設**：
1. `ChordHit.vel?: number` を optional 追加（未指定=bit一致の鉄則どおり）。hitごと1値＝和音の全声部同値
   （声部別ベロはボイシングの領分でありスケッチの器を超える）。
2. `resolveChordPattern` が vel を素通しで Note へ（数行）。
3. 編集は**ドラムと同じ3値**（強く/弱く/普通）＝長押しポップオーバーの部品を共用（チップは`［強く］［弱く］［消す］`）。
4. （任意）`genSectionInst` の stab がアクセントを書く＝生成と編集で同じ語彙。

**判定：P0 には入らない（回収物ゼロ）。P2 の長押しポップオーバーを作るとき、チップ違いの薄い派生として同梱するのが最安。**

### 7-3. 軸① 分割 ＝ **持ち込まない（DIVERGES・既存軸が席を埋めている）**

ドラムで「唯一の新規UX」だったセル内分割は、コードでは**別物の意味**（トレモロ/高速リストラム/より速いarp）になるが：

- **音価軸が既にある**：長さピッカー 16/8/4/2/1＋付点（`ChordPatternEditor.tsx:13-19`）＋伸び調整タップ
  （`applyCellTap`・`music.ts:558-563`）。ドラムに無かった「細かく置く」自由は 16分単位で既に手にある。
- **高速の細分は arp が担当**：向き↑/↓/↑↓・駆け上がり1-4oct・区切り拍（`music.ts:490-508,532-539`・
  エディタ `ChordPatternEditor.tsx:127-157`）。「16分より細かく刻みたい」の音楽的需要（速いフィギュレーション）は
  この軸で満たすのが筋＝分割チップの新設は席の重複。
- sub-16th のトレモロ/バズ・リストラムは実需が薄い（このアプリのジャンル圏でコードトレモロは端役）。
  欲しくなったらポップオーバー部品にチップ`［トレモロ］`を足すだけの構造にしておく＝**backlog 行き**。

**判定：作らない。コードの「もっと細かく」は arp 軸へ誘導。**

### 7-4. コードだけの第4軸＝ボイシング（既に built・これが本丸）

ドラム3軸の枠に入らない表現面がコードには丸ごとある：打ち方 strum/arp・トップ狙い・open/close・高さ・
パワーコード・arp 3ノブ（`ChordPatternEditor.tsx:99-171` の②ゾーン全部）。**コード楽器の表現力の主戦場はここで、
既に実装済み**。残っている唯一のコード固有ギャップは**ストラムの時間展開**（じゃら〜ん＝声部を10-20ms ずつ
ずらす＋末声減衰）：`resolveChordPattern` の出力は導出値（保存SSOTは content）なので、resolve 時の決定的
オフセットとして足しても straight格子契約（design.md:1543）を壊さない。ただし需要は耳確認前＝**backlog**。

### 7-5. 統合フェーズ計画（ドラム＋コード楽器）

| フェーズ | ドラム | コード楽器 | 共有/個別 |
|---|---|---|---|
| **P0 表現の回収** | velCurve＋beatsPerStep 読み・セル濃淡・整列ガード | **対象外**（回収する信号が無い） | ドラム個別 |
| **P1 ノリ行** | 跳ね＋人間味UI・part配線 | **同じ修正で自動受益**（chords プロファイル起床・写像1行） | **完全共有**（ベース sd4 も同時に起きる） |
| **P2 長押しポップオーバー** | 強く/弱く/2連/3連/消す＋divs | 薄い派生：強く/弱く/消す＋`ChordHit.vel?`＋resolve素通し | 部品・3値語彙・「加算のみ未指定=bit一致」流儀を共有。チップ構成と保存先が個別 |
| 保留（backlog） | 拍3連跨ぎ等（§5どおり） | ストラム時間展開（じゃら〜ん）・トレモロチップ・stab アクセント生成 | 個別 |
| **作らない** | per-hitナッジ等（§5どおり） | 声部別ベロ・コード版分割チップ・ベロシティレーン | — |

**一緒にやると安くなるもの（3つ）**：
1. **part 配線1回で全楽器**：audio.ts の applyFeel 分割は1箇所の仕事で、drums（レーンmidi→kick/snare/hihat）・
   chord→chords・bass→bass・melody/counter→melody が同時に起きる。コード単独でやっても同じ箇所を触る＝二度手間の回避。
2. **長押しポップオーバー部品と3値ベロ語彙**：ドラムで作る部品（チップ1行・長押し検出・セル濃淡描画）を
   コードはチップ差し替えで再利用。別々に作ると操作語彙が割れる。
3. **セクション feel UI は最初から楽器非依存**：content.feel はセクション共有＝コード用に何かを作る日が永遠に来ない。

### 7-6. オーナーへの答え（一言で）

**「あんま変わらない」でだいたい合っている。**正確には：人間味（P1）は**同じ1つの修正**で両方に効く（コード分の
較正済みプロファイルが既にエンジンで待っている）。ベロは**ドラム=直す／コード=薄く足す**の違いがあるが、
P2 の部品共用で差分は小さい。分割だけはコードに持ち込まず arp 軸に任せる。そしてコードの表現力の本丸
（ボイシング）は**もう作ってある**＝ドラム表現力パッケージにコードを同乗させる追加費用は小さく、P1 に至ってはゼロ。

## 出典
- 社内: `docs/research/2026-07-14-humanize-perception-defaults.md`（知覚較正・JND・部位差）／`2026-07-14-syncopation-sweet-spot.md`（逆U・盛りすぎ警告の思想）／`2026-07-14-drum-fill-vocabulary.md`（ロール/ビルドの語彙・velCurve必要性）／`2026-07-14-drum-pattern-genre-library.md`（12格子シャッフル型）／`2026-07-11-swing-feel-layer-audit.md`（straight SSOT＋feel層の確定）
- 外部（一次出典は上記研究doc内のURL群）: Senn et al. 2016/2018（microtiming残差は無効果）・Hennig et al. 2011（1/f＞白色）・Friberg & Sundberg 1995（JND≈6ms）・Dahl（系統的アクセントが主役）・Logic/MPCのhumanize慣習（±5ms/±10vel）

---

## §8 設計（実装レディ）

追記: 2026-07-18（同日・スコープ確定→設計フェーズ）／ 対象: §0〜§7 の確定スコープを Opus が P1→P0→P2 の順で実装できる粒度に落とす。
コードは全て read-only 実測（file:line は 2026-07-18 時点の実ファイル。§1 の一部引用行はその後のファイル成長でずれている＝本節の行番号が正）。

### 8-0. 共通原則（全フェーズの憲法）

1. **加算のみ（ADDITIVE）**：新フィールドは全部 optional。**未指定＝現行と bit 一致**が全フェーズの受け入れ条件。
2. **単一実装**：feel は再生（`audio.ts`）と MIDI 書き出し（`music.ts notesToMidi/tracksToMidi`）が**同じヘルパ**を通る（dual実装ドリフト禁止＝music-core の趣旨）。
3. **SSOT はストレート格子**（design.md「フィール層分離」）：divs/velCurve/vel は**データ層（格子上の値）**、揺れは feel 層。per-hit タイミングは今回も持ち込まない。
4. **bit 一致ガードの正確な線引き**：

| 条件 | 保証 |
|---|---|
| `content.feel` 無し／swing=0 かつ humanize=0 | 再生・MIDI とも **byte 一致**（同一参照 or 値同一） |
| swing>0・humanize=0 | 現行と**完全一致**（part 分割はスイングに無関係＝per-note 写像） |
| humanize>0 | **意図的変化**（部位別プロファイル起床）。ガードは決定性（同 seed 同出力）のみ |
| `velCurve` 無し・`beatsPerStep` 無し or 0.25 | `rhythmToNotes` 出力 bit 一致 |
| `divs` 無し／`ChordHit.vel` 無し | 展開・resolve とも bit 一致（`vel: undefined` キーも生やさない＝deepStrictEqual 安全） |

### 8-1. P1 設計＝ノリ行＋part 配線（全楽器同時に起きる）

#### 8-1a. ストレージ（スキーマ変更＝実質ゼロ）

- **保存先＝section neta の `content.feel`**。形は既存 `Feel = {swing?, swingUnit?, humanize?, seed?}`（`packages/music-core/src/index.ts:131-136`）そのまま＝**新フィールド無し**。
- 楽器非依存の確認：`feelOf(content)`（`apps/web/src/music.ts:22-28`）は任意 content の `.feel` を読む汎用。適用は合成 notes 全体へ1回（`audio.ts:1099`）＝アンサンブル共有（design.md「フィール層分離」正準どおり）。section content は自由形で `updateNeta` がそのまま保存する（`SectionEditor.tsx:134` のコメント「content スキーマは自由形＝api 変更不要」が先例）＝**api/zod 変更ゼロ**。
- 消し方の正準：`swing===0 && humanize===0` になったら **feel キーごと削除**（`{...secContent, feel: undefined}` で JSON から落とす）＝「無指定=bit一致」状態へ完全復帰できる。

#### 8-1b. エンジン＝`applyFeelByPart`（music-core に追加・純関数）

`packages/music-core/src/index.ts` の `applyFeel`（:223-271）の**上に被せる薄いラッパ**を同ファイルへ追加：

```ts
export function applyFeelByPart<T extends { start: number; dur: number }>(
  notes: readonly T[], feel: Feel | null | undefined,
  ctx: FeelCtx, partOf: (n: T) => HumanizePart | undefined,
): T[]
```

意味論（ここが契約・テスト先行）：
- `!feel`：**入力をそのまま返す**（`notes as T[]`・同一参照＝bit）。※`applyFeel` はコピーを返す（:224）が、ラッパは無 feel 時に map すらしない＝呼び側 `if (opts.feel)` ガード（`audio.ts:1099`）と二重で安全。
- `humanize<=0`（swing のみ）：`applyFeel(notes, feel, ctx)` を**1回だけ**呼んで返す＝現行と完全一致（swing ワープは per-note 独立写像:229-237＝分割の意味が無い）。
- `humanize>0`：notes を `partOf(n)` でグループ化（`undefined` グループ含む）→ 各グループへ `applyFeel(group, {...feel, seed: (feel.seed ?? 1) + PART_SEED_SALT[part]}, {...ctx, part})` → **元 index へ位置書き戻し**（グループ j 番目の出力を元の位置 origIdx[j] へ）＝出力配列の長さ・おおよその順序を保存（humanize 内部 sort:266 による同時刻近傍の入れ替わりは許容＝スケジューラ/MIDIは順序非依存）。
- **seed salt**＝部位間の揺れを非相関化（同 seed だと全パートが同じ 1/f 系列:241 を共有し「全員が同時によろける」不自然さ）。定数は core に置く：`PART_SEED_SALT = { kick:11, snare:23, hihat:37, bass:53, chords:67, melody:83 }`・undefined(default)＝salt 0。
- ヨレ警告：`ctx.onWarn` はグループ毎に透過（部位名付き `HumanizeWarn.part`:159 がそのまま活きる）。なお UI 上限=強0.35 では最悪でも `4×0.35×sd10×1.3=18.2ms < HUMANIZE_YORE_MS=40`（:151）＝**警告帯に入らない**（§3③の設計どおり）。

#### 8-1c. web 側の part 解決と配線（touchdown 一覧）

**部位マップ**（web `music.ts` に追加。`MixPart`（:68）と GMドラム番号→`HumanizePart` の写像＝music-core は MixPart を知らないので web 側に置く）：

```ts
const DRUM_HUM_PART: Record<number, HumanizePart> = {
  35:"kick",36:"kick",                       // Kick
  37:"snare",38:"snare",39:"snare",40:"snare",41:"snare",45:"snare",48:"snare",50:"snare", // Snare/Clap/Tom（フィルの腕）
  42:"hihat",44:"hihat",46:"hihat",51:"hihat",53:"hihat",54:"hihat", // HH/Ride/Tamb（タイムキープの腕）
  49:"kick",52:"kick",55:"kick",57:"kick",   // Crash 類＝構造アンカー（最タイト）
};                                            // その他 percussion → undefined＝default プロファイル
const MIX_HUM_PART: Record<MixPart, HumanizePart> = { melody:"melody", counter:"melody", chord:"chords", bass:"bass", drums:"snare"/*未マップdrumの床*/ };
export function humanizePartOf(n: Note): HumanizePart | undefined {
  if (n.drum) return DRUM_HUM_PART[n.pitch];           // ドラムはレーンmidiで分ける（§7-1）
  return MIX_HUM_PART[n.part ?? "melody"];             // 単体再生（part無し）はメロ扱い（partTracks:987 と同じ防御既定）
}
export function applyFeelEnsemble(notes: Note[], feel: Feel|null|undefined, ctx: {compound?: boolean; tempo?: number; onWarn?: (w: HumanizeWarn)=>void}): Note[] {
  return applyFeelByPart(notes, feel, ctx, humanizePartOf);
}
```

置換点（**4箇所・全部これ1本に**）：
1. `apps/web/src/audio.ts:1099` — `applyFeel(notes, opts.feel, {compound, tempo:bpm})` → `applyFeelEnsemble(...)`（import は既に "./music" から `applyFeel` を引いている行:18 を差し替えるだけ＝既存 import 経路）。
2. `apps/web/src/audio.ts:1243` — reschedule 側も同じ差し替え（初回一括:1099 と同一関数＝ドリフト無し）。
3. `apps/web/src/music.ts:933`（`notesToMidi` の `feelNotes`）と `:1019`（`tracksToMidi`）— `feelNotes(notes, feel, meter)` → `applyFeelEnsemble(notes, feel, {compound:isCompoundMeter(meter), tempo:bpm})`。**副産物の是正**：現行 MIDI 書き出しは tempo を渡していない＝humanize が拍比フォールバック（core:259-265）で鳴り、再生（ms絶対+部位別:244-258）と**別の揺れ**だった。P1 で再生と MIDI が同一経路になる（feel 無しは両者とも不変）。
4. `apps/web/src/playback.ts:117`（`feel: plan.feel` を playNotes へ渡す口）— 変更なし（適用点は 1099 のまま）。

**feel の読み出し（section 自身を最優先に）**：
- `SectionEditor.tsx:396-398` `sectionFeel()` を `feelOf(neta.content) ?? feelOfTree(children)` へ（`feelOf`/`feelOfTree`＝`music.ts:22-28,37-48`）。section content.feel 無し＝従来どおり先頭子 fallback＝bit。MIDI 書き出し2箇所（`SectionEditor.tsx:454-455`）は sectionFeel() 経由なので自動追従。
- `buildPlayback` tree ソース（`music.ts:1300-1309`・現在 `feel: undefined`:1306）：`PlaybackSource` tree（:1274）へ `feel?: Feel | null` を追加し `feel: src.feel ?? feelOfTree(src.children)` に。**効果**＝ネタ帳カードの section 再生・FormStrip 窓もエディタ外で feel が鳴る（現在は無音の既知ギャップ）。呼び元は任意で `feelOf(sectionNeta.content)` を渡す。feel を拾えない tree＝従来どおり＝bit。

#### 8-1d. ノリ行 UI（決定＝TinkerSheet に「共通」引き出しを新設）

**置き場所の決定と根拠**：
- **TinkerSheet（いじる▾）に view "common"＝「共通」引き出しを新設**し、そこへ（i）既存ハブの「進行の色」chip 行（`TinkerSheet.tsx:144-149`）を移設、（ii）**ノリ行（跳ね＋人間味）を新設**。ハブにはサマリ chip 1行（例「共通：明るめ・跳ね0.3・人間味 中 ▾」）だけ残す＝ハブ行数純増ゼロ。
- 根拠：①**ハブ契約そのもの**（`TinkerSheet.tsx:11-14`「横断設定は旋法＋一式の2枠で打ち止め。3つ目が要る日は『共通』引き出しを新設して沈める」）＝ノリは3つ目の横断設定でありこの条項の発動日。②ノブ言語の一元化＝ユーザーは swing/humanize を既に「いじる▾」の中で知っている（メロ引き出し `:208` 跳ねスライダー・`:287` 人間味 seg）。③ボトムシート＝モバイル片手親指の既定文法。④per-instrument エディタ案は**却下**＝content.feel はセクション共有・楽器非依存（design.md「アンサンブル一貫性」）で、楽器別の置き場は「ドラムだけ跳ねる」誤解を生む。
- **既存メロ引き出しの swing/humanize（生成パラメータ）との関係**：あれは gen_melody payload→api がメロ neta の content.feel に書く「生成の味付け」。P1 後は sectionFeel() の優先順位（section > 先頭子）で衝突が構造的に解決＝二重適用は起きない（適用は 1099 の1回だけ）。ノリ行の初期表示は `sectionFeel()` の実効値＝子から拾った feel も見える→触った瞬間 section へ昇格保存。

**コンポーネント `NoriRow`**（新規・`apps/web/src/components/NoriRow.tsx`・約40行）：

```tsx
export function NoriRow({ feel, onChange }: { feel: Feel | undefined; onChange: (f: Feel | undefined) => void })
```
- 1行目=跳ね：`knob-row` スライダー（0..1・step0.05・両端ラベル「まっすぐ/はねる」＝メロ引き出しの sliderRow と同じ見た目言語）。
- 2行目=人間味：`seg-ctl`/`seg-b` 4択（`TinkerSheet.tsx:278-282` の OFF/弱/中/強 idiom を流用）。**写像＝OFF:0／弱:0.15／中:0.25／強:0.35**（既定OFF・中=研究推奨帯20-30%・強0.35=ヨレ警告帯手前で頭打ち）。既存 feel の中間値（例 0.2）は最寄り段を点灯。
- onChange 規約：`swing===0 && humanize===0` → `undefined`（キー削除）／それ以外 → `{swing, humanize, seed: feel?.seed ?? 1, swingUnit: feel?.swingUnit}`（seed/swingUnit は保存値を保持・UI では触らない。seed 🎲は backlog）。
- 保存＝SectionEditor の既存レーン状態保存 idiom（`SectionEditor.tsx:133-136` `writeSelf({content:{...secContent, feel}})`・楽観更新＋CoW ガード＋失敗 revert）をそのまま使う。**反映は次の再生から**（走行中 transport は `audio.ts:1135` で feel を捕捉済み＝生変更は対象外。制約として明記）。
- **おまけ（P1-c・任意）**：単体 rhythm ネタ編集にも同じ `NoriRow` を置ける＝`useNetaEditor.ts:191` が `feelOf(neta.content)` を既に再生へ渡しているので **rhythm content.feel を書けば配線ゼロで鳴る**（ドラム単体の人間味試聴）。工数=RhythmEditor ツールバー1行。

#### 8-1e. P1 の契約とテスト

- core: `applyFeelByPart` — ①feel無し=同一参照 ②hum=0=単一 applyFeel と deepEqual ③hum>0 で kick グループの |Δstart| 分布 < melody グループ（プロファイル起床の観測）④同 seed 2回=完全一致（決定性）⑤音数・多重集合として音は不変（並べ替えのみ）。
- web: ⑥feel 無し section の playNotes 入力 notes / notesToMidi バイト列が現行スナップショットと一致（回帰）⑦`humanizePartOf` テーブル（drum midi 網羅・part 無し=melody）⑧sectionFeel の優先順位（section content.feel > 子）。
- 既存テストへの影響：humanize>0 の出力を固定している web テストがあれば**意図的更新**（P1 の趣旨＝部位別化）。`packages/music-core/test/feel.test.ts:117-158`（part 別プロファイル）は不変で緑のまま。

### 8-2. P0 設計＝表現の回収（ドラムのみ・事実上バグ修正）

#### 8-2a. スキーマ（web 型に api が既に書いている物を追記するだけ）

`apps/web/src/music.ts:211-216 / 231-235` に optional 追加（**api `OutLane`（`drumLibrary.ts:18`）と genDrums content（`generate.ts:1364,1403,1417`）に合わせるだけ＝データは既に DB にある**）：

```ts
export interface RhythmLane { name; midi; hits: number[]; vel?; velCurve?: number[];  // hits と同順 per-hit vel
                              divs?: Record<string, 2 | 3> }                          // P2 で使用（P0 では型のみ）
export interface RhythmContent { steps; lanes; kit?; bars?: number; beatsPerStep?: number }
```

#### 8-2b. `rhythmToNotes`（`music.ts:277-288`）の作り替え＝P0 の本丸

```ts
export function rhythmToNotes(r: RhythmContent): Note[] {
  const bps = snapBps(r.beatsPerStep);                     // 未指定 → 0.25（現行 step/4 と同値＝bit）
  return r.lanes.flatMap((l) =>
    l.hits.map((step, i) => ({
      pitch: l.midi,
      start: round3(step * bps),                           // 12格子シャッフル型の誤再生を是正
      dur: bps,
      drum: true,
      vel: l.velCurve?.[i] ?? drumVel(l.midi, l.vel),      // ★velCurve 回収（フィル/ビルドのクレッシェンド復活）
      kit: r.kit,
    })));
}
// snapBps: undefined→0.25。|bps−1/3|<1e-3 → 1/3（genDrums は round3 で 0.333 を保存:generate.ts:1415＝
// そのまま乗算すると小節末で最大 8ms 累積ドリフト→有理数へスナップして根治）。他はそのまま。
```

bit 一致の証明ポイント（テストで固定）：16格子（bps 未指定 or 0.25）は `step*0.25 === step/4`（2進で厳密）・`round3` は厳密値を変えない・dur 0.25 不変・velCurve 無し⇒`drumVel` 従来式。**6/8 の12step も bps=round3(3/12)=0.25 ＝bit 一致**（§1c「偶然一致」の正当化）。変わるのは（a）4/4 12格子＝bps 1/3（shuffle.* の誤再生是正＝バグ修正）と（b）velCurve 持ち（現状 web で鳴らした瞬間から平坦→カーブ＝これも意図の回収）。

#### 8-2c. toggle の index 整列ガード（時限爆弾の解除）

`RhythmEditor.tsx:35-50` の toggle は hits だけ挿抜＝velCurve 付きレーンを編集すると index がずれる。**純関数ヘルパを music.ts へ**（テスト先行）：

```ts
export function laneWithHitToggled(lane: RhythmLane, step: number): { lane: RhythmLane; turnedOn: boolean }
```
- OFF→ON：hits をソート位置 k へ挿入。velCurve があれば同 k へ `drumVel(lane.midi, lane.vel)`（=普通）を挿入。velCurve が無ければ**作らない**（bit）。
- ON→OFF：hits の k を除去。velCurve があれば同 k を除去。`divs` があれば `divs[String(step)]` を削除（P2 先取りの防御）。
- 正規化：編集後 velCurve の全要素が基準値と同値なら velCurve キーを落とす（content を最小に保つ）。
RhythmEditor の toggle 本体はこのヘルパ呼びに置換（プレビュー発音:47-49 は不変）。

#### 8-2d. 12格子のグリッド表示（再生を直すなら表示も）

`RhythmEditor.tsx:12-19 meterSteps` は拍子から16分決め打ち＝12格子ネタは表示崩れ（§1c）。content 優先で導出：

```ts
const bps = snapBps(rhythm.beatsPerStep);
const stepsPerBar = Math.round(beatsPerBarN(meter) / bps);   // 4/4×1/3 → 12
const beatStep = Math.max(1, Math.round(1 / bps));            // 1拍=3step（三連格子）
```
beatsPerStep 無し＝従来 meterSteps＝bit。BarsControl の bars 計算（:53-55）は stepsPerBar 経由で自動整合。

#### 8-2e. vel セル濃淡＋3値編集（長押しポップオーバー v1）

- **濃淡（読み）**：セルに `style={{"--hv": v/127}}`（v = `velCurve?.[i] ?? drumVel(midi, vel)`）を付け、CSS で on セルの背景 opacity/インセット影を --hv 連動＝ゴースト薄・アクセント濃。ダークテーマは既存トークン（rhythm-cell の on 色）に乗るので分岐不要。生成フィルの v70→124 ランプが**置いた瞬間から見える**。
- **編集（3値・velCurve に書く＝新フィールド無し）**：長押しポップオーバー（8-3b の共通コンポーネントの v1）を **P0 ではチップ2個**［強く］［弱く］で先行導入：
  - 普通（既定）＝velCurve[i] を基準値へ（全要素基準値なら velCurve 削除）
  - 強く＝`min(127, base+18)`（backbeat ブースト design.md の +12/+6 と同スケール感・base=`drumVel(midi, lane.vel)`）
  - 弱く＝`28`（フィル辞書 `V.ghost=28`・`drumLibrary.ts:32` と同値＝生成物と編集物の語彙統一）
  - チップは3状態トグル（強く点灯中に強く→普通へ戻る）。実装は純関数 `laneWithHitVel(lane, step, state: "normal"|"accent"|"ghost")`（velCurve 生成＝無ければ hits 全長を基準値で敷いてから該当 index を書く）。
- 契約テスト：velCurve 無し・16分のみのリズム一式（既定 rhythmOf:273 含む）で新旧 `rhythmToNotes` 出力 deepEqual／`laneWithHitToggled` の velCurve 整列（挿入・除去・正規化）／ghost=28・accent=base+18 の写像。

### 8-3. P2 設計＝長押しポップオーバー（divs＋ChordHit.vel）

#### 8-3a. `divs`（セル内分割）＝スキーマと展開

- **保存**：`RhythmLane.divs?: Record<string, 2|3>`（key=String(step)・8-2a で型導入済み）。hits に無い step のエントリは**無視**（防御・§3①）。hits と並走する配列にしない理由＝velCurve で踏んだ「編集で index がずれる」失敗の再発防止。
- **展開（rhythmToNotes 内・1箇所）**：hit(step) に div=n があれば n 音へ：

```ts
const d = l.divs?.[String(step)];
if (d !== 2 && d !== 3) return [note];                        // 不正値は単発（防御）
return Array.from({length: d}, (_, k) => ({ ...note,
  start: round3(step * bps + (k * bps) / d),
  dur:   round3(bps / d),
  vel:   k === 0 ? v : Math.round(v * 0.85),                  // 2打目以降×0.85＝ディドル2打目弱の近似
}));
```
  velCurve と直交：v はセル vel（velCurve 回収後の値）＝「ロールのクレッシェンド」はセル間 velCurve、セル内減衰は固定 0.85（§3①の分業）。
- **旧 consumer の退化（実測で確認済み・全て「アンカー1打」に見える＝正しい退化）**：
  - api `parseDrums`（`generate.ts:886-906`）＝ hits しか読まない → gen_bass/gen_melody のドラム結線は骨格に噛む（divs 装飾は不可視）。
  - web `sectionDrums`（`sectionContext.ts:127-152`）＝ hits をマージするだけ → 同上。
  - MCP `drumsSchema`（`mcp.ts:715-725`）＝ zod が未知キーを strip → divs/velCurve 付き content を gen 入力に渡しても安全に落ちる。
  - シンコペ/監査系も hits 基準＝不変。**velCurve と同じ「加算のみ・bit 安全」の流儀（design.md WP-D1 の velCurve 条項）を divs にも適用**と明文化する（→#29）。
- **UI（ドラム）**：長押しポップオーバーのチップを［強く］［弱く］［2連］［3連］［消す］の5個へ拡張（P0 v1 の +3）。2連/3連は点灯トグル（再タップで単発へ＝divs エントリ削除）。消す＝`laneWithHitToggled` の OFF 経路（velCurve/divs 同時掃除済み）。分割セルの描画＝セル内に縦バー n 本（`.rhythm-cell.div2/.div3` の repeating-linear-gradient・20px セルに2-3本は視認可）。空セル長押しは無反応（誤爆防止・§3①）。

#### 8-3b. 共通ポップオーバー部品（1コンポーネント・チップ差し替え）

- **`useLongPress(onFire)`**（新規 hook・web/src/）：pointerdown で 450ms タイマ→発火。pointermove>8px／pointerup／pointercancel で解除。発火後は直後の click を1回抑制（タップ toggle と衝突させない）。`onContextMenu` は preventDefault（モバイル長押しメニュー抑止）。マウスでも同介入（デスクトップ検証可）。
- **`CellPopover`**（新規コンポーネント）：`{ anchor: DOMRect; chips: {id,label,on?}[]; onPick(id); onClose }`。セル直上に絶対配置のチップ1行（`chip` クラス既存 idiom＝ダークテーマ対応済み）＋全画面 backdrop（`tools-backdrop` idiom `SectionEditor.tsx:446` と同型）でタップ外し。グリッドは横スクロールなので位置は `getBoundingClientRect` 基準の fixed。
- **チップセット（楽器別・部品は同一）**：ドラム＝強く/弱く/2連/3連/消す。コード楽器＝**強く/弱く/消す**（分割は arp 軸へ委譲＝§7-3。トレモロチップは backlog＝チップ配列に1要素足すだけの構造にしておく）。

#### 8-3c. `ChordHit.vel?`＋resolve 素通し（コード楽器の薄い新設）

- **スキーマ**：`ChordHit { step; dur; vel?: number }`（`music.ts:424`）。1 hit=1値＝和音の全声部同値（声部別はボイシングの領分＝§7-2）。
- **生存確認（変更不要の証明）**：`normHits`（:435-437）はオブジェクトを素通し＝vel 保持。`applyCellTap`（:558-563）は既存 hit を spread（`{...h, dur:...}`）＝伸び調整でも vel 保持。新規配置は vel 無し（普通）。**両関数とも無変更**。
- **resolve 素通し**（`resolveChordPattern`:511-553・3点だけ）：
  - arp（:538）`out.push({ pitch, start, dur, ...(hits[h]!.vel != null ? { vel: hits[h]!.vel } : {}) })`
  - strum 声部ループ（:541）とオンベース（:548）へ同じ条件 spread。
  - **`vel: undefined` キーを生やさない**（条件 spread）＝vel 無し hit の出力オブジェクト形状が現行と同一＝deepStrictEqual 級で bit 一致。
- 再生/MIDI は既に `n.vel ?? 100`（`music.ts:1139` scheduleTimes・`:1034` tracksToMidi）＝**下流変更ゼロ**で効く。
- **値の語彙**：普通=vel 省略（→100）／強く=`112`（+12＝backbeat スケール）／弱く=`64`（コンピングの逃げ音）。定数 `CHORD_ACCENT=112 / CHORD_SOFT=64` を music.ts へ（耳較正で調整可・保存済みデータは実値なので後から定数を変えても既存は不変）。
- **UI**：`ChordPatternEditor.tsx` の onset セル（`startAt(s)`:54）に `useLongPress` を張り、CellPopover（チップ＝強く/弱く/消す）。sustain セル・空セルは対象外。消す＝`applyCellTap` の頭タップと同じ削除経路。セル濃淡はドラムと同じ `--hv`（vel ?? 100）。タップ（配置/伸び/削除・:60-65）は完全不変。
- section_inst も同経路（`notesForContent`:618-620 が chord_pattern と同扱い）＝管弦の stab アクセントも同時に効く。genSectionInst が vel を書く生成側対応は backlog（§7-2 の任意項）。

#### 8-3d. P2 の契約とテスト

- divs 無し⇒`rhythmToNotes` bit 一致／div2・div3 の start/dur/vel（0.85 減衰・round3）／12格子×div の複合／不正 div 値=単発。
- `sectionDrums`・`parseDrums` に divs 付き content を食わせて出力不変（アンカー退化の回帰）。
- ChordHit.vel 無し⇒`resolveChordPattern` 出力 deepStrictEqual（キー形状込み）／vel 有り⇒strum 全声部＋オンベース＋arp に伝播。
- `useLongPress`＝発火閾値・移動キャンセル・click 抑制（jsdom タイマーテスト）。

### 8-4. スライス計画（TDD・出荷順 P1→P0→P2）

| # | スライス | 触点 | bit一致テスト（先に赤） |
|---|---|---|---|
| P1-1 | core `applyFeelByPart`＋salt | `packages/music-core/src/index.ts`（+test） | feel無し=同一参照／hum=0=applyFeel単呼び一致／決定性／部位差の観測 |
| P1-2 | web `humanizePartOf`/`applyFeelEnsemble`＋配線4点 | `music.ts`（新関数・:933・:1019）/`audio.ts:1099,:1243` | feel無し：playNotes入力・MIDIバイト回帰スナップショット一致 |
| P1-3 | sectionFeel 優先＋tree feel fallback | `SectionEditor.tsx:396-398`／`music.ts:1274,1306` | section feel無し=feelOfTree と一致（bit）／有り=上書き |
| P1-4 | NoriRow＋TinkerSheet「共通」引き出し＋writeSelf 保存 | `NoriRow.tsx`（新）/`TinkerSheet.tsx`/`SectionEditor.tsx` | 4段写像0/0.15/0.25/0.35／両0でfeelキー削除／保存merge回帰 |
| P1-5 | （任意）rhythm 単体ネタに NoriRow | `RhythmEditor.tsx`＋`useNetaEditor` | content.feel 無し=従来再生（:191 経由・配線ゼロ確認） |
| P0-1 | `rhythmToNotes`＝velCurve＋beatsPerStep（snapBps） | `music.ts:277-288` | 16格子/6-8・velCurve無しの新旧 deepEqual（golden一式）／12格子=1/3スナップ |
| P0-2 | `laneWithHitToggled` 整列ガード＋RhythmEditor置換 | `music.ts`（新関数）/`RhythmEditor.tsx:35-50` | velCurve同index挿抜／正規化／velCurve無しレーン=hits のみ変化 |
| P0-3 | セル濃淡（--hv）＋12格子グリッド導出 | `RhythmEditor.tsx:12-19,92-104`＋css | `velState`/グリッド導出の純関数テスト・beatsPerStep無し=従来表示 |
| P0-4 | 長押しv1（強く/弱く）＝useLongPress＋CellPopover＋`laneWithHitVel` | 新hook/新コンポ/`music.ts` | ghost28/accent base+18／3状態トグル／velCurve生成と削除正規化 |
| P2-1 | divs 展開＋toggle掃除 | `music.ts`（rhythmToNotes・laneWithHitToggled） | divs無し=bit／div2/3展開値／旧consumer退化回帰 |
| P2-2 | ドラムチップ5個化＋分割セル描画 | `RhythmEditor.tsx`＋css | 2連/3連トグル＝divs書込/削除 |
| P2-3 | `ChordHit.vel`＋resolve素通し | `music.ts:424,511-553` | vel無し=deepStrictEqual（形状込み）／伝播3点 |
| P2-4 | コード楽器の長押し（チップ3個） | `ChordPatternEditor.tsx` | onsetのみ対象／タップ操作(:60-65)不変／消す=削除経路 |

各スライス独立に main へ出荷可。P0-1 は単独でも耳インパクト最大（§5）。全フェーズ完了後の残＝[耳/手] 実機試聴（人間味4段の効き・12格子シャッフル・フィルクレッシェンド・コードアクセント）＋backlog（ストラム時間展開・トレモロチップ・stab生成側vel・seed🎲・per-section feel）。

### 8-5. design.md へ貼る #29 ブロック（コピー用・design.md は本タスクでは触らない）

```markdown
## #29 表現力/ヒューマナイズの統一（ドラム・コード・ベース）（2026-07-18・スコープ確定→設計・正典＝docs/research/2026-07-18-drum-expressiveness-scope.md §8）

**背景**：humanize エンジン（部位別プロファイル・1/f・知覚較正済＝music-core:127-271）は完成済みだが、再生が `FeelCtx.part` を渡さず**全部位 default で休眠**。生成が書く per-hit ベロシティ `velCurve` と 12格子 `beatsPerStep` を web 再生（rhythmToNotes）が**捨てて/無視して**おり、フィルのクレッシェンドが平坦・シャッフル型が誤再生。編集UIは on/off しか無い。→「新機能」でなく**作ってある表現の回収＋露出**を3フェーズで。

**決定（3フェーズ・全部 additive＝未指定 bit一致）**：
- **P1 ノリ行（全楽器共通・追加費用ほぼゼロ）**：`applyFeelByPart`（music-core 新設＝part グループ毎に applyFeel＋部位別 seed salt・hum=0 は単呼び=bit）を再生2点（audio.ts）と MIDI 2点（notesToMidi/tracksToMidi・**tempo も渡す＝再生と同一の ms 経路へ是正**）に配線。MixPart→HumanizePart 写像（chord→chords/counter→melody・drums はレーン midi で kick/snare/hihat）。UI＝TinkerSheet に**「共通」引き出しを新設**（ハブ契約の発動）：跳ねスライダー＋人間味 seg **OFF/弱0.15/中0.25/強0.35**（強でもヨレ警告帯 40ms 未満）。保存＝**section content.feel**（楽器非依存・sectionFeel は section 自身を子より優先・両0でキー削除）。ドラム/コード/ベースの較正済みプロファイルが同時に起きる。
- **P0 表現の回収（ドラムのみ・事実上バグ修正）**：`rhythmToNotes` が `velCurve[i] ?? drumVel` と `beatsPerStep`（1/3 は有理数スナップ）を読む。toggle の hits/velCurve **index 整列ガード**（純関数 laneWithHitToggled）。セル濃淡（--hv）＋長押し3値（普通/強く=base+18/弱く=28＝フィル辞書 V.ghost と同語彙・**既存 velCurve に書く＝新フィールド無し**）。16分のみ・velCurve 無しは bit 一致。
- **P2 長押しポップオーバー（共通部品・チップ差し替え）**：ドラム＝強く/弱く/**2連/3連**/消す。分割は `RhythmLane.divs?: Record<step,2|3>`（マップ形＝配列並走の轍を踏まない）＝rhythmToNotes で n 分割展開（2打目以降×0.85）。**旧 consumer（parseDrums/sectionDrums/MCP drumsSchema）はアンカー1打に退化＝velCurve と同じ加算のみ流儀**。コード＝強く(112)/弱く(64)/消す＋`ChordHit.vel?`（1hit1値・全声部同値）＋resolveChordPattern 条件 spread 素通し（下流は `vel ?? 100` 済＝変更ゼロ）。コードの分割は arp 軸へ委譲＝持ち込まない。
- **作らない**（確定）：per-hit タイミングナッジ／ベロシティレーン・連続値UI／32分全体格子／フラム／per-lane humanize。backlog：ストラム時間展開・トレモロチップ・stab 生成側 vel・seed 🎲・per-section feel。

**契約**：feel 無し or 全0＝再生/MIDI byte 一致。swing のみ＝現行一致（part 分割無関係）。humanize>0 のみ意図的変化（部位別起床・決定性は同 seed で担保）。velCurve/beatsPerStep/divs/vel 未指定＝各変換 bit 一致（`vel: undefined` キーも生やさない）。WP-D1 の「velCurve は旧 consumer 無視」条項は**「web 再生が正準として読む」へ昇格**。
```

## §9 P2 操作層の改定＝長押しドラッグ＋モード（2026-07-18・オーナーGO・§8-3 の UI を差し替え）

P2 の**編集ロジック（純関数・保存）は §8-3 のまま不変**。**操作層のみ**をチップ・ポップオーバーから「長押しドラッグ＋モード」へ改定（オーナー承認・モック `scratchpad/drum-gesture-mock.html` で実動確認）。design.md #29 の P2 段落と「作らない：連続値UI」条項を本節に合わせて改定済み。

**文法**：
- **✎鉛筆（既定）**：タップ＝置く/消す（`laneWithHitToggled`・不変）。打点を**長押し 450ms→持ち上がり（scale1.35＋白枠＋kind色ハロー＋vibrate15）→押したまま 縦＝強さ・横＝連打**、離して確定（`onChange`1回＝undo1粒）、pointercancel＝元通り。空セル長押しは無反応。
- **⌫消しゴム**：タップ＋なぞり一掃（`elementFromPoint` 追跡・erase 中のみ `touch-action:none`）。存在価値＝通常はスクロールに食われる横スワイプ消し。UI＝`.proll-modes`（KindEditorBody/SectionEditor と同型）を `rhythm-toolbar` に。
- **選択モードは出さない**（複製/ナッジ等の動詞が未実装＝死に道具・将来の小節コピー時に追加）。ドラッグ編集は鉛筆内（モード切替を挟むと1打ごとに2タップ増）。

**軸マップ**：縦＝強さ（**連続値**・0.6vel/px・上限127／**磁石デテント** ghost28/base(=drumVel)/min(127,base+18)・吸着±6・通過時プレビュー音＝フリックで従来3語彙が1動作・スナップ時は既存 `laneWithHitVel` で正準値＋`normVelCurve`）。横＝連打（1→2→3・**44px/段の離散**・現在値からの相対）。**非対称閾値**で縦調整中の指ブレ（±20px）では連打が誤発火しない。
**スクロール衝突**：静止450msが先→ネイティブスクロール未開始→発火時 `setPointerCapture`＋**non-passive `touchmove` の captured 中のみ `preventDefault`**（React合成イベントは passive 指定不可＝ref で addEventListener）。発火前8px超はスクロールへ。
**コード楽器**：同ジェスチャの**縦のみ**（横無効＝分割は arp）。デテント CHORD_SOFT64/100/CHORD_ACCENT112・普通確定で vel キー削除（bit）。タップ文法（頭=消す/伸び=長さ/空き=置く）不変・モード行なし（頭タップが消す動詞）。
**発見性**：持ち上げ＋指上 HUD（弱く/普通/強く＋数値＋n連バッジ＋デテント目盛メータ）＋グリッド下ヒント行（既存イディオム）「タップ=置く/消す・長押し→上下=強さ・左右=連打」。チュートリアル機構は作らない。

**移行ノート（Opus向け・純関数層は無傷）**：
1. `useLongPress.ts`→**`useHoldDrag.ts`**（450ms/8px/click抑制/contextmenu継承・状態機械 idle→pending→captured・発火時 setPointerCapture・`onDrag({dvel,div})`/`onCommit`/`onCancel`・**急所＝non-passive touchmove を captured 中のみ preventDefault**）。
2. `music.ts`：**追加のみ** `laneWithHitVelNum(lane,step,vel:number)`（rebuildLane/normVelCurve 再利用の約6行）＋コード用 `chordHitsWithVel(hits,step,vel|undefined)`。デテント時は既存 `laneWithHitVel`/定数。既存関数不変。
3. `RhythmEditor.tsx`：pop state/pick() 撤去→`dragState{li,step,vel,div}` のローカルプレビュー（--hv/divクラス上書き）＋離した時に一括 onChange。`rhythm-toolbar` に ✎/⌫（`.proll-modes` 再利用・`eraseMode` useState は SectionEditor 同型）。なぞり消し＝erase 中 `elementFromPoint` 追跡。ヒント行追加。
4. `ChordPatternEditor.tsx`：pop/pickChord 撤去→同 hook 縦のみ。タップ文法不変。
5. `CellPopover.tsx`：**削除**（両エディタ移行後）＋`chat.css` の `.cell-pop*` 削除、`.rhythm-cell.lift`/`.drag-hud`/erase時 `touch-action` 追加。
6. テスト：useHoldDrag（発火/移動解除/commit/cancel）・laneWithHitVelNum（正規化・base で velCurve 削除）・確定 onChange1回・erase 掃除（velCurve/divs 同時）。**既存 bit一致テストは全て生きたまま通る**。
パラメータ：LONG_MS=450・TOL=8px・0.6vel/px・DIV_PX=44・SNAP=±6（モックに実値埋込）。

