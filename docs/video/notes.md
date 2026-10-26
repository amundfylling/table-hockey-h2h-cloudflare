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
