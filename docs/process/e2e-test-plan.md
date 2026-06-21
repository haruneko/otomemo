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
| U3 | モバイルCRUD・ダイアログ全画面(#60/#66) | 🟡 crud/responsive | mobileで編集ダイアログ全画面・背景不透過を1本 |
| U4 | 検索：キーワード一致 / 該当なし(空) | ❌ | `search.spec`：作成語で一致1件、無関係語で「該当なし」 |
| U5 | melody編集：ロール音追加→保存→再取得で永続 | 🟡 crud(保存まで) | 保存後 reload で notes 永続を assert |
| U6 | chord編集：行追加/編集/削除→保存永続 | ❌ | `chord.spec`：行追加→保存→API確認 |
| U7 | rhythm編集：ステップon/off→保存永続 | ❌ | `rhythm.spec`：hit切替→保存→API確認 |
| U8 | section組立：ピッカー/ D&D配置→永続、反復配置(#54)、ブロック削除 | ✅ section-dnd/remove | 反復配置（同ネタ2箇所）を1本追加 |
| U9 | **section保存**：key/tempo/meter をUIで変更→保存→API永続 | ❌(手動確認済) | `section-save.spec` 恒久化 |
| U10 | 再生：melody/chord/rhythm/section が鳴る・engine=sf2(フォールバック検知) | ✅ audio-paths | — |
| U11 | 音高正しさ：melody入力一致・chord三和音 | ✅ audio-paths | — |
| U12 | ドラムGMキット：kick/snare/hihat(close/open)/crash/tom が正しい楽器・1発(loop無)・ | 🟡 audio-paths(36/38/42) | **hihat close(42)/open(46) 区別**＋loop:false＋crash/tom を1本（U-bugも兼）|
| U13 | SF2自己修復：古いid→最新へ | ✅ audio-paths | — |
| U14 | SF2 program音色：ネタのprogram→対応GM楽器ロード | 🟡(diag確認) | program違いで楽器名が変わるログをassert |
| U15 | SF2 設定UI：アップロード/選択/「音源をテスト」→✓読込OK | ❌ | `soundfont.spec`：既存assetで test ボタン→OK表示（uploadはmock/小SF2は重いので選択/テストのみ）|
| U16 | 停止：編集トランスポート ▶/⏸/⏹・カード ▶⇄⏹ | 🟡(手動確認) | カード再生→⏹→▶ 恒久化、編集の play/pause/rewind |
| U17 | プレイヘッド：再生中に赤線が動く（--ph/--phb 変化） | ❌ | `playhead.spec`：再生で `--ph` が0→増加 |
| U18 | MIDI書き出し：ボタンで .mid ダウンロード発火 | ❌ | `midi.spec`：download イベント発火＋サイズ>0 |
| U19 | レスポンシブ：3画面でレイアウト破綻なし | ✅ responsive | — |

→ 追加するE2E：`search` `chord` `rhythm` `section-save` `soundfont` `playhead` `midi` ＋ `audio-paths` に hihat/crash/tom と repeat-placement/program を増補。**U12でハットclose/openバグも修正**。

## 2. Playwright ログ・成果物の残し方（設計）

### 2.1 config（`playwright.config.ts`）
- `reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]` … 失敗時に HTML で振り返る。
- `use.trace: "retain-on-failure"` / `use.screenshot: "only-on-failure"` / `use.video: "retain-on-failure"` … 失敗テストの trace/screenshot/video を `test-results/<test>/` に残す。
- 既存の `webServer.reuseExistingServer` は維持（走行中devを再利用）。

### 2.2 共通 fixture（`e2e/fixtures.ts`）
`test` を `extend` し、**全テストで**：
- `page.on("console")`/`page.on("pageerror")` を購読し `{type,text}` を蓄積。
- `addInitScript` で `localStorage.cm.debugAudio="1"`（`[CMAUDIO]` 診断を常時収集）。
- **teardown で常に** `testInfo.attach("console.log", { body, contentType:"text/plain" })`、失敗時は `[CMAUDIO]` 抽出も別添付 → HTMLレポート/`test-results` に残る。
- `pageerror` か `console.error` が出たら、その一覧を assertion メッセージに使えるよう公開（`logs()`）。

### 2.3 共通ヘルパ（`e2e/helpers.ts`）
DRY 化：`createNeta(request,data)→{id,title}` / `openNeta(page,title)` / `play(page)` / `audioLogs(logs)`（[CMAUDIO]抽出）/ `cleanup(request,ids)`。各 spec はこれを使い接頭辞 `ZZE2E-`。

### 2.4 失敗時に残るもの
`playwright-report/index.html`（trace viewer 付き）＋ `test-results/<test>/`（trace.zip / screenshot / video / console.log 添付）。ローカルでもCIでも同じ手掛かり。

## 3. 実行
`pnpm --filter @cm/web exec playwright test --workers=1`（dev/api/cm-search 稼働前提）。SF2依存テストは asset 未登録なら `test.skip`。

## 4. 受け入れ（このフローの最終形）
design-Acceptor（本書）→ 実装 → 実行（全緑＋成果物確認）→ impl-Acceptor。
