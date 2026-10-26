// Take: the list of every game. Open the latest one's details, then flip the sort to oldest first.
const { startTake, scrollTo } = require("./lib");
(async () => {
  const t = await startTake("games", { url: "/?p1=2442&p2=3222", prep: scrollTo("#match-list-heading", 110) });
  const { page } = t;
  await t.tap(page.getByRole("button", { name: "Show match details" }).first(), "details", 2.5);
  await t.tap(page.getByRole("button", { name: "Show match details" }).first(), "close details", 5.5);
  await t.tap(page.locator("#mobile-sort-direction"), "sort", 7);
  await t.untilBeat(13.5);
  await t.finish();
})();
