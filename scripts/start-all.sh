#!/usr/bin/env bash
# 常時起動機向け：API(watch)・Web・ワーカー・検索をまとめて起動（#36 自動起動）。
# 使い方の例：
#   - WSL の ~/.profile か crontab の @reboot から `bash scripts/start-all.sh`
#   - もしくは systemd --user（下のユニット例参照）
#
# 公開制御：CM_TOKEN を設定すると API に x-cm-token 必須の簡易認証がかかる。
#   例) CM_TOKEN=xxxx bash scripts/start-all.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export CM_DB="${CM_DB:-$ROOT/data/cm.sqlite}"
mkdir -p "$ROOT/logs"

# Node 側（pnpm filter で各 app の dev=watch を起動）
nohup pnpm --filter @cm/api dev >"$ROOT/logs/api.log" 2>&1 &
nohup pnpm --filter @cm/web dev >"$ROOT/logs/web.log" 2>&1 &

# Python 側（uv。ある場合のみ・失敗は無視）
( cd apps/worker && nohup uv run cm-worker >"$ROOT/logs/worker.log" 2>&1 & ) || true
( cd apps/worker && nohup uv run cm-search >"$ROOT/logs/search.log" 2>&1 & ) || true

echo "started api/web (+worker/search best-effort). db=$CM_DB  logs=$ROOT/logs"

# --- systemd --user ユニット例（~/.config/systemd/user/creative-manager.service）---
# [Unit]
# Description=creative_manager
# [Service]
# Type=oneshot
# RemainAfterExit=yes
# WorkingDirectory=%h/projects/creative_manager
# ExecStart=/usr/bin/env bash scripts/start-all.sh
# [Install]
# WantedBy=default.target
#   有効化: systemctl --user enable --now creative-manager ; loginctl enable-linger $USER
