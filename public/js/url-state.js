import { state, elements } from "./state.js";
import { URL_PARAM_KEYS } from "./constants.js";
import {
  normalizeAliasIds,
  resolvePlayerId,
  getSelectionIds,
  parseIdList,
  selectionsShareIdentity,
} from "./players.js";

export function clearUrlSelection() {
  const url = new URL(window.location.href);
  URL_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, "", url);
}

export function updateUrl(p1, p2 = null, p1Ids = [], p2Ids = []) {
  const idA = p1 || resolvePlayerId(elements.playerA);
  const idB = p2 || (p1 === null ? null : resolvePlayerId(elements.playerB));
  const idsA = (p1Ids && p1Ids.length > 0) ? p1Ids : getSelectionIds(elements.playerA);
  const idsB = (p2Ids && p2Ids.length > 0) ? p2Ids : (p1 === null ? [] : getSelectionIds(elements.playerB));

  const url = new URL(window.location.href);
  if (!idA) {
    URL_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url);
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

  if (state.goalsMode && state.goalsMode !== "series") {
    url.searchParams.set("goalsMode", state.goalsMode);
  } else {
    url.searchParams.delete("goalsMode");
  }

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

  window.history.replaceState({}, "", url);
}

export function restoreStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const stage = params.get("stage");
  if (["overall", "round-robin", "playoff"].includes(stage)) {
    state.stageTab = stage;
  }

  const playoffMode = params.get("playoffMode");
  if (["series", "games"].includes(playoffMode)) {
    state.playoffMode = playoffMode;
  }

  const goalsMode = params.get("goalsMode");
  if (["series", "match"].includes(goalsMode)) {
    state.goalsMode = goalsMode;
  }

  const search = params.get("search");
  if (search) {
    state.filters.search = search.slice(0, 120);
    if (elements.searchFilter) elements.searchFilter.value = state.filters.search;
  }

  const yearFrom = params.get("yearFrom");
  if (/^\d{4}$/.test(yearFrom || "")) {
    state.filters.yearFrom = yearFrom;
  }
  const yearTo = params.get("yearTo");
  if (/^\d{4}$/.test(yearTo || "")) {
    state.filters.yearTo = yearTo;
  }
  if (
    state.filters.yearFrom !== "all"
    && state.filters.yearTo !== "all"
    && state.filters.yearFrom > state.filters.yearTo
  ) {
    [state.filters.yearFrom, state.filters.yearTo] = [
      state.filters.yearTo,
      state.filters.yearFrom,
    ];
  }

  const tournament = params.get("tournament");
  if (tournament) {
    state.filters.tournament = tournament;
  }

  const levels = params.get("levels");
  if (levels) {
    state.filters.tournamentLevels = levels.split(",");
  }

  const stageDetail = params.get("stageDetail");
  if (stageDetail) {
    state.filters.stage = stageDetail;
  }

  const ot = params.get("ot");
  if (ot === "true") {
    state.filters.otOnly = true;
    if (elements.otToggle) elements.otToggle.checked = true;
  }

  const tight = params.get("tight");
  if (tight === "true") {
    state.filters.tightOnly = true;
    if (elements.tightToggle) elements.tightToggle.checked = true;
  }

  const bestOf = params.get("bestOf");
  if (bestOf) {
    state.filters.bestOf = bestOf.split(",");
  }
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
