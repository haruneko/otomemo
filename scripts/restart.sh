#!/usr/bin/env bash
# creative_manager 再起動コマンド（systemd 世代・2026-07-14）
#
# 使い方（ターミナル or Claude Code の「! 」プレフィックスで）：
#   bash scripts/restart.sh            … api 再起動のみ（コード未変更のとき・最速）
#   bash scripts/restart.sh --build    … web dist を焼いてから api 再起動（**UI/コードを変えたときはこれ**）
#   bash scripts/restart.sh --search   … cm-search(意味検索)も再起動 ※インデックス再構築 ~10分・その間検索は無応答
#   bash scripts/restart.sh --status   … 状態確認のみ（何も再起動しない）
#
# やること：①8787 の孤児掃除（systemd 外のリスナー・旧 start-all.sh の tsx watch 残骸＝EADDRINUSE の真因）
#          ②（--build 時）pnpm --filter @cm/web build ③systemctl --user restart cm-api ④疎通確認(/health)
# 前提：cm-api.service / cm-search.service（~/.config/systemd/user/）。旧 scripts/start-all.sh は使わない。
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="$(grep -oP '^CM_HOST=\K.*' ~/.config/creative-manager.env 2>/dev/null || true)"
HOST="${CM_HOST:-${HOST:-127.0.0.1}}"
BASE="http://${HOST}:8787"

say() { printf '%s\n' "$*"; }

status() {
  say "── systemd:"
  systemctl --user is-active cm-api.service cm-search.service 2>/dev/null | paste <(echo -e "cm-api\ncm-search") - || true
  say "── :8787 リスナー:"
  ss -tlnp 2>/dev/null | grep 8787 || say "(なし)"
  say "── /health:"
  curl -s -m 5 "${BASE}/health" || say "(不通)"
  echo
}

cleanup_orphans() {
  local main_pid; main_pid="$(systemctl --user show -p MainPID --value cm-api.service 2>/dev/null || echo 0)"
  # 旧 start-all.sh 由来の tsx watch（自動再spawnする親）を先に落とす
  pgrep -f 'tsx.*watch src/main\.ts' | while read -r pid; do
    say "孤児: tsx watch (pid=$pid) を停止"; kill "$pid" 2>/dev/null || true
  done
  sleep 1
  # 8787 を握る systemd 外のリスナーを落とす（unit の子孫かは親を遡って判定＝雑にしない）
  for pid in $(ss -tlnp 2>/dev/null | grep ':8787 ' | grep -oP 'pid=\K[0-9]+' | sort -u); do
    local p="$pid" own=0
    while [ "$p" -gt 1 ] 2>/dev/null; do
      [ "$p" = "$main_pid" ] && own=1 && break
      p="$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ' || echo 1)"; [ -z "$p" ] && break
    done
    if [ "$own" = 0 ]; then say "孤児: :8787 リスナー (pid=$pid) を停止"; kill "$pid" 2>/dev/null || true; fi
  done
  sleep 1
}

wait_health() {
  for _ in $(seq 1 15); do
    if curl -s -m 3 -o /dev/null -w '%{http_code}' "${BASE}/" | grep -q 200; then
      say "✅ api 応答OK: ${BASE}"
      curl -s -m 5 "${BASE}/health"; echo
      return 0
    fi
    sleep 2
  done
  say "❌ api が起動しない。ログ: journalctl --user -u cm-api.service -n 30"
  return 1
}

case "${1:-}" in
  --status) status; exit 0 ;;
  --build)
    say "🔨 web dist を焼く…"
    (cd "$ROOT" && pnpm --filter @cm/web build) || { say "❌ build 失敗"; exit 1; }
    ;;
  --search)
    say "🔁 cm-search 再起動（インデックス再構築 ~10分・完了まで検索は無応答）"
    systemctl --user restart cm-search.service
    ;;
  "" ) ;;
  * ) say "usage: restart.sh [--build|--search|--status]"; exit 2 ;;
esac

cleanup_orphans
say "🔁 cm-api 再起動…"
systemctl --user restart cm-api.service
wait_health
say "（ブラウザ側は再読み込みを。--build した場合は特に）"
