# creative_manager 進捗・管理表（living）

最終更新: 2026-07-01

> ⚠️ **陳腐化注意（2026-07-13）**：最終更新が2026-07-01で止まっており、下記「残タスクの正準」宣言は現運用と乖離（CLAUDE.md では**タスク＝Task機能**が正準・保留＝backlog.md・設計＝design.md）。本docは要棚卸し（削除/統合はオーナー判断・本文は保持）。

このファイルが**残タスクの正準**。頭の中／揮発タスクで管理しない。着手・完了でここを更新する。
凡例: ✅完了 / 🟡部分・留保 / ⬜未着手。acceptor列: design=design-acceptor要 / impl=impl-acceptor要 / —=不要。
関連: 要件=`docs/requirements.md`、設計=`docs/design.md`、生成手法調査=`docs/research/2026-06-21-generation-methods.md`。

---

## 1. 領域別ステータス（できているもの）

| 領域 | 状態 | 中身 |
|---|---|---|
| 捕獲・ネタ帳 | ✅ | メモ/歌詞/コード/メロ/リズム/テーマ、タグ・mood・key・tempo・拍子、一覧・ミニプレビュー・削除 |
| 入力モダリティ | 🟡 | ✅ピアノロール（描く/選ぶ/消す）／文字、添付(asset)。~~パッドステップ~~撤去(2026-07-04)。✅楽譜入力(MusicXML)・✅音声(ハミング)＝#56。**✅音符プレビュー(2026-06-30: メロ/ベース/コード楽器/リズムで配置時＋ピアノロール鍵盤タップで即発音=previewNote)** |
| モバイル編集UI | ✅ | (2026-06-30) 編集面を可視dvhに収め底のトランスポートがブラウザ下バーに潜らない・横スクロールの左ラベル/鍵盤sticky(全エディタ)・リズムグリッドのモバイル幅収め・縦バー副作用除去。Playwrightで各エディタ実測 |
| 編集Undo/Redo | ✅ | **(2026-07-01・design U1-U3)** NetaDialog層にcontent一式snapshot履歴(`history.ts`+`useEditHistory`・純ロジックTDD6)＝melody/chord/bass/rhythm/chord_pattern全部に一発。UI=TransportBar左↩/↪(文字矢印・空でdisable・案1)。Playwright実機で置く→undo→redo確認。残=section/song・トースト |
| 歌詞→メロ | 🟡 | (2026-07-01) `flowLyric`(モーラ→音符1:1・多=分割/少=メリスマ・TDD)＋メロエディタ「歌詞流し込み」＋音符下に歌詞レーン(sticky下端)。残=lyricネタに読み欄/選択流し込み(LS2)・手動調整・MIDI歌詞メタ。仮歌(歌声合成)はbacklog別口 |
| 検索・つなぐ | ✅ | ファセット検索、意味検索(埋め込み＋較正ゲート #65)、関連辺・合成辺 |
| スケッチ・再生 | ✅ | 4要素エディタ、Tone.js＋SF2再生、プレイヘッド・トランスポート、section/song合成、GM音色(再生↔書出一致 #47) |
| ドラム再生 | 🟡 | ✅速度/音高/チョーク #84 S0-S3＋S4 ベロシティ層。**✅ピッチ異常修正(2026-06-29: root=overridingRootKey??叩いた鍵・ride2+8等を断つ)**。**✅キット選択 アコ/エレキ(2026-06-29: buildGmDrumMap(preset)パラメタ化・RhythmContent.kit→再生&MIDI ch10 program・Standard不変=回帰ゼロ・全キット実在サンプル解決を構造確認)**。研究=research/2026-06-29-drum-sound-resolution.md。残=新キットの音の試聴調整・Standardのregex一掃(任意・要A/B) |
| DAW往復・過去資産 | 🟡 | ✅MIDI書出、MIDI取込(worker分割 melody/rhythm #81)、歌詞取込。⬜コード自動検出、mp3整理、ABILITY往復は基本のみ |
| 投げて受け取る | ✅ | ジョブ→**api内consumer**→reap→トレイ（旧Python worker撤去済2026-07-05＝research/import_midi/生成は api が消化）、plan分解・継続・通知強度・waiting/question #45、定期スケジューラ #80、フォーム質問パネル #85S3 |
| AI生成 枠＋動作＋構造 #85 | 🟡 | ✅枠(6/8効く)、gen_variations(N個・items+edges)、condition(音数/コード)、verb(fetch/transform/gen_lyric)、文章＋パネル導線。✅方向確認(confirm) |
| 音楽理論層 #86 | 🟡 | ✅判定(analyze_fit/detect_key/analyze_progression)、ルール生成(chords/melody/bass/drums/pair)、Chat入口(dispatch・実機)、正規化層、agentic Chat。✅補正(fit_to_chords)・✅類似度・✅ルール基線実測。**生成はTS `apps/api/src/music` 一本化**(cm-music-mcp廃止・S2是正) |
| メロ生成 高度化 | ✅ | **S1-S3**(骨格優先=フレーズ/句末息継ぎ/カデンツ着地/頂点アーチ≈0.62/滑り込み倚音/弱拍経過刺繍/位置駆動変奏・6/8ネイティブ・弱起・度数内部モデル degree.ts/meter.ts/skeleton.ts)＋**S4-S5連想**(melodyEssence/多層melodySimilarity/similarMelodies retrieval/genFromEssence=エッセンス→違うメロ/normalizeToC)。研究=docs/research/melody-generation.md。残=メロコーパスのデータ収集 |
| コード実現層 | ✅ | **進行=抽象**(音色固定GM49・選択不可)＋**新kind chord_pattern**(strum/arp・voicing R/3/5/7・open/close・高さ・各音の長さ{step,dur}・自前音色)＝進行に解決する相対型の和音版(CP1-5)。/gen/section に配線・複数重ね可 |
| コード入力/section UX | ✅ | ChordEditor(start自動フロー・長さボタン・ピアノロール表示・合計尺)・section レーン層モデル順(進行→メロ→コード楽器→ベース→リズム)＋**占有セルのみ配置不可**・相対ベースのつんのめり(アンティシペーション)解決・トグル/構成音の選択色是正(E2E) |
| コード語彙/分数/レジスタ | ✅ | **(2026-06-30・design「コードが不足」)** A語彙拡張=テンション(9/maj9/m9/add9/69/13/m11)・dim7・altered(7b9/7#9/7#5/7b5)等をQUALITY_INTERVALS(theory+web同期)＋ChordEditor optgroup29品質(※「9」欠落でmajフォールバックを是正)。B分数コード=ChordEntry.bass(C/E・最低音/相対ベースR/analyzeFit/エディタ/MIDI)。C伴奏レジスタ=voiceChordをアンカー最寄りオクターブ配置(跳ね解消)。api412/web緑・Playwright確認。残=テンション込みvoicing(将来) |
| 情報収集 | ✅ | research/collect・参考曲・継続研究 #9 |
| 非機能 | 🟡 | ✅認証(CM_TOKEN)・✅**到達=Tailscale tailnet限定**・単一オリジン配信＋localhostバインド・✅バックアップ(timer・S4)。✅**自動起動=systemd --user enable済(D9・2026-07-07・linger付き＝再起動生存)**。⬜Tailscale serve設定(ユーザ側・初回のみ) |

---

## 2. 残タスク（管理対象・着手順）

| 分離 | scope | **project/library 分離**：neta.scope(project既定/library)。ネタ帳=project(5・デクラッタ)、連想retrieval=library(314)、検索はscope:all横断(取込も名前で引ける)、ピッカーall+library配置で自動コピー。**S3 UI=「プロジェクト/ライブラリ」タブ＋カード操作(＋プロジェクトへ/複製/ライブラリへ=自作を連想元に)**。**S2 MCP=create/list_netaにscope露出＋copy_neta(deep)/set_scope**(agentic許可はread-only維持・#102不変)。本番移行済・要件L152は「library=連想元コーパス」で整合 | design「プロジェクト/ライブラリ分離」 | S1→S2→S3 | design+impl | ✅ S1-S3＋セルフチェック修正(H1/H2/M1/L1)完了・ライブ稼働(api165/web116緑)。残=#102 S4(copy提案)・コーパス品質(M3) |

| # | 領域 | 内容 | 関連設計 | 段取り | acceptor | 状態 |
|---|---|---|---|---|---|---|
| 器 | プロジェクト | **プロジェクト＝一曲(or組曲)の器**：曲・ファイル・会話セッションを集約する"辿れるホーム"へ昇格。階層 Project⊃Song(1..N)⊃section。**S1=会話を器に束ねる**(chat_thread表[B案・薄表]・listChatThreads(project)・新規会話を器に登録・空セッションも一覧・既存=未仕分け)。**S2=ファイル集約**(listProjectFiles=prj配下neta→neta_asset→asset・同一assetは畳んでattachedTo列挙・GET /projects/:p/files)。**S3=プロジェクト画面**(🏠→ProjectScreen・**Claude Projects風ランディングをメインペーン埋め込み**＝会話起点入力＋左[会話・曲/セクション]＋右[ファイル＝知識]・会話クリックでChat復元・起点入力はseed付きで新規セッション開始)。**S4=プロジェクト実体**(project表＝説明description＋AIへの指示instructions・画面で編集/表示・**指示は chat-session の append-system-prompt に注入＝この器の会話に常に効く**[空=従来通り回帰ゼロ]・thread→project→instructions引き当て)。**S5=操作面**(E2E洗い出しを是正：空会話クラッタ修正[束ねを発言時に遅延]・SP戻り先[器へ復帰]・会話の改名/削除[deleteChatThread]・ファイルDL修正[assetUrl]/削除・＋曲を器内から・空プロジェクト到達[GET /projects=prj:タグ∪project行])。api405/web196緑。**S6=可視化と取り込み**(進行中ジョブをワークスペースに可視化=GET /projects/:p/jobs・未仕分け会話を器へ取り込む「＋取り込む」・Chatに「📌器の指示が効いています」バナー)。api406/web197緑・本番ビルド通過・実機(Playwright)でjobs可視化/取り込み/バナー確認。**S7=モバイル土台刷新**(`:has()`状態ハック撤去→「一度に1つの全画面ビュー」＝App が `.workspace` に mv-home/mv-pane 付与・mainpane全幅・app-head常駐で戻るが☰を覆わない・mv-paneでバブル非表示＝被り解消・横はみ出し無し。useIsMobile/jsdomガード。E2EでSP切替/戻る/PC回帰確認)。web197緑・ビルド通過。残=backlog参照(ファイル追加/プレビュー[紐付け先要設計]・ネタ帳の真ドロワー化[任意]・プロジェクト改名削除[要設計]・指示の即時反映・既定会話整合) | requirements「一曲(or組曲)の器にまとめる」/design「プロジェクト＝…ホーム」 | S0仕様→S1..S7 | design+impl | ✅ **S0-S7完了**(器/操作面/可視化/取込/モバイル土台)。**✅ #5 song/section整合＝実装済**(design「曲/セクションの階層」＝song=section並べる編成/section=パート専用・＋曲を組む=kind song)。残=backlog [M/L] |
| 連想 | エンジン | **連想エンジン**(コード進行/度数/連想)を要件→設計→実装。要件/設計とも独立acceptor ACCEPT。**S1度数化/調推定/進行距離・S2機能/カデンツ解析・名前あて・代替・感情シフト・説明 実装済**(apps/api/src/music・TS・データ不要・各impl-acceptor ACCEPT)。**ユーザー露出**=creative-manager MCPに read-only 5ツール(identify/analyze/explain/substitute/emotion)＋agentic許可＝Chatが「これ何進行?/なぜ/代替/もっと切なく」に実コードで答える。api122/worker99緑 | requirements「連想で…」/design「連想エンジン」/research 5本 | ✅S1/S2/名前あて/代替/感情/説明/ハモ付け/継続/retrieval＋進行コーパス仕入れ。MCP8本露出 | design+impl | ✅ 一通り完了。コーパス=U-FRETから10アーティスト(Mr.Children/椎名林檎/BUMP/ラルク/YOASOBI/Mrs.GREEN APPLE/志方あきこ/King Gnu/米津玄師/Vaundy)×〜10曲→**315進行**を度数列+タグ(「取込」で手作りと区別)+出典でneta化・本番稼働中。残=タグ精緻化/品質改善は運用で |
| メロ連想 | データ | **メロコーパスのデータ収集**(度数/抽象層のみ・著作権セーフ)＝基盤(melodyEssence/類似/retrieval/genFromEssence/normalizeToC)は実装済。**崩し機能を昇格(2026-06-29)**：genFromEssence に **崩し強度strength＋複数参照blendWith**＝提示メロのノリ(リズム指紋)を保ちピッチ/輪郭を強度に応じ崩す＝「似た雰囲気の別メロ」。MCP `reshape mode:"deform"`＋http露出・api409緑・実機確認。情報源マップ=research [2026-06-29-melody-corpus-and-deform](research/2026-06-29-melody-corpus-and-deform.md)(PDMX本命/POP909等は統計のみ)。**実態(2026-06-29確認)＝コーパスは一部投入済**：library に melody パターン1425件(pop1139/irish186/game100・6/8 60件)・ABC取込CLI(`scripts/ingest-abc.ts`)＋style生成バイアス(`generate style:"irish"`)配線済。**残＝質の検証(耳・出先で保留)＋データ拡充(自作/PDMX)＋リズム指紋の変形** | research 2026-06-29-melody-corpus-and-deform.md | 既設パイプラインで追加投入→試聴調整 | — | 🟡 基盤＋崩し＋一部データ済・質検証は耳待ち |
| UX磨き | 低 | E2E発見の低優先：トランスポート絵文字(⏮🔁📥)が□(フォント差・実機要確認/SVG化候補)・意味検索が無一致でも「近い」を返す(ヒント文)・スマホで mood 入力右端見切れ/section全画面後の薄カード覗き | E2E(2026-06-23) | — | — | ⬜ |
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
- **アーキ是正(2026-06-23・4監査→確定 design参照)＝S0-S5 完了**：S0止血/S1契約SSOT(schemas.ts・kindレジストリ)/S2音楽ドメインTS一本化(生成TS化・cm-music-mcp廃止**5→4**・Python domain削除・worker は/music委譲)/S3 core層分離(reaper/scheduler・reap原子化)/S4 systemd化(+health/backup timer/公開ガード)/S5フロント分割(music.ts→audio.ts／poll.ts でジョブ待ち統合＋アンマウントガード／NetaDialog→KindEditorBody＋save平坦化／styles.css→6ファイル)。**S0-S5 完了**。api181/web116/worker62緑・4プロセス稼働・全push済。
- **常駐サービス**：**2プロセス**(api:8787 単一オリジン＋音楽ドメインTS `/music`＋MCP宿主＋ジョブ消化／cm-search:8788 意味検索＝残る唯一のPython)。**旧 cm-worker(Pythonジョブワーカー)は撤去済(2026-07-05)・cm-music-mcp(:8790)は廃止(S2)**。systemd ユニットは `deploy/systemd/` に定義＋**`--user` enable 済（D9・2026-07-07・linger 付き＝母艦再起動でも自動起動）**。cm-api/cm-search/cm-backup.timer が active。死にユニット cm-worker.service は剪定済（D8）。
- **バックアップ＝✅自動化済(S4)**：`cm-backup.timer`＋`scripts/backup.sh`(sqlite backup API・世代14・data/backups/)。
- **agentic Chat の音楽ツール＝api `/music` HTTP 経由**(cm-music-mcp廃止・S2)。worker は生成/判定を api に委譲。到達不可時は dispatch 経路（ルール生成）にフォールバック＝後退ゼロ。
- **生成はルール優先・Claudeは音符に触らない**（#86確定）：Claude=言葉→構造化リクエストの翻訳＋判定読み、記号エンジン=音符づくり＋当てはまり判定。
- **リスク監査リファクタ #1-5 完了（2026-06-23）**：監査の所見は実コードで検証して系統的に補正（過大評価が常態）。#1 worker堅牢化（接続リーク/無音失敗/kill後ハング）・#2 生成不変条件 property test（#5分割の安全網）・#3 api堅牢化（壊れJSON列ガード/facets SQLハードニング）・#4 web堅牢化（DL早期revoke/NetworkError）・#5 generate.ts分割（→rng.ts/rhythm.ts）。api246/web129/worker66緑。詳細 design 決定1/3/4。
- **神クラス分割（旧#6/#7）の判断＝今はやらない**：jobs.py分割は**見送り**（design決定1でPython側は信号処理に痩せる方針＝伸びない／66テストで安定／分割には約40箇所のmonkeypatch seam作り直しが要りリスクだけ高い）。core.ts分割（design決定3 Repo分解）は**機能追加で同領域を触る時に便乗**で進める（コールドで割る価値は低い）。手順は design「神ファイル分割の進め方」に保存。

---

## 4. 完了済みの大物（参照）

- #85 AI生成「枠＋動作＋構造」: 要件→設計(design-acceptor 3巡)→S1-S3実装(各impl-acceptor)。
- #86 Claude非依存の音楽理論層: 研究→アーキ確定→設計(design-acceptor 2巡)→cm-music(判定+ルール生成)→Chat入口→正規化層→MCPサービス(S2a)→agentic Chat(S2b)。
- #81 MIDI取込 worker分割 / #82 plan intentカタログ(collect) / #80 定期スケジューラ / #67 UX小束 ほか。
