---
name: decode-game-code
description: Reverse-engineer the Closure-compiled City Bucks code (game/all-compressed.js) — find what a mangled function or Enum value does, locate handlers, and map it to the readable 0.9 prototype. Use when changing game behaviour, investigating a gameplay bug, or answering how a mechanic works.
---

# Decode the compiled game code

`game/all-compressed.js` is one line of Closure Compiler (advanced) output: names are mangled,
`C` is the App instance, `Enum={...}` holds the constants, only `window.g_*` exports keep their names.

## Look around

- Print context around a string (grep is useless on one 318 KB line):
  ```bash
  node -e 'const s=require("fs").readFileSync("game/all-compressed.js","utf8");
  const q=process.argv[1]; let i=-1, n=0; while((i=s.indexOf(q,i+1))>=0 && n++<5)
  console.log("--- @"+i+"\n"+s.slice(Math.max(0,i-300), i+600));' 'window.g_dragEnd'
  ```
- Pretty-print a copy for reading (never commit it, never ship it):
  `npx --yes prettier@3.3.3 --parser babel game/all-compressed.js > "$TMPDIR/cb-pretty.js"`
- Exported entry points: `node -e 'const s=require("fs").readFileSync("game/all-compressed.js","utf8"); console.log([...new Set(s.match(/window\.g_[A-Za-z_]+/g))].join("\n"))'`

## Decode names

- `upstream/CityBucksForTwo/{app,sprite,misc}.js` is readable source of the 0.9 prototype with the
  same structure: match by literals (strings, numbers like 768/1024/148, CSS class names,
  image paths) and by call order. E.g. prototype `createCastButtons` ↔ compiled code using
  `"spriteButton"` and `a.X[c]` (cast buttons per player).
- Known mappings: `C.Q` = local-test/desktop mode, `C.pa[p]` = last drag position of player p,
  `C.X[p][i]` = cast buttons, `C.f[p]` = money, `C.c` = sprites, `C.ba` = game running,
  `Enum.u` = building sprite type, `Enum.Eb/Fb` = improve quality/security add-ons,
  `Enum.mb/nb` = meteor/robber attacks. Add new findings here.
- Live inspection in the browser pane: `C` is a global — read state with `javascript_tool`
  (e.g. `C.f` for both players' money).

## Changing behaviour

Prefer hooking from `game/compat.js` (wrap `window.g_*` functions, patch globals before the game
loads) over editing `all-compressed.js`. If a patch to the compiled file is unavoidable, make it
a small, commented string replacement, commit it on its own, and record it in CLAUDE.md.
