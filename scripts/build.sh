#!/bin/bash
# Builds the shareable package: dist/CityBucks.zip
# Inside: "City Bucks/" with the game, a how-to-play file and the license.
# Friends unzip and double-click index.html — works offline, any OS, no install.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
PKG="$DIST/City Bucks"

rm -rf "$DIST"
mkdir -p "$PKG"

cp -R "$ROOT/game/." "$PKG/"
cp "$ROOT/LICENSE" "$PKG/LICENSE.txt"
cp "$ROOT/share/COMO-JUGAR.txt" "$PKG/COMO-JUGAR.txt"
find "$PKG" -name '.DS_Store' -delete

(cd "$DIST" && zip -qr -X "CityBucks.zip" "City Bucks")

echo "OK: $DIST/CityBucks.zip ($(du -h "$DIST/CityBucks.zip" | cut -f1))"
