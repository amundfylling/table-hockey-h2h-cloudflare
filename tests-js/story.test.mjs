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

const { groupTournaments, scorelineGrid, seasonsOf } = await import("../public/js/insights.js");
const {
  bestSeason,
  leadTakenAt,
  matchupStory,
  playerStory,
  seasonRun,
} = await import("../public/js/story-lines.js");

// One game per result, a year apart unless `perYear` is given.
const games = (results, { start = 2010, perYear = 1, score = [3, 2] } = {}) => [...results].map((result, i) => {
  const year = start + Math.floor(i / perYear);
  const [w, l] = score;
  return {
    result,
    year: String(year),
    date: `${year}-03-${String((i % perYear) + 1).padStart(2, "0")}`,
    ts: i + 1,
    goals_a: result === "A" ? w : result === "B" ? l : 1,
    goals_b: result === "A" ? l : result === "B" ? w : 1,
    tournament_id: i + 1,
    tournament_name: `Cup ${i + 1}`,
  };
});

test("leadTakenAt finds when the leader went ahead for good", () => {
  assert.equal(leadTakenAt([1, 2, 3]), -1);
  assert.equal(leadTakenAt([0, 1, 2]), -1);
  assert.equal(leadTakenAt([-1, 0, 1, 2]), 2);
  assert.equal(leadTakenAt([1, 0, -1, -2]), 2);
  assert.equal(leadTakenAt([1, 0]), null);
});

test("seasonRun and bestSeason", () => {
  const seasons = [
    { year: "2019", a: 1, b: 5, d: 0 },
    { year: "2020", a: 6, b: 2, d: 0 },
    { year: "2021", a: 7, b: 1, d: 0 },
  ];
  assert.deepEqual(seasonRun(seasons), { side: "a", count: 2, since: "2020" });
  // A two-game season does not beat a full one.
  const best = bestSeason([...seasons, { year: "2022", a: 2, b: 0, d: 0 }]);
  assert.equal(best.year, "2021");
});

test("matchup story names the leader, the lead change and the common score", () => {
  const ordered = games("BBAAAAA");
  const story = matchupStory({
    ordered,
    nameA: "Herman Steen",
    nameB: "Lars-Erik Svensson",
    tournaments: groupTournaments(ordered),
    grid: scorelineGrid(ordered),
    seasons: seasonsOf(ordered),
  });
  assert.equal(story.record, "Steen leads 5–2");
  assert.equal(story.lead, "Steen has led since Mar 2014");
  assert.equal(story.tape, "3–2 to Steen is the most common score");
  assert.equal(story.seasons, "Steen has won every season since 2012");
  assert.equal(story.tournaments, "Steen won 5 of 7 tournaments");
  assert.equal(story.games, "7 games since 2010");
});

test("matchup story handles a level record and a clean sweep", () => {
  const level = games("ABAB", { perYear: 4 });
  const story = matchupStory({ ordered: level, nameA: "A One", nameB: "B Two", seasons: seasonsOf(level) });
  assert.equal(story.record, "Level at 2–2");
  assert.equal(story.lead, "Dead level after 4 games");
  assert.equal(story.games, "4 games in 2010");
  assert.equal(story.seasons, undefined);

  const sweep = games("AAA");
  assert.equal(matchupStory({ ordered: sweep, nameA: "A One", nameB: "B Two" }).lead, "One has never trailed");
});

test("player story summarises rating, nations and opponents", () => {
  const ordered = games("AABA", { perYear: 2 }).map((g, i) => ({ ...g, opponent_id: i < 3 ? 7 : 8 }));
  const records = [
    { id: 7, name: "Joakim Åström", games: 3, wins: 2, losses: 1, draws: 0 },
    { id: 8, name: "Urban Edmundsson", games: 1, wins: 1, losses: 0, draws: 0 },
  ];
  const story = playerStory({
    ordered,
    rating: { rating: 1932.4, peak: { rating: 1947, date: "2024-02-10" } },
    edges: { rows: [{}, {}], over: [], under: [{ nation: "Latvia" }], overall: { clear: false } },
    seasons: seasonsOf(ordered),
    records,
  });
  assert.equal(story.overview, "4 games, 75.0% won");
  assert.equal(story.rating, "1,932 now, peak 1,947 in Feb 2024");
  assert.equal(story.nations, "Underperforms against Latvia");
  assert.equal(story.opponents, "2 opponents, Åström most often");
  assert.equal(story.games, "Last played 2 Mar 2011");

  const peakNow = playerStory({ ordered, rating: { rating: 1950, peak: { rating: 1950, date: "2026-01-01" } } });
  assert.equal(peakNow.rating, "At a career high of 1,950");
});
