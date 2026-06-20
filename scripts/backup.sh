#!/usr/bin/env bash
# SQLite を世代バックアップ（SPEC「データ消えない」。cron で定期実行する想定）。
# sqlite3 の backup API で実行中でも一貫したコピーを取る（WAL対応）。CLIは使わずPython stdlibで実施。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="${CM_DB:-$HERE/../data/cm.sqlite}"
DIR="$(dirname "$DB")/backups"
KEEP="${CM_BACKUP_KEEP:-14}"

mkdir -p "$DIR"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/cm-$TS.sqlite"

python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
src.close(); dst.close()
PY

# 新しい順に KEEP 個だけ残す
ls -1t "$DIR"/cm-*.sqlite | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "backup: $OUT (keep $KEEP)"
