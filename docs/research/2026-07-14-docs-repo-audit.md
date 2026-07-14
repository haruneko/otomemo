# docs/リポジトリ体裁監査（2026-07-14）

> 状態＝**監査所見＋安全修正の実施記録**。今日1日で research doc 40本追加＋実装WP21本＋UI再設計を15体以上の並行エージェントが実施した直後の総点検。
> **並行制約**：別エージェントがトップ画面実装中＝`design.md`・`apps/web/src/App.tsx`系・web CSS は**読み取り専用**として扱った（本監査では一切編集していない）。

## 0. サマリ（重大度順）
| # | 対象 | 所見 | 重大度 | 処置 |
|---|------|------|--------|------|
| 1 | design.md L18–22 | 見出し＋段落「アーキテクチャ是正方針（2026-06-23…）」が**逐語2回**（rebase「両変更残し」痕） | 中 | 読取専用＝**パッチ案のみ**（下記§1） |
| 2 | design.md L1223 | 研究doc本数「**全29本**」が陳腐化（実数 118本） | 低 | 読取専用＝**パッチ案のみ** |
| 3 | research/README.md | corpus-db-diagnosis が**同一グループに二重の索引行** | 中 | **✅修正済**（重複行削除） |
| 4 | research/README.md | 索引に無いdoc2本（motif-preservation-arch-DESIGN／wpx3-newlane-design-options） | 中 | **✅修正済**（索引追加） |
| 5 | backlog.md L251 | R0§6遷移統計テーブルを「未着手」と記載だが note_transition/骨格n-gram/M9は本日 WP-0 で実装済 | 中 | **✅修正済**（部分DONEへ是正） |
| 6 | stash 2件 | 内容は HEAD（＋本監査の README 修正）に反映済＝陳腐 | 情報 | drop はしない（指示どおり確認のみ） |
| 7 | 上位doc（req/arch/CLAUDE） | 今日の変化と**矛盾なし**（新kind/ループ/コーパスはHOW階層） | 情報 | 更新不要 |

**セクション番号の衝突は無い**（懸念された #21/#22/#13b の取り合いは発生していない・§3参照）。

## 1. design.md（読取専用・パッチ案のみ・適用はトップ実装完了後）

### 1-1. 逐語重複ブロック（L18–22）＝要削除
```
18: ## アーキテクチャ是正方針（2026-06-23・4監査→ユーザー確定）
19: 長い縦スライス自走で「動く」を優先した結果、上位スペックとコードが乖離した（…）。
20:
21: ## アーキテクチャ是正方針（2026-06-23・4監査→ユーザー確定）   ← 重複
22: 長い縦スライス自走で「動く」を優先した結果、…（19行と完全一致）    ← 重複
```
- 見出し＋段落が**バイト等価で2回**。直前 L8 の「棚卸し（2026-06-30）」節末尾から続く位置＝並行WPの rebase 衝突を「両残し」した痕と推測。
- **パッチ案**：L21–22（2つ目の重複ペア）を削除。以降の `### 決定1` 以下は1つだけで正しい。
- 機械検証：design.md 全体で len>40 の逐語重複行はこの1件のみ（他に散らばった重複本文は無い）。

### 1-2. 研究doc本数の陳腐化（L1223）
- 現行：「到達点サマリ＋**全29本**のグループ別目次」。実数＝`docs/research/*.{md,html}`（README除く）**118本**。
- **パッチ案**：「全29本」→「全118本」または「全120本弱」。頻繁に増えるので固定数を避け「グループ別目次」だけにするのも可。
- 注：README.md L96 の「全31本の出口」は research-to-implementation-plan の**引用文**（そのdoc執筆時点の枠）であり索引カウント主張ではない＝**そのままでよい**。

### 1-3. 番号衝突の有無（診断）
- 見出しアンカー全数：`#12`(ノート生成)/`#12-M`(メロ高度化)/`#13`(モーラ)/`#13b`(プロソディWP-M5)/`#14`(スキーマ)/`#15`〜`#20`(骨格)/`#21`(WP-0 コーパス遷移統計)/`#22`(WP-M8 旋律類似警告)＝**各1回で衝突なし**。
- WPタグ：`WP-X2/X3/X3a/X3b/X3c/WP-0/WP-M1..M8/WP-C1..C4/WP-D1/D2/WP-E1/WP-B1` 等、いずれも節と1対1。**取り合い・二重定義なし**。
- 相互矛盾も未検出（#21 は自身「WP-0 対象は note_transition のみ、phrase_pattern/chord_transition は別WP」と明示＝backlog と整合するよう本監査で backlog 側を是正した）。

## 2. research/README.md（並行対象外＝安全に修正・実施済）
- **重複索引行の削除**：`2026-07-14-corpus-db-diagnosis` が「自己点検・整合・研究計画」グループ内に**2行**（L94 詳細版＋L103 簡略版）＝別エージェントが同一docを二重登録。**詳細版(L94)を残し簡略版を削除**。
- **欠落docの追加（2本）**：
  - `2026-07-10-motif-preservation-arch-DESIGN.md`（案B動機保存レンダ設計spec）→ 親 motivic-repeated-note-melody の直後に追加。
  - `2026-07-14-wpx3-newlane-design-options.md`（WP-X3新レーン設計相談）→「形式・アレンジ」グループ先頭に追加（stash@{1} が抱えていた未コミット行と同一内容）。
- **検証**：修正後、索引リンク⇄実ファイルは **欠落0・切れリンク0・二重索引行0**（機械突合済）。
- 他の「重複」8件は誤検出＝**到達点サマリの本文引用**＋索引エントリ、または別docエントリ内の**相互参照**であり正当（例 drum-transcription-journey は自エントリ＋drum-pattern-extraction からの cross-ref）。

## 3. backlog.md（並行対象外＝安全に修正・実施済）
- **全体所見**：取り消し線＋✅＋日付「最終更新」で丁寧に維持されており陳腐化は少ない。今日の追加（WP-D2残り／コーパス根治の残 R0／cm-search運用強化／デザインE2E監査送り分／耳確認未消化）は**記載済**。
- **是正1件（L251）**：「R0§6遷移統計テーブル化＝未着手」は本日 **WP-0(#21・commit cf06399)** で **(B)note_transition＝骨格n-gram＋M9変換文法** の器（`corpus_note_transition`/`corpus_skeleton_prior`/`corpus_motif_transform`＋読出純関数 `corpusStats.ts`）が実装済＝**部分DONE**へ是正。残は **(A)phrase_pattern・(C/D)chord_transition**（raw句/進行の再構築前提で別WP＝design #21 と整合）。
- 実装完了WPの多く（WP-X3新レーン/WP-M8類似警告/WP-M3レンズ等）は backlog 非掲載だが**正しい**＝backlog は「保留・いつかやる」置き場でありTask機能で追う運用（CLAUDE.md）。漏れではない。

## 4. 上位doc鮮度（req/architecture/CLAUDE＝所見のみ）
- **architecture.md**：鮮度良好。2プロセス構成（api:8787＋cm-search:8788）・cm-worker撤去済・systemd導入済＝実態と一致。今日の変化との**矛盾なし**（新kind/ループ/コーパスはこの階層より下のHOW詳細）。**更新不要**。
- **requirements.md**：WHAT（純日本語コンセプト）。新kind3種（counter/riff/section_inst）・ゲームBGMループ（WP-X2）は**HOW階層の増分で要件と矛盾しない**（ゲームは L81 で射程内ジャンルとして既に明記）。強いて言えば「ループ書き（頭↔尻の継ぎ目）」は新しいユーザー体験だが、要件は体験原則レベルで既に「判断→再投擲のループ」を語っており衝突しない。**更新は必須でない**（入れるなら低優先）。
- **CLAUDE.md**：スペック所在・単一ブランチ・SDD/TDD・research格納ルール＝今日の運用と一致。**更新不要**。
- 唯一の上位系の陳腐化は design.md L1223 の本数（§1-2・読取専用）。

## 5. リポジトリ衛生
- **git status**：変更3ファイル（`apps/web/src/App.tsx`・`NetaList.tsx`・`styles/assets-bass.css`）＝**並行トップ画面エージェントのWIP**。本監査では**触れていない**（コミットからも除外）。
- **未追跡ファイル**：`git status --untracked=all` で**0件**。リポジトリ直下・docs/ に迷子ファイル無し。
- **命名規約**：`docs/research/` は全て `YYYY-MM-DD-*.md|html` か旧語形 `[a-z0-9-]+.md`＝乱れ無し。
- **stash（2件・drop しない＝確認のみ）**：
  - `stash@{0}`「other-agents-wip」＝WP-M3候補レンズ添付＋ベース低域窓較正。**HEADに全反映済**（`melodyLensesReport.ts` 存在・`attachMelodyLenses` import 済・`bassPcToWindow`/`BASS_LO` が generate.ts に12箇所）＝**陳腐・破棄可**。
  - `stash@{1}`「WIP on main ea12347」＝music-core の `melodyLenses` re-export（HEAD反映済）＋README の wpx3行（未反映だった→**本監査の README 修正で同内容を追加済**）＝これで**両ハンク相当が反映済＝陳腐・破棄可**。
  - ※ 指示どおり drop はしていない。オーナー判断で両stashは安全に破棄できる状態。
- **.gitignore**：妥当。`dist/`・`data/`（＝`data/corpus-stats/*.json` も内包）・`*.sqlite*`・各種 venv/生成物を網羅。過不足なし。
- **巨大ファイル誤コミット**：無し。最大の追跡ファイルは design.md(500K・spec本体で妥当)／pnpm-lock 192K／uv.lock 192K／`_dogfood_ui/*.png` 最大136K（スクショ）。誤混入バイナリ無し。

## 6. 実施した安全修正（このコミットに含む）
1. README.md：重複索引行削除（corpus-db-diagnosis）
2. README.md：欠落索引2行追加（motif-preservation-arch-DESIGN／wpx3-newlane-design-options）
3. backlog.md：L251 を部分DONEへ是正（WP-0 で note_transition 器実装済）
4. 本監査doc の新規作成＋README索引への登録

**未実施（要オーナー/トップ実装完了後）**：design.md の§1-1重複削除・§1-2本数是正（読取専用のためパッチ案のみ）。stash 2件の drop。
