import { state, elements } from "./state.js";
import {
  normalizeText,
  getTournamentLevelKey,
  getTournamentLevelLabel,
  compareTournamentLevelKeys,
  TOURNAMENT_LEVEL_NA,
  debounce,
} from "./utils.js";

let updateViewCallback = () => {};

export function initFilters(updateView) {
  updateViewCallback = updateView;

  elements.yearFromFilter.addEventListener("change", () => {
    state.filters.yearFrom = elements.yearFromFilter.value;
    if (state.filters.yearFrom !== "all" && state.filters.yearTo !== "all" && state.filters.yearFrom > state.filters.yearTo) {
      state.filters.yearTo = state.filters.yearFrom;
      elements.yearToFilter.value = state.filters.yearTo;
    }
    state.page = 1;
    updateViewCallback();
  });
  elements.yearToFilter.addEventListener("change", () => {
    state.filters.yearTo = elements.yearToFilter.value;
    if (state.filters.yearFrom !== "all" && state.filters.yearTo !== "all" && state.filters.yearTo < state.filters.yearFrom) {
      state.filters.yearFrom = state.filters.yearTo;
      elements.yearFromFilter.value = state.filters.yearFrom;
    }
    state.page = 1;
    updateViewCallback();
  });
  elements.tournamentFilter.addEventListener("change", () => {
    state.filters.tournament = elements.tournamentFilter.value;
    state.page = 1;
    updateViewCallback();
  });
  if (elements.tournamentLevelOptions) {
    elements.tournamentLevelOptions.addEventListener("change", () => {
      state.filters.tournamentLevels = Array.from(
        elements.tournamentLevelOptions.querySelectorAll("input:checked"),
        (input) => input.value
      );
      state.page = 1;
      updateViewCallback();
    });
  }
  elements.stageFilter.addEventListener("change", () => {
    state.filters.stage = elements.stageFilter.value;
    state.page = 1;
    updateViewCallback();
  });
  if (elements.bestOfOptions) {
    elements.bestOfOptions.addEventListener("change", () => {
      state.filters.bestOf = Array.from(
        elements.bestOfOptions.querySelectorAll("input:checked"),
        (input) => input.value
      );
      state.page = 1;
      updateViewCallback();
    });
  }

  // More Filters toggle
  if (elements.moreFiltersToggle) {
    elements.moreFiltersToggle.addEventListener("click", () => {
      const advanced = elements.filterBarAdvanced;
      const isOpen = !advanced.hidden;
      advanced.hidden = isOpen;
      elements.moreFiltersToggle.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }

  elements.otToggle.addEventListener("change", () => {
    state.filters.otOnly = elements.otToggle.checked;
    state.page = 1;
    updateViewCallback();
  });
  elements.tightToggle.addEventListener("change", () => {
    state.filters.tightOnly = elements.tightToggle.checked;
    state.page = 1;
    updateViewCallback();
  });
  elements.searchFilter.addEventListener(
    "input",
    debounce(() => {
      state.filters.search = elements.searchFilter.value;
      state.page = 1;
      updateViewCallback();
    }, 150)
  );
  elements.pageSize.addEventListener("change", () => {
    state.perPage = Number(elements.pageSize.value);
    state.page = 1;
    updateViewCallback();
  });
}

export function applyFilters(matches) {
  const filters = state.filters;
  const search = normalizeText(filters.search);
  const bestOfFilters = new Set(filters.bestOf || []);
  const tournamentLevelFilters = new Set(filters.tournamentLevels || []);
  return matches.filter((match) => {
    if (filters.yearFrom !== "all" && match.year < filters.yearFrom) return false;
    if (filters.yearTo !== "all" && match.year > filters.yearTo) return false;
    if (filters.tournament !== "all" && match.tournament_key !== filters.tournament) return false;
    if (tournamentLevelFilters.size && !tournamentLevelFilters.has(getTournamentLevelKey(match))) return false;
    if (filters.stage !== "all" && match.stage !== filters.stage) return false;
    if (state.stageTab === "playoff" && bestOfFilters.size) {
      const bestOf = match.best_of ?? match.series_best_of;
      if (!bestOfFilters.has(String(bestOf))) return false;
    }
    if (filters.otOnly && !match.overtime) return false;
    if (filters.tightOnly && match.goal_abs > 1) return false;
    if (search) {
      const hay = `${match.tournament_name || ""} ${getTournamentLevelLabel(getTournamentLevelKey(match))} ${match.stage || ""} ${match.opponent_name || ""}`;
      if (!normalizeText(hay).includes(search)) return false;
    }
    return true;
  });
}

export function refreshFilterOptions(matches) {
  const years = new Set();
  const tournaments = new Map();
  const tournamentLevels = new Set([TOURNAMENT_LEVEL_NA]);
  const stages = new Set();
  const bestOfValues = new Set();

  matches.forEach((match) => {
    if (match.year) years.add(match.year);
    if (match.tournament_key) {
      tournaments.set(match.tournament_key, match.tournament_name || "Unknown tournament");
    }
    tournamentLevels.add(getTournamentLevelKey(match));
    if (match.stage) stages.add(match.stage);
    const bestOf = match.best_of ?? match.series_best_of;
    if (state.stageTab === "playoff" && bestOf) bestOfValues.add(String(bestOf));
  });

  const sortedYears = Array.from(years).sort();
  const yearFromOptions = ["all", ...sortedYears];
  const yearToOptions = ["all", ...sortedYears];
  const tournamentOptions = ["all", ...Array.from(tournaments.keys()).sort((a, b) => {
    const nameA = tournaments.get(a) || "";
    const nameB = tournaments.get(b) || "";
    return nameA.localeCompare(nameB);
  })];
  const stageOptions = ["all", ...Array.from(stages).sort()];

  populateSelect(elements.yearFromFilter, yearFromOptions, "Earliest");
  populateSelect(elements.yearToFilter, yearToOptions, "Latest");
  populateSelect(elements.tournamentFilter, tournamentOptions, "All tournaments", tournaments);
  populateTournamentLevelOptions(Array.from(tournamentLevels).sort(compareTournamentLevelKeys));
  populateSelect(elements.stageFilter, stageOptions, "All stages");
  populateBestOfOptions(Array.from(bestOfValues).sort((a, b) => Number(a) - Number(b)));
  syncFiltersFromControls();
}

export function populateTournamentLevelOptions(values) {
  if (!elements.tournamentLevelOptions) return;
  state.filters.tournamentLevels = state.filters.tournamentLevels.filter((value) => values.includes(value));
  elements.tournamentLevelOptions.innerHTML = "";

  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "toggle filter-chip-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = state.filters.tournamentLevels.includes(value);
    const text = document.createElement("span");
    text.textContent = getTournamentLevelLabel(value);
    label.appendChild(input);
    label.appendChild(text);
    fragment.appendChild(label);
  });
  elements.tournamentLevelOptions.appendChild(fragment);
}

export function populateBestOfOptions(values) {
  if (!elements.bestOfFilter || !elements.bestOfOptions) return;
  const visible = state.stageTab === "playoff" && values.length > 0;
  elements.bestOfFilter.hidden = !visible;
  elements.bestOfOptions.innerHTML = "";
  if (!visible) {
    state.filters.bestOf = [];
    return;
  }

  state.filters.bestOf = state.filters.bestOf.filter((value) => values.includes(value));
  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const label = document.createElement("label");
    label.className = "toggle best-of-toggle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.checked = state.filters.bestOf.includes(value);
    const text = document.createElement("span");
    text.textContent = value === "1" ? "Single game" : `Best of ${value}`;
    label.appendChild(input);
    label.appendChild(text);
    fragment.appendChild(label);
  });
  elements.bestOfOptions.appendChild(fragment);
}

export function syncFiltersFromControls() {
  state.filters.yearFrom = elements.yearFromFilter.value;
  state.filters.yearTo = elements.yearToFilter.value;
  state.filters.tournament = elements.tournamentFilter.value;
  if (elements.tournamentLevelOptions) {
    state.filters.tournamentLevels = Array.from(
      elements.tournamentLevelOptions.querySelectorAll("input:checked"),
      (input) => input.value
    );
  }
  state.filters.stage = elements.stageFilter.value;
  if (elements.bestOfOptions) {
    state.filters.bestOf = Array.from(
      elements.bestOfOptions.querySelectorAll("input:checked"),
      (input) => input.value
    );
  }
}

export function populateSelect(selectEl, values, label, labelsMap) {
  let targetValue = "all";
  if (selectEl === elements.yearFromFilter) targetValue = state.filters.yearFrom;
  else if (selectEl === elements.yearToFilter) targetValue = state.filters.yearTo;
  else if (selectEl === elements.tournamentFilter) targetValue = state.filters.tournament;
  else if (selectEl === elements.stageFilter) targetValue = state.filters.stage;
  else targetValue = selectEl.value || "all";

  selectEl.innerHTML = "";
  values.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = value;
    if (index === 0) {
      option.textContent = label;
    } else if (labelsMap && labelsMap.has(value)) {
      option.textContent = labelsMap.get(value);
    } else {
      option.textContent = value;
    }
    selectEl.appendChild(option);
  });
  if (values.includes(targetValue)) {
    selectEl.value = targetValue;
  } else {
    selectEl.value = "all";
  }
}

export function getActiveFilterCount() {
  let count = 0;
  if (state.filters.yearFrom !== "all" || state.filters.yearTo !== "all") count += 1;
  if (state.filters.tournament !== "all") count += 1;
  if (state.filters.tournamentLevels.length) count += 1;
  if (state.filters.stage !== "all") count += 1;
  if (state.filters.search.trim()) count += 1;
  if (state.filters.otOnly) count += 1;
  if (state.filters.tightOnly) count += 1;
  if (state.stageTab === "playoff" && state.filters.bestOf.length) count += 1;
  return count;
}

export function updateFilterCount() {
  renderActiveFilterChips();
}

export function renderActiveFilterChips() {
  const container = elements.activeFiltersContainer;
  if (!container) return;
  container.innerHTML = "";
  const chips = [];

  if (state.filters.search.trim()) {
    chips.push({ label: `"${state.filters.search}"`, clear: () => { state.filters.search = ""; elements.searchFilter.value = ""; } });
  }
  if (state.filters.yearFrom !== "all" || state.filters.yearTo !== "all") {
    const from = state.filters.yearFrom === "all" ? "Earliest" : state.filters.yearFrom;
    const to = state.filters.yearTo === "all" ? "Latest" : state.filters.yearTo;
    chips.push({ label: `${from} – ${to}`, clear: () => {
      state.filters.yearFrom = "all"; state.filters.yearTo = "all";
      elements.yearFromFilter.value = "all"; elements.yearToFilter.value = "all";
    } });
  }
  if (state.filters.tournament !== "all") {
    const opt = elements.tournamentFilter.querySelector(`option[value="${CSS.escape(state.filters.tournament)}"]`);
    const label = opt ? opt.textContent : state.filters.tournament;
    chips.push({ label: label, clear: () => { state.filters.tournament = "all"; elements.tournamentFilter.value = "all"; } });
  }
  if (state.filters.tournamentLevels.length) {
    const labels = state.filters.tournamentLevels.map((v) => getTournamentLevelLabel(v)).join(", ");
    chips.push({ label: `Level: ${labels}`, clear: () => {
      state.filters.tournamentLevels = [];
      if (elements.tournamentLevelOptions) {
        elements.tournamentLevelOptions.querySelectorAll("input").forEach((input) => { input.checked = false; });
      }
    } });
  }
  if (state.filters.stage !== "all") {
    chips.push({ label: `Stage: ${state.filters.stage}`, clear: () => { state.filters.stage = "all"; elements.stageFilter.value = "all"; } });
  }
  if (state.filters.otOnly) {
    chips.push({ label: "Overtime only", clear: () => { state.filters.otOnly = false; elements.otToggle.checked = false; } });
  }
  if (state.filters.tightOnly) {
    chips.push({ label: "Tight games", clear: () => { state.filters.tightOnly = false; elements.tightToggle.checked = false; } });
  }
  if (state.stageTab === "playoff" && state.filters.bestOf.length) {
    const labels = state.filters.bestOf.map((v) => v === "1" ? "Single" : `Bo${v}`).join(", ");
    chips.push({ label: labels, clear: () => {
      state.filters.bestOf = [];
      if (elements.bestOfOptions) {
        elements.bestOfOptions.querySelectorAll("input").forEach((input) => { input.checked = false; });
      }
    } });
  }

  if (chips.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  chips.forEach((chip) => {
    const el = document.createElement("span");
    el.className = "active-filter-chip";
    el.textContent = chip.label;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", `Remove filter: ${chip.label}`);
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      chip.clear();
      state.page = 1;
      updateViewCallback();
    });
    el.appendChild(btn);
    container.appendChild(el);
  });

  const clearAllBtn = document.createElement("button");
  clearAllBtn.type = "button";
  clearAllBtn.className = "clear-all-filters-btn";
  clearAllBtn.textContent = "Clear all";
  clearAllBtn.addEventListener("click", () => {
    resetFilters();
    state.page = 1;
    updateViewCallback();
  });
  container.appendChild(clearAllBtn);
}

export function resetFilters() {
  state.filters.yearFrom = "all";
  state.filters.yearTo = "all";
  state.filters.tournament = "all";
  state.filters.tournamentLevels = [];
  state.filters.stage = "all";
  state.filters.search = "";
  state.filters.otOnly = false;
  state.filters.tightOnly = false;
  state.filters.bestOf = [];
  elements.yearFromFilter.value = "all";
  elements.yearToFilter.value = "all";
  elements.tournamentFilter.value = "all";
  if (elements.tournamentLevelOptions) {
    elements.tournamentLevelOptions.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
  }
  elements.stageFilter.value = "all";
  elements.searchFilter.value = "";
  elements.otToggle.checked = false;
  elements.tightToggle.checked = false;
  if (elements.bestOfOptions) {
    elements.bestOfOptions.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
  }
  updateFilterCount();
}
