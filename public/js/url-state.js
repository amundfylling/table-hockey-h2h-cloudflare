import { state, elements } from "./state.js";
import { URL_PARAM_KEYS } from "./constants.js";
import { pageTitle } from "./page-title.js";
import {
  getPlayerById,
  normalizeAliasIds,
  resolvePlayerId,
  getSelectionIds,
  parseIdList,
  selectionsShareIdentity,
} from "./players.js";

// Changing who is shown (home, a player, a matchup) adds a history entry so the
// browser's Back button steps back through views. Filter and sort changes
// replace the current entry. Pushing is off until startup has restored the
// first view, and while a Back or Forward step is being restored.
let historyPushEnabled = false;

export function setHistoryPushEnabled(enabled) {
  historyPushEnabled = Boolean(enabled);
}

function writeUrl(url) {
  // Home section anchors (#records, #rivalries, #players) only belong on the home screen.
  url.hash = "";
  const current = new URLSearchParams(window.location.search);
  const changesView = ["p1", "p1g", "p2", "p2g"]
    .some((key) => (current.get(key) || "") !== (url.searchParams.get(key) || ""));
  if (historyPushEnabled && changesView) window.history.pushState({}, "", url);
  else window.history.replaceState({}, "", url);
  syncDocumentTitle();
}

function playerNameFromParam(value) {
  const id = Number.parseInt(value || "", 10);
  return (Number.isFinite(id) && getPlayerById(id)?.name) || "";
}

// Names the tab after the player or matchup in the URL, or the home section.
export function syncDocumentTitle() {
  const params = new URLSearchParams(window.location.search);
  const nameA = playerNameFromParam(params.get("p1"));
  const nameB = nameA ? playerNameFromParam(params.get("p2")) : "";
  const section = nameA ? "" : window.location.hash.slice(1);
  document.title = pageTitle({ nameA, nameB, section });
}

export function clearUrlSelection() {
  const url = new URL(window.location.href);
  URL_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
  writeUrl(url);
}

// p2 === null means "no opponent"; leave p2 out to read it from the opponent box.
export function updateUrl(p1, p2, p1Ids = [], p2Ids = []) {
  const idA = p1 || resolvePlayerId(elements.playerA);
  const fromInputs = p2 === undefined && p1 !== null;
  const idB = p2 || (fromInputs ? resolvePlayerId(elements.playerB) : null);
  const idsA = (p1Ids && p1Ids.length > 0) ? p1Ids : getSelectionIds(elements.playerA);
  const idsB = (p2Ids && p2Ids.length > 0)
    ? p2Ids
    : (fromInputs ? getSelectionIds(elements.playerB) : []);

  const url = new URL(window.location.href);
  if (!idA) {
    URL_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
    writeUrl(url);
    return;
  }

  url.searchParams.set("p1", idA);
  const groupA = normalizeAliasIds(idsA);
  if (groupA.length > 1) {
    url.searchParams.set("p1g", groupA.join(","));
  } else {
    url.searchParams.delete("p1g");
  }

  if (idB) {
    url.searchParams.set("p2", idB);
    const groupB = normalizeAliasIds(idsB);
    if (groupB.length > 1) {
      url.searchParams.set("p2g", groupB.join(","));
    } else {
      url.searchParams.delete("p2g");
    }
  } else {
    url.searchParams.delete("p2");
    url.searchParams.delete("p2g");
  }

  if (state.stageTab && state.stageTab !== "overall") {
    url.searchParams.set("stage", state.stageTab);
  } else {
    url.searchParams.delete("stage");
  }

  if (state.playoffMode && state.playoffMode !== "series") {
    url.searchParams.set("playoffMode", state.playoffMode);
  } else {
    url.searchParams.delete("playoffMode");
  }

  // Older links can carry goalsMode, a setting the page no longer has.
  url.searchParams.delete("goalsMode");

  if (state.filters.search) {
    url.searchParams.set("search", state.filters.search);
  } else {
    url.searchParams.delete("search");
  }

  if (state.filters.yearFrom && state.filters.yearFrom !== "all") {
    url.searchParams.set("yearFrom", state.filters.yearFrom);
  } else {
    url.searchParams.delete("yearFrom");
  }
  if (state.filters.yearTo && state.filters.yearTo !== "all") {
    url.searchParams.set("yearTo", state.filters.yearTo);
  } else {
    url.searchParams.delete("yearTo");
  }

  if (state.filters.tournament && state.filters.tournament !== "all") {
    url.searchParams.set("tournament", state.filters.tournament);
  } else {
    url.searchParams.delete("tournament");
  }

  if (state.filters.tournamentLevels && state.filters.tournamentLevels.length > 0) {
    url.searchParams.set("levels", state.filters.tournamentLevels.join(","));
  } else {
    url.searchParams.delete("levels");
  }

  if (state.filters.stage && state.filters.stage !== "all") {
    url.searchParams.set("stageDetail", state.filters.stage);
  } else {
    url.searchParams.delete("stageDetail");
  }

  if (state.filters.otOnly) {
    url.searchParams.set("ot", "true");
  } else {
    url.searchParams.delete("ot");
  }

  if (state.filters.tightOnly) {
    url.searchParams.set("tight", "true");
  } else {
    url.searchParams.delete("tight");
  }

  if (state.filters.bestOf && state.filters.bestOf.length > 0) {
    url.searchParams.set("bestOf", state.filters.bestOf.join(","));
  } else {
    url.searchParams.delete("bestOf");
  }

  writeUrl(url);
}

// Every view setting the query string carries, with its default when the URL leaves it out.
// Parsing gives a complete view, so restoring one (on load, Back or Forward) replaces the
// current settings instead of keeping whatever the previous view had.
export function parseViewParams(params) {
  const view = {
    stageTab: "overall",
    playoffMode: "series",
    filters: {
      yearFrom: "all",
      yearTo: "all",
      tournament: "all",
      tournamentLevels: [],
      stage: "all",
      search: "",
      otOnly: false,
      tightOnly: false,
      bestOf: [],
    },
  };
  const { filters } = view;

  const stage = params.get("stage");
  if (["overall", "round-robin", "playoff"].includes(stage)) view.stageTab = stage;

  const playoffMode = params.get("playoffMode");
  if (["series", "games"].includes(playoffMode)) view.playoffMode = playoffMode;

  const search = params.get("search");
  if (search) filters.search = search.slice(0, 120);

  const yearFrom = params.get("yearFrom");
  if (/^\d{4}$/.test(yearFrom || "")) filters.yearFrom = yearFrom;
  const yearTo = params.get("yearTo");
  if (/^\d{4}$/.test(yearTo || "")) filters.yearTo = yearTo;
  if (filters.yearFrom !== "all" && filters.yearTo !== "all" && filters.yearFrom > filters.yearTo) {
    [filters.yearFrom, filters.yearTo] = [filters.yearTo, filters.yearFrom];
  }

  const tournament = params.get("tournament");
  if (tournament) filters.tournament = tournament;

  const levels = params.get("levels");
  if (levels) filters.tournamentLevels = levels.split(",");

  const stageDetail = params.get("stageDetail");
  if (stageDetail) filters.stage = stageDetail;

  filters.otOnly = params.get("ot") === "true";
  filters.tightOnly = params.get("tight") === "true";

  const bestOf = params.get("bestOf");
  if (bestOf) filters.bestOf = bestOf.split(",");

  return view;
}

// Applies the view settings in the URL, resetting any it leaves out to their defaults.
// The selects are filled once the matches load (refreshFilterOptions reads state.filters).
export function restoreStateFromUrl() {
  const view = parseViewParams(new URLSearchParams(window.location.search));
  state.stageTab = view.stageTab;
  state.playoffMode = view.playoffMode;
  Object.assign(state.filters, view.filters);
  if (elements.searchFilter) elements.searchFilter.value = view.filters.search;
  if (elements.otToggle) elements.otToggle.checked = view.filters.otOnly;
  if (elements.tightToggle) elements.tightToggle.checked = view.filters.tightOnly;
}

export function getUrlSelection() {
  const params = new URLSearchParams(window.location.search);
  const p1 = params.get("p1");
  const p2 = params.get("p2");
  if (!p1) return null;
  const id1 = Number(p1);
  const id2 = p2 ? Number(p2) : null;
  if (!Number.isInteger(id1) || id1 <= 0 || (p2 && (!Number.isInteger(id2) || id2 <= 0))) {
    return null;
  }
  if (!state.playersById.has(id1) || (id2 && !state.playersById.has(id2))) return null;
  const getAllowedIds = (primaryId, value) => {
    const requested = normalizeAliasIds([primaryId, ...parseIdList(value)]);
    const allowed = new Set(state.aliasMap.get(primaryId) || [primaryId]);
    return requested.every((id) => allowed.has(id)) ? requested : [primaryId];
  };
  const p1Ids = getAllowedIds(id1, params.get("p1g"));
  const p2Ids = id2 ? getAllowedIds(id2, params.get("p2g")) : [];
  if (id2 && selectionsShareIdentity(p1Ids, p2Ids)) return null;
  return { p1: id1, p2: id2, p1Ids, p2Ids };
}
