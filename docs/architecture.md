# creative_manager アーキテクチャ・HOWメモ（v0.1）

最終更新: 2026-06-24

要件は `docs/requirements.md`。ここは HOW（どう作るか）の決定ログ。決まったことだけ書き、未決は「未決・要調査」に置く。

## 全体構成（#1・暫定確定）
- 常時起動の箱 K8-Plus = サーバー：データ（DB＋ファイル）、非同期ワーカー（投げて→進めて→受け取る）、情報収集の常駐、API。
- クライアント = ブラウザ／PWA：スマホ（出先）・PC（家）から同じサーバーを見る。
- 到達（決定 2026-06-21・`docs/deploy.md`）：**Tailscale tailnet 限定**。WSL2(mirrored)で Tailscale IF(100.x)が見えるので api を **その IP にバインド**(`CM_HOST`)＝LAN/ネットに出さず自分の端末だけ到達。アプリ側パスワード無し(ネット層が境界)。LAN直は `CM_HOST=0.0.0.0`。
- 端のローカル橋渡し：ABILITY 登録など、Web の外の薄い助っ人（家／EVO-X2 側）。

## AIの実行先（#1・方針確定／2026-06-24 是正＝MCP＋Claudeクライアント）
- **会話・司令塔**（何を・どんな雰囲気で・どのツールを呼ぶか） → **Claude クライアントそのもの**（Claude Code CLI を `claude -p --resume --output-format stream-json` で・Max認証）。**プロンプト組み立て・判別ルーティング・エージェントループは自作しない**＝Claude が記憶・多ターン・ツール選択をネイティブに担う。
- **作曲ドメイン能力** → **creative-manager MCP（TS・api 内 `apps/api/src/mcp.ts`）**：ネタ/合成の読取・**ルールエンジンによる生成(gen_*)**・当てはまり判定(analyze_fit)・書込(候補返し＋明示commit＝承認が効く)。どの MCP クライアントからでも叩ける宣言的な面。**音楽的妥当性の真実源はここ**（requirements #92/#151＝AIは引く/選ぶ/直す、根拠なきものは作らない）。
- **会話の場** → web アプリ内の**薄いチャットラッパー**：Claude セッションを中継し `tool_use`/`tool_result` を既存の視覚部品（ピアノロール/再生/選択カード）として描くビュー層（脳なし）。
- mp3 解析・埋め込み（意味検索） → **K8-Plus（ローカル、軽い）**／DAW(ABILITY) → **EVO-X2（家側。必要なら補助で手元 LLM）**。
- **是正の経緯**：旧実装は worker(Python) が `claude -p` を**ステートレス単発JSON API**として使い、intentごとに手組みプロンプト→判別ユニオンを返す**ルーター**だった（＝worker が脳をホスト＝「LLM差し替え可能」設計だが Claude の会話力を捨て「会話が返らない」）。→ **脳は作らず Claude クライアントに任せ、ドメインは MCP に集約**へ転換。worker は AI プロンプトを持たない（決定: design #100）。
- 前提：未発表物を他人から見える所に置かない。Claude 等の外部利用は可（tailnet 境界）。

## データの持ち方（#2・確定＝実装済）
- すべては「ネタ」。ネタは入れ子にできる（くっつけて新しいネタになる）。
- 最小単位のネタ：メロディ／コード／リズム／歌詞／その他。
- 組み合わせると大きいネタになる：コード（複数）→ コード進行、メロ＋コード＋リズム → 断片、…→ 曲。
- 「曲」もネタの延長（いちばん大きい組み合わせ）。ただし曲は箱として独立して持つ（段階・次の一手などプロジェクト情報を載せるため）。
- **プロジェクト＝曲(箱)の上位の器**（作業中の一曲 or 組曲）。1プロジェクトに曲は 1..N（組曲）。プロジェクトは曲ツリーに加えて、取り込んだファイル(asset)と AI会話セッション(chat thread)も束ねる＝「一箇所に集まって辿れる」器（requirements「一曲（または組曲）の器にまとめる」）。実体は `prj:` 名前空間タグ（design「複数プロジェクト」）。階層＝Project ⊃ Song(1..N) ⊃ section ⊃ leaf。
- 資産ファイル（歌詞テキスト／MIDI／mp3／画像）は「ソース」。可能なら分解して、メロ／コード進行／リズム等のネタを取り出し、元ソースに紐づける。
  - 注：MIDI/ABILITY は分解しやすい（既に記号）。mp3 はキー/BPM/雰囲気（＋できればコード推定）どまりで、メロの完全復元は狙わない（要件メモの方針と整合）。

## 技術選定（#3・確定）
- メインのバックエンド＋フロント：**TypeScript**。フロントは **React（PWA）**。
- 推論・解析・MIDIワーカー：**Python**（ジョブキュー越しに隔離。日常触る面はTS、Pythonは滅多に触らない安定サービスに追いやる）。
- API/Webサーバー：TS（Node。フレームワークは Fastify 等、細部はあとで）。
- DB：**SQLite（＋sqlite-vec）**。1ファイルで永続＝バックアップ簡単。WALで TS API と Python ワーカーから利用（またはワーカーはAPI経由）。規模（数千〜数万件）的にベクトル検索はブルートフォースで十分。検索精度は埋め込みの作り方が本丸（#6）。
- 非同期ジョブ：SQLite上のジョブ表＋Pythonワーカー＋スケジューラ（Redis等の追加インフラ無し）。
- 音：**Tone.js**（中核：テンポ/小節/スケジューリング/シンセ）＋ smplr/SoundFont（音色）＋ **@tonejs/midi**（MIDI入出力＝ABILITY書き出しも担う）。
- 楽譜表示：**VexFlow / OpenSheetMusicDisplay**（"できれば"が現実的。楽譜"入力"は別途重い）。
- 配置（実態 2026-06-23・アーキ是正S2/S4後）：K8-Plus の **WSL2(mirrored) 上で tsx/uv 起動**（Docker 不使用）。**3プロセス**：api(:8787 単一オリジン＝web も配信／**音楽ドメインTS＝`/music`**／**creative-manager MCP の宿主**／**会話＝`claude -p` セッションを中継する薄いラッパー endpoint→web に SSE**)／worker(ヘッドレス＝**決定的バッチ専任**:MIDI分割(mido)・埋め込み。**agentic consult/plan＝撤去済(#100⑤・2026-06-25)**＝会話の脳は api 常駐 claude のみ。残る claude_prompt は research/gen の短い1発専用)／cm-search(:8788 意味検索)。**cm-music-mcp(:8790) は廃止**（S2で音楽ドメインをTSへ一本化＝5→4→実質3）。外は Tailscale serve/IP で tailnet 限定。**自動起動＝systemd ユニットは定義済だが未インストール**（`deploy/systemd/` に cm-api/worker/search＋backup.timer のユニットあり・`--user` enable は未実施＝母艦再起動で手起動が要る・backlog「systemd 自動起動」）。**起動は手動**（`pnpm --filter ./apps/api start` 等）が現状。

## 解決済み（旧「未決・要調査」）
- **ノート生成エンジン**（#12）→ **決定＋是正済(S2)**：Claude非依存の記号エンジン＝当てはまり保証つきの汎用生成＋判定。**実装は TypeScript `apps/api/src/music/`（生成・理論・analyze_fit・連想・名前付き進行）に一本化**（旧 Python/music21 の `cm-music` は廃止・music21 依存も除去）。**2026-06-24 是正（#100）**：この生成/判定面は **creative-manager MCP のツール**として公開し、**会話する Claude クライアントが直接叩く**（worker の手組みプロンプト＋判別ユニオンルーターは退役）。特定/名前/旋法/様式は Claude 知識へ（routing A は MCP の `gen_named_progression` 等で吸収）。詳細は design.md #12/#86/#100。
- 言語・FW・DB・検索基盤（#3）→ 上記「技術選定」で確定。
- 歌詞のモーラ分析（#13）→ 実装済み（worker `split_mora`）。
