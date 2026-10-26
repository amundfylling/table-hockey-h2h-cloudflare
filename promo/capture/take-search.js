// Take: search for a player, then an opponent, and land on the head-to-head.
// Taps sit on the beat grid from t=0, so the edit can put t=0 on a beat and every tap follows.
// The last pick is on a half beat: in the soundtrack that is where the big 808 hit lands.
const { startTake } = require("./lib");
(async () => {
  const t = await startTake("search");
  const { page } = t;
  await t.tap(page.locator("#player-a"), "player field", 1);
  await t.untilBeat(1.5);
  await t.type("Amund", 80);
  await t.tap(page.locator("#player-a-list [role=option]", { hasText: "Amund Risa Fylling" }).first(), "pick Amund", 3);
  await t.tap(page.locator("#player-b"), "opponent field", 4);
  await t.untilBeat(4.5);
  await t.type("Fjerm", 80);
  await t.tap(page.locator("#player-b-list [role=option]", { hasText: "Andreas Fjermestad" }).first(), "pick Andreas", 6.5);
  await t.untilBeat(16);
  await t.finish();
})();
