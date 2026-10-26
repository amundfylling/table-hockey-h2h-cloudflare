# Exports

Suggested share image for a head-to-head (1080x1080, light and dark), on the
"Exports" page in Penpot. Built from the redesign's tokens and data helpers.

- `python3 share.py <outdir>` writes `share-light.html` and `share-dark.html`.
- `penpot-data/` holds the packed boards (same pipeline as `../redesign`).

What it shows, top to bottom: score and win share, a one-line verdict, wins per
season (first player above the line, opponent below), last 10 games (latest
first), tale of the tape as split bars, and the biggest win each way.
World ranks are hard-coded from the current export; the site has them live.
