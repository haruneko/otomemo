# チャット・アナリーゼ（①）充足度監査＋研究計画（2026-07-15）

**目的**：チャット経由アナリーゼ（`usecases-chat.md` ①）について「理論／ミドルウェア研究／実フィジビリが足りているか」を正典×実コード突合で監査し、不足を研究計画（WP・担当モデル指定つき）に落とす。
**方法**：正典3本（`usecases-chat.md`・`design.md` アナリーゼ節・`research/audio-analysis-feasibility.md`）× 実装棚卸し（Opus Exploreエージェント・`_audio_poc/analyze.py`／`audio-analyze.ts`／`reaper.ts`／`AnalysisWorkbench.tsx`／`mcp.ts`／`chat-session.ts`）。
**担当モデルの規約（オーナー指定）**：研究するだけ＝**Opus以下を明示**／判断が要る＝**Fable**／判断の少ない作業＝**Opus**。

---

## 1. 充足度の判定（TL;DR）

| 軸 | 判定 | 根拠 |
|---|---|---|
| **フィジビリ（事実系MIR）** | ✅**足りている** | POC 8曲GO確定（調=BTCコード頻度~95%整合）・v1実装済・v2ワークベンチ実装済・ドラム/ベースstem抽出→ネタ化まで配線済 |
| **ミドルウェア研究** | ⚠️**部分的に古い/未検証** | feasibility doc は 2024–25 時点。allin1/basic-pitch は「推奨」のまま**未導入・実測未**。yt-dlp の対YouTube耐久は2026年時点で再確認要 |
| **理論（読み筋＝所見の中身）** | ❌**最大の穴** | v2の値打ち「実測の具体」を所見が構造的に語れない（下記2-G2）。生成側の記号レンズ資産→解析転用の研究ゼロ |
| **チャット結線フィジビリ** | ❌**未検証** | 深掘り会話のE2Eが無い（chat-e2e=2026-07-05＝ワークベンチ以前）。記号系verbのchat面露出も未確定 |

**結論**：①は「音を測る」は完成し「測った数字から学びを生む」が未研究。**次の投資は perception でなく interpretation（読み筋）**。

---

## 2. 不足の洗い出し（4クラスタ・実コード証拠つき）

### G1 事実の穴（perception層）
- **構成（セクション区切り）**：allin1 未導入（`analyze.py` に影も無し）。現状は crash 区間分解（`audio-drums.ts extractSectionPatterns`）が代替＝機能ラベル（Aメロ/サビ）無し。正典 `usecases-chat.md` L133 が「残・要Python」と明記したまま。feasibility doc は allin1 を勝者と指名（Harmonix SOTA）だが **NATTEN 手動ビルド＋CPU実行時間が未実測**。
- **転調・借用の検出**：facts の調は**単一グローバル**（`estimate_key`＝Krumhansl 1発）。一方 v2 要件は「借用/転調こそ見どころ」（`usecases-chat.md` L33）＝**要件と実装が矛盾**。手元に転用可能な資産あり＝study の `resolveTonic`（継続長ヒートマップ・実データ検証済）を窓化すれば chords_timeline から局所調が出るはず＝**手法設計＋実測が未**。
- **メロ採譜の質**：pyin 単音RLEのみ。basic-pitch は「将来案」コメント（`analyze.py` L59）のまま。feasibility の数字（vocals note-F ~49%）だと**入れる価値があるか自体が疑問**＝自作曲（MIDI正解あり）での比較実測が未。torchcrepe（f0精度~97%）も未導入（現行 pyin ~66–92%）。
- **小欠陥**：`bass_notes` が analysis ネタの raw に保存されない（`reaper.ts` L230 で欠落）＝ワークベンチもチャットもベース生データを読み返せない。`transcribeFullSong`（`audio-drums.ts` L550-660）は実装済みだが未配線（使用箇所=testのみ）。

### G2 読み筋の穴（interpretation層）＝**本丸**
- **所見文の入力が痩せている**：`audio-analyze.ts summarizeFacts`（L81-91）が Claude 統合プロンプトに渡すのは **bpm/meter/key/vocal_range/duration/chord_freq_top/chords のみ**。drum_onsets・bass_notes・melody_notes・beat_times は巨大配列ゆえ意図的カット（L79）→ **所見はドラム/ベース/メロ/グルーヴに言及できない**。v2確定要件「特徴抽出＝Claudeが実測facts全体を読みミニマムに選ぶ」（`usecases-chat.md` L33）が構造的に不可能。
- **生成→解析の非対称**：生成側には記号だけで計算できるレンズ資産が既に9本ある（張力カーブTIS／輪郭テンプレ辞書／フック度レンズ／シンコペ帯／旋法・借用統計／転調カタログ／期待理論IC配分／骨格統計／歌いやすさ）。**全て「度数＋拍位置」入力＝chords_timeline＋melody_notes に食わせられる**のに、解析側への転用マップ（どのレンズがどの facts からどの「見どころ」を出すか）が未研究。
- **「良いアナリーゼ文」の型が未研究**：何を読み取ると学びになるか（アナリーゼ教育論・実務家の分析の型）の外部調査ゼロ。合格基準「その曲固有の学びが出るか」（`usecases-chat.md` L112）を支える理論が無い。

### G3 チャット結線の穴（フィジビリ）
- **深掘り会話のE2E未検証**：analysis ネタの content に facts 丸ごと格納＝`read_neta` で読めるが、melody_notes/drum_onsets は数千点＝**チャットが読むとコンテキスト爆発の恐れ・実測無し**。「このBメロの進行を説明して」級の会話が成立するか通していない。
- **記号系verbの露出不明**：`analyze_progression`/`identify_progression`/`explain_progression` は `mcp.ts` の legacy ブロック内（L203-255）＝**chat面（thin 15 verbs）に出ていない可能性**。出ていなければ「解析したコードを理論で説明する道具」がチャットに無い＝BUG#1（許可漏れで黙って死ぬ）と同型のリスク。
- **v1.1残のUI**（生f0フォールバック表示・ドラッグ範囲選択・コード訂正UI・複数アンカーUI）＝研究不要の実装タスク→ backlog/Task 行き（本計画のスコープ外）。

### G4 外部環境の鮮度
- feasibility doc は 2024–25 の調査。**2025–26 の MIR 新顔**（コード認識・構成解析・採譜・分離の SOTA 更新、CPU可否・ライセンス）が未反映。
- **yt-dlp の対YouTube耐久**（SABR/POトークン以後の2026現況）＝取得経路の前提が生きているか再確認要。

---

## 3. 研究計画（WP一覧・担当モデル指定つき）

原則：研究＝`docs/research/` に .md＋README索引1行（CLAUDE.md規約）。実測は自作曲/PD/CC音源＝著作権セーフ。他者コーパスは統計のみ。

### Wave 1 — 研究だけ（外部調査・文献）＝**Opus指名・並列可**

| WP | 内容 | 出力 | 担当 |
|---|---|---|---|
| **R1 アナリーゼ教育論** | 人が曲分析から何を学ぶか＝実務家/教育のアナリーゼの型（何を見る順か・「見どころ」の類型・良い分析文の構造）。出典付きサーベイ | 見どころ類型表＋所見文テンプレ候補 | **Opus** |
| **R2 局所調・転調検出手法** | chord-timeline からの local key estimation（HMM/窓相関/セグメンテーション）の手法サーベイ＋自前 `resolveTonic` 窓化との比較評価軸 | 手法比較表＋推奨アルゴリズム仕様 | **Opus** |
| **R3 MIR 2025–26 再サーベイ** | feasibility doc の鮮度更新＝コード認識/構成解析(allin1後継?)/採譜(basic-pitch後継?)/分離の新顔。CPU可否・ライセンス・pretrained有無で表化 | feasibility doc への差分追記案 | **Opus** |
| **R4 yt-dlp 現況** | 2026年時点の対YouTube成功率/要件（PO token provider・cookies）・代替取得経路。軽い調査 | 取得経路の現況メモ | **Opus**（軽量ゆえHaiku可） |

### Wave 2 — 実測フィジビリ（作業＝Opus・合否判断＝Fable）

| WP | 内容 | 合否基準（先に固定） | 担当 |
|---|---|---|---|
| **F1 allin1 実測** | WSL2 に NATTEN ビルド＋allin1 導入→既知曲3曲（自作+PD）で構成境界/ラベル/CPU時間を実測 | 境界が耳の区切りと概ね一致＆1曲<15分CPU → 導入GO | 作業**Opus**／GO判断**Fable** |
| **F2 メロ採譜比較** | 自作曲（MIDI正解あり）の vocal stem で pyin vs basic-pitch vs torchcrepe+ノート化 を note-F/音域/輪郭で比較 | 現行pyin比で明確な改善が無ければ**入れない**（負けない既定） | 作業**Opus**／採否判断**Fable** |
| **F3 転調検出プロト** | R2 の推奨手法で chords_timeline→局所調のプロトタイプ→既知転調曲（半音上げ/短3度上げ/部分転調 各1）で実測 | 転調点±2小節・調正解 → facts 契約に `key_segments` 追加GO | 設計**Fable**→作業**Opus**／GO判断**Fable** |
| **F4 チャット深掘りE2E** | 実曲1本を analyze_audio→read_neta→「Bメロの進行は？/どこが面白い？」級の質疑を通す。facts のトークンサイズ実測・記号verb（analyze_progression等）のchat面露出を実機確認 | 会話が破綻せず具体に答える／verb欠落・コンテキスト爆発は所見として列挙 | 作業**Opus**（実走＝E2E委譲規約どおり） |

### Wave 3 — 設計判断＝**Fable**（Wave1-2 の結果を食って）

| WP | 内容 | 出力 |
|---|---|---|
| **D1 読み筋レンズ転用マップ** | 既存9レンズ×analysis facts の対応設計＝どのレンズがどの facts からどの「見どころ」候補を出すか。**facts→prose 入力の圧縮契約**（TS純関数で要約統計を作り `summarizeFacts` を再設計＝drum/bass/melody を所見に届かせる）。R1 の見どころ類型と接続 | design.md 追記案（アナリーゼ節 v2.1） |
| **D2 総合裁定** | F1-F4 の合否を束ね、①の次スライス（何を実装し何を捨てるか）を確定。v1.1残UIタスクの優先度もここで裁定 | 実装ハンドオフ（Opus向けWP分割） |

### Wave 4 — 判断の少ない実装作業＝**Opus指名**（研究計画の付録・即効）

| WP | 内容 | 備考 |
|---|---|---|
| **W1 bass_notes raw保存** | `reaper.ts` L230 の raw に bass_notes を追加（1行級＋テスト） | 待ち不要・即やれる |
| **W2 summarizeFacts 圧縮層** | D1 の契約確定**後**に実装（要約統計の純関数＋TDD） | D1ブロック |
| **W3 記号verb chat露出** | F4 で欠落が確定したら `CHAT_VERBS`+surface 配線（BUG#1型の再発防止テスト込み） | F4ブロック |

### 推奨実行順
```
並列: R1 R2 R3 R4 (Opus) ＋ W1 (Opus)
  ↓
並列: F1 F2 (Opus作業) ／ F3 (Fable設計→Opus作業) ／ F4 (Opus)
  ↓
D1 → D2 (Fable) → W2 W3＋実装ハンドオフ (Opus)
```

**やらないこと（明示）**：GPU級モデル（BS-RoFormer/MT3）・混合音源の楽器名当て・多声ボーカル完全採譜・拍子の完全自動検出（meter指定は正典どおりユーザー）・音源の恒久保存（著30-4線は不変）。

---

## 実行記録
- **Wave 1 完了（2026-07-15・5並列）**：R1→[2026-07-15-analysis-pedagogy](2026-07-15-analysis-pedagogy.md)（見どころ18類型表・「事実→解釈→転用」3層＝v1の薄さの理論的説明）／R2→[2026-07-15-local-key-detection-survey](2026-07-15-local-key-detection-survey.md)（推奨=resolveTonic窓化＋DP・純TS依存ゼロ・F3合格基準込み）／R3→[2026-07-15-mir-2026-refresh](2026-07-15-mir-2026-refresh.md)（BTC据え置き・**beat_this乗り換え推奨**・F2にROSVOT/PESTO追加）／R4→[2026-07-15-ytdlp-status](2026-07-15-ytdlp-status.md)（現行設計維持でOK）／W1→`reaper.ts` raw に bass_notes 保存（api 1116緑・tsc クリーン）。
- **R3によるWave 2の増補**：F1に beat_this の拍/ダウンビート実測を追加・F2の比較対象に ROSVOT（歌特化採譜）と PESTO（軽量f0）を追加。
- **Wave 2 完了（2026-07-15・4並列）**：F1→[allin1-beatthis-feasibility](2026-07-15-allin1-beatthis-feasibility.md)（beat_this=7-10s/曲でダウンビートΔ0.045s・allin1=機能ラベル付き14-16区間だが10-14分/曲＋パッチ3点）／F2→[vocal-transcription-benchmark](2026-07-15-vocal-transcription-benchmark.md)（**PESTO勝者** note-F 0.761 vs pyin 0.568・basic-pitch不採用確定・ROSVOT導入断念）／F3→[local-key-proto-results](2026-07-15-local-key-proto-results.md)（合成6系統全勝・実曲2/3合格・DeepSea13分割=emission限界を特定）／F4→[chat-analysis-e2e](2026-07-15-chat-analysis-e2e.md)（会話の質◎だが **analysisネタ100-126K tokens で read_neta/search が実質死**・melody_f0が55%）。api全スイート1122緑（F3のlocalKey.ts＋tonicScores切出し込み）。

## D2 総合裁定（Fable・2026-07-15）
| 対象 | 裁定 | 根拠/条件 |
|---|---|---|
| **PESTO差し替え** | **GO（Wave4即実装）** | 精度・速度・導入の三拍子。生歌別曲で耳＋数値の追検証1回を条件に |
| **basic-pitch** | **不採用で決着** | 実声0.555。usecases-chat.md v1.1残の「basic-pitch採譜精度up」は撤回（PESTOが代替） |
| **localKey結線** | **限定GO（Wave4・digest経由）** | 断片化ゲート必須（>4セグ or 最短<8sでグローバルへフォールバック）。調テンプレemissionは第2弾 |
| **facts射影（digest＋MCP射影）** | **GO（Wave4本丸）** | 所見とチャットの両詰まりが同根＝射影層一本で両方直る。設計＝design.md「読み筋層 v2.1」確定済 |
| **beat_this** | **GO・ただし第2弾** | 性能文句なしだが torch2.6系 venv分離＝venv戦略の設計とセットで |
| **allin1** | **条件付きGO・第2弾** | 10-14分/曲＝既定パイプラインには重い。任意「追い焚き」ジョブとして非同期に |
| **軽量双子ネタ（F4案B）** | **不採用** | digest保存＋read_neta/search射影で代替＝ネタ一覧を汚さない |

**Wave 4 完了（2026-07-15・3並列・api 1147緑/tscクリーン）**：A1=`music/audio-digest.ts` 新設（spots 7類型＝H1/H2/H5[断片化ゲート付きlocalKey結線]/M2/M4/R3/F1・12KB契約・決定的）＋prose 3層テンプレ化＋reaper が `content.digest` 保存／A2=chat面射影＝read_neta 117K→5.7K・147K→9.0K tokens、search 1ヒット134K→203 tokens（full面はバイト一致保護・fieldsオプトイン・verb⇔許可リスト一致の恒久検査テスト）／A4=analyze.py pyin→PESTO（note-F 0.761再現・f0_engineフィールド＋pyin自動フォールバック・spawn型=api再起動不要）。**残**＝(1) prose用digestは区間前の軽量版＝所見が小節番号で語る精度は限定的（prose生成をreaper後段へ移す改善はbacklog級） (2) PESTO生歌耳検証＋新所見文の「なるほど」品質＝オーナー手番 (3) 第2弾=backlog「読み筋第2弾」。

**Wave 4 実装WP（Opus委譲）**：A1=digest純関数＋spots第1弾＋key_segments結線＋prose再設計（audio-digest.ts新設・summarizeFacts置換・reaper保存）／A2=MCP射影（read_neta要約＋fieldsオプトイン・search要約射影・ok()非pretty・CHAT_VERBS+1）／A4=PESTO差し替え（analyze.py・母艦venv・F2ハーネスで回帰確認）。第2弾（backlog）＝beat_this＋venv戦略・allin1追い焚き・調テンプレemission・PESTO生歌耳検証。

## 4. 出典・根拠の所在
- 正典：`docs/usecases-chat.md`（①v2要件確定 L25-47・合格基準 L114-116）／`docs/design.md`（アナリーゼ・ワークベンチ L856-・ドラム/ベース抽出 L942-）
- 既存研究：`audio-analysis-feasibility.md`（POC GO・精度天井）／`2026-07-08-drum-transcription-journey.md`（区間分解）／`2026-07-07-audio-to-neta-extraction-map.md`（構成が穴・LLMは組み立て層）／`2026-07-06-within-song-loop-lens.md`（resolveTonic）
- 実装棚卸し：本doc §2 の file:line（Opus Explore 2026-07-15 実査）
