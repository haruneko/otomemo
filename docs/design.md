# creative_manager 設計（SDD）v0.1

最終更新: 2026-06-30

要件: `docs/requirements.md` ／ アーキテクチャ: `docs/architecture.md`。
ここは統合設計。実装（#4〜11）はこれに沿って進める。**現況の正準は `docs/status.md`**（本書は決定ログ）。

## 棚卸し（2026-06-30）— 実装済み/置換済みで本文の旧記述が古い箇所
以下は実装が本文より進んでいる。本文の該当節を読むときはこの注記を優先（詳細は status.md・コード）。
- **プロジェクト＝器**（下「プロジェクト＝…ホーム」節）：S1-S3 は **✅実装済**（`ProjectScreen`・`GET /projects(/files|/jobs)`・`chat_thread`/`project` 表・`listProjectFiles/Jobs`・`deleteChatThread`）。**プロジェクトの instructions は chat-session の `append-system-prompt` に注入**（chat-session.ts `systemPrompt()`）＝器の会話に常に効く。「複数プロジェクト」節(L295〜)の「フィルタどまり/将来昇格可」は経緯（昇格済）。
- **ドラム**：`rhythm` content に **`kit`**（GMドラムキット＝アコ/エレキ・bank128 preset）追加。`buildGmDrumMap(preset)` は **preset パラメタ化**（#84 の preset0固定記述は古い）。ピッチは **root=overridingRootKey??叩いた鍵**（#84 S2 の中間記述より進む）。MIDI は ch10 program にキット反映。research 2026-06-29-drum-sound-resolution。
- **メロ崩し**：`genFromEssence(…, {strength, blendWith})`（崩し強度＋複数参照ブレンド）。**MCP `reshape` に `mode:"deform"`** で露出（L416 の reshape 記述は emotion のみで古い）。research 2026-06-29-melody-corpus-and-deform。
- **音符プレビュー**：エディタで音符配置/鍵盤タップ→`previewNote` 即発音（web/audio.ts・PianoRoll/Rhythm/ChordPattern/BassStep）。
- **モバイル土台**：編集面を可視 dvh に収め底のトランスポートが潜らない＋横スクロールの左ラベル/鍵盤 sticky（全エディタ）。
- **MCP/HTTP**：`convert` は公開済（L413(4) の「未公開」は古い）。`#101` の「CUT」宣言した旧ジョブ系ツール（`create_job`/`list_jobs`/`get_job`/`get_job_results`）は、**chat面（surface="chat"＝10 verbs）では非公開＝ユーザー到達不可**。full面（既定・test互換）には当面残す＝**legacy維持を正式決定（2026-07-07）**、コード撤去は backlog（`mcp.ts` の `if(legacy)` を畳む別タスク）。`/projects*`・`/chat/:thread/meta|turn`・`DELETE /chat/:thread` は本書の一覧に未掲載。`/schedule` に PATCH は無い。
- **コーパス**：library は U-FRET進行315に加え **メロパターン irish186/pop1139/game100 投入済**（L596「データ未収集」前提は古い）。質の検証（耳）が残。

## アーキテクチャ是正方針（2026-06-23・4監査→ユーザー確定）
長い縦スライス自走で「動く」を優先した結果、上位スペックとコードが乖離した（CLAUDE.md「後追いでスペックを腐らせない」への違反）。4スライスの独立監査で確定した負債と是正方針を**上位として確定**する。実装はこの方針を根拠に降ろす。

## アーキテクチャ是正方針（2026-06-23・4監査→ユーザー確定）
長い縦スライス自走で「動く」を優先した結果、上位スペックとコードが乖離した（CLAUDE.md「後追いでスペックを腐らせない」への違反）。4スライスの独立監査で確定した負債と是正方針を**上位として確定**する。実装はこの方針を根拠に降ろす。

### 決定1：音楽ドメインは TypeScript 一本に寄せ切る（言語境界の決着）
- **真実は `apps/api/src/music/`（TS）のみ。** Python のドメイン実装（`worker/.../music/{theory,analyze(analyze_fit部),correct,similar,generate,bass,progressions,normalize}.py`）と **cm-music-mcp(:8790) は廃止**する。
- Python に残すのは**信号処理のみ**：cm-search（埋め込み）、mp3解析(librosa)、MIDI取込(mido)、pyopenjtalk、Claude プランナー（翻訳役）。
- 生成（gen_chords/melody/bass/drums/named・fit_to_chords・melody_similarity）の TS 実装を新設し、本番生成経路を TS MCP ツール呼び出しへ切替。**MCP は creative-manager(TS) 1本**に集約（agentic Claude が見るのは1サーバ1言語）。プロセスは 5→4 に。
- **"追い抜き完了"の定義（これが満たされるまで Python ドメインは消さない）**：①TS生成エンジン完成 ②TS↔Python の**クロス言語ゴールデン一致テスト**が緑（analyze_fit/analyze_progression/detect_key/progressions/相対bass解決）③本番経路が TS 経由に切替済。免罪符化していた「フォークリフトしない＝無期限共存」をこの完了条件で締める。
  - **→ ✅完了（S2・2026-07-05）**：3条件を満たし、**cm-music-mcp(:8790) と Python ドメイン実装は削除済**。現構成は **2プロセス（api:8787＋cm-search:8788＝残る唯一のPython）**。上の「消さない」条件は**達成済＝Python ドメインは撤去完了**（本節は条件記録として残す）。
- **生成エンジンの不変条件（property test で固定＝分割/改修の安全網）**：乱数は seed で再現的だが byte 等価は約束しない。代わりに次の **musical 不変条件**を `generate.ts` の契約として固定する（#5 分割で挙動を壊さない土台）。
  - **決定性**：同一 `(frame, chords, seed)` は同一出力（gen_chords/melody/bass/drums/chord_pattern/from_essence 全て）。
  - **音域**：メロは本体音 `start>=0` を `[60,84]` に収める（オクターブ折り返しは**ピッチクラス保存**＝ハモりを壊さない意図的処理。輪郭保存は**約束しない**）。弱起(pickup)のみ拍0前に負start で1度下にはみ出してよい。ベースは低域。全 pitch は有限整数。
  - **非空**：どの frame でも各パートは最低1音を返す（全休を出さない）。
  - **コード**：`genChords` は長さ=bars(1..16)、bars>=2 で I/i 始まり・I/i 終わり、各和音はダイアトニック表内・dur>0。
  - 入力の頑健化：不正 meter は 4/4、`bars` は 1..16 クランプ（既存 normalizeFrame/meterInfo）。`Rng.choices` は weights が空/非有限でも NaN を出さず末尾要素にフォールバック（決定的）。

### 決定2：契約の単一情報源（SSOT）化
- neta/job/scope 等の契約は **zod スキーマを `apps/api/src/schemas.ts` に1本化**し `z.infer` で型導出、http と mcp が import（現状 core型/http zod/mcp zod の三重定義・http listのscope無検証キャストを解消）。
- **kind レジストリ**（kind→{label,music?,container?,filterable?,lane?}）を1つ作り、散在する KINDS/FILTER_KINDS/MUSIC_KINDS/CONTAINER_KINDS/KIND_LABEL/LANES を統合。
- web は `apps/api/src/music` を **workspace 依存で実 import**（QUALITY_INTERVALS/KEY_NAMES/Note型/相対bass解決の web↔api 重複を解消）。`api.ts` の Neta/NetaPatch をサーバ types と突合（NetaPatch に meter/mode 欠落・scope 任意化を是正）。
  - **→ 洗練（決定2b・2026-07-07・負債D3）**：web が api の全面（DB/Fastify/MCPを含む）に結合するのは過剰。**不変の音楽知識だけを共有する専用パッケージ `packages/music-core`（`@cm/music-core`）を新設**し api/web 両方が参照する。DB疎結合方針は維持＝**共有は「不変の音楽知識」に限定**（`PITCH_NAMES`＝旧 web `PITCH_NAMES`/api `KEY_NAMES` の同一配列、`QUALITY_INTERVALS`＝34品質の完全一致テーブル、純粋派生 `normRoot`/`chordPcs`）。api `theory.ts` は同名を re-export して既存 import 面を不変に保つ。web `music.ts` は自前の重複リテラルを撤去し package を import。property test（chord-quality）で pc 解決の等価を担保。相対bass解決・Note型・生成器など**アプリ固有ロジックは共有しない**（結合を最小に）。

### 決定3：core.ts の層分離
- `Core`(1071行) を永続層 Repo 群（Neta/Edge/Job/Asset/Schedule/Chat）へ分割。**reapResults / tickSchedules は独立モジュール**（Reaper/Scheduler・intent→materializer 登録テーブル）へ。design#15「TS=生産者」に対し reap が消費者化している事実を構造で可視化する。
- **完了（2026-06-24）**：`apps/api/src/repo/` に NetaRepo・ComposeRepo(compose_edge)・RelationRepo・JobRepo(job/job_result)・AssetRepo(asset/neta_asset/song)・ScheduleRepo・ChatRepo＋util(now/parseJsonColumn) を抽出。**Core=合成ルート**＝7 repo を `core.neta`/`core.job`… で公開しつつ、現行フラットAPI(`core.createNeta` 等)を repo へ委譲する薄いファサードとして維持（http/mcp/test の呼出 約250箇所は無改修＝回帰ゼロ）。**集約跨ぎの orchestration は Core 残置**：`createNeta`(neta+tag+job_result マーカーの原子化)・`copyNeta`(compose 再帰)・`recordJobResult`・`jobOutcome`・`getComposition`・`reapResults`(Reaper駆動)・`tickSchedules`(Scheduler駆動)。core.ts は 881→330行(-63%)。api251緑。新ドメイン追加＝repo を1つ足すだけ（拡張が局所化）。
- **reapResults を `db.transaction` で囲い**、structured(items+edges)/import_midi/空マーカー/部分失敗の回帰テストを TDD で追加（最複雑分岐が無保護・無テストの是正）。bass(relative) が hasMusic/kindOf から漏れ reap で消える疑いをテストで暴く。facets() に scope 対応。

### 神ファイル分割の進め方（2026-06-23・リスク監査→是正）
3つの巨大ファイルを「上から下へ整合」させつつ縮小する。**テスト安全網を壊さない順序**で割る。
- **generate.ts(785→712)＝完了**：`Rng`→`rng.ts`、リズム/密度成形(mood分類＋図形＋densityBias＋pickFig)→`rhythm.ts` に抽出。挙動不変は **生成エンジンの不変条件 property test（決定1）** が担保。テスト seam と無関係＝安全。
- **core.ts(852)＝決定3のRepo分解が本筋（独立スライス）**：Core を Neta/Edge/Job/Asset/Schedule/Chat の Repo へ。**facade(Core)は残し委譲**＝http/mcp の呼出側とテストは無改修で割れる。クラス本体を触るので一括ではなく Repo 単位で TDD。`parseJsonColumn` 等の純ヘルパ抽出は先行可。
- **jobs.py(1170)＝先に「テスト seam の作り直し」が要る（独立スライス）**：現状 `_music`/`claude_prompt`/`_style_block`/`CM_MCP_STDIO_*` を **`jobs` モジュールグローバルとして約40箇所 monkeypatch** している。ハンドラを別モジュールへ出すと参照解決先がズレてモックが効かなくなる。よって **外部クライアント(music/claude)を引数注入 or 明示 import 経由に変える→テストの patch 先を移す→ハンドラを intent 群でモジュール分割**、の順。順序を守らないと安全網ごと壊れる。

### 決定4：DB 権威の一本化＋運用堅牢化（systemd）
- **job/job_result の DDL 権威は api(`db.ts`) のみ**。worker(`db.py`) の `CREATE TABLE job*` は撤去し既存前提に（FK・列を api 版へ統一＝worker版 job_result の FK 欠落で #97 蘇生対策が崩れる地雷を除去）。
- **CM_DB は絶対パス正規化**（起動スクリプトで1回・全プロセス継承）。rogue DB `apps/api/data/cm.sqlite` を撤去。全接続に `PRAGMA busy_timeout=5000`。
- **systemd --user** で per-service 化（`Restart=on-failure`・`After/Requires` で起動順・`ExecStartPre` でポート待ち）。`pkill -f`/`nohup &` を置換。`start-all.sh` に listen 待ちスモーク。backup.sh を timer 化。`/health`（queued滞留・直近failed・依存ポート疎通）。
- **best-effort の失敗は無音にしない**：フォールバック（few-shot/research 等の「空でも壊さない」#43同型）で握り潰す箇所は **`logging.warning` で観測可能**にする（常時失敗＝静かな機能停止を検知するため。制御フローは変えない）。**worker が開いた DB 接続は `finally` で必ず閉じる**（例外時のリーク防止）。`claude -p` の timeout kill 後の `communicate()` にも timeout を付ける（パイプ詰まりでの常駐ハング防止）。

### 段階（依存順）
- **S0 止血（低リスク・方針非依存・即）**：CM_DB絶対パス＋rogue撤去／全接続 busy_timeout／job表DDL権威1本化(FK統一)／start-all listen待ちスモーク／status・deploy 陳腐化更新。
- **S1 SSOT**：schemas.ts／kindレジストリ／web↔api 型共有／api.ts 突合。
- **S2 TSドメイン化**：クロス言語ゴールデン（止血の一部＝消す前に等価を測る）→ 生成TS実装 → 本番経路切替 → cm-music-mcp 廃止(5→4) → Python ドメイン削除。
- **S3 層分離**：core→Repo＋Reaper/Scheduler、reap トランザクション＋回帰テスト。
- **S4 systemd**：per-service ユニット／health／backup timer／ログローテ。
- **S5 フロント**：NetaDialog を kind別エディタへ分割、music.ts→純関数＋audio.ts、生成導線を useJobRun に集約。

## #14 データスキーマ（設計中）

### ネタと辺の方針
- ネタの辺は2種類に分ける：
  - **合成の辺(compose)**：親ネタ ← 子ネタ。`position`(拍/小節)と`order`を持つ。再帰の入れ子＝「くっつける」を担う。
  - **関連の辺(relation)**：人/AIが意図的に張った関連だけ。
- **「近い/似てる」連関は辺として保存しない。** 埋め込みでクエリ時に計算する（#6）。保存する辺は「合成」＋「意図的関連」だけ＝1ネタあたり数辺。
  - 規模注：仮に1ネタ100辺でも100万行≒数十MBでインメモリ・サブms。実際は1ネタ数辺なので余裕。
- **合成はDAG**：子ネタは複数の親で使い回せる（差し替え・流用が効く）。
- 取り出し：合成の辺だけ辿れば部分木が得られる（再帰CTE。重くなったら曲ごとに組み上げ済み構造をキャッシュ）。

### 音楽要素（時間軸が芯）
- メロ・コード・リズムは拍(beat)上のイベント。MIDI互換の土台（@tonejs/midi・ABILITY書き出しと素直に繋がる）。
- **正規化キー保存＋トランスポーズ**：メロディ・コード進行は **ハ長調(C)基準/相対形** で保存し、実際の調はネタ（or 配置）の`key`で都度トランスポーズ/realize。→ 調に依存せず流用・比較・差し替えが効く。
  - 注：単純トランスポーズは同主調内向け。長↔短・旋法変更はスケール考慮が要る（まず単純、必要なら度数ベースに拡張）。
- 音符は **スキーマ厳格な構造データ** で保存（曖昧な blob にしない）。音符単位の横断クエリが要れば後で正規化。

### 検索
- **構造ファセットで絞る**：key/長短調・拍子(meter)・tempo・bars・mood（＋自由タグ）。
- その上に **意味検索**（中身のテキスト表現の埋め込み、#6）。

### テーブル第一カット（音楽中心）
- `neta`(id, kind, title, key, mode(長/短), tempo, meter, bars, mood, content[構造データ：Cキー基準の音符/コード/リズム], text[歌詞/自由文], created, updated)
- `compose_edge`(parent_id, child_id, position, order)。**反復配置のため PK は (parent_id, child_id, position)**（#54）＝同じ子を別位置に複数置ける（モチーフ反復）。同位置への再配置は冪等（置換）。解除は position 指定で1インスタンスのみ。
- `relation_edge`(from_id, to_id, type)
- `tag`, `neta_tag`

### 非音楽の在庫（決定：A 同居）
- テクスチャ／リファレンス／ナレッジ／ニュース／テーマ等も、同じ `neta` 表に同居（音楽用カラムは空のまま）。種類は `kind` で区別。
- 理由：意味検索・連関を種類横断で効かせたいのが要件の核。共通の背骨（id/kind/tag/辺/埋め込み）を全種類で共有。
- 判断基準：後での統合はきつい／後での分離は統合よりマシ。だから最初は同居で始める。

### 残りのテーブル
- ※`neta` 行には実装で **`scope`(project既定/library)** 列を追加済み（連想元の分離・db.ts／後段「project/library 分離」）。
- `song`(neta_id[kind=song], stage[段階], next_action[次の一手], updated) — 曲の箱(overlay)。`neta` と 1:1。
- `asset`(id, kind[mp3/midi/ability/lyric_text/image/render], path, meta[JSON: key/bpm/mood等], created) — ソース/添付ファイル。
- `neta_asset`(neta_id, asset_id, role[source=分解元 / attachment=添付 / render=音源レンダ])
- `chat_message`(id, thread, role, kind, text, data, created) — 会話履歴（#70。thread=対象neta id / 'global' / 'chat:*'）。
- `schedule`(id, neta_id, intent, params, every_sec, enabled, last_run, next_run, created) — 定期スケジューラ（#80）。
- **`chat_thread`(thread PK, project, title, created, updated)** — 会話セッションを器(プロジェクト)に束ねる薄表（2026-06-28「プロジェクト＝器」B案）。
- **`project`(name PK, description, instructions, created, updated)** — プロジェクト実体（器の説明＋AIへの指示。instructions は会話の system prompt に注入）。
- `job`(id, target_neta_id, instruction, type[壁打ち/部分生成/作例/研究/収集/発展], status[queued/running/done/needs_decision/failed], progress, notify_level, created, updated) — 投げた仕事。対象は常に `neta_id`。
  - **job の読み出し契約（性能・2026-07-09）**：`params`（study/audio_analyze では base64 音声＝1件最大24MB）を **一覧経路（`listJobs`/`listForProjectTag`＝GET /jobs・get_jobs・/projects/:project/jobs）は返さない**（明示列指定で `params` を除外）。ジョブ処理経路（`getJob`/`claimQueued`＝ランナー）と reaper 独自SQLは `params` を保持。UI（App のポーリング/Tray）は `params` を使わない＝改修不要。実測：`GET /jobs?status=done` が 87.6MB/1.1s → ~1.7MB/23ms（約50倍）。
  - **音源の永続化契約（P2・2026-07-09）**：study/audio_analyze の**音源(base64)は job.params に残さない**。ランナーは処理中に受けた音源を **asset(`kind=audio`・content-hash で重複排除・`data/assets/*.mp3`)** として保存し、`completeJob` の結果に `audio_asset_id`(study は `audioAssets[]`) を載せ、**処理後(done/fail)に params の `audio_b64` を strip**（`stripJobAudio`）＝done後に base64 が残らない＝DB 肥大の恒久防止。reaper が結果の asset_id を生成ネタへ `role=source` でリンク＝「その解析の元音源」を辿れる（自作mp3コーパスの入口）。既存肥大の一括回収は `scripts/migrate-audio-to-assets.ts`（実行済 2026-07-09・DB 127MB→6.7MB）。
- `job_result`(job_id, neta_id, order) — ジョブの生成物（複数可）。生成物も neta。受理時に対象へ compose/relation で繋ぐ。**reap の冪等性は「job_id に job_result 行が在るか」で判定**するので、**ネタ削除では job_result 行を消さない**（`deleteNeta` は `neta_id` を NULL にしてから削除＝CASCADE 道連れを防ぐ。実装 2026-06-22・#97）。これを破ると削除した生成ネタが reap で蘇生する。

### #14 で後回し
- `content`（構造データ：音符/コード/リズムの厳密スキーマ）は #16 契約 or 実装直前で確定。

## #15 モジュール構成と責務（設計中）

- **PWAクライアント（TS/React）**：捕獲UI、ネタ閲覧・検索、スケッチエディタ（ピアノロール・再生＝Tone.js）、ジョブの投げ/受け取りUI。出先・家共通。オフライン捕獲。
- **APIサーバー（TS/Node）＝唯一の受け口＋ルーター＋データ層**：全リクエストを受ける単一の front door。データop（CRUD・検索）は直接処理（SQLite/WAL）。自然言語/重い/非同期の依頼は**ジョブ表に積んで**下流へ渡す。状態・結果はSQLiteを読んで返す。到達/アクセス(LAN/Tailscale)。**ルーティングは明示的（リクエスト種別で振り分け、TS自体に知能は持たせない）。**
- **ワーカー（Python）＝ヘッドレス（公開APIなし）**：ジョブ表をpollして消化。Claudeプランナー（plan-job：自然言語の依頼を原子ジョブに分解・ルーティング・軌道修正）・解析(mp3→key/bpm/mood)・埋め込み・**ノート生成と当てはまり判定＝記号エンジン `cm-music`(music21+ルール)**(#12/#86)・研究/収集。結果を neta 化して job_result へ。外に露出しない。
  - **役割分担(#86)**：Claude＝言葉→構造化リクエストの翻訳(ディスパッチ)＋判定を読む批評（**音符に触らない**）。**音符づくりと当てはまり判定は cm-music（決定的）**が担う。詳細は #12。
- **ML/解析の道具箱（Python・ワーカー内）**：librosa・mido/music21・sentence-transformers・Claude SDK。（**music21 は #86 第一スライス着手時に worker 依存へ追加**＝現状 pyproject 未追加。）
- **スケジューラ（Python）**：情報収集の定期実行、継続研究の少しずつ進行 → ジョブを生成してキューへ。
- **DAW橋渡し（家/Windows側の軽い助っ人）**：MIDI書き出し→ABILITY登録、ABILITY/MIDI取り込み。Webの外。
- **データストア（SQLite＋sqlite-vec）**：neta/辺/song/asset/job/埋め込み。1ファイル、WAL、APIとワーカーが利用。

### 境界（インターフェース詳細は #16）
- フロント ↔ **TS（唯一の受け口）**：データCRUD・検索は同期で。自然言語/重い依頼は受けて**ジョブ表へ積む**。状態・結果はTSがSQLiteを読んで返す（HTTP/JSON）。
- **TS↔Pythonの境界＝SQLiteジョブ表のみ**（生産者=TS/スケジューラ、消費者=Pythonワーカー）。唯一の接点＝Python/Claudeの役割が溶けない。Pythonは外に露出しない。
- 整合：TSは**ジョブを積む（生産）だけ**、実行/管理はPythonワーカー（producer/consumerの分離。"TSがワーカーを拾う"わけではない）。
- 違和感メモ：短い同期的なAI呼び出しはこの形だとやりにくい。対処は「速いジョブを高速ポーリング」か「TSが叩く狭い内部Pythonエンドポイント1個」。intelligentは大半が非同期なので当面ヘッドレスで可、増えたら再検討。
- **内部窓口は2レーンある（#86で追記）**：①cm-search（**TS が叩く** localhost HTTP・意味検索）＝L62 のTS窓口の延長。②cm-music-mcp（**worker 内の claude -p subprocess が叩く** localhost HTTP-MCP・音楽の分析/生成ツール／Stage2）＝叩き手が claude で TS非経由＝**別レーン**。どちらも localhost 専有・外に出さない。「TS↔Python＝ジョブ表のみ」は崩さない（claude はフロントでもTSでもない別主体）が、**"worker内 claude が localhost を叩く"経路がある**ことを境界図に載せておく。
- ワーカー ↔ Claude/ML：Python内。
- TS・Python ↔ SQLite：直接(WAL)で共有。
- DAW橋渡し ↔ データ：ファイル or API経由。

### 高次元/低次元APIと司令塔（Claudeプランナー）
- APIを2層に：**低次元**＝原子的な操作（CRUD・原子ジョブ）、**高次元**＝自然言語の依頼。
- どちらも**受け口はTS**（高次元は plan-job としてジョブ表へ積む）。自然言語のやり取りは重要なので Claudeプランナーは第一級。
- ただしプランナーは**Python側のジョブ（plan-job）として動く**——TSは振り分けるだけで、分解・ルーティング・軌道修正の知能はPython/Claudeが持つ。TSは薄く保ち、役割を溶かさない。
- 段階建て可能：先に低次元（原子ジョブ）を動かし、その上に高次元プランナーを乗せる。

## #16 契約（設計中）

### ジョブとは（定義）
- ジョブ＝ユーザーが外に投げる「依頼」の単位。**対象(neta)＋意図**を持ち、非同期で進み、結果(neta)を生んで対象に紐づく。判断→再投擲ループの1サイクル。
- 2層（混ぜない）：**plan(高次元)**＝自然言語のふわっとした依頼→Claudeが下位意図に分解／**atomic(低次元)**＝下の意図カタログの単一作業。

### 意図カタログ（上段＝理想から。requirements の AI手伝い＋情報収集を投影）
| 意図 | 内容 | 実現性 |
|---|---|---|
| 壁打ち/ネタ出し | 自分の素材を組み替え・連想して方向を投げる | Claude：可 |
| 研究して見つける | 参考曲等からコード進行・リズムの手法を発見 | Claude＋解析：可 |
| 情報収集 | ニュース/プラグイン/参考曲を集め文脈づけ | 可 |
| 継続研究 | 指定テーマを継続調査→レポート | 可 |
| 歌詞をそろえて組む | 歌詞の整合をとる | 一部 #13依存（音韻・音数） |
| 過去資産の解析 | mp3=key/bpm/mood、MIDI=分割 | 可 |
| 部分の生成 | 種→聴ける/見える断片（メロ/コード/リズム） | **#12依存（ノート生成）** |
| 全体の作例づくり | 曲全体の作例 | **#12依存** |
| 作業代行 | 実作業を担う | **#12依存（生成の質）** |
- **executable な intent の集合は、上の実現性が解けるにつれて確定**（特に #12/#13）。カタログ（理想）は今確定、実行可能列挙はまだ凍結しない。

### 生成リクエストモデル（枠＋動作＋構造）(#85)
要件「頼み方：枠を指定して動作を頼む」を契約へ落とす方針。生成を**単発intent**から**枠付き・構造を返す**へ一般化する。現状の gen_melody/gen_chord/gen_rhythm はこの退化形（枠なし・items 1件の特殊形）。
> design-acceptor 2巡を反映：1巡目の重大指摘1〜7＋2巡目の新穴（handler非純粋の前提訂正・section container例外・fetch/transform実体・gen_lyric/連鎖の隠れ穴）を反映済み。各所に「※指摘N／2巡目」で対応を示す。

**(A) リクエストの構造**（自由文を plan/consult が解釈して組む。または下記パネルで人が埋める）:
- **frame（枠／全て任意。省略時は延長として汲む。指定したら最後まで効く）**：`{key?, meter?, tempo?, bars?, mood?, style?}`
- **verb（動作）**：make / fetch（抽出）/ transform（6/8化・移調）/ modify（修正）/ assemble（section化）/ research→make（連鎖）
- **target**：melody | chord_progression | rhythm | lyric | section …
- **count**：N（「✕個」）。**上限 N≤8**（reapの暴発防止 ※軽微指摘）。
- **condition（何に合わせるか）**：`{fit_to:[neta_id], by:"syllable"|"harmony"|…}`（例2=歌詞の音数、例5=コード進行）
- **structure（まとめ方）**：flat | pair | section

**入口での解釈（※軽微指摘）**：consult の判別ユニオンに新 type `generate` を足し、`{type:"generate", request:(A)}` を返す（既存 chat/options/content/plan と並ぶ）。plan は複数 verb/kind を混ぜる時の親として残す。

**(B) 枠を最後まで効かせる（S1＝核・最小スライス）**:
- atomic 生成ジョブの params に `frame` を載せ、プロンプトが反映（content は C基準維持・拍子/調/小節の枠で作る）。
- **reapResults が生成ネタに frame を付与**：atomic断片は key/meter/tempo/bars を**ヒント**として持つ（#14「断片はヒント、配置時は section/song が権威」と整合。frame付与はヒント保存なので衝突しない）。section を生成する場合は section が権威として frame を持つ。
- **`frame.style` は保存しない（※指摘7）**：neta に style カラムは足さない（design 原則「スキーマ変更は高い」）。style は**プロンプトにのみ効く**＝既存 `_style_block`/`_style_examples`(jobs.py) の few-shot に渡し、検索クエリ/フィルタの誘導に使う。
- これで「6/8と言ったら 6/8 で返る」（今の最大の穴を塞ぐ）。

**(B') count と分解の役割分担（※指摘3）**：
- **count=N は 1 つの atomic 生成ジョブが items を N 件返す**（既定）。gen_* の戻り値を `{content}` 単一から **`{items:[…]}`** へ進化（`{content}` は items 1件の後方互換として受ける）。
- **plan 分解は「異なる kind/verb を混ぜる時だけ」**（例：research→make、コード＋メロのペア生成で kind が分かれる場合）。同種 N 個は plan を挟まず1ジョブ＝items。曖昧併存を解消。

**(C) 構造を返す（S2）**:
- ジョブ結果を `{items:[{kind, content, frame…, label?}], edges:[{type:"compose"|"relation", from, to, position?}]}` に拡張（from/to は items の **index**）。
- **対応表・順序・部分失敗（※指摘2）**：reapResults は items を**配列順**に materialize しつつ `idx→neta_id` 配列を作る。`hasMusic` 偽の**生成 item**（メロ/コード等で中身空）は **null を残して index を保存**（詰めない）。edges は**両端が非null の時だけ** compose_edge/relation_edge を張る（片端 null は捨てる）。
- **structure→edge 対応（※軽微＋2巡目新穴2）**：`pair`→`relation_edge('related')`。`section`→**section コンテナ item を items に明示的に含める**（kind:"section"・content 空でよい）。**section/song など container kind は hasMusic 判定の対象外＝null 化しない**（中身を持たない親なので例外）。各構成要素へ `compose_edge(section→child, position)`。flat は edge なし。index は全 item（container 含む）に materialize 前に確定。
- 現行の単一ネタ結果は items 1件・edges 空の特殊形（後退ゼロ）。

**(C') condition 解決層（※指摘1・2巡目新穴1で前提訂正）**:
- 訂正：handler は純粋ではない。既に `_style_block`/`_style_examples`(jobs.py) が `connect()` で DB を開き neta.content を読んでいる（作風 few-shot）。よって「誰が詰めるか」問題は**worker 側の解決に一本化**できる（TS/worker 二箇所分割は過剰だった）。
- **fit_to の解決は worker 一本**：`fit_to` には neta_id だけを渡す。worker が**ジョブ消化の入口で**（`_style_block` と同じ DB 経路で）fit_to neta の content を読み、`params.fit_context` に展開してから handler を呼ぶ。同期 Chat 経路も同じ worker 解決に乗る（TS 側展開は不要＝退化）。
- 展開形 `fit_context`：`by:"syllable"`→`{syllables:[…]}`（worker の split_mora 活用）、`by:"harmony"`→`{chords:[…]}`、メロ修正→`{notes:[…]}`。**handler は fit_context だけ見れば合わせられる**。
- **連鎖（research→make ※2巡目隠れ穴）**：前段 research の結果(references/summary)を、後段 make 子の `params.context`/`fit_context` に worker(`_enqueue_children`)が焼く。＝「調べた内容を踏まえて作る」の配線をここで明記。

**(C'') verb の振り分け（※指摘4・2巡目新穴3で実体訂正）**:
- **transform**（6/8化・移調）＝AI不要の**決定的処理**。ただし**現状そのコードは無い＝新規に書く**（移調は再生時の C→key 変換ロジックが music.ts にあるが、neta content を別調/別拍子の**変種として確定**する関数は未実装）。meter 変更は主に meter ヒントの付け替え＋必要なら小節割りの再配置。元ネタは残し結果は変種 neta（DAG）。場所は worker か TS の決定的モジュール（実装時に確定）。
- **fetch**（参考曲等から「コード進行を取ってくる」）＝**research とは別の新ハンドラ**。handle_research の戻りは references リスト→reference ネタ化で、**楽曲 content を吐かない**。fetch は `{items:[{kind:"chord_progression", content:{chords}}]}` を吐く専用ハンドラを新設（必要なら fetch→transform の連鎖で 6/8 化）。
- **modify**（既存修正）＝対象 content を `fit_context`(C') に焼き込む Claude ハンドラ。結果は変種 neta（元を残す）。
- **歌詞生成（※2巡目隠れ穴）**：target=lyric は現状ハンドラが無い。`gen_lyric`（mora 制約付き）を新設対象として S2/S3 に積む。

**(D) 二つの入口（S3＝導線・両方持つ）**:
- **文章（既定）**：自由文→ consult が `type:"generate"` で (A) を返す。
- **パネル（AIが必要と判断したら出す ※指摘5）**：解釈に自信が無い/枠が欠ける時、Claude が**構造化フォームを要求**。既存 `job.question`(TEXT) に **JSON 文字列**を入れる＝`{kind:"form", fields:[{key:"meter",label,type,options?}]}`（カラム変更不要＝安い）。`answerJob` の署名を `answer: string | Record<string,unknown>` へ拡張し、**構造回答を frame に畳んで継続ジョブの params に載せる**。

**(E) 方向確認（S3＝賢さの上積み・任意 ※指摘6）**:
- バッチ前に**まず1個サンプル**（or 近い既存ネタ提示）→ waiting+question で「この方向でいい？」→承認で本生成。
- **answerJob は orig.params を引き継ぐよう拡張が必要**（現状 intent/target/instruction しか継がず frame/count/condition が消える＝「実現性高い」は誤りだった）。承認フローでは **frame/condition を保持し count を残数に差し替え**て継続ジョブを積む。

**段階**（2巡目を受け S2 を分割）：
- **S1**：枠の通し（数値の枠＝まず6/8が効く）。make 単体・items 1件・condition 不要。styleはprompt限定(指摘7)。これだけで「6/8と言ったら効く」が閉じる。
- **S2a**：構造を返す（items 複数＋edges＋指摘2の対応表・container 例外）。同種 N個・pair・section。
- **S2b**：condition 解決層 (C')＝fit_context を worker で解決（歌詞音数 by:syllable／コードに合わせ by:harmony／modify）。S2a と独立に着手可。
- **S2c**：verb 拡張（fetch 新ハンドラ／transform 決定的処理／gen_lyric）。
- **S3**：二入口（文章＋パネル＝指摘5）＋方向確認（指摘6 の answerJob params 引き継ぎ）。

**契約変更につき** design→design-acceptor→実装→impl-acceptor。

### ジョブ表
- `job`(id, target_neta_id[null可], level[plan/atomic], intent[意図カタログ参照], instruction[自然言語], params[JSON], status[queued/running/waiting/done/failed/canceled], priority, progress, notify_level[null=全体設定継承], parent_job_id[null可], question[null可], result_summary, error, 時刻)
- `job_result`(job_id, neta_id, order, role[primary/reference])
- self-resolved：①plan は当面ワーカー内 in-process でオーケストレーション。②notify_levelは全体設定＋ジョブ毎override。③止まって判断が要るとき status=waiting＋question（原則3）。

### TSデータAPI（低次元・同期）
- `neta`：create/get/update/delete/list（kind・ファセット key/mode/meter/tempo/mood/tags で絞る）
- `compose_edge`：子を position に配置/解除/並べ替え、合成ツリー取得（再帰）
- `relation_edge`：張る/外す/一覧　／ `tag` ／ `song`(stage,next_action) ／ `asset`(アップロード・neta紐付け role)
- 検索：構造ファセット（同期・TS内）＋ 意味検索（下記）
- ジョブ：投げる（job挿入）／状態・結果取得（SQLite読み）。処理はPythonワーカー。

### MIDI入出力
- 書き出し：スケッチ（合成＋構造content）を **TSの@tonejs/midi** で標準MIDI(.mid)へ。実調へトランスポーズして出力。DAW橋渡し/ダウンロードで使う。
- 取り込み：.mid / ABILITY書き出しのSMF を **Pythonワーカー(mido/music21)** で解析→content構造へ。可能ならメロ/コード/リズムに分割し neta 化＋ソース資産を紐付け。
- 両者は**共通のcontentスキーマ**（下）を守る。
- content へのトランスフォーム（ヒューマナイズ＝timing/velの揺らぎ・スウィング、トランスポーズ等）は**決定的処理（AI不要・#12非依存）**。元ネタは残し、変換結果は変種netaとして持てる（DAG）。※MIDI処理は内部モジュールに留め、汎用ライブラリ化は今はしない（スコープ膨張回避）。

### content の厳密スキーマ（Cキー基準・拍ベース）
- 時間軸：拍(beat, 四分=1.0)の float。**atomic断片は拍頭開始＝1拍目の頭(position 0)を起点に正規化**（並べ・差し替えしやすい）。MIDI書き出し時に tick(PPQ) へ変換。
- `melody`：`notes:[{pitch(C基準のMIDI番号), start(拍), dur(拍), vel?, syllable?}]`
- `chord`：`{root(0-11, C基準のピッチクラス), quality(maj/min/7/m7…), bass?, voicing?}`
- `chord_progression`：`chords:[{chord…, start, dur}]`
- `rhythm`：`{steps, lanes:[{name, midi(GM打楽器番号), hits:[stepIndex]}]}`（実装準拠＝ステップグリッド。当初案 `hits:[{pos(拍),part}]` から更新。1step=16分。再生時は step/4=拍 へ）
- 合成(section/song)：content でなく `compose_edge`（子＋position）で表す。section/song ＝エディタのメインペーン。
- **コンテキストの所有（重要・GUI検討で判明）**：配置・編成の権威は **section/song が持つ**（tempo・拍子・調・bars）。atomic断片はC基準で保存し、**調(key)・拍子(meter)を"ヒント"として保持**（単独再生・表示用。配置時は section が支配）。tempo は任意ヒント。mood・tagsは断片固有。
- 配置・再生：子(C基準)を section の key へトランスポーズし、section の tempo/meter で鳴らす。
- 表示への波及：一覧カードは、断片なら kind/mood/tags/見た目、section/song なら tempo/meter/key を出す（断片に確定キーを出さない）。
- **音色**：musical neta は楽器を持つ＝**General MIDI プログラム番号**（メロ/コード/ドラム。ドラムはGM打楽器/ch10）。再生はGM SoundFont、書き出しは MIDI のプログラムチェンジへ（再生と書き出しが一致）。UIの選択パレットは少数キュレートでよい（保存はGM準拠）。bass の既定音色はフィンガーベース(33)。
- **合成再生の音色（実装 2026-06-22）**：section/song の合成再生は `compositeNotes` が**子(パート)毎に program を Note に付与**し、再生は **program 毎の旋律サンプラー**（smplrは1サンプラー1楽器・再生時startなので per-note 切替不可→program毎のサンプラーを用意・SF2パースは共有）で各パートの音色を保つ。書き出し(多トラックMIDI)も lane 毎にトラック分け。
- **マスターバス＋ミキサー（実装 2026-07-09・音割れ対策）**：従来は全音源が個別に `destination` 直結＝出口で合算し 0dBFS 超でハードクリップ（ひずみ）。**全経路を1本のマスターへ集約**＝各パートゲイン(melody/chord/bass/drums)→マスターゲイン→**リミッター(DynamicsCompressor ブリックウォール -1dB)**→destination。天井を持つので何音重なっても割れない。生Web Audioで構築し Tone(`.connect`)・smplr(`destination`オプション)双方を接続（`audio.ts ensureMaster`・共有rawContextに一度だけ・冪等）。パート振り分けは `Note.part`（compositeNotes が kind から付与）を `prepareMelodicSamplers`（**パート別サンプラー**＝各パートゲインに接続）と `playEvent` が使う。単体再生は part 無し→melody。音量は `getMix/setMixVolume`＝localStorage `cm.mix`（既定 master0.8/melody1/chord0.8/bass0.9/drums0.8）、UIは再生バーの🔉`MixerControl`。**契約：新しい音源ノードは必ず `ensureMaster(Tone, part)` 経由で繋ぐ（`toDestination()` 直結禁止）**。
- **歌詞の流し込み**：歌詞neta をメロのノートに音節割り当て（`syllable`）してタイムラインに流せる。
- **コントロールカーブは無し**：CC/オートメーション/ピッチベンド/エクスプレッション等は持たない。content は ノート(pitch/start/dur/vel)＋楽器 のみ。
- **velocity**：ノート単位で持つ（default 100）。MIDI標準＆書き出しに要る"基盤データ"なのでフィールドは今持つ（コストほぼ0）。編集・ヒューマナイズUIは feature work（後）。
- **マイクロタイミング（tick前後の補正）は今は持たない**：将来のヒューマナイズ機能用で、後から nullable な offset を足すだけ（データ移行不要＝後付けが安い）。
- 判断則：**スキーマ変更は高い／機能追加は安い**。小さくMIDI標準で確実に要るものだけ今持つ（velocity）、純粋な将来機能＆後付け可能なものは後回し（micro-timing）。

### ベース（kind=`bass`・2モード）（決定 2026-06-21）
低音域前提のパート。**1 kind で「絶対=個別フレーズ」「相対=半リズムパート」の双方**を持つ。content に `mode` 判別子。
- **絶対** `{mode:"absolute", notes:[{pitch,start,dur,vel?}]}`：melody と同一スキーマ（C基準・自己完結）。**低域ピアノロール**で編集（既定ビュー低域・床=E1）。「相対で出せない個別フレーズ」用。
- **相対** `{mode:"relative", steps:N, pattern:[{step, degree, dur(step数)}]}`：度数をコードに当てて**再生時に解決する依存型**コンテンツ（断片が自己完結しない初の型）。入力は**度数レーンのステップグリッド**（リズム打ち込みと同型・行=度数/列=step・各stepはモノフォニック＝1度数だけ）。**音長(dur)を選べる**（長さツール）。
  - **語彙（これ以上持たない）**：`degree ∈ {R, 3, 5, 7, 8, approach}`。R=ルート／3,5,7=コードの3度5度7度（quality 依存：maj/minの3度・7thコードの7度）／8=オクターブ／approach=次の解決ルートへ半音で寄せる（歩くベース）。これで出せないものは絶対モードへ。
  - **オクターブ＝自動（選ばせない）＝ルート基準で上に積む（修正 2026-06-21）**：エレキ4弦ベース準拠で**最低音 E1（MIDI 28）**、**帯 E1..D#2（MIDI 28..39）は"ルート音"の置き場**。`root_pitch = band(root_pc)`、`band(pc)=28+((pc-4) mod 12)`。**他の度数は `root_pitch + ルートからの音程`**（5度=+7／3度=コードの3度音程(maj=4/min=3)／7度=コードの7度音程／8=+12）＝**度数はルートから上**（5度がルートより下にならない）。例：Cmaj root=C2(36) なら 5=43(G2)、Emaj root=E1(28) なら 5=35(B1)。approach=次のルート配置(root_pitch)へ半音（直前音に近い側）。床(28)未満になったらオクターブ上げ。
  - **解決の文脈**：section に置くと **chord レーンに当てて解決**。**単体プレビューは調のルート（tonic）**をコードとみなす。任意で**プレビュー用コード列** `preview_chords` をネタに持たせて鳴らせる。
- **再生/書き出し**：両モードとも解決後は notes になり melody と同じ経路で鳴る（低音＝低く鳴る）。SF2 はベース系 program を当てられると尚良し（後）。
- **section レーン**：bass 専用レーン（kinds:["bass"]）。相対は解決、絶対は section の調へ移調（melody 同様）。
- **gen_bass**：出力 kind を melody→**bass**（絶対モード）に。relative 生成は将来。
- **スライス**：**S1=kind追加＋絶対モード**（低域 PianoRoll・bass レーン・色・gen_bass の kind・notesForContent）→ **S2=相対モード**（解決エンジン[band配置/approach]＋ステップ度数エディタ＋`preview_chords`＋section のコードに解決）。両方を出すが S1→S2 の順で実装。
- **つんのめり(アンティシペーション・2026-06-23)**：相対ベースで**裏拍始まりかつ次のダウンビートを跨いで伸びる音**は、始点でなく**跨いだ先のダウンビートのコード**で度数解決（例 2拍裏から四分→3拍目表のコード基準）。4/4ロックの押し感。`resolveRelativeBass` 実装済。

### コード実現層（コンピング／アルペジオ・2026-06-23・要件「実現層」）
**問題**：`chord_progression`（和声＝抽象）が `program`（音色）を持つのは概念の混線。**和声=何か** と **楽器がどう鳴らすか** を分ける。
- **`chord_progression` は抽象**：音色を持たない／選べない。プレビューは**固定の中立音色（GM 49 String Ensemble）**で鳴らせるが選択不可。合成では「コード楽器パターン」が実際の伴奏を担う。
- **新 kind「コード楽器パターン（chord_pattern）」**＝**進行に解決する相対型**（相対ベースの和音版＝姉妹）。section のコード進行に合成時解決・自前の音色・複数重ねOK（ピアノ/ギター等）。content：
  - `{ mode:"strum"|"arp", voicing:{ tones:("R"|"3"|"5"|"7")[], openClose:"open"|"close", octave:number }, steps:N, hits:{step,dur}[] }`（dur=step数＝各音の長さを指定。旧 number[] も後方互換で受ける）
  - **mode**：strum＝各 hit で和音ブロック／arp＝各 hit で選択構成音を1つずつ巡回。
  - **voicing**：構成音(R/3/5/7 から選ぶ)・open/close・高さ(octave)。＝**スケッチ範囲（やりすぎてシーケンサーにしない）**。
  - resolve：各 hit の時刻のコードを取り、voicing で実音へ（strum=同時／arp=巡回）。
- **段階(CP)＝✅実装済(2026-06-23)**：CP1 進行を抽象化(音色固定GM49・選択不可) → CP2 chord_pattern kind＋`resolveChordPattern`(music.ts) → CP3 エディタ(ChordPatternEditor＝hitsグリッド＋長さツール＋voicing＋voicing MiniRoll) → CP4 `genChordPattern`＋/gen/section 配線 → CP5 compositeNotes で section 進行に解決(パート毎 program・複数可)。api/web 緑。

#### 決定：ドッグフード評価(16小節6/8を組む)の指摘を修正（2026-07-04・サブエージェント辛口評価→A/B/C）
サブエージェントがPlaywrightで16小節6/8を実際に組み「部品は良いが組み上げ(尺・拍子)が未通」＝★3/5。以下を修正。
- **A. セクション尺を可変に(8→最大32)＋ネスト合成**：`SectionEditor` の `BARS=8` 固定が最大の壁（16小節が組めない）。小節ステッパー(`neta.bars`永続)＋配置済みcontentで自動伸長(切れない)。`childDur` が子section/songでBPB固定→**再帰で実長**に（ネスト配置が重ならない＝compositeNotesの位置オフセットは元々正しく、childDurの誤りが原因だった）。尺>10で横スクロール。
- **B. 拍子(6/8)対応**：`beatsPerBar` を music.ts に集約(SSOT)。`PianoRoll` に meter を渡し**小節線(拍子基準)＋複製単位**を拍子に。`useNetaEditor`(len初期化/bars保存/＋1小節)・`MetaPanel`(小節数表示)・`ChordEditor`(「1小節」ボタン/合計)の**4拍固定を全撤去**。6/8メロが「6小節」→正しく「8小節」に。
- **C. 配置の長さ整合＋ピッカーのコーパス氾濫**：ループ系(リズム/コード楽器)は配置時に**セクション末尾まで自動で敷き詰め**(`loopPositions`)＝melodyは8小節なのにrhythmだけ1小節、のムラを解消。ピッカーは**コーパス(library)を既定で隠す**(トグルで表示)＝自作ネタが埋もれない。web257緑・実機で6/8・16小節セクション成立を確認。
- **決定：ボイシング入力を「トップ狙い音」ベースへ（2026-07-04・オーナー発案／方向確定・エンジン先行）**：現状の R/3/5/7＋open/close＋octave は抽象パラメータで、一番audibleな**トップ声部（コンピングの旋律）を握れない**。→ **トップ声部の"狙い音"を人が決め、各コードでそれに最寄りのコードトーンを最高声部に採り、内声を下へ自動配置**（`voiceToTop` in music.ts・`ChordVoicing.top?`）。旨み＝レジスタが一定に保たれ**進行間の声部進行が自動で滑らか**（backlog「compingの声部進行最適化」を回収）。**トップは絶対採用**（調/コードが変わってもコンピングの音域は動かさない＝物理レジスタ。相対は将来トグル）。**"できるか"問題＝進行非依存で成立**：トップ＝絶対の狙い音（メロ実体でなく音域の磁石）だから、どの進行に乗せても各コードで最寄りトーンをトップに採るだけ。同距離時の優先やベース分離は「そこまでやるなら DAW」で割り切り（再生は多少雑でOK＝オーナー了承）。ベースはベースパートに任せる方針。**✅実装完了(2026-07-04・web249緑)**：①エンジン(構成音の手選択を撤去＝鳴る音はコード質から自動導出・`voiceToTop`／`powerChord`でR+5間引き／`arpDir`で向き＝音域はvoicing継承・別指定なし) ②エディタ再構成(ChordPatternEditorを2ゾーン＝「いつ弾く」grid主役＋長さ＋小節／「響き」＝打ち方・トップ狙い・広がり・高さ・パワーコード・arp時は向き を1枠に集約) ③トップ狙い(top)をステッパーで配線・プレビューは常にtop込み。青の壁は解体(二択セグメント/トグルはコード色/±無彩色)。音の長さは既存どおり各hitのdur(長さツール+付点)で保持。候補プレビュー化は後段。
- **コード入力/section UX（CV・✅実装済）**：ChordEditor＝start自動フロー(順番)・長さボタン・ピアノロール表示・合計尺。SectionEditor＝レーン層モデル順(進行→メロ→コード楽器→ベース→リズム→section)・**占有セルのみ配置不可**(別小節は自由)。トグル/構成音の選択色＝OFF地色付与で是正(E2E)。

### コード語彙拡張＋分数コード＋伴奏レジスタ（2026-06-30・要件「コードが不足」）
**問題（ユーザー指摘）**：①品質語彙が不足＝テンション(9/11/13/add9)・dim7・altered(7♭9/7♯9/7♯5)が無い。しかも ChordEditor は「9」を選べるのに `QUALITY_INTERVALS` に定義が無く **major トライアドにフォールバック＝壊れている**。②分数コード(slash/on-chord)が表現できない＝`ChordEntry` に bass 欄が無い。③コード楽器(comping)の高さが**ルートのpcぶん跳ねる**(`base = 48 + octave*12 + root_pc`)＝進行が動くたびレジスタが上下。「大体の高さを決める」＋スムーズに置きたい。

**決定A：品質語彙の拡張（SSOT同期）**
- `QUALITY_INTERVALS`（正準＝`apps/api/src/music/theory.ts`、複製＝web `music.ts`/`chordname.ts`/`chordDetect.ts`）に追加：
  - 7系：`dim7`[0,3,6,9]・`aug7`(=7#5)[0,4,8,10]・`7b5`[0,4,6,10]・`mM7`(=m(maj7))[0,3,7,11]・`7sus4`[0,5,7,10]
  - テンション：`9`[0,4,7,10,2]・`maj9`[0,4,7,11,2]・`m9`[0,3,7,10,2]・`add9`[0,4,7,2]・`69`[0,4,7,9,2]・`m69`[0,3,7,9,2]
  - altered/extended：`7b9`[0,4,7,10,1]・`7#9`[0,4,7,10,3]・`7#11`[0,4,7,10,6]・`13`[0,4,7,10,2,9]・`m11`[0,3,7,10,2,5]・`maj7#11`[0,4,7,11,6]
- ChordEditor の QUALITIES を同セットへ拡張（基本/7th/テンション/sus/dim-aug でグループ）。未知qualityは従来どおり major フォールバック＝後方互換。
- comping voicing(R/3/5/7)は当面7thまで＝テンションは進行プレビュー(chordToMidi/chordPcs)で鳴る。テンション込みvoicingは将来。
- **同期テスト**：4ファイルの `QUALITY_INTERVALS` がキー集合一致(property test)＝SSOT乖離を防ぐ。

**決定B：分数コード（slash bass）**
- `ChordEntry` に **`bass?: number`**（pc 0-11・省略=root）。「C/E」={root:0, quality:"", bass:4}。C基準保存。section配置の移調は root と同じ shift を bass にも適用(実音保持)。
- 鳴り：プレビュー/comping で**最低音を bass pc に置き換え/追加**（root より下に bass を1音）。`analyze_fit` の pc集合に bass を含める(メロ判定が低音を考慮)。相対ベースが「R」を当てる時の基準は `bass ?? root`（slash上のベースは slash 低音を弾く）。
- ChordEditor に「/（onベース）」セレクタ(off=root / pc選択)。表示は「C/E」。MIDI も最低音に反映。

**決定C：伴奏レジスタ（跳ね解消・高さアンカー）**
- `voiceChord` の `base = CHORD_BASE + octave*12 + root_pc` を**アンカー中心の最寄りオクターブ配置**へ：`anchor = CHORD_BASE + octave*12`（octave=「大体の高さ」）／`rootPitch = nearestPcTo(root_pc, anchor)`＝root を anchor±6半音帯に置く(CもBも anchor近傍＝跳ねない)／その上に voicing を積む。bass(分数)はさらに下。
- メロ/ベースの placementLanding と同じ「最寄りオクターブで音域維持」を comping にも。`octave` はアンカーのシフトとして意味付け（octave=0≈C3帯で従来と近い＝後方互換）。結果＝進行が動いても comping レジスタ一定・声部進行が滑らか。

**段階＝✅実装済(2026-06-30)**：S1 品質語彙(決定A) → S2 伴奏レジスタ(決定C) → S3 分数コード(決定B)。各 TDD＋Playwright 確認済(api412/web緑・tsc0)。残＝テンション込みvoicing(将来)・compingの声部進行最適化(将来)。

### 歌詞をメロディに流し込む（2026-07-01・要件「歌詞をそろえて組む」#16/#13）
**目的**：既存メロ(notes)に既存歌詞(モーラ)を**後から1:1で割り当て**、音符下に歌詞を表示。`Note.syllable`(design #16・既存データ枠)を埋める。土台＝モーラ分割は web `lyrics.ts`/worker `split_mora`(拗音結合・長音ー/促音っ/撥音ん=各1モーラ)既存。

**決定L1：歌詞は{表記+読み}を行ごとに持つ**（ユーザー決定）。漢字はモーラ数が一意でない→**読み(かな)を音数の正準**に。
- lyric content：`{ lines:[{ text:表記, reading:読み(かな) }] }`。reading からモーラを割る。**reading 空なら text をかな扱い**＝今の歌詞ネタ(text直書き)と後方互換。
- 表示は表記(行)＋音符下にモーラ(かな)。表記↔音符の語単位対応は将来(MVPは行=表記・音符=かな)。

**決定L2：音数合わせ＝自動(多=分割/少=メリスマ)＋手動調整**（ユーザー決定）。`flowLyric(notes, moras, opts?)`：
- **モーラ > 音符**（歌詞が多い）＝**一番長い音符から半分に分割**(dur→dur/2×2・同ピッチ)を、音符数=モーラ数になるまで貪欲に。**下限=16分(0.25拍)**、それ以上割れない時は残りモーラを最後の音符に詰める(連結)。
- **モーラ < 音符**（音符が多い）＝モーラを先頭から1:1、**余り音符は `syllable:"ー"`＝メリスマ**(前の母音を伸ばす)。
- **一致**＝1:1。結果は `Note.syllable` に格納。**決定的＝「とりあえずの割当」**を出し人が手で直す([[project-design-philosophy-options-not-finished]])。
- 手動調整(将来でも可)：音節境界の移動・ここで分割/メリスマの強制。

**段階**：LS1 `flowLyric` 純TS＋モーラ配列splitter(TDD) → LS2 lyric に reading 欄(後方互換) → LS3 メロエディタ「歌詞を流し込む」(lyric選択→ notes に syllable)＋**音符下に歌詞表示**(Playwright) → LS4 手動調整/MIDI歌詞メタ/MCP露出(将来)。最初の縦スライスは緩く(動かして学ぶ)。

### エディタ Undo/Redo（2026-07-01・backlog「簡易作曲ツールA」・スマホ前提）
**目的**：メロ/コード/ベース/リズム/コード楽器の編集を取り消せる/やり直せる。
**決定U1（機構＝スナップショット履歴）**：**NetaDialog 層に編集内容のスナップショット履歴を1つ持つ**（`useEditHistory`）。全単体エディタは content 構造を NetaDialog state で編集するので、**構造一式の snapshot を push/pop で復元**すれば全 kind に一発で効く（コマンドパターン不要＝簡易）。
- snapshot ＝ `{ notes, chords, rhythm, bassPattern, bassSteps, chordPat, key, mode, tempo, program, len, pickup }`（構造的な楽音編集）。**title/text/tags/mood 等のテキスト入力は含めない**（input の native undo があり・per-keystroke で履歴が汚れるため）。
- 記録＝各 state 変化を effect で検知し**変化直前**の snapshot を past へ push（future クリア）。**undo/redo 適用中は記録しない**（guard フラグ）。深さ上限（50）。past/future 長は再描画のため state（ボタン disable 連動）。
- **純ロジック（push/undo/redo）は `history.ts` に分離し TDD**。
**決定U2（scope）**：単体エディタ（melody/bass/chord/chord_pattern/rhythm）。**section/song コンテナ（SectionEditor 自前 state）は対象外＝将来**。※backlog「ネタの版管理(chat書込のサーバ側undo)」とは別レイヤ・両立。
**決定U3（UI＝案1確定）**：**TransportBar 左に ↩︎/↪︎**（親指ゾーン・縦を消費しない）。**絵文字でなく文字矢印/SVG**（⏮🔁の□化を避ける）。空スタックは disable。feedback＝内容が戻る（トーストは将来）。
**段階**：US1 `history.ts` 純ロジック(TDD) → US2 `useEditHistory` hook＋NetaDialog 配線(snapshot/apply) → US3 TransportBar ↩︎/↪︎（Playwrightで「置く→undo→戻る→redo→復活」確認）。

### ノート編集：選択・移動・複製・コピペ（2026-07-02・backlog「簡易作曲ツールA」・案A確定）
**目的**：ピアノロールで音符を選択→移動/複製/削除/コピペ。**スマホ・タッチ前提でジェスチャ衝突を避ける**（タップ=配置/削除・ドラッグ=スクロール が既にあるため）。
**決定N1（操作モデル＝案A）**：ロールに **[描く]/[選ぶ] モードトグル**。~~（既存 ロール/パッド の隣）~~ → **追記(2026-07-04)**：パッドは撤去（ロール一本・下記決定）、モードは **3つ [描く][選ぶ][消す]** に拡張（消す＝ノートtapで削除・下記「楽譜系エディタをメロ編集画面に整合」）。
- **描く**＝現行（空タップ=配置・音符タップ=削除・ドラッグ=スクロール）。不変。
- **選ぶ**＝音符タップで**選択トグル（複数可・ハイライト）**。空タップ=全解除。ドラッグ=スクロールのまま（移動は nudge）。
- 選択1つ以上で **選択バー**：`複製 / コピー / 貼付 / 削除 / ← → ↑ ↓`。
  - **移動＝nudge ボタン**（←→=グリッド(16分)単位で時間・↑↓=半音で音程）＝スクロール/誤爆と衝突しない・親指で正確。
  - **複製**＝選択を +1小節右にコピー（同ピッチ）・コピーを選択。**削除**＝選択を消す。
  - **コピー**＝クリップボード（モジュール保持＝別ネタへも貼れる）。**貼付**＝arm→次のセルタップでそこ(拍)に貼る（時間で配置・ピッチ保持）＝別の場所に置ける（ユーザー決定＝両方）。
**決定N2（純ロジック）**：`noteEdit.ts` に純関数（nudge/duplicate/deleteSel/copySel/paste）。選択＝**index 集合**、notes 配列順は**安定**に保つ（nudge で並べ替えない＝index が保てる）。各関数は `{notes, selection}` を返す。TDD。
**決定N3（Undo 連動）**：全編集は既存 `onChange` 経由＝**Undo/Redo が自動で効く**（snapshot 履歴・追加実装不要）。
**段階＝✅実装済(2026-07-02)**：NE1 `noteEdit.ts` 純ロジック(TDD6) → NE2 PianoRoll に mode/selection/選択バー/クリップボード配線＋CSS(選択=黄枠) → NE3 Playwright(選択→複製→削除 実測OK・web227緑)。範囲マーキー・ドラッグ移動は将来(v2)。

### 編集画面の共通パーツ化（2026-07-01・NetaDialog 神コンポーネント分解）
**問題**：`NetaDialog`(~470行)が編集画面の全責務（state ~24個・派生・effect・save/remove/detectKey・
history・transport・ヘッダ/メタ/body/relations 描画）を抱える神コンポーネント。**メタ折りたたみ・Undo/Redo
のような「全編集画面に効く機能」を足すたびにこの1ファイルを触る**＝差分が読みにくく回帰リスク。
※アーキ是正 S5 で `KindEditorBody`(kind別 body)は分離済。残り（ヘッダ/メタ/transport/relations/state）を共通パーツへ。
**決定（分解＝ロジックhook＋共有UI・契約先行）**：
- **`useNetaEditor(neta, {onClose,onChanged})` フック**＝編集の"脳"。全 state・派生(flags/playable/showKey…)・
  アクション(save/remove/detectKey/savePatch)・history・transport・metaOpen を所有し、`{header, meta, body,
  transport, rels, flags}` に構造化して返す。→ NetaDialog の render は**薄い合成**に。ロジックが単体テスト可能に。
- **共有UIコンポーネント（props＝契約）**：
  - `<EditorHeader>`：← 戻る / kind / title(setTitle) / 削除 / 保存(busy)。
  - `<MetaPanel>`：折りたたみトグル＋要約＋メタ本体（調/mode/拍子/tempo/音色/+4拍/tags/mood）。※MIDI書き出しは単体編集画面から撤去（2026-07-04）＝Section の いじる▾ のみ。
    **flags でどの枠を出すか決める**（kind 分岐を集約）。折りたたみ状態(localStorage)と要約はここに閉じる。
  - `<KindEditorBody>`：既存（kind別 body）。 `<TransportBar>`：既存（play/undo/redo/loop）。
  - `<RelationsPanel>`：連関ネタ。
- **NetaDialog＝合成のみ**：`const ed = useNetaEditor(neta,…); return <Editor><EditorHeader {...ed.header}/>
  <MetaPanel {...ed.meta}/><KindEditorBody {...ed.body}/>{ed.flags.isMusic&&<TransportBar {...ed.transport}/>}
  <RelationsPanel rels={ed.rels}/></Editor>`。
**原則**：契約(props)先行・**aria-label 不変**（テスト回帰ゼロ）・**1つずつ抽出**。全編集画面に効く機能
(折りたたみ/Undo/将来のvelocity等)は該当共有パーツ1箇所に入れば**全kindに一発で効く**（＝今回の折りたたみ/Undoが実証）。
**段階**：✅CP1 `MetaPanel` 抽出（折りたたみ・要約を内製）→ ✅CP2 `EditorHeader`/`RelationsPanel` 抽出（NetaDialog ~470→323行・web221緑・Playwrightで melody/chord/rhythm 回帰なし確認・2026-07-01）→ ✅CP3 `useNetaEditor` へ state/logic 移設（2026-07-01・NetaDialog **~470→102行**の薄い合成・ロジックは `useNetaEditor.ts` 243行に集約・web221緑・Playwrightで機能回帰なし[メタ展開/打点→undo]）。各段階でテスト緑・aria-label 不変。**完了＝編集画面は EditorHeader/MetaPanel/KindEditorBody/TransportBar/RelationsPanel の合成＋脳 useNetaEditor**。

### 再生
- section/song：メインペーンに**トランスポート（全体再生）パネル**。
- ネタ帳：カードを**タップで個別再生**（断片を単独 audition、調ヒントで鳴らす）。
- 音源：GM SoundFont（Tone.js＋smplr 等）。

### エディタ・メインペーン（GUI #19）
- メインペーンは**選択中の neta の種類で中身が入れ替わる**：
  - section/song → 配置（**メロ/コード/ベース/リズムの4レーン**を時間軸で埋める multitrack 風）＋トランスポート
  - melody → ピアノロール
  - chord / chord_progression → コード入力
  - rhythm → ステップグリッド
- 子netaにドリルインでペーン切替、戻ると section の配置へ（入れ子編集）。
- **編集面の出し方（決定を更新）**：旧版は「音楽編集＝全画面オーバーレイ単独」だったが、それだと一覧(ネタ帳)がホームで編集が上に乗る＝主役が逆転し、L119/135「section/song＝メインペーン」と矛盾していた。→ 一覧から飛び出すオーバーレイではなく、**作業面（メインペーン）に入っていく**ワークスペース型に統一（コンセプト「自分の続きを操る／引き出しと発展が地続き」）。「いま作業中の対象」をアプリ状態に持つ（一時オーバーレイではない）。router は当面不要・ビュー状態で実現。下記の画面構成に従う。

### 画面構成（レスポンシブ・ワークスペース）（GUI #19・決定）
家/出先で分けず、**画面幅で形が変わる**1レイアウト。「いじる(断片)」と「組み立て(section)」は同格（両輪）。
- **メインペーン（中央・主役）**：いま作業中の対象。section/song＝**4レーン(メロ/コード/ベース/リズム)配置＋トランスポート**、断片＝該当エディタ（melody=ピアノロール等）。選択で中身切替、ドリルインで子へ、戻ると配置へ。
- **4レーンと compose_edge の整合（#14準拠・スキーマ変更なし）**：`compose_edge` は `position＋ord` のままの**任意子DAG**で、lane列は持たない。レーンは**子の kind から導出**（melody→メロ／chord・chord_progression→コード／bass→ベース／rhythm→リズム）。導出の原則は現 `SectionEditor.composite()` の kind 分岐と同じ（4レーン描画自体は段階②で実装）。theme/knowledge/other 等の leaf はどのレーンも埋めない（配置対象外）。4レーンに収まらない子：**lyric** は独立レーンを作らず melody に `syllable` で流し込む（#16）／**ネストした section/song** はレーン展開せず**1ブロックとして配置**し、ドリルインで内側の4レーンを開く（入れ子編集）。＝「4レーンを埋める」は leaf(メロ/コード/ベース/リズム)の**見せ方**で、任意子DAGを壊さない。
- **ネタ帳（開閉式の左レール）**：捕獲＋一覧＋検索＝素材。畳める。

### メロ配置の調規則（2026-06-23・設計議論→確定）
セクションに別調のメロを配置したときの移調を定める。**二重に見える不定性（①コードからは調が一意に決まらない＝2-3候補 ②旋法の扱い）は、実は不定なのは①だけ**。「移調＝曲を保ったまま音高だけ動かす」と決めた瞬間、②は従属する（短調メロの移調先は相対短調に一意。平行=Cm は調号衝突、長調化=C は“移調でなく音の作り変え”＝別操作）。
- **①の解決＝推論せず宣言**：コードは調を含意するが確定しない（`detectKeyFromChords` が候補を複数返す事実）。よって **section が `key`+`mode` を明示保有**（neta に両フィールドあり）。`detectKeyFromChords` は**初期値の提案役＋2-3候補の切替UI**に格下げ＝1回だけ人/生成が調を決める。
- **配置移調は一意**：メロは**単一調オブジェクト**（メロ編集画面でも調は1つ）。配置位置（先頭小節）の section 調号へ、**メロの旋法を保ったまま**着地：
  - `sectionMajorTonic = (sectionKey + (sectionMode==="minor" ? 3 : 0)) % 12`
  - `landing = (sectionMajorTonic + (melodyMode==="minor" ? 9 : 0)) % 12`（短調メロ→相対短調／長調メロ→長調主音）
  - **【訂正 2026-06-24】メロ content は実音(WYSIWYG・`notesForContent` はメロを key 移調しない)＝主音は `melody.key`**。よって **移調半音 = landing − melody.key**（最寄りオクターブ -5..6 で音域維持）。例：F#m メロ(key=6)を Cmaj へ → landing=A(9)、shift=9−6=+3（F#→A）。
  - 当初「content は C基準＝移調量=landing・key は使わない」と書いたのは**誤り**（C基準は generate の出力のみ。手描きは実音）。`mode`＝相対/平行の選択、`key`＝主音、の両方を使う。同調(melody.key=着地)は shift=0＝後退ゼロ。
  - **整合性の前提＝「メロ content の主音 pc = melody.key」**。手描きは成立（実音＋keyを合わせる）。生成は content が C基準(主音0)なので **key も 0 であること**が条件（主 gen 経路は frame.key 未指定＝key=null→0 で OK）。もし生成で key≠0 を付けるなら **materialize 時に content を key へ移調**して実音化し前提を保つ（別タスク）。
  - **ラベル不変**：section を「C」と書こうが「Am」と書こうが短調メロは必ず Am・長調メロは必ず C に着地（同じ調号）。`mode` 不明は major 既定＝**現挙動（`pitch+keyPc`）と一致**＝同旋法は後退ゼロ、異旋法のみ是正。
- **小節内転調**：本質は「section の調が時間変化」＝将来は*調レーン*（コードレーン同様 位置ごとの key）に一般化可。今は**section が調を1つ宣言で十分**（メロは単一調・跨ぐなら区間ごとに別メロ or 明示当てはめ）。
- **平行/長調化/コード追従の当てはめ（=別操作）は既定にしない**：欲しければ AI チャット/手動、または既存 `fitToChords`/essence（輪郭+リズム保持で実コードへ再導出）を明示的に一枚重ねる（改善であって正しさには不要）。
- **コード/ベースも同じ着地に統一（2026-06-24・追補）**：当初コードは「C基準＝+keyPc」と考えたが、実音 root 保存＋短調 section で C基準content が +keyPc だと相対長調へ飛び異音（C基準ベースを Am section へ→A長調化）。そこで **コード/ベース絶対も メロと同じ `placementLanding`（mode-relative + key-aware）** に統一（`harmonyPlacementShift`・レジスタは上方向で C基準は +keyPc 後退ゼロ）。`sectionChords`（相対bass/コード楽器が当てる和音）も同経路。**結果：メロ/コード/ベースが同じ着地へ揃い、Cmaj/Am ラベル差でも食い違わない**。前提＝各 content が **key と mode を宣言**（短調 content は mode=minor 必須。未設定は major 既定＝C基準のみ安全）。生成 content の mode 自動付与は別タスク（#9 の調自動設定で実質回避）。入れ子 section は各層の `key+mode` で再帰合成し**二重移調しない**（多調曲OK）。

### 複数プロジェクト（prj: 名前空間タグ）（2026-06-24・設計議論→確定）
プロジェクトを単一→複数に。**コピーで検索が分断されるより、1ネタは正準1個のまま所属だけ多重**にする（ユーザー確定）。
- **保存＝既存 `neta_tag`（多対多）を再利用。スキーマ変更ゼロ**（design原則「スキーマ変更は高い」）。プロジェクト所属＝`prj:<名前>` タグ。N個のプロジェクトに居れば `prj:` タグがN個（自然・コピー不要・正準1個）。
- **見せ方だけ別軸**：`prj:` タグは UI で意味タグのチップ列から外し、**プロジェクト・ピッカー＋専用表示**に出す。意味タグ(mood/ジャンル)は汚れない。`isProjectTag = name.startsWith("prj:")` を境界に置く。
- **facets**：`tags` から `prj:` を除外し、`projects`（prj: を剥がした一覧）を別フィールドで返す。**library(scope=library)は全プロジェクト共有**（prj: を持たない・連想で横断）。
- **絞り込み**：アクティブプロジェクトは**クライアント状態(localStorage)**。一覧/検索は `listNeta` の既存タグ絞り込みに `prj:<active>` を渡すだけ。新規ネタはアクティブの `prj:` を自動付与。
- **非破壊移行**：既存 project ネタは `prj:` 無し＝「未分類」。データ書込の一括移行はしない（必要時にユーザーが付与 or 「未分類」ビューで見える）。撤回容易（タグ消すだけ）。~~将来厳密化したければ `project` テーブルへ昇格可。~~ → **実行済（2026-06-28）**：`project` 表（説明＋指示）＋`chat_thread` 表で器へ昇格。下記「プロジェクト＝…ホーム」節。

#### 決定：プロジェクト＝一曲(or組曲)の器・“辿れるホーム”へ昇格（2026-06-28・要件「一曲の器にまとめる」）
従来 `prj:` は「neta一覧のフィルタ」どまりだった。要件の新項目に応えて**プロジェクトを曲・ファイル・会話セッションを集約するホーム**にする。
- **階層＝Project ⊃ Song(1..N) ⊃ section ⊃ leaf**（組曲＝1プロジェクトに song 複数）。Project と Song は層として分離維持（曲箱＝kind=song の overlay は不変。プロジェクトはその上位の器）。
- **会話セッションの所属（B案・薄い表を足す）**：フリーChat の thread を器に束ねるため `chat_thread(thread PK, project, title, created, updated)` を新設。`listChatThreads(project?)` で器絞り込み。**A案（thread id に `chat:<prj>:` を埋める）は不採用**＝プロジェクト改名で全 thread が迷子（`prj:` タグは改名耐性があるのに、ここだけ脆い）。B は **改名耐性＋セッションにタイトル＋空でも一覧化**でき、既存 `song` overlay と同じ「id にかぶせる薄表」パターン。**純加算・移行不要**：既存 thread(global/chat:*)は project=NULL＝「未仕分け（インボックス）」に落ちるだけ。design原則「スキーマ変更は高い」は承知の上で、脆さ回避と副産物（セッション名）で正当化。
- **ファイル集約・曲一望はクエリで（スキーマ変更なし）**：プロジェクト配下ファイル＝`prj:` タグを持つ neta → `neta_asset` → `asset` の集約。曲一覧＝`prj:` かつ kind=song。進行中ジョブ＝neta_id が `prj:` 配下。＝既存テーブルの読みで構成（S2/S3）。
- **段階**：S1 セッション束ね（chat_thread＋listChatThreads(project)＋web セッション一覧）→ S2 ファイル集約ビュー → S3 プロジェクトホーム（曲/ファイル/セッション/ジョブのタブ一望）＋「＋曲を組む」の song/section 整合（現状 section を作る綻びを Project直下 song→section へ）。
- **Chat（右下の吹き出し→ダイアログ, Notion風）**：相談/投げる。常駐ペーンでなくバブル起動で軽量に。※体験(ペーン/ダイアログ/オーバーレイ)は要再相談。
- ペーン位置の可動は欲を言えば（後）。
- **幅で形が変わる**：広い＝メインペーン＋畳めるネタ帳レール（＋Chatバブル）／狭い(スマホ)＝メインペーン全画面・ネタ帳はタブ/シート・Chatバブル。
- **操作モデル**：開く＝**タップ**（→メインペーンにそのエディタ）／組み立て＝**ドラッグ&ドロップ**（ネタ帳→section のメロ/コード/リズム該当レーン）／狭い画面はD&D不可なので**レーン/位置をタップ→読み込むネタを選ぶ**で代替。
- **段階実装**：①メインペーン実領域化＋レスポンシブ折りたたみ → ②組み立て(D&D＋タップ選択)＋4レーン → ③Chatバブル・再生プレイヘッド等。各段階でテストを増やす。

#### 決定：反復配置(#54)・拍子(#51)・D&D(②c)・Chatバブル(③)
- **#54 反復配置**：`compose_edge` PK を (parent_id, child_id, position) に変更。`placeChild` は ON CONFLICT(parent,child,position) で冪等INSERT、`removeChild(parent, child, position)` で1インスタンスのみ解除。`getComposition` は同一childが複数行で返り得る。**SQLiteはPK変更不可→compose_edgeをテーブル再構築で移行**（既存辺は(parent,child)一意なので無損失）。フロント（レーンのブロック）は **key/aria を (child_id@position)** にし、解除は position を渡す。＝ design#14 をスキーマへ下ろす最小変更（lane列は持たない原則は不変）。
- **#51 拍子**：section が meter を支配（既存）。レーンの**小節幅＝meterから導出**。beat=四分=1.0 基準で **beatsPerBar = numerator × 4 / denominator**（4/4→4.0、6/8→3.0、3/4→3.0）。バー b の先頭 position = b × beatsPerBar。content は四分基準のままなので**合成は不変**、meterは**グリッド表示とMIDI拍子記号**にのみ効く。meter未指定は "4/4"。
- **②c D&D（PC）**：`App` に dnd-kit の DndContext を置き、**ネタ帳カード=draggable／レーンのセル=droppable**。ドロップ先セルの (lane, bar) から position を決め `placeChild`。広い画面のみ（ネタ帳＋メインペーン両方見える時）。狭い画面は既存の**タップ配置**で代替。kindがレーンに合わなければドロップ不可。
- **③ Chatバブル**：Chat を Notion風に**右下固定の吹き出しバブル**(💬)から開く。ヘッダの💬はバブルへ移設。バブルは常時表示・編集中も右下に浮く。中身は既存 Chat ダイアログを再利用。

#### 決定：参考曲エージェント(#9)
- **目的**：意図カタログの「情報収集／研究して見つける」（本文 line 226）を縦スライスで実装。テーマ→**参考曲を構造化**して提示し、学びをネタ化して貯める＝「探す／貯める」の探す側を埋める。
- **契約（worker `research`）**：返り値を `{summary, references:[{title, artist, why, points}]}` に拡張（`summary` は既存互換＝Chat/Trayのpeekがそのまま動く）。`references` は2〜5件、`title` 必須。Claudeが web 必要なら使う前提で **JSON のみ**を吐かせ、`_extract_json` で頑健にパース。非JSON/失敗時は `references=[]`・`summary=生テキスト` にフォールバック（design#43 失敗ハンドリングと同型＝空でも壊さない）。
- **ネタ化（kind=`reference`）**：参考曲の学びは `kind="reference"`・`content={summary, references}` のネタとして貯める（line 226 の knowledge/reference 化）。
  - **同期（Chat「調べる」）**：`references` を**選択カード**で出し、押すと該当1曲を `reference` ネタ化（`from_job` で紐づく）。summary の「知見化」(knowledge) は従来通り残す。
  - **非同期（plan 子・直接 job）**：`reapResults` を research にも拡張し、`references` が非空なら `reference` ネタを1つ作る（gen_* と同じ parent有り即時／120s stale 回収のガード＝二重作成レース回避）。
- **一覧**：`FILTER_KINDS` に `reference`/`knowledge` を追加して絞り込み可能に。MiniRoll は非音楽で null（不変）。
- **スコープ外（後続）**：定期スケジューラでの自動収集（design line 56）、出典URLの厳密検証、参考曲の音源取得。まず「投げて参考曲が貯まる」最小縦スライスに絞る。

#### 決定：作曲補助をUIボタン化＝チャットと住み分け（2026-07-03）
作曲エンジンは決定的TS（`POST /music/:op`）。チャットのClaudeは同じツールを叩くだけ＝**webから直接ボタンで呼べる**（分析/変換系はClaude不要＝即時・クォータ0）。チャット＝相談/探索、ボタン＝慣れたら手で、の住み分け。
- **2階層に分ける（ユーザー洞察）**：
  - **① 単体系（ネタ単独で完結 → ネタのカード/編集画面）**：崩す(gen_from_essence)・調推定・normalize・似たメロ(melody_similarity/find_similar)・トランスポーズ／コードは 説明(explain/identify)・分析(analyze_progression)・代理(substitute_chord)・次の候補(next_chord)・王道進行(gen_named_progression)。＝入力1ネタ＝文脈UI不要＝軽い。
  - **② 文脈系（複数ネタの関係が要る → Section）**：コードに合わせる(fit_to_chords)・この進行にメロ/ベース/ドラム(gen_melody/bass/drums)・噛み合い診断(analyze_fit)。**Sectionは既に文脈そのもの**（レーンに置いたメロ×コード＋frame＝調/tempo/拍子）＝「どのコードに？」の小UIが不要＝レーンを読んで実行。SectionEditorを「配置」だけでなく**組み上げの道具箱**へ拡張。
    - **✅第1弾「この進行にメロ」(2026-07-03)**：section のコードレーンの子を小節位置ぶんオフセットして1本に連結→`gen_melody`(frame＝section の key/tempo/meter/bars)→**候補パネル**(▶試聴=playNotes／別案=別seed／メロレーンに置く=createNeta＋placeChild／閉じる)。実機で 進行→メロ生成→配置を確認。残＝gen_bass/drums・fit_to_chords・analyze_fit・ハモリ。
- **ハモリの整理**：既存 `harmonize`＝メロ→**コード伴奏**（別物）。ユーザーの「ハモリ」＝**上ハモ/下ハモ＝並行する第2声部**（新オペ）。**Section側**（原メロと重ね、frameの調でダイアトニック）。まず**単純な平行3度/6度・上/下**から。時間差ズラし・上下混在は後。
- **候補主義**：生成/変換は候補(before/after)を出し「適用」は人間（既存の承認カード型を流用）。
- **候補プレビューUX（✅崩す実装 2026-07-03・全"出力する道具"の共通型）**：出力オペは即ネタ化せず**編集画面で候補プレビュー**。崩す＝メロ編集ツールバー「崩す」→**候補モード**：PianoRoll に**候補=実線/元=点線ゴースト**を重ね、下の▶は**候補だけ試聴**（元notesは不変）。バー＝強度[弱/中/強]・別案(別seed)・**新ネタで保存**(createNeta＋link variation)・破棄。＝気に入った1個だけ残る（試行のゴミが出ない）。カードの即生成は撤去。似たメロpick/ハモリ/fit も同じ型を使い回す。
- **段階**：①単体系（軽い・先）→ ②Section道具箱（大きい・後）。
- **メロ単体系＝「ツール ▾」1つに集約（✅2026-07-03）**：旧UI＝[崩す]ボタンと[道具 ▾]メニューが別置き＝「崩すもツールの一種なのに分かれている／"道具"の名が謎／スタイル不揃い」（オーナー指摘）。→ ✨wandアイコンの**単一「いじる ▾」**へ統合＝縦メニュー＝**崩す（別メロ候補）**を主役色(primary)で先頭、続けて調推定・似たメロ、`移調`小見出し下に ＋半音/−半音/＋8va/−8va(2×2)。＝崩すも移調も"メロを変える道具"として1箇所に並ぶ。名前は「道具」→**「いじる」**（"道具"は用途不明・"ツール"も英語にしただけ＝中身「崩す/調推定/似たメロ/移調」＝メロをいじる動詞に、オーナー選定）。
- **調推定＝複数候補を巡回（✅2026-07-03・特に短調）**：単一キー断定でなく `POST /music/detect_key_candidates`(top:4) が Krumhansl 相関で**上位4候補**を返す（`rankKeys`）＝相対短調が確実に上位に入る（例：C-E-G-A-C → C長調0.88 / **A短調0.75** / E短調 / C短調）。「調推定」を押すたびに候補を**巡回**（keyCandsRef/keyCursorRef・notes変化でリセット）＝キー＋旋法をセットしレポート「調推定：A 短調（2/4…）」表示（タップで消える）。長調しか出ない旧挙動＝短調曲の推定漏れを解消。

#### 決定：編集は自動保存（明示「保存」を廃止・2026-07-03）
- **問題（オーナー指摘）**：ネタ編集は**明示的に「保存」を押すまでDBに書かない**＝ローカルstateに溜めるだけ。`save()`は「書く＋閉じる」の2役で、**← 戻る（onClose）は保存せず閉じる**＝ガード無し。∴ メロを描いて 戻る／別ネタへ切替／リロード すると**黙って全消え**。スマホでは戻るを誤爆しやすく「消えやすい」。
- **要件と照合**：req L32「要はメモ書き」・L46「面倒だと続かない」・**L66「編集は取り消せる/やり直せる(Undo/Redo)＝道具の基本」（実装済）**・**L174「メモ…データが消えないようにする」**。→ 明示保存モデルは L174 に反し、Undo という安全網があるのに"保存しない＝逃げ道"を兼ねさせるのは筋が悪い。メモ道具（Notes/Keep）に保存ボタンは無い＝**書いた瞬間に残る**が当たり前、ミスは Undo で戻す。
- **決定＝自動保存**：編集で patch が変わったら**デバウンス(≈600ms)でPATCH**（`useNetaEditor`）。「保存」ボタンは**保存状態ピル**（保存済✓／保存中…／未保存＝押すと即フラッシュ）へ格下げ。**← 戻る・別ネタ切替(unmount)・リロード(beforeunload keepalive)** で未保存ぶんをフラッシュ＝取りこぼさない。ミスの取り消しは既存 Undo/Redo（req L66）。**先例**＝song overlay は既に blur 自動保存（SectionEditor）。
  - **ヘッダ整理（2026-07-04・全編集画面共通 EditorHeader）**：保存状態ピル→**丸チェックアイコン**（保存済=緑✓／未保存=橙丸／保存中=くるくる）、削除→**ゴミ箱アイコン**、ともに**右上**へ。さらに**kind ラベルを撤去**＝一行目が重い(オーナー)＝種類は本体(ロール/グリッド等)と色で分かるので冗長。← 戻る＋タイトル(広く)＋右上2アイコンだけの軽い1行に。
- **例外＝候補フローは明示のまま**：崩す等の**出力オペ（候補プレビュー）は従来通り明示「新ネタで保存」/破棄**（元notesは不変・別ネタ化＝自動保存の対象外）。「直接いじる＝自動保存」「候補を採る＝明示commit」で住み分け。
- **残（backlog）**：Undo は現状**セッション内のみ**＝閉じて開き直しての巻き戻しは無い（「undo/redo 版管理」案件）。自動保存で"誤編集が残る"時はその場でUndo。将来は版スナップショットで跨ぎUndoへ。

#### 決定：単体ネタの編集画面から MIDI 書き出しを撤去（薄く保つ・2026-07-04）
- **問題（オーナー）**：メロ/ベース等の編集画面に MIDI 書き出しがあるが、単体ネタを個別に書き出す場面は薄い＝編集画面が重い。
- **決定**：MetaPanel の `MIDI`（`f.isMusic` 条件）を撤去＝メロ/ベース/コード/リズムの編集画面から消す。**Section 本体の書き出し（`MIDI`／`MIDI(分割)`＝合成/多トラック）は維持**（曲単位の書き出しが本来の用途）。`onExportMidi` チェーン（MetaPanel/NetaDialog/useNetaEditor）ごと削除。
- **将来（未着手）**：単体を書き出したくなったら「エクスポート機能でネタを選ぶ」導線（オーナー案）。編集画面には戻さない。

#### 決定：種別フィルタをアイコン化＋生スネークの排除（2026-07-04）
- **問題（オーナー）**：①種別での絞り込みが「生スネークの `<option>` セレクト」で、作成のアイコングリッドに比べて見づらい＝アイコンで絞りたい。②カード/編集画面で種別が英語スネーク（`chord_progression` 等）そのまま出てフィールが悪い。
- **決定①＝フィルタを作成と同じ7アイコンに（2手目で確定）**：`<select>{生key}` を廃止。最初はチップ（アイコン＋ラベル・全filterable）にしたが、オーナー追い指摘＝「作成と順が違う／作成と同じ絵・種別色・**ラベル無し**で**7つ1行**／開閉が分かりづらい」。→ **作成グリッドと同じ7種・同じ順**（メロ/コード(chord_progression)/歌詞/曲(=section)/リズム/ベース/テーマ）を**種別色のラベル無しアイコン1行**（`.filter-kinds` 7列グリッド）に。選択中はその種別色でリング。**開閉トグル(絞込▾)は廃止＝常時表示**（分かりづらさ解消）。mood は下に控えめな一行で常時。niche種別(chord/chord_pattern/reference/knowledge)はクイックフィルタから外す＝検索で対応。曲スロットは実体に合わせ section で絞る。
- **決定②＝生 kind 表示を `KIND_LABEL` に統一**：カード(NetaList 濃淡両方)・編集ヘッダ(EditorHeader)・トレイ(Tray)・連関(RelationsPanel)・Section(others/picker/ブロックlabel) の生 kind を日本語ラベルへ。SSOT は既存 `kinds.ts:KIND_LABEL`。※ProjectScreen の `f.kind` は**ファイル種別**でネタ種別でないため対象外。
- web243緑・実機でアイコン絞り込み＋日本語ラベルを確認。
- **追い直し（2026-07-04・実機360px）**：常時表示化で `.filter-kinds` の 7列grid（aspect-ratio）min-content が 386px を要求→ `.notebook` の暗黙列(auto)を押し広げ**横スクロール**が発生。修正＝`.notebook { grid-template-columns: minmax(0,1fr) }`＋`.filter-kinds { repeat(8, minmax(0,1fr)) }`（列を縮められるように）。**コード楽器(chord_pattern)を8番目に追加**＝探せる（オーナー要望）。併せてピッカーの見切れ＝`.picker-item-meta { flex:1 }` 欠落でタイトル(nowrap)が省略されず膨らむのを修正（ellipsis 効く）。実機360pxで docScrollW=vw を確認。

#### 決定：メロはロール一本（パッド入力を撤去・2026-07-04）
- **問題（オーナー）**：メロ編集の `ロール/パッド` トグル。**パッド(StepPad)＝使わない**（スケール外が出せない・16step1小節固定で表現が狭い）。アルペジオ的に使う可能性はあるが、それは**アルペジエーターとして別実装すべき**（[[backlog]] 送り）。
- **区別**：`ロール/パッド`（メロの入力方式）と、`ベースの絶対/相対`（度数グリッド＝コード楽器と同じパターン入力）は**別物**。**ベース相対は必須で維持**（オーナー明言）。触るのはメロのパッドだけ。
- **決定**：メロは**ピアノロール一本**。`ロール/パッド` トグル＋`StepPad`（コンポーネント/テスト）＋ `melodyView` state を撤去（KindEditorBody/useNetaEditor/NetaDialog）。`showRollBars` は `melodyView` 依存を外す。描く/選ぶ＋いじる▾ はそのまま。web243緑・実機でメロ=ロールのみ/ベース=絶対・相対健在を確認。

#### 決定：Section 作り時のピッカーを「絞れてる」に（データの扱い・2026-07-04）
「元ネタは大量に貯めたい×Section 作り時に多すぎて選べない」を両立＝**貯める pool と置く時に見える集合を分ける**（オーナー）。
- **A. 母集団を器(プロジェクト)で絞る**：ピッカーは既定でこの曲の器の自作ネタのみ（`prj:`タグ由来）。`元`セレクトで「自作すべて」や他器へ広げられる。取得は `scope:project`（コーパスは取らない）。
- **B. 相性順＋拍子一致**：拍子一致のみ既定（`拍子違いも`トグル・meter未指定は中立で表示）→ 調は**五度圏距離**が近い順 →最近順。「拍子違いネタが混じって困る」を解消。
- **C. コーパス(大量library)は直接選ばせない**：生の1781件（1425メロ＋356進行）リストは撤去。**推薦(おすすめ)経由**にする＝section の調/拍子から関連数件だけ返す。
- web259緑・実機で器/拍子フィルタを確認。

#### 決定：ピッカー Phase2＝おすすめ（コーパス推薦）を実装（#20・2026-07-04）
上記Cの「推薦経由」を実装。**軸（ユーザー選定＝軽い方式）**：拍子一致 → 調が近い順（五度圏）→ ばらけ（idハッシュで擬似シャッフル・決定的）→ 上位K(既定6)。
- **サーバ側で top-K**：`GET /neta/recommend?kind&meter&key&top` → `core.listNeta({scope:"library",kind})` を `rankRecommendations`（純関数・`music/recommend.ts`）でランク＆キャップ。生1781を web に流さない（design原則「関連数件だけ返す」を経路として実装）。
- **対象は melody / chord_progression のみ**（コーパスはこの2種だけ・bass/rhythm/chord_pattern は無し）。ピッカーの種別タブに応じて `corpusKindFor(lane)` で決定、無い種別は strip 非表示。
- **実測の含意**：コーパスのメロは**全て keyless（C基準断片）**＝調ランクは中立に落ち、実質「拍子一致＋ばらけ」で数件。進行は調付きもあるので調ランクが効く。
- **UI**：ピッカーの「＋新規作成」の下に**おすすめ（コーパス）＝横スクロールの小さな概形タイル**（自作リストは縦・視覚的に分離）。tap＝`placeAt`（library→project にコピーして配置＝元コーパスを汚さない・既存導線）。
- **残（Phase3・任意）**：文脈適合ランク（section にコードがあればコード適合度でメロを、メロがあれば相性で進行を）＝より musical な推薦。今回は「軽い」方式で確定。
- api428緑（recommend純関数4＋http1）・web263緑。実機E2E：メロ=6件/リズム=0件（コーパス無し種別は非表示）/コード進行=6件、console error 0。

#### 決定：曲/セクションの階層を実コードで実現（#5・2026-07-04）
`docs:413` が既に宣言する **Project ⊃ Song ⊃ section ⊃ leaf** を**コードで enforce**（今まで「＋曲を組む」は kind=section を作り、section が section を入れ子にできる＝宣言と乖離していた）。ユーザー選定＝**フル実装**。
- **section＝ひとつの音楽ブロック**（Aメロ/サビ等）：レーンは**パート専用**（コード進行/メロ/コード楽器×2/ベース/リズム）。**section-in-section を廃止**＝「セクション」レーンを section から外す。尺は据え置き（MIN 8・**MAX 32**）。
- **song＝セクションの編成**：レーンは **[セクション] のみ**。song の timeline に section ブロックを時間順に並べる（tap で潜って中身編集・戻ると編成へ）。尺は長め（**MAX 64**・配置で自動伸長）。
- **「＋曲を組む」＝kind=song を作る**（App.createSong / NetaList 一式）。song 内で section を新規作成・既存 section を配置（ピッカーの section レーン）。
- **エンジンは無改修で成立（重要）**：`compositeNotes`/`childDur` は既に **section/song を再帰合成**（#15 の入れ子対応）＝song(→section→leaf) の再生・尺は既に正しい。よって変更は**表示とレーン導出の差し替えだけ**（レーンを container kind で選ぶ）＝低リスク。
- **container kind でレーンを選ぶ**：`SECTION_LANES`（パート）／`SONG_LANES`（[section] のみ）を `neta.kind==="song"?SONG_LANES:SECTION_LANES` で。`MAX_BARS` も kind 依存。
- **いじる▾（生成/ハモリ）は section 専用**：生成はパート（メロ/ベース/ドラム）を作る道具＝song 直下には置かない。song の いじる は **書き出し(MIDI)のみ**。
- **カードプレビュー**：`SectionMini` を container kind で分岐＝song は**構成（section 帯）**、section は従来の4パート帯。
- **非破壊移行**：既存の kind=section（"新しい曲" 等）はそのまま section として使える（standalone 可）。新規のみ song 化＝回帰ゼロ。将来「section を song に昇格」導線は任意（[[backlog]]）。
- **song が直接パートを持つか？→ 持たない**（sections-only）。全体ベース等の"通しパート"要求が出たら再検討（今は明快さ優先）。

#### 決定：UI/ブランド刷新まとめ（Otomemo・ヘッダ・ピッカー・タイル・2026-07-05）
表示名・ヘッダ・ピッカー上部・作成/絞り込みタイルをまとめて整理（オーナーと反復）。**リポジトリ/プロジェクト名は `creative_manager` のまま**、アプリの**表示名だけ Otomemo**（`App.APP_NAME` 定数1箇所・ロゴSVG＝吹き出し+♪＝"サッと音のメモ"・`public/favicon.svg`・title「Otomemo — 手早く音のメモ」）。名前の由来＝「手早く音を出してメモできる」を伝える（音メモ）。
- **ヘッダ＝パンくず**：`[♪ロゴ Otomemo →ホーム(ネタ帳)] › [プロジェクト名 →器画面] … [📥受信箱][⚙設定]`。旧「☰=ホーム(ハンバーガーの意味ズレ)/♪飾りロゴ/🏠でホーム2重」を解消＝現在地と帰り道が明確。ネタ帳レール開閉の ☰ は **PCのみ**（サイドバー切替はPCでは慣習的で紛れない）。※旧 header 記述「App ヘッダ(🏠…)」(下の ProjectScreen 磨き節)は 🏠 撤去で古い。
- **ピッカー上部**：種別タブ(6個)を**撤去**＝タップしたレーンに固定（別パートはそのレーンのセルをタップ）。置く種別は**ヘッダのパンくずに色付きアイコン＋パート名**で表示（`Section ▸ [色アイコン]パート ▸ N小節目`）。おすすめの kind は `corpusKindFor(picker.lane)`（タブでなくタップしたレーン）で決定。絞り込み＝検索を主役に、下に `[自作すべて▾（元ラベル無し）]＋[拍子一致のみ トグルボタン]`（旧「元セレクト/拍子違いもトグル」は文言変更）。おすすめ帯＋自作リストの各項目に **▶試聴**（`previewNeta`＝配置前に耳で確認）。ダイアログは `grid-template-columns:minmax(0,1fr)` で画面幅に固定＋`align-content:start`（帯はスクロール・行は間延びしない）。
- **作成タイル（ホーム）**：グループ分け（見出し無し）＝**パーツ行(メロ/コード/ベース/リズム/コード楽器)** ＋ **組み立て・文字行(セクション/曲/歌詞/テーマ)**、取込は全幅別行。**chord_pattern・section・song タイルを追加**（従来は編集画面にあったが作成導線が無かった）。
- **絞り込みタイル**：作成と**同じ9種・同じ順**（メロ/コード/ベース/リズム/コード楽器/セクション/曲/歌詞/テーマ）＝アイコンのみ(ラベル無し)。曲(song)を追加、section と別々。
- **色SSOT**：kind→色は `kinds.kindColor(kind)`（chord系は --k-chord に畳む）に集約。ピッカー項目は各アイテムに自前の `--k` を設定（旧: 編集中 section の --k=橙 を継承してメロ概形が橙になるバグを是正）。
- web271緑・実機で確認（favicon 200・パンくず・ピッカー色/密度/▶）。

#### 決定：MIDI多トラックのトラック名は ASCII（文字化け回避・2026-07-05）
`@tonejs/midi` はトラック名を Latin-1 で書くため、日本語レーン名(メロ/ベース等)が DAW で文字化けする。→ `LANE_MIDI_NAME`(Melody/Chord/Bass/Drums/Keys 1/2)で **ASCII名**を渡す。音符の秒時刻・テンポ・拍子ヘッダ・ドラムch10・多トラック分けは検証済で正しい（`midi-export.test.ts`）。

#### 決定：カードの生成は決定的 `/gen/section` に一本化（旧worker gen_* 撤去・2026-07-05）
受け入れテスト(GN-08)で、ネタカードの `生成▾→全体/メロ/コード/リズム` が **worker(Python)前提の `createJob`→`pollContent` 経路**のまま残っており、worker 非稼働時に「生成中…」で**無限ハング**していた（＝「worker脳撤去→Claude脳」移行の置き去り）。
- **修正**：カードの生成を **単一の「作例を生成」→ 決定的 `POST /gen/section`（純TS・genChords/genChordPattern/genMelody/genBass/genDrums を即実行、worker/クォータ不要）**に一本化。`frame` はネタの `key/tempo/meter` から。旧 `generate()`/`intentOf`/`pollContent`（カード側 worker 経路）は撤去。
- **パート単位のいじり**（この進行にメロ/ベース生成 等）は**コード文脈のある Section エディタの「いじる▾」に委ねる**（GN-01/02 で決定的動作を確認済）。カード＝ゼロから一式の足場、エディタ＝文脈ありの精緻化、と役割分離。
- 契約テスト更新（`NetaList.test.tsx`＝「作例を生成」で `genSection` 呼び・`createJob` 不使用）／live 実UIで **0.6s・ハング無し**を確認。web277緑。

#### 決定：Chat 4ユースケースの実装設計（アナリーゼ/歌詞↔メロ/次の一手/機材相談・2026-07-05）
`usecases-chat.md` で定義・優先化した4つを実装する（オーナー「全部やる」）。Chat＝`claude -p`＋creative-manager MCP＝**各機能はMCPツール追加＋Claudeがユーザーのセリフで振り分け**（プロンプト例＝usecases-chat）。実装順＝**③→④→②→①**（坂の低い順）。

- **③ 次の一手ナビ／詰まり打開（軽）**：新ツールほぼ不要。Claude に「今の曲の状態」を渡す**文脈設計**＝target の SongStatus＋`get_composition`（埋まり具合/欠けレーン）＋`analyze`（噛み合い）を turn 文脈に載せ、「次どうする？/サビ決まらん」に**次アクション＋選択肢**。作れるものは既存 generate/fit で候補ネタ。
- **④ 機材相談＋グローバル知識（軽〜中・横断）**：**機材知見は器の外＝全曲共通のグローバル知識**。`kind:knowledge`＋`機材`タグ＋**`prj:`無し**（どの器にも属さない横断ネタ）。**専用グローバル入口を作る（確定）**＝ヘッダに「機材」チャット/エリア（特定曲に紐づかない）・ここの知見化は全部グローバル機材KBへ。**横断参照**＝どの器チャットでも機材ワード→Claude がグローバル機材KB(`機材`タグ knowledge)を検索して答える＋知見化はグローバルへ（活性 prj には紐づけない）。実装＝知見化の行き先に「機材(global)」＋グローバル入口＋検索スコープ。
- **② 歌詞↔メロ相互変換（中）**：歌詞→メロ＝`gen_melody` に**歌詞制約**（モーラ数→音数・日本語アクセント/強拍）を追加、Claude が「この歌詞にメロ」→lyrics付きで叩く（複数候補）。メロ→仮歌詞＝メロの音数/譜割りを制約に Claude が仮歌詞（母音/語感）→`Note.syllable` に載せる。※歌詞制約の精度は着手時に実験。
- **① アナリーゼ（重・GO確定）**：**入力＝ファイル主＋YouTube URL対応（確定）**。URL→**yt-dlp**で一時音源DL（**best-effort**＝2024 SABR/POトークンで失敗し得る→失敗時「ファイルをアップして」にフォールバック）。ファイルは chat アップロード（MIDI取込と同型の一時asset）。**音源は解析後に削除**（著30-4＝派生事実のみ残す）。パイプライン＝`audio_analyze` job →**api内 Python音声CLI(A案)**＝`_audio_poc/analyze.py` を整備（Demucs分離→BPM／**調はBTCコード頻度から**（POC修正・librosa単独は不採用）／音域=pyin／コード=BTC）→{facts JSON}。継続調査と同じ job consumer に intent 追加＝「投げて→裏で→トレイ」。Claude が facts を**アナリーゼ文**に統合（メロ特徴の言語化）。出力＝アナリーゼ知見ネタ（事実＋所見・信頼度）＋コード/メロは候補ネタで落とせる。stem/facts は asset キャッシュ。実行基盤=**A確定**（新サービス建てず api が CLI spawn）。

#### 決定：継続調査(scheduled research)を api 内 claude 実行器で動かす＝worker撤去（2026-07-05）
継続調査は `schedule → job(research) → worker(Python claude_prompt) → reaper → reference ネタ → トレイ` の
producer-consumer だったが、**worker が非稼働＝consumer 不在**で job が queued のまま溜まり動かなかった（受け入れ ST-07 は有効化までしか踏めず）。gen_* は今日 決定的TSへ移した（GN-08）ので、**research/collect を api が引き取れば worker は不要**になる（memory「worker脳撤去→Claude脳」と一直線）。
- **設計＝王道の「実行器差し替え」**：schedule/job/reaper/トレイ/トグルは**不変**。consumer だけ Python worker → **api 内ループ**に。api は `claude -p <prompt>`（Max認証・単発・web可・MCP不要＝research は純テキスト）を叩き（worker `claude_prompt` の node 版・PATH補強と detached プロセスグループ kill は chat-session.ts と同型）、`{summary, references[]}` を job.result_summary に書いて done に。**既存 reaper が done research を reference ネタ化しトレイへ**（契約そのまま）。
- **実装**：`research-runner.ts`（`claudeShot`＝spawn/timeout/killpg・`researchPrompt/collectPrompt`＝純関数・`parseResearch`＝JSON抽出の純関数・`runResearchJob(core,job,shot?)`＝shot 注入可でテスト可能）／JobRepo に `claimQueued(intents)`(queued→running 原子的)・`completeJob(id,result)`・`failJob(id,err)`／main.ts に research consumer（直列・in-flight ガード・5s tick 相乗り）。
- **スコープ**：research/collect のみ（継続調査の対象）。import_midi 等 他 intent は当面据え置き（別途）。二重 claim は api が唯一の consumer＋原子的 UPDATE で回避。
- テスト：parseResearch（正常/prose混じり/壊れ→fallback）・prompt 構築・**runResearchJob に fake shot を注入して claim→done→reap→reference ネタまで**を検証（claude 実発火は throwaway で1回スモーク）。

#### 決定：Chat の旧ジョブ流路を撤去＝承認ワークフローは「調査系タスク」で作り直す（2026-07-05）
`#100` の常駐 claude ストリーミング化(`send→run→runStream`)で、旧ジョブ流路 `runJob`/`waitForJob`/`finishWait`/`handleConsult` が**丸ごと未参照デッド**になっていた（`run()` が `runStream` 直行になり `runJob` が孤児化）。そこにぶら下がる **承認カード(`ProposalGroup`/`ProposalCard`/`すべて承認`/原本↔提案の並置)・`options→pick`・`references→saveRef`・待ち進捗(`waitInfo`)＋`待たずに戻る`** は、コンポーネントとテストは残るのに UI から到達不能だった（受け入れテスト CH-03/04/06/07）。
- **判断＝A案（撤去＋意図の退避）**（オーナー選択）。B案（streaming に承認カードを再配線）は不採用：**同期の単発変異はすでに可逆な書込カード(`capture`→開く/取り消す)で足り**（承認ダイアログは過剰）、承認/トレイ配送が真に効くのは**非同期バッチ（調査系タスク）**で、それは別の実行基盤（Claude コマンドを裏で走らせる形）を要する＝旧コード復活では目的地に着かない。
- **撤去したもの**：Chat.tsx の `runJob`/`waitForJob`/`finishWait`/`handleConsult`/`pick`/`applyProposal`/`saveRef`、`ProposalCard`/`ProposalGroup` と型(`Proposal`/`Opt`/`Ref`/`PStatus`)、`waitInfo`/`cancelWait`、Msg の `options`/`references`/`proposals`/`summary`/`jobId`、対応する死にCSS(`.proposal-*`/`.bs-option*`/`.ref-*`/`.wait-cancel`/`.wait-bar-fill`)。**生きている縦スライス（runStream・候補/可逆書込カード・知見化・開く/試聴・inflightバナー・実況/不確定バー）は不変**。web273緑・tsc緑・実UIスモークで Chat 正常描画/JSエラー0/承認カード残0を確認。
- **退避した UX 契約（＝将来「調査系タスク＝Claude コマンド化」の受け入れ条件。backlog に対応項目）**：
  1. **承認ワークフロー**：機械の変異提案を*即適用せず*、原本↔提案を並置して試聴・比較→個別承認/`すべて承認`→承認時のみ書込。※単発の可逆変異は現状の書込カードで足りるので、これは**複数提案のバッチtriage**が要る時に導入する。
  2. **裏で続行→受け取りトレイ配送**：長時間タスクはチャットを閉じても裏で走り、結果がトレイ📥＋由来チャットに届く。
  3. **待ち UX**：確定進捗(done/total)＋`待たずに戻る`（＝裏で継続）。今の同期ターンには不要、非同期タスク復活時に再導入。
  - 実行基盤は worker(Python) 前提でなく **Claude コマンド（headless Claude が調査/生成を実行しネタを書く）**で設計し直す（memory「worker脳撤去→Claude脳」と整合）。

#### 決定：受け入れテスト残の潰し込み（MIDI/検索/器削除・2026-07-05）
受け入れテスト(69ケース)で挙がった非fail項目を実装で解消：
- **合成MIDIのドラム分離（SG-04）**：`notesToMidi` は1音でも `drum` があるとトラック全体を ch9 固定＝ピッチ楽器が DAW でドラム音源で鳴っていた。**ドラムと非ドラムが混在する時は別トラック**（ピッチ=既定 program／ドラム=ch9）へ分離。純メロ/純ドラムは従来通り1トラック。
- **検索のフェイルサイレント解消（FS-04）**：cm-search 不通時に `/search` が黙って keyword-only に劣化していた。`{ items, semanticOk }` を返し（`semanticOk=res.ok`）、UIで「意味検索が使えません（キーワードのみ・近い候補は出ません）」を控えめに告知。
- **器（project）の削除**：DELETE `/projects/:name` を新設＝**所属タグ `prj:` を全ネタから外す（ネタは残す＝未仕分けへ）＋説明/指示 overlay を削除**。破壊的でない（ネタは消えない）。プロジェクト画面の編集パネルに「器を削除」（危険色・確認付き・件数明示）。空の器も row 削除で消える。
- テスト先行（midi 混在／search semanticOk=false／deleteProject 空・中身あり）。throwaway API(loopback:8799・temp DB)で live 検証＝本番サーバ無停止。※`/search` 形と DELETE は **API コード変更＝本番 api の再起動で反映**（`CM_HOST=100.109.159.48 pnpm --filter @cm/api exec tsx src/main.ts`）。

#### 決定：仕様齟齬2件の整合（拍子は全パート編集可／ピッカーはレーン固定・2026-07-05）
受け入れテストで仕様書と食い違った2点を整合：
- **拍子（meter）を単体パートでも編集可に（MB-05）**：旧 MetaPanel は拍子 select を `isContainer` 限定で出し、かつ保存 patch も container のみ meter を含めていた＝**テンポ/音色/弱起は単体で変えられるのに拍子だけ不可**という非対称。テンポ(showMeta)と同集合（全ての拍グリッドkind＝melody/bass/chord/chord_pattern/rhythm＋section/song）で編集可に統一。meter は roll のグリッド（小節線・6/8=12step等）と MIDI 拍子ヘッダに効くので、単体パートでも意味がある。`useNetaEditor` の保存 patch にも各パートで meter を追加。
- **ピッカーは「タップしたレーンに kind 固定」＝種別タブは出さない（SC-02・意図どおり）**：配置ピッカーはレーン（メロ/コード/…）の空セルから開くので、**置く種別はそのレーンで決まる**＝種別で絞るタブは不要（撤去済）。絞りは 器（元ネタ）／拍子一致／検索（曲名・アーティスト）＋おすすめ（コーパス）。ヘッダの kind アイコンは「今どのレーンか」の表示。＝受け入れ仕様の「種別アイコンで絞る」は本設計では非該当（コードが正・仕様書の期待を本設計に合わせる）。

#### 決定：楽譜系エディタを「メロ編集画面」に整合（②④⑤・2026-07-04）
6種の編集画面（メロ/ベース/コード/コード楽器/リズム/Section）をスクショで横並び確認し、**一番リッチなメロ編集画面を基準**に骨格を揃えた（オーナー「機能とデザインはメロディ編集画面に揃える」）。共通骨格＝**`.roll-toolbar`＝modesトグル(左) … `いじる ▾`(右)**。
- **④ メロ/絶対ベースに「消す」モードを追加**：PianoRoll の `mode` を `draw|select` → **`draw|select|erase`** に拡張。modes 行を **[✎描く][▭選ぶ][⌫消す]** の3つに（`.proll-modes`・KindEditorBody）。消す＝**ノート tap で削除・空セルは無反応**（描くの「空タップ=配置」とカニバらない）／消す中はノートを**赤い破線(`.proll-note.erasing`)**で示す＝Section の `lane-block.erasing` と同流儀。選択編集(複製/コピー/nudge)は選ぶ専用のまま。位置は**いじる と同じ modes 行**に置く（オーナー「メロのデザイン位置がいじると合わせて正しい」）。
- **⑤ Section の生成/書き出しを `いじる ▾` メニューに集約**：旧 `.section-actions`＝[MIDI][MIDI(分割)][この進行にメロ/ベース/ドラム][上/下ハモ][コードに合わせる][噛み合い診断]の**ラウドなボタン壁**を撤去。メロ編集画面と同じ**✨wand「いじる ▾」**の縦メニューへ＝`この進行に生成`（メロ/ベース/ドラム・needsChords でフィルタ）／`メロ加工`（上/下ハモ・コードに合わせる・噛み合い診断＝メロ/コードがある時）／`書き出し`（MIDI・MIDI（分割））。**MIDIも menu 内へ**（Section 書き出しは維持しつつ薄く）。候補プレビュー中(cand)は生成群を隠す。
- **② 全体整合**：Section の `[✎通常][⌫消しゴム]` トグルを section-bars 行から**この共通 roll-toolbar（modes 左・いじる 右）へ移設**＝メロと横位置が一致。カード自動更新は既に `SectionMini` の dep を `[neta]` 化で解消済（MiniRoll.tsx）。
- web262緑（PianoRoll 消すモード＝ノートtap削除/空セル無反応・Section いじる▾ は閉で隠れ開で生成/書出が出る）。実機E2E（Playwright・loopback）でメロ=3モード＋erasing描画・Section=いじる▾集約を確認。

#### 決定：Section から子ネタを直接 修正/作成（導線・2026-07-04）
Section を触っていて「各パーツを Section から直接 修正/作成できたほうが導線が良い」（オーナー）。
- **土台**：mainpane は App の単一 `active: Neta|null` で駆動＝`setActive(n)` でどのネタも開ける。`onChanged` は既に App→NetaDialog→KindEditorBody→SectionEditor と流れる＝**同経路に `onOpenNeta` を1本足すだけ**。自動保存（2026-07-03）で往復してもロスなし＝実現が軽い。
- **① 修正＝ブロック tap で編集／外すは消しゴムモード**：旧 tap=配置解除 を入れ替え＝**tap→`onOpenNeta(子)` で子ネタの編集画面へ潜る**。~~長押し(500ms)→配置解除~~ → **撤去**：配置解除は共通 `.roll-toolbar` の **`[⌫消しゴム]` モード**（tap＝外す）に移した（2026-07-04「楽譜系エディタをメロ編集画面に整合」・下記④⑤ブロック参照）。長押し=外すは「tap 伸ばし(③ループ)とカニバる／分かりにくい」で撤去。右端グリップ(③ループ)は消しゴム中は無効。
- **② 作成＝ピッカーに「新規作成」**（オーナー「探してないから作るか、的な」）：空セル→ピッカー上部に**「＋ 新しい〈レーン〉を作る」**（検索語があればタイトルに）→ `createNeta({kind})`→配置→**そのまま編集を開く**。コード進行レーンは `chord_progression` を既定に。
- **戻る＝元の Section に戻す（ナビ履歴）**：App に `navStack: Neta[]`。潜る=`drillNeta`(今の active を積む)／トップ open(一覧/Chat/プロジェクト)=`openTop`(履歴クリア)／`← 戻る`=スタックがあれば親 Section に戻す・無ければ従来（一覧/器へ）。**Section in Section も同じ経路で潜れ・戻れる**（オーナーが唯一気にした所＝ナビ履歴で破綻せず）。web245緑・実機で潜る→戻るでSection復帰＋新規作成→編集直行を確認。

#### 決定：Section の4点改善（オーナー実使用フィードバック・2026-07-03）
出先で Section を組んで見えた4つの引っかかり。各1つずつ設計フォークをオーナーが選定。
- **① 進行トラックは無音の骨格に（発音を止める）**：現状 `compositeNotes` は chord/chord_progression を **GM49ストリングスのブロックコードで発音**していた＝設計CP1「進行は抽象・伴奏は chord_pattern が担う」と食い違い。→ **進行は音を出さない**（`compositeNotes` の該当kindは `[]`）。ただし `sectionChords` 文脈（コード楽器/相対ベース/メロ配置の解決先）は従来どおり進行から構築＝**骨格の役目は保持**。コード楽器未配置なら和音は鳴らない（それが正）。既存の合成テストは進行の自前発音(program48)を検証していない＝後退なし。
- **② コード楽器レーンを2本に**：ピアノ＋パッド等を**同時に鳴らしたい**。LANES のコード楽器を2レーン（コード楽器1/2）へ。**再生は元々全 chord_pattern 子を鳴らす**ので発音側は変更不要＝**UIの占有制限とレーン識別**だけ。識別は placement の **`ord`**（0/1＝行）を流用（ord は並び/zヒントで本質非依存・db compose_edge に既存列）。占有判定は (行×位置) 単位。
- **③ 繰り返しは右端ドラッグでループ伸ばし**：既存パートの再配置が「空セルタップ→ピッカーで選び直し」で重い。→ 置いたブロックの**右端ドラッグで伸ばす＝その範囲に同じ子をタイル反復配置**（compose_edge は PK に position を含み**同じ子を別位置に反復配置できる**＝#54・スキーマ不要）。伸ばした各小節に placeChild、縮めたら末尾の反復を外す。ピッカーを経由しない。
- **④ Section カードに中身プレビュー**：カードの `MiniRoll` は section で `[]`＝**何も描けず中身不明**。→ **レーン帯のミニ・タイムライン**（メロ/コード/ベース/リズムの各行に、どの小節が埋まってるかを帯で図示＝編集画面タイムラインの縮小版）＋小節数。子は `getComposition` を**カード表示時に遅延取得**（section/song カードのみ・数は少ない＝許容）。
- **段階**：①(小・合成の純関数＋テスト) → ④(カード・スキーマ無) → ③(ドラッグ反復・スキーマ無) → ②(2レーン・ord流用)。各縦スライスで緑にしてから次へ。**✅全4点 実装済(2026-07-03・web243緑・各実機確認)**。

#### 決定：モバイル・ファーストビューの整理（案A・2026-07-03）
サブエージェント診断＋オーナー所感＝ファーストビューが「ガチャガチャ」＝(1)作成7タイル＋取込4で上半分が"ボタンの壁"・主コンテンツ(カード)が下すぎ (2)ボタンのスタイル言語が3系統混在 (3)色が装飾で氾濫。**制約＝出先メモでは作成がメイン導線＝上＋1タップは維持**（＋新規に畳む案は不採用）。
- **採用＝案A（比較モックで選定）**：作成は上に残すが**コンパクトなアイコングリッド**（既存 `KindIcon` を主役に・色は"塗り帯"でなく**アイコン**へ寄せて氾濫を抑える・4列・低背）。並びは**メロ優先**（[[feedback-priority-melody-first]]）。取込4つは grid 内の**「取込」タイルに畳む**（＝作る/取り込むは同じ"ネタを増やす"）。
- **段階**：Stage1＝作成グリッド＋取込畳み✅。Stage2＝フィルタ畳み＋scope圧縮✅。ボタンスタイルは塗り(主)＋トグル(選択)の2系統へ統一。各段 Playwright で現状と見比べ。
- **決定：scope×器ナビの統合（案1・2026-07-03）**：旧＝スコープタブ(プロジェクト/ライブラリ)＋器チップの**2段が"気持ち悪い"**（似た見た目で役割違い＋「連想元」が難解）。→ **1行に統合**：`[すべて][未仕分け][器…][＋] ｜ [📚ライブラリ]`。すべて/未仕分け/器＝作業ネタの絞り込み、区切りの先「ライブラリ」＝連想元の参考素材（別の場所・全プロジェクト共有）を**紫系＋コレクションアイコンで区別**。器チップ押下は project scope へ復帰＋バケツ選択、ライブラリ押下は library scope。モックA/B/C比較で案1採用。

#### 決定：ネタ帳一覧の詰め（カード式管理UI・研究 `2026-07-02-card-and-create-ui-patterns` 由来）
研究結論＝**作成側（タイル＋チャット委譲）は王道で詰めどころ少／詰めしろは一覧側**（NN/g：カード羅列はスキャン・比較が弱い＝多数を見比べる時はリスト/コンパクトが要る）。3段で下ろす：
- **決定 LV1（表示密度トグル・実装対象）**：ネタ一覧に **カード / リスト** の2密度を持たせ、`localStorage["cm-list-density"]`（既定=`card`＝現状維持）で永続。リスト＝**1行に圧縮**（左の kind 色帯＋`KindIcon`＋**タイトル主役**＋種別ラベル小＋▶再生のみ、MiniRoll/tags/idは省く）。トグルは filters 直下に segmented（カード｜リスト）。密度は `NetaList` 内で自己管理（App へ状態を上げない）。狙い＝「見た目のリッチさ」と「一覧性」を密度切替で両取り。
- **決定 LV2（情報優先度＋並べ替え・✅実装 2026-07-02）**：カード内は **タイトル最優先（.body を太字化）／id(1ae4ffd3…)は薄く小さく退避**／副アクション（複製/ライブラリへ/生成）は既定で畳み、主要2つ（▶/相談）＋**「…」**で展開。並べ替え＝`cm-list-sort`（既定=受信順＝検索の関連度を壊さない／更新新しい順／種別ごと／タイトル順）を密度トグル隣に。web230緑・スマホ実機確認。
- **決定 LV3（一覧画面の作り込み・🚧実装中 2026-07-02）**：フィルタ強化＋**プロジェクトの関係一覧**（既出「ホーム化」S1-S3＝line 405-409 と合流）。
  眺めて判明＝**名前付きプロジェクトが0件**（全ネタが未仕分けバケツ）＝プロジェクト機能が休眠。原因＝(a)ネタを器に入れる導線が無い (b)`＋新規`が`window.prompt`で空だとリロードで消える。
  → **「器を作る→入れる→切り替える」を一周させる**のが主眼。トップのピッカー改善とProjectScreen磨きを両方やる。
  - **P3 入れる導線（最重要・0件の根本）**：カードの「…」に**「この器へ」**＝アクティブ器の `prj:` を**addTag（他タグ非破壊）**。将来「取り出す」=removeTag。※`updateNeta(tags)`は全置換で危険なので専用ルート `POST /neta/:id/project {project, member}`。
  - **P4 未仕分け**：`listNeta({unassigned})` ＝ `prj:` タグを1つも持たないネタ。ピッカーに「未仕分け」チップ＝仕分けの入口（P3と対）。
  - **P1 チップ化**：素の select → 横スクロールの**プロジェクト・チップ**（`[すべて][未仕分け][名前 件数]…[＋]`・1タップ切替・件数バッジ・active色塗り）。多数は「▾他」へ退避（dropdown保険）。
  - **P2 作成健全化**：`＋新規` の prompt を廃し、作成時に **`setProject` で永続**（空でも消えない）。
  - **P5 器のアイデンティティ（軽）**：器ごと色/絵文字＋現在地表示。
  - **ProjectScreen 磨き（✅Slice C・2026-07-02）**：ヘッダ/画面の**絵文字□化→SVG**＝新 `Icon.tsx`(home/inbox/gear/chat/edit/trash/pin)。App ヘッダ(🏠📥⚙💬)＋ProjectScreen(🏠/📌/✎/🗑)を置換。ジョブ状態の絵文字→**色ドット＋テキスト**。`ファイル`欄の浮いた枠を他ブロックと**フラットに揃え**(モバイル)＋縦 gap 詰め。backlog「絵文字→SVG」を回収。web232緑・Playwright実機で□解消を確認。
  - **段階**：✅Slice A＝P3＋P4（入れる＋未仕分け・2026-07-02）→ ✅Slice B＝P1＋P2（チップ＋作成・2026-07-02）→ ✅Slice C＝ProjectScreen磨き（2026-07-02）。各スライスTDD/Playwright/コミット。
    - **Slice B 実装**：素の select → **プロジェクト・チップ**（`[すべて N][未仕分け M][器 件数]…[＋]`・横スクロール・1タップ切替・active色塗り）。件数＝新 `GET /project-counts`(core.projectCounts＝すべて/未仕分け/器別・空の器も0件で拾う)。`＋新規`は `setProject` で**永続化**（旧prompt＝ローカルのみで揮発を是正）。api423緑/web232緑/Playwrightでチップ+件数を実機確認。
- **段階**：LV1（本スライス）→ LV2 → LV3。LV1 は純加算（既定 card で回帰なし）・aria 不変・Playwrightでスマホ確認。

#### 決定 LV-A：ネタ一覧の手動並べ替え（✅実装 2026-07-02・backlog から昇格）
ユーザー判断「ない方が変」＝手で自由に順番を入れ替えたい。backlog の「後付けが安い」設計をそのまま採用。
- **データ＝被せ表 `neta_order(project, neta_id, position REAL)`（純加算・既存 `song`/`chat_thread` と同型）**。
  行の無いネタは position NULL＝**並べ替え前は現状(updated DESC)と完全同一**＝回帰なし。`project=''` は「プロジェクト未指定」バケツ。
- **並び順の解決**：`listNeta({orderProject})` で `LEFT JOIN neta_order` → `ORDER BY (position IS NOT NULL), position ASC, updated DESC, id`
  ＝**配置済みは指定順・未配置(新規)は先頭に updated 順**（新しいものが埋もれない）。orderProject 未指定なら従来の updated 順のまま。
- **保存**：`POST /neta/reorder {project, ids}` ＝渡された順に position=index を**全上書き**（小さい一覧前提で単純・確実）。
- **UI（dnd-kit sortable＋touch）**：カードを `useSortable` 化し、**⠿ ハンドル**で掴む。PC=5px/スマホ=**長押し250ms**で発火
  ＝タップ再生/カードを開くとの誤爆回避。楽観更新（すぐ並ぶ）→ 失敗時 reload。既存の**レーン配置(placeChild)は同ハンドルで両立**
  （`onDragEnd`：over がレーン→placeChild／別カード→reorder）。
- **有効範囲＝素のプロジェクト一覧のみ**：`reorderable = scope==='project' && 検索/種別/mood 絞り込み無し`、かつ**表示が既定順**の時だけ
  ハンドルが効く（基準ソート/部分集合の誤並べ替え・position 疎化を防ぐ）。この時 `items===表示順` なので楽観更新が安全。
- 契約テスト：api `neta-order.test`（並べ替え前=既定同一／指定順／新規は先頭／プロジェクト別／再並べ替えは全上書き）。

#### 決定：proactive 定期スケジューラ(#80) — 「見てない間も貯め・発展」(原則3)
- **目的**：requirements 原則3/line71「指定テーマを継続して調べてまとまったら報告」を縦スライス化。reactive(投げたら進む)は揃ったので、**proactive(指示すれば勝手に少しずつ進む)** を最小で載せる＝この道具の差別化の核。
- **層**：スケジューラは **TS/api 側**（design line62「生産者=TS/スケジューラ、消費者=Python」を尊重。Pythonは純消費者のまま）。`main.ts` の既存 reap interval に **scheduleTick** を相乗り。Python/worker は無改修（research/collect ハンドラと reaper をそのまま使う）。
- **スキーマ**：`schedule` 表を `CREATE TABLE IF NOT EXISTS` で追加（migrate不要）= `(id, neta_id[テーマ=対象ネタ], intent['research'|'collect'], params, every_sec, enabled, last_run, next_run, created)`。テーマ文言は対象ネタの title/text を instruction に使う。
- **契約(core/http)**：core `addSchedule/listSchedules/setScheduleEnabled/deleteSchedule/dueSchedules(now)/tickSchedules()`。http `POST /schedule`・`GET /schedules`・`PATCH /schedule/:id`(enabled)・`DELETE /schedule/:id`。
- **tickSchedules**：enabled かつ `next_run<=now` かつ **同 schedule の未消化(queued/running)ジョブが無い**もの（spam防止）に対し、research ジョブを enqueue（`params.schedule_id`・`instruction`=テーマ）。`last_run=now`・`next_run=now+every_sec` に更新。結果は既存 reaper が **reference ネタ化＋トレイ**へ（notify は静かめ=`quiet` 既定）。
- **UI**：対象ネタ（knowledge/reference/任意）に「**継続して調べる**」トグル＝schedule の作成/解除。トレイの参考は既存表示を流用（schedule由来マークは後続でも可）。
- **最小スライス**：research のみ・interval は env/UI で可変（既定 6h、テストは短縮可）。collect intent や theme の高度モデル化、出典検証は後続。
- **不変/フォールバック**：worker/Python は無改修。schedule が無ければ従来通り（後退ゼロ）。tick は core 内の純粋な「due→enqueue」で、失敗してもジョブ表は壊さない。

#### 決定：plan intent カタログ拡張(#82) — AIが自律分解できる作業を広げる
- **問題**：`handle_plan` が Claude に渡せる intent が gen_melody/gen_chord/gen_rhythm/suggest/research の5つだけ＝design#16 の意図カタログ（収集/作業代行/歌詞整合）に未到達＝AIの守備範囲が狭い。
- **今回（縦に薄く）**：**collect** を追加。research が「参考曲を調べる」のに対し collect は「**試せる断片/アイデア**（コード進行例・リズム・歌詞フレーズ・技法）を集める」。出力は research と同形 `{summary, references[]}`＝`reapResults` を `intent IN ('research','collect')` に拡張して **reference ネタ化**（#80 スケジューラの collect も有効化）。plan/consult のカタログに collect を追記し、プロンプトを「各intentの用途＋『調べてから作る』のチェイン例」で充実。MCP enum にも collect。
- **後続**：**作業代行(arrange)**＝対象ネタ＋指示で単発作業→content（kind曖昧さの解消が要・consultの判別ユニオン流用候補）。**歌詞整合(align_lyrics)**＝歌詞の音節をメロのノート数に合わせる（design#13・syllable 表示UIとセット）。いずれも判断が要るため別スライス。

#### 決定：振り分けA — 楽曲生成は【特定 vs 汎用】（実装 2026-06-22・止血）
- **問題**：ルール生成 `gen_chords` は機能和声マルコフ＋**ダイアトニック度数表だけ**＝「丸の内進行」の E7(セカンダリードミナント)/Gm7(非ダイアトニック)を**原理的に出せない**。consult が「作って＝ルール丸投げ」で特定/名前の進行も汎用化していた（調査: `docs/research/2026-06-21-routing-scenarios.md`）。
- **決定**：consult の楽曲生成を **(S)特定/名前/旋法/様式（丸の内・カノン・小室・ブルース・ドリアン・『〇〇進行』『あの曲っぽい』等）→ ルールに渡さず Claude の知識で正確に書き起こす(type:content chord_progression)**／**(G)汎用・枠だけ → ルール(gen_pair_rule/gen_chords_rule)** に分岐。迷ったら(S)。**(S)で Claude が書いた進行も analyze_fit/detect_key を必ず通す**＝#86「判定が提案の前提」は崩さない（生成元がルールでなくても判定は通す）。
- **本命の上積み（実装済・#98）**：**名前付き進行DB**（`music/progressions.py`＝名前→度数列・C基準）で定番進行を「Claudeのそれっぽさ」→「**確定realize**」に格上げ。登録: 丸の内(丸サ/JtToU=FM7-E7-Am7-Gm7-C7)・カノン・小室(6451)・王道(4536)・ツーファイブ(ii-V-I)・12小節ブルース。別名/表記揺れ照合(`find_progression`)。realize は1コード=1小節・C基準保存(調は後段トランスポーズ)。MCPツール `gen_named_progression(name, frame)` で公開＝agentic Claude は名前付き進行を**記憶で書かず必ずこのツール**を使う（未知名のときだけ自分の知識へフォールバック・prompt 明記）。非ダイアトニック(E7/Gm7)も正確。当てはまり判定(analyze_fit)は従来どおり通す。次点: fetch の web 接続・旋法/様式のルール拡張・進行の追加登録。

#### 決定：Chat相談の文脈・待ち・実況（#99・2026-06-24）
- **症状（実機・固まる）**：フリーChat（`chat:*`スレッド）で前ターンの生成メロに対し「メロがいただけない、8分16分で直して」が **failed（`claude failed (1)`・stderr空）**。UIは考え中表示のまま無言で消えた＝「固まった」。
- **根因（実コードで確証・3層）**：
  1. **文脈欠落（本丸）**：`Chat.tsx` が consult に渡す `context` は **target ネタのタイトル/本文だけ**（`const ctx = target ? (title??text) : ""`）。**会話履歴をプロンプトに一切入れない**。フリーChat は target 無し＝`context=""`。Claude は「直す対象のメロ」を知らされず、agentic の read-only ツールで探し回り **`--max-turns 8` を使い切って exit 1**（created→updated が約147秒＝彷徨いの形）。
  2. **UI待ち < worker timeout**：`Chat.tsx` のポーリングは `for(i<80)×1500ms = 120秒`で打切るが、agentic worker の `claude -p` timeout は **240秒**。**ジョブ完了前にUIが降りる**。しかも時間切れでループを抜けると `finally{setBusy(false)}` だけ走り**メッセージを出さない**＝無言で消える＝固まって見える正体。
  3. **max-turns 到達が不透明 hard fail**：`claude -p` が上限で exit 1・stderr空→`RuntimeError("claude failed (1): ")` だけ。観測も復帰もできない。
- **決定**：
  1. **会話履歴は worker が DB 直読みで context に焼く**（`_resolve_fit_context` と同じ「生産者がDBを読む」原則・design#85/L174）。consult かつ `params.chat_thread` があれば `chat_message` 表から直近Nターンを読み、**特に直前 AI 生成の `data.neta.content`（実ノート/コード）**を含めて `params.history` に展開→`handle_consult` がプロンプトに含める。**reload耐性あり**（履歴はサーバ権威・fb-3）。クライアント側 `context` 構築は変えない（退化防止）。
  2. **UIポーリング予算を worker timeout 以上に**（120s→約270s）し、**時間切れでも無言にしない**：「まだ処理中・受信箱で受け取れます」を出して busy を解く（裏で続行・reaper がスレッドに結果を残す）。
  3. **実況（できる範囲で）**：agentic 経路の `claude -p` を **`--output-format stream-json --verbose`** にし、NDJSON の `tool_use` を**人間語ラベル**（list_neta=ネタ帳を見てる／gen_melody=メロを作ってる…）に変換して **`job.progress` 列**へ随時書く（既存列・design#15「progress更新」）。UIはポーリングで `j.progress` を「考え中: …」表示。worker は run_once が running を commit 済＝conn 空きを使い contextvar の progress sink で書く（handler 署名は不変）。
  4. **max-turns はソフト処理**：stream-json の `result` イベントから `subtype`(`error_max_turns` 等)・`is_error`・最終テキストを取得。**部分結果テキストがあれば返す**（consult は `_extract_json`→失敗時 chat フォールバックで活かせる）。無ければ「上限到達（文脈不足の可能性）」と**明示メッセージ**で失敗（#43 失敗は無音にしない）。
- **段階（TDD・契約=パーサ先行）**：①worker 履歴注入（純関数＋プロンプト反映）→②stream-json パーサ（`event→progressラベル` / `result→(text,subtype,is_error)` の純関数）→③progress sink 配線（run_once）→④web ポーリング予算・非無言・進捗表示。①②は契約なのでテスト先行。`tools=False`（非agentic）経路は `communicate()` 維持＝blast半径を限定。
- **⚠️ #100 により大半が陳腐化**：①履歴注入・②実況・④ポーリング延命は「workerが脳をホストする」前提の対症。新背骨（Claudeクライアントが脳＝セッションで記憶・SSEで逐次）では**最初から不要**。緑のコード（worker S0止血の history保険DDL 等）は #100 移行まで残置、移行で撤去。

#### 決定：設計転換＝作曲MCP＋薄いClaudeラッパー（脳を作らない）（#100・2026-06-24・GO）
- **問題（#61/#99 を貫く根因）**：worker(Python) が `claude -p` を**ステートレス単発JSON API**として使い、intentごとに**手組みプロンプト→判別ユニオン**(`handle_consult`＝`chat|options|content|items|proposals|plan`)を返す**ルーター**だった。＝worker が会話エージェントを**自作・ホスト**している。これは「LLM差し替え可能」設計としては綺麗だが、Claude Code が本来持つ**永続セッション・ネイティブなエージェントループ・ツール・メモリ・自然な多ターン会話**を捨てている。症状＝「会話が返ってこない」（request→構造化アーティファクト）。#99 の履歴焼き直し・max-turns 彷徨い・ポーリング無言も**すべてこの構造の派生**。オーナー評：「AIのAPIすぎる／元々webチャットはClaudeのラッパーのつもりが（AIの助言で）難しくした」。
- **決定＝脳を作らない**。会話エージェントを自作するのをやめ、**既製の Claude クライアントを脳として使う**。我々が作るのは2つだけ：
  1. **作曲MCP（ドメイン）**＝既存 `apps/api/src/mcp.ts` を脇役から**主役へ昇格**。読取＋**ルールエンジン生成(gen_*)**＋判定(analyze_fit)＋**書込(create/update/上書き/place/link/delete)**。書込は**候補返し＋明示commit**で承認が効く形にする。宣言的（ツール定義＋説明文）で、どの MCP クライアントからでも叩ける。
  2. **薄いチャットラッパー（ビュー層）**＝web 内に1パネル。**チャット1本につき長命の `claude -p --input-format stream-json --output-format stream-json` を1プロセス保持**して中継（毎ターン spawn しない＝MCPが温まる・トークン逐次・多ターンはプロセス内でネイティブ）。流れる `tool_use`/`tool_result` を**既存の視覚部品**（ピアノロール/▶︎再生/選択カード #55/#57/#84）として描き、入力/クリックを stdin へ返す。プロセス落ち後の復活は `--resume`（**cwdスコープ＝固定cwdで起動**）。**プロンプト組み立て・ルーティング・記憶は持たない**（脳はClaude）。
- **統合バス＝neta DB**。Claude が MCP で neta を書く→既存キャンバスが同じDBを見て再描画/再生する。だから「UI統合」は**橋を架け直さず**成立する（弱点は「別の汎用Claude窓で喋ると自分のキャンバスが見えない」点だけ＝チャットをアプリ内に置けば解消）。
- **承認**（創作の本体＝「2案のどっちで上書き?」）：**CLI権限機構に依存しない**（v2.1.187 に `--permission-prompt-tool` は無い）。**MCPツール設計で実現**＝生成は候補返しのみ／上書き・削除は明示 commit ツール→ラッパーが候補をカード描画し、選択を次ターンへ流す。破壊操作の安全ゲートが欲しければ `--input-format stream-json` の **control プロトコル（control_request/response＝canUseTool）**で拾える。
- **真実源は不変**：音楽的妥当性はルールエンジン（MCPツール）が担保。Claude は引く/選ぶ/直す＝requirements #92/#151 と整合（今回の転換は概念の変更でなく、アーキ/設計が概念から乖離していた**是正**）。
- **残す/消す**：残す＝データモデル(neta/compose/job)・ルールエンジン・web の視覚/再生。**消す**＝worker の12プロンプト・判別ユニオンルーター(`handle_consult`)・`_resolve_chat_history`(#99)・ポーリング/max-turns/progress sink。worker は**決定的バッチ専任**（MIDI分割mido・埋め込み）へ。スケジュールAIが要れば「MCP付きの定期Claude」。
- **#61/#99 の扱い**：#61（consult統合の判別ユニオン）は**本決定で置換**＝Claudeが自然文で喋りつつ構造化はツール呼び出しで起こす（unionを返さない）。#99 の対症は#100移行で撤去（上記注記）。
- **フィジビリ検証済（実機・2026-06-24）**：`claude -p` は Max認証で動作（apiKeySource:none）／stream-json形(system/init→assistant→tool_result→result)／`--resume`が**別プロセス間で記憶持続**／`mcp__creative-manager__list_neta` が**実発火し tool_use/result が stream に見える**／`--model` 指定可。→ 薄いラッパー＋MCP は技術的に成立。
- **モデル**：会話=軽い→sonnet/難しい所→opus の**出し分け**。**ツール駆動ターンに haiku は不可**（フィジビリで tool_use チャネルを使わず `<function_calls>` をテキスト捏造するのを確認）。クォータ理由でなく**正しさ**の選択。
- **フィジビリ深掘り確定（実機・2026-06-24）**：
  - (a) **承認は CLI 権限フックを使えない（実証で確定・2026-06-25）**：`claude -p` stream-json で allowedTools 外のツールを呼ぶと **tool_result が is_error（自動拒否）**＝`control_request`/permission イベントは**流れてこない**（観測イベント型＝assistant/result/user/system のみ・`--permission-prompt-tool` も本CLIに無い）。∴ **mid-stream の対話承認は不可**。承認は **書込ツールを allowedTools で事前承認＋可逆(undo)＋UIの候補選択（候補返し→人が選ぶ→commit）** で担保（#101 の会話/UI承認＝CLI gate に依存しない）。
  - (b) `--resume` は **cwd スコープ**（/tmp 生成→project resume で `No conversation found`）→**ラッパーは固定 cwd で claude を起動**する。
  - (c) `--strict-mcp-config`＋`--tools "mcp__creative-manager__*"` で**利用ツールをMCPだけに限定**でき Bash 逃げ道を消せる。**ただし真因は MCP コールドスタート**：`pnpm…mcp`(stdio) が接続前にターンが走ると init `available tools:[]`/`status:pending`。`claude -p` は毎プロセスで stdio MCP を起動し直す（`--resume` でも温まらない）→ **長命プロセスでMCPを温めるのが必須**（毎ターン spawn 不可）。将来 **api が HTTP/SSE MCP を常駐ホスト**も選択肢。
- **③-8 実機検証＝10 verbs面で成立（2026-06-25）**：長命 `claude -p --input-format stream-json --output-format stream-json` を1プロセス保持し **warmup 1ターン→2ターン目で MCP `connected`**。自然文「Cメジャー明るい4小節」→ **sonnet も haiku も `generate(kind:chord_progression, frame:{key,mode,bars,mood})` を正しく選択**＝目的命名で選択が素直。`--allowedTools` 無しだと `generate` が**承認要求**（書込ゲートが現に効く）／有りで実行まで通り haiku が `C-G-B-C` を報告。**Haiku仮説=単発確定呼びは絞った面でいける（多段fuzzyはsonnet/opus）**。**ラッパー④のレシピ確定**：長命process／warmup／`--strict-mcp-config`＋`--tools`(10)／`--allowedTools`=10全部を事前承認(候補/読取/書込とも)・人のループはUIの候補選択＋可逆／sonnet主・haiku単発。
- **③-8 続き＝feasibility 完了（2026-06-25・make-or-break 残無し）**：
  - **B 多段◎**：sonnet が `generate→fit→analyze` を**正しい順で連鎖し中間状態(生成コード→fitのchords→analyzeのmelody)も渡る**＝研究の「状態喪失」起きず。会話作曲の本体が成立。
  - **A 承認◎（上記a）**：CLI対話承認は不可と確定→UI候補選択＋可逆で担保。
  - **D 解決済（2026-06-25）**：`--tools` は**MCPツールを絞れない**（init #tools=49・モデルが旧 `analyze_fit` を掴んだ）→ **サーバ側で絞る**。`buildMcpServer(core, {surface:"chat"|"full"})` を追加（共有スキーマをモジュール級へ巻き上げ・legacy39を `if(legacy)` で包む）。`mcp-stdio.ts` は `CM_MCP_SURFACE=chat` で chat面。**実証**：chat面で init `#tools:10`（旧39消滅）・多段が `generate→fit→**analyze**`（新verb）で通り fit 0.721 要約。api255緑＋chat-surfaceテスト。**＝additive をやめ chat は10だけ＝モデルが旧を掴まない**。
  - **C 中継**：worker が headless で `claude -p` を回す前例あり＝低リスク作業。
  - **残りは全て実装（feasibility risk ゼロ）**：エンジン欠落③-2..7(feel/roleのみ設計品質)／D=チャット面10登録／④ラッパー／⑤旧撤去。
- **進め方**：①ドキュメント是正（済）→②フィジビリ深掘り（済・上記）→③MCP の書込/生成ツール整備（候補返し＋明示commit・説明文）→④薄いラッパー実装（長命 stream-json プロセス／固定cwd／`--strict-mcp-config`＋`--tools`限定／sonnet）→⑤worker のチャット機構撤去。SDD：上から確認済（concept=requirements #92/#151 と整合、architecture #1 を是正反映）。

##### 決定：セッション管理＝「1 thread = 1 claude session = 1 履歴」（#100④-S・2026-06-25）
**問題**：④は api 側に実装済（`apps/api/src/chat-session.ts`＝`Map<thread,ChatSession>`・長命 `claude -p --input-format stream-json`・MCP chat面 warmup・`/chat/:thread/turn` SSE 中継・**通し動作確認済**：同一スレッド 6.9s(cold)→1.8s(warm)）。だが **session_id 未指定＝プロセスが落ちると claude 側の文脈が消える**（DB履歴は残るが claude は知らない）。「履歴＝セッション」をどう対応させ、切替/再起動/分岐をどう管理するか。
- **記憶は3層に分離**：①**アプリ履歴**(`chat_messages`/thread毎/DB)＝**永続SSOT**・UI表示・人間の正準（毎ターン保存＝fb-3）／②**claude セッション**(`~/.claude` の session_id ファイル・**cwdスコープ**)＝Claude の作業記憶＝**キャッシュ扱い**（消えうる・再構築可）／③**生きた claude プロセス**＝今温まってる実体（idle/落ちで消える・session_id は残す）。
- **対応＝決定的導出**：**session_id = UUIDv5(固定ns, thread)**（thread は `'global'` か neta id）。DB列不要・ステートレス・再起動耐性。cwd は repo root 固定（現コードは cwd=`dirname(dirname(CM_DB))`＝repo root で固定済＝整合）。
- **spawn = resume-or-create**（実機で境界確定・2026-06-25）：まず `--resume <sid>` を試し、`No conversation found`(rc=1) なら新規 `--session-id <sid>`、以降は常に resume。理由＝**既存idへ再 `--session-id` は "already in use"(rc=1) エラー／不存在 `--resume` も "No conversation found"(rc=1) エラー**＝両方ハード失敗するので試行分岐が要る。`--resume` は `--input-format stream-json` と**併用可**（resume 後も stdin で多ターン継続・記憶跨ぎ実証＝別プロセスで合言葉を想起）。
- **切替＝thread切替**：UI でスレッドを変える＝その thread の session_id へ resume。`Map<thread,ChatSession>` は既にこの骨＝各 ChatSession に sid を持たせ resume で温め直すだけ。
- **ライフサイクル**：idle reap（無発言が続けば claude プロセス kill＝メモリ解放／session_id 残置→次発言で resume・文脈は戻る・latency は warm でなく cold ~4s）。落ちたら `proc.on(exit)` で null→次 `say()` で resume 再spawn。
- **分岐（将来）**：`--fork-session`＝新 session_id・記憶継承（実証済）＝「この会話から別案を一気に試す」を本筋を汚さず。v1 では未配線（capability のみ確保）。
- **divergence 対処**：claude セッションファイル消失（`~/.claude` クリア/別cwd/別マシン）でも DB履歴は残る→**resume 失敗時は DB履歴を文脈に詰めて再構築**（v1 最低限＝resume失敗→新規＋`logging.warn`、履歴 replay は後続）。逆（claude記憶ありDB欠落）は毎ターン保存ゆえ起きない。
- **実装スライス**：(S1) chat-session.ts に session_id 導出＋resume-or-create＋exit再spawn〔契約=導出関数＋分岐をテスト先行〕→(S2) idle reap →(S3) web 切替（別決定）→(S4) ⑤worker チャット撤去。**S1/S2/S3a/S3b＋⑤=実施済（2026-06-25）**。
  - **⑤ 実施（2026-06-25）**：worker から agentic consult 機構を撤去＝`handle_consult`/`handle_plan`／`_claude_stream`/`_mcp_args`/`_NETA_READ_TOOLS`／#99 進捗sink(`_progress_sink`/`_consume_stream`/`_stream_label`/`_finalize_stream`)／worker.py の sink・consult履歴注入・plan子ジョブ配線。`claude_prompt` は **plain 専用**（tools 分岐削除）で research/gen_*/brainstorm 用に温存（NetaList の AI生成・scheduled research がまだ使う＝TS 移管は別途）。worker テスト 75→53 緑。会話の脳は api 常駐 claude のみ＝worker は決定的バッチ専任（architecture #1/#100 と一致）。

##### 決定：ターン永続化はサーバ権威＋走行中ターンの再アタッチ（#100④-S5・2026-07-05・ストリーム切れ対策）
**問題**：`/chat/:thread/turn` の SSE 中継で、**永続化がクライアント側だけ**だった。ユーザー発言は送信開始時に保存されるが、**assistant 返信は `runStream` 完了時に初めて保存**する設計＝**チャットを閉じるとストリームごと締めの返信が消える**（履歴が「自分の発言で終わる」＝実害を機材相談で観測。gear 履歴の末尾がユーザー発言で AI 返信欠落）。加えて、閉じて開き直しても**走行中ターンが復帰しない**。
- **方針＝サーバがターンの権威**：claude プロセスは**HTTPソケットが切れても走り続ける**（`sess.say` は claude の `result` で解決＝ソケット非依存）。∴ `/turn` 完了時に **api が assistant 返信を `chat_message` へ永続化**（`result` の最終テキスト／無ければ最後の assistant text）。クライアントは assistant を**画面表示のみ**（`renderMsg`＝非永続）に変更＝**二重保存しない**。ユーザー発言は従来どおりクライアントが送信開始時に保存（切断前に残る・raw文＝researchラップ前）。
- **再アタッチ（`chat-live.ts`）**：走行中ターンの stream-json を **thread 毎にバッファ＋ファンアウト**する小レジストリ（`beginTurn`/`pushTurnEvent`/`endTurn`/`attachTurn`/`isTurnLive`＋番兵 `DONE`）。`/turn` は自分のソケットも購読者として繋ぎ（＝再アタッチと同一経路）、`GET /chat/:thread/turn/live`（SSE）で**開き直した時に途中から購読**（バッファを即リプレイ→残りを tail）。走行中でなければ即 `event: done`＝完全 no-op。`GET /chat/:thread/turn/status`＝`{live}` を軽く返す（UI 判断用）。完了ターンは履歴へ落ちるのでレジストリからは破棄（メモリに溜めない）。脳は持たない＝ただの中継バッファ。
- **クライアント**：`consumeTurn` に描画ループを一本化（`/turn` と `/turn/live` で共用）。履歴ロード後(`loaded`)に `chatTurnLiveStream` を1回試行＝走行中ターンがあれば `busy` 表示に入り復帰、無ければ何もしない。復元済みメッセージは消さない（`loaded` 後にだけ試行）。
- **契約テスト（TDD 先行）**：`chat-live` の registry（バッファ/途中参加リプレイ/DONE/detach/やり直し＝6件）→ `/turn` の**サーバ側 assistant 永続化**（getChatSession をモックし inject で通し・4件）。cards は候補=一時試聴・書込=実ネタ独立永続ゆえ**再オープンでの再ハイドレートは行わない**（web のカード生成ロジックを api に複製しない設計判断）。api 461緑／web 274緑。

##### 決定：逐次表示(partial)＋再アタッチのレース堅牢化（#100④-S5+・2026-07-07）
**問題（①手触り）**：`claude -p` を `--include-partial-messages` 無しで起動していた＝claude は**完成した `assistant` ブロックを塊で1個**吐くだけ。web 側の SSE 逐次描画(`streamText`)は既にあるのに、一度に丸ごとセットされ **スピナー→一括ドン**（長い生成で無音待ちが辛い＝安っぽさの主因）。**問題（②レース）**：remount がターン完了と競合すると、履歴ロードGETが**永続化される前**に走り、かつ live-stream 接続前に `endTurn` がバッファを purge → **締めの assistant 返信がどこにも現れず消える**（再アタッチは消えても拾い直さなかった）。
- **① 逐次表示**：`chat-session.ts` の args に `--include-partial-messages` を追加＝claude が `stream_event`(`content_block_delta`/`text_delta`) を流す。`chat-stream.ts parseTurnEvent` に **`stream_event`→`textDelta`** を追加、`Chat.tsx consumeTurn` は **デルタを加算**（`acc += a.text`）。full `assistant` text ブロックは**デルタを見た後は無視**（`sawDelta` ガード＝逆戻り防止／partial 非対応の古い経路では従来どおり full が主役）。最終確定は従来どおり `result`（サーバ永続化と同一テキスト）。実 claude 実測で `text_delta` 到来を確認済（契約一致）。
- **② レース堅牢化**：再アタッチ effect を**永続の真実へ一本化**。live 時は `consumeTurn` 後に `renderMsg`（非永続の暫定追加）ではなく **`reloadMsgs`**（サーバは `persist→endTurn` 順＝SSE の `done` 時点で永続済み保証）。not-live 時も **`reloadMsgs` で取りこぼしを救済**。ただし開いた直後に自分でターンを始めた場合は `localTurn` ref で抑止＝楽観表示（ユーザー発言/streamText）を潰さない。
- **契約テスト**：`parseTurnEvent` のデルタ経路（text_delta→textDelta／block_start/stop・message_delta・空デルタは無視＝web 契約2件追加）。**e2e（フェイク claude 背後・`playwright.chat.config.ts`）**：①逐次成長（途中<最終・尻切れ無し）／②-a 生成中離脱→即復帰／②-b 完了後復帰＝返信が消えない、の3本緑。テスト基盤＝`apps/api/testing/fake-claude.mjs`（stream-json で partial を時間差に吐く）＋`CM_FAKE_CLAUDE` spawn 差し替え口。web 286緑／api 528緑。

##### 決定：チャットの「停止」＋ジョブ「削除」（#100④-S6・2026-07-05）
**問題**：(a) 走行中の claude ターンを**ユーザーが止められない**（重い/脱線しても待つしかない）。(b) 消費者の
いない/廃止インテントの**死にジョブ（queued/failed）を消す手段が無い**（UI からも API からも）＝トレイに滞留し
`/health` を汚す。実際 `consult(failed・6/24)` と `gen_melody(queued・詰まり）` が残留（掃除も一回きりの直DBに頼った）。
- **停止（turn stop）**：`POST /chat/:thread/turn/stop`＝そのスレッドの走行中セッションの claude プロセスを落とす
  （`ChatSession.stop()`＝`kill`。session_id は残る→次発言で `--resume`＝文脈は戻る）。**要は say() をプロセス死でも
  解決させる**こと：従来 say は `result` イベントだけで解決＝プロセスを外から殺すと**promise が永久に未解決→/turn の
  finally（永続化＋endTurn）が走らず SSE も endTurn 番兵も来ずハング**。∴ say に proc `exit` 購読を足し、死んだら
  合成 `result(subtype:"aborted")` を流して解決。/turn は**それまでの部分テキストを履歴に残す**（#100④-S5 と同じ精神
  ＝出た分は捨てない）→ endTurn で全購読者に DONE。UI は busy 中に「■ 停止」ボタン（送信と入替）。
- **削除（job delete）**：`DELETE /job/:id`＝`JobRepo.deleteJob`（job＋子 `job_result` を消す・存在で bool）。トレイの
  各ジョブ（queued/running/failed/waiting）に ✕ を出して消せる＝滞留の自浄。これで #2 の死にジョブ掃除も UI で完結。
- **削除時に実プロセスも殺す（S6+・2026-07-05 追加＝ユーザー要望「停止時プロセス殺して」）**：当初は「削除は行だけ・
  実行中の research/audio 消費者プロセスは走り切る」で backlog に退避したが、要望で即実装。`job-procs.ts`＝**ジョブ毎の
  `AbortController` 登録簿**（`beginJobProc`/`endJobProc`/`killJobProc`/`isJobProcRunning`）。実行器（`runResearchJob`/
  `runAudioAnalyzeJob`）が開始時に登録し、spawn ヘルパ（`claudeShot`/audio の `run`）へ `signal` を渡す。`DELETE /job/:id`
  が `killJobProc`→abort→spawn 側が**detached プロセスグループごと SIGKILL**（timeout kill と同経路＝孤児を断つ）。
  claude/demucs/python/yt-dlp が実際に止まる。レスポンスに `killed` を足す。トレイの実行中ジョブは ✕ を「■」表示に。
  ※チャットのターン停止（上）は別系統（`chat-session` が長命 claude を kill）＝バッチはこの登録簿。
- **契約テスト（TDD 先行）**：`JobRepo.deleteJob`（job＋job_result 連鎖・存在 bool）／`DELETE /job/:id`（200＋消滅）／
  `POST /chat/:thread/turn/stop`（getChatSession モックで、停止→/turn が部分テキストを永続化して完了）。
- **スタイル併せ直し**：`.chat-log` が暗黙列(auto=min-content)で、本文の横広トークン（"AD2/BFD3/EZ…"・URL・表）が
  列を画面幅より広げ**本文が左右に見切れて**いた（モバイル実機）。`.chat-log` を `grid-template-columns:minmax(0,1fr)`
  に固定＋`.chat-msg{min-width:0}`＋本文 `overflow-wrap:anywhere`（`.notebook`/`.dialog` と同じ既知対策）。

##### 決定：チャットにブラウザ検索を許す（#100④-S7・2026-07-05）
**問題**：常駐チャットは `--tools`＝creative-manager の MCP 動詞10個だけで、**WebSearch/WebFetch が使えなかった**
（当初 `--strict-mcp-config`＋`--tools` で「MCP だけ＝Bash 逃げ道を消す」ため）。結果、チャットの「調べる」タブも
実際には**ブラウザせず**モデルの記憶を出すだけ（ライブ検索は scheduled research の `claudeShot`＝無制限 `claude -p`
だけにあった）。ユーザー「チャットはブラウザ検索できないの？」。
- **方針**：チャットの `--tools`/`--allowedTools` に **`WebSearch`/`WebFetch` を追加**（`CHAT_TOOLS = CHAT_VERBS＋WEB_TOOLS`）。
  両ツールは**読み取り専用＝Bash 逃げ道は開かない**（当初の制限意図＝MCP限定でBash遮断は維持）。承認ゲートの無い常駐
  claude では `allowedTools` にも入れて事前承認（`tools`=見える／`allowedTools`=無承認で使える、の両方が要る）。
  COMPOSE_PLAYBOOK に「実在曲/コード進行/機材レビュー等は Web 検索してよい・出典を添える・音そのものはエンジンの仕事」
  を明記。consult/research 両モードで効く（調べるタブが本当にブラウズするようになる）。
- **契約テスト**：`CHAT_TOOLS` が MCP 動詞＋WebSearch/WebFetch を含み **Bash/Write/Edit を含まない**こと。

##### 決定：作られたネタを履歴に永続化（開き直しでカード復元）＋アナリーゼの誠実化（#100④-S8・2026-07-05）
**問題A**：チャットでネタ化を頼むと**その場ではネタへのリンク/カードが出るが、開き直すと消える**（ユーザー報告・
Forgiven の例）。S5 でカードは非永続（サーバは text だけ保存）にした副作用。ネタ本体は capture で永続してるのに
会話側の参照が失われる。**問題B(=E2E BUG#2)**：曲名アナリーゼでチャットが二次情報を"解析済"に見せる。
- **A の直し**：`/turn` が書込(capture/revise/assemble)の tool_result から作られたネタ(id/kind/title)を拾い、
  assistant メッセージの **`data.netas` に永続化**（`parseToolResultPayload`・同idは最後の1件に畳む）。web は
  `Msg.netas` を追加し、履歴復元時に**ネタ帳と同じ体裁のカード**（種別チップ＋タイトル＋開く/試聴）で描画。
  スナップショット(id/kind/title)しか無いので開く/試聴の直前に `getNeta` で本体取得（削除済みは黙って無視）。
  ライブ中は従来どおり liveCards（cards は非永続のまま）＝二重描画しない（再オープンは netas 経路のみ）。
- **B の直し**：COMPOSE_PLAYBOOK に「音声は聴けない＝曲名/URLの分析は Web/一般情報の"推定"で実測でない・本物MIRは
  取込🎵へ・capture するなら 参考/推定 とラベル」を明記。
- **契約テスト**：サーバが `data.netas` を永続化(2件)／web が履歴の netas をカード描画し 開く→`getNeta`(1件)。
  UIチェック（Playwright・mobile 412px）＝機材チャットで `.chat-log` の `overflowX:0`＝本文の左右見切れ解消を実機確認。

#### 決定：アナリーゼ・ワークベンチ（v2・#S10・2026-07-06・要件確定→設計）
**背景**：v1（audio_analyze→知見ネタ＝文章）は「BPM/調/コード名の要約＝メタ情報」で有用性が低い（オーナー指摘）。
値打ちは**実測の"具体"＝小節の中でどう動いてるか**。これはプロンプト/文字列では届かず、**新しい編集面＋データモデル**
が要る。要件は `usecases-chat.md`「① アナリーゼ v2」で確定。ここは設計（正典＝上位）。

**体験原則（otomemo 共通の音源版）**：**自動が正しいのが最善、ダメなら人が頑張る**。各層で auto既定→手動fallback：
downbeat 自動推定→手動アンカー／BTC コード→手動訂正／機械切出→手動切出／**メロ量子化ノート→生 f0 輪郭**。

**アーキ**（既存骨格に乗せる）：
- **新 neta 種別 `analysis`**。`content` ＝ メタ(bpm/key/既定拍子/音域) ＋ **overlay**（人の上書き）。
- **生ローデータ**（f0 輪郭・コード時系列・実ビート）は量が大＝**asset に逃がし neta から参照**（一覧を膨らませない）。
- ジョブ流路は既存（投げて→裏で→トレイ）。reaper が `analysis` neta＋asset を作る。**仕上げ（アンカー/切出）は人間＝ワークベンチ**。
- **音源は保持しない**（著30-4）。検算は原曲でなく**実測データの内部整合**で行う（下記「音」）。

**データモデル（overlay・"導出"を保存しない）**：
- `anchors: [{t_sec, meter, bar_no}]` … 複数＝テンポ変化/転拍子(4/4→6/8)に追従。auto 推定で初期化、手動で追加/移動、**実ビートに吸着**。
- **bar:beat は保存せず**〈実ビート＋anchors＋拍子〉から**都度導出**（アンカーを動かせば小節が引き直る）。
- `cuts: [{from_t,to_t,label?}]` → 各々を chord_progression ネタへ（**スナップショット**・弾ける）。
- `chord_edits`（BTC ラベルの差替/隣接マージ/分割）／`sections`（手動サビ/Aメロ ラベル）。

**描画（mobile 対応・スマホでも編集）**：時間軸(秒・ズーム/スクロール)＋**メロ・ピアノロール**(view-only)＋上にコード＋
小節線(導出)。メロ＝**既定=自動量子化ノート／fallback=生 f0 輪郭**。タッチ＝タップでアンカー追加/ドラッグ移動/
ロングプレス削除/ピンチズーム/ドラッグ区間選択（アンカーはビート吸着）。

**音（原曲録音なし・著30-4／2026-07-06 確定＝メロ＋コード両方鳴らす）**：検算＝**合成メロ＋コード(実 onset)＋
クリック(小節線)**を同期再生＋区間ループ。**鳴らすのは全て「採譜した派生ノートを合成音源で」＝原曲録音は鳴らさない・
非保存・一時**（＝解析補助＝30-4圏＋私的利用と解す。「音源保存しない」は"録音"の話で、派生ノートの一時発音は別物）。
相手は原曲でなく**"実測 onset が自分の置いた小節グリッドに噛むか"**＝内部整合で耳確認。**メロは鳴らせるが持ち出せない**
（view-only extraction 不可＝弾けるネタにはしない・聴く/見るのみ）。メロが曲の雰囲気を運ぶので**コード側のコンピング
雰囲気合わせは緩くて可**（素直なボイシング＋拍子追従で十分）。

**Claude の役割が変わる**：一発要約でなく**ワークベンチ助手**＝①auto 初期アンカー/コード②切出候補(ループ)③**アンカー後に
"小節で語る"所見**（「サビ頭で bVII 借用」等）。

**フェーズ**：P1 `analyze.py`＝実ビート出力＋メロ量子化ノート＋meter 引数／P2 asset化＋`analysis` neta＋reaper／
P3 ワークベンチ描画(ピアノロール＋コード＋小節線＋ズーム)／P4 タッチ操作(アンカー/切出/コード訂正)＋合成再生検算／
P5 切出→chord_progression ネタ＋Claude 所見。

**★抜け・未解決（書き起こして炙り出た＝要判断/要調査）**：
1. **メロ量子化が"最善"だが実は MIR 最弱**：ボーカル採譜は多声~49%・メリスマ/ビブラートで外す＝既定(量子化ノート)が
   頻繁に外れ **fallback(生 f0)が常用化する恐れ**。手段も未決＝**basic-pitch(重・良) vs pyin f0 量子化(軽・粗)**。
   ※2026-07-06 検算でメロを鳴らす決定＝量子化は「表示だけ」でなく「再生にも要る」＝精度がより効く→**basic-pitch 有力**（P1 で feasibility）。
2. ~~メロ再生の著作権~~ **【解決 2026-07-06】メロ＋コード両方鳴らす**（採譜派生ノートの合成・原曲録音でない・非保存・一時
   ＝30-4圏）。メロは鳴らすが持ち出し不可。コンピング雰囲気合わせは緩和（メロが雰囲気を担う）。
3. **再生同期精度（特にスマホ）**：任意時刻イベント列の Web Audio スケジューリング＋モバイル精度。既存 `playNotes` は
   音符列前提＝**任意 onset 列を鳴らす再生の拡張**が要る。
4. **asset 肥大/ライフサイクル**：f0 毎フレーム＝4分で~万点＝**ダウンサンプル要**。`analysis` neta 削除で asset も掃除
   （孤児防止）＝既存 asset に cascade delete があるか未確認。
5. **スマホでのアンカー精度**：指でサブ拍精度は不可＝**ビート吸着必須**だが、その実ビート自体が外れてたら詰む。
6. **auto＋手動アンカーの相互作用**：auto 推定は手動アンカー間を埋めるのか＝**手動優先の区間モデル**が要る。
7. **再アンカーと既切出の不整合**：cut はスナップショット→後からアンカーを動かしても既存切出ネタは追随しない。
8. **エディタ実装規模**：canvas 描画＋タッチ＋ズーム＋合成再生＝**大きめのフロント投資**（既存 proll/chord エディタの拡張か新規か）。
9. **v1 との共存/移行**：旧 audio_analyze(知見ネタ) → 新(analysis＋asset)。両立か置換か。
10. **量子化を python(basic-pitch) か TS(pyin 量子化) か**＝P1 の実装位置。

#### 決定：ドラム抽出＝窓分割×正準パターン型照合へ全面刷新（#S12改・2026-07-08・実測駆動）
**実測**（LostMemory=4/4打ち込み・DeepSea=6+5変拍子打ち込み・SURFACE「それじゃあバイバイ」=4/4実曲、
詳細 research/2026-07-08-drum-pattern-extraction.md）で v1 設計の3欠陥が判明：
1. **perception の排他分類が hihat を潰す**：単一 onset 検出→帯域比で1ラベルは、同時発音（kick+hihat 等）が
   強い方に食われ hihat が全曲最少（実際のポップは八分ハットが最多のはず）。
2. **全曲一発の剛体グリッドは実録音で破綻**：テンポの微ゆらぎが16分位相を全曲で塗り潰す
   （SURFACE の16分位相集中度 0.03＝格子が立たない）。打ち込みでも 1% のテンポ誤差で崩壊。
3. **16分格子の決め打ちはシャッフルで全滅**：SURFACE は3連(シャッフル)＝拍/4 格子には永遠に乗らない。
   また自己相似ベースの拍子推定は、密な8分活動がどの周期でも相関し変拍子でも高信頼を出す（捏造）。

**新設計（`audio-drums.ts extractDrumPattern` 一本・純関数）**：
- **窓分割**：曲を ~16拍窓（hop 8拍）に割り、窓ごとに局所自己相関で拍周期→円形平均で位相＝**局所グリッド**
  （自己相関は平行移動不変＝周期誤差が累積しない。実録音のドリフトは窓内に閉じ込める）。
- **サブディビジョン検出**：`sub ∈ {4=16分, 3=シャッフル3連}` を窓位相集中度の平均で決める（拍/sub 格子への乗り）。
- **正準パターン型ライブラリ照合**（本改の芯・オーナー方針）：**スネア=バックビート／キック=頭 という「よくある型」
  が拍子と downbeat を決める**。型は拍単位で定義（4/4: rock/four-on-floor/half/rock+・3/4: waltz・6: 4型）し
  zero-mean 正規化相関で照合（一様ノイズは 0 点）＋kick/snare ヒストグラム重複ペナルティ（分離ブリード対策）。
  **窓ごとに**最良型・位相・スコアを取り、各窓を自分の downbeat へ回転してからスコア重み付き集約＝
  セクション違い・フィルは票が割れて自然に沈む。
- **meter 決定**＝窓スコア平均 × 支持率（型が合った窓の割合） × 窓間一致（回転後ヒストの余弦）。
  **変拍子（6+5等）は窓内 fold の時点で滲む→どの meter でも支持率が立たない→低信頼**（グレースフルに諦める）。
- **出力**：`{meter, sub, confidence, bpm, downbeat(秒), template, rhythm{steps, lanes}}`。
  rhythm は既存契約（1step=16分）を維持＝sub=3 はスイング写像（3連 {0,1,2}→16分 {0,1,3}）で16分格子に落とし、
  シャッフルの事実は meta/タグに残す。低信頼時は rhythm を出さない（reaper 側ゲート・従来どおり 0.3）。
- **perception 刷新（analyze.py drum_onsets）**：帯域ごと**独立**オンセット検出（kick=20-120Hz・snare=200-1800Hz・
  hihat=6kHz+、包絡は帯域内95%tileで正規化）＋**クロス帯域優勢ゲート**（同時刻の最強帯域の一定割合未満の
  ピーク＝ブリードとして棄却）。同時発音は残る・facts 契約 `[[t,kind,strength]]` は不変。
- **旧ユニット剪定**：`estimateGrid`/`estimateMeterDownbeat`/`drumOnsetsToRhythm`/`beatPositionOf` は新実装に
  置換・削除（テストも新APIへ書き直し）。`meterString` は続投。

#### 決定：ドラム/ベース抽出＝捨てているstemを拾う＋ドラムから拍/拍子の土台（#S12・2026-07-07・要件確定→設計）
**背景/芯**：`_audio_poc/analyze.py` は htdemucs で4stem（vocals/drums/bass/other）を計算しているのに **vocals しか使わず drums/bass を捨てている**（追加の分離コストゼロで拾える）。また **meter は未検出（ユーザー指定・既定4/4）・downbeat はコード変化ヒューリスティックのみ**（`audio-grid.ts autoDownbeatOffset`）＝リズムの土台がグラグラ。**キック/スネアは最強のオンセット証拠**なので、ここから拍/ダウンビート/拍子の土台を固め、その上に他パートを載せる。詳細な候補比較・ライセンスは research/2026-07-07-drums-bass-extraction-plan.md（本節は決定＝上位）。

**体験原則**：#S10と同じ「**自動が最善・ダメなら人**」。機械は候補まで・仕上げは人間＝**完璧不要、そこそこの下書きで価値**。

**層分け（設計原則）**：**Python=perception**（生オンセット/生ノートを facts に出すだけ）／**TS純関数=interpretation**（meter推定・量子化・度数化・ループ折り畳み）。→ 音モデル（分離器/ADT/ピッチ検出）の差し替えが **facts 契約の内側で完結**し、TS側テストは差し替え後も正解のまま。

**facts 追加（後方互換＝追加のみ）**：
- `drum_onsets: [[t_sec, "kick"|"snare"|"hihat", strength], …]`（**meter 無関係＝常に出す**）。
- `bass_notes: [[start_sec, end_sec, midi], …]`（bass stem に pyin＝ボーカルと同じRLEノート化を帯域変更で流用）。

**meter/downbeat 自動（TS純関数 `audio-drums.ts`）**：
- 候補 meter＝**{3, 4, 6}**（**6拍子はオーナーがメイン使用＝一級候補**）。キック=小節頭・スネア=バックビート・小節周期の自己相関で `{meter, offset, confidence}` を採点。
- **5/7拍子・変拍子は分析対象外**（オーナー確定：作曲では使うが解析では使わない）＝**低信頼→手動アンカーへ逃がす**（無理に4/4と言い張らない）。overlay の `anchors` は既に per-anchor meter＝**変拍子は人がアンカーを置けば追従**（#S10 既存設計と整合）。
- **契約変更**：`params.meter` の意味を「未指定/0 = 自動、>0 = ユーザー指定で常に優先」に拡張（現行 `audio-analyze.ts`/`mcp.ts` の既定4→0=auto）。**ユーザー指定は常に上書き優先**。
- 低信頼時は既存 `autoDownbeatOffset`（コード変化）へフォールバック。ドラム由来 offset は**コード変化より強い証拠**として anchors 初期値を置換。

**ネタ化（reaper の audio_analyze 分岐に追加）**：
- **rhythmネタ**：`drumOnsetsToRhythm`＝オンセット→拍位置(beat_times線形補間)→16分step量子化→**多数決で1〜2小節ループに折り畳み**→ `{rhythm:{steps, lanes:[{name,midi,hits}]}}`（`midi-import.ts drumRhythm` と同形）。**折り畳みは meter 確定時のみ**（低信頼なら生オンセットは残すがネタ化は控えめ／手動区間指定後）。
- **bassネタ**：`bass_notes`→グリッド量子化→`chords_timeline` から各時点コードを引き **pc−ルート音程→度数**（R/3/5/7/8/approach）→ループ折り畳み→ `{mode:"relative", steps, pattern, preview_chords}`。写像不能音は最近傍度数or棄却、mapped_ratio を信頼度に。絶対 `bass_notes` は analysis.raw に保存。
  - **→ 是正（2026-07-08・ドラム区間分解の原則に整合・SDD更新）**：上記「相対度数＋ループ折り畳み」は**保留（後段の任意リファイン）**。**採用＝絶対音・区間ごと**：`bass_notes`(秒)→拍へ変換→**ドラムと同じ区間境界(`extractSectionPatterns` の `secs`)で per-section の `{kind:"bass", content:{notes:[{pitch,start,dur}]}}` ネタ**（絶対音・低域・genBass絶対モードと同形）。理由＝(1)**メロ(vocal)は本質的に絶対音**なので絶対notes-区間で作れば **bass↔vocal で抽出機構が完全共有**（オーナー方針「ベースから始めてボーカルに展開」の最短路）(2)ドラムで確立した「1小節ループに畳まず全曲を区間分解・実音に忠実」と整合（L859のドラム「ループ折り畳み」記述も `extractSectionPatterns` に既に置換済＝[[2026-07-08-drum-transcription-journey]]）。相対度数bassは reuse/移調に効くので**別ネタ種の後段強化**として残す（コード精度が上がってから）。
- title「アナリーゼ: X のドラム/ベース（候補）」・tags `["アナリーゼ","候補"]`・tempo/meter 付き。受け皿（rhythm/相対bassスキーマ・`hasMusic` 両対応）は既存＝流し込むだけ。

**モデルは差し替え可能・良し悪しは計測で決める**：分離器＝**htdemucs 既定**＋A/B枠（htdemucs_ft／将来 RoFormer系。ただし**RoFormer重み・BeatNet=非商用の恐れ／Chordino=GPL＝製品NG**、コアの demucs/librosa は MIT/ISC 商用OK）。ドラム分類＝**帯域ヒューリスティック自前(v1)**（追加依存ゼロ・土台用途に十分）→計測でADTOF等へ昇格。ベースピッチ＝**pyin(v1)**→basic-pitch とF値A/B。

**検証（正解が実在する領域＝メロ生成と違い計測が機能）**：フルF値harnessは不要。**知ってる曲を流して耳/目で照合**。役割分担＝**DeepSea.mp3(6拍子メイン+5スパイス)＝ドラム"オンセット抽出層"の検証**（meter無関係）／**4/4の既知曲(SURFACE等・YouTubeからyt-dlp)＝"ループ折り畳み+meter層"の検証**。後で分離器/検出器をA/Bする時のみ既知曲2-3で当たり/外れをメモる程度。

**フェーズ**：手1＝ドラム→拍/ダウンビート/拍子の土台＋rhythmネタ（`analyze.py`にstem保存+drum_onsets／新`audio-drums.ts`純関数TDD／reaper配線）。手2＝ベース→相対度数bassネタ（新`audio-bass.ts`）。着手は**TS純関数のテスト先行**（合成オンセットで赤→緑）→Python perception→既知曲で納得チェック。

#### 決定：アナリーゼ研究フレームワーク＝コーパス × レンズ（#S11・2026-07-06・要件確定→設計）
**背景**：単曲ワークベンチ(#S10)は"おもちゃ"。実用＝**作家/ジャンル横断で共通の手癖を抜く「研究」**。研究は
**歌詞／コード／構成／メロ…と見る軸(レンズ)が変わる（全部のことも）**＝コード限定の集計は雑。一般フレームワークにする。
**ランタイムの脳＝Sonnet**（発見＋統合文）、**実装は適材適所**（Opus/Sonnetサブエージェント使い分け）。

**中核の気づき**：研究の主目的（共通コード進行）は**度数正規化すれば調も拍子も無関係**（Amの曲もCの曲も `i-VI-III-VII`）。
＝研究は**ワークベンチ/アンカー/拍子と切り離せる**（コード列を度数化してクロス曲n-gramを数えるだけ）＝単曲解析より軽い。

**研究モデル＝コーパス × レンズ**：
- **新 kind `study`**。content＝`{topic, corpus:[{title,sources:{audio?,lyrics?,chart?}}], lenses:[…], findings:{レンズ別の袋},
  outputs:[弾ける/使える抽出], prose:横断統合文}`。**findings はレンズ別**＝レンズ追加で袋が増えるだけ（拡張に強い）。
- **レンズ＝プラグイン**：`{sources(要る元ネタ), perWork(raw→features), aggregate(features[]→共通+stats), outputs, method(決定的/Claude/混合)}`。
  `lenses/` に1レンズ1ファイル、registry で引く。元ネタもやり方もレンズごとに非対称でよい（コード=決定的、歌詞=Claude寄り）。

**サガ（投げて→裏で→トレイ）**：`study` ジョブ params`{topic, works:[{title,audioUrl?…}], lenses:[…]}`。runner＝
①work×lens の元ネタ収集（コード/構成/メロ→audio解析、歌詞→歌詞fetch）②レンズ別 aggregate（決定的は関数・Claude寄りは
claudeShot）③**横断統合(Claude 1回)**→ study ネタ＋出口ネタをトレイ。停止/削除＝既存 job-procs。
**Sonnet(ランタイム)** ＝チャットで「畑亜貴を6曲研究」→ WebSearch で works＋URL 発見＋レンズ判断→ `start_study` 一発。あとは裏。

**レンズ（確定）**：
- **v1実装＝コード＋構成**（どちらも audio 解析1本から）：
  - **コード**（決定的）：`chordsFromTimeline`＋`mergeChords`→`detectKeyFromChords`で調→**度数正規化**→クロス曲 n-gram(2-4和音)
    を「何曲に出るか」で頻度カウント→共通進行。出口＝代表キーで実音レンダした**弾ける chord_progression ネタ**（tags:[研究,共通]）。
  - **構成**（半決定的）：※audio のセクション検出は今 gap＝**v1 は"コードのループ並び"から構成を導く**（`extractLoops` 再利用
    ＝どの進行ループがどう並ぶ/繰り返すか＝作家のアレンジ型）。全音 section 検出(allin1級)は後の上積み。
- **設計済・defer**：**歌詞**（元ネタ=歌詞ソース未確保で v1 外す・確保でき次第プラグイン）／**メロ**（melody_notes から輪郭/音域/リズム傾向・後）。

**コーパス収集＝Sonnet 全自動**（曲名だけで WebSearch→URL）。リスク＝曲選び/URL が Sonnet まかせ＝**結果に人が目を通す前提**。

**TDD**：`commonProgressions`（度数化＋クロス曲 n-gram 頻度・純関数）先行／構成レンズ（ループ並び・純関数）／`study-runner`
（N解析→集計→prose→study/進行ネタ）／`start_study` verb（allowlist 一致）。既存資産再利用：`chordsFromTimeline`/`mergeChords`
相当・`detectKeyFromChords`・度数変換(`normalizeToC`/key-degree)・`extractLoops`・`findProgressions`。

#### 決定：主レンズを「クロス曲頻度」→「曲内反復ループ」へ（#S11改・2026-07-06・実測駆動）
**実測**（`docs/research/2026-07-06-within-song-loop-lens.md`＋`-surface-shiina-study.md`＋`-hayashibara-loop-reproduction.md`）：
上の `commonProgressions`（クロス曲 n-gram 頻度＝「何曲に出るか」）は **♭VI–♭VII–i のような"どの短調曲にも出る汎用の繋ぎ"を上位に出す**＝
美味しい所を拾えない（ユーザー指摘で判明）。**曲間で被る進行は汎用だから被る**、という当たり前を数えていた。
**正しい主レンズ＝曲内反復ループ（per-song core loop）**：1曲の中で繰り返される進行＝その曲のサビ/コア＝個性。
- SURFACE(実質1作曲者=永谷)＝4曲が ♭VI–♭VII–i 系で強く一致（手癖が立つ）。林原めぐみ(複数作曲者)＝各曲バラバラ（純Aeolian/本物のV/単純メジャー）。
- ⇒ **曲内ループ・レンズは判別力を持つ**（頻度レンズは両者で♭VI–♭VII–i を出し区別できなかった）。**手癖の単位は「歌手/アーティスト」でなく「作曲者」**（studyは作曲者で括るのを基本に。所見で「単一作曲者か・核が立つか」を明示）。

**設計変更**：
1. **`songCoreLoops(chords)` 純関数（新・主役）**：曲内 L∈{4,8} の最頻n-gram（出現回数付き・`n>=2`）＝コア・ループ。
   **`被覆=回数×長さ` は使わない**（2連断片を過剰贔屓する実測バグ）＝「最頻の 4連/8連」で見る。度数化は **dur重み `resolveTonic`**（出現数重みは
   ループ先頭に居座る ♭VI を主音と誤検出＝実測で確認）。
2. **cross-song は「core loop の度数shape 一致」で見る**（generic n-gram 出現でなく、各曲の反復ループ同士の一致＝設計図レベルの手癖）。
   既存 `commonProgressions` は補助（"共有される最小公倍数"を見る用）に降格＝残すが主役でない。
3. **per-song 生コード列を dur込で保存**（study content の `songs[]` or analysis ネタ）＝再解析(DL+Demucs 数分)を二度払わない。今の runner は抽出後に破棄していた＝要修正。
4. **調は必ず dur重み `resolveTonic`**・ループ検出は phrase 長(4/8)優先。
5. StudyView：曲ごとの core loop（実音・試聴可）を主役表示に。

**TDD追加**：`songCoreLoops`（曲内最頻ループ・回数付き・2連断片を出さない・dur重み度数化）先行。既存 `commonProgressions`/`resolveTonic`/`renderFrameTonic` 再利用。

#### 決定：MCP の道具を「目的」で再設計（#101・2026-06-24・#100 の具体化）
ユースケースは `docs/usecases-compose.md`（U1-U21・生きた文書）。**白紙サブエージェント（既存39ツールを見ずに導出）＋実在39との突合**で収束。
- **問題**：現MCPは39ツール＝**機械動作名**（gen_chords/substitute_chord/fit_to_chords/emotion_shift…）。ユーザーの**目的の言い方**（後ろをオープンに／合わせて／きれいに）と噛まず、Claude が「"オープン"はどれ？」を逆算＝彷徨いの源。**目的で命名し直す＋数を絞る。**
- **決定＝チャット面は9ツール**（39は目的で畳める。引数に概念を宿し、道具は動作の種類だけに対応）：
  - **A 真実源を書く（確定・人が選んでから）**：`capture`(置く＝create_neta)／`revise`(直す/上書き/削除＝update/delete_neta)／`assemble`(組む＝place_child/remove_child)
  - **B 決定論エンジン（候補を返す・保存しない）**：`generate`(枠/様式から作る←gen_chords/gen_named_progression/gen_bass/gen_drums)／`fit`(合う物を作る＝コードに合うメロ・ハモ付け・音節合わせ←gen_melody/harmonize/fit_to_chords)／`transform`(範囲＋目標で変形・確定変換←substitute_chord/emotion_shift＋移調/拍子)／`continue`(時間方向に伸ばす←next_chord)
  - **C 読むだけ**：`search`(意味/様式/名前/類似/対照/一覧←list_neta/facets/find_progressions/find_similar/melody_similarity)／`analyze`(同定/説明/当てはまり判定←analyze_fit/analyze_progression/detect_key/identify/explain・**全生成/修正の土台 #92**)
- **CUT**：`create_job`/`list_jobs`/`get_job`/`get_job_results`（旧・非同期ワーカー経路。どのUCにも出ない）。
- **4横断語彙＝概念は道具でなく共通引数に宿す**（道具増殖を防ぐ・ここが実作業の核）：**range**(範囲＝後半だけ)／**feel**(感じ＝オープン/緊張/切ない)／**style**(様式＝artist/mode/名前付き)／**role-structure**(役割Aメロ/サビ・構造 4小節×2連結)。これを transform/fit/continue/generate/search が共有。
- **道具にしない（AIオーケストレーション）**：U18仕上げ（analyze→transform→人が選んで revise）／U10追従（analyze→fit→revise）／U16調べて反映（Claude Web→generate）。fuzzy高レベルはClaudeが9道具を組む。
- **生成のルーティング（真実源を保つ・#86/#98 と整合）**：枠→エンジン(generate)／名前付き→gen_named_progression／**様式・アーティスト→まずコーパス引き(search)→下敷きにClaude適応**／いずれも **analyze が必ず検算**（"AIは捏造しない"＝"エンジンが全部作る"でなく"analyzeが必ず通る"で守る）。
- **引く系の鉄則（#151＝当てずっぽう禁止を検索へ）**：「切ない進行/あの曲のコード/YOASOBIっぽく」は**捏造しない**＝①ネタ帳コーパス（アーティスト進行が入っている＝U-FRET取込・例 `Mr.Children-Again` source/tags）→②Claude Web→③無ければ「見つからない」と言う。この連鎖はAIオーケストレーション。
- **エンジン欠落（#101が露わにした実作業・要実コード確認）**：(1)**range**（部分操作）(2)**feel語彙**（mood/emotion_shift止まり＝"オープン/解決有無"未モデル）(3)**role/structure**（Aメロらしさ/フレーズ連結）(4)**確定変換(移調/6-8)がMCP未公開**（worker handler のまま）(5)**対照(contrast)検索**未実装(6)**複数小節/役割への継続**（next_chordは1手）。→ ③の中身＝この欠落埋め＋目的命名のラッパー。
- **粒度の根拠**：書込は作る/直す/組むの3で閉じる。生成方向は無から/並走/変形/延長の4が直交（畳むと意図が潰れる）。読取は探す/判るの2。fuzzyは道具化せずオーケストレーションへ逃がす。
- **研究反映＝粒度に赤入れ（web根拠・2026-06-24・9→10へ）**：「39→一桁・目的命名」は実証的に正しい（<10ツール推奨／7ツールで50ツール並み／Copilot 40→13で改善：RAG-MCP[2505.03275]・"How Many Tools"[2605.24660]・Anthropic "writing tools for agents"）。プリミティブ多数をClaudeに連鎖させる案(b)は却下（多段で失敗複利63%・順序完全一致28%・中間状態喪失）。**ただし9案の2欠陥を是正**：
  1. **`transform` を mode 多重化にしない**（fat tool＝parameter hallucination 直撃／6-10パラメータで誤り増）→ **`reshape`(feel/range で寄せる・候補・解釈を伴う)** と **`convert`(移調/拍子＝確定・AI判断不要・mode enum 正当)** に**2分割**。**9→10**（10も精度の理想帯）。
  2. **`generate`↔`fit` の重複を入力で排他**（Anthropic最大の警告＝overlapping tools）：**`fit` は基準(chords/melody)入力を必須**・`generate` は基準なし。「人間がどちらを使うか即答できないならAIにも無理」。
  3. **横断概念(range/feel/style)は"修飾引数"でOK**（同一動作の修飾＝mode分岐でない＝fat化しない）。enum値はユーザーの言い方へ寄せ＋自由文fallback（'ORG'罠回避）。**ただし role/structure(4小節×2連結)は構造操作＝引数でなく `assemble`/`continue` 側へ**（引数吸収を構造まで広げると fat化）。
  4. **defer_loading/tool-search は10ツールに不要**（数十〜数千ツール帯の薬・過剰）。代わり**ツール定義を長命プロセス先頭に固定しプロンプトキャッシュ**（単一ユーザー/Max・レイテンシに最適）。
  - **Haiku仮説＝半分当たり**：個別確定呼び(capture/convert単発)はHaiku可、**fuzzy多段(U18/U16)はHaiku不可＝能力問題（粒度で消えない）**→ sonnet/opusがオーケストレータ・Haikuは個別実行のみ（#100の出し分けが正・Haiku単独運用は狙わない）。
  - **最終形＝10 thin verbs**：A書込 `capture`/`revise`/`assemble`・B生成(候補) `generate`/`fit`/`reshape`/`convert`/`continue`・C読取 `search`/`analyze`。横断概念=B群の共通"修飾引数"。fuzzy=オーケストレーション。承認=A/B分離で担保。

#### 決定：MIDI取り込みの worker 分割(#81) — 過去資産を素材化（design#16 通り）
- **問題**：従来は web `midiToNotes` で **melody 1本**に潰していた（design#16 の worker(mido)分割と乖離）。
- **フロー**：web が MIDI を **base64 で `import_midi` ジョブに載せる**（asset経路もhandler-DB結合も不要・handlerは純粋 params→result を維持）→ worker `handle_import_midi`(mido) が **トラック×チャンネルで分割**（ch10[0-index 9]=ドラム→rhythm、他=melody・原音高そのまま＝二重トランスポーズ回避#41）→ `reapResults` が **import_midi の result.tracks を複数ネタに materialize**（web は自分でネタ化しない＝stale ガード無しで即回収、空は空マーカーで再reap防止）。
- **MVP/後続**：**コード進行の自動検出は本質的に難しいので後回し**（chord ネタは作らない）。velocity/テンポ/拍子の精緻化、neta_asset(#83)での元MIDI紐付けも後続。worker に **mido** を追加。
### Chat（AI相談）パネル（GUI #19）
- 画面右に常駐するChat。Claudeとの相談＋依頼の窓口＝**Claudeプランナーの会話フロント**。
- **"相談"と"投げる"は同じClaudeの2モード**：軽いターン＝即応の相談・壁打ち／重いターン＝plan-jobを生成（非同期、結果はChatと対象netaの受け取りに返る）。

#### 決定：Chatモード統合（#61・GUI #19 改訂）
> **⚠️ #100 で置換（2026-06-24）**：判別ユニオン(`handle_consult` が `chat|options|content|plan|proposals` を返しクライアントが switch)は**廃止方針**。Claude クライアントが自然文で喋りつつ構造化はツール呼び出しで起こす（作曲MCP＋薄いラッパー）。以下は経緯記録として残す。
- **問題**：実機で「チャットでコード進行作って」が `other` ネタに落ちた。根因＝(1) `Chat.pick()` が `kind: target?.kind ?? "other"`（無targetのグローバルChatは常に other）、(2) 壁打ち(suggest)はテキスト案しか出さず `chord_progression` content を生成する導線が無い。さらにユーザー指摘「壁打ちとおまかせの差が分からない／普通のチャットAIは一本化されてる」。
- **決定**：Chatのモードを **「相談」と「調べる」の2つに集約**。**壁打ち(suggest)＋おまかせ(plan)→「相談」に統合**（実装都合の漏れだったモード区別を畳む）。調べる(research/参考曲)は intent が別物なので残す。
- **「相談」の挙動**：1つの会話で Claude が内容を見て分岐＝(a) 会話テキストで返す／(b) 発展案（選択カード）／(c) **生成要求（メロ/コード/リズム/全体）は正しい kind のネタを生成**。生成は同期（その場でネタ化、`from_job` で対象に紐づく）。重い多段は従来どおり plan として裏で進み受け取りトレイへ。
  - **(c)の生成本体は cm-music（ルール）が担う（#86/#12）**：Claude は「どの kind を・どんな枠で」を判別するだけで**音符は作らない**。`handle_consult` が cm-music を直呼びして content を組み、`analyze_fit` で当てはまりを添える。（移行は判定器でルール vs Claude を実測してから。）
- **otherを出さない**：案の保存 kind は「対象があればそのkind、無ければ `knowledge`」。生成結果は `gen_*` の正準kind（melody/chord_progression/rhythm）。`other` フォールバックは廃止。**ただし捕獲(Capture)でユーザーが手動で選べる `other` kind 自体は残置**（自由分類の受け皿。廃止したのは Chat の自動フォールバックのみ）。
- **契約**：worker に統合 intent（例 `consult`）。返りは判別ユニオン `{type:"chat",text}|{type:"options",options[]}|{type:"content",neta_kind,content}|{type:"plan",...}`。Claude にどれを返すか選ばせ、`_extract_json` で頑健にパース、非JSONは `type:"chat"` 扱いにフォールバック（#43 同型）。
- **スコープ**：コア/契約変更なので 設計→design-Acceptor→実装→impl-Acceptor で進める。

##### 実装設計：consult 統合intent（#61）※design-Acceptor(REVISE)反映
- **前提リファクタ（検証ロジックの純関数化）**：現状 chord/rhythm の検証は `handle_gen_chord`/`handle_gen_rhythm` 内インライン、melody の `_extract_notes(text)` は**str入力**。consult から流用できないので、**dict入力の検証純関数を切り出し handle_gen_* と handle_consult で共有**する：
  - `_validate_notes(data: dict) -> list` ＝ `_extract_notes` の dict 版（`data["notes"]` を pitch/start/dur 整形）。`_extract_notes` は `_validate_notes(json...)` で実装し直す（後方互換）。
  - `_validate_chords(data: dict) -> list`（`_root_pc` 整数化＋start/dur float＝現 handle_gen_chord の内包表記を関数化）。
  - `_validate_rhythm(data: dict) -> dict`（lanes 整形＝現 handle_gen_rhythm を関数化）。
  - handle_gen_* は上記を呼ぶだけに簡約（挙動不変＝既存 worker テストが緑のままであること）。
- **worker `handle_consult(params)`**：`params={context, instruction, target_kind?}`。Claude に判別ユニオンを1つ返させる。**判別方針（プロンプトに明記）**：生成語彙（作って/生成/メロ/コード/リズム）＝`content`／提案・案出し請求＝`options`／一式そろえる等の多段＝`plan`／それ以外＝`chat`：
  - `{"type":"chat","text":"..."}`
  - `{"type":"options","options":[{"title","body"}]}`
  - `{"type":"content","neta_kind":"melody|chord_progression|rhythm","content":{...}}`（kind別スキーマ）
  - `{"type":"plan","subtasks":[{intent,params}]}`（使える intent に **consult は含めない**）
- **検証＆フォールバック（#43同型）**：`type=content` は `neta_kind`（3種のみ許可）に対応する `_validate_*` で再検証し空/不正なら chat へ。`type` 不明/非JSONも chat。**フォールバック時の `text` は生JSONを出さず**、`instruction` への定型応答（例「うまく作れませんでした。もう少し具体的だと作れます」）＝会話を壊さない。
- **run_once 拡張**：分岐を `row["intent"]=="plan" or (row["intent"]=="consult" and result.get("type")=="plan")` に。subtasks 形は plan と同一なので `_enqueue_children` をそのまま使用、`target_neta_id` 伝播。**`_enqueue_children` のスキップ条件に `consult` を追加**（consult の子に consult を積ませない＝自己再帰/無限ループ防止）。
- **MCP enum**：`HANDLERS` に `consult` 追加と `create_job` intent enum への `consult` 追加は**同時**（#44 の HANDLERS↔enum 一致の不変条件）。`suggest`/`plan`/`brainstorm`/`gen_*` は残置（MCP/他経路の後方互換）。
- **web Chat 改修**：モードを **`consult`(相談)/`research`(調べる)** の2つに（壁打ち/おまかせボタン廃止）。送信時 `createJob({intent: mode==="research"?"research":"consult", target_neta_id, params:{context, instruction:text, target_kind: target?.kind}})`。done の `result.type` で分岐：
  - `chat` → テキスト＋知見化（既存）。
  - `options` → 選択カード→ `pick` は **kind=`target?.kind ?? "knowledge"`**（**other 廃止**）、`from_job`。
  - `content` → `createNeta({kind: neta_kind, content, from_job})` 即ネタ化＋「『{neta_kind}』を作りました」表示、`onChanged`。
  - `plan` → 「分解しました（受け取りトレイ📥へ）」（既存 plan 表示）。
- **不変**：`research`(参考曲#9)・`reapResults`(consult非対象＝二重ネタ化なし)・`suggest/plan/brainstorm/gen_*` ハンドラ残置。`other` kind フォールバックのみ廃止。
- **テスト**：
  - worker：`handle_consult` を claude_prompt mock で type 別（chat/options/content各kind/plan/非JSON→chat/空content→chat）検証。`_validate_chords/_validate_rhythm/_validate_notes` の純関数テスト。**既存 handle_gen_* テストが緑のまま**（簡約で挙動不変）。
  - web：Chat の consult 各 type 分岐（content→正しい kind で createNeta、options→`knowledge`）。**既存 `Chat.test.tsx` の `kind:"other"` assertion を `kind:"knowledge"` に更新**（TDD 赤→緑）＋ research 系テストは不変。

#### 決定：Chat履歴の永続化（#70）
- **問題**：Chat のメッセージは `Chat.tsx` の `useState` だけに在り、リロード／再オープンで消える。相談・調べたログが残らず、原則3（見てない間も貯める／積み上げ）に反する。
- **決定**：**サーバ保存**でリロードしても会話が残す。**スレッド = 対象ネタ id**（target 付きで開けば対象ごと、無ければ汎用スレッド `'global'`）。今回の縦スライスは **保存／復元／クリア** のみ（履歴検索・多スレッド切替UIは後続）。
- **スキーマ（db.ts・CREATE IF NOT EXISTS で既存DBに増設・migrate不要）**：
  - `chat_message(id TEXT PK, thread TEXT NOT NULL, role TEXT NOT NULL, kind TEXT, text TEXT, data TEXT, created TEXT NOT NULL)` ＋ `INDEX idx_chat_thread(thread, created)`。
  - `thread` ＝ 対象 neta id ／ `'global'`。`role` ＝ `user|ai`。`kind` ＝ 描画分岐（chat/options/content/plan/research…任意）。`data` ＝ JSON（options/references/neta/jobId 等の構造化ペイロード）。`text` ＝ 表示本文。
- **コア（core.ts）**：`addChatMessage({thread, role, kind?, text?, data?}): ChatMessage` ／ `listChatMessages(thread, limit=200): ChatMessage[]`（created 昇順） ／ `clearChatThread(thread): void`。`ChatMessage` 型を export（`data` は parse 済み unknown）。
- **契約（http.ts・既存 onRequest の CM_TOKEN ゲートが自動適用）**：
  - `GET /chat/:thread/messages` → `ChatMessage[]`（昇順）。
  - `POST /chat/:thread/message`（zod：`role` 必須、`kind/text/data` 任意） → 作成された `ChatMessage`。`role` 欠落は 400。
  - `DELETE /chat/:thread/messages` → `{ cleared: true }`。
- **api.ts**：`listChatMessages(thread)` ／ `addChatMessage(thread, msg)` ／ `clearChatThread(thread)`。
- **Chat.tsx**：開いたとき `thread = target?.id ?? 'global'` のメッセージをロードして**復元描画**（既存の discriminated union 描画＝text/options/references/neta をそのまま使う）。各メッセージ送受信時に `addChatMessage` で**保存**（user 送信時・ai 応答時）。クリアボタンで `clearChatThread`＋画面クリア。**保存／ロード失敗時は従来どおりメモリだけで動く（後退ゼロ・try/catch で握り潰す）**。target 付きの自動初回提案は履歴が空のときだけ走らせる（復元後の二重提案を防ぐ）。
- **テスト**：api unit（add→list が created 順／thread 分離／clear で消える／role 必須の 400）。web（モック api で「開く→既存メッセージ復元表示」「送信で addChatMessage が呼ばれる」）。既存 api/web は緑のまま。

#### 決定：Chat がワーカー完了をその場で待つ（受信箱お任せをやめる）（実装 2026-06-22）
- **問題**：consult が `plan`（子ジョブに分解）や `items`（agentic 一式）を返すと、結果の materialize は reap（server interval）任せ＝Chat は「受け取りトレイ 📥 に届きます」と言って手放す。ユーザーがトレイへ移って確認する分断が UX を悪くしていた。
- **決定**：**ディスパッチ後もそのチャットで完了を待ち、できたネタをインライン表示**する。待ち中はそのチャットの**入力をロック**（busy のまま＝「待ち中は話せなくてよい」要望どおり）。consult 自体は従来からインラインで待っていた（`run` のポーリング）ので、追加するのは **plan の子ジョブ／items の reap 完了待ち**。
- **契約（新規・read-only）**：`GET /job/:id/outcome` → `core.jobOutcome(id)` ＝ `{settled, failed, jobs[self+children], neta[]}`。settled=自分＋子（`parent_job_id=自分`）が全終端。neta=自分＋子の `job_result` から集めた生成ネタ。**競合なし**：worker は consult を done にするのと子 enqueue を**同一コミット**で行う（run_once）ので「done だが子未登録」は起きない。
- **web（Chat.tsx）**：plan/items 分岐で `waitForJob(jobId)`＝`jobOutcome` を settled までポーリング→reap interval(5s) のネタ化を最大 ~9s 猶予→できたネタを `開く/試聴` 付きでインライン表示（失敗数も提示）。閉じた後に setState しない `alive` ガード。後退ゼロ：タイムアウト時のみ「トレイ 📥 をご確認ください」。
- **テスト**：api（jobOutcome＝子が queued の間 settled=false／全終端＋reap で neta 集約／失敗カウント／HTTP 200）。web（plan→jobOutcome ポーリング→「N個できました」＋open-neta インライン表示）。既存は緑のまま。

#### 決定：再生トランスポート＆プレイヘッド（#57/#58/#59）
- **構造的事実（要移行）**：現 `playNotes`（music.ts）は **Tone.Transport 不使用**＝`Tone.now()` 基準で `triggerAttackRelease` を一括スケジュール。よって**途中停止・一時停止・ループが原理的に不可**。→ #57停止・#59一時停止/ループは **再生エンジンを Tone.Transport ベースに移行**して初めて成立（これが基盤タスク）。
- **#57 再生/停止トグル**：同一ボタン ▶⇄■。**停止＝位置保持（pause相当）を既定、頭出しは ⏮ で分離**（Pause専用ボタンを置かない＝狭幅でボタン数最小）。Space=再生/停止。
- **#58 プレイヘッド**：全エディタ（メロ/コード/リズム＋既存section）に赤線展開。実装は **`left`→`transform: translateX`／毎フレーム setState をやめ ref 直書き／モバイルは page-turn 追従（端で1画面送り、手動スクロール検出で追従停止→タイマー復帰）**。`usePlayhead` は「state返却→ref直書き」へ作り替え、時間ソースを1箇所に隔離（now補間→将来 `Transport.seconds - lookAhead` に差替可能に）。
- **#59 トランスポートUI**：**下端固定の最小バー**＝`⏮ / ▶■ / 🔁ループ / 小節:拍表示 / ⋯（メトロノーム/テンポ/拍子/追従設定を退避）`、タップ標的44px。ループ区間未指定は編集対象の全長。デスクトップは分離ボタン＋時間拡張＋ショートカット。録音は対象外（MIDI直接編集のため）。
- **段階**：①エンジンTransport化（基盤・契約）→②#57トグル＋#58プレイヘッド作り替え→③#59バー＆ループ。①は設計→Acceptor を挟む。

##### 実装設計：①エンジンTransport化（契約）
**※ design-Acceptor(REVISE) を反映。①のスコープは engine（player）＋純関数テストに限定。usePlayhead 作り替えと SectionEditor のプレイヘッド改修は ② に寄せる（①では usePlayhead に触れない＝①完了時に SectionEditor を壊さない）。**
- **①のスコープ確定**：`music.ts`（または新 `player.ts`）の `playNotes` を Transport化＋スケジュール時刻の純関数化＋ユニットテストまで。**既存3呼び出し元（`NetaList.tsx:131`/`NetaDialog.tsx:196`/`SectionEditor.tsx:131`）は `void playNotes(...)` のまま新APIに適合＝機能後退なし**（戻り Handle は②で配線）。`usePlayhead.ts`・`SectionEditor` のプレイヘッド（`beat` state購読・`left:calc`・`startPlayhead`シグネチャ）は **①では一切変更しない**。
- **新API（player）**：`playNotes(notes, bpm, opts?) => Promise<PlaybackHandle>`。`PlaybackHandle = { pause(): void; resume(): void; stop(): void }`。`opts={ loop?: {startBeat,endBeat}, onEnd?: () => void }`。①では呼び出し元が戻り値を使わなくても従来通り鳴る（後方互換）。
- **スケジューリング**：`Tone.getTransport()` を使う。再生開始時に `transport.stop(); transport.cancel(0)`（前回分を破棄＝**単一再生**。今の二重再生バグも解消）。`transport.bpm.value = bpm`。各音は `transport.schedule((time)=>{ synth.triggerAttackRelease(freq, durSec, time, vel) }, n.start*spb)`（spb=60/bpm、beat=四分=1.0 は不変。コールバック引数 `time` を必ず triggerAttackRelease に渡す＝Tone.now()直使用しない）。終端で `transport.scheduleOnce(()=>{onEnd?.(); handle.stop()}, totalSec)`（**非ループ時のみ**）。最後に `transport.start()`。
- **ドラムキット定数の完全踏襲**（現 `music.ts:234-246` 準拠）：`pitch<=41`=`MembraneSynth`（固定長 `0.15`）／他=`NoiseSynth`（固定長 `0.05`）、メロ/コードは `PolySynth`、velocity 既定 `(n.vel??100)/127`、発音長 `n.dur*spb`。drum は channel9 相当（書き出し側 notesToMidi の扱いは無改修）。
- **synth ライフサイクル（リーク解消を①で）**：プレイヤーモジュールが現 synth 群（poly/membrane/noise）を**モジュール変数で保持**。再生開始の冒頭で**旧synth群を dispose→新規1組生成**。`stop()` でも dispose。現状の「呼ぶたび `toDestination()` 生成・dispose無し」(`music.ts:224-229`)のリークを①で解消。
- **停止/一時停止/冪等**：`pause()=transport.pause()`（位置保持）／`resume()=transport.start()`／`stop()=transport.stop(); transport.cancel(0)`（未発火 scheduleOnce も消える＝手動stop後に終端が再発火しない）＋synth dispose＋位置0。**`stop()`/`pause()` は冪等**（複数回呼んでも安全）。**停止＝位置保持を既定**にするため②でUIの■は内部的に pause を呼ぶ（頭出し⏮で stop+0）。
- **ループ**：`transport.loop=true; loopStart=startBeat*spb; loopEnd=endBeat*spb`。区間未指定は 0〜totalBeats。
- **テスト**：音は検証不能なので **スケジュール時刻算出を Tone非依存の純関数に切り出してユニットテスト**：`scheduleTimes(notes,bpm) => {time,durSec,isDrum,...}[]`・`loopRange(opts,totalBeats,bpm)`・`totalSec(notes,bpm)`。既存 `test/music.test.ts` は `tone` を import せず `@tonejs/midi` のみ＝同枠で検証可能。
- **不変（壊さない）**：`notesToMidi`/`downloadMidi`（書き出し）無改修。content の四分基準・transpose・meter 由来の小節幅も不変。

##### 実装設計：②プレイヘッド作り替え＋#57トグル（①の後）
- `usePlayhead` を **Transport直読み**へ：表示beat = `Math.max(0, (transport.seconds - lookAhead)) * bpm/60`（**負clamp必須**＝開始直後 seconds<lookAhead で線が左端外に出るのを防ぐ。lookAhead=`Tone.getContext().lookAhead`）。`requestAnimationFrame` で **ref直書き（`transform: translateX`）**、毎フレーム setState しない。pauseで線保持・stopで先頭・loopは seconds が自動で戻る。
- **②は縦スライス**：usePlayhead の API変更（state返却→ref/start(handle)）と、それに依存する `SectionEditor`（`beat` state廃止→ref/transform化、`startPlayhead(dur,tempo)`→新シグネチャ）改修、`NetaDialog` への展開、#57 ▶⇄■ トグルを**同一スライスで**行う（①完了後なので engine は安定）。

##### 実装設計：④全エディタへ展開＋追従スクロール（#74・#62包括）
- usePlayhead は `--ph`(0..1比率, fit-to-width用) に加え **`--phb`(生beat, clampあり)** も ref直書き。グリッド系は **コンテンツ座標 `left: calc(gutter + var(--phb)*pxPerBeat)`** で横スクロール追従（1拍=セル幅×4）。PianoRoll(gutter40/48px)・RhythmEditor(gutter58/88px)・ChordPatternEditor(gutter58/88px)。SectionEditorは fit-to-width の `--ph` 維持。※StepPad は撤去済（2026-07-04・パッド入力廃止）。
- **追従スクロール（page-turn）**：usePlayhead に `scrollerRef`。線が右端-16pxを超えたら線を左30%へ送る。**手動スクロール(wheel/touchstart/pointerdown)後2.5sは追従停止**、programmaticフラグで自分のscrollと区別。
- 各エディタは `playheadRef`/`scrollerRef` を受け取り line と scroller を ref付け。NetaDialogが active editor に `tp.lineRef`/`tp.scrollerRef` を配線。
- **ChordEditorは対象外**：タイムラインでなくコード行リスト＝赤線が不自然。再生中コードの**行ハイライト**は React state が要り no-rerender設計と相性が悪いので別途（#76）。card個別再生・Chat試聴は editor非表示なので赤線なし（音のみ）でよい。

##### 実装設計：③トランスポートバー（#59・②の後）
- **状態機械**：`stopped`（位置0・無再生）／`playing`／`paused`（位置保持）。`useTransport(getNotes, bpm, opts)` フックに集約し、NetaDialog/SectionEditor の inline トグルを置換（重複解消）。
- **コントロール（下端固定バー）**：
  - **⏮ 頭出し**：`handle.stop()`＝stopped・位置0。プレイヘッド消灯・時間表示 1:1。
  - **▶⇄⏸ 再生/一時停止**：stopped→`playNotes()`で playing／playing→`handle.pause()`で paused（**位置保持**）／paused→`handle.resume()`で playing。＝研究の「停止は位置保持・頭出しは分離」を体現。
  - **🔁 ループ**：`loopOn` トグル。playNotes に `{loop:{startBeat:0,endBeat:total}}` を渡す。再生中にトグルしたら **その場で再生し直す**（stop→playNotes、新 loopOn 反映）＝engine無改修で終端scheduleOnceとの不整合を避ける。stopped 中は次回再生に反映。
  - **小節:拍 表示**：usePlayhead の rAF に相乗りし、`timeRef` に `${bar}:${beat}`（bar=floor(beat/BPB)+1, beat=floor(beat%BPB)+1、BPB=beatsPerBar(meter)）をテキスト直書き（再レンダ無し）。
  - **⋯ もっと**：メトロノーム/テンポ/拍子表示は後回し（プレースホルダ or 省略）。録音は対象外。
- **engine無改修**：`onEnd`（非ループ終端）→ stopped。ループ反映は再生し直しで対応（PlaybackHandle 追加なし）。
- **配置**：エディタ（NetaDialog 音楽kind／SectionEditor）下端に固定バー。モバイルはタップ標的44px。デスクトップは Space=▶⇄⏸。
- **テスト**：`useTransport` の状態遷移（stopped→playing→paused→playing→stopped、loopトグル）を Tone/playNotes をmockして検証。`bar:beat` 変換は純関数 `barBeat(beat, bpb)` を切り出してユニットテスト。
- **スコープ外（#62へ）**：追従スクロール。**この③は engine契約の小追加(setLoop)のみ＝大半はUI合成**なので design-Acceptor は省略し実装→impl-Acceptor で検証。
- **文脈認識**：いま見ている neta/section を知っていて「これどう？」が効く（＝外部化された自分に今の作業を相談する＝コンセプトの体現）。
- **簡易版UI＝Chatのみ**：出先/モバイルの最小UIとして有力（会話で捕獲・検索・投げ、結果はカードで返す）。出先=Chat駆動／家=フルGUI、Chatはどこでも繋ぐ connective tissue。最初の実装スライス候補。
- アーキ波及：会話ターンは**ストリーミング/同期のClaude経路**が要る（重い非同期ジョブとは別）。TSが狭いPythonストリーミング窓口を proxy（保留してた"同期AI呼び"がChatで現実化）。役割（TS=proxy/ルート、Python/Claude=知能）は保つ。

### AIツール層（MCP）（設計・新規 #20）
- Chat/プランナーのClaudeが"行動"する（捕獲・検索・neta操作・ジョブ生成・トランスポーズ・再生レンダ等）には**ツール層**が要る。#14-18で intent は決めたが、**Claudeが実際に操作を呼ぶ口は未設計だった**（ギャップ）。
- 方式：**MCPで公開**（native tool-use でも可）。payoff：操作が"再利用可能なツール面"になり、内蔵Chatだけでなく**任意のMCPクライアント（Claude Desktop / Claude Code 等）からも creative_manager を操作できる**＝〈外部化された延長〉の"手"が再利用可能に。
- 配置：**TSが操作コアを持ち、(a) HTTP（PWA用）＋ (b) MCPサーバー（AIクライアント用）の2アダプタで公開**。Pythonプランナーは MCP クライアントとしてツールを呼ぶ。→「TSが操作の唯一の所有者・役割が溶けない」と整合。
- 段階建て：最小は native tool-use で始め、MCPに寄せる、も可。

### ツールカタログ（＝Chatの"手" ＝ TS操作コア ＝ 実装面）
capabilities × entities で自ずと決まる。**これがMCPツール＝HTTP API＝実装すべき操作の集合**（3つが収束）。
- **ネタ CRUD**：create_neta(捕獲) / get / update / delete / list
- **合成・関連**（メインペーンのCRUD）：place_child・remove・reorder(compose_edge) / link・unlink(relation_edge) / get_composition(ツリー)
- **検索**（ネタ帳）：search(query＋facets：意味＋構造)
- **AI提案・生成**（音楽系含む）：propose(target, intent, instruction)→job生成 / analyze(mp3等)→job
- **ジョブ管理**：list / get_status / get_result / accept・reject・rethrow(再投擲)
- **曲・資産**：update_song(stage, next_action) / upload_asset・link
- **再生・書き出し**：play/render(neta/section) / export_midi(ABILITY向け)
- 帰結：このカタログ＝TSの操作コア。HTTP(PWA)とMCP(AI)の2アダプタで同じ集合を出す。Chat設計・API設計・実装タスクが一つに収束。

## #13 歌詞の音韻・モーラ分析（調査完了・決定）
- 方式：**pyopenjtalk-plus（漢字→読み、漢字混在時のみ）＋ jaconv（正規化）＋ 自作モーラ分割regex（かな→モーラ）**。Pythonワーカー内、オフライン・CPU・32GBで余裕。MCP/TS変更不要。
- フォールバック：最悪 Claude にカナ化＋発音記号をそれっぽく当てさせてもよい（読み解決は言語問題なのでClaude可）。ただしモーラ数えは regex が確実なので、Claudeは読み解決の保険に留める。
- 単位は**モーラ（音節ではない）**：長音ー/促音っ/撥音ん は各1モーラ＝1ノート割当（巷のregexはこれらを前にくっつける＝音節で誤り。**分離必須**＝最重要の正しさ）。
- 歌詞流し込み：text→(漢字あれば読み)→モーラ列→melodyのnotesに左から1モーラ1ノートで`syllable`へ。音数チェックはフレーズ/小節単位でモーラ数とノート数を比較。
- 漢字の同形異音は自動読みを正としない＝Chat/編集でユーザー上書き可。連母音(えい→ええ等)は発話モーラ数を正、歌唱実現は表示オプション。
- ピッチアクセントは extract_fullcontext でほぼ無料で取れるが v1 は不要（韻律フィットを作る時に追加）。

## #12 ノート生成エンジン（調査完了・段階決定／#86で改訂）
一発で「自作と差し替え可能」を満たす単一ツールは無い。段階建て。詳細サーベイ＝`docs/research/2026-06-21-generation-methods.md`。

> **是正（2026-06-23・アーキ是正S2後／実装の正）**：以下 Stage0-2 の本文は**初期設計＝実態と乖離**。読み替え：
> - 記号エンジンは **TypeScript `apps/api/src/music/`** に一本化（生成 generate.ts／理論 theory.ts／analyze_fit／連想／名前付き進行 progressions.ts）。**Python/music21 は廃止・依存も除去**。「cm-music(Python)」「worker内 Python 純関数」「pyproject に music21 追加」は**無効**。
> - worker は生成/判定を **api `/music` HTTP に委譲**（worker は音符を作らない）。
> - **Stage2 の cm-music-mcp(:8790) は廃止**。agentic Chat の音楽ツールは **api `/music`** を叩く（read-only 分析＋生成content返却＝書込はさせない、は不変）。
> - 役割分担(#86)・判定が提案の前提・スキーマが契約・段階思想は**不変**。Stage3/4(隔離DL)は将来。
> - **メロ生成の高度化**は別途 `docs/research/melody-generation.md`＋下記「#12-M」に集約。

**役割分担（芯・#86確定）**：**Claude＝ふわっとした言葉→構造化リクエストの翻訳（ディスパッチ）＋判定結果を読む批評**（最大1回／任意・**音符に触らない**）。**記号エンジン（music21＋ルール）＝音符づくり（生成）＋当てはまり判定**（常に・決定的・~10ms・タダ）。研究的にも LLM は和声理解が欠落＝メロ生成はルールベース未満なので、**Claudeに音符を委ねない**。「判定（合ってるか・良し悪し）できること」が**提案の前提**。

- **Stage0（AI無し・#16で規定）**：music21 で transpose/humanize/検証/MIDI取込分割。全段の土台。
- **Stage1（最初に出す＝#86で改訂）**：**ルールベース生成＋判定**を `cm-music`（worker内 Python 純関数モジュール, music21＋numpy, 単一の真実）で。
  - **判定**：`analyze_fit(melody, chords, key?)`＝拍重み在和音率＋非和声音分類（**コード既知**なので和声推定の最難関を踏まない）。`detect_key`(KS/TKP)・`analyze_progression`(roman/機能)。
  - **生成**：`gen_chords`(機能和声ルール)・`gen_melody`(コードトーン拘束＋輪郭＋マルコフ)・`gen_bass`/`gen_drums`(ルール/GMテンプレ)。作風＝few-shot(自作注入)→RAG。
  - **配線＝口1（worker直呼び）**：`handle_consult`/`gen_*` が cm-music を直呼び。**Chatも worker処理なので handler経由で music21に届く（MCP不要）**。ディスパッチ2経路：自由文Chat→Claude解釈→job ／ パネル/createJob→直（生成本体はどちらもルール）。
  - **旧Stage1「Claudeが直接emit」は撤回**。Claudeは解釈と批評のみ。Claude案の生成は即廃止せず、**判定器で「ルール vs Claude」を実測してから移管**（上位を腐らせない）。
  - **第一スライス着手の前提タスク（D2）**：`apps/worker/pyproject.toml` に `music21` を追加し worker venv 更新（現状未追加。ベンチ済 ~10ms）。`cm-music` は `apps/worker/src/cm_worker/music/` に置く。
  - **content スキーマとの接続（G1）**：`gen_chords(frame)` の戻りは **#85 の items 形**＝`{items:[{kind:"chord_progression", content:{chords:[…C基準…]}}]}`（content スキーマ #14 準拠・既存 `_validate_chords` と同形）。`analyze_fit` の引数 `chords` は content の `chords[{root,quality,start,dur}]` をそのまま受ける。
  - **判定の差し込み位置（G2）**：生成 item を reap でネタ化する**前**に `analyze_fit` を通し、結果（在和音率/外し音/スコア）を **job_result.data か item.meta に同梱**（ネタの content は汚さない）。Chat 経路は consult が `analyze_fit` を呼んで所見を返す。
  - **不適合時の扱い（G3）**：Stage1 は**そのまま content を返し判定スコアを併記**（自動再生成・補正はしない）。生成→点検→補正の自動ループは **Stage2(P2)** の範疇。
- **Stage2（agentic＝口2/MCP・P2）**：cm-music を**常駐HTTPサービス**化→**HTTP-MCP**で `claude -p`／外部Claude が agentic にツールを叩く（「作る→点検→補正→再点検」をClaudeが多段で回す）。**永続サービスでコールドスタート回避**（既存 cm-search 同期HTTPと一貫）。**stdio MCPの毎回spawnは却下**。生成→ネタ化の縫合は既存 reap が持つので、音楽MCPは**read-only分析＋生成content返却に限定**（データ書込はさせない）。
- **Stage3（伸ばす・隔離DL）**：Anticipatory Music Transformer(small/medium, Apache2.0, infilling)でメロ補完、GrooVAEでドラムhumanize、Basic Pitchでmp3採譜→作風特徴量。**別venv/Dockerで隔離**し worker本体(music21)を汚さない。AMT MIDI→content は Stage0 importer で。
  - **※2026-06-28 補正**：**メロ補完はV2ネイティブで実装済(`complete_melody`)＝AMT不要**。外部メロAI(AMT/CA2/SketchNet等)は調査の上「制御弱・丸暗記/ライセンス難・中庸」で**現状不採用**(`docs/research/usable-ai-map.md`)。GrooVAE(ドラムhumanize・TS同言語)/Basic Pitch(採譜) は将来候補として残置(優先度低＝打ち込みより[[feedback-priority-melody-first]])。
- **Stage4（任意・データ次第）**：作風寄せ＝少データでは**State Tuning（本体凍結・状態ベクトルのみ最適化）が LoRA 超え**（研究）。LoRA/フル fine-tune は過学習で保留。
- **8060S/ローカルLLMは不採用**：Claude Max前提＋**from-scratch学習はデータ律速（ハードでは解けない）**。音声生成系（Magenta RT等）は modality 違いで除外。
- **スキーマが契約**で各エンジンが裏に差さる（不変）。

### #12-M メロ生成の高度化（骨格優先・度数内部モデル／2026-06-23）
**full spec＝`docs/research/melody-generation.md`**（理論3視点＋実装サーベイ＋骨格文法）。ここは設計の確定事項。**研究の全体根拠＝索引 `docs/research/README.md`**（到達点サマリ＋全29本のグループ別目次）。
**問題**：現 `genMelody`（モチーフ反復・拍頭コードトーン）は phrase/period・句末の息継ぎ・カデンツ着地・頂点・滑り込みが**構造的に無い**＝「呼吸しない／コード音ばかりで素直すぎ」。
**方針（#86 不変＝決定的記号エンジンが音符を作る・調非依存）**：
- **表現＝度数内部モデル（保存は不変）**：メロ保存は今のまま絶対ピッチ `notes:[{pitch,start,dur}]`（PianoRoll/再生/compositeNotes/similarity 不変＝**移行なし**）。`genMelody` の**内部**を「度数(+oct+alter)＋コード文脈→文法で組む→`degreeToPitch`で絶対ピッチへ描画」に通す。新規純関数 `apps/api/src/music/degree.ts`：`pitchToDegree/degreeToPitch/isChordTone(=既存chordPcs)/classifyNCT`。`classifyNCT` は滑り込み文法判定＋連想エッセンスE5を兼ねる（S1-3とS4-5で共用）。
- **3層**：[骨格] phrase/period 割当→句末に休符/長音＋安定音着地→頂点≈0.62 ／ [制約] コードトーン拘束＋CSP規則(音域/跳躍上限/跳躍後反行/NCTは歩進解決) ／ [変奏] 既存モチーフ反復＋変換を句機能で位置駆動。
- **拍子を一級**（要件line99/104「6/8と言ったら6/8」）：拍子→`{barBeats, grouping(simple/compound), strongPositions, beatStrength[]}`。**6/8**=複合2拍子(付点四分2ビート×3分割)・beatStrength[1,.25,.25,.5,.25,.25]・6/8ネイティブのリズム図形。4/4・3/4 も。
- **弱起**（拍子別・既存 pickup=負start を生成側でも）／**滑り込み文法**（倚音=強拍へ跳躍入り→下行歩進解決・掛留=保留→強拍不協→下行解決・経過/刺繍は弱拍で歩進解決＝**孤立跳躍NCTゼロ**を生成時保証）／**素直⇔表情ノブ**（mood連動＋耳で較正・既定控えめ）／カデンツ生成（句境界フラグ→前楽節末=半終止感・終止=主音）。
- **連想(S4/5)は別トラック**（エッセンス抽出→違うメロ・著作権は抽象層のみ・LCS上限）。
**スコープ境界（要件line160と整合・2026-06-23 緩和）**：借用する種カウンターポイントの非和声音解決則は**単旋律のポップス的処理**として軽く使う。多声の対位法/声部進行は**強く制約しない**＝厳密理論で縛らない。ただし**将来どこかで軽く取り込む余地は残す**（過度な制約で壊さない＝拡張点として開けておく）。
**段階（縦スライス・TDD）＝✅実装済(2026-06-23・メロコーパスのデータ投入を除く)**：**S1**＝拍子(4/4+6/8)＋弱起＋句末息継ぎ＋カデンツ着地＋度数内部モデル（degree.ts/meter.ts/skeleton.ts）→ **S2**＝頂点アーチ(≈0.62)＋跳躍後反行＋**滑り込み(倚音・10.4)＋素直⇔表情ノブ** → **S3**＝句機能で位置駆動の変奏＋弱拍の経過/刺繍 → **S4**＝melodyEssence＋多層 melodySimilarity＋similarMelodies retrieval(/melody/neighbors) → **S5**＝genFromEssence(エッセンス→違うメロ)＋normalizeToC。受け入れ基準＝spec §7（seed固定 property・api/web緑）。**6/8はベース/ドラムも揃え済**。残＝メロコーパスのデータ収集(要ユーザー・#13対応物)。
→ **S6（次・2026-06-25 設計確定／未実装＝spec §10.7）骨格音の展開文法**：S1-5 後も「骨格決定すら微妙」が残る。原因＝`planSkeleton` が句境界/カデンツ度数/息継ぎ止まりで**骨格"音"を決めず**、背骨を genMelody の幾何アーチ(archBase 67±9)＋最寄りCTで代替＝和声盲・連結なし。目標＝`planSkeleton` に **chords を渡し**「Phrase[]＋骨格音木」を返す（和声連動ピラー・**連結4(arpeggiate/passing/neighbor/repeat)＋表情2系統(倚音掛留/逸音不完全刺繍)＋制約3(gap-fill跳躍後反行/音域/大跳躍予算)**・頂点を一音・並行period）。アーチ包絡を木の展開で置換、変奏層/制約層は据え置き。リズム変換(拡大縮小断片化)は変奏層に残しピッチ木を純粋に閉じる。**S6-a＝連結骨格＋頂点一音 実装済(2026-06-25・`planSkeletonTones`/generate-skeleton.test.ts)。大筋(アーチ・着地)は良化。** S6-b＝表面の滑らかさは診断のみ(spec§10.8)：順次率≈64%・大跳躍が体感を悪くする。出所=オクターブ折りの人工跳躍＋素のコードトーン3度。**失敗知見：オクターブ寄せ/シフトの最終パスはアーチ下行(頂点後mean低下)と喧嘩しproperty割れ＝NG。正攻法は経過音"挿入"(音を増やしレジスタ不変)＋骨格音選択の是正。モチーフ歩幅は順次寄りに調整済。腰を据えてTDD。** 残＝S6-b滑らかさ・S6-c並行period・逸音/不完全刺繍。api278緑。

→ **S7（新・2026-06-26 設計確定＝コーパス計測フィジビリ完了／未実装）リズム骨格＝学習した拍セルモデル（縦の線）。full計測=§12。** S6 は音高骨格（横の繋ぎ）。**縦＝リズム骨格（onsetがどの拍に載るか）が未モデル化**＝`rhythm.ts`/`buildMotif` は mood分類＋固定figで、コーパスに合わず・**歌詞の音数指定もできない**。著作権方針＝フレーズ辞書(retrieval=丸写しリスク)をやめ**統計のみ学習**（生メロ非保存）。
- **計測(POP909・MELODY+chord_midi+beat_midi+key／秒↔MIDIの曲別整数拍ズレを(k,φ)探索で補正し高信頼整列33%採用)で確定**：リズムは**拍子で根本別**（4/4・2/4=2分割／6/8・9/8・3/8=複合3分割で.25/.75無し／3/4ワルツ=4分多く遅い）→**拍子別モデル必須**。1小節16分パターンは pop4/4 で語彙爆発(1249種,50%=199種)だが**「1拍」を単位にすると≤16語**（=2^枠の列挙・pop4/4はデータが15使用・5語で50%/12語で90%）＝多様さは**拍の組合せ＝マルコフ**が作る。
- **モデル**：`1セル=1拍`／`枠数=拍子の最小分割`(4/4→16分4枠/6/8→8分3枠)／`語彙=2^枠（列挙・学習は頻度+遷移のみ＝NN不要）`／遷移=**`P(セル│直前セル, 小節内拍位置)`**（強拍は x.../x.x.、ウラはシンコペ＝**拍位置条件が要**・無いと強拍/ウラ差が消える）。
- **歌詞の音数指定（ユーザー要望・骨格に内蔵）**：各セルは**onset数(1〜4)を持つ**→「B拍にちょうどN音」を**拍上DP**（状態=累積onset数×直前セル・遷移確率最大・合計=N の列を読む）で**確実かつ即時**に生成（試行錯誤でなく構成的に保証）。
- **スイング/三連跳ね＝亜種「跳ねるボタン」**（打点を後処理で 1/3:2/3 へマップ・**語彙/遷移は流用**＝学習し直し不要）＝backlog。
- **接続**：`rhythm.ts`/`buildMotif` の固定figを学習リズム(拍セル+位置マルコフ+音数DP)へ差し替え。②音高骨格(S6)・③充填(§10.7)は据え置き。
- **計測による既存スペックの補正**：①**アーチは実在**（全音の平均正規化輪郭で頂点中央・末カデンツ急下降を確認）＝§10.7(a)の頂点「0.62固定」は**style/meterで可変**(pop≈中央0.5/トラッド≈前0.25)に緩める。当初の「アーチ否定(前のめり)」は頂点を**最初の最高音で採る tie処理バグ**の偽像＝撤回。②**強拍=コードトーン92%/弱拍56%**（強拍CT則を実証・当初の逆転は整列バグの偽像）。③**フレーズ頭は度数5か1で約半分**。④動きは順次主体＋下行バイアス・コードチェンジは共通音保持/順次解決。
- **段階（TDD）**：(1)`learnRhythmCells(bars,meter)→{cells:freq, trans:Map<"pos|prev",freq>}`（純関数・DB非依存・合成入力で赤）→(2)`genRhythm(meter,{bars,syllables?,seed})`（マルコフ自由生成＋音数DP・合計=syllables を必ず満たすproperty）→(3)buildMotif接続。
- **限界**：コード条件付け(②)の実証は POP909=4/4 のみ（他スタイルはコード注釈無く未検証＝理論上は一般的）。整列を増やすにはテンポマップ整列か伴奏MIDIからの和声化（別途）。

→ **S8（新・2026-06-27 設計確定＝試聴ループで導出した「有機的メロ」の再帰モデル／実装中）。full計測=`docs/research/melody-corpus-findings.md`。** S6(音高骨格)/S7(リズム)を**分けて**作ると非有機的（モチーフが「聞いたことない動き」＝手当て起因）と判明。ユーザー核心指摘＝**骨格メロ・リズム・細かい動きは連動（interlock）**。出口＝**全部を“度数move＋相対位置”の記号にして再帰3層で学習**（テンポ/調 非依存・全層小語彙・NN不要・数えるだけ）：
- **層1＝骨格メロ（1拍粒度）**：構造音は平均~1.9拍で替わる＝**2拍粒度が自然**（強拍0,2＝コードトーン）。動きは留37%/順次18%/跳躍35%・向き反転68%＝真っすぐでなく**留まる+ジグザグ+跳ぶ**（反転率の絶対値は定義依存＝傾向として扱う）。**終わり方(open/close)＝着地“位置”で出し分け◎実証**：曲末(close)は**1度73%**で締め、曲中の息継ぎ前(open)は**1度36%に下げ5度20%(＋2/3度)**で宙吊り＝**続くなら主音を避け5度**。一方 着地への“接近方向”(1度=上から/5度・8度=下から)は**△追試で再現弱・要再検証＝断定しない**。骨格は**4/8小節周期で自己反復**（移調反復含む）＝入れ子＝コヒーレンスの素。
- **層2＝joint cell（核心・8分粒度）**：1拍の中身を `度数move@slot(8分0/1)` 列に符号化し、**`P(cell│骨格move)`**（次拍への度数差±3）で学習。**条件あたり50%=2-4種/80%=3-9種**（条件なしだと3771種に爆発＝条件づけが鍵）。例: 保持→[0@0]/[0@0,0@1](連打)、↑3度→[0@0,2@1]/[1@0,2@1](ド-レ-ミ)、↓2度→[0@0,-1@1]、跳躍→[3@1]。＝§10.7連結文法（経過/刺繍/連打/跳躍）が**データから条件付きで自動的に出た**。**連打は保持に・跳躍は骨格跳躍点に**自然に乗る（手当て全廃）。
- **層3＝16分細分（稀・装飾）**：8分窓の **6%だけ** が16分2音に割れる（plain40%/empty53%）。割れ方は**全部 r01(8分を2つの16分に)・違いは2音目の度数move のみ・7種/5種で90%**（mv+1 28%/mv0 27%/mv-1 20%）。＝16分は絶対の刻みでなく**8分の細分**＝BPM非依存。
- **BPM/調 非依存の理由**：全層が「度数move＋拍内相対slot」記号＝絶対ピッチ/秒に触れない。スイング等は層3後段の打点マップで（backlog）。
- **段階（TDD・新モジュール `melodyCells.ts`／既存 rhythmCells.ts と並ぶ）**：(1)`learnMelodyCells(units:{move,cell}[])→{byMove}`＋`cellToNotes`＋`parseCell`＝**実装済✅**(cell記法は `tok0;tok1`＝数字onset/`s`伸/`r`休でonset/sustain/restを表現)→(2)`sampleCell(model,move,seed)`＋`realizeMelody(skeleton,model,scale)`(骨格→各拍cell→O/S/R展開で休符/伸ばし)＝**実装済✅**→(3)16分細分(`sub`)・(4)skeleton生成(move/自己反復)・(5)assemble(カデンツgesture・コード追従・**長音/強拍をコードトーンへスナップ**)・(6)genMelody/MCP統合＝**未実装(設計のみ)**。コーパス→units抽出＋実機学習サンプルはスクラッチで検証済(整列の肝はS7同様)だが**ingestスクリプト/配線は未実装**。**現状 `rhythmCells`/`melodyCells` はテスト以外未import＝実メロ生成は依然旧経路**（監査`consistency-review.md`指摘）。
- **置換方針**：これが本命の音高生成＝旧 `planSkeletonTones`/`buildMotif` のピッチ手当てを置換（リズムは S7 拍セルと統合）。S6/§10.7 は理論的裏付けとして残置（連結文法＝層2と一致）。

→ **実装現況(2026-06-28・大ストーリー「メロディ探索」締め)＝S8思想を製品エンジン `genMotifMelodyV2`(melodyCells.ts)に結実・配線済**。上の「melodyCells 未import＝旧経路」「段階(3)-(6)未実装」は**解消**（**4/4＋6/8 は V2 が本番経路**）。
- **V2＝A2レシピ**：データ駆動骨格(`learnSkeleton`＝実曲の構造音分布に一致)＋モチーフ選別(N候補からスコア最良)＋発展(2小節ブロック A/A'(尾変奏)/B(反行)/A''(回帰))＋5項目後処理(禁則跳躍→歩進/gap-fill/強拍コードトーン/単一頂点)＋頂点アーチ＋輪郭(Parsons UDR)駆動render＋16分細分＋7thコード。**4/4・6/8(compound=barBeats3)** 両対応。`generate.ts` genMelody の **useV2 ゲート(bpb===4 || compound)** で本番化、MCP `gen_melody` は useV2:true。骨格/move は拍子非依存で流用、リズム/timingのみ拍子別。データは `motifModelData.ts`(POP909統計のみ・リテラル非保存)。
- **補完(completion)＝新規**：`extractMotif16`(部分メロ→Motif16逆抽出)＋V2 opts `seedMotif`/`keepFirstBlocks`(両未指定=現挙動と完全一致＝回帰なし)＋`completeMelody`(部分を保持＋残りをモチーフ発展で補完)。MCP `complete_melody`(notes/chords/frame/seed)。＝「部分→続き/4倍」をユーザー素材から発展(著作権セーフ・決定的)。6/8補完は best-effort(4/4が主)。
- **評価3レンズ確定**：耳=最終／E-rule(`evalMelody`)項目別=どの規則が弱いか／**MuPT perplexity研究はクローズ**(公式SMT-ABC形式＝改行を`<n>`で渡すと校正OK＝きらきら星3.2／V2 8.8<実曲18.3＝V2はやや優等生・予測しやすい／100回生成で外れ値0%＝変なの出さない＝**“変なの検出ガード”として有効・常時フィルタ不要**。詳細 `docs/research/eval-models-learned.md`)。FMD/分布距離は退役(制御メロに不向き)。
- **使えるAI候補マップ**(`docs/research/usable-ai-map.md`・5ライン＋セクション)：メロ補完系AI(CA2/SketchNet/MelodyT5)は制御弱/中庸で**現状不採用**＝重い外部AI不要でV2ネイティブ補完が筋。
- ★**設計思想 確定**：**自動生成＝候補/選択肢を出すまで・仕上げは人間**(完成品まで機械は現手駒では無理＝補完実験で実証)。**Suno等＝画像生成的(混合音を一括生成・編集可能な構造を渡さない)＝別パラダイムで競合しない**。機械の改善は「より良い選択肢/ばらつき/足場」に振る(完成へ仕上げさせる方向は追わない)。

→ **frame.mode 一級化＋Section生成の文脈継承＋density/swing ノブ（2026-07-08・耳FB起点）**。実地の耳確認で「Section自動生成が濁る/変な跳躍」→原因＝(1)SectionEditor の生成 frame に mode が無く**短調セクションでもメジャースケール生成** (2)候補ネタ保存に mode 未宣言＝配置 landing が major 既定で**メロだけ相対長調(+3)へ移調**（上の「生成 content の mode 自動付与は別タスク」の先送りが実地で発火） (3)http `gen_melody` が旧経路（V2未経由）。正準：
- **frame は key＋mode で調を宣言**（`mode:"major"|"minor"`）。mood からの長短推定は後方互換フォールバック（mode があれば優先）。genChords/genMelody/genBass/genFromEssence が従う。
- **Section の生成は section の key/mode/meter/tempo を継承**し、**候補ネタ保存時に mode を宣言**（placementLanding の前提を満たす＝短調セクションで shift 0）。
- http `gen_melody` は V2（`genMelodyCandidates` 経由・seed 明示＝単発）。
- **操作ノブ**（「細かさ・跳ねを制御できない」への回答＝候補と操作性の哲学）：`density` 0..1（リズム語彙の音数重み＋モチーフ選別の音数ターゲットを連動）／`swing` 0..1（8分裏を 0.5→0.5+swing/6 へ後段タイムマップ・S7「跳ねるボタン」の実装）。V2 opts→gen_melody(HTTP/MCP)→SectionEditor UI に露出。既定＝未指定＝従来挙動。

→ **短調ドミナントと終止の正準方針（2026-07-08 確定・総点検起点）**。コード×メロの総点検（監査4本）で、(a)短調の**コード側=和声的短音階（V7＝導音入り）／メロ側=自然的短音階のみ**という分裂、(b)**終止の和声盲**（最終コードを見ず主音強制）を確認。オーナー確認のうえ以下を正準とする：
- **短調ドミナント＝V7維持・メロが追従**：genChords の短調 V=`[7,"7"]`（E7 in Am）が正。メロ側は**「コード音は調外でも歌える」**＝コードトーンスナップ（`ctOf`/`ctP`/`nearestPitchWithPc`）を「スケール∩コード」から**コード音優先**へ（導音 G#・セカンダリードミナントの色音 B♭ 等に乗れる＝「7th・色音に乗せる」の実質化）。経過音（弱拍）は自然短のままだが、**同時に鳴るコード音と半音衝突する音は回避**（G♮ over E7 禁止）。`harmonize`/`continuation`/`substitute` の短調表も V7 を知るよう**単一の短調ダイアトニック表に統一**（現状4モジュール不一致＝往復矛盾の解消）。
- **終止＝最終コードを見て着地**：`toTonic`・`applyPhrasing` 句末は**最終コードに主音が含まれる時のみ主音着地**。含まれない時（V 終わり等のユーザー持ち込み進行）は**最寄りのコード音**（V なら 2̂/5̂ ＝半終止らしい「開き」）。open/close の表情は結果として和声に整合。
- **機能/終止判定は品質込み**（`function.ts`）：♭VII は "D" でなく **subtonic（機能ラベル分離）**＝♭VII→i を「完全終止」と誤ラベルしない（modal cadence として別掲）。degree11（vii°）を短調の "D" に追加＝vii°→i を導音終止として検出。♭VII 終わりを「半終止」としない。substitute の ♭VII⇔V 機能代理も解消。
- **後処理パスの保証則**：V2 の後処理は**全パスが終止音を保護**し、パス間で直したものを再導入しない（順序＝強拍CT→禁則→回収→頂点＋最終検証）。
- 根拠＝監査所見（2026-07-08 セッション・A/B/C/D クラスタ）。実装は Task #2〜#10 で TDD。

→ **V2表情層＝強拍非和声ノブ `expression`（2026-07-09・理論不足総点検 Step1）**。full＝`docs/research/2026-07-09-melody-theory-gaps-and-plan.md`。
**問題**：後処理①（強拍を無条件コードトーン化）で**強拍CT率がほぼ100%**＝実曲57-90%（POP909実測57%）に対し綺麗すぎ＝「自動生成感」の主因のひとつ。倚音/掛留を能動配置する機構は v1/legacy にしか無く V2 主経路で効かない（`classifyNCT`/`isResolvedNct` は degree.ts に完備だが V2 未使用）。
**正準**：
- **`expression` 0..1**（既定 undefined＝0＝**従来完全一致**・回帰ゼロ）。V2 後処理⑤（最終禁則検証）の**後**・swing 後段の**前**に「表情パス」を1本追加。決定的（`makeRng(seed+定数)`）。
- **対象＝強拍のコードトーンのうち「次音が順次(≤2半音)先でその時点のコード音」の位置**（＝解決先が保証される所だけ）。確率 `expr` で:
  - **掛留(suspension)**：直前音が候補と同ピッチにできる時＝前音を保持して強拍で非和声にし歩進解決（`classifyNCT` の `held && stepOut`）。
  - **倚音(appoggiatura)**：それ以外＝解決音（次音）の**1スケール度上**（`spAt` 準拠＝導音小節は和声的短音階）に置く＝もたれて歩進解決。
- **保証**：置換前に `classifyNCT`（degree.ts）で判定し `isResolvedNct`（≠"other"）を満たす候補のみ採用。隣接音との `isForbiddenIv`（三全音/7度/8度超）チェックで**禁則を再導入しない**。**終止音・句末着地は不変**（後処理規約(a) を継承）。強拍がコード音でない（既に非和声）位置・解決先が非CTの位置は触らない。
- **E-rule との関係**：`expression>0` で `chordToneStrong`（evalMelody）が下がるのは**仕様**（総合点で1本に潰さない原則＝gaming回避の再確認）。ランク軸は E-corpus のみ据え置き。
- **配線**：`genMotifMelodyV2` opts `expression`→`genMelody`(density/swing と同格の透過)→`gen_melody`(MCP/HTTP)→SectionEditor UI。既定＝未指定＝従来挙動。**耳確認ポイント**＝expr 0/0.3/0.6 聴き比べ（もたれ感／気持ち悪い掛留の有無）で既定値昇格は別コミット。

→ **句構造(P0-b)のV2配線＝対称⇔非対称フレーズ選択（2026-07-09・理論不足総点検 Step2）**。full＝`docs/research/2026-07-09-melody-theory-gaps-and-plan.md`。
**問題**：`planSkeleton`（skeleton.ts＝問い/答え・句末カデンツ度数・対称/非対称を返す完成品）は **legacy 専用でV2主経路では死んでいた**。V2は最終ブロックのみ主音着地・中間句は流れっぱなし＝句の「呼吸(息継ぎ・問いと答え)」が無い。`gen_melody`(MCP) は phrasing を受けず**チャット到達不能**（next-dev-plan P0-b の残作業）。
**正準（実装上の設計判断）**：
- **`phrasing:"symmetric"|"asymmetric"`**（既定 undefined＝**従来完全一致**＝phrases を渡さない）。generate.ts V2分岐で `planSkeleton(bars, meter, {phrasing})` を呼び、`{startBeat, beats, cadenceDegree, isLast}[]` を `genMotifMelodyV2` へ渡す。
- **句末着地は「ブロックに紐づけず、句境界の実 beat で後処理後に行う独立パス」**（当初計画の「固定ブロック末で着地」は非対称でブロック(mb=2)と句割り([3,3,2]等)がズレるため棄却）。パスは後処理⑤の後・expression の前に置き、各句の**最終onset**を cadenceDegree のピッチクラス（1=主音／5=属音=半終止の開き）へスナップ＝**B1 の和声追従セマンティクスを踏襲**（そのpcがコードにあれば採用・無ければ最寄りコード音）。approach音との禁則は `placeNonForbidden` で回収（着地は保護）。単一頂点維持（hiPitch超え禁止）。
- **expression との相互作用**：cadence 着地音は expression の変換対象から除外（構造着地が勝つ）。決定的。
- **配線**：`gen_melody`(MCP) に `phrasing` enum を追加（従来欠落）／http は既存の phrasing 透過を symmetric も受けるよう拡張。既定＝未指定＝従来挙動。
- **今回のスコープ**：表面の句末着地のみ（対称=問い/答えの明確化・非対称=不等分割の呼吸）。**骨格(genSkeletonFromModel の u%2 固定句末)の句割り追従**と**骨格休符(句頭遅延入場・#9)**は続く別コミット（第2段階）。**耳確認**＝symmetric で「前楽節末が問いに聞こえるか」・asymmetric で「3+3+2 の呼吸になるか」。

→ **カデンツ選択器＝genChords の終止型（2026-07-09・理論不足総点検 Step3）**。harmony-cadence-theory.md 盲点①②の正準化。
**問題**：終止は完全終止(V→I)一択で、半終止/偽終止/変終止の型が無い＝セクション接続（Aメロ末で開く・偽終止で続く感）が作れない。
**正準**：
- **`cadence:"full"|"half"|"deceptive"|"plagal"`**（既定 undefined＝full＝**従来完全一致**）。genChords が degrees 確定後（隣接重複回避の後）に末尾1-2和音を型で上書き：
  - **full**＝従来（penult=D / final=I）。
  - **half**＝final=**V**（開いて止める）／penult=IV（predominant）。
  - **deceptive**＝penult=**V**→final=**vi**（長調 vi・短調 ♭VI）＝偽終止。
  - **plagal**＝penult=**IV**→final=I＝変終止（アーメン終止）。
  - 先頭 `degrees[0]=1` は保護（penult 上書きは index≥1 のみ）。funcs は degree 確定後は未使用ゆえ degrees のみ上書き。
- **メロは追従不要で自動整合**：render の終止着地は既に **B1和声追従**（最終コードに主音があれば主音・無ければ最寄りコード音・design 短調ドミナント節）。よって half（final=V＝主音無し）は自動で 2̂/5̂ の開きに、deceptive（final=vi＝主音を含む）は主音が **vi の3度** として鳴る＝理論通りの偽終止に、メロ側の変更なしで乗る。
- **配線**：`gen_chords`(MCP/HTTP) に `cadence` enum。既定＝未指定＝従来。**ユースケース**＝Aメロ末=half・1番サビ末=deceptive・ラスト=full。

→ **16分細分＝走句(runs)と前借り(push)（2026-07-09・理論不足総点検 Step4・本丸1）**。full＝sixteenth-rhythm.md。
**現状認識**：語彙 RHYTHM16_DATA は16分裏slot・走句パターンを**既に含む**。gen出力の16分ほぼ0%（実曲44-56%）の原因は**語彙でなく選別抑圧**＝score の `n16Pen`/`runPen`（16分裏・走句を減点）＋受入音数上限。density は総量ノブで「走句らしさ(連続16分)」「前借り(食い)」を狙って出せない。
**正準（Phase1-2＝データ不要・Phase3データは後）**：
- **`runs` 0..1**（既定 undefined＝従来一致）＝走句の出やすさ。効き：(a) rhythmVocab を**走句含有量**（隣接16分ペア数）で再重み付け `w * pow(runPairs+1, runs*k)`（density の densW と同型・積で合成） (b) score の `n16Pen`/`runPen` を runs で減衰（`*(1-0.85·runs)`） (c) 受入音数上限 hiN と lenPen 目標を runs で拡張。**ピッチ論理は新設しない**＝既存の走句処理（run→方向保持 `render/mkMotif`・run後 gap-fill）に乗るだけ。
- **`push` 0..1**（既定 0＝従来一致）＝division-level syncopation（前借り・食い）。既存 `anticipate`（位置固定・タイ・終端不変）を V2 後段（swing の直前）に適用＝**毎小節同じ拍を16分ぶん前へ**。push 量で対象拍数を可変（0.33で3拍目・0.66で1,3拍・1で1,2,3拍）。compound(6/8) は対象外。
- **評価目標**（sixteenth-rhythm.md）：16分音価率 44-56%・16分onset連続率~66%・孤立16分は稀。**Phase3（データ）**＝POP909量子化再計測で位置別run確率/前借り位置率を `motifModelData.ts` に同梱しヒューリスティック重みを学習分布へ差替（別コミット・要ローカルPOP909）。
- **配線**：V2 opts `runs`/`push`→genMelody→gen_melody(MCP/HTTP)→UI。既定＝未指定＝従来。**耳確認必須**（density/swing 同様）＝runs 0/0.4/0.8 × push 0/0.5 マトリクスを実機で。既定値は据え置き0・推奨プリセットのみ doc化。

→ **メロ×低音の声部進行レンズ（2026-07-09・理論不足総点検 #8・分析のみ）**。backlog和声③「完全に未監視」への回答。`analyzeVoiceLeading(upper, lower)`（voiceLeading.ts）＝並行完全5度/8度・直行(隠伏)5度/8度・声部交差を数え score(1-違反/機会) を返す**分析レンズ（生成非介入）**。`analyze question="voiceleading"`（MCP）＋ http `analyze_voiceleading`。bass 明示 or chords のルートを低域(36+pc)で代用。良し悪しの断は人間（機械は指摘まで＝設計思想）。

→ **motif-driven前景＝自由材料の同音/跳躍（2026-07-09・理論不足総点検 Step5・本丸2）**。full＝motif-extraction.md §4.5。
**問題**：前景が「ダルダル」＝実曲は自由材料に跳躍14%/同音23%あるが、gen は**跳躍ほぼ0%・同音を潰す**。犯人＝(1)全ブロックが単一モチーフ M の A/A'/B/A'' 派生で自由材料が無い (2)`mkMotif`/`varyTail` が同音(move=0)を ±1 に潰し・跳躍を2度にクランプ＝contour が均される。
**正準**：
- **`foreground` 0..1**（既定 0＝**従来完全一致**）＝自由材料の割合。派生ブロック(role≠0)を確率 `foreground` で `freeVary` に置換：M のリズムは保つ（コヒーレンス）が contour を引き直し、**同音(move=0)を潰さず・跳躍(|move|≥3)をクランプしない**＝実曲の「跳ぶ/留まる」を回復。禁則(三全音/7度/8度超)は後処理が従来通り除去＝**合法性は不変**・単一頂点維持。決定的（fg=0 では確率抽選の rng を引かない＝bit一致）。
- **配線**：V2 opts `foreground`→genMelody→gen_melody(MCP/HTTP)→UI。既定＝未指定＝従来。**耳確認必須**（メロの性格が変わる＝churn回避のため既定 0 据え置き・推奨値は耳セッションで較正）。残（finer）＝motif占有率を実測値(23%)へ寄せる比率制御・リズム変形(augment/diminish)。

→ **骨格休符＝句頭遅延入場（2026-07-09・理論不足総点検 #9）**。full＝melody-heuristics/self-check-log。
**問題**：V2 は常時鳴りっぱなしで「入りの遅れ」が無い（実曲は曲頭/句頭の86%が休符・遅延入場＝呼吸）。
**正準**：**`breathe` 0..1**（既定 0＝**従来一致**）＝各句（phrases 指定時）またはブロックの**冒頭 breathe×1.5拍**の onset を drop＝遅延入場。句を空にしない（全部が窓内なら残す）・最終音は保護・決定的（rng不使用）。phrasing 併用が本領（句頭ごとに呼吸）。V2 opts→gen_melody(MCP/HTTP)→UI「入り遅れ」ノブ。**耳確認**＝入りの遅れが気持ちいいか（既定0据え置き）。

→ **批判レビュー修正ループ Round1＝骨格の脱平面化＋表情既定較正（2026-07-09・full=`docs/research/2026-07-09-melody-chord-critical-review.md`）**。4切り口の批判で「素の生成が無菌（強拍CT実測100%・主音pc43%・同音44%）＝骨格が主音平面に潰れ、句割り/自由さノブを飲む」と判明。**既定挙動を意図的に変える**（従来bit一致を破る＝レビュー修正ループの目的）：
- **骨格の脱平面化(CP)**：`genSkeletonFromModel` の声部進行の引きを「主音レジスタへ 0.7」から「**Kopfton→主音の下降構造線(ctr)へ 0.2**」へ（Urlinie近似）。開始レジスタを主音→Kopfton(≈5̂)に。中間句末を「主音強制」から「5̂(問い＝開き)」へ、最終句のみ主音着地。＝主音平面を割る。
- **表情の既定較正(P0a)**：V2 の `expression` 既定を 0→**mood/frame由来(0.2-0.3・既定0.25)**に結線（legacy `applyExpression` と同ロジック）。強拍CTを 100%→実曲帯へ寄せる。
- **実測（40seed×3進行）**：主音pc 43→37%・強拍CT 100→87%・同音 44→38%・音域 9.6→11.0・distinct 5.6→5.9・**phrasing実効 62→72%（脱平面化で句割りが効くようになった）**。全て実曲分布方向。**最終確定は耳セッション**（数値は分布の裏取り・総合点最適化ではない）。残（次Round）＝禁則跳躍の確率的softening・和声語彙の生成接続・旋法一級化・avoid-note。

→ **批判レビュー修正ループ Round2＝register窓の tonic中心化（2026-07-09・方針は評価サブエージェントで検証済）**。Round1再レビューで「脱平面化は骨格生成器では正しいが production に届かない＝`genMelody` の絶対音域 `[60,84]` が長調で tonic を最下端に置き、下降を主音に叩き戻す（長調 主音48%/音域8.4・短調は逆に彷徨い音域15）」と実測判明。
- **修正**：V2分岐の `sp` を `scalePitchList(scale, tp-5, tp+12)`（tp=60+tonicPc・tonic を下から約1/3・約17半音）に。**下流clampは全て `sp[0]/sp[last]` 参照＝sp差し替えで render/後処理/頂点/カデンツが追従**（別の絶対clampは無い＝評価で確認）。P2(同音是正の独立パス)は不要＝P1で自然減（実測）。P3(禁則softening)は耳セッション送り。短調 主音15%は register でなく和声起因（tonicが chord-tone の小節が少ない）＝registerで追わない。
- **実測（モード別・40seed）**：長調 主音48→28%・同音45→27%・音域8.4→12.2／短調 音域15→12.5・distinct 6.6・phrasing実効72→81%。seed1 の「主音13連張り付き」→主音の下(B3/G3/A3)へ動く実旋律に。**主音の下に出る＝弱起でなく本体**＝V2 register 契約を不変条件テストで固定（`[tp-5,tp+12]`・legacy は[60,84]据え置き）。
- 併せて `http.ts` の `assemble`（全パート生成）のメロを V2化（旧: legacy でメロ改善が届いていなかった）。

→ **批判レビュー修正ループ Round3＝tessitura のキー安定化（回帰修正・2026-07-09・方針は評価で検証）**。Round2再レビューで「Round2が持ち込んだ回帰＝`tp=60+tonicPc` が絶対高さをキーで1oct滑走させ、B調でB5金切り域まで届く」と実測判明。方針評価で Option A(fold)/B(固定窓)/C を**全却下**（A/Cはspread減らず境界キー崩壊、B は高tonicキーで floor再ピン留め復活＝Round1の轍）。
- **修正（Option D・1行）**：`tpBase = clamp(60+tonicPc, 60, 65)`＝tonic相対は保ったまま滑走の**両端だけ飽和**。ceiling 79→76（B5消滅）・floor spread 11→8.2・**再ピン/seam/churn ゼロ・Round2の全キー品質(主音/音域)を維持**（評価で全キー実測）。
- **耳セッション送り（客観ラウンドでは触らない）**：expression 既定(0.25→実曲57%には~0.7要)の引き上げ、`leapLicense`(禁則跳躍0%の緩和)。特に leapLicense は「器だけ」でも後処理⑤`for k<3 fixForbidden()` が無条件再除去する no-op 罠＋gap-fill確率化が跳躍回収を切る逆効果があり、**耳セッションで通し配線＋試聴しながら**入れるのが正着（評価判断）。
- **修正ループ3周の総括**：Round1骨格脱平面化→Round2 register中心化(主音48→28%・同音45→27%)→Round3回帰是正。**このループの価値は「悪い修正(A/B/C・leapLicense器のみ)を評価ステップで止めた」ことにもある**。残る最大乖離＝強拍CT89%(実曲57)は耳ゲート案件。full＝`docs/research/2026-07-09-melody-chord-critical-review.md`。

→ **コード外音の取り込み＋跳躍の調整（2026-07-09・2方向批判＝音楽理論×実装 を突き合わせて決定）**。full＝`docs/research/2026-07-09-melody-chord-critical-review.md`。2方向の批判が収束：強拍9割コード音は健全（＝強拍を汚す方向は却下・expression既定0.25据え置き）、本命は弱拍の偶発的濁りと和声盲の跳躍禁則。
- **コード外音（弱拍の濁り掃除・A2）**：弱拍が「コード音の半音上(m2/m9)」に居座る**偶発的な濁り**だけを最寄りの安全音へ寄せる（後処理⑤/表情パスの後・決定ルール）。**短い順次の経過音(両側step同方向)は色気として残す**（掃除しすぎ＝無菌化に逆戻り＝避ける）。移動先が隣と同音になる候補は除外（足踏み防止）・頂点/禁則/終止/句頭/カデンツ保護。実測 弱拍濁り **21.8%→2.5%**（＝非和声音が偶発の濁りでなく意図的な経過音になる）。
- **跳躍の和声考慮（B）**：禁則判定 `isForbiddenIv` は音程だけで三全音/7度を潰していた＝**属七の 3-♭7 三全音(B→F)やコード内7度アルペジオまで除去**していた（和声盲）。→ **両端がコード音の跳躍(≤8度)は fixForbidden/gapFill の対象外**＝三全音/7度でも許可（アルペジオ）。実測 禁則 **0.0%→0.7%**（＝コード内の表現的跳躍が出る）。8度超は不可のまま。
- **やらなかった（実装批判の実測判断）**：不協和NCT跳躍の確率解禁(leapLicense)は、生成器が禁則を作らない＋render snapが大跳躍を吸収するため**器を入れても実測 no-op**＝能動注入が要り耳セッション案件。強拍expressionの引き上げ(実曲57%狙い)は「甘ったるく調性がぼやける」＝据え置き。
- 不変条件更新：禁則跳躍は「両端コード音のアルペジオ(≤8度)の時のみ許可」に（melody-cells-v2 のテスト群 arpOK・push前借りの小節帰属も考慮）。api666緑。**最終確定は耳セッション**。

→ **足踏み(同音)の根治＝後処理①の anti-unison 例外（2026-07-09・5領域監査B）**。監査で犯人特定：後処理①「強拍を最寄りコード音へ無条件snap」が、動いた輪郭を直前音と同一ピッチに潰す（①で強拍同音 27→39%・全体+5pt）。render素地27%を①が増幅。実曲の同音23%は掛留/連打の**意図的**同音だが、本エンジンは mkMotif が move=0 を潰す＝現状の同音はほぼ snap衝突＝人工物。
- **正準**：①の強拍snapで、結果が**直前音と同一ピッチ**になる時だけ「同pc以外の最寄りコード音（禁則を作らない）」を選ぶ＝**強拍CT不変量・禁則ガードを保持**したまま足踏みを散らす。②以降は触らない（後段相互干渉＝前回A2掃除の轍を避ける）。句末着地(最後の音)は従来通り不変。
- **実測（監査プロト・40seed×3進行）**：同音 28.5→**21.4%**（長調20%・短調25%）・強拍CT88.8→88.5%(維持)・禁則0.7%(不変)・distinct/音域は微増。目安23%に着地。**着地後に単発耳確認1回**（連打の自然さが痩せていないか）。

→ **コード色気 C0d＝短調テーブルSSOT（2026-07-09・5領域監査C）**。genChords のローカル短調表は度数7=♭VII で、`FUNC_DEGREES.D=[5,7]` が**♭VII(subtonic・導音なし)をドミナント位置に置いていた**（自前解析器 `function.ts`＝♭VII=SUB と往復矛盾・実測で終止前♭VII 11%）。→ 短調の D機能を **V7/vii°**（`dcands`＝短調 D=[5,8]・度数8=vii°を表に追加）に。♭VII は D から外れ loop ノブでのみ登場。長調 D=[5,7]（度数7=vii°）は不変。実測：終止前♭VII 0/40・vii° 21/40＝生成が解析器と一致。テスト I3a の短調許容を [7,11] に締めて固定。→ **色ノブ borrow/secondaryDom（2026-07-09）**：genChords に `opts:{borrow,secondaryDom}`（既定OFF=bit一致）。C基準 (root,quality) を作った後、`borrow`＝長調の IV を **iv(サブドミナントマイナー＝切なさ)** へ確率差替、`secondaryDom`＝非トニック和音の直前を **V/x(完全5度上のdom7＝二次ドミナント・接着)** へ確率差替。実音移調はその後。メロは B1和声追従で自動整合＝メロ側改修不要。gen_chords(MCP/HTTP)に露出。**loop**（2026-07-09）＝閉じずに回す循環進行（短調エオリアン i-♭VI-♭VII／長調アクシス I-V-vi-IV）＝degree列を循環で上書き（cadence と排他・末尾を主音に強制しない）。既定OFF=bit一致。gen_chords に `loop:boolean` 露出。＝コード色ノブ完結（短調SSOT＋borrow＋secondaryDom＋loop）。

→ **グルーヴの器＝humanize（velocity＋微小タイミング揺れ・2026-07-09・5領域監査E）**。監査で「平坦の正体＝microtiming 0%・velocity 0%（グルーヴ本体が無い）」と実測。swing/push は決定的位置写像＝人間的揺れではない。
- **`humanize` 0..1**（既定0＝**velフィールドを付けず start不変＝bit一致**）。V2 の swing 後段に1パス：velocity（強拍やや強/裏やや弱＋LRC相関乱歩・55-118）と microtiming（±~0.03拍のLRC相関ズレ・句頭/終止は不変・前音を越えない）。決定的（makeRng）。`Note.vel?` を追加＝web/MIDI は既に `n.vel ?? 100` 対応。
- V2 opts→gen_melody(MCP/HTTP)→SectionEditor「人間味」ノブ。**耳確認**＝揺れ量/velカーブの当たり（器は客観・値は耳）。残＝12分割グリッド(3連)は別機構で後段。

→ **曲の形 D-P1＝骨格が句割りを見る（2026-07-09・5領域監査D）**。監査で「phrasing実効80%は化粧＝非対称で変わるのは句末1-2音・**骨格が句割りを見ていない**」と実測。→ `genSkeletonFromModel` に `phraseEnds?:{bar,deg}[]` を渡し、unit尾のバーが句末なら**句のカデンツ度数**へ着地（対称=各unit尾に整合／非対称=unit尾に落ちる句末のみ・可変長ブロックP2は別）。genMotifMelodyV2 が opts.phrases から phraseEnds を算出。**未指定=従来 u%2 の 5̂/1̂＝bit一致**。実測：非対称 vs 既定が **14/30→40/40 seed で変化・平均8音/8小節が変わる**（化粧→構造的）。Round1-3の脱平面化/registerと直交。残（本丸）＝**可変長ブロックP2**（blockループを句長駆動へ）・sequence/diminution・sentence テンプレ＝別の focused session＋耳。

→ **曲の形 本丸＝sentence形式(移高反復＋断片化)（2026-07-09・2方向評価で方針転換）**。監査Dの「四角さ」に対し、当初案(可変長ブロック)を**2方向評価が棄却**：理論「容器(長さ)は形式を生まない・過程(断片化+sequence→カデンツ)が生む」／実装「可変長はfallbackモチーフ非スケールで15%破綻＋骨格格子が2小節固定で不十分」＝**両者が「過程を固定グリッド上で先に・可変長は最後」に収束**。
- **`form:"sentence"`**（既定 undefined＝**従来AABA=bit一致**）：固定2小節グリッド上でブロックに機能を割当＝**提示(bi=M)→反復(sequence=Mの輪郭を2スケール段 移高して再生)→継続(fragment=Mの先頭半小節セルを逐語で畳み掛け＝密度↑=加速)→カデンツ(既存toTonic)**＝起承転結。可変長ブロックは使わない（容器リスク回避）。
- **sequence**＝最も可聴なpop展開(同一性＋運動・anchor移高で実現)。**fragment**＝継続の推進(先頭サブセルの逐語反復＝freeVary禁止で覚えられる動機の同一性を保つ)。後処理(強拍CT/禁則/単一頂点/カデンツ)は位置ベースで生存。
- 実測：継続部(bar4-5)の密度が上がる(1.5→2.8＝加速)・30/30で既定と変化・終止着地/禁則(アルペジオ除く)ゼロ/単一頂点 維持。V2 opts→gen_melody(MCP/HTTP)→SectionEditor「形式」ノブ。**耳確認**＝起承転結に聞こえるか(gestaltは耳)。→ **可変長ブロック[3,3,2]（容器・2026-07-09）**：phrasing 指定時、ブロックループを**句駆動の可変長**に（句を1ブロックとし**句長のモチーフ** motifByLen で作る＝真の非対称[3,3,2]＝3小節/3小節/2小節ブロック）。mkMotif/score/genBest を blockBars でパラメータ化、全滅時 fallback を blockBars スケール（空尾破綻 15%→1.9%）、単一頂点の B塊判定を bar集合化。**既定/補完(phrases無し or seedMotif)は固定mb・単一M＝完全bit一致**（rng draw順保持）。実測：asymmetric が3小節ブロック構造・空小節1.9%・集計指標(既定path)不変。＝形式(sentence)＋容器(可変長)＋骨格結線(D-P1)で D 一巡完了。残＝period精緻化・sentence×可変長の併用磨き・耳での gestalt 確定。

### 音楽MCPサービス（#86 Stage2 詳細・agentic Chat の根幹）
**入口は Chat**（ユーザの主用途・ボタンは従）。Stage1 の口1（dispatch：consult→plan→gen_pair_rule）は「一発投げ」で動くが、Claude が**多段で推敲**（作る→`analyze_fit`で点検→外し音を直す→再点検→提示）はできない。それを可能にするのが口2＝MCP。加えて、実機で出た **param揺れ（Claudeが `key:"C"`/`time_signature` を自由形式で渡し子ジョブが落ちた）の根治**＝MCPの**厳密 inputSchema** が param 形を Claude に強制する。

> design-acceptor の指摘を反映。**「常駐させたい(cold-start回避)」「-pでtool-use」「param厳格化」は別問題**で、HTTPに全部畳まない（混同が最大ブロッカーを隠していた、と指摘された）。

- **トランスポート＝HTTP（実機検証で確定／旧不具合は版で解消）**：claude-code **2.1.185** で `claude -p` ＋ **stdio も HTTP も** MCP tool-use が動作（最小サーバで4273取得を確認）。acceptor 引用の「-p で HTTP がロードされない」(#34131 等)は**旧版・修正済**。＝transport は HTTP で問題ない。**※claude-code 更新で退行しうるので、起動スクリプト/疎通チェックに「-p+MCP tool-use が効くか」のスモークを1つ持つ。** stdio フォールバック（軽量 stdio プロキシ→常駐サービス）も残せる。
- **cold-start 回避＝常駐（transport と別軸）**：cm-music は music21 import が重いので**常駐プロセス**にする（HTTPでもstdioでも、毎回 spawn しない）。これは cold-start の解で、transport の選択とは独立。
- **param 厳格化＝正規化層（transport と別軸・※重大3）**：根治は MCP の inputSchema **ではなく**、`cm_worker.music` 各関数入口の **共通の正規化＋バリデーション層**（`key:"C"→0`、`time_signature/meter` 吸収、不正は安全既定）。**口1（worker直呼び）も口2（MCP）も同じ正規化を通す**。inputSchema は**その宣言的コピー＝外側ガード**に過ぎない（口1だけ無防備、を作らない）。今のアドホックなロバスト化(analyze_fit/generate)はこの層へ集約する。
- **構成**：新プロセス **`cm-music-mcp`**（worker エントリ、`cm_worker.music` を import）。**MCP over HTTP**（FastMCP streamable-HTTP）で localhost に公開。
- **公開ツール（read-only・DB書込なし）**：分析＝`analyze_fit`/`detect_key`/`analyze_progression`、生成＝`gen_chords`/`gen_melody`/`gen_pair_rule`。
- **claude -p 接続**：worker の `claude_prompt`（consult等）に `--mcp-config` ＋ `--allowedTools mcp__cm-music__*` ＋ `--permission-mode`。in-app Chat の Claude が agentic にツールを叩く。
- **materialize の縫合（※重大1・現状整合の訂正）**：従来「reapに集約」と書いたが**誤り**。実際は **consult の `type:content` は Chat.tsx がクライアント側で createNeta**（reap非対象＝design「reapResults consult非対象」と一致）、plan の subtasks は worker→子ジョブ→reap、の**二系統**。agentic で Claude がツールで推敲した結果は**コード＋メロ＋判定の一式**＝単一 content では足りない。→ **決定**：agentic consult は **#85 の items 形**で結果を返し、**materialize を reap の structured 経路に寄せる**（consult-with-items を reap が回収＝「縫合を reap に統一」を*ここで初めて真にする*）。単一 content の従来 client 経路は単純 chat 用に残置。MCPツールは read-only のまま（書込は reap が1箇所で担う＝サーバ跨ぎ原子性を回避）。
- **後退ゼロ**：口1（dispatch）は残す（MCP不通でも動く）。
- **agentic ループのガード（※軽微）**：claude_prompt に max-turns/タイムアウト/予算上限を持たせ、ツール無限呼び・暴発を打ち切る。MCPツールがエラーを返したら Claude が直す（worker は落とさない）。count 上限(N≤8)はループ総量でも別途ガード。
- **露出/認証（※軽微・矛盾解消）**：cm-music-mcp は **localhost のみ**（#36 同様・無認証）。外部 Claude Desktop 接続(S2c)は**当面やらない**（やるなら CM_TOKEN 相当のゲートを足す）。「外に出さない」と「Desktop接続」は両立しないので localhost 専有に倒す。
- **プロセス管理（※軽微）**：常駐5プロセス目。他と同じ自動起動（#36 自動起動）に載せ、落ちたら気づける疎通チェックを持つ。
- **段階**：S2a＝cm-music-mcp サービス＋正規化層＋ツール公開（MCPクライアントから叩けることを確認）→ S2b＝consult の claude_prompt に配線＋agentic consult の items materialize（reap統一）→ S2c＝（保留）外部Desktop。

### Chatが既存ネタを操作する（#102・変異は承認制）（設計 2026-06-22）
- **問題（ギャップ）**：現状の agentic Chat（consult＋cm-music MCP）は **新規生成**（type:content/items→createNeta／reap）はできるが、**既存ネタを読んで・直す**導線が無い。cm-music ツールは分析/生成のみ＝read-onlyで、ネタ帳の中身（list/get/search/composition/relations）を Claude が見られず、編集（transform/fit_to/update）・配置（place_child）・連関（link）・削除も Chat から掛けられない。コンセプト「外部化された自分が"今の在庫"を相談しながら手を動かす」が片肺。
- **確定方針（ユーザー回答済）**：Chat(consult/agentic)が既存ネタを **検索/読取/編集/変形(transform)/補正(fit_to)/配置(place_child)/連関(link)/削除(delete)**。**操作はフルだが全変更は承認制**。承認UI＝**変更前後プレビュー＋原本 vs 提案の両方を再生して聴ける**。現実的主眼は**配置・連関**だが承認ありでフル許可。

- **二面に割る（#86 の read-only 原則を踏襲）**：
  - **読取面（承認不要・即時）**：既存ネタを**検索/読取**するツールは副作用ゼロ＝agentic Claude に**そのまま渡す**。creative-manager MCP の read-only ツール（`list_neta`/`get_neta`/`facets`(検索)/`get_composition`/`get_relations`）を agentic の `--mcp-config`＋`--allowedTools` に追加。これで Claude が在庫を見て推敲できる。**書込ツール（create/update/delete/place_child/remove_child/link/unlink）は allowedTools に入れない**＝Claude は直接書けない（#86「MCPツールは read-only／書込は1箇所」を厳守）。
  - **変更面（承認制・遅延適用）**：Claude は書込ツールを叩かず、consult 結果に **`proposals` 配列**を返す（**提案であって適用ではない**）。各 proposal は対象と操作の宣言。**適用は承認後に TS core（HTTP）が1箇所で**行う＝reap と同じ唯一所有者。サーバ跨ぎ原子性を回避（#86 と一致）。

- **契約：consult 判別ユニオンに `proposals` を追加**（実装の現ユニオンは `{chat|options|items|content|plan}` の5種＝jobs.py handle_consult。`proposals` はそれに並ぶ**第6の type**）：
  - `{"type":"proposals","summary":"...","proposals":[Proposal,...]}`
  - `Proposal = {op, target_id, args, rationale}`。`op ∈ {update_content, transform, fit_to, place_child, remove_child, link, unlink, delete}`。
    - content系 `update_content`/`transform`/`fit_to`：`args` に新 `content`（または変形パラメータ）。
    - 構造系 `place_child`(args: parent_id/index)/`remove_child`/`link`(args: to_id/type)/`unlink`。
    - `delete`：`target_id` のみ。
  - **生成（新規ネタ）は従来 `content`/`items` のまま**（create は承認不要の既存経路）。`proposals` は**既存ネタの変異専用**＝新規と変異を型で分離（材料化経路が別なため）。
  - 検証＆フォールバック（#43同型）：`op` 未知・`target_id` 不在・`args` 不正な proposal は**その要素だけ落として**残りは活かす。全滅なら `type:chat` で「うまく提案を作れませんでした」。
  - **変異 content の検証/正規化（生成と非対称にしない）**：content系 proposal の `args.content` は、生成経路の `_validate_*`/`_CONSULT_CONTENT` ビルダー（#61）と**同じ検証・正規化（#86 normalize 層）を通す**。「Claudeが作った音符を素通しで updateNeta へ直行」しない＝新規生成と変異で正準度を揃える。検証はworkerの proposal 生成時に1回（適用時の core は既存契約のまま）。
  - **target_id の取り違え対策**：`target_id` は read-only ツールが返した実在 id を Claude が引く前提だが「存在するが意図と違うネタ」を検証層は捕まえられない。→ **承認UIの before プレビューに対象ネタ名/kind を必ず表示**し、人が「これじゃない」と気付ける導線で担保（自動検証では塞がない）。

- **before/after プレビューの計算は web 承認UI（S3）に寄せる**（実装で確定した改良）：当初 worker で前後スナップショットを同梱する案だったが、worker→api の読み戻し結合が増える。**web の承認カードが既存 api で現ネタを取得して `before` を描き、`after` は `proposal.args` から描く**方が綺麗（web は既に api 取得・player(#57/#58)・MiniRoll(#55) を持つ）。worker は **S2 では「検証済 proposals を返す」だけ**＝DBを一切読み書きしない（agentic Claude が read-only MCP で読んだ結果を proposal に落とす）。前後の中身：
  - content系：`before = 現 neta.content`（web が get_neta）、`after = proposal.args.content`。**両方とも playable**（既存 notes スキーマ）。
  - 構造系：`before/after = 合成ツリー / 関連の差分`（web が get_composition/get_relations で現状、after は op を当てた差分）。
  - delete：`before = 対象ネタ＋被参照（web が get_relations 等）`、`after = 削除後`。**被参照があれば警告**（reap 蘇生・#97 と整合：job_result.neta_id NULL 化は core.deleteNeta が既に担保）。

- **承認UI（Chat内・受け取りトレイ統合）**：proposal をカードで提示。
  - **変更前後プレビュー**：content系は **before/after の MiniRoll 概形を並置**（#55 の MiniRoll を流用）。構造系はツリー/関連の差分表示。
  - **原本 vs 提案の両方を再生**：content系カードに **▶原本 / ▶提案** の2ボタン（既存 playNotes＝#57/#58 の player を流用、before/after の notes をそれぞれ鳴らす）。
  - **承認 → 適用**：web が既存 HTTP 経路（`updateNeta`/`placeChild`/`removeChild`/`link`/`unlink`/`deleteNeta`）を呼ぶ＝TS core 1箇所。複数 proposal は**個別承認**（一括は後続）。適用後 `onChanged` でペーン更新。**部分適用の許容**：個別承認＝A適用/B却下の中途状態を許す（各 op は独立に意味を持つ前提）。構造連鎖（place_child＋link を1単位で）の原子適用が要るケースは **S4** で一括承認＋トランザクション境界として扱う（v1は非対象）。
  - **却下 → 破棄**。**編集して承認**（after を手直し）は後続スライス。
  - Chat 履歴（#70）に proposal を `kind:"proposals"`／`data` で保存＝リロードしても承認待ちが残る。

- **後退ゼロ・ガード**：
  - `proposals` 不在の consult は従来通り（chat/options/content/plan）。MCP 不通なら dispatch にフォールバック（読取面も無い＝従来挙動）。
  - agentic は read-only ツールのみ与えるので、**承認前にDBが変わることは原理的に無い**（Claude に書込口が無い）。
  - max-turns/タイムアウト（既存 `CM_AGENTIC_MAX_TURNS`）はそのまま。読取ツール追加でターンが伸びうるので上限を確認。
  - 実データDBはテストで触らない（:memory:/scratch）。本番DBは現在 neta=1 のみ＝proposals の実証は scratch で。

- **段階（SDD：契約変更を含むので design-acceptor → 実装 → impl-acceptor）**：
  - **S1＝読取面**：agentic の allowedTools に creative-manager read-only ツールを追加（worker `_mcp_args` を一般化＝サーバを env がある分だけ載せる）。Claude が「今あるネタ」を検索/読取して語れることを確認（書込なし）。**接続トランスポート（実装で確定）**：cm-music は music21 の cold-start ゆえ HTTP 常駐だが、**creative-manager MCP は cold-start 無し（sqlite だけ）＝常駐 daemon を増やさず、`claude -p` が stdio で spawn**（既存 `apps/api/src/mcp-stdio.ts` を再利用）。第2 mcp-config を stdio エントリ（`{command,args}`）で載せ、`CM_DB` は worker→claude→spawn の**環境継承**で同じ本番DBを指す。allowedTools は read-only 5本のみ（書込は載せない）。env 未設定なら従来挙動（後退ゼロ）。
  - **S2＝提案契約**：consult に `type:proposals` ＋ Proposal スキーマ＋ before/after 計算（worker）。worker ユニットで op 別 proposal の検証/プレビュー生成をテスト（claude_prompt mock）。
  - **S3＝承認UI＋適用配線（実装済）**：Chat に `ProposalCard`（op 表示＋rationale＋構造系は説明文／content系は before/after MiniRoll＋**原本/提案 再生**）＋承認で既存 HTTP 書込（update_content→updateNeta／place_child→placeChild／remove_child→removeChild／link→link／unlink→unlink(新 `POST /relation/remove`)／delete→deleteNeta）。承認まで DB は変わらない。web ユニット（承認カード表示・before/after 再生ボタン・承認で正しい API・却下で無適用）。
    - **transform/fit_to の自動適用は後続**：音符の再計算はルールエンジン(cm-music)の領分で Claude は音符を作らない（#86）。`args.content` が無い変形提案は承認カードに出すが**適用ボタンは無効＋「自動適用は未対応」明記**（承認後に変形ジョブで content を確定→updateNeta、は S4）。`args.content` を持つ提案（update_content 等）は before/after 再生まで動く。
  - **S4（一部実装）**：✅**一括承認**（`ProposalGroup`＝適用可能な未処理提案が2件以上で「すべて承認」・順に適用）。残: transform/fit_to の**承認後ルール適用**（音符再計算は cm-music の領分＝web→ルールの同期計算パスが要る・コード進行エンジン研究の再編領域と被るため後続）・編集して承認・proposal 差分ハイライト・適用/却下状態の reload 永続。

## 連想エンジン（コード進行・度数・連想）（設計 2026-06-22・#12 を「連想中心」へ改訂）
requirements「### 連想で引いて・選んで・手直しする」の設計。研究で確定した方針を設計として降ろす。
詳細根拠＝ `docs/research/` の `2026-06-22-chord-progression-engine.md` / `-jp-chord-sources.md` / `-key-degree-tech.md` / `-association-usecases.md` / `-association-spec-validation.md`。

### タグ語彙・連想記憶モデル（決定 2026-06-22・ユーザー確定）
- **連想記憶として捉える（枠組みの確定）**：コード進行を「連想記憶」と見る＝**指紋モデルや生成器という技術論ではなく、よくタグ付けされたコーパスからの retrieval が本体**。「アーティストっぽさ」も「盛り上がり」も別機構を作らず**タグ＋検索に畳む**。
- **基本タグ語彙（確定・基底。拡張/評判データでの補強は後）**：
  - 明暗(valence)：`明るい` / `中間` / `切ない`
  - 強度(arousal)：`静か` / `普通` / `激しい`（「切羽詰まった」≒切ない×激しい）
  - ジャンル：`J-POP` / `ロック` / `バラード` / `シティポップ` / `ダンス` / `劇伴` / `ジャズ寄り`（複数可）
  - セクション役割：`イントロ` / `Aメロ` / `Bメロ` / `サビ` / `ブリッジ` / `アウトロ`
  - アーティスト：自由タグ（例 `ミスチル`）
  - 人気度：`ヒット` / `定番`（**売れた曲に強めに打ち retrieval で優先**）
  - 終止：自動（`cadenceOf`・タグ不要）
- **タグ付与の主体/出所**：終止＝自動。明暗/強度＝コード構成（長短比・テンション量）から自動素案＋取込時 Claude 補正。ジャンル/アーティスト/人気度＝**取込時に Claude が出典（曲名・メタ）から付与**、ユーザー上書き可。**人気度の出所**＝仕入れ元の人気指標（ランキング/定番度）or 手。`listNeta` のタグ絞りは現状 AND・重み無し（#2 で OR 足切り＋人気度重みの拡張が要る・実装詳細）。
- **薄いコーパスの安全弁**：コーパスが薄い/外すときは retrieval が凡庸になり得る → **捏造せず「近いものが無い／候補弱い」と正直に返す**（要件「当てずっぽうを出さない」・research の捏造禁止と一致）。
- **「っぽさ」の実装（#3 改訂・指紋は捨てる）**：アーティスト指紋（特徴ベクトル学習）は**作らない**。**売れた曲にアーティスト＋人気度タグを強めに付け、retrieval でそのタグ＋構造類似(progressionDistance)で寄せる**。交絡も大規模データ整備も回避＝連想記憶の枠組みと一致。
- **「盛り上げ/落ちサビ」（#4 改訂・消滅）**：生成的エネルギー操作を別途作らず、**セクション役割＋雰囲気タグで retrieve**（例「サビ向き・激しい」）して当てはめ→人が選ぶ。主観の断定は道具がしない（要件「最終は人の耳」と一致）。
- **コーパス保存（#2 仕入れの器）**：進行は **neta(kind=chord_progression) に 度数列(C基準)＋上記タグ＋出典(provenance) で蓄積**（既存スキーマに乗る・`listNeta` のタグ/facet で引ける）。ハードコードの `progressions.ts`/`progressions.py` は「定番の核」として残し、ingest 分は neta へ。
- **retrieval（機構⑤＝意味/雰囲気/様式/っぽさ）**：自然言語 → Claude が**基本タグへ写像** → `listNeta`(タグfacet)で足切り → `progressionDistance`(構造類似)＋人気度で並べ替え。embedding は補助。anisotropy対策＝一次はタグ完全一致。

### 根幹の決定
1. **生成器でなく「連想」**：ゼロから合成するマルコフ（現 `gen_chords`）は本線から外す。**「進行DB＋規則＋Claude選択」で 引く・変形・つなぐ・説明**する。要件どおり"ゼロ合成装置"を作らない。
2. **役割分担（#86 を記号レベルへ改訂）**：**規則/DB＝合法手を決定的に全列挙／意味検索(embeddings)＝あいまい一致(補助)／Claude＝言葉の翻訳＋候補からの選択＋説明**。**Claudeは度数（記号）を選ぶ。実音・voicing・当てはまりは規則**が担う＝「根拠なき創作をさせない」を担保（#86の精神を維持しつつ"選択"を開放）。
3. **言語境界**：ドメイン（度数化・機能解析・似ている度合い・変形・当てはまり・連想）＝**TypeScript**。**Python は信号処理に限定**（意味検索embeddings＝既存 cm-search、音声解析、pyopenjtalk）。現状ドメインTSは実質ゼロ＝新規に敷く。**フォークリフト移植はしない**（新TS＋旧Python共存→追い抜き。`gen_chords`マルコフは廃止方針ゆえ移植不要）。
   - **置き場（所属の決定）**：純ドメインは **framework非依存のTSモジュールとして `apps/api` 側（＝#20「操作コア」・MCPで公開できる場所）に新設**し、agentic Chat が MCPツールとして叩けるようにする。**web は同モジュールを workspace 経由で共用**（再生UI＝Tone依存の `apps/web/src/music.ts` とは分離）。既存 `music.ts` 内の純粋部分（QUALITY_INTERVALS/transpose 等）は当面重複を許容し、追い抜き時に寄せる（フォークリフトしない）。
4. **正規化保存**：進行は**調非依存の度数（C基準）**で保持＝移調・比較・差し替えが効く（要件「調に依存せず流用」の実装方針）。

### 連想の4軸（共通座標＝機能/度数）
①**機能軸**(T/S/D・度数) ②**意味/タグ軸**(embeddings・**補助**) ③**構造類似軸**(度数列／メロ音程列・移調不変) ④**メロ⇔コード結合軸**(機能で橋渡し)。**多粒度**で持つ（進行まるごと／2小節セル／コード遷移／(メロ動機,コード)ペア）。
※意味軸を"補助"に置く理由：意味検索の一次利用は「Claudeが言葉→**閉じたタグ語彙**へ写像し決定的に足切り」を主、embeddingsは後段の並べ替え。タグ語彙の確定が前提（未確定・下記）。

### 8機構（全要件の畳み先）
全要件はこの8つに畳める：①構造類似（似てる/対照/後ろだけ違う/重複）②制約付き変形（代替/ベタ回避/メロ固定リハーモ/部分固定）③ハモ付け（メロ→コード候補）④機能的継続（つながる/サビへ/次作る）⑤意味・様式retrieval（雰囲気/感情/っぽさ）⑥歌詞→メロ ⑦エネルギー操作（ビルドアップ/落ちサビ/複製＋末尾変奏）⑧説明・命名（なぜ/名前）。要件→機構の詳細対応と関数/検索カタログは `association-spec-validation.md`。

### 土台レイヤーと順序（全機構が乗る）
(i)**度数化**（コード列→調1〜2候補→度数・自作KS相関・TS）→ (ii)**機能/カデンツ解析**（TS）→ (iii)**進行コーパス＋タグ**（仕入れ：度数列＋基本タグ＋出典で neta 蓄積）→ (iv)**retrieval**（タグfacet足切り＋構造類似＋人気度／embeddingは補助）→ (v)**メロ-コード当てはまり**（既存 analyze_fit を TS移植）。(i)〜(iii)が全機構の土台。
- **※アーティスト指紋（旧vi）は廃止**：連想記憶の枠組みで「っぽさ＝アーティスト＋人気度タグの retrieval」に畳んだ（上記タグ語彙節）。指紋モデルは作らない。

### 実現度の階層（設計上の現実・要件の線引きと一致）
- **堅い**（決定的・データ不要・TS完結・ゴールデンテスト可）：似てる/対照/代替/部分固定/メロ修復/説明/命名/重複/単体コードの感情シフト。
- **素材量依存**（進行DB仕入れ＋タグ語彙が効く・薄いと凡庸）：雰囲気・感情検索／継続／ハモ付け／意外性。
- **天井**（データ整備が要り、時代・ジャンルと交絡して粗い）：アーティストっぽさ＝**粗い寄せまで**。
- **評価**：決定的関数はゴールデンテスト（TDD赤の起点）。主観（おしゃれ度・盛り上がり）は固定不可＝**試聴1回**で確認（要件「最終は人の耳」と一致）。

### 段階（縦スライス）
- **S1＝度数化（土台i）＋構造類似（機構①）**：`toDegrees`／調推定上位2／`progressionDistance` を TS で。**データ不要**で「似てる／後ろだけ違う／重複／対照」が同時に立つ＝最小スライス・#86を最小コストで実証・**TSドメインの初手**。**✅実装済（impl-acceptor ACCEPT）**：`apps/api/src/music/`（theory.ts＝QUALITY_INTERVALS/normRoot/chordPcs/KSプロファイル、index.ts＝toDegrees/detectKeyFromChords(上位N・KS相関)/progressionDistance(度数列編集距離・移調不変)）。framework非依存・決定的・ゴールデンテスト12本。api 87→緑。
- 以降：S2 機能/カデンツ解析（土台ii）→ S3 進行DB仕入れ＋タグ語彙（土台iii・要件の"素材量依存"勢が動き出す）→ S4 メロ⇔コード（機構③④・当てはまり移植）→ … アーティスト指紋は最後。
- **✅実装済（S2＋データ不要のユーザー機能・各 impl-acceptor ACCEPT）**：
  - S2 機能/カデンツ解析（`function.ts`：functionOf/romanOf/cadenceOf/analyzeProgression）。
  - 機構①名前あて（`identify.ts`：回転不変・調不変で名前付き進行へ照合）／機構②代替（`substitute.ts`：機能代理/相対/セカンダリードミナント/裏コード/借用）／単体感情シフト（`emotion.ts`）／説明・命名（`explain.ts`：事実を束ね"なぜ"はClaude）。名前付き進行DBは `progressions.ts`（worker ミラー）。
  - **ユーザー露出（#20）**：creative-manager MCP に read-only ツール `identify_progression`/`analyze_progression`/`explain_progression`/`substitute_chord`/`emotion_shift` を公開＋worker `_NETA_READ_TOOLS` 許可＋consult プロンプトに誘導。＝agentic Chat が「これ何進行?／なぜ／代替／もっと切なく」に**実コードで**答える（音は捏造せず決定的候補から）。
  - **残（次の実装＝#2 仕入れ・GO済）**：(iii)進行コーパスを neta に蓄積する **ingest パイプライン**（集計リスト→Songle API→人手譜面・度数列＋基本タグ＋出典に正規化）＋ (iv)**retrieval**（「切ない/〇〇っぽい/サビ向き」→タグ写像→facet足切り→構造類似＋人気度）。タグ語彙は基底確定済。アーティストっぽさ＝アーティスト＋人気度タグで此処に内包（指紋なし）。継続/ハモ付けの"質"もコーパスが入れば向上。

### 承認制・既存資産との整合
- 変形・配置・削除の結果は **#102 の承認制**（前後プレビュー＋原本/提案 再生）に乗せる。連想で引いた候補 → Claude選択 → 承認 → 適用、の流れ。
- 既存資産の流用：`analyze_fit`（当てはまり・非和声音分類）／`melody_similarity`（移調不変）／`fit_to_chords`（外し音補正）／`progressions.py`（名前付き進行・度数列C基準）／`cm-search`（意味検索）。多くは TS移植 or サービス連携。

### 未確定（設計で要詰め・タスク化前に決める）
- **タグ語彙の確定**（雰囲気/感情/様式/セクション役割の閉じた語彙）＋意味検索の埋め込み対象にタグを乗せる改修。
- **進行DBの初期件数と仕入れ実務**（jp-sources：集計リスト→Songle→人手譜面、度数列＋タグ＋出典に正規化）。
- **アーティスト指紋をやるかの判断**（必要曲数・交絡の許容）。
- `core.listNeta` のタグフィルタ対応可否（実コード未確認）。

## プロジェクト / ライブラリ分離（ネタの scope）（設計 2026-06-23・ユーザー確定）
**問題**：U-FRET取込315件でネタ帳が埋もれ、retrieval（連想）がユーザーの作業ネタと混ざる。
**決定**：ネタに **`scope`（"project" | "library"）** を持たせて分ける。

- **既定は `project`**（新規キャプチャ・AI生成は自動でプロジェクト＝安全な向き）。「プロジェクトタグが無い＝ライブラリ」案は**採らない**（新規が付け忘れで library に漏れ retrieval を汚す逆方向リスク）。`library` は**明示的に取り込んだ/移した集合**だけ。
- **scope はスキーマの列**（`neta.scope` 既定 "project"・`CREATE`/`ALTER` で増設・後方互換）。UI上は「ライブラリに入れる」トグルでタグ感覚に扱える（手触りはタグ的・真実は列）。
- **見え方（役割で出し分け）**：
  - **連想 retrieval（find_progressions / identify / explain / harmonize の参照元）＝`library`**。
  - **ネタ操作（#102：list_neta / get_neta / 編集 / 配置 / 削除）＝`project`**（ユーザーの作業対象）。
  - **ネタ帳（web NetaList）＝`project` 既定**。ライブラリは**別タブ・閲覧専用＋「プロジェクトにコピー」**。
- **コピー（library は読取専用の"元"）**：使う＝**project にコピー**（独立・元 library は不変）。①明示「プロジェクトにコピー」②セクションに library 進行を置くと**自動コピーして配置**。＋任意ネタの**複製(duplicate)**も汎用に（プロジェクト内のバリエーション派生）。
- **ライブラリ＝"連想元コーパス"の定義（要件L152との整合・design-acceptor指摘の解消）**：retrieval は `library` 固定だが、要件「自分のネタ帳（過去作）も連想の元にできる」は **library を「連想元コーパス＝取込＋自作の過去完成作＋参考曲」と解する**ことで満たす。＝**自作を連想元にしたいときは project→library へ移す/コピーする導線**で叶える（作業中ネタを連想に混ぜないため retrieval は library 固定のまま）。`scope` を project↔library に切り替える操作（`setScope`）を S1 に含める。当面の library は 取込コーパス315、ユーザーが完成作/参考曲を随時 library へ。
- **移行**：既存「取込」タグ → `scope=library`、その他既存 → `scope=project`。
- **MCP**：retrieval系ツールは `scope=library` 固定。`list_neta`/`get_neta` は `scope=project` 既定（必要なら scope 引数）。新ツール `copy_neta`（library→project コピー）。書込は増やさない原則は維持（コピーは createNeta 経由＝既存書込）。
- **段階**：S1 core/DB（scope列＋migration＋`copyNeta`＋scoped `listNeta`/`findProgressions`）→ S2 MCP配線（retrieval=library・copy_neta）→ S3 UI（ライブラリ別タブ＋コピー＋複製・picker は library 自動コピー）。

## #19 GUI 実装ライブラリ（調査完了・決定）
- 大前提：musical content は**自作の厳格JSON**（MIDI/MusicXMLでない）。よって**4つの編集面は大半が自作**、ライブラリは"縁"を助けるだけ。
- **カードグリッド**：**TanStack Table v8**（headless・ファセット）＋Tailwindカード＋**@dnd-kit**（ドラッグで合成）。gotcha：タップ再生 vs ドラッグ合成の判別（dnd-kit の activation constraint）。
- **エディタ各面＝自作**：ピアノロール（canvas/div＋pointer。既存libは死んでる）／コード入力（自作＋**tonal.js**で理論）／リズムstep（自作・小）／配置タイムライン（自作、任意で gravity-ui/timeline ベース＋dnd-kit）。
- **記譜表示＝VexFlow 5 直**（OSMDはMusicXML前提なので不採用）。表示のみ、バージョンpin。メロ譜v1、コード/リズム譜は後。
- **Chat＝assistant-ui**（@assistant-ui/react, MIT）＋**TSプロキシ向けの自作 runtime**（ストリーミング/ツール呼び/ジョブ状態を描画）。assistant-cloud は不使用（未発表物を外に出さない）。
- 明確なライブラリ勝ち：**assistant-ui（Chat）／TanStack＋dnd-kit（カード）**。コア編集器は自作。

### 意味検索のクエリ埋め込み（決定：a）
- 意味検索はクエリ側も埋め込みが要る＝同期のML呼び出し。検索は低レイテンシ必須でジョブ化は不適。
- **TSが叩く狭い内部Python埋め込みエンドポイント1個**を許す（(b) TS側 transformers.js は負債になるので不採用）。索引側の埋め込みはワーカーが生成、同一モデルで揃える。

#### 決定：検索をハイブリッド化（#65・サブエージェント調査反映）
- **問題（実測）**：既定の意味検索(Ruri v3 cosine)が無意味クエリでも0.81と高止まり（anisotropy）＝**絶対閾値で足切り不能**、常に無関係20件、「該当なし」が出ず信用できない。z-score/gap/softmax も off-topic実在語に騙され不能。
- **実測の決定打**：**spread＝候補集合内 (top1 − min) 較正**だけが実用分離（全32クエリ F1≈0.97・recall100% @ `spread≥0.05`）。anisotropyの「下駄」はクエリ非依存にほぼ一定なので、集合内の相対差でオフセットを自動キャンセルできる。ただし単独は実在語の偶発近接で残差あり→**キーワード一致と二重化**が必須。
- **決定：ハイブリッド検索 = キーワード(FTS5) ∪ 意味(較正ゲート付き)、RRFで順位融合、一致/意味を区別表示**。意味は**既定から落とさない**（要件#6「種類横断の連関」の核）。FTS5はbetter-sqlite3で利用可(確認済)。
- **段階導入**：
  - **Stage 1（最小・即効）**：(1) `search.py` の返却に `rel=score−floor`(floor=集合min) を追加。(2) TS `/search` を**ハブ化**＝キーワード一致 ∪ 意味(rel≥`CM_SEM_MIN_REL`,env既定0.07(実機実測)でゲート)を束ね、`matchType: exact|semantic|both` を付けて返す（exact優先順）。両系統0件で `[]`＝該当なし。(3) フロントに**検索用「該当なし」空状態**＋**一致/意味の区別ラベル**（スコア数値は出さない＝cosine絶対値は人に無意味）。(4) 意味(Python)不通でも**キーワードは常に返す**（より堅牢）。
    - **キーワードは FTS5 でなく LIKE を採用**（実機検証：FTS5 `trigram` は3文字以上しかマッチせず「夜」「夜の」等の1〜2文字日本語クエリを取りこぼす。LIKE `%q%` は任意長の日本語部分一致が素で効く。小コーパスでは速度も十分）。既存 `core.listNeta({q})`(title/text LIKE) を土台に流用。FTS5(ランキング/スケール)は将来 Stage 2+ で再検討。
  - **Stage 2（本命）**：FTS5と意味を両走 → **RRF**(`Σ 1/(60+rank)`)で融合し `matchType: exact|semantic|both`。spreadはゲートとして残す。
  - **Stage 3（任意）**：不満が出たら Ruri-reranker(cross-encoder)を上位だけに。今は入れない（常駐+1・レイテンシ増）。
- **FTS5の日本語**：`unicode61`はCJKを1トークン化し部分一致が壊れる→**着手時に `trigram` 可否を実機確認、不可なら title/text を自前bigram化したカラムで索引**。external-content(`content='neta'`)でneta本体は二重持ちしない。createNeta/update/deleteで同期(トリガ)。
- **テスト(TDD)**：search.pyは fake encoder で rel/floor算出＋ゲートで無意味が落ちる。db/coreはFTS upsert/delete同期＋部分一致MATCH。http /search は exact/semantic/both/該当なし(空)/Python不通→FTS退避 を core モックで。較正の回帰スイープ用評価スクリプトを `scripts/`(評価専用) に残す。閾値はコーパス成長で動く前提で env 外出し＋スイープ更新。
- **UI**：スコア数値は出さず「一致」「近い」の質的ラベルのみ。両系統0件で初めて「該当なし」。

#### 決定：SoundFontアップロード＆SF2実再生（#77/#55a・サブエージェント研究反映）
- **問題/方針**：今は SoundFont を URL直リンク登録するだけで**実再生に未配線**（再生は Tone簡易シンセ）。直リンクは行儀が悪いので**.sf2をサーバassetにアップロード**し、**全体で1個のGM音源**として読む。
- **ライブラリ＝smplr `Soundfont2`(MIT)**：アップロード.sf2を **ArrayBufferで食え**、`start({note,time,duration,velocity})` が **audioContext.currentTime基準の絶対時刻**で鳴る唯一の選択（spessasynth/js-synthesizerはnoteOn即時で時刻を取らず既存Transport設計と噛み合わない／WebAudioFontは生.sf2不可）。SF3/DLSが要れば将来spessasynthへ載せ替え。
- **Tone統合＝方式A＋AudioContext単一化（心臓）**：`Tone.start()`後の `Tone.getContext().rawContext` を smplr に共有→**Transport.seconds と smplr の currentTime が同一クロック**。既存 `scheduleTimes` を流用し `transport.schedule((time)=>{ sf.start({note:ev.pitch, time, duration:ev.durSec, velocity:ev.vel*127}) }, ev.time)` と中身だけ差替。**usePlayhead/PlaybackHandle/loop/拍子は無改修**（time源を増やさない＝壊さない）。drumは元pitch(GM番号36/38..)をpercussion presetで、program は `content.program` で loadInstrument 切替（遅延ロード）。
- **asset基盤(Fastify)**：`@fastify/multipart`(v9, Fastify5)。`asset`表を SCHEMA に `CREATE TABLE IF NOT EXISTS`（migrate不要）= `(id,kind,name,path,size,mime,meta,created)`。`POST /asset`(multipart→`stream.pipeline`で `data/assets/<uuid>.sf2` へストリーム保存・`limits.fileSize`上限)／`GET /assets?kind=soundfont`／`GET /asset/:id`(octet-stream配信, Rangeはv1省略可)／`DELETE /asset/:id`。CM_TOKENゲートはそのまま効く。**全体1個=最新の kind='soundfont' を採用**。`SoundFontSettings` をURL入力→**ファイルアップロードUI**に置換、localStorageには選択中asset idのみ。
- **段階**：**#77**＝asset基盤＋アップロードUI＋smplr初期化(`ready`解決まで・音なしで可・app.injectでユニット化／SF2デコードはモック)。**#55a**＝playNotesへSF2分岐実配線＋**SF2無し/失敗時は現行シンセにフォールバック(後退ゼロ)**＋drum/program。
- **不変/テスト**：純関数 `scheduleTimes/totalSec/loopRange` は無改修＝既存再生テスト温存。SF2デコードはユニットに持ち込まず「スケジュール変換／分岐選択／API保存配信」の3層に切りモック。実音はE2E/手動。
- **再生↔書き出し一致**：`notesToMidi` は drum→ch9・melody/chord→program を出す。GM準拠SF2を**同じprogram/同じGMドラム番号**で駆動すれば原理的に一致。唯一のリスク＝GM program番号→SF2 preset(bank0/drum=bank128)解決ヘルパが要る。
- **実装3原則**：①smplr生成前に AudioContext を1個に統一 ②`stop()` で SF2 の鳴っている音も明示停止（尾を切る・disposeKit同様の単一管理）③SF2無し時フォールバックを絶対外さない。
- **実装後の補正（重要・乖離記録）**：
  - **soundfont2 のexport解決**：`soundfont2@0.5.0` は古いUMDビルドで `import { SoundFont2 }` がコンストラクタを取れず new で throw→フォールバック（=「簡易音しか鳴らない」）。`resolveSF2Ctor()`(named/default/nested吸収)で解消。実機Playwrightで GeneralUser-GS(32MB)→324楽器ロード確認。設定に「音源をテスト」診断ボタン追加。
  - **#55b ドラムは当初設計「pitch番号でpercussion preset」が不成立**：smplr `Soundfont2` は GM プリセット(bank128統合キット)を露出せず、`instrumentNames` は**個別ドラム楽器**(例「Concert Bass Drum」「Hi-Hats」)のみ。→ `drumNameFor(pitch,names)` で GM番号を**楽器名パターン**にマッチさせ、ドラム1種ごとに個別 sampler をロード（pitch→sampler）。**パース済みSF2を url でキャッシュ共有**＝32MB再パース回避（実機: 3ドラム386ms）。未マッチ音は簡易キットにフォールバック。真のGM ch10忠実度が要るなら将来 spessasynth へ。
  - **#55c 実機ログ診断で判明した2バグ**（`localStorage cm.debugAudio=1`→`[CMAUDIO]`ログ、恒久e2e `e2e/audio-paths.spec.ts`）：
    1) **永久フォールバック**：選択中SF2のidが削除済(再アップ等)だと `GET /asset` が404 JSON→smplrが「Invalid RIFF」で落ち永久に簡易音。→ `initSoundFont()` がApp起動でサーバ一覧と突き合わせ、消えたidは最新へ**自己修復**（`applySoundFontSelection` 共用）。
    2) **特定音高が半音ズレ／音色違い**：旋律で「最初の非ドラム楽器」を適当にロードしてた。→ ネタの音色(program)から **GM bank0/preset=program** の楽器をロード（`gmInstrumentName`/`setMelodicInstrument`、`useTransport`→`playNotes`へ program 配線、rhythm除く）。音高生成自体は正しい（実機で60-71/CEG/ACE一致を確認）。
  - **#55b 改善（ドラムGM標準キット）**：個別ドラムを GM番号で叩くと sample root から大シフト→「オーケストラ大太鼓」化。→ `drumNameFor` を **GM Standard キット名優先**＋各ドラムを**楽器の原音高(originalPitch)で発音**（シフト0＝録音そのまま）。トムのみ root中心に音程差。`"Car-Crash"`等の効果音誤マッチ回避。
  - **#55d 停止UI**：ネタ帳カードの ▶ を**再生/停止トグル**化（handle保持・onEnd復帰・program反映）。
  - **#55b/#79 ドラム一発が複数回/鳴り続け**：smplrは `sf2InstrumentToPreset` でサンプルの loop点を読み `loop=true` に。durationを渡すとループ→打楽器が多重発音。→ ドラム start は **`loop:false`** でワンショット。
  - **#79 ハットclose/open無音・トム音程**：全ドラムを root で鳴らしてた。`drumNoteFor`＝楽器が GM番号を含む keyRange ゾーンを持てば **GM note**（Hi-Hats 42閉/46開、Toms 41-50音程差）、無ければ原音高（Kick/Snare）。
  - **#55e ドラムが違う楽器にマッピング**：名前ヒューリスティックが kit と違う楽器を拾ってた（36→"Standard Kick 1" 等）。→ **権威マップ** `buildGmDrumMap()`＝bank128/preset0("Standard"キット)のゾーンから GM番号→楽器名 を引く（プリセットzoneの明示keyRange優先、無ければそのzone楽器の内部ゾーンで判定）。実機: 36→Standard Kick 3, 37→Jazz Rim Shot, 42/46→Hi-Hats, 49→Crash Cymbal 1, 51→Ride Cymbal 1 とGM準拠。Standardプリセットの無いSF2は名前ヒューリスティックにフォールバック。
  - **#55f バスドラ/スネアだけヒューリスティック維持（耳の好み）**：権威マップだと kick=Standard Kick 3@38 になり評価が下がったため、**kick(35/36)・snare(38/40)はヒューリスティック優先**（Standard Kick 1/Snare 1 を原音高で）、それ以外(hihat/tom/crash/ride)は権威マップ優先、の混合に。

#### 決定：ドラム再設計(#84) — SF2パーカスの根本対応（調査subagent反映）
- **症状と根因（実機計測で確証）**：①初回再生が重い(1〜2.5s)＝ドラム種類ごとに別 smplr Soundfont2 を生成し32MBを毎fetch＋211ms parse、全部**直列await** ②音高ズレ/③HHが低い(closed -18半音/open -14半音)/④チョーク無し＝smplr `sf2InstrumentToPreset` が SF2 generator `overridingRootKey(58)`/`exclusiveClass(57)`/`coarseTune(51)`/`fineTune(52)`/`velRange(44)` を**全て捨て** `originalPitch` だけで鳴らす。
- **方針**：smplr は `SmplrRegion{pitch,tune,velRange,group,offBy,keyRange}` ＋ `loadInstrument(json,buffers)` を持つので、**Standardキットを1個の SmplrPreset に自前ビルドして1回ロード**＝多重サンプラ廃止（速度）＋root/tune反映（音高）＋exclusiveClass→group/offBy（チョーク）を一括解決。**kick/snareの好評音は note36→Standard Kick 1 / 38→Snare 1 の明示割当で維持**。サンプル→AudioBuffer変換は `sf2InstrumentToPreset` を流用。Standard プリセットの無いSF2は現行の個別サンプラ方式にフォールバック（後退ゼロ）。
- **段階（TDD：preset builderは契約＝テスト先行）**：
  - **S0 速度の即効（低リスク・本ビルド前に先行）**：prepareDrumKits の drum sampler ロードを**直列→並列(Promise.all)**＋ `/asset/:id` に **`Cache-Control: public, max-age, immutable`** 付与でブラウザHTTPキャッシュ＝32MB再fetch排除。サンプラはモジュールキャッシュ済(setActiveSoundFontでのみクリア)。
  - **S1 集約**：ドラムを1 SmplrPreset(root=note素朴)＋buffersで1回 `loadInstrument`。多重サンプラ撤去。
  - **S2 音高**：各 region に `pitch=overridingRootKey ?? originalPitch`、`tune=coarse(+fine)` 反映 → HHの-18/-14半音が0に（実機計測で確認）。
  - **S3 チョーク**：`group=offBy=exclusiveClass` → open HH が closed/pedal で止まる。
  - **S4 質**：velRange レイヤ選択・loop点。
- 実音は実機の耳で確認（段階ごとにハンドオフ）。

## #17 主要フロー（統合・end-to-end）（設計中）

1. **捕獲**：フロント→TS→neta挿入（オフライン時はローカルに貯め後で同期、#18）。
2. **探す・つなげる**：構造ファセット（TS）＋意味検索（クエリ埋め込み→vector）→ neta一覧。関連は埋め込みでクエリ時計算（保存辺にしない）。
3. **スケッチ編集・再生**：合成ツリー取得→Tone.jsで実調にトランスポーズして再生。編集は compose_edge/content の更新。
4. **投げる→進める→受け取る**：
   - 投げる：フロント→TS→job挿入（NL=plan / 原子）。対象＝neta_id。
   - 進める：Pythonワーカーがpoll→処理（plan-jobはオーケストレーション）→progress更新。静かに進み、完成/waitingで通知（強度設定に従う）。
   - 受け取る：結果neta＋job_result。フロントはTS経由で取得、元の対象に紐づいて表示。
   - 再投擲：採用/却下/「もっとこう」→新job（parentで辿れる）。
5. **DAW往復**：スケッチ→TS@tonejs/midiで.mid→DAW橋渡し→ABILITY登録。取り込みは逆。
6. **過去資産**：歌詞/MIDI/mp3を資産登録→ワーカーで解析（mp3=key/bpm/mood、MIDI=分割）→neta化＋ソース紐付け→検索・作風素材へ。
7. **情報収集・研究**：スケジューラがcollect/research job生成→ワーカー→手持ち/過去作と突合せ刺激→neta(kind=knowledge/reference)化→受け取り。
- self-review：投げる対象も結果も `neta_id` 一本（#14統一が効く）／関連はクエリ計算（#14方針）／トランスポーズは再生・書き出し両方で実調へ。整合OK。

## #18 横断事項（設計中）

- **オフライン捕獲**：PWAでローカル(IndexedDB等)に一時保存→オンライン時にTSへ同期。捕獲だけは回線不問で落とさない（NFR）。編集/再生は取得済みデータの範囲で。
- **到達/アクセス（決定 2026-06-21）**：**Tailscale tailnet 限定**に露出する。api は **localhost バインド（`CM_HOST` 既定 `127.0.0.1`）＋ `tailscale serve 8787`** で tailnet だけに出す＝**LAN(0.0.0.0)にも公開しない・インターネットにも晒さない**。スマホも家PCも Tailscale 経由（同じ tailnet）。web は api が**単一オリジン配信**（外に出すのは 8787 の1ポートだけ・本番で vite 不要／dev は従来どおり vite proxy）。Python ワーカー / cm-search:8788 / cm-music-mcp:8790 は localhost 内部のまま。→ **未発表ネタも `claude -p` も、tailnet 外の他人は到達すらできない**。`tailscale serve`（≠`funnel`）なので公開されない。手順は `docs/deploy.md`。
- **通知強度**：全体設定(silent/normal/active)＋ジョブ毎override。既定は静か、完成/waitingのみ通知。生活に合わせ可変（NFR/原則）。
- **バックアップ/永続**：SQLite1ファイル＋資産ファイルを定期バックアップ（データ消失防止NFR）。
- **認証（決定 2026-06-21）**：**アプリ側パスワードは持たない**。**ネットワーク層（Tailscale tailnet＝自分の端末だけ）を境界**とする＝要件「他人が触れなければ十分／そこまで厳重にしなくてよい」(requirements L118-119) に整合。守るのは①未発表ネタを他人に見せない②他人に `claude -p` を使わせない、で両方とも tailnet 限定で満たす。既存 `CM_TOKEN` ヘッダゲートは**任意の追加ロックとして OFF のまま温存**（将来の家族公開や LAN 直開放に倒すとき有効化）。家族公開はオプション（後）。
- self-review：非機能（常時起動・出先耐性・公開しない/他人に見られない・データ消えない）を全部拾えてるか確認→OK。
