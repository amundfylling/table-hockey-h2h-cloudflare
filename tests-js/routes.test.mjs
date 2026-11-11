import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const routes = JSON.parse(readFileSync(new URL("_routes.json", publicDir), "utf8"));

// Cloudflare treats "*" as a wildcard and everything else literally.
function matches(rule, path) {
  const pattern = rule
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(path);
}

const isExcluded = (path) => routes.exclude.some((rule) => matches(rule, path));

test("every request is routed to Functions unless a rule excludes it", () => {
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ["/*"]);
});

test("the routes file stays within Cloudflare's rule limits", () => {
  const rules = [...routes.include, ...routes.exclude];
  assert.ok(rules.length <= 100, `${rules.length} rules, the limit is 100`);
  for (const rule of rules) {
    assert.ok(rule.startsWith("/"), `${rule} must start with /`);
    assert.ok(rule.length <= 100, `${rule} is longer than 100 characters`);
  }
});

test("pages and legacy share links still reach the Functions", () => {
  const paths = [
    "/",
    "/index.html",
    "/tournament",
    "/tournaments",
    "/leaderboard",
    "/ratings",
    "/changelog",
    "/guide",
    "/h2h/1/2",
    "/h2h/1/2/",
  ];
  for (const path of paths) {
    assert.equal(isExcluded(path), false, `${path} must not be excluded`);
  }
});

test("scripts, fonts, styles and data files skip the Functions", () => {
  const paths = [
    "/data/players.json",
    "/data/h2h/1000.json",
    "/js/main.js",
    "/fonts/schibsted-grotesk-latin.woff2",
    "/katex/katex.min.css",
    "/guide/matchup-light-phone.webp",
    "/styles.css",
    "/aliases.json",
  ];
  for (const path of paths) {
    assert.equal(isExcluded(path), true, `${path} should be excluded`);
  }
});

test("every folder in public has an exclude rule", () => {
  const folders = readdirSync(publicDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.ok(folders.length > 0);
  for (const folder of folders) {
    assert.ok(
      routes.exclude.includes(`/${folder}/*`),
      `public/${folder}/ is not in _routes.json; add "/${folder}/*" to exclude, or route it on purpose`,
    );
  }
});

// Without a 404.html, Cloudflare Pages answers every missing address with index.html and status
// 200. fetchJson then gets HTML for a missing data file and fails to parse it instead of seeing
// the 404 it handles, and search engines see a copy of the home page at every mistyped address.
test("missing addresses get a real 404 page", () => {
  const html = readFileSync(new URL("404.html", publicDir), "utf8");
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  // The page is served at whatever address was missing, e.g. /a/b/c, so relative links would
  // point into that address instead of at the site's own files.
  const urls = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((match) => match[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^(\/|#|https:\/\/)/, `${url} in 404.html must be absolute`);
  }
});

// Modules found through imports load one level at a time, and /js/* is revalidated on every
// visit, so main.js's eight import levels cost eight round trips even with a warm cache. Each
// page names its whole module graph up front instead; this keeps those lists in step with the
// imports.
function importedModules(entry, seen = new Set()) {
  const source = readFileSync(new URL(`js/${entry}`, publicDir), "utf8");
  for (const [, dep] of source.matchAll(/(?:from|import)\s+"\.\/([\w-]+\.js)"/g)) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    importedModules(dep, seen);
  }
  return seen;
}

test("every page preloads exactly the modules its script imports", () => {
  const pages = readdirSync(publicDir).filter((name) => name.endsWith(".html"));
  assert.ok(pages.includes("index.html"));
  for (const page of pages) {
    const html = readFileSync(new URL(page, publicDir), "utf8");
    const entry = html.match(/<script type="module" src="\/?js\/([\w-]+\.js)/)?.[1];
    assert.ok(entry, `${page} has no module script`);
    const expected = [...importedModules(entry)].filter((name) => name !== entry).sort();
    const preloaded = [...html.matchAll(/<link rel="modulepreload" href="\/?js\/([\w-]+\.js)" \/>/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(preloaded, expected, `${page}: modulepreload links do not match the imports of ${entry}`);
  }
});
