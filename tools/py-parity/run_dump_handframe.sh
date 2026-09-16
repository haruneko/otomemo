#!/usr/bin/env bash
# py-parity＝handframe.py（ピアノ伴奏の生成器本体）の参照値を焼き直す。handframe_band の import 連鎖に numpy/networkx が要る＝phrase_maker 直下の venv。
# 実行後 `git diff tools/py-parity/cases-handframe` が空なら、参照値は源流と同じまま。
set -euo pipefail
VENV_PY="$HOME/projects/phrase_maker/.venv/bin/python"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV_PY" "$HERE/dump_handframe.py" "$@"
