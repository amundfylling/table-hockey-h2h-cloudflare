// Take: tap Amund's name on the head-to-head to open his career, then switch to light mode.
// t=0 sits half a beat before the track's 808 at beat 86.5, so the tap on the name is the cut;
// the theme toggle is tapped on the hit at beat 93 (take beat 7), and a swipe follows at 99.
const { startTake } = require("./lib");
(async () => {
  const t = await startTake("player", { url: "/?p1=2442&p2=3222" });
  const { page } = t;
  await t.tap(page.locator("#summary-hero button.name", { hasText: "Amund Risa Fylling" }), "open Amund", 0.5);
  await t.tap(page.locator("#theme-toggle"), "light mode", 7);
  await t.untilBeat(13);
  await t.scrollBy(520, 700, "to career stats");
  await t.untilBeat(19);
  await t.finish();
})();
