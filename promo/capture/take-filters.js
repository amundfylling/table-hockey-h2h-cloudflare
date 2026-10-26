// Take: the head-to-head's controls. Playoff stage, then the series view, then the advanced
// filters with the overtime toggle. t=0 is the cut onto this scene; anchors in the edit put
// "playoff" on the cut and "overtime" on the 808 that follows the filters opening.
const { startTake, scrollTo } = require("./lib");
(async () => {
  const t = await startTake("filters", { url: "/?p1=2442&p2=3222", prep: scrollTo(".stage-card", 120) });
  const { page } = t;
  await t.tap(page.getByRole("button", { name: "Playoff", exact: true }).first(), "playoff", 0.5);
  await t.tap(page.locator("#playoff-mode-toggle button", { hasText: "Series" }), "series", 3);
  await t.tap(page.locator("#more-filters-toggle"), "filters", 7);
  await t.tap(page.locator("#ot-toggle").locator("xpath=ancestor-or-self::label[1]").first(), "overtime", 8.5);
  await t.untilBeat(11);
  await t.scrollToEl(page.locator("#lead-title"), 120, 650, "to lead chart");
  await t.untilBeat(16.5);
  await t.finish();
})();
