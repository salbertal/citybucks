---
name: run-game
description: Run City Bucks locally and check it works in the browser pane — start the server, open the game, drag a building, read console and network errors. Use when asked to run, play, test or screenshot the game, or after changing game/compat.js, compat.css or index.html.
---

# Run City Bucks

1. Start the server in the background: `scripts/serve.sh` (port 8770, serves `game/`).
   If the preview tool finds `.claude/launch.json`, `preview_start` with name `citybucks` does the same.
2. Open `http://localhost:8770/index.html` in the browser pane (`preview_start` with `url`).
3. Sanity checks (`javascript_tool`):
   ```js
   ({ ipadMode: /iPad/.test(navigator.userAgent),
      buttons: document.querySelectorAll('.spriteButton').length,   // expect 44
      view: CityBucksCompat.view })
   ```
4. Gameplay check: take a fresh screenshot (the pane may have resized), then `left_click_drag`
   from a bottom-bar button (e.g. Shop) to an empty grey plot. Expect: the building appears,
   that player's money drops, citizens start walking within a few seconds.
   Screenshots can be taken before sprites load — screenshot again before assuming a bug.
5. `read_console_messages` (errors) and `read_network_requests` (any 404 or non-localhost request
   is a bug; the only known-missing file, `sound/theme.mp3`, is skipped by compat.js).
6. Pause menu: the ☰ button on the right edge → restart / info / play.

To debug input, wrap a handler and log: `const o=g_dragEnd; g_dragEnd=function(){console.log('end',...arguments); return o.apply(this,arguments)}`.
