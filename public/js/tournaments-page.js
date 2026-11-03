// Tournaments browse page (tournaments.html): every tournament page from
// data/tournament-list.json, newest first, with search and year, country and level filters.
// The filters live in the URL (?q=, ?year=, ?country=, ?level=) for sharing.
import { el } from "./dom.js";
import { initChrome } from "./chrome.js";
import { getCountryFlag } from "./players.js";
import { formatDateRange, tournamentLabel } from "./date-range.js";
import {
  compareTournamentLevelKeys, debounce, decodeHtmlEntities, formatDate, formatNumber,
  getTournamentLevelLabel, normalizeTournamentLevel,
} from "./utils.js";
import { fillSelect, matchesQuery, PAGE_SIZE, readParams, rowsFromTable, writeParams } from "./browse.js";

const state = {
  tournaments: [],
  query: "",
  year: "",
  country: "",
  level: "",
  shown: PAGE_SIZE,
};

const $ = (id) => document.getElementById(id);

export function visibleTournaments(tournaments, { query, year, country, level }) {
  return tournaments.filter((t) => (!year || t.year === year)
    && (!country || t.country === country)
    && (!level || t.levelKey === level)
    && matchesQuery(t.searchText, query));
}

function finalist(entry) {
  if (!entry) return el("span", { class: "b-none" }, "–");
  const [id, name, linked] = entry;
  return linked
    ? el("a", { href: `./?p1=${id}` }, name)
    : el("span", {}, name);
}

function tournamentRow(t) {
  const flag = getCountryFlag(t.country);
  const place = [t.city, t.country].filter(Boolean).join(", ");
  const dates = formatDateRange(t.date, t.end_date) || formatDate(t.date);
  return el("tr", {},
    el("td", { class: "b-wide b-date" }, dates),
    el("td", { class: "b-player b-tname" },
      el("a", { href: `tournament.html?id=${t.id}` }, t.label),
      el("span", { class: "b-sub" },
        el("span", { class: "b-narrow" }, dates, place ? " · " : ""),
        flag && place ? el("span", { "aria-hidden": "true" }, `${flag} `) : null,
        place)),
    el("td", { class: "b-final" },
      t.champion ? el("span", { class: "sr-only b-narrow" }, "Winner: ") : null,
      finalist(t.champion)),
    el("td", { class: "b-wide b-final" }, finalist(t.runner_up)),
    el("td", { class: "num b-wide" }, formatNumber(t.players)),
    el("td", { class: "num b-wide" }, t.levelKey || "–"));
}

function syncUrl() {
  writeParams({
    q: state.query.trim(), year: state.year, country: state.country, level: state.level,
  });
}

function render() {
  const list = visibleTournaments(state.tournaments, state);
  const shown = list.slice(0, state.shown);
  $("b-rows").replaceChildren(...shown.map(tournamentRow));
  if (!list.length) {
    $("b-rows").append(el("tr", {}, el("td", { colspan: 6, class: "b-empty" },
      "No tournaments match these filters.")));
  }
  const more = $("b-more");
  more.hidden = list.length <= shown.length;
  more.textContent = `Show more (${formatNumber(list.length - shown.length)} left)`;
  $("b-status").textContent = list.length
    ? `${formatNumber(list.length)} ${list.length === 1 ? "tournament" : "tournaments"}`
    : "No tournaments";
}

function update() {
  state.shown = PAGE_SIZE;
  syncUrl();
  render();
}

function bind() {
  const query = $("b-query");
  query.value = state.query;
  query.addEventListener("input", debounce(() => {
    state.query = query.value;
    update();
  }, 150));
  ["year", "country", "level"].forEach((key) => {
    $(`b-${key}`).addEventListener("change", (event) => {
      state[key] = event.target.value;
      update();
    });
  });
  $("b-more").addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    render();
  });
}

// people: {id: [name, has a player page]} from the file's "players".
function prepare(t, people) {
  const person = (id) => {
    const entry = id == null ? null : people[String(id)];
    return entry ? [id, decodeHtmlEntities(entry[0]), Boolean(entry[1])] : null;
  };
  const name = decodeHtmlEntities(t.name);
  const champion = person(t.champion);
  const runnerUp = person(t.runner_up);
  const city = decodeHtmlEntities(t.city);
  const country = decodeHtmlEntities(t.country);
  return {
    ...t,
    name,
    label: tournamentLabel(name, t.date),
    city,
    country,
    champion,
    runner_up: runnerUp,
    year: /^\d{4}/.exec(t.date || "")?.[0] || "",
    levelKey: normalizeTournamentLevel(t.level) || "",
    searchText: [name, city, country, champion?.[1], runnerUp?.[1]].filter(Boolean).join(" "),
  };
}

async function init() {
  initChrome();
  const params = readParams();
  state.query = params.get("q") || "";
  bind();
  const main = $("main");
  try {
    const response = await fetch("data/tournament-list.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const people = data.players || {};
    state.tournaments = rowsFromTable(data, "tournaments").map((t) => prepare(t, people));
    const distinct = (key) => [...new Set(state.tournaments.map((t) => t[key]).filter(Boolean))];
    fillSelect($("b-year"), distinct("year").sort().reverse()
      .map((year) => ({ value: year, label: year })), params.get("year") || "");
    fillSelect($("b-country"), distinct("country").sort((a, b) => a.localeCompare(b))
      .map((country) => ({ value: country, label: country })), params.get("country") || "");
    fillSelect($("b-level"), distinct("levelKey").sort(compareTournamentLevelKeys)
      .map((level) => ({ value: level, label: getTournamentLevelLabel(level) })),
    params.get("level") || "");
    state.year = $("b-year").value;
    state.country = $("b-country").value;
    state.level = $("b-level").value;
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
