import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { toNumber, formatDate, formatDateRange, formatNumber, normalizeText } from "./utils.js";
import {
  enrichPlayerRecord,
  formatWorldRank,
  formatRankingTitle,
  getAliasGroup,
} from "./players.js";
import { formatSeriesLength, formatSeriesScore, computeSeriesSummary } from "./series.js";
import { updateFormTitle } from "./form.js?v=20260801-generational-run-v3";
import { getItemSourceUrl, createExternalIcon } from "./table.js";
import { getActiveFilterCount } from "./filters.js";

const DASH = "—";

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

function createHeroPlayer(player, fallback, side, isLeader) {
  const enriched = player?.id != null ? enrichPlayerRecord(player) : player;
  const element = document.createElement("div");
  element.className = `hero-player hero-player--${side}`;
  if (isLeader) element.classList.add("is-leader");

  const name = document.createElement("span");
  name.className = "hero-player-name";
  name.textContent = enriched?.name || fallback;
  element.appendChild(name);

  const meta = document.createElement("span");
  meta.className = "hero-player-meta";
  const rank = player?.id != null ? formatWorldRank(enriched) : "";
  if (rank) {
    const rankEl = document.createElement("span");
    rankEl.className = "hero-player-rank";
    rankEl.textContent = rank;
    rankEl.title = formatRankingTitle(enriched);
    meta.appendChild(rankEl);
  }
  if (isLeader) {
    const lead = document.createElement("span");
    lead.className = "hero-lead-tag";
    lead.textContent = "Leads";
    meta.appendChild(lead);
  }
  if (meta.childNodes.length) element.appendChild(meta);
  return element;
}

// The one place the headline result is shown: names either side, the record between them.
export function createHero(winsA, winsB, caption) {
  const single = isSinglePlayerMode();
  const lead = winsA === winsB ? "tie" : winsA > winsB ? "a" : "b";
  const hero = document.createElement("div");
  hero.className = "hero";
  hero.dataset.lead = lead;

  const left = createHeroPlayer(state.playerA, "Player A", "a", !single && lead === "a");
  const right = single
    ? createHeroPlayer({ id: null, name: "All opponents" }, "All opponents", "field", false)
    : createHeroPlayer(state.playerB, "Player B", "b", lead === "b");

  const score = document.createElement("div");
  score.className = "hero-score";
  const record = document.createElement("div");
  record.className = "hero-record";
  const numA = document.createElement("span");
  numA.className = "hero-num hero-num--a";
  numA.textContent = formatNumber(winsA);
  const dash = document.createElement("span");
  dash.className = "hero-dash";
  dash.textContent = "–";
  const numB = document.createElement("span");
  numB.className = "hero-num hero-num--b";
  numB.textContent = formatNumber(winsB);
  record.append(numA, dash, numB);
  score.appendChild(record);
  if (caption) {
    const captionEl = document.createElement("div");
    captionEl.className = "hero-caption";
    captionEl.textContent = caption;
    score.appendChild(captionEl);
  }

  hero.append(left, score, right);
  return hero;
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

function renderHero(summary, caption) {
  if (elements.summaryScope) elements.summaryScope.textContent = getScopeLabel();
  if (elements.summaryHero) {
    const hero = createHero(summary.winsA, summary.winsB, caption);
    elements.summaryHero.replaceChildren(hero);
    animateHeroNumbers(hero, summary.winsA, summary.winsB);
  }
  renderScoreBug(summary.winsA, summary.winsB);
}

// A short count-up on the hero record; skipped for reduced motion and re-renders.
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
  const lead = winsA === winsB ? "tie" : winsA > winsB ? "a" : "b";
  const make = (className, text) => {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    return el;
  };
  bug.dataset.lead = lead;
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

function plural(count, one, many) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

export function createScoreRow(label, leftValue, rightValue, options = {}) {
  const leftNum = toNumber(leftValue, 0);
  const rightNum = toNumber(rightValue, 0);
  const hasMiddle = options.middleValue != null || options.middleDisplay != null || options.middleLabel;
  const middleNum = hasMiddle ? toNumber(options.middleValue, 0) : 0;
  const total = options.totalOverride != null ? options.totalOverride : leftNum + rightNum + middleNum;
  const leftRatio = total > 0 ? leftNum / total : 0;
  const middleRatio = total > 0 ? middleNum / total : 0;
  const rightRatio = total > 0 ? rightNum / total : 0;
  const leftDisplay =
    options.leftDisplay != null ? options.leftDisplay : formatCardValue(leftValue);
  const rightDisplay =
    options.rightDisplay != null ? options.rightDisplay : formatCardValue(rightValue);
  const middleDisplay =
    options.middleDisplay != null ? options.middleDisplay : formatCardValue(middleNum);
  const middleLabel = options.middleLabel || "Draws";
  const noteText = options.note ? String(options.note) : "";
  const better = options.better || "high";

  let lead = "tie";
  if (leftNum !== rightNum) {
    lead = better === "low" ? (leftNum < rightNum ? "a" : "b") : leftNum > rightNum ? "a" : "b";
  }

  const row = document.createElement("div");
  row.className = hasMiddle ? "score-row score-row--with-middle" : "score-row";
  row.dataset.lead = lead;
  row.dataset.better = better;
  row.style.setProperty("--left", leftRatio.toFixed(3));
  row.style.setProperty("--middle", middleRatio.toFixed(3));
  row.style.setProperty("--right", rightRatio.toFixed(3));

  const fillA = document.createElement("span");
  fillA.className = "score-fill score-fill--a";
  const fillMiddle = document.createElement("span");
  fillMiddle.className = "score-fill score-fill--middle";
  const fillB = document.createElement("span");
  fillB.className = "score-fill score-fill--b";

  const leftEl = document.createElement("div");
  leftEl.className = "score-value score-value--a";
  leftEl.textContent = leftDisplay;
  if (lead === "a") leftEl.classList.add("is-lead");

  const labelEl = document.createElement("div");
  labelEl.className = "score-label";
  labelEl.textContent = label;

  const rightEl = document.createElement("div");
  rightEl.className = "score-value score-value--b";
  rightEl.textContent = rightDisplay;
  if (lead === "b") rightEl.classList.add("is-lead");

  if (options.leftSub) leftEl.appendChild(createScoreSub(options.leftSub));
  if (options.rightSub) rightEl.appendChild(createScoreSub(options.rightSub));

  const bar = document.createElement("div");
  bar.className = "score-bar";
  bar.setAttribute("aria-hidden", "true");
  bar.appendChild(fillA);
  if (hasMiddle) bar.appendChild(fillMiddle);
  bar.appendChild(fillB);

  row.appendChild(leftEl);
  if (hasMiddle) {
    const centerEl = document.createElement("div");
    centerEl.className = "score-center";

    const middleEl = document.createElement("div");
    middleEl.className = "score-middle";

    const middleLabelEl = document.createElement("span");
    middleLabelEl.className = "score-middle-label";
    middleLabelEl.textContent = middleLabel;

    const middleValueEl = document.createElement("span");
    middleValueEl.className = "score-middle-value";
    middleValueEl.textContent = middleDisplay;

    middleEl.appendChild(middleLabelEl);
    middleEl.appendChild(middleValueEl);
    centerEl.appendChild(labelEl);
    centerEl.appendChild(middleEl);
    row.appendChild(centerEl);
  } else {
    row.appendChild(labelEl);
  }
  row.appendChild(rightEl);
  row.appendChild(bar);
  if (noteText) {
    const note = document.createElement("div");
    note.className = "score-note";
    note.textContent = noteText;
    row.appendChild(note);
  }
  return row;
}

function createScoreSub(text) {
  const sub = document.createElement("span");
  sub.className = "score-sub";
  sub.textContent = text;
  return sub;
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

export function createHighlightBlock(label, info, side, tooltip = "") {
  const block = document.createElement("div");
  block.className = `highlight highlight--${side}`;
  if (tooltip) block.title = tooltip;

  const title = document.createElement("div");
  title.className = "highlight-title";
  title.textContent = label;

  const score = document.createElement("div");
  score.className = "highlight-score";
  const hasResult = info.score && info.score !== DASH;
  if (hasResult) {
    score.textContent = info.score;
  } else {
    score.textContent = normalizeText(label).includes("loss") ? "No losses" : "No wins";
  }

  const meta = document.createElement("div");
  meta.className = "highlight-meta";
  const opponent = info.opponent !== DASH ? `vs ${info.opponent}` : DASH;
  const date = info.date !== DASH ? info.date : DASH;
  meta.textContent = hasResult ? `${opponent} · ${date}` : "For this selection";

  let tour;
  if (hasResult && info.url) {
    tour = document.createElement("a");
    tour.href = info.url;
    tour.target = "_blank";
    tour.rel = "noopener noreferrer external";
    tour.className = "highlight-tour highlight-tour--link";
    tour.appendChild(document.createTextNode(info.tournament));
    tour.appendChild(createExternalIcon());
  } else {
    tour = document.createElement("div");
    tour.className = "highlight-tour";
    tour.textContent = hasResult ? info.tournament : "";
  }
  if (hasResult && info.tournament && info.tournament !== DASH) {
    tour.title = info.tournament;
  }

  block.appendChild(title);
  block.appendChild(score);
  block.appendChild(meta);
  if (hasResult) block.appendChild(tour);
  return block;
}

export function createHighlightColumn(name, side, winInfo, label = "Largest win", tooltip = "") {
  const column = document.createElement("div");
  column.className = `highlight-column highlight-column--${side}`;

  const title = document.createElement("div");
  title.className = "highlight-column-title";
  title.textContent = name || "Player";
  if (name) title.title = name;

  column.appendChild(title);
  column.appendChild(createHighlightBlock(label, winInfo, side, tooltip));
  return column;
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

export function renderSummary(items) {
  if (isSeriesMode()) {
    renderSeriesSummary(items);
    return;
  }
  renderGameSummary(items);
}

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

function formatSpan(firstDate, lastDate) {
  if (!firstDate || !lastDate) return "";
  const firstYear = String(firstDate).slice(0, 4);
  const lastYear = String(lastDate).slice(0, 4);
  return firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
}

function setSubhead(parts) {
  elements.subhead.textContent = parts.filter(Boolean).join(" · ");
}

function createHighlights(summary, infoA, infoB, labelA, labelB) {
  const highlights = document.createElement("div");
  highlights.className = "scoreboard-highlights";
  const canonTooltip = getCanonRivalryTooltip(summary.largestWin, summary.largestLoss);
  const opponentLabel = isSinglePlayerMode() ? "Opponents" : state.playerB.name;
  highlights.appendChild(createHighlightColumn(state.playerA.name, "a", infoA, labelA, canonTooltip));
  highlights.appendChild(createHighlightColumn(opponentLabel, "b", infoB, labelB, canonTooltip));
  return highlights;
}

export function renderGameSummary(matches) {
  updateFormTitle();
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB)) return;
  const single = isSinglePlayerMode();
  elements.record.hidden = true;
  const summary = computeSummary(matches);
  renderMatchupResult(summary);
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;

  elements.headline.textContent = single
    ? state.playerA.name
    : `${state.playerA.name} vs ${state.playerB.name}`;
  if (total) {
    setSubhead([
      plural(total, "game", "games"),
      plural(summary.tournaments.size, "tournament", "tournaments"),
      formatSpan(summary.firstDate?.date, summary.lastDate?.date),
    ]);
  } else {
    elements.subhead.textContent = "No matches for this filter.";
  }

  const caption = single
    ? `${formatPercent(winPct)} wins · ${plural(summary.draws, "draw", "draws")}`
    : plural(summary.draws, "draw", "draws");
  renderHero(summary, caption);

  elements.summaryGrid.replaceChildren();
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  const rows = document.createElement("div");
  rows.className = "score-rows";
  rows.appendChild(
    createScoreRow("Wins", summary.winsA, summary.winsB, {
      leftSub: formatPercent(winPct),
      rightSub: formatPercent(lossPct),
      totalOverride: summary.winsA + summary.winsB + summary.draws,
      middleValue: summary.draws,
      middleDisplay: `${formatNumber(summary.draws)} (${formatPercent(drawPct)})`,
      middleLabel: "Draws",
    })
  );

  const goalDiff = summary.goalsA - summary.goalsB;
  const diffSign = goalDiff > 0 ? `+${formatNumber(goalDiff)}` : formatNumber(goalDiff);
  rows.appendChild(
    createScoreRow(
      single ? "Goals for / against" : "Goals scored",
      summary.goalsA,
      summary.goalsB,
      single ? { note: `Goal difference ${diffSign}` } : {}
    )
  );
  rows.appendChild(createScoreRow("One-goal wins", summary.tightWins, summary.tightLosses));
  if (single) {
    const otWinPct = summary.otGames ? (summary.otWinsA / summary.otGames) * 100 : 0;
    rows.appendChild(
      createScoreRow("Overtime wins", summary.otWinsA, summary.otWinsB, {
        note: `${plural(summary.otGames, "OT game", "OT games")} · ${formatPercent(otWinPct)} OT win rate`,
      })
    );
  } else {
    rows.appendChild(createScoreRow("Overtime wins", summary.otWinsA, summary.otWinsB));
  }
  scoreboard.appendChild(rows);

  scoreboard.appendChild(
    createHighlights(
      summary,
      getHighlightInfo(summary.largestWin, "a"),
      getHighlightInfo(summary.largestLoss, "b"),
      "Biggest win",
      single ? "Biggest loss" : "Biggest win"
    )
  );

  elements.summaryGrid.appendChild(scoreboard);
}

export function renderSeriesSummary(seriesItems) {
  updateFormTitle();
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB)) return;
  const single = isSinglePlayerMode();
  elements.record.hidden = true;
  const summary = computeSeriesSummary(seriesItems);
  renderMatchupResult(summary);
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;
  const avgGoalsA = total ? summary.goalsA / total : 0;
  const avgGoalsB = total ? summary.goalsB / total : 0;

  let firstDate = "";
  let lastDate = "";
  if (seriesItems.length > 0) {
    const sorted = [...seriesItems].sort((a, b) => a.ts - b.ts);
    firstDate = sorted[0].date;
    lastDate = sorted[sorted.length - 1].end_date || sorted[sorted.length - 1].date;
  }

  elements.headline.textContent = single
    ? state.playerA.name
    : `${state.playerA.name} vs ${state.playerB.name}`;
  if (total) {
    setSubhead([
      plural(total, "playoff series", "playoff series"),
      plural(summary.totalGames, "game", "games"),
      plural(summary.tournaments.size, "tournament", "tournaments"),
      formatSpan(firstDate, lastDate),
    ]);
  } else {
    elements.subhead.textContent = "No playoff series for this filter.";
  }

  const caption = single
    ? `${formatPercent(winPct)} series wins · ${plural(summary.draws, "tied series", "tied series")}`
    : plural(summary.draws, "tied series", "tied series");
  renderHero(summary, caption);

  elements.summaryGrid.replaceChildren();
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  const rows = document.createElement("div");
  rows.className = "score-rows";
  rows.appendChild(
    createScoreRow("Series wins", summary.winsA, summary.winsB, {
      leftSub: formatPercent(winPct),
      rightSub: formatPercent(lossPct),
      totalOverride: summary.winsA + summary.winsB + summary.draws,
      middleValue: summary.draws,
      middleDisplay: `${formatNumber(summary.draws)} (${formatPercent(drawPct)})`,
      middleLabel: "Tied",
    })
  );
  rows.appendChild(
    createScoreRow("Games won in series", summary.gameWinsA, summary.gameWinsB, {
      note: `${plural(summary.gameDraws, "drawn game", "drawn games")}`,
    })
  );

  const goalDiff = summary.goalsA - summary.goalsB;
  const diffSign = goalDiff > 0 ? `+${formatNumber(goalDiff)}` : formatNumber(goalDiff);
  rows.appendChild(
    createScoreRow(
      single ? "Goals for / against in series" : "Goals in series",
      summary.goalsA,
      summary.goalsB,
      single ? { note: `Goal difference ${diffSign}` } : {}
    )
  );
  rows.appendChild(
    createScoreRow("Avg goals per series", avgGoalsA, avgGoalsB, {
      leftDisplay: avgGoalsA.toFixed(1),
      rightDisplay: avgGoalsB.toFixed(1),
    })
  );
  scoreboard.appendChild(rows);

  scoreboard.appendChild(
    createHighlights(
      summary,
      getSeriesHighlightInfo(summary.largestWin, "a"),
      getSeriesHighlightInfo(summary.largestLoss, "b"),
      single ? "Biggest series win" : "Largest win",
      single ? "Biggest series loss" : "Largest win"
    )
  );

  elements.summaryGrid.appendChild(scoreboard);
}
