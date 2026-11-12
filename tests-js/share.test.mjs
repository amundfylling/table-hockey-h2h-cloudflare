import assert from "node:assert/strict";
import test from "node:test";

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = {
  location: { search: "", href: "https://example.test/" },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const { shareScope, pickFindings, shortNames, themeChange } = await import("../public/js/share.js");
const { wrapRuns } = await import("../public/js/share-card.js");

test("share scope names the view and its filters", () => {
  assert.equal(shareScope({}), "Head-to-head · All games");
  assert.equal(shareScope({ single: true, stageTab: "playoff", series: true }), "Career · Playoff series");
  assert.equal(
    shareScope({ stageTab: "round-robin", yearFrom: "2020", yearTo: "all", otherFilters: 2 }),
    "Head-to-head · Round-robin · 2020–now · 2 filters",
  );
  assert.equal(shareScope({ yearFrom: "all", yearTo: "2019" }), "Head-to-head · All games · To 2019");
  assert.equal(shareScope({ yearFrom: "2024", yearTo: "2024", tournament: "Norway Open" }),
    "Head-to-head · All games · 2024 · Norway Open");
});

test("share findings skip what the headline already says", () => {
  const story = {
    seasons: "Steen has won every season since 2021",
    lead: "Svensson has won 12–4 since Mar 2025",
    tape: "5–3 to Steen is the most common score",
  };
  const headline = "Steen leads by 9 wins, but the gap is closing: Svensson has won 12 to 4 since Mar 2025.";
  assert.deepEqual(
    pickFindings(story, ["seasons", "lead", "tape", "missing"], headline, 3).map((f) => f.text),
    [story.seasons, story.tape],
  );
  assert.equal(pickFindings(story, ["seasons", "lead", "tape"], "", 2).length, 2);
});

test("players who share a surname are told apart by first name", () => {
  assert.deepEqual(shortNames("Magnus Klippen", "Amund Risa Fylling"), ["Klippen", "Fylling"]);
  assert.deepEqual(shortNames("Øystein Klippen", "Vegard Klippen"), ["Øystein", "Vegard"]);
});

test("headline wraps by words and ends in an ellipsis when it runs out of lines", () => {
  const measure = (word) => word.text.length * 10;
  const parts = [{ text: "Steen leads by 9 wins and " }, { text: "has won four of the last five", strong: true }];
  const two = wrapRuns(measure, parts, 200, 2);
  assert.equal(two.length, 2);
  assert.ok(two[1][two[1].length - 1].text.endsWith("…"));
  const wide = wrapRuns(measure, parts, 10000, 2);
  assert.equal(wide.length, 1);
  assert.deepEqual(wide[0].map((run) => run.strong), [false, true]);
});

test("a theme tap before the card data is ready only records the theme", () => {
  assert.equal(themeChange("light", "light", true), "none");
  assert.equal(themeChange("light", "dark", true), "render");
  assert.equal(themeChange("light", "dark", false), "remember");
});
