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

const { buildGameContext } = await import("../public/js/game-context.js");

let nextId = 1;
const game = (date, goalsA, goalsB, extra = {}) => ({
  date,
  ts: Date.parse(date),
  tournament_id: 1,
  tournament_key: "id:1",
  stage: "Round-Robin",
  stage_type: "round-robin",
  stage_id: 10,
  stage_sequence: 1,
  round_number: null,
  playoff_game_number: null,
  goals_a: goalsA,
  goals_b: goalsB,
  goal_abs: Math.abs(goalsA - goalsB),
  result: goalsA > goalsB ? "A" : goalsA < goalsB ? "B" : "D",
  overtime: false,
  source_match_id: String(nextId++),
  ...extra,
});

const playoff = (number, goalsA, goalsB) =>
  game("2026-09-05", goalsA, goalsB, {
    stage: "Playoff",
    stage_type: "playoff",
    stage_id: 20,
    stage_sequence: 2,
    playoff_game_number: number,
  });

test("playoff game shows its series and the clinching game", () => {
  const earlier = game("2026-08-01", 2, 2, { tournament_id: 0, tournament_key: "id:0" });
  const roundRobin = game("2026-09-05", 3, 2, { round_number: 4 });
  const series = [playoff(1, 0, 5), playoff(2, 5, 1), playoff(3, 5, 1), playoff(4, 5, 1)];
  const all = [earlier, roundRobin, ...series];

  const context = buildGameContext(series[3], all);
  assert.equal(context.series.winsA, 3);
  assert.equal(context.series.winsB, 1);
  assert.equal(context.series.clinched, true);
  assert.deepEqual(context.series.tiles.map((tile) => tile.isCurrent), [false, false, false, true]);
  assert.deepEqual(context.recordAfter, { winsA: 4, winsB: 1, draws: 1 });
  assert.equal(context.previous.match, roundRobin);
  assert.equal(context.previous.sameDay, true);

  const middle = buildGameContext(series[1], all);
  assert.equal(middle.series.clinched, false);
  assert.equal(middle.series.gameNumber, 2);
  assert.deepEqual(middle.recordAfter, { winsA: 2, winsB: 1, draws: 1 });
});

test("round-robin game lists tournament meetings and skips them for the previous meeting", () => {
  const older = game("2025-01-01", 1, 4, { tournament_id: 2, tournament_key: "id:2" });
  const first = game("2026-02-01", 2, 1, { round_number: 1 });
  const second = game("2026-02-01", 0, 1, { round_number: 2 });
  const context = buildGameContext(second, [second, first, older]);

  assert.equal(context.series, null);
  assert.equal(context.tournament.tiles.length, 2);
  assert.equal(context.tournament.tiles[0].label, "R1");
  assert.equal(context.meetingNumber, 3);
  assert.equal(context.totalMeetings, 3);
  assert.equal(context.previous.match, older);
  assert.equal(context.previous.sameDay, false);
});

test("first ever meeting has no previous game", () => {
  const only = game("2020-01-01", 1, 0);
  const context = buildGameContext(only, [only]);
  assert.equal(context.previous, null);
  assert.equal(context.tournament, null);
  assert.deepEqual(context.recordAfter, { winsA: 1, winsB: 0, draws: 0 });
});
