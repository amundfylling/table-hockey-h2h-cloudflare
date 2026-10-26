# Promo video brief

## Inputs

- **Format:** 9:16, 1080×1920, 30 fps, about 30–35 s. Vertical only.
- **Footage:** the production site, https://table-hockey-h2h.pages.dev, recorded with
  `promo/capture/` (Playwright, iPhone viewport 390×844 at 3x, ffmpeg 60 fps). Each take saves
  the production `meta.json` hash and time in `take.json`. Nothing on the site is rebuilt.
- **Brand:** the site's dark tokens (`--bg #0F1113`, `--a #4DBFA3`, `--b #F07A52`), Schibsted
  Grotesk, Golos Text, Barlow Condensed (self-hosted in `promo/video/public/fonts`), the favicon mark.
- **Soundtrack:** "Positive Energy" by Michael Ramir C., Mixkit, 135 BPM EDM.
  License: Mixkit Stock Music Free License, https://mixkit.co/license/#musicFree.
  Grid `good`, backbeat confidence 1.00, loud from bar one, biggest lift at beat 15 (6.67 s).
  Runner-up: "Rising Sun" by Diego Nava (Mixkit, 140 BPM). Nobody has listened to either yet.
- **Matchup:** Amund Risa Fylling vs Andreas Fjermestad (842 games, 413–342 on 2026-10-25 data).
  Single-player example: Amund Risa Fylling.
- **Voiceover:** none.

## Look

High energy, from the owner. No reference videos were given, so the look is an assumption:
fast taps on the beat, push-through cuts on backbeats, the real UI full-bleed, one text move
(`Title`: words rise behind a line mask). Emphasis is size and weight only.

**Visual argument:** a question becomes a settled record: "Who's really better?" is answered by
the real site counting two players' 842 games up to 413–342.

**Signature move:** the site's own scoreboard count-up, landing on the drop (beat 15).

## Script

| # | Scene | On screen | Words |
|---|---|---|---|
| 1 | Hook (type) | "Who's" / "really" / "better?", one word per backbeat | 3 |
| 2 | Search (real site) | Tap Player, type "Amund", pick; tap Opponent, type "Fjerm", pick; scoreboard counts to 413–342 on the drop | 0 added |
| 3 | Scoreboard detail | Push into the score and "Fylling leads by 71 wins" line | planned |
| 4 | Stats scroll | Lead chart, tale of the tape, scorelines | planned |
| 5 | Player page | Amund's career: 7,480 games | planned |
| 6 | Light mode | Tap the theme toggle | planned |
| 7 | End card | "Every rivalry, settled." + table-hockey-h2h.pages.dev | planned |

## Assumptions (veto any)

- Tagline "Who's really better?" (owner's pick). The end card's line is still open.
- The track above, picked on measurements only.
- Taps shown as a soft press ring; no cursor (it's a phone).
- Commits are made on branch `claude/project-thread-kxn8fx`.
- Remotion's official skills are not installed in this environment; skipped.
