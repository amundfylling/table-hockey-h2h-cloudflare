import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { formatDate, formatDateRange, formatNumber, normalizeText } from "./utils.js";
import {
  enrichPlayerRecord,
  formatWorldRank,
  getAliasGroup,
} from "./players.js";
import {
  formatSeriesLength,
  computeSeriesSummary,
  buildPlayoffSeries,
} from "./series.js";
import { updateFormTitle, getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { getItemSourceUrl } from "./table.js";
import { getActiveFilterCount } from "./filters.js";
import { el, icon, ICONS, requestView } from "./dom.js";
import {
  buildVerdict,
  groupTournaments,
  lastName,
  longestStreak,
  monthYear,
  opponentRecords,
} from "./insights.js";

const DASH = "—";
const PCT = (value) => `${value.toFixed(1)}%`;

export function computeSummary(matches) {
  const summary = {
    total: matches.length,
    winsA: 0,
    winsB: 0,
    draws: 0,
    goalsA: 0,
    goalsB: 0,
    otGames: 0,
    otWinsA: 0,
    otWinsB: 0,
    tightWins: 0,
    tightLosses: 0,
    largestWin: null,
    largestLoss: null,
    firstDate: null,
    lastDate: null,
    tournaments: new Set(),
  };

  matches.forEach((match) => {
    summary.goalsA += match.goals_a;
    summary.goalsB += match.goals_b;

    if (match.result === "A") summary.winsA += 1;
    if (match.result === "B") summary.winsB += 1;
    if (match.result === "D") summary.draws += 1;

    if (match.overtime) {
      summary.otGames += 1;
      if (match.result === "A") summary.otWinsA += 1;
      if (match.result === "B") summary.otWinsB += 1;
    }

    if (match.goal_abs === 1) {
      if (match.result === "A") summary.tightWins += 1;
      if (match.result === "B") summary.tightLosses += 1;
    }

    if (match.result === "A") {
      if (!summary.largestWin || match.goal_diff > summary.largestWin.goal_diff) {
        summary.largestWin = match;
      }
    } else if (match.result === "B") {
      if (!summary.largestLoss || match.goal_diff < summary.largestLoss.goal_diff) {
        summary.largestLoss = match;
      }
    }

    if (match.date) {
      if (!summary.firstDate || match.ts < summary.firstDate.ts) {
        summary.firstDate = match;
      }
      if (!summary.lastDate || match.ts > summary.lastDate.ts) {
        summary.lastDate = match;
      }
    }

    if (match.tournament_key) {
      summary.tournaments.add(match.tournament_key);
    }
  });

  return summary;
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

export function formatCardValue(value) {
  if (value == null || value === "") return DASH;
  if (Number.isNaN(value)) return DASH;
  return typeof value === "number" ? formatNumber(value) : String(value);
}

export function getHighlightInfo(match, side) {
  if (!match) {
    return { score: DASH, date: DASH, opponent: DASH, tournament: DASH, url: "" };
  }
  if (isSinglePlayerMode()) {
    return {
      score: scoreFormat(match) || DASH,
      date: match.date ? formatDate(match.date) : DASH,
      opponent: match.opponent_name || DASH,
      tournament: match.tournament_name || DASH,
      url: getItemSourceUrl(match) || "",
    };
  }
  const score = side === "b" ? `${match.goals_b}–${match.goals_a}` : scoreFormat(match);
  const opponent = side === "b" ? state.playerA?.name : state.playerB?.name;
  return {
    score: score || DASH,
    date: match.date ? formatDate(match.date) : DASH,
    opponent: opponent || DASH,
    tournament: match.tournament_name || DASH,
    url: getItemSourceUrl(match) || "",
  };
}

// Local helper to avoid importing from table.js
function scoreFormat(match) {
  if (!match) return DASH;
  if (!Number.isFinite(match.goals_a) || !Number.isFinite(match.goals_b)) return DASH;
  return `${match.goals_a}–${match.goals_b}`;
}

export function getCanonOpponentKey(item) {
  if (!item || !isSinglePlayerMode()) return "";
  if (item.opponent_id != null) {
    const opponentId = Number(item.opponent_id);
    const canonicalId = Number.isInteger(opponentId) ? getAliasGroup(opponentId)[0] : opponentId;
    return `id:${canonicalId}`;
  }
  return normalizeText(item.opponent_name || "");
}

export function getCanonRivalryTooltip(winItem, lossItem) {
  const winKey = getCanonOpponentKey(winItem);
  const lossKey = getCanonOpponentKey(lossItem);
  return winKey && winKey === lossKey
    ? "The biggest win and biggest loss were against the same opponent."
    : "";
}

export function getSeriesHighlightInfo(series, side) {
  if (!series) {
    return { score: DASH, date: DASH, opponent: DASH, tournament: DASH, url: "" };
  }
  if (isSinglePlayerMode()) {
    return {
      score: `${series.game_wins_a}–${series.game_wins_b}`,
      date: formatDateRange(series.date, series.end_date),
      opponent: series.opponent_name || DASH,
      tournament: `${series.tournament_name || DASH} · ${formatSeriesLength(series)} · goals ${series.goals_a}–${series.goals_b}`,
      url: getItemSourceUrl(series) || "",
    };
  }
  const score =
    side === "b"
      ? `${series.game_wins_b}–${series.game_wins_a}`
      : `${series.game_wins_a}–${series.game_wins_b}`;
  const goalScore = side === "b" ? `${series.goals_b}–${series.goals_a}` : `${series.goals_a}–${series.goals_b}`;
  return {
    score,
    date: formatDateRange(series.date, series.end_date),
    opponent: side === "b" ? state.playerA?.name : state.playerB?.name,
    tournament: `${series.tournament_name || DASH} · ${formatSeriesLength(series)} · goals ${goalScore}`,
    url: getItemSourceUrl(series) || "",
  };
}


function plural(count, one, many) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function getScopeLabel() {
  const stage = {
    overall: "Overall",
    "round-robin": "Round-robin",
    playoff: isSeriesMode() ? "Playoff series" : "Playoff games",
  }[state.stageTab] || "Overall";
  const prefix = isSinglePlayerMode() ? "Career" : "Head to head";
  const filtered = getActiveFilterCount() > 0 ? " · Filtered" : "";
  return `${prefix} · ${stage}${filtered}`;
}

function formatSpan(firstDate, lastDate) {
  if (!firstDate || !lastDate) return "";
  const firstYear = String(firstDate).slice(0, 4);
  const lastYear = String(lastDate).slice(0, 4);
  return firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
}

function birthYear(player) {
  const match = String(player?.date_of_birth || "").match(/(\d{4})/);
  const year = match ? Number(match[1]) : null;
  return year && year > 1920 && year < new Date().getFullYear() - 5 ? year : null;
}

export function formatPlayerPlace(player) {
  const enriched = player?.id != null ? enrichPlayerRecord(player) : player;
  return [enriched?.city, enriched?.country].filter(Boolean).join(", ");
}

function playerMeta(player, extra = []) {
  const enriched = player?.id != null ? enrichPlayerRecord(player) : player;
  return [formatPlayerPlace(enriched), formatWorldRank(enriched), ...extra].filter(Boolean).join(" · ");
}

function selectionIds(player) {
  if (!player?.id) return [];
  return player.ids?.length ? player.ids : getAliasGroup(Number(player.id));
}

function crumbs(items) {
  const nav = el("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
  items.forEach((item, index) => {
    if (index) nav.append(el("span", { class: "sep", "aria-hidden": "true" }, "/"));
    nav.append(item.nav
      ? el("a", { href: "./", "data-nav": item.nav }, item.label)
      : el("span", { "aria-current": index === items.length - 1 ? "page" : null }, item.label));
  });
  return nav;
}

function itemSummary(items) {
  return isSeriesMode() ? computeSeriesSummary(items) : computeSummary(items);
}

// ── Matchup hero ────────────────────────────────────────────────────
function createWho(player, side) {
  const name = el("button", {
    class: "name link-btn",
    type: "button",
    title: `Open ${player.name}'s career`,
    onclick: () => requestView({ p1: Number(player.id), p1Ids: selectionIds(player) }),
  }, player.name);
  return el("div", { class: `who ${side}` },
    el("span", { class: "tick", "aria-hidden": "true" }),
    name,
    el("div", { class: "meta" }, playerMeta(player) || " "));
}

function createMatchupHero(items, summary) {
  const series = isSeriesMode();
  const { winsA, winsB, draws, total } = summary;
  const pctA = total ? (winsA / total) * 100 : 0;
  const pctD = total ? (draws / total) * 100 : 0;
  const pctB = total ? (winsB / total) * 100 : 0;
  const ordered = getChronologicalItems(items);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const tournaments = summary.tournaments?.size || 0;

  const score = el("div", {
    class: "score",
    role: "img",
    "aria-label": `${state.playerA.name} ${formatNumber(winsA)}, ${state.playerB.name} ${formatNumber(winsB)}`,
  },
  el("span", { class: "num a hero-num--a" }, formatNumber(winsA)),
  el("span", { class: "dash", "aria-hidden": "true" }, "–"),
  el("span", { class: "num b hero-num--b" }, formatNumber(winsB)));

  const facts = el("p", { class: "facts" }, [
    series ? plural(total, "playoff series", "playoff series") : plural(total, "game", "games"),
    formatSpan(first?.date, last?.end_date || last?.date),
    plural(tournaments, "tournament", "tournaments"),
  ].filter(Boolean).join(" · "));

  const bar = el("div", { class: "share-bar", "aria-hidden": "true" },
    el("span", { style: { width: `${pctA}%`, background: "var(--a)" } }),
    draws ? el("span", { style: { width: `${pctD}%`, background: "var(--draw)" } }) : null,
    el("span", { style: { width: `${pctB}%`, background: "var(--b)" } }));
  const drawWord = series ? "tied" : draws === 1 ? "draw" : "draws";
  const winWord = series ? "series won" : "wins";
  const labels = el("div", { class: "share-labels" },
    el("span", {}, el("b", {}, PCT(pctA)), ` ${winWord}`),
    el("span", {}, `${formatNumber(draws)} ${drawWord} · ${PCT(pctD)}`),
    el("span", {}, el("b", {}, PCT(pctB)), ` ${winWord}`));

  const groups = series ? [] : groupTournaments(items);
  const verdictParts = buildVerdict({
    ordered,
    nameA: state.playerA.name,
    nameB: state.playerB.name,
    unit: series ? "series" : "wins",
    tournaments: groups,
  });
  const verdict = el("p", { class: "verdict" },
    verdictParts.map((part) => (part.strong ? el("strong", {}, part.text) : part.text)));

  return el("div", { class: "matchup-hero" },
    crumbs([
      { label: "Head-to-head", nav: "home" },
      { label: `${lastName(state.playerA.name)} vs ${lastName(state.playerB.name)}` },
    ]),
    el("div", { class: "board", dataset: { lead: winsA === winsB ? "tie" : winsA > winsB ? "a" : "b" } },
      createWho(state.playerA, "a"),
      el("div", { class: "mid" }, score, facts),
      createWho(state.playerB, "b")),
    el("div", { class: "share" }, bar, labels),
    verdict);
}

// ── Tale of the tape: one bar per row split by share ────────────────
function tapeRow(label, a, b, options = {}) {
  const shareA = options.shareA ?? a;
  const shareB = options.shareB ?? b;
  const sum = shareA + shareB;
  const lead = shareA === shareB ? "" : shareA > shareB ? "a" : "b";
  const format = options.format || formatNumber;
  const value = (side, raw, sub) => el("span", {
    class: `v${side === "b" ? " r" : ""}${lead === side ? ` win ${side}` : ""}`,
  }, format(raw), sub ? el("span", { class: "tape-sub" }, sub) : null);
  const pctA = sum ? (shareA / sum) * 100 : 50;
  return el("div", { class: "tape-row" },
    el("div", { class: "tape-top" },
      value("a", a, options.subA),
      el("span", { class: "k" }, label),
      value("b", b, options.subB)),
    el("div", {
      class: `tape-bar${sum ? "" : " is-empty"}`,
      role: "img",
      "aria-label": sum ? `${label}: ${PCT(pctA)} to ${PCT(100 - pctA)}` : `${label}: none`,
    },
    sum ? el("span", { style: { width: `${pctA}%`, background: "var(--a)" } }) : null,
    sum ? el("span", { style: { width: `${100 - pctA}%`, background: "var(--b)" } }) : null,
    el("i")));
}

function seriesWins(games) {
  const series = buildPlayoffSeries(games);
  return {
    a: series.filter((item) => item.result === "A").length,
    b: series.filter((item) => item.result === "B").length,
  };
}

function biggestScore(item, side) {
  if (!item) return DASH;
  if (item.type === "series") {
    return side === "a" ? `${item.game_wins_a}–${item.game_wins_b}` : `${item.game_wins_b}–${item.game_wins_a}`;
  }
  return side === "a" ? `${item.goals_a}–${item.goals_b}` : `${item.goals_b}–${item.goals_a}`;
}

function margin(item) {
  if (!item) return 0;
  return item.type === "series"
    ? Math.abs((item.game_wins_a || 0) - (item.game_wins_b || 0))
    : Math.abs(item.goal_diff || 0);
}

function renderTape(items, summary) {
  const rows = [];
  const ordered = getChronologicalItems(items);
  const series = isSeriesMode();
  if (series) {
    rows.push(tapeRow("Series won", summary.winsA, summary.winsB));
    rows.push(tapeRow("Games won in series", summary.gameWinsA, summary.gameWinsB));
    rows.push(tapeRow("Goals in series", summary.goalsA, summary.goalsB));
  } else {
    rows.push(tapeRow("Wins", summary.winsA, summary.winsB));
    rows.push(tapeRow("Goals", summary.goalsA, summary.goalsB));
    rows.push(tapeRow("One-goal wins", summary.tightWins, summary.tightLosses));
    rows.push(tapeRow("Overtime wins", summary.otWinsA, summary.otWinsB));
    const playoffGames = items.filter((item) => item.stage_type === "playoff");
    if (playoffGames.length) {
      const won = seriesWins(playoffGames);
      rows.push(tapeRow("Playoff series won", won.a, won.b));
    }
  }
  rows.push(tapeRow("Longest win streak", longestStreak(ordered, "A"), longestStreak(ordered, "B")));
  const bigA = summary.largestWin;
  const bigB = summary.largestLoss;
  rows.push(tapeRow("Biggest win", biggestScore(bigA, "a"), biggestScore(bigB, "b"), {
    shareA: margin(bigA),
    shareB: margin(bigB),
    format: (value) => value,
    subA: bigA?.date ? formatDate(bigA.date) : "",
    subB: bigB?.date ? formatDate(bigB.date) : "",
  }));
  elements.summaryGrid.replaceChildren(...rows);
  const tapeSub = document.getElementById("tape-sub");
  if (tapeSub) {
    const unit = series ? "playoff series" : "games";
    const filtered = getActiveFilterCount() > 0 || state.stageTab !== "overall";
    tapeSub.textContent = `${filtered ? "" : "All "}${formatNumber(summary.total)} ${filtered ? `${unit} in this view` : unit} · centre line is 50/50`;
  }
}

// ── Player hero and key numbers ─────────────────────────────────────
function kpi(label, value, sub, className = "") {
  return el("div", { class: `kpi ${className}`.trim() },
    el("div", { class: "eyebrow" }, label),
    el("div", { class: "v" }, value),
    el("div", { class: "s" }, sub));
}

function createPlayerHero(items, summary) {
  const series = isSeriesMode();
  const player = enrichPlayerRecord(state.playerA);
  const firstEver = getChronologicalItems(state.baseMatches)[0];
  const born = birthYear(player);
  const meta = playerMeta(player, [
    born ? `Born ${born}` : "",
    firstEver?.date ? `Playing since ${monthYear(firstEver.date)}` : "",
  ]);
  const { winsA, winsB, draws, total } = summary;
  const records = opponentRecords(items, (id) => getAliasGroup(id)[0]);
  const topTwo = records.slice(0, 2).reduce((sum, record) => sum + record.games, 0);
  const diff = summary.goalsA - summary.goalsB;
  const perItem = total ? diff / total : 0;

  const compare = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => requestView({ action: "compare-with" }),
  }, icon(ICONS.swap), "Compare with…");

  const kpis = el("div", { class: "panel kpis" },
    kpi(series ? "Series" : "Games", formatNumber(total),
      plural(summary.tournaments?.size || 0, "tournament", "tournaments")),
    kpi("Record", `${formatNumber(winsA)}–${formatNumber(draws)}–${formatNumber(winsB)}`,
      series ? "Won, tied, lost" : "Wins, draws, losses", "rec"),
    kpi("Win rate", total ? PCT((winsA / total) * 100) : DASH,
      total ? `${PCT(((winsA + draws / 2) / total) * 100)} counting ${series ? "ties" : "draws"} as half` : ""),
    series
      ? kpi("Games won", `${formatNumber(summary.gameWinsA)}–${formatNumber(summary.gameWinsB)}`,
        plural(summary.totalGames, "game played", "games played"))
      : kpi("Goals", `${formatNumber(summary.goalsA)}–${formatNumber(summary.goalsB)}`,
        `${perItem >= 0 ? "+" : "−"}${Math.abs(perItem).toFixed(2)} per game`),
    kpi("Opponents", formatNumber(records.length),
      records.length > 2 && total ? `${Math.round((topTwo / total) * 100)}% of ${series ? "series" : "games"} against two of them` : ""));

  return el("div", { class: "player-hero" },
    crumbs([{ label: "Players", nav: "players" }, { label: player.name }]),
    el("div", { class: "p-top" },
      el("div", {},
        el("h1", { class: "p-name" }, player.name),
        meta ? el("p", { class: "p-meta" }, meta) : null),
      el("div", { class: "actions" }, compare)),
    kpis);
}

// ── Shared ──────────────────────────────────────────────────────────
function renderMatchupResult(summary) {
  if (!elements.matchupResult) return;
  elements.matchupResult.hidden = isSinglePlayerMode() || !summary.total;
  if (elements.matchupResult.hidden) return;

  const { winsA, winsB, draws, total } = summary;
  const seriesMode = isSeriesMode();
  elements.matchupResultScope.textContent = getScopeLabel();

  if (winsA === winsB) {
    elements.matchupResultTitle.textContent = `Level at ${winsA}–${winsB}`;
    elements.matchupResult.dataset.leader = "tied";
  } else {
    const leaderIsA = winsA > winsB;
    const leader = leaderIsA ? state.playerA : state.playerB;
    elements.matchupResultTitle.textContent =
      `${leader.name} leads ${Math.max(winsA, winsB)}–${Math.min(winsA, winsB)}`;
    elements.matchupResult.dataset.leader = leaderIsA ? "a" : "b";
  }

  const unit = seriesMode ? "playoff series" : (total === 1 ? "game" : "games");
  const drawUnit = seriesMode ? "tied series" : (draws === 1 ? "draw" : "draws");
  elements.matchupResultDetail.textContent =
    `${formatNumber(total)} ${unit} · ${formatNumber(draws)} ${drawUnit}`;
}

// A short count-up on the matchup score; skipped for reduced motion and re-renders.
let lastAnimatedKey = "";
function animateHeroNumbers(hero, winsA, winsB) {
  const key = `${state.playerA?.id}:${state.playerB?.id}:${winsA}:${winsB}`;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || key === lastAnimatedKey || typeof requestAnimationFrame !== "function") {
    lastAnimatedKey = key;
    return;
  }
  lastAnimatedKey = key;
  const numA = hero.querySelector(".hero-num--a");
  const numB = hero.querySelector(".hero-num--b");
  if (!numA || !numB) return;
  const duration = 600;
  const start = performance.now();
  const step = (now) => {
    if (!hero.isConnected) return;
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    numA.textContent = formatNumber(Math.round(winsA * eased));
    numB.textContent = formatNumber(Math.round(winsB * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Slim sticky bar (phones) that keeps the matchup in view once the hero scrolls away.
function renderScoreBug(winsA, winsB) {
  const bug = document.getElementById("score-bug");
  if (!bug) return;
  const single = isSinglePlayerMode();
  const make = (className, text) => el("span", { class: className }, text);
  bug.replaceChildren(
    make("score-bug-name score-bug-name--a", state.playerA?.name || ""),
    make("score-bug-record", `${formatNumber(winsA)}–${formatNumber(winsB)}`),
    make(
      `score-bug-name score-bug-name--${single ? "field" : "b"}`,
      single ? "All opponents" : state.playerB?.name || ""
    )
  );
}

export function initScoreBug() {
  const hero = elements.summaryHero;
  if (!hero || typeof IntersectionObserver !== "function") return;
  const observer = new IntersectionObserver(([entry]) => {
    const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
    document.body.classList.toggle("show-score-bug", scrolledPast);
  });
  observer.observe(hero);
}

export function renderSummary(items) {
  updateFormTitle();
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB)) return;
  const single = isSinglePlayerMode();
  const summary = itemSummary(items);
  elements.record.hidden = true;
  renderMatchupResult(summary);

  elements.headline.textContent = single
    ? state.playerA.name
    : `${state.playerA.name} vs ${state.playerB.name}`;
  if (elements.summaryScope) elements.summaryScope.textContent = getScopeLabel();
  elements.subhead.textContent = summary.total
    ? getScopeLabel()
    : "No matches for this filter.";

  if (single) {
    elements.summaryHero.replaceChildren(createPlayerHero(items, summary));
    elements.summaryGrid.replaceChildren();
  } else {
    const hero = createMatchupHero(items, summary);
    elements.summaryHero.replaceChildren(hero);
    animateHeroNumbers(hero, summary.winsA, summary.winsB);
    renderTape(items, summary);
  }
  renderScoreBug(summary.winsA, summary.winsB);
}
