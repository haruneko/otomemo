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
| 入力モダリティ | 🟡 | ✅ピアノロール／パッドステップ／文字、添付(asset)。⬜楽譜入力・音声(ハミング)＝#56 |
| 検索・つなぐ | ✅ | ファセット検索、意味検索(埋め込み＋較正ゲート #65)、関連辺・合成辺 |
| スケッチ・再生 | ✅ | 4要素エディタ、Tone.js＋SF2再生、プレイヘッド・トランスポート、section/song合成、GM音色(再生↔書出一致 #47) |
| ドラム再生 | 🟡 | ✅速度(prewarm)/音高(detune)/チョーク(stopId) #84 S0-S3。⬜S4 velocity(ハイハット音量) |
| DAW往復・過去資産 | 🟡 | ✅MIDI書出、MIDI取込(worker分割 melody/rhythm #81)、歌詞取込。⬜コード自動検出、mp3整理、ABILITY往復は基本のみ |
| 投げて受け取る | ✅ | ジョブ→worker→reap→トレイ、plan分解・継続・通知強度・waiting/question #45、定期スケジューラ #80、フォーム質問パネル #85S3 |
| AI生成 枠＋動作＋構造 #85 | 🟡 | ✅枠(6/8効く)、gen_variations(N個・items+edges)、condition(音数/コード)、verb(fetch/transform/gen_lyric)、文章＋パネル導線。⬜方向確認サンプル(E) |
| 音楽理論層 #86 | 🟡 | ✅判定(analyze_fit/detect_key/analyze_progression)、ルール生成(chords/melody/bass/drums/pair)、Chat入口(dispatch・実機)、正規化層、MCPサービス(S2a実機)、agentic Chat(S2b 受入済)。⬜補正・類似度・ルールvsClaude実測 |
| 情報収集 | ✅ | research/collect・参考曲・継続研究 #9 |
| 非機能 | 🟡 | ✅認証(CM_TOKEN)・localhost専有・出先/家。⬜バックアップ、⬜常駐サービスの自動起動/プロセス管理が弱い |

---

## 2. 残タスク（管理対象・着手順）

| # | 領域 | 内容 | 関連設計 | 段取り | acceptor | 状態 |
|---|---|---|---|---|---|---|
| 91 | #86補正 | **fit_to_chords**：other型(正当でない)外し音を最寄りコードトーンへスナップ。経過/刺繍/掛留は残す | design#12 Stage1 | cm-music関数→MCP/handler→reap→test | impl | 🟡 関数着手済 |
| 92 | #86類似度 | **melody_similarity**(輪郭/区間n-gram→Mongeau-Sankoff)＋find_similar。作風寄せ/重複の土台 | research R2 | cm-music→MCP/HTTP→test | impl | ⬜ |
| 93 | #85方向確認 | バッチ前に1案だけ作り「この方向でいい?」→承認(frame/count引継)で残数本生成 | design#85(E) | worker(askQuestion/answerJob)→test | impl | ⬜ |
| 84 | ドラム | **S4 ハイハット音量(velocity層)** ＋ Standard 1 を1 SmplrPresetに集約 | design#84 | music.ts | impl(実機) | ⬜ |
| 83 | スキーマ | **song(stage/next_action)・neta_asset(role)** テーブル欠落(設計#14と乖離) | design#14 | db.ts→core→http→test | design+impl | ⬜ |
| -  | #86移管 | **ルール vs Claude を判定器で実測** → 生成を全面ルール移管するか判断 | design#12 | 実測スクリプト(analyze_fitで比較) | — | ⬜ |
| 55 | #47後続 | song箱UI・SF2再生パリティ・section多トラックMIDI書出 | — | 縦スライス | impl | ⬜ |
| 56 | #35後続 | **楽譜入力・音声(ハミング→音高)・添付拡張**（大・要調査） | 要件L116-119 | 調査→設計→実装 | design+impl | ⬜ |
| 22 | AI探索 | 広くAIツール探索（別立て・要調査） | — | research | — | ⬜ |
| -  | #86 S2c | 外部 Claude Desktop 接続（localhost専有で保留・やるなら CM_TOKEN ゲート） | design#12 Stage2 | — | — | ⬜保留 |

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
