// Ratings leaderboard (leaderboard.html): every player with a page, ranked by the rating from
// data/leaderboard.json, with name search, a nation filter, active or all-time players and
// sortable columns. The filters live in the URL (?q=, ?nation=, ?wr=, ?all=1, ?sort=) for
// sharing.
import { el } from "./dom.js";
import { initChrome } from "./chrome.js";
import { getCountryFlag } from "./players.js";
import { decodeHtmlEntities, debounce, formatDate, formatNumber } from "./utils.js";
import { fillSelect, matchesQuery, PAGE_SIZE, readParams, rowsFromTable, writeParams } from "./browse.js";

const ACTIVE_DAYS = 365;

// Column key -> value to sort by (higher first). Missing values sort last either way.
const SORTS = {
  rating: (p) => p.rating,
  change: (p) => p.change,
  peak: (p) => p.peak,
  games: (p) => p.games,
  last: (p) => (p.last_played ? Date.parse(p.last_played) : null),
  // World rank 1 is the best, so it sorts first.
  wr: (p) => (p.world_rank == null ? null : -p.world_rank),
  gap: (p) => p.wr_gap,
};

const state = {
  players: [],
  asOf: "",
  query: "",
  nation: "",
  verdict: "",
  active: true,
  sort: "rating",
  ascending: false,
  shown: PAGE_SIZE,
};

const $ = (id) => document.getElementById(id);

function signed(value) {
  if (value == null) return "–";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}`;
}

function activeCutoff() {
  const base = Date.parse(`${state.asOf}T00:00:00Z`);
  const from = Number.isNaN(base) ? Date.now() : base;
  return new Date(from - ACTIVE_DAYS * 86400000).toISOString().slice(0, 10);
}

// Each world-ranked player's place by rating among the world-ranked players, and the
// world rank minus that place (wr_gap): positive when the rating ranks them higher than the
// world ranking does. Players are in rating order, best first.
export function withWorldRankGap(players) {
  let place = 0;
  return players.map((p) => {
    if (p.world_rank == null) return { ...p, wr_gap: null };
    place += 1;
    const gap = p.world_rank - place;
    return { ...p, wr_place: place, wr_gap: gap, wr_verdict: worldRankVerdict(p.world_rank, place) };
  });
}

// A gap counts as a clear mis-ranking when one place is at least 1.5 times the other and
// they are at least 5 places apart: WR 20 rated #10 is underranked, WR 100 rated #90 or
// WR 2 rated #1 is fair.
export const VERDICT_RATIO = 1.5;
export const VERDICT_MIN_GAP = 5;

export function worldRankVerdict(worldRank, place) {
  if (worldRank == null || place == null) return null;
  const gap = worldRank - place;
  if (Math.abs(gap) < VERDICT_MIN_GAP) return null;
  if (worldRank >= place * VERDICT_RATIO) return "under";
  if (place >= worldRank * VERDICT_RATIO) return "over";
  return null;
}

const VERDICT_LABELS = { under: "Underranked", over: "Overranked" };

// The players that pass the filters, each with its rank by rating among them, in the
// chosen order. The vs WR place counts every world-ranked player in the Active or All time
// view, whatever the nation and name filters, so it matches the world ranking's scope.
export function visiblePlayers(players, {
  query, nation, active, cutoff, sort, ascending, verdict = "",
}) {
  const inView = players.filter((p) => !active || (p.last_played && p.last_played >= cutoff));
  const ranked = withWorldRankGap(inView)
    .filter((p) => (!nation || p.nation === nation) && matchesQuery(p.name, query)
      && (!verdict || p.wr_verdict === verdict))
    .map((p, index) => ({ ...p, rank: index + 1 }));
  if (sort === "rating" && !ascending) return ranked;
  const key = SORTS[sort] || SORTS.rating;
  const direction = ascending ? -1 : 1;
  return ranked.slice().sort((a, b) => {
    const va = key(a);
    const vb = key(b);
    if (va == null || vb == null) return (va == null) - (vb == null) || a.rank - b.rank;
    return (vb - va) * direction || a.rank - b.rank;
  });
}

function playerRow(p) {
  const flag = getCountryFlag(p.nation);
  const change = p.change;
  return el("tr", {},
    el("td", { class: "num b-rank" }, String(p.rank)),
    el("td", { class: "b-player" },
      el("a", { href: `./?p1=${p.id}` }, p.name),
      p.nation || p.world_rank != null
        ? el("span", { class: "b-sub" },
          flag ? el("span", { "aria-hidden": "true" }, `${flag} `) : null, p.nation,
          p.world_rank != null
            ? el("span", { class: "b-narrow" },
              `${p.nation ? " · " : ""}WR ${formatNumber(p.world_rank)} (${signed(p.wr_gap)})`)
            : null,
          p.wr_verdict
            ? el("span", {
              class: `b-verdict is-${p.wr_verdict}`,
              title: `${formatNumber(p.world_rank)} in the world ranking, #${formatNumber(p.wr_place)} by rating`,
            }, VERDICT_LABELS[p.wr_verdict])
            : null)
        : null),
    el("td", { class: "num b-rating" },
      formatNumber(p.rating),
      el("span", { class: "b-rd" }, el("span", { class: "sr-only" }, " plus or minus "),
        el("span", { "aria-hidden": "true" }, "±"), formatNumber(p.rd))),
    el("td", {
      class: `num b-change${change > 0 ? " is-up" : change < 0 ? " is-down" : ""}`,
    }, signed(change)),
    el("td", { class: "num b-wide b-wr" }, p.world_rank == null ? "–" : formatNumber(p.world_rank)),
    el("td", {
      class: `num b-wide b-change${p.wr_gap > 0 ? " is-up" : p.wr_gap < 0 ? " is-down" : ""}`,
      title: p.wr_gap == null
        ? null
        : `#${formatNumber(p.wr_place)} by rating among world-ranked players, #${formatNumber(p.world_rank)} in the world ranking`,
    }, signed(p.wr_gap)),
    el("td", { class: "num b-wide" }, p.peak == null ? "–" : formatNumber(p.peak)),
    el("td", { class: "num b-wide" }, formatNumber(p.games)),
    el("td", { class: "num b-wide b-date" }, p.last_played ? formatDate(p.last_played) : "–"));
}

function syncUrl() {
  writeParams({
    q: state.query.trim(),
    nation: state.nation,
    wr: state.verdict,
    all: state.active ? "" : "1",
    sort: state.sort === "rating" && !state.ascending
      ? ""
      : `${state.sort}${state.ascending ? "-asc" : ""}`,
  });
}

function render() {
  const list = visiblePlayers(state.players, { ...state, cutoff: activeCutoff() });
  const shown = list.slice(0, state.shown);
  $("b-rows").replaceChildren(...shown.map(playerRow));
  if (!list.length) {
    $("b-rows").append(el("tr", {}, el("td", { colspan: 9, class: "b-empty" },
      "No players match these filters.")));
  }
  const more = $("b-more");
  more.hidden = list.length <= shown.length;
  more.textContent = `Show more (${formatNumber(list.length - shown.length)} left)`;
  $("b-status").textContent = list.length
    ? `${formatNumber(list.length)} ${list.length === 1 ? "player" : "players"}`
    : "No players";
  document.querySelectorAll("th button[data-sort]").forEach((button) => {
    const th = button.closest("th");
    if (button.dataset.sort === state.sort) {
      th.setAttribute("aria-sort", state.ascending ? "ascending" : "descending");
    } else th.removeAttribute("aria-sort");
  });
  document.querySelectorAll("[data-active]").forEach((button) => {
    button.setAttribute("aria-pressed", String((button.dataset.active === "1") === state.active));
  });
  const sortValue = `${state.sort}${state.ascending ? "-asc" : ""}`;
  const sortSelect = $("b-sort");
  // A sort the phone list doesn't offer (from a shared desktop link) leaves it blank.
  if (sortSelect) sortSelect.value = sortValue;
}

function update() {
  state.shown = PAGE_SIZE;
  syncUrl();
  render();
}

function readState() {
  const params = readParams();
  state.query = params.get("q") || "";
  state.nation = params.get("nation") || "";
  state.verdict = ["under", "over"].includes(params.get("wr")) ? params.get("wr") : "";
  state.active = params.get("all") !== "1";
  const [sort, dir] = String(params.get("sort") || "").split("-");
  state.sort = SORTS[sort] ? sort : "rating";
  state.ascending = dir === "asc";
}

function bind() {
  const query = $("b-query");
  query.value = state.query;
  query.addEventListener("input", debounce(() => {
    state.query = query.value;
    update();
  }, 150));
  const verdict = $("b-verdict");
  verdict.value = state.verdict;
  verdict.addEventListener("change", (event) => {
    state.verdict = event.target.value;
    update();
  });
  $("b-nation").addEventListener("change", (event) => {
    state.nation = event.target.value;
    update();
  });
  document.querySelectorAll("[data-active]").forEach((button) => {
    button.addEventListener("click", () => {
      state.active = button.dataset.active === "1";
      update();
    });
  });
  document.querySelectorAll("th button[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      state.ascending = key === state.sort ? !state.ascending : false;
      state.sort = key;
      update();
    });
  });
  $("b-sort")?.addEventListener("change", (event) => {
    const [key, dir] = event.target.value.split("-");
    state.sort = SORTS[key] ? key : "rating";
    state.ascending = dir === "asc";
    update();
  });
  $("b-more").addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    render();
  });
}

async function init() {
  initChrome();
  readState();
  bind();
  const main = $("main");
  try {
    const response = await fetch("data/leaderboard.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.asOf = data.as_of || "";
    state.players = rowsFromTable(data, "players").map((p) => ({
      ...p, name: decodeHtmlEntities(p.name),
    }));
    const days = Number(data.change_days) || 90;
    $("b-change-head").textContent = `${days} days`;
    $("b-change-head").parentElement.title = `Rating change over the last ${days} days`;
    const nations = [...new Set(state.players.map((p) => p.nation).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    fillSelect($("b-nation"), nations.map((nation) => ({ value: nation, label: nation })),
      state.nation);
    state.nation = $("b-nation").value;
    if (state.asOf) {
      $("b-meta").prepend(`Ratings as of ${formatDate(state.asOf)}. `);
    }
    $("b-table-wrap").hidden = false;
    render();
  } catch (error) {
    console.error(error);
    $("b-error").hidden = false;
  } finally {
    main.removeAttribute("aria-busy");
  }
}

if (typeof document !== "undefined" && document.getElementById("b-rows")) init();
