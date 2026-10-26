// Records a scripted session on the production site as 60 fps footage.
// Chromium runs headed on a virtual display at 3x device scale, ffmpeg grabs the page area,
// and every tap, scroll and keystroke is logged to take.json relative to a sync flash.
const { chromium, devices } = require("playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const SITE = process.env.PROMO_SITE || "https://table-hockey-h2h.pages.dev";
const DISPLAY = process.env.PROMO_DISPLAY || ":99";
// iPhone 18 Pro: a 402x874 pt screen at 3x (1206x2622 px). The status bar (54 pt) is drawn by
// the edit, so the web view below it is 402x820.
const VIEW = { width: 402, height: 820 };
const SCALE = 3;
// The page sits below Chromium's tab strip and address bar; measured with a solid-colour page.
const PAGE_TOP = Number(process.env.PROMO_PAGE_TOP || 261);
const SYNC_COLOR = "#ff00ff";
const BPM = Number(process.env.PROMO_BPM || 124);
const BEAT_MS = 60000 / BPM;

function ensureDisplay() {
  try {
    execSync(`xdpyinfo -display ${DISPLAY} >/dev/null 2>&1`);
  } catch {
    const xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "1300x3000x24",
      "-nolisten", "tcp"], { detached: true, stdio: "ignore" });
    xvfb.unref();
    execSync("sleep 1");
  }
}

async function startTake(name, { theme = "dark", url = "/", prep } = {}) {
  ensureDisplay();
  const outDir = path.join(__dirname, "takes", name);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: false,
    env: { ...process.env, DISPLAY },
    args: [`--force-device-scale-factor=${SCALE}`, "--window-position=0,0", "--window-size=430,960",
      "--hide-scrollbars", "--disable-infobars"],
  });
  const context = await browser.newContext({
    viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true,
    userAgent: devices["iPhone 15 Pro"].userAgent, colorScheme: theme, locale: "en-GB",
  });
  const page = await context.newPage();
  await page.goto(SITE + url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const dataHash = await page.evaluate(async () => {
    const r = await fetch("data/meta.json", { cache: "no-store" });
    const text = await r.text();
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const meta = JSON.parse(text);
    return { sha256: [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""),
      generated_at: meta.generated_at };
  });

  // Set up the opening view (a scroll position, say) before the take starts.
  if (prep) {
    await prep(page);
    await page.waitForTimeout(600);
  }

  // Cover the page with a flat colour; lifting it marks t=0 in both the log and the footage.
  await page.evaluate((c) => {
    const d = document.createElement("div");
    d.id = "__promo_sync";
    d.style.cssText = `position:fixed;inset:0;background:${c};z-index:2147483647`;
    document.documentElement.appendChild(d);
  }, SYNC_COLOR);

  const raw = path.join(outDir, "raw.mp4");
  const ff = spawn("ffmpeg", ["-y", "-f", "x11grab", "-framerate", "60", "-draw_mouse", "0",
    "-video_size", `${VIEW.width * SCALE}x${VIEW.height * SCALE}`, "-i", `${DISPLAY}.0+0,${PAGE_TOP}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-pix_fmt", "yuv420p", raw],
    { stdio: ["pipe", "ignore", "ignore"] });
  await page.waitForTimeout(700);

  const events = [];
  let t0 = 0;
  const now = () => Date.now() - t0;
  const log = (e) => events.push({ t: now(), ...e });

  await page.evaluate(() => document.getElementById("__promo_sync").remove());
  t0 = Date.now();

  // Wait until a given beat (counted from t=0), so actions land on the music's grid.
  const untilBeat = async (n) => {
    const wait = n * BEAT_MS - now();
    if (wait > 0) await page.waitForTimeout(wait);
  };

  const center = async (locator) => {
    const box = await locator.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };

  const take = {
    page, untilBeat, log, BEAT_MS,
    // Finds the target first, then waits for the beat, so the tap itself lands on time.
    async tap(locator, label, beat) {
      await locator.waitFor({ state: "visible" });
      const { x, y, box } = await center(locator);
      if (beat !== undefined) await untilBeat(beat);
      log({ type: "tap", label, x, y, box });
      await page.touchscreen.tap(x, y);
    },
    // Keystrokes on a fixed clock from the first one, so latency does not stretch the line.
    async type(text, perCharMs = 85) {
      log({ type: "type", text, perCharMs });
      const start = now();
      for (const [i, ch] of [...text].entries()) {
        const wait = start + i * perCharMs - now();
        if (wait > 0) await page.waitForTimeout(wait);
        await page.keyboard.type(ch);
      }
    },
    // Eased scroll by a distance in CSS px, like a deliberate swipe that settles.
    async scrollBy(dy, ms = 900, label) {
      const from = await page.evaluate(() => window.scrollY);
      log({ type: "scroll", label, from, dy, ms });
      await page.evaluate(([dy, ms]) => new Promise((res) => {
        const start = performance.now(), y0 = window.scrollY;
        const ease = (t) => 1 - Math.pow(1 - t, 3.2);
        const step = (now) => {
          const t = Math.min(1, (now - start) / ms);
          window.scrollTo(0, y0 + dy * ease(t));
          t < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      }), [dy, ms]);
    },
    async scrollToEl(locator, offset = 80, ms = 900, label) {
      const top = await locator.evaluate((el) => el.getBoundingClientRect().top);
      await take.scrollBy(top - offset, ms, label);
    },
    async finish(extra = {}) {
      log({ type: "end" });
      await page.waitForTimeout(300);
      ff.stdin.write("q");
      await new Promise((r) => ff.on("close", r));
      await browser.close();
      const syncFrame = findSyncFrame(raw);
      const meta = {
        name, site: SITE, recorded_at: new Date().toISOString(), data: dataHash, fps: 60,
        size: [VIEW.width * SCALE, VIEW.height * SCALE], scale: SCALE, bpm: BPM,
        sync_frame: syncFrame, events, ...extra,
      };
      fs.writeFileSync(path.join(outDir, "take.json"), JSON.stringify(meta, null, 2));
      // Trim so frame 0 is the first frame after the sync flash.
      const out = path.join(outDir, `${name}.mp4`);
      execSync(`ffmpeg -v error -y -i ${raw} -vf "trim=start_frame=${syncFrame},setpts=PTS-STARTPTS" ` +
        `-c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -an ${out}`);
      console.log(`${name}: sync at raw frame ${syncFrame}, ${events.length} events -> ${out}`);
      return meta;
    },
  };
  return take;
}

// First frame whose centre pixel is no longer the sync colour.
function findSyncFrame(file) {
  const buf = execSync(`ffmpeg -v error -i ${file} -vf "crop=4:4:(iw/2):(ih/2),scale=1:1" ` +
    `-f rawvideo -pix_fmt rgb24 -`, { maxBuffer: 1 << 26 });
  let seen = false;
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const magenta = buf[i] > 230 && buf[i + 1] < 40 && buf[i + 2] > 230;
    if (magenta) seen = true;
    else if (seen) return i / 3;
  }
  throw new Error("sync flash not found in " + file);
}

/** Prep helper: scroll so an element's top sits `offset` CSS px below the top of the view. */
const scrollTo = (selector, offset = 80) => (page) =>
  page.evaluate(([sel, off]) => {
    const el = document.querySelector(sel);
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off);
  }, [selector, offset]);

module.exports = { startTake, scrollTo, SITE };
