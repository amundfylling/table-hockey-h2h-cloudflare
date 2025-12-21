const state = {
  players: [],
  playersById: new Map(),
  playersByKey: new Map(),
  pairCache: new Map(),
  activeData: null,
  activeMatches: [],
  activeOrder: null,
};

const elements = {
  playerA: document.getElementById("player-a"),
  playerB: document.getElementById("player-b"),
  listA: document.getElementById("players-list-a"),
  listB: document.getElementById("players-list-b"),
  compareBtn: document.getElementById("compare-btn"),
  status: document.getElementById("status"),
  headline: document.getElementById("headline"),
  subhead: document.getElementById("subhead"),
  summaryGrid: document.getElementById("summary-grid"),
  yearFilter: document.getElementById("year-filter"),
  tournamentFilter: document.getElementById("tournament-filter"),
  stageFilter: document.getElementById("stage-filter"),
  matchCount: document.getElementById("match-count"),
  matchesBody: document.querySelector("#matches-table tbody"),
};

function normalizeText(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function setStatus(message) {
  elements.status.textContent = message;
}

function setDatalistOptions(listEl, options) {
  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = `${option.name} (${option.id})`;
    fragment.appendChild(el);
  });
  listEl.appendChild(fragment);
}

function updateSuggestions(inputEl, listEl) {
  const query = normalizeText(inputEl.value);
  if (query.length < 2) {
    listEl.innerHTML = "";
    return;
  }
  const matches = [];
  for (const player of state.players) {
    if (player.search_key.includes(query)) {
      matches.push(player);
      if (matches.length >= 50) break;
    }
  }
  setDatalistOptions(listEl, matches);
}

function indexPlayers(players) {
  state.players = players;
  state.playersById.clear();
  state.playersByKey.clear();
  players.forEach((player) => {
    state.playersById.set(player.id, player);
    const key = normalizeText(player.name);
    const entry = state.playersByKey.get(key) || [];
    entry.push(player);
    state.playersByKey.set(key, entry);
  });
}

function resolvePlayerId(value) {
  if (!value) return null;
  const idMatch = value.match(/\((\d+)\)\s*$/) || value.match(/\b(\d+)\s*$/);
  if (idMatch) {
    return Number.parseInt(idMatch[1], 10);
  }
  const key = normalizeText(value);
  const options = state.playersByKey.get(key);
  if (options && options.length === 1) {
    return options[0].id;
  }
  return null;
}

async function fetchChunks(chunks, concurrency = 3) {
  const results = new Array(chunks.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= chunks.length) return;
      const res = await fetch(`data/${chunks[index]}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch chunk ${chunks[index]}`);
      }
      const payload = await res.json();
      results[index] = payload.matches || [];
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker());
  await Promise.all(workers);
  return results.flat();
}

async function loadPair(id1, id2) {
  const key = `${id1}-${id2}`;
  if (state.pairCache.has(key)) {
    return state.pairCache.get(key);
  }
  const res = await fetch(`data/h2h/${id1}/${id2}.json`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error("Failed to load match data");
  }
  const payload = await res.json();
  let matches = payload.matches || [];
  if (payload.chunks) {
    matches = await fetchChunks(payload.chunks);
  }
  const data = { ...payload, matches };
  state.pairCache.set(key, data);
  return data;
}

function renderSummary(data) {
  const { summary } = data;
  const order = state.activeOrder || {
    playerA: data.player1,
    playerB: data.player2,
    aIsId1: true,
  };
  const playerA = order.playerA;
  const playerB = order.playerB;
  const last10 = summary.last_10 || { id1: { wins: 0, losses: 0, draws: 0 }, id2: { wins: 0, losses: 0, draws: 0 } };
  const last10A = order.aIsId1 ? last10.id1 : last10.id2;
  const last10B = order.aIsId1 ? last10.id2 : last10.id1;
  const last10Draws = last10A.draws ?? last10.id1.draws ?? 0;
  const tournamentsCount = summary.tournaments ? summary.tournaments.length : 0;

  elements.headline.textContent = `${playerA.name} vs ${playerB.name}`;
  elements.subhead.textContent = `${summary.total_matches} matches across ${tournamentsCount} tournaments.`;

  const winsA = order.aIsId1 ? summary.wins_id1 : summary.wins_id2;
  const winsB = order.aIsId1 ? summary.wins_id2 : summary.wins_id1;
  const goalsA = order.aIsId1 ? summary.goals_for_id1 : summary.goals_for_id2;
  const goalsB = order.aIsId1 ? summary.goals_for_id2 : summary.goals_for_id1;
  const firstNameA = playerA.name ? playerA.name.trim().split(/\s+/)[0] : "A";
  const firstNameB = playerB.name ? playerB.name.trim().split(/\s+/)[0] : "B";

  const cards = [
    { label: "Total Matches", value: summary.total_matches },
    { label: `${playerA.name} Wins`, value: winsA },
    { label: `${playerB.name} Wins`, value: winsB },
    { label: "Draws", value: summary.draws },
    { label: `${playerA.name} Goals`, value: goalsA },
    { label: `${playerB.name} Goals`, value: goalsB },
    { label: "Overtime Games", value: summary.overtime_games },
    { label: "First Meeting", value: summary.first_meeting_date || "-" },
    { label: "Last Meeting", value: summary.last_meeting_date || "-" },
    {
      label: `Last 10 (${firstNameA}/Draw/${firstNameB})`,
      value: `${last10A.wins}-${last10Draws}-${last10B.wins}`,
    },
  ];

  elements.summaryGrid.innerHTML = "";
  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "summary-card";
    div.innerHTML = `<span>${card.label}</span><strong>${card.value}</strong>`;
    elements.summaryGrid.appendChild(div);
  });
}

function populateSelect(selectEl, items, placeholder) {
  selectEl.innerHTML = "";
  const base = document.createElement("option");
  base.value = "";
  base.textContent = placeholder;
  selectEl.appendChild(base);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    selectEl.appendChild(option);
  });
}

function buildFilters(matches) {
  const years = new Set();
  const tournaments = new Map();
  const stages = new Set();

  matches.forEach((match) => {
    if (match.date) {
      years.add(match.date.slice(0, 4));
    }
    if (match.tournament_id != null) {
      tournaments.set(match.tournament_id, match.tournament_name || `Tournament ${match.tournament_id}`);
    }
    if (match.stage) {
      stages.add(match.stage);
    }
  });

  const yearOptions = Array.from(years).sort().map((year) => ({ value: year, label: year }));
  const tournamentOptions = Array.from(tournaments.entries())
    .map(([id, name]) => ({ value: String(id), label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const stageOptions = Array.from(stages)
    .sort()
    .map((stage) => ({ value: stage, label: stage }));

  populateSelect(elements.yearFilter, yearOptions, "All years");
  populateSelect(elements.tournamentFilter, tournamentOptions, "All tournaments");
  populateSelect(elements.stageFilter, stageOptions, "All stages");
}

function applyFilters() {
  if (!state.activeMatches.length) {
    elements.matchesBody.innerHTML = "";
    elements.matchCount.textContent = "0 matches";
    return;
  }
  const year = elements.yearFilter.value;
  const tournamentId = elements.tournamentFilter.value;
  const stage = elements.stageFilter.value;

  const filtered = state.activeMatches.filter((match) => {
    if (year && (!match.date || !match.date.startsWith(year))) return false;
    if (tournamentId && String(match.tournament_id) !== tournamentId) return false;
    if (stage && match.stage !== stage) return false;
    return true;
  });

  renderMatches(filtered);
}

function renderMatches(matches) {
  elements.matchesBody.innerHTML = "";
  if (!matches.length) {
    elements.matchCount.textContent = "0 matches";
    const row = document.createElement("tr");
    row.innerHTML = "<td colspan=\"5\">No matches for these filters.</td>";
    elements.matchesBody.appendChild(row);
    return;
  }

  const order = state.activeOrder || { aIsId1: true };
  const fragment = document.createDocumentFragment();
  matches.forEach((match) => {
    const row = document.createElement("tr");
    const goalsA = order.aIsId1 ? match.goals_id1 : match.goals_id2;
    const goalsB = order.aIsId1 ? match.goals_id2 : match.goals_id1;
    const score = `${goalsA}–${goalsB}`;
    row.innerHTML = `
      <td>${match.date || "-"}</td>
      <td>${match.tournament_name || "-"}</td>
      <td>${match.stage || "-"}</td>
      <td><span class="score-pill">${score}</span></td>
      <td>${match.overtime ? "OT" : "-"}</td>
    `;
    fragment.appendChild(row);
  });
  elements.matchesBody.appendChild(fragment);
  elements.matchCount.textContent = `${matches.length} matches`;
}

async function handleCompare() {
  const idA = resolvePlayerId(elements.playerA.value);
  const idB = resolvePlayerId(elements.playerB.value);

  if (!idA || !idB) {
    setStatus("Select two valid players from the suggestions.");
    return;
  }
  if (idA === idB) {
    setStatus("Choose two different players.");
    return;
  }

  const id1 = Math.min(idA, idB);
  const id2 = Math.max(idA, idB);

  setStatus("Loading match history...");
  elements.summaryGrid.innerHTML = "";
  elements.matchesBody.innerHTML = "";

  try {
    const data = await loadPair(id1, id2);
    if (!data) {
      setStatus("No matches played between these players yet.");
      elements.headline.textContent = "No matches yet";
      elements.subhead.textContent = "Try another pairing.";
      elements.matchCount.textContent = "0 matches";
      state.activeOrder = null;
      return;
    }

    state.activeData = data;
    state.activeMatches = data.matches || [];
    state.activeOrder = {
      idA,
      idB,
      aIsId1: data.player1.id === idA,
      playerA: data.player1.id === idA ? data.player1 : data.player2,
      playerB: data.player1.id === idA ? data.player2 : data.player1,
    };

    renderSummary(data);
    buildFilters(state.activeMatches);
    applyFilters();
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Could not load this matchup. Try again.");
  }
}

async function init() {
  document.body.classList.add("is-ready");
  setStatus("Loading players...");
  try {
    const res = await fetch("data/players.json");
    if (!res.ok) {
      throw new Error("Failed to load players");
    }
    const players = await res.json();
    indexPlayers(players);
    setStatus("Ready.");
  } catch (err) {
    console.error(err);
    setStatus("Players failed to load.");
  }

  elements.playerA.addEventListener("input", () => updateSuggestions(elements.playerA, elements.listA));
  elements.playerB.addEventListener("input", () => updateSuggestions(elements.playerB, elements.listB));
  elements.compareBtn.addEventListener("click", handleCompare);
  elements.yearFilter.addEventListener("change", applyFilters);
  elements.tournamentFilter.addEventListener("change", applyFilters);
  elements.stageFilter.addEventListener("change", applyFilters);
}

init();
