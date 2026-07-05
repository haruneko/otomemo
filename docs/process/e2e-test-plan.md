# E2E テスト計画（全般テスト）

ユーザー指示：「全般的にテストを実施。**ユースケース列挙 → Acceptor承認 → テスト実装/実行 → Acceptor承認**。Playwright のログ保存方法も設計する。」

この文書は **design-Acceptor のレビュー対象**（①ユースケース網羅 ②ログ設計 が妥当か）。承認後に実装する。

---

## 0. 方針
- 既存ユニット（web 85 / api 42 / worker 32）は契約・純関数を守る層。**ここでは実機(実ブラウザ)横断のユースケースE2E**を厚くする。
- **データ独立**（#75）：各テストは自前でネタを作り、finally で消す。ユニーク接頭辞 `ZZE2E-` でDB状態に依存しない。
- **AI/worker依存（Chat生成・ジョブ）は対象外**（claude実行=非決定的・遅い）。APIレベルの形だけ別途。
- 実音の良し悪し・音色はAIには判定不能 → **「正しい音高/楽器/経路を選び、フォールバックしない」**ことをログで検証（耳の最終確認は人間）。

## 1. ユースケース網羅マトリクス
凡例：✅=既存E2Eで担保 / 🟡=部分 / ❌=穴（今回追加）

| # | ユースケース | 状態 | 追加テスト |
|---|---|---|---|
| U1 | ネタ捕獲CRUD（lyric/melody 作成→編集→削除→検索） | ✅ crud.spec | — |
| U2 | 削除契約（空body DELETE 200, #63） | ✅ crud.spec | — |
| U3 | モバイルCRUD・ダイアログ全画面(#60/#66) | ✅ crud/responsive | **既存specに背景不透過assert 1行追加**（新規1本は過剰=格下げ） |
| U4 | 検索：キーワード一致 / 該当なし(空) | ❌ | `search.spec`：作成語で一致1件、無関係語で「該当なし」 |
| U5 | melody編集：ロール音追加→保存→再取得で永続 | 🟡 crud(保存まで) | 保存後 reload で notes 永続を assert |
| U6 | chord編集：行追加/編集/削除→保存永続 | ❌ | `chord.spec`：行追加→保存→API確認 |
| U7 | rhythm編集：ステップon/off→保存永続 | ❌ | `rhythm.spec`：hit切替→保存→API確認 |
| U8 | section組立：ピッカー/ D&D配置→永続、反復配置(#54)、ブロック削除 | ✅ section-dnd/remove | 反復配置（同ネタ2箇所）を1本追加 |
| U9 | **section保存**：key/tempo/meter をUIで変更→保存→API永続 | ❌(手動確認済) | `section-save.spec` 恒久化 |
| U10 | 再生：melody/chord/rhythm が鳴る・engine=sf2(フォールバック検知) | ✅ audio-paths | — |
| U10b | **section合成再生**（`compositeNotes`＝子を調へ移調＋位置オフセット）が鳴る | ❌ | `section-play`：合成カード▶で notes>0・engine=sf2 |
| U11 | 音高正しさ：melody入力一致・chord三和音 | ✅ audio-paths | — |
| U12 | ドラムGMキット：kick/snare/hihat(close/open)/crash/tom が正しい楽器・1発(loop無)・ | 🟡 audio-paths(36/38/42) | **hihat close(42)/open(46) 区別**＋loop:false＋crash/tom を1本（U-bugも兼）|
| U13 | SF2自己修復：古いid→最新へ | ✅ audio-paths | — |
| U14 | SF2 program音色：ネタのprogram→対応GM楽器ロード | 🟡(diag確認) | program違いで楽器名が変わるログをassert |
| U15 | SF2 設定UI：アップロード/選択/「音源をテスト」→✓読込OK | ❌ | `soundfont.spec`：既存assetで test ボタン→OK表示（uploadはmock/小SF2は重いので選択/テストのみ）|
| U16 | 停止：編集トランスポート ▶/⏸/⏹・カード ▶⇄⏹・**Spaceで再生/停止** | 🟡(手動確認) | カード▶⇄⏹恒久化、編集 play/pause/rewind、Space経路を1 assert |
| U20 | 絞り込み：**mood-filter**／**kind-filter（検索中はdisabled連動）** | ❌ | `search.spec`相乗り：mood保存→絞る、検索入力でkind-filter disabled |
| U21 | ~~StepPad（パッド入力）~~ 撤去(2026-07-04) → 消しゴムモード（メロ: 消すでノートtap削除・Section: 消しゴムでブロック外す） | ❌(任意) | roll の [消す] モードと Section [⌫] を1本 |
| U17 | プレイヘッド：再生中に赤線が動く（--ph/--phb 変化） | ❌ | `playhead.spec`：再生で `--ph` が0→増加 |
| U18 | MIDI書き出し：ボタンで .mid ダウンロード発火 | ❌ | `midi.spec`：download イベント発火＋サイズ>0 |
| U19 | レスポンシブ：3画面でレイアウト破綻なし | ✅ responsive | — |

→ 追加するE2E：`search`(+mood/kind-filter U20) `chord` `rhythm` `section-save` `section-play`(U10b) `soundfont` `playhead` `midi` ＋ `audio-paths` に hihat/crash/tom と repeat-placement/program を増補。**U12でハットclose/openバグ(#79)も修正**。

### 意図的に対象外（穴ではない）
- **オフライン捕獲/outbox**（`navigator.onLine`制御が要りflaky）／**テーマ設定**（見た目のみ）／**Chat生成・ジョブ受け取り**（AI=claude実行で非決定・遅い。APIの形は別途unit）／**song(再帰)**（section と同経路＝U8/U9/U10bで代表）／**knowledge/text編集**（lyricと同 text-editor＝U1で代表）。
- **意味(semantic)検索の合否**：cm-search依存で非決定 → E2Eでは検証しない。検索E2E(U4)は**キーワード一致経路のみ**に倒す（下記S-U4）。

### 待ち方針（flaky回避）
`networkidle` に依存せず **role/label の locator 待ち**を優先（`initSoundFont`の自己修復fetchやジョブ15sポーリングでidleに落ちにくい瞬間がある）。SF2ロード等のやむを得ない待ちは明示。

## 2. Playwright ログ・成果物の残し方（設計）

### 2.1 config（`playwright.config.ts`）
- `reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]` … 失敗時に HTML で振り返る。
- `use.trace: "retain-on-failure"` / `use.screenshot: "only-on-failure"` / `use.video: "retain-on-failure"` … 失敗テストの trace/screenshot/video を `test-results/<test>/` に残す。
- 既存の `webServer.reuseExistingServer` は維持（走行中devを再利用）。

### 2.2 共通 fixture（`e2e/fixtures.ts`）
`test` を `extend` し、**全テストで**：
- `page.on("console")`/`page.on("pageerror")` を購読し `{type,text}` を蓄積。
- `addInitScript` で `localStorage.cm.debugAudio="1"`（`[CMAUDIO]` 診断を常時収集）。
- **teardown（`await use(...)` の後）を `try/finally` で囲み、finally で常に** `testInfo.attach("console.log", { body: lines.join("\n"), contentType:"text/plain" })`（**body は string化必須**＝配列を join）、失敗時は `[CMAUDIO]` 抽出も別添付 → HTMLレポート/`test-results` に残る。
- `pageerror` か `console.error` が出たら、その一覧を assertion メッセージに使えるよう公開（`logs()`）。

### 2.3 共通ヘルパ（`e2e/helpers.ts`）
DRY 化：`createNeta(request,data)→{id,title}` / `openNeta(page,title)` / `play(page)` / `audioLogs(logs)`（[CMAUDIO]抽出）/ `cleanup(request,ids)`。各 spec はこれを使い接頭辞 `ZZE2E-`。

### 2.4 失敗時に残るもの
`playwright-report/index.html`（trace viewer 付き）＋ `test-results/<test>/`（trace.zip / screenshot / video / console.log 添付）。ローカルでもCIでも同じ手掛かり。

## 3. 実行
`pnpm --filter @cm/web exec playwright test --workers=1`（dev/api/cm-search 稼働前提）。SF2依存テストは asset 未登録なら `test.skip`。

## 4. 受け入れ（このフローの最終形）
design-Acceptor（本書）→ 実装 → 実行（全緑＋成果物確認）→ impl-Acceptor。

---

## 5. テストシナリオ（各specの具体手順）
記法：**前提**=API等で用意 / **操作**=UI / **検証**=assert。全ネタは接頭辞 `ZZE2E-`、各シナリオ finally で削除。fixture が console/[CMAUDIO] を自動収集。

### S-U4 `search.spec.ts`（検索：一致／該当なし・mood/kind-filter）— cm-search非依存
- 前提：`POST /neta` で title=`ZZE2E-<stamp>` の lyric を1件（`<stamp>`=Date.now、絶対に他とぶつからない語）。
- 操作：検索ボックスに `ZZE2E-<stamp>` 入力。
- 検証：**自分のカードが見える**＋**「一致」バッジ(matchType=exact)**（`toHaveCount(1)` には頼らない＝semantic混入耐性）。次に `ZZNOHIT-<stamp>`（絶対ヒットしない語）→**「該当なし」表示**。意味検索の合否は検証しない（keyword経路＝`http.ts` catchで cm-search 停止時も返る）。
- **U20相乗り**：(a) mood付きネタを作成→`mood-filter` で絞り自分が残る。(b) 検索ボックスに文字入力→`kind-filter` が `disabled` になる（検索中は種別フィルタ無効の連動を回帰防止）。

### S-U5 `melody-persist`（audio/crud増補：ロール編集の永続）
- 前提：melody ネタを `POST`（notes空）。
- 操作：カード→編集→ピアノロールでセル数個クリック→保存。
- 検証：`GET /neta/:id` で `content.notes.length>0`。再度開いて note 要素が残っている。

### S-U6 `chord.spec.ts`（コード編集の永続）
- 前提：`chord_progression` ネタを `POST`（chords空 or 1行）。
- 操作：編集→「行追加」→root/quality/start/dur を NumberField/セレクトで設定→保存。
- 検証：`GET /neta/:id` の `content.chords` に設定値が入る（root,quality,start,dur）。空入力で0が挿入されない(#71)ことも1ケース。

### S-U7 `rhythm.spec.ts`（リズム編集の永続）
- 前提：`rhythm` ネタを `POST`（lanes 既定）。
- 操作：編集→ステップgrid のセルをトグル（kick step0,4）→保存。
- 検証：`GET /neta/:id` の `content.rhythm.lanes[].hits` が変化。

### S-U8 repeat-placement（section-dnd増補：同ネタ反復配置 #54）
- 前提：section と melody を `POST`。
- 操作：melody を 1小節目と3小節目の2セルへ配置（ピッカー）。
- 検証：`GET /neta/:id/composition` の children で**同じ child が position 違いで2件**。

### S-U9 `section-save.spec.ts`（key/tempo/meter 保存往復）
- 前提：section を `POST`（key0/tempo120/meter4/4）。
- 操作：編集→tempo=96・meter=6/8・key=5→保存。
- 検証：`GET /neta/:id` が `{key:5,tempo:96,meter:"6/8"}`。

### S-U12 audio-paths増補（ドラムGMキット：hihat/crash/tom・loop無）— #79 兼
- 前提：rhythm を `POST`（kick36, snare38, **closed-hat42**, **open-hat46**, crash49, tom45）。
- 操作：再生（debugAudio=1）。
- 検証：[CMAUDIO] の `drum N -> 楽器名` で 42=closed系・46=open系が**別楽器/別noteで鳴る**（#79 修正後）、49=Crash Cymbal、loop なし（コードは `loop:false` 固定）。発火は各 hit 1回。engine=sf2。

### S-U14 program音色（audio-paths増補）
- 前提：melody を program:40(Violin) と program:0(Piano) で2件 `POST`。
- 操作：各再生。
- 検証：[CMAUDIO] `melodic instrument <- Violin...(program 40)` と `...(program 0)` で**楽器名が異なる**。

### S-U15 `soundfont.spec.ts`（設定UI：選択→テスト）
- 前提：`GET /assets?kind=soundfont` で1件以上（無ければ skip）。
- 操作：設定→SoundFont→一覧から選択→「音源をテスト」。
- 検証：`✓ 読込OK（N楽器）` 表示（N>0）。`✗` でない。
- 注：アップロードは 30MB級で重く非決定 → 既存assetの**選択/テストのみ**（uploadは api unit でカバー済）。

### S-U16 card-stop / transport / Space（停止・キー操作）
- カード：melody カードの `play-<id>` を click→ラベル `⏹`→再 click→`▶`（再生/停止トグル）。
- 編集：play-pause で `playing`→pause、rewind で `stopped`（TransportBar 状態）。
- **Space**：編集を開き本文等の入力外にフォーカス→Space押下で再生開始（`play-pause`と同経路、`NetaDialog.tsx`のSpaceハンドラ）。入力欄フォーカス時はSpaceで再生しない（横取りしない）ことも1 assert。

### S-U10b `section-play.spec.ts`（section合成再生）
- 前提：section（key=2等）＋melody子を `POST`＋`/compose`配置。
- 操作：一覧の section カード `play-<id>`（合成プレビュー）click（debugAudio=1）。
- 検証：[CMAUDIO] `playNotes ... notes= N(>0)`・engine=sf2。子が section調へ移調されている（compositeNotes経路を通る＝notes>0で代表）。停止トグルも確認。

### S-U17 `playhead.spec.ts`（プレイヘッド前進）— 測定対象を明記
- 前提：section＋melody子を `POST`＋配置（**section editor の `.playhead` が `--ph`(0..1, fit-to-width) を使う**＝測りやすい。PianoRoll/Rhythm は content-px の `--phb` を使うので避ける）。
- 操作：section 編集→再生。
- 検証：`page.evaluate` で `el.style.getPropertyValue("--ph")`（inline直書きを直読み。computedはCSS変数継承で不確実）を **数百ms間隔で2回**読み、**0→増加（単調）**。rewind/停止で更新が止まる。

### S-U18 `midi.spec.ts`（MIDI書き出し）
- 前提：melody を `POST`。
- 操作：編集→「MIDI」ボタン click。
- 検証：Playwright `page.waitForEvent("download")` が発火、`suggestedFilename` が `.mid`、保存ファイル size>0。

### S-U3 mobile-dialog（responsive増補）
- viewport 390×844。操作：ネタ編集を開く。
- 検証：編集ダイアログが画面幅いっぱい・背景不透過（#60/#66 の回帰防止）。

> 各シナリオの**失敗時**：fixture が console全文＋[CMAUDIO]を `testInfo.attach`、config が trace/screenshot/video を残す → `playwright-report` で原因追跡。
