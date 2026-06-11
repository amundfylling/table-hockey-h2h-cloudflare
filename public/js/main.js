import {
  state,
  elements,
  STORAGE_KEYS,
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  isSeriesMode,
  isSinglePlayerMode,
  getStatsMode,
} from "./state.js";
import { URL_PARAM_KEYS } from "./constants.js";
import {
  normalizeAliasIds,
  resolvePlayerId,
  setInputPlayer,
  clearInputPlayer,
  getSelectionPlayer,
  getSelectionIds,
  getPlayerById,
  parseIdList,
  normalizePlayerRecord,
} from "./players.js";
import { decodeHtmlEntities } from "./utils.js";
import {
  loadPlayerStats,
  loadMatchup,
  loadOpponentsForPlayer,
  fetchJson,
} from "./data.js";
import { buildPlayoffSeries, annotatePlayoffGamesWithSeries } from "./series.js";
import {
  initFilters,
  applyFilters,
  refreshFilterOptions,
  resetFilters,
  updateFilterCount,
} from "./filters.js";
import { setupTypeahead } from "./typeahead.js";
import { renderSummary } from "./summary.js";
import { renderForm } from "./form.js";
import { renderCharts } from "./charts.js";
import {
  renderTable,
  initTable,
  getTableColumns,
  sortMatches,
} from "./table.js";
import { setTheme, toggleTheme, initInfoPopovers } from "./theme.js";
import { handleShareImage } from "./share.js";

// Global functions that were in app.js
let compareRequestToken = 0;

export function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

export function setLoading(isLoading) {
  state.loading = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  if (elements.compareBtn) elements.compareBtn.disabled = isLoading;
}

export function updateStageMeta() {
  const total = state.baseMatches.length;
  const rr = state.baseMatches.filter((match) => match.stage_type === "round-robin").length;
  const playoffMatches = state.baseMatches.filter((match) => match.stage_type === "playoff");
  const po = playoffMatches.length;
  const series = buildPlayoffSeries(playoffMatches).length;
  if (elements.stageMeta) {
    elements.stageMeta.textContent = `Overall ${total}, Round-robin ${rr}, Playoff ${po} games / ${series} series`;
  }
}

export function updateModeControls() {
  const inPlayoff = state.stageTab === "playoff";
  if (elements.playoffModeToggle) {
    elements.playoffModeToggle.hidden = !inPlayoff;
  }
  if (elements.modeButtons) {
    elements.modeButtons.forEach((button) => {
      const isActive = button.dataset.mode === state.playoffMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  document.body.dataset.statsMode = getStatsMode();
  document.body.dataset.comparisonMode = state.comparisonMode;
}

export function getActiveItems() {
  const stageMatches = applyStageTab(state.baseMatches, state.stageTab);
  if (state.stageTab === "playoff" && state.playoffMode === "series") {
    return buildPlayoffSeries(stageMatches);
  }
  if (state.stageTab === "playoff") {
    return annotatePlayoffGamesWithSeries(stageMatches);
  }
  return stageMatches;
}

function applyStageTab(matches, stageTab) {
  if (stageTab === "round-robin") {
    return matches.filter((match) => match.stage_type === "round-robin");
  }
  if (stageTab === "playoff") {
    return matches.filter((match) => match.stage_type === "playoff");
  }
  return matches;
}

export function updateView() {
  if (!state.baseMatches.length) {
    setDataControlsEnabled(false);
    updateModeControls();
    updateFilterCount();
    renderSummary([]);
    renderForm([]);
    renderCharts([]);
    renderTable([]);
    return;
  }

  setDataControlsEnabled(true);
  updateModeControls();
  state.stageMatches = getActiveItems();
  const filtered = applyFilters(state.stageMatches);
  state.filteredMatches = sortMatches(filtered);
  const totalPages = Math.max(1, Math.ceil(state.filteredMatches.length / state.perPage));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  renderSummary(state.filteredMatches);
  renderForm(state.filteredMatches);
  renderCharts(state.filteredMatches);
  renderTable(state.filteredMatches);
  updateFilterCount();
  updateUrl();
}

export function setDataControlsEnabled(enabled) {
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      tab.disabled = !enabled;
    });
  }
}

export function clearUrlSelection() {
  const url = new URL(window.location.href);
  URL_PARAM_KEYS.forEach((key) => url.searchParams.delete(key));
  window.history.replaceState({}, "", url);
}

export function setStageTabControls(stage = "overall") {
  state.stageTab = stage;
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      const isActive = tab.dataset.stage === stage;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }
  updateModeControls();
}

export function renderIdleState() {
  const selectedId = resolvePlayerId(elements.playerA);
  const selectedPlayer = selectedId ? getSelectionPlayer(elements.playerA, selectedId) : null;

  if (elements.emptyState) elements.emptyState.hidden = true;
  if (elements.errorState) elements.errorState.hidden = true;
  if (elements.headline) {
    elements.headline.textContent = selectedPlayer ? selectedPlayer.name : "Pick a player";
  }
  if (elements.subhead) {
    elements.subhead.textContent = selectedPlayer
      ? "Choose an opponent to compare, or view all games below."
      : "Search for a player to start.";
  }
  if (elements.record) {
    elements.record.hidden = true;
    elements.record.replaceChildren();
  }
  if (elements.summaryGrid) elements.summaryGrid.replaceChildren();
  if (elements.formTitle) elements.formTitle.textContent = "Recent form";
  if (elements.formChips) {
    elements.formChips.replaceChildren();
    const formMessage = document.createElement("span");
    formMessage.className = "muted";
    formMessage.textContent = selectedPlayer ? "No view loaded" : "No selection";
    elements.formChips.appendChild(formMessage);
  }

  // Local helper for chart placeholders
  const renderPlaceholder = (el, msg, icon) => {
    if (!el) return;
    el.replaceChildren();
    const ph = document.createElement("div");
    ph.className = "chart-placeholder";
    const svgInner = icon === "trend"
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`;
    ph.innerHTML = `${svgInner} <span>${msg}</span>`;
    el.appendChild(ph);
  };

  renderPlaceholder(
    elements.recordChart,
    selectedPlayer ? "Select a player to build the record." : "No selection",
    "trend"
  );
  renderPlaceholder(
    elements.goalsChart,
    selectedPlayer ? "Select a player to see yearly scoring." : "No selection",
    "bar"
  );

  if (elements.matchCount) elements.matchCount.textContent = "0 matches";
  
  // Render table headers and empty state row
  renderTable([]);
  
  if (elements.matchesBody) {
    elements.matchesBody.replaceChildren();
    const row = document.createElement("tr");
    row.className = "empty-table-row";
    const cell = document.createElement("td");
    cell.colSpan = getTableColumns().length;
    cell.textContent = selectedPlayer ? "Select a player to show matches." : "Select a player to show matches.";
    row.appendChild(cell);
    elements.matchesBody.appendChild(row);
  }
}

export function resetCurrentResults(options = {}) {
  const keepPlayerA = Boolean(options.keepPlayerA);
  state.baseMatches = [];
  state.stageMatches = [];
  state.filteredMatches = [];
  state.playerA = keepPlayerA ? getSelectionPlayer(elements.playerA, resolvePlayerId(elements.playerA)) : null;
  state.playerB = null;
  state.comparisonMode = keepPlayerA ? "single" : "matchup";
  state.page = 1;
  state.sort = { key: "date", direction: "desc" };
  resetFilters();
  setStageTabControls("overall");
  setDataControlsEnabled(false);
  if (elements.stageMeta) elements.stageMeta.textContent = "";
  updateFilterCount();
  renderIdleState();
  if (options.clearStoredSelection) safeStorageRemove(STORAGE_KEYS.last);
  if (options.clearUrl) clearUrlSelection();
  if (options.message != null) setStatus(options.message);
}

export async function handleCompare(options = {}) {
  const idA = resolvePlayerId(elements.playerA);
  const idB = resolvePlayerId(elements.playerB);
  const idsA = getSelectionIds(elements.playerA);
  const idsB = getSelectionIds(elements.playerB);
  const isSingle = !idB;

  if (!idA) {
    setStatus("Select a valid player.");
    return;
  }
  if (!isSingle && idsA.some((id) => idsB.includes(id))) {
    setStatus("Choose two different players.");
    return;
  }

  // Increment token to invalidate any previous running comparison request
  compareRequestToken += 1;
  const currentToken = compareRequestToken;

  setLoading(true);
  setStatus(isSingle ? "Loading player stats..." : "Loading matchup...");
  state.baseMatches = [];
  state.stageMatches = [];
  state.filteredMatches = [];
  if (elements.stageMeta) elements.stageMeta.textContent = "";
  setDataControlsEnabled(false);
  if (elements.emptyState) elements.emptyState.hidden = true;
  if (elements.errorState) elements.errorState.hidden = true;
  renderSummarySkeleton();
  renderTableSkeleton();

  try {
    const data = isSingle
      ? await loadPlayerStats(idA, (current, total) => {
          if (currentToken !== compareRequestToken) return;
          setStatus(`Loading player files ${current}/${total}...`);
        }, idsA)
      : await loadMatchup(idA, idB, (current, total) => {
          if (currentToken !== compareRequestToken) return;
          setStatus(`Loading chunks ${current}/${total}...`);
        }, idsA, idsB);

    if (currentToken !== compareRequestToken) {
      return;
    }

    state.playerA = getSelectionPlayer(elements.playerA, idA) || data?.playerA || { id: idA, name: `Player ${idA}` };
    state.playerB = isSingle
      ? data?.playerB || { id: null, name: "Opponents" }
      : getSelectionPlayer(elements.playerB, idB) || data?.playerB || { id: idB, name: `Player ${idB}` };
    state.comparisonMode = isSingle ? "single" : "matchup";

    if (!data || !data.matches.length) {
      if (elements.emptyState) elements.emptyState.hidden = false;
      state.baseMatches = [];
      state.filteredMatches = [];
      if (elements.stageMeta) elements.stageMeta.textContent = "";
      setDataControlsEnabled(false);
      renderSummary([]);
      renderForm([]);
      renderCharts([]);
      renderTable([]);
      setLoading(false);
      setStatus("No matches found.");
      return;
    }

    state.baseMatches = data.matches;
    state.page = 1;
    state.sort = { key: "date", direction: "desc" };
    state.perPage = Number(elements.pageSize.value);

    if (options.restoreUrlState) {
      if (elements.tabs) {
        elements.tabs.forEach((tab) => {
          const isActive = tab.dataset.stage === state.stageTab;
          tab.classList.toggle("is-active", isActive);
          tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });
      }
      refreshFilterOptions(getActiveItems());
      updateModeControls();
      updateView();
    } else {
      updateUrl(idA, isSingle ? null : idB, idsA, idsB);
      safeStorageSet(STORAGE_KEYS.last, {
        p1: idA,
        p2: isSingle ? null : idB,
        p1Ids: idsA,
        p2Ids: isSingle ? [] : idsB,
      });
      if (!isSingle) addRecent(idA, idB, state.playerA.name, state.playerB.name, idsA, idsB);
      updateStageMeta();
      resetFilters();
      setStageTab("overall");
    }
    setLoading(false);
    setStatus("");
  } catch (err) {
    if (currentToken !== compareRequestToken) return;
    console.error(err);
    setLoading(false);
    renderIdleState();
    if (elements.errorState) elements.errorState.hidden = false;
    setStatus(isSingle ? "Failed to load player stats." : "Failed to load matchup.");
  }
}

export function renderSummarySkeleton() {
  if (!elements.summaryGrid) return;
  elements.summaryGrid.innerHTML = "";
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  const head = document.createElement("div");
  head.className = "scoreboard-head skeleton";
  head.innerHTML = "<div class=\"scoreboard-player\">Loading</div><div class=\"scoreboard-title\">...</div><div class=\"scoreboard-player\">Loading</div>";
  scoreboard.appendChild(head);

  const rows = document.createElement("div");
  rows.className = "score-rows";
  for (let i = 0; i < 4; i += 1) {
    const row = document.createElement("div");
    row.className = "score-row skeleton";
    row.innerHTML = "<div class=\"score-value\">...</div><div class=\"score-label\">Loading</div><div class=\"score-value\">...</div>";
    rows.appendChild(row);
  }
  scoreboard.appendChild(rows);

  elements.summaryGrid.appendChild(scoreboard);
}

export function renderTableSkeleton() {
  if (!elements.matchesBody) return;
  elements.matchesBody.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 6; i += 1) {
    const row = document.createElement("tr");
    row.className = "loading-table-row";
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "skeleton";
    cell.textContent = "Loading";
    row.appendChild(cell);
    fragment.appendChild(row);
  }
  elements.matchesBody.appendChild(fragment);
}

export async function handleSwap() {
  const aValue = elements.playerA.value;
  const bValue = elements.playerB.value;
  const aId = elements.playerA.dataset.playerId;
  const bId = elements.playerB.dataset.playerId;
  const aIds = elements.playerA.dataset.playerIds;
  const bIds = elements.playerB.dataset.playerIds;
  const aName = elements.playerA.dataset.playerName;
  const bName = elements.playerB.dataset.playerName;

  if (!bId) {
    setStatus("Select Player 2 to swap.");
    return;
  }

  animateSwapButton();

  elements.playerA.value = bValue;
  elements.playerB.value = aValue;
  elements.playerA.dataset.playerId = bId || "";
  elements.playerB.dataset.playerId = aId || "";
  elements.playerA.dataset.playerIds = bIds || "";
  elements.playerB.dataset.playerIds = aIds || "";
  elements.playerA.dataset.playerName = bName || "";
  elements.playerB.dataset.playerName = aName || "";
  
  // Need to import updatePrimaryActionLabel from players.js
  const playersModule = await import("./players.js");
  playersModule.updatePrimaryActionLabel();

  // Reload opponents for the new Player A
  const newAId = bId ? Number(bId) : null;
  if (newAId) {
    elements.playerB.disabled = false;
    await loadOpponentsForPlayer(newAId, parseIdList(bIds || bId));
  }

  if (aValue && bValue) {
    handleCompare();
  }
}

export function animateSwapButton() {
  if (!elements.swapBtn) return;
  elements.swapBtn.classList.remove("is-spinning");
  void elements.swapBtn.offsetWidth;
  elements.swapBtn.classList.add("is-spinning");
}

export function handleCopyLink() {
  const idA = resolvePlayerId(elements.playerA);
  const idB = resolvePlayerId(elements.playerB);
  const idsA = getSelectionIds(elements.playerA);
  const idsB = getSelectionIds(elements.playerB);
  if (!idA) {
    setStatus("Select a player first.");
    return;
  }
  updateUrl(idA, idB || null, idsA, idsB);
  const link = window.location.href;
  const btn = elements.copyLinkBtn;
  const textEl = btn.querySelector("span") || btn;
  const originalText = textEl.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(
      () => {
        textEl.textContent = "✓ Copied!";
        btn.style.borderColor = "var(--teal)";
        btn.style.color = "var(--teal)";
        btn.style.background = "var(--teal-soft)";
        setTimeout(() => {
          textEl.textContent = originalText;
          btn.style.borderColor = "";
          btn.style.color = "";
          btn.style.background = "";
        }, 1500);
      },
      () => setStatus("Copy failed.")
    );
  } else {
    setStatus("Copy not supported.");
  }
}

export async function handleRecentClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const p1 = Number(button.dataset.p1);
  const p2 = Number(button.dataset.p2);
  if (!p1 || !p2) return;
  const p1Ids = parseIdList(button.dataset.p1Ids || p1);
  const p2Ids = parseIdList(button.dataset.p2Ids || p2);
  const player1 = { ...(getPlayerById(p1) || { id: p1, name: `Player ${p1}` }), ids: p1Ids };
  const player2 = { ...(getPlayerById(p2) || { id: p2, name: `Player ${p2}` }), ids: p2Ids };
  setInputPlayer(elements.playerA, player1);
  elements.playerB.disabled = false;
  await loadOpponentsForPlayer(p1, p1Ids);
  setInputPlayer(elements.playerB, player2);
  handleCompare();
}

export function renderRecent() {
  const recent = safeStorageGet(STORAGE_KEYS.recent, []);
  if (!elements.recentList) return;
  elements.recentList.innerHTML = "";
  if (!recent.length) {
    elements.recentList.innerHTML = "<span class=\"muted\">No recent matchups</span>";
    return;
  }
  const fragment = document.createDocumentFragment();
  recent.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${decodeHtmlEntities(item.p1Name)} vs ${decodeHtmlEntities(item.p2Name)}`;
    button.dataset.p1 = item.p1Id;
    button.dataset.p2 = item.p2Id;
    if (item.p1Ids?.length > 1) button.dataset.p1Ids = item.p1Ids.join(",");
    if (item.p2Ids?.length > 1) button.dataset.p2Ids = item.p2Ids.join(",");
    fragment.appendChild(button);
  });
  elements.recentList.appendChild(fragment);
}

export function addRecent(p1, p2, p1Name, p2Name, p1Ids = [p1], p2Ids = [p2]) {
  const recent = safeStorageGet(STORAGE_KEYS.recent, []);
  const filtered = recent.filter((item) => !(item.p1Id === p1 && item.p2Id === p2));
  filtered.unshift({
    p1Id: p1,
    p2Id: p2,
    p1Ids: normalizeAliasIds(p1Ids),
    p2Ids: normalizeAliasIds(p2Ids),
    p1Name,
    p2Name,
    ts: Date.now(),
  });
  safeStorageSet(STORAGE_KEYS.recent, filtered.slice(0, 5));
  renderRecent();
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
  if (stage) {
    state.stageTab = stage;
  }

  const playoffMode = params.get("playoffMode");
  if (playoffMode) {
    state.playoffMode = playoffMode;
  }

  const goalsMode = params.get("goalsMode");
  if (goalsMode) {
    state.goalsMode = goalsMode;
  }

  const search = params.get("search");
  if (search) {
    state.filters.search = search;
    if (elements.searchFilter) elements.searchFilter.value = search;
  }

  const yearFrom = params.get("yearFrom");
  if (yearFrom) {
    state.filters.yearFrom = yearFrom;
  }
  const yearTo = params.get("yearTo");
  if (yearTo) {
    state.filters.yearTo = yearTo;
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
  if (!Number.isFinite(id1) || (p2 && !Number.isFinite(id2))) return null;
  const p1Ids = normalizeAliasIds([id1, ...parseIdList(params.get("p1g"))]);
  const p2Ids = id2 ? normalizeAliasIds([id2, ...parseIdList(params.get("p2g"))]) : [];
  return { p1: id1, p2: id2, p1Ids, p2Ids };
}

export function initTabs() {
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setStageTab(tab.dataset.stage);
      });
    });
  }
}

export function initModeToggle() {
  if (elements.modeButtons) {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.playoffMode = button.dataset.mode || "series";
        refreshFilterOptions(getActiveItems());
        state.page = 1;
        updateView();
      });
    });
  }
}

export function initGoalsModeToggle() {
  if (!elements.goalsModeButtons) return;
  elements.goalsModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.goalsMode = button.dataset.goalsMode || "series";
      renderCharts(state.filteredMatches);
      updateUrl();
    });
  });
}

export function setStageTab(stage) {
  const previousStage = state.stageTab;
  state.stageTab = stage;
  if (stage === "playoff" && previousStage !== "playoff") {
    state.playoffMode = "series";
  }
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      const isActive = tab.dataset.stage === stage;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }
  updateModeControls();
  refreshFilterOptions(getActiveItems());
  state.page = 1;
  updateView();
}

export async function loadPlayers() {
  setStatus("Loading players...");
  const payload = await fetchJson("data/players.json");
  if (!payload) {
    setStatus("Players not found.");
    return;
  }
  state.players = payload
    .map(normalizePlayerRecord)
    .filter((player) => player.name && player.name.trim());
  state.players.forEach((player) => state.playersById.set(player.id, player));
  try {
    const aliasesPayload = (await fetchJson("aliases.json")) || (await fetchJson("data/aliases.json"));
    if (aliasesPayload) {
      const groups = Array.isArray(aliasesPayload)
        ? aliasesPayload
        : Array.isArray(aliasesPayload.groups)
          ? aliasesPayload.groups
          : [];
      groups.forEach((group) => {
        const ids = Array.isArray(group) ? group : group && Array.isArray(group.ids) ? group.ids : [];
        const normalized = normalizeAliasIds(ids);
        if (normalized.length < 2) return;
        normalized.forEach((id) => {
          state.aliasMap.set(id, normalized);
        });
      });
    }
  } catch (err) {
    // ignore alias load errors
  }
  setStatus("Ready.");
}

async function onPlayerASelected(player) {
  if (!player || !player.id) return;
  clearInputPlayer(elements.playerB, elements.listB);
  resetCurrentResults({ keepPlayerA: true, message: "" });
  await loadOpponentsForPlayer(player.id, player.ids || [player.id]);
  await handleCompare();
}

export async function init() {
  const savedTheme = safeStorageGet(STORAGE_KEYS.theme, "light");
  if (savedTheme === "dark") {
    setTheme("dark");
  }

  if (elements.themeToggle) elements.themeToggle.addEventListener("click", toggleTheme);
  initInfoPopovers();

  const typeaheadA = setupTypeahead(elements.playerA, elements.listA, {
    onPlayerSelect: onPlayerASelected,
    onCompare: handleCompare,
    onReset: () => resetCurrentResults({ clearUrl: true, clearStoredSelection: true, message: "" }),
  });
  const typeaheadB = setupTypeahead(elements.playerB, elements.listB, {
    forPlayerB: true,
    onCompare: handleCompare,
    onReset: () => resetCurrentResults({
      keepPlayerA: Boolean(resolvePlayerId(elements.playerA)),
      message: "",
    }),
  });

  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = button.dataset.clear === "a" ? elements.playerA : elements.playerB;
      const list = button.dataset.clear === "a" ? elements.listA : elements.listB;
      clearInputPlayer(target, list);
      if (button.dataset.clear === "a") {
        clearInputPlayer(elements.playerB, elements.listB);
        state.opponentsOfA = new Map();
        elements.playerB.disabled = true;
        elements.playerB.placeholder = "Select Player 1 first";
        resetCurrentResults({
          clearStoredSelection: true,
          clearUrl: true,
          message: "Selection cleared.",
        });
      } else {
        const idA = resolvePlayerId(elements.playerA);
        const idsA = getSelectionIds(elements.playerA);
        if (idA) {
          updateUrl(idA, null, idsA, []);
          safeStorageSet(STORAGE_KEYS.last, { p1: idA, p2: null, p1Ids: idsA, p2Ids: [] });
        }
        resetCurrentResults({
          keepPlayerA: Boolean(idA),
          message: "",
        });
        if (idA) {
          await handleCompare();
        }
      }
    });
  });

  if (elements.swapBtn) elements.swapBtn.addEventListener("click", handleSwap);
  if (elements.copyLinkBtn) elements.copyLinkBtn.addEventListener("click", handleCopyLink);
  if (elements.shareImageBtn) elements.shareImageBtn.addEventListener("click", handleShareImage);
  if (elements.recentList) elements.recentList.addEventListener("click", handleRecentClick);

  initFilters(updateView);
  initTable(updateView);
  initTabs();
  initModeToggle();
  initGoalsModeToggle();

  await loadPlayers();
  renderRecent();

  const urlSelection = getUrlSelection();
  const lastSelection = safeStorageGet(STORAGE_KEYS.last, null);
  const selection = urlSelection || lastSelection;
  if (selection) {
    const p1Ids = normalizeAliasIds(selection.p1Ids || [selection.p1]);
    const p2Ids = normalizeAliasIds(selection.p2Ids || (selection.p2 ? [selection.p2] : []));
    const player1 = { ...(getPlayerById(selection.p1) || { id: selection.p1, name: `Player ${selection.p1}` }), ids: p1Ids };
    setInputPlayer(elements.playerA, player1);
    elements.playerB.disabled = false;
    await loadOpponentsForPlayer(selection.p1, p1Ids);
    if (selection.p2) {
      const player2 = { ...(getPlayerById(selection.p2) || { id: selection.p2, name: `Player ${selection.p2}` }), ids: p2Ids };
      setInputPlayer(elements.playerB, player2);
    }
    if (urlSelection) {
      restoreStateFromUrl();
      await handleCompare({ restoreUrlState: true });
    } else {
      await handleCompare();
    }
  } else {
    resetCurrentResults({ message: "" });
  }
  
  // Need to import updatePrimaryActionLabel and updateSelectionControls from players.js
  const playersModule = await import("./players.js");
  playersModule.updatePrimaryActionLabel();
  playersModule.updateSelectionControls();
}

init();
