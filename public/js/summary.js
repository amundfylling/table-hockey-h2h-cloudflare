import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { formatDate, formatNumber } from "./utils.js";
import {
  enrichPlayerRecord,
  formatWorldRank,
  getAliasGroup,
} from "./players.js";
import {
  computeSeriesSummary,
  buildPlayoffSeries,
} from "./series.js";
import { updateFormTitle, getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { getActiveFilterCount } from "./filters.js";
import { el, icon, ICONS, requestView } from "./dom.js";
import { createPlayerSwitcher, closePlayerSwitcher } from "./switcher.js";
import { playoffGameChance, seriesWinChance } from "./forecast.js";
import {
  buildVerdict,
  groupTournaments,
  lastName,
  longestStreak,
  monthYear,
  opponentRecords,
  sideOf,
  tensionSentence,
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

function plural(count, one, many) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

function getScopeLabel() {
  const stage = {
    overall: "Overall",
    "round-robin": "Round-robin",
    playoff: isSeriesMode() ? "Playoff series" : "Playoff games",
  }[state.stageTab] || "Overall";
  const prefix = isSinglePlayerMode() ? "Career" : "Head-to-head";
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
  const { trigger, popover } = createPlayerSwitcher(player, side, selectionIds(player));
  return el("div", { class: `who ${side}` },
    el("span", { class: "tick", "aria-hidden": "true" }),
    trigger,
    el("div", { class: "meta" }, playerMeta(player) || " "),
    popover);
}

// [win, draw, loss] for player A if they met today: Glicko-2 ratings plus how the pair's
// earlier meetings went against those ratings, worked out at build time (scripts/ratings.py).
export function forecastFor(playerA, playerB) {
  const idsA = getAliasGroup(playerA.id);
  const idsB = getAliasGroup(playerB.id);
  for (const a of idsA) {
    for (const b of idsB) {
      const own = state.playerFileCache.get(a)?.opponents?.[String(b)]?.forecast;
      if (Array.isArray(own) && own.length === 3) return own;
      const other = state.playerFileCache.get(b)?.opponents?.[String(a)]?.forecast;
      if (Array.isArray(other) && other.length === 3) return [other[2], other[1], other[0]];
    }
  }
  return null;
}

// [low, high]: a 90% range for player A's expected points per game (win 1, draw ½) if they
// met today, from both ratings' uncertainty and how much the pair's results have varied.
export function forecastRangeFor(playerA, playerB) {
  const idsA = getAliasGroup(playerA.id);
  const idsB = getAliasGroup(playerB.id);
  for (const a of idsA) {
    for (const b of idsB) {
      const own = state.playerFileCache.get(a)?.opponents?.[String(b)]?.forecast_range;
      if (Array.isArray(own) && own.length === 2) return own;
      const other = state.playerFileCache.get(b)?.opponents?.[String(a)]?.forecast_range;
      if (Array.isArray(other) && other.length === 2) return [1 - other[1], 1 - other[0]];
    }
  }
  return null;
}

// Closes the open forecast explainer on Escape or a click elsewhere. Bound once.
let forecastInfoBound = false;
function bindForecastInfoDismiss() {
  if (forecastInfoBound) return;
  forecastInfoBound = true;
  const close = (focusButton) => {
    document.querySelectorAll(".forecast-info-btn[aria-expanded='true']").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      document.getElementById(button.getAttribute("aria-controls"))?.setAttribute("hidden", "");
      if (focusButton) button.focus();
    });
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".forecast-head")) close(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector(".forecast-info-btn[aria-expanded='true']")) {
      close(true);
    }
  });
}

function createForecastInfo(series, filtered) {
  bindForecastInfoDismiss();
  const id = "forecast-info";
  const past = series
    ? `The ring is the share of ${filtered ? "the series in this view" : "their playoff series"} each player has won, a tied series counting half. `
    : `The ring is the share of points each player has taken from ${filtered ? "the games in this view" : "all their games"}, a draw counting half. `;
  const today = series
    ? "The dot is the chance of winning a best-of-7 series (first to four wins) if they met today. "
    : "The dot is the share of points each player can expect from one game played today. ";
  const basis = "It comes from both players' ratings, which count every game and its goal "
    + "difference, and how their earlier meetings went compared with what the ratings expected. "
    + "The line through the dot is the range it could reasonably be in (90% likely), since "
    + "ratings are never exact.";
  const panel = el("div", { id, class: "forecast-info", hidden: true },
    el("p", {}, past),
    el("p", {}, today, basis),
    el("a", { href: "ratings", class: "forecast-info-link" }, "How the ratings and forecast work",
      icon(ICONS.right)));
  const button = el("button", {
    type: "button",
    class: "forecast-info-btn",
    "aria-expanded": "false",
    "aria-controls": id,
    "aria-label": "About this forecast",
    onclick: () => {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", open ? "true" : "false");
      panel.hidden = !open;
    },
  }, icon(ICONS.info));
  return el("div", { class: "forecast-head" },
    el("h2", { class: "forecast-title" }, series ? "Series: past vs today" : "Past vs today"),
    button,
    panel);
}

// A side's share as "Steen 61%", or "Even" when it rounds to 50%.
function shareLabel(shareA, nameA, nameB) {
  const pctA = Math.round(shareA * 100);
  if (pctA === 50) return "Even";
  // A near-certain series still isn't certain.
  const shown = (value) => (value >= 100 ? "99%+" : `${value}%`);
  return pctA > 50 ? `${nameA} ${shown(pctA)}` : `${nameB} ${shown(100 - pctA)}`;
}

// Where a share sits on the strip: the closer to a name, the better for that player.
// A on the left (0%), B on the right (100%), so the position is B's share.
const at = (shareA) => `${((1 - shareA) * 100).toFixed(2)}%`;

// Label placement that keeps text inside the strip near either end.
function edgeAlign(shareA) {
  const x = 1 - shareA;
  return x < 0.18 ? "start" : x > 0.82 ? "end" : "mid";
}

// Past vs today: a hollow ring for the record so far (points share, draws half) and a solid
// dot for today's forecast, with a whisker for its 90% range. Replaces the two look-alike bars.
function createTension(summary) {
  const forecast = forecastFor(state.playerA, state.playerB);
  if (!forecast || !summary.total) return null;
  const series = isSeriesMode();
  const filtered = getActiveFilterCount() > 0;
  const nameA = lastName(state.playerA.name);
  const nameB = lastName(state.playerB.name);
  const pct = (value) => `${Math.round(value * 100)}%`;
  const past = (summary.winsA + summary.draws / 2) / summary.total;
  const rawRange = forecastRangeFor(state.playerA, state.playerB);
  let today;
  let range = null;
  let drawChance = null;
  if (series) {
    today = seriesWinChance(playoffGameChance(forecast), 4);
    // A drawn game goes to overtime, which splits like decided games, so expected points
    // per game work as the single-game chance at the range's ends.
    if (rawRange) range = [seriesWinChance(rawRange[0], 4), seriesWinChance(rawRange[1], 4)];
  } else {
    const [win, draw] = forecast;
    today = win + draw / 2;
    drawChance = draw;
    if (rawRange) range = rawRange;
  }
  if (range) range = [Math.min(range[0], today), Math.max(range[1], today)];

  const pastWord = filtered ? "This view"
    : series ? "Series so far"
      : { "round-robin": "Round-robin", playoff: "Playoff games" }[state.stageTab] || "All games";
  const todayWord = series ? "Series today" : "Today";
  const pastSide = sideOf(past);
  const todaySide = sideOf(today);
  const tone = (side) => (side === "even" ? "even" : side);
  const left = Math.min(1 - past, 1 - today) * 100;
  const width = Math.abs(past - today) * 100;

  const label = (kind, word, shareA, side) => el("span", {
    class: `db-label db-label--${kind} is-${edgeAlign(shareA)} tone-${tone(side)}`,
    style: { left: at(shareA) },
  }, el("span", { class: "db-word" }, word), " ", el("b", {}, shareLabel(shareA, nameA, nameB)));

  const rangeText = range
    ? ` (likely between ${shareLabel(range[0], nameA, nameB)} and ${shareLabel(range[1], nameA, nameB)})`
    : "";
  const unitPast = series ? "of their playoff series" : "of the points";
  const unitToday = series ? "chance of winning a best-of-7 series today" : "of the points in one game today";
  const aria = `Past vs today. ${pastWord}: ${shareLabel(past, nameA, nameB)} ${unitPast}. `
    + `${todayWord}: ${shareLabel(today, nameA, nameB)} ${unitToday}${rangeText}.`
    + (drawChance != null ? ` Chance of a draw ${pct(drawChance)}.` : "");

  const strip = el("div", { class: "dumbbell", role: "img", "aria-label": aria },
    label("past", pastWord, past, pastSide),
    el("div", { class: "db-track", "aria-hidden": "true" },
      el("span", { class: "db-half db-half--a" }),
      el("span", { class: "db-half db-half--b" }),
      el("span", { class: "db-even" }),
      el("span", { class: "db-link", style: { left: `${left.toFixed(2)}%`, width: `${width.toFixed(2)}%` } }),
      range ? el("span", {
        class: `db-whisker tone-${tone(todaySide)}`,
        style: { left: at(range[1]), width: `${((range[1] - range[0]) * 100).toFixed(2)}%` },
      }) : null,
      el("span", { class: `db-ring tone-${tone(pastSide)}`, style: { left: at(past) } }),
      el("span", { class: `db-dot tone-${tone(todaySide)}`, style: { left: at(today) } })),
    label("today", todayWord, today, todaySide));

  const ends = el("div", { class: "db-ends", "aria-hidden": "true" },
    el("span", { class: "db-end a" }, nameA),
    el("span", { class: "db-end-mid" }, "50/50"),
    el("span", { class: "db-end b" }, nameB));

  const key = el("p", { class: "db-key", "aria-hidden": "true" },
    el("span", {}, el("i", { class: "db-key-ring" }), series ? "Series won" : "Points so far"),
    el("span", {}, el("i", { class: "db-key-dot" }), range ? "Today, with likely range" : "Today"),
    drawChance != null ? el("span", { class: "db-badge" }, `Draw ${pct(drawChance)}`) : null);

  return el("div", { class: "tension" },
    createForecastInfo(series, filtered),
    ends,
    strip,
    key,
    el("p", { class: "db-note" }, tensionSentence({ past, today, range, nameA, nameB, filtered })));
}

function createMatchupHero(items, summary) {
  const series = isSeriesMode();
  const { winsA, winsB, draws, total } = summary;
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
    draws ? (series ? plural(draws, "tied", "tied") : plural(draws, "draw", "draws")) : "",
    formatSpan(first?.date, last?.end_date || last?.date),
    plural(tournaments, "tournament", "tournaments"),
  ].filter(Boolean).join(" · "));

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
    el("div", { class: "board", dataset: { lead: winsA === winsB ? "tie" : winsA > winsB ? "a" : "b" } },
      createWho(state.playerA, "a"),
      el("div", { class: "mid" }, score, facts),
      createWho(state.playerB, "b")),
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
    tapeSub.textContent = `${filtered ? "" : "All "}${formatNumber(summary.total)} ${filtered ? `${unit} in this view` : unit} · tick marks 50/50`;
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
    el("div", { class: "p-top" },
      el("div", {},
        // The page heading is the hidden #headline, which already names the player.
        el("p", { class: "p-name" }, player.name),
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
    : "No games for this filter.";

  closePlayerSwitcher();
  const crumbsSlot = document.getElementById("summary-crumbs");
  const tensionSlot = document.getElementById("summary-tension");
  if (single) {
    crumbsSlot?.replaceChildren(crumbs([{ label: "Players", nav: "players" }, { label: state.playerA.name }]));
    tensionSlot?.replaceChildren();
    elements.summaryHero.replaceChildren(createPlayerHero(items, summary));
    elements.summaryGrid.replaceChildren();
  } else {
    crumbsSlot?.replaceChildren(crumbs([
      { label: "Head-to-head", nav: "home" },
      { label: `${lastName(state.playerA.name)} vs ${lastName(state.playerB.name)}` },
    ]));
    const tension = createTension(summary);
    tensionSlot?.replaceChildren(...(tension ? [tension] : []));
    const hero = createMatchupHero(items, summary);
    elements.summaryHero.replaceChildren(hero);
    animateHeroNumbers(hero, summary.winsA, summary.winsB);
    renderTape(items, summary);
  }
  renderScoreBug(summary.winsA, summary.winsB);
}
