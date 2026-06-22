# creative_manager 進捗・管理表（living）

最終更新: 2026-06-21

このファイルが**残タスクの正準**。頭の中／揮発タスクで管理しない。着手・完了でここを更新する。
凡例: ✅完了 / 🟡部分・留保 / ⬜未着手。acceptor列: design=design-acceptor要 / impl=impl-acceptor要 / —=不要。
関連: 要件=`docs/requirements.md`、設計=`docs/design.md`、生成手法調査=`docs/research/2026-06-21-generation-methods.md`。

---

## 1. 領域別ステータス（できているもの）

| 領域 | 状態 | 中身 |
|---|---|---|
| 捕獲・ネタ帳 | ✅ | メモ/歌詞/コード/メロ/リズム/テーマ、タグ・mood・key・tempo・拍子、一覧・ミニプレビュー・削除 |
| 入力モダリティ | 🟡 | ✅ピアノロール／パッドステップ／文字、添付(asset)。✅楽譜入力(MusicXML)・✅音声(ハミング)＝#56 |
| 検索・つなぐ | ✅ | ファセット検索、意味検索(埋め込み＋較正ゲート #65)、関連辺・合成辺 |
| スケッチ・再生 | ✅ | 4要素エディタ、Tone.js＋SF2再生、プレイヘッド・トランスポート、section/song合成、GM音色(再生↔書出一致 #47) |
| ドラム再生 | 🟡 | ✅速度/音高/チョーク #84 S0-S3＋**S4 ベロシティ層(ハット控えめ)**。🟡1 SmplrPreset集約(音質検証要・別途) |
| DAW往復・過去資産 | 🟡 | ✅MIDI書出、MIDI取込(worker分割 melody/rhythm #81)、歌詞取込。⬜コード自動検出、mp3整理、ABILITY往復は基本のみ |
| 投げて受け取る | ✅ | ジョブ→worker→reap→トレイ、plan分解・継続・通知強度・waiting/question #45、定期スケジューラ #80、フォーム質問パネル #85S3 |
| AI生成 枠＋動作＋構造 #85 | 🟡 | ✅枠(6/8効く)、gen_variations(N個・items+edges)、condition(音数/コード)、verb(fetch/transform/gen_lyric)、文章＋パネル導線。✅方向確認(confirm) |
| 音楽理論層 #86 | 🟡 | ✅判定(analyze_fit/detect_key/analyze_progression)、ルール生成(chords/melody/bass/drums/pair)、Chat入口(dispatch・実機)、正規化層、MCPサービス(S2a実機)、agentic Chat(S2b 受入済)。✅補正(fit_to_chords)・✅類似度・✅ルール基線実測 |
| 情報収集 | ✅ | research/collect・参考曲・継続研究 #9 |
| 非機能 | 🟡 | ✅認証(CM_TOKEN)・✅**到達=Tailscale tailnet限定(design確定)**・単一オリジン配信＋localhostバインド・docs/deploy.md。⬜Tailscale serve設定(ユーザ側・初回のみ)・⬜バックアップ・⬜自動起動 |

---

## 2. 残タスク（管理対象・着手順）

| 分離 | scope | **project/library 分離**：neta.scope(project既定/library)。ネタ帳=project(5件・デクラッタ済)、連想retrieval=library(314件)、ピッカーはall+library配置時に自動コピー。copy/scope API済・本番移行済(取込314→library・自作5はproject)。残=ライブラリ閲覧タブ(NetaList)/複製UI/copy_neta MCPツール。要件L152は「library=連想元コーパス」で整合 | design「プロジェクト/ライブラリ分離」 | S1 core/DB→S2 MCP→S3 UI | design+impl | 🟡 S1＋配線＋ピッカー済(api164/web116緑)・残=閲覧タブ/MCP copy |

| # | 領域 | 内容 | 関連設計 | 段取り | acceptor | 状態 |
|---|---|---|---|---|---|---|
| 連想 | エンジン | **連想エンジン**(コード進行/度数/連想)を要件→設計→実装。要件/設計とも独立acceptor ACCEPT。**S1度数化/調推定/進行距離・S2機能/カデンツ解析・名前あて・代替・感情シフト・説明 実装済**(apps/api/src/music・TS・データ不要・各impl-acceptor ACCEPT)。**ユーザー露出**=creative-manager MCPに read-only 5ツール(identify/analyze/explain/substitute/emotion)＋agentic許可＝Chatが「これ何進行?/なぜ/代替/もっと切なく」に実コードで答える。api122/worker99緑 | requirements「連想で…」/design「連想エンジン」/research 5本 | ✅S1/S2/名前あて/代替/感情/説明/ハモ付け/継続/retrieval＋進行コーパス仕入れ。MCP8本露出 | design+impl | ✅ 一通り完了。コーパス=U-FRETから10アーティスト(Mr.Children/椎名林檎/BUMP/ラルク/YOASOBI/Mrs.GREEN APPLE/志方あきこ/King Gnu/米津玄師/Vaundy)×〜10曲→**315進行**を度数列+タグ(「取込」で手作りと区別)+出典でneta化・本番稼働中。残=タグ精緻化/品質改善は運用で |
| 91 | #86補正 | **fit_to_chords**：other型(正当でない)外し音を最寄りコードトーンへスナップ。経過/刺繍/掛留は残す | design#12 Stage1 | cm-music関数→MCP/handler→reap→test | impl | ✅ (score 0.61→0.84実証) |
| 92 | #86類似度 | **melody_similarity**(音程列・移調不変)＋find_similar(過去メロ探索)。作風寄せ/重複の土台 | research R2 | cm-music→MCP/handler→test | impl | ✅ (移調不変実証) |
| 93 | #85方向確認 | バッチ前に1案だけ作り「この方向でいい?」→承認(frame/count引継)で残数本生成 | design#85(E) | worker(_propose→waiting)＋既存answerJob | impl | ✅ (confirm=true) |
| 84 | ドラム | ✅S4 ベロシティ層(ハット控えめ・既存ネタも一括適正化)。🟡Standard 1 を1 SmplrPreset集約=音質検証要で保留 | design#84 | music.ts(DRUM_VEL)＋gen_drums | impl | 🟡 velocity済 |
| 83 | スキーマ | ✅song(stage/next_action)・neta_asset(role) テーブル＋core/HTTP/MCP。元MIDI紐付け配線は後続 | design#14 | db.ts→core→http→mcp→test | impl | ✅ |
| -  | #86移管 | ✅ルール基線実測(メロscore平均0.884・<0.6は0.7%)→ルール優先を裏付け。Claude比較はharness(--claude)で任意 | design#12 | scripts/measure_gen.py | — | ✅ |
| 55 | #47後続 | ✅song箱UI(段階/次の一手)・✅section多トラックMIDI書出(lane別)。⬜SF2再生パリティ(音質検証要) | — | 縦スライス | impl | 🟡 残:SF2パリティ |
| 56 | #35後続 | ✅楽譜入力(MusicXML)・✅音声(ハミング→音高 自己相関ACF＋録音UI)。⬜添付拡張(scope曖昧) | 要件L116-119 | musicxml.ts/pitch.ts/HummingRecorder | impl | 🟡 残:添付拡張 |
| -  | チャット | ✅複数会話セッション（Claude/ChatGPT風）：☰一覧/＋新規/切替/冒頭プレビュー。thread使い回し・スキーマ変更なし | #19 | listChatThreads＋Chat UI | impl | ✅ |
| -  | チャット | ✅Chatがワーカー完了をその場で待つ(受信箱お任せ廃止)。plan/items を job/:id/outcome でポーリング→できたネタをインライン表示。待ち中は入力ロック。api76/web111緑 | #19/#61 | core.jobOutcome＋GET /job/:id/outcome＋Chat.tsx waitForJob | impl | ✅ |
| -  | UX | ✅配置ネタにMiniRoll概形＋ラベル(セクション/曲ペーンでネタ帳と見え方を統一・スマホ可読) | #55 | SectionEditor | impl | ✅ |
| -  | 到達/認証 | ✅設計確定(design#18/#36: Tailscale tailnet限定・アプリ側PW無し・ネット層が境界)。✅単一オリジン配信＋localhostバインド(CM_HOST既定127.0.0.1)＋docs/deploy.md。✅Tailscale接続確認済(2026-06-22 ユーザ確認) | 設計#18/#36 | main.ts＋deploy.md | impl | ✅ |
| 96 | ベース | ✅bass kind 2モード(絶対=低ピアノロール／相対=度数レーン×ステップ)。相対は帯E1〜D#2にルート置き度数はルートから上、音長選択、既定フィンガーベース | design#14 | music.ts/BassStepEditor/NetaDialog | impl | ✅ |
| -  | 振り分けA | ✅consult を【特定(名前/旋法/様式)→Claude知識 vs 汎用→ルール】に分岐(止血)。丸の内→FM7-E7-Am7-Gm7-C7実証 | design「振り分けA」/research | jobs.py handle_consult | — | ✅止血 |
| -  | 合成音色 | ✅section/song 再生でパート毎の音色を保つ(per-program 旋律サンプラー) | design#14音色 | music.ts compositeNotes/playNotes | impl | ✅ |
| 97 | bug整合 | ✅生成ネタ削除での reap 蘇生を恒久対策(deleteNeta が job_result.neta_id を NULL 化) | design job_result | core.ts | impl | ✅ |
| 98 | 進行DB | ✅名前付き進行DB(丸の内/カノン/小室/王道4536/ツーファイブ/12小節ブルースを度数列で確定realize)＋MCP gen_named_progression＋agentic配線(記憶で書かずツール必須)。worker98緑 | design「振り分けA」 | music/progressions.py＋music_mcp＋handle_consult | impl | ✅ |
| 102 | Chat操作 | Chatが既存ネタを検索/読取/編集/変形/配置/連関/削除(全変更は承認制＋前後プレビュー＋再生)。MCP配線 | design#102(受理: 骨子ACCEPT・REVISE5点反映済) | ✅S1読取面→✅S2提案契約→✅S3承認UI | design+impl | ✅ S1-S3実装＋impl-acceptor(コア不変ACCEPT・REVISE2点解消)。worker93/api/web緑。残=S4(transform承認後ルール適用・一括承認)・実機 |
| 22 | AI探索 | 広くAIツール探索（別立て・要調査） | — | research | — | ⬜ |

---

## 3. 既知の留保・技術メモ

- **agentic Chat(#86 S2b) の full-loop が遅い**：claude -p の多段ツール使用で数分。`--max-turns`(既定8・env `CM_AGENTIC_MAX_TURNS`)で上限化済み。要チューニング（重い時は dispatch にフォールバック）。MCP tool-use 自体は S2a で実機実証(roots 0,5,10,0)。
- **常駐サービスの起動/プロセス管理が弱い**：worker / api(tsx watch) / cm-search(:8788) / cm-music-mcp(:8790) を手起動。supervisor or 起動スクリプト＋疎通スモークが欲しい（このセッションで多数の再起動によりランタイムが不安定化した教訓）。#36 自動起動に載せる。
- **agentic を使う前提**：worker に `CM_MUSIC_MCP_URL=http://127.0.0.1:8790/mcp` を渡し cm-music-mcp を起動。未設定なら Chat は dispatch 経路（ルール生成・実機実証済）にフォールバック＝後退ゼロ。
- **生成はルール優先・Claudeは音符に触らない**（#86確定）：Claude=言葉→構造化リクエストの翻訳＋判定読み、記号エンジン=音符づくり＋当てはまり判定。

---

## 4. 完了済みの大物（参照）

- #85 AI生成「枠＋動作＋構造」: 要件→設計(design-acceptor 3巡)→S1-S3実装(各impl-acceptor)。
- #86 Claude非依存の音楽理論層: 研究→アーキ確定→設計(design-acceptor 2巡)→cm-music(判定+ルール生成)→Chat入口→正規化層→MCPサービス(S2a)→agentic Chat(S2b)。
- #81 MIDI取込 worker分割 / #82 plan intentカタログ(collect) / #80 定期スケジューラ / #67 UX小束 ほか。
