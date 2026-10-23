# Redesign concept

An alternative design for the site, built from real data (Fateev vs Dudkin,
player 6344) and drawn on the "Redesign" page of the Penpot file.

- `data.py` reads `public/data/h2h/*.json` and works out the numbers.
- `charts.py` draws the charts as inline SVG.
- `build.py <outDir>` writes static pages: `home-light`, `matchup-light`,
  `matchup-dark`, `player-light` (`.html`), plus `style.css`. Each page is
  responsive (700px breakpoint), so one file gives desktop and mobile.

## Getting it into Penpot

1. `python3 build.py <out>` then extract with
   `SCREENS=list.json node ../extract-screens.mjs <dir>`, where `list.json`
   rows are `[name, width, height, scheme, "file:///…/page.html"]`.
2. `python3 ../slim-screens.py <dir>/screens.json slim.json` and
   `python3 penpot-data/compact.py slim.json` give one base64 raw-deflate
   blob per screen (`penpot-data/sN.b64` + `sN.meta.json`).
3. In Penpot, the builder (`../build-in-penpot.js`) needs `h2h.rdUnpack`
   (like `unpackScreen` but with Schibsted Grotesk / `#4A525B` text
   defaults) and `h2h.rdStart(screen, x, y)` (like `startScreen`, on the
   "Redesign" page). Then `await h2h.buildSections(150)` until done.

## Status

| Screen | Data | Penpot position | Built |
| --- | --- | --- | --- |
| 0 Desktop / Home | s0 | 0, 0 | yes |
| 1 Desktop / Matchup | s1 | 1600, 0 | yes |
| 2 Desktop / Matchup (dark) | s2 | 3200, 0 | not yet |
| 3 Desktop / Player | s3 | 4800, 0 | yes |
| 4 Mobile / Home | s4 | 0, 2900 | yes |
| 5 Mobile / Matchup | s5 | 550, 2900 | yes |
| 6 Mobile / Player | s6 | 1100, 2900 | yes |

To finish: build screen 2 from `penpot-data/s2.b64` (send it in ~8,000
character pieces into `storage.h2h.rdBuf[2]`), then export each board and
check it. Cyrillic tournament names fall back to a serif font in Penpot
because Schibsted Grotesk has no Cyrillic; swapping those rows to Inter
Tight would fix it.
