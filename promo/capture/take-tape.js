// Take: down the head-to-head from the scorelines to season by season and the tournaments.
// Swipes are on the beat grid; the edit anchors them to the 808s.
const { startTake, scrollTo } = require("./lib");
(async () => {
  const t = await startTake("tape", { url: "/?p1=2442&p2=3222", prep: scrollTo("#scorelines-sub", 150) });
  const { page } = t;
  await t.untilBeat(4.5);
  await t.scrollToEl(page.locator("#seasons-sub"), 150, 650, "to seasons");
  await t.untilBeat(11.5);
  await t.scrollToEl(page.locator("#tournaments-sub"), 150, 650, "to tournaments");
  await t.untilBeat(15.5);
  await t.finish();
})();
