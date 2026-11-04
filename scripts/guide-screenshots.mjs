// Takes the screenshots on the guide page (public/guide.html) and places their numbered markers.
//
//   npm ci && node scripts/guide-screenshots.mjs       capture from the live site
//   GUIDE_BASE_URL=http://127.0.0.1:8000/ node scripts/guide-screenshots.mjs
//   node scripts/guide-screenshots.mjs lead records    only these figures
//
// Each figure is captured four times: desktop (1280px wide) and phone (390px), each in light and
// dark mode. Images are saved as WebP to public/guide/{id}-{theme}-{desk|phone}.webp.
//
// In guide.html every figure is written as
//
//   <!--figure:id-->…<!--/figure-->
//
// and this script replaces everything between the two comments with the <picture> elements and
// the numbered markers, placed on the element each marker points at. Edit the captions (the
// numbered list under each figure) in guide.html; edit what a figure shows and where its markers
// sit in FIGURES below.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const OUT = join(PUBLIC, "guide");
const PAGE = join(PUBLIC, "guide.html");
const BASE = process.env.GUIDE_BASE_URL || "https://h2h.puck.no/";

// Two well-known players, so the screenshots show a real, close rivalry.
const P1 = 9763; // Rainers Kalniņš
const P2 = 391; // Edgars Caics
const TOURNAMENT = 8070; // European Championship 2026 - OPEN

const DEVICES = {
  desk: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

// clip: selectors whose union (plus pad) is captured; per device when it differs.
// maxHeight: cut the capture at this many CSS pixels.
// markers: [selector, at]. `at` is a point on the element as [x, y] fractions (0,0 top left;
// 1,1 bottom right), optionally followed by an offset in CSS pixels: [x, y, dx, dy]. Either part
// can be { desk, phone } when it differs. A comma-separated selector takes the first visible
// match; a marker missing on a device (null selector) is left off that screenshot.
// A clip selector that matches a .section takes its inner .wrap, without the section's padding.
const FIGURES = [
  {
    id: "find",
    path: "./?home",
    clip: { desk: [".topbar", "#home-title", "#finder", "#feature"], phone: [".topbar", "#home-title", "#finder"] },
    markers: [
      ["#player-a", [0.97, 0.5]],
      ["#player-b", [0.97, 0.5]],
      [{ desk: "#feature", phone: null }, [0.03, 0.06]],
      [{ desk: ".nav", phone: "#menu-toggle" }, { desk: [0, 0.5, -16, 0], phone: [0.5, 0.95] }],
    ],
  },
  {
    id: "matchup",
    path: `./?p1=${P1}&p2=${P2}`,
    clip: ["#summary-hero", "#controls-bar"],
    markers: [
      [".board .score", [0.5, 0.05]],
      [".who.a .switch-trigger", { desk: [1.02, 0.5], phone: [0, 0, 0, -4] }],
      [".forecast", { desk: [0, 0.62, -18, 0], phone: [0, 0, 10, 6] }],
      [".share-bar", { desk: [0, 0.5, -18, 0], phone: [0.02, 0.5] }],
      [{ desk: ".form-strip", phone: "#form-chips" }, { desk: [0, 0.5, -18, 0], phone: [0, 0.5] }],
      [".stage-card", { desk: [0, 0.5, -18, 0], phone: [0, 0.5] }],
      ["#more-filters-toggle", [1, 0]],
      ["#share-image-btn", [1, 0]],
    ],
  },
  {
    id: "lead",
    path: `./?p1=${P1}&p2=${P2}`,
    clip: ["[data-story=lead]"],
    hover: { sel: "#record-chart svg", at: [0.62, 0.45] },
    markers: [
      ["#record-chart", { desk: [0.25, 0.55], phone: [0.45, 0.12] }],
      [".chart-tooltip", [0, 0]],
      ["#tournament-strip", [0.0, 0.5]],
    ],
  },
  {
    id: "tournaments-h2h",
    path: `./?p1=${P1}&p2=${P2}`,
    clip: ["[data-story=tournaments]"],
    maxHeight: { desk: 470, phone: 640 },
    markers: [
      ["#tournaments .titem:first-child .trow", { desk: [0, 0.5, -18, 0], phone: [0, 0.5] }],
      ["#tournaments .titem:first-child .games .g", { desk: [0, 0.5, -18, 0], phone: [0, 0] }],
      ["#tournaments .titem:first-child .g-page", { desk: [1, 0.5, 16, 0], phone: [1, 0] }],
    ],
  },
  {
    id: "games",
    path: `./?p1=${P1}&p2=${P2}`,
    clip: ["#matches-section"],
    maxHeight: { desk: 560, phone: 760 },
    setup: async (page) => {
      await page.locator("#matches-body .expand-btn").nth(1).click();
      await page.waitForTimeout(400);
    },
    markers: [
      ["#matches-head-row th:nth-child(2), #mobile-sort", { desk: [0.4, 0], phone: [1, 0] }],
      ["#matches-body .expand-btn >> nth=1", { desk: [0, 0.5, -18, 0], phone: [0.5, 0.5] }],
      ["#matches-body tr.is-expanded + tr", { desk: [0, 0.2, -18, 0], phone: [0.03, 0.2] }],
      ["#page-size, #next-page", [1, 0]],
    ],
  },
  {
    id: "player",
    path: `./?p1=${P1}`,
    clip: ["#summary-hero", "#controls-bar"],
    markers: [
      [".p-name", { desk: [0, 0.5, -20, 0], phone: [1, 0.5, -14, 0] }],
      [".player-hero .btn.primary", [0, 0]],
      [".kpis", [0.0, 0.0]],
      [{ desk: ".form-strip", phone: "#form-chips" }, { desk: [0, 0.5, -18, 0], phone: [0, 0.5] }],
      [{ desk: ".stage-card", phone: "#filter-bar" }, { desk: [0, 0.5, -18, 0], phone: [0, 0] }],
    ],
  },
  {
    id: "rating",
    path: `./?p1=${P1}`,
    clip: { desk: ["#rating-section", "#nations-section"], phone: ["#rating-section", "#nations-section"] },
    maxHeight: { phone: 1100 },
    markers: [
      ["#rating-chart", [0.5, 0.25]],
      ["#rating-legend", { desk: [0, 0.5, -18, 0], phone: [0, 0.5] }],
      ["#nation-chart", { desk: [0, 0, -14, 0], phone: [0, 0] }],
      [{ desk: "#nations-callout", phone: "#nations-callout" }, [0.0, 0.0]],
    ],
  },
  {
    id: "opponents",
    path: `./?p1=${P1}`,
    clip: ["[data-story=opponents]"],
    maxHeight: { desk: 470, phone: 620 },
    markers: [
      ["#min-games-slider", [0.0, 0.5]],
      ["#opponents-head-row th.active-sort, #opponents-head-row th:nth-child(2)", [0.0, 0.5]],
      ["#top-opponents-body tr:first-child", [0.98, 0.5]],
    ],
  },
  {
    id: "leaderboard",
    path: "./leaderboard",
    clip: [".topbar", "#b-table-wrap"],
    maxHeight: { desk: 700, phone: 960 },
    markers: [
      ["#b-query", [0.97, 0.5]],
      ["#b-nation", [0.5, 0]],
      ["#b-active-label + *, [aria-labelledby=b-active-label]", [1, 0]],
      ["#b-min-games", [1.0, 0.5]],
      ["#b-table-wrap thead th:nth-child(3), #b-table-wrap tbody tr:first-child", { desk: [1, 0.5, 14, 0], phone: [0, 0.5] }],
    ],
  },
  {
    id: "tournaments",
    path: "./tournaments",
    clip: [".topbar", "#b-table-wrap"],
    maxHeight: { desk: 620, phone: 920 },
    markers: [
      ["#b-query", [0.97, 0.5]],
      ["#b-year", { desk: [0.5, 0, 0, -10], phone: [0.5, 0] }],
      ["#b-rows tr:first-child a, #b-rows > :first-child a", { desk: [0, 0.5, -16, 0], phone: [0.9, 0] }],
    ],
  },
  {
    id: "tournament",
    path: `./tournament?id=${TOURNAMENT}`,
    clip: [".topbar", "#t-podium", "#t-upsets-section"],
    maxHeight: { desk: 820, phone: 1200 },
    markers: [
      ["#t-meta", { desk: [0, 0.5, -18, 0], phone: [1, 0] }],
      ["#t-podium", { desk: [0, 0.5, -18, 0], phone: [1, 0] }],
      ["#t-upsets-section h2", { desk: [0, 0.5, -18, 0], phone: [1, 0.5, 14, 0] }],
    ],
  },
  {
    id: "records",
    path: "./?home",
    clip: ["#records"],
    maxHeight: { phone: 1150 },
    markers: [
      ["#records-list > :first-child", [0.0, 0.0]],
      ["#records-list > :nth-child(2)", [0.0, 0.0]],
      ["#records-list > :nth-child(3)", [0.0, 0.0]],
      ["#records-list > :nth-child(4)", [0.0, 0.0]],
    ],
  },
];

const PAD = { desk: 40, phone: 12 };

function forDevice(value, device) {
  if (value && typeof value === "object" && !Array.isArray(value) && ("desk" in value || "phone" in value)) {
    return value[device];
  }
  return value;
}

async function measure(page, clipSelectors, markers, device) {
  return page.evaluate(({ clipSelectors, markers, pad }) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    };
    const inner = (el) => (el?.classList.contains("section") && el.querySelector(":scope > .wrap")) || el;
    const find = (sel) => {
      // ">> nth=N" picks the Nth match.
      const [css, nth] = sel.split(" >> nth=");
      const all = [...document.querySelectorAll(css)].filter(visible);
      return nth ? all[Number(nth)] : all[0];
    };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const sel of clipSelectors) {
      const el = inner(find(sel));
      if (!el) throw new Error(`clip selector not found: ${sel}`);
      const r = rectOf(el);
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    const docW = document.documentElement.scrollWidth;
    const clip = {
      x: Math.max(0, Math.floor(x1 - pad)),
      y: Math.max(0, Math.floor(y1 - pad)),
    };
    clip.width = Math.min(docW, Math.ceil(x2 + pad)) - clip.x;
    clip.height = Math.ceil(y2 + pad) - clip.y;
    const points = markers.map(([sel, at]) => {
      if (!sel) return null;
      const el = find(sel);
      if (!el) return null;
      const r = rectOf(el);
      return { x: r.x + r.w * at[0] + (at[2] || 0), y: r.y + r.h * at[1] + (at[3] || 0) };
    });
    return { clip, points };
  }, { clipSelectors, markers, pad: PAD[device] });
}

async function toWebp(browser, png) {
  const page = await browser.newPage();
  const data = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.8).split(",")[1];
  }, png.toString("base64"));
  await page.close();
  return { buffer: Buffer.from(data, "base64") };
}

async function capture(browser, figure, device, theme) {
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: theme, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(new URL(figure.path, BASE).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Scroll through the page so charts drawn on first view are in place.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(600);
  if (figure.setup) await figure.setup(page);

  const clipSelectors = forDevice(figure.clip, device);
  const markers = figure.markers.map(([sel, at]) => [forDevice(sel, device), forDevice(at, device)]);
  let { clip } = await measure(page, clipSelectors, markers, device);

  // Grow the viewport to the whole page so nothing sticky or lazy moves while we capture.
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: DEVICES[device].viewport.width, height: fullHeight });
  await page.waitForTimeout(300);
  if (figure.hover) {
    const box = await page.locator(figure.hover.sel).first().boundingBox();
    const x = box.x + box.width * figure.hover.at[0];
    const y = box.y + box.height * figure.hover.at[1];
    if (DEVICES[device].hasTouch) await page.touchscreen.tap(x, y);
    else await page.mouse.move(x, y);
    await page.waitForTimeout(300);
  }
  const measured = await measure(page, clipSelectors, markers, device);
  clip = measured.clip;
  const maxHeight = forDevice(figure.maxHeight, device);
  if (maxHeight) clip.height = Math.min(clip.height, maxHeight);

  const png = await page.screenshot({ clip, animations: "disabled" });
  const { buffer } = await toWebp(browser, png);
  writeFileSync(join(OUT, `${figure.id}-${theme}-${device}.webp`), buffer);
  await context.close();

  const points = measured.points.map((p) => {
    if (!p) return null;
    const x = (p.x - clip.x) / clip.width;
    const y = (p.y - clip.y) / clip.height;
    if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return null;
    return { x: Math.min(0.985, Math.max(0.015, x)), y: Math.min(0.985, Math.max(0.015, y)) };
  });
  return { width: clip.width, height: clip.height, points, kb: Math.round(buffer.length / 1024) };
}

const pct = (n) => `${(n * 100).toFixed(1)}%`;

function figureHtml(figure, shots) {
  const { desk, phone } = shots;
  const src = (theme, device) => `guide/${figure.id}-${theme}-${device}.webp`;
  const picture = (theme) => `<picture class="g-shot g-shot-${theme}">
          <source media="(max-width: 600px)" srcset="${src(theme, "phone")}" width="${phone.width * 2}" height="${phone.height * 2}" />
          <img src="${src(theme, "desk")}" width="${desk.width}" height="${desk.height}" alt="" loading="lazy" decoding="async" />
        </picture>`;
  const markers = figure.markers.map((_, i) => {
    const d = desk.points[i];
    const p = phone.points[i];
    if (!d && !p) return "";
    const style = [
      d ? `--x:${pct(d.x)};--y:${pct(d.y)}` : "--d:none",
      p ? `--px:${pct(p.x)};--py:${pct(p.y)}` : "--pd:none",
    ].join(";");
    return `\n        <span class="g-pin" data-pin="${i + 1}" style="${style}" aria-hidden="true">${i + 1}</span>`;
  }).join("");
  return `<!--figure:${figure.id}-->
        ${picture("light")}
        ${picture("dark")}${markers}
        <!--/figure-->`;
}

async function main() {
  const only = process.argv.slice(2);
  const figures = only.length ? FIGURES.filter((f) => only.includes(f.id)) : FIGURES;
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  let html = readFileSync(PAGE, "utf8");
  try {
    for (const figure of figures) {
      const shots = {};
      for (const device of ["desk", "phone"]) {
        for (const theme of ["light", "dark"]) {
          const shot = await capture(browser, figure, device, theme);
          if (theme === "light") shots[device] = shot;
          console.log(`${figure.id} ${device} ${theme}: ${shot.width}x${shot.height}, ${shot.kb} KB,`,
            `markers ${shot.points.map((p, i) => (p ? i + 1 : "-")).join(" ")}`);
        }
      }
      const block = new RegExp(`<!--figure:${figure.id}-->[\\s\\S]*?<!--\\/figure-->`);
      if (!block.test(html)) throw new Error(`guide.html has no <!--figure:${figure.id}--> block`);
      html = html.replace(block, figureHtml(figure, shots));
    }
  } finally {
    await browser.close();
  }
  writeFileSync(PAGE, html);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
