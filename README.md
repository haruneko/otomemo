# creative_manager

作曲のための「**外部化された延長**」——空かないメインの脳の外で、細切れ時間でもネタを
**貯め・探し・相談し・育てる**、自己ホストの作曲支援ツール。

思想と経緯は `docs/`（`requirements.md` / `architecture.md` / `design.md`）。

## できること
- **捕獲**：歌詞/メロ/コード/リズム/テーマ等を最小手数でメモ（オフラインでも落とさない）
- **探す・つなげる**：色分けカード一覧＋ファセット＋**意味検索**（日本語 Ruri v3）
- **相談・生成**（`claude -p` 経由、APIキー不要）：
  - カードの **壁打ち** → 案を提示 → 選んでネタ化
  - **メロ生成** → ピアノロールで編集 → **再生**（Tone.js）→ **MIDI書き出し**（ABILITY向け）
  - **Chat**（💬）：プロジェクト全体に相談／調べる → 知見化
- **編集・削除**（カードの ⋯）、**色テーマ**（⚙）、**MIDI取込**

## 構成
| | | |
|---|---|---|
| `apps/api` | TypeScript / Fastify / better-sqlite3 | 操作コア（neta CRUD・検索・ジョブ）を **HTTP** と **MCP(stdio)** で公開 |
| `apps/web` | React / Vite | PWA風UI |
| `apps/worker` | Python / uv | ジョブワーカー（モーラ解析・意味検索・壁打ち/提案/メロ生成/研究） |

データは単一の SQLite（`data/cm.sqlite`、WAL）。TS↔Python の境界は**ジョブ表のみ**。

## 起動
```sh
pnpm install
uv sync --directory apps/worker      # 初回：埋め込みモデル等をDL

DB=$PWD/data/cm.sqlite
CM_DB=$DB pnpm --filter @cm/api start                         # API   :8787
pnpm --filter @cm/web dev                                     # Web   :5173 (/api→8787)
CM_DB=$DB uv run --directory apps/worker cm-worker            # ジョブワーカー（常駐）
CM_DB=$DB uv run --directory apps/worker cm-search            # 意味検索 :8788
```
スマホ等からは `http://<箱のIP>:5173`。WSL2 mirrored の場合、Windows の Hyper‑V ファイア
ウォールで 5173/8787 の inbound 許可が必要（`allow-creative-manager.cmd` 同梱）。

MCP：`.mcp.json` 同梱。Claude Code でこのリポジトリを開けば `creative-manager` ツールが使える。

## テスト
```sh
pnpm -r test                            # TS（api + web）
uv run --directory apps/worker pytest   # Python worker
```

## 設計の芯
- すべては「ネタ」＝再帰的に入れ子（DAG）。tempo/拍子/調は section/song が所有、音楽要素は **C基準保存＋トランスポーズ**。
- 生成は単一ツールに固定せず `claude -p` を起点（Stage1）。意味検索はブルートフォース cosine（規模的に十分）。
- 詳細・未決事項は `docs/`。
