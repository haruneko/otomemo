#!/usr/bin/env bash
# py-parity（M6a-6d）＝handmodel.py（手の物理モデル）の参照値を焼き直す。stdlib のみ＝同じ venv で足りる。
# 実行後 `git diff tools/py-parity/cases-handmodel` が空なら、こちらの参照値は源流と同じまま。
set -euo pipefail
VENV_PY="$HOME/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV_PY" "$HERE/dump_handmodel.py" "$@"
