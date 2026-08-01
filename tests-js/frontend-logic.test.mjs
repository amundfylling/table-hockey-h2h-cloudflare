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
const {
  getEffectiveAliasGroup,
  selectionsShareIdentity,
} = await import("../public/js/players.js");
const { applyFilters } = await import("../public/js/filters.js");
const { getSeriesGroupKey } = await import("../public/js/series.js");
const { sanitizeName } = await import("../public/js/share.js");
const { decodeHtmlEntities, parseOvertime } = await import("../public/js/utils.js");
const { fetchJson } = await import("../public/js/data.js");
const {
  allowsGenerationalMotion,
  getCurrentWinStreak,
  getStreakPresentation,
} = await import("../public/js/form.js?v=20260801-generational-run-v3");

function resultItem(ts, result, extra = {}) {
  return {
    ts,
    date: `2026-01-${String(ts).padStart(2, "0")}`,
    source_match_id: String(ts),
    result,
    ...extra,
  };
}

test("explicit alias members stay scoped while grouped selections stay grouped", () => {
  state.aliasMap.clear();
  state.aliasMap.set(1307, [1307, 2164]);
  state.aliasMap.set(2164, [1307, 2164]);

  assert.deepEqual(getEffectiveAliasGroup(1307, [1307]), [1307]);
  assert.deepEqual(getEffectiveAliasGroup(1307, [1307, 2164]), [1307, 2164]);
  assert.equal(selectionsShareIdentity([1307], [2164]), true);
  assert.equal(selectionsShareIdentity([1307], [9999]), false);
});

test("one-goal filter checks games inside an aggregated playoff series", () => {
  state.stageTab = "playoff";
  state.filters = {
    yearFrom: "all",
    yearTo: "all",
    tournament: "all",
    tournamentLevels: [],
    stage: "all",
    search: "",
    otOnly: false,
    tightOnly: true,
    bestOf: [],
  };
  const withTightGame = { goal_abs: 3, games: [{ goal_abs: 1 }, { goal_abs: 4 }] };
  const withoutTightGame = { goal_abs: 1, games: [{ goal_abs: 2 }, { goal_abs: 4 }] };

  assert.deepEqual(applyFilters([withTightGame, withoutTightGame]), [withTightGame]);
});

test("ID-less recurring tournaments do not merge into one playoff series", () => {
  const base = {
    tournament_id: null,
    tournament_key: "name:annual cup",
    source_tournament_id: "",
    stage_id: null,
    source_stage_id: "",
    stage_sequence: 1,
    stage: "Final",
    round_number: 1,
    opponent_id: 2,
  };
  assert.notEqual(
    getSeriesGroupKey({ ...base, date: "2025-01-01" }),
    getSeriesGroupKey({ ...base, date: "2026-01-01" })
  );
  assert.equal(
    getSeriesGroupKey({ ...base, date: "2025-01-01" }),
    getSeriesGroupKey({ ...base, date: "2025-01-02" })
  );
  assert.equal(
    getSeriesGroupKey({ ...base, source_tournament_id: "cup-1", date: "2025-01-01" }),
    getSeriesGroupKey({ ...base, source_tournament_id: "cup-1", date: "2025-01-02" })
  );
});

test("share filenames preserve non-Latin names and always have a fallback", () => {
  assert.equal(sanitizeName("Алексей Иванов"), "Алексей_Иванов");
  assert.equal(sanitizeName("***", "player_42"), "player_42");
});

test("invalid numeric HTML entities cannot abort player normalization", () => {
  assert.equal(decodeHtmlEntities("A &#1114112; B"), "A � B");
  assert.equal(decodeHtmlEntities("&#xD800;"), "�");
  assert.equal(decodeHtmlEntities("&#128512;"), "😀");
});

test("overtime parsing does not invert explicit negative labels", () => {
  assert.equal(parseOvertime("no overtime"), false);
  assert.equal(parseOvertime("1.0"), true);
  assert.equal(parseOvertime("unverified"), false);
});

test("JSON loads honor caller cancellation", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true }
    );
  });
  try {
    const controller = new AbortController();
    const request = fetchJson("/large-player.json", 20000, controller.signal);
    controller.abort();
    await assert.rejects(request, (error) => error?.name === "AbortError");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("current win streak is chronological and stops at losses or draws", () => {
  const tenWins = Array.from({ length: 10 }, (_, index) => resultItem(index + 2, "A"));
  const unsorted = [...tenWins, resultItem(1, "B")].reverse();
  assert.equal(getCurrentWinStreak(unsorted), 10);
  assert.equal(getCurrentWinStreak([...unsorted, resultItem(12, "D")]), 0);
  assert.equal(getCurrentWinStreak([...unsorted, resultItem(12, "B")]), 0);
  assert.equal(getCurrentWinStreak(tenWins.slice(0, 9)), 9);
});

test("generational runs require a genuine canonical streak and current endpoint", () => {
  const earlierWins = Array.from({ length: 5 }, (_, index) => resultItem(index + 1, "A"));
  const recentWins = Array.from({ length: 5 }, (_, index) => resultItem(index + 7, "A"));
  const canonicalWithBreak = [
    ...earlierWins,
    resultItem(6, "B"),
    ...recentWins,
  ];
  const manufacturedView = [...earlierWins, ...recentWins];
  const manufactured = getStreakPresentation(manufacturedView, canonicalWithBreak);
  assert.equal(manufactured.viewStreak, 10);
  assert.equal(manufactured.canonicalStreak, 5);
  assert.equal(manufactured.isGenerational, false);

  const genuineRun = Array.from({ length: 15 }, (_, index) => resultItem(index + 1, "A"));
  const currentView = genuineRun.slice(-10);
  const genuine = getStreakPresentation(currentView, genuineRun);
  assert.equal(genuine.isGenerational, true);
  assert.equal(genuine.streak, 15);

  const staleView = genuineRun.slice(0, 10);
  assert.equal(getStreakPresentation(staleView, genuineRun).isGenerational, false);
});

test("generational celebration stays static for accessibility and hidden pages", () => {
  const visible = {
    supportsObserver: true,
    visibilityState: "visible",
    reducedMotion: false,
    forcedColors: false,
  };
  assert.equal(allowsGenerationalMotion(visible), true);
  assert.equal(allowsGenerationalMotion({ ...visible, reducedMotion: true }), false);
  assert.equal(allowsGenerationalMotion({ ...visible, forcedColors: true }), false);
  assert.equal(allowsGenerationalMotion({ ...visible, visibilityState: "hidden" }), false);
  assert.equal(allowsGenerationalMotion({ ...visible, supportsObserver: false }), false);
});
