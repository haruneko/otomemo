#!/usr/bin/env bash
# py-parity の参照値を焼き直す（M3-3g）。venv は計画 §11-2 で指名されたもの。
# 実行後 `git diff tools/py-parity/cases` が空なら、こちらの参照値は源流と同じまま。
set -euo pipefail
VENV_PY="$HOME/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV_PY" "$HERE/dump_bass_anchor_lock.py" "$@"
