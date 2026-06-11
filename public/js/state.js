export const STORAGE_KEYS = {
  last: "h2h_last",
  recent: "h2h_recent",
  theme: "h2h_theme",
};

export const state = {
  players: [],
  playersById: new Map(),
  aliasMap: new Map(),
  pairCache: new Map(),
  playerStatsCache: new Map(),
  playerFileCache: new Map(),
  baseMatches: [],
  stageMatches: [],
  filteredMatches: [],
  playerA: null,
  playerB: null,
  comparisonMode: "matchup",
  opponentsOfA: new Map(),
  opponentsLoading: false,
  stageTab: "overall",
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
  sort: {
    key: "date",
    direction: "desc",
  },
  perPage: 50,
  page: 1,
  loading: false,
  playoffMode: "series",
  goalsMode: "series",
};

export const elements = {
  playerA: document.getElementById("player-a"),
  playerB: document.getElementById("player-b"),
  listA: document.getElementById("player-a-list"),
  listB: document.getElementById("player-b-list"),
  compareBtn: document.getElementById("compare-btn"),
  swapBtn: document.getElementById("swap-btn"),
  copyLinkBtn: document.getElementById("copy-link-btn"),
  shareImageBtn: document.getElementById("share-image-btn"),
  status: document.getElementById("status"),
  recentList: document.getElementById("recent-list"),
  tabs: document.querySelectorAll(".tab"),
  playoffModeToggle: document.getElementById("playoff-mode-toggle"),
  modeButtons: document.querySelectorAll("#playoff-mode-toggle .mode-btn"),
  goalsModeToggle: document.getElementById("goals-mode-toggle"),
  goalsModeButtons: document.querySelectorAll("#goals-mode-toggle .mode-btn"),
  stageMeta: document.getElementById("stage-meta"),
  headline: document.getElementById("headline"),
  subhead: document.getElementById("subhead"),
  record: document.getElementById("record"),
  summaryGrid: document.getElementById("summary-grid"),
  formTitle: document.getElementById("form-title"),
  formChips: document.getElementById("form-chips"),
  recordChartTitle: document.getElementById("record-chart-title"),
  recordChart: document.getElementById("record-chart"),
  goalsChartTitle: document.getElementById("goals-chart-title"),
  goalsChart: document.getElementById("goals-chart"),
  yearFromFilter: document.getElementById("year-from-filter"),
  yearToFilter: document.getElementById("year-to-filter"),
  tournamentFilter: document.getElementById("tournament-filter"),
  tournamentLevelOptions: document.getElementById("tournament-level-options"),
  stageFilter: document.getElementById("stage-filter"),
  bestOfFilter: document.getElementById("best-of-filter"),
  bestOfOptions: document.getElementById("best-of-options"),
  otToggle: document.getElementById("ot-toggle"),
  tightToggle: document.getElementById("tight-toggle"),
  searchFilter: document.getElementById("search-filter"),
  pageSize: document.getElementById("page-size"),
  matchCount: document.getElementById("match-count"),
  matchesBody: document.getElementById("matches-body"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  prevPageBottom: document.getElementById("prev-page-bottom"),
  nextPageBottom: document.getElementById("next-page-bottom"),
  pageInfo: document.getElementById("page-info"),
  pageInfoBottom: document.getElementById("page-info-bottom"),
  emptyState: document.getElementById("empty-state"),
  errorState: document.getElementById("error-state"),
  themeToggle: document.getElementById("theme-toggle"),
  filterBar: document.getElementById("filter-bar"),
  moreFiltersToggle: document.getElementById("more-filters-toggle"),
  filterBarAdvanced: document.getElementById("filter-bar-advanced"),
  activeFiltersContainer: document.getElementById("active-filters"),
  playerBLoader: document.getElementById("player-b-loader"),
  matchesHeadRow: document.getElementById("matches-head-row"),
};

export function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // ignore
  }
}

export function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // ignore
  }
}

export function getStatsMode() {
  return state.stageTab === "playoff" ? state.playoffMode : "games";
}

export function isSeriesMode() {
  return getStatsMode() === "series";
}

export function isSinglePlayerMode() {
  return state.comparisonMode === "single";
}
