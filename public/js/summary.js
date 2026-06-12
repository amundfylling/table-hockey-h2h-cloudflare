import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { toNumber, formatDateRange, normalizeText, escapeHtml } from "./utils.js";
import { enrichPlayerRecord, formatWorldRank, formatRankingTitle } from "./players.js";
import { formatSeriesLength, formatSeriesScore, computeSeriesSummary } from "./series.js";
import { updateFormTitle } from "./form.js";
import { getItemSourceUrl, createExternalIcon } from "./table.js";

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
  return String(value);
}

export function createScoreboardPlayer(player, fallback, className) {
  const enriched = enrichPlayerRecord(player);
  const element = document.createElement("div");
  element.className = className;

  const name = document.createElement("span");
  name.className = "scoreboard-player-name";
  name.textContent = enriched?.name || fallback;
  element.appendChild(name);

  const rank = formatWorldRank(enriched);
  if (rank) {
    const meta = document.createElement("span");
    meta.className = "scoreboard-player-rank";
    meta.textContent = rank;
    meta.title = formatRankingTitle(enriched);
    element.appendChild(meta);
  }

  return element;
}

export function createScoreHeader() {
  const header = document.createElement("div");
  header.className = "scoreboard-head";

  const left = createScoreboardPlayer(
    state.playerA,
    "Player A",
    "scoreboard-player scoreboard-player--a"
  );

  const title = document.createElement("div");
  title.className = "scoreboard-title";
  title.textContent = isSinglePlayerMode() ? "Career Stats" : isSeriesMode() ? "Playoff Series" : "Head to Head";

  const right = isSinglePlayerMode()
    ? createScoreboardPlayer({ id: null, name: "All Opponents" }, "All Opponents", "scoreboard-player scoreboard-player--b")
    : createScoreboardPlayer(state.playerB, "Player B", "scoreboard-player scoreboard-player--b");

  header.appendChild(left);
  header.appendChild(title);
  header.appendChild(right);
  return header;
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

  row.appendChild(fillA);
  if (hasMiddle) row.appendChild(fillMiddle);
  row.appendChild(fillB);
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
  if (noteText) {
    const note = document.createElement("div");
    note.className = "score-note";
    note.textContent = noteText;
    row.appendChild(note);
  }
  return row;
}

export function getHighlightInfo(match, side) {
  if (!match) {
    return { score: DASH, date: DASH, opponent: DASH, tournament: DASH, url: "" };
  }
  if (isSinglePlayerMode()) {
    return {
      score: scoreFormat(match) || DASH,
      date: match.date || DASH,
      opponent: match.opponent_name || DASH,
      tournament: match.tournament_name || DASH,
      url: getItemSourceUrl(match) || "",
    };
  }
  const score = side === "b" ? `${match.goals_b}-${match.goals_a}` : scoreFormat(match);
  const opponent = side === "b" ? state.playerA?.name : state.playerB?.name;
  return {
    score: score || DASH,
    date: match.date || DASH,
    opponent: opponent || DASH,
    tournament: match.tournament_name || DASH,
    url: getItemSourceUrl(match) || "",
  };
}

// Local helper to avoid importing from table.js
function scoreFormat(match) {
  if (!match) return DASH;
  if (!Number.isFinite(match.goals_a) || !Number.isFinite(match.goals_b)) return DASH;
  return `${match.goals_a}-${match.goals_b}`;
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
  meta.textContent = hasResult ? `${opponent} | ${date}` : "For this selection";

  let tour;
  if (hasResult && info.url) {
    tour = document.createElement("a");
    tour.href = info.url;
    tour.target = "_blank";
    tour.rel = "noopener";
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
  if (item.opponent_id != null) return `id:${item.opponent_id}`;
  return normalizeText(item.opponent_name || "");
}

export function getCanonRivalryTooltip(winItem, lossItem) {
  const winKey = getCanonOpponentKey(winItem);
  const lossKey = getCanonOpponentKey(lossItem);
  return winKey && winKey === lossKey ? "canon rivalry" : "";
}

export function getSeriesHighlightInfo(series, side) {
  if (!series) {
    return { score: DASH, date: DASH, opponent: DASH, tournament: DASH, url: "" };
  }
  if (isSinglePlayerMode()) {
    return {
      score: `${series.game_wins_a}-${series.game_wins_b}`,
      date: formatDateRange(series.date, series.end_date),
      opponent: series.opponent_name || DASH,
      tournament: `${series.tournament_name || DASH} | ${formatSeriesLength(series)} | goals ${series.goals_a}-${series.goals_b}`,
      url: getItemSourceUrl(series) || "",
    };
  }
  const score =
    side === "b"
      ? `${series.game_wins_b}-${series.game_wins_a}`
      : `${series.game_wins_a}-${series.game_wins_b}`;
  const goalScore = side === "b" ? `${series.goals_b}-${series.goals_a}` : `${series.goals_a}-${series.goals_b}`;
  return {
    score,
    date: formatDateRange(series.date, series.end_date),
    opponent: side === "b" ? state.playerA?.name : state.playerB?.name,
    tournament: `${series.tournament_name || DASH} | ${formatSeriesLength(series)} | goals ${goalScore}`,
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

export function renderGameSummary(matches) {
  updateFormTitle();
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB)) return;
  elements.record.hidden = false;
  const summary = computeSummary(matches);
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;
  const opponentLabel = isSinglePlayerMode() ? "Opponents" : state.playerB.name;

  elements.headline.textContent = isSinglePlayerMode() ? state.playerA.name : `${state.playerA.name} vs ${state.playerB.name}`;
  const dateRangeStr = (summary.firstDate && summary.lastDate)
    ? ` (${summary.firstDate.date} – ${summary.lastDate.date})`
    : "";
  elements.subhead.textContent = total
    ? `${total} ${total === 1 ? "game" : "games"} across ${summary.tournaments.size} tournaments${isSinglePlayerMode() ? dateRangeStr : ""}.`
    : "No matches for this filter.";

  elements.record.innerHTML = `
    <div class="muted">Record</div>
    <div><strong>${summary.winsA}-${summary.draws}-${summary.winsB}</strong></div>
    <div class="muted">${formatPercent(winPct)} wins</div>
  `;

  elements.summaryGrid.innerHTML = "";
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  scoreboard.appendChild(createScoreHeader());

  const rows = document.createElement("div");
  rows.className = "score-rows";
  rows.appendChild(
    createScoreRow("Wins", summary.winsA, summary.winsB, {
      leftDisplay: `${summary.winsA} (${formatPercent(winPct)})`,
      rightDisplay: `${summary.winsB} (${formatPercent(lossPct)})`,
      totalOverride: summary.winsA + summary.winsB + summary.draws,
      middleValue: summary.draws,
      middleDisplay: `${summary.draws} (${formatPercent(drawPct)})`,
      middleLabel: "Draws",
    })
  );
  
  const goalDiff = summary.goalsA - summary.goalsB;
  const diffSign = goalDiff > 0 ? `+${goalDiff}` : String(goalDiff);
  rows.appendChild(
    createScoreRow(
      isSinglePlayerMode() ? "Goals for / against" : "Total goals scored",
      summary.goalsA,
      summary.goalsB,
      isSinglePlayerMode() ? { note: `Goal difference: ${diffSign}` } : {}
    )
  );
  rows.appendChild(createScoreRow("Tight wins (1 goal)", summary.tightWins, summary.tightLosses));
  if (isSinglePlayerMode()) {
    const otWinPct = summary.otGames ? (summary.otWinsA / summary.otGames) * 100 : 0;
    rows.appendChild(
      createScoreRow("Overtime wins", summary.otWinsA, summary.otWinsB, {
        note: `OT games: ${summary.otGames} · OT win rate: ${formatPercent(otWinPct)}`,
      })
    );
  } else {
    rows.appendChild(createScoreRow("Overtime wins", summary.otWinsA, summary.otWinsB));
  }
  scoreboard.appendChild(rows);

  const highlights = document.createElement("div");
  highlights.className = "scoreboard-highlights";
  const canonTooltip = getCanonRivalryTooltip(summary.largestWin, summary.largestLoss);
  const highlightA = createHighlightColumn(state.playerA.name, "a", getHighlightInfo(summary.largestWin, "a"), "Biggest win", canonTooltip);
  const highlightB = createHighlightColumn(
    opponentLabel,
    "b",
    getHighlightInfo(summary.largestLoss, "b"),
    isSinglePlayerMode() ? "Biggest loss" : "Biggest win",
    canonTooltip
  );
  highlights.appendChild(highlightA);
  highlights.appendChild(highlightB);
  scoreboard.appendChild(highlights);

  elements.summaryGrid.appendChild(scoreboard);
}

export function renderSeriesSummary(seriesItems) {
  updateFormTitle();
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB)) return;
  elements.record.hidden = false;
  const summary = computeSeriesSummary(seriesItems);
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;
  const avgGoalsA = total ? summary.goalsA / total : 0;
  const avgGoalsB = total ? summary.goalsB / total : 0;
  const opponentLabel = isSinglePlayerMode() ? "Opponents" : state.playerB.name;

  let firstDateStr = "";
  let lastDateStr = "";
  if (seriesItems.length > 0) {
    const sorted = [...seriesItems].sort((a, b) => a.ts - b.ts);
    firstDateStr = sorted[0].date;
    lastDateStr = sorted[sorted.length - 1].end_date || sorted[sorted.length - 1].date;
  }
  const dateRangeStr = (firstDateStr && lastDateStr) ? ` (${firstDateStr} – ${lastDateStr})` : "";

  elements.headline.textContent = isSinglePlayerMode() ? state.playerA.name : `${state.playerA.name} vs ${state.playerB.name}`;
  elements.subhead.textContent = total
    ? `${total} playoff series, ${summary.totalGames} games across ${summary.tournaments.size} tournaments${isSinglePlayerMode() ? dateRangeStr : ""}.`
    : "No playoff series for this filter.";

  elements.record.innerHTML = `
    <div class="muted">Series record</div>
    <div><strong>${summary.winsA}-${summary.draws}-${summary.winsB}</strong></div>
    <div class="muted">${formatPercent(winPct)} series wins</div>
  `;

  elements.summaryGrid.innerHTML = "";
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  scoreboard.appendChild(createScoreHeader());

  const rows = document.createElement("div");
  rows.className = "score-rows";
  rows.appendChild(
    createScoreRow("Series wins", summary.winsA, summary.winsB, {
      leftDisplay: `${summary.winsA} (${formatPercent(winPct)})`,
      rightDisplay: `${summary.winsB} (${formatPercent(lossPct)})`,
      totalOverride: summary.winsA + summary.winsB + summary.draws,
      middleValue: summary.draws,
      middleDisplay: `${summary.draws} (${formatPercent(drawPct)})`,
      middleLabel: "Tied series",
    })
  );
  rows.appendChild(
    createScoreRow("Games won in series", summary.gameWinsA, summary.gameWinsB, {
      note: `Drawn games ${summary.gameDraws}`,
    })
  );
  
  const goalDiff = summary.goalsA - summary.goalsB;
  const diffSign = goalDiff > 0 ? `+${goalDiff}` : String(goalDiff);
  rows.appendChild(
    createScoreRow(
      isSinglePlayerMode() ? "Goals for / against in series" : "Total goals in series",
      summary.goalsA,
      summary.goalsB,
      isSinglePlayerMode() ? { note: `Goal difference: ${diffSign}` } : {}
    )
  );
  rows.appendChild(
    createScoreRow("Avg goals / series", avgGoalsA, avgGoalsB, {
      leftDisplay: avgGoalsA.toFixed(1),
      rightDisplay: avgGoalsB.toFixed(1),
    })
  );
  scoreboard.appendChild(rows);

  const highlights = document.createElement("div");
  highlights.className = "scoreboard-highlights";
  const canonTooltip = getCanonRivalryTooltip(summary.largestWin, summary.largestLoss);
  highlights.appendChild(
    createHighlightColumn(
      state.playerA.name,
      "a",
      getSeriesHighlightInfo(summary.largestWin, "a"),
      isSinglePlayerMode() ? "Biggest series win" : "Largest win",
      canonTooltip
    )
  );
  highlights.appendChild(
    createHighlightColumn(
      opponentLabel,
      "b",
      getSeriesHighlightInfo(summary.largestLoss, "b"),
      isSinglePlayerMode() ? "Biggest series loss" : "Largest win",
      canonTooltip
    )
  );
  scoreboard.appendChild(highlights);

  elements.summaryGrid.appendChild(scoreboard);
}

// ── Sortable single-player opponents table ──────────────────────────
let _opponentsData = [];        // all aggregated opponents
let _currentSort = { key: "games", dir: "desc" };

function sortOpponents(list, key, dir) {
  const cmp = dir === "asc" ? 1 : -1;
  return list.slice().sort((a, b) => {
    let va, vb;
    switch (key) {
      case "name":
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        return va < vb ? -cmp : va > vb ? cmp : 0;
      case "games":
        va = a.games; vb = b.games; break;
      case "winPct":
        va = a.games ? a.wins / a.games : 0;
        vb = b.games ? b.wins / b.games : 0;
        break;
      default:
        va = a.games; vb = b.games;
    }
    if (va !== vb) return (va - vb) * cmp;
    // secondary: games desc
    if (key !== "games" && b.games !== a.games) return b.games - a.games;
    return 0;
  });
}

function renderOpponentsRows(filtered) {
  const sorted = sortOpponents(filtered, _currentSort.key, _currentSort.dir);
  elements.topOpponentsBody.replaceChildren();

  if (sorted.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "muted text-center";
    cell.style.padding = "12px";
    cell.textContent = "No opponents match the filter.";
    row.appendChild(cell);
    elements.topOpponentsBody.appendChild(row);
    return;
  }

  sorted.forEach((opp) => {
    const row = document.createElement("tr");
    row.className = "top-opponents-row";

    const winPct = opp.games ? (opp.wins / opp.games) * 100 : 0;

    // Click listener to load H2H comparison
    row.addEventListener("click", async () => {
      const opponent = opp.id
        ? (await import("./players.js")).getPlayerById(opp.id)
          || { id: opp.id, name: opp.name }
        : { id: null, name: opp.name };

      elements.playerB.disabled = false;
      const playersModule = await import("./players.js");
      playersModule.setInputPlayer(elements.playerB, opponent);

      const mainModule = await import("./main.js");
      mainModule.handleCompare();
    });

    // Name
    const nameCell = document.createElement("td");
    nameCell.className = "opp-cell-name";
    nameCell.textContent = opp.name;
    row.appendChild(nameCell);

    // Games
    const gamesCell = document.createElement("td");
    gamesCell.className = "opp-cell-numeric";
    gamesCell.textContent = String(opp.games);
    row.appendChild(gamesCell);

    // Record
    const recordCell = document.createElement("td");
    recordCell.className = "opp-cell-record";
    recordCell.textContent = `${opp.wins}-${opp.draws}-${opp.losses}`;
    row.appendChild(recordCell);

    // Win %
    const winPctCell = document.createElement("td");
    winPctCell.className = "opp-cell-numeric";
    winPctCell.textContent = `${winPct.toFixed(0)}%`;
    row.appendChild(winPctCell);

    elements.topOpponentsBody.appendChild(row);
  });
}

function updateSortUI() {
  if (!elements.opponentsHeadRow) return;
  const ths = elements.opponentsHeadRow.querySelectorAll(".sortable-col");
  ths.forEach((th) => {
    const indicator = th.querySelector(".sort-indicator");
    if (th.dataset.sort === _currentSort.key) {
      th.classList.add("active-sort");
      indicator.textContent = _currentSort.dir === "desc" ? "▼" : "▲";
    } else {
      th.classList.remove("active-sort");
      indicator.textContent = "";
    }
  });
}

function applyFilterAndRender() {
  const minGames = elements.minGamesSlider
    ? parseInt(elements.minGamesSlider.value, 10) : 1;
  const filtered = _opponentsData.filter((o) => o.games >= minGames);
  renderOpponentsRows(filtered);

  if (elements.opponentsCount) {
    elements.opponentsCount.textContent =
      `Showing ${filtered.length} of ${_opponentsData.length} opponents`;
  }
}

let _sortListenersBound = false;

export function renderSinglePlayerPanels(matches) {
  if (!elements.topOpponentsBody) return;

  // 1. Group matches by opponent
  const opponentsMap = new Map();
  matches.forEach((match) => {
    const oppId = match.opponent_id;
    const oppName = match.opponent_name
      || (oppId ? `Player ${oppId}` : "Unknown opponent");
    const key = oppId != null ? `id:${oppId}` : `name:${oppName}`;

    let entry = opponentsMap.get(key);
    if (!entry) {
      entry = {
        id: oppId,
        name: oppName,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      };
      opponentsMap.set(key, entry);
    }

    entry.games += 1;
    entry.goalsFor += match.goals_a;
    entry.goalsAgainst += match.goals_b;
    if (match.result === "A") entry.wins += 1;
    else if (match.result === "B") entry.losses += 1;
    else entry.draws += 1;
  });

  _opponentsData = Array.from(opponentsMap.values());

  // Auto-adjust slider max to the highest game count
  if (elements.minGamesSlider) {
    const maxGames = _opponentsData.reduce(
      (m, o) => Math.max(m, o.games), 1
    );
    elements.minGamesSlider.max = String(Math.min(maxGames, 100));
    // Clamp current value
    if (parseInt(elements.minGamesSlider.value, 10) > maxGames) {
      elements.minGamesSlider.value = String(maxGames);
    }
    if (elements.minGamesValue) {
      elements.minGamesValue.textContent = elements.minGamesSlider.value;
    }
  }

  // 2. Bind interactive listeners (once)
  if (!_sortListenersBound) {
    _sortListenersBound = true;

    // Column sort click handlers
    if (elements.opponentsHeadRow) {
      elements.opponentsHeadRow.querySelectorAll(".sortable-col")
        .forEach((th) => {
          th.addEventListener("click", () => {
            const key = th.dataset.sort;
            if (_currentSort.key === key) {
              _currentSort.dir =
                _currentSort.dir === "desc" ? "asc" : "desc";
            } else {
              _currentSort.key = key;
              _currentSort.dir = key === "name" ? "asc" : "desc";
            }
            updateSortUI();
            applyFilterAndRender();
          });
        });
    }

    // Min-games slider
    if (elements.minGamesSlider) {
      elements.minGamesSlider.addEventListener("input", () => {
        if (elements.minGamesValue) {
          elements.minGamesValue.textContent = elements.minGamesSlider.value;
        }
        applyFilterAndRender();
      });
    }
  }

  // 3. Initial render
  updateSortUI();
  applyFilterAndRender();
}

