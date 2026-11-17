// Smoke check of the built site: loads every page in Chromium, on desktop and on a phone, and
// checks that each one renders the data the build wrote (the right names, counts and titles)
// with no script errors, console errors or failed requests. Also runs the main flow: search a
// player, pick them, then pick an opponent.
//
//   node scripts/smoke-check.mjs                 serves ./public (after the data build)
//   SMOKE_BASE_URL=http://localhost:8000 node scripts/smoke-check.mjs
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./static-server.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const DATA_DIR = join(PUBLIC_DIR, "data");
const TIMEOUT = 20_000;

const readJson = (path) => JSON.parse(readFileSync(join(DATA_DIR, path), "utf8"));
const digitsOnly = (text) => text.replace(/[\s,.\u00a0\u202f']/g, "");

function pickData() {
  const rivalries = readJson("rivalries.json");
  const top = rivalries.most_played[0];
  const leaderboard = readJson("leaderboard.json");
  const leader = Object.fromEntries(leaderboard.fields.map((f, i) => [f, leaderboard.players[0][i]]));
  const list = readJson("tournament-list.json");
  const field = (row, name) => row[list.fields.indexOf(name)];
  // The biggest tournament with a champion: its page has standings and a bracket.
  const tournament = list.tournaments
    .filter((row) => field(row, "champion") != null)
    .sort((a, b) => field(b, "games") - field(a, "games"))[0];
  const files = readdirSync(join(DATA_DIR, "t"));
  const bucket = readJson(`t/${field(tournament, "id") % 1000}.json`);
  const details = bucket[String(field(tournament, "id"))];
  const latest = [...list.tournaments].sort((a, b) =>
    String(field(b, "date")).localeCompare(String(field(a, "date"))))[0];
  return {
    top,
    leader,
    tournament: {
      id: field(tournament, "id"),
      name: field(tournament, "name"),
      champion: details.players[String(details.champion)],
    },
    latestTournament: field(latest, "name"),
    tournamentFiles: files.length,
  };
}

function views(data) {
  const { top, leader, tournament, latestTournament } = data;
  return [
    { name: "home", path: "./", texts: [top.p1.name, top.p2.name] },
    {
      name: "player",
      path: `./?p1=${top.p1.id}`,
      texts: [top.p1.name],
      title: top.p1.name,
    },
    {
      name: "matchup",
      path: `./?p1=${top.p1.id}&p2=${top.p2.id}`,
      texts: [top.p1.name, top.p2.name],
      digits: [String(top.games)],
      title: top.p2.name,
    },
    {
      name: "tournament",
      path: `./tournament.html?id=${tournament.id}`,
      texts: [tournament.name, tournament.champion],
      title: tournament.name.slice(0, 20),
    },
    { name: "leaderboard", path: "./leaderboard.html?all=1", texts: [leader.name], digits: [String(leader.rating)] },
    { name: "tournaments", path: "./tournaments.html", texts: [latestTournament] },
    { name: "ratings", path: "./ratings.html", texts: ["Glicko"] },
    { name: "changelog", path: "./changelog.html", texts: [] },
    { name: "guide", path: "./guide.html", texts: [] },
    { name: "not found", path: "./404.html", texts: [] },
  ];
}

const SETUPS = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

function watch(page, base) {
  const problems = [];
  page.on("pageerror", (error) => problems.push(`script error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console error: ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    if (request.url().startsWith(base)) {
      problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
    }
  });
  page.on("response", (response) => {
    if (response.url().startsWith(base) && response.status() >= 400) {
      problems.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  return problems;
}

async function waitForText(page, texts, digits) {
  await page.waitForFunction(
    ({ texts, digits }) => {
      const text = document.body.innerText;
      const compact = text.replace(/[\s,.\u00a0\u202f']/g, "");
      return texts.every((t) => text.includes(t)) && digits.every((d) => compact.includes(d));
    },
    { texts, digits },
    { timeout: TIMEOUT },
  );
}

async function checkView(context, base, view) {
  const page = await context.newPage();
  const problems = watch(page, base);
  try {
    await page.goto(new URL(view.path, base).href, { waitUntil: "networkidle", timeout: TIMEOUT });
    try {
      await waitForText(page, view.texts, view.digits || []);
    } catch {
      const text = await page.evaluate(() => document.body.innerText);
      const compact = digitsOnly(text);
      const missing = [
        ...view.texts.filter((t) => !text.includes(t)),
        ...(view.digits || []).filter((d) => !compact.includes(d)),
      ];
      problems.push(`page does not show: ${missing.map((t) => JSON.stringify(t)).join(", ")}`);
    }
    if (view.title) {
      const title = await page.title();
      if (!title.includes(view.title)) problems.push(`title "${title}" lacks "${view.title}"`);
    }
    const h1 = await page.locator("h1").count();
    if (!h1) problems.push("page has no h1");
  } catch (error) {
    problems.push(`could not load: ${error.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return problems;
}

async function checkSearchFlow(context, base, top) {
  const page = await context.newPage();
  const problems = watch(page, base);
  try {
    await page.goto(base, { waitUntil: "networkidle", timeout: TIMEOUT });
    const search = page.locator("#header-search");
    if (await search.isVisible()) await search.click();
    else await page.locator("#mobile-search").click();
    const inputA = page.locator("#player-a");
    await inputA.fill(top.p1.name);
    await page.locator("#player-a-list [role=option]", { hasText: top.p1.name }).first().click({ timeout: TIMEOUT });
    const inputB = page.locator("#player-b");
    await inputB.fill(top.p2.name);
    await page.locator("#player-b-list [role=option]", { hasText: top.p2.name }).first().click({ timeout: TIMEOUT });
    await page.waitForURL((url) => url.searchParams.get("p2") === String(top.p2.id), { timeout: TIMEOUT });
    await waitForText(page, [top.p1.name, top.p2.name], [String(top.games)]);
  } catch (error) {
    problems.push(`search flow: ${error.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return problems;
}

async function main() {
  const data = pickData();
  if (!data.tournamentFiles) throw new Error("No tournament files in public/data/t.");
  const server = process.env.SMOKE_BASE_URL ? null : await serve(PUBLIC_DIR);
  const base = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let failures = 0;
  const report = (label, problems) => {
    if (problems.length) {
      failures += 1;
      console.log(`✗ ${label}\n    ${problems.slice(0, 10).join("\n    ")}`);
    } else {
      console.log(`✓ ${label}`);
    }
  };
  try {
    for (const setup of SETUPS) {
      const context = await browser.newContext({
        viewport: setup.viewport,
        isMobile: Boolean(setup.isMobile),
        hasTouch: Boolean(setup.hasTouch),
      });
      for (const view of views(data)) {
        report(`${view.name} (${setup.name})`, await checkView(context, base, view));
      }
      report(`search and compare (${setup.name})`, await checkSearchFlow(context, base, data.top));
      await context.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }
  if (failures) {
    console.log(`\n${failures} smoke check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll pages render their data.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
