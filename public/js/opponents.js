import { elements, isSeriesMode } from "./state.js";
import { getAliasGroup, getPlayerById, setInputPlayer } from "./players.js";

// ── Sortable single-player opponents table ──────────────────────────
let _opponentsData = [];        // all aggregated opponents
let _currentSort = { key: "games", dir: "desc" };
let _onCompare = () => {};
let _controlsBound = false;
const _minGamesByMode = { games: 10, series: 1 };

export function initOpponents({ onCompare } = {}) {
  _onCompare = typeof onCompare === "function" ? onCompare : () => {};
  bindOpponentControls();
}

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

    // Name
    const nameCell = document.createElement("td");
    nameCell.className = "opp-cell-name";
    const selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "opponent-select-btn";
    selectButton.textContent = opp.name;
    const opponentId = Number(opp.id);
    selectButton.disabled = !Number.isInteger(opponentId) || opponentId <= 0;
    selectButton.setAttribute("aria-label", `Compare with ${opp.name}`);
    selectButton.addEventListener("click", () => selectOpponent(opp));
    nameCell.appendChild(selectButton);
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

function selectOpponent(opp) {
  const opponentId = Number(opp.id);
  if (!Number.isInteger(opponentId) || opponentId <= 0) return;
  const opponent = {
    ...(getPlayerById(opponentId) || { id: opponentId, name: opp.name }),
    ids: getAliasGroup(opponentId),
  };
  elements.playerB.disabled = false;
  setInputPlayer(elements.playerB, opponent);
  _onCompare();
}

function updateSortUI() {
  if (!elements.opponentsHeadRow) return;
  const unitLabel = isSeriesMode() ? "Series" : "Games";
  const gamesLabel = document.getElementById("opponents-games-label");
  const sliderUnitLabel = document.getElementById("opponents-unit-label");
  const recordLabel = document.getElementById("opponents-record-label");
  if (gamesLabel) gamesLabel.textContent = unitLabel;
  if (sliderUnitLabel) sliderUnitLabel.textContent = unitLabel.toLowerCase();
  if (recordLabel) recordLabel.textContent = isSeriesMode() ? "W-T-L" : "W-D-L";
  const buttons = elements.opponentsHeadRow.querySelectorAll(".opponents-sort-btn");
  buttons.forEach((button) => {
    const th = button.closest("th");
    const key = button.dataset.sort;
    if (!th) return;
    const indicator = th.querySelector(".sort-indicator");
    const isActive = key === _currentSort.key;
    if (isActive) {
      th.classList.add("active-sort");
      th.setAttribute("aria-sort", _currentSort.dir === "desc" ? "descending" : "ascending");
      if (indicator) indicator.textContent = _currentSort.dir === "desc" ? "▼" : "▲";
    } else {
      th.classList.remove("active-sort");
      th.setAttribute("aria-sort", "none");
      if (indicator) indicator.textContent = "";
    }
    const label = key === "winPct"
      ? "win percentage"
      : key === "games" ? unitLabel.toLowerCase() : key;
    button.setAttribute(
      "aria-label",
      isActive
        ? `Sort opponents by ${label}; currently ${_currentSort.dir === "desc" ? "descending" : "ascending"}`
        : `Sort opponents by ${label}`
    );
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

function setOpponentSort(key) {
  if (!["name", "games", "winPct"].includes(key)) return;
  if (_currentSort.key === key) {
    _currentSort.dir = _currentSort.dir === "desc" ? "asc" : "desc";
  } else {
    _currentSort.key = key;
    _currentSort.dir = key === "name" ? "asc" : "desc";
  }
  updateSortUI();
  applyFilterAndRender();
}

function bindOpponentControls() {
  if (_controlsBound) return;
  _controlsBound = true;

  if (elements.opponentsHeadRow) {
    elements.opponentsHeadRow.querySelectorAll(".opponents-sort-btn").forEach((button) => {
      button.addEventListener("click", () => setOpponentSort(button.dataset.sort));
    });
  }

  if (elements.minGamesSlider) {
    elements.minGamesSlider.addEventListener("input", () => {
      _minGamesByMode[isSeriesMode() ? "series" : "games"] = parseInt(
        elements.minGamesSlider.value,
        10
      );
      if (elements.minGamesValue) {
        elements.minGamesValue.textContent = elements.minGamesSlider.value;
      }
      applyFilterAndRender();
    });
  }
}

export function renderSinglePlayerPanels(matches) {
  if (!elements.topOpponentsBody) return;
  bindOpponentControls();

  // 1. Group matches by opponent
  const opponentsMap = new Map();
  matches.forEach((match) => {
    const rawOpponentId = Number(match.opponent_id);
    const hasOpponentId = Number.isInteger(rawOpponentId) && rawOpponentId > 0;
    const oppId = hasOpponentId ? getAliasGroup(rawOpponentId)[0] : null;
    const oppName = getPlayerById(oppId)?.name
      || match.opponent_name
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
    entry.goalsFor += Number(match.goals_a) || 0;
    entry.goalsAgainst += Number(match.goals_b) || 0;
    if (match.result === "A") entry.wins += 1;
    else if (match.result === "B") entry.losses += 1;
    else entry.draws += 1;
  });

  _opponentsData = Array.from(opponentsMap.values());

  // Auto-adjust slider max to the highest game count
  if (elements.minGamesSlider) {
    const mode = isSeriesMode() ? "series" : "games";
    const maxGames = _opponentsData.reduce(
      (m, o) => Math.max(m, o.games), 1
    );
    const sliderMax = Math.min(maxGames, 100);
    elements.minGamesSlider.max = String(sliderMax);
    elements.minGamesSlider.value = String(
      Math.min(_minGamesByMode[mode], sliderMax)
    );
    if (elements.minGamesValue) {
      elements.minGamesValue.textContent = elements.minGamesSlider.value;
    }
  }

  // 2. Initial render
  updateSortUI();
  applyFilterAndRender();
}
