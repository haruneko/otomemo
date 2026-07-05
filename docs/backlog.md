# creative_manager — 積みタスク（やりそびれ・あとで）

スペック層（requirements/architecture/design）にも Task 機能にも載せきれない「いつかやる／保留」をここに貯める。
着手したら Task 化して、ここからは消すか「→ #NN」と印を付ける。最終更新を都度書く。

最終更新: 2026-07-05

## 締めパス(2026-07-05)で見送った改善（監査で挙がったが低優先/中リスク）
デザイン監査(サブエージェント)＋リファクタ監査で挙がったうち、明確・低リスクなもの(MIDI名ASCII/ピッカー色/PC間延び/死にコード/kindColor SSOT)は実施済。以下は見送り：
- **[デザインL] エディタ内ヘッダの一貫性**：編集画面はローカルな `← 戻る [title][✓][🗑]` バーで、Otomemo ロゴ/パンくずが消える（モバイル一画面ずつの設計上そうなっている）。パンくずを正準にするなら編集画面も `Otomemo › 器 › ネタ` にする案。ただしモバイル土台(mv-pane)と衝突しうる＝要設計。着手前に「なぜ今」を問う。
- **[デザインL] エディタのツール列/設定行の統一**：ピアノロールは 描く/選ぶ/消す ＋長さ行、section は 描く/消す ＋小節ステッパで、同role コントロールの見た目/位置が微妙に違う。いじる▾ を右寄せ固定、設定行のフィールド順を統一、等。別エディタなので本質的差はあるが揃える余地。
- **[リファクタ中] childDur/contentDur/durOf の共通化**：SectionEditor と MiniRoll に同旨の「子の実長」計算が重複。`music.ts` に純関数として抽出して共有（再帰＋bpbフォールバックを厳密に保つ）。
- **[リファクタ中] kindColor SSOT の全面適用**：色ヘルパ `kinds.kindColor` は新設・ピッカーで使用開始。作成タイル/filter-kinds/LANE_COLOR/MINI_LANES もこれ由来に寄せると kind→色の重複(5箇所)が1本化。filter-kinds は `FILTER_KINDS`+除外リスト由来にも。
- **[リファクタ大] SectionEditor(~900行)の分割**：place-picker ダイアログ(state+handlers)を `PlacePicker` に、生成/ハモリ道具を別ユニットに抽出（SongStatus は既に分離済＝前例あり）。挙動不変の機械的分割だが props が多い＝要注意。

## 配置後に中身の尺が変わった時の「はみ出し重複」検出（保留・コスト高＝やらない）
配置/ループの重複は**配置時**に尺(スパン)判定でガード済（`spanOverlaps`・2026-07-05）。ただし
**配置した後にそのネタの中身を長く編集**すると、既存の配置は再スペースされないので後続と重なりうる
（例：1小節リズムをループ配置→後からドラムを2小節ぶんに打ち直す）。オーナー判断＝**仕方ない・やらなくてよい**
（尺変化の検出＋警告 or 自動間隔調整は、編集⇄配置の双方向依存を張る必要があり**コストが高い**）。
- **着手ルール（重要）**：やりたくなったら**まず「なぜ今それが要るか」を問う**こと。実害の頻度が低い
  （マルチ小節ネタをループ後に伸ばす、という稀な操作でしか起きない）ので、明確な理由（実使用で頻発した等）
  が無ければ着手しない。安請け合いで双方向依存を入れない。

## ~~ネタ一覧の手動並べ替え~~ → ✅実装済（design LV-A・2026-07-02）
被せ表 neta_order＋dnd-kit sortable(touch長押し)で実装。以下は当初の検討メモ（残す）。
LV1/LV2（表示密度・基準ソート）は実装済。**手で自由に上下入れ替え**は未実装（ユーザー「多分必要」）。
- **後付けは痛くない**（＝今やらなくてよい根拠）：①並び順データは**純加算**で足せる＝被せ表
  `neta_order(project, neta_id, position)` を1枚（既存 `song` overlay/`chat_thread` と同じパターン・
  既存 neta 行のマイグレ不要）。②初期順の**種は既にある**＝現状 `ORDER BY updated DESC`。後付け時に
  timestamp順で backfill すれば今の並びをそのまま初期手動順に写せる＝何も失わない。
- **実装筋（縦スライス）**：被せ表＋`reorder` API（position 更新）＋`listNeta` の ORDER BY を
  `COALESCE(neta_order.position, updated順)` に＋web は **dnd-kit の useSortable＋touchセンサー**
  （長押しで掴む・タップ再生/カード開くとの誤爆回避＝activation constraint）。
- **設計判断1つ**：順序をグローバル1本 or プロジェクト別か（ネタは複数 prj: を持てる→忠実は被せ表＝上記）。
  どちらも加算で後付け可。

## プロジェクト＝器（ワークスペース）の不足機能（2026-06-29・コード面＋E2E[SP/PC]で洗い出し）
S0-S4実装済。S5で操作面の一部を是正（下記✅）。残りは未充足。優先度[H/M/L]。
- ✅**会話の改名・削除**：ProjectScreen 会話カードに ✎改名(setChatThread.title)/🗑削除(新 deleteChatThread=履歴+所属行)。実機verify済。
- ✅**ファイルのDL修正・削除**：DLを `api.assetUrl()` に（dev破綻解消）＋🗑削除(deleteAsset・confirm)。実機verify済。
- ✅**ワークスペースから曲を新規作成**：ProjectScreen に「＋曲を組む」（現状は section を作る＝既存newSong流用。kind=song化は Task#5 待ち）。
- ✅**空プロジェクト到達**：picker を facets.projects → 新 `GET /projects`(prj:タグ ∪ project行) に変更。説明だけの器も選べる。
- ✅**会話を器へ取り込む（未仕分けの取り込み）**：ProjectScreen 会話に「＋取り込む」＝未仕分け(project=null)の会話一覧→選んで `setChatThread(project)`。実機verify済。
- ✅**ジョブ/継続研究の可視化**：`GET /projects/:p/jobs`(prj配下ネタ対象ジョブ)＝ProjectScreen「進行中・受け取り」ブロック(状態ラベル＋実況)。実機verify済。
- ✅**指示の実感表示**：Chat に「📌『器』の指示が効いています」バナー（free chat＋activeProject＋instructions時）。App が getProject で引いて渡す。実機verify済。
- **[M] ファイルの追加・プレビュー**：器画面からのアップロード→prj配下ネタ紐付け／テキスト・音のプレビューは未（**紐付け先ネタの選択が曖昧＝要設計**：器に複数曲がある時どの曲に付けるか）。
- ✅**モバイルのワークスペース土台 刷新**（2026-06-29・design「狭い＝mainpane全画面」を一級化）：状態ごとの `:has()` ハック（空→隠す/編集→fixed overlay）を撤去し、**一度に1つの全画面ビュー**モデルへ。App が `.workspace` に `mv-home`(ネタ帳主役)/`mv-pane`(mainpane=編集 or プロジェクト主役)を付与し、表示しない側を `display:none`（両方マウントのまま＝状態保持）。mainpane はモバイルで通常フロー全幅（sticky/overflow:hidden解除）。**効果**：①レール積み重ね解消(☰=ホームへ・自動畳み応急処置を撤去)②app-head が常駐＝**編集の「戻る」が☰を覆う問題が解消**③mv-pane でバブル非表示＝**最下段の被り解消**④横はみ出し無し。`useIsMobile`(matchMedia 820)・jsdomガード。E2E(Playwright)で home/project/editor 切替・戻る・PC2ペーン回帰を確認。**残（任意・小）**：ネタ帳を真のドロワー/シート化（今はビュー切替）・editor下部の余白詰め。
- **[L] プロジェクトの改名・削除**：無し。改名は prj:タグ(全ネタ)＋`chat_thread.project`＋`project`行＋localStorage 横断更新＝重い（要設計）。
- **[L] 既定会話の整合**：💬バブルを器内で開くと `cm-chat-session`(global=未仕分け)に着地し器の一覧に出ないことがある（指示バナーは出る）。新規 or 器の最新へ寄せると自然。
- **[L] 指示の即時反映**：instructions は次 spawn（idle reap=15分後 or プロセス死）から反映。走行中プロセスへの即時反映は未。


## メロ生成 brush-up（理論裏打ち済・耳確認が要るので滞留＝出先で音が聴けない間は保留）
根拠＝`docs/research/skeleton-model-crossmap.md`（我々×音楽理論 cross-map）。各々 melodyCells の層に対応。**着手は音を聴ける時に**（微細な質改善は耳検証が要る）。対処済＝骨格v2(Urlinie下降+単一頂点)・禁則跳躍除外。残：
- **① interruption の明示2分割**：句を「前半=2̂で半終止(open)→後半=1̂で完全終止(close)」に構造化。我々の open/close を端点でなく**句の二分構造**へ格上げ。終止も 1̂直行でなく **2̂(V)→1̂(I)**。[Schenker Unterbrechung]
- **② 装飾を型に当てる（最重要・「取らない音」の本質直し）**：弱位置音を generic マルコフでなく **passing（構造音間を一方向通過）/ complete・incomplete neighbor（刺繍・滑り込み）/ suspension / cambiata** の**型**で生成。[Schenker prolongation / Fux 2-5種]
- **③ 強拍 suspension の許容**：snap が強拍を一律コードトーンへ矯正＝掛留(強拍非和声→下行step解決)を潰してる。稀に許容＝「もたれ/滑り込み」表情。[Fux 4種]
- **④ Narmour 閾値の明示**：contour マルコフに **P4以下→継続(Process)/P5以上→反転(Reversal)/三全音=境界** を明示バイアス。[Narmour I-R]
- **⑤ head 選定＋反復時の構造音整列**：構造音を「強拍×協和×主音近接」で選び、反復句では**構造音も並行(parallelism)**に。[GTTM TSRPR1,2,4]
- **⑥ 変奏を句機能で位置駆動**：consequent=模続(sequence)/句末=拡大・断片化。旧 planSkeleton 資産と接続（新モチーフ経路で一旦失った）。
- **⑦ リズム16分細分（layer3）**：8分の稀(6%)な細分。BPM非依存の装飾として。

## メロ V2(A2レシピ)の利用時パラメータ（フィーチャー）
genMotifMelodyV2 は production 本線（`gen_melody` useV2）。利用時コントロール済＝repetition/rangeSteps/**motifBars(1-4)**。残フィーチャー：
- **フレーズ対称/非対称の選択**：今は厳密 2+2+2+2(対称)＝機械的。**対称⇔非対称を利用時に選べる**ように（非対称＝アウフタクト/句の伸縮/問い4+答え4の起承転結/句末拡大）。motifBars と同様にパラメータ化。ユーザー『対称も非対称も選べないとダメ』＝必須フィーチャー。
- **メロ補完(`complete_melody`)の6/8発展の作り込み**：現状 best-effort（4/4が主・compound発展の運びが粗い可能性＝みなそこ4倍補完で確認）。6/8の発展部(A'/B/A'')の図形/接続を6/8ネイティブに。補完自体は実装済＝品質の詰めのみ。
- **メロ補完の局所infill/変奏の拡張**：`seedMotif`/`keepFirstBlocks` の機構で「弱い1小節だけ差し替え」「変奏候補」も足せる（同じ「部分→V2発展」の枠）。優先度＝「より良い選択肢」方向([[project-design-philosophy-options-not-finished]])。

## 和声/終止 brush-up（理論裏打ち済＝`docs/research/harmony-cadence-theory.md`・盲点top10）
メロ側と別に**和声・終止・声部進行**が手薄。効き順（①〜④=正しく聞こえる土台／⑤〜⑧=らしさ・切なさ）：
- **① 終止タイプ選択器**：句末ごとに PAC/IAC/HC/plagal/deceptive を「和音×上声着地度数×強さ」で選ぶ（今は close=1度/open=5度の1種のみ）。
- **② 偽終止(deceptive V→vi)**：1番サビ末=偽終止／ラスト=V→I回収 のテンプレ。
- **③ メロ×低音の声部進行 減点関数**：外声2声で 並行/隠伏 P5・P8／導音解決／第7音下行 をチェック（今は完全に未監視）。
- **④ avoid-note 回避**：強拍/ロングトーンが回避音(コードトーン半音上)なら passing 扱い or 和音差替。
- **⑤ 二次ドミナント(V/x)**：任意コード前に完全5度上 dom7 を挿入する決定的関数。
- **⑥ サブドミナントマイナー(iv＝♭6→5)**：IV→iv→I。J-POPの切なさ。借用/モーダルミクスチャー一般。
- **⑦ 強拍 suspension/appoggiatura 許容**（melody brush-up ③と同件）。
- **⑧ 非和声音を型に**（PT/NT/APP/SUS/ET/ANT/Pedal を拍で出し分け・melody brush-up ②と同件）。
- **⑨ 和声リズム制御**：コード交替速度を独立軸化＋コード変化拍に構造音同期。
- **⑩ T–PD–D–T 方向バイアス＋終止前定型**（ii–V–I / IV–V–I / I⁶⁴–V）を句末テンプレ化。
J-POP特効＝サブドミナントマイナー(♭6→5)・偽終止の構成的使い分け・ラインクリシェ(半音下行)・王道のV→iii。

## 簡易作曲ツールの不足（2026-07-01・実コードで棚卸し＝フィーチャー群・着手時Task化）
「一曲を書き上げる」動線の穴。影響順。※undo/redo と 跳ね/swing は下の既載と重複＝ここに集約。
### A. 編集の手触り（最優先・毎回引っかかる）
- ✅**エディタの Undo/Redo**（2026-07-01 実装・design 決定U1-U3）：`history.ts`(純ロジック+`useEditHistory`)＋NetaDialog に content 一式 snapshot 履歴＝melody/chord/bass/rhythm/chord_pattern 全部に一発。UI＝**TransportBar 左に ↩/↪**(文字矢印・空でdisable)。TDD6＋Playwright実機OK。**残＝section/song コンテナ対応・「取り消しました」トースト・テキスト系(title/text)は input native に委譲**。※backlog「ネタの版管理(chat書込のサーバ側undo)」とは別レイヤ・両立。
- ✅**ノート編集の拡充**（2026-07-02 実装・design N1-N3・案A）：ロールに[描く]/[選ぶ]トグル＋タップ選択(複数)＋選択バー(複製/コピー/貼付/削除/←→↑↓nudge移動)。`noteEdit.ts`純ロジックTDD6・Undo自動連動・選択=黄枠。web227緑・Playwright実機OK。**残＝範囲マーキー・ドラッグ移動(v2)**。
- **ベロシティ/強弱編集**（今は一律100・「後回し」コメント）：ロールで音符別 vel/音量カーブ。**humanize の土台**。
### B. 一曲に仕上げる
- **曲フォーム組み立て**（section/song箱はあるが薄い）：section を A-B-A/サビ繰り返しで並べ1曲化するタイムライン・リピート・セクション再利用。
- **簡易ミックス**（無し）：パート毎の 音量/ミュート/ソロ（バランス＋「今これだけ聴く」＝書きながら集中）。
### C. 外に出す
- **音声(WAV/mp3)書き出し**（無し・MIDIのみ）：`OfflineAudioContext`/`MediaRecorder` で合成をバウンス＝デモ共有/保存。**仮歌レンダとも土台共有**。
- **MusicXML 書き出し**（入力のみ）：リードシート/外部エディタ受け渡し（**仮歌の橋＝VOICEVOX公式Song/OpenUTAU と同じ**）。
### D. メロの書きやすさ（ユーザーの苦手×最優先に効く）
- **スケール/コードトーン ハイライト**（無し）：ロール上で「調内/コード内」を可視化＝外し音を避ける。
- **メトロノーム/カウントイン**（無し）。跳ね/スイング（下記「跳ねるボタン」）。
- **アルペジエーター（新規・2026-07-04）**：メロのパッド入力(StepPad)を撤去した際に出た案。パッド的な"素早く音形を作る"用途は、格子タップでなく**アルペジエーターとして別実装すべき**（コード/スケールを与えて up/down/updown・レート・オクターブ幅で音形生成＝候補プレビュー→ネタ化）。コード楽器(chord_pattern)の arp とも近い＝設計を寄せられるか要検討。着手時 Task 化。

## 機能（中〜大）
- **仮歌入れ込み（歌声合成・別口／2026-07-01 研究クローズ）**：流し込んだ歌詞(`Note.syllable`)でメロを"仮歌"として鳴らす。調査＝`docs/research/2026-07-01-singing-voice-synthesis.md`（**VOICEVOX歌唱をローカルCPUで実測＝リアルタイムより速い0.38x・音質OK・footprint≈2GB常駐1・sudo不要**）。最小実装案＝**①ラフ歌唱プレビュー**（VOICEVOX HTTP `sing_frame_audio_query→frame_synthesis`・Score={notes:[{key:MIDI,frame_length,lyric:かな}]}・93.75fps・先頭休符必須／**編集毎の自動再生成はしない＝「🎤歌わせる」明示レンダ＋content-hashキャッシュ＋stale表示**・job/asset(role=render)に乗る）→**②MusicXML/MIDI+歌詞の書き出し**（今は入力のみ＝橋を新設。VOICEVOX公式Song/OpenUTAU へ受け渡し）→**③表現編集(f0/volume/phonemeをフレーム編集＝ビブラート/しゃくり/強弱)は自作の余地**（offloadだけでなく自前UIも可・ユーザー意向）。声質そのものはモデル焼込＝SynthV領分。着手時 Task 化。
- **コード楽器のテンション込みvoicing**：コード語彙拡張(2026-06-30・S1-S3)で進行プレビュー/MIDIはテンション(9/13等)が鳴るが、**comping(chord_pattern)の voicing は当面 R/3/5/7 まで**＝9/11/13 をボイシングに積めない。voicing tones に「9/11/13」を足す＋テンション配置(上に開く/5度オミット)を設計。併せて **compingの声部進行最適化**（アンカー最寄りで跳ねは消えたが、共通音保持/最小移動の本格ボイスリーディングは未）。
- **跳ね/スイング＝亜種(「跳ねるボタン」)**：Layer①の拍セル・リズムモデルは**均等グリッド前提**（16分/8分ストレート）。スイング・三連跳ねは**打点位置を後処理で 1/3:2/3 等にマップし直す**「跳ねるボタン」で亜種化＝**語彙/遷移表はそのまま流用**できる（学習し直し不要）。Layer① が乗ってから着手。
- **ネタの版管理（undo/redo）**：チャットの書込（revise/assemble）を**取り消せる/やり直せる**ようにする。
  いまは capture のみ undo=削除で可逆（S3b）。revise/assemble は「変更前」が無く undo できない＝
  サーバ側に **ネタの履歴（version 列 or 別表）+ /neta/:id/undo,/redo** を足すのが本筋。設計から起こす。
  （#100④a「書いてから可逆」を本当に成立させるための土台。）
- **調査系タスク＝Claude コマンド化（承認/トレイ配送の作り直し・2026-07-05 退避）**：Chat の旧承認ワークフローは
  撤去済（design.md「Chat 旧ジョブ流路を撤去」）。**曲の調査系タスクを実装する時に、下記 UX 契約を Claude
  コマンド（headless Claude が裏で調査/生成しネタを書く）流で作り直す**＝受け入れ条件：
  ① **承認ワークフロー**（変異を即適用せず、原本↔提案を並置・試聴・比較→個別/すべて承認→承認時のみ書込）。
     ※単発の可逆変異は現状の書込カードで足りる＝これは**複数提案のバッチ triage** が要る時に導入。
  ② **裏で続行→受け取りトレイ配送**（チャットを閉じても裏で走り、結果がトレイ📥＋由来チャットに届く）。
  ③ **待ち UX**（確定進捗 done/total＋『待たずに戻る』＝裏で継続）。同期ターンには不要、非同期タスクで再導入。
  実行基盤は worker(Python) でなく Claude コマンドで設計（memory「worker脳撤去→Claude脳」と整合）。
- ~~**worker の claude_prompt 完全撤去（#100 の最終形）**~~ → ✅**worker脑撤去 完了**（2026-07-05）。①生成→決定的
  `/gen/section`（GN-08）②scheduled research→api内claude実行器（`research-runner.ts`）③`claude_prompt`＋10 LLMハンドラ
  （brainstorm/suggest/gen_melody/gen_chord/gen_rhythm/gen_variations/gen_lyric/fetch/research/collect）＋死にヘルパ撤去。
  **worker は 100% 決定的**（import_midi＋rule handlers）。`grep claude_prompt apps/worker/src`=空・pytest 28緑・api442緑。
  - 残＝**worker プロセス全撤去**には唯一の生存機能 `import_midi`（Python `mido`）を **api へ TS(@tonejs/midi)移植**が要る
    （research と同様、api の job consumer で parse→materialize）。それが済めば apps/worker 丸ごと削除可。別タスク。
- **research に外部検索ツールを足すか検討**：今は research streaming＝Claude の知識のみ（実在曲を語る）。
  ネット検索が要るなら MCP に research/web ツールを追加（要・到達/プライバシー判断）。

## 片付け（小〜中）
- ~~**Chat.tsx 旧ジョブ経路の死にコード撤去**~~ → ✅撤去済（2026-07-05・A案）。`runJob`/`handleConsult`/
  `waitForJob`/`finishWait`/`pick`/`applyProposal`/`saveRef`＋`ProposalCard`/`ProposalGroup`＋型＋`waitInfo`/
  `cancelWait`＋死にCSS を除去。承認/トレイ配送/待たずに戻る の **UX 契約は design.md「Chat 旧ジョブ流路を撤去」
  ＋下記『調査系タスク＝Claude コマンド化』に退避**。web273緑。
- **systemd 自動起動**：母艦再起動でスタックが落ちる（手起動が要る）。`deploy/systemd/install.sh` で
  cm-api/worker/search を --user systemd に入れて enable。グローバル汚染を避けたいので最後でよい（ユーザー方針）。
  ※ architecture.md L37「自動起動＝systemd 化済」は**実態と乖離**（未インストール）＝入れる時に文言も是正。

## 運用・監視
- **quota（7日）監視**：常駐 claude は Max 認証。7日クォータの天井に近いと会話が死ぬ。枯渇検知＋表示。

## ドッグフード由来（低優先・UX磨き）
- 再生トランスポートの絵文字 □ 化 → SVG アイコンに。
- 意味検索が 0 件のときのヒント表示（無言にしない）。
- スマホの mood 入力が見切れる。
- セクションエディタのオーバーレイが一部欠ける（sliver）。

## データ収集（要ユーザー関与）
- メロコーパスのデータ収集（Hooktheory 型・Task #59）。
- 確認リストの維持（自走中の不明点・Task #10）。
