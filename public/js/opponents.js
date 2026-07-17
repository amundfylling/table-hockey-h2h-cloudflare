import { elements } from "./state.js";

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
