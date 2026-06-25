# creative_manager — 積みタスク（やりそびれ・あとで）

スペック層（requirements/architecture/design）にも Task 機能にも載せきれない「いつかやる／保留」をここに貯める。
着手したら Task 化して、ここからは消すか「→ #NN」と印を付ける。最終更新を都度書く。

最終更新: 2026-06-25

## 機能（中〜大）
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
