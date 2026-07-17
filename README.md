# Otomemo（音メモ）

手早く音を出してメモする、スマホ優先の作曲スケッチ PWA。空かないメインの脳の外で、
細切れ時間でもネタを **貯め・探し・組み・書き出す**、自己ホストの作曲支援ツール。

（旧称 `creative_manager`。思想と経緯は `docs/`：`requirements.md` / `architecture.md` / `design.md`。）

<p align="center">
  <img src="docs/images/otomemo-library.png" alt="Otomemo ライブラリ（スマホ優先）" width="260">
</p>
<p align="center"><sub><em>スマホ優先。色分けカード＋ミニピアノロールで、細切れ時間でもネタを貯め・探し・組み・書き出す。</em></sub></p>

<p align="center">
  <img src="docs/images/otomemo-melody-editor.png" alt="メロディ編集（ピアノロール）" width="415">
  <img src="docs/images/otomemo-section.png" alt="セクション組み立て（レーン）" width="415">
</p>
<p align="center"><sub><em>ピアノロールでメロを描き（左）、セクションでパートを重ねて一曲にする（右）。調/拍子/テンポは器が持ち、音は C 基準保存＋トランスポーズ。</em></sub></p>

## できること
- **捕獲**：メロ/コード/ベース/リズム/コード楽器/歌詞/テーマ/セクション/曲 を最小手数でメモ（オフラインでも落とさない）。MIDI/楽譜取込・ハミング。
- **探す**：色分けカード＋種別/ムード絞り＋**意味検索**（日本語 Ruri v3）。**器（プロジェクト）＝一曲の器**で束ねる（作成/削除）。意味検索が落ちてもキーワードへ劣化＋その旨を告知。
- **編集**：kind 別エディタ（ピアノロール／度数グリッド／コード／ステップ）。調/拍子/テンポ/音色/弱起、Undo/Redo、デバウンス自動保存。
- **組み立て**：`section`（パートを重ねる）／`song`（section を時間順に並べる）タイムライン。空セル→配置ピッカー（検索/器/拍子＋**おすすめ＝コーパス**／＋新規）。ループ伸ばし。
- **いじる（決定的・待ち無し・クォータ0）**：この進行にメロ/ベース/ドラム生成・ハモリ・崩す・移調・コードに合わせる・噛み合い診断。
- **相談（Chat 💬）**：`claude -p` の薄いラッパー。相談／調べる をストリーミング。生成候補は試聴→保存、書込は可逆（取り消す）、知見化。**継続調査**＝裏で調べて参考曲を受け取りトレイへ（api が claude を回す）。
- **書き出し**：MIDI（合成／レーン別分割・ドラム ch10・トラック名 ASCII）。SoundFont 差し替え・GM 試聴。色テーマ。

## 構成
| | | |
|---|---|---|
| `apps/api` | TypeScript / Fastify / better-sqlite3 | 操作コア（neta CRUD・検索・ジョブ）＋**決定的音楽エンジン**（gen_*/fit/analyze）を **HTTP** と **MCP(stdio)** で公開。Chat の `claude -p` 中継・継続調査の実行もここ |
| `apps/web` | React / Vite | スマホ優先 PWA |
| `apps/worker` | Python / uv | **意味検索（cm-search）専用**。※旧ジョブワーカー(cm-worker)は撤去＝生成/研究/MIDI取込は全て api(TS/MCP)へ移管、脳は Claude |

データは単一の SQLite（`data/cm.sqlite`、WAL）。TS↔Python の境界は **DB のみ**（cm-search が neta を読んで意味索引を張る）。ジョブは api(TS) 内で完結。

## 起動
本番は api が web の dist も配信＝**外部公開は :8787 の1ポートだけ**（dev は vite）。
```sh
pnpm install
uv sync --directory apps/worker      # 初回：埋め込みモデル等をDL

DB=$PWD/data/cm.sqlite
CM_DB=$DB pnpm --filter @cm/api start                 # API（web配信込み）:8787
pnpm --filter @cm/web dev                             # Web dev :5173 (/api→8787)
CM_DB=$DB uv run --directory apps/worker cm-search    # 意味検索 :8788
```
（生成・研究・MIDI取込は api 内で完結＝別プロセス不要。旧 cm-worker は撤去済。）
スマホ等からは Tailscale 経由、または `http://<箱のIP>:8787`。WSL2 mirrored の場合、Windows の
Hyper‑V ファイアウォールで 5173/8787 の inbound 許可が必要（`allow-creative-manager.cmd` 同梱）。

MCP：`.mcp.json` 同梱。Claude Code でこのリポジトリを開けば `creative-manager` ツールが使える。

## テスト
```sh
pnpm -r test                            # TS（api + web）
uv run --directory apps/worker pytest   # Python worker
```

## バックアップ（データ消えない）
```sh
CM_DB=$PWD/data/cm.sqlite ./scripts/backup.sh   # data/backups/ に世代コピー（既定14世代）
# cron 例（毎時）:  0 * * * * CM_DB=/abs/path/data/cm.sqlite /abs/path/scripts/backup.sh
```

## 設計の芯
- すべては「ネタ」＝再帰的に入れ子（DAG）。tempo/拍子/調は section/song が所有、音楽要素は **C基準保存＋トランスポーズ**。
- **脳は Claude クライアント**（`claude -p` の薄いラッパー＋MCP）。**生成は決定的 TS エンジンが主**（待ち無し・クォータ0）、会話と研究のみ Claude。設計思想＝**「機械は候補まで・仕上げは人間」**。
- 意味検索はブルートフォース cosine（規模的に十分）。詳細・未決事項は `docs/`。

## ライセンス
本体コードは **MIT**（[LICENSE](LICENSE)）。個人の作曲支援ツールを公開しているもので、そのまま使う・改変する・参照するのは自由。

### 帰属・第三者コンポーネントの注意
自作の TS 生成エンジンと web は MIT で完結。ただし**任意で使う重い外部コンポーネントは各自のライセンスに従う**：
- **PESTO（`pesto-pitch`・音源の f0 推定）＝非商用寄りライセンス**。音源アナリーゼの Python サイドカー（`apps/audio`・任意機能）でのみ使用。**商用利用を考えるなら置き換え/除去が要る**。
- **VOICEVOX（仮歌の歌唱合成）**：本リポジトリには**同梱していない**。利用者が自分でインストールし localhost 接続する設計。生成した歌声を配布する場合は各話者の利用規約（クレジット表記等）に従うこと。
- **コーパス由来の統計**（`data/corpus-stats/`）は**集計統計のみ**でリテラルな旋律・モチーフは保存していない（POP909 等・著作権配慮）。生データは含まない。
- **Claude（Chat の"脳"）**：`claude -p` 経由で利用者自身のアカウント/CLI を使う想定。本ソフトには含まれず再配布もしない（BYO）。
- 主な OSS：Fastify / React / Vite / Tone.js / smplr / better-sqlite3 / demucs / librosa / pyopenjtalk / sentence-transformers（Ruri v3 埋め込み）。各々のライセンスに従う。
