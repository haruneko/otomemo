#!/usr/bin/env bash
# py-parity（M6a-6a）＝鍵盤の隙間刺し（legacy rock_piano sheet 分岐＋gesture_p11 build_rock）の参照値を焼き直す。
# 実行後 `git diff tools/py-parity/cases-key-stab` が空なら、こちらの参照値は源流と同じまま。
set -euo pipefail
VENV_PY="$HOME/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV_PY" "$HERE/dump_key_stab.py" "$@"
