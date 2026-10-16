#!/bin/bash
# Builds "City Bucks.app": a small launcher with the game bundled inside.
# Opens the game in its own window (Chrome --app mode if Chrome is installed,
# otherwise the default browser). Built locally, so macOS does not block it.
#
# Usage: scripts/make-mac-app.sh [destination folder]   (default: dist/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-$ROOT/dist}"
APP="$DEST/City Bucks.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$DEST"
rm -rf "$APP"

cat > "$WORK/launcher.applescript" <<'EOF'
set gamePath to (POSIX path of (path to me)) & "Contents/Resources/game/index.html"
set gameURL to "file://" & gamePath
set chromeApp to "/Applications/Google Chrome.app"
tell application "System Events" to set hasChrome to exists disk item chromeApp
if hasChrome then
    do shell script "open -na " & quoted form of chromeApp & " --args --app=" & quoted form of gameURL & " --window-size=800,1000"
else
    do shell script "open " & quoted form of gamePath
end if
EOF

osacompile -o "$APP" "$WORK/launcher.applescript"

# Bundle the game
cp -R "$ROOT/game" "$APP/Contents/Resources/game"
find "$APP" -name '.DS_Store' -delete

# Icon: game/icon.png -> applet.icns
ICONSET="$WORK/icon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
    sips -z $s $s "$ROOT/game/icon.png" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
    d=$((s * 2))
    [ $d -le 512 ] && sips -z $d $d "$ROOT/game/icon.png" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/applet.icns"
# osacompile also ships an asset catalog with the generic script icon; macOS
# prefers it (CFBundleIconName) over applet.icns, so drop it.
rm -f "$APP/Contents/Resources/Assets.car"
/usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$APP/Contents/Info.plist" 2>/dev/null || true

/usr/libexec/PlistBuddy -c "Set :CFBundleName City Bucks" "$APP/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.citybucks.revival" "$APP/Contents/Info.plist" 2>/dev/null || true
touch "$APP"

# Adding the game invalidated osacompile's signature; re-sign ad hoc (local use).
codesign --force --deep --sign - "$APP" 2>/dev/null
codesign --verify --deep "$APP"

echo "OK: $APP"
