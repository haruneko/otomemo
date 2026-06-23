#!/usr/bin/env bash
# 常時起動機向け：API(watch)・Web・ワーカー・検索をまとめて起動（#36 自動起動）。cm-music-mcp はS2で廃止(音楽はTS集約)。
# **再実行で安全**＝先に既存を落としてから上げる（野良プロセス乱立を防ぐ idempotent 起動）。
#
# 使い方（再起動はこの2種類。どちらも冪等＝何回叩いても重複しない）：
#   bash scripts/start-all.sh           … リビルド無し＝速い再起動（コード未変更のとき）
#   bash scripts/start-all.sh --build   … web を再ビルドしてから再起動（コードを変えたとき／Tailscale配信に反映）
#     ※ Tailscale 経由で見えるのは web の **ビルド済み(dist)** なので、変更を出先に出すなら --build。
#   - WSL の ~/.profile か crontab の @reboot から呼ぶ／systemd --user（下のユニット例）でもOK。
#
# CM_HOST は **Tailscale IP を自動検出**して既定にする（出先から届く・tailnet限定）。
# 検出できなければ 127.0.0.1（ローカルのみ）。env で明示すればそれを優先（例 CM_HOST=0.0.0.0 でLAN開放）。
#
# 環境変数（任意・上書き可）：
#   CM_DB      … SQLite パス（既定 data/cm.sqlite）
#   CM_HOST    … API バインド先（既定＝検出した Tailscale IP or 127.0.0.1）
#   CM_TOKEN   … 設定すると API に x-cm-token 必須の簡易認証（tailnet 限定なら通常不要）
#   CM_MCP_STDIO_CMD/ARGS … agentic Chat の既存ネタ読取(creative-manager MCP)を claude -p が stdio spawn する起動コマンド/引数（#102 S1・既定 pnpm --filter @cm/api mcp）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --build フラグ：web を先に再ビルド（失敗したら set -e で中断＝現行サーバは落とさない）。
DO_BUILD=0
for arg in "$@"; do
  [ "$arg" = "--build" ] && DO_BUILD=1
done
if [ "$DO_BUILD" = 1 ]; then
  echo "rebuilding web (dist)…"
  pnpm --filter @cm/web build
fi

# Tailscale IP 自動検出（tailnet CGNAT 100.64.0.0/10 のアドレス）。無ければローカルのみ。
_TS_IP="$(ip -4 -o addr 2>/dev/null | grep -oE '100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]+\.[0-9]+' | head -1 || true)"
export CM_DB="${CM_DB:-$ROOT/data/cm.sqlite}"
export CM_HOST="${CM_HOST:-${_TS_IP:-127.0.0.1}}"
# #102 S1 creative-manager MCP（既存ネタの読取面）。cold-start 無し＝常駐させず claude -p が stdio で spawn。
# read-only のみ公開（書込ツールは worker 側 _NETA_READ_TOOLS で除外＝Claude に書込口なし）。CM_DB は環境継承で本番DBを指す。
export CM_MCP_STDIO_CMD="${CM_MCP_STDIO_CMD:-pnpm}"
export CM_MCP_STDIO_ARGS="${CM_MCP_STDIO_ARGS:-[\"--filter\",\"@cm/api\",\"mcp\"]}"
mkdir -p "$ROOT/logs"

# 二重起動防止：既存の自分のプロセスだけ落としてから上げる（再実行で重複しない）。
pkill -f "tsx.*src/main.ts"   2>/dev/null || true  # api
pkill -f "@cm/web dev"        2>/dev/null || true  # web(vite dev)＝以前 kill 漏れで野良が積み上がっていた
pkill -f "apps/web.*vite"     2>/dev/null || true  # 上の pnpm が spawn する vite 子も落とす（孤児防止）
pkill -f "bin/cm-worker"      2>/dev/null || true  # worker
pkill -f "bin/cm-search"      2>/dev/null || true  # search
sleep 1

# Node 側（pnpm filter で各 app の dev=watch を起動）
nohup pnpm --filter @cm/api dev >"$ROOT/logs/api.log" 2>&1 &
nohup pnpm --filter @cm/web dev >"$ROOT/logs/web.log" 2>&1 &

# Python 側（uv。ある場合のみ・失敗は無視）。
( cd apps/worker && nohup uv run cm-worker    >"$ROOT/logs/worker.log"    2>&1 & ) || true
( cd apps/worker && nohup uv run cm-search    >"$ROOT/logs/search.log"    2>&1 & ) || true

echo "started api/web/worker/search.$([ "$DO_BUILD" = 1 ] && echo ' (web rebuilt)')"
echo "  db=$CM_DB  host=$CM_HOST  logs=$ROOT/logs"
echo "  → アクセス: http://$CM_HOST:8787/  （単一オリジン＝api が web も配信）"

# --- 疎通スモーク：上がったつもりで上がってない状態を検知（docs/design アーキ是正 決定4）---
# api(:8787) は必須＝listen 待ち、ダメなら非0終了。search は best-effort 警告（後退ゼロ）。
wait_http() { # url, name, secs : HTTP で 2xx を待つ（実際に応答することを確認）
  local u="$1" n="$2" t="${3:-30}" i=0
  while [ "$i" -lt "$t" ]; do
    if curl -sf -o /dev/null "$u" 2>/dev/null; then echo "  ✓ $n"; return 0; fi
    sleep 1; i=$((i+1))
  done
  echo "  ✗ $n が ${t}s で応答せず ($u) — logs/ を確認"; return 1
}
wait_port() { # host, port, name, secs : TCP listen を待つ（MCP等 GET で2xxを返さない物用）
  local h="$1" p="$2" n="$3" t="${4:-20}" i=0
  while [ "$i" -lt "$t" ]; do
    if (exec 3<>"/dev/tcp/$h/$p") 2>/dev/null; then exec 3>&- 3<&-; echo "  ✓ $n"; return 0; fi
    sleep 1; i=$((i+1))
  done
  echo "  ✗ $n が ${t}s で listen せず — logs/ を確認"; return 1
}
# api は CM_HOST(既定=Tailscale IP)にバインド＝そのホストで叩く(127.0.0.1は拒否される)。
wait_http "http://${CM_HOST}:8787/facets" "api(:8787 @${CM_HOST})" 45 || { echo "起動失敗: api が応答しません"; exit 1; }
wait_port 127.0.0.1 8788 "cm-search(:8788)" 20 || echo "  (cm-search 未listen=意味検索は LIKE 退避・後退ゼロ)"

# --- 常駐運用は systemd --user を推奨（自動再起動＋起動順＋日次バックアップ＋journaldログ）---
#   導入: bash deploy/systemd/install.sh
#   この start-all.sh は開発・手起動用（systemd と二重起動しないこと）。
