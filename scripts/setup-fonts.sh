#!/usr/bin/env bash
# Playwright のスクショで日本語を出すための CJK フォント導入（sudo不要）。
# apt の .deb をダウンロードして展開し、~/.fonts に置くだけ（システムには入れない）。
set -euo pipefail

if fc-list 2>/dev/null | grep -qi "noto sans cjk"; then
  echo "CJK font already present."
  exit 0
fi

tmp="$(mktemp -d)"
cd "$tmp"
apt-get download fonts-noto-cjk
deb="$(ls fonts-noto-cjk*.deb | head -1)"
dpkg-deb -x "$deb" ./x
mkdir -p "$HOME/.fonts"
find ./x -name "NotoSansCJK-Regular.ttc" -exec cp {} "$HOME/.fonts/" \;
fc-cache -f >/dev/null 2>&1
cd - >/dev/null
rm -rf "$tmp"
echo "installed NotoSansCJK-Regular.ttc into ~/.fonts"
