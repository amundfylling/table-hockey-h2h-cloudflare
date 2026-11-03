import test from "node:test";
import assert from "node:assert/strict";

// The page modules load the theme, which sets the theme on import.
globalThis.document = {
  body: { setAttribute: () => {} },
  documentElement: { style: {} },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = {
  location: { search: "", href: "https://example.test/" },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const { rowsFromTable, matchesQuery } = await import("../public/js/browse.js");
const { visiblePlayers, withWorldRankGap } = await import("../public/js/leaderboard-page.js");
const { visibleTournaments } = await import("../public/js/tournaments-page.js");

const players = rowsFromTable({
  fields: ["id", "name", "nation", "rating", "change", "peak", "games", "last_played"],
  players: [
    [1, "Ann Åsen", "Norway", 1900, 10, 1950, 500, "2026-10-01"],
    [2, "Bo", "Sweden", 1850, null, 1860, 300, "2026-09-01"],
    [3, "Cy", "Norway", 1800, 40, null, 900, "2020-01-01"],
  ],
}, "players");

const defaults = {
  query: "", nation: "", active: false, cutoff: "2025-11-03", sort: "rating", ascending: false,
};

test("rowsFromTable names each value by its field", () => {
  assert.deepEqual(players[1], {
    id: 2, name: "Bo", nation: "Sweden", rating: 1850, change: null, peak: 1860, games: 300,
    last_played: "2026-09-01",
  });
  assert.deepEqual(rowsFromTable(null, "players"), []);
});

test("matchesQuery ignores accents, case and word order", () => {
  assert.ok(matchesQuery("Ann Åsen", "asen ann"));
  assert.ok(!matchesQuery("Ann Åsen", "bo"));
  assert.ok(matchesQuery("anything", "  "));
});

test("leaderboard ranks by rating among the players the filters keep", () => {
  const norway = visiblePlayers(players, { ...defaults, nation: "Norway" });
  assert.deepEqual(norway.map((p) => [p.id, p.rank]), [[1, 1], [3, 2]]);
  const active = visiblePlayers(players, { ...defaults, active: true });
  assert.deepEqual(active.map((p) => p.id), [1, 2]);
  assert.deepEqual(visiblePlayers(players, { ...defaults, query: "åsen" }).map((p) => p.id), [1]);
});

test("leaderboard sorts by a column with missing values last, keeping the rating rank", () => {
  const byChange = visiblePlayers(players, { ...defaults, sort: "change" });
  assert.deepEqual(byChange.map((p) => [p.id, p.rank]), [[3, 3], [1, 1], [2, 2]]);
  const up = visiblePlayers(players, { ...defaults, sort: "change", ascending: true });
  assert.deepEqual(up.map((p) => p.id), [1, 3, 2]);
  const byPeak = visiblePlayers(players, { ...defaults, sort: "peak" });
  assert.deepEqual(byPeak.map((p) => p.id), [1, 2, 3]);
});

test("tournaments filter by year, country, level and search text", () => {
  const tournaments = [
    { id: 1, year: "2026", country: "Norway", levelKey: "2", searchText: "Oslo Open Ann" },
    { id: 2, year: "2025", country: "Norway", levelKey: "5", searchText: "Bergen Cup Bo" },
    { id: 3, year: "2026", country: "Sweden", levelKey: "", searchText: "SM Cy" },
  ];
  const run = (filters) => visibleTournaments(tournaments, {
    query: "", year: "", country: "", level: "", ...filters,
  }).map((t) => t.id);
  assert.deepEqual(run({}), [1, 2, 3]);
  assert.deepEqual(run({ year: "2026" }), [1, 3]);
  assert.deepEqual(run({ country: "Norway", level: "5" }), [2]);
  assert.deepEqual(run({ query: "ann" }), [1]);
});

test("vs WR compares the world rank with the place by rating among world-ranked players", () => {
  const ranked = withWorldRankGap([
    { id: 1, rating: 2000, world_rank: 5 },
    { id: 2, rating: 1990, world_rank: null },
    { id: 3, rating: 1980, world_rank: 1 },
  ]);
  assert.deepEqual(ranked.map((p) => p.wr_gap), [4, null, -1]);
  const byGap = visiblePlayers(ranked, { ...defaults, sort: "gap" });
  assert.deepEqual(byGap.map((p) => p.id), [1, 3, 2]);
  const byWr = visiblePlayers(ranked, { ...defaults, sort: "wr" });
  assert.deepEqual(byWr.map((p) => p.id), [3, 1, 2]);
});

test("vs WR counts only the players in the Active or All time view", () => {
  const list = [
    { id: 1, rating: 2100, world_rank: 5, last_played: "2020-01-01" },
    { id: 2, rating: 2090, world_rank: 1, last_played: "2026-10-10" },
    { id: 3, rating: 2080, world_rank: 2, last_played: "2026-10-01", nation: "Norway" },
  ];
  const active = visiblePlayers(list, { ...defaults, active: true });
  assert.deepEqual(active.map((p) => [p.id, p.wr_gap]), [[2, 0], [3, 0]]);
  const all = visiblePlayers(list, { ...defaults });
  assert.deepEqual(all.map((p) => [p.id, p.wr_gap]), [[1, 4], [2, -1], [3, -1]]);
  // A nation filter does not change the place.
  const norway = visiblePlayers(list, { ...defaults, active: true, nation: "Norway" });
  assert.deepEqual(norway.map((p) => [p.id, p.wr_gap]), [[3, 0]]);
});

test("minimum games narrows the view and the vs WR place with it", () => {
  const list = [
    { id: 1, rating: 2100, world_rank: 3, games: 60 },
    { id: 2, rating: 2090, world_rank: 1, games: 900 },
    { id: 3, rating: 2080, world_rank: 2, games: 1200 },
  ];
  const all = visiblePlayers(list, { ...defaults });
  assert.deepEqual(all.map((p) => [p.id, p.wr_gap]), [[1, 2], [2, -1], [3, -1]]);
  const seasoned = visiblePlayers(list, { ...defaults, minGames: 500 });
  assert.deepEqual(seasoned.map((p) => [p.id, p.rank, p.wr_gap]), [[2, 1, 0], [3, 2, 0]]);
});
