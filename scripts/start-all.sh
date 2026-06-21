#!/usr/bin/env bash
# 常時起動機向け：API(watch)・Web・ワーカー・検索・cm-music-mcp をまとめて起動（#36 自動起動）。
# **再実行で安全**＝先に既存を落としてから上げる（野良プロセス乱立を防ぐ idempotent 起動）。
# 使い方の例：
#   - WSL の ~/.profile か crontab の @reboot から `bash scripts/start-all.sh`
#   - もしくは systemd --user（下のユニット例参照）
#
# 環境変数（任意・上書き可）：
#   CM_DB      … SQLite パス（既定 data/cm.sqlite）
#   CM_HOST    … API バインド先。tailnet/LAN から届かせるなら **Tailscale IP** か 0.0.0.0（既定 127.0.0.1=ローカルのみ）
#   CM_TOKEN   … 設定すると API に x-cm-token 必須の簡易認証（tailnet 限定なら通常不要）
#   CM_MUSIC_MCP_URL/PORT … agentic Chat 用 cm-music-mcp の URL/ポート（既定 8790・worker に配線）
#   CM_MCP_STDIO_CMD/ARGS … agentic Chat の既存ネタ読取(creative-manager MCP)を claude -p が stdio spawn する起動コマンド/引数（#102 S1・既定 pnpm --filter @cm/api mcp）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CM_DB="${CM_DB:-$ROOT/data/cm.sqlite}"
export CM_HOST="${CM_HOST:-127.0.0.1}"
export CM_MUSIC_MCP_PORT="${CM_MUSIC_MCP_PORT:-8790}"
# cm-music-mcp の URL（worker はこれを見て agentic Chat で音楽ツールを使う。未起動なら dispatch にフォールバック）
export CM_MUSIC_MCP_URL="${CM_MUSIC_MCP_URL:-http://127.0.0.1:${CM_MUSIC_MCP_PORT}/mcp}"
# #102 S1 creative-manager MCP（既存ネタの読取面）。cold-start 無し＝常駐させず claude -p が stdio で spawn。
# read-only のみ公開（書込ツールは worker 側 _NETA_READ_TOOLS で除外＝Claude に書込口なし）。CM_DB は環境継承で本番DBを指す。
export CM_MCP_STDIO_CMD="${CM_MCP_STDIO_CMD:-pnpm}"
export CM_MCP_STDIO_ARGS="${CM_MCP_STDIO_ARGS:-[\"--filter\",\"@cm/api\",\"mcp\"]}"
mkdir -p "$ROOT/logs"

# 二重起動防止：既存の自分のプロセスだけ落としてから上げる（再実行で重複しない）。
pkill -f "tsx.*src/main.ts"   2>/dev/null || true  # api
pkill -f "bin/cm-worker"      2>/dev/null || true  # worker
pkill -f "bin/cm-search"      2>/dev/null || true  # search
pkill -f "bin/cm-music-mcp"   2>/dev/null || true  # music-mcp
sleep 1

# Node 側（pnpm filter で各 app の dev=watch を起動）
nohup pnpm --filter @cm/api dev >"$ROOT/logs/api.log" 2>&1 &
nohup pnpm --filter @cm/web dev >"$ROOT/logs/web.log" 2>&1 &

# Python 側（uv。ある場合のみ・失敗は無視）。cm-music-mcp は worker より先に上げておく。
( cd apps/worker && nohup uv run cm-music-mcp >"$ROOT/logs/music-mcp.log" 2>&1 & ) || true
( cd apps/worker && nohup uv run cm-worker    >"$ROOT/logs/worker.log"    2>&1 & ) || true
( cd apps/worker && nohup uv run cm-search    >"$ROOT/logs/search.log"    2>&1 & ) || true

echo "started api/web/worker/search/music-mcp."
echo "  db=$CM_DB  host=$CM_HOST  mcp=$CM_MUSIC_MCP_URL  logs=$ROOT/logs"

# --- systemd --user ユニット例（~/.config/systemd/user/creative-manager.service）---
# [Unit]
# Description=creative_manager
# [Service]
# Type=oneshot
# RemainAfterExit=yes
# Environment=CM_HOST=100.x.x.x   # ← 自分の Tailscale IP（出先から届かせる）
# WorkingDirectory=%h/projects/creative_manager
# ExecStart=/usr/bin/env bash scripts/start-all.sh
# [Install]
# WantedBy=default.target
#   有効化: systemctl --user enable --now creative-manager ; loginctl enable-linger $USER
