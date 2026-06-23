#!/usr/bin/env bash
# systemd --user ユニットを導入して有効化（常駐機向け・自動再起動＋起動順＋日次バックアップ）。
# 使い方: bash deploy/systemd/install.sh
# 前提: pnpm/uv/node が**ログインシェルの PATH**で引けること（ユニットは bash -lc 起動）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.config/systemd/user"
mkdir -p "$DEST"

# 既存の手起動(start-all.sh の nohup プロセス)が居たら止める（systemd と二重に動かさない）。
pkill -f "pnpm --filter @cm/api (dev|start)" 2>/dev/null || true
pkill -f "bin/cm-worker" 2>/dev/null || true
pkill -f "bin/cm-search" 2>/dev/null || true
pkill -f "bin/cm-music-mcp" 2>/dev/null || true

cp "$HERE"/cm-*.service "$HERE"/cm-*.timer "$DEST"/
echo "→ ユニットを $DEST に配置"

# 環境ファイルが無ければ雛形を置く（CM_HOST/CM_TOKEN を編集）。
if [ ! -f "$HOME/.config/creative-manager.env" ]; then
  cp "$HERE/creative-manager.env.example" "$HOME/.config/creative-manager.env"
  echo "→ ~/.config/creative-manager.env を作成（CM_HOST 等を編集してください）"
fi

systemctl --user daemon-reload
systemctl --user enable --now cm-api.service cm-search.service cm-music-mcp.service cm-worker.service
systemctl --user enable --now cm-backup.timer
# 再起動後も動かす（ログインしてなくても常駐）。一度だけ。
loginctl enable-linger "$USER" 2>/dev/null || echo "  (linger 設定は権限次第。sudo loginctl enable-linger $USER が要るかも)"

echo "完了。状態確認: systemctl --user status cm-api / ログ: journalctl --user -u cm-api -f"
