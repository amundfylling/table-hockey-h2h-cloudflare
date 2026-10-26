// Take: the home page in light mode, down to the most-played rivalry and the top-ranked rivalries.
// (No tap into a rivalry: its page would still be loading on the cut to the end card.)
const { startTake } = require("./lib");
(async () => {
  const t = await startTake("home", { url: "/", theme: "light" });
  const { page } = t;
  await t.untilBeat(1);
  await t.scrollToEl(page.locator("#feature"), 90, 650, "to most played");
  await t.untilBeat(7);
  await t.scrollToEl(page.locator("#rivalries"), 90, 650, "to rivalries");
  await t.untilBeat(14);
  await t.finish();
})();
