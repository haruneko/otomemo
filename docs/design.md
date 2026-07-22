# Otomemo 設計（SDD）v0.1

最終更新: 2026-07-18（表題を Otomemo に統一。GitHub リポジトリも otomemo。技術識別子＝ローカルdir/ルートpackage `creative_manager`・`cm-*`・MCP `creative-manager` は据置＝下「UI/ブランド刷新」に権威記述。本書は随時追記の決定ログ）

要件: `docs/requirements.md` ／ アーキテクチャ: `docs/architecture.md`。
ここは統合設計＝**決定ログ**。実装はこれに沿って進める。**残タスク・進捗の正準は Task 機能／`docs/backlog.md`（保留）／本書（設計決定）**（CLAUDE.md 準拠）。`docs/status.md` は 2026-07-01 時点のスナップショット（更新停止・歴史記録）。

## 棚卸し（2026-06-30）— 実装済み/置換済みで本文の旧記述が古い箇所
以下は実装が本文より進んでいる。本文の該当節を読むときはこの注記を優先（詳細は status.md・コード）。
- **プロジェクト＝器**（下「プロジェクト＝…ホーム」節）：S1-S3 は **✅実装済**（`ProjectScreen`・`GET /projects(/files|/jobs)`・`chat_thread`/`project` 表・`listProjectFiles/Jobs`・`deleteChatThread`）。**プロジェクトの instructions は chat-session の `append-system-prompt` に注入**（chat-session.ts `systemPrompt()`）＝器の会話に常に効く。「複数プロジェクト」節(L295〜)の「フィルタどまり/将来昇格可」は経緯（昇格済）。
- **ドラム**：`rhythm` content に **`kit`**（GMドラムキット＝アコ/エレキ・bank128 preset）追加。`buildGmDrumMap(preset)` は **preset パラメタ化**（#84 の preset0固定記述は古い）。ピッチは **root=overridingRootKey??叩いた鍵**（#84 S2 の中間記述より進む）。MIDI は ch10 program にキット反映。research 2026-06-29-drum-sound-resolution。
- **メロ崩し**：`genFromEssence(…, {strength, blendWith})`（崩し強度＋複数参照ブレンド）。**MCP `reshape` に `mode:"deform"`** で露出（L416 の reshape 記述は emotion のみで古い）。research 2026-06-29-melody-corpus-and-deform。
- **音符プレビュー**：エディタで音符配置/鍵盤タップ→`previewNote` 即発音（web/audio.ts・PianoRoll/Rhythm/ChordPattern/BassStep）。
- **モバイル土台**：編集面を可視 dvh に収め底のトランスポートが潜らない＋横スクロールの左ラベル/鍵盤 sticky（全エディタ）。
- **MCP/HTTP**：`convert` は公開済（L413(4) の「未公開」は古い）。`#101` の「CUT」宣言した旧ジョブ系ツール（`create_job`/`list_jobs`/`get_job`/`get_job_results`）は、**chat面（surface="chat"＝共通verbsのみ・2026-07-15現在26本）では非公開＝ユーザー到達不可**。full面（既定・test互換）には当面残す＝**legacy維持を正式決定（2026-07-07）**、コード撤去は backlog（`mcp.ts` の `if(legacy)` を畳む別タスク）。`/projects*`・`/chat/:thread/meta|turn`・`DELETE /chat/:thread`・`PATCH /schedule/:id`（enabledトグル）は本書の一覧に未掲載。
- **コーパス**：library は U-FRET進行315に加え **メロパターン irish186/pop1139/game100 投入済**（L596「データ未収集」前提は古い）。質の検証（耳）が残。

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
  - **コード**：`genChords` は長さ=bars(1..64)、bars>=2 で I/i 始まり・I/i 終わり、各和音はダイアトニック表内・dur>0。
  - 入力の頑健化：不正 meter は 4/4、`bars` は 1..`MAX_BARS`(=64) クランプ（既存 normalizeFrame/meterInfo）。`Rng.choices` は weights が空/非有限でも NaN を出さず末尾要素にフォールバック（決定的）。
    - **長尺の安全弁（2026-07-14・実機検収 H1 是正）**：旧 `Math.min(16,…)`（2026-06-23 最初期スライスの暫定既定・V2設計制約ではない）が 32小節セクションを**黙って16小節に切って**いた。原則＝**bars は `MAX_BARS`(64) まで素直に通す**。超過だけ安全弁でクランプし、**黙って切らず** `GenResult.meta.warnings` に明示する（`withBarsWarning`＝genChords/genMelody/genBass/genDrums/genSkeleton に適用）。V2/骨格/フォーム(AABA等)は全て bars 由来の配列長で駆動＝32/64 でも構造が崩れない（実測：gen_melody V2 は 16↔32 で生成時間ほぼ不変 ~34ms）。

### 決定2：契約の単一情報源（SSOT）化
- neta/job/scope 等の契約は **zod スキーマを `apps/api/src/schemas.ts` に1本化**し `z.infer` で型導出、http と mcp が import（現状 core型/http zod/mcp zod の三重定義・http listのscope無検証キャストを解消）。
- **kind レジストリ**（kind→{label,music?,container?,filterable?,lane?}）を1つ作り、散在する KINDS/FILTER_KINDS/MUSIC_KINDS/CONTAINER_KINDS/KIND_LABEL/LANES を統合。
- web は `apps/api/src/music` を **workspace 依存で実 import**（QUALITY_INTERVALS/KEY_NAMES/Note型/相対bass解決の web↔api 重複を解消）。`api.ts` の Neta/NetaPatch をサーバ types と突合（NetaPatch に meter/mode 欠落・scope 任意化を是正）。
  - **→ 洗練（決定2b・2026-07-07・負債D3）**：web が api の全面（DB/Fastify/MCPを含む）に結合するのは過剰。**不変の音楽知識だけを共有する専用パッケージ `packages/music-core`（`@cm/music-core`）を新設**し api/web 両方が参照する。DB疎結合方針は維持＝**共有は「不変の音楽知識」に限定**（`PITCH_NAMES`＝旧 web `PITCH_NAMES`/api `KEY_NAMES` の同一配列、`QUALITY_INTERVALS`＝34品質の完全一致テーブル、純粋派生 `normRoot`/`chordPcs`）。api `theory.ts` は同名を re-export して既存 import 面を不変に保つ。web `music.ts` は自前の重複リテラルを撤去し package を import。property test（chord-quality）で pc 解決の等価を担保。相対bass解決・Note型・生成器など**アプリ固有ロジックは共有しない**（結合を最小に）。
    - **→ 一部改訂（2026-07-11・負債#10 Note型一元化）**：Note の**基本形 `{pitch,start,dur,vel?,syllable?}` は「移調不変の音楽データ表現」であってアプリ固有でなかった**（api 7ファイル＋web で同一のローカル再定義＝事実上の不変知識・applyFeel が notes を取る前例とも整合）。よって基本形のみ `@cm/music-core` へ昇格し SSOT 化。**アプリ固有の拡張フィールドは各アプリ側で交差型/extends で足す**（web の drum/program/kit/part、api chordDetect の channel 等）＝「アプリ固有を共有しない」原則自体は維持。optional start/dur の広い受け口（corpusBias/fit）は無理に統一しない。

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
- 理由：意味検索・連関を種類横断で効かせたいのが要件の核。共通スキーマ（設計語で『背骨』。id/kind/tag/辺/埋め込み）を全種類で共有。
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

- **PWAクライアント（TS/React）**：捕獲UI、ネタ閲覧・検索、スケッチエディタ（ピアノロール・再生＝Tone.js）、ジョブの投げ/受け取りUI。出先・家共通。オフライン捕獲。→2026-07-15 オフライン捕獲(outbox)は撤去（常時オンライン前提）。
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
- **frame（枠／全て任意。省略時は延長として汲む。指定したら最後まで効く）**：`{key?, meter?, tempo?, bars?, mood?, style?, section?}`
  - **`section?`（セクション役割文脈・2026-07-10）**：`{role?, prevRole?, nextRole?, seedMotif?, prevEndPitch?, energy?}`。`role`＝`intro|verse|prechorus|chorus|bridge|interlude|outro`（構造上の位置。mood=雰囲気とは直交）。**役割→既存ノブのプリセット**（density/registerShift/repetition/motifBars/breathe/expression/foreground/phrasing）を「未指定ノブの既定値差し替え」として適用＝**優先順位 明示ノブ＞role プリセット＞従来既定**。未指定（section 無し／role 無し）＝**従来と bit 一致**。詳細は #12-M「セクション役割の一級化」を参照。
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

### WP-X2 ゲームBGMループ対応（決定 2026-07-14・正典＝`docs/research/2026-07-14-intro-outro-game-loop.md`）
ゲームBGMは「イントロ→ループ本体」が最頻で、本ツールに欠けていた「どのセクション範囲がループ本体か」「継ぎ目が聞こえないか」「書き出しにループ点を残す」を最小拡張で載せる。**思想＝機械は指摘まで・継ぎ目調整は人間の耳**（骨格の机の接点と同じ＝自動修正しない）。

**(1) データ表現＝song overlay の任意フィールド `loop`**
- `song` overlay（kind=song の 1:1 箱・`stage`/`next_action` と同じ層）に **`loop?: {startBar, endBar, tailBars?}`** を足す（`song` テーブルに JSON 列 `loop` を増設＝migration。既存曲は `loop=null`＝**無影響/bit一致**）。
  - `startBar`/`endBar`＝ループ境界（小節・0起点）。ループは `endBar → startBar` へ戻る。`tailBars?`＝頭へ重ねる余韻尺（テール処理ヒント・任意）。
  - `mode`/`boundaryCadence` 等（research §7.3）は今持たない＝**最小**（後付けが安い）。セクション役割 `sectionRole` も今は導入しない（compose_edge に role 列が無く、導入はスキーマ変更＝高い。研究docに将来案として残す）。
- 契約経路：`update_song` が `loop` を受ける（`core.updateSong`→`AssetRepo.updateSong` で JSON 永続）。`song_state`/`get_song` は `loop` を含めて返す。**loop 未指定＝既存挙動不変**。

**(2) ループ境界チェック＝`check_loop` 純関数＋verb（指摘のみ・自動修正しない）**
- 入力＝ループ本体の素材（進行 chords＋任意 melody）＋`loop{startBar,endBar,tailBars?}`＋meter/key/mode。出力＝`{findings:[{code,layer,severity,message}]}`（research §7.2 チェックリストの機械判定分）。
- 判定（`cadenceOf`/`analyzeProgression` 語彙を流用）：
  - **harmony**：`loop-length-integer`（`endBar-startBar` が正の整数か＝半端拍で終わってないか）。`boundary-cadence`（本体末尾が **authentic(PAC)＝閉じている→warn**「回り続けたいなら開く」／half・modal・deceptive・none＝**開いた境界→ok**）。`boundary-wrap`（末尾→頭が V→I / D→T 循環なら info で肯定）。
  - **melody**：`boundary-melody-interval`（末尾音→頭音の音程。>完全5度(7半音)＝跳躍大 warn／以内 ok）。`crossing-note`（`loopEnd` 境界を跨ぐ持続ノート検出＝頭で鳴らし直す/末尾でリリースを促す warn）。
  - **tail**：`tail-unset`（`tailBars` 未設定＝余韻の重ね未指定 info）。
- 純関数＝`apps/api/src/music/loopCheck.ts`（`analyze_progression` と同じく core を通さず music から直呼び）。MCP verb は chat surface（`CHAT_VERBS` にも追加＝許可漏れ厳禁）。HTTP は `/music/check_loop`。

**(3) MIDI 書き出し＝ループマーカー（RPGツクール/ゲームエンジン慣習）**
- web 書き出し経路（`music.ts` `notesToMidi`/`tracksToMidi`/`downloadMultitrackMidi`）に任意 `loop{startBar,endBar,tailBars?}` を通し、`@tonejs/midi` の `header.meta` へ **marker メタイベント**（`0xFF 0x06`）を書く＝`LOOPSTART`(startTick)・`LOOPEND`(endTick)。tick＝`bar×beatsPerBar×ppq`。**loop 未指定＝マーカー無し＝既存出力 bit 一致**。
  - 注：RPGツクール本来の `LOOPSTART`/`LOOPLENGTH` は **OGG Vorbis コメントのサンプル値**（音声レンダ経路の概念）。本ツールは MIDI 書き出しなので **tick 位置の marker** で表現する（サンプル値化は将来の音声レンダ経路の仕事）。
- web UI 露出＝**見送り**：section エディタに loop を編む器（フィールド/レーン）が無く、追加はスキーマ跨ぎの UI 作業で最小を超える。export 関数は loop 引数を持つが SectionEditor は `undefined` を渡す（＝bit一致）。将来 song overlay の loop を読んで export に渡す（backlog）。

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
- **gen_bass×ドラム結線（2026-07-10・理論の正準＝`docs/research/2026-07-10-bass-generation-upgrade.md`）**：「リズムは低音が運ぶ」（Hove 2014/Lenc 2018）＝ベースこそドラム結線の本命。`genBass(frame, chords, seed, drums?, opts?)` に **ドラム入力**（genDrums content＝`{rhythm:{steps,bars,beatsPerStep,lanes:[{name,midi,hits,vel?}]}}`・Kick=midi36/Snare=midi38・1小節分を各小節に敷いて解釈）＋**3ノブ** `kickLock`(-1..1 符号付き)/`snareGap`(0..1)/`approach`(0..1)。**鉄則＝drums 無し or 全係数0で従来と bit 一致**（fig 語彙経路は温存＝新経路の「追加」であって置換でない。melodyCells の push/swing/humanize と同じ流儀＝各段は独立 seed 派生 Rng・係数0は段を丸ごとスキップ）。
  - **kickLock>0＝キック骨格（A）**：小節ごとに オンセット＝`{step0("the one"・キック不在でも)} ∪ {キックstep を確率 kickLock で採用}`。揃えすぎ禁止＝busy mood は キックに無い8分裏を p0.3 で追加（ベース側の差分）、sparse mood は前半のみ（支え）。dur＝次オンセットまで（レガート基準）。**kickLock<0＝逆相（A'）**：キックに**無い**8分裏へ確率 |kickLock| で配置（4つ打ち×裏8分＝Robert Miles 型。fourOnFloor 自動切替は残論点＝当面は符号の手動指定）。**6/8(compound) は A/C 対象外＝従来経路**（push/swing と同じ除外方針）。ドラムの `steps×beatsPerStep` が frame の拍子と合わない時も従来経路（防御）。
  - **ピッチ規則（B・kickLock経路のみ）**：アンカー（小節内最初のオンセット・コードチェンジ頭）＝ルート。間＝root/5度/オクターブの重み選択で **5度は原則上＝root実音+7**（従来の `(root+7)%12` 窓張り付けは root=G で5度が下に出て持続時 6/4 的＝是正）。音域窓 **33..48**（A1..C3・下記 WP-1 較正）。
  - **【WP-1 較正・2026-07-14＝意図的 bit 破壊】ベース低域窓を 33..48（A1..C3）へ統一**（正典＝`docs/research/2026-07-14-stem-groove-measurements.md` §2/§8＝自作曲 stem 実測 p5–p95=G1..A2・絶対上限 F3）。**旧値からの変更＝旧出力と非互換（既定変更・是正）**：①**legacy fig 経路**の絶対配置 `36+pc`（→36..47 張り付き）を **`bassPcToWindow(pc)`＝窓 [33,48] の最下 oct**（C→36 据え置き・A/A#/B は1oct 降下＝実測の重心低下）へ。②**kick 経路の上端 55→48**（高ルートの5度上/oct D3/G3 は窓外で刈られ root 集中・下転回はしない設計は維持）。③**approach/skeleton fold も窓 [33,48]**。**耳確認は[耳/手]**（synth の C2 基準の鳴り確認＝オーナー）。
  - **【WP-1 較正】kickLock 動作点＝bass onset の kick 共有率**（実測）。**既定 0＝bit 一致は不変**。プリセット `KICK_LOCK_PRESETS`＝**弱0.6/強0.8**、**上限0.85 クランプ**（正方向のみ・実測 share→1.0＝全 onset を kick へスナップ＝完全ユニゾンは自作曲に非実在の安全弁。負=逆相は8分裏配置ゆえユニゾン化せず -1 まで許容）。**★意図的 bit 破壊**：kickLock=1 は 0.85 にクランプ＝一部キックが確率で不採用（旧「1.0=全キック採用」から変化・影響テスト更新済）。
  - **【WP-1 確認・変更なし】hihat 重み 0.3**（加重密度 `kick+snare+0.3*hihat`）は **上限として維持**（D2 実測＝小節別 hihat 数と kick+snare 数の相関 0.20/−0.02≒無情報。0.2 へ下げる選択もデータ寄りだが差は小＝現行 0.3 で実測と矛盾しない）。根拠コメントを generate.ts に追記。
  - **分数コード/転回の低音伝播（`slashBass` ノブ・2026-07-22・boolean 既定OFF）**：`genChords` は citypop 分数化（末尾 V の IV/V 等）と **IAC 第1転回**（末尾 I の bass=第3音・design「終止の型」）で `chord.bass`（低音 pc）を出し、web `resolveChordPattern`（`music.ts:561,732`）はそれをベース pc に使うが、**genBass は root しか読まず非対称だった**（生成ベースラインが進行側で決めた転回/分数低音を無視）。`opts.slashBass:true` で**アンカー（小節頭・コードチェンジ頭）のベース音を `chord.bass` の pc へ**（低域窓 `bassPcToWindow` 経由）。**間の5度/オクターブは和音の同一性＝root 基準のまま**（分数でも和音は root＝5度は root+7）。**鉄則＝既定OFF（未指定/false）は chord.bass を無視＝bass 有無で bit 一致**（新ノブ）＝適用は fig（従来）経路・kickLock 経路・approach 着地先（次コードの bass）の3点、RNG 不消費・chord 変化検出は root のまま（bass では検出しない）。**style 型格子（bassLibrary）は対象外**＝型の度数（R/3/5/8）は root 相対で敷くため bass 差し替えは R 以外を歪める＝当面 fig/kick のみ（型×分数の両立は将来・**要耳較正**）。結線＝MCP `gen_bass`/HTTP `/music/gen_bass`（`slashBass:true` 透過）・`POST /gen/section`（`bass.slashBass` は opts 直渡しで自動透過・ただし section の `genChords` は cadence/genre 未指定で bass を出さない＝既定 bit 一致）。web UI 露出は別タスク。
  - **genBass / genChordPattern 出力への feel 添付（S4・2026-07-22・実装済み）**：従来 `content.feel`（swing/humanize の再生時グルーヴ）を載せるのは genMelody のみ（`buildFeel`・generate.ts:206）で、genBass/genChordPattern はストレートのまま＝web/MIDI 再生でベース・コード楽器だけスイング/humanize が素通しになる非対称があった。**genMelody と同契約の 2ノブ `swing`(0..1)/`humanize`(0..1) を genBass の opts と genChordPattern の opts に追加**し、`buildFeel(swing, humanize, seed)`（genMelody と同一関数・generate.ts:206）の返り＝feel を、指定時のみ content に添付する（genBass は返り content＝`feel ? { notes, feel } : { notes }`／genChordPattern は全 return 経路＝辞書型/candidates/既定の各 content に `feel ? { ...content, feel } : content`）。**鉄則＝両ノブ未指定/0 は feel キーを生やさない＝従来出力と deepStrictEqual bit 一致**（buildFeel が sw≤0∧hm≤0 で undefined を返す＝melodyCells と同流儀）。seed の載り方も genMelody と同じ＝humanize>0 のときのみ seed を feel に載せる（決定的）。humanize seed の基底は各生成器の rng 既定（bass=42・chordPattern=5）を流用。
    - **web 消費経路は既に生きている（結線追加なし）**：feel の適用は `apps/web/src/music.ts` の `applyFeelEnsemble`＝`applyFeelByPart(notes, feel, ctx, humanizePartOf)` で、`humanizePartOf`→`MIX_HUM_PART`（`chord:"chords"`, `bass:"bass"`・music.ts:80）が part 別 humanize プロファイルへ解決する。トラックの feel は `feelOf(content)`（content.feel を kind 非依存で読む・music.ts:22）＋セクションは `feelOfTree`（子順に最初の feel を曲全体へ）。**genBass/genChordPattern の content に feel を載せた時点で、再生（audio.ts）・MIDI 書き出し（notesToMidi/tracksToMidi）が既存経路のまま part 別（bass/chords）で消費する**＝web 側の新規結線は不要（テストで担保のみ）。
    - **セクション共有 feel（swing-feel-layer-audit Stage 4「全トラック同一ワープ」）**：`POST /gen/section` に body の `feel:{swing?,humanize?}` を追加。指定時は genMelody（swing/humanize 透過）・genBass（bass opts へマージ）・genChordPattern（opts へ）へ**同一 feel を共有**＝メロ・ベース・コード楽器が同じノリで跳ねる。既存の bass/drums opts 透過の流儀に倣った最小透過。**feel 未指定＝各生成器へ swing/humanize が渡らない＝従来 section と bit 一致**（genChordPattern は従来 opts 無し呼び＝`feel?opts:undefined`）。
    - **MCP/HTTP 露出**：`gen_bass`/`gen_chord_pattern`（MCP `mcp.ts` ＋ HTTP `/music/gen_bass`・`/music/gen_chord_pattern`）の inputSchema に `swing`/`humanize` を追加（describe は gen_melody の同名ノブに合わせる）。gen_chord_pattern は opts 構築ガードに swing/humanize を含める（未指定は従来どおり opts=undefined）。
    - **要耳較正**：(1) synth の低域ベース（BASS_LO=33 帯）で humanize の微小揺れが可聴か・タイトすぎ/緩すぎでないか（HUMANIZE_PROFILES.bass）。(2) swing 下でベースの8分裏跳ねがメロ/ドラムと同一ワープに乗って気持ちよいか（アンサンブル一体感＝Stage 4 の狙い）。(3) コード楽器（strum/arp）に swing を掛けた時のロール（strumMs）との干渉。(4) /gen/section の共有 feel でメロだけでなく全トラックが跳ねる時の総合的なノリ。
  - **approach（C）**：各コードチェンジの直前**最後のオンセット**を確率 approach で接近音（半音下/上・全音下→次ルート着地＝「beat4=接近・beat1=ターゲット」）。**弱拍・dur≤1拍・チェンジ1.5拍以内**に限定＝強拍/長音への out-of-key 露出ガード。
  - **snareGap（D）**：スネア位置を跨ぐ音の **dur をスネア頭で切る**（確率 snareGap・onset列は不変・最小 dur 0.25 保証）＝2・4に穴を空けて backbeat を抜く（"leave a hole on 2 and 4"）。beatsPerStep 自己記述換算なので唯一 compound でも有効。
  - **結線**：`/music/gen_bass`（drums＋ノブ＋seed 透過）・MCP `gen_bass`（同）・**`POST /gen/section`＝rhythm を先に生成→bass へ渡す依存順を確立**（body `bass:{kickLock,snareGap,approach}` でノブ指定可。rhythm を parts に含まない時は drums 無し＝従来）。web UI 露出は別タスク。ゴーストノートは bass notes が vel 未対応のためスコープ外（先行条件＝vel 追加＋synth の鳴り確認）。
- **gen_melody×ベース結線＝対位バイアス（2026-07-10・理論の正準＝`docs/research/2026-07-10-melody-bass-counterpoint.md`）**：評価器 `analyzeVoiceLeading`（#8・メロ×低音の並行/隠伏5度8度）はあるのに生成側はベースを見ない**評価と生成の非対称**を埋める。`genMelody` opts に **`bass`**（ベーストラックの notes `{pitch,start,dur}[]`）＋**`counter`**（0..1・対位係数・既定0）。V2実体（`genMotifMelodyV2`）へは `bassPitchAt(t)` 閉包＋`counter` を透過（chordPcsAt と同パターン。標本化は **voiceLeading.ts の `pitchAt` を export して共用**＝評価と生成で同じ「時刻tで鳴っている低音」）。**鉄則＝bass 無し or counter=0 で従来と bit 一致**（対位経路は counter>0 かつ bass 有りの時のみ＝構造的保証）。**onset/dur は一切不変＝snap 先ピッチの選好のみ・mv 列（輪郭）は触らない**＝モチーフ反復 A/A' を壊さない（副作用ガード＝research③-1）。
  - **挿入点A（本命）＝V2後処理①「強拍CTスナップ＋anti-unison」の距離式拡張**：候補コード音 q を `d = |q−tgt| + counter × counterTerm(q,t,prevMel,prevBass)` で argmin（anti-unison の候補列挙にも同項）。`counterTerm`＝評価器と同じ隣接遷移判定を選好関数化：**並行完全協和**（同方向・iv0==iv1∈{0,7}＝「持続」のみ罰・単発/様式は許す）=+6／**隠伏**（同方向＋上声跳躍>2半音で iv1∈{0,7} へ突入）=+3／**対ベース実音 b9**（iv1==1）=+8／**反行ボーナス**（ベースが動く時に逆方向）=−1（比は research④の理論値・絶対値は counter スイープ実測で×2 較正＝counter×W>1半音 で初めて snap 先が動くため）。i==0（句頭・直前音なし）は b9 項のみ。強拍=コード音の制約は不変＝変わるのは「どのコード音か（3rd/5th/oct の選び）」だけ。
  - **挿入点C＝弱拍の濁り掃除に対ベース実音 b9 を追加**：`isClashBass(p,t)＝非コード音 かつ (p−bassPitchAt(t))%12==1`（メロが上）を既存 isClash（コードpcの半音上）に OR（置換候補の除外条件にも同判定）。passing（両側step同方向）免除・「安全候補が無ければ残す」の既存防御を流用。**counter>0 かつ bass 有りでのみ有効**（research④は「bass有りで常時on」案だが、係数0=bit一致の鉄則を優先した強い契約に確定）。
  - **較正**：counter は 0.2-0.4 目安（実測＝counter0.3 で並行+隠伏違反 -37%・強拍b9 -48%・pitch変更 2.3%のみ＝反復無傷。research ⑤-補）。声部交差/低音程限界ガードは現レジスタ（メロ≥55 > ベース≤47）で構造的に非発生＝導入しない（voiceCrossings が 0 でなくなった時が導入タイミング）。密度相補（converse）はドラム版Cへ統合予定＝本結線はピッチ次元のみ（二重適用禁止）。
  - **結線**：`/music/gen_melody`（body `bass`＝notes配列 or `{notes}`＋`counter` 透過）・MCP `gen_melody`（同）・**`POST /gen/section`＝rhythm→bass→melody の依存順**（生成済み bass notes を melody へ。body `melody:{counter}` でノブ指定・未指定=0=従来 bit 一致）・web SectionEditor＝`sectionBass()`（bass レーンの子 notes を小節オフセットで連結＝sectionChords と同流儀）を gen_melody body に付け **counter=0.3**（推奨較正の中央。UI ノブ露出は後続タスク）。
### 終止タイプ(PAC/IAC)の生成側結線 ＋ 声部進行の減点を候補選別へ（2026-07-22・SDD・監査反映v2）

**背景＝解析と生成の非対称の残り2点**。①終止タイプ：解析側 `function.ts::cadenceOf` は
authentic/plagal/half/deceptive/modal を判定するが **PAC(完全正格)/IAC(不完全)の別を持たない**
（ソプラノ着地音・転回形を見ていない・現状 authentic 一括）。生成側 `genChords` の cadence
セレクタも half/deceptive/plagal/aeolian/full 止まりで PAC/IAC を作れない。②声部進行：
`voiceLeadingReport.ts::resolveLowerVoice`＋`analyzeVoiceLeading` は既にあるが、
`attachMelodyVoiceLeading` は **候補選別の"後"に items[].meta へ読み取り添付するだけ**＝順位に無関与。
`counter` ノブ(生成側 soft バイアス)は snap 選好を曲げるが、**複数候補のランキングには声部進行が
効いていない**。本節はこの2点を **いずれも既定OFF(bit一致)** で結線する。counter ノブの既存挙動は
一切変えない（生成側バイアスと選別側減点は別レイヤ）。

**新ノブ（すべて既定＝現行と1バイト一致）**
- `genChords(frame, seed, cadence, …)` の `cadence` 列挙に **`"pac"` / `"iac"`** を追加。
  既定 undefined/`"full"`＝従来の完全終止(markov末尾)＝bit一致。
  - `"pac"`＝完全正格：末尾 penult=**真のV(度数5・根音)**・last=I(度数1・**根音＝転回しない**)。
    ソプラノは既定でメロが主音着地するため PAC。
  - `"iac"`＝不完全正格：V→I は保つが **I を第1転回**（`chords[last].bass = key+M3/m3 の pc`）＝
    転回形による不完全さ。and/or ソプラノ非主音着地（`cadenceSoprano` と併用）。
    **転回は `chords`（実音配列）の bass フィールドへ直接設定する**（`base` 要素は {root,quality} のみで
    `base.map` が bass をスプレッドしないため base 段では表せない＝aeolian(base直書き)とは代入先が違う）。
    設定は citypop 変換より前に置き bass を保持させる。**注意：`transition`(調プラン準備和音)と併用すると
    末尾和音が bass 無しで再構築され転回が消える**（転調境界の終止では IAC 転回は無効＝呼び出し側の責務）。
- `genMelody(frame, chords, seed, opts)` の `opts.cadenceSoprano?: "tonic" | "third" | "fifth"`。
  既定 undefined＝**終止音は現行のtonic着地のまま**＝bit一致。`"third"/"fifth"`＝IACのソプラノ非主音着地
  （最終音を要求階名の最寄り**スケール音**へ再ターゲット＝コード非依存の「調のソプラノ着地音」明示指定。
  スケールに要求 pc が無い異常時のみコード音へ防御フォールバック）。`"tonic"` を明示しても現行の主音着地と同 pc＝無害。
- `genMelodyCandidates(…, opts)` の `opts.vlWeight?: number`（既定0）。`>0` で声部進行減点を並べ替えキーへ合成。
  `opts.vlAtCadenceOnly?: boolean`（既定 true）＝導音未解決減点を V/V7/vii° 区間に限定。
  **`seed` 明示時は genMelodyCandidates が単一決定生成へ早期 return するため vlWeight は不適用**
  （候補APIの既存契約どおり＝リランクは候補集合がある時のみ）。

**bit一致を保つ具体経路（どの分岐が既定枝か）**
- `genChords`：pac/iac は新規文字列。既存の `half…else if…aeolian` 連鎖は無改変で、末尾に
  `else if (cadence==="pac"||cadence==="iac"){ degrees[last]=1; if(pen>=1) degrees[pen]=5; }` を足すだけ。
  **cadence=undefined は外側条件 `cadence && cadence!=="full"` で入らず**＝既定進行はこのブロックに触れない。
  iac の転回は **base→chords 変換後(citypop より前)** に `if(!loop && cadence==="iac" && bars>=2 && chords.length){ chords[last].bass=(key+(minor?3:4))%12; }`
  ガード内のみ＝既定は `chords` に bass 無し＝現行と同一オブジェクト。
- ソプラノ着地（`genMotifMelodyV2`・句末カデンツ着地パスの直後）：`if(opts.cadenceSoprano && notes.length){ 最終音を要求階名の最寄りスケール音へ寄せ（スケール外の異常時のみコード音へ防御）、着地への禁則跳躍は直前音を寄せて回収 }`。
  **既定undefined＝ブロック不到達**＝notes は既存出力のまま。後続パス（表情/弱拍掃除/pickup/flow/articulation 等）は最終音の pitch を変えない（i=1..len-2 or timing/dur/vel のみ）。
  骨格休符(restMask)が最終音を落とし得るエッジのみ `notes.length` と最終音存在をガードして no-op。
- `genMelodyCandidates`：`const w = Math.max(0, opts?.vlWeight ?? 0); const lower = w>0 ? resolveLowerVoice({bass,skeleton,chords,beatsPerBar}) : null;`（**候補ループ外で1回**）。
  各候補 push 時に `pen = w>0 ? voiceLeadingPenalty(lower?analyzeVoiceLeading(notes,lower):null) + leadingTonePenalty(notes,tonicPc,{atCadenceOnly,chords}) : 0`。
  `const rankOf = w>0 ? (c)=>c.typ - w*c.pen : (c)=>c.typ; cands.sort((a,b)=>rankOf(b)-rankOf(a));`。
  **w=0 で rankOf は `c.typ` を返す関数**＝ソート式は現行の `b.typ - a.typ` と字面同値（pen を一切計算しない・下声解決もw>0時のみ＝浮動小数誤差もNaN混入も起きない）。多様top-k(melodySimilarity)は無改変。
  lower=null（bass/skeleton/chords いずれも無し）時は voiceLeadingPenalty(null)=0＝pen は導音減点のみ。

**声部進行減点の中身（analysisは既存を再利用）**。`voiceLeadingPenalty(rep)= rep? 6*(par5+par8)
+ 3*(dir5+dir8) + 6*crossings : 0`（比は counterTerm の実定数 W_PAR=6/W_DIR=3 に整合・crossings は
重欠陥ゆえ 6）。`leadingTonePenalty(upper, tonicPc, {atCadenceOnly, chords})`＝メロが導音pc
`(tonicPc+11)%12` に居て次音が半音上の主音へ解決しない箇所（下降/跳躍離脱＝未解決）を数える。
`atCadenceOnly=true`(既定) では **その時点の和音が V/V7/vii°（真のドミナント）である区間のみ**カウント
＝終止/属和音上の導音解決則に限定（旋律中間の経過的 7̂ 下行は罰しない）。chords 未渡し時はドミナント判定
不能ゆえ 0（全域 fallback しない＝安全側）。**注記＝root が文字列形（"G" 等）の和音は `Number(typeof root==="string"?NaN:root)`
で NaN→非ドミナント扱い＝減点対象外（数値 root で来る候補経路では通常発生しない・安全側の割り切り）。文字列 root の解釈対応は followup。**減点は **soft reranker に留め hard filter 化しない**
（design「ありえない変は正当性ゲート・低カウント≠除外」／メモリ「理論スコアはガードレール止まり」と整合＝score が低くても候補は出す）。`attachMelodyVoiceLeading` の meta 添付は現状維持（順位は減点・表示は meta＝二重でよい）。

**結線**：`/music/gen_chords`(http)＋`gen_chords`(mcp) の cadence enum に pac/iac／`gen_melody`(mcp) に
`cadenceSoprano`・`vlWeight`・`vlAtCadenceOnly` を透過（未指定＝既定＝従来 bit一致）。`/music/gen_melody`(http) は
`genMelody` 直呼び（候補リランクなし）ゆえ `cadenceSoprano` のみ透過＝`vlWeight` は候補経路(mcp gen_melody)専用で本経路は非適用。
セクション生成で既定 vlWeight>0 にするか（counter=0.3 の前例）は保留＝オーナー裁定。
`genLyricMelodyCandidates` は lyricFit 支配の別ソートゆえ今回は結線しない（歌詞整合＞声部進行）。
`function.ts::cadenceOf` への PAC/IAC ラベル追加（解析語彙の統一）は本節では見送り＝別 Task（要オーナー裁定）。

- **gen_melody×ドラム結線（2026-07-10・理論の正準＝`docs/research/2026-07-10-melody-groove-drum-interaction.md`）**：ドラムの kick/snare は **phenomenal accent の外部供給源**（L&J）＝メロは今まで metrical（拍子由来 strongPositions）しか見ていなかった非対称を埋める。`genMelody` opts に **`drums`**（gen_bass と同形の DrumsInput＝genDrums content・`parseDrums` を共用＝hihat レーン(midi42/44/46)も読めるよう拡張）＋**3ノブ** `backbeat`(0..1)/`drumLock`(0..1)/`converse`(0..1)。V2実体（`genMotifMelodyV2`）へは前処理済みの `drums:{kick,snare,densityByBar}`（kick/snare＝**セクション全長へタイル済みの絶対拍位置**・densityByBar＝小節ごとの加重 onset 密度 `kick+snare+0.3*hihat`）を渡す。ドラムパターン長（steps×beatsPerStep）が小節長の整数倍でない時は防御で drums 無し扱い（gen_bass の不一致→従来経路と同方針）。**鉄則＝drums 無し or 全係数0で従来と bit 一致**（各段は係数0で丸ごとスキップ・独立 seed 派生 Rng＝drumLock は seed+61、B/C は決定的で rng 不使用）。**3段とも compound(6/8) は対象外**（research ⑤-6「A/B も当面4/4のみ」に従う＝push/swing と同じ除外方針）。
  - **B＝backbeat（バックビート・アクセント）**：**velocity のみ・onset/pitch/dur 一切不変**（最低リスク＝research③-B）。humanize の posBoost（メトリカル強拍±）に対する**第2項＝ドラム実在位置のブースト**として、パイプ最終段（humanize の後）で `vel = clamp((vel ?? 100) + round(backbeat × boost), 55, 118)`・boost＝スネア位置+12／キック位置+6／他0（16分グリッドへ round して照合＝humanize の微小揺れ後も噛む）。humanize 無しでも単独で効く（vel 未設定音の基底は 100＝web/MIDI の `vel ?? 100` と同じ）。
  - **A＝drumLock（キック食い）**：既存 `push`（対象拍が固定リスト [0,1,2] 等の division-level syncopation）を「**実キック位置**」で駆動する精緻化。対象＝**拍頭ちょうどに居る音**のうち「その拍頭の16分前(step-1)にキックが食っている」拍のみ。確率 drumLock で 16分前借り（`start -= 0.25`・**dur += 0.25 のタイ＝終端不変**・前音は詰める＝anticipate と同式）。保護＝終止音(最終音)と曲頭(i=0)は不変（push と同じ）。**上限＝前借り ≤2/小節**（全オンセットのキック整列＝ユニゾン化ガード・research③-A）。**push との合成規則＝音単位の排他（実効 max）**：drumLock 段が先に走り、食った音は拍頭から外れるので後段 push の対象から構造的に外れる（一音は最大1回・0.25拍しか前借りされない＝二重前借りは不可能）。両ノブ併用可＝対象拍の和集合。
  - **C＝converse（密度の相補）**：小節ごとのドラム密度（densityByBar・hihat 重み0.3＝research③-C「体感密度は kick/snare 主体」）を**ブロック単位**（phrases 指定時は句＝句境界を跨がない・未指定時は mb 小節ブロック）で平均し、中央値比 rel から `scale = clamp(1 − converse×(rel−1)×K, 0.7, 1.3)`（K=0.3＝弱いバイアス）。実現＝「語彙の再重み付け」ではなく**ブロックの motif 写像に対する決定的な onset 追加/削除**（ドラム密→弱位置の onset を間引き・ドラム疎→最大ギャップの中点(8分格子)へ挿入・モチーフの先頭/末尾 onset は保持＝終止/句頭安全）。基底モチーフは共有のまま＝A/A'' の同一性を保ちつつ密度だけ会話する。ドラム密度が全小節一様（genDrums の1小節パターン等）なら rel=1＝scale=1＝**無変化（bit 一致）**。メロ×ベースの密度相補は実装しない＝**ドラム版C一本に統合**（research/2026-07-10-melody-bass-counterpoint.md ⑤-補で確定・二重適用禁止）。
  - **結線**：`/music/gen_melody`（body `drums`＋3ノブ透過）・MCP `gen_melody`（drumsSchema 共用＋3ノブ）・**`POST /gen/section`＝rhythm→bass→melody**（生成済み drums content を bass と melody の両方へ。body `melody:{drumLock,backbeat,converse}` でノブ指定・未指定=0=従来 bit 一致）・web SectionEditor＝`sectionDrums()`（rhythm レーンの子の step 列を配置位置(拍)オフセットで1本のグリッドへマージ＝compositeNotes と同じ拍解釈）を gen_melody body に付け **backbeat=0.3**（推奨＝弱く。drumLock/converse は 0＝耳較正待ち・UI ノブ露出は後続タスク）。rhythm レーンが空なら渡さない＝従来。

- **ドラム定型ビート＋フィル語彙（WP-D1・2026-07-14・理論の正準＝`docs/research/2026-07-14-drum-pattern-genre-library.md`＝定型ビート型辞書／`docs/research/2026-07-14-drum-fill-vocabulary.md`＝フィル型辞書／`docs/research/2026-07-14-stem-groove-measurements.md`＝頻度の実測較正）**：現状 `genDrums(frame, seed)` は「バックビート基本＋4/4・6/8＋sparse/busy 分岐」しか持たずジャンル定型もフィルも無い。`genDrums(frame, seed, opts?)` に **2ノブ** `style`(型ID or ジャンル名)／`fill`(0..1 or 型ID) を足す。**鉄則＝opts 無し or 両ノブ未指定は従来と bit 一致**（既存 sparse/busy 経路を温存＝新経路の追加。gen_bass/gen_melody 結線と同じ流儀）。データは純データ辞書 `music/drumLibrary.ts`（リポジトリ不変知識・生成器から分離）。
  - **型は素の格子(straight)で保持**＝スイング/微小 timing は既存 feel 層(applyFeel)へ委譲し二重に揺らさない（三連が主役の `shuffle.*` のみ 12格子=triplet で保持＝feel のスイングでは跳ねが足りない、D5 §11-1）。ゴースト等の非一様ベロシティは**レーン分割**（同 midi で `Snare`/`SnareGhost` 別レーン・単一 vel/レーン＝再生 `drumVel(midi,vel)` と bit 互換）か、フィルの**velocity カーブ**は lane 追加フィールド `velCurve?: number[]`（hits と同順・旧 consumer は無視＝加算のみ・bit 安全）で表現。hits は number[] のまま（parseDrums/gen_bass/gen_melody 結線・sectionDrums は velCurve を読まない）。
  - **style（定型ビートライブラリ・S1）**：`style` が型ID（例 `beat8.syncopated`）なら当該型を確定 realize（seed 不問で固定格子）。ジャンル名（例 `jpop`/`rock`/`dance`）なら D5 §9 選択表＋frame.section.role＋tempo 適正域で候補型を絞り seed で1つ選ぶ（決定的）。拍子ゲート＝`meterInfo(meter).grouping==="compound"`(6/8) では 6/8 対応型(`six8.ballad`)のみ候補。既定 `style` 未指定＝従来の densityBias 経路（bit 一致）。
  - **fill（フィル・S2）**：`fill` 指定時は frame.bars(既定4) 本の複数小節を出す（従来1小節→複数小節へ拡張は fill 指定時のみ・style/従来のベース型を各小節へタイル）。フィルは**末尾の1つ手前の小節**(`bars-2`＝句/セクション末の遷移小節)の後方へ F型を挿入し、**着地(landing)＝次小節頭(=最終小節 `bars-1` の step0)に crash(49)+kick(36)**。それ以外の小節はベース型のまま不変（＝「境界小節にF型出現・他小節不変」）。頻度既定は D1/実測（8〜16小節に1回＝median 12.7/9.3）だが `genDrums` は1回の生成単位（≤16小節）なので**遷移1回**を置く。`fill` が 0..1 の数値なら intensity で F型を選抜（小=intensity低・大=高）、型ID なら当該 F型を固定。6/8 は F型グリッドを 12セルへ張替（D1 §8-5・当面は代表 F型のみ対応、非対応時はフィル無し=ベースのみ）。bars<2 の時は landing 用の次小節が無い＝フィル無し（防御）。
  - **結線**：`/music/gen_drums`（body `style`/`fill` 透過）・MCP `gen_drums`（同スキーマ追加）・`POST /gen/section`（body `drums:{style,fill}` でノブ指定可・未指定=従来 bit 一致・rhythm を bass/melody へ渡す依存順は不変）・web SectionEditor「この進行に生成 ドラム」＝スタイル選択(セレクタ)＋フィル(トグル/セレクタ)の最小 UI（既定=おまかせ＝未送信＝従来）。[耳/手]＝フィルの効き/ビート型の質は実機試聴。
- **ベース語彙のジャンル型ライブラリ（WP-B1・2026-07-14・理論の正準＝`docs/research/2026-07-14-bass-genre-vocabulary.md`＝6ジャンル33型（度数×16分グリッド譜＋フィル型）／`docs/research/2026-07-14-stem-groove-measurements.md`＝kickLock/アプローチの実測較正）**：現状 `genBass` はキック結線（kickLock/snareGap/approach）と fig 語彙しか持たずジャンル定型（ロックの8分ルート・シティポップのオクターブ奏法・ファンクの the one 等）を出せない。`genBass(frame, chords, seed, drums?, opts?)` の opts に **2ノブ** `style`(型ID or ジャンル名)／`fill`(0..1 or 型ID) を足す。**鉄則＝両ノブ未指定は従来と bit 一致**（fig/kickLock 経路を温存＝新経路の追加。gen_drums の WP-D1 と同流儀）。データは純データ辞書 `music/bassLibrary.ts`（リポジトリ不変知識・生成器から分離・drumLibrary.ts と同形）。
  - **型＝(度数×16分グリッド, テンポ域, キック絡み kickRel, 適用セクション roles) の純データ**（正典 §8-1）。度数はコードルート相対（キー非依存）で `DEGREE_SEMI` により半音へ、`bassPcToWindow`＋`foldBassPitch` で低域窓 [33,48] へ写す（実音写像は現行のピッチ規則を通す）。1小節16セル・`R`=ルート/`8`=オクターブ上/`5`=5度/`b7`等=コードトーン・`.`=休符/`-`=タイ（音価延長）/`x`=ゴースト（bass は vel 未対応ゆえ realize では休符扱い＝正典 §8 スコープ外・先行条件=vel 追加）/`/``\`=スライド（音符レベルでは目標音のみ）/`R>``8>`=次小節頭ルート基準の先取り着地。
  - **style（型ライブラリ）**：`style` が型ID（例 `RK-8ROOT`/`CP-OCT8`/`FK-ONE`）なら当該型を確定 realize（seed 不問で固定格子）。ジャンル名（`rock`/`ballad`/`citypop`/`funk`/`edm`/`vocarock`＋エイリアス disco/house/vocaloid 等）なら `GENRE_TABLE`＋frame.section.role で候補型を絞り、**テンポ域が合う型のみ適格**（正典 §6-6・域内が皆無なら型を選ばず従来経路へ fallback＝域外の型はジャンル指定で選ばれない）＝seed で1つ選ぶ（決定的）。**4/4系のみ**（型は全て4/4格子・`grouping==="compound"`(6/8) は style 対象外＝従来）。**キック絡み合成の排他**：型格子を正準に鳴らし kickLock の kickPath より優先＝キック絡み(kickRel はメタ)と kickLock を**二重適用しない**（unison 型は既にキック位置に座り counter 型は裏拍・型格子がその関係を内包）。
  - **fill（セクション末フィル）**：`fill` 指定時は**末尾の1つ手前の小節**(`bars-2`＝句/セクション末の遷移小節)をフィル型（FL-*＝駆け上がり/下がり）で置換し、`R>` は次小節(`bars-1`)頭のルートへ先取り着地（walk up/down）。他小節は不変・フィル小節へ食い込む前の音は着地点で切る。`fill` が 0..1 の数値なら方向で選抜（<0.5=下降で落ち着かせ・>=0.5=上昇で盛り上げ）、型ID なら固定。全後処理（approach/snareGap/skeleton）の最後に適用＝型格子を正準に保つ。bars<2 は着地小節が無い＝フィル無し（防御）。6/8 は対象外。
  - **結線**：`/music/gen_bass`（body `style`/`fill` 透過）・MCP `gen_bass`（同スキーマ追加）・`POST /gen/section`（body `bass:{style,fill}` でノブ指定可・未指定=従来 bit 一致）・web SectionEditor「この進行に生成」＝ベース型選択(セレクタ)＋ベースフィル(セレクタ)の最小 UI（既定=おまかせ＝未送信＝従来。骨格表面化時は型を送らない＝骨格が構造を担う）。[耳/手]＝型の質/キック絡み/フィルの効きは実機試聴。

### コード実現層（コンピング／アルペジオ・2026-06-23・要件「実現層」）
**問題**：`chord_progression`（和声＝抽象）が `program`（音色）を持つのは概念の混線。**和声=何か** と **楽器がどう鳴らすか** を分ける。
- **`chord_progression` は抽象**：音色を持たない／選べない。プレビューは**固定の中立音色（GM 49 String Ensemble）**で鳴らせるが選択不可。合成では「コード楽器パターン」が実際の伴奏を担う。
- **新 kind「コード楽器パターン（chord_pattern）」**＝**進行に解決する相対型**（相対ベースの和音版＝姉妹）。section のコード進行に合成時解決・自前の音色・複数重ねOK（ピアノ/ギター等）。content：
  - `{ mode:"strum"|"arp", voicing:{ tones:("R"|"3"|"5"|"7")[], openClose:"open"|"close", octave:number, top?, powerChord?, arpDir?, arpOctaves?, style?, strumMs? }, steps:N, hits:{step,dur}[] }`（dur=step数＝各音の長さを指定。旧 number[] も後方互換で受ける。`arpOctaves`＝arp駆け上がり幅 1〜4oct・既定1＝下方の後述決定を参照。`style`(keyboard/guitar)/`strumMs`＝ギター奏法＝下方 2026-07-22 決定を参照）
  - **mode**：strum＝各 hit で和音ブロック／arp＝各 hit で選択構成音を1つずつ巡回。
  - **voicing**：構成音(R/3/5/7 から選ぶ)・open/close・高さ(octave)。＝**スケッチ範囲（やりすぎてシーケンサーにしない）**。
  - resolve：各 hit の時刻のコードを取り、voicing で実音へ（strum=同時／arp=巡回）。
- **段階(CP)＝✅実装済(2026-06-23)**：CP1 進行を抽象化(音色固定GM49・選択不可) → CP2 chord_pattern kind＋`resolveChordPattern`(music.ts) → CP3 エディタ(ChordPatternEditor＝hitsグリッド＋長さツール＋voicing＋voicing MiniRoll) → CP4 `genChordPattern`＋/gen/section 配線 → CP5 compositeNotes で section 進行に解決(パート毎 program・複数可)。api/web 緑。

### WP-X3 新レーン3種（対旋律 counter／リフ riff／セクション楽器 section_inst）
正準相談メモ＝`docs/research/2026-07-14-wpx3-newlane-design-options.md`（§2「新kind追加の芋づる12-13箇所」チェックリスト・§8オーナー裁定＝1ネタ多声1レーン/伴奏先行/counter一級/案A反復）。生成の中身＝counter=`2026-07-14-countermelody-obbligato.md`／riff=`2026-07-14-riff-ostinato-design.md`／section_inst=`2026-07-14-horn-string-arranging.md`。
**レーン導出の注記（#14 補強）**：レーンは lane 列を持たず**子の kind から導出**（#14）。counter/riff/section_inst も一級 kind として `SECTION_LANES` に各1レーンを追加（chord_pattern の ord 2レーンハックは使わない＝1kind1レーン）。芋づるは §2 の12〜13箇所（kinds/theme/KindIcon/sectionLanes+LANE_COLOR+LANE_MIDI_NAME/MiniRoll/notesForContent/part分岐/useNetaEditor/KindEditorBody＋作成タイル/絞込）を全て手当てする（1つでも抜くと下流が黙って欠ける＝ede57f4の轍）。

**レーンの表示/演奏有効化（#14 続・2026-07-15・オーナー要望「全員がフルセット使わない」）**：表示既定＝**中身のあるレーン＋定番4（コード/メロ/ベース/ドラム）**・他の空レーンは畳み「＋レーン」から出す。手動 show/hide/mute は section content（`lanes_shown`/`lanes_hidden`/`lanes_muted`・自由形＝api変更なし）に保存。**レーン契約＝新kindは既定畳み＝kind増でも使わない人の画面は増えない**（トップ契約/ハブ契約と同族）。ミュートは再生合成（`audibleChildren`）のみに効き**MIDI書き出しは常に全部入り**（UIに明示）。`lanes_muted`未設定＝従来bit一致・骨格/仮歌のミュートとは「どれかがミュートならミュート」で合成。純関数=sectionContext.ts（`laneVisible`/`visibleLanes`/`audibleChildren`）。

- **`counter`（対旋律・WP-X3a・実装済）**＝主メロの「間ま」に入る従属の第2声（オブリガート）。**単音ライン＝melody 相乗り**（PianoRoll・notes 同型・`melodyPlacementShift` で旋法保持移調）。**MixPart `counter` を新設＝独立フェーダー**（既定0.75＝主メロを食わない）。既定音色 GM48(Strings)。
  - 生成 `genCounter(frame, melody, chords, seed, {density?})`＝**主メロ必須**（主メロのイベント列 rest/sustain/busy に依存＝外声ベース生成と決定的に違う）。ガードレール（機械は候補まで）：P0 主メロと同時発音の2度(半音/全音)禁止／P1 音域分離＝主メロの下3〜10度／P1 相補リズム＝主メロ busy 拍(1拍2onset以上)では鳴らさず rest/sustain 拍で動く／拍頭はコードトーン軸／反行優先／density で出し入れ(role 既定 or 明示)。決定的(seed)。
  - 配線：`/music/gen_counter`(http)＋`gen_counter`(mcp full)＋チャットは `weave target:"counter"`(旧 `fit`・2026-07-21 改名・既存 allowlist)。骨格の机④出口に「対旋律を作る▶」＝メロレーンの主メロを相手に生成→counterレーンへ置き `realized_from`(骨格) を張る（既存「メロを作る▶/ベ▶」の隣・同流儀）。

- **`riff`（リフ/オスティナート・WP-X3b・実装済）**＝歌でない反復核（ギター/シンセ/ピアノ/ゲームBGMの刻み）。**単音ライン＝melody 相乗り**（PianoRoll・notes 同型・`melodyPlacementShift`）。**part は chord に相乗り**（独立フェーダー不要）＝section の伴奏帯に混ぜる。
  - 生成 `genRiff(frame, chords, seed, {harmony?})`＝コード相手。**2部構造が基底**＝核 motif(1小節・3〜6音・コードトーン軸)＋反復/終止改変。**和声関係3類型を自動判定**：コード列のルートがペダル候補(I/V)と半音以内で近接なら indep(維持＝tonic ペダルで全小節同一音列)、そうでなければ follow(追従＝各コードのコードトーンへ度数写像)。ループ適性＝最終小節の末尾16分を空ける(継ぎ目)。決定的(seed)。
  - 配線：`/music/gen_riff`(http)＋`gen_riff`(mcp full)。gen_bass/gen_chord_pattern と同格＝チャット直露出はしない（full surface のみ）。

- **`section_inst`（セクション楽器＝管弦・WP-X3c・実装済）**＝ホーン隊/ストリングスの伴奏帯。**1ネタ多声・1レーン**（オーナー裁定＝声部別レーンにしない＝§3 crux 回避）。**chord_pattern の親戚**＝進行追従の多声ボイシング（content は `ChordPatternContent` 形＝strum/voicing/hits・web `resolveChordPattern` が実音化・エディタは `ChordPatternEditor` を共有）。**part は chord に相乗り**。GM音色は content.program。
  - 生成 `genSectionInst(frame, chords, seed, {role?})`＝コード相手・**伴奏先行**（pad/stab）。role=pad(持続和音で床＝ハーモニックリズム＝コード変わり目/小節頭にアタックし次の境界まで伸ばす・既定 Strings48)/stab(裏の8分を短く突く16分1個 staccato・Brass61)。ボイシングは close(密集)＝top 狙い音で最上声を決め下へ密に積む。旋律的セクションライン(counter の厚いやつ)はスコープ外(後続)。決定的(seed)。
  - 配線：`/music/gen_section_inst`(http)＋`gen_section_inst`(mcp full)。GM番号は 0-based 保持(§5-1・48=String Ensemble/61=Brass Section)。

#### 決定：ドッグフード評価(16小節6/8を組む)の指摘を修正（2026-07-04・サブエージェント辛口評価→A/B/C）
サブエージェントがPlaywrightで16小節6/8を実際に組み「部品は良いが組み上げ(尺・拍子)が未通」＝★3/5。以下を修正。
- **A. セクション尺を可変に(8→最大32)＋ネスト合成**：`SectionEditor` の `BARS=8` 固定が最大の壁（16小節が組めない）。小節ステッパー(`neta.bars`永続)＋配置済みcontentで自動伸長(切れない)。`childDur` が子section/songでBPB固定→**再帰で実長**に（ネスト配置が重ならない＝compositeNotesの位置オフセットは元々正しく、childDurの誤りが原因だった）。尺>10で横スクロール。
- **B. 拍子(6/8)対応**：`beatsPerBar` を music.ts に集約(SSOT)。`PianoRoll` に meter を渡し**小節線(拍子基準)＋複製単位**を拍子に。`useNetaEditor`(len初期化/bars保存/＋1小節)・`MetaPanel`(小節数表示)・`ChordEditor`(「1小節」ボタン/合計)の**4拍固定を全撤去**。6/8メロが「6小節」→正しく「8小節」に。
- **C. 配置の長さ整合＋ピッカーのコーパス氾濫**：ループ系(リズム/コード楽器)は配置時に**セクション末尾まで自動で敷き詰め**(`loopPositions`)＝melodyは8小節なのにrhythmだけ1小節、のムラを解消。ピッカーは**コーパス(library)を既定で隠す**(トグルで表示)＝自作ネタが埋もれない。web257緑・実機で6/8・16小節セクション成立を確認。
- **決定：ボイシング入力を「トップ狙い音」ベースへ（2026-07-04・オーナー発案／方向確定・エンジン先行）**：現状の R/3/5/7＋open/close＋octave は抽象パラメータで、一番audibleな**トップ声部（コンピングの旋律）を握れない**。→ **トップ声部の"狙い音"を人が決め、各コードでそれに最寄りのコードトーンを最高声部に採り、内声を下へ自動配置**（`voiceToTop` in music.ts・`ChordVoicing.top?`）。旨み＝レジスタが一定に保たれ**進行間の声部進行が自動で滑らか**（backlog「compingの声部進行最適化」を回収）。**トップは絶対採用**（調/コードが変わってもコンピングの音域は動かさない＝物理レジスタ。相対は将来トグル）。**"できるか"問題＝進行非依存で成立**：トップ＝絶対の狙い音（メロ実体でなく音域の磁石）だから、どの進行に乗せても各コードで最寄りトーンをトップに採るだけ。同距離時の優先やベース分離は「そこまでやるなら DAW」で割り切り（再生は多少雑でOK＝オーナー了承）。ベースはベースパートに任せる方針。**✅実装完了(2026-07-04・web249緑)**：①エンジン(構成音の手選択を撤去＝鳴る音はコード質から自動導出・`voiceToTop`／`powerChord`でR+5間引き／`arpDir`で向き＝当初は音域=voicing継承・別指定なし〈→**2026-07-13 の `arpOctaves`/`arpReset` 決定で「駆け上がり幅×区切り」を追加＝この記述は更新済**〉) ②エディタ再構成(ChordPatternEditorを2ゾーン＝「いつ弾く」grid主役＋長さ＋小節／「響き」＝打ち方・トップ狙い・広がり・高さ・パワーコード・arp時は向き を1枠に集約) ③トップ狙い(top)をステッパーで配線・プレビューは常にtop込み。青の壁は解体(二択セグメント/トグルはコード色/±無彩色)。音の長さは既存どおり各hitのdur(長さツール+付点)で保持。候補プレビュー化は後段。
- **決定：arp の「駆け上がり幅」＝複数オクターブ span（2026-07-13・オーナーFB「ハープの駆け上がりみたいなのを作りたい／今のarpは幅が小さい」）**：現状 arp は `voiced`（voicing の3〜4音＝約1オクターブ内、open でも約1.5oct）だけを `arpStep` で巡回するため、**ハープのグリッサンド（複数オクターブを一気に駆け上がる）が原理的に出せない**。→ **`ChordVoicing.arpOctaves?:number`（駆け上がり幅・1〜4oct）を追加**。arp 時のみ、voiced を**下方向へ** arpOctaves ぶん積み増した拡張プール（`voiced ∪ voiced−12 ∪ … ∪ voiced−12*(n−1)` を昇順ソート）を `arpStep` が巡回する。**下方向に伸ばす**理由＝「トップ声部は絶対の磁石」（上の 2026-07-04 決定）を保ち、天井(top)を動かさず下から駆け上がる／up=低→top・down=top→低・updown=ピンポン。**既定 undefined=1oct＝拡張プール＝voiced そのもの＝bit一致**（既存 arp 出力不変）。strum は無関係（arpOctaves 無視）。速さ/音数は既存の hits グリッド（16分）が担う＝span×密度でハープ run になる。スコープ＝**1本のノブ**（「やりすぎてシーケンサーにしない」原則内＝グリッサンドは正当な音楽プリミティブ）。**✅実装(2026-07-13・web `music.ts` resolveChordPattern＋`ChordVoicing.arpOctaves`＋ChordPatternEditor「駆け上がり幅」＝arp時のみ表示・TDD)**。解決は web `music.ts` 一本（api は生成 genChordPattern のみ・実音化しない）ゆえ変更は web に閉じる。
  - **追補：arp の「区切り」＝`ChordVoicing.arpReset?`（拍・2026-07-13 同オーナーFB「前半/後半で違う＝要は1.5拍ごとに低音から駆け上がる」）**：連続巡回(pool を延々辿る)だと登り切りが 1.5拍等の拍節に揃わない。→ **arpReset 拍ごとに arpIdx を pool 頭(低音)へ戻す**（`grp=floor(start/arpReset)` が変わったらリセット）＝「N拍ごとに下から駆け上がり直す」。既定/0＝区切りなし＝連続巡回＝**bit一致**。span(arpOctaves)×区切り(arpReset)×密度(hits)の3つで、フルグリッサンド〜拍節グリッサンド〜通常アルペジオを制御。これ以上（各stepの音を手指定）は「シーケンサー化しない」原則で**やらない**（アルペジエーターとして別実装する道は backlog）。ChordPatternEditor「区切り」select（なし/0.5/1/1.5/2/3/1小節）。TDD＝区切りで各窓が pool 頭から/既定bit一致。
  - **音色：全GM選択（2026-07-13 同オーナーFB「簡易の他に GM 全部・GS 不要」）** → `GM_ALL_FAMILIES`（GM標準16家族×8＝128）を追加、MetaPanel の音色 select を **optgroup「よく使う」(簡易14)＋家族別128** に。value=GM program。再生音は SF2(General MIDI)依存＝未収録音は簡易シンセ代替になりうる。GS バンク変種は非対象。
- **決定：ギター系奏法＝`voicing.style` と弦順ロール（2026-07-22・正典＝`docs/research/2026-07-22-guitar-comping-vocabulary.md`／`2026-07-22-accompaniment-style-engines.md`）**：現状の voicing は鍵盤的クローズド積み（`voiceToTop`＝トップ狙い＋直下に密積み）で、GM ギター音色で鳴らしても「ピアノ和音をギター音色で鳴らした」感になる（研究doc §0-1.3）。二層設計（パターン＝データ＝度数抽象／変換＝純関数＝レンダ層）を保ったまま、**変換層に楽器モードを足す**。
  - **`ChordVoicing.style?: "keyboard" | "guitar"`（既定 keyboard）**：`"keyboard"`＝現行 `voiceToTop`（不変）。`"guitar"`＝新設純関数 `voiceGuitar`＝**E-shape バレーの度数分布**（弦6→1 = R 5 R 3 5 R・研究doc §1.2 の F 例 41,48,53,57,60,65 と一致）を土台に、①**最低声＝根音**、②**3度は1個・中〜高域**、③**根音/5度をオクターブ重複**、④弦チューニング由来の 4度/3度飛び、を満たす。7th/6th 等の色音は各1個を中高域へ挿し、声数が 6 を超えたら高5度→中根音の順に間引く（研究doc §1.2 の省略定石）。パワーコードは R+5(+R') のみ（既存 `powerChord` を尊重＝3度抜き）。トップ声部は `top`（既定72）最寄りのオクターブへ全体を平行移動（＝keyboard 同様「top は磁石」の一貫性）。
  - **`ChordVoicing.strumMs?: number`（既定 0・ms/弦）＋弦順ロール**：`style:"guitar"` かつ `mode:"strum"` かつ `strumMs>0` かつ**テンポ既知**のとき、和音内の各声を弦順（ダウン=低→高）に `strumMs` ずつ**決定的に**ずらす（研究doc §3）。ms→拍換算にテンポが要る＝`resolveChordPattern(content, chords, key, tempo?)` に tempo 引数を追加し、**レンダ境界でテンポが既知の場所（`buildPlayback`→`notesForContent`/`compositeNotes`→resolve）から流す**（`applyFeel` の tempo 結線と同じ流儀）。オフセット = `idx * strumMs * tempo / 60000` 拍（単調増加）。分数コードのオンベースは最低声＝idx0（最初）に置く。**今回はダウンのみ＝時差だけ**（vel／アップの声数間引き／ゴーストは今回やらない＝研究doc §6-4 のダウン相場に留める）。
  - **feel 層との線引き（研究doc §0・監査 `2026-07-11-swing-feel-layer-audit.md`）**：弦順ロールは resolve 時の**決定的**オフセット（seed 非依存・奏法の一部）。feel（swing/humanize＝乱数タイミング）は従来どおり**後段**（`applyFeelEnsemble` at レンダ境界）で notes 集合に一様適用＝**二重適用しない**。合成順＝`voiceGuitar`（声の選定）→ 弦順ロール（決定的時差）→ feel（乱数揺れ）。
  - **bit一致の約束**：`style` 未指定=keyboard・`strumMs` 未指定=0 で**既存出力と完全一致**（arpOctaves/arpReset と同じ「ノブ既定0でOFF」流儀）。roll は `style:"guitar" && strumMs>0 && tempo` の全条件成立時のみ発火＝新パラメータ既定では resolve の strum 分岐が旧コードパス（voiced を昇順 push→オンベース末尾追加）を**バイト単位で**通る。tempo を渡さない/未対応（プレビュー用 compositeNotes 呼び等）は roll 無し＝ストレート同時発音（bit一致）。
  - **MCP 露出（スライスB）**：`genChordPattern` は HTTP 専用だったのを `gen_chord_pattern` MCP ツールに露出（`gen_bass` 等の registerTool 慣行）。生成は voicing の既定値として `style`/`strumMs` を content に載せるだけ＝**実音化は web 側**という現行分業を維持（api は実音化しない）。既定（未指定）は content に style/strumMs キーを生やさない＝genChordPattern の既存出力と deepStrictEqual 一致。
  - **要耳較正（design 明記・後段でオーナー試聴）**：①`voiceGuitar` の register（top 磁石で 2oct 上下・GM ギターで妥当か）②7th/6th 色音の配置と 6声 cap の間引き順③`open` は guitar では現状 no-op（ギターは元来オープン＝二重に広げない判断）④`strumMs` の相場（10ms/弦＝研究doc §3.2・バラードは 20〜35ms）。今回はスコープ①voiceGuitar ②弦順ロールまで＝ストラム型プリセット/arp型ギター/カッティング（研究doc §2,4,5）は後段。
- **決定：奏法UI＝三層のスライスA/B/D（2026-07-22・正典モック＝`docs/research/2026-07-22-performance-ui-mock.html`・設計＝`docs/research/2026-07-22-performance-ui-design-options.md`）**：上の `voicing.style`/`strumMs`（S1）とベース×ドラムノブ（実装済・UI未露出）を画面へ出す。**A=音色連動の既定（ゼロ操作）／B=CPエディタ第4行の微調整／D=ベース引き出しの「細かく」群**（C=聴いて選ぶトレイは S2 型辞書完成後の別スライス）。
  - **`voicing.style` に `"auto"` を追加（既定の意味論）**：`"auto"`＝**レンダ時に program の GM ファミリから奏法を導出**（guitar 系 24–31→`guitar`／それ以外→`keyboard`）。auto の解決は実音化層＝`resolveChordPattern(content, chords, key, tempo?, program?)` に **program 引数**を最小結線で足す（tempo 結線と同じ流儀＝`notesForContent`/`compositeNotes`/`buildPlayback` がレンダ境界で program を渡す。`compositeNotes` は per-part の `programOf(content)` を、単体 `buildPlayback` は `programOf(neta.content)` を、`MiniRoll` は `programOf(neta.content)` を渡す）。パッド系の白玉化等は今回スコープ外＝ボイシングのみ。
  - **bit一致の約束（最重要）**：`style` **未指定＝keyboard＝従来と完全一致**（既存ネタ全部・1音も変えない）。auto の分岐は `v.style === "auto"` の時だけ発火し、解決後は `"keyboard"` or `"guitar"` として既存 `voiceChord`/roll 経路を**バイト単位で**通る（`"keyboard"` は `v.style==="guitar"` 分岐を外し `voiceToTop` へ＝undefined と同一出力）。program を渡しても style 無しなら resolve は不変。
  - **新規 chord_pattern ネタの UI 既定＝auto**：`emptyChordPattern()`（新規作成経路）の voicing 既定に `style:"auto"` を載せる＝新規ネタは「楽器を選べばその楽器らしく鳴る」。既存ネタ（style 無し）は触らない。
  - **strumMs の UI 段階（じゃら〜ん）**：OFF/弱/中/強＝**0/8/14/25 ms**（S1 の相場＝研究doc §3.2 の 10ms 前後＋バラード寄りの中〜強・**要耳較正**）。
  - **スライスA（MetaPanel「奏法」二段）**：音色 select 直下に **chord_pattern の時だけ**「奏法」select を条件出現（「歌声→声」二段と同型）。選択肢は音色ファミリで出し分け（モックA準拠）だが、**今回実際に効くのは style(auto/keyboard/guitar)×mode(strum/arp)×strumMs に写像できる項目だけ**＝おまかせ(auto)/ストローク(guitar+strum+strumMs)/アルペジオ(mode:arp)/鍵盤風に弾く(keyboard)。**写像できない項目は選択肢から外す**（白玉＝リズム hits・コンピング/カッティング＝S2 型辞書＝chord_pattern の pattern 型ID待ち）。保存先＝content（voicing.style/strumMs＋mode）。
  - **スライスB（ChordPatternEditor 第4行）**：響きゾーンに「奏法」行を追加＝奏法 seg（おまかせ/鍵盤/ギター＝auto/keyboard/guitar）＋**ギター解決時のみ**「じゃら〜ん」seg（OFF/弱/中/強＝strumMs 0/8/14/25）。**CP行契約をコード内コメントで明文化**（TinkerSheet ハブ契約と同文体）：「**響きゾーンは最大4行・超過は畳み（群アコーディオン）へ沈める**」。触った瞬間の previewNote は既存挙動（voicing が変わるので自然に反映）。
  - **スライスD（TinkerSheet ベース引き出し「細かく」群）**：ベース引き出しに群アコーディオンを追加＝キックに噛む(kickLock OFF/弱0.6/強0.8/逆相-0.6)・2・4で抜く(snareGap OFF/弱0.4/強0.8)・接近音(approach OFF/たまに0.3/よく0.6)・分数の低音(slashBass OFF/ON)。**前面のchip6/seg1行契約は不変＝全部この畳みの中**。`useMelodyGen.genPart` の bass payload に結線（0/false/未送信＝従来 bit 一致・http.ts は kickLock/snareGap/approach/slashBass 透過済み）。ドラム未生成時に kickLock 系が効かない旨は **disabled でなく hint 文言**（モックD準拠）。既存の「細かく（型直指定）」群とは別の畳み（id 衝突回避＝`bassdrumfine`「細かく（ドラム絡み・分数）」）。
- **決定：伴奏パターン型辞書（chordLibrary・S2・2026-07-22・正典＝`docs/research/2026-07-22-piano-comping-vocabulary.md`（鍵盤13型）／`2026-07-22-guitar-comping-vocabulary.md`（ギターストラム15型）／`2026-07-22-accompaniment-style-engines.md`（パターン=データ/変換=純関数の骨格））**：現状 `genChordPattern` は mood/tempo で per（小節頭/8分/拍頭）を選ぶ3段階のみ＝ジャンル定型（シティポップの裏食い・4つ打ちの裏スタブ・ギターのフォークストローク/カッティング等）を出せない。`gen_bass` の style（bassLibrary・WP-B1）と**同流儀**＝**型は純データ辞書 `music/chordLibrary.ts`（不変知識・生成器から分離）・組み立ては生成器・実音化は web resolveChordPattern**（二層）。
  - **型＝(16分グリッド×vel層, テンポ域, mode, style, roles) の純データ**。RHテキスト譜（`. - A > o D d U x` の16トークン＝休符/hold/normal打/アクセント(112)/弱打(64)/ギターダウン/アクセントダウン(112)/アップ(78)/ゴースト(40)）を `parseCompRh` でセル化し、`compHitsForBar` が `hits{step,dur,vel?}` へ（**dur=1+直後 hold 数**＝白玉は伸び staccato は dur1・ghost は常に dur1）。vel は 3値語彙（web `CHORD_ACCENT=112`/`CHORD_SOFT=64`）＋guitar 相場（`CHORD_UP=78`/`CHORD_GHOST=40`＝**要耳較正**）で、normal(100) は vel を書かない（下流 `vel??100` と一致）。
  - **収録26型**（ID＝bassLibrary 流のジャンル接頭）：鍵盤13＝`PB-WHOLE`（バラード白玉）/`PB-ARP8`/`PB-ARP16`（arp）/`PR-8TH`/`PR-SUS`（ロック）/`CP-SYNC16`（シティポップ裏食い）/`CP-16CUT`（16カッティング・open）/`DN-OFFBEAT`（4つ打ち裏スタブ）/`DN-ANTICIP`（ハウス前借り）/`AN-VERSE`（アニソン8分）/`AN-CHORUS`（arp 16密）/`GS-STRIDE`（ゴスペル boom-chuck）/`JZ-CHARL`（チャールストン）。ギター13＝`GT-DOWN4`/`GT-DOWN8`/`GT-DU8`/`GT-FOLK8`（D-DU-UDU）/`GT-BALLAD`/`GT-DOWN16`/`GT-DU16`/`GT-POP16`/`GT-FUNK16`（チキンスクラッチ）/`GT-FUNKSYNC`（Nile型）/`GT-SKANK`（レゲエ裏拍）/`GT-POWER16`（powerChord）/`GT-BACKBEAT`。研究doc①13型は全収録・②はストラム型のうち16分格子化できる13型（3連シャッフル §2#12・分散§2#13＝arpへ吸収 は除外＝後段）。
  - **選択規則（genBass style と同一）**：`opts.pattern` が型ID（例 `PB-WHOLE`/`GT-FOLK8`）なら当該型を確定（seed 不問で固定格子）。ジャンル名（`ballad`/`rock`/`citypop`/`dance`/`anison`/`gospel`/`jazz`/`folk`/`funk`/`reggae`/`pop`/`metal`＋エイリアス edm/house→dance・disco→funk 等）なら `GENRE_TABLE`＋`frame.section.role` で候補を絞り、**テンポ域が合う型のみ適格**（域内皆無なら型を選ばず従来経路へ fallback）＝seed で1つ選ぶ（`pickCompType`・決定的）。**4/4系のみ**（型は全て16セル4/4格子・`grouping==="compound"`(6/8) や非4拍(3/4 等)は対象外＝従来）。選んだ型から content の mode/voicing(open/close・style・strumMs・powerChord)/steps/hits を組み立てる。
  - **左手(LH)の留保（S3 待ち・重要）**：型は LH レーン（土台＝ルート/5度の度数譜）を**データとして収録**（`lh?`/`lhPattern?`・`parseCompLh`）するが、**今回は配線しない**＝hits 化は RH/ストラム面のみ。理由＝chord_pattern content に左手フィールド（`bassVoicing`/`bassHits` 等）を足すか別ベーストラックに任せるかは**設計判断がオーナー裁定待ち**（研究doc①§6-2）。データ形式に温存し将来スライスで実音化する。
  - **ギター D/U の写像（今回）**：ダウン/アップ記号は **vel アクセント（ダウン強＝100/112・アップ弱＝78）へ写像**して収録。声部進行方向 `dir?`（D/U）はセルに温存するが `genChordPattern` は使わない（アップの声数間引き・ゴーストの音色差＝研究doc②§3.3/§4 は将来スライス）。
  - **bit一致の約束**：`opts.pattern` 未指定/未解決(未知ID・未知ジャンル)/6-8系/非4拍は**型経路に入らず従来の per 3段階へ**＝既存 `genChordPattern` 出力と deepStrictEqual 一致（`gen-chord-library.test.ts` (a) で多 frame×seed を機械証明）。型経路は voicing に guitar のみ style/strumMs を載せ（鍵盤型は style キーを生やさない）＝`gen_bass` style の流儀を踏襲。
  - **結線**：MCP `gen_chord_pattern`（`pattern` ノブ追加・describe に型ID/ジャンル例を列挙）・HTTP 同ルート（`b.pattern` 透過）。生成は content 組み立てまで＝**実音化は web resolveChordPattern**（api は実音化しない・現行分業）。web 側変更不要（content の contract は `mode/voicing/steps/hits` のまま＝vel? は既存 `ChordHit` が既に持つ）。
  - **要耳較正（後段でオーナー試聴）**：①ギター vel 相場（アップ78/ゴースト40＝研究doc②§3.5/§4 の相場・実測でなく定石）②各型の RH の音楽的当否（特に funk `GT-FUNK16`/`GT-FUNKSYNC` の実コード配置・`JZ-CHARL` の dur）③ジャンル→型の候補割当と tempo 域の境界④`CP-16CUT` の open(drop2) 既定⑤ゴーストを「短dur+極弱vel の実コード近似」で鳴らす是非（GM にピッチレス手段が無い＝研究doc②§4）。今回はスコープ＝辞書収録＋RH/ストラム面の hits 化＋pattern ノブまで。LH 実音化・アップ声数間引き・カッティング音色は後段。
- **決定：ピアノ左手(LH)内蔵＋ギター D/U（S3・2026-07-22・オーナーFB「ストラムのダウンアップが無い」「ピアノ系の左手」＋裁定「左手＝コード楽器ネタに内蔵」・正典＝`docs/research/2026-07-22-piano-comping-vocabulary.md`§2/§5・`docs/research/2026-07-22-guitar-comping-vocabulary.md`§3・モック `2026-07-22-performance-ui-mock.html` Bタブ）**：S2 で LH は data-only 留保・D/U は vel 写像だった（上の S2 決定）。S3 でその留保を解く＝**LH をコード楽器ネタに内蔵**し（別ベーストラックに出さない＝裁定）、**D/U を dir で実音化**する。二層設計は不変（型＝データ／実音化＝web `resolveChordPattern`）。
  - **contract①＝`ChordPatternContent.lh?: { mode:"root"|"root5"|"oct"|"custom"; hits?:{step,dur,deg?,vel?}[] }`**。`lh` 未定義＝左手なし＝**既存全ネタと bit 一致**（新規キー＝OFF で不変）。preset（root/root5/oct）＝リズムを持たず**RH の小節頭(16step 境界)＋コードチェンジを anchor に白玉**（保守的既定）。custom＝`hits` を度数解決してそのまま（辞書由来）。
  - **contract②＝`ChordHit.dir?: "D"|"U"`**（additive・未指定＝従来）。`dir` を**書かない限り bit 一致**。
  - **LH レンダ規則（`resolveChordPattern`・keyboard 解決時のみ）**：`resolveAutoStyle` 後の style が **keyboard のときだけ** `content.lh` を実音化（guitar は無視＝ギターに左手レーンは無い＝矛盾なし）。音域窓＝**C2–C3（MIDI 36–48）**・ルートは最下オクターブ `lhBand(pc)=36+(pc mod 12)`（研究doc§2-1）。preset＝root:`{R}`／root5:`{R, R+P5}`／oct:`{R, R+oct}`（研究doc§2-3 の `oct(R+R)`＝**静的オクターブ二重＝保守的既定**。8分オクターブ交互/R10 は将来スライス・**要耳較正**）。custom＝`deg` を `degreeInterval(deg,quality)` で解決し `lhBand(root)+interval`。**low interval limit ガード**（研究doc§2-2）＝色音(3/7 等・非R/5/8)が C3(48)未満なら 1oct 上げる（R/5/8＝5度・オクターブは低域でも濁らない＝素通し）。**vel＝左手やや強め `LH_VEL=106`**（研究doc§5-1・RH 既定100 より上・**要耳較正**）。LH は strum ロール（弦順時差）対象外＝白玉のまま。
  - **D/U レンダ規則（guitar×strum のみ）**：`v.style==="guitar"` かつ strum の hit で **`dir==="U"` のとき＝アップストローク**＝①声を**高→低**に並べ**上位最大4声のみ**（低音弦=根音を落とす・研究doc§3.3）②**vel×0.78**（`GUITAR_UP_VEL`・ダウン基準の相場・研究doc§3.5）③ロール発火時は**弦時差×0.75**（`GUITAR_UP_ROLL`＝手返しが速い・研究doc§3.5）。`dir==="D"` or 未指定＝**現行 S1 挙動を素通し**（低→高・全声・オンベース最下・ロール既存経路）＝`dir` を書かない限り既存出力と**deepStrictEqual 一致**。**自動既定（表D裏U）はレンダで適用しない**＝既存ネタの音を変えないため。**UI が新規打点時に dir を明示で書く**（下記）。
  - **D/U vel の二重適用回避（S2 との整合・重要）**：S2 は U を `CHORD_UP=78` の vel へ写像していたが、S3 で dir が実音化を担うと**vel×0.78 の二重掛け**になる（78×0.78）。→ **`parseCompRh` の plain `U` を dir-only（vel を焼かない）に変更**し、softness は render の `dir==="U"→×0.78` に**一元化**。これで UI の D↔U トグル（vel 未指定/明示によらず U は必ず 0.78×で軟らかくなる）が正しく効く。アクセントダウン `d`(112)・`>`/`o` は vel を保持（up/down 軟硬とは直交）。
  - **S2 辞書配線**：`genChordPattern` 型経路で①keyboard 型に `lh` データがあれば `content.lh={mode:"custom", hits: compLhHitsForBar×小節}` を出す（`parseCompLh` 済みを度数 hits 化）②`compHitsForBar` が `CompCell.dir` を hit の `dir` へ透過（ギター型が D/U で鳴る）。**guitar 型は lh を出さない**（ギターに左手なし）。pattern 未指定/従来経路は lh/dir を触らない＝**bit 一致**。
  - **新規ネタ既定**：`emptyChordPattern()` に `lh:{mode:"root"}` を追加（`style:"auto"` と同じ「新規のみ」原則＝既存ネタ不変）。ギター音色なら style 解決で guitar になり lh は鳴らない＝矛盾なし。
  - **UI（`ChordPatternEditor`・モックB準拠）**：①**左手行**（seg OFF/ルート/ルート＋5度/オクターブ＝lh.mode）＝**keyboard 解決時のみ**表示。OFF＝lh キー削除。custom（辞書由来）は seg 非選択＋「型」表示（最小表現）。②**D/U ストリップ**（グリッド下）＝**guitar 解決時のみ**表示。hit のあるセルに表示（`dir` あり＝実線／`dir` 無し＝自動既定 `step%beatStep===0?D:U` を薄く）・タップで dir を明示反転。③**新規打点**が guitar 解決なら placed hit に `dir=自動既定` を書く（表D裏U を可聴化＝既存ネタは触らないので不変）。**CP行契約を「響きゾーンは最大5行」に更新**（打ち方/トップ・広がり/高さ・パワー/奏法/左手＝keyboard 時最大5行・超過は群アコーディオンへ沈める）。
  - **bit一致の約束**：`lh` 未定義＋`dir` 未定義＝既存 `resolveChordPattern`/`genChordPattern` 出力と**deepStrictEqual 一致**（style有無×program有無×従来 per3段階を横断で機械証明）。`dir==="D"` は未指定と同一経路。guitar 解決は lh を無視。
  - **スコープ外（今回送り）**：ゴースト音色差（S2 の x セルは vel40 近似で据置）／LH の 8分オクターブ交互・R10・boom-chuck リズム（preset は白玉のみ）／アップの声数を 3 に絞る等の精緻化／per-section LH。**要耳較正**＝①LH oct の静的二重 vs 交互②`LH_VEL=106`③U の上位4声 cap④U ロール×0.75。
- **決定：伴奏パターンを「聴いて選ぶ」トレイ（スライスC・2026-07-22・正典モック＝`docs/research/2026-07-22-performance-ui-mock.html` Cタブ・研究doc①②③）**：S2 型辞書（chordLibrary 26型）を**名前で選ばせない**＝ジャンルchipで絞り耳で選ぶ。`gen_bass` style／`gen_drums` style（ジャンルchip前面・型直指定は「細かく」に沈める）と**同構造**。「候補まで機械・選ぶのは人間」の主動線に、伴奏パターンを載せる。
  - **api：候補を複数返す（`genChordPattern` に `variety?:number`＝既定1）**：`opts.variety>=2` かつ `pattern` が **ジャンル名/おまかせ**（＝`compTypeById` で解決しない）かつ 4/4系のとき、`pickCompTypes(genre, role, tempo, seed, n)` が**別々の型（distinct id）**を最大 n 件返し、既存 `GenResult.items`（配列契約）へ複数 item として載せる。各 item の `label`＝**型の日本語（型ID＋場面タグ `scenes`）**（単数経路の "コード楽器" とは別＝カードに型名/説明を出す）。**variety 未指定/1＝従来の単数経路（`compTypeById ?? pickCompType`）＝deepStrictEqual bit 一致**（多 frame×seed を機械証明）。型ID直指定＋variety>=2 は多分岐をスキップ（`compTypeById` が真）＝単数固定型 1件。
  - **`pickCompTypes` の候補母集団**：ジャンル名＝`GENRE_TABLE[genre]` の**全役割の型IDを union**（`role` 指定時はその役割の型を先頭に優先）→ distinct → **tempo 域で絞る**→ seed 起点の回転で最大 n 件（決定的）。おまかせ（`omakase`/`any`/`all`）＝**全 `COMP_TYPES` を role 適用可否（`CompType.roles`）＋tempo で絞る**（role/tempo 全体から）。`pickCompType`（単数）は不変＝bit 経路を汚さない。
  - **【E2E所見修正・2026-07-22】tempo 域内皆無＝空にしない**：当初「域内皆無＝空＝従来経路 fallback」だったが、実機E2Eで **section 既定 tempo120 のとき ballad(max95)/citypop(max115) が全滅→汎用1件に落ち「聴いて選ぶ」が成立しない**と判明。→ pickCompTypes は域内皆無のとき**ジャンル語彙をテンポ距離の近い順で提示**（安定ソート・同距離は元優先順・型は敷けば鳴る＝**要耳較正**）。単数経路 pickCompType（style ノブ）は従来どおり厳格（域外 null）＝不変。あわせて GENRE_TABLE 補充＝ballad に GT-BALLAD（弾き語り）・rock に genre:"rock" なのに表から漏れていたギター型（GT-DOWN4/8/16・GT-BACKBEAT）＝鍵盤/ギター混成の候補に。
  - **web：タイル判断＝【新パーツのタイル+1】（コード楽器タイルを追加）**：現状 `genPart` が扱うのは `GEN_PARTS`＝メロ/ベース/ドラム/リフ/管弦/コード（＝`gen_chords`＝chord_**progression**＝抽象・無音）で、**コード楽器（chord_pattern＝伴奏の実体）の生成導線はハブに無かった**（TILES の「コード」タイルは進行＝chord_progression）。→ ハブ契約の「新パーツのタイル+1」でハブに**「コード楽器」タイルを追加**（タイル増はこの1枚のみ）。引き出し＝ジャンルchip（おまかせ/バラード/ロック/シティポップ/4つ打ち/フォーク＝chordLibrary の genre と対応・おまかせ=omakase 番兵）＋候補生成ボタン。**型ID直指定は「細かく」群（select）に沈める**（前面 chip6±1 契約内）。
  - **web：候補トレイ動線＝既存を流用**：ジャンルchip→`genPart({op:"gen_chord_pattern"})` が `pattern`（=compStyle or `omakase`）＋`variety=4` を送り、返る複数 item を**既存の候補トレイ**（cand-card＋`auditionCandidate`＋採用）へ全件積む（先頭は kind 差替・以降 append）。候補は `label`（型名/説明）を持ち cand-meta に表示。
  - **試聴＝セクションの進行＋テンポ＋音色で実音化**：`auditionCandidate`／候補カード MiniRoll は chord_pattern のとき `notesForContent(kind, content, { key, chords: sectionChords, tempo, program })`＝既存 `resolveChordPattern` 経路（進行に当てる二層）を通す（従来は ctx 無し＝空進行で無音だった）。採用＝既存 `placeCandidate`（CoW ガード＋巻き込み確認）に従う。
  - **bit一致の約束**：`variety` 未指定/1＝単数経路＝S2/S3 既存出力と deepStrictEqual 一致（`gen-chord-library.test.ts` (g) で証明）。web は chord_pattern 以外の候補経路（メロ/ベース等）を触らない＝送信 payload 不変。
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
- **`role:` 名前空間タグ（セクション役割・2026-07-10）**：section ネタの構造上の役割（`role:verse`/`role:chorus` 等）も `prj:` と同じく**タグの名前空間で持つ**（Neta スキーマ変更なし＝design 原則「スキーマ変更は高い」）。生成時 `frame.section.role` の SSOT。prev/next 役割は保存せず song の children position 順から導出。詳細は #12-M「セクション役割の一級化」。

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
    - **セクション役割の受け渡し（2026-07-10）**：`genPart()` は Section ネタ tags の `role:` を読み `frame.section.role` として gen_melody body に載せる（tags に role 無し＝渡さない＝従来）。役割別プリセット（density/register 等）が自動で効く。ロール入力 UI・prev/next 導出は後続タスク（#12-M「セクション役割の一級化」参照）。
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

#### 決定：コーパス素材の契約＝メロ句の位相・進行の正規化（R0・2026-07-14）
`docs/research/2026-07-14-corpus-db-diagnosis.md`（R0）の実測で「解析済コーパスがごみ化」を確定 → 再構築の契約を正典化。素材（辞書）は生成の候補源＝**正しく正規化された統計**でなければ拍が食う。
- **メロ句の位相アンカー（pop・根因確定＝scenario b）**：`firstDownbeatFromBeats` の**アンカー修正自体は 2026-06-26 に実装・コミット済**だが、**別バグが残存**していた＝POP909 `beat_midi.txt` の**行index を「MIDI拍」と同一視**していた（`anchor=行index`）。実データは **1列目=秒・3列目=downbeatフラグ**（README の2列記述は古い＝実ファイルは3列）。**注釈の拍は MIDI の tick/division 拍に整数対応しない**（曲頭オフセット＋表情テンポ）＝行index直流用で位相が **0.25/0.75 に散る**（拍0オンセット被覆 54%）。**正しい契約**＝R0§5：①MIDI **テンポマップ**で note tick→秒 ②注釈 beat 秒列へ**線形内挿**して「注釈拍座標」へ写像（この座標では downbeat が整数拍＝行index に乗る）③その座標で `segmentByBars(anchor=firstDownbeat行index)`。実測で**拍0被覆 54%→93%**（irish/game は元から健全＝経路不変）。
- **メロ句のメタ明示保存**：`key=0`（**C正規化済みの明示**＝旧 NULL を廃止）・`bars=4`（句の小節数）・content に `phase_ok`（拍0近傍オンセット有）・`pickup`（弱起量）。**phase_ok を満たさない句は辞書に入れない**（メトリック健全ゲート・R0§6.2(A)）。
- **進行コーパスの正規化（在DB・U-FRET生データは消失＝再ingest不能）**：①**断片ゲート length≥3**（≤2和音の自明バンプを排除）②**品質語彙の正準化**（`maj→""`・`min→m`＝`music-core.canonicalQuality`＋major三和音は`""`へ集約）③**正規化後 dedup＋count**（完全重複を1本へ畳み `content.count` に出現数）④**長短分裂の統合**＝six-based（`de Clercq 2021`）署名でループ毎独立キー判定による平行長短の割れを畳む。**新規テーブル化（R0§6.2 の phrase_pattern/chord_progression_pattern/遷移統計 B・D）は残タスク**＝今回は既存 `neta`（key/bars/content）で契約を満たし、遷移統計は将来の個人コーパスと合流（backlog）。
- 実装：`music/midi.ts`（テンポ抽出＋`makeTickToSeconds`）・`music/phrase.ts`（`beatTimesFromBeats`/`remapToBeatGrid`/`phraseHasDownbeatOnset`）・`scripts/build-phrase-dict.ts`（popのみ改修）・`scripts/normalize-progressions.ts`（在DB正規化）。TDD＋再構築後に R0 の測定法で before/after を数値検証。

#### 決定：ピッカー Phase2＝おすすめ（コーパス推薦）を実装（#20・2026-07-04）
上記Cの「推薦経由」を実装。**軸（ユーザー選定＝軽い方式）**：拍子一致 → 調が近い順（五度圏）→ ばらけ（idハッシュで擬似シャッフル・決定的）→ 上位K(既定6)。
- **サーバ側で top-K**：`GET /neta/recommend?kind&meter&key&top` → `core.listNeta({scope:"library",kind})` を `rankRecommendations`（純関数・`music/recommend.ts`）でランク＆キャップ。生1781を web に流さない（design原則「関連数件だけ返す」を経路として実装）。
- **対象は melody / chord_progression のみ**（コーパスはこの2種だけ・bass/rhythm/chord_pattern は無し）。ピッカーの種別タブに応じて `corpusKindFor(lane)` で決定、無い種別は strip 非表示。
- **実測の含意**：コーパスのメロは**全て keyless（C基準断片）**＝調ランクは中立に落ち、実質「拍子一致＋ばらけ」で数件。進行は調付きもあるので調ランクが効く。
- **UI**：ピッカーの「＋新規作成」の下に**おすすめ（コーパス）＝横スクロールの小さな概形タイル**（自作リストは縦・視覚的に分離）。tap＝`placeAt`（library→project にコピーして配置＝元コーパスを汚さない・既存導線）。
- **残（Phase3・任意）**：文脈適合ランク（section にコードがあればコード適合度でメロを、メロがあれば相性で進行を）＝より musical な推薦。今回は「軽い」方式で確定。
- api428緑（recommend純関数4＋http1）・web263緑。実機E2E：メロ=6件/リズム=0件（コーパス無し種別は非表示）/コード進行=6件、console error 0。

#### 決定：コーパス遷移統計テーブル 第2弾＝進行遷移(D)と句辞書(A)（#21 拡張・設計 2026-07-21）
正典＝research `2026-07-14-corpus-db-diagnosis.md` §6.2(A)(C)(D)/§6.3 ＋ `2026-07-14-corpus-rebuild-verification.md`。#21(WP-0) が対象外にした **(C/D) chord_transition** の設計。#21 の思想（機械は候補まで／リテラル非保存＝統計・度数・相対のみ／既定生成は無変更・既定OFFで bit 一致）を継承。**番号は #21 拡張**（#27 は「再生経路一本化」で使用済のため付けない）。
> **⚠️著作権の線（2026-07-21確定・CLAUDE.md「他者コーパスからは統計のみ抽出＝リテラルな旋律/モチーフは保存しない」）**：セーフ＝**復元不能な統計**（n-gram カウント・度数/音価の分布）。アウト＝**単一の源メロ/句が復元できる保存**（(A) の literal 句辞書＝移調しても literal・下記で撤回）。(D) 進行遷移・note_transition・skeleton_prior は**カウント/分布のみ**＝セーフ。**句を素材にしたい時も統計だけ抜く**（音価分布等）。
> - **移行実施（2026-07-21・`scripts/migrate-corpus-compliance.ts`・commit 1cf55cb）**：cm.sqlite に literal で入っていた**他者メロ（POP909 pop 1087＋game 100＝1187句）を撤去**し git外(`data/backups/*.ndjson`＋DB丸ごと)へ退避。生成が要る"肌触り"は **motif モデル(rhythm+move の count Map＝統計)** を `data/corpus-stats/motif-model.json`(git外) へ焼き、`learnMotifModelFromLibrary` が統計優先ロード＝**生成 bit 不変**（実機で rhythm224/move15 一致確認）。**irish(157)も他者転写ゆえ撤去**（`--tags=irish --no-stats`＝統計は full 保持）＝**library melody 0（他者literal 全滅）**。進行(コード)は著作権対象外ゆえ在DB neta 残置可。※コード進行の library(chord_progression 210)は「進行そのものは非著作物」ゆえ (D) 統計＋在DB literal とも据え置き。**self-authored を library へ足したら motif-model を再焼き**（stats 優先ゆえ live 追加は模型に入らない）。
- **現状（実コード）**：WP-0 で `corpus_note_transition`/`corpus_skeleton_prior`/`corpus_motif_transform` の器＋読み出し純関数（`corpusStats.ts:128,141,150`・`sampleByCount:159`）は在るが **generate は corpusStats を一切呼ばない**（storage+read のみ）。素材JSONは骨格＋motif の2本のみ＝**進行・句は素材に無い**。(A) phrase_pattern＝専用表なし。(C/D) chord_transition＝`next_chord`(`continuation.ts:24`)は機能文法 T→S/D の**無ランク**・`genChords` の度数ウォークは固定重み `w = fn==="D"?[5,1]:[3,2,1]`(`generate.ts:251-252`)＝コーパス重み不使用。
- **素材ブロックの切り分け（重要）**：**(D) 進行遷移と (A) pop 句は在DBだけで再構築できる＝生ソース不要**。在DB `neta`(chord_progression, scope=library) **210件**が正規化済（度数root/正準quality/count 明示・断片0/重複0＝verification §）＝遷移集計に要る度数×品質の列は完全に残っている。pop メロ句も phase 正規化済（`phase_ok=true`・C基準pitch・downbeat相対start・count・pickup）＝度数変換で (A) 導出可。**「U-FRET生データ消失＝再ingest不能」(L567) が塞ぐのは①新規U-FRET曲追加②元キー/元meter/生バーラインの厳密復元であって、在DB進行からの遷移集計ではない**。／**生ソース待ち（作れない）**＝game/irish 句の phase 再正規化（pop のみ再構築済）・note_transition の beat_phase/ioi バケット拡張・game キー推定信頼度フラグ＝いずれも raw MIDI+テンポマップ依存＝**M2（骨格再抽出）とセットの別WP**。
- **設計案（在DBで作れる範囲・(D)先行）**：
  - **(D) 新表 `corpus_chord_transition(style, mode, ngram, from_ctx, to_tok, count)` PK(style,mode,ngram,from_ctx,to_tok)**（`db.ts` の corpus 群へ `CREATE TABLE IF NOT EXISTS`＝非破壊）。トークン＝`${root}q${quality}`（正準quality）・`from_ctx`＝前文脈を連結（note_transition と同記法）・ngram=2/3・style="pop"。note_transition が `to_deg INTEGER` なのに対し進行は品質を要するので `to_tok TEXT`（唯一の差）。
  - **生成＝在DB集計スクリプト `scripts/build-chord-transition.ts`**：在DB `neta`(chord_progression, scope=library) を読み `content.count` 重みで bi/tri-gram 集計 → `data/corpus-stats/chord-transition-pop.json` を吐く（**在DBは読むだけ・書かない**）。投入は `ingestCorpusStats` に `chordTransition?` を1本足して既存 CLI に相乗り（`INSERT OR REPLACE`＝冪等）。**scope=library のみ集計＝project 自作進行は不可侵**。
  - **読み出し `loadChordTransitions(db,style,mode)`**（`loadNoteTransitions` と同形・`sampleByCount` をそのまま食える）＋`hasChordTransitions(db)`（未投入は空Map＝degrade gracefully）。
  - **結線（消費・既定OFFで bit 一致）**：①`next_chord`(`continuation.ts:24`)＝機能文法で作った候補を last→cand の corpus count で**安定降順ランク**（未注入は現行順）。②`genChords` 度数ウォーク(`generate.ts:251-252`)＝固定重み `w` を前度数からの corpus count 重みへ差し替え、`rng.choices(cands,weights)` は据え置き（**RNG消費数・順序不変＝seed互換**）。**新 opts `corpusChords?`(既定false) or `hasChordTransitions=false` で現行 `w` に短絡＝同 seed 完全 bit 一致**（受け入れ基準）。
  - ~~**(A) phrase_pattern（pop 先行）**~~ → **❌撤回（2026-07-21・著作権）**：句の度数列+リズムを**丸ごと**保存すると、キーを与えれば元メロが復元できる＝**リテラルなモチーフの保存**。コンセプト（CLAUDE.md「他者コーパス(POP909等)からは**統計のみ抽出**＝リテラルな旋律/モチーフは保存しない」）に反する。**「度数相対＝著作権セーフ」は誤読**（移調しても literal motif は literal）。pop 句は POP909 由来の実J-POP。∴ **(A) literal 句辞書は作らない**。実装済みだった (A)（`corpus_phrase_pattern`＋build/ingest/load＋投入1087句）は撤去（コミット参照）。句から取れるのは**統計のみ**（音価/IOI 分布・句長分布・度数遷移n-gram＝note_transition が既に担う）＝生成に必要ならそれを statistics として設計しなおす（literal は不可）。
  - **TDD**＝knob off で `genChords`/`next_chord` の既存スナップショット回帰緑、on で in-memory DB へ小 fixture ingest→ランク/重みが count 順・冪等。
- **M2 と合わせる利得**：raw 依存分（game/irish phase・beat_phase バケット・game 信頼度）は M2 の raw 再取得と素材同一＝一括採取が得。一方 **(D)・(A pop) は在DBで独立先行できる**＝M2 を待たず最短で生成品質に効く（`next_chord` 無ランクの是正）。
- **やらない/保留**：U-FRET 新規再ingest（生データ消失で恒久不能・210件が母集団上限）・(A)game/irish phase 再正規化＋note_transition バケット＋game 信頼度（M2 とセット）・(C) chord_progression_pattern 別表化（在DB neta が既に正規化・`find_progressions` で引ける＝辞書は重複ゆえ後回し・生成に効くのは (D) 遷移統計）。

**緊張を"平均で失わない"ための原則（2026-07-21 補強・オーナー懸念＝研究の「均質化・無難化」への対処）**
頻度カウントを唯一の順位付けにして最頻値を出すと必ず無難の底に落ちる（＝研究が言う blanding）。**頻度は idiom バイアスであってランカーではない**。4つの価値を別々の層に割り、コーパスに全部を負わせない：
- **「ありえない・耳で変」＝正当性ゲートが担う（頻度で弾かない）**：機能文法＋声部進行チェック（voiceLeading・avoid-note＝既存）が legality を決める。**「ありえない変」と「レアだが効果的」を頻度は区別できない**（どちらも低カウント）ので、正当性の判定を頻度に委ねない。コーパスの低カウント＝除外、ではない。
- **「この文脈で効く緊張」＝構造層が"どこに"を決める**：偽終止②/二次ドミナント⑤/借用iv⑥ は**位置で効く**（1番サビ末・トニック直前）＝終止/機能配置（①②⑤⑥⑩＝実装済）が挿す。よって遷移統計は**同じ機能の中でどれが手癖か**にだけ効かせる＝prev-chord の素の bigram でなく**機能/位置で条件付け**して文脈緊張を潰さない。
- **「たまに聞くが効果的」＝決定的スパイス関数が担う（頻度では出せない）**：レアな妙味はレアゆえ頻度表からは湧かない。二次ドミナント/借用/偽終止/ラインクリシェ＝**ルールで意図した箇所に挿す**関数が受け持つ。コーパス(D)は**つなぎの"地"を手癖に寄せる**だけ＝**床を上げる（のっぺり退治）、天井（意図した緊張）は構造層＋スパイスが作る**。
- **操作系＝オーナーが回すダイヤル**：①**意外性（温度）パラメータ**を `next_chord`/`genChords` に足す（王道↔攻め＝最頻に寄せるか裾の正当進行まで拾うか）。**既定＝低温（現行寄り）・OFF フラグ or 温度0 で seed bit 一致**（受け入れ基準は据え置き）。②**候補は最尤1本に潰さない**＝定番〜攻めを跨ぐ多様 top-k を出す（人が選ぶ前提＝候補が無いと始まらない）。頻度は「審判でなく並べ替え眼鏡」＝弾かず並べる。
- **既存結論との整合**：理論スコアはガードレール止まり・fitness 化は死に筋（`project-melody-eval-ceiling`）と同思想＝**コーパスも最大化ターゲットにしない**。メロ側も同構造（骨格=緊張の設計図／note遷移=手癖の地／非和声音の型⑦⑧=スパイス／温度＋多様候補）。

#### 決定：曲/セクションの階層を実コードで実現（#5・2026-07-04）
`docs:413` が既に宣言する **Project ⊃ Song ⊃ section ⊃ leaf** を**コードで enforce**（今まで「＋曲を組む」は kind=section を作り、section が section を入れ子にできる＝宣言と乖離していた）。ユーザー選定＝**フル実装**。
- **section＝ひとつの音楽ブロック**（Aメロ/サビ等）：レーンは**パート専用**（コード進行/メロ/コード楽器×2/ベース/リズム）。**section-in-section を廃止**＝「セクション」レーンを section から外す。尺は据え置き（MIN 8・**MAX 32**）。
- **song＝セクションの編成**：セクションを時間順に並べる。**俯瞰は「フォームストリップ」＝カード列**（小節グリッドは廃止・下の「#曲フォーム」節が正典。2026-07-16 S1）＝役割/尺/レイヤ帯のカードを並べ替え/挿入/削除/×N畳み・タップで潜る。position は**カード順からの前置和射影**で再計算（compose_edge/position の契約は不変）＝**尺上限は撤廃**（旧 MAX 64＝3:30曲が入らずバグ級だった）。
- **「＋曲を組む」＝kind=song を作る**（App.createSong / NetaList 一式）。song 内で section を新規作成・既存 section を配置（ピッカーの section レーン）。
- **エンジンは無改修で成立（重要）**：`compositeNotes`/`childDur` は既に **section/song を再帰合成**（#15 の入れ子対応）＝song(→section→leaf) の再生・尺は既に正しい。よって変更は**表示とレーン導出の差し替えだけ**（レーンを container kind で選ぶ）＝低リスク。
- **container kind でUIを選ぶ**：section＝小節グリッド（`SECTION_LANES`）／song＝フォームストリップ（`FormStrip.tsx`・下の「#曲フォーム」節）。`maxBarsForKind` は section 上限のみ（song は尺非依存＝上限なし）。
- **いじる▾（生成/ハモリ）は section 専用**：生成はパート（メロ/ベース/ドラム）を作る道具＝song 直下には置かない。song の いじる は **書き出し(MIDI)のみ**＝ただし song の分割書き出しは**レーン単位でなく part 単位**（メロ/対旋律/コード/ベース/ドラム＝`partTracks`・下の「#曲フォーム」§part別書き出し。旧レーン単位は全パートが1トラックに潰れる穴だった）。section(非song)の書き出しは従来の `laneTracks` のまま不変。
- **カードプレビュー**：`SectionMini` を container kind で分岐＝song は**構成（section 帯）**、section は従来の4パート帯。
- **非破壊移行**：既存の kind=section（"新しい曲" 等）はそのまま section として使える（standalone 可）。新規のみ song 化＝回帰ゼロ。将来「section を song に昇格」導線は任意（[[backlog]]）。
- **song が直接パートを持つか？→ 持たない**（sections-only）。全体ベース等の"通しパート"要求が出たら再検討（今は明快さ優先）。

#### 曲フォーム（フォームストリップ＋分家モデル）
正典＝`docs/research/2026-07-16-song-form-assembly.md`。「セクションを曲にする（アレンジ層）」の確定設計。**層は3層(project/song/section)のまま＝form は新実体を作らない**（form＝song の compose_edge の順序＋各 section の role タグの射影）。実装は段階＝**S1〜S4**（下記）。

- **俯瞰＝フォームストリップ（S1・実装済 2026-07-16）**：song の小節グリッド→**カード列**（`FormStrip.tsx`・song kind 専用／section の小節グリッドは不変）。
  - **カードの情報**（"曲にする"に要る5点のうち S1 は3点）：**役割**（`role:` タグ→色/ラベル・無ければ無地）／**尺**（小節数＋概算秒。曲ヘッダに合計）／**レイヤ帯**（`SectionMini` 流用＝どのパートが鳴るか）。調バッジ・分家(A′)バッジは S2。
  - **操作**：ドラッグ並べ替え（dnd-kit・neta_order と同流儀）／挿入（＋→`PlacePicker` で section 配置）／削除／×N畳み（連続する同一 child_id を1カードに畳み「×N」・タップで展開）／カードタップ=潜る（現行踏襲）／**今どこ**（通し再生中の現在カードをハイライト＝`beatRef` 低頻度ポーリング）。
  - **position＝カード順からの前置和射影**（`formStrip.ts`：`stripPositions`/`cardsToEdges`/`reconcileEdges`＝純関数）。並べ替え/挿入/削除で辺を再計算し `place_child`/`remove_child` へ落とす＝**compose_edge/position のデータ契約は不変**（グリッド版と同じ辺を読む）。挿入は末尾に仮置き→射影 normalize でタイ回避。`SONG_MAX_BARS` は撤廃（描画は尺非依存）。
  - **曲ヘッダ**：合計尺（bars×BPB÷tempo）・key/mode・tempo・stage/next_action（`SongStatus` 統合）。
- **分家モデル＝変奏の一級化**（定義は requirements.md『変奏の語彙』）（S2・実装済 2026-07-16）：実装＝api `vary` verb（`core.varyNeta`＝kind非依存・辺を同 child_id/position/ord で複製し子は参照共有・`variant_of` 新→元）＋共有検出 `get_placements`（`parentEdges` 逆引き）／web `useCowGuard`（CoW3択の単一実装＝useNetaEditor の content/meta 自動保存と SectionEditor の bars/レーン設定直接保存の両方をガード・placements 先読みキャッシュ・keepalive無対話フラッシュは「共有or未解決かつ未決定」なら原本に書かない＝エイリアシング事故＞データ喪失）＋FormStrip カードの調バッジ（曲と違う調だけ±半音）/分家′/共有🔗バッジ＋カード「分家にする」（その配置1つだけ差し替え）＋NetaList の「別物にする＝複製」文言対。**既知の残（backlog）**＝共有 section 内の compose 辺操作（ブロック削除・候補配置）はガード外。以下は確定設計の芯：繰り返し＝参照の複数配置（現行のまま。×N は同一 child の連続辺の束）。変奏＝**浅い分家(vary)**＝新 section ネタを作り**子ネタは参照で共有**（deep copy しない）・frame(key/mode/bars)/role/title は分家側で自由・元との間に `relation_edge(variant_of)`。転調ラスサビ＝分家して key+1（`compositeNotes` が子 section の key で再帰合成＝エンジン無改修）／落ちサビ＝分家してドラム/ベースの辺を外す／2番Aメロ＝変えたいメロ子だけ fork(copy-on-write)＝進行/ドラムは共有のまま。**copy-on-write の安全弁必須**＝共有子を編集しようとしたら「全部に効かす／この曲だけ（分家）」を選ばせ、共有バッジを常時表示。「完全に切り離す」は `copy_neta`（別物にする）＝分家（同じものとして育てる）と UI 文言で使い分け。スキーマ変更ゼロ（compose_edge の親別辺集合がそのままオーバーレイ機構）。
  - **vary の汎化＝kind 非依存（2026-07-16 オーナーGO）**：変奏＝「同一性を保った差分」は section 専用の概念ではない＝`vary` verb は**全 kind 共通**で切る（実装コストは section 専用版と同等）。container（section/song）＝浅い fork＝compose_edge を同 position/ord で複製・**子ネタは参照共有**・frame(key/mode/bars)/role/title は分家側で自由。リーフ（melody/chord/drums 等）＝content コピー＋`variant_of`（子を持たないので浅い＝深いが一致。機構は copy_neta 単体と同じだが**系譜が残る**のが差＝「同じものとして育てる」の宣言）。copy-on-write プロンプト＋共有バッジも kind 非依存の編集ガード。`relation_edge.type` は自由文字列＝スキーマ変更ゼロは不変。**やりすぎない**＝song 自体の vary（アレンジ違いの曲）は機構上動くが導線は作らない（ユース未出現）・variant_of の系譜表示は当面1段（A′ まで。A″ の畳みは実データが要求してから）。
  - **将来スライス（backlog 行き・S2 に含めない）**：①機械変奏の分家着地＝reshape/revise/emotion_shift/continue の出力を「分家として保存」する出口（候補N→人が選ぶ→variant_of 付きで着地）＝哲学（候補まで機械・決めるのは人）と直結・motif-transform-stats の実測（ゆるい変奏60-73%・リズム保存）を既定パラメータに使う受け皿。②系譜の俯瞰＝ネタ一覧のファミリー畳み・find_similar の分家畳み（母集団の濁り防止）＝variant_of が実データで貯まってから。
- **つなぎ＝計画 verb の結線（S3-a・実装済 2026-07-16）**：実装＝`formPlan.ts`（純ロジック＝`planKeyApplication` 振り分け／`transitionWindowNotes` 窓／`scaffoldPlan` 射影／`energyChips`）＋`FormSuggest.tsx`（候補 fetch/選択/確認）＋FormStrip（実行）＋`useCowGuard.guardAction`（辺操作の汎用ガード＝ブロック削除・ピッカー/候補配置を「作成→配置」1操作でラップ＝やめるで孤児を作らない）。**既知の残（backlog）**＝applyLoop（右端ドラッグのループ伸ばし）のみガード外。入口＝FormStrip ヘッダの**「提案▾」メニュー**（フォーム／転調／エナジー）→候補モーダル（各 suggest verb の候補を一覧・タップで適用＝「提案→人がワンタップ適用」の哲学を UI でも維持）。
  - `suggest_form`→**足場化**：候補（役割列＋小節数）を選ぶと空 section ネタ（`role:` タグ＋bars）を作ってストリップに並べる。**非空ストリップは「置き換え確認」**（辺のみ除去＝既存ネタは無傷で残る・やめる可）。空カードはピッカーで差し替え/新規の入口。
  - `suggest_key_plan`→**key/mode 適用**：ストリップの役割列（position 順）を roles に渡す。適用前に**サマリ確認**を出し、**同一共有子に異なる調が割れる配置だけ自動で分家**（例「サビ(3箇所目)を分家して+1」＝vary→辺差し替え→分家の key 更新。全配置同調なら実体を直接更新）。
  - `suggest_energy_plan`→**Δチップ（揮発）**：適用でカード上端に Δ 表示（セッション内のみ・永続しない＝正典 §5.3「提案は揮発・確定は実体に落ちる」）。
  - **遷移試聴（縫い目E）**：カード境界の小ボタン→前セクション末2小節＋次セクション頭2小節を `compositeNotes` の部分窓で連結再生（トグルで停止・新機構不要）。
  - **CoW 残経路の完全化**：共有 section 内の compose 辺操作（ブロック削除・候補/ピッカー配置）も `useCowGuard` を通す（S2 の既知の残を解消）。
- **S3-b（backlog 送り＝薄く出さない）**：境界の準備和音候補（gen_chords transition を分家コード子の末尾差し替え候補として出す＝コード子 fork の UX 設計が要る）・energy の生成既定結線（frame.section.energy へ渡す経路）・energy 永続（song overlay に JSON 列＝loop の前例）。
- **通し再生・書き出し（S1 で是正）**：通し再生は `compositeNotes` 再帰で既に正しい。**MIDI 分割書き出しは part 単位**＝`partTracks`（`compositeNotes` が各ノートへ付与済みの `part`＝melody/counter/chord/bass/drums でトラック分割・**program はノート単位を尊重**＝同 part 内で program 違いは別トラック・drums は kit で ch10）。song のレーンは[section]1本＝旧 `laneTracks` は全パートが1トラックに潰れる穴だった。section(非song)の書き出しは `laneTracks` のまま不変。
- **S4 パーキング（backlog）**：セクション別テンポ/feel（transport マルチクロック化）・WAV 書き出し・簡易ミックス統合・variant のネタ一覧畳み・song の undo/redo。

#### 決定：UI/ブランド刷新まとめ（Otomemo・ヘッダ・ピッカー・タイル・2026-07-05）
表示名・ヘッダ・ピッカー上部・作成/絞り込みタイルをまとめて整理（オーナーと反復）。**プロダクト表示名＝Otomemo**（`App.APP_NAME` 定数1箇所・ロゴSVG＝吹き出し+♪＝"サッと音のメモ"・`public/favicon.svg`・title「Otomemo — 手早く音のメモ」）。名前の由来＝「手早く音を出してメモできる」を伝える（音メモ）。**（2026-07-18 追補・オーナー確定）**：Otomemo の名は**doc の表題にも統一**（requirements/architecture/design/status/backlog/CLAUDE.md の見出し）。**GitHub リポジトリも `otomemo` へ改名済**（remote＝`git@github.com:haruneko/otomemo.git`）。一方で**ローカルのディレクトリ名＆ルート `package.json` の `name`＝`creative_manager`、プロセス名 `cm-api`/`cm-search`、パッケージ `@cm/*`、MCP サーバー名 `creative-manager`、env `CM_*` などの技術識別子は据置**（実態＝コードのまま・改名しない）。docs 内の `cm-*`/`creative-manager`/`creative_manager` 表記はこの技術識別子を指す（＝ここが唯一の権威記述）。
- **ヘッダ＝パンくず**：`[♪ロゴ Otomemo →ホーム(ネタ帳)] › [プロジェクト名 →器画面] … [📥受信箱][⚙設定]`。旧「☰=ホーム(ハンバーガーの意味ズレ)/♪飾りロゴ/🏠でホーム2重」を解消＝現在地と帰り道が明確。ネタ帳レール開閉の ☰ は **PCのみ**（サイドバー切替はPCでは慣習的で紛れない）。※旧 header 記述「App ヘッダ(🏠…)」(下の ProjectScreen 磨き節)は 🏠 撤去で古い。
- **ピッカー上部**：種別タブ(6個)を**撤去**＝タップしたレーンに固定（別パートはそのレーンのセルをタップ）。置く種別は**ヘッダのパンくずに色付きアイコン＋パート名**で表示（`Section ▸ [色アイコン]パート ▸ N小節目`）。おすすめの kind は `corpusKindFor(picker.lane)`（タブでなくタップしたレーン）で決定。絞り込み＝検索を主役に、下に `[自作すべて▾（元ラベル無し）]＋[拍子一致のみ トグルボタン]`（旧「元セレクト/拍子違いもトグル」は文言変更）。おすすめ帯＋自作リストの各項目に **▶試聴**（`previewNeta`＝配置前に耳で確認）。ダイアログは `grid-template-columns:minmax(0,1fr)` で画面幅に固定＋`align-content:start`（帯はスクロール・行は間延びしない）。
- **作成タイル（ホーム）**：グループ分け（見出し無し）＝**パーツ行(メロ/コード/ベース/リズム/コード楽器)** ＋ **組み立て・文字行(セクション/曲/歌詞/テーマ)**、取込は全幅別行。**chord_pattern・section・song タイルを追加**（従来は編集画面にあったが作成導線が無かった）。
- **絞り込みタイル**：作成と**同じ9種・同じ順**（メロ/コード/ベース/リズム/コード楽器/セクション/曲/歌詞/テーマ）＝アイコンのみ(ラベル無し)。曲(song)を追加、section と別々。
- **色SSOT**：kind→色は `kinds.kindColor(kind)`（chord系は --k-chord に畳む）に集約。ピッカー項目は各アイテムに自前の `--k` を設定（旧: 編集中 section の --k=橙 を継承してメロ概形が橙になるバグを是正）。
- web271緑・実機で確認（favicon 200・パンくず・ピッカー色/密度/▶）。

#### 決定：トップ画面 抜本再設計＝ネタが主役・「作る/絞る」は扉の奥（2026-07-14・正典＝`docs/research/2026-07-14-topview-redesign-fable.md`＋モック `2026-07-14-topview-redesign-mock.html`）
上の「作成タイル(ホーム)」「絞り込みタイル」は kind 増加のたびフォールドに恒久1枠ずつ刺さり（WP-X3で作成6→9・絞込10→13）、実データがフォールド外へ押し出された（inventory §0＝タップ標的47・うち作成14＋絞込13＝壁27個57%・実データ0.3枚）。＝いじるメニューと同型の病理。主役を逆転する：**ファーストビューの主役＝実データ（つづき＋自分のネタ一覧）**、「作る/絞る」は扉の奥へ畳む。姉妹設計（いじる＝`TinkerSheet`）と同じ**棚＋引き出し**の設計言語で統一。
- **トップ契約（固定サイズの不変条件・再発防止の本体＝App.tsx notebook 頭にコメントで明記）**：
  1. ファーストビューの固定行は**6つだけ**＝ヘッダ／器チップ／アクション行／種別行（≤1行）／つづき（≤1行）／一覧ヘッダ。残り全部が一覧＝実データ。
  2. **新しい kind が増えた → 作成の棚にタイル+1のみ。トップの種別行にはそのkindのネタを実際に作った時だけ件数順の競争で現れる＝トップのDOM増分＋0**（「kind増加のトップ増分+0」）。
  3. **アクション行に足してよいものは無し**（＋作る/検索/絞る▾の3枠で打ち止め）。4つ目が要る日は「絞る」引き出しへ沈めるか契約を意識的に更新する。
  4. 種別行は**最大6**・つづきは**最大1行**。溢れは引き出し/一覧へ。
- **作る＝作成の棚（ボトムシート）**：現行の作成タイル（PARTS/BUILD_TEXT・同じ絵/順）＋取込を1つの棚に集約。`＋作る▾` 1ボタンで開く。タイルtap＝既存 `createBlank`/`newSong` をそのまま呼ぶ（state/API不変＝bit一致・器＝JSXのみ変える）。新kind=棚に+1のみ。
- **絞る＝タイル+件数バッジに統一（オーナーFB 2026-07-14・§10）**：種別行を pill チップでなく**作成タイルと同じ視覚言語のミニタイル**（KindIcon絵柄・レーン色・角丸）へ。件数はタイル右上の**小バッジ**（未読バッジ隠喩・レーン色地/濃色数字）。導出＝**現スコープの未絞り込み一覧の kind 件数をクライアント集計**（追加APIなし・kindFilter/q 適用中は直前スナップショットで安定）＝**露出∝実利用**（0件kindはトップ非表示・絞る▾引き出しの「まだ0件」に破線ゴースト）。件数降順・上位6・横スクロール1行固定。絞る▾引き出しも棚と同じ3列タイル格子（バッジつき）＝「作る棚＝＋つき／絞る引き出し＝バッジつき」で対にして弁別。`kind-filter-*` aria と導出ロジックは不変。
- **移行＝段階スライス（一括書き直し禁止・S1〜S5）**：S1 機械抽出（作成→`CreateShelf.tsx`・絞込/mood→`FilterBar.tsx`・DOM/aria不変）→ S2 作成の棚（アクション行＋シート化・`.create-tiles`がトップから消える）→ S3 種別タイルのデータ導出（上位6タイル＋バッジ・▾引き出し）→ S4 つづき行＋一覧既定リスト密度 → S5 検索合流B-lite（q が kind 名に前方一致→「＋『◯◯』を作る」行）。reload/検索/createBlank/newSong/NetaDialog/DnD には触れない＝動くのは JSX と CSS のみ。

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
- **① アナリーゼ（重・GO確定）**：**入力＝ファイル主＋YouTube URL対応（確定）**。URL→**yt-dlp**で一時音源DL（**best-effort**＝2024 SABR/POトークンで失敗し得る→失敗時「ファイルをアップして」にフォールバック）。ファイルは chat アップロード（MIDI取込と同型の一時asset）。**音源は解析後に削除**（著30-4＝派生事実のみ残す）。パイプライン＝`audio_analyze` job →**api内 Python音声CLI(A案)**＝`apps/audio/analyze.py` を整備（Demucs分離→BPM／**調はBTCコード頻度から**（POC修正・librosa単独は不採用）／音域=pyin／コード=BTC）→{facts JSON}。継続調査と同じ job consumer に intent 追加＝「投げて→裏で→トレイ」。Claude が facts を**アナリーゼ文**に統合（メロ特徴の言語化）。出力＝アナリーゼ知見ネタ（事実＋所見・信頼度）＋コード/メロは候補ネタで落とせる。stem/facts は asset キャッシュ。実行基盤=**A確定**（新サービス建てず api が CLI spawn）。

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

- **⑥ 「いじる」＝ハブ＋パーツ別引き出し（2026-07-14・器の再設計・正準＝`docs/research/2026-07-14-tinker-menu-redesign-fable.md`）**：⑤で器はボトムシート化したが中身は「フラット縦一列」のまま＝38コントロール・縦1756px が1シート同居し、WP群(ドラム/ベース型セレクタ4本42択)が生成ボタン列に割り込み主動線を分断（オーナー評「煩雑すぎてヤバい」）。→ 器の中を**二軸**で再構成する：**横軸＝パーツ**（メロ/ベース/ドラム/…＝増える唯一の軸）、**奥行き＝深さ**（おまかせ→型/プリセット→ノブ）。形は**ハブ（棚）＋引き出し**：
  - **ハブ**＝いじるを開いた最初の1画面（**スクロール0が契約**）。①横断設定「進行の色」(旋法chip 1行)②ヒーロー「☆おまかせで一式」(§4)③パーツタイル棚(3列・ホーム作成タイルと同じ言語=レーン色流用)④書き出し固定フッター。**タイル上ゾーンtap＝そのパーツをおまかせ生成**（現行2タップ主動線を死守）／**タイル下ゾーン(状態チップ)tap＝そのパーツの引き出しを開く**（設定の可視化と扉を兼ねる）。
  - **ハブ契約（不変条件・コードコメントに明記＝再発防止の本体）**：ハブに足してよいのは**新パーツのタイル+1のみ**。新ノブ/型は**そのパーツの引き出しの中**へ（前面はchip6±1・seg1行まで、超過は「細かく」へ沈める）。横断設定は旋法＋一式の2枠で打ち止め（3つ目は「共通」引き出し新設）。→ パーツが7→12に増えてもハブは無スクロールのまま。
  - **引き出し**＝パーツ別サブシート（ハブから遷移）。下端に「このパーツを生成」ボタンを固定＝往復スクロール根絶。メロ引き出し＝プリセット8＋🎲＋［＋保存］／**前面4ノブ**(細かさ/跳ね/駆け上がり/タメ)＋群アコーディオン5つ(残りノブを沈める)＋「メロを直す」(上/下ハモ・fit・診断＝メロ在時)。ドラム/ベース引き出し＝ジャンルchip前面＋フィルseg＋型直指定は「細かく」内。骨格引き出し＝構造chip。
  - **移行の鉄則＝bit一致**：state と送信ロジック(`useMelodyGen`)は1行も動かさない（0/""非送信は `genPart` に閉じたまま）。変わるのは**器（JSX構造とCSS）だけ**＝生成リクエストの payload は1バイトも変えない。段階スライス T1(機械抽出`TinkerSheet.tsx`)→T2(ハブ骨格+引き出し)→T3(メロ引き出し内装=前面4ノブ)→T4(型chip化)→T5(おまかせで一式=`genPart`直列+候補トレイのkind別グループ)。aria-label は安定名で温存。PC幅(>640px)はモバイル検証後に統合（当面ハブはモバイル導入）。

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
1. ~~メロ量子化の手段未決~~ **【解決 2026-07-15・F2実測】採譜f0は PESTO 採用・basic-pitch 不採用確定**：自作曲MIDI正解の横並び実測（research/2026-07-15-vocal-transcription-benchmark.md）＝PESTO note-F 0.761（現行pyin 0.568・敗因=オクターブ跳ね~6%frame）・音域p5-p95完全一致・CPU 17s（pyin 31sより速い）・MIT・pip一発。basic-pitch は実声で 0.555＝入れる価値なし（feasibility予言どおり）。torchcrepe はCPU 459s=非現実。組込＝analyze.py の pyin(vocal) を PESTO に差し替え・後段RLE量子化/音域は無改修流用。ベース低域pyinは据え置き（PESTO未検証）。採用後に生歌別曲で耳＋数値の追検証1回。
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

#### 決定：アナリーゼ「読み筋」層（#S10続 v2.1・2026-07-15・研究Wave1-2→設計）
**背景**：v2ワークベンチで「測る」は完成したが、監査（research/2026-07-15-analysis-research-plan.md）で**「測った数字から学びを生む」層が構造的に欠落**と確定：
(1) 所見文プロンプト（`audio-analyze.ts summarizeFacts`）が bpm/key/コードしか渡さず **drum_onsets/bass_notes/melody_notes/beat_times をカット**＝v2の値打ち「実測の具体」を所見が語れない。
(2) チャット読み返しも同根で崩壊＝analysis ネタは **1個 100K〜126K tokens**（**melody_f0 が55%＝チャット推論に無価値な重り**）で MCP出力上限(~25K)を4〜5倍超過、`read_neta`/`search` が実質使えない（F4実走で確定・research/2026-07-15-chat-analysis-e2e.md）。会話の質自体は軽量データさえ届けば◎（3ターン実走で実測タイムライン秒刻みの正答）。
(3) 良い分析文の型は「**事実→解釈→転用**」3層＋**深さ優先（効いてる逸脱1〜2点・網羅は捨てる）**＝v1の薄さは事実層で停止したから（research/2026-07-15-analysis-pedagogy.md）。

**決定（芯＝facts の「射影」を一級の層にする。raw は不変＝ワークベンチ用）**：
1. **digest＝facts射影の純関数**（新 `apps/api/src/music/audio-digest.ts`・TS・決定的・TDD）：facts＋interpretation（区間・downbeat・調）→ `digest`＝{overview(1行メタ), key_segments, chords(度数化・セクション別・頻度・主ループ), melody(音域p5-p95・輪郭統計・密度・非和声音率), rhythm(型・sub・crash間隔), bass(音域・kick絡み率), spots(見どころ候補)}。**全体を ~4K tokens 以内に設計**（プロンプトにもチャットにも丸ごと載るサイズが契約）。
2. **spots＝見どころ検出（生成レンズ資産の解析転用）**：R1 の18類型（H1-H6/M1-M4/R1-R3/F1-F4・research/2026-07-15-analysis-pedagogy.md §2 が正典）のうち**機械検出できるものから実装**。第1弾＝H1借用（旋法統計の語彙で非ダイアトニック検出）／H2セカンダリドミナント／H5転調（下記 key_segments）／M2音域設計（セクション別レンジ推移）／M4食い（メロonset×コード頭）／R3ベース×キック絡み／F1小節数非対称。各 spot＝{id, 位置(bar:beat), 事実, 信頼度}の**候補列挙まで**＝**選定と解釈はClaude**（1〜2点に絞る＝深さ優先）。
3. **key_segments＝局所調**（F3プロト `music/localKey.ts` を digest 経由で結線）：**断片化ゲート必須**＝セグメント数>4 or 最短滞在<8s ならグローバル単一調へ自動フォールバック（DeepSea型＝半音階の濃い曲で13分割した実測・research/2026-07-15-local-key-proto-results.md。根治=調テンプレ相関emissionは第2弾）。
4. **prose再設計**：summarizeFacts を digest 全体に置換＋所見プロンプトを「事実→解釈→転用」3層テンプレ（pedagogy §テンプレA）＋**逸脱1〜2点深掘り・メタ情報は末尾1行に降格**へ。
5. **保存**：reaper が digest を `analysis.content.digest` に保存。**軽量双子ネタは作らない**（F4案Bは digest＋下記射影で代替＝ネタ一覧を汚さない）。
6. **MCP面の射影**：(a) `read_neta`＝analysis kind は既定で raw を要約（digest＋prose＋meta＋chords_timeline を返し、melody_f0/melody_notes/beat_times は件数・統計のみ）・フル配列は `fields:[...]` オプトイン（ワークベンチ用途温存）。(b) `search`＝ヒットの content 丸ごと返却をやめ**要約射影**（id/kind/title/冒頭）のみ・フルは read_neta へ。(c) `ok()` の pretty-print を raw 数値配列で禁止（×2.6〜3.3の膨張増幅を止める）。(d) `CHAT_VERBS` に `suggest_emotion_params` 追加（BUG#1型休眠の是正・F4発見）。記号系verbの個別露出は不要＝統合 `analyze` で足りる（F4確認済）。
7. **perception 第1弾**：vocal f0 を pyin→**PESTO** 差し替え（上記 抜け#1 解決参照）。＋生歌較正（2026-07-15・蜿蜒耳検収）＝energyVADゲート（幽霊ノート除去）＋断片化後処理。
7.5 **事前確率つき採譜＝corpus-Viterbi復号（2026-07-15 GO・オーナー承認・研究正典=research/2026-07-15-prior-informed-transcription.md）**：f0→ノートの**「丸め」層だけ**に音楽的事前確率を効かせる（VAD＝歌区間判定は不変＝区間を作らない/消さないを構造保証）。層分け＝**Python(perception)はセグメント＋候補音高(±1半音)を吐くだけ**（facts追加 `melody_segments`・追加のみ後方互換）／**TS(interpretation)がViterbi復号**＝エミッション=f0中心線（ガウス45cent）×遷移=自前コーパス度数bigram（`corpusStats.ts` 既存ロード資産再利用）×コードトーン吸着は**強拍のみ**（弱拍=経過音/倚音保護）×音域・持続prior。**暴走ガード**＝復号ラベルは生f0から±1半音を超えないハードクランプ＋λ=0で現行bit一致（退避路）。受け入れ＝LostMemory note-F 床0.74維持＋揺れ歌手（蜿蜒）で耳判定。期待値の正直な線＝断片解消と丸め安定であり全自動耳コピではない。
8. **第2弾（backlog・オーナー判断込み）**：**beat_this** 導入（拍/ダウンビートSOTA・7-10s/曲・ただし torch2.6系 venv 分離が要る＝venv戦略とセット・research/2026-07-15-allin1-beatthis-feasibility.md）／**allin1**＝条件付きGO（機能ラベル付き構成が取れるが 10-14分/曲＋パッチ3点＝**任意の「追い焚き」ジョブ**として非同期・既定は crash 区間分解のまま）／localKey 調テンプレemission／PESTO生歌追検証（耳）。

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
  - **→ 是正（監査D1・2026-07-15）＝区間分解ゲートの独立化**：#S12改3 の `extractSectionPatterns`（crash区間分解）は
    **全体 `extractDrumPattern` の confidence でゲートしない**。全体confは「曲全体を1グリッドに畳めるか」の指標で、
    高BPM・セクション差の大きい曲では低くなる（蜿蜒 実測 0.086）が、その中に単体で高conf（実測 0.456）の区間が埋もれる。
    採否は**区間ごとに区間自身の conf≥0.3** で行い（rhythm/bass/melody 区間ネタの per-section ガードが担う・既存）、
    全体confでの一括スキップは**回収可能な区間ネタと bass/melody 区間ネタまで道連れ**にするので廃止。ドラム無なら空（不変）。
- **perception 刷新（analyze.py drum_onsets）**：帯域ごと**独立**オンセット検出（kick=20-120Hz・snare=200-1800Hz・
  hihat=6kHz+、包絡は帯域内95%tileで正規化）＋**クロス帯域優勢ゲート**（同時刻の最強帯域の一定割合未満の
  ピーク＝ブリードとして棄却）。同時発音は残る・facts 契約 `[[t,kind,strength]]` は不変。
- **旧ユニット剪定**：`estimateGrid`/`estimateMeterDownbeat`/`drumOnsetsToRhythm`/`beatPositionOf` は新実装に
  置換・削除（テストも新APIへ書き直し）。`meterString` は続投。

#### 決定：ドラム/ベース抽出＝捨てているstemを拾う＋ドラムから拍/拍子の土台（#S12・2026-07-07・要件確定→設計）
**背景/芯**：`apps/audio/analyze.py` は htdemucs で4stem（vocals/drums/bass/other）を計算しているのに **vocals しか使わず drums/bass を捨てている**（追加の分離コストゼロで拾える）。また **meter は未検出（ユーザー指定・既定4/4）・downbeat はコード変化ヒューリスティックのみ**（`audio-grid.ts autoDownbeatOffset`）＝リズムの土台がグラグラ。**キック/スネアは最強のオンセット証拠**なので、ここから拍/ダウンビート/拍子の土台を固め、その上に他パートを載せる。詳細な候補比較・ライセンスは research/2026-07-07-drums-bass-extraction-plan.md（本節は決定＝上位）。

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
  - **【是正 2026-07-18・#26】**：ChordEditor は #26 で**ブロックタイムライン**へ作り替え確定＝「行リスト」前提の本項は無効。再生中コードは `.lane-block.playing`／赤左border で自然に出る（#76 の行ハイライト回避策は不要に）。詳細は #26。

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
- 方式：**MCPで公開**（native tool-use でも可）。payoff：操作が"再利用可能なツール面"になり、内蔵Chatだけでなく**任意のMCPクライアント（Claude Desktop / Claude Code 等）からも Otomemo を操作できる**＝〈外部化された延長〉の"手"が再利用可能に。
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
- **データモデル決定（2026-07-15・オーナー裁定）＝歌詞は独立エンティティにしない**。歌詞は `Note.syllable` としてメロに埋め込み（現行どおり）が正典。根拠＝**譜割り一体論**：日本語は1音1モーラ原則ゆえ歌詞が変わればメリスマ分割等で音符列自体が変わる＝「同じ音符列に別歌詞」は成立しない。**同じ音・違う歌詞は別のメロディネタ**（copy_neta／分岐スタック realized_from の一種）として扱う。歌詞先行の下書きは knowledge/テキストネタで書き溜め、メロと出会った時点で流し込み＝埋め込みに変換。
- 方式：**pyopenjtalk-plus（漢字→読み、漢字混在時のみ）＋ jaconv（正規化）＋ 自作モーラ分割regex（かな→モーラ）**。Pythonワーカー内、オフライン・CPU・32GBで余裕。MCP/TS変更不要。
- フォールバック：最悪 Claude にカナ化＋発音記号をそれっぽく当てさせてもよい（読み解決は言語問題なのでClaude可）。ただしモーラ数えは regex が確実なので、Claudeは読み解決の保険に留める。
- 単位は**モーラ（音節ではない）**：長音ー/促音っ/撥音ん は各1モーラ＝1ノート割当（巷のregexはこれらを前にくっつける＝音節で誤り。**分離必須**＝最重要の正しさ）。
- 歌詞流し込み：text→(漢字あれば読み)→モーラ列→melodyのnotesに左から1モーラ1ノートで`syllable`へ。音数チェックはフレーズ/小節単位でモーラ数とノート数を比較。
- 漢字の同形異音は自動読みを正としない＝Chat/編集でユーザー上書き可。連母音(えい→ええ等)は発話モーラ数を正、歌唱実現は表示オプション。
- ピッチアクセントは extract_fullcontext でほぼ無料で取れるが v1 は不要（韻律フィットを作る時に追加）。

### #13b 歌詞↔メロ プロソディ契約（WP-M5 第1スライス＝分析と提案／2026-07-14）
- 正典規則表：`docs/research/2026-07-14-jp-prosody-melody-rules.md`（R-01〜14 歌詞→リズム型／A-01〜10 アクセント整合）。思想＝**機械は候補まで・仕上げは人間**＝hard規則も候補提示/soft警告に留め確定しない。
- **層**：純関数を `@cm/music-core`（prosody.ts）に置く＝api/web 共有・移調テンポ不変・DB/MCP非依存（music-core の趣旨）。MCP は薄い verb で dispatch。
- **入力源**：本スライスは `syllable`（かな・モーラ片）とピッチ/オンセット列で完結。かな→モーラは自作分割（#13の SMALL 拗音結合＋ー/っ/ん 独立＝既に api `lyric.ts` splitMora と同規約、prosody は各モーラを `{kana,kind,vowel}` に**分類**して返す）。
- **アクセント辞書**：v1 は**内蔵簡易辞書＋平板ヒューリスティック**（未知語＝平板型 kernel0＝第1モーラ低・以降高）。呼び側は `accents`（語ごと核位置）で上書き可＝確定は人間。pyopenjtalk はモーラ境界＋核＋アクセント句境界を一括で取れ費用対効果最良だが**本スライスでは導入せず**（Python 常駐/子プロセス配線が別作業・#13 の方式決定＝Pythonワーカー内は将来 R-09/A-06 の語境界×リズム軸を本実装する時に接続）。
- **契約2本**：
  1. `suggestLyricRhythm(kana, opts)` → `{moras, moraCount, candidates[], pickup?}`。候補は grid1マス=1モーラの**リズム型**（ピッチは持たない＝生成本体はやらない）。各スロット role＝`onset`(実音)/`tie`(長音ー＝直前へ延長・新アタック無=R-02)/`rest`(促音っ＝詰め=R-04)。候補＝basic(R-01/03/05/06)・subdivide(字余り16分=R-07)・tail(字足らず句末伸ばし/メリスマ=R-08/11/12)。先頭が助詞/接続詞/感動詞なら pickup(弱起=R-10)。
  2. `analyzeLyricFit(notes, opts)` → `{score(0..1), hits[], contour, melodyDir}`。隣接モーラの朗読関係(UP/DOWN/FLAT)×旋律方向(+/0/-)を A-01〜05/07 で採点（DOWN×+=A-01 赤・最重＝語義誤解／DOWN×0=A-02・UP×-=A-03 黄／UP×0=A-04 info／FLAT×大跳躍=A-05 黄／句末上げ=A-07 info）。hit＝`{noteIdx,ruleId,severity(red/yellow/info)}`＝UI が赤/黄ハイライト、握りつぶし可。
- **本スライスの実装/保留**：R 実装=01,02,03,04,05,06,07,08,10,11,12（11本）／保留=09,13,14（3本・語境界×拍/リフレイン再利用/母音韻＝辞書・句解析・跨フレーズが要る）。A 実装=01,02,03,04,05,07（＋08=原則非警告なので noop 実装／計7本 handled）／保留=06,09,10（語境界×リズム・特殊拍への強アタック・語分断休符＝アクセント句境界/特殊拍位置/休符情報が要る＝pyopenjtalk 接続時）。
- **MCP verb**：`suggest_lyric_rhythm`(歌詞→リズム型候補)・`analyze_lyric_fit`(メロ+歌詞→整合レポート)。**chat allowlist(chat-session.ts CHAT_VERBS)へ必ず両方追加**（過去BUG#1「登録したが許可漏れで黙って死ぬ」型の再発防止）。

### #13c 仮歌パイプ K-api（アクセント自動注入＋VOICEVOX歌唱＋V1/V2／2026-07-15）
正典＝`docs/research/2026-07-15-kariuta-{accent,voicevox,lyrics-craft,impl-audit}-*.md`（L1〜L4）。#13b の上に「実アクセント」「実歌唱」「母音メトリクス」を載せる。
- **W-K1 アクセント自動注入（pyopenjtalk 接続）**：`apps/audio/accent.py`（pyopenjtalk 0.4.1・同 venv `.venv`・spawn 0.13〜0.23秒）＝テキスト→アクセント句ごとの `{moras数, kernel核位置}`。api `apps/api/src/accent.ts`（audio-analyze.ts の run() と同型 spawn＋純関数 `mapAccents`）が音符の syllable 列を句境界で切り `accents:{kana,kernel}[]` を組む（モーラ総数が音符数と不一致なら null＝内蔵ヒューリスティックへ graceful fallback）。`analyze_lyric_fit` は **accents 未指定時に自動 spawn 注入**（明示指定は常に優先＝家訓・返り値に `accentSource: explicit|pyopenjtalk|heuristic`）。**#13b の保留 A-06/09/10 は引き続き保留**（アクセント句境界は得たが、強拍位置＝meter と休符位置＝rest 情報が別途要り、アクセント実データだけでは解禁不可）。
- **W-K3 VOICEVOX 歌唱出口**：`apps/api/src/sing.ts`＝(a) engine ヘルスチェック→未起動なら `CM_VOICEVOX_DIR`(既定 `~/voicevox-poc/extracted/linux-cpu-x64`) の run を detached spawn（`CM_VOICEVOX_PORT` 既定 50121）(b) 純関数 `notesToScore(notes,bpm)`＝メロ→VOICEVOX Score（FPS93.75・先頭/末尾休符必須・gap>0 に休符挿入・メリスマ ー→lyric""・syllable 欠落→"ラ"・音域外オクターブ折り返し[48,72]）(c) query=歌声(6000)→synth=frame_decode（既定 3009=波音リツ）→wav。**MCP verb `sing_neta(netaId, speaker?)`**＝wav を asset(kind=audio/mime audio/wav)保存し role=render でネタ紐付け→asset id 返す。1フレーズ≒1秒＝同期実行（jobにしない・60秒超ガード）。**CHAT_VERBS 追加済**。
- **W-K5 母音開口度メトリクス（V1/V2）**：`prosody.ts` に `opennessSeq`/`opennessReport` を追加し `analyzeLyricFit` の返りに `openness:{v1,v2pitch,v2dur,apexIdx}` を **追加（既存互換）**。開口度ランク a1.0/o0.8/e0.6/i0.35/u0.2・っ/ん=0・ー継ぐ。V1=最高音に乗るモーラの開口度／V2=開口度×音高・音価のスピアマン順位相関（正＝高い/長い音ほど開いた母音）。
- **是正（2026-07-15・実バグ3件）**：①歌唱テンポ＝**neta列 `tempo` を第一候補**（`resolveSingBpm`＝n.tempo→content.tempo→content.bpm→120・HTTP/MCP共用）②音域＝音ごとオクターブ折り**廃止**→**全体 k×12 シフト**で歌唱帯に収める（輪郭不変・なお外れる音のみクランプ・shift/clamped を返し黙って変えない）。**歌唱帯は VOICEVOX 実測 [52,79]（E3–G5）**＝旧[48,72]は下限が壊れ（48-51は上へ暴走）上限狭すぎ・80はオクターブ落ちバグ（research/2026-07-15-kariuta-voicevox-feasibility.md §7）。
- **仮歌＝メロの「楽器」（2026-07-15 リデザイン・オーナーFB「仮歌の入れ方が2つ＝ネタの♪歌う／Sectionの♪仮歌トグル＝あるのが変。メロ側がどれを使うか選ぶべき」）**：入れ方を**メロ側の1つに集約**＝メロネタの**楽器ピッカー（音色 select・MetaPanel）に「仮歌（歌声）」を追加**。データは `content.sing = { enabled:true, speaker? }`（未設定＝従来楽器＝後方互換）。`content.program` は**フォールバック楽器**として保持（歌詞なし時＝既定楽器で鳴らす＋小さく注記）。**撤去**＝Section の ♪仮歌トグル（TransportBar extra）＋ネタエディタの ♪歌うボタン（PianoRoll `onSing`/KindEditorBody `doSing`）。`api.sing`（`POST /sing` ネタ非依存・content-hash 重複排除＝`singHashOf`/`findCachedSing`）と `decodeVocal` は流用。
  - **再生の一本化**：楽器=仮歌のメロは (a) ネタ単体エディタの▶ (b) Section の▶ の**どちらでも普通の再生で歌う**。仕組み＝メロ notes を `api.sing`→wav（hash キャッシュで2回目以降即・未キャッシュ時は「歌声を作っています…」で再生開始を待つ＝`useVocalRender` フック）→ `decodeVocal`→ `playNotes` の同一 Tone.Transport クロックに **`AudioBufferSource.start(when, offset)`** で予約。**歌う声部の楽器音は notes に `muted:true` を付けて再生スケジュールから外す**（leadBeats/尺の計算には残す＝弱起・長さは保つ／`muteMelodyForVocal` の役割を per-note フラグへ一般化）。伴奏・非仮歌メロは通常発音。
  - **Section 複数メロ**：歌うか否かは**各メロ子ネタの `content.sing` に従う**（歌うメロだけ wav レンダ＝配置オフセットに各自スケジュール・その子の楽器音のみミュート）。歌うメロと楽器メロの混在が自然に成立。`playNotes` の `vocal` は **配列**（子ごとに `{ buffer, firstNoteBeat, leadRestBeats }`）。
  - **弱起ズレ修正（オーナーFB「みなそこで弱起がズレて再生」）**：旧経路は `vocalMelodyFromComposite` の**v1クランプ（負start→0＝弱起音を0.05拍のカスに潰す）**＋`startBeat=初音−0.25`＋`src.start(when)` の**先頭休符0.25拍を飛ばさない**の二重要因で、歌の初音が楽器の初音とズレていた（実測＝みなそこイントロ・弱起2つ[-0.5,-0.25]・♩92：楽器の初音は transport 0、歌の初音は先頭休符ぶん遅れ＋弱起潰れで輪郭破壊）。**修正**＝(1) 弱起を**クランプせず歌に含める**（`notesToScore` は相対gapで負startも正しく譜割る＝sing.ts 無改修）(2) 純関数 **`vocalSourceSchedule({firstNoteBeat, leadRestBeats, leadBeats, spb}) → {whenBeat, offsetSec}`**＝楽器と同じ `pickupSchedule` の `leadBeats` を使い、`when=firstNoteBeat+leadBeats`（負なら0へ丸め差分を offset へ）・`offset=(leadRestBeats+丸め差) × spb`＝**歌の第1音時刻 == 楽器の第1音時刻**（先頭休符を offset で食う）。ユニットテスト＝弱起1/弱起0/先頭休符0.25 の3ケースで一致検証。ループ＝毎周リスタート（transport.schedule の性質）・pause＝歌停止し次境界で復帰・**仮歌OFF（既定・`content.sing` 無し）は従来と完全一致（bit-safe）**。
  - **句頭子音カウントイン（2026-07-16・オーナーFB「句頭の子音が切れる／一小節前から鳴らしたい」）**：VOICEVOX は母音頭をノート境界に、**子音をその手前（先頭休符/前ノート）**に置く（実測＝`docs/research/2026-07-16-vocal-consonant-countin.md`）。旧 `vocalSourceSchedule` は offset で先頭休符を丸ごと飛ばし母音頭から鳴らす＝**先頭句の子音を切る**。加えて初音が transport 0 だと子音の置き場が無い。**修正**＝(1) `vocalSourceSchedule` を一般式化＝`vowelTarget = firstNoteBeat+leadBeats+countIn`／`when = max(0, vowelTarget−leadRest)`／`offset = max(0, leadRest−vowelTarget)·spb`＝**余地がある限り offset=0（先頭休符ごと鳴らす）**。(2) **カウントイン `countInBeats`**＝仮歌があるとき（非ループ）だけ `leadRest` ぶんを**共通 `leadBeats` に上乗せ**し全楽器・全 vocal を一律後ろへ＝子音の前余白を作る。カウントインは **`playNotes` の単一スカラ**に閉じ込め job/フックに漏らさない＝**複数 Section/複数メロレーン/弱起で相対時刻不変**（証明＝doc §4）。**先頭休符はテンポ非依存の床（0.18〜0.25s）**とし、api `/sing` が実測 `leadRestSec` を返して web と SSOT 化（`SING_LEAD_REST_BEATS` 二重定数を解消・`singHash` は先頭休符 frame 変化で自然に別キー）。**ループのループ頭 0 起点メロの子音は残余**（loop pre-roll＝フェーズ2）。**仮歌なし（vocal 空/null）は countIn=0＝全経路 bit 不変。**

### #13d 歌詞先行メロ生成 M-1（歌詞→音数/句割り注入＋best-of-N再ランク／2026-07-15）
正典＝`docs/research/2026-07-15-lyrics-first-melody-{verdict,A}.md`（統合裁定＝減量版・A設計＝既存V2拡張の最小注入）＋監査C `-C-audit.md`（地雷）。**#13b/#13c の上に「歌詞を渡すと音数が厳密一致し句で呼吸するメロ候補＋アクセント整合レポート」を載せる**。裁定の芯＝**アクセントは hard 制約にしない（検査とランクに使う）／Orpheus型フルDP・句頭repair は M-1 ではやらない（V2コア無変更）**。実データでアクセント厳密一致は31.7%・自作曲にも A-01 赤＝硬い刈りは自作曲すら生成禁止にする誤前提（C-audit 1.1/1.3）。
- **WP-L0 計画純関数 `apps/api/src/music/lyricsPlan.ts`（`planLyricMelody`）**：歌詞（改行＝行/句）→ `analyzeMoras`（@cm/music-core）で行ごとモーラ列＋特殊拍分類 → **オンセットロール**（normal/撥音ん＝実音・長音ー＝tie/直前へ延長・促音っ＝rest/gap）→ ①行→整数小節の句配分（largest-remainder・オンセット数重み・各句≥1小節・行数>小節数は統合し警告）＝ V2 既存契約 `phrases:{startBeat,beats,cadenceDegree}[]`（最終句 cadence=1・他=5） ②句内→per-bar 16枠パターン（coarsest-fit グリッド＝quarter→eighth→sixteenth で count が収まる最粗を選び先頭から敷く）＝ V2 既存 `rhythmParts:{custom,placement}`（**音数厳密一致の既存経路**＝`buildPartVariant` が mkMotif 抽選をバイパス）。**同パターンは custom id を再利用（R-13＝同モーラ数行が同リズム＝反復の回復）**。返り＝phrases/rhythmParts/`syllables`（オンセットかな列＝flowLyric＋整合採点用）/`lineHeadNoteIdx`（句頭 A-01 判定）/lines/warnings。純関数（accent spawn は呼び側 async）。
- **WP-L1 配線**：(a) `genMelody` opts に **`phrases`（配列直渡し）** を追加＝runV2 で `opts.phrases` を最優先（未指定＝従来 skelPhrases/phrasing 派生＝bit一致）。rhythmParts は既存経路。(b) 新 `genLyricMelodyCandidates`（generate.ts）＝N=8生成→各候補 `flowLyric(notes, plan.syllables)`（音数一致で1:1）→ `analyzeLyricFit`（accents 供給）→ **句頭A-01赤＞総赤＞整合score でソート**＋多様 top-k＋`meta.lyricFit={score,a01Head,a01Total,red,yellow,onsetMatch}` 添付（select はしない＝機械は候補まで）。(c) 出口＝**既存 chat verb `gen_melody` に `lyrics` オプション追加**（新 verb を作らず CHAT_VERBS 整合維持）。ハンドラ（async）が accents を **`accentsFromSyllables(plan.syllables)`** で1回だけ spawn 注入（失敗＝内蔵ヒューリスティック fallback・`accentSource` を返す）。
- **鉄則**：`lyrics` 未指定＝従来と bit一致（構造的＝phrases/rhythmParts 未注入）。V2コア（melodyCells 14段後処理）は無変更（地雷C-3を踏まない）。6/8系（compound）は `buildPartVariant` 対象外＝v1 未対応（警告して通常生成）。1番2番は守らない（#13裁定＝同メロ別歌詞は別ネタ・字脚のみ）。
- **受け入れ（機械）**：モーラ⇔音数（＝計画オンセット数）100%一致（全候補・property）／句頭A-01赤の件数を候補メタに表示（ゼロ強制なし）／整合score降順ソート／E-rule ガード維持（V2既存）／`lyrics` 無し bit一致。**残り＝リズム配分ヒューリスティックの質と耳較正約30%（A/C 指摘）＝M-1 は「音数一致＋句割り＋整合レポート」まで**。

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
**full spec＝`docs/research/melody-generation.md`**（理論3視点＋実装サーベイ＋骨格文法）。ここは設計の確定事項。**研究の全体根拠＝索引 `docs/research/README.md`**（到達点サマリ＋全docのグループ別目次（100本超・本数は索引が正））。
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
- **決定：骨格の「フォーム型リテラル回帰」（`skelForm`・2026-07-13 オーナーFB「8小節ランダムウォーク・2/4/8で構造使い回せ」）**：上の「骨格は4/8小節周期で自己反復＝コヒーレンスの素」を**実装として起こす**。現状 `genSkeletonFromModel` の反復は**2小節ユニットの輪郭反復(A A′ B B′)**だが、①輪郭が前音アンカーで絶対音がドリフト②再利用は頭スロットのみ③8小節でのAの回帰無し（後半BB′は新規）＝さまよう。→ **`opts.skelForm?:"period"|"aaba"`** を追加：`formPlan(form,nu)` が各ユニットに複写元を与え、`period`=後半[nu/2..]が前半をリテラル複写／`aaba`=u0をu1/u3へ回帰。複写は**度数インデックスをそのまま写す**（輪郭でなく＝耳に「同じフレーズ」）、**カデンツスロット(s=spu-1)だけ既存句末ルール**（phraseEnds/u%2/曲末）で差替＝終止の役割は形式で保つ。骨格→表面は一方向依存ゆえ**骨格1か所で階層反復が表面まで効く**。**既定 undefined＝現状の輪郭反復＝bit一致**。研究＋設計＝`docs/research/2026-07-13-skeleton-form-reuse.md`。実装 S1(genSkeletonFromModel＋TDD)→S2(gen_skeleton/MCP/web露出)→S3(耳較正・ABAB/AABB追加判断)。**✅S1/S2実装(2026-07-13)**＝S1コア(api878緑bit一致)＋S2配線(gen_skeleton MCP/HTTP form＋web SectionEditor「構造」select・api879/web536緑)。残=S3耳較正。
  - **WP-M2＝M9実測文法の骨格拡張(2026-07-14)**：`skelForm` に **`cadence-swap`／`sentence`** を追加（`period`/`aaba`/undefined は完全 bit一致＝新値のみ新挙動）。正典＝`docs/research/2026-07-14-motif-transform-stats.md`(M9)。実装＝`skelFormPlanNew`(複写計画)＋`pickSkelCopyMode`/`literalProbByDist`(距離条件付き変奏)＋`refitIdxToChord`(リズム保存・音高再フィット)を `genSkeletonFromModel` の新枝で消費（`melodyCells.ts`）。核＝①`cadence-swap`＝奇数ユニットが直前偶数(archetype)を複写し終止だけ差替(M9 §4 2-4小節帯)／`sentence`＝提示(u0)→反復(u1)→頭断片の畳み掛け(u≥2・fragmentation+加速)。②**距離条件付き変奏**＝near→vary/far→literal（M9 §4「近くでは変える・遠くでは戻す」・1小節窓literalシェア定数表・DB非依存で純関数維持）。③**リズム保存・音高コード再フィット**＝スロット構造(=リズム)不変のまま度数だけ現コードの和声音へ寄せる（M9 §7-4＝リズムが同一性の担い手・音高保存リズム変形の10倍）。表面 `motifMode:preserve` とは層が別（骨格→表面の一方向）＝二重機構でない。④**A A' A 原型回帰**＝複写元は常に fresh の原型を指し累積ドリフト禁止(M9 §6)。⑤反行/拡大/縮小はポップ語彙に無く不採用(M9 §2)。TDD＝`melody-cells.test.ts` skelForm WP-M2(距離でliteral率が割れる/リズム保存再フィット/原型回帰/E-ruleガード維持・api緑)。mcp/http/web セレクタへ2値追加。残=S3耳較正。

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

→ **旋法パレット＋エオリアン終止（WP-C1・2026-07-14・#7旋法の本実装）**。正典＝`docs/research/2026-07-14-mode-usage-stats.md`（自前コーパス210進行＋DT/Temperley統計）。
**問題**：`frame.mode` は long/short 2値のみで、Mixolydian(♭VII)/Dorian(♮6・IV長) 等の旋法色が出せない。短調終止も full(V→i)/loop([1,6,7]) 止まりで、実測第1位の**エオリアン終止(♭VI→♭VII→i)** が cadence 選択肢に無い（自前実測で ♭VI→♭VII 18本 > V→i 5本）。
**正準（frame.mode の2値は不変＝検出 rankKeys/移調/句辞書 mode との互換を保つ。旋法は mode の下の「パレット」＝scalePcs 集合差替で安く一級化）**：
- **`palette:"ionian"|"mixolydian"|"aeolian"|"dorian"`**（genChords opts・既定 undefined＝mode から ionian(major)/aeolian(minor)＝**従来 bit 一致**）。Lydian/Phrygian は載せない（supermode 外の #4̂/♭2̂＝ポップス実測で最少度数）。
  - **Mixolydian**（親major・スケール `0 2 4 5 7 9 10`）＝♭7̂・特徴和音 ♭VII。degrees 確定後の base に ♭VII を挿入＝**「次=I」規則遵守**（自前 ♭VII→I 20/24・DT post-tonic .159）＝末尾側の I 直前スロット(penult)を ♭VII 化し、無ければ penult→♭VII/last→I を強制。
  - **Dorian**（親minor・スケール `0 2 3 5 7 9 10`）＝♮6̂・特徴和音 IV(長)。**IV(長)は mid のみ**（終止に置かない＝自前 IV(長) last 2/26）＝中間スロットの IV を長3度化。
  - **Aeolian**（親minor・現行 MINOR_SCALE と同集合）＝既定短調＝現行 bit 一致。
  - **Ionian**（親major・現行 MAJOR_SCALE）＝現行 bit 一致。
- **`cadence:"aeolian"`**（短調 ♭VI→♭VII→i／長調 ♭VI→♭VII→I）を終止型に追加。既存 cadence 値の挙動は不変。短調は degrees を `[…,6,7,1]`（♭VI=degree6→[8,""]・♭VII=degree7→[10,""]・i=degree1）で上書き＝既存短調表の度数のまま実現。長調は base の C 基準 root を直接 `♭VI(8)→♭VII(10)→I(0)` で上書き（借用フラット）。penult/antepenult は index≥1 のみ・先頭 degrees[0]=1 保護。
- **スケールの集合共有（矛盾回避）**：`scalePcs(key, mode, palette?)` に palette 集合を追加。genMelody/genBass/genFromEssence の経過音スケールが `f.palette` を参照＝**旋法音が「調外」でペナルティ/avoid される矛盾を防ぐ**（生成だけ差替で評価が古い集合だと旋法音が消える）。`Frame.palette?` を追加＝frame 経由でメロ/ベースが旋法を継承（§4-3 point6「realize 時の scale 差替」）。E-rule の禁則は音程（三全音/7度/8度超）判定で scale 非依存＝旋法で禁則0は不変。
- **メロ句辞書は変更不要**（研究§2＝辞書に旋法色が薄い実測）＝旋法色はコード側＋scalePcs 追従で出す。Dorian は minor 辞書＋♭6→♮6 差替、Mixolydian は major 辞書＋7→♭7 差替で運用。
- **配線**：`gen_chords`(MCP/HTTP) に `palette` enum＋`cadence` に "aeolian" 追加。frameSchema に `palette` optional（メロ/ベース継承用）。既定＝未指定＝従来 bit 一致。**耳確認**＝mixolydian で♭VII の土臭さ・dorian の浮遊・aeolian 終止の疾走感（実機フローでしか出ない＝mode 結線は要試聴）。
- **web露出（2026-07-14・実機検収 H2 是正）**：`SectionEditor`「いじる▾ → この進行に生成」に**旋法セレクタ1個**（おまかせ=未送信=bit一致／明るめ ionian／土っぽい mixolydian／哀愁 aeolian／浮遊 dorian＝耳語ラベル流儀）を追加。選択は `useMelodyGen` の `frame.palette` として **gen_chords/gen_melody/gen_bass/gen_skeleton 全生成へ流す**（コードは特徴和音、メロ/ベース/骨格は scalePcs 差替で追従）。併せて `GEN_PARTS` に「コード」(gen_chords)を追加＝旧「web からコード進行を palette 付きで生成できない」を解消。`palette=aeolian`(=短調既定スケール)と `cadence:"aeolian"`(終止型)は**独立**（mode-usage-stats §4-1＝palette はスケール色・cadence は終止規則）＝旋法選択で cadence を自動付与しない。

→ **和声語彙拡張 3本立て（WP-C3・2026-07-14）**。正典＝`docs/research/2026-07-14-cliche-pedal-lines.md`（クリシェ/ペダル10型）・`2026-07-14-citypop-extended-voicings.md`（citypop）・`2026-07-09-brushup-audit-5areas.md`C（既存語彙の未接続）。前提＝2026-07-08 短調V7維持/終止追従・WP-C1 と共存。
- **スライス1＝既存語彙接続（variety）**。audit C「genChords が全mode で数種の進行に収束・`substitutesOf`(機能代理/相対/裏/同主調借用/二次ドミナント)が生成経路から分断」の是正。genChords opts `variety:0..1`（既定 undefined/0＝**従来 bit 一致**）＝base(C基準)確定後・palette 注入前に、中間和音(index 1..last-1・先頭/末尾のT は保護)を確率 variety で `substitutesOf` の代替候補へ差替（rng 決定的）。base は key=0 ゆえ root=調主音からの半音=`Degree.degree`。**効果の数値検証**＝bars=3 で基底ユニーク進行 ≤4→variety で増、bars=4 で 9→42（generate.test.ts C⑤⑥⑦）。borrow/secondaryDom と同じ「非ダイアトニックを確率注入」の枠＝ダイアトニック契約(§冒頭 line34)の既定は不変。配線＝`gen_chords`(MCP/HTTP) に `variety`。
- **スライス2＝ラインクリシェ/ペダル（`suggestClicheLines`・`music/lineCliche.ts`）**。度数進行を『縦(コード)』だけでなく『横(声部の半音線)』で記述する第一歩。10型辞書(§5-1)を相対度数で保持し、クリシェは sitting chord root 基準・ペダルは調主音基準で realize。手順(§5-2)＝①静的区間検出(同一 root+quality が≥2小節連続のラン)②型の第一次選択(minor→LC-min-desc系／major→LC-maj/bass系・region=I→PED-tonic・region=V→PED-dominant)③**3rd不動禁則**(型は root/5̂/bass のみ動かし 3rd を含む品質で構成＝品質反転しない・全ステップ和音に 3rd pc が残ることをテスト検証)④メロ衝突(動く半音線 pc とメロ pc が min2 でぶつかるステップがあれば `collidesMelody=true` で**降格・ブロックはしない**)⑤複数候補(型違い・非衝突→役割一致→辞書順で並べ上位 max)。静的区間ゼロ＝候補ゼロ＋警告(密な進行への押し付け回避§4)。出力＝差し込むライン＋ドロップイン全進行(region 外は不変)。content は既存の `{root,quality,start,dur,bass?}`(Chord 型に bass 既存・web も消費)で表現＝**スキーマ拡張不要**。配線＝MCP `suggest_cliche`(chat面・allowlist 追加＝許可漏れ厳禁)＋HTTP。**耳確認**＝内声クリシェの上品さ・PED-dominant のサビ前の溜め(要試聴)。
- **スライス3＝citypop プリセット（`applyCitypop`・`music/citypop.ts`）**。genChords opts `genre:"citypop"`（既定 undefined＝無変換＝**bit一致**）。realize 後の実音進行に対し①**機能別テンション付与**＝度数(調相対 pc)→citypop 品質(§6-1 変換表：major I/IV→maj9・IIm/VIm→m9・IIIm→m7・V→13・VII°→m7b5／minor i/iv→m9・♭III/♭VI/♭VII→maj9・V→13)。表外度数(借用/二次ドミナント/variety)は品質ファミリで糖衣(dom7→9・長三→maj7・短→m9)。②**分数化**＝長調の末尾カデンツ(…V→I)の V を IV/V(F/G＝`{root:key+5, quality:"", bass:key+7}`)へ柔化(§3 最重要・sus解決の採否は人)。③**やり過ぎ警告**＝`meta.warnings`(GenResult に optional 追加・未指定は**キー無し**＝bit一致)に非ブロックで併記(§6-3 均一Maj9・均一テンション)。**テンションは既存 QUALITY_INTERVALS(maj9/m9/13 等)＋bass 欄で表現＝スキーマ拡張なし**（research の tensions フィールド案は品質語彙が既にカバーゆえ不要＝「最小の形」）。設計含意§7 の tensions/bass/voicing 3フィールドのうち bass のみ実体化、tensions は品質へ吸収、voicing(rootless/drop2)は後段(人の仕上げ領域)。配線＝`gen_chords`(MCP/HTTP) に `genre`。**耳確認**＝maj9 の浮遊・IV/V の宙吊り・平板警告の妥当性(要試聴)。

→ **調プラン＝セクション間の転調設計（WP-C2・2026-07-14・スライス1）**。正典＝`docs/research/2026-07-14-modulation-catalog.md`（型12＋一時転調2・二大頻出=短3度上げ(サビ入り)/半音上げ(最終大サビ)・戻り方5型・生成結線案）。現状は frame＝セクションごと key+mode 宣言だが**曲全体が単一キー前提**＝転調の語彙が無い。その語彙を「調プラン候補」として吐く純関数を足す（**提案のみ＝自動適用しない**＝機械は候補まで）。
- **スライス1＝調プラン提案（`suggestKeyPlan`・`music/keyPlan.ts`）**。入力＝セクション役割列(intro/verse/prechorus/chorus/bridge/interlude/outro＝別表記A/Bメロ/サビ等を吸収)＋基準 key/mode。出力＝調プラン候補 N個。各案＝各セクションの `{role,key,mode}`＋境界 `PlannedTransition{from,to,typeId,name,semitones,prep,prepChords?,effect,returnPlan?}`。**カタログ12型を辞書データ化**(`MODULATION_CATALOG`＝id/半音移動/長短反転/調関係/準備手法/効果/**頻度重み1..5**/典型役割)。戦略＝役割→遷移テンプレ(catalog §5.2)＝サビ短3度上げ(M-MIN3-UP・重み5)/最終サビ半音上げ(M-HALF-UP・重み5・上げっぱなしR-NONE)/サビ全音上げ/ブリッジ遠隔+サビ短3度/同主調交替。**必ず『転調しない案』を先頭に含む**(洋楽トレンド＆選択肢・catalog §5.2-4)。転調案は score(頻度重み合計)降順で採り、no-modと同一署名のプランは重複除去。戻り計画＝基準へ戻る境界=R-INSTANT/その元がbridge=R-INTERLUDE/曲末へ上げて終わる=R-NONE。**一時転調(借用和音T-BORROW/T-SECDOM)は対象外＝frame不変**(catalog §1.1・セクション内コードイベント＝variety/borrow/secondaryDom 側の担当)。
- **スライス2＝遷移の準備和音（genChords `transition` opt）**。プラン適用時に境界セクション末尾へピボット/セカンダリドミナントを差す。`transition:{prep:"pivot"|"secondary_dominant", toKey, toMode?}`＝末尾コードを次調の準備和音へ差替(pivot=両調共通のダイアトニック和音＝`computePivotChord`／secondary_dominant=次調のV7＝`computeSecondaryDom`)。**既定 undefined＝bit一致**(従来の終止のまま)。無準備(direct)は transition を渡さない＝呼び出し側の責務。start/dur は差替前の末尾を保持。適用はcitypop後(境界意図が最終の勝ち)。
- **配線**＝`suggest_key_plan`(MCP chat面・**allowlist追加**＝許可漏れ厳禁BUG#1型)＋HTTP。`gen_chords`(MCP/HTTP) に `transition`。**web は見送り**（調プランを提示/適用する器＝セクション列UIが現状無く、最小露出を超えるため。器ができ次第の後続WP）。
- **スコープ外＝後続WP**：メロ骨格の**度数読み替え自動化**（転調境界の向こう側を新keyの度数系で解釈＝実音は semitones ぶんズレる・catalog §5.3）と**共通音の橋渡し**(pivot時の骨格アンカー)。skeletonレンダラが Transition を読む結線は本スライス未着手（骨格側の対応は別WP）。ゲーム用途のループ整合制約(末尾key=先頭key・上げっぱなし禁止・catalog §6)も後続。

→ **曲構成テンプレ＋エネルギープラン（WP-X1・2026-07-14・提案系2 verbs）**。正典＝`docs/research/2026-07-14-song-form-statistics.md`（構成型辞書 §5-A＝VC型支配・**Bメロ=トグル**・8小節基準/16拡張・ポストコーラス2010s標準13.3%・J-pop伝統形・ボカロ短尺・アニソンTVサイズ89秒）＋`docs/research/2026-07-14-energy-arc-arrangement.md`（5次元＝密度/音域/レイヤ/ラウドネス/細分化・**知覚エネルギー=前セクション比Δ**＝谷→山[落ちサビ→ラスサビ]・プランテンプレ3種・レイヤ写像表 §5.5・**提案止まり=人が崩す** §6）。思想＝「機械は候補まで・仕上げは人間」＝構成もエネルギー設計も**候補として提示するだけ**（自動適用しない）。keyPlan.ts の流儀に揃える（純データ辞書＋純関数＋「提案のみ」）。
- **役割語彙（form/energy 共有）**＝`FormRole`＝intro/verse/verse_var(A')/prechorus(Bメロ)/chorus(サビ)/postchorus/bridge(Cメロ)/interlude(間奏)/**drop_chorus(落ちサビ)**/**last_chorus(大サビ)**/outro。既存 `SectionRole`(generate.ts 7値)は生成器の内部語彙で、落ちサビ/大サビを chorus へ丸めるが、**エネルギー設計では谷/山を区別する必要がある**ため form/energy 層は richer な語彙を持つ（生成へ落とす時に drop_chorus/last_chorus→chorus へ写像）。
- **スライス1＝構成型辞書＋`suggest_form`（`music/formLibrary.ts`）**。`FORM_LIBRARY`＝F01..F14（14型・doc §5-A 表を純データ化：型ID×名称×文脈×役割列(小節)×フラグ hasPrechorus/hasPostchorus/chorusFirst）。`suggestForm(opts)`＝genre で候補型を辞書引き→ `bridge=false` で後半ドラマ削除→ Bメロトグル(on/off/auto)反映→ 尺目標があれば**削除優先順位 `Inst>O>I>A'>B`**（`DELETE_PRIORITY`・短尺化の実証3-C一致）で切り詰め→ **尺内(目標+10%以内)に収まる案だけ**を目標近い順で返す(収まる案皆無なら最短1案)。TVサイズ89秒は F06(38小節=76秒)が収まる。**提案のみ**（役割列を song の place_child や gen_* の frame.section へ落とすのは人/上位）。
- **スライス2＝エネルギープラン＋`suggest_energy_plan`（`music/energyPlan.ts`）**。役割別×次元別の**絶対レベル(1..5)プロファイル**をテンプレ3種(`jpop_standard`/`ballad`/`four_on_floor`＝doc §5.2/§5.3/§5.4)で持ち、**前セクション比Δ(−2..+2)はその差分**で導く（知覚エネルギー=Δ）。各セクション＝{role, absLevel(low/mid/high/peak), delta:EnergyVector(5次元), layerAdd/layerDrop(§5.5写像表), **knobs**}。落ちサビ=谷(density/layers Δ<0・伴奏DROP)→ラスサビ=山(Δ最大化+2・全部入り)。明示 last_chorus 無しでも複数サビの最後をピークへ昇格(最終サビピーク・§2.1)。
- **既存生成ノブへの翻訳（knobs）＝実在ノブ名のみ**（`REAL_KNOBS`＝density/registerShift/energy/runs/swing/foreground＝存在しないノブ名を出さない）。絶対プロファイル→ density(0.25+d*0.1＝chorus0.65)/registerShift((r-2)*2＝chorus+4)/energy(level*0.2＝frame.section.energy)/runs(subdiv>=3で発火)。**SECTION_PRESETS(generate.ts) と整合**（chorus density0.65/register+4）＝提案値がそのまま frame.section や gen_melody へ渡せる。D3 layers/D4 loudness は単一ノブが無く**レイヤ写像(トラック抜き差し)＝arrangement guidance** として出す（ノブでなく layerAdd/Drop）。
- **配線**＝`suggest_form`/`suggest_energy_plan`(MCP chat面・**allowlist追加**＝許可漏れ厳禁BUG#1型)＋HTTP。**web は見送り**（構成列/エネルギー設計を編集提示する器＝セクション列UIが現状無い＝WP-C2 と同事情）。チャット③次の一手(plan_next)/song_state との親和性＝構成候補は「次に何を書くか」の骨、エネルギープランは各セクションの生成ノブ指針＝将来 song_state のセクション役割へ紐付けて gen_* の frame.section 既定へ流せる（後続WP）。
- **受け入れ(TDD)**＝TVサイズ89秒→合計小節が尺内・Bメロトグル反映(off で全候補 prechorus 無)・落ちサビ→ラスサビでΔ谷→山・**提案がノブ名と値の実在整合**(REAL_KNOBS 内・0..1/半音レンジ)。`test/formEnergy.test.ts`(18本)。

→ **感情語→パラメータプリセット（WP-E1・2026-07-14・提案系1 verb）**。正典＝`docs/research/2026-07-14-emotion-to-parameters.md`（入口=離散語/内部=V-A のハイブリッド §1・構造特徴×感情の実証写像 §2・日本語語彙のV-A化 §3・**混合感情=valence正負が分離共存→層別逆符号＋2バリエーション** §4・**プリセット表17語** §5・**過信警告** §6）。思想＝「機械は候補まで・仕上げは人間」＝感情語を**実在ノブの推奨値へ翻訳して提案するだけ**（自動適用しない・1ノブで決めない・過信警告を必ず添付）。energyPlan.ts/keyPlan.ts の流儀に揃える（純データ辞書＋純関数＋実在ノブ allowlist＋「提案のみ」）。
- **`emotionMap.ts`＝17語プリセット純データ＋`suggestEmotionParams({word?,V?,A?})`純関数**。各プリセット＝{word, aliases(別表記/英語), V(−1..+1), A(0..1), mix(正負混合フラグ), reason(一行根拠), variations[]}。各 variation＝{label(標準/陽寄り/陰寄り), **mode**(最重要・§1.3 mode>tempo>register), **palette**(旋法色), **tempoBpm**(第2ノブ・レンジ), **knobs**(連続ノブ推奨値), note(近似注記)}。混合4語（切ない/エモい/懐かしい/情熱）は§4に従い**陽寄り/陰寄り2案**。語→辞書引き（別表記/英語/空白ゆれ吸収）、引けなければ V-A 最近傍へフォールバック、双方無しは null。
- **実在ノブ allowlist（`EMOTION_KNOBS`）＝registerShift/density/swing/expression/articulation/flow/runs/foreground/borrow/secondaryDom**（gen_melody genMelody opts＋gen_chords opts の実ノブのみ・mode/palette/tempoBpm は typed で別持ち）。**存在しないノブ名を出さない**（energyPlan REAL_KNOBS と同流儀）。Lydian/Phrygian/Locrian・sus/add9/減和音/#11・下降バス等**現行ノブで表しきれない和声語彙は近似（dorian/borrow 等）＋note に「要手作業」を明記**＝捏造しない。
- **配線**＝`suggest_emotion_params`(MCP chat面・**allowlist追加**＝許可漏れ厳禁BUG#1型)。**既存 `emotion_shift`（単体コードの品質を darker/brighter へ）とは別物**＝重複させず新 verb（片や1コード品質シフト・片や感情語→生成ノブ翻訳）。返り＝V-A＋mix＋reason＋variations＋**warning(一言)＋disclaimers(要点)**。**web は見送り**（感情プリセットを編集提示する器＝生成ノブ UI へ流す結線は後続・チャットで「切ない感じで」→具体ノブ翻訳が第一目的）。
- **受け入れ(TDD)**＝17語ちょうど・**全 knobs が allowlist のみ参照**＋**allowlist が実コード(mcp.ts/generate.ts)のノブ語彙と一致**（スキーマ照合）・混合4語→2案(mode/palette/tempo で差)・非混合→1案・固定値(悲しい=短調遅い疎/明るい=長調速い)・別表記英語吸収・V-A 近傍フォールバック・**過信警告を必ず添付**・提案不可は null・chat面露出＋callTool 実返り。`test/music-emotionMap.test.ts`(12本)。

→ **和声張力カーブレンズ（WP-C4・2026-07-14）**。正典＝`docs/research/2026-07-14-harmonic-tension-curve.md`（TIS採用）。思想＝**審判でなく設計レンズ**＝候補を弾かず・単一正解を出さず・「山場をどこに置くか」を見る（既知の結論＝理論スコアは質を測れない＝ガードレール止まり・R²≈0.56 天井を踏襲）。WP-M3（メロ候補レンズ）と同格の**候補レンズ**＝content 不変・meta 添付のみ・純TS・度数+品質+key のみ・音源不要。
- **TIS 計算器（`@cm/music-core/harmonicTension.ts`・純関数）**＝コード/キーの pc集合 → 12次元クロマ → 離散フーリエ変換の低次6係数 → 知覚重み[3,8,11.5,15,14.5,7.5]（Bernardes TIS）付き **TIV（6次元複素）**。距離＝ユークリッド μ（`tivDistance`＝進行跳躍 d1・声部進行代理）／角度 θ（`tivAngle`＝キー整列 d2）。不協和 **c＝1−‖T_norm‖/M**（単一pc=0=最協和 → 全12pc=1=最不協和／テンションノート9・11・13th は pc を足す＝c が単調増＝**別ロジック不要**・research §2.2/§4 の両立定義）。キー基準は**トニック三和音**＝I が d2≈0 の安息点（音階集合基準は V が I より近く出て機能張力を測れず不採用）。木構造(prolongational h)は**既定 off**（重い＝プロノブ・research §5.3）。
- **張力プロファイル（`tensionProfile`）**＝各コードの c/d2/d1/表面張力 ss（転回=bass≠root で加算・research §1.3）を固定スケールで 0..1 化 → 合成重み**不協和0.45／調距離0.30／進行跳躍+表面0.25**（research §5.3・木なし再正規化・**暫定＝耳較正で更新**）→ 隣接移動平均で平滑。出力 tension は 0..1（役割帯と同スケール）。**単調性＝ドミナント(V7)>トニック**（c＋d2 で駆動・TDD `harmonic-tension.test.ts`）。
- **役割別・目標カーブ帯（`TENSION_BANDS`・research §5.4 正準テーブル）**＝verse 低・prechorus 右肩上がり・chorus 頭で解決→中盤一山・bridge 貯めて放出。適合＝`fitToBand`（帯逸脱・小さいほど良）＋`peakPlacementReward`（山が狙い位置）＋`cadenceRelief`（**偽終止V–vi/IV–I は「未解決の快」＝減点しない**・prechorus/bridge の高張力終端を良とする・research §3.2）−`monotonyPenalty`（平坦減点）＝`scoreCandidate`（高い=良い）。
- **モーダルループ自動降格（`detectModalLoop`・research §6-3）**＝機能希薄な循環＝カーブが意味を失う条件で `score=null`（並べ替え対象外・警告文言）。判定＝(a) 三全音不在（ドミナント V7/vii° 無し）かつ〔反復ループ（I–V–vi–IV/アクシス等）または トニック始・非トニック終の宙吊り循環（i–♭VII–♭VI–♭VII）〕、または (b) 合成張力の分散が閾値未満（ペダル/ドローン＝平坦）。機能進行（I–IV–V7–I）は三全音ありで除外。**未実装だと「機能希薄な良進行」を不当に低評価する事故**＝要ガード。
- **並べ替え（`rankByTension`）**＝候補を score 降順で安定ソート（同点=生成順＝WP-M3 流儀）・null（降格）は原順で末尾＝機械は候補まで・単一正解を出さない。
- **配線＝生成側露出（`music/harmonicTensionReport.ts`）**＝`gen_chords`(MCP/HTTP) 応答の chord_progression 候補へ `meta.tension`（curve/band/role/score/modalLoop/warning）を添付。**content 不変＝bit一致**（メタ添付のみ・並び不変）。gen_chords は単候補返し＝N候補は variety+seed違いで複数回呼び `rankByTension` で並べる（呼び側）。**web は見送り**（進行候補トレイ UI が現状無く最小露出を超える＝器ができ次第の後続）。**耳確認**＝役割帯の妥当性・モーダルループ降格の当たり判定（要試聴）。

→ **16分細分＝走句(runs)と前借り(push)（2026-07-09・理論不足総点検 Step4・本丸1）**。full＝sixteenth-rhythm.md。
**現状認識**：語彙 RHYTHM16_DATA は16分裏slot・走句パターンを**既に含む**。gen出力の16分ほぼ0%（実曲44-56%）の原因は**語彙でなく選別抑圧**＝score の `n16Pen`/`runPen`（16分裏・走句を減点）＋受入音数上限。density は総量ノブで「走句らしさ(連続16分)」「前借り(食い)」を狙って出せない。
**正準（Phase1-2＝データ不要・Phase3データは後）**：
- **`runs` 0..1**（既定 undefined＝従来一致）＝走句の出やすさ。効き：(a) rhythmVocab を**走句含有量**（隣接16分ペア数）で再重み付け `w * pow(runPairs+1, runs*k)`（density の densW と同型・積で合成） (b) score の `n16Pen`/`runPen` を runs で減衰（`*(1-0.85·runs)`） (c) 受入音数上限 hiN と lenPen 目標を runs で拡張。**ピッチ論理は新設しない**＝既存の走句処理（run→方向保持 `render/mkMotif`・run後 gap-fill）に乗るだけ。
- **`push` 0..1**（既定 0＝従来一致）＝division-level syncopation（前借り・食い）。既存 `anticipate`（位置固定・タイ・終端不変）を V2 後段（swing の直前）に適用＝**毎小節同じ拍を16分ぶん前へ**。push 量で対象拍数を可変（0.33で3拍目・0.66で1,3拍・1で1,2,3拍）。compound(6/8) は対象外。
- **評価目標**（sixteenth-rhythm.md）：16分音価率 44-56%・16分onset連続率~66%・孤立16分は稀。**Phase3（データ）**＝POP909量子化再計測で位置別run確率/前借り位置率を `motifModelData.ts` に同梱しヒューリスティック重みを学習分布へ差替（別コミット・要ローカルPOP909）。
- **配線**：V2 opts `runs`/`push`→genMelody→gen_melody(MCP/HTTP)→UI。既定＝未指定＝従来。**耳確認必須**（density/swing 同様）＝runs 0/0.4/0.8 × push 0/0.5 マトリクスを実機で。既定値は据え置き0・推奨プリセットのみ doc化。
- **6/8（compound）の走句拡張（2026-07-10・初手）**：4/4と違い6/8は**グリッド(8分6枠)と語彙(RHYTHM68_DATA)のレベルで16分が不在**＋run旗が compound で全false固定＝runsノブが完全no-op。初手＝runs>0 指定時のみ compound の `mkMotif` を16分12枠へ切替（c704441）。→ **改訂：この「8分基底＋runs後付け」は4/4(常時16分基底)との非対称＝二重グリッドを生む。下記の16分基底統一へ置換。**
- **6/8リズム基底を16分12枠へ統一（2026-07-10・full＝2026-07-10-68-grid-unify-16th.md）**：6/8を4/4と同型の「**16分12枠を常時基底・単一語彙・runsは再重み付けに降格・grid切替廃止**」へ。`RHYTHM68_DATA`(6枠)＋`RHYTHM68X_DATA`(12枠)を単一12枠語彙へ統合し既定は8分主体に高重み。解像度と密度は独立（密度は語彙重み＋`n16Pen`が支配・4/4が16枠でも四分打ちを出せる実証）＝16分基底でも8分主体の6/8が既定で自然に出る。6/8階層（拍頭0/1.5・8分=一次分割・16分=二次分割）は grid 細分と無関係に保持。**既定 bit破壊は意図**（現8分6枠既定が誤り）。表面ノブ(swing/push/drumLock/backbeat/converse)の`!compound` gateは今回維持（別件）。
- **16分走句の同音潰れ修正（2026-07-10・full＝2026-07-10-melody-16th-scalar-run.md）**：走句の音価はレガートだが音程が同音反復に潰れる（実測4/4=47%/6/8=42%）。原因＝render走句が半音±1で `snapList`、タイブレークが昇順先着（低い方）ゆえ上行の全音境界で同音へ戻る＋フォールバックも半音でデッドコード。正準＝案B（`rns!==undefined && run旗`ゲートでスケールindex±1移動＝`clampScale`/`nearestIdx`）。生成側(mkMotif rdir=±1)・score は無改修＝**renderの解釈のみ**。runs未指定 bit一致維持。
- **メロ生成メニュー整理＋counter露出（2026-07-10・full＝2026-07-10-melody-menu-consolidation.md）**：SectionEditorの10ノブ無階層ベタ置きを基本(density/swing/runs/expression)＋"▸詳細"の二段へ。counter(対位)を固定0.3自動送信から**ON/OFF＋弱0.2/中0.4/強0.7の3択**へ露出（既定OFF=未送信=bit一致・bass非在でグレーアウト）。API契約不変・SectionEditor.tsx一箇所。
- **動機保存レンダ＝反復音モチーフ旋律（2026-07-10・Phase2案B・full＝2026-07-10-motif-preservation-arch-DESIGN.md／理論＝2026-07-10-motivic-repeated-note-melody.md）**：反復音フック（ラーラシドラ/シーソッソッ）が出ない根本＝V2が反復音を4層で潰す＋動機の同一性が非保存。正準＝**動機を「音の列でなく図形」として扱い、和声適応は音を曲げず"置き場所(移高段k)を選ぶ"新経路 `motifMode:"preserve"`**（既定undefined＝従来レンダ＝bit一致）。二眼審査(Fable理論+Opusコード・v2でPASS)の確定事項：(a)degは格納せず`cumsum(mv)`遅延導出（mvがSSOT）、(b)hookゲートは単一r()ドロー形でbit一致、(c)保護マスクはstart時刻ベース構築＋placeNonForbidden/placeNearの書込先も保護、(d)realizeの同一性不変量＝同degグループ一括snap・輪郭符号不変、(e)**カデンツ>動機保護>単一頂点**、(f)強拍CTは"率"でなく質+位置条件(2度以内/b9=0/add9-6-maj7除外/ペダル端点/カデンツ100%)、(g)移高はヒステリシス(同ラベル同k)＋seq限定連鎖2-3段、(h)適応フォールバック階段=k→inflect(末尾1音±1)→truncation→snap(内部禁則はfallback確定)。ノブ hook/articulation/inflect も既定0=bit一致。preserveの強拍CT率緩和と単一頂点非強制は**意図的な美学変更**（反復音フックは足場型＝複数平頂点が正常）。実装順=bit一致ハーネス赤先行→deg導出往復テスト→保護マスク空集合no-op証明→renderPreserve別関数→展開。耳較正必須。
  - **実装到達点（2026-07-10）**：U1-U7＋二眼レビュー反映まで実装済（api753緑・web321緑）。commit a21bb76→f6a275e＋57c6989(ブラッシュアップ)＋449a00c(completeMelody preserve既定・k質的CT/対ベースw2)＋b720a0a(U5逐語反復・同ラベルk literal再利用)＋78b27c3(web露出 hook/articulation)。二眼レビュー実測：オーナー例(ラーラシドラ)再現・zeroSeeds0・bigLeap~0・強拍非CT3%(b9/avoid0)・禁則0・同音率0.25-0.29・micropause可聴化。**構造制約**（後処理が文脈依存ゆえ）＝A/A''のリテラル全音一致は非対象、保護反復音(フック)の回帰一致が狙い。**残**＝Phase3案D観点別候補(製品判断・hookスライダーで代替可)・役割プリセットhook既定(耳較正後)・耳較正(hook既定値/くどさ/micropause深さ)。

→ **メロ×低音の声部進行レンズ（2026-07-09・理論不足総点検 #8・分析のみ）**。backlog和声③「完全に未監視」への回答。`analyzeVoiceLeading(upper, lower)`（voiceLeading.ts）＝並行完全5度/8度・直行(隠伏)5度/8度・声部交差を数え score(1-違反/機会) を返す**分析レンズ（生成非介入）**。`analyze question="voiceleading"`（MCP）＋ http `analyze_voiceleading`。bass 明示 or chords のルートを低域(36+pc)で代用。良し悪しの断は人間（機械は指摘まで＝設計思想）。

→ **候補レンズ＝メロ候補の並べ替え眼鏡3種（WP-M3・2026-07-14）**。正典＝`docs/research/2026-07-14-research-to-implementation-plan.md` Tier1＋各研究doc（`2026-07-14-expectation-theory-melody.md`／`-earworm-hook-features.md`／`-singability-tessitura.md`）。
**思想（絶対）**：レンズは審判でない＝候補を弾かず・総合点で1本に潰さず、**選んだ軸で候補トレイを並べ替えるだけ**。レンズ未選択＝**生成順（既定 bit 一致）**。全レンズ**純TS・記号（半音move＋拍位置）のみで計算**（音源不要）＝`@cm/music-core/melodyLenses.ts`（`packages/music-core` に純関数、api/web が共有）。全レンズ headline score は**高い＝良い（上位）**に揃える。
- **① 期待理論レンズ `expectationLens`**（M5）：句内ICカーブ（句頭=高IC／句中=順次で低IC／句末直前=こぶ／句末=低IC＝納得）への適合度 0..1。IC＝Schellenberg近接＋Narmour反転(gap-fill)の簡易サロゲート（句頭は境界=高IC固定）。句割りは休符(≥1拍)＋2小節上限で内部導出。高い＝目標カーブへ適合。
- **② フック度レンズ `hookLens`**（M6）：F1内部反復/圧縮・F2輪郭コンヴェンショナリティ(弧)・F3局所勾配の希少度(一点際立ち)・F4順次率・F5音符密度・F6リズム規則性・F7フレーズ短さ・F8低サプライザル＋G1位置ゲート(chorus1.0/prechorus0.9/bridge0.8/verse0.7…)。**積型近似** score=position×compression×(0.7+0.3×distinctiveness)＝「大域平凡×局所一点」。反復は過剰で微減（天井）。
- **③ 歌唱難度レンズ `singabilityLens`**（M7）：跳躍(幅×着地音高×上行×パッサッジョまたぎ・最重w0.30)＋tessitura乖離＋音節密度＋音域端＋パッサッジョまたぎ。既定 voice_profile＝女性ポップ平均(最低G3/快適tess A3–D5/地声上端D5/裏声上端E5/passaggio Bb4–F5)を**ハードコード**＋引数で差替可（voice_profile 本体の frame 宣言は WP-M4）。返り score=**1−difficulty**（高い＝歌いやすい）。歌詞母音×高音項は歌詞前=0。**ソフト減点**基本＝弾かない（思想）。
- **配線**：api `attachMelodyLenses(res,{frame,chords,sectionRole})`（`melodyLensesReport.ts`・voiceLeading添付と同型）が各候補 `item.meta.lenses={expectation,hook,singability}`（headline 3値・高い=良い）を付す＝gen_melody(MCP/HTTP)両経路。web `useMelodyGen` が候補トレイに**並べ替え軸セレクタ**（生成順/期待理論/フック度/歌いやすさ）＋スコアバッジを足す（既定=生成順=挿入順=**bit 一致**）。UI は器を改造しない（tinker-ux-redesign 不可侵＝セレクタ1個＋バッジのみ）。
- **初期重み＝全て仮**（各研究doc §重み初期値）。［耳/手］＝レンズ順の妥当性・重み較正は後日一括。**レンズは弱い補助**（記憶性≠好み・説明力低＝研究doc警告）＝決め手にしない。

→ **voice_profile＝声種プロファイルの frame 宣言＋ボカロモード（WP-M4・2026-07-14）**。正典＝`docs/research/2026-07-14-singability-tessitura.md`（§6-2 声種別レンジ表・§6-3 ボカロ緩和表）＋`2026-07-14-vocaloid-grammar.md`。
- **契約**：`frame.voice_profile`（任意・**未指定=bit一致**）＝プリセット名（`female_pop`/`male_pop`/`mix`/`vocaloid`・日本語別表記可）**or** カスタム（`{base?, low, tessLow, tessHigh, chestTop, falsettoTop, passaggioLow, passaggioHigh, vocaloid?}`＝base プリセット＋部分上書き）。型＝`VoiceProfileSpec`（`@cm/music-core`）。`resolveVoiceProfile(spec)` が `VoiceProfile` へ解決（不正/未知=undefined＝落として bit 一致）。プリセット＝`VOICE_PROFILES`（`FEMALE_POP_AVG`/`MALE_POP_AVG`/`MIX_POP`/`VOCALOID`）。
- **配線(a) レンズ**：`attachMelodyLenses(res,{...,profile})` が frame.voice_profile を解決して `singabilityLens` へ渡す＝**難度評価が声種依存**（例：D5メロは女性平均で易・男性平均で難）。
- **配線(b) 生成音域窓**：`genMelody`/`genSkeletonCandidates` は **voice_profile 指定時のみ** `profileTpBase(vp,registerShift)` で音域窓中心(tpBase)を声種 tessitura へ寄せる（窓 `[tpBase-5,tpBase+12]` を `[low,falsettoTop]` に収める）。未指定＝従来 tonic中心クランプ＝bit 一致。registerShift(セクション役割)はプロファイル上でも相対で効く。
- **ボカロモード**：`voice_profile:"vocaloid"`＝`VOCALOID`（上端 falsettoTop=C6=84 開放）＋`vocaloid:true` フラグ。`singabilityLens` は voca 時 **跳躍/音節密度/パッサッジョ/母音×高音の難度ペナを 0**（声帯・母音修正・声区の生理制約なし）。音域端は falsettoTop=C6 基準で「C6まで無罰・超で軽微」に自然化。tessitura は残す（広域許容だが山場設計の観点）。**BPM/密度/跳躍/転調の"尖り値"はプリセットの提案どまり＝ノブで振れる（vocaloid-grammar §0-3「既定固定＝逸脱の自由が死ぬ」）＝ノブ強制はしない**。
- **web**：`useMelodyGen` に声種セレクタ（おまかせ/女性/男性/ミックス/ボカロ）＝空=未送信=bit一致。gen_melody/gen_skeleton の frame へ `voice_profile` を載せる。SectionEditor 詳細段「フレーズの組み立て」に select 1個追加（器改造なし）。
- **［耳/手］**：音域窓の追従量・ボカロ緩和の効き・端滞在秒数/重みは研究doc初期値＝要・耳較正。

→ **motif-driven前景＝自由材料の同音/跳躍（2026-07-09・理論不足総点検 Step5・本丸2）**。full＝motif-extraction.md §4.5。
**問題**：前景が「ダルダル」＝実曲は自由材料に跳躍14%/同音23%あるが、gen は**跳躍ほぼ0%・同音を潰す**。犯人＝(1)全ブロックが単一モチーフ M の A/A'/B/A'' 派生で自由材料が無い (2)`mkMotif`/`varyTail` が同音(move=0)を ±1 に潰し・跳躍を2度にクランプ＝contour が均される。
**正準**：
- **`foreground` 0..1**（既定 0＝**従来完全一致**）＝自由材料の割合。派生ブロック(role≠0)を確率 `foreground` で `freeVary` に置換：M のリズムは保つ（コヒーレンス）が contour を引き直し、**同音(move=0)を潰さず・跳躍(|move|≥3)をクランプしない**＝実曲の「跳ぶ/留まる」を回復。禁則(三全音/7度/8度超)は後処理が従来通り除去＝**合法性は不変**・単一頂点維持。決定的（fg=0 では確率抽選の rng を引かない＝bit一致）。
- **配線**：V2 opts `foreground`→genMelody→gen_melody(MCP/HTTP)→UI。既定＝未指定＝従来。**耳確認必須**（メロの性格が変わる＝churn回避のため既定 0 据え置き・推奨値は耳セッションで較正）。残（finer）＝motif占有率を実測値(23%)へ寄せる比率制御・リズム変形(augment/diminish)。

→ **音価の長短対比＝付点セル注入ノブ `rhythmicContrast`（rc・2026-07-21・✅実装）**。正典＝`docs/research/2026-07-21-melody-note-value-and-harmonic-rhythm.md`（メロ音価/理論/和声リズムの3監督ブリーフ）。
**芯（監査で再定義）**：「生成メロが機械的」の正体は **CV0 ではない**（生成の句内CVはむしろ0.7-0.85＝過大側・句末延長は `flow` が実装済で過剰）。**真の欠落＝付点 long-short ペア**（実POP≈16.7%・生成≈0%＝均等8分＋過大白玉の二極で中間階調が皆無）。∴rc の仕事＝**句内リズム語彙に付点セルを注入して分布を正規化**（句末着地には触らない＝flow の領分・スコープ外）。
- **`rhythmicContrast` 0..1**（既定 undefined/0＝**bit一致**）＝付点対比の強さ。効き所＝`melodyCells.ts` の **`rhythmVocab` 構築**（本番 onset 語彙・`mkMotif`→`weightedPickRec` が消費）に `densW`/`runW` と同型の乗算係数 **`rcW(p)=pow(dottedCells(p)+1, 3*rc)`** を掛ける。`dottedCells(p)`＝パターン p の隣接 onset 間隔が **3slot(0.75拍=付点8分) or 6slot(1.5拍=付点4分)** の数。**6/8(compound) は rc 対象外**（`pick68u` に rcW を掛けない＝rc は 4/4 系のみ・付点対の実測は 4/4 pop 限定・複合12slot格子では別物＝「6/8はドラム3ノブ対象外」と同じ前例・監査修正#1）。**新規 r() ドローを足さない**（重みだけ差替・支持集合/列順/draw数不変＝genChords の transitionWeights / blendDeg と同先例）。render の dur ループは無変更（gap→dur 導出で 0.75/1.5 がそのまま付点音価になる）。
- **既定 bit一致の担保**：三項条件 `dens===undefined && rns===undefined && rc===undefined` で生語彙を素通し（rc未指定）／rc=0 も `pow(x,0)=1`・`×1.0` が IEEE754 厳密不変＝全既存メロテスト bit一致（`melody-cells-v2.test.ts` の「rhythmicContrast」describe＝OFF 多seed `toEqual`・density/runs/flow 併用も）。
- **実測（40seed×8小節・flow=0.35・中央値）**：付点 long-short ペア率 OFF 3.8% → **rc=1 で14.8%（実POP帯10-17%）**・dur 0.75 のノート 4.5%→21.3%（中間階調復活）・句内CV 0.72→0.65・音価種類 4→5.5・決定性/dur>0/禁則ゼロ/終止着地 維持。**受入帯は 0.50–0.70 に統一**（テスト実装帯・旧記載0.50–0.65は rc=1 のCV0.652が帯外に落ちる矛盾があった）＝**rc=1 は帯の上限付近**・**分布正規化の推奨は rc≈0.5**（付点onset率14.8%≒コーパス14.3%・CV も帯中央寄り0.585）。監査独立再測（別ハーネス）＝rc=1で付点ペア率13.3%・CV0.683、rc=0.5で11.1%・CV0.604＝同じ物語を再現。**step2（score n16Pen 較正）は step1 単独で目標到達ゆえ不採用**（付点ペアがむしろ僅減）。
- **`rhythmParts` 活性時＝onset はパーツ優先で rc 不干渉**（パーツ経路が mkMotif の onset 語彙をバイパス＝onset 列はパーツ通り・テストで担保）。「無効」は過言＝**onset は不干渉・借用輪郭(音高)は rc の rng 列変化で変わり得る**（監査修正#7）。
- **配線**：V2 opts `rhythmicContrast`→genMelody(`so.rhythmicContrast`)→gen_melody(MCP inputSchema/destructure・HTTP `num(b.rhythmicContrast)`)。**role プリセット(SECTION_PRESETS)には未投入**（オーナー耳確認後）。**耳確認必須**（既定 undefined 据え置き）。

→ **和声リズム⑨＝コード交替の速さ（design memo・2026-07-21・別Fable監督／正典＝`docs/research/2026-07-21-…-harmonic-rhythm.md` §2/§5.2）**。**⚠️memo のみ＝今回コード生成は触らない**（rc＝メロ音価が先・⑨は後続 WP）。
- **裏取り済（§2）**：在DB 210進行の実測＝**変わり目は100%強拍**（小節頭75%/半小節25%・弱拍0%）・コード dur は事実上 `{2,4}`（半小節/1小節）の二値。∴**グリッド＝半小節固定・変わり目は強拍のみ**が実測正準。
- **⚠️ 加速テンプレの目標データはコーパスに無い**（終盤 ii-V 圧縮＝0/210）。**相対加速（最終小節が自進行のコード dur 中央値より密）＝0/210**＝末尾に≥2コードを持つ進行自体は 98/210 あるが**全て均一2/小節（半小節×2）＝終盤で密度が上がる加速ではない**（減速型72 ≫ 加速様9）＝R0再構築で半小節格子＋弱拍0%に潰れた。∴頻度データ不在ゆえ**確率でなく決定的テンプレ**で入れる（理論⑤は強く支持）。
- **第1スライス＝加速テンプレ（invasive でない・既定OFF=bit一致）**：`generate.ts:348` の `base.map(...)`（1小節=1コード・start=i*bpb・dur=bpb）の**後段**で、終止手前(penult)小節の V を **`[IV(dur=bpb/2), V(dur=bpb/2)]`** に分割（colorful は `[IIm7, V7]`）。**根拠＝終止小節2和音ペアの実測分布（§2・在DB210）**：IV→V 9／I→IV 9／IV→I 8／I→V 5／V→I 4／**IIm→V 0**＝`[IV,V]` が最頻ゆえ既定・`[IIm7,V7]` は在DB 0件ゆえ colorful 限定。**⚠️適用条件を訂正**（旧「full/plagal 終止のみ」は誤り＝plagal は penult=IV・full も vii° があり得る）：**penult 和音が実際に V（度数5）のときのみ**分割する。**vii°/IV(plagal)/♭VII(aeolian)/loop 進行の penult には不適用**（終止の役割を壊さない）。⑩(終止前=D)のリズム版。**citypop 分数化(:352 applyCitypop＝末尾V の IV/V 分数化)との順序は要テスト**（加速分割→分数化 か 逆か・二重変形の衝突を避ける）。既定（テンプレOFF）＝`chords` は現行 map のまま＝bit一致。
- **第2スライス＝密度ノブ（invasive・後回し）**：1/小節↔2/小節を半小節グリッドで可変（強拍固定・セクションエネルギー連動）。**評価目標＝cpb（小節あたりコード数）分布を在DB210へ寄せる：~1.0=19%／中間28%／~2.0=53%**（§2）。ただし `genChords` は「1小節=1スロット」前提（funcs/degrees も小節index・`chordAt(bar*bpb)`）＝**度数ウォークをコード枠(slot)単位に作り直す**必要。**同時に骨格/NCT の小節頭コード前提（`chordAt(bar*bpb)`＝V2 の pcsOfBar/skeleton が bar 単位でコードを引く）の解消が必須**（半小節でコードが変わると小節頭サンプルが後半を取りこぼす）。既定1/小節で bit一致は保てるが本体は invasive＝第1スライス(テンプレ)の後。
- **メロと噛み合わせ（理論⑤）**：メロの長音アンカー（rc/flow）を和声リズムの遅い所に、細かい所を速い所に置く＝別WPで結線。**⚠️結線時の要注意＝rc の付点・白玉が半小節分割の変わり目をまたぐと和声とズレる**→⑨結線時に **flow と同型の和声ガード**（変わり目直前で長音を切る/またぎを禁じる）を検討。
→ **第1スライス実装＝#30（立場B採用・後処理スプリット/マージ・監査反映済／2026-07-22・✅実装）**。

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

→ **WP-M1＝骨格の脱平面化をコーパス駆動へ（`skelColor` ノブ・2026-07-14）**。Round1-3 で骨格の主音平面は既に割れ（`genSkeletonFromModel` の実測 強拍CT **64.8%**＝コーパス実曲 65.8% に一致・輪郭も arch/valley/desc に分散）＝**骨格層の脱平面化は到達済み**。本WPは「素の生成が無菌」の**残り＝倚音がコーパス駆動でなく偶発**を埋める。契約：
- **`skelColor` 0..1（`genSkeletonFromModel` opts・既定0/未指定＝bit一致）**：強拍スロットの下段後処理で **コーパス駆動の accented NCT（倚音）** を確率 `color×0.2` で注入。倚音は**次スロット度数の1音階段隣＝必ず段進行で解決**（Fux/古典の倚音規則・裸で放置しない）。上から入り下へ解く型（upper）優先、カデンツ/開始/末尾スロットは保護、前スロットからの跳躍が完全5度超になる置換は却下（**E-rule 禁則跳躍を新たに作らない**）。倚音判定は `chordPcsPerBar`（強拍が和声内か）を要する＝`genSkeletonCandidates` が構築して渡す。裏付け数値＝`docs/research/2026-07-14-skeleton-corpus-stats.md` §5（強拍CT 65.8%＝強拍の1/3が非和声音）。
- **効き（実測・80seed・C major I vi IV V×2）**：既定 強拍CT 64.9%→color0.5 で **61.3%**・color1.0 で 59.1%（実曲帯 60-70% を維持）／強拍NCT の**段進行解決率 38.7%→47.5%**（偶発NCTを principled 倚音へ置換）／禁則跳躍率は不変（ガード成立）。輪郭 prior 注入は**見送り**：カデンツ/句末アンカーが soft 包絡を上書きし robust に寄らない（forced-asc prior でも出力は arch へ潰れる）＝輪郭は骨格DPのソフト制約 λ（`docs/research/2026-07-14-contour-template-dictionary.md` §6.2）で入れる別WP。
- **露出＝骨格層のみ（正直な結線）**：`gen_skeleton`（MCP/HTTP）＋ web「色付け[素直|少し|濃い]」（骨格の机 `SkeletonEditor`）。**`gen_melody` の一発表面経路には出さない**＝表面は骨格を**ブロックアンカー**にしか使わず強拍を `ctOf` で和声内へ再スナップするため skelColor は surface 強拍CT を動かさない（実測 0.878 不変）＝出すと**罠ノブ**（memory「modeは層をまたいで結線」）。骨格の色は **gen_skeleton→capture→realize** の骨格アーティファクト経路で活き、surface の脱平面化は既存 `expression`（0.7 で強拍CT 66.9%＝実曲帯・耳ゲート案件）が担う＝両者は層分業（骨格=principled 候補／surface=保持量）。
- **再計測（07-09 レビュー③「主音平面がノブを飲む」の追試）**：`phrasing=asymmetric` は skelColor 有無に依らず既に **40/40 seed で baseline と変化**（D-P1 の phraseEnds 骨格結線で「14/30」は解消済）＝主音平面はノブを飲まなくなっている。skelColor は「無菌さ」の残り（倚音の質）を埋める補完で、ノブ実効の回復は前段で達成済みと確認。

→ **WP-M1b＝輪郭prior＝骨格生成へのソフト制約λ注入（`contour` ノブ・2026-07-14）**。WP-M1 で見送った「輪郭 prior」を別WPとして起こす。正典＝`docs/research/2026-07-14-contour-template-dictionary.md` §6.2（型の包絡 target(t) へ `cost += λ·dist` でソフト注入・境界固定/中間緩め・型は連続空間のプロトタイプ）＋ `docs/research/2026-07-14-skeleton-corpus-stats.md`（実測輪郭 arch38%/valley25%/flat2%）。契約：
- **`contour` ∈ {arch|asc|desc|valley}（`genSkeletonFromModel` opts・既定 undefined＝bit一致）**：型の3点包絡（Huron I–M–F）から `target(frac)`（tonicIdx からの音階ステップ）を作り、**モデル提案 idx と target の凸結合**（`x=idx+mix·(target−idx)`・`mix=λ/(1+λ)`＝§6.2 の二乗距離コスト最小化と等価）でスロットを寄せる。**ハード置換でない**。**中間スロットのみ**に効き、**unit末＝カデンツスロット（終止/句末アンカー）と skelForm 複写スロットは保護**＝WP-M1 の轍（アンカーが soft 包絡を上書き＝forced-asc でも arch へ潰れた）を「アンカーに勝とうとせず中間で効かせ、始点を下げて終止主音は残す」設計で回避。振幅 `ampC=kopf≈5̂`（レンジ窓内）・初期 **λ=1.0（mix=0.5）**。決定的（RNG 非消費）＝`contour` 未指定は完全 bit一致。前音跳躍が三全音/8度超になる寄せは前音側へ戻す（E-rule 不変）。
- **合成順序＝skelForm（構造複写・最優先）＞ contour（包絡ソフト制約・fresh生成時）＞ skelColor（強拍倚音・後段）**。skelForm 複写は保護、contour は fresh スロットを型へ寄せ、skelColor はその後で強拍に倚音を足す＝三者非破壊。
- **効き（実測・60seed・C major I vi IV V×2・対称句）**：終音>始音率 baseline **0.00→asc 0.82**（desc/valley は 0.00＝方向が型で割れる）／頂点位置平均 arch **0.43**（中央帯）・desc 0.24・valley 0.15／全 seed で曲末＝主音（終止アンカー保持）／contour+skelColor 併用でも強拍間 禁則跳躍率は跳ねない（ガード成立）。**λ=1 は「効果が実測できる最小域」として十分・過剛でない**（中間のみ・アンカー保持）。
- **露出＝骨格層のみ**（skelColor と同方針）：`gen_skeleton`（MCP/HTTP）＋ web 骨格の机 `SkeletonEditor`「かたち[おまかせ|山|のぼり|くだり|たに]」。`gen_melody` 一発表面経路には出さない（表面は骨格をブロックアンカーにしか使わない＝罠ノブ回避）。骨格の輪郭は **gen_skeleton→capture→realize** 経路で活きる。残＝［耳/手］実機試聴（輪郭の聴感・型ごとの弧が耳に立つか）・自コーパスからの役割別輪郭 prior 自作学習（研究doc §8 未確定）。

→ **WP-M1 第2スライス＝cadDeg／contour のコーパス prior 結線（`cadDegStrength`／`contourCorpus` ノブ・gen_skeleton 専用・2026-07-22）**。slice A（`skeletonDegPrior`＝骨格構造音の度数分布を POP909 `degHist` へ寄せる・`degPrior` blend）は draw 数不変で bit 安全だった。本スライスは slice A が触らなかった **(1) 句/曲の着地度数（`cadDeg`）と (2) 旋律輪郭（`contour`）** を、**いずれも骨格層（`gen_skeleton`）のみ**でコーパスへ寄せる。両者は「着地ルール固定・RNG 構造」に触る＝slice A と違い naive には bit 安全でないため、**独立 RNG ストリーム＋既定 OFF ゲート**で bit 一致既定を担保する（`genSkeletonFromModel` の `rF`＝formNew／`rA`＝skelColor と同じ「主 RNG `r` を消費しない別系列」の手筋）。素材は既存 `corpusStats.ts` の純関数を再利用（新ローダ不要）。
- **層の正直な限定（実コードの事実・重要）**：cadDeg も contour も **表面（`gen_melody`）には出さない骨格層専用**とする。理由＝表面は骨格を `blockAnchorFromSkeleton`（`melodyCells.ts`＝`skel[bar*bpb]`＝ブロック頭 downbeat のみ）で読み、句末カデンツスロットは一切参照しない。さらに表面の句末カデンツパスは各句最終onsetを `cadPc(ph.cadenceDegree)`（`opts.phrases` のルール度数を {1̂→主音／5̂→属音／2̂→上主音} に固定写像）で**上書き**する＝骨格の cadDeg サンプル結果を句末最終音でちょうど消す。よって cadDeg を表面へ効かせるのは「表面カデンツパスが骨格のサンプル済み着地度数を受け取る contract 拡張」＝別スライスの仕事。本スライスはそこに手を出さず、**骨格候補（`gen_skeleton` の deliverable＝「機械は候補まで」）の cadDeg / contour を寄せることに限定**する。
- **(1) cadDeg（着地度数バイアス）＝`cadPrior: Map<0..6,number>`＋`cadDegStrength`（既定0＝bit一致）**：句末カデンツは現状**ルール固定**で `smp`（サンプリング）非経由＝`idxOf(4,…)`（中間句末＝5̂半終止）と `idxOf(peHit.deg,…)`（`phraseEnds` 指定の {5̂→4, 2̂→1, else→0} 写像度数）で決め打ち。ここへ `skeletonDegPrior(priors,"cadDeg",minor)`（既存関数・pc→スケール度・非ダイアトニック破棄・正規化）で得た `cadPrior` を寄せる。
  - **測定汚染の明示（研究doc §4-1 の自己申告）**：実測 `cadDeg`（major＝1̂23.6/2̂18.4/5̂18.3/3̂16.8/6̂12.8%・`skeleton-corpus-stats-20260714.json`）は **POP909 にフレーズ注釈が無く「4小節窓の末尾」で代用した近似**であり、研究doc自身が「major で 2̂ が 18.4% と高いのは半終止と窓ズレの混合で分離不能」「7̂/4̂ 各3.8%もクロマ汚染下」と明記。したがって本スライスは **cadDeg を「真の句末分布」と称さず「窓末尾近似の弱バイアス」として扱い**、候補集合を安定音に制限する。人手フレーズ注釈での再計測（`music-x-lab/POP909 hierarchical-structure-analysis`・研究doc §5-2）を **`cadDegStrength` 上限（現8）を実効的に引き上げる前提条件**とし、それまでは低 strength（目安1〜2）運用を推奨。
  - **候補集合＝安定音 {1̂,2̂,3̂,5̂,6̂}（スケール度 {0,1,2,4,5}）に制限**：`cadPrior` から不安定・汚染度数 {4̂=deg3,7̂=deg6}（各3.8%＝クロマ/窓ズレ混入）を落とす。高 strength で属七の第7音(7̂)や下属(4̂)へ着地して句末が濁るのを防ぐ。
  - **サンプル関数 `sampleCadDeg(ruleDeg, cadPrior, strength, rCad)`**：候補分布＝**ルール度数へのアンカー（重み1）＋ `strength·cadPrior`（安定音のみ）**（`blendDeg` が既存キー再重み付けなのに対し、こちらは**加算候補集合**＝カデンツがルール度数から動ける）。`weightedPickNum` で抽選。`strength=0` なら候補＝{ruleDeg:1} のみ＝ruleDeg 決定的（gate 済みなので実際には strength>0 でのみ走る）。
  - **bit 一致既定の具体経路**：`const cadActive = !!(cadPrior?.size && (cadDegStrength ?? 0) > 0)`／`const rCad = makeRng((opts.seed ?? 1) * 40503 + 271)`（`rF` と同様に**無条件構築だが独立系列**＝主 `r` を一切摂動しない）／`const cadDegOf = (d)=> cadActive ? sampleCadDeg(d, cadPrior!, cadDegStrength!, rCad) : d`。固定カデンツ度数だけを包む＝`idxOf(4,…)`/`idxOf(peHit.deg,…)`（計6サイト）を `idxOf(cadDegOf(…),…)` に置換。`cadActive=false` で `cadDegOf(d)===d`＝引数バイト同一＋`rCad` 未 draw＋主 `r` 列不変＝**バイト一致**。番人＝既存メロ/骨格 bit 一致テスト。
  - **最終主音は保護**（不変条件）：`lastU`（曲末ユニット）の `idxOf(0, pi, tonicIdx)` は `cadDegOf` で包まない＝曲の最終着地＝主音は構造規則として硬く残す。`smp` 経由の非句末サンプル（既に `degPrior` が効く）も不変。
- **(2) contour（輪郭型のコーパス選択）＝`contourPrior: [label,pct][]`（既定 undefined＝bit一致）・曲単位サンプル**：WP-M1b の `contour`∈{arch|asc|desc|valley} は**呼び手が固定 enum を渡す**決定的・RNG 非消費の型テンプレ。本スライスは `loadSkeletonPriors(...)["contour"]`（実測 arch38.5/valley25.3/descending15.2/ascending12.8/wave5.9/flat2.3%）から**型を曲単位（1骨格＝1型）でサンプルして** WP-M1b の既存 nudge（`applyContourNudge`＝決定的・中間スロットのみ・アンカー保護）へ食わせる。「RNG 構造に触る」のはこの型抽選（1骨格あたり `rCon` 1 draw）だけ。
  - **曲単位にする技術根拠**：nudge の位置指標 `frac=(base+s)/(slots.length-1)` は**曲全体位置**で、`contourTargetIdx` はこの曲全体 frac で包絡を評価する。ゆえに**句単位サンプルは「曲中盤の unit に arch を引いても frac 0.5-0.75 の下降尾しか当たらず、その句の形として実現しない」**。加えて 1 unit=2小節=4スロットに対しコーパス contour は「8スロット=4小節窓」分類＝**粒度も不一致**。曲単位（build 1回につき 1 型）なら曲全体 frac の意味と整合し、coherence も担保。
  - **ラベル写像**：`arch→arch`／`valley→valley`／`ascending→asc`／`descending→desc`／`wave・flat→undefined（＝その骨格は nudge 無し）`。落とす 8.2%（wave+flat）は「型付けしない骨格」として素直に扱う（正規化し直さない＝コーパス比率に忠実）。
  - **bit 一致既定の具体経路**：`contourTargetIdx(frac,ctype)`／`applyContourNudge(idx,frac,prevI,ctype)` を **`ctype` 引数版へ機械リファクタ**（旧 module const `contour` を仮引数化＝`ctype=opts.contour` を渡す限り挙動同一）。`const contourActive = !!(contourPrior?.length) && opts.contour===undefined`（**明示 enum が勝つ**）／`const rCon = makeRng((Math.imul(opts.seed ?? 1, 2246822519) >>> 0) + 59)`（**`Math.imul` で乗算オーバーフロー回避**＝seed が大きくても下位ビットが潰れて別 seed が同一系列に落ちない）。**u ループ開始前に1回だけ** `const unitContour = contourActive ? sampleContour(contourPrior!, rCon) : opts.contour`。nudge 行を `if (unitContour && s!==spu-1 && !fromCopy) idx = applyContourNudge(idx, frac, pi, unitContour)`。`contourActive=false` で `unitContour===opts.contour`＝nudge 行バイト同一＋`rCon` 未 draw＝**バイト一致**。
  - **合成順序**（WP-M1b を継承）＝skelForm（複写・最優先）＞ contour（fresh 生成時・型へソフト寄せ）＞ skelColor（強拍倚音・後段）。三者非破壊。
- **ノブと既定**（新規・いずれも `gen_skeleton` のみ）：`cadDegStrength`（0..8・**既定0**・`corpus:true` が prior 源）＝0 で **現行 gen_skeleton とバイト一致**。`contourCorpus`（boolean・**既定false**）＝false で現行 gen_skeleton とバイト一致。両ノブとも prior 未投入（`hasCorpusStats=false`）なら空＝graceful に従来 fallback。**gen_melody には露出しない**（表面カデンツパスがルール度数で上書きし cadDeg が消える＝罠ノブになるため・上記「層の正直な限定」参照）。
- **積み残し（オーナー判断・別スライス）**：①cadDeg/contour を表面（gen_melody）へも効かせたい場合＝表面カデンツパスが骨格のサンプル済み着地度数を受け取る contract 拡張＝別スライス起票。②cadDeg 統計の人手フレーズ注釈での再計測＝`cadDegStrength` 上限解放の前提。③`cadDegStrength` を `corpusStrength` と共有するか独立ノブのままか（現状＝独立・slice A の `corpus:true`=degHist 出力を保護）。

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

→ **humanize 知覚較正（WP-D2・2026-07-14・正典＝`docs/research/2026-07-14-humanize-perception-defaults.md`）**。研究の定説（①ランダム単体はグルーヴを上げない／入れるなら白色でなく **1/f(長距離相関)**（Hennig）②JND≈6ms・単発 40ms 超で「ヨレ」顕在化③部位別非同期閾＝K/S/HH≈20ms・Bass≈30ms・柔アタック/メロは緩め）を feel 層 `applyFeel` の humanize 実装へ**整合**させる。**鉄則＝挙動が変わるのはノブ ON 時の"質"のみ・humanize 0＝従来 bit 一致（tempo/part 有無に不依存）**。既定ノブ値は変えない（app は既定 0＝未送信）。
  - **(a) 1/f 化**：旧実装の白色寄り AR(1)（`te=decay*te+(1-decay)*white`）を **Voss-McCartney ピンクノイズ**（決定的・`feel.seed` 派生・出力 [-1,1]）へ置換。**同 seed 同系列**（bit 再現性）。tempo 無指定＝従来同等の拍比スケール（`disp = hum·pink·0.03拍`・上限 0.031 拏維持）。
  - **(b) 部位別リミット＋ms 絶対時間**：`FeelCtx.tempo` 指定時は **ms 絶対時間**で計算（`msPerBeat=60000/tempo`）。部位テーブル（timing SD・系統オフセット・リミット ms）×テンポ帯倍率（Fast♩≥140 ×0.7／Mid ×1.0／Slow♩≤90 ×1.3）。ノブは `既定 25%＝表の SD` を基準に線形（`ms = 4·hum·SD·mul·pink + hum·offset·mul`＝100% で表の 4 倍＝盛り上限帯）。**部位別クランプ**＝K/S/HH 20・Bass 30・Chords 35・Melody/default 40（超過は据え置き）。`Kick=基準杭(SD最小)・Snare=laid-back(+offset・early 禁)・Bass=kick 追従・Melody=最自由`。
  - **(c) ヨレ警告**：設定レベル警告＝`4·hum·SD·mul > 40ms`（＝この設定は単発 40ms を超え得る＝盛りすぎ）で `FeelCtx.onWarn({kind:"humanize-yore",part,peakMs})` を発火（決定的・RNG 非依存）。既定帯（hum≤0.3）では未発火。
  - 露出：web「人間味」ノブの段ラベル/説明を耳語で更新（きっちり/自然に/よく動く/生っぽい・「揺れは 1/f＝人間寄り・部位別に上限あり」）。playback/MIDI 書き出しの `applyFeel` に `tempo` を渡し ms 経路＋警告を実機で発火（part 別付与＝混在ストリームの分離は残タスク＝backlog）。

→ **シンコペ密度スコア＋「ノリ」レンズ（WP-D2・2026-07-14・正典＝`docs/research/2026-07-14-syncopation-sweet-spot.md`）**。**逆U（中程度が快最大・山は下寄り非対称）／量よりパターン（ランダム撒きは快を増やさない）／全層いっぺんに盛らない**を設計値へ。思想＝**審判にせず"ノリのレンズ"（並べ替え・非破壊・候補を殺さない）**（melodyLenses と同格の純関数＝`@cm/music-core/syncopation.ts`）。
  - **LHL 度数化**（`metricWeights`）：1小節を格子化（4/4→16分16セル・6/8→8分6セル）・メトリック階層で重み（downbeat=0・以降 −1,−2,…＝弱いほど負）。`lhlSyncScore(onsets, meter)`＝onset の次発音までに**より強い被覆位置**があれば `s=w(強)−w(onset)>0` を積算 → `raw / perBar(÷小節数=主指標) / perNote`。**層別**（drums/bass/melody）に別算出（合算でなく層別ベクトル・§3配分制御に必須）。durは不要（次 onset までを被覆＝休符/タイ同一視・単声近似）。
  - **候補ノリメーター**（§6-2）：gen_drums/gen_bass/gen_melody 候補へ `meta.sync={perBar,perNote,norm(0..1),zone(素直/跳ねる/攻める),band,fit}` を**読み取り専用添付**（melodyLensesReport 流儀＝content 不変・bit 一致鉄則）。norm＝raw を暫定基準 `SYNC_REF` で 0..1 化（**絶対値は指標依存＝自前コーパス実測で要較正**・§7）。band＝セクション役割別ターゲット帯（Intro/Verse 0.15–0.35／Prechorus 0.30–0.50／Chorus 0.40–0.60ピーク下寄り／Bridge 0.50–0.75／Outro 0.10–0.30）＋補正（テンポ 100–120 +0.07／<80 or >140 −0.10・和声高テンション −0.10・ジャンル funk +0.15/ballad −0.15）。fit＝帯内=1・外は距離で減衰（**弾かず並べ替え**）。
  - **層合成の飽和ガード**（`sectionNoriLens`・§6-3）：drums/bass/melody の層別 norm から**全層同時高＝飽和**（present≥2 かつ全 norm≥高帯）で `saturated:true`＋警告／**アンカー床**（どれか1層 norm<0.35＝刻み or バックビートの床）欠如で警告／合算予算超過で警告。**降格はするが消さない**（思想順守）。saturation は「盛りすぎ＝逆U右肩落ち」の一次ガード。

→ **曲の形 D-P1＝骨格が句割りを見る（2026-07-09・5領域監査D）**。監査で「phrasing実効80%は化粧＝非対称で変わるのは句末1-2音・**骨格が句割りを見ていない**」と実測。→ `genSkeletonFromModel` に `phraseEnds?:{bar,deg}[]` を渡し、unit尾のバーが句末なら**句のカデンツ度数**へ着地（対称=各unit尾に整合／非対称=unit尾に落ちる句末のみ・可変長ブロックP2は別）。genMotifMelodyV2 が opts.phrases から phraseEnds を算出。**未指定=従来 u%2 の 5̂/1̂＝bit一致**。実測：非対称 vs 既定が **14/30→40/40 seed で変化・平均8音/8小節が変わる**（化粧→構造的）。Round1-3の脱平面化/registerと直交。残（本丸）＝**可変長ブロックP2**（blockループを句長駆動へ）・sequence/diminution・sentence テンプレ＝別の focused session＋耳。

→ **曲の形 本丸＝sentence形式(移高反復＋断片化)（2026-07-09・2方向評価で方針転換）**。監査Dの「四角さ」に対し、当初案(可変長ブロック)を**2方向評価が棄却**：理論「容器(長さ)は形式を生まない・過程(断片化+sequence→カデンツ)が生む」／実装「可変長はfallbackモチーフ非スケールで15%破綻＋骨格格子が2小節固定で不十分」＝**両者が「過程を固定グリッド上で先に・可変長は最後」に収束**。
- **`form:"sentence"`**（既定 undefined＝**従来AABA=bit一致**）：固定2小節グリッド上でブロックに機能を割当＝**提示(bi=M)→反復(sequence=Mの輪郭を2スケール段 移高して再生)→継続(fragment=Mの先頭半小節セルを逐語で畳み掛け＝密度↑=加速)→カデンツ(既存toTonic)**＝起承転結。可変長ブロックは使わない（容器リスク回避）。
- **sequence**＝最も可聴なpop展開(同一性＋運動・anchor移高で実現)。**fragment**＝継続の推進(先頭サブセルの逐語反復＝freeVary禁止で覚えられる動機の同一性を保つ)。後処理(強拍CT/禁則/単一頂点/カデンツ)は位置ベースで生存。
- 実測：継続部(bar4-5)の密度が上がる(1.5→2.8＝加速)・30/30で既定と変化・終止着地/禁則(アルペジオ除く)ゼロ/単一頂点 維持。V2 opts→gen_melody(MCP/HTTP)→SectionEditor「形式」ノブ。**耳確認**＝起承転結に聞こえるか(gestaltは耳)。→ **可変長ブロック[3,3,2]（容器・2026-07-09）**：phrasing 指定時、ブロックループを**句駆動の可変長**に（句を1ブロックとし**句長のモチーフ** motifByLen で作る＝真の非対称[3,3,2]＝3小節/3小節/2小節ブロック）。mkMotif/score/genBest を blockBars でパラメータ化、全滅時 fallback を blockBars スケール（空尾破綻 15%→1.9%）、単一頂点の B塊判定を bar集合化。**既定/補完(phrases無し or seedMotif)は固定mb・単一M＝完全bit一致**（rng draw順保持）。実測：asymmetric が3小節ブロック構造・空小節1.9%・集計指標(既定path)不変。＝形式(sentence)＋容器(可変長)＋骨格結線(D-P1)で D 一巡完了。残＝period精緻化・sentence×可変長の併用磨き・耳での gestalt 確定。

→ **セクション役割の一級化＋registerShift ノブ（2026-07-10・理論裏取り＝`docs/research/2026-07-10-section-role-framing.md`）**。実証（van Balen 2013＝サビは高音域・高密度／Dai 2020＝セクション末は V→I 0.94・1̂ 着地・長音価／Summach 2011＝prechorus は溜め上げ）を、`Frame` に**セクション文脈**を足して既存ノブで表現する。**唯一の新機構＝registerShift**（他は既存ノブの配線）。
- **`frame.section?: {role?, prevRole?, nextRole?, seedMotif?, prevEndPitch?, energy?}`**（全 optional・未指定＝**従来 bit 一致**）。`role`＝`intro|verse|prechorus|chorus|bridge|interlude|outro`（`normalizeFrame` が enum 外・別表記(pre_chorus/pre-chorus)を吸収し不正は黙って落とす＝meter 頑健化と同方針）。role は mood（雰囲気）と直交する構造上の位置。
- **役割→既存ノブのプリセット表**（初期値・**全て耳較正前提**）＝「未指定ノブの既定値差し替え」。**優先順位＝明示ノブ＞role プリセット＞従来既定**（`applySectionPreset` は opts で undefined のキーだけ埋める）：

  | ノブ | intro | verse | prechorus | chorus | bridge | interlude | outro |
  |---|---|---|---|---|---|---|---|
  | density | 0.3 | 0.45 | 0.55 | **0.65** | 0.5 | 0.4 | 0.3 |
  | **registerShift(半音)** | −2 | 0 | +2 | **+4** | 0 | 0 | −2 |
  | repetition | — | 0.85 | 0.9 | **0.9** | 0.6 | — | — |
  | motifBars | 2 | 2 | **1** | 2 | 2 | — | — |
  | breathe | 0.5 | 0.3 | **0** | 0.1 | 0.3 | 0.3 | 0.5 |
  | expression | 0.15 | 0.25 | 0.25 | **0.15** | 0.4 | — | — |
  | foreground | — | 0.3 | 0.15 | 0.1 | **0.5** | — | — |
  | phrasing | — | symmetric | asymmetric | symmetric | asymmetric | — | — |

- **registerShift（★新設・飽和必須）**：V2 の tessitura は `tpBase=clamp(60+tonicPc,60,65)` 固定でノブが無かった。`tpBase' = clamp(tpBase + registerShift, 58, 70)` の**飽和付きシフト**にする（sp 構築の1行＋ opts 透過のみ・下流 clamp は全て sp[0]/sp[last] 参照で追従）。**飽和は Round3 の「B5金切り域」の轍を踏まないため必須**（ceiling は tpBase'+12 ≤ 82）。registerShift=0＝tpBase 不変＝bit 一致。`registerShift` は opts の一級ノブでもあり明示指定が prreset に勝つ（saturation テストの直接レバー）。
- **energy（0..1・提案止まり）**：**自動アークは敷かない**（「仕上げは人間」哲学と衝突＝研究doc ⑤で確定）。明示された時だけ density/registerShift のプリセット値を線形スケール（energy=0.5 が表の値）。role→プリセットまでが本線。
- **モチーフ共有＝新機構なしの配線**：`section.seedMotif`（前セクションの実音ノート列）→ `extractMotif16()` → `genMotifMelodyV2` opts `seedMotif`（`keepFirstBlocks` は渡さない＝先頭ブロックが種 M＝「同じ動機の別レンダリング」＝リズム保持・音域移動・ピッチ再解釈）。role とは独立に seedMotif 有無で発火。`section.prevEndPitch` → 骨格開始音（`genMotifMelodyV2` opts `skelStart`→`genSkeletonFromModel` opts `start`・未指定=62=bit一致）。
- **role の SSOT＝Neta の tags `role:` 名前空間**（`prj:` の前例に倣いカラム追加なし。#14「複数プロジェクト prj:」と並記）。prev/next は song コンテナの children（position 順）から導出＝保存不要。
- **配線**：`genMelody` opts に `registerShift` 追加＋V2 分岐で `applySectionPreset`／`extractMotif16` を通す・MCP `frameSchema` に `section` 追加（description で「role を書くだけでプリセットが効く」ことを Claude 脳へ明示）・http `gen_melody`/`gen/section` は frame 透過（section は frame に載る）・web `SectionEditor.genPart()` は Section ネタ tags の `role:` を読み frame.section.role へ（tags に role 無し＝渡さない＝従来）。**ロール入力 UI・曲テンプレ・日本語 title 推定は後続タスク（スコープ外）**。
- 数値は方向のみ実証・大きさ未実証＝40seed×role の分布実測＋耳セッションで較正（研究doc ⑤）。

→ **フィール層分離＝スイング/微小タイミングは非破壊の feel 層（2026-07-11 確定＋Stage1-4実装済・full＝`docs/research/2026-07-11-swing-feel-layer-audit.md`／音楽理論監査 by Fable）**。
> **実装ログ（2026-07-11）**：Stage1-4 完了。①`@cm/music-core` に `applyFeel/warpTime/unwarpTime`（単調ワープ・web/api単一実装・core22緑）②web再生(playNotes→useTransport)・MIDI書き出し境界に配線③生成側は swing焼き込み/band-aid/dur=gapクランプ/humanizeタイミングを撤去し `content.feel={swing,humanize,seed}` を書く（notes常時ストレート・humanize velocityはデータ層残置）④SectionEditor の `sectionFeel()`＝メロトラック content.feel を全トラックへ同一適用（アンサンブル・gen_bass/drums 複製不要）。既定0＝bit一致・swing>0はデータ表現が変わる意図的bit破壊。end-to-end確認：swing0.9×16分でフラム0（旧衝突バグ解消）。api770/web333/core22緑。**実機反映は api 再起動が要る（コード変更）**。残＝テンポ連動比/lay-back（Stage5・backlog）・明示的なセクションfeel UI・「notes常時ストレート」契約の再入力経路アサート。オーナー指摘「スイングはストレート譜面に後からかけるフィールのはず。生成時に `note.start` を書き換える現実装（上の `swing`＝1172）は作曲データを歪め16分と衝突する」が理論的に正しいと確定。**この項は 1172 の "8分裏を 0.5→0.5+swing/6 へ後段書き換え" 方式を正準として置換する**（S7 backlog `1147`／S8 `1157`「スイングは後段の打点マップ」に実装を合わせ直す＝上位に従う）。
- **2つの誤りの是正**：(a)**層**＝スイングは performative（記譜=ストレート・演奏=跳ねが音楽の制度／MuseScore・Ableton Groove・Logic Q-Swing も全て非破壊・再生時適用）。(b)**写像**＝正しいスイングは**拍内の単調な区分線形タイムワープ**（`W(0)=0, W(0.5)=0.5+s/6, W(1)=1`・**start と end を両方**写像）。x.5 だけ動かす部分写像は非単調＝16分(x.75)との 0.10拍衝突（フラム）は必然。単調ワープなら 16分は自動的に入れ子で跳ね（s=1で {1/3, 5/6}）衝突は原理的に消え、逆写像 W⁻¹ が存在（quantize/往復編集が可逆）。
- **正準アーキ**：**SSOT＝ストレート格子上の notes**（pitch/start/dur/vel）。**feel＝`{swing:0..1, swingUnit?:"eighth"|"sixteenth", humanize?:0..1, seed?}`** を content（トラック）／セクション共有で保持＝**notes に触れない宣言的パラメータ**。**`applyFeel(notes, feel, ctx{barLen,compound,tempo}): Note[]`**（純関数・決定的・単調ワープ＋humanizeタイミング揺れ）を**レンダ境界3点**（web再生スケジューラ・MIDI書き出し・API音声レンダ）に挿す。MIDI は feel 適用後を書く（ABILITY で鳴らして跳ねて聞こえるのが正＝performance MIDI／将来「ストレート書き出し」は適用しないだけで自明に追加可）。
- **層の割り当て**：compositional（譜面に書ける＝push/drumLock=シンコペ・pickup=弱起・flow=音価・articulation・humanize velocity・backbeat アクセント）は**データ層に残す**（ただし格子上の値で書く＝⑥-2）。performative（swing・humanize タイミング揺れ）は**feel 層**。合成順序＝データ層 → feel: swing（系統的ワープ）→ humanize タイミング（確率揺れ・ワープ後の時間上）。
- **アンサンブル一貫性**（配当）：feel をセクション/composition のプロパティにすれば**全トラック（メロ/ベース/ドラム/コード）が同一ワープに乗る**＝現状の「メロだけ跳ねてドラム/ベースはストレート」という様式的事故（監査③-4）が解消し、gen_bass/gen_drums への swing 複製実装が**不要**。トラック別オーバーライドは上書きで表現。
- **段階（TDD・feel.ts 新設）**：①`applyFeel` 純関数＋テスト先行（単調性/16分入れ子/start・end両写像/compoundスキップ/feel無し=恒等=bit一致/W⁻¹∘W=id）→②消費者配線（web再生・MIDI・音声／web(JS)・api(TS)は同一テストベクタで契約固定）→③生成側切替（swing 後段・SWING_ROOM band-aid・swing用 dur=gapクランプ・humanize タイミング部を撤去し `content.feel` を書くだけに。humanize velocity はデータ層残留）→④アンサンブル feel（セクション共有）→⑤テンポ連動比/lay-back/走句ストレート拍ポリシー＝backlog。
- **後方互換**：swing/humanize **未指定(=0)＝全段恒等＝bit一致**。swing>0 は notes がストレートになる＝**意図した bit破壊**（データ表現が変わるが聴感は同等以上・衝突消滅・長短レガート化・**耳確認必須**）。既存の跳ね済み保存データは feel 無し＝そのまま鳴る。
- **副次バグの自動解消**（監査③-5/⑥）：backbeat の16分丸め照合が sw≥0.75 で抜ける／corpusTypicality ランクが swing 量で系統的に歪む（ノブ×評価の結託）／編集の非可逆・quantize不能／採譜側(audio-drums)との二重規格——**全て「notes は常にストレート」で消える**。「notes は常にストレート格子」を**契約として明文化**し fit/reshape/complete_melody 等 notes 再入力経路で担保（⑥-10）。
- **暫定対症修正の撤去**：直前コミット `10c01b7` の swing 衝突ガード（SWING_ROOM=0.4＝「直後に16分がある8分裏は跳ねない」）は偶然ジャズ「走句ストレート」の粗い近似だが**層が誤り**＝Stage 3 で撤去。

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

- **オフライン捕獲**：PWAでローカル(IndexedDB等)に一時保存→オンライン時にTSへ同期。捕獲だけは回線不問で落とさない（NFR）。編集/再生は取得済みデータの範囲で。→2026-07-15 オーナー判断で撤去（Capture コンポーネント＋localStorage退避 outbox を削除。捕獲は歌詞/テーマ作成タイルで代替・常時オンライン前提）。
- **到達/アクセス（決定 2026-06-21）**：**Tailscale tailnet 限定**に露出する。api は **localhost バインド（`CM_HOST` 既定 `127.0.0.1`）＋ `tailscale serve 8787`** で tailnet だけに出す＝**LAN(0.0.0.0)にも公開しない・インターネットにも晒さない**。スマホも家PCも Tailscale 経由（同じ tailnet）。web は api が**単一オリジン配信**（外に出すのは 8787 の1ポートだけ・本番で vite 不要／dev は従来どおり vite proxy）。Python ワーカー / cm-search:8788 / cm-music-mcp:8790 は localhost 内部のまま。→ **未発表ネタも `claude -p` も、tailnet 外の他人は到達すらできない**。`tailscale serve`（≠`funnel`）なので公開されない。手順は `docs/deploy.md`。
- **通知強度**：全体設定(silent/normal/active)＋ジョブ毎override。既定は静か、完成/waitingのみ通知。生活に合わせ可変（NFR/原則）。
- **バックアップ/永続**：SQLite1ファイル＋資産ファイルを定期バックアップ（データ消失防止NFR）。
- **認証（決定 2026-06-21）**：**アプリ側パスワードは持たない**。**ネットワーク層（Tailscale tailnet＝自分の端末だけ）を境界**とする＝要件「他人が触れなければ十分／そこまで厳重にしなくてよい」(requirements L118-119) に整合。守るのは①未発表ネタを他人に見せない②他人に `claude -p` を使わせない、で両方とも tailnet 限定で満たす。既存 `CM_TOKEN` ヘッダゲートは**任意の追加ロックとして OFF のまま温存**（将来の家族公開や LAN 直開放に倒すとき有効化）。家族公開はオプション（後）。
- self-review：非機能（常時起動・出先耐性・公開しない/他人に見られない・データ消えない）を全部拾えてるか確認→OK。

## #20 骨格層の一級化（skeleton neta）（設計 2026-07-11・ユーザー合意）

**動機**：メロ生成の煩雑化（genMelody opts≈35・5経路並存・ノブがMCP/UIの3層へ伝播）と、**骨格が生成パイプライン内部の一時変数で保存されない＝骨格に戻って直せない**問題。オーナー提案のワークフローで再設計する：
**①メロ＋ベースの骨格を対位法的に（時に適当に）書く → ②セクション/編成でリズムを当てる → ③骨格を崩した表面を少し入れる → ④ドラム/ベース実体化 → ⑤歌詞に乗せてさらに砕く（最後の化粧）**。
理論的裏付け＝Ursatz（Urlinie＋Bassbrechung＝2声骨格）・種対位法（第1種=音対音→第2種以降=diminution）・パルティメント（外声先行・和声は外声対位から含意）。対応表は `docs/research/skeleton-melody-musicology.md`。
**正名（2026-07-12・S6で確定）**：この①〜⑤は**データ依存の層モデル**（骨格が上流・表面がその実体化＝realized_from で繋がる・上流が下流の根拠）であって、**作業がこの順に一方向に進むゲート列ではない**。実作業は「ループを回しながら コード差替→骨格の響き確認→吹いてみて→骨格に戻る」を数分単位で循環する（track-and-topline の実作法）。よって作業IFは**画面遷移の段列でなく「1つの机の前景切替」（下記S6＝骨格の机）**とし、ビート/コード＝伴奏ベッドを先に敷いてから骨格を書く姿勢も、2声先行（→harmonize）も等しく支える（決定事項「コードと骨格の先後は固定しない」と同根＝矛盾ではなく、**層の順序（DAG）と作業の順序（前景）は別物**、という書き分け）。
**設計上の狙い**：トラック間結合（メロ生成器がbass/drums実音を直接知る密結合）を骨格層へ持ち上げ、表面化器は自トラックだけ見る単純な存在に戻す＝35ノブを「骨格生成/表面化/装飾」の層別へ再編する足場。

### 決定事項（オーナー確定 2026-07-11）
- **骨格はブレークポイント方式＝durを持たない**。各構造音は「次のブレークポイントまで」を支配（GTTM time-span/Schenker prolongation準拠）。長く支配＝点を置かない、細かく＝分割。**伸ばすか動きで埋めるかはdiminution＝表面の決定**。骨格休符（句頭遅延入場）は `pitch:null` で表現。agogic（音価対比、backlog耳FB）は骨格でなく**リズムパーツ層の長音パーツ**で表現する。
- **概念上2声・保存上はメロ1声＋ベースは例外のみ明示**。ポップスではベース骨格≒コードroot/分数のため、省略時はコードから導出・書いた区間（クリシェ/ペダル等）だけ上書き。対位法チェック（analyzeVoiceLeading転用）は「導出＋明示をマージした実効2声」に対し**指摘のみ**（機械は候補まで・断は人間）。
- **独立素材ネタ＝chord_progressionと同じ建付け**。N小節・key/modeはnetaカラム・配置時オンザフライ移調・合成時は**無音の骨格**（単体編集時のみ白玉プレビュー）。曲/セクションに従属せず配置で決まる＝同じ骨格を複数セクションへ置き表面化だけ変える再利用が可能。**コード参照は既存慣習＝同一section同居**（compositeNotesのsectionChords集約）で暗黙解決、単体は `preview_chords` フォールバック。
- **表面化は常に新しいメロnetaを生む＝在庫不変**。骨格v2から吹き直しても手直し済み旧メロは消えない。紐付けは relation_edge `type:"realized_from"`（メロ→骨格）。表面を直したければノート編集、骨格から変えたければ再表面化。
- **弱起・息継ぎの実長は表面の持ち物**。骨格は小節1拍目起点の構造線＋句境界のみ。
- **コードと骨格の先後は固定しない**：コード先行（進行と同居させ骨格を書く）／2声先行（骨格から `harmonize` でコード推定）の両対応。

### データモデル
- **kind="skeleton"**：`content = { bars, tones: [{start, pitch|null}], bass?: [{start, pitch|null}], phrases?: [{endBeat, cadence?}] }`
  - tones/bass＝ブレークポイント列（start昇順・拍単位）。pitch=MIDI絶対（key/modeカラム基準、移調は配置時＝melodyPlacementShift流儀）。
  - phrases＝句境界（構造情報なので骨格が持つ。実際の息の長さは表面）。
- **kind="motif"**：`content = { shape: Motif16 }`（相対onset＋度数move＋走句フラグ＝図形。実音を持たない→移高で和声適応）。表面化パラメータとして「モチーフXで吹け」と渡す。`extractMotif16` で既存メロから採取可。使用メロとは relation_edge で紐付け＝セクション間モチーフ共有の見える化。
- **リズムパーツ（表面化オプション、3段フォールバック）**：
  - L0 無指定＝従来どおり rhythmVocab 抽選（セクション役割重み）
  - L1 セクション割当＝パーツ群をローテ（ドラムパターンをSectionに敷く感覚）
  - L2 小節 placement＝`[{bar, partId}]` で明示
  - パーツ出所＝(a)POP909語彙クラスタの名前付きプリセット (b)既存メロから採取（16枠化） (c)手置き。

### S2 UI仕様（確定 2026-07-11・動くモックで検証→オーナー承認）
モック（scratchpad/skeleton-ui-mock.html・Artifact公開）でA/B/C比較の上オーナー決定：
- **骨格エディタ＝PianoRoll流用のskeletonモード**：打点■＋支配帯▓（durなし・幅は次点/句境界/曲末からレンダ時導出）／スナップピッカー[2拍|1拍|自由]既定2拍（音価ツール跡地スロット）／**休ストリップ**（最下段・タップでpitch:null挿入・帯は斜線ハッチで切れる・armed voiceに効く）／**句ルーラー**（上部・境界ドラッグ・終止ラベル切替）。選択編集はskeletonEdit独自実装（nudge/削除をnoteEditと同流儀で・ブレークポイントのまま直接編集＝tones→Note[]アダプタは持たない）。
- **2声UI＝方式C：常時2声・ベース折返し表示**。ロールはメロ音域窓のまま、ベース骨格（導出含む）は表示のみ+2oct（**oct調整可能ノブ**＝オーナー決定。+3octで窓をはみ出すキーがあるため）。**計算は常に実音・表示だけ畳む**（register transfer流儀）。「見た目≠実の高さ」「同一行の両声重なり」はポップス射程の割り切りとして受容済み。入力先トグル[メロ|ベース]は**新規打点のみ**に効く（既存点は触った声部を直接編集）。
- **導出ベース**：コードroot/分数由来を点線・淡色で常時表示（凡例つき）。明示区間だけ実線。**導出→明示の境界＝明示点も通常のブレークポイント則（次の明示点か句末まで支配・句末で導出に戻る）**＝暫定既定、耳較正で見直し可。
- **対位法フィードバック（指摘のみ・禁止しない）**：メロ各点に実効ベースとの音程バッジ（実ピッチ差をmod-12単音程還元＝10度→3度の対位法慣習）／強拍不協和(2/4/7度)は注意色／並行5・8度⚠／声部交差✕（実ピッチ判定・「実音で交差」文言）。本格チェック（analyzeVoiceLeading転用）の露出はS3。
- **再生＝対位法モード既定**：メロ実音・ベース実音+1oct（隣接声域＝音程が聞き取れる・スマホスピーカーの低域基音問題も回避）、**octは調整可能**。トグルで実音再生。音色差別化（GM音色 メロ=Strings/48・ベース=Cello/42＝実機FBで決定）。低域の濁り(low interval limit)は畳み再生では聞こえない＝表面化段階（S3実音）でチェックする段階分担。
- **セクション**：骨格レーンを**コードとメロの間**に追加（合成無音・MiniRoll白玉）。骨格ブロック[メロを作る▶]（旧「吹く▶」＝S6用語対応表で改称）→gen_melody(skeletonNetaId)→メロ候補トレイ（骨格ゴースト重ね）→＋置くで**新メロneta＋realized_from**。[ベ▶]（title「この骨格からベースを作る」）→gen_bass(skeletonNetaId)。いじる▾に「骨格を生成」（gen_skeleton→候補トレイ→骨格レーンへ）。コード進行なし時は骨格ブロックに「コードを推定」(harmonize)。
- **「骨格を鳴らす」トグル（Section・耳確認用）**：Section 下端トランスポートのトグル（TransportBar の extra スロット・既定OFF・セッション内）。**ON の間は再生でメロ(part:"melody")をミュートし、骨格2声（メロ=Strings/ベース=Cello・ベース+1oct）を伴奏に重ねて対位法的に聴く**（メロ=ピアノが勝って骨格が聞こえない問題の回避）。**再生のみに効く＝合成（composite）/MIDI書き出しには入らない**。来歴＝S2実機FBで「いじる」横に導入（b741932）→再生機能なのでトランスポートへ移設＋メロミュート化（f9e0e91・2026-07-12実機FB）。
- **機械の叩き台は在庫を破壊上書きしない**：候補提示（reshape-bar型）→採用で確定の流儀（モックの考慮漏れ#8対策）。
- realized_from の見える化＝RelationsPanel流用・双方向（メロ側「← 元の骨格」／骨格側「→ 吹いたメロ」タップで開く）。骨格側は relation の逆引き（getBacklinks）で表面化済みメロ一覧を出す（realized_from はメロ→骨格向きに張るため）。
- **器の位置づけ更新（2026-07-12・S6）**：本節の SkeletonEditor（単品編集）は**素材庫のクイック確認用として存置・主線は S6「骨格の机」**（セクション文脈の中で書き・聴く器）へ移る。SectionEditor 骨格ブロックのタップは机への入口に再定義（ブロック上の[メロを作る▶]（旧「吹く▶」）[ベ▶][コードを推定]はショートカットとして残置可）。本節の部品仕様（方式C・導出ベース・対位法バッジ・休ストリップ・句ルーラー・スナップ・TAP_SLOP）と純ロジック `skeletonEdit.ts` は**そのまま机の部品**＝無効化ではなく再配置。撤去の最終判断は机の実使用後（backlog）。

### 縦スライス計画
- **S1（メロ側先行・Opus/Sonnet委譲で検証）**：kind="skeleton" 追加（KIND_DEFS/theme/music.ts無音合成）＋content契約テスト先行＋**gen_melody への骨格注入結線**（genMotifMelodyV2 は既に骨格を入力に取る構造＝継ぎ目は存在する。genSkeletonFromModel の出力を人間製骨格で差し替えるオプション）。骨格の機械生成候補出し（gen_skeleton＝genSkeletonFromModel露出）も薄く含む。**→ DONE 2026-07-11（コミット6c1efc4・api792/web339緑）**。~~既知の割り切り＝骨格休符はV2アンカー制約でcarry-forward（表面はまだ鳴る・根治はbreathe合流）~~**→ S3bで根治済み（2026-07-11）**：骨格休符(pitch:null)はアンカー（生成の内部足場）ではcarry-forwardのまま／**最終出力で当該区間の表面音を抑制**する別チャネル（restマスク）を導入＝耳には鳴らない（下記S3b）。**骨格phrasesのV2ブロック結線はS3aで結線済み**（skeletonPhrasesToV2＝endBeat列→{startBeat,beats,cadenceDegree}・骨格の句割りをframe phrasing由来より優先・可変長ブロック/breathe/句末カデンツ着地へ届く。phrases無し＝従来bit一致）。
- **S2**：骨格編集UI（PianoRoll粗グリッド流用・2拍スナップ既定・ブレークポイント編集）。
- **S3**：ベース表面化（骨格→gen_bass結線）＋対位法チェック露出。**S3a＝骨格phrases→V2結線 DONE 2026-07-11（api805緑）**：skeletonPhrasesToV2 で骨格の句割りを可変長ブロック/breathe/句末カデンツ着地へ届ける（骨格優先・phrases無し＝bit一致）。**S3b＝骨格休符(pitch:null)の表面音抑制 DONE 2026-07-11**：下記【S3b】。**S3c＝gen_bass 骨格結線（ベース表面化）api側 DONE 2026-07-11**：下記【S3c】（web導線は別途）。**S3d＝analyzeVoiceLeading 本露出（生成候補への対位法レポート添付）DONE 2026-07-11（api844/web404緑）**：下記【S3d】。**S3 完了**。

  **【S3d analyzeVoiceLeading 本露出＝生成候補への対位法レポート添付】（設計 2026-07-11）**
  分析専用だった analyzeVoiceLeading（並行/隠伏5度8度・声部交差を数える純関数）を**生成側へ露出**＝gen_melody/gen_bass の候補に **VoiceLeadingReport を items[].meta として添付**（`{voiceLeading, voiceLeadingSummary}`）。糊は純関数 `apps/api/src/music/voiceLeadingReport.ts`（analyzeVoiceLeading＋skeletonNeta 変換を橋渡し）。**候補ノートは一切不変＝読み取り専用の加算のみ（bit一致鉄則）**。「機械は指摘まで・断は人間」＝score が低くても候補は出す/置ける（禁止しない）。
  - **lower（実効ベース）の解決順** `resolveLowerVoice`：(a) body に bass notes があればそれ (b) 骨格の明示ベース区間 `explicitBassSegments`＋コード root 導出のマージ（書いた区間だけ上書き・休符区間は下声なし・明示は foldBassPitch で低域窓へ畳む） (c) chords の root を低域(36+pc)代用。どれも無ければ null＝レポート無し＝表示無し。
  - **upper**：gen_melody は各候補ノートが上声・lower は解決した実効ベース。gen_bass は生成ベースが下声・**骨格 tones（Urlinie 近似）を上声**（`skeletonUpperVoice`＝expandDominion tones・休符除外）＝骨格が無ければ相手が無い＝添付スキップ。
  - **返り形**：既存 items へ `meta.voiceLeading`（score・違反件数・spots）＋`meta.voiceLeadingSummary`（人間可読・例「並行5度1・交差1・score0.90」）を**加算**＝既存クライアント非破壊。MCP/HTTP 両経路で添付（web は HTTP＝items[0] に載る）。
  - **web 表示流儀**：候補カードに対位法バッジ（`voiceLeadingBadge`）。違反あり＝`⚠並5×1 交差×2`（注意色・title に summary 全文）／違反なし＝小さく「対位OK」／meta 無し＝非表示。**指摘のみ・置くボタンは常に残る**（score 低でも置ける）。SkeletonEditor 側の既設バッジ（skeletonEdit `analyzeCounterpoint`＝骨格2声の簡易版）はそのまま。

  **【S3b 骨格休符(pitch:null)の根治＝表面音の抑制】（設計 2026-07-11）**
  骨格休符（句頭遅延入場・「間」）を pitch:null で表した区間が、S1の割り切りで表面化ではまだ鳴っていた（skeletonToV2Skel が V2 アンカー契約 blockAnchorFromSkeleton の「ブロック頭拍のピッチはnull不可」制約のため、休符区間を直前実音で carry-forward＝null情報を落とす）。
  **採用＝案A（restマスク別チャネル）**。理由：**bit一致鉄則との親和とV2内部への侵襲の小ささ**。案B（アンカー契約のnull許容化＝blockAnchorFromSkeleton とその依存を全部null対応へ）は侵襲が大きく、アンカーは「生成の内部足場（構造線を歩く出発点）」に過ぎず耳に直接出るものではない。したがって**アンカーは carry-forward のまま据え置き、最終レンダ結果から休符区間の表面音だけを落とす**方が素直で回帰リスクが小さい（暫定既定・耳較正で見直し可）。
  - 変換＝`skeletonRestMask(content)`（skeletonNeta.ts・純関数）＝expandDominion の pitch===null 区間を `{start,end}[]`（拍単位）で返す。休符なし骨格＝空配列。
  - 適用＝genMotifMelodyV2 に `restMask?` opts で渡し、**全後処理（flow延長/humanize/articulation 等）の後・returnの直前**で：①onsetが休符区間内の音は落とす（表面でも鳴らさない）②durが休符区間へ食い込む音は**区間頭で切る**（直前の音の自然な着地/減衰は殺さない）。RNG不消費。
  - **breathe との整合**：骨格句頭の breathe drop と休符マスクは二重に効いても両方「音を出さない」方向＝自然。テストで挙動を明示。
  - **bit一致**：restMask が undefined/空（＝pitch:null が無い骨格 or 骨格未指定）なら丸ごとスキップ＝従来と完全一致。変わるのは「骨格に pitch:null がある場合」のみ。

  **【S3c gen_bass 骨格結線＝ベース表面化】（設計 2026-07-11・api側）**
  「概念上2声・保存上はメロ1声＋ベースは例外のみ明示」の生成側。省略時はコード root から導出（従来 genBass のまま）、**書いた区間（クリシェ/ペダル等）だけ骨格ベースで上書き**。genBass はリズム（fig/kick結線/approach/snareGap）を一切変えず、**ピッチと休符だけ差し替える**表面化器に留める。
  - **境界則＝web の表示規則に合わせる（表示と生成の一致が鉄則）**。canonical は `apps/web/src/skeletonEdit.ts` の `explicitBassSegments`/`effectiveBassAt`＝**明示点は次の明示点まで支配。最後の明示点は「直前間隔ぶん」だけ支配→以降は導出へ復帰**（単独点は 2 拍）。句境界(endBeat)は支配を打ち切る＝句末で導出に戻る。**注意**：この「最後の点は直前間隔ぶん」規則は、S2 UI 節の理想化文「明示点も通常のブレークポイント則（次の明示点か句末まで支配）」を**最後の点についてだけ上書きする実装既定**である（`expandDominion(line:"bass")` は最後の点を曲末まで延ばす＝単独ペダル点が曲全体を支配してしまい「書いた区間だけ上書き」の意図に反するので採らない）。api 側は skeletonNeta.ts に web と同一規則の純関数 `explicitBassSegments(content)` を新設し、genBass はこれを消費＝**表示（web）と生成（api）が同じ区間で explicit/derived を切り替える**。
  - **音域畳み**：明示ピッチは絶対 MIDI（key/mode カラム基準）。genBass の低域窓 33..55（A1..G3）に `foldBassPitch`（オクターブで畳む・在域なら保持・外なら最寄り oct へ、最後に clamp）で落とす＝web derivedBassPitch の C2 帯慣行に倣う。web プレビュー再生（effectiveBassAt）は明示を「書いたまま」鳴らすが、**実体ベーストラック（genBass）は実奏音域へ畳む**＝表面化＝役割分担（一致させるのは時間の境界規則であってオクターブではない）。明示区間内は**全オンセットが当該ベース音**（ペダル＝クリシェの受け口。歩かせたければ点を複数置く）。
  - **休符（pitch:null）**：明示ベース休符区間＝ベースも鳴らさない（S3b の rest マスクと同思想）。当該区間内に onset を持つ音は落とす／その区間頭へ食い込む dur は区間頭で切る。RNG 不消費。
  - **適用位置**：genBass の**全リズム後処理（approach/snareGap）の後・empty フォールバックの前**で override/suppress する（RNG を消費せず、生成・approach・snareGap は骨格の有無で不変＝骨格 explicit 区間だけ経路が変わる）。approach が触った区間でも明示があれば明示が勝つ（人が書いたベースを自動接近音より優先）。
  - **bit一致**：`explicitBassSegments` が空（＝bass 未指定/空配列＝明示点ゼロ）なら override/suppress は丸ごとスキップ＝**従来 genBass と完全 bit 一致**（skeleton 指定でも bass 未記入なら全区間導出＝従来 root 導出と厳密一致。tones/phrases だけの骨格＝genBass は不変）。変わるのは「bass 明示点がある場合」のみ＝ゲート成立。
  - **入口**：MCP `gen_bass` / HTTP `gen_bass` に `skeletonNetaId` を追加（gen_melody と同契約＝getNeta→kind="skeleton"検証→validateSkeletonContent→content を opts.skeleton へ）。返りに skeletonNetaId をエコー＝capture 後 `link(ベース, 骨格, "realized_from")` で紐付け。
- **S4**：リズムパーツ層（L1/L2）。**S4-1＝L1 セクション割当ローテ DONE 2026-07-11（Task#7）**：下記【S4-1】。**S4-2＝L2 小節 placement＋採取＋インラインcustom DONE 2026-07-11（Task#8）**：下記【S4-2】。
- **S5**：歌詞に乗せた再分割（骨格不変・表面のみ再抽選）＝Chatユースケース②と合流。最後。
- **S6**：骨格の机＝セクション文脈IF（設計 2026-07-12・下記【S6】）。S1〜S4 の生成契約の上に乗る **web 側の器の再設計**＝S5 と独立・並行可。実装スライス D0〜D6 は `docs/research/2026-07-12-skeleton-desk-handoff.md`（Opus 委譲）。
- ノブ再編・旧経路撤去は S1-S3 の安定後に backlog「死にコード撤去」と合流。**→ J1〜J4 完了（2026-07-11〜12）**：J1=呼出グラフ全数調査（research doc）／J2a 3/4・6/4／J2b chordless／J2c fit useV2化／**J3 旧経路④撤去＝V2 一本化（下記【J3】）／J4 ③motifModel(genMotifMelody)撤去＋appoggiatura ノブ削除（下記【J4】・Task#16・api874緑）**。**倚音/掛留の三重実装（applyExpression④／V2 表情パス／genMotifMelody③）は ④撤去＋③撤去で V2 の表情パス（melodyCells.ts ~1200付近）に一元化＝完了**。旧経路撤去シリーズ #11（J1〜J4）はこれで完了。

  **【S4-1 リズムパーツ層 L1＝セクション割当ローテ】（設計 2026-07-11・Task#7）**
  「②セクション/編成でリズムを当てる」（#20 ワークフロー②）の最小実装＝**ドラムパターンを Section に敷く感覚**でメロの表面リズムを名前付きプリセット群のローテで指定する。骨格（構造線）はそのまま、表面化の onset グリッドだけをパーツで置換する層。
  - **パーツ＝1小節の16分オンセットパターン**（V2 の RHYTHM16 と同じ「x/.」16枠表現）。**音価はパターンの疎密が決める**＝「次 onset までの gap を dur で埋める」ので**疎なパターン＝白玉/長音**になる（backlog「音価バリエーション不足」の長音案がここで実現＝長音プリセットを必ず含める）。新しい dur 機構は足さない（タイ/小節跨ぎは将来）。
  - **プリセット＝api 内の名前付き定数**（`apps/api/src/music/rhythmParts.ts`・一級netaにしない＝表面化オプションの位置づけ通り）。POP909 の RHYTHM16 語彙統計（`x...............`＝全音符が最頻732／`x.x.x.x.x.x.x.x.`＝8分刻み362／`x.x.x.x.x.......`＝刻み→タメ296 等）＋音楽的キュレーションで **10個**：`whole`(白玉)・`half2`(二分×2)・`dotted`(付点タメ)・`quarters`(四分刻み)・`eighths`(8分刻み)・`driveHold`(刻み→タメ)・`sixteenths`(駆け16分)・`syncope`(シンコペ=dotted-16トレシーヨ)・`offhead`(頭抜き=弱起)・`backbeat`(アフタービート=2/4拍)。3拍/6拍バー（J2a）では **16枠の先頭12枠を切り出す**（V2 の "3拍切り出し" と同流儀）／6/4 は 3+3＝先頭12枠を +0/+3拍へ2度敷く。
  - **契約**：`gen_melody` opts に `rhythmParts?: { rotate?: string[]; placement?: { bar: number; partId: string }[] }`。**L1＝`rotate`**＝partId 配列を**出力小節の絶対 bar** にローテ適用（bar i → rotate[i % rotate.length]）。`placement`（L2＝小節明示）は**型だけ予約**＝実装は #8（S4-2）。未指定 or `rotate` 空 or 未知 partId のみ or `compound`(6/8系) ＝**未適用＝bit一致**。
  - **V2 内部の効き方（`genMotifMelodyV2`）**：設計方針「該当小節の語彙抽選（weightedPickRec）をパーツで置換」を、**単一共有モチーフ M（genBest で1回生成・全ブロック再利用）では絶対 bar のパーツを運べない**ため、seam を**ブロックレンダ直前の variant 差し替え**に置く（真の per-output-bar ローテを実現しつつ snap/表情/カデンツ/句割りは従来機構がそのまま乗る）：各ブロック `[bar0, L]` について**絶対 bar のパーツから onset 列を組み**、**輪郭(mv)は共有モチーフ Mi から巡回借用**（rng 不消費＝決定的・動機の輪郭同一性を保つ）→ 既存 `render`/`renderPreserve` がピッチ決定・snap・dur を担う。密度受入帯（loN/hiN）と孤立ギャップ棄却は**バイパス**＝パーツ指定小節は密度免除（明示が権威）。`finest`（最小音符フィルタ）は mkMotif 内でしか効かないため**パーツ経路では自動的に無効＝パーツ優先**（「finest 衝突はパーツ優先」を構造的に満たす）。`converse`（密度相補）はパーツ活性時スキップ（onset がパーツ権威）。
  - **音価＝gap 埋め（agogic の実現）**：`render`/`flow` の dur はキャップ（1.6/1.05拍等）で長音が出ない（＝backlog「音価不足」の根）。そこでパーツ活性時のみ**flow/articulation の後・restMask の前**で「dur = 次 onset まで（最終音はセクション末まで）」に上書き＝**疎パーツが白玉/長音になる**（articulation は先に走るので反復音 micropause は残る／restMask は後で休符区間を切る）。パーツ非活性＝この上書きに入らない＝bit一致。
  - **web UI（L1最小）**：メロ生成の詳細ノブ（「リズムのノリ」段）に**リズムパーツ・ピッカー**＝プリセットのトグルボタン群を**押した順**で `rotate` に積み body へ。未選択＝未送信＝bit一致。プリセット id/label は web に小さく複写（パターン本体は api 唯一持ち＝ids のみ参照）。試聴不要（候補トレイで聴く流儀）。
  - **MCP/HTTP 透過**：`gen_melody` に `rhythmParts` を既存ノブと同流儀で受け（不正/空は api 側で bit一致）、generate へ素通し。
  - **割り切り（胸を張れない点）**：(1)輪郭は共有 M からの巡回借用＝パーツで onset 数が増減しても A/A'/A'' の輪郭同一性は「借用元 mv 前方一致」の範囲で保たれるが逐語ではない（パーツはリズムを固定＝ピッチの反復は snap/preserve が担う）。(2)`compound`(6/8系)は 16枠語彙と grid が違うため**対象外＝無視**（bit一致・将来 RHYTHM68 版パーツで拡張可）。(3)dur=gap 埋めはタイ/小節跨ぎを持たない素直版＝「白玉」は次 onset で必ず切れる（長い休符後の余韻は restMask 側の担当）。(4)`rotate` は骨格 phrases の句境界を跨いでも一律ローテ（句頭リセットはしない＝ドラムを敷く素直さ優先）。

  **【S4-2 リズムパーツ層 L2＝小節 placement 明示＋既存メロから採取＋インラインcustom】（設計 2026-07-11・Task#8）**
  S4-1 の rotate（セクション一律ローテ）に対し、**小節単位で「ここは白玉」と名指し**できる L2、既存メロから**リズムだけ採取**して他所へ移植する口、プリセット外の**インラインパーツ**を追加。#20「パーツ出所＝(a)プリセット (b)採取 (c)手置き」の (b)(c) を通す。
  - **契約（拡張）**：`rhythmParts?: { rotate?: string[]; placement?: { bar: number; partId: string }[]; custom?: { id: string; pattern: string }[] }`（型は `apps/api/src/music/rhythmParts.ts` の `RhythmPartsOpt` に一元化＝generate/melodyCells で共有）。
    - **`placement`（L2）**＝出力の**絶対 bar（0始まり）→ partId** を名指し。partId はプリセット id でも custom id でも可。
    - **`custom`（インラインパーツ）**＝任意 id ＋16文字 `x/.` パターン。`rotate`/`placement` から**この id を引ける**＝採取結果(b)や手置き(c)をプリセット外から渡す。custom がプリセット id と衝突したら**custom が勝つ**（インライン上書き）。
  - **優先則＝placement > rotate > L0（従来抽選）**（`melodyCells.ts` `resolveBar` per-bar）：ある bar について — placement に有効エントリ（既知/custom id）があれば**それが勝つ**／無ければ `rotate`（あれば `rotate[bar%len]`）／`rotate` も無ければ **L0＝従来抽選のまま**。placement の**未知id**は無視して rotate→L0 へフォールスルー。同一 bar に複数 placement は**後勝ち**。
  - **per-bar 実装（bit一致の要）**：buildPartVariant を per-bar 種別（`{pat}`＝パーツ置換／`"empty"`＝rotate が覆うが未知id＝S4-1 の無音節点／`"l0"`＝どこも覆わない）に拡張。**`rotate` 非空は全 bar を覆う（未知でも `"empty"`）＝ `"l0"` が生じない → S4-1 と同一経路（パーツ onset のみ＋Mi.mv 巡回借用）＝ `rotate` 出力は完全に不変（回帰ゼロ）**。`"l0"` は **placement 単独（rotate 無し）** の非該当 bar でのみ発生＝その bar は**元 variant の onset/輪郭をそのまま残す**（＝「2小節目だけ白玉、他は従来メロ」が成立・非該当 bar が空にならない）。混在ブロックは「l0 bar の従来 onset ＋ パーツ bar の onset」をマージして render。
  - **採取（パーツ出所b）**：純関数 `extractRhythmPart(notes, bar, { beatsPerBar })`＝既存メロの notes から指定小節の**16分オンセット列を "x/." 16文字**へ量子化（slot s→相対拍 s*0.25・最寄り16分へ round）。`beatsPerBar<4`（3/4等）は**先頭 beatsPerBar*4 枠のみ使用**（partPatternOnsets の3拍切り出しと対称・残り枠は "."）＝**採取↔再適用が往復**する。小節外/start 無しの音は無視。**6/4 は先頭4拍(16枠)まで＝割り切り**（採取は主に 3/4・4/4 想定）。
  - **バリデーション**：`isValidPartPattern`＝ちょうど16文字・`[x.]` のみ。custom は不正 pattern/空 id を捨てる（`buildCustomPartMap`）。
  - **サニタイズ（http/mcp 共通 `sanitizeRhythmParts`）**：placement は**整数 bar≥0（bars 既知なら <bars）＋known(preset∪custom) id** のみ通す（範囲外bar/非整数/未知id を落とす）。rotate の未知id は**保持**（engine が無視＝S4-1 と同じ・bit一致）。custom は valid pattern のみ。**rotate/placement が共に空＝undefined（bit一致）**＝custom 単独は敷き先が無く効果ゼロで落とす。http/mcp 両経路がこの1関数を通る（DRY）。
  - **MCP/HTTP の口**：`gen_melody` の `rhythmParts` に placement/custom を追加（zod で custom.pattern は `^[x.]{16}$` 正規表現ガード）。採取は独立ツール **`extract_rhythm_part`**（MCP）／op `extract_rhythm_part`（HTTP）＝`{ notes, bar, beatsPerBar? | frame? } → { pattern }`。Chat が「このメロの2小節目のリズムを採って別セクションに敷いて」「2小節目だけ白玉に」を実行できる。
  - **web（最小）**：L1 の rotate ピッカーは現状維持。**L2 の小節ペイントUI（bar 単位でパーツを塗る）は未実装＝backlog 送り**（今回は placement/custom を **MCP/Claude チャット経由**で使える状態まで）。
  - **割り切り**：(1)混在ブロックのパーツ bar 輪郭は Mi から巡回借用＝l0 bar の従来輪郭とは別系列（リズム移植が主目的でピッチ同一性は二次）。(2)採取は onset 位置のみ（vel/dur/ピッチは捨てる＝リズムの器だけ）。(3)placement は**絶対 bar**＝セクション内 bar 番号（0始まり）を Chat 側が把握して渡す前提。

### 【J2a V2 の拍子拡張＝3/4・6/4】（設計 2026-07-11・Task#13・オーナー決定「3, 6拍子は良くやるので対応したい」）
**動機＝旧経路④の受け皿づくり**。callgraph 全数調査（`docs/research/2026-07-11-genmelody-path-callgraph.md`）で「③④は本番到達可能・単純撤去不可」＝③④に落ちる3ケースの1つが**非4/4・非複合拍（3/4・2/4・5/4等）のメロ生成**。旧経路④は品質が低い（骨格反復/句割り/カデンツ/対位が薄い）。**3/4・6/4を V2 の eligible 拍子に加えて④依存を減らす**（J2a＝旧経路撤去の前提整備 J1〜J4 のうち拍子受け皿）。2/4・5/4・7/8 は今回対象外（オーナーが「3, 6拍子」と明示・素直な受け皿を先に）。

**V2 の拍子モデル＝2軸（`barLen`＝1小節の四分数／`compound`＝ジグ系フラグ）に整理**。従来 `barLen = compound ? 3 : 4` の二値だったのを、直進系（simple）では `barLen = beatsPerBar`（4/4→4・3/4→3・6/4→6）に一般化する。`compound`（6/8/9/8/12/8＝付点四分ビート・RHYTHM68・跳ねdur）は**据え置き**（6/8系は従来どおり barLen=3 固定＝V2 内部は付点四分2群を1小節扱い・bit一致）。直進系と複合系を直交させ、複合の特殊処理（RHYTHM68・跳ね・push/drumLock除外）は触らない。

- **ゲート拡張**（`generate.ts` V2分岐）：`(bpb===4 || compound)` → `(bpb===3 || bpb===4 || bpb===6 || compound)`。非複合の bpb=3 は 3/4 のみ・bpb=6 は 6/4（3/2 も同扱い＝素直な割り切り）。`barLen = compound ? 3 : bpb` を骨格アダプタ（skeletonToV2Skel/skeletonPhrasesToV2/skeletonRestMask＝既に beatsPerBar パラメタ化済）と genMotifMelodyV2（新 opts `beatsPerBar`）へ一貫して渡す。既存 eligible（4/4 bpb=4・6/8系 compound）は値が変わらない＝**bit一致**。
- **Motif16 語彙の写像**（直進系・`mkMotif` else 枝）：RHYTHM16 は16枠＝4拍語彙。3拍は**先頭3拍（12枠）を切り出す**（"RHYTHM16 の3拍切り出し"）。**barLen=4 は従来どおり16枠1抽選/小節（bit一致）**。
  - **3/4**＝12枠1抽選/小節（先頭3拍スライス）。
  - **6/4**＝**3+3（2つの3拍群）**＝12枠を2回抽選し bar 内 +0/+3拍へ。理由：meterInfo(6/4) の strongPositions が [0,3]（拍1と拍4に中位アクセント）＝6/4 を「2つの3/4群」で感じる素直な割り。4+2（16枠+2拍）や barLen=6 直（RHYTHM16 に24枠語彙が無い）は語彙側の作り込みが要る＝**3+3で流用最大・追加語彙ゼロ**を採る。3/2 も同じ [0,3] へ落ちる。
  - 受入音数帯（loN/hiN）とギャップ上限は `barLen/4` で線形スケール（拍あたり密度を保存）。**barLen=4 では ×1.0＝IEEE754 で厳密不変＝bit一致**。tail 息継ぎ（ブロック末尾1.5拍drop）はブロック単位の定数＝拍子非依存で流用。
- **強拍（strongPos／skeleton strongQuarters）**：`compound?[0,1.5]` は据え置き。直進系は `barLen===3?[0] : barLen===6?[0,3] : [0,2]`＝meterInfo の strongPositions に一致（3/4＝拍1のみ／6/4＝拍1,4／4/4＝拍1,3）。骨格の柱（genSkeletonFromModel の強拍アンカー）と後処理の強拍CT/表情/濁り掃除/単一頂点が同じ強拍で動く。**barLen=4 は [0,2]＝bit一致**。
- **句割り/カデンツ/breathe**：phrases の startBeat/beats は planSkeleton/骨格が拍子由来で出す（3/4→句span=beatsPerBar×barsPerPhrase＝12拍）。V2 のブロック割り・breathe窓・pickup・flow境界は既に `barLen` 基準＝拍子拡張に追従。骨格注入（skeletonToV2Skel）/restマスクも beatsPerBar=barLen で整合。
- **割り切り（胸を張れない点・耳確認保留）**：
  1. **3/4 の骨格柱は1本/小節**（strongQuarters=[0]）＝4/4の2本より構造ガイドが薄い（波及＝反復の同一性が拾いにくい可能性）。耳較正で [0,1.5] や [0,2] を試す余地。
  2. **6/4 の 3+3 固定**＝4+2 で感じたい曲（1234-56）には合わない。push/drumLock/backbeat（拍0,1,2固定＝4拍前提）は6/4の後半3拍（拍3,4,5）を取りこぼす＝**既定0でスキップ＝bit一致**だが有効時は前半のみ効く。
  3. **genBest 全滅フォールバック**（bb≤2 の固定モチーフ ons≤3）は6/4の後半が疎になる（極端フォールバックゆえ実害小）。
  4. **完了(completion)経路**（generate.ts の partial 分岐・524）は今回**据え置き＝3/4/6/4 の補完は非V2**（completeMelody の barLen 配線は別スコープ＝J2 後続 or backlog）。gen_melody に partial 無し＝影響なし。
- **鉄則＝4/4・6/8 は bit 一致**：barLen=4 分岐は式が厳密不変（×1.0・同一抽選順・同一 strongPos）／compound 分岐は無改変。回帰テストで明示。3/4・6/4 の新規テスト＝総拍数＝bars×barLen・小節境界・句割り/カデンツ着地・骨格注入/restMask・決定性を固める（品質の耳確認はオーナー保留）。

### 【J2b V2 の chordless 対応＝コード進行なしの受け皿】（設計 2026-07-11・Task#14・旧経路撤去 #11案a の後半）
**動機＝旧経路④の受け皿づくり（後半）**。callgraph 全数調査（`docs/research/2026-07-11-genmelody-path-callgraph.md`）の③④到達3ケースの残り1つが**chords 無しの gen_melody**。V2 ゲート（`generate.ts` の A2レシピ分岐）は `(chords?.length ?? 0) > 0` を必須にしていたため、コード進行なしのメロ生成は旧経路④が唯一の受け皿だった。web は既に「骨格から吹く」を**コード無しでも可**とガード緩和済み（`useMelodyGen.tsx`）＝api 側の受けが④のまま、という**片翼**状態を解消する。J2a（拍子拡張）と対で J2 を閉じる。

**設計判断＝代用コード文脈の合成方法（素直さ優先）**。chordless 時は**全小節を key の主音(トニック)根＋ダイアトニックpc集合で代用**する。実装は既存の合成ループがそのまま担う：V2 分岐の `rootsPerBar/qualsPerBar/chordPcsPerBar` 構築ループは `chordAt(bar*perBar, chords)` が null（＝chords 空）のとき **root=tonicPc・qual=""・chordPcs=スケールのダイアトニックpc集合** をプッシュ済み（元々コード不在バーへの防御フォールバックとして存在）。同様に小節内チェンジ追従の `chordPcsAt(t)` も chord 不在時は `scalePcsArr`（ダイアトニック集合）を返す。よって**必要な変更はゲートから `chords>0` を外すことだけ**で、V2 内部は既存フォールバック経路がそのまま chordless 文脈を供給する。
- **なぜトニック/ダイアトニック代用か**：素直で説明可能・追加コードゼロ・キー宣言だけで機能する。骨格があれば骨格音から根を推定（harmonize 的）して和声文脈を作る案もあるが、（a)骨格注入は任意で常に在るわけではない (b)根推定＝別ロジックの作り込みが要る (c)まず「動く受け皿」を素直に置く方針（#20 の縦スライス思想）から、**骨格根推定は将来拡張**として書き残す（骨格の tones を chord root として rootsPerBar に流し込み qual を三和音で近似する等・S3 系の安定後に backlog 合流可）。
- **カデンツ着地はコード非依存**：句末カデンツ着地パス（`melodyCells.ts` の phrases 処理）は `cadPc(deg)=tonicPc+(deg===5?7:deg===2?2:0)`＝**キーの度数**で着地pcを決める（1=主音/5=属音/2=上主音）。着地先pcが `pcsAtT(t)`（chordless では diatonic 集合）に含まれれば採用・無ければ最寄りコード音。ダイアトニック代用では主音/属音/上主音は必ず集合内＝**素直に着地**する。実装確認：period の最終句 full cadence で最終音が key の主音pcへ着地することをテストで固定。
- **snap/濁り掃除/表情**：強拍CTスナップ・濁り掃除（fixForbidden）・表情パス（強拍非和声）は `chordRootsPerBar/chordQuals`（＝合成した root/qual）で動く＝chordless では「全小節トニック三和音 as ダイアトニック」に対して整合。無菌化の懸念はあるが素直（キーのダイアトニック内に収まる＝調性は保たれる）。
- **対位バッジ（S3d）はスキップ**：`attachMelodyVoiceLeading`→`resolveLowerVoice` は (a)明示bass (b)骨格の明示ベース区間＋コード導出 (c)chords root 低域代用 の順で下声を解決するが、**chordless＋bass 無し＋骨格明示ベース無し＝どれも該当せず null＝レポート添付スキップ**（web 表示無し）。骨格に明示ベース区間があれば (b) で下声が立ちバッジが出る＝それは正しい。割り切り＝コード進行なしでは対位相手が無いのが自然。
- **割り切り**：(1)chordless は全小節同一和声文脈（トニック）＝コードチェンジ由来のメロの起伏が無い（骨格/句割り/表情で動きを作る）。(2)完了(completion)経路（partial 分岐）は今回**据え置き**＝`chords>0` を残す（chordless 補完は別スコープ・gen_melody の partial 経由のみ＝実トラフィック希）。(3)③ motifModel 専用分岐・旧経路④は `chords>0` を保持＝chordless は必ず V2（useV2 時）を通す。
- **鉄則＝chords 有り時は bit 一致**：ゲートの分岐値は chords 有り時に不変（true→true）＝同一コードが実行され**出力は厳密不変**。実証＝(a)ゲート変更前後で chords 有り（4/4・3/4・6/4・6/8 × major/minor × seed{1,5,42} × expression/phrasing 指定）の `genMelody` 出力を golden 化し**バイト一致を diff で確認**、(b)既存 851 テスト全緑維持（→861）。変わるのは「chords 無し」の受け皿が④→V2 になることのみ（**意図的変更＝品質向上**）。chordless の新規テスト＝全音がキーのダイアトニック内・総拍数（onset∈[0,bars×bpb)）・決定性・骨格注入＋restMask 抜け・3/4 合流・カデンツ主音着地・MCP e2e（骨格注入 id エコー・対位メタ非添付）。

### 【J3 旧経路④の撤去＋V2 一本化】（設計 2026-07-11・Task#15・**DONE**・HEAD 基準 api 902→874）
**動機＝旧経路撤去 #11 の本丸**。J2a（3/4・6/4）／J2b（chordless）／J2c（fit を useV2:true 化）で受け皿を整えた後、`genMelody`(generate.ts) の**旧ルールベース経路④**（buildMotif/buildMotifSteered/placeMotif/planSkeletonTones/applyPhrasing/applyExpression/decorateWeak/recoverLeaps/enforceResolution/snapToPc/breathLen＋Motif/VarKind/MOVES/DEFAULT_STEP_WEIGHTS＝~250行）を撤去し、メロ生成を **V2（genMotifMelodyV2）に一本化**する。倚音/掛留/骨格/句割り/カデンツの実効実装を V2 に集約（旧の三重実装を解消）。③ motifModel 経路（genMotifMelody）は**本タスクでは残す**（次タスク #16 で撤去＝テスト移植を伴う）。

- **経路の新構造（early-return 順）**：①partial補完（`partial && (bpb=4|compound) && chords>0`）→ **②useV2 明示 V2**（`useV2 && (bpb∈{3,4,6}|compound) && bars>=1`）→ ③motifModel legacy（`motifModel && bpb=4 && chords>0`・#16で撤去）→ **④撤去後の最終フォールバック＝V2**。②と④フォールバックは**同一の V2 本体**を呼ぶため `runV2()` クロージャに抽出（②は useV2 ゲート付き・④フォールバックは useV2 非依存）。③を②と④の間に置くことで「useV2:false + motifModel + 4/4」＝③が引き続き到達可能（#16 まで生かす）。②が useV2:true+motifModel を先取り＝**本番（全経路 useV2:true）は不変＝bit一致**。
- **【設計判断1＝gate-miss の受け皿】最終フォールバックを「V2 を非partial で回す」に一本化**。④撤去で受け皿が消える3系統＝(i) useV2 を渡さない直呼び（本番は無い＝主にテスト）(ii) useV2 だが V2 非対応拍子 (iii) partial のゲート外れ（3/4 の partial 等）。いずれも `(bpb∈{3,4,6}|compound) && bars>=1` なら **V2 を非partial で回す**（partial 指定でも種は捨てて新規生成＝受け皿を一本化・partial の厳密補完は 4/4・6/8 の①ゲート内のみ）。
- **【設計判断1続き＝変拍子は丸めずエラー】**V2 非対応拍子（bpb∉{3,4,6} かつ非複合＝**2/4・5/4・7/8・7/4・1/8** 等）は**明示 Error を throw**（`genMelody: 拍子「x/y」（1小節N拍）は未対応です。対応拍子＝4/4・3/4・6/4・6/8系（複合拍）。`）。**丸めは不採用**＝実測で V2 に非対応 bpb を渡すと総尺が合わない（bpb=5 で bars×5 の 7 割、7/8=bpb3.5 も欠落）＝chords との時間整合が黙って壊れる。旧④は 2/4・5/4 でも一応鳴っていたので**明示エラーは意図的な機能後退**だが、(a)黙って壊すよりエラーが誠実（要件）(b)変拍子メロ生成は低頻度（オーナーは 3/6 拍子を明示・2/4 は 2/2=bpb4 で代替可）(c)将来 V2 に bpb 一般化を入れれば受け直せる、という判断。
- **opts ノブ整理**：④排他の `stepWeights` を `genMelody` opts から削除。連鎖して死んだ `corpusBias.learnStepWeights` / `learnStepWeightsFromLibrary` / `cScaleArr`（④の歩幅バイアス専用）と `generate.MOVES` / `DEFAULT_STEP_WEIGHTS` を撤去。呼び出し元 mcp.ts（fit/gen_melody の `learnStepWeightsFromLibrary(core,style)` 渡し）も除去。生成のコーパスバイアスは `learnMotifModelFromLibrary`（V2/③が消費）に一元化。`appoggiatura`（③排他）は #16 で。
- **テスト処遇**：`generate-skeleton.test.ts`（planSkeletonTones 専用・全4本）＝**道連れ削除**。`corpus-bias.test.ts`（learnStepWeights 専用・全5本）＝**削除**（learnStepWeights 自体が消えた）。`generate.test.ts` の④固有 7 describe（19本＝コードトーン拘束/骨格S1c/弱拍装飾S3b/位置駆動S3a/滑り込みS2b/頂点アーチS2a/拍子弱起S1d）＝**削除**（V2 の性質は melody-cells-v2*/section-context/generate-invariants が別途担保）。`generate-key.test.ts` の「C① genMelody 経過音も調内」＝**削除**（V2 の tonic中心飽和窓で移調等価が成り立たない＝④固有）。`generate-invariants.test.ts`：「不変条件[60,84]」＝**V2化**（対応拍子×mood×bars×seed で妥当音域[48,84]＋**未対応拍子は throw を確認**）／「句末着地B2」＝**V2化**（useV2:true でも最終音は G7 構成音に着地することを実測確認・合格）。
- **鉄則＝V2（useV2:true）は bit 一致**：②の V2 本体は `runV2()` へ**バイト等価に切り出しただけ**（呼び出し条件も同一）＝既存 V2 系テスト全緑（api 874 緑・tsc clean）。
- **6/4 負dur bug（J2a 由来）＝Task#17 で是正済み（2026-07-12）**：render/renderPreserve の非compound分岐で「ブロック末フォールバック」が `(bar0+mb)*4` と barLen=4 をハードコードしていた＝6/4（barLen=6）では実ブロック末より手前を指し、末尾音の gap が負→負dur になっていた。`*4`→`*barLen` で根治（barLen=4 は同値＝4/4 bit 一致・3/4 の食い込みも整合）。invariants スイープに 6/4 を復帰＋triple に dur>0 スイープ回帰を追加。

### 【J4 ③ motifModel 経路（genMotifMelody）の撤去】（設計 2026-07-12・Task#16・**DONE**・api 875→874 緑）
**動機＝旧経路撤去 #11 の掉尾**。J3（④撤去）後に残っていた③ motifModel 経路（`generate.ts` の `opts?.motifModel && bpb===4 && chords>0 && bars>=1` ゲート＋`genMotifMelody`(melodyCells.ts) 呼び出し）を撤去。呼出グラフ全数調査（`docs/research/2026-07-11-genmelody-path-callgraph.md`）＋J2c（fit を useV2:true 化）により**本番は全経路 useV2:true＝②V2 が先取り＝③は不到達**（③に落ちるのは「useV2:false + motifModel + 4/4」のみ＝テスト専用）。
- **撤去物**：①`generate.ts` の③ブロック（ゲート＋`genMotifMelody` 呼び出し・~18行）②`melodyCells.ts` の `genMotifMelody` 関数本体（V2 の `genMotifMelodyV2` とは別関数・③専用・~95行）＝内包する**倚音(appoggiatura)挿入**ブロックも道連れ ③`snapToChordTones` の**appo 分岐**（`opts.appoggiatura`/`seed`/`r`＝③が唯一の呼び側でも appo を渡しておらず実質デッド）④`genMelody` opts の `appoggiatura` ノブ（③排他）。
- **共有ヘルパは残置**：`snapToChordTones` 本体・`genSkeleton`(v1)・`genContour`・`sampleBarRhythm` は③撤去で production 参照が消えるが**汎用ユーティリティ＋各自の単体テストを持つ**ため関数自体は残す（V2 が共有する `genSkeletonFromModel`/`anticipate`/`clampScale` 等は当然残置＝grep 全数確認済み）。`SKELETON_REST_BY_POS` import は③でのみ使用だったため除去。
- **③の受け皿＝V2 フォールバック**：③消失後、「motifModel 指定だが useV2:false」は最終フォールバック `(bpb∈{3,4,6}|compound)&&bars>=1 → runV2()` に落ちる。**runV2() は opts.motifModel を消費する**（m16 の rhythm16/move へブレンド＝corpusModel/style バイアスは活きる）＝機能後退なし。**useV2:true（②）と useV2:false（④フォールバック）は同一 runV2() を同一 opts で呼ぶ＝バイト等価**（generate-invariants の J4 テストで実証）。
- **倚音/掛留の一元化 完了**：backlog「倚音/掛留の三重実装（applyExpression④／V2 melodyCells／genMotifMelody③）」は、J3 の④撤去（applyExpression 消滅）＋本 J4 の③撤去（appoggiatura 挿入＋snapToChordTones appo 分岐 消滅）で**V2 の表情パス（`genMotifMelodyV2` 内・melodyCells.ts ~1200付近・classifyNCT/isResolvedNct 準拠）一本に集約**。
- **テスト処遇**：`melody-cells.test.ts` の `genMotifMelody` describe（③検証・4/4＋6/8 の2本）＝**削除**（統合生成の検証は melody-cells-v2*/section-context/generate-invariants が V2 側で担保）。③依存はこの describe のみ（`generate-invariants` の motifModel テストは useV2:true＝②経路／`melody-cells-v2`・`degree` の appoggiatura は NctKind 分類＝別物＝いずれも残置）。新規＝`generate-invariants` に「③受け皿＝motifModel+useV2:false+4/4 が useV2:true と bit 一致＋音域内」を追加。
- **鉄則＝②V2（本番全ケース）は bit 一致**：③ゲートを②の後・④の前から抜いただけで②/①/④の分岐条件・runV2() 本体は不変＝既存 V2 系テスト全緑（api 874 緑・tsc clean）。

### 【S6 骨格の机＝セクション文脈IF】（設計 2026-07-12・設計思考2本を統合Fableが正典化）

**用語対応表（UI確定版・2026-07-12）**：本節は設計思考期の造語（机／吹く／レンズ／畳み／ベッド／接点／試着 等）で書かれている。オーナー指摘「英語の和訳的で一般に通じない」を受け、**UI 表示テキストは下表の右列（確定版）へ改称済み**（`SkeletonDesk.tsx`／`deskStages.ts`／`SectionEditor.tsx`）。本節本文の設計語（左列）は設計判断の来歴として残すが、**読者は表示語を右列で引く**（どの doc を見てもこの表へ戻れば対応が取れるアンカー）。根拠監査＝`docs/research/2026-07-12-desk-wording-audit.md`。

| 設計語（旧・本節本文） | UI表示（確定版） | 何を指すか |
|---|---|---|
| 骨格の机 | 骨格エディタ | 画面名（セクション文脈で骨格を書く全画面） |
| 吹く／吹いています… | メロを作る／生成中… | 焦点骨格から表面メロを生成（gen_melody(skeletonNetaId)） |
| →吹いたメロ N | 作ったメロ N | この骨格から作ったメロの在庫数（realized_from 逆引き） |
| （骨格から）ベースを吹く | （骨格から）ベースを作る | gen_bass(skeletonNetaId) |
| 試着／試着中 | 試聴／試聴中（停止） | 候補を伴奏に重ねて鳴らして比較（在庫不変） |
| ＋置く | 置く | 骨格位置へメロを確定配置 |
| 聴きレンズ／レンズ | 聴き方 | 何を聴くかの2択トグル |
| 畳み｜実音（③④） | 骨格だけ｜フル | 骨格2声だけ／編成フル |
| パターン単体｜ベッド（①） | ドラムだけ｜伴奏 | ドラム単体／伴奏フル |
| 和声だけ｜編成（②） | コードだけ｜フル | 素の三和音／編成フル |
| ベッド | 伴奏 | セクションの伴奏ループ（下敷き） |
| 接点（ストリップ見出し） | 対位 | メロ×ベースの縦の関係（対位法要約） |
| 要確認×N | 要チェック×N | ②の差替で対位が変わった接点の数 |
| 書く[①②③]＋出口[④] | ①②③で書く → ④でメロ生成 | レール装飾の案内 |
| 在庫（を書き換えない） | 元のコード／保存データ | 保存済みネタ |

**注記（レンズの多義）**：「レンズ」＝『見方・聴き方の切替』の意の局所的な比喩。機能ごとに別物で、プロジェクト共通の概念ではない（UI表示には使わない）。

**維持（造語でない一般語＝改称しない）**：骨格／表面／ビート／コード／対位法／導出ベース／叩き台／窓／全終止・半終止。

**動機**：S2 の SkeletonEditor は骨格を**単品**で編集する器＝伴奏文脈に対する対位法確認とセクション内試聴に向かない（オーナーの痛み）。骨格は「セクションの中で」書き・聴くものへ器を再設計する。
**根拠（設計思考・動くモック付き）**＝`docs/research/2026-07-12-skeleton-if-redesign-memo.md`（机の本体設計）＋`docs/research/2026-07-12-desk-feel-seams-memo.md`（通しへ広げた時の縫い目監査4点）。**実装スライス（D0〜D6・Opus委譲）**＝`docs/research/2026-07-12-skeleton-desk-handoff.md`。**受け入れは全スライス2層**＝［機械］（実装役が自己完結＝TDD・bit一致・機構駆動の観測）＋［耳/手］（人間必須＝スマホ実機の試聴/触診・スライスごとに1〜3点へ的を絞ってオーナーに依頼）＝フィール/音楽の受け入れを機械に肩代わりさせない（オーナー方針 2026-07-12）。以下に出る**縫い目A〜E**ラベルは同memoの「発見した縫い目」節の見出し記号（A/B/C/E・Dは欠番）をそのまま踏襲した呼称。

#### 決定事項（正典）
- **「4つの画面」でなく「1つの机の4つの前景」**。セクション＝ループするベッド（伴奏スケッチ＝ドラム/コード/導出・明示ベース/コード楽器）を常に足元に敷き、①ビート ②コード ③骨格 ④表面 は同じタイムライン上の**前景切替**（ステージレール）。**ステージ切替で再生・ループ位置は維持**（前景切替の要）。①が空でも③は成立（ベッド最小形＝クリック＋コード）。
- **レール正名＝①②③で書く → ④でメロ生成**（旧「書く[①②③]＋出口[④]」・縫い目C裁定）。④表面化は独立した編集段でなく**③の出口**＝机内のトレイ（メロを作る→伴奏の上で試聴→置く）。置いた後は既存メロ編集へ受け渡し。作るたび新メロneta＋realized_from＝**在庫は分岐**（骨格不変・旧メロ不滅）。骨格チップに「作ったメロ N」の分岐スタック（getBacklinks 一覧化）。
- **聴きレンズ（UI表示＝「聴き方」）＝「ベッドをどこまで還元するか」**であり、一般形は**「焦点以外を畳む」**（縫い目A裁定・ステージ相対）：③④＝［骨格だけ(2声＝メロ実音＋実効ベース+1oct＋クリック・コード楽器ミュート)｜フル(編成そのまま)］＝S2 の再生2モードの文脈内版。①＝［ドラムだけ｜伴奏］・②＝［コードだけ｜フル］。**③④の還元計算は現行 `skeletonPlaybackNotes(counterpoint)`/`skeletonEarNotes` のまま＝bit一致**。**レンズ切替は再生を止めない**（同じループの同じ小節を骨格だけ⇄フルで聴き比べる＝この器の核）。
- **編集面の表示は常に畳み・実音は常設オーバービューで見せる**（S2 方式C踏襲＝計算は実音・表示だけ畳む。レンズは耳のみ組み替え、目は組み替えない＝打点の手が狂わない）。
- **対位法＝接点として見せ、指摘→即・耳**：音程バッジの要約列＝接点ストリップ。タップ→説明ポップ（**指摘のみ・禁止しない**＝#20思想）＋「この瞬間だけ聴く」＝当該拍の2声だけ鳴らす**ダイアッド試聴**。②は「対位の相手を書く段」と明示＝導出ベースを②に常時表示（分数コード選択＝下声の対位）。
- **上流編集が下流を黙って腐らせる問題＝「変化→耳」**（縫い目B裁定）：②のコード差替は今見ていない③の詰めた対位を無効化しうる（層は DAG コード→骨格→表面・共有ネタは別セクションへもカスケード）。**自動修正はしない**（機械は指摘まで）。腐りを**見せる**：ステージレール/接点に「要チェック」痕→戻ると腐った接点がパルス→「変化した瞬間を聴く」。**段階導入**＝まず粗い判定（同 section 同居・セッション内・非永続＝B-lite・スライスD6）で価値を出し、**永続的な変更来歴追跡（コード区間→依存接点の逆引き）とクロスセクション波及は backlog**（耳確認FBの前に重い土台を作らない）。
- **机の射程＝セクション楽器**（縫い目E裁定・正直な線引き）：曲（背骨）レベルではレンズ（対位相手が無い）と接点ダイアッド（縦の対位が対象でない）が意味を失う＝**「同じ机の第5前景」にはしない**。曲レベルは**別楽器**（現行 song エディタの延長＝セクション並べ・再利用リンク・エネルギーの弧が道具）とし、机と共有するのは **transport／ループ選択／在庫**だけ。「点→耳」の精神の曲レベル翻訳＝**遷移試聴（前セクション末→次セクション頭）は backlog**。
- **独立素材との両立＝配置越し編集**：机の編集対象は「このセクションに置かれた骨格ネタ」。ビューは配置移調を適用し保存時に外す（melodyPlacementShift 流儀の往復＝`skeletonEarNotes` の shift と同じ座標系）。素材チップに「他N箇所で使用」常時表示＋「複製して切り離す」（copy_neta→この配置だけ差し替え）＝使い回し素材を直すと他所も変わる罠の明示。
- **叩き台の試着（candPreview）はループを止めずに回す**：骨格候補・表面候補とも、再生中なら次のスケジュール分から試着が鳴る（現骨格はゴースト）。採用＝置換（破壊上書きしない流儀・Undo可）。
- **入口**：SectionEditor 骨格ブロックタップ→机（主線）。ネタ帳→単品 SkeletonEditor は素材庫クイック確認として存置。①ビート前景の**内部**（ドラムのステップ打ち込み）は再設計しない（既存の器のまま＝机は前景として吊るすだけ）。

#### bit一致・不変の境界
- **api は無改変**：S1〜S4 の生成契約（gen_skeleton/gen_melody(skeletonNetaId)/gen_bass 骨格結線/voiceLeadingReport/harmonize/substitute_chord）を**そのまま消費**する器＝新しい生成契約を足さない。
- **web 純ロジック `skeletonEdit.ts` の既存関数は無改変**（追加のみ）。畳み/実効ベース/対位法判定/再生2声の計算は S2 決定のまま。
- **SectionEditor の既存挙動は不変**（入口の追加・context 抽出はバイト等価移設）。合成（compositeNotes）と MIDI 書き出しに骨格は混入しない（従来どおり無音）。
- **既知の技術リスク（設計時点で正直に）**：「レンズ切替を止めない」は現行 `playNotes`（再生開始時に全ノートを Transport へ先行スケジュール）では**そのままでは成立しない**＝audio 層の小拡張が要る（両レンズ同時スケジュール＋レンズ別バスのゲート切替を推奨。partGains/setMixVolume の建付けが流用できる）。詳細と代替案は handoff doc D1。

#### 実装進捗（2026-07-12・Opus委譲→Fable親レビュー→コミット）
- **D0 DONE**（9bafcbf）：セクション文脈計算（sectionChords/sectionBass/sectionDrums/earChords/skelEar/childDur/contentDur/laneChildren/inLane/rowOf）を純関数 `apps/web/src/sectionContext.ts` へ**バイト等価抽出**（抽出前クロージャの逐語コピーと deepEqual 突合で実証）。SectionEditor は薄い委譲。
- **D1a DONE**（32c98af）：audio レンズバス＝**無停止A/B切替の技術核**（案イ）。`sampler(part,lens)→partLensGain[part][lens]→partGains[part]→master`、`PlaybackHandle.setLensGain(lens,on)` ランプ切替、`Note.lens?`／`PlayOpts.activeLens`。**レンズ無し Note は従来経路で bit一致**・**SF2 の1回DL dedup 不変**（レンズ別 sampler でも再DLゼロ）。純関数 `lensesOf`/`lensGateTargets` をテスト。
- **D1b DONE**（3209964）：`apps/web/src/deskLens.ts` 純関数＝`foldLensNotes`（2声＝lens:fold＋クリック）／`realLensNotes`（編成＋骨格線＝lens:real）／`clickNotes`（4分・小節頭アクセント）。`LENS_FOLD/LENS_REAL`。
- **D1c DONE（耳待ち）**（aca9aff）：`SkeletonDesk.tsx`＝③前景＋共有ループ＋レンズ2択の全画面。SkeletonEditor をそのまま子に内包（ロールのコピー/抽出せず）。自前 composition（getComposition）・**配置越し2段解除**（`deskContent.ts` の deskLoadContent(+shift)/deskSaveContent(−shift)＝往復bitをテストで固定・鳴らすは state 実調ゆえ skeletonEarNotes を shift:0＝二重移調しない）・保存 debounce＋useEditHistory Undo。`useTransport` に activeLens/setLensGain を**加算optionalで拡張**（既存consumer不変）＝レンズ切替は setLensGain パススルーのみで **begin を回さない＝再スケジュールしない＝位置保持**。入口＝SectionEditor 骨格ブロックタップ→onOpenSkeletonDesk→App deskTarget 全画面（単品 SkeletonEditor 経路は不変）。web 48ファイル/454テスト緑・typecheck・build緑。
- **D1.5 DONE**（e3037c1）：ループ範囲ブレース＋**机再生をブロックローカル座標へ統一**（skelEar は +skelPosition しない・ベッドは `sliceBedToWindow` で骨格ブロック窓を切り出し -skelPosition・`scaleBeats=blockSpan`）＝skelPosition≠0 でも playhead がロールと一致。`useTransport` に range/reloop 加算（既存 consumer 不変）。
- **D2 DONE（耳待ち）**（2a30aca）：接点ストリップ（ロール直下・タップできる対位法要約行・バッジ label＝intervalBadge 崇拝）＋説明ポップ（`contactText`＝**指摘のみ・禁止しない**・禁止語ゼロをテスト固定）＋「この瞬間だけ聴く」＝当該拍の**2音だけ**ダイアッド（`contactDyadNotes`・構造的にベッド非混入）。`previewNote(note,{holdSec?})` 加算拡張（未指定＝従来 bit 一致）。
- **D3 DONE（耳待ち）**（e3e82b3）：②コード前景＝コードチップ列＋導出ベース線常時表示＋`substitute_chord` 試着→採用。`deskChords.ts`（chordChips＝earChords＋出所・applyChordTrial・adoptedChordContent）。`effChords=applyChordTrial(earChordsRel,trial)` を cp/ベッド/ロールが見る＝**③が試着に追従**。updateNeta は採用時のみ（試着は在庫不変）。**［裁定・api境界の逸脱］**：`substitute_chord` は MCP 専用で web HTTP `/music/:op` に未登録だった（handoff の「消費するだけ」前提が実コードで崩れていた）＝理論SSOT（`substitutesOf`）を二重化せず **http.ts に1 case 加算で既存純関数を露出**（mcp.ts と同計算・他op不変・新ロジックゼロ）。「api無改変＝新生成契約を足さない」の精神は保つ加算と判断。**除外＝D3b（他N箇所で使用/複製切り離し＝配置カウント read api 要）は backlog**。
- **D4 DONE（耳待ち）**（f2e2ea6）：④出口トレイ＝レール[①②③で書く → ④でメロ生成]（旧「書く①②③＋出口④」）。机で `MelodyGenCtx` を組み `useMelodyGen` を1つ起動（SectionEditor と同じ `sectionContext` 計算でベッド/コード/ベース/ドラムを渡す＝「メロを作る」＝旧「吹く」が骨格ブロック[メロを作る▶]と bit 一致）。**メロを作る▶（旧 吹く▶）**＝焦点骨格から gen_melody(skeletonNetaId)→候補トレイ（各候補に voiceLeading バッジ〔S3d 要約・再実装せず〕）。**試着▶**＝`candPreview`＝getNotes(deskLensNotes) の実音レンズのメロ枠を候補で差替（現骨格線 skelEar／現メロ part:"melody" をゴースト・伴奏は残す）・実音レンズへ寄せ **tp.reloop で次ループから無停止反映**（巡回では飛ばさない）・**在庫不変**（ローカル state のみ）。**＋置く**＝`placeCandidate(c, skelPosition)`＝焦点骨格の位置へ表面メロ＝新メロ neta＋realized_from・骨格 content 不変（在庫は分岐・旧メロ不滅）。**分岐スタック「作ったメロ N」（旧「→吹いたメロ N」）**＝`getRelations(skelNetaId)` の realized_from×melody を純関数 `realizedMelodyCount` で数える（bass は数えない）。**bit加算**：`useMelodyGen.placeCandidate` に optional `position=0`（既定＝従来位置0＝SectionEditor 不変）・`deskLensNotes` に optional `previewMelody`（未指定＝D1.5/D2/D3 と bit 一致）。gen_melody/api 無改変（消費のみ）。web 50ファイル/496テスト緑・typecheck・build緑。**［裁定］**分岐スタック一覧のタップ遷移は机に onOpenNeta 導線が無く（api無改変・新導線=別スライス）**一覧表示のみ**。試着のメロ座標＝gen_melody(skeletonNetaId) 由来のブロックローカル（beat0）＝skelEar と同座標ゆえ **skelPosition オフセットしない**（ベッド/skelEar も既にブロックローカル＝D1.5・座標を揃える素直な判断）。
- **D5 DONE（耳待ち）**（9b6e3bf）：①ビート前景（薄）＋**レンズのステージ相対一般化**（seams A）。`deskStages.ts`＝`stageLensSets(focus,args)={labels,a,b}`＝焦点ステージで2択のラベルと reduce が読み替わる（①ドラムだけ｜伴奏・②コードだけ｜フル・③④骨格だけ｜フル）。**ゲートは2グループ（LENS_FOLD/REAL）据え置き＝audio.ts 無改変**、ステージ切替=reloop・ステージ内A⇄B=setLensGain（無停止）。`deskLensNotes` を `deskFoldReal` に分解し `[...fold,...real]` で**完全同一**＝③④は D1〜D4 と音符列 deepEqual（二重固定）。①ビート行は表示のみ（潜り導線は机に onOpenNeta 無し＝D4 同制約）。既定 focus=skeleton＝起動時は現行のまま。web 51ファイル/512テスト緑。
- **D6 DONE（耳待ち・S6 実装スライス完了）**（8ebf946）：B-lite「変化→耳」＝②のコード差替が③の詰めた対位を黙って腐らせる問題を**見せる**（自動修正しない・**セッション内・非永続=React state のみ・DB 不変**）。`staleContacts(editedRanges,cp)`＝純関数（cp.start が編集区間 [start,end) に載れば stale・半開・空で全 false・骨格編集では立たない）。`adoptChord`（②採用の瞬間のみ）で差替コードのブロックローカル区間を記録。接点ストリップに「要チェック×N」痕＋staleパルス＋タップで「変化した瞬間を聴く」＝**D2 の `playContactDyad` 流用**（新ダイアッド足さない）。試聴で acknowledge（start 単位＝兄弟接点を黙らせない）・再採用で解除（見落とし防止）＝オオカミ少年化しない。**やらない（backlog・design 明記どおり手つかず）**＝永続的変更来歴追跡/クロスセクション波及/背骨「B波及」バッジ。web 51ファイル/520テスト緑。
- **✅ S6 実装スライス D0〜D6 完了（2026-07-12・全 main コミット済）**。机は「①〜④の前景切替＋ステージ相対レンズ（無停止A/B）＋範囲ブレース＋配置越し編集/保存/Undo＋接点ダイアッド＋②コード試着で③追従＋④メロを作る→試聴→置く＋分岐スタック＋B-lite変化→耳」まで機械緑。**api 無改変（例外＝D3 で substitute_chord を HTTP へ1 case 露出・既存純関数）／SkeletonEditor・skeletonEdit.ts・音源ゲート（audio 2グループ）は不変**（※SkeletonEditor は後日の実機FB是正 d6ae32b で `embedded?` prop を**加算**＝既定 false ゆえ単品UIの挙動は不変だが、字義どおりの「無改変」ではなくなった。下記実機FB行参照）。残＝**［耳/手］の実機試聴のみ**（機械では受け入れ不能な層）。
- **［耳/手］未消化（D1〜D6・オーナー実機・機械では受け入れ不能）**：D1＝①レンズ無停止切替の滑らかさ（核）②打点スクロール誤爆③クリック音量。D2＝④指摘文が「禁止でなく味」に読めるか⑤ダイアッド持続/音量で不協和が聴き取れるか。D3＝⑥コード試着で③の響き変化を止めず追え採用で鳴り直すのが妥当か⑦導出ベース線が「②が下声を決める」と読めるか。D4＝⑧候補試聴が止めず次周から鳴り現メロと比較できるか⑨レール＋「作ったメロ N」で分岐（旧メロ不滅）が直感に落ちるか。D5＝⑩レンズの2ラベルが段で読み替わっても「同じ1つの操作」に感じるか⑪①ドラムだけ/②コードだけが確認に足りるか。D6＝⑫腐った接点だけがパルスする（騒がない）か⑬「変化した瞬間を聴く」で悪化が耳で分かるか。**フィール既定（クリック vel90/55・SAVE_DEBOUNCE500ms・ダイアッド0.8拍・②和声program0・reloop発火点・staleパルス等）は暫定＝耳較正で見直し可**。
- **D6後の実機FB是正（2026-07-12・オーナー実機E2E）**：
  - **モバイルUI崩れ修正（d6ae32b）**：Galaxy S24 FE幅で③ロールが高さ0で消える致命崩れ等。SkeletonEditor に `embedded?` prop 加算（**既定 false＝単品UI完全不変**）・embedded 時のみ凡例/ヒント/再生[対位法|実音]トグルを隠す（机の下端レンズと重複・縦を食う）・skeleton.css の flex/min-height/sticky 是正・机オープン中は chat FAB 非表示。
  - **A/B/C 3件（f9e0e91）**：(A)骨格ロール横スクロールでグリッド背景が途切れる→ゾーン行を flex:0 0 auto で幅W尊重。(B)「骨格を鳴らす」を「いじる」横→下端トランスポートへ移設＋ON時メロミュート化（上記S2節）。(C)骨格プレビュー音色をピアノ→Strings(48)へ統一。
  - **UI造語の一般語化＋doc語彙監査（c03c54f）**：机/吹く/レンズ/試着 等を一般語へ改称（上記用語対応表が正典）・監査＝`docs/research/2026-07-12-desk-wording-audit.md`。
- **残（D7 パーキング・backlog）**：③叩き台の句単位再抽選（「句2だけ引き直す」）・3/4・6/4 の snap 表・②和声レンズの voicing 込み化・①ドラム/分岐スタックの潜り導線（机に onOpenNeta）・単品 SkeletonEditor の撤去/共通化判断・D3b（他N箇所で使用/複製切り離し＝配置カウント read api 要）・B本格（永続変更来歴/クロスセクション）・E 遷移試聴（曲=別楽器）。

## #21 コーパス遷移統計テーブル（WP-0・設計 2026-07-14）

**正典**＝`docs/research/2026-07-14-corpus-db-diagnosis.md` §6.2 ＋ `docs/research/2026-07-14-skeleton-corpus-stats.md`（M2 実測・M1 仕様の穴6点）＋ `docs/research/2026-07-14-research-to-implementation-plan.md` Tier0 WP-0。

**目的**：解析済コーパスを「生成の材料（辞書＋遷移統計）」として一級市民化する第一歩。POP909 骨格の**度数 n-gram（弱マルコフ材料）**とモチーフ**変換文法（M9）**を DB テーブルへ投入し、生成/検索から純関数で引ける。**リテラル旋律は非保存＝統計・度数・相対のみ（著作権セーフ）**。

**思想の位置づけ**：これは「候補を増やす」生成材料（設計思想＝機械は候補まで）。審判用でない。**既定生成は無変更**（WP-0 は storage＋read のみ・生成側結線は WP-M1/M2）。

### 何を DB 化するか（範囲）
- **投入素材（既存）**＝`data/corpus-stats/skeleton-corpus-stats-20260714.json`（M2＝骨格 度数 bigram/trigram 全行列＋開始/終止/輪郭/chordRel/装飾 分布・POP909 880曲 4/4）＋`motif-transform-stats-{1,2}bar.json`（M9＝変換頻度/移高幅/長さ増減/距離条件付き）。
- **R0§6.2 のうち WP-0 で実装するのは (B) note_transition 相当（骨格 n-gram）と M9 変換文法**。**(A) phrase_pattern の literal 句・(C/D) chord_progression_pattern/chord_transition は本 WP 対象外**＝raw 句/進行の**再構築（`build-phrase-dict`/`ingest-ufret` の位相・長短分裂修正）が前提**で素材が別（§6.3・別 WP）。骨格分布（開始/終止/輪郭/chordRel）は `corpus_skeleton_prior` に格納＝WP-M1 の輪郭 prior・強拍倚音（M1穴の chordal skip＝chordRelStrong/Weak）の材料。

### スキーマ（追加のみ・非破壊＝`CREATE TABLE IF NOT EXISTS`。既存 neta 不可侵・project 自作データ不可侵）
- **`corpus_note_transition(style, mode, ngram, from_ctx, to_deg, count)`** PK(style,mode,ngram,from_ctx,to_deg)：骨格度数 n-gram。`ngram`=2(bigram)/3(trigram)、`from_ctx`＝前文脈の度数列（"4" or "4>2"）、`to_deg`＝次度数(key相対pc 0..11)。style="pop"（POP909）。骨格は2拍固定格子ゆえ ioi/beat_phase バケットは付与しない（§5 の注）。
- **`corpus_skeleton_prior(style, mode, feature, bin, pct, n)`** PK(style,mode,feature,bin)：分布 prior。`feature` ∈ {startDeg,cadDeg,degHist,chordRel,chordRelStrong,chordRelWeak,contour,rangeHist,ornType}、`bin`＝pc/ラベル文字列。**chordRelStrong/Weak が M1 穴の「強拍倚音＝chordal skip」材料**（強拍でも CT 率 65.8%＝残 3割は倚音）。
- **`corpus_motif_transform(scope_bars, feature, bin, count, pct)`** PK(scope_bars,feature,bin)：M9 変換文法。`scope_bars`=1/2、`feature` ∈ {transform,transposeShift,lengthDelta,catByDist}、`bin`＝変換名/半音数/長さ増減/`<変換>:<距離バケット>`。距離条件付き変換（catByDist＝「近くで変え遠くで戻す」）は WP-M2 の材料。

### 投入・読み出し
- **投入スクリプト**＝`apps/api/scripts/ingest-corpus-stats.ts`（`ingestCorpusStats(db, sources)` 純関数＋薄い CLI ラッパ）。**DB 変更前にバックアップ**（`data/backups/` へ日時つき cp）。`INSERT OR REPLACE`＝冪等（再投入で重複しない）。ZZE2E/ZZDESIGN 等のテスト生成物は素材（統計JSON）に含まれないので混入なし。
- **読み出しの純関数 API**＝`apps/api/src/music/corpusStats.ts`（`corpusBias.ts` の隣）：`loadNoteTransitions(db,style,mode)`→bigram/trigram マップ、`loadSkeletonPriors(db,style,mode)`→feature別分布、`loadMotifTransforms(db,scopeBars)`→feature別、`hasCorpusStats(db)`＝未投入なら空/false（degrade gracefully＝無コーパスで従来 fallback）。生成の消費（度数ウォーク・輪郭 reject・変換選択）は各分布を **count 重みで標本化する純関数**（`sampleByCount`）＝WP-M1/M2 が呼ぶ。
- **TDD**：スキーマ round-trip（小 fixture を in-memory DB へ ingest→read で件数/形状/冪等を検証）＋読み出し契約（bigram の from_ctx 分解・trigram の ngram=3・prior の pct 総和・motif の scope 別）。

### 受け入れ（機械）
- ingest→read が bit 安定（同素材で同カウント）・冪等・無コーパス時 fallback。既定生成は**完全に無変更**（storage 追加のみ・generate は本 WP で corpusStats を呼ばない）。
- **残（別 WP）**＝(A)literal 句辞書と (C/D)進行遷移は raw 再構築が前提（§6.3・backlog）。生成側結線（bigram ウォーク/輪郭 prior/強拍倚音/変換文法）は WP-M1/M2。

## #22 旋律類似の独自性警告（WP-M8・設計 2026-07-14）

**正典＝`docs/research/2026-07-14-melody-similarity-warning.md`**（記念樹/Blurred Lines/Dark Horse/Shape of You・scènes à faire/de minimis・cryptomnesia）。
思想＝「機械は候補・足場まで、白黒は人間」＝**警告のみでブロックしない**。**これは法的助言ではない**（緑を安全証明と誤読させない・免責を必ず添付）。

### 芯（研究doc §3-§5）
- **除外ゲートを前段に一級実装**（誤警告＝ありふれ音型への過剰反応が最大の実害）。**除外を通ったものだけ**トリアージ。
  - §5.2 構造的 scènes à faire＝順次スケール/クロマチック/分散和音/同音反復/同一音程オスティナート（音高一致でも building block として無罪化）。
  - §5.1 コーパス頻度＝音程 ngram が大規模コーパスで高頻度なら除外（injectable `commonness()`・上位◯%）。§5.3 de minimis＝3音未満は無罪。
- **AND 条件で赤の乱発を防ぐ**（§5.4）＝赤は「音高一致 ∧ リズム一致 ∧ (連続長 or 位置)」が揃って初めて。音高だけの長一致は黄止まり。移調不変（音程列で比較）。
- **緑/黄/赤トリアージ**（§3.2 危険帯・除外後）：🔴連続一致≥8音＋リズム一致／ngram重複>30%(十分長い旋律)／輪郭+リズム≥3小節。🟡連続6〜7音／ngram15〜30%／輪郭+リズム≒2小節。🟢その他。

### 契約（純関数＋verb・既存不変で追加）
- **`similarityWarning.ts`**（`music/` 隣）：`similarityWarning(a,b,opts)→{level:green|yellow|red, findings[], disclaimer}`＝2旋律トリアージ純関数（除外ゲート＋AND）。`originalityReport(target,corpus,opts)→{channel:"self",layer?,scanned,hits[],disclaimer,note}`＝新作×自作コーパス（cryptomnesia）。`isCommonplaceFigure(intervalRun)` と `SIMILARITY_DISCLAIMER` も公開。`opts={commonness?,commonThreshold?,layer?}`。**disclaimer は緑でも必須**。
- **`check_originality` verb**（MCP chat面＝**allowlist追加**・許可漏れ厳禁BUG#1型／HTTP `check_originality`＋2旋律直接 `similarity_warning`）＝新作メロ×自作既出コーパス（project の melody 全走査 or 明示 candidates or against 2旋律直接）→焼き直しレポート。**警告のみ・ブロックしない**。骨格層の手癖は `layer:"skeleton"`。
- **既存 `melody_similarity`/`find_similar` は挙動不変**（新 verb として足すだけ）。self ヒットは権利チャンネルでなく「手癖」チャンネル（色/文言を分ける）。

### 受け入れ（TDD・機械）
- 固定値＝8音連続一致(非ありふれ・リズム一致)→red／ありふれ音型のみ一致→green(除外ゲート)／AND未満(6音・音高だけ長一致)→yellow止まり。**disclaimer 必須**。コーパス頻度 injection で全除外→green。既存類似度テスト回帰緑。`test/similarity-warning.test.ts`。

## #23 いじる🎲の体感結線（UI監査 2026-07-15・オーナー不満①の是正）

**診断**（`docs/research/2026-07-15-ui-feature-inventory.md` §5）：TinkerSheet メロ引き出しの🎲（`dice-roll`→`rollDice`）は**ノブを±0.3乱択するだけで再生成が未結線**。しかも (a) 振られる11ノブ中7本は折り畳み内で不可視 (b) seg系既定0は負方向乱数でclampされ無変化＝「押しても何も起きない」。SkeletonEditorの「🎲別案」やトレイの「もっと」は再生成に結線済みで**同じサイコロ絵なのに挙動が非対称**＝混乱の温床。

**決定（体験原則「選択肢を出す・ばらつき×制御」に沿う）**：
1. **🎲＝振ってから即・再生成**。`rollDice` はノブ乱択後にそのまま `genPart("gen_melody")` を呼ぶ＝押すたび「別の性格のメロ候補」がトレイに出る。🔒ロックは従来通り乱択から守る（制御は生きる）。生成できない状態（コード無し）では `gen-gen_melody` と同じ条件で **disabled**（理由をtitleに）。
2. **乱択は「必ず動く」**：乱択結果が現在値と同一になった場合は最小刻み(0.1)だけ強制的に動かす（clamp端では内側へ）＝「押したのに何も変わらない」の根絶。
3. **「もっと」の沈黙修正**：`lastPartRef.current` が null の間は `more-candidates` を **disabled**（title="直前の生成がまだない"）。無反応ボタンを残さない。

**受け入れ（TDD・web）**：🎲押下→(a) ロック外ノブの値が押下前と1つ以上異なる (b) ロック中ノブは不変 (c) genPart が gen_melody で1回呼ばれる (d) コード無しセクションでは disabled。「もっと」＝lastPartRef null で disabled・有りで enabled。既存 useMelodyGen/TinkerSheet テスト回帰緑。

## #24 再生開始の非ブロック契約（UI監査 2026-07-15・オーナー不満②の是正）

**実測による診断**（正典＝`docs/research/2026-07-15-ui-audit-results.md` §5）：SF2温済みなら押下→開始は28–30msで完全一定・テンポ揺れ皆無。「一定しない」の主犯＝**SF2(32MB)先読みと▶のレース**：`ensureSoundFont(waitIfCold=false)`（audio.ts:501）が、`alreadyLoading`（先読み進行中）だと**「待たない」指定にもかかわらず in-flight ロードを await** し、遅い回線では**再生が10秒超ハング**（同一ボタンで30ms↔13,000ms）。#84是正「進行中ロードは必ず待つ＝SF2で鳴る」の意図が、遅回線で破綻していた。

**決定**：
1. **waitIfCold=false は「有界待ち」に**：in-flight ロードがあっても **≤400ms だけ**待つ（`Promise.race`）。間に合えばSF2、間に合わなければ**今回は簡易シンセで即鳴らし、裏でロード継続＝次回からSF2**（元のコメントの意図を有界で復活）。押下→発音の上限が常に ~400ms＝「一定しない」の根絶。
2. **usePlayhead.stop() は `--phb`/`--ph` もリセット**（停止後にプレイヘッド変数が残る実バグ・usePlayhead.ts:42）。
3. 有界待ちで音色が簡易シンセになるケースは**耳確認リスト**へ（頻度＝ページ開いて数秒以内に▶の時だけ）。

**やらない（backlog起票）**：SF2軽量化（32MB→GMサブセット・根治）／デコード済みSF2のIndexedDB永続化／読込中インジケータ（▶に「音源読込中」）／Tone latencyHint・lookAhead の明示設定（音↔線の~115ms固定オフセットの端末非依存化）／toggleLoop の in-place 化。

**受け入れ（TDD・web）**：makeSampler を遅延フェイクにし (a) in-flight ロード中の `ensureSoundFont(…, false)` が ~400ms 以内に null を返す（awaitで数秒待たない） (b) 400ms以内にロード完了すればSF2を返す (c) waitIfCold=true（明示・先読み）は従来通り待つ (d) 停止後 `--phb`/`--ph` が0。既存audio系テスト回帰緑。

## #25 弱起（負start）の再生契約（2026-07-15・オーナー指示で確定）

**却下された案**：負startをt=0へ丸めて鳴らす（頭拍に潰れる＝妥協NG・聞くまでもない）。

**契約**（lead L ＝ max(0, −min(start)) 拍・弱起が無ければ L=0 で全経路bit一致）：
1. **単発（非ループ）再生**＝**弱起ぶんマイナスから開始**：全イベントを +L 拍シフトしてスケジュールし transport 0 から再生（音響上は「−L拍から始まる」のと等価）。終端の自動停止も +L 追従。**視覚**：リード区間（raw beat < L）はプレイヘッド線を 0 位置で待機・position は弱起中と分かる表示（例「弱起…」）、L 到達後は beat = raw−L で従来通り。
2. **ループ再生**＝**0拍開始・弱起はループに巻き込む**：loop は [0, total)。start<0 のノートは **loopEnd + start** の位置にスケジュール（＝ループ終端で「次周の頭への弱起」として鳴る）。初回周だけは弱起が先頭で鳴らない（0拍開始の帰結・仕様）。範囲ブレース窓 [s,e) でも同式（e + start）＝窓ループでも終端で巻き込む。
3. **reschedule（#7-C）経路も同一規則**：スケジュールの共通口（scheduleFrom）に実装し、初回・組み直しで挙動を割らない。
4. MIDI書き出しは #（ウェーブC実装）の小節単位プリロールのまま（別契約・変更なし）。previewNote は対象外。

**受け入れ（TDD・web）**：(a) 非ループ：start=−0.5 のノートのイベント時刻が 0、1拍目の音が +0.5拍相当、onEnd が total+L に追従 (b) ループ（total=8）：弱起が (8−0.5)拍相当の時刻・loopStart=0/loopEnd=8拍・他ノートは無シフト (c) 窓ループ [4,8) でも弱起は e+start (d) 弱起無し＝全経路で従来とbit一致 (e) プレイヘッド：リード区間で線が 0 待機・position が弱起表示・L 以降は beat=raw−L。既存 transport/playhead テスト回帰緑。

**仮歌カウントイン（#13c）との合成**：仮歌がある非ループ再生は `leadBeats` に `countInBeats(=leadRest)` を上乗せ＝プレイヘッドはカウントインぶん 0 待機・終端も追従。弱起 lead L とカウントインは同じ単一シフト S に合流＝相対時刻不変（doc §4）。仮歌なしは従来の pickup 契約と完全一致。

## #26 コード進行エディタ＝折り返しブロックタイムライン（2026-07-18・設計フェーズ／オーナー方針確定「文法spec＋コード先行」）

**背景と旧記述の是正**：ChordEditor は #19「コード入力＝自作の行リスト」＋ L1179「ChordEditorは対象外＝タイムラインでなくコード行リスト」で *行リスト* として設計されていた。実機（星空の唄 Cメロ）でオーナー指摘2点：(1) 決定コード名（`.chord-sym`）と隣のルート `<select>` が同色・同肉で見分けられない（スマホでは `.chord-sym` 40px にはみ出し衝突）、(2) カードが縦に伸びて冗長＝中間挿入がほぼ不可能。設計検討3フェーズ（モック＋正直検証）を経て、**コード編集面を「行リスト」から「ブロックタイムライン」へ作り替える**ことを上位決定とする。**L1179／#19 の「行リスト」記述は本節が supersede**（再生中コードの可視化も後述の通りタイムライン化で自然に解ける＝#76 の行ハイライト回避策は不要になる）。

**なぜタイムラインか（Q1 概観 / Q2 入力の結論）**：
- **概観**：現状 MiniRoll はボイシングを `<rect>` で描く「音の影」＝コード名・小節線・和声リズムが見えず「進行の地図」にならない。→ **コード名ブロック**（幅∝拍・度数色・名前ラベル）へ置換。ボイシング高低は**薄いロール帯を下段に残す**（情報は捨てない）。度数レーン（♭VII→I7→IIm7）は移調不変で強いが実音名が消える＝**主表示でなく副表示**向き。
- **入力**：行リストは縦に長く中間挿入が事実上不能（＋コードは末尾のみ→以降を打ち直し）。→ **ブロック＝概観 兼 編集ハンドル**（タップでピッカーシート）＝縦積み消滅。
- **ピアノロール入力は主入力として不採用**：名前入力に操作数（B♭maj7＝名前2–3タップ vs 描画は綴りを暗算して精密タップ4回）・精度（maj7 vs 7 は半音1行＝モバイル約20px、指接地約40px）で負ける／保存形式 `root+quality`（C基準）と逆行し音→名前の逆算は C6=Am7 で root 非一意＝下流（ベース生成/アナリーゼ）がブレる。ロールは**表示/確認用**に留める。ボイシングを手で決める要求は**別機能（ボイシング編集レイヤ＋スキーマ拡張）**として切る（今回スコープ外）。

**折り返し採用（オーナー判断 2026-07-18）**：セクションエディタは横スクロール（BARS>10 で `lane-track` に min-width）。コード進行は**折り返し（N小節/段・リードシート的）**を採る＝入力の一貫性（横スクロール統一）よりも**一覧性**を優先。**意図的な分岐**として確定。前フェーズのモック（`chord-progression-unified.html`）は横スクロールで兄弟性を最大化していたが、コードに限りこれを覆す。

**一貫性の在り処＝「ブロックの文法」（レイアウトが分岐しても揃える契約）**：セクションエディタと揃えるべきは ①ブロック外観 ②挙動、の2つだけ。並べ方（横スクロール/折り返し）は "葉" の違い。両レイアウトが従う**共有契約**：
- **ブロック外観**：`.lane-block` 準拠（ミニロール背景を opacity 落とし＋左下ラベル＋種別色 `--k-chord` 紫）。トークンは `apps/web/src/styles/transport-cards.css` L257–475 を SSOT とする。
- **モード**：`.proll-modes` の 鉛筆(編集)/消しゴム(外す) トグル（Section＝L457／PianoRoll #-681 と同流儀）。消しゴム中はブロックを赤破線（`.lane-block.erasing` 相当）。
- **ジェスチャ**：タップ→編集（ピッカーシート）／右端グリップ・ドラッグ→長さ／空き→追加。
- **語彙**：ヒント文体・「いじる▾」・小節表示を Section に合わせる（ただしコード進行の総尺は content 合計から自動＝偽の小節ステッパーは置かない）。

**レイアウトの分岐は "容器" だけに閉じる（後で塗り直さないための肝）**：ブロックの見た目＋文法（モード/ジェスチャ）を**レイアウト非依存の表示部品＋フック**に factor する。容器は2つ＝`WrapTimeline`（新・折り返し・コード用）と既存スクロール容器（Section・**今回は無改修**）。分岐が容器に閉じているので、将来 Section を折り返し対応にするのは *容器を差し替えるだけ*（ブロック/文法は再導出しない）＝backlog 参照。

**挿入・削除（モック検証で確定）**：
- **削除＝消しゴムモード**（Section と完全同型・新メンタルモデルゼロ＝オーナー「削除が面倒」への直答）＋シート内✕（編集中にその場で消す・従）。選択ブロック常設✕は 22px 小ブロックで誤タップ源＝不採用。
- **挿入＝ブロック境界の「＋」シーム**（編集モードで常設・1タップで直前コードを複製挿入→reflow で以降を右送り→シート即オープン。当たり判定は右端グリップと非重複の境界右14px）＋**末尾の空きセル**（Section「空きをタップ→置く」の方言）。長押し分割は発見不能＋将来の並べ替えドラッグと衝突で不採用。
- **手数**：#2–#3 間挿入＝旧 ≒30–50タップ（末尾追加＋以降打ち直し）→ 新 1–3タップ。#4 削除＝旧 1タップ＋1–2画面スクロール＋同名 C7 の目視特定 → 新 2タップ・スクロール不要（位置は地図で自明）。

**構造（実装スライス・レイアウト非依存を先に factor）**：
- ドメインは不変：`ChordEntry{root,quality,start,dur,bass?}`・C基準保存・`reflow`（start は dur の連なりから自動再計算）・空状態の定番進行チップ。
- 新規：表示部品 `ChordBlock`（レイアウト非依存）＋文法フック（mode/gesture）＋`WrapTimeline` 容器＋ピッカーシート（現行 root/三和音/拡張/オルタード[条件表示]/オンベース/長さ4択/付点/削除の全語彙をそのまま収める）。MiniRoll は据え置き＝下段の薄ロール帯として再利用。
- Section は触らない（`.lanes`/`.lane`/`.lane-track`/`.lane-block`/`LaneCell` 一式そのまま）。

**契約（TDD 先行・ここが命）**：
- `reflow`：既存維持・回帰（start を dur の連なりから再計算＝手入力/ズレ排除）。
- `insertAt(index)`：境界 index に直前コードを複製挿入→以降 reflow→総拍が +dur。
- `removeAt(index)`：削除→reflow→総拍が −dur。
- 長さスナップ：ドラッグ→{1拍, 2拍, 1小節=bpb, 2小節=2·bpb, 付点=基準×1.5} の最近傍にスナップ（`beatsPerBar(meter)` 由来・6/8 対応）。
- 折り返し行割り：総拍→N小節/段で段配列へ分割する純関数（**段跨ぎブロック**＝付点 Dm7 が段境界をまたぐ時の左右分割表示を含む）＋テスト。

**やらない（backlog 起票・検証ゲート＝コード編集で折り返しが実地良好とオーナー確認後）**：
- SectionEditor の折り返し対応（`WrapTimeline` 容器への差し替え・D&D/loopドラッグ/mute/collapse/playhead を折り返し座標系へ）。
- 他エディタ（PianoRoll メロ／ChordPatternEditor リズム）への折り返し一般化（共有容器の再利用）。
- 折り返し⇄横スクロールの表示トグル（両取り＝一覧性と兄弟性の両立）。
- 再生中コードのブロックハイライト（タイムライン化で `.lane-block.playing`／赤左border が自然＝#76 の行ハイライト課題を吸収。`usePlayhead --phb` で駆動）。

**正典・出典**：設計検討3フェーズのモック（オーナー受渡し済＝`chord-editor-mockup.html`〔バッジ精緻化〕／`chord-progression-rethink.html`〔概観4方式＋入力再考〕／`chord-progression-unified.html`〔Section 整合・横スクロール版〕）と分析（Q1/Q2 比較・ピアノロール判定・手数表・実機スクショ実測）は `docs/research/2026-07-18-chord-editor-timeline.md`。本節の折り返し採用はモックの横スクロールを覆すオーナー最終判断（同 doc に追記）。

## #27 再生経路の一本化（PlaybackPlan＋単一ドライバ）（2026-07-18・オーナー指示「根治として一本化」）

**問題**：playNotes 呼び出しが10箇所に散り、各所がペイロード（notes/feel/compound/仮歌/mute）を手組みしていた。仮歌を結線していたのはエディタ経路のみ＝ネタ帳カード▶で歌わない（クラスバグ）。

**決定**：再生は2層に一本化する。
1. **解決層（純・music.ts）** `buildPlayback(source) → PlaybackPlan {notes, bpm, program, feel, compound, vocalJobs}`。歌う子の melody ノートには **sungBy マーカー＋muted** を付け、`vocalJobsOf(notes)` が任意のノート切片（FormStrip の窓切り出し含む）から vocal job を再導出する。**書き出しコンポジット（compositeNotes）は不変・unmuted**＝MIDI 面に再生都合を混ぜない。
2. **駆動層（playback.ts）** `startPlayback(plan, {vocalMode: ensure|peek|off, …})` が唯一のチョークポイント＝wav キャッシュ（module スコープ・SF2 と同方式）→ ensure/peek → playNotes。現行ハンドルレジストリで stale な stop() を no-op 化（別サイトの再生を殺さない）。busy は subscribeVocalBusy（sfLoading と同型）で可視化。

**規律**：playNotes を直接呼んでよいのは playback.ts（と経由する useTransport）のみ。エディタ固有の重ね物（骨格耳・レンズ・自前プレイヘッド）は plan への後段デコレータとして各エディタに置く。vocalMode＝カード/エディタ/Chat保存済は ensure（待ちは busy 表示）、高速試聴（ピッカー/候補/toolカード）は peek（絶対に待たない・#24 の仮歌版）、歌う対象が無い面は off。previewNote（単発入力FB）は Transport 非使用の別プリミティブ＝対象外。

**帰結**：カード▶の仮歌バグと FormStrip 遷移試聴の仮歌欠落（backlog）はこの一本化の副産物として解消。正典＝`docs/research/2026-07-18-playback-path-unification.md`（現状マップ・移行スライス S0〜S5・ガードレール G1 bit一致/G2 書き出し不変/G3 仮歌等値）。実装＝S1 純関数追加＋テスト → S2 driver → S3 エディタ切替(挙動不変) → S4 素通し9サイト移行(ここで両バグ解消) → S5 封鎖(playNotes を playback.ts 限定)＋実機検収。
**取りこぼし是正（2026-07-18・実機で発覚）**：`playbackComposite` が**直下の melody 子しか歌い手に拾わない**＝song(kind=song)は `song→section→melody` の2段ネストで歌い手ゼロにフォールバック→**曲再生で歌わない**。修正＝任意深さの歌う melody を再帰で拾い、`compositeNotes` を位置/移調解決に再利用して muted+sungBy を付ける（G3-song テスト追加）。

## #28 曲編集画面＝縦セットリスト＋ヘッダミニマップ（2026-07-18・オーナー「推奨A」GO）

**背景と是正**：曲編集（`kind=song`）は `FormStrip` で**横スクロールのカードストリップ**として出ていたが、正典 `docs/research/2026-07-16-song-form-assembly.md` §4.2 は「形＝**モバイルは縦**1列」と定めていた＝**実装が自分のスペックに違反**。本節はビュー層を縦セットリストへ作り替える＝発明でなく**仕様への復帰**。

**この画面の仕事**（§4.1 の芯＝song は timeline でなく「役割の順序リスト」）：曲の設計図を一目で読む／並べ替え・反復・分家で構成を決める／セクションに潜る／継ぎ目で聴く。ミニDAWでなく**足場**。横ストリップの破綻＝実スケール（suggest_form 標準J-pop＝12〜13セクション）で390px縦画面はカード2.5枚＝**8割が画面外**、なのに下半分は毎回空白＝横の飢餓と縦の浪費が同居。謎バッジ「+5」・24pxに潰れた継ぎ目試聴・2.5枚窓で読めないエナジースカイライン、も横の帰結。

**決定＝方向A「縦セットリスト」**（データ層は不変＝前置和射影/×N/vary/CoW/遷移窓再生はそのまま。`FormStrip` の units 描画を縦へ＋`verticalListSortingStrategy`＋CSS）：
- **各行＝全幅**：役割チップ（＋**役割を付ける**アクション＝現状は置いたカードに役割付与UIが無い・役割は色/生成/keyPlan の起点）／タイトル／尺＋**時間住所「8小節·1-8」**（前置和の副産物）／**実キー名「F +5」**（謎バッジ廃止）／共有・分家バッジは**言葉**で／レイヤ帯／⋯メニュー（分家/複製/削除/役割＝「同じものとして育てる／別物にする」の正典文言＋**取り消しトースト**）。
- **継ぎ目が一級**：行間の全幅境界に ♪つなぎ試聴＋精密挿入。
- **ヘッダに常時全体が見えるミニマップ**（幅∝尺・役割色・プレイヘッド）＝スカイラインを「読める唯一のスケール」へ移設。12セクションが1画面に収まる＝俯瞰が復活。
- **提案(提案▾)＝同じ色帯で表示し非破壊で適用**（現行 `applyFormCandidate` は既存配置を全消し＝作業中アレンジを破壊。既存セクションを役割スロットへマージする非破壊に）。

**畳み込む足場修正**（プレビュー掃除＋追加3点）：トランスポート下端固定（section/コード編集と同語彙）／song モードで死んでいる 鉛筆/消しゴム を隠す・いじる▾→書き出し（design L586: song の いじる は書き出しのみ）／key/tempo メタ重複解消（412px の 提案▾ 見切れも同時に解消）／段階・次の一手 を1行チップ化／追加導線は末尾1本／**分家・削除に取り消しトースト**（現行 `branchUnit`/削除は無確認・undo無し）。

**リスク/範囲**：データ契約リスク0のビュー改修。触点＝`FormStrip.tsx`（units/前置和射影の再利用・dnd を縦戦略へ・分家 undo・非破壊 apply）／`SongStatus.tsx`（チップ化）／`SectionEditor.tsx`（song モードのツール隠し＋トランスポート）／`transport-cards.css`（strip→list）。**却下＝方向B「地図＋虫眼鏡」**（毎操作が選んでから・役割未設定だと地図が空帯で読めない）。正典・出典＝`docs/research/2026-07-16-song-form-assembly.md` §4.1/4.2＋モック `song-editor-redesign.html`＋実機観察 `song-editor-observations.md`。

## #29 表現力/ヒューマナイズの統一（ドラム・コード・ベース）（2026-07-18・スコープ確定→設計・正典＝docs/research/2026-07-18-drum-expressiveness-scope.md §8）

**背景**：humanize エンジン（部位別プロファイル・1/f・知覚較正済＝music-core:127-271）は完成済みだが、再生が `FeelCtx.part` を渡さず**全部位 default で休眠**。生成が書く per-hit ベロシティ `velCurve` と 12格子 `beatsPerStep` を web 再生（rhythmToNotes）が**捨てて/無視して**おり、フィルのクレッシェンドが平坦・シャッフル型が誤再生。編集UIは on/off しか無い。→「新機能」でなく**作ってある表現の回収＋露出**を3フェーズで。

**決定（3フェーズ・全部 additive＝未指定 bit一致）**：
- **P1 ノリ行（全楽器共通・追加費用ほぼゼロ）**：`applyFeelByPart`（music-core 新設＝part グループ毎に applyFeel＋部位別 seed salt・hum=0 は単呼び=bit）を再生2点（audio.ts）と MIDI 2点（notesToMidi/tracksToMidi・**tempo も渡す＝再生と同一の ms 経路へ是正**）に配線。MixPart→HumanizePart 写像（chord→chords/counter→melody・drums はレーン midi で kick/snare/hihat）。UI＝TinkerSheet に**「共通」引き出しを新設**（ハブ契約の発動）：跳ねスライダー＋人間味 seg **OFF/弱0.15/中0.25/強0.35**（強でもヨレ警告帯 40ms 未満）。保存＝**section content.feel**（楽器非依存・sectionFeel は section 自身を子より優先・両0でキー削除）。ドラム/コード/ベースの較正済みプロファイルが同時に起きる。
- **P0 表現の回収（ドラムのみ・事実上バグ修正）**：`rhythmToNotes` が `velCurve[i] ?? drumVel` と `beatsPerStep`（1/3 は有理数スナップ）を読む。toggle の hits/velCurve **index 整列ガード**（純関数 laneWithHitToggled）。セル濃淡（--hv）＋長押し3値（普通/強く=base+18/弱く=28＝フィル辞書 V.ghost と同語彙・**既存 velCurve に書く＝新フィールド無し**）。16分のみ・velCurve 無しは bit 一致。
- **P2 表現編集ジェスチャ（長押しドラッグ＋モード・2026-07-18 チップUIから改定）**：チップ・ポップオーバーは廃止。**タップ＝置く/消す（鉛筆モード・現行トグルのまま）／打点を長押し450ms→セルが持ち上がり→押したまま 縦＝強さ（連続値＋磁石デテント ghost28/普通base/強base+18・通過時プレビュー音）・横＝連打（1→2→3・44px刻み・離散）・離して確定（onChange1回＝undo1粒）**。消去は `.proll-modes` の**✎鉛筆 / ⌫消しゴム**モード（消しゴム＝なぞり一掃＝通常はスクロールに食われる横スワイプの受け皿・**選択モードは動詞未実装で出さない**）。スクロール衝突は「静止450msが先→発火時 pointer capture＋non-passive touchmove で奪う（発火前の速いスワイプは従来スクロール）」で構造解決。**保存は不変**＝強弱は `velCurve:number[]`（連続値ライタ `laneWithHitVelNum`・デテント時は既存 `laneWithHitVel`）、分割は `RhythmLane.divs?: Record<step,2|3>`（rhythmToNotes で n 分割展開・2打目以降×0.85）。**旧 consumer（parseDrums/sectionDrums/MCP drumsSchema）はアンカー1打に退化**。コード楽器＝同ジェスチャの**縦のみ**（`ChordHit.vel?` 弱64/普通100/強112・分割は arp 軸へ委譲・タップ文法不変・普通デテント確定は vel キー削除＝bit）。CellPopover は撤去。実装スペック＝research §9（軸マップ/デテント/移行ノート）。
- **作らない**（確定）：per-hit タイミングナッジ／ベロシティ自動化レーン／32分全体格子／フラム／per-lane humanize。（**旧「連続値UI」条項は撤回**＝強弱の連続値は長押しドラッグ＋磁石デテントで採用・2026-07-18 改定。生成が書く連続クレッシェンドを3値UIが破壊する歪みの是正。）backlog：ストラム時間展開・トレモロチップ・stab 生成側 vel・seed 🎲・per-section feel。

**契約**：feel 無し or 全0＝再生/MIDI byte 一致。swing のみ＝現行一致（part 分割無関係）。humanize>0 のみ意図的変化（部位別起床・決定性は同 seed で担保）。velCurve/beatsPerStep/divs/vel 未指定＝各変換 bit 一致（`vel: undefined` キーも生やさない）。WP-D1 の「velCurve は旧 consumer 無視」条項は**「web 再生が正準として読む」へ昇格**。実装＝13スライス（P1×5→P0×4→P2×4・各 bit一致テスト先行・doc §8-4）。

## MCP ツール説明文＝利用者の言葉で・使いどきを冒頭に肯定形で（2026-07-19・正典＝research `2026-07-19-lyric-support-t8-role-override.md` C節）

**背景（実測の症状）**：実際の作詞相談セッションで、作詞実務ツール（suggest_lyric_rhythm・analyze_lyric_fit・set_lyric・sing_neta 等）が一度も呼ばれず、汎用の search ばかり使われた。原因＝**ツール選択は「ユーザーの問いとツール説明文の意味的な近さ」で決まる**（BiasBusters/Tool Preferences 系 preprint＋Anthropic prompting best practices）。専用ツールでも、説明文が利用者の語彙とズレ・専門語で始まると呼ばれず、広い説明の汎用手段（search）へ流れる。棚卸し＝作詞関係10本中8本の説明文に問題（scratchpad の lyric-tools-inventory）。

**原則（説明文の書き方・全 MCP ツール共通）**：
- **冒頭1文＝使いどき**（いつ呼ぶツールか）を**肯定形**で、**利用者が相談で実際に使う言葉**で書く（例＝「『この歌詞歌わせたら変じゃない？』のようなとき」）。「〜しないで」の禁止列挙より「〜する係だ」の肯定的定義が効く（LLM は否定が構造的に苦手・research B節）。
- **専門語・内部記号（A-01/DOWN×上昇/frame_decode/度数リテラル 等）は説明文の先頭に置かない**。必要なら後段 or パラメータ側の describe へ回す（技術情報は捨てず後ろへ残す）。
- **false-friend の是正**＝ツール名から利用者が誤って辿り着くツールには、冒頭で「これは扱わない」＋正しい行き先を案内する。
- 埋もれた強力機能は昇格＝タイトル/冒頭に出す（末尾パラメータに埋めない）。

**適用（作詞関係10本の description 改訂・2026-07-19 実施）**＝`apps/api/src/mcp.ts`。**説明文のみ変更＝ツール名・入出力スキーマ・挙動は不変**。とくに棚卸し最悪3件：
- **fit**：名前「合わせる」が「メロに歌詞を合わせたい」を誘うのに歌詞入力を受け付けない（行き止まりへの誘導路）。→ 冒頭で「歌詞は扱わない」を明示し、歌詞用途の行き先（gen_melody の lyrics／suggest_lyric_rhythm／analyze_lyric_fit）を案内。~~改名や歌詞対応そのものは別判断＝backlog へ（説明文で暫定回避）。~~
  - **→ 2026-07-21 オーナー裁定＝改名実施（②の道＝false-friend を名前ごと断つ）**：tool id `fit`→**`weave`**／title「合わせる（基準に噛ませる・候補）」→**「絡める（基準＝コード/メロに噛み合うパートを作る・候補）」**。実態＝コード/メロという基準に噛み合う別パート（メロ/ベース/ハモ/対旋律）を作る生成器で「合わせる（歌詞）」ではない。歌詞は依然扱わない（description の行き先案内は維持）。歌詞対応の統合（①）は今回は採らず。参照更新＝`mcp.ts`(登録名/title/エラー文/隣接説明)・`chat-session.ts`(CHAT_VERBS allowlist＋プロンプト散文)・`http.ts`(target プロンプト)・tests(`mcp.test`/`fit-shape.test`)・本design（下記 counter 配線）。※`analyze` の question=`"fit"`(当てはまり判定) と module `src/music/fit.ts` は別物＝据置。
- **gen_melody**：歌詞先行モード（lyrics 渡し＝モーラ数→音数厳密一致）が約30パラメータの末尾に埋没＝発見不能。→ 冒頭へ「歌詞を渡せば音数に合わせてメロを組める」を昇格。
- **analyze_lyric_fit**：「歌わせたら変じゃない？」という相談語彙と説明文の言語学用語（アクセント核/DOWN×上昇/A-01）が乖離。→ 冒頭を相談の言葉に、A-01 等の内部記号は落とす。
- 残る7本（create_neta/capture/read_neta/set_lyric/suggest_lyric_rhythm/sing_neta/search）も同原則で冒頭に使いどきの1文＋歌詞ネタの扱い（kind:"lyric"）を明示。

**やらないこと（この起票の範囲外＝乖離させない明示／※2026-07-19 時点）**：ツールの改名・入出力の変更・挙動変更はしない（description 文字列だけ）。fit の歌詞対応 or 改名の是非は backlog 送り。**→ 改名の是非は 2026-07-21 に決着＝上記 fit 項（`fit`→`weave` 改名を実施）。挙動・入出力は不変（名前と説明のみ）。**効果測定（実セッションで作詞ツールが呼ばれるか）は次回の作詞相談で観測。

## #30 和声リズム制御⑨＝第1スライス（後処理スプリット/マージ）（設計 2026-07-22・立場B採用・監査反映改訂・✅実装）

正典＝`docs/research/2026-07-21-melody-note-value-and-harmonic-rhythm.md` §2/§5.2 ＋ ⑨memo（本 design 上部「和声リズム⑨」節）。本節はその memo「第1スライス＝加速テンプレ」を一般化した**後処理実装のSDD**。2案審査（立場A=slot第一級化 / 立場B=後処理）を天秤にかけ **立場B を採用**。監査（GO-WITH-CHANGES）の 1 major＋5 minor を本節で確定して解消済み。

### 採否の根拠（上位から下ろす）
- **正典が段階を規定**：research「第1スライス＝加速テンプレ（invasive でない・既定OFF=bit一致）」／「第2スライス＝密度ノブ（invasive・後回し）…度数ウォークをコード枠(slot)単位に作り直す…同時に骨格/NCT の小節頭コード前提（`chordAt(bar*bpb)`）の解消が必須」。∴ slot 第一級化（立場A）は第2スライス。今回WPは第1スライス＝立場B。
- **bit一致の堅牢さ**：立場Bは return 直前 **1箇所**のガードのみ＝既定枝はコード経路（degrees ウォーク/citypop/transition）に一切介入しない。立場Aは walk 内の `bars` 参照を `N=slots.length` へ **8箇所**分散置換＝面が広い。
- **実測正準との一致**：§2＝半小節格子・dur 二値{2,4}・変わり目100%強拍・「頻度データ不在ゆえ確率でなく決定的テンプレ」。立場Aの確率ノブは決定的方針に反する。立場Bの preset enum（決定的）が正準的。
- **温存**：立場A（slot 第一級化）は破棄でなく**第2スライス着手時の実装ブリーフとして温存**。

### 本体＝新純関数 `applyHarmonicRhythm(chords, spec, ctx)`（`apps/api/src/music/harmonicRhythm.ts`・`citypop.ts` と同型）
`ctx={key, mode, bpb, bars, colorful}`（rng は v1 プリセットが決定的ゆえ**未使用**）。realize 済み実音 chords 列へ3原始操作（SPLIT/MERGE/KEEP）を適用。度数ヘルパ `deg(root)=((trunc(root)-key)%12+12)%12`。返り値 `{chords, warnings}`。全 start/dur は `round3`。
- **空 spec は identity**：`preset` も `pattern`（長さ>0）も無い spec は**入力 chords 配列を参照ごとそのまま返す**（KEEP・warnings 無し）。※ガード側でも実在チェックするため既定では applyHarmonicRhythm 自体を呼ばない（二重の安全）。
- **不変条件（dev バリデータ・警告のみ・bit安全）**：Σdur===bars*bpb・start 単調増・隙間/重複ゼロ・全 start/dur が 0.5*bpb か整数拍の倍数、を検査し破れたら warnings へ積む（chords は書き換えない＝git ce919ff/0869707 と同流儀）。

### プリセット（決定的・rng 不使用）
**`cadenceAccel`（終止加速・⑩のリズム版）**
- **① 発火**＝`deg(last.root)===0`（最終=トニック）**かつ** `deg(pen.root)===7 && pen.bass===undefined`（penult=素の V）。penult を半小節 SPLIT：`first`（dur=h）＝ colorful ? IIm7 : IV（実測 IV→V 9件／IIm→V 0件ゆえ colorful 限定）／`second`（dur=bpb-h）＝**元 penult 和音を root/quality/bass ごと継承**（V の色 V7/V13 を保全）。
- **② skip＋warn**＝`pen.bass!==undefined && deg(pen.bass)===7 && deg(pen.root)!==7`（penult=分数ドミナント＝citypop の IV/V〔citypop.ts:49-50〕）。分割せず warnings。∴ **citypop 併用時 cadenceAccel は常に skip＋warn＝沈黙 no-op を根絶し citypop voicing を保全**。
- **③ KEEP**＝上記以外（vii°/plagal/aeolian/loop の penult）。**transition 併用は① のゲート `deg(last.root)===0` が自動で弾く**（transition が最終を非トニック準備和音へ差替＝deg≠0）＝「終止しない終止加速」を構造的に排除（追加フラグ不要）。

**`drive`（畳み掛け・一律2/小節）**
- 適格小節＝index `0..bars-3`（**penult=bars-2 と last=bars-1 を保護**）。各適格小節を半小節 SPLIT：`first`＝元 bar i／`second`＝**元 chords[i+1] を継承**（先取り＝常に語彙内）。**元配列のスナップショットに対して先取り**。
- **collapse が勝つ**：SPLIT 後に隣接同一（root＋quality＋bass 一致）枠を1枠へ畳む。∴ 受け入れは「各小節が必ず2枠」でなく **collapse 後の Σdur===bars*bpb・境界が半小節/整数拍格子** で検査する。
- **根拠**：実測 cpb~2.0=53%（§2）は「半小節で実コードが変わる進行」の分布。drive は既存次コードの先取りゆえ**密度分布に寄せる**（和声内容は先取りで代用・53%語彙一致の断定は避ける）。

**`sustain`（伸ばし・2小節1和音）**
- **MERGE 対象＝index ペア (0,1),(2,3),…** を左から貪欲に走査し、**penult も last も含まないペアのみ** MERGE（判定＝`i+1 <= bars-3`）。**bars<=3 は適格ペア無し＝no-op（identity）**。
- **⚠️実測裏付けゼロ＝在DB 0/210**。理論⑤（遅い和声リズム=静的）のみの支持。既定OFF で同梱するが採否はオーナー耳が審判。

### 任意 `pattern:number[]`（拍配列・小節ごと循環・合計=bpb）
**優先順位＝`preset` が先勝ち**（`applyHarmonicRhythm`＝`preset` を先に分岐し `pattern` は `else if (hasPattern)`）。∴ `preset` と `pattern` を同時指定した場合は `preset` が適用され `pattern` は無視される（両者は排他的に使う）。
**v1 は半小節/整数拍のみ許可**（§2＝変わり目100%強拍・dur {2,4}拍二値）。**サブ拍境界（例[0.5,0.5,1]=8分）は下段 `chordAt(Math.floor(t))`（gen_bass rootAtBeat/drums）が誤サンプルするため整数拍/半小節へ丸め＋warnings**。分割枠 filler は「次コード先取り」。合計≠bpb は pattern を無視して identity＋warn。

### 既存後段との整合
`applyHarmonicRhythm` は **citypop・transition の後・return の直前**に置く。∴ borrow/secondaryDom/variety/palette・citypop・transition は現行の chords に対しそのまま実行。SPLIT はそれらの結果（citypop 分数化済み等）を入力に取る。**cadenceAccel と citypop 分数化の二重変形は、citypop が終止 penult を IV/V へ分数化する→cadenceAccel の skip＋warn 分岐（②）が発火して分割しない、という順序で構造的に解決**。

### bit一致の番人（既定枝が現行と1バイト差なし）
return 直前に：
```ts
const hrSpec = opts?.harmonicRhythm;
if (hrSpec && (hrSpec.preset || (Array.isArray(hrSpec.pattern) && hrSpec.pattern.length > 0))) {
  const hr = applyHarmonicRhythm(chords, hrSpec, { key, mode: minor ? "minor" : "major", bpb, bars, colorful });
  chords = hr.chords;
  if (hr.warnings.length) meta = { ...(meta ?? {}), warnings: [...(meta?.warnings ?? []), ...hr.warnings] };
}
```
`opts.harmonicRhythm` 未指定・`{}`・`{pattern:[]}` はいずれもこの if を通らない＝`chords`/`meta` は現行値そのまま＝`JSON.stringify` 完全一致。プリセットは rng 未使用＝ON 時も既存乱数列を1つも動かさない（副作用ゼロ・直交）。

### 下段整合の限界（既定OFFゆえ非ブロッカー・要注意メモ）
メロV2 は `chordPcsAt(t)` で small subdivision に追従するが、**骨格/pcsOfBar と `chordAt(bar*bpb)` は小節頭サンプル**＝分割後半枠を骨格アンカー選択が取りこぼす。split 済み進行へメロ/骨格を**再生成**する時は ⑨memo の **flow 型和声ガード**（変わり目直前で長音を切る/またぎ禁止）が要る＝**別WPで結線**。コードとメロは別コールゆえ既定OFF下では bit一致に無影響。**3/4 の半小節 h=1.5** は整数拍サンプラで beat2 まで second を拾わない（メロ chordPcsAt〔float〕は追従）＝v1 は分割を許すが warnings で明示。

### 配線
`gen_chords`（MCP／HTTP）に `harmonicRhythm:{ preset?, pattern? }` を追加（既定 undefined＝bit一致）。description に和声リズム（畳み掛け/終止加速/伸ばし）を追記。

### 受け入れ（機械・`apps/api/test/harmonic-rhythm.test.ts`）
1. **既定bit一致**：`harmonicRhythm` 未指定／`{}`／`{harmonicRhythm:undefined}`／`{pattern:[]}` ＝現行 genChords と JSON 完全一致（seed×mood×bars×meter）・meta 不変。
2. **cadenceAccel①**：最終=I かつ penult=素の V で first=IV（colorful=IIm7）・second.start===penultStart+bpb/2・second が deg7 を保持／penult≠V は不分割。
3. **cadenceAccel②（citypop 併用）**：genre='citypop'+cadenceAccel で penult は IV/V 分数のまま（不分割）・warnings に skip 併記・素の三和音注入なし。
4. **cadenceAccel③（transition 併用）**：transition 指定（最終=非トニック）で cadenceAccel 不発火・transition 単独出力と一致。
5. **drive**：適格=0..bars-3 が SPLIT・penult/last 保護・**collapse 後**の Σdur===bars*bpb・境界が半小節/整数拍。
6. **sustain**：ペア (0,1),(2,3)… の penult/last 非含みのみ MERGE で dur===2*bpb・bars<=3 は no-op・Σdur 保存。
7. **不変条件**：全プリセット/pattern/seed で Σdur===bars*bpb・start 単調増・隙間/重複ゼロ・start/dur が 0.5*bpb or 整数拍の倍数（サブ拍 pattern は丸め＋warnings）。
