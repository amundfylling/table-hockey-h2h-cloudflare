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

const { state } = await import("../public/js/state.js");
const { fetchPlayerPayload, loadMatchup, loadPlayerStats } = await import("../public/js/data.js");

// Player 1 has met player 2; every other id is a player with no games.
function playerFile(id) {
  const opponents = {};
  if (id === 1 || id === 2) {
    const other = id === 1 ? 2 : 1;
    opponents[String(other)] = {
      player: { id: other, name: `Player ${other}` },
      summary: { total_matches: 1 },
      matches: [{ date: "2026-01-01", goals_for_player: 3, goals_for_opponent: 1 }],
      forecast: [0.5, 0.2, 0.3],
    };
  }
  return { player: { id, name: `Player ${id}` }, rating: { rating: 1500 }, opponents };
}

let requests = [];
globalThis.fetch = async (url) => {
  requests.push(url);
  const id = Number(String(url).match(/h2h\/(\d+)\.json/)?.[1]);
  return { ok: true, status: 200, json: async () => playerFile(id) };
};

function reset() {
  state.playerFileCache.clear();
  state.playerFileRequests.clear();
  state.playerStatsCache.clear();
  state.pairCache.clear();
  state.aliasMap.clear();
  requests = [];
}

async function browseOtherPlayers() {
  for (let id = 100; id < 120; id += 1) await fetchPlayerPayload(id);
}

test("a cached player view loads its player file again once the file cache dropped it", async () => {
  reset();
  await loadPlayerStats(1);
  await browseOtherPlayers();
  assert.equal(state.playerFileCache.has(1), false);

  await loadPlayerStats(1);
  // The rating chart, nation chart and story rail read the rating from this file.
  assert.equal(state.playerFileCache.get(1)?.rating?.rating, 1500);
});

test("a cached matchup loads its player file again once the file cache dropped it", async () => {
  reset();
  await loadMatchup(1, 2);
  await browseOtherPlayers();
  assert.equal(state.playerFileCache.has(1), false);

  await loadMatchup(1, 2);
  // The "If they met today" forecast reads this file.
  assert.deepEqual(state.playerFileCache.get(1)?.opponents?.["2"]?.forecast, [0.5, 0.2, 0.3]);
});

test("the player file cache keeps the most recently used files", async () => {
  reset();
  await fetchPlayerPayload(1);
  for (let id = 100; id < 111; id += 1) {
    await fetchPlayerPayload(id);
    await fetchPlayerPayload(1);
  }
  await fetchPlayerPayload(111);
  assert.equal(state.playerFileCache.has(1), true);
  assert.equal(requests.filter((url) => url.endsWith("/1.json")).length, 1);
});
