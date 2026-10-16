# City Bucks — revival

Revival of **City Bucks** (Philipp Lenssen, 2010), a 2-player same-screen city-building game for the original iPad, so it runs in modern browsers on a Mac and can be shared. The person driving this project played it as a kid; the creator handed over the repo and permission to use it. Talk to the user in Rioplatense Spanish.

## Where the game came from

- `upstream/` — clone of github.com/JPhilipp/VersusPad (`CityBucksForTwo/`). **Early 0.9 prototype, not the shipped game**: no building placement (`// todo`), no citizens, missing art. Reference only. Not versioned (ignored).
- `ipa/` — the shipped **App Store v1.0** IPA, preserved on archive.org (`ios-ipa-com.outer-court.city-bucks`, md5 `494fa861c8131db73e943674d0dcfecc`). PhoneGap app, so `Payload/city-bucks.app/www/` is plain HTML/CSS/JS + assets. Never execute the iOS binary in there. Not versioned (ignored).
- `game/` — **the playable game**: the untouched v1.0 `www` folder (first commit `e66205b`) plus our compat files.

## Architecture

- Pure DOM game, no engine: absolutely positioned `div`s with CSS background sprites, game loop on `setInterval`. Fixed board **768×1024** (iPad portrait). Player 0 = top (UI rotated 180°), player 1 = bottom.
- `game/all-compressed.js` — the entire game, **compiled with Google Closure Compiler (advanced mode)**: property names are mangled (`Enum={Ta:701,...}`, app object is `C`). Only `window.g_*` functions keep their names (`g_init`, `g_dragStart/Move/End`, `g_clickedPause`, `g_clickedRestart`, `g_clickedInfo`, `g_eventDialogPickedChoice`, `g_newsDialog`…). Readable prototype source in `upstream/CityBucksForTwo/*.js` helps decode it (same structure, earlier version).
- Input: the game sets **inline attribute handlers** (`ontouchstart="g_dragStart(event,1,3)"`). Drag: `g_dragMove` stores `targetTouches[0].pageX/Y` in `C.pa[player]`; `g_dragEnd` places the building at that last position.
- Device detection: `navigator.userAgent.match(/iPad/i)==null` → "local test" (desktop) mode, which uses `onclick` + 2010 HTML5 drag events (broken today) and `new Audio`. iPad mode uses touch handlers + PhoneGap `Media`.
- Assets: `image/sprite/**` (260 sprites: buildings, humans, staff, overlays), `image/sprite-button/` (bar buttons, `-upper`/`-lower`), `image/background/1-4.jpg` (random map per game), `sound/*.mp3` (34).
- `localStorage` keys `dialog_*` / `newsBlacklist`: only used for the old news/cross-promo dialog.

## Compat layer (our code — the only code we write)

`game/compat.js` loads **before** `all-compressed.js`; `game/compat.css` frames the board. Original game files stay untouched.

1. Forces iPad mode (appends "iPad" to `navigator.userAgent`).
2. `window.Media` re-implemented with Web Audio (fetch + decode; falls back to `<audio>` on `file://`). Unlocks audio on first pointer down.
3. Pointer Events (mouse/trackpad/touch/pen, multi-pointer) → the element's inline `ontouch*` handler with a fake TouchEvent (`targetTouches`, `changedTouches`). Native touch events are swallowed in capture phase so there's a single input path.
4. Scales `body` with a CSS transform to fit the window; pointer coords are mapped back to board space (`CityBucksCompat.view`).
5. Offline: the XHR to `http://file.versuspad.com/news.txt` is answered with an empty `data:` URL.
6. Sound fixes: `fire-small` → `firesmall.mp3` (original typo); `theme.mp3` was never shipped → silently skipped.
7. Smoothness: intercepts `setInterval` — logic (`C.Lc`=210 ms) runs, then render (`C.ad`, normally 270 ms on its own timer) runs right after, with `C.se` (sprites refreshed per frame, originally 30 round-robin) raised so every sprite updates each tick. `compat.css` glides `[class*=_x][class*=_y]` sprites with a 0.21 s transition; jumps > 48 px snap.
8. Original bug fixed: `g_reInit` (Restart) never cleared the logic interval, so each restart added one (2×, 3× speed). Only one logic interval is kept.
9. Hooks for online mode: board-space pointer pipeline `pointer(type,id,x,y)`; `CityBucksCompat.{setRotated, setInputSink, injectPointer, canUse, onRender, onSound, toBoard}`. Elements with `data-cb-ui` (our UI, appended to `<html>`, not `<body>`) are ignored by the input layer.

`index.html` no longer loads PhoneGap (`phonegap*.js` deleted). Added `icon.png` (converted from Apple CgBI PNG with `sips`) and `manifest.webmanifest`.

## Online 1v1 (`game/online.html`, `online.js`, `online.css`)

- **Host/mirror model** (chosen over lockstep: the game uses `Math.random` in logic *and* render and mixes DOM work into logic, so deterministic lockstep would desync). Host runs the game and is the **bottom** player (1). A `MutationObserver` on `<body>` sends ops: `a` add (serialized subtree), `r` remove, `t` attribute, `p` left/top only, `h` replace children; `snap` = full snapshot. Element ids via `WeakMap`. Sounds forwarded as `{t:'s'}`.
- Guest does **not** load `all-compressed.js`; rebuilds the DOM with a tag/attribute whitelist (no `on*`, `href` only http/https/mailto), view rotated 180° so its bar (player 0) is at the bottom. Input → `{t:'in',k,id,x,y}` in board coords (moves coalesced per animation frame). Host injects as `remote-<id>`; `canUse` blocks each side from the other's buttons and event dialogs (`ontouchstart` `g_drag*(event,P,…)`, `#eventDialogPlayerP`).
- Transport: PeerJS 1.5.4 vendored in `game/vendor/` (MIT), free public PeerJS server for signaling, Google STUN; data over WebRTC. Peer id `citybucks-v1-<CODE>` (5 chars). JSON channel max ~16 KB → messages > 12 KB are chunked (`{t:'chunk'}`).
- Heartbeat every 2 s, 8 s timeout both ways (closing a tab often never fires `close`). Reconnecting guest gets a snapshot; only the first connection restarts the game.
- Host tab must stay visible (background tabs throttle timers → game slows for both).
- Not yet done: TURN relay for strict NATs (corporate/university networks). If a friend can't connect, add a free TURN (e.g. Cloudflare) to the `Peer` config.
- Test locally with two browser-pane tabs: host `online.html` → "Crear partida", guest `online.html#join=CODE`.

## Commands

- Run (dev): `scripts/serve.sh` → http://localhost:8770 (also `.claude/launch.json` → `citybucks`). Opening `game/index.html` directly (`file://`) works too.
- Shareable zip: `scripts/build.sh` → `dist/CityBucks.zip` (folder "City Bucks" + `COMO-JUGAR.txt` + `LICENSE.txt`).
- Publish website: `scripts/publish.sh` → pushes `main` and `game/` (as branch `gh-pages`) to github.com/salbertal/citybucks → **https://salbertal.github.io/citybucks/** (online: `/online.html`).
- Mac app: `scripts/make-mac-app.sh [dest]` → `City Bucks.app` (AppleScript launcher, game bundled in `Contents/Resources/game`, opens in Chrome `--app` window or default browser; ad-hoc signed — fine on the machine that built it, **not** for distribution: other Macs would get Gatekeeper warnings). osacompile adds `Assets.car` + `CFBundleIconName` with the generic script icon, which macOS prefers — the script deletes both so `applet.icns` (the game icon) shows.
- Skills in `.claude/skills/`: `run-game`, `build-share`, `debug-assets`, `decode-game-code`.

## Distribution decisions

- Friends get the **zip** (or a web link). HTML files aren't Gatekeeper-checked → no signing/notarization needed.
- A distributable native `.app` would need the Apple Developer Program (USD 99/yr) for signing + notarization; skipped on purpose.
- Published on GitHub Pages (user approved, public repo salbertal/citybucks). Playable on iPads again. Republish after changes with `scripts/publish.sh` (outward-facing: only when the user wants the site updated).

## Gotchas found

- Preview screenshots can be taken before sprites load — re-screenshot before concluding something is missing.
- The browser pane resizes; always re-read coordinates from a fresh screenshot before dragging.
- Win condition: first to $50,000,000. Starting money $1,000,000. In the clock function, after 15 minutes `C.vb` goes 1.5M → 3M (meaning not decoded yet); there is also a timed-end path (`C.cc` flag, `C.Cd` minutes).
- PeerJS: "Message too big for JSON channel" = a message > ~16 KB; keep using `send()` (chunks) on the host.
- macOS `qlmanage` can hang; to check an app icon export it with NSWorkspace via `osascript -l JavaScript`.
- License: GPL v2 (from upstream repo). Keep `LICENSE` and creator credits.
