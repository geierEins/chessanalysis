#!/bin/sh
# Renders icons/app/logo.svg into every PNG size the manifest / favicons /
# apple-touch-icon need, via headless Microsoft Edge (no image tools needed).
# Usage, from the repo root: sh scripts/render-app-icons.sh
set -e

edge="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
[ -f "$edge" ] || edge="/c/Program Files/Microsoft/Edge/Application/msedge.exe"

# Git Bash on Windows: Edge needs Windows-style (C:/...) paths.
root="$(cygpath -m "$(cd "$(dirname "$0")/.." && pwd)")"
tmp="$(cygpath -m "$(mktemp -d)")"
trap 'rm -rf "$tmp"' EXIT

render() { # size outfile
  # The SVG inlined as an <img> at exactly the target size, so Edge (not a
  # later downscale) does the anti-aliasing for small sizes like 16x16.
  cat > "$tmp/page.html" <<EOF
<!doctype html><body style="margin:0"><img src="file:///$root/icons/app/logo.svg" width="$1" height="$1" style="display:block"></body>
EOF
  "$edge" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$1,$1" --screenshot="$root/icons/app/$2" "file:///$tmp/page.html" >/dev/null 2>&1
  echo "icons/app/$2 (${1}x$1)"
}

render 512 icon-512.png
render 192 icon-192.png
render 180 apple-touch-icon.png
render 32 favicon-32.png
render 16 favicon-16.png
