import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import {
  GAME_TABLE_COLUMNS,
  SINGLE_TABLE_COLUMNS,
  SERIES_TABLE_COLUMNS,
  SINGLE_SERIES_TABLE_COLUMNS,
} from "./constants.js";
import {
  formatDate,
  formatDateRange,
  getTournamentLevelLabel,
  getTournamentLevelKey,
  toNumber,
  normalizeText,
} from "./utils.js";
import { formatSeriesLength, formatSeriesScore } from "./series.js";

const DASH = "—";
let updateViewCallback = () => {};

export function initTable(updateView) {
  updateViewCallback = updateView;
  initPagination();
  initTableSorting();
  initTableDetails();
}

function firstName(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

export function renderTable(matches) {
  renderTableHeaders();
  if (isSeriesMode()) {
    renderSeriesTable(matches);
    return;
  }
  renderGameTable(matches);
}

export function getTableColumns() {
  if (isSinglePlayerMode() && isSeriesMode()) return SINGLE_SERIES_TABLE_COLUMNS;
  if (isSinglePlayerMode()) return SINGLE_TABLE_COLUMNS;
  return isSeriesMode() ? SERIES_TABLE_COLUMNS : GAME_TABLE_COLUMNS;
}

export function getSortColumn(columns = getTableColumns()) {
  return columns.find((column) => column.key === state.sort.key) || null;
}

export function ensureSortForMode() {
  if (getSortColumn()) return;
  state.sort = { key: "date", direction: "desc" };
}

export function renderTableHeaders() {
  if (!elements.matchesHeadRow) return;
  ensureSortForMode();
  const columns = getTableColumns();
  const hasData = state.baseMatches.length > 0;
  const fragment = document.createDocumentFragment();

  columns.forEach((column) => {
    const th = document.createElement("th");
    th.scope = "col";

    if (!column.key) {
      th.className = "expand-header";
      fragment.appendChild(th);
      return;
    }

    if (!hasData) {
      th.textContent = column.label;
      fragment.appendChild(th);
      return;
    }

    const isActive = state.sort.key === column.key;
    th.setAttribute("aria-sort", isActive ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-header";
    button.dataset.sortKey = column.key;
    button.setAttribute("aria-label", `Sort by ${column.label}`);
    if (isActive) button.classList.add("is-active", `is-${state.sort.direction}`);

    const label = document.createElement("span");
    label.textContent = column.label;

    const indicator = document.createElement("span");
    indicator.className = "sort-indicator";
    indicator.setAttribute("aria-hidden", "true");

    button.appendChild(label);
    button.appendChild(indicator);
    th.appendChild(button);
    fragment.appendChild(th);
  });

  elements.matchesHeadRow.replaceChildren(fragment);
}

export function getItemSourceUrl(item) {
  const explicitUrl = item.source_url || item.stage_url || item.result_url || item.tournament_url || "";
  if (explicitUrl) return explicitUrl;
  const source = item.source ? String(item.source).toLowerCase() : "";
  if (source.includes("bordshockey")) return "";
  if (item.stage_id) {
    return `https://th.sportscorpion.com/eng/tournament/stage/${item.stage_id}/matches/`;
  }
  return "";
}

export function createExternalIcon() {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "external-icon");
  icon.setAttribute("width", "10");
  icon.setAttribute("height", "10");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.5");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", "15 3 21 3 21 9");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", "10");
  line.setAttribute("y1", "14");
  line.setAttribute("x2", "21");
  line.setAttribute("y2", "3");

  icon.appendChild(path);
  icon.appendChild(polyline);
  icon.appendChild(line);
  return icon;
}

export function renderTournamentCell(cell, item) {
  const label = item.tournament_name || "-";
  const url = getItemSourceUrl(item);
  if (!url) {
    cell.textContent = label;
    return;
  }

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "table-link";
  link.appendChild(document.createTextNode(label));
  link.appendChild(createExternalIcon());
  cell.appendChild(link);
}

export function renderGameTable(matches) {
  elements.matchesBody.innerHTML = "";
  const isSingle = isSinglePlayerMode();
  const colSpan = isSingle ? 9 : 8;
  if (!matches.length) {
    const row = document.createElement("tr");
    row.className = "empty-table-row";
    const cell = document.createElement("td");
    cell.colSpan = colSpan;
    cell.textContent = "No matches for these filters.";
    row.appendChild(cell);
    elements.matchesBody.appendChild(row);
    elements.matchCount.textContent = "0 matches";
    return;
  }

  const start = (state.page - 1) * state.perPage;
  const pageMatches = matches.slice(start, start + state.perPage);
  const fragment = document.createDocumentFragment();

  pageMatches.forEach((match, index) => {
    const rowId = `row-${start + index}`;
    const row = document.createElement("tr");
    if (isSingle) row.className = "single-match-row";

    const expCell = document.createElement("td");
    const expBtn = document.createElement("button");
    expBtn.type = "button";
    expBtn.className = "expand-btn";
    expBtn.dataset.row = rowId;
    expBtn.setAttribute("aria-controls", `detail-${rowId}`);
    expBtn.setAttribute("aria-expanded", "false");
    expBtn.setAttribute("aria-label", "Show match details");
    expBtn.textContent = "+";
    expCell.appendChild(expBtn);

    const dateCell = document.createElement("td");
    dateCell.className = "date-cell";
    dateCell.textContent = formatDate(match.date);

    const opponentCell = document.createElement("td");
    opponentCell.className = "opponent-cell";
    opponentCell.textContent = match.opponent_name || "-";

    const tournamentCell = document.createElement("td");
    renderTournamentCell(tournamentCell, match);

    const stageCell = document.createElement("td");
    stageCell.className = "stage-cell";
    stageCell.textContent = match.stage || "-";

    const roundCell = document.createElement("td");
    roundCell.className = "round-cell";
    roundCell.textContent = gameRoundFormat(match);

    const scoreCell = document.createElement("td");
    scoreCell.className = "score-cell";
    const scoreSpan = document.createElement("span");
    scoreSpan.className = "match-score";
    scoreSpan.textContent = `${match.goals_a} - ${match.goals_b}`;
    scoreCell.appendChild(scoreSpan);

    const otCell = document.createElement("td");
    otCell.className = "ot-cell";
    if (match.overtime) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "OT";
      otCell.appendChild(badge);
    } else {
      otCell.classList.add("is-empty");
      otCell.textContent = "-";
    }

    const winnerCell = document.createElement("td");
    winnerCell.className = "winner-cell";
    const winner = document.createElement("span");
    winner.className = "winner";
    const nameA = firstName(state.playerA?.name) || "Player A";
    const nameB = isSingle
      ? firstName(match.opponent_name) || "Opponent"
      : firstName(state.playerB?.name) || "Player B";
    if (match.result === "A") {
      winner.classList.add("a");
      winner.textContent = nameA;
      winner.title = state.playerA.name;
    } else if (match.result === "B") {
      winner.classList.add("b");
      winner.textContent = nameB;
      winner.title = isSingle ? match.opponent_name || "Opponent" : state.playerB.name;
    } else {
      winner.classList.add("d");
      winner.textContent = "Draw";
      winner.title = "Draw";
    }
    winnerCell.appendChild(winner);

    row.appendChild(expCell);
    row.appendChild(dateCell);
    if (isSingle) row.appendChild(opponentCell);
    row.appendChild(tournamentCell);
    row.appendChild(stageCell);
    row.appendChild(roundCell);
    row.appendChild(scoreCell);
    row.appendChild(otCell);
    row.appendChild(winnerCell);

    const detailRow = document.createElement("tr");
    detailRow.id = `detail-${rowId}`;
    detailRow.className = "detail-row match-detail-row";
    detailRow.hidden = true;
    const detailCell = document.createElement("td");
    detailCell.colSpan = colSpan;
    const detailGrid = document.createElement("div");
    detailGrid.className = "detail-grid";
    const detailItems = [
      ...(isSingle ? [{ label: "Opponent", value: match.opponent_name || match.opponent_id }] : []),
      { label: "Stage ID", value: match.stage_id },
      { label: "Tournament ID", value: match.tournament_id },
      { label: "Tournament level", value: getTournamentLevelLabel(getTournamentLevelKey(match)) },
      { label: "Stage sequence", value: match.stage_sequence },
      { label: "Round number", value: match.round_number },
      { label: "Playoff game", value: match.playoff_game_number },
      { label: "Source", value: match.source || "sportscorpion" },
      { label: "Source URL", value: getItemSourceUrl(match) },
    ];
    detailItems.forEach((item) => {
      const block = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = `${item.label}:`;
      block.appendChild(label);
      block.appendChild(document.createTextNode(` ${item.value ?? "-"}`));
      detailGrid.appendChild(block);
    });
    detailCell.appendChild(detailGrid);
    detailRow.appendChild(detailCell);

    fragment.appendChild(row);
    fragment.appendChild(detailRow);
  });

  elements.matchesBody.appendChild(fragment);

  const end = Math.min(start + state.perPage, matches.length);
  elements.matchCount.textContent = formatMatchCountText(start, end, matches.length);
}

function gameRoundFormat(match) {
  const parts = [];
  if (match.round_number != null) parts.push(`R${match.round_number}`);
  if (match.playoff_game_number != null) parts.push(`G${match.playoff_game_number}`);
  return parts.length ? parts.join(" / ") : "-";
}

export function renderSeriesTable(seriesItems) {
  elements.matchesBody.innerHTML = "";
  const isSingle = isSinglePlayerMode();
  const colSpan = isSingle ? 9 : 8;
  if (!seriesItems.length) {
    const row = document.createElement("tr");
    row.className = "empty-table-row";
    const cell = document.createElement("td");
    cell.colSpan = colSpan;
    cell.textContent = "No playoff series for these filters.";
    row.appendChild(cell);
    elements.matchesBody.appendChild(row);
    elements.matchCount.textContent = "0 series";
    return;
  }

  const start = (state.page - 1) * state.perPage;
  const pageSeries = seriesItems.slice(start, start + state.perPage);
  const fragment = document.createDocumentFragment();

  pageSeries.forEach((series, index) => {
    const rowId = `series-${start + index}`;
    const row = document.createElement("tr");
    row.className = "series-row";

    const expCell = document.createElement("td");
    const expBtn = document.createElement("button");
    expBtn.type = "button";
    expBtn.className = "expand-btn";
    expBtn.dataset.row = rowId;
    expBtn.setAttribute("aria-controls", `detail-${rowId}`);
    expBtn.setAttribute("aria-expanded", "false");
    expBtn.setAttribute("aria-label", "Show series games");
    expBtn.textContent = "+";
    expCell.appendChild(expBtn);

    const dateCell = document.createElement("td");
    dateCell.className = "date-cell";
    dateCell.textContent = formatDateRange(series.date, series.end_date);

    const opponentCell = document.createElement("td");
    opponentCell.className = "opponent-cell";
    opponentCell.textContent = series.opponent_name || "-";

    const tournamentCell = document.createElement("td");
    renderTournamentCell(tournamentCell, series);

    const stageCell = document.createElement("td");
    stageCell.className = "stage-cell";
    stageCell.textContent = series.stage || "-";

    const seriesCell = document.createElement("td");
    seriesCell.className = "series-length-cell";
    seriesCell.textContent = formatSeriesLength(series);

    const gamesCell = document.createElement("td");
    gamesCell.className = "score-cell";
    const gamesSpan = document.createElement("span");
    gamesSpan.className = "match-score";
    gamesSpan.textContent = formatSeriesScore(series);
    gamesCell.appendChild(gamesSpan);

    const goalsCell = document.createElement("td");
    goalsCell.className = "series-goals-cell";
    goalsCell.textContent = `${series.goals_a} - ${series.goals_b}`;

    const winnerCell = document.createElement("td");
    winnerCell.className = "winner-cell";
    const winner = document.createElement("span");
    winner.className = "winner";
    const nameA = firstName(state.playerA?.name) || "Player A";
    const nameB = isSingle
      ? firstName(series.opponent_name) || "Opponent"
      : firstName(state.playerB?.name) || "Player B";
    if (series.result === "A") {
      winner.classList.add("a");
      winner.textContent = nameA;
      winner.title = state.playerA.name;
    } else if (series.result === "B") {
      winner.classList.add("b");
      winner.textContent = nameB;
      winner.title = isSingle ? series.opponent_name || "Opponent" : state.playerB.name;
    } else {
      winner.classList.add("d");
      winner.textContent = "Tied";
      winner.title = "Tied series";
    }
    winnerCell.appendChild(winner);

    row.appendChild(expCell);
    row.appendChild(dateCell);
    if (isSingle) row.appendChild(opponentCell);
    row.appendChild(tournamentCell);
    row.appendChild(stageCell);
    row.appendChild(seriesCell);
    row.appendChild(gamesCell);
    row.appendChild(goalsCell);
    row.appendChild(winnerCell);

    const detailRow = document.createElement("tr");
    detailRow.id = `detail-${rowId}`;
    detailRow.className = "detail-row series-detail-row";
    detailRow.hidden = true;
    const detailCell = document.createElement("td");
    detailCell.colSpan = colSpan;
    detailCell.appendChild(createSeriesDetailPanel(series));
    detailRow.appendChild(detailCell);

    fragment.appendChild(row);
    fragment.appendChild(detailRow);
  });

  elements.matchesBody.appendChild(fragment);

  const end = Math.min(start + state.perPage, seriesItems.length);
  elements.matchCount.textContent = `Showing ${start + 1}-${end} of ${seriesItems.length} series`;
}

export function createSeriesDetailPanel(series) {
  const panel = document.createElement("div");
  panel.className = "series-detail-panel";
  const opponentName = isSinglePlayerMode()
    ? series.opponent_name || "Opponent"
    : state.playerB?.name || "Player B";

  const header = document.createElement("div");
  header.className = "series-detail-head";

  const titleWrap = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = "Series games";
  const meta = document.createElement("p");
  meta.textContent = `${formatDateRange(series.date, series.end_date)} | ${formatSeriesLength(series)} | ${getTournamentLevelLabel(getTournamentLevelKey(series))} | ${series.stage || "Playoff"}`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(meta);

  const summary = document.createElement("div");
  summary.className = "series-detail-summary";
  const score = document.createElement("strong");
  score.textContent = formatSeriesScore(series);
  const goals = document.createElement("span");
  goals.textContent = `${series.goals_a}-${series.goals_b} goals`;
  summary.appendChild(score);
  summary.appendChild(goals);

  header.appendChild(titleWrap);
  header.appendChild(summary);
  panel.appendChild(header);

  // Header row with player names shown once
  const namesHeader = document.createElement("div");
  namesHeader.className = "series-games-header";
  namesHeader.textContent = `${state.playerA?.name || "Player A"} vs ${opponentName}`;
  panel.appendChild(namesHeader);

  const list = document.createElement("div");
  list.className = "series-games-list";
  let runningA = 0;
  let runningB = 0;
  series.games.forEach((game) => {
    if (game.result === "A") runningA += 1;
    if (game.result === "B") runningB += 1;
    list.appendChild(createSeriesGameRow(game, runningA, runningB));
  });
  panel.appendChild(list);
  return panel;
}

export function createSeriesGameRow(game, runningA, runningB) {
  const item = document.createElement("div");
  const resultClass = game.result === "A" ? "a" : game.result === "B" ? "b" : "d";
  item.className = `series-game series-game--${resultClass}`;

  const marker = document.createElement("div");
  marker.className = "series-game-marker";
  marker.textContent = game.playoff_game_number != null ? String(game.playoff_game_number) : "-";

  const score = document.createElement("span");
  score.className = "series-game-score";
  score.textContent = `${game.goals_a}-${game.goals_b}`;

  const otSlot = document.createElement("span");
  if (game.overtime) {
    otSlot.className = "badge series-game-ot";
    otSlot.textContent = "OT";
  }

  const side = document.createElement("div");
  side.className = "series-game-side";
  const winner = document.createElement("span");
  winner.className = `winner ${resultClass}`;
  if (game.result === "A") {
    winner.textContent = firstName(state.playerA?.name) || "Player A";
    winner.title = state.playerA?.name || "Player A";
  } else if (game.result === "B") {
    const opponentName = isSinglePlayerMode()
      ? game.opponent_name || "Opponent"
      : state.playerB?.name || "Player B";
    winner.textContent = firstName(opponentName) || "Player B";
    winner.title = opponentName;
  } else {
    winner.textContent = "Draw";
    winner.title = "Draw";
  }
  const running = document.createElement("span");
  running.className = "series-game-running";
  running.textContent = `${runningA}-${runningB}`;
  side.appendChild(running);
  side.appendChild(winner);

  item.appendChild(marker);
  item.appendChild(score);
  item.appendChild(otSlot);
  item.appendChild(side);
  return item;
}

export function updatePagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.perPage));
  if (state.page > totalPages) state.page = totalPages;
  elements.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  elements.pageInfoBottom.textContent = `Page ${state.page} of ${totalPages}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;
  elements.prevPageBottom.disabled = state.page <= 1;
  elements.nextPageBottom.disabled = state.page >= totalPages;
}

export function formatMatchCountText(start, end, total) {
  return `Showing ${start + 1}-${end} of ${total} matches`;
}

export function initPagination() {
  const goPrev = () => {
    if (state.page > 1) {
      state.page -= 1;
      updateViewCallback();
    }
  };
  const goNext = () => {
    const totalPages = Math.max(1, Math.ceil(state.filteredMatches.length / state.perPage));
    if (state.page < totalPages) {
      state.page += 1;
      updateViewCallback();
    }
  };
  elements.prevPage.addEventListener("click", goPrev);
  elements.nextPage.addEventListener("click", goNext);
  elements.prevPageBottom.addEventListener("click", goPrev);
  elements.nextPageBottom.addEventListener("click", goNext);
}

export function initTableSorting() {
  if (!elements.matchesHeadRow) return;
  elements.matchesHeadRow.addEventListener("click", handleSortHeaderClick);
}

export function initTableDetails() {
  elements.matchesBody.addEventListener("click", (event) => {
    const button = event.target.closest(".expand-btn");
    if (!button) return;
    const rowId = button.dataset.row;
    const detailRow = document.getElementById(`detail-${rowId}`);
    if (!detailRow) return;
    const isOpen = !detailRow.hidden;
    detailRow.hidden = isOpen;
    button.closest("tr")?.classList.toggle("is-expanded", !isOpen);
    button.setAttribute("aria-expanded", isOpen ? "false" : "true");
    if (button.getAttribute("aria-label")) {
      const itemLabel = detailRow.classList.contains("series-detail-row") ? "series games" : "match details";
      button.setAttribute("aria-label", isOpen ? `Show ${itemLabel}` : `Hide ${itemLabel}`);
    }
    button.textContent = isOpen ? "+" : "−";
    button.classList.toggle("is-open", !isOpen);
  });
}

export function handleSortHeaderClick(event) {
  const button = event.target.closest(".sort-header");
  if (!button) return;
  const column = getTableColumns().find((item) => item.key === button.dataset.sortKey);
  if (!column) return;

  const isCurrent = state.sort.key === column.key;
  state.sort = {
    key: column.key,
    direction: isCurrent && state.sort.direction === "asc" ? "desc" : isCurrent ? "asc" : column.defaultDirection,
  };
  state.page = 1;
  updateViewCallback();
}

export function getStageSortParts(match) {
  return [
    toNumber(match.stage_sequence, 0),
    toNumber(match.round_number, 0),
    toNumber(match.playoff_game_number, 0),
  ];
}

export function compareStageOrderAsc(a, b) {
  const [seqA, roundA, playoffA] = getStageSortParts(a);
  const [seqB, roundB, playoffB] = getStageSortParts(b);
  return seqA - seqB || roundA - roundB || playoffA - playoffB;
}

export function compareTextValues(a, b) {
  const normalized = normalizeText(a).localeCompare(normalizeText(b));
  return normalized || String(a || "").localeCompare(String(b || ""));
}

export function compareNumberValues(a, b) {
  return toNumber(a, 0) - toNumber(b, 0);
}

export function getWinnerSortLabel(item) {
  if (item.result === "A") return state.playerA?.name || "Player A";
  if (item.result === "B") return item.opponent_name || state.playerB?.name || "Player B";
  return isSeriesMode() ? "Tied" : "Draw";
}

export function compareDateAsc(a, b) {
  return compareNumberValues(a.ts, b.ts) || compareStageOrderAsc(a, b);
}

export function compareScoreSort(a, b) {
  const margin = compareNumberValues(a.goal_abs, b.goal_abs);
  if (margin) return margin;
  return compareNumberValues(toNumber(a.goals_a, 0) + toNumber(a.goals_b, 0), toNumber(b.goals_a, 0) + toNumber(b.goals_b, 0));
}

export function compareGoalsSort(a, b) {
  const margin = compareNumberValues(
    Math.abs(toNumber(a.goals_a, 0) - toNumber(a.goals_b, 0)),
    Math.abs(toNumber(b.goals_a, 0) - toNumber(b.goals_b, 0))
  );
  if (margin) return margin;
  return compareNumberValues(toNumber(a.goals_a, 0) + toNumber(a.goals_b, 0), toNumber(b.goals_a, 0) + toNumber(b.goals_b, 0));
}

export function compareItemsForSortKey(a, b, key) {
  switch (key) {
    case "date":
      return compareDateAsc(a, b);
    case "tournament":
      return compareTextValues(a.tournament_name, b.tournament_name);
    case "opponent":
      return compareTextValues(a.opponent_name, b.opponent_name);
    case "stage":
      return compareTextValues(a.stage, b.stage) || compareStageOrderAsc(a, b);
    case "round":
      return compareNumberValues(a.round_number, b.round_number) || compareNumberValues(a.playoff_game_number, b.playoff_game_number);
    case "score":
      return compareScoreSort(a, b);
    case "ot":
      return compareNumberValues(a.overtime ? 1 : 0, b.overtime ? 1 : 0);
    case "winner":
      return compareTextValues(getWinnerSortLabel(a), getWinnerSortLabel(b));
    case "series":
      return compareNumberValues(a.best_of, b.best_of) || compareNumberValues(a.total_games, b.total_games);
    case "games":
      return compareNumberValues(a.goal_abs, b.goal_abs) || compareNumberValues(a.total_games, b.total_games);
    case "goals":
      return compareGoalsSort(a, b);
    default:
      return 0;
  }
}

export function sortMatches(matches) {
  ensureSortForMode();
  const sorted = [...matches];
  const directionMultiplier = state.sort.direction === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    const primary = compareItemsForSortKey(a, b, state.sort.key);
    if (primary) return primary * directionMultiplier;
    const dateFallback = compareDateAsc(a, b);
    if (state.sort.key === "date") return dateFallback * directionMultiplier;
    return dateFallback * -1;
  });
  return sorted;
}
