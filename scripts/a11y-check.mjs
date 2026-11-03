// Accessibility check: loads the main views of the built site in Chromium and runs axe-core
// (WCAG 2.1 A and AA rules, plus WCAG 2.2 AA such as target size) on each, in light mode on
// desktop and dark mode on a phone.
// Exits non-zero when axe reports any violation.
//
//   node scripts/a11y-check.mjs                 serves ./public (after the data build)
//   A11Y_BASE_URL=http://localhost:8000 node scripts/a11y-check.mjs
//
// The player, matchup and tournament come from the built data unless A11Y_P1, A11Y_P2 and
// A11Y_TOURNAMENT name them.
import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE_PATH = require.resolve("axe-core/axe.min.js");

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

function serve(root) {
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
    let path = join(root, relative);
    try {
      if (statSync(path).isDirectory()) path = join(path, "index.html");
    } catch {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    createReadStream(path).on("error", () => res.end()).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function pickViews() {
  const data = join(PUBLIC_DIR, "data");
  let p1 = process.env.A11Y_P1;
  let p2 = process.env.A11Y_P2;
  let tournament = process.env.A11Y_TOURNAMENT;
  if (!p1 || !p2) {
    const rivalries = JSON.parse(readFileSync(join(data, "rivalries.json"), "utf8"));
    const top = rivalries.most_played[0];
    p1 ||= String(top.p1.id);
    p2 ||= String(top.p2.id);
  }
  if (!tournament) {
    // The biggest shared file holds big tournaments; take its first.
    const files = readdirSync(join(data, "t"))
      .map((name) => ({ name, size: statSync(join(data, "t", name)).size }))
      .sort((a, b) => b.size - a.size);
    const bucket = JSON.parse(readFileSync(join(data, "t", files[0].name), "utf8"));
    tournament = Object.keys(bucket)[0];
  }
  return [
    ["home", "./"],
    ["player", `./?p1=${p1}`],
    ["matchup", `./?p1=${p1}&p2=${p2}`],
    ["tournament", `./tournament.html?id=${tournament}`],
    ["ratings", "./ratings.html"],
    ["changelog", "./changelog.html"],
  ];
}

const SETUPS = [
  { name: "desktop light", viewport: { width: 1280, height: 900 }, colorScheme: "light" },
  { name: "phone dark", viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true },
];

async function main() {
  const server = process.env.A11Y_BASE_URL ? null : await serve(PUBLIC_DIR);
  const base = process.env.A11Y_BASE_URL || `http://127.0.0.1:${server.address().port}/`;
  const views = pickViews();
  const browser = await chromium.launch();
  let failures = 0;
  try {
    for (const setup of SETUPS) {
      const context = await browser.newContext({
        viewport: setup.viewport,
        colorScheme: setup.colorScheme,
        isMobile: Boolean(setup.isMobile),
      });
      for (const [name, path] of views) {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(new URL(path, base).href, { waitUntil: "networkidle" });
        // Open folded sections so their content is checked too.
        await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
        await page.addScriptTag({ path: AXE_PATH });
        const result = await page.evaluate(
          (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags } }),
          TAGS,
        );
        const label = `${name} (${setup.name})`;
        if (errors.length) {
          failures += 1;
          console.log(`✗ ${label}: page errors\n    ${errors.join("\n    ")}`);
        }
        if (result.violations.length) {
          failures += result.violations.length;
          console.log(`✗ ${label}: ${result.violations.length} rule(s) failed`);
          for (const violation of result.violations) {
            console.log(`  - ${violation.id} (${violation.impact}): ${violation.help}`);
            for (const node of violation.nodes.slice(0, 5)) {
              console.log(`      ${node.target.join(" ")}`);
              if (node.failureSummary) {
                console.log(`        ${node.failureSummary.split("\n").slice(1, 2).join(" ").trim()}`);
              }
            }
            if (violation.nodes.length > 5) console.log(`      …and ${violation.nodes.length - 5} more`);
          }
        } else if (!errors.length) {
          console.log(`✓ ${label}`);
        }
        await page.close();
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }
  if (failures) {
    console.log(`\n${failures} accessibility problem(s) found.`);
    process.exit(1);
  }
  console.log("\nNo accessibility problems found.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
