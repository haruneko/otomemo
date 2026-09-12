#!/usr/bin/env bash
# RNG spike の参照値を焼き直す。実行後 `git diff tools/py-parity/cases-rng-spike` が空なら源流と同じまま。
set -euo pipefail
VENV_PY="$HOME/projects/phrase_maker/experiments/bass_rock_riff/.venv/bin/python"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$VENV_PY" "$HERE/dump_rng_spike.py" "$@"
