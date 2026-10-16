---
name: build-share
description: Build the shareable City Bucks packages — the zip for friends (dist/CityBucks.zip) and the Mac launcher app (City Bucks.app) — and verify them. Use when asked to package, export, share, send to friends, make a release, or rebuild the Mac app.
---

# Build City Bucks for sharing

1. Make sure the game runs (see the `run-game` skill) and the tree is committed.
2. `scripts/build.sh` → `dist/CityBucks.zip`, containing `City Bucks/` (game + `COMO-JUGAR.txt` + `LICENSE.txt`).
3. `scripts/make-mac-app.sh [dest]` → `City Bucks.app` (default `dist/`). For the user's own Mac,
   install with `scripts/make-mac-app.sh ~/Applications` or copy it to /Applications.
4. Verify:
   - `unzip -l dist/CityBucks.zip | grep -E "index.html|compat.js|COMO-JUGAR|LICENSE"`
   - file:// load in headless Chrome renders the buttons (expect 44):
     ```bash
     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
       --user-data-dir="$TMPDIR/cb-chrome" --virtual-time-budget=4000 \
       --dump-dom "file://$PWD/dist/City%20Bucks/index.html" | grep -o 'class="spriteButton"' | wc -l
     ```
   - `codesign --verify --deep "dist/City Bucks.app"`
5. `dist/` is git-ignored; never commit build output.

## Rules

- The `.app` is ad-hoc signed: fine on the Mac that built it, but other Macs get Gatekeeper
  warnings. Give friends the zip (or a web link), not the app. A distributable app needs the
  Apple Developer Program (USD 99/yr) for signing + notarization — only if the user asks.
- Publishing to the web (GitHub Pages, Netlify, itch.io) is outward-facing: get the user's OK
  first. The game is fully static: publish the contents of `game/` as the site root.
- Keep `LICENSE` (GPL v2) and the creator credits in every package.
