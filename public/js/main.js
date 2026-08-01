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
  selectionsShareIdentity,
  normalizePlayerRecord,
  updatePrimaryActionLabel,
  updateSelectionControls,
} from "./players.js";
import {
  loadPlayerStats,
  loadMatchup,
  loadOpponentsForPlayer,
  cancelOpponentLoading,
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
import { initOpponents, renderSinglePlayerPanels } from "./opponents.js";
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
import {
  renderForm,
  resetFormPresentation,
} from "./form.js?v=20260801-generational-run-v3";
import { renderCharts } from "./charts.js";
import {
  renderTable,
  initTable,
  sortMatches,
} from "./table.js";
import { setTheme, toggleTheme, initInfoPopovers } from "./theme.js";
import { handleShareImage } from "./share.js";

// Global functions that were in app.js
let compareRequestToken = 0;
let activeCompareController = null;

function abortActiveComparison() {
  if (activeCompareController) activeCompareController.abort();
  activeCompareController = null;
}

export function setStatus(message) {
  if (elements.status) elements.status.textContent = message;
}

export function setLoading(isLoading) {
  state.loading = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  [elements.summarySection, elements.visualizationsSection, elements.matchesSection]
    .filter(Boolean)
    .forEach((section) => section.setAttribute("aria-busy", isLoading ? "true" : "false"));
  updateSelectionControls();
}

function setResultsSectionsVisible(visible) {
  if (elements.summarySection) elements.summarySection.hidden = !visible;
  if (elements.visualizationsSection) elements.visualizationsSection.hidden = !visible;
  if (elements.matchesSection) elements.matchesSection.hidden = !visible;
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
  if (elements.tightToggleLabel) {
    elements.tightToggleLabel.textContent = getStatsMode() === "series"
      ? "Contains a one-goal game"
      : "One-goal games";
  }
  if (elements.otToggleLabel) {
    elements.otToggleLabel.textContent = getStatsMode() === "series"
      ? "Contains an overtime game"
      : "Only overtime";
  }
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
    resetFormPresentation();
    setDataControlsEnabled(false);
    setStageFilterCardsVisible(false);
    setResultsSectionsVisible(false);
    if (elements.filterEmptyState) elements.filterEmptyState.hidden = true;
    updateModeControls();
    updateFilterCount();
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

  if (!state.filteredMatches.length) {
    resetFormPresentation();
    setResultsSectionsVisible(false);
    if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
    if (elements.filterEmptyState) elements.filterEmptyState.hidden = false;
    const stageHasNoData = state.stageMatches.length === 0 && state.stageTab !== "overall";
    if (elements.filterEmptyTitle) {
      elements.filterEmptyTitle.textContent = stageHasNoData
        ? "No matches in this stage"
        : "No results in this view";
    }
    if (elements.filterEmptyCopy) {
      elements.filterEmptyCopy.textContent = stageHasNoData
        ? "This matchup has no games in the selected stage."
        : "Try another stage or clear the active filters.";
    }
    if (elements.clearFiltersBtn) {
      elements.clearFiltersBtn.textContent = stageHasNoData ? "Show all stages" : "Clear filters";
    }
    updateFilterCount();
    updateUrl();
    return;
  }

  if (elements.filterEmptyState) elements.filterEmptyState.hidden = true;
  setResultsSectionsVisible(true);

  renderSummary(state.filteredMatches);
  renderForm(state.filteredMatches, state.stageMatches);
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
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
      tab.tabIndex = 0;
    });
  }
  updateModeControls();
}

export function renderIdleState() {
  resetFormPresentation();
  if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
  setStageFilterCardsVisible(false);
  setResultsSectionsVisible(false);
  if (elements.filterEmptyState) elements.filterEmptyState.hidden = true;
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
  if (elements.formChips) elements.formChips.replaceChildren();
  if (elements.recordChart) elements.recordChart.replaceChildren();
  if (elements.goalsChart) elements.goalsChart.replaceChildren();
  if (elements.matchesBody) elements.matchesBody.replaceChildren();
  if (elements.matchCount) elements.matchCount.textContent = "0 matches";
  [elements.prevPage, elements.nextPage, elements.prevPageBottom, elements.nextPageBottom]
    .filter(Boolean)
    .forEach((button) => { button.disabled = true; });
  if (elements.paginationTop) elements.paginationTop.hidden = true;
  if (elements.paginationBottom) elements.paginationBottom.hidden = true;
}

export function resetCurrentResults(options = {}) {
  compareRequestToken += 1;
  abortActiveComparison();
  setLoading(false);
  if (options.cancelOpponents) cancelOpponentLoading();
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
  updateSelectionControls();
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
  if (elements.headline) elements.headline.focus({ preventScroll: true });
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
  if (!idB && elements.playerB.value.trim()) {
    setStatus("Select a valid Player 2.");
    return;
  }
  if (
    !isSingle
    && selectionsShareIdentity(idsA.length ? idsA : [idA], idsB.length ? idsB : [idB])
  ) {
    clearInputPlayer(elements.playerB, elements.listB);
    resetCurrentResults({ keepPlayerA: true, message: "Choose two different players." });
    updateUrl(idA, null, idsA, []);
    safeStorageSet(STORAGE_KEYS.last, { p1: idA, p2: null, p1Ids: idsA, p2Ids: [] });
    return;
  }

  const selectedPlayerA = getSelectionPlayer(elements.playerA, idA);
  const selectedPlayerB = isSingle ? null : getSelectionPlayer(elements.playerB, idB);

  // Keep the URL in sync with what the user asked for, including an empty result.
  updateUrl(idA, isSingle ? null : idB, idsA, isSingle ? [] : idsB);
  safeStorageSet(STORAGE_KEYS.last, {
    p1: idA,
    p2: isSingle ? null : idB,
    p1Ids: idsA,
    p2Ids: isSingle ? [] : idsB,
  });

  compareRequestToken += 1;
  const currentToken = compareRequestToken;
  abortActiveComparison();
  activeCompareController = new AbortController();
  const requestSignal = activeCompareController.signal;

  setLoading(true);
  resetFormPresentation();
  setStatus(isSingle ? "Loading player stats..." : "Loading matchup...");
  state.baseMatches = [];
  state.stageMatches = [];
  state.filteredMatches = [];
  if (elements.stageMeta) elements.stageMeta.textContent = "";
  setDataControlsEnabled(false);
  setStageFilterCardsVisible(false);
  setResultsSectionsVisible(false);
  if (elements.singlePlayerSection) elements.singlePlayerSection.hidden = true;
  if (elements.filterEmptyState) elements.filterEmptyState.hidden = true;
  if (elements.emptyState) elements.emptyState.hidden = true;
  if (elements.errorState) elements.errorState.hidden = true;

  try {
    const data = isSingle
      ? await loadPlayerStats(idA, (current, total) => {
          if (currentToken !== compareRequestToken) return;
          setStatus(`Loading player files ${current}/${total}...`);
        }, idsA, requestSignal)
      : await loadMatchup(idA, idB, (current, total) => {
          if (currentToken !== compareRequestToken) return;
          setStatus(`Loading chunks ${current}/${total}...`);
        }, idsA, idsB, requestSignal);

    if (currentToken !== compareRequestToken) {
      return;
    }

    state.playerA = selectedPlayerA || data?.playerA || { id: idA, name: `Player ${idA}` };
    state.playerB = isSingle
      ? data?.playerB || { id: null, name: "Opponents" }
      : selectedPlayerB || data?.playerB || { id: idB, name: `Player ${idB}` };
    state.comparisonMode = isSingle ? "single" : "matchup";

    const matches = Array.isArray(data?.matches) ? data.matches : [];
    if (!matches.length) {
      if (elements.emptyState) elements.emptyState.hidden = false;
      if (elements.emptyStateTitle) {
        elements.emptyStateTitle.textContent = isSingle
          ? "No recorded matches"
          : "No matches yet";
      }
      if (elements.emptyStateCopy) {
        elements.emptyStateCopy.textContent = isSingle
          ? "No eligible opponent matches are available for this player."
          : "These players have not faced each other in the dataset.";
      }
      state.baseMatches = [];
      state.filteredMatches = [];
      if (elements.stageMeta) elements.stageMeta.textContent = "";
      setDataControlsEnabled(false);
      setStageFilterCardsVisible(false);
      setResultsSectionsVisible(false);
      setLoading(false);
      setStatus("No matches found.");
      updateSelectionControls();
      return;
    }

    state.baseMatches = matches;
    state.page = 1;
    state.sort = { key: "date", direction: "desc" };
    state.perPage = Number(elements.pageSize.value);
    updateStageMeta();

    if (options.restoreUrlState) {
      if (elements.tabs) {
        elements.tabs.forEach((tab) => {
          const isActive = tab.dataset.stage === state.stageTab;
          tab.classList.toggle("is-active", isActive);
          tab.setAttribute("aria-pressed", isActive ? "true" : "false");
          tab.tabIndex = 0;
        });
      }
      refreshFilterOptions(getActiveItems());
      updateModeControls();
      updateView();
    } else {
      if (!isSingle) addRecent(idA, idB, state.playerA.name, state.playerB.name, idsA, idsB);
      resetFilters();
      setStageTab("overall");
    }
    setLoading(false);
    const completionMessage = `${matches.length} match${matches.length === 1 ? "" : "es"} loaded.`;
    setStatus(completionMessage);
    setTimeout(() => {
      if (
        currentToken === compareRequestToken
        && elements.status?.textContent === completionMessage
      ) {
        setStatus("");
      }
    }, 2000);
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

  cancelOpponentLoading();
  animateSwapButton();

  elements.playerA.value = bValue;
  elements.playerB.value = aValue;
  elements.playerA.dataset.playerId = bId || "";
  elements.playerB.dataset.playerId = aId || "";
  elements.playerA.dataset.playerIds = bIds || "";
  elements.playerB.dataset.playerIds = aIds || "";
  elements.playerA.dataset.playerName = bName || "";
  elements.playerB.dataset.playerName = aName || "";
  updatePrimaryActionLabel();
  resetCurrentResults({ keepPlayerA: true, message: "" });

  // Reload opponents for the new Player A
  const newAId = bId ? Number(bId) : null;
  if (newAId) {
    elements.playerB.disabled = false;
    await Promise.all([
      handleCompare(),
      loadOpponentsForPlayer(
        newAId,
        parseIdList(bIds || bId),
        activeCompareController?.signal
      ),
    ]);
    return;
  }

  if (aValue && bValue) {
    await handleCompare();
  }
}

export function animateSwapButton() {
  if (!elements.swapBtn) return;
  elements.swapBtn.classList.remove("is-spinning");
  void elements.swapBtn.offsetWidth;
  elements.swapBtn.classList.add("is-spinning");
}

let copyLinkBusy = false;

export function handleCopyLink() {
  if (copyLinkBusy) return;
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
    copyLinkBusy = true;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
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
          btn.removeAttribute("aria-busy");
          copyLinkBusy = false;
          updateSelectionControls();
        }, 1500);
        setStatus("Link copied.");
      },
      () => {
        btn.removeAttribute("aria-busy");
        copyLinkBusy = false;
        updateSelectionControls();
        setStatus("Copy failed.");
      }
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
      elements.goalsModeButtons.forEach((modeButton) => {
        const isActive = modeButton.dataset.goalsMode === state.goalsMode;
        modeButton.classList.toggle("is-active", isActive);
        modeButton.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
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
      tab.setAttribute("aria-pressed", isActive ? "true" : "false");
      tab.tabIndex = 0;
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
  if (!Array.isArray(payload)) {
    throw new Error("Player index is missing or invalid.");
  }
  state.playersById.clear();
  state.aliasMap.clear();
  state.players = payload
    .map(normalizePlayerRecord)
    .filter((player) => Number.isInteger(Number(player?.id))
      && Number(player.id) > 0
      && player.name
      && player.name.trim())
    .map((player) => ({ ...player, id: Number(player.id) }));
  state.players.forEach((player) => state.playersById.set(player.id, player));
  const aliasesPayload = (await fetchJson("aliases.json"))
    || (await fetchJson("data/aliases.json"));
  if (!aliasesPayload) {
    throw new Error("Alias index is missing or unavailable.");
  }
  const groups = Array.isArray(aliasesPayload)
    ? aliasesPayload
    : Array.isArray(aliasesPayload.groups)
      ? aliasesPayload.groups
      : null;
  if (!groups) {
    throw new Error("Alias index is malformed.");
  }
  groups.forEach((group) => {
    const ids = Array.isArray(group)
      ? group
      : group && Array.isArray(group.ids) ? group.ids : [];
    const normalized = normalizeAliasIds(ids).filter((id) => state.playersById.has(id));
    if (normalized.length < 2) return;
    if (normalized.some((id) => state.aliasMap.has(id))) {
      console.warn("Skipping overlapping alias group:", normalized.join(","));
      return;
    }
    normalized.forEach((id) => {
      state.aliasMap.set(id, normalized);
    });
  });
  setStatus("Ready.");
}

async function onPlayerASelected(player) {
  if (!player || !player.id) return;
  clearInputPlayer(elements.playerB, elements.listB);
  resetCurrentResults({ keepPlayerA: true, cancelOpponents: true, message: "" });
  const comparePromise = handleCompare({ scrollToResults: false });
  const opponentsPromise = loadOpponentsForPlayer(
    player.id,
    player.ids || [player.id],
    activeCompareController?.signal
  );
  await Promise.all([comparePromise, opponentsPromise]);
}

async function onPlayerASubmitted() {
  const playerId = resolvePlayerId(elements.playerA);
  const player = getPlayerById(playerId);
  if (!playerId || !player) {
    await handleCompare();
    return;
  }
  const selection = { ...player, ids: getSelectionIds(elements.playerA) };
  setInputPlayer(elements.playerA, selection);
  await onPlayerASelected(selection);
}

export async function init() {
  const savedTheme = safeStorageGet(STORAGE_KEYS.theme, null);
  const preferredTheme = savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(preferredTheme, { persist: savedTheme === "dark" || savedTheme === "light" });

  if (elements.themeToggle) elements.themeToggle.addEventListener("click", toggleTheme);
  initInfoPopovers();

  setupTypeahead(elements.playerA, elements.listA, {
    onPlayerSelect: onPlayerASelected,
    onCompare: onPlayerASubmitted,
    onReset: () => resetCurrentResults({
      cancelOpponents: true,
      clearUrl: true,
      clearStoredSelection: true,
      message: "",
    }),
  });
  setupTypeahead(elements.playerB, elements.listB, {
    forPlayerB: true,
    onCompare: handleCompare,
    onReset: () => {
      const idA = resolvePlayerId(elements.playerA);
      const idsA = getSelectionIds(elements.playerA);
      resetCurrentResults({ keepPlayerA: Boolean(idA), message: "" });
      if (idA) {
        updateUrl(idA, null, idsA, []);
        safeStorageSet(STORAGE_KEYS.last, { p1: idA, p2: null, p1Ids: idsA, p2Ids: [] });
      }
    },
  });

  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = button.dataset.clear === "a" ? elements.playerA : elements.playerB;
      const list = button.dataset.clear === "a" ? elements.listA : elements.listB;
      clearInputPlayer(target, list);
      if (button.dataset.clear === "a") {
        cancelOpponentLoading();
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
  if (elements.clearFiltersBtn) {
    elements.clearFiltersBtn.addEventListener("click", () => {
      if (state.stageTab !== "overall" && getActiveItems().length === 0) {
        setStageTab("overall");
        return;
      }
      resetFilters();
      state.page = 1;
      updateView();
    });
  }
  if (elements.retryBtn) {
    elements.retryBtn.addEventListener("click", () => {
      if (!state.players.length) {
        window.location.reload();
        return;
      }
      handleCompare();
    });
  }

  initRecent({
    onCompare: handleCompare,
    getSignal: () => activeCompareController?.signal || null,
  });
  initFilters(updateView);
  initTable(updateView);
  initOpponents({ onCompare: handleCompare });
  initTabs();
  initModeToggle();
  initGoalsModeToggle();

  await loadPlayers();
  renderRecent();
  renderDataFreshness().catch((err) => console.warn("Could not load data freshness:", err));

  const urlSelection = getUrlSelection();
  const storedSelection = safeStorageGet(STORAGE_KEYS.last, null);
  const storedP1 = Number(storedSelection?.p1);
  const storedP2 = storedSelection?.p2 == null ? null : Number(storedSelection.p2);
  let lastSelection = Number.isInteger(storedP1)
    && state.playersById.has(storedP1)
    && (storedP2 == null || (Number.isInteger(storedP2) && state.playersById.has(storedP2)))
    ? { ...storedSelection, p1: storedP1, p2: storedP2 }
    : null;
  if (lastSelection?.p2) {
    const storedIdsA = normalizeAliasIds([
      lastSelection.p1,
      ...(Array.isArray(lastSelection.p1Ids) ? lastSelection.p1Ids : []),
    ]);
    const storedIdsB = normalizeAliasIds([
      lastSelection.p2,
      ...(Array.isArray(lastSelection.p2Ids) ? lastSelection.p2Ids : []),
    ]);
    if (selectionsShareIdentity(storedIdsA, storedIdsB)) {
      lastSelection = null;
    }
  }
  if (storedSelection && !lastSelection) safeStorageRemove(STORAGE_KEYS.last);
  const hasUrlPlayer = new URLSearchParams(window.location.search).has("p1");
  const selection = hasUrlPlayer ? urlSelection : lastSelection;
  if (hasUrlPlayer && !urlSelection) clearUrlSelection();
  if (selection) {
    const validateSelectionIds = (primaryId, values) => {
      const allowed = new Set(state.aliasMap.get(primaryId) || [primaryId]);
      const requested = normalizeAliasIds([primaryId, ...(Array.isArray(values) ? values : [])]);
      return requested.every((id) => allowed.has(id)) ? requested : [primaryId];
    };
    const p1Ids = validateSelectionIds(selection.p1, selection.p1Ids);
    const p2Ids = selection.p2 ? validateSelectionIds(selection.p2, selection.p2Ids) : [];
    const player1 = { ...(getPlayerById(selection.p1) || { id: selection.p1, name: `Player ${selection.p1}` }), ids: p1Ids };
    setInputPlayer(elements.playerA, player1);
    elements.playerB.disabled = false;
    if (selection.p2) {
      const player2 = { ...(getPlayerById(selection.p2) || { id: selection.p2, name: `Player ${selection.p2}` }), ids: p2Ids };
      setInputPlayer(elements.playerB, player2);
    }
    if (urlSelection) {
      restoreStateFromUrl();
      const comparePromise = handleCompare({ restoreUrlState: true });
      const opponentsPromise = loadOpponentsForPlayer(
        selection.p1,
        p1Ids,
        activeCompareController?.signal
      );
      await Promise.all([comparePromise, opponentsPromise]);
    } else {
      const comparePromise = handleCompare({ scrollToResults: false });
      const opponentsPromise = loadOpponentsForPlayer(
        selection.p1,
        p1Ids,
        activeCompareController?.signal
      );
      await Promise.all([comparePromise, opponentsPromise]);
    }
  } else {
    resetCurrentResults({ message: "" });
  }

  updatePrimaryActionLabel();
  updateSelectionControls();
}

init().catch((err) => {
  console.error(err);
  setLoading(false);
  renderIdleState();
  if (elements.errorState) elements.errorState.hidden = false;
  if (elements.playerA) elements.playerA.disabled = true;
  if (elements.playerB) elements.playerB.disabled = true;
  setStatus("The player index could not be loaded. Please refresh to try again.");
});
