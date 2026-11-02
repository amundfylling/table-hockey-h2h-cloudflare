import test from "node:test";
import assert from "node:assert/strict";
import { playoffGameChance, seriesWinChance } from "../public/js/forecast.js";

test("a drawn playoff game is shared out as win to loss", () => {
  assert.equal(playoffGameChance([0.43, 0.14, 0.43]), 0.5);
  assert.ok(Math.abs(playoffGameChance([0.6, 0.1, 0.3]) - 2 / 3) < 1e-12);
});

test("best of 7 between equals is even and favours the better player more than one game", () => {
  assert.ok(Math.abs(seriesWinChance(0.5) - 0.5) < 1e-12);
  assert.ok(seriesWinChance(0.6) > 0.6);
  assert.ok(Math.abs(seriesWinChance(0.6) - 0.710208) < 1e-6);
  assert.ok(Math.abs(seriesWinChance(0.3) + seriesWinChance(0.7) - 1) < 1e-12);
});

test("first to one is a single game", () => {
  assert.equal(seriesWinChance(0.37, 1), 0.37);
});
