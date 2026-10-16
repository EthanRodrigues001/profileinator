#!/bin/sh
# Profileinator installer for macOS and Linux: downloads the latest release to ~/.profileinator,
# connects it to Claude Code (skill + MCP) and opens the dashboard.
#   curl -fsSL https://raw.githubusercontent.com/EthanRodrigues001/profileinator/main/install.sh | sh
set -e
REPO="EthanRodrigues001/profileinator"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) NAME=macos-arm64 ;;
  Linux-x86_64) NAME=linux-x64 ;;
  *) echo "No prebuilt binary for $(uname -s) $(uname -m). Build from source: see CONTRIBUTING.md"; exit 1 ;;
esac
DEST="$HOME/.profileinator"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep browser_download_url | grep "$NAME" | head -1 | cut -d '"' -f 4)
[ -n "$URL" ] || { echo "No $NAME build in the latest release"; exit 1; }
rm -rf "$DEST" && mkdir -p "$DEST"
curl -fsSL "$URL" | tar xz -C "$DEST" --strip-components=1
"$DEST/hq" setup
echo "Installed to $DEST. Opening the dashboard (run '$DEST/hq ui' any time)."
exec "$DEST/hq" ui
