# メモリ整理計画（2026-07-18）

> 開発セッションのメモリ（`~/.claude/projects/-home-shuraba-p-projects-creative-manager/memory/`）40本＋索引 MEMORY.md の整理計画。
> **計画のみ・本ドキュメント作成時点でメモリ本体には一切手を触れていない。**
> 先行監査＝`docs/research/2026-07-18-memory-bias-audit.md`。
> 前提の更新＝メモリ名前空間は cwd 絶対パスから機械的に導出され親ディレクトリへ歩き上がらない（実機確定）。
> 創作セッションは cwd を repo 外にすれば構造的に遮断できる。**よって本整理は「創作に漏れるか」でなく
> 「開発セッションにとっての価値」だけで判定した**。先行監査の DEV-ONLY 28 はそのまま削除理由にしていない。

註：実測はメモリ本体 **40本＋索引 MEMORY.md**（監査の「41ファイル」は索引込みの数えと解釈）。

---

## 0. 裏取りで確定した事実（判定の根拠）

すべて 2026-07-18 に実コード・git・docs で確認した。

| # | 事実 | 根拠 |
|---|---|---|
| F1 | リモートは `git@github.com:haruneko/otomemo.git`。`sketch-it` ではない | `git remote -v` |
| F2 | **未pushコミット 0**（`origin/main..main` 空） | `git log origin/main..main` |
| F3 | コード進行エディタ#26 は**コミット済**（83e001f）。その後 #27 再生一本化(edb0214)・#28 曲編集縦セットリスト(ab3681f)・#29 ドラム表現力(752cb65他) も完了 | `git log` |
| F4 | worker の `jobs.py`/`claude_prompt` は**完全消滅**。`apps/worker/src/cm_worker/` は db.py/search.py/serve.py＝cm-search のみ | `ls`＋`grep -rn claude_prompt apps/worker/src/`＝0件 |
| F5 | `core.ts` は現在 **537行**（「神ファイル」ではない） | `wc -l apps/api/src/core.ts` |
| F6 | `_audio_poc` は **`apps/audio` へ移動済**（2026-07-17・Option A実施済） | `ls apps/`＋`docs/research/2026-07-17-python-sidecar-layout.md` 冒頭の実施済注記 |
| F7 | compose-quality-track の救出対象実測値は**docs/research に格納済**：強拍CT 90.8%・骨格粒度1.91拍・自己相関 lag8=31.7%/lag16=34.5%・overshoot 77% | `docs/research/melody-corpus-findings.md` L20,36,39,50,52 |
| F8 | ジャーニー記録も格納済：`melody-design-journey.md`（仮説28+対処）・`melody-model-summary.md`・`skeleton-melody-musicology.md`・`consistency-review.md` すべて実在 | `ls docs/research/` |
| F9 | **FMD は退役済**。`eval-models-learned.md` が「FMD⊥耳＝制御メロに不向き・退役」「MuPT perplexity 研究クローズ」まで記録済＝メモリ側の「FMD識別力◎・brush-up検証に使える」は**失効** | `docs/research/eval-models-learned.md` §1・★★訂正 |
| F10 | コーパス再取得コマンド（POP909 curl 等）は research doc にもある | `2026-07-14-corpus-rebuild-verification.md` L55-56 |
| F11 | コーパス根治の残（遷移統計テーブル等）は backlog.md に記載済・一部は WP-0(#21・cf06399)で器実装済 | `docs/backlog.md` L255- |
| F12 | 耳確認未消化の類は **backlog.md が既に集約**（L16,48,51,298 他）＋research のチェックリスト2本（`2026-07-14-ear-hand-checklist-wp-batch.md`・`2026-07-13-ear-hand-check-scenario.md`） | `grep 耳確認 docs/backlog.md` |
| F13 | 実音I/O原則・フィール層契約は design.md に反映済（L296他「実音」・L1540「フィール層分離」） | `grep` design.md |
| F14 | `restart` スキルが存在（`.claude/skills/restart`）＝再起動手順の一部はスキル化済 | `ls .claude/skills/` |
| F15 | MEMORY.md 索引自体に失効あり：L13(autonomous-run「残=構造分割#6/#7」)・L17(chat-persistent「web未切替で休眠」) は本体ファイルの記述（S3a/S3b/⑤完了・コミット済）とすら矛盾 | MEMORY.md vs 各ファイル |

---

## 1. 判定サマリ

| 判定 | 本数 | 内訳 |
|---|---|---|
| KEEP（現状維持） | 12 | feedback 8・project 2・reference 2 |
| REWRITE（書き直し/追記） | 13 | 失効訂正・推測削除・スリム化 |
| MERGE → `project-melody-track-summary.md`（新規1本） | 7 | メロ系handoff 6＋corpus 1 |
| DELETE（消化済・重複・救出済） | 8 | |
| NEW（救出先として新設） | 2 | melody-track-summary＋verify-audits |
| **結果** | **40 → 27本** | 索引 43行/9.2KB → 約30行/約3KB |

---

## 2. 全ファイル判定表

### 2-1. feedback（作業様式）14本

| ファイル | 判定 | 理由・根拠 |
|---|---|---|
| feedback-delegate-to-cheaper-models | **REWRITE(追記)** | 中身は現役・引用付き。research-fanout の並行委譲運用学び3点（個別ファイルstaging・SendMessage再開・「見送りは明記」）をここへ吸収 |
| feedback-dont-stop-without-blocker | **KEEP** | 引用付き・開発で現役。創作漏れの動機は消えたので中和不要 |
| feedback-e2e-cost | **KEEP** | 引用付き・CLAUDE.md に無い運用知 |
| feedback-eval-existing-weights-not-llm | **REWRITE** | 方針部（LLM判定大反対・E-rule+E-corpus）は堅い。**後半のFMDフィジビリ節が失効**（F9＝FMD退役・MuPTクローズ）。方針＋`eval-models-learned.md` への正準ポインタに縮める（3.5KB→1KB台） |
| feedback-explain-while-working | **KEEP**（微修正任意） | 「もうちょい」引用あり。Why の「設計を細かく詰めたい人」は user ファイルの推測文を参照＝user 側を直すなら合わせて一語調整（オーナー判断⑥） |
| feedback-label-melody-layer | **KEEP** | 引用付き（「骨格なのか表面なのか分からねえ」）・現役 |
| feedback-loanwords-over-coined-japanese | **KEEP** | 監査KEEP・引用付き（「ルー大柴しといて」） |
| feedback-priority-melody-first | **REWRITE** | 引用は本物。監査§3-1どおり**スコープ注記を1行追加**：「これは開発工数の配分の話。会話で相手の力量を推測する根拠にしない」 |
| feedback-sample-variety | **KEEP** | 引用付き（「毎回同じコード進行やめて」）・現役 |
| feedback-separate-what-from-how | **REWRITE** | 本体は求められた進め方＝残す。**引用なしの推測2文を削除**：「このユーザーは設計を細部まで詰めるので、雑な要約や先走りはすぐ指摘される」（監査§3-1/§3-3の指摘どおり過去アシスタントの推測） |
| feedback-single-branch-main | **DELETE** | **CLAUDE.md「ブランチ運用」節と完全重複**（同じ日付・同じ理由まで）。開発セッションには CLAUDE.md が常に入る＝二重注入。オーナー判断①に載せる |
| feedback-stateless-reports | **KEEP** | 引用付き（2026-06-22）・現役 |
| feedback-surface-remaining-tasks | **DELETE** | **CLAUDE.md「進め方」節（節目ごとに残タスク・勝手に終わり宣言しない）と重複**。Task機能への言及も CLAUDE.md にある。オーナー判断①に載せる |
| feedback-wire-mode-through-generation | **KEEP** | 恒久教訓（テスト緑≠結線保証・品質変更後は耳）。正準docポインタ持ち |

### 2-2. user 1本

| ファイル | 判定 | 理由・根拠 |
|---|---|---|
| user-shurabap-composer | **REWRITE** | 事実部（修羅場P・ABILITY・ジャンル横断・mp3のみ残存・困りごと=時間と集中力）は残す。**引用なしの人物断定2文を削除**：「設計・要件を細部まで詰めるタイプ。発散/収束のフレームを好む」（監査§3-1＝唯一引用なし。本人が言っていない人物像は消す） |

### 2-3. reference 3本

| ファイル | 判定 | 理由・根拠 |
|---|---|---|
| reference-phone-access-network | **KEEP** | 2日前・実測ベース・障害対応で即物的に効く |
| reference-playwright-live-ui-check | **KEEP** | 手順知・現役 |
| reference-run-stack-and-e2e | **REWRITE(追記)** | 現役の一次資料。ui-audit の罠2行（pkill -f 自己マッチ exit144・サンドボックスapi起動は apps/api から）を吸収＋「再起動は restart スキルあり（F14）」を1行追記 |

### 2-4. project 22本

| ファイル | 判定 | 理由・根拠 |
|---|---|---|
| project-arch-pivot-mcp-chat (11.8KB) | **DELETE** | 転換は完遂し**正準は repo docs に反映済**（本人が「docs是正済＝architecture.md/design #100/#101」と記載）。ラッパー/10 verbs は稼働中の現実＝コードが語る。ポインタ1行を creative-manager 書き直しに含める |
| project-autonomous-run-handoff | **DELETE** | 全面失効：リモート名(F1)・「コミット未実施」(F2)・#7 jobs.py分割(F4=対象消滅)・#6 core.ts分割(F5=537行)。**恒久教訓「監査所見は実コードで検証してから」だけ新規 `feedback-verify-audits-in-code.md` へ救出** |
| project-chat-persistent-status (7.7KB) | **DELETE** | 全消化：S1-S3b/⑤コミット済(a63c904/961b426)・claude_prompt も完全消滅(F4)＝backlog #74 まで実質済。索引L17の「web未切替で休眠」は本体とすら矛盾(F15) |
| project-chat-usecases-next | **REWRITE** | 現役だが失効2点を訂正：「①は `_audio_poc/` 依存」→ `apps/audio`（F6）。定義時履歴メモ節は刈る。正準=design.md v2.1節＋usecases-chat.md |
| project-chord-editor-timeline | **REWRITE** | 「未コミット（頼まれ次第）」が**失効**（F3=83e001f でコミット・push済）。設計の芯は design.md #26 が正準＝状態行の訂正＋スリム化。耳/手ゲート（backlog L315）は残す |
| project-compose-quality-track (27.7KB) | **DELETE** | 粒度違反の最大ファイル。**救出要件は充足済を確認**（F7実測値・F8ジャーニー）。エンジン記述は V2一本化（backlog: J3/J4 で genMotifMelody ③④撤去済）で全面置換＝現状と乖離。「残=Dエンジン質」は melody-theory-plan/next-dev-plan が具体化済。オーナー評引用（「弱い」「微妙」）の扱いはオーナー判断② |
| project-corpus-handoff | **MERGE→melody-track-summary** | 根治済(2026-07-14)・残は backlog.md 記載済(F11)・再取得コマンドも research にあり(F10)。統合サマリに「コーパス根治済・正準=2026-07-14-corpus-db-diagnosis/rebuild-verification」の2行で足りる |
| project-creative-manager (12.7KB) | **REWRITE** | 粒度違反2位。**コンセプト確定段落＋母艦環境＋現アーキポインタの十数行に縮める**。2026-06月の実装クロニクル（テスト数の変遷・3巡監査…）は git log と design.md で再現可能＝破棄（オーナー判断④） |
| project-creative-session-isolation | **REWRITE（最優先）** | 監査残タスク#2そのもの。追記事項：(1)「`--setting-sources user` は**メモリを止めない**。2026-07-18 メモリ経由で品評事故が再発」(2)**新事実＝メモリ名前空間は cwd 絶対パス由来・歩き上がりなし＝創作の cwd を repo 外にすれば開発メモリ40本は構造的に届かない**(3)start.sh の cwd 変更が必要になる旨。これを書かないと3回目で CLAUDE.md を疑う所から始まる |
| project-design-philosophy-options-not-finished | **KEEP** | 監査KEEP。プロジェクトの背骨思想 |
| project-feel-layer-refactor | **MERGE→melody-track-summary** | Stage1-4完了・契約（notes常時ストレート格子SSOT+content.feel）は design.md L1540 に反映済(F13)。サマリに契約1行＋正準ポインタ |
| project-kariuta-track (6.6KB) | **REWRITE** | 現役トラックだが積層日誌化。旧WP発注案・消化済の中間状態を刈り、現在の表面（sing_neta・子音カウントイン・SING_LEAD_REST_SEC 調整口・声選択 5d7e3f4/d9407db・**#27 再生一本化 edb0214 が仮歌を全再生へ構造的に載せた**）＋正準docポインタに |
| project-melody-eval-ceiling | **KEEP** | 恒久の戦略的結論（死に筋の再発明防止）。1事実1ファイルの模範 |
| project-melody-phrasing-stage12 | **MERGE→melody-track-summary** | 完了済・正準=research 2026-07-10-melody-phrasing…＋design。耳較正残は backlog 集約(F12) |
| project-melody-theory-plan | **MERGE→melody-track-summary** | Step1-5＋第2-4弾完了済・正準=research 2026-07-09 系3本 |
| project-next-dev-plan-p0 | **REWRITE** | 戦略の芯（P2自作コーパス=キーストーン・P0/P1完了）は現役。**OPEN項の一部失効**：「ベロシティ編集=OPEN・UI皆無」は #29(752cb65/f315b7b=生成velocityを鳴らす+長押し強弱)で部分消化。正準=research 2026-07-07-next-dev-plan.md へ寄せてスリム化 |
| project-research-fanout-2026-07-14 | **DELETE** | 成果は research 31本＋README索引に格納済（このメモの主張どおり）。**運用学び3点だけ feedback-delegate-to-cheaper-models へ救出**してから削除 |
| project-skeleton-desk-s6-handoff (8.3KB) | **MERGE→melody-track-summary** | D0-D6全DONE・正準=design #20 S6＋2026-07-12-skeleton-desk-handoff.md。残=耳のみ(F12) |
| project-skeleton-layer-redesign (8.5KB) | **MERGE→melody-track-summary** | S1-S4/#10-#17完了・正準=design #20＋backlog（消し込み済マーク付きで詳細維持を確認済） |
| project-song-form-branch-model (10KB) | **REWRITE** | モデル（分家・CoWガード・vary汎化）は現役の設計資産＝残す。失効訂正：「push未=IPv4不通」(F2=push済)・S1ビジュアル節は #28 縦セットリスト化(ab3681f)が上書き。実装ログを刈り、モデル＋安全弁＋正準(2026-07-16-song-form-assembly.md/design「#曲フォーム」)へ |
| project-track-wiring-series | **MERGE→melody-track-summary** | 完了済・正準=research 2026-07-10 系4本＋design結線契約 |
| project-ui-audit-2026-07-15 | **DELETE** | 修正9群反映・検収合格・正準=research 2本。残耳確認はチェックリスト側(F12)。**罠メモ2行だけ reference-run-stack-and-e2e へ救出**してから削除 |

### 2-5. 新設 2本

| ファイル | 中身 |
|---|---|
| **project-melody-track-summary.md**（統合先） | メロ系6アーク＋コーパスの「完了サマリ＋恒久契約＋正準ポインタ集」1本。含める芯：<br>① 結線シリーズ(2026-07-10)→フレージングStage1-2(07-11)→フィール層(07-11)→骨格層一級化S1-S5(07-11〜12)→骨格の机S6(07-12)→理論総点検Step1-5(07-09) の完了アーク年表（各1-2行＋正準doc名）<br>② **恒久契約**：既定0/未指定=bit一致鉄則／notes常時ストレート格子SSOT+content.feel／骨格=ブレークポイント方式・一級neta・realized_from／genMelodyはV2完全一本化／web dist焼き必須<br>③ コーパス根治済(2026-07-14)＋正準2本＋再取得はrebuild-verification参照<br>④ 残＝耳確認は **backlog.md とチェックリスト2本が正準**（メモリに複製しない） |
| **feedback-verify-audits-in-code.md**（救出先） | 1事実：「サブエージェント監査・他者の指摘は**系統的に過大評価**＝実コードで検証してから着手する」。出典＝autonomous-run(2026-06-23の4例)＋2026-07-08再検証（計画doc top痛点が陳腐化）＋research `2026-07-18-why-unread-code-worked.md`（検証責任の再配置）と接続 |

---

## 3. MEMORY.md 書き換え後の全文案

そのまま貼れる形。43行/9.2KB → 31行/約3KB。索引の役目は「どのファイルを開くか決める」ことだけに絞り、**状態・数値・残タスクを索引に書かない**（それが今回の失効の温床＝F15）。

```markdown
# Memory Index

## ユーザーと思想
- [ユーザー: 修羅場P](user-shurabap-composer.md) — 作曲家、DAW=ABILITY(楽譜入力)、ジャンル横断
- [思想: 候補まで機械・仕上げは人間](project-design-philosophy-options-not-finished.md) — 完成品は追わない。Sunoは別パラダイム
- [評価: LLM判定は大反対](feedback-eval-existing-weights-not-llm.md) — E-rule+E-corpusの純TS二本立て
- [メロ評価の天井](project-melody-eval-ceiling.md) — 理論スコアはガードレール止まり。伸ばすなら量と操作性か本人の好み

## 進め方
- [WHATとHOWを分ける](feedback-separate-what-from-how.md) — 要件で先走らない、純日本語、発散→収束
- [問題が無ければ止めない](feedback-dont-stop-without-blocker.md) — 「続けて」はstanding指示
- [報告はステートレスに](feedback-stateless-reports.md) — 毎回文脈を再掲し自己完結で
- [作業しながら解説を厚めに](feedback-explain-while-working.md) — 仕組み/理由を噛み砕く
- [難しい判断=Fable、他=Opus以下](feedback-delegate-to-cheaper-models.md) — 線引きは難易度。並行委譲の運用学び込み
- [監査・指摘は実コードで裏取り](feedback-verify-audits-in-code.md) — 他者所見は過大評価が常態
- [フルe2eを毎回回さない](feedback-e2e-cost.md) — ユニット＋ピンポイントで
- [カタカナ英語で](feedback-loanwords-over-coined-japanese.md) — 造語日本語は通じない
- [メロ作業は層を明記](feedback-label-melody-layer.md) — 【骨格】/【表面】タグを冒頭に
- [サンプルはバリエーション](feedback-sample-variety.md) — 複数seed・進行違い・長短
- [優先度: メロ最優先](feedback-priority-melody-first.md) — 開発工数配分の話(スコープ注記あり)
- [結線は実機フローで確認](feedback-wire-mode-through-generation.md) — テスト緑≠結線保証・品質変更後は耳

## プロジェクト現在地
- [Otomemo本体](project-creative-manager.md) — コンセプト・母艦環境・アーキ正準ポインタ
- [メロ系到達点サマリ](project-melody-track-summary.md) — 骨格/フレージング/フィール/机/コーパスの完了アークと恒久契約
- [次期計画の芯](project-next-dev-plan-p0.md) — P2自作コーパス=キーストーン
- [Chatユースケース](project-chat-usecases-next.md) — アナリーゼ読み筋v2.1・4UC実装済
- [仮歌トラック](project-kariuta-track.md) — sing_neta・子音カウントイン・調整口
- [曲フォーム=分家モデル](project-song-form-branch-model.md) — 参照既定+浅いfork+CoWガード
- [コード進行エディタ#26](project-chord-editor-timeline.md) — 折返しブロック化済・後続は耳/手ゲート
- [創作セッションの隔離](project-creative-session-isolation.md) — メモリはcwd名前空間・repo外cwdで構造遮断

## 運用リファレンス
- [スタック起動とe2e](reference-run-stack-and-e2e.md) — バインド/プロセス罠/dist焼き/restartスキル
- [Playwrightで実機UI実測](reference-playwright-live-ui-check.md) — モバイル幅ドライブの手順
- [スマホから繋がらない時](reference-phone-access-network.md) — Tailscale/LANバインドの診断
```

---

## 4. 実行順序（依存あり・この順で）

1. **REWRITE: project-creative-session-isolation**（最優先＝安全性。監査残タスク#2。事故3回目の予防線）
2. **新設2本を先に作る**（削除前に救出を完了させる）
   - `project-melody-track-summary.md` ← merge対象7本から芯を転記（§2-5の構成）
   - `feedback-verify-audits-in-code.md` ← autonomous-run から教訓を転記
3. **救出付きREWRITE**（削除対象から吸収する2本）
   - `feedback-delegate-to-cheaper-models` ← research-fanout の運用学び3点
   - `reference-run-stack-and-e2e` ← ui-audit の罠2行＋restartスキル1行
4. **残りのREWRITE**（順不同）：user / separate-what-from-how / priority-melody-first / eval-existing-weights / creative-manager / chat-usecases-next / chord-editor-timeline / kariuta-track / next-dev-plan-p0 / song-form-branch-model
5. **DELETE 15本**（2〜3の転記完了を確認してから）：single-branch・surface-remaining・arch-pivot・autonomous-run・chat-persistent・compose-quality・research-fanout・ui-audit＋merge済7本（corpus・feel-layer・melody-phrasing・melody-theory・skeleton-desk・skeleton-layer・track-wiring）
6. **MEMORY.md を最後に全面書き換え**（§3の全文案。最終ファイル集合と一致させる）
7. （関連・本計画のスコープ外）`.claude/creative/start.sh` の cwd を repo 外へ変更する開発タスクを起票（メモリ遮断を実効化する側の作業）

---

## 5. オーナー判断（勝手に決めない項目）

1. **CLAUDE.md 重複2本の削除可否**：`feedback-single-branch-main`・`feedback-surface-remaining-tasks` は CLAUDE.md と完全重複＝削除推奨。ただし「CLAUDE.md を将来スリム化する時にメモリ側を残したい」なら KEEP に倒す。
2. **compose-quality-track 内のオーナー評引用の破棄**（「モチーフ再利用…けど弱い」「微妙・音楽度は上がった」等）：機械生成デモ（削除済）への評価であり実測値・ジャーニーは docs/research に救出済(F7/F8)。`melody-design-journey.md`（仮説28+対処）が経緯の大半を持つはずだが、**引用の逐語まで残っているかは未照合**。逐語を残したいなら削除前に journey doc へ追記してから消す。
3. **耳確認リストの消し込み**：backlog.md＋チェックリスト2本に積まれた耳/手項目のうち、実際にもう聴いたものがどれかは本人にしか分からない。メモリ側は「backlog が正準」で統一する（本計画）が、backlog 側の消し込みはオーナー作業。
4. **project-creative-manager の6月履歴**：破棄推奨（git log・design.md で再現可）。アーカイブとして docs/research に移す価値があると思うなら移送先を新設（推奨はしない＝価値薄）。
5. **メロ7本の統合粒度**：統合1本を推奨（全員が正準docポインタ持ちで情報損失なし）。「アークごとの系列として個別に残したい」なら MERGE をやめ各ファイルの状態行だけ訂正する縮退案もある（索引は長いまま）。
6. **explain-while-working の推測参照**：user ファイルから「細部まで詰めるタイプ」を消すと、これを参照する Why が浮く。「もうちょい」引用ベースに一語直すか、放置か（実害は小さい）。

---

## 6. 効果見積り

- 毎セッション無条件注入の索引：**43行/9.2KB → 31行/約3KB**（状態・数値・残タスクを索引から追放＝失効の温床も除去）
- メモリ本体：**40本/約173KB → 27本/約60-70KB**（27.7KB・12.7KB・11.8KB の粒度違反3本を全て解消）
- 失効記述の訂正：リポジトリ名・push状態・コミット状態・`_audio_poc`・FMD・worker残骸・「web未切替」の7系統
- 引用なし人物像の削除：2ファイル3文（user・separate-what-from-how）＋スコープ注記1件（priority-melody-first）
