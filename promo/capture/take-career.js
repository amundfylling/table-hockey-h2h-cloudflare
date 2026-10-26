// Take: tap Amund's name for his career, then down the page: win rate by season, the rival map,
// and the opponents table, where the minimum-games slider is dragged up.
const { startTake } = require("./lib");
(async () => {
  const t = await startTake("career", { url: "/?p1=2442&p2=3222" });
  const { page } = t;
  await t.tap(page.locator("#summary-hero button.name", { hasText: "Amund Risa Fylling" }), "open Amund", 0.5);
  await t.untilBeat(4.5);
  await t.scrollToEl(page.locator("#season-chart").locator("xpath=ancestor::*[.//h2][1]"), 110, 650, "to win rate");
  await t.untilBeat(10);
  await t.scrollToEl(page.locator("#rival-map").locator("xpath=ancestor::*[.//h2][1]"), 110, 650, "to rival map");
  await t.untilBeat(13);
  await t.scrollToEl(page.locator("#single-player-section"), 90, 650, "to opponents");
  // Drag the slider's thumb right, like a finger.
  await t.untilBeat(14);
  const box = await page.locator("#min-games-slider").boundingBox();
  const y = box.y + box.height / 2;
  const x0 = box.x + box.width * 0.05, x1 = box.x + box.width * 0.55;
  t.log({ type: "drag", label: "min games", x: x0, y, x1 });
  await page.evaluate(async ([x0, x1, y]) => {
    const el = document.getElementById("min-games-slider");
    const min = +el.min, max = +el.max;
    const r = el.getBoundingClientRect();
    for (let i = 0; i <= 20; i++) {
      const x = x0 + ((x1 - x0) * i) / 20;
      const v = min + ((x - r.left) / r.width) * (max - min);
      el.value = Math.round(v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 30));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [x0, x1, y]);
  await t.untilBeat(21.5);
  await t.finish();
})();
