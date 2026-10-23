import test from "node:test";
import assert from "node:assert/strict";

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = {
  location: { search: "", href: "https://example.test/" },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const {
  findComeback,
  findPeak,
  groupTournaments,
  leadSeries,
  recordEdge,
  scorelineGrid,
} = await import("../public/js/insights.js");

const games = (results) => [...results].map((result, i) => ({
  result,
  date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
}));

test("lead series counts wins minus losses and ignores draws", () => {
  assert.deepEqual(leadSeries(games("AADBB")), [1, 2, 2, 1, 0]);
});

test("comeback starts at the peak and counts both sides since", () => {
  const ordered = games(`${"A".repeat(30)}${"B".repeat(12)}A`);
  const lead = leadSeries(ordered);
  assert.equal(findPeak(lead), 29);
  const comeback = findComeback(ordered, lead);
  assert.equal(comeback.leader, "a");
  assert.equal(comeback.winsTrailer, 12);
  assert.equal(comeback.winsLeader, 1);
});

test("record colour follows wins against losses, not win rate", () => {
  // 73-6-70 is under 50% wins but still a winning record.
  assert.equal(recordEdge(73, 70), "a");
  assert.equal(recordEdge(42, 81), "b");
  assert.equal(recordEdge(5, 5), "d");
});

test("tournaments are grouped newest first with a winner each", () => {
  const groups = groupTournaments([
    { tournament_id: 1, tournament_name: "Old", date: "2023-01-01", ts: 1, result: "A", goals_a: 3, goals_b: 1 },
    { tournament_id: 2, tournament_name: "New", date: "2024-01-01", ts: 2, result: "B", goals_a: 1, goals_b: 3 },
    { tournament_id: 2, tournament_name: "New", date: "2024-01-01", ts: 3, result: "B", goals_a: 0, goals_b: 2 },
  ]);
  assert.deepEqual(groups.map((g) => [g.name, g.games.length, g.winner]), [["New", 2, "b"], ["Old", 1, "a"]]);
});

test("scoreline grid caps high scores into the last bucket", () => {
  const grid = scorelineGrid([
    { goals_a: 9, goals_b: 1, result: "A" },
    { goals_a: 3, goals_b: 2, result: "A" },
    { goals_a: 3, goals_b: 2, result: "A" },
  ]);
  assert.equal(grid.cells.get(`${grid.cap}:1`).count, 1);
  assert.equal(grid.best.count, 2);
});
