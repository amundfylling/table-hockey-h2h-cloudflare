# Promo video notes

## Wave 0 (checkpoint)

- decision: real production footage, not rebuilt UI (owner: "must use the site how it looks").
- decision: 9:16 only (owner's choice in the planning thread).
- decision: high energy (owner intake answer). Track changed from "Shame" (120 BPM, moody) to
  "Positive Energy" (135 BPM).
- decision: matchup Amund Risa Fylling vs Andreas Fjermestad; player page Amund Risa Fylling.
- Capture: taps are scheduled on whole beats from the take's t=0 (a magenta sync flash), and the
  edit puts t=0 on a beat. Measured: all four taps in the search take within 1 ms of their beat.
- Fonts are self-hosted: Remotion's render browser rejects the proxy's certificate for
  fonts.gstatic.com in this environment.
- Zoom on full-bleed footage crops the page's sides; above ~1.06 the scoreboard names clip.
- decision: tagline "Who's really better?" (owner picked it over "842 games. One answer.").

## Wave 1 (soundtrack)

- decision: owner liked the look, not the song ("more energetic"). Ten energetic options, then ten
  bass-heavy hip hop options like "Purple J's"; owner picked "Future Heartbreak City" (Arulo).
- decision: transitions sync to the bass (owner). Cuts are bass hits; the take's last tap is on a
  half beat because the 808 lands there. The search take was re-recorded at 124 BPM.
- Measured: drop at local frame 115 is a bass hit; final tap at 209, hit at 210; cut at 312, hit 311.

## Wave 2 (transitions)

- Owner: "much better transitions, it is quite boring now". Three directions behind the `fx` switch
  (fx.ts, Master-slam / Master-mask / Master-phone; default Master is still v2):
  slam (pull-back slam with blur, white flash, 808 camera kicks and shake), mask (site seen through
  the hook's letters, iris from the "?" dot), phone (site swings in as a 3D phone screen).
- Gotcha: a DOM layer scaled past ~20x rendered its glyphs black in the render browser, so the mask
  dive caps the stencil at 2.6x and an iris clip-path finishes the reveal.
- Gotcha: interpolate with extrapolateLeft clamp held a flash at its first key value for the whole
  film; overlays that live in a window return 0 outside it.

## Wave 3 (full draft)

- Built stats, player and end card. Draft rendered in the "mix" style (owner's pick pending).
- Player take: the track's grid drifts between beats 86 and 93, so the take is placed by its
  theme-toggle tap on the measured 808 (frame 544) instead of by beat count.
- End card shortened to two bars; "Find out." answers the hook. Film is 26.1 s.

## Wave 4 (iPhone)

- decision: owner wants the demo shown on the latest iPhone. iPhone 18 Pro (1206×2622 px, 402×874 pt
  at 3x, per AppleInsider/MacRumors 2026-09). Takes re-recorded at 402×820 (status bar drawn in the
  edit and follows the site's theme). Camera pushes can now go to 1.3–1.45 since they crop the phone,
  not the page.
- Capture: Chromium's window must be 430 pt wide and the display 1300×3000 for a 1206 px web view.

## Wave 5: no bounce, captions (Amund's notes)

- "The bounce makes it hard to see the video": the slam/mix styles no longer shake or kick the
  phone between cuts. The bass is carried by the cuts, the taps and the captions instead.
- Player take: placed by both taps now. The tap on Amund's name is the cut (808 at frame 442) and
  the take plays at ~0.93x so the light-mode tap still lands on the 808 at frame 544.
- "A short description along the demo": src/components/Caption.tsx, one line per step, each
  entering on a bass hit (CAPTIONS in Master.tsx). The phone shrank to PT 1.72 and moved down
  to leave a 330 px caption band; a scrim keeps the line readable under camera pushes.
- Rendered as full-draft-v3-captions.mp4.

## Wave 6: every feature (Amund: "make it cover all features of the site")

- The film runs 63 s now: the build, the first drop, the lighter middle section and the second
  drop. Scenes: hook, search, stats, filters (playoff series + filters), tape (scorelines,
  seasons, tournaments), games (every game + details + sort), share (share image), career
  (career, win rate by season, rival map, opponents + min-games slider), light (theme), home
  (most-played and top-ranked rivalries), end.
- New takes: take-filters/tape/games/share/career/home.js. lib.js gained a `prep` hook (opening
  scroll) and a `scrollTo` helper. The share take stands in for the phone's share sheet so the
  real PNG the site draws is saved (public/takes/share.png); Chromium's download popup is not
  in the picture. The home take no longer taps into a rivalry, which was still loading on the cut.
- Takes are placed by their events (placeTake in Footage.tsx: one anchor sets the skip, two
  also set the rate). Rates stay within 0.94-1.06. ALL_HITS / hitNear in timing.ts include the
  softer hits of the middle section, where the strong list has none.
- 19 captions, each on a cut or on the tap/swipe it describes. Caption size 62 px so every line
  fits on one row.
- Rendered as full-draft-v4-all-features.mp4.
