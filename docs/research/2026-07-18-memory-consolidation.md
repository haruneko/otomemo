# メモリ統合計画（2026-07-18・立て直し版）

> 対象＝開発セッションのメモリ `~/.claude/projects/-home-shuraba-p-projects-creative-manager/memory/`（40ファイル＋索引 MEMORY.md）。
> **本ドキュメントは計画のみ。メモリ本体には一切手を触れていない。**
> 先行資料＝`2026-07-18-memory-bias-audit.md`（事故の経緯）・`2026-07-18-memory-cleanup-plan.md`（先行計画。個別ファイルの裏取り＝F1〜F15はそのまま利用し、2026-07-18に再確認済み）。

---

> **実行済み（2026-07-18）。** 本計画どおり 40本→**21本**、索引 43行8.6KB→**21項目2.0KB**。新設2本
> （`project-tracks-map` / `feedback-verify-audits-in-code`）・書き換え8本・削除19本・リンク切れ6件補修。
> 27.7KB日誌のオーナー評語の逐語は推奨どおり退避せず破棄。実行前バックアップ＝
> `scratchpad/memory-backup-20260718.tar.gz`（セッションscratchpad・恒久保存ではない）。

## 結論（まずこれだけ）

- **40本 → 23本**にする（残す12・書き直す9・新しく2本＝「トラック地図」と「監査は裏取りしてから」）。毎回セッション冒頭に丸ごと入る索引は **43行/9KB → 26行/約3KB**。
- **消える情報は実質ない。** 消す28本（削除8＋統合11＋書き直しで削る部分）は、すべて中身がリポジトリ側（design.md・backlog.md・docs/research・git log）に既にあることを1本ずつ確認済み。リポジトリに無い断片（失敗の教訓・作業の勘所など約10行分）は、**消す前に**残るメモリ2本＋新設2本へ移す。
- 唯一の例外＝過去の試作デモへのオーナー自身の評語の逐語（「けど弱い」「微妙」等）。**これは退避せず捨てることを推奨**する（理由は仕分け表の当該行）。判断の中身（何が弱くて何を直したか）は `docs/research/melody-design-journey.md` に全部残っている。

---

## 1. そもそもメモリに何が要るか

判断の物差しは一つ：**「リポジトリを読めば分かることか、否か」**。

このプロジェクトは、コンセプト→アーキテクチャ→要件→設計→タスク→テスト→コードの順に、上位ほど権威あるドキュメントが揃っている（CLAUDE.mdの正準順序）。さらに進捗はgit logとTask機能、保留はbacklog.md、調査結果はdocs/research/（README索引付き）に必ず残す規約がある。つまり**「何を作ったか・今どこか・次に何をやるか」は全部リポジトリが記録している**。メモリに同じことを書くと劣化コピーになり、更新されずに古びて嘘をつく——今回の40本の過半がまさにこれで、実際に「未コミット」「push未」「web未切替」など、既に嘘になった行が複数見つかった（先行計画の裏取りF2/F3/F15）。

逆に、**リポジトリからは再導出できないもの**だけがメモリの仕事になる。上位レイヤーから見て、それは次の4種類：

| 分類 | 中身 | 例 |
|---|---|---|
| **A. オーナーと仕事の流儀** | 会話の中で言われた進め方・叱られたこと。ドキュメントには書かれない | 「報告は毎回自己完結で」「造語日本語やめてカタカナで」「サンプルは毎回バリエーションを」 |
| **B. 思想と戦略の背骨** | 口頭で確定した方針・却下の理由。「なぜやらないか」はコードに残らない | 「機械は候補まで・仕上げは人間」「LLMに良し悪しを判定させるのは大反対」 |
| **C. 失敗の教訓** | 「こうやると失敗する」という死に筋。同じ穴に二度落ちないための知恵 | 「理論スコアを最適化ターゲットにすると悪化する（試して確認済み）」「テストが緑でも層をまたぐ結線は実機でしか壊れが見えない」 |
| **D. 機械と環境の即物メモ** | このマシン固有の運用知。リポジトリのdocsに書くには生々しすぎるもの | サーバーの起こし方の罠・スマホから繋がらない時の診断・Playwright実測の手順 |

そして**「E. 進捗ステータス」はメモリに置かない**。置き場はリポジトリに既にある：残タスク＝Task機能とbacklog.md、設計の現在形＝design.md、経緯＝git logとdocs/research/README.md。メモリ側には「どこを読めば分かるか」のポインタ集（新設の「トラック地図」1本）だけを残す。

この線引きは安全面でも効く。7/18の品評事故の燃料になったのは、まさにE型の「残＝耳確認」の山とプロジェクト評語だった（bias-audit §3）。なお創作セッション自体は既にリポジトリ外（`~/projects/otomemo-studio/`）へ移して構造的に遮断済みなので、本整理は「開発セッションの記憶の質」を上げるための掃除である。

---

## 2. 仕分け表（40本すべて）

各行＝「そのメモリが実際に言っていること」→判定→理由。**消す場合は再導出できる先を具体的に示し、失われる情報の有無を明記**する。

> **オーナー指示による3件の変更（2026-07-18・実行済み）＝下の表より優先する**
> - **#4 造語日本語→カタカナ英語**：ルールを一般化。「造語を避けて**一般的に通じる語**を使う。英語でも日本語でもよく、
>   どちらが一般的かで選ぶ」＝カタカナ化そのものは目的でない。`feedback-plain-words-not-coined` に改名して書き換え済み。
> - **#11 スマホから繋がらない時の診断**：**削除済み**（オーナー「特殊事例だから」）。→ 残す12本は11本に。
> - **#15 メロ最優先**：スコープ注記を足す案だったが、**ファイルごと削除済み**（オーナー「バイアスすぎるからメモリに残すのは
>   一回やめましょう」）。引用は本物だが、開発工数の配分の話が会話で人物評に化ける経路そのものを断つ判断。
>   → 変える9本は8本に。他メモリからの `[[feedback-priority-melody-first]]` 参照7件も除去済み。
>
> 差引き **40本 → 21本**（本計画の23本から2本減）。

### 2-1. 残す（12本）— 会話にしか存在しない流儀・思想・教訓・環境知

| # | 中身（一行） | ファイル | 理由 |
|---|---|---|---|
| 1 | フルのブラウザテストは重いので毎回回さず、ユニット＋該当1本だけにする | feedback-e2e-cost | 本人明言のコスト方針。リポジトリのどこにも書いていない |
| 2 | 問題が無ければ「続けますか？」で止まらない。「続けて」は継続指示 | feedback-dont-stop-without-blocker | 本人明言＋再指摘の記録。会話にしか無い |
| 3 | 報告は毎回文脈を再掲して自己完結にする（家事と並行で記憶が揮発するため） | feedback-stateless-reports | 同上 |
| 4 | 造語日本語（修正波・吹く等）でなくカタカナ英語で書く | feedback-loanwords-over-coined-japanese | 本人明言「ルー大柴しといて」。会話にしか無い |
| 5 | メロ作業は毎回「骨格を触るのか表面を触るのか」を冒頭に明記する | feedback-label-melody-layer | 本人の苦情（「どっちか分からねえ」）から来た作法 |
| 6 | 試聴サンプルは指定が無ければ複数seed・進行違い・長短調を混ぜて出す | feedback-sample-variety | 本人明言「毎回同じコード進行やめて。ルール化して」 |
| 7 | テストが緑でも生成→配置→再生の結線は実機でしか壊れが見えない。品質変更後は必ず耳確認 | feedback-wire-mode-through-generation | 実地で踏んだ教訓（C型）。事故詳細のdocはあるが「今後の構え」はメモリの仕事 |
| 8 | 機械は候補・選択肢を出すまで、仕上げは人間。Sunoは画像生成的で別パラダイム＝競合しない | project-design-philosophy-options-not-finished | プロジェクトの背骨思想（B型）。requirements.mdのコンセプトより一段具体で、口頭確定 |
| 9 | 理論スコアはメロの質を測れない＝ガードレール止まり。評価器を最適化目標に繋ぐのは試して確認済みの死に筋 | project-melody-eval-ceiling | 「やらないこと」とその理由（C型）。蒸し返し防止に直接効く |
| 10 | 創作相談は開発リポジトリの外（otomemo-studio）でやる。メモリはフラグでは止まらず、repo外cwdだけが遮断手段 | project-creative-session-isolation | 事故2回の再発防止の要。2026-07-18に実測結果込みで更新済み＝このまま |
| 11 | スマホから繋がらない時の診断（Tailscaleは Windows側・LANバインドの逃げ道） | reference-phone-access-network | このマシン固有の環境知（D型）。実測ベースで現役 |
| 12 | 稼働中アプリをPlaywrightでモバイル幅実測する手順（chrome実体パス・CJS importの罠） | reference-playwright-live-ui-check | 手順知（D型）。現役 |

### 2-2. 変える（9本）— 芯は残し、失効・推測・重複を削る

| # | 中身（一行） | ファイル | 何をどう変えるか |
|---|---|---|---|
| 13 | オーナーは作曲家「修羅場P」。DAWはABILITY・ジャンル横断・過去作はほぼmp3のみ | user-shurabap-composer | **推測2文を削除**：「設計・要件を細部まで詰めるタイプ。発散/収束のフレームを好む」。他のメモリは全部本人発言の引用付きだが、この2文だけ引用が無い＝過去のアシスタントの人物推測（bias-audit §3-1）。事実部分（名義・DAW・mp3のみ残存・困りごと＝時間と集中力）は残す |
| 14 | 要件出しではWHAT（何が欲しいか）とHOW（どう作るか）を混ぜない。純日本語で書く | feedback-separate-what-from-how | 本体は本人が求めた進め方＝残す。**末尾の推測1文を削除**：「このユーザーは設計を細部まで詰めるので、雑な要約や先走りはすぐ指摘される」（引用なしの推測。同上） |
| 15 | AI支援の優先度はメロディ最優先（本人明言「僕が苦手なのは比較的メロディに寄ってる」） | feedback-priority-melody-first | 引用は本物＝残す。**スコープ注記を1行追加**：「※これは開発工数の配分の話。会話で相手の力量を推測したり作品を評する根拠にしない（2026-07-18バイアス監査）」 |
| 16 | メロの自動評価にLLM判定は「大変反対」。理論規則＋自前学習重みの2本立て（純TS）でやる | feedback-eval-existing-weights-not-llm | 方針部（B型・本人の強い明言）は残す。**後半のFMD実験の節を削除**＝FMDは退役済・perplexity研究もクローズ（`docs/research/eval-models-learned.md` が正準・裏取りF9）。代わりに同docへのポインタ1行 |
| 17 | 作業しながらの解説を厚めに。簡潔な完了報告だけでは薄い（本人評「もうちょい」） | feedback-explain-while-working | 残す。**Why欄の「設計を細かく詰めたい人」という推測参照を、引用ベースの表現（「理解が作業ペースに追いつくのが大事・『もうちょい』＝適度に厚く」）に一語修正**（#13の推測文削除と整合） |
| 18 | 難しい判断・大量コードの抽象化＝Fable、それ以外＝Opus以下。Fableにもコードは自前で読ませる | feedback-delegate-to-cheaper-models | 現役・引用付き＝残す。**削除する3本から運用の学びを吸収**（§3-2に追記案）：①並行実装のstaging作法 ②実装者と別の独立監査役を立てると実際にブロッカーが見つかる ③歌詞の創作判断はFable指定（本人指示2026-07-15） |
| 19 | スタックの起動・停止・e2eの回し方と、プロセスまわりの罠（子nodeがポート握る等） | reference-run-stack-and-e2e | 現役の一次資料＝残す。**削除するUI総点検メモから罠2行を吸収**（pkill -f の自己マッチexit 144・サンドボックスapiはapps/apiから起動）＋**「再起動はrestartスキルあり」を1行追記**（.claude/skills/restart 実在確認済み） |
| 20 | 次の開発戦略＝生成器を増やすより足場。P2「自作曲の資産化→個人コーパス」が要石 | project-next-dev-plan-p0 | 戦略の芯（B型）は現役＝残す。**進捗記述を全部落として5行程度に**：芯＋正準ポインタ（`docs/research/2026-07-07-next-dev-plan.md`）＋**注意1行「計画doc冒頭の痛点リストは実装済で古い（2026-07-08実コード検証）。現況はTask/backlogが正準」**。ベロシティ編集OPEN等の個別項目は#29実装で一部消化済（git 752cb65/f315b7b）＝残タスク列挙はしない |
| 21 | このプロジェクトが何か＝常時起動機で作る作曲支援ツール、という入口 | project-creative-manager | 12.7KBの2026年6月実装クロニクル（テスト数の変遷・監査3巡…）は**全部git logとdesign.mdで再現可能＝破棄**。**約6行に書き直す**：一言コンセプト（正準=requirements.md）＋アーキ一言（正準=architecture.md・作曲MCP＋薄いClaudeラッパー）＋母艦環境1行（GMKTec K8-Plus/WSL2/32GB）＋「進捗の正準はTask・backlog・git log。歴史スナップショット=docs/status.md（凍結）」 |

### 2-3. 統合する（11本 → 新設「トラック地図」1本）

以下11本はすべて「実装スライス完了・全緑・正準はdesign/researchの◯◯」型の**引き継ぎメモ**。各ファイル自身が正準docを名指ししており、詳細（コミット・テスト数・設計判断）はそちらとgit logで再導出できる。**残す価値は「どのアークの正準がどのdocか」の対応表だけ**なので、1本の地図に畳む（本文案は§3-1）。

| # | 中身（一行） | ファイル | 正準（再導出先） | 失われる情報 |
|---|---|---|---|---|
| 22 | コーパスのごみ化は根治済み（POP909の拍ズレ修正・進行正規化） | project-corpus-handoff | research 2026-07-14-corpus-db-diagnosis / -rebuild-verification（再取得コマンドはL55-56）・残タスクはbacklog.md「コーパス根治の残」 | なし |
| 23 | スイング等を非破壊の「フィール層」に分離した（ノートは常時ストレート格子） | project-feel-layer-refactor | design.md「フィール層分離」（L1540）＋research 2026-07-11-swing-feel-layer-audit | なし（契約は地図の「恒久契約」に1行残す） |
| 24 | メロのぶつ切れ・終止の硬さ対策（flow/pickup/句辞書）完了 | project-melody-phrasing-stage12 | research 2026-07-10-melody-phrasing-length-direction（実装ログ追記済とメモリ自身が記載） | なし |
| 25 | メロ理論の不足9項目を総点検して全実装（brush-up3周込み） | project-melody-theory-plan | research 2026-07-09-melody-theory-gaps-and-plan / -melody-chord-critical-review / -brushup-audit-5areas | なし |
| 26 | 骨格（2拍構造線）を独立素材に一級化。メロ生成をV2に一本化 | project-skeleton-layer-redesign | design #20＋backlog「骨格層の負債」。地雷のうち「dist焼き」はreference-run-stack-and-e2eに既載 | なし（bit一致鉄則は地図の恒久契約へ） |
| 27 | 骨格を伴奏の中で書き聴きする画面「骨格の机」完成 | project-skeleton-desk-s6-handoff | design #20 S6＋research 2026-07-12-skeleton-desk-handoff | なし |
| 28 | ドラム→ベース→メロを結線するパイプラインとセクション役割完了 | project-track-wiring-series | research 2026-07-10の4本＋design結線契約 | なし |
| 29 | 仮歌トラック（VOICEVOXで歌わせる・アクセント注入・子音カウントイン）完了 | project-kariuta-track | design #13c/#25＋research 2026-07-15-kariuta-*・2026-07-16-vocal-consonant-countin・2026-07-15-lyrics-first-melody-verdict | 「歌詞判断はFable指定」1行のみ→#18へ移す |
| 30 | 曲フォーム＝分家モデル（参照既定＋浅いfork＋系譜）設計確定・S1-S3a実装済 | project-song-form-branch-model | research 2026-07-16-song-form-assembly＋design「#曲フォーム」。「push未」は失効（origin/main..main空を実測） | 独立監査役の学び3行のみ→#18へ移す |
| 31 | Chat優先ユースケース4つ（アナリーゼ・歌詞↔メロ・次の一手・機材）全実装 | project-chat-usecases-next | usecases-chat.md＋design「読み筋層v2.1」。「_audio_poc/依存」は失効（apps/audioへ移動済・実測） | なし |
| 32 | コード進行エディタを折り返しブロックタイムラインに作り替え（#26）完了 | project-chord-editor-timeline | design #26＋research 2026-07-18-chord-editor-timeline＋backlog L315（耳確認ゲート）。「未コミット」は失効（83e001f でコミット・push済） | なし |

### 2-4. 消す（8本）— 全文がリポジトリの劣化コピー

| # | 中身（一行） | ファイル | 再導出先 | 失われる情報 |
|---|---|---|---|---|
| 33 | ブランチは分けずmain直（ソロ開発） | feedback-single-branch-main | **CLAUDE.md「ブランチ運用」節と完全重複**（同じ日付・同じ理由）。開発セッションには CLAUDE.md が常に入る＝二重注入 | 引用の逐語「間違えて嫌な気持ちになる」のみ。趣旨（取り違えでミスの元）はCLAUDE.mdにある＝退避不要 |
| 34 | 一段落ごとに残タスクを出す・勝手に終わり宣言しない | feedback-surface-remaining-tasks | **CLAUDE.md「進め方」節と重複**（Task機能への言及も含め） | なし |
| 35 | 2026-06-23のリスク監査リファクタの引き継ぎ（#1-5完了・残#6/#7） | project-autonomous-run-handoff | 全面失効：残#6のcore.tsは537行に分割済・#7のjobs.pyは**ファイルごと消滅**（worker実体はcm-searchのみ・実測）・「コミット未実施」も失効 | **教訓「監査所見は系統的に過大評価＝実コードで検証してから」だけ新設ファイルへ退避**（§3-2） |
| 36 | アーキ転換＝worker脳を撤去し「作曲MCP＋薄いClaudeラッパー」へ（検証の全経緯） | project-arch-pivot-mcp-chat | メモリ自身が「docs是正済」と記載＝architecture.md・design #100/#101 が正準。CLI検証の細部（stream-json形・MCP温め必須等）もdesign #100に反映済 | なし（転換の一言は#21書き直しと地図に残る） |
| 37 | チャット常駐化の実装状態（api側済・web未切替で休眠） | project-chat-persistent-status | 「web未切替」は失効＝全部実装・コミット済（a63c904/961b426、design #100④が正準）。旧worker手起動メモも現行はrestartスキル＋#19が正準 | なし |
| 38 | 「作曲がうまくいかない」の4バケツ分解〜学習メロエンジン確立までの27.7KBの作業日誌 | project-compose-quality-track | モデル＝design #12-M S7/S8。実測値（強拍CT90.8%・骨格粒度1.91拍・自己相関lag8/16・overshoot77%）＝melody-corpus-findings.md に格納済（L20-52実確認）。仮説28本と対処＝melody-design-journey.md（実確認・独立追試済） | **オーナー評語の逐語（「けど弱い」「微妙」「ハノン/エチュード」等）のみ**。→**退避せず捨てることを推奨**：評の対象（試作デモ）は削除済みで逐語だけ残しても検証不能、判断の中身は journey doc が全部持つ。さらに bias-audit §3-4 の通り、この評語群は「品評が飛び交う場」の空気を作る実害があった。逐語を残したいのは本人だけが決められるが、**推奨＝捨てる** |
| 39 | 2026-07-14の研究31本＋実装WP21ファンアウトの完了記録 | project-research-fanout-2026-07-14 | research 31本＋README索引＋2026-07-14-research-to-implementation-plan.md（メモリ自身が明記） | **並行委譲の運用学び3点だけ#18へ退避**（§3-2） |
| 40 | 2026-07-15夜間UI総点検（133チェック・修正9群反映・検収合格） | project-ui-audit-2026-07-15 | research 2026-07-15-ui-feature-inventory / -ui-audit-results（正準2本・メモリ自身が明記）。設計判断の残りはbacklog起票済 | **罠メモ2行だけ#19へ退避**（§3-2） |

**耳確認の残り**（複数メモリの「残＝耳」）について：リポジトリ側の backlog.md（L16/48/51/298/315）とチェックリスト2本（2026-07-14-ear-hand-checklist-wp-batch / 2026-07-13-ear-hand-check-scenario）が既に集約している＝メモリに複製しない。どれをもう聴いたかの消し込みは本人にしかできないが、それはbacklog上の作業であり本整理の範囲外。

---

## 3. 新設2本の本文案

### 3-1. `project-tracks-map.md`（統合先＝「どこを読めば分かるか」の地図）

```markdown
---
name: project-tracks-map
description: 完了した開発アークの地図＝正準docポインタ集＋恒久契約。状態・数値・残タスクはここに書かない
metadata:
  node_type: memory
  type: project
---

# 開発トラック地図（完了アークと正準の在り処）

**このファイルは「どこを読めば分かるか」だけを持つ。進捗・数値・残タスクは書かない**
（古くなって嘘になるため）。残タスクの正準＝Task機能・docs/backlog.md／設計の正準＝docs/design.md／
経緯＝git log・docs/research/README.md（マスター索引）／2026-07-01までの歴史＝docs/status.md（凍結）。

## 完了アーク（各1行＋正準doc）
- アーキ転換＝作曲MCP＋薄いClaudeラッパー（worker脳撤去・Claudeクライアントが脳）→ architecture.md・design #100/#101
- 作曲品質の分解→学習ベースのメロエンジン（joint cellモデル）→ design #12-M S7/S8・research melody-design-journey / melody-corpus-findings / melody-model-summary
- コーパス根治（POP909位相・進行正規化・再取得コマンド）→ research 2026-07-14-corpus-db-diagnosis / -rebuild-verification
- トラック間結線（ドラム→ベース→メロ・セクション役割）→ research 2026-07-10の4本＋design結線契約
- メロ句フレージング（flow/pickup/arc・句辞書）→ research 2026-07-10-melody-phrasing-length-direction
- フィール層分離（swing/humanizeは非破壊のfeel層）→ design「フィール層分離」＋research 2026-07-11-swing-feel-layer-audit
- メロ理論総点検（Step1-5＋brush-up3周）→ research 2026-07-09-melody-theory-gaps-and-plan / -melody-chord-critical-review / -brushup-audit-5areas
- 骨格層の一級化＋骨格の机 → design #20（S6含む）＋research 2026-07-12-skeleton-desk-handoff
- 研究→実装ファンアウト（研究31本＋WP21）→ research 2026-07-14-research-to-implementation-plan＋README索引
- Chatユースケース4つ＋アナリーゼ読み筋v2.1（音声解析の実体は apps/audio）→ usecases-chat.md・design「読み筋層v2.1」
- 仮歌トラック（VOICEVOX・アクセント注入・句頭子音カウントイン）→ design #13c/#25・research 2026-07-15-kariuta-*・2026-07-16-vocal-consonant-countin・2026-07-15-lyrics-first-melody-verdict
- 曲フォーム＝分家モデル（参照既定＋浅いfork＋系譜・vary汎化・CoWガード）→ research 2026-07-16-song-form-assembly＋design「#曲フォーム」
- UI刷新群（コード進行タイムライン#26・再生一本化#27・縦セットリスト#28・表現力#29）→ design #26〜#29

## 恒久契約（アーク横断で守る・正準はdesign）
- ノブ/機構の既定値・未指定＝従来と**bit一致**（回帰ゼロの鉄則・design #20他）
- notesは常時ストレート格子がSSOT。スイング等は content.feel で宣言（design「フィール層分離」）
- エンジンの入出力は常に実音。degree↔実音の変換を脳(LLM)にさせない（#86）
- 生成verbは候補返し・書込は明示コミット（design #100/#101）
- 他者コーパスは統計のみ抽出・リテラル旋律は保存しない（著作権・CLAUDE.md）
- 反復/共有で子が畳まれるUIでは、尺・情報をid起点で解決する（曲フォームS1で踏んだ罠）
```

### 3-2. `feedback-verify-audits-in-code.md`（教訓の退避先）＋既存2本への追記案

```markdown
---
name: feedback-verify-audits-in-code
description: サブエージェント監査・他者の指摘は系統的に過大評価＝実コードで裏取りしてから着手する
metadata:
  node_type: memory
  type: feedback
---

**監査・レビュー・計画docの指摘は、実コード（file:line）で裏取りしてから着手する。**

**Why:** サブエージェント監査の所見は系統的に過大評価が常態。実例＝2026-06-23リスク監査で4件連続
（SQLインジェクション→exploit不可の潜在のみ／timeout無し→実装済／レースHIGH→設計上ハンドル済／
輪郭破壊→意図的挙動）。計画docの「最痛点」も書いた時点から陳腐化する（2026-07-08再検証で
top3が全部実装済だった）。backlog/designにも鮮度ズレの前科あり。

**How to apply:** 誇張を計画に混ぜない。着手前に現物確認。検証責任の考え方は
docs/research/2026-07-18-why-unread-code-worked.md と接続。
```

`feedback-delegate-to-cheaper-models` への追記（末尾に節を足す）：

```markdown
**並行委譲・監査の運用学び（2026-07-14ファンアウト＋2026-07-16曲フォーム受け入れ監査より）:**
- 共有ワークツリーでの並行実装は git add -A が事故源＝個別ファイル列挙・hunk単位stagingを指示に焼き込む。
  セッション上限で同時死しても、doc早期Write済みは無傷・残りはSendMessage再開で完遂できる。
- 委譲プロンプトに「見送りは明記」を入れると誠実なスコープ判断を引き出せる。
- **受け入れ監査は実装者と別のエージェントに**＝自作自演を避けられ、実際にブロッカー（白画面クラッシュ）を発見した。
  E2E監査は自前フィクスチャ作成→掃除・既存データは読み取りのみ、の規律で。
- 歌詞の創作判断はFable指定（オーナー指示 2026-07-15「歌詞はFableに考えさせて」）。
```

`reference-run-stack-and-e2e` への追記（運用ハマりどころ節に3行）：

```markdown
- pkill -f は自コマンド文字列に自己マッチして exit 144 になる（検索語を工夫するかPID指定）。
- サンドボックスapi（本番DBクローン検証）の起動は apps/api ディレクトリから pnpm exec tsx。
- 再起動・dist焼き・孤児掃除・疎通確認は **restartスキル**（.claude/skills/restart）に手順化済み＝まずこれを使う。
```

---

## 4. 索引 MEMORY.md の書き換え後 全文案

そのまま貼れる形。43行/9KB → 26項目/約3KB。**索引には状態・数値・残タスクを書かない**（毎セッション無条件注入される場所に失効しうる記述を置かない＝今回の失効の温床の根治）。

```markdown
# Memory Index

## オーナーと流儀
- [ユーザー: 修羅場P](user-shurabap-composer.md) — 作曲家。DAWはABILITY(楽譜入力)。ジャンル横断
- [WHATとHOWを分ける](feedback-separate-what-from-how.md) — 要件で先走らない・純日本語・発散→収束
- [問題が無ければ止めない](feedback-dont-stop-without-blocker.md) — 「続けて」は継続指示。止まるならブロッカーを明記
- [報告はステートレスに](feedback-stateless-reports.md) — 毎回文脈を再掲し自己完結で
- [作業しながら解説を厚めに](feedback-explain-while-working.md) — 仕組み/理由を噛み砕いて
- [カタカナ英語で](feedback-loanwords-over-coined-japanese.md) — 造語日本語は通じない
- [メロ作業は層を明記](feedback-label-melody-layer.md) — 冒頭に【骨格】/【表面】
- [サンプルはバリエーション](feedback-sample-variety.md) — 複数seed・進行違い・長短
- [優先度: メロ最優先](feedback-priority-melody-first.md) — 開発工数の配分の話（スコープ注記あり）

## 委譲と検証の作法
- [難しい判断=Fable・他=Opus以下](feedback-delegate-to-cheaper-models.md) — 線引きは難易度。並行委譲・独立監査役の学び込み
- [監査・指摘は実コードで裏取り](feedback-verify-audits-in-code.md) — 他者所見は過大評価が常態
- [フルe2eを毎回回さない](feedback-e2e-cost.md) — ユニット＋ピンポイントで
- [結線は実機フローで確認](feedback-wire-mode-through-generation.md) — テスト緑≠結線保証。品質変更後は耳確認

## 思想と戦略（覆さない結論）
- [候補まで機械・仕上げは人間](project-design-philosophy-options-not-finished.md) — 完成品は追わない。Sunoは別パラダイム
- [評価: LLM判定は大反対](feedback-eval-existing-weights-not-llm.md) — E-rule+E-corpusの純TS二本立て
- [メロ評価の天井](project-melody-eval-ceiling.md) — 理論スコアはガードレール止まり。評価器fitness化は死に筋
- [次の戦略の芯](project-next-dev-plan-p0.md) — 足場優先。自作コーパス(P2)が要石

## プロジェクトの地図
- [Otomemoとは](project-creative-manager.md) — コンセプト/アーキ/母艦環境の正準ポインタ
- [開発トラック地図](project-tracks-map.md) — 完了アークの正準doc対応表＋恒久契約。進捗の正準はTask/backlog/design/git
- [創作セッションの隔離](project-creative-session-isolation.md) — メモリはrepo外cwdでしか切れない。創作はotomemo-studioで

## 運用リファレンス
- [スタック起動とe2e](reference-run-stack-and-e2e.md) — バインド/プロセス罠/dist焼き/restartスキル
- [Playwrightで実機UI実測](reference-playwright-live-ui-check.md) — モバイル幅ドライブ手順
- [スマホから繋がらない時](reference-phone-access-network.md) — Tailscale/LANバインド診断
```

---

## 5. 実行順序（退避→削除の依存を守る）

1. **新設2本を先に作る**：`project-tracks-map.md`（§3-1）・`feedback-verify-audits-in-code.md`（§3-2）。削除対象からの退避先を先に確保する。
2. **吸収先2本に追記**：`feedback-delegate-to-cheaper-models`（並行委譲・独立監査役・歌詞Fable指定）・`reference-run-stack-and-e2e`（罠2行＋restartスキル1行）。
3. **残りの「変える」7本**（順不同）：user／separate-what-from-how／priority-melody-first／eval-existing-weights／explain-while-working／next-dev-plan-p0／creative-manager。
4. **削除19本**（1〜2の転記完了を目視確認してから）：単純削除8本（§2-4）＋統合元11本（§2-3）。
5. **MEMORY.md を最後に全面書き換え**（§4の全文案。最終ファイル集合23本と一致させる）。
6. 完了後、本docに実施記録を1行追記（research README索引への行追加も）。

## 6. 効果とリスク

- 毎セッション注入の索引：43行/9KB → 26項目/約3KB。**失効しうる記述（状態・残タスク）が索引からゼロになる**。
- 本体：40本/約173KB → 23本/約45KB。27.7KB・12.7KB・11.8KBの巨大日誌3本が全て解消。
- 失効記述の根治：リポジトリ名・push/コミット状態・worker残骸・_audio_poc・FMD・「web未切替」の6系統を一掃。
- 引用なしの人物推測：2ファイル3文を削除（残るオーナー像は全て本人発言の引用付きになる）。
- リスク：削除後に「あの詳細どこだっけ」となる可能性 → すべて§2の表の「再導出先」に明記済み。トラック地図が入口として機能する。git履歴には残らない（メモリはgit管理外）ため、**不安なら実行直前にメモリdirごと`tar`で一時退避してから消す**（例：`~/memory-backup-20260718.tar.gz`・1コマンド・恒久保存は不要）。
