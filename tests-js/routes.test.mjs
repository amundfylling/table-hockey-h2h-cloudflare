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
