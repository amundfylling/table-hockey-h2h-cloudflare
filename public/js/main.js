import {
  state,
  elements,
  STORAGE_KEYS,
  safeStorageGet,
  safeStorageSet,
  safeStorageRemove,
  isSinglePlayerMode,
  getStatsMode,
} from "./state.js";
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
import { renderSinglePlayerPanels } from "./opponents.js";
import {
  updateUrl,
  restoreStateFromUrl,
  getUrlSelection,
  clearUrlSelection,
} from "./url-state.js";
import {
  renderRecent,
  addRecent,
  handleRecentClick,
  initRecent,
} from "./recent.js";
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
    setStageFilterCardsVisible(false);
    updateModeControls();
    updateFilterCount();
    renderSummary([]);
    renderForm([]);
    renderCharts([]);
    renderTable([]);
    if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
    return;
  }

  setDataControlsEnabled(true);
  setStageFilterCardsVisible(true);
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

  if (isSinglePlayerMode()) {
    if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = false;
    renderSinglePlayerPanels(state.filteredMatches);
  } else {
    if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
  }

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

export function setStageTabControls(stage = "overall") {
  state.stageTab = stage;
  if (elements.tabs) {
    elements.tabs.forEach((tab) => {
      const isActive = tab.dataset.stage === stage;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.tabIndex = isActive ? 0 : -1;
    });
  }
  updateModeControls();
}

export function renderIdleState() {
  if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
  setStageFilterCardsVisible(false);
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
  if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
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

function setStageFilterCardsVisible(visible) {
  if (elements.stageCard) elements.stageCard.hidden = !visible;
  if (elements.filterCard) elements.filterCard.hidden = !visible;
}

function maybeScrollToResults(options = {}) {
  if (options.restoreUrlState || options.scrollToResults === false) return;
  if (!window.matchMedia("(max-width: 900px)").matches) return;
  const target = document.getElementById("summary-section");
  if (!target) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
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
      setStageFilterCardsVisible(false);
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
          tab.tabIndex = isActive ? 0 : -1;
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
    maybeScrollToResults(options);
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

export async function renderDataFreshness() {
  const el = document.getElementById("data-freshness");
  if (!el) return;
  const meta = await fetchJson("data/meta.json");
  if (!meta || !meta.generated_at) return;
  const date = new Date(meta.generated_at);
  if (Number.isNaN(date.getTime())) return;
  el.textContent = `Data updated ${date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}`;
  el.hidden = false;
}

export function initTabs() {
  if (!elements.tabs || !elements.tabs.length) return;
  const tabList = Array.from(elements.tabs);
  const focusTab = (index) => {
    const next = tabList[index];
    if (!next) return;
    next.focus();
    setStageTab(next.dataset.stage);
  };
  tabList.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      setStageTab(tab.dataset.stage);
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusTab((index + 1) % tabList.length);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusTab((index - 1 + tabList.length) % tabList.length);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusTab(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusTab(tabList.length - 1);
      }
    });
  });
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
      tab.tabIndex = isActive ? 0 : -1;
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

  initRecent({ onCompare: handleCompare });
  initFilters(updateView);
  initTable(updateView);
  initTabs();
  initModeToggle();
  initGoalsModeToggle();

  await loadPlayers();
  renderRecent();
  renderDataFreshness();

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
      await handleCompare({ scrollToResults: false });
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
