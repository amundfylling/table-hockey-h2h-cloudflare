// Take: the head-to-head, from the scoreboard down to the lead chart and the tale of the tape.
// It opens where the search take ends. Swipes start on the beat grid (t=0 sits on the 808 at
// half beat 77.5 of the track), so they start with the bass hits at 79 and 83.
const { startTake } = require("./lib");
(async () => {
  const t = await startTake("stats", { url: "/?p1=2442&p2=3222" });
  const { page } = t;
  await t.untilBeat(1.5);
  await t.scrollToEl(page.locator("#lead-title"), 70, 650, "to lead chart");
  await t.untilBeat(5.5);
  await t.scrollToEl(page.locator("#summary-grid"), 150, 650, "to tale of the tape");
  await t.untilBeat(11);
  await t.finish();
})();
