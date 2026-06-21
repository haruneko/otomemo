# creative_manager 設計（SDD）v0.1

最終更新: 2026-06-20

要件: `docs/requirements.md` ／ アーキテクチャ: `docs/architecture.md`。
ここは統合設計。実装（#4〜11）はこれに沿って進める。

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
- `song`(neta_id[kind=song], stage[段階], next_action[次の一手], updated) — 曲の箱(overlay)。`neta` と 1:1。
- `asset`(id, kind[mp3/midi/ability/lyric_text/image/render], path, meta[JSON: key/bpm/mood等], created) — ソース/添付ファイル。
- `neta_asset`(neta_id, asset_id, role[source=分解元 / attachment=添付 / render=音源レンダ])
- `job`(id, target_neta_id, instruction, type[壁打ち/部分生成/作例/研究/収集/発展], status[queued/running/done/needs_decision/failed], progress, notify_level, created, updated) — 投げた仕事。対象は常に `neta_id`。
- `job_result`(job_id, neta_id, order) — ジョブの生成物（複数可）。生成物も neta。受理時に対象へ compose/relation で繋ぐ。

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
- **音色**：musical neta は楽器を持つ＝**General MIDI プログラム番号**（メロ/コード/ドラム。ドラムはGM打楽器/ch10）。再生はGM SoundFont、書き出しは MIDI のプログラムチェンジへ（再生と書き出しが一致）。UIの選択パレットは少数キュレートでよい（保存はGM準拠）。
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

### 再生
- section/song：メインペーンに**トランスポート（全体再生）パネル**。
- ネタ帳：カードを**タップで個別再生**（断片を単独 audition、調ヒントで鳴らす）。
- 音源：GM SoundFont（Tone.js＋smplr 等）。

### エディタ・メインペーン（GUI #19）
- メインペーンは**選択中の neta の種類で中身が入れ替わる**：
  - section/song → 配置（**メロ/コード/リズムの3レーン**を時間軸で埋める multitrack 風）＋トランスポート
  - melody → ピアノロール
  - chord / chord_progression → コード入力
  - rhythm → ステップグリッド
- 子netaにドリルインでペーン切替、戻ると section の配置へ（入れ子編集）。
- **編集面の出し方（決定を更新）**：旧版は「音楽編集＝全画面オーバーレイ単独」だったが、それだと一覧(ネタ帳)がホームで編集が上に乗る＝主役が逆転し、L119/135「section/song＝メインペーン」と矛盾していた。→ 一覧から飛び出すオーバーレイではなく、**作業面（メインペーン）に入っていく**ワークスペース型に統一（コンセプト「自分の続きを操る／引き出しと発展が地続き」）。「いま作業中の対象」をアプリ状態に持つ（一時オーバーレイではない）。router は当面不要・ビュー状態で実現。下記の画面構成に従う。

### 画面構成（レスポンシブ・ワークスペース）（GUI #19・決定）
家/出先で分けず、**画面幅で形が変わる**1レイアウト。「いじる(断片)」と「組み立て(section)」は同格（両輪）。
- **メインペーン（中央・主役）**：いま作業中の対象。section/song＝**3レーン(メロ/コード/リズム)配置＋トランスポート**、断片＝該当エディタ（melody=ピアノロール等）。選択で中身切替、ドリルインで子へ、戻ると配置へ。
- **3レーンと compose_edge の整合（#14準拠・スキーマ変更なし）**：`compose_edge` は `position＋ord` のままの**任意子DAG**で、lane列は持たない。レーンは**子の kind から導出**（melody→メロ／chord・chord_progression→コード／rhythm→リズム）。導出の原則は現 `SectionEditor.composite()` の kind 分岐と同じ（3レーン描画自体は段階②で実装）。theme/knowledge/other 等の leaf はどのレーンも埋めない（配置対象外）。3レーンに収まらない子：**lyric** は独立レーンを作らず melody に `syllable` で流し込む（#16）／**ネストした section/song** はレーン展開せず**1ブロックとして配置**し、ドリルインで内側の3レーンを開く（入れ子編集）。＝「3レーンを埋める」は leaf(メロ/コード/リズム)の**見せ方**で、任意子DAGを壊さない。
- **ネタ帳（開閉式の左レール）**：捕獲＋一覧＋検索＝素材。畳める。
- **Chat（右下の吹き出し→ダイアログ, Notion風）**：相談/投げる。常駐ペーンでなくバブル起動で軽量に。※体験(ペーン/ダイアログ/オーバーレイ)は要再相談。
- ペーン位置の可動は欲を言えば（後）。
- **幅で形が変わる**：広い＝メインペーン＋畳めるネタ帳レール（＋Chatバブル）／狭い(スマホ)＝メインペーン全画面・ネタ帳はタブ/シート・Chatバブル。
- **操作モデル**：開く＝**タップ**（→メインペーンにそのエディタ）／組み立て＝**ドラッグ&ドロップ**（ネタ帳→section のメロ/コード/リズム該当レーン）／狭い画面はD&D不可なので**レーン/位置をタップ→読み込むネタを選ぶ**で代替。
- **段階実装**：①メインペーン実領域化＋レスポンシブ折りたたみ → ②組み立て(D&D＋タップ選択)＋3レーン → ③Chatバブル・再生プレイヘッド等。各段階でテストを増やす。

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

#### 決定：MIDI取り込みの worker 分割(#81) — 過去資産を素材化（design#16 通り）
- **問題**：従来は web `midiToNotes` で **melody 1本**に潰していた（design#16 の worker(mido)分割と乖離）。
- **フロー**：web が MIDI を **base64 で `import_midi` ジョブに載せる**（asset経路もhandler-DB結合も不要・handlerは純粋 params→result を維持）→ worker `handle_import_midi`(mido) が **トラック×チャンネルで分割**（ch10[0-index 9]=ドラム→rhythm、他=melody・原音高そのまま＝二重トランスポーズ回避#41）→ `reapResults` が **import_midi の result.tracks を複数ネタに materialize**（web は自分でネタ化しない＝stale ガード無しで即回収、空は空マーカーで再reap防止）。
- **MVP/後続**：**コード進行の自動検出は本質的に難しいので後回し**（chord ネタは作らない）。velocity/テンポ/拍子の精緻化、neta_asset(#83)での元MIDI紐付けも後続。worker に **mido** を追加。
### Chat（AI相談）パネル（GUI #19）
- 画面右に常駐するChat。Claudeとの相談＋依頼の窓口＝**Claudeプランナーの会話フロント**。
- **"相談"と"投げる"は同じClaudeの2モード**：軽いターン＝即応の相談・壁打ち／重いターン＝plan-jobを生成（非同期、結果はChatと対象netaの受け取りに返る）。

#### 決定：Chatモード統合（#61・GUI #19 改訂）
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
- usePlayhead は `--ph`(0..1比率, fit-to-width用) に加え **`--phb`(生beat, clampあり)** も ref直書き。グリッド系は **コンテンツ座標 `left: calc(gutter + var(--phb)*pxPerBeat)`** で横スクロール追従（1拍=セル幅×4）。PianoRoll(gutter40/48px)・StepPad(gutter0/88px)・RhythmEditor(gutter58/88px)。SectionEditorは fit-to-width の `--ph` 維持。
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
- **Stage4（任意・データ次第）**：作風寄せ＝少データでは**State Tuning（本体凍結・状態ベクトルのみ最適化）が LoRA 超え**（研究）。LoRA/フル fine-tune は過学習で保留。
- **8060S/ローカルLLMは不採用**：Claude Max前提＋**from-scratch学習はデータ律速（ハードでは解けない）**。音声生成系（Magenta RT等）は modality 違いで除外。
- **スキーマが契約**で各エンジンが裏に差さる（不変）。

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
