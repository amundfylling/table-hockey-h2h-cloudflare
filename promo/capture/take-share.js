// Take: share the matchup as an image. The site draws the card on a canvas and hands it to the
// phone's share sheet (navigator.share). Chromium here has no share sheet, so the take stands in
// for it: it accepts the file, logs the time, and saves it next to the take as share.png, the
// real image the site made. The edit shows that image as the share preview.
const fs = require("fs");
const path = require("path");
const { startTake, scrollTo } = require("./lib");
(async () => {
  const t = await startTake("share", {
    url: "/?p1=2442&p2=3222",
    prep: async (page) => {
      await scrollTo("#headline", 70)(page);
      await page.evaluate(() => {
        navigator.canShare = () => true;
        navigator.share = async (data) => {
          const f = data.files[0];
          const buf = new Uint8Array(await f.arrayBuffer());
          let s = "";
          for (const b of buf) s += String.fromCharCode(b);
          window.__shared = { name: f.name, b64: btoa(s), at: performance.now() };
        };
      });
    },
  });
  const { page } = t;
  await t.tap(page.locator("#share-image-btn"), "share image", 1.5);
  await page.waitForFunction(() => window.__shared);
  t.log({ type: "share", label: "image ready" });
  const shared = await page.evaluate(() => window.__shared);
  fs.writeFileSync(path.join(__dirname, "takes", "share", "share.png"), Buffer.from(shared.b64, "base64"));
  await t.untilBeat(14);
  await t.finish({ shared_file: shared.name });
})();
