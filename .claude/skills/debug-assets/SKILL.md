---
name: debug-assets
description: Find missing, broken or misnamed City Bucks assets (sprites, buttons, sounds, CSS images) and Apple CgBI PNGs. Use when a sprite or sound doesn't show/play, there are 404s, or after adding or replacing assets.
---

# Debug City Bucks assets

Run from the project root.

1. Missing files referenced by code and CSS:
   ```bash
   node -e '
   const fs=require("fs"); const s=fs.readFileSync("game/all-compressed.js","utf8");
   const snd=[...new Set([...s.matchAll(/\.j\[Enum\.[A-Za-z$_]+\]="([^"]+)"/g)].map(m=>m[1]))];
   console.log("sounds missing:", snd.filter(n=>!fs.existsSync("game/sound/"+n+".mp3")));
   const css=fs.readFileSync("game/default.css","utf8");
   const refs=[...new Set([...css.matchAll(/url\("?([^")]+)"?\)/g)].map(m=>m[1]))];
   console.log("css images missing:", refs.filter(p=>!fs.existsSync("game/"+p)));'
   ```
   Known and handled in compat.js: `fire-small` (aliased to `firesmall.mp3`), `theme` (never shipped).
   Sprite class names are built at runtime as `<name>_x<dx>_y<dy>[_c<frame>]`, mapped to files in
   default.css — so check CSS refs, not JS strings, for sprites.
2. Apple-crushed PNGs (browsers can't decode them): `find game -name '*.png' -exec file {} + | grep CgBI`.
   Convert with `sips -s format png in.png --out out.png` (macOS ImageIO reads CgBI).
3. Audio decode test in the browser pane:
   ```js
   const c=new AudioContext(); const r={}; for (const f of ['shop','cafe','meteor'])
   { try { r[f]=(await c.decodeAudioData(await (await fetch('sound/'+f+'.mp3')).arrayBuffer())).duration }
     catch(e){ r[f]='ERR '+e.message } } r
   ```
4. Runtime 404s: `read_network_requests` in the browser pane, or
   `performance.getEntriesByType('resource').filter(r=>r.responseStatus>=400)`.
5. Pristine originals: `ipa/extracted/Payload/city-bucks.app/www/` (re-extract with
   `unzip -q ipa/CityBucks-v1.0.ipa -d ipa/extracted`). Compare: `git diff e66205b -- game/`.

Fix asset problems in compat.js (aliases) or by adding files — don't edit `all-compressed.js`
unless there is no other way, and document any such patch in CLAUDE.md.
