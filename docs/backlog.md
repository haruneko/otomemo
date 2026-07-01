# creative_manager — 積みタスク（やりそびれ・あとで）

スペック層（requirements/architecture/design）にも Task 機能にも載せきれない「いつかやる／保留」をここに貯める。
着手したら Task 化して、ここからは消すか「→ #NN」と印を付ける。最終更新を都度書く。

最終更新: 2026-07-01

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

## 機能（中〜大）
- **仮歌入れ込み（歌声合成・別口／2026-07-01 研究クローズ）**：流し込んだ歌詞(`Note.syllable`)でメロを"仮歌"として鳴らす。調査＝`docs/research/2026-07-01-singing-voice-synthesis.md`（**VOICEVOX歌唱をローカルCPUで実測＝リアルタイムより速い0.38x・音質OK・footprint≈2GB常駐1・sudo不要**）。最小実装案＝**①ラフ歌唱プレビュー**（VOICEVOX HTTP `sing_frame_audio_query→frame_synthesis`・Score={notes:[{key:MIDI,frame_length,lyric:かな}]}・93.75fps・先頭休符必須／**編集毎の自動再生成はしない＝「🎤歌わせる」明示レンダ＋content-hashキャッシュ＋stale表示**・job/asset(role=render)に乗る）→**②MusicXML/MIDI+歌詞の書き出し**（今は入力のみ＝橋を新設。VOICEVOX公式Song/OpenUTAU へ受け渡し）→**③表現編集(f0/volume/phonemeをフレーム編集＝ビブラート/しゃくり/強弱)は自作の余地**（offloadだけでなく自前UIも可・ユーザー意向）。声質そのものはモデル焼込＝SynthV領分。着手時 Task 化。
- **コード楽器のテンション込みvoicing**：コード語彙拡張(2026-06-30・S1-S3)で進行プレビュー/MIDIはテンション(9/13等)が鳴るが、**comping(chord_pattern)の voicing は当面 R/3/5/7 まで**＝9/11/13 をボイシングに積めない。voicing tones に「9/11/13」を足す＋テンション配置(上に開く/5度オミット)を設計。併せて **compingの声部進行最適化**（アンカー最寄りで跳ねは消えたが、共通音保持/最小移動の本格ボイスリーディングは未）。
- **跳ね/スイング＝亜種(「跳ねるボタン」)**：Layer①の拍セル・リズムモデルは**均等グリッド前提**（16分/8分ストレート）。スイング・三連跳ねは**打点位置を後処理で 1/3:2/3 等にマップし直す**「跳ねるボタン」で亜種化＝**語彙/遷移表はそのまま流用**できる（学習し直し不要）。Layer① が乗ってから着手。
- **ネタの版管理（undo/redo）**：チャットの書込（revise/assemble）を**取り消せる/やり直せる**ようにする。
  いまは capture のみ undo=削除で可逆（S3b）。revise/assemble は「変更前」が無く undo できない＝
  サーバ側に **ネタの履歴（version 列 or 別表）+ /neta/:id/undo,/redo** を足すのが本筋。設計から起こす。
  （#100④a「書いてから可逆」を本当に成立させるための土台。）
- **worker の claude_prompt 完全撤去（#100 の最終形）**：⑤で consult は撤去済だが、まだ残る LLM 経路＝
  ① NetaList の「AI生成」ボタン（gen_melody/gen_chord/gen_rhythm）② NetaDialog の scheduled research。
  これらを TS/MCP（決定的 gen_* / 常駐 claude）へ移して claude_prompt を消す。移したら brainstorm/suggest/
  gen_lyric/fetch 等の旧 LLM ハンドラも一掃。
- **research に外部検索ツールを足すか検討**：今は research streaming＝Claude の知識のみ（実在曲を語る）。
  ネット検索が要るなら MCP に research/web ツールを追加（要・到達/プライバシー判断）。

## 片付け（小〜中）
- **Chat.tsx 旧ジョブ経路の死にコード撤去**：consult/research を常駐へ寄せた結果 `runJob`/`handleConsult`/
  `waitForJob`/`finishWait` が未使用（tsc は noUnusedLocals オフで通る）。`waitInfo`/`cancelWait` と
  「仕上げています…待たずに戻る」JSX も連鎖で不要。まとめて撤去（options/pick/references 描画は履歴用に残す）。
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
