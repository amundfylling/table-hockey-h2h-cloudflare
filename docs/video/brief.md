# Promo video brief

## Inputs

- **Format:** 9:16, 1080×1920, 30 fps, about 26 s. Vertical only.
- **Footage:** the production site, https://table-hockey-h2h.pages.dev, recorded with
  `promo/capture/` (Playwright, iPhone viewport 390×844 at 3x, ffmpeg 60 fps). Each take saves
  the production `meta.json` hash and time in `take.json`. Nothing on the site is rebuilt.
- **Brand:** the site's dark tokens (`--bg #0F1113`, `--a #4DBFA3`, `--b #F07A52`), Schibsted
  Grotesk, Golos Text, Barlow Condensed (self-hosted in `promo/video/public/fonts`), the favicon mark.
- **Soundtrack:** "Future Heartbreak City" by Arulo, Mixkit, 124 BPM trap (owner's pick from a
  bass-measured shortlist). License: Mixkit Stock Music Free License,
  https://mixkit.co/license/#musicFree. The film starts 26.1 s in (beat 56): the end of the build,
  a near-silent break, then the drop at 30.9 s. Backbeat confidence is low (0.43), so cuts sit on
  bass hits measured by `promo/video/tools/bass-hits.py` (low band < 120 Hz) instead of snares.
- **Matchup:** Amund Risa Fylling vs Andreas Fjermestad (842 games, 413–342 on 2026-10-25 data).
  Single-player example: Amund Risa Fylling.
- **Voiceover:** none.

## Look

High energy, from the owner. No reference videos were given, so the look is an assumption:
fast taps on the beat, push-through cuts on backbeats, the real UI full-bleed, one text move
(`Title`: words rise behind a line mask). Emphasis is size and weight only.

**Visual argument:** a question becomes a settled record: "Who's really better?" is answered by
the real site counting two players' 842 games up to 413–342.

**Signature move:** the site's own scoreboard count-up, landing on the first big 808 after the
drop.

## Script

| # | Scene | On screen | Words |
|---|---|---|---|
| 1 | Hook (type) | "Who's" / "really" / "better?" on the last hits of the build; push into the drop | 3 |
| 2 | Search (real site) | Tap Player, type "Amund", pick; tap Opponent, type "Fjerm", pick; the site opens on the drop; scoreboard counts to 413–342 on the next 808 | 0 added |
| 3 | Stats (real site) | Swipes on 808s: lead chart, then the tale of the tape | 0 added |
| 4 | Player (real site) | Tap Amund's name; career (7,480 games); light mode on the 808 at track beat 93 | 0 added |
| 5 | End card | "Find out." + table-hockey-h2h.pages.dev | 3 |

## Assumptions (veto any)

- Tagline "Who's really better?" (owner's pick). The end card's line is still open.
- Taps shown as a soft press ring; no cursor (it's a phone).
- Commits are made on branch `claude/project-thread-kxn8fx`.
- Remotion's official skills are not installed in this environment; skipped.
