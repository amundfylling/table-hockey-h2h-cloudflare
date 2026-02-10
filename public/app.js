const STORAGE_KEYS = {
  last: "h2h_last",
  recent: "h2h_recent",
  theme: "h2h_theme",
};

const state = {
  players: [],
  playersById: new Map(),
  aliasMap: new Map(),
  pairCache: new Map(),
  playerFileCache: new Map(),
  baseMatches: [],
  stageMatches: [],
  filteredMatches: [],
  playerA: null,
  playerB: null,
  opponentsOfA: new Map(),
  opponentsLoading: false,
  stageTab: "overall",
  filters: {
    year: "all",
    tournament: "all",
    stage: "all",
    search: "",
    otOnly: false,
    tightOnly: false,
  },
  sort: "date-desc",
  perPage: 50,
  page: 1,
  loading: false,
};

const elements = {
  playerA: document.getElementById("player-a"),
  playerB: document.getElementById("player-b"),
  listA: document.getElementById("player-a-list"),
  listB: document.getElementById("player-b-list"),
  compareBtn: document.getElementById("compare-btn"),
  swapBtn: document.getElementById("swap-btn"),
  copyLinkBtn: document.getElementById("copy-link-btn"),
  status: document.getElementById("status"),
  recentList: document.getElementById("recent-list"),
  tabs: document.querySelectorAll(".tab"),
  stageMeta: document.getElementById("stage-meta"),
  headline: document.getElementById("headline"),
  subhead: document.getElementById("subhead"),
  record: document.getElementById("record"),
  summaryGrid: document.getElementById("summary-grid"),
  formTitle: document.getElementById("form-title"),
  formChips: document.getElementById("form-chips"),
  recordChart: document.getElementById("record-chart"),
  goalsChart: document.getElementById("goals-chart"),
  yearFilter: document.getElementById("year-filter"),
  tournamentFilter: document.getElementById("tournament-filter"),
  stageFilter: document.getElementById("stage-filter"),
  sortFilter: document.getElementById("sort-filter"),
  otToggle: document.getElementById("ot-toggle"),
  tightToggle: document.getElementById("tight-toggle"),
  searchFilter: document.getElementById("search-filter"),
  pageSize: document.getElementById("page-size"),
  matchCount: document.getElementById("match-count"),
  matchesBody: document.getElementById("matches-body"),
  prevPage: document.getElementById("prev-page"),
  nextPage: document.getElementById("next-page"),
  prevPageBottom: document.getElementById("prev-page-bottom"),
  nextPageBottom: document.getElementById("next-page-bottom"),
  pageInfo: document.getElementById("page-info"),
  pageInfoBottom: document.getElementById("page-info-bottom"),
  emptyState: document.getElementById("empty-state"),
  errorState: document.getElementById("error-state"),
  themeToggle: document.getElementById("theme-toggle"),
  filterToggle: document.getElementById("filter-toggle"),
  filterMenu: document.getElementById("filter-menu"),
  filterBackdrop: document.getElementById("filter-backdrop"),
  filterClose: document.getElementById("filter-close"),
  filterReset: document.getElementById("filter-reset"),
  filterBadge: document.getElementById("filter-badge"),
  playerBLoader: document.getElementById("player-b-loader"),
};

function normalizeText(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseOvertime(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  if (["0", "false", "no", "none", "null", "na"].includes(text)) return false;
  return text.includes("ot") || text.includes("over");
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function classifyStage(stage) {
  const text = normalizeText(stage);
  if (!text) return "other";
  if (
    text.includes("playoff") ||
    text.includes("knockout") ||
    text.includes("elimination") ||
    text.includes("bracket") ||
    text.includes("final") ||
    text.includes("semi") ||
    text.includes("quarter") ||
    text.includes("round of") ||
    text.includes("1/")
  ) {
    return "playoff";
  }
  if (text.includes("round") || text.includes("group") || text.includes("rr") || text.includes("league")) {
    return "round-robin";
  }
  return "other";
}

function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // ignore
  }
}

function setStatus(message) {
  elements.status.textContent = message;
}

function updateFormTitle() {
  if (!elements.formTitle) return;
  if (state.playerA && state.playerA.name) {
    elements.formTitle.textContent = `Form (last 10 - ${state.playerA.name})`;
  } else {
    elements.formTitle.textContent = "Form (last 10)";
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  elements.compareBtn.disabled = isLoading;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function ensureChartTooltip(container) {
  let tooltip = container.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    container.appendChild(tooltip);
  }
  return tooltip;
}

function showChartTooltip(container, tooltip, html, x, y) {
  tooltip.innerHTML = html;
  tooltip.classList.add("is-visible");
  const bounds = container.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.max(width / 2 + 8, Math.min(x, bounds.width - width / 2 - 8));
  const top = Math.max(height + 8, y);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideChartTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
}

function setTheme(mode) {
  if (mode === "dark") {
    document.body.setAttribute("data-theme", "dark");
  } else {
    document.body.removeAttribute("data-theme");
  }
  safeStorageSet(STORAGE_KEYS.theme, mode);
}

function toggleTheme() {
  const current = document.body.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
}

function initInfoPopovers() {
  const wraps = Array.from(document.querySelectorAll(".info-wrap"));
  if (!wraps.length) return;

  const closeAll = () => {
    wraps.forEach((wrap) => {
      wrap.classList.remove("is-open");
      const btn = wrap.querySelector(".info-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  };

  wraps.forEach((wrap) => {
    const btn = wrap.querySelector(".info-btn");
    if (!btn) return;
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const wasOpen = wrap.classList.contains("is-open");
      closeAll();
      if (!wasOpen) {
        wrap.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".info-wrap")) {
      closeAll();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAll();
    }
  });
}

function getPlayerById(id) {
  return state.playersById.get(id) || null;
}

function getAliasGroup(id) {
  const group = state.aliasMap.get(id);
  if (group && group.length) {
    return group;
  }
  return [id];
}

function normalizeAliasIds(ids) {
  const unique = Array.from(
    new Set(
      (ids || [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )
  );
  unique.sort((a, b) => a - b);
  return unique;
}

function setInputPlayer(inputEl, player) {
  if (!player) return;
  inputEl.value = `${player.name} (${player.id})`;
  inputEl.dataset.playerId = player.id;
}

function clearInputPlayer(inputEl, listEl) {
  inputEl.value = "";
  inputEl.dataset.playerId = "";
  listEl.classList.remove("is-open");
  listEl.innerHTML = "";
}

function resolvePlayerId(inputEl) {
  const stored = inputEl.dataset.playerId;
  if (stored) return Number(stored);
  const value = inputEl.value.trim();
  if (!value) return null;
  const idMatch = value.match(/\((\d+)\)\s*$/) || value.match(/\b(\d+)\s*$/);
  if (idMatch) {
    return Number.parseInt(idMatch[1], 10);
  }
  const key = normalizeText(value);
  const matches = state.players.filter((player) => normalizeText(player.name) === key);
  if (matches.length === 1) {
    inputEl.dataset.playerId = matches[0].id;
    return matches[0].id;
  }
  return null;
}

function renderRecent() {
  const recent = safeStorageGet(STORAGE_KEYS.recent, []);
  elements.recentList.innerHTML = "";
  if (!recent.length) {
    elements.recentList.innerHTML = "<span class=\"muted\">No recent matchups</span>";
    return;
  }
  const fragment = document.createDocumentFragment();
  recent.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${item.p1Name} vs ${item.p2Name}`;
    button.dataset.p1 = item.p1Id;
    button.dataset.p2 = item.p2Id;
    fragment.appendChild(button);
  });
  elements.recentList.appendChild(fragment);
}

function addRecent(p1, p2, p1Name, p2Name) {
  const recent = safeStorageGet(STORAGE_KEYS.recent, []);
  const filtered = recent.filter((item) => !(item.p1Id === p1 && item.p2Id === p2));
  filtered.unshift({
    p1Id: p1,
    p2Id: p2,
    p1Name,
    p2Name,
    ts: Date.now(),
  });
  safeStorageSet(STORAGE_KEYS.recent, filtered.slice(0, 5));
  renderRecent();
}

function updateUrl(p1, p2) {
  const url = new URL(window.location.href);
  url.searchParams.set("p1", p1);
  url.searchParams.set("p2", p2);
  window.history.replaceState({}, "", url);
}

function getUrlSelection() {
  const params = new URLSearchParams(window.location.search);
  const p1 = params.get("p1");
  const p2 = params.get("p2");
  if (!p1 || !p2) return null;
  const id1 = Number(p1);
  const id2 = Number(p2);
  if (!Number.isFinite(id1) || !Number.isFinite(id2)) return null;
  return { p1: id1, p2: id2 };
}

function buildSuggestions(query) {
  const value = normalizeText(query);
  if (value.length < 2) return [];
  const results = [];
  for (const player of state.players) {
    if (!player.name) continue;
    if (player.search_key && player.search_key.includes(value)) {
      results.push(player);
    }
    if (results.length >= 12) break;
  }
  return results;
}

function buildOpponentSuggestions(query) {
  if (!state.opponentsOfA.size) return [];
  const value = normalizeText(query);
  let results = [];

  for (const [oppId, oppData] of state.opponentsOfA) {
    const player = getPlayerById(oppId);
    if (!player || !player.name) continue;
    if (value.length >= 1) {
      if (!player.search_key || !player.search_key.includes(value)) continue;
    }
    results.push({ ...player, totalMatches: oppData.totalMatches });
  }

  results.sort((a, b) => b.totalMatches - a.totalMatches);
  return results.slice(0, 20);
}

async function loadOpponentsForPlayer(playerId) {
  state.opponentsOfA = new Map();
  state.opponentsLoading = true;
  elements.playerBLoader.hidden = false;
  elements.playerB.disabled = false;
  elements.playerB.placeholder = "Loading opponents...";

  try {
    const groupIds = getAliasGroup(playerId);
    const opponentMap = new Map();

    for (const gId of groupIds) {
      const payload = await fetchPlayerPayload(gId);
      if (!payload || !payload.opponents) continue;
      for (const [oppIdStr, oppData] of Object.entries(payload.opponents)) {
        const oppId = Number(oppIdStr);
        if (!Number.isFinite(oppId)) continue;
        const totalMatches = oppData.summary?.total_matches || (Array.isArray(oppData.matches) ? oppData.matches.length : 0);
        const existing = opponentMap.get(oppId);
        if (existing) {
          existing.totalMatches += totalMatches;
        } else {
          opponentMap.set(oppId, { totalMatches });
        }
      }
    }

    // Expand alias groups for opponents too
    const expandedMap = new Map();
    for (const [oppId, data] of opponentMap) {
      const aliasGroup = getAliasGroup(oppId);
      const primaryId = aliasGroup[0];
      const existing = expandedMap.get(primaryId);
      if (existing) {
        existing.totalMatches += data.totalMatches;
      } else {
        expandedMap.set(primaryId, { ...data });
      }
    }

    // Remove self from opponents
    const selfGroup = getAliasGroup(playerId);
    for (const selfId of selfGroup) {
      expandedMap.delete(selfId);
    }

    state.opponentsOfA = expandedMap;
    elements.playerB.placeholder = "Search opponent";
  } catch (err) {
    console.error("Failed to load opponents:", err);
    elements.playerB.placeholder = "Search player";
  } finally {
    state.opponentsLoading = false;
    elements.playerBLoader.hidden = true;
  }
}

function setupTypeahead(inputEl, listEl, options = {}) {
  let activeIndex = -1;
  let currentItems = [];
  const isPlayerB = options.forPlayerB || false;
  inputEl.setAttribute("aria-autocomplete", "list");
  inputEl.setAttribute("aria-controls", listEl.id);
  inputEl.setAttribute("aria-expanded", "false");

  const closeList = () => {
    listEl.classList.remove("is-open");
    listEl.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
    inputEl.setAttribute("aria-expanded", "false");
  };

  const openList = () => {
    listEl.classList.add("is-open");
    inputEl.setAttribute("aria-expanded", "true");
  };

  const renderList = (items) => {
    listEl.innerHTML = "";
    if (isPlayerB && !state.opponentsOfA.size && !state.opponentsLoading) {
      if (!resolvePlayerId(elements.playerA)) {
        const msg = document.createElement("div");
        msg.className = "empty-message";
        msg.textContent = "Select Player 1 first";
        listEl.appendChild(msg);
        openList();
        currentItems = [];
        return;
      }
    }
    if (!items.length) {
      if (isPlayerB && state.opponentsOfA.size && inputEl.value.trim().length > 0) {
        const msg = document.createElement("div");
        msg.className = "empty-message";
        msg.textContent = "No matching opponents";
        listEl.appendChild(msg);
        openList();
        currentItems = [];
        return;
      }
      closeList();
      return;
    }
    currentItems = items;
    const fragment = document.createDocumentFragment();
    items.forEach((player, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = player.id;
      btn.dataset.index = idx;
      const name = document.createElement("span");
      name.textContent = player.name;
      btn.appendChild(name);
      if (isPlayerB && player.totalMatches != null) {
        const count = document.createElement("span");
        count.className = "game-count";
        count.textContent = `${player.totalMatches} game${player.totalMatches !== 1 ? "s" : ""}`;
        btn.appendChild(count);
      } else {
        const meta = document.createElement("span");
        meta.className = "muted";
        meta.textContent = `#${player.id}`;
        btn.appendChild(meta);
      }
      if (idx === activeIndex) {
        btn.classList.add("is-active");
      }
      fragment.appendChild(btn);
    });
    listEl.appendChild(fragment);
    openList();
    const activeBtn = listEl.querySelector(".is-active");
    if (activeBtn) {
      activeBtn.scrollIntoView({ block: "nearest" });
    }
  };

  const updateList = () => {
    let items;
    if (isPlayerB && state.opponentsOfA.size) {
      items = buildOpponentSuggestions(inputEl.value);
    } else {
      items = buildSuggestions(inputEl.value);
    }
    activeIndex = -1;
    renderList(items);
  };

  const debouncedUpdate = debounce(updateList, 150);

  inputEl.addEventListener("input", () => {
    inputEl.dataset.playerId = "";
    debouncedUpdate();
  });

  inputEl.addEventListener("focus", () => {
    if (isPlayerB && state.opponentsOfA.size && !inputEl.dataset.playerId) {
      updateList();
    }
  });

  inputEl.addEventListener("keydown", (event) => {
    if (!listEl.classList.contains("is-open")) return;
    const items = currentItems;
    if (!items.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      renderList(items);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      renderList(items);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = items[activeIndex] || items[0];
      if (selected) {
        setInputPlayer(inputEl, selected);
        closeList();
        if (!isPlayerB) {
          onPlayerASelected(selected);
        }
      }
    } else if (event.key === "Escape") {
      closeList();
    }
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !listEl.classList.contains("is-open")) {
      handleCompare();
    }
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const player = getPlayerById(Number(button.dataset.id));
    if (player) {
      setInputPlayer(inputEl, player);
      closeList();
      if (!isPlayerB) {
        onPlayerASelected(player);
      }
    }
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(closeList, 150);
  });

  return { closeList, renderList, updateList };
}

async function onPlayerASelected(player) {
  if (!player || !player.id) return;
  clearInputPlayer(elements.playerB, elements.listB);
  await loadOpponentsForPlayer(player.id);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return res.json();
}

async function fetchPairPayload(id1, id2, onProgress) {
  const payload = await fetchJson(`data/h2h/${id1}/${id2}.json`);
  if (!payload) return null;
  if (payload.chunks && Array.isArray(payload.chunks)) {
    const matches = [];
    for (let i = 0; i < payload.chunks.length; i += 1) {
      const chunkPath = payload.chunks[i];
      const chunkUrl = chunkPath.startsWith("data/") ? chunkPath : `data/${chunkPath}`;
      if (onProgress) {
        onProgress(i + 1, payload.chunks.length);
      }
      const chunkPayload = await fetchJson(chunkUrl);
      if (!chunkPayload) {
        throw new Error(`Missing chunk ${chunkUrl}`);
      }
      if (Array.isArray(chunkPayload.matches)) {
        matches.push(...chunkPayload.matches);
      }
    }
    return { ...payload, matches };
  }
  return payload;
}

async function fetchPlayerPayload(playerId) {
  if (state.playerFileCache.has(playerId)) {
    return state.playerFileCache.get(playerId);
  }
  const payload = await fetchJson(`data/h2h/${playerId}.json`);
  if (payload) {
    state.playerFileCache.set(playerId, payload);
  }
  return payload;
}

function normalizeMatchBase(raw) {
  const date = raw.date || raw.Date || "";
  const ts = Date.parse(date);
  const stage = raw.stage || raw.Stage || "";
  const tournamentName = raw.tournament_name || raw.TournamentName || "";
  const tournamentId = raw.tournament_id ?? raw.TournamentID ?? null;
  const stageId = raw.stage_id ?? raw.StageID ?? null;
  const stageSequence = raw.stage_sequence ?? raw.StageSequence ?? null;
  const roundNumber = raw.round_number ?? raw.RoundNumber ?? null;
  const playoffGameNumber = raw.playoff_game_number ?? raw.PlayoffGameNumber ?? null;

  return {
    date,
    ts: Number.isFinite(ts) ? ts : 0,
    year: date ? date.slice(0, 4) : "",
    tournament_name: tournamentName,
    tournament_id: tournamentId !== null ? Number(tournamentId) : null,
    tournament_key: tournamentId != null ? `id:${tournamentId}` : `name:${tournamentName || "unknown"}`,
    stage,
    stage_type: classifyStage(stage),
    stage_id: stageId != null ? Number(stageId) : null,
    stage_sequence: stageSequence != null ? Number(stageSequence) : null,
    round_number: roundNumber != null ? Number(roundNumber) : null,
    playoff_game_number: playoffGameNumber != null ? Number(playoffGameNumber) : null,
  };
}

function normalizePairMatch(raw, aIsId1) {
  const goalsId1 = toNumber(
    raw.goals_id1 ?? raw.goals_for_id1 ?? raw.goalsPlayer1 ?? raw.goals_player1 ?? raw.goals_player ?? 0
  );
  const goalsId2 = toNumber(
    raw.goals_id2 ?? raw.goals_for_id2 ?? raw.goalsPlayer2 ?? raw.goals_player2 ?? raw.goals_opponent ?? 0
  );
  const goalsA = aIsId1 ? goalsId1 : goalsId2;
  const goalsB = aIsId1 ? goalsId2 : goalsId1;

  const base = normalizeMatchBase(raw);
  const overtime = parseOvertime(raw.overtime ?? raw.Overtime ?? raw.overtime_raw);
  const diff = goalsA - goalsB;

  return {
    ...base,
    goals_a: goalsA,
    goals_b: goalsB,
    goal_diff: diff,
    goal_abs: Math.abs(diff),
    overtime,
    result: diff > 0 ? "A" : diff < 0 ? "B" : "D",
  };
}

function normalizePlayerMatch(raw, isPlayerA) {
  const goalsFor = toNumber(raw.goals_for_player ?? raw.goals_player ?? raw.goals_id1 ?? 0);
  const goalsOpp = toNumber(raw.goals_for_opponent ?? raw.goals_opponent ?? raw.goals_id2 ?? 0);
  const goalsA = isPlayerA ? goalsFor : goalsOpp;
  const goalsB = isPlayerA ? goalsOpp : goalsFor;

  const base = normalizeMatchBase(raw);
  const overtime = parseOvertime(raw.overtime ?? raw.Overtime ?? raw.overtime_raw);
  const diff = goalsA - goalsB;

  return {
    ...base,
    goals_a: goalsA,
    goals_b: goalsB,
    goal_diff: diff,
    goal_abs: Math.abs(diff),
    overtime,
    result: diff > 0 ? "A" : diff < 0 ? "B" : "D",
  };
}

function buildMatchKey(match) {
  return [
    match.date || "",
    match.tournament_id ?? "",
    match.stage_id ?? "",
    match.stage_sequence ?? "",
    match.round_number ?? "",
    match.playoff_game_number ?? "",
    match.goals_a ?? "",
    match.goals_b ?? "",
    match.overtime ? 1 : 0,
  ].join("|");
}

async function buildGroupMatches(groupA, groupB, onProgress) {
  const matches = [];
  const seen = new Set();
  const opponentIds = groupB.map((id) => String(id));

  for (let i = 0; i < groupA.length; i += 1) {
    const playerId = groupA[i];
    if (onProgress) {
      onProgress(i + 1, groupA.length);
    }
    const payload = await fetchPlayerPayload(playerId);
    if (!payload || !payload.opponents) continue;
    for (const opponentId of opponentIds) {
      const opponent = payload.opponents[opponentId];
      if (!opponent || !Array.isArray(opponent.matches)) continue;
      opponent.matches.forEach((match) => {
        const normalized = normalizePlayerMatch(match, true);
        const key = buildMatchKey(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        matches.push(normalized);
      });
    }
  }

  return matches;
}

async function loadMatchup(p1, p2, onProgress) {
  const groupA = getAliasGroup(p1);
  const groupB = getAliasGroup(p2);
  const cacheKey = `${groupA.join(",")}-${groupB.join(",")}`;
  if (state.pairCache.has(cacheKey)) {
    return state.pairCache.get(cacheKey);
  }

  if (groupA.length > 1 || groupB.length > 1) {
    const matches = await buildGroupMatches(groupA, groupB, onProgress);
    const playerA = getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
    const playerB = getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
    const data = { playerA, playerB, matches };
    state.pairCache.set(cacheKey, data);
    return data;
  }

  const id1 = Math.min(p1, p2);
  const id2 = Math.max(p1, p2);
  let payload = null;

  try {
    payload = await fetchPairPayload(id1, id2, onProgress);
  } catch (err) {
    payload = null;
  }

  if (payload) {
    const aIsId1 = p1 === id1;
    const player1 = payload.player1 || { id: id1, name: getPlayerById(id1)?.name || `Player ${id1}` };
    const player2 = payload.player2 || { id: id2, name: getPlayerById(id2)?.name || `Player ${id2}` };
    const playerA = aIsId1 ? player1 : player2;
    const playerB = aIsId1 ? player2 : player1;
    const matches = Array.isArray(payload.matches)
      ? payload.matches.map((match) => normalizePairMatch(match, aIsId1))
      : [];
    const data = { playerA, playerB, matches };
    state.pairCache.set(cacheKey, data);
    return data;
  }

  const playerPayload = await fetchPlayerPayload(p1);
  if (playerPayload && playerPayload.opponents) {
    const opponent = playerPayload.opponents[String(p2)];
    if (opponent) {
      const playerA = playerPayload.player || getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
      const playerB = opponent.player || getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
      const matches = Array.isArray(opponent.matches)
        ? opponent.matches.map((match) => normalizePlayerMatch(match, true))
        : [];
      const data = { playerA, playerB, matches };
      state.pairCache.set(cacheKey, data);
      return data;
    }
  }

  const otherPayload = await fetchPlayerPayload(p2);
  if (otherPayload && otherPayload.opponents) {
    const opponent = otherPayload.opponents[String(p1)];
    if (opponent) {
      const playerA = getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
      const playerB = otherPayload.player || getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
      const matches = Array.isArray(opponent.matches)
        ? opponent.matches.map((match) => normalizePlayerMatch(match, false))
        : [];
      const data = { playerA, playerB, matches };
      state.pairCache.set(cacheKey, data);
      return data;
    }
  }

  return null;
}

function computeSummary(matches) {
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

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1)}%`;
}

function formatAxisValue(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value));
}

const DASH = "—";

function formatCardValue(value) {
  if (value == null || value === "") return DASH;
  if (Number.isNaN(value)) return DASH;
  return String(value);
}

function formatRound(match) {
  const parts = [];
  if (match.round_number != null) parts.push(`R${match.round_number}`);
  if (match.playoff_game_number != null) parts.push(`G${match.playoff_game_number}`);
  return parts.length ? parts.join(" / ") : "-";
}

function firstName(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function formatScore(match) {
  if (!match) return DASH;
  if (!Number.isFinite(match.goals_a) || !Number.isFinite(match.goals_b)) return DASH;
  return `${match.goals_a}-${match.goals_b}`;
}

function createScoreHeader() {
  const header = document.createElement("div");
  header.className = "scoreboard-head";

  const left = document.createElement("div");
  left.className = "scoreboard-player scoreboard-player--a";
  left.textContent = state.playerA?.name || "Player A";

  const title = document.createElement("div");
  title.className = "scoreboard-title";
  title.textContent = "Head to Head";

  const right = document.createElement("div");
  right.className = "scoreboard-player scoreboard-player--b";
  right.textContent = state.playerB?.name || "Player B";

  header.appendChild(left);
  header.appendChild(title);
  header.appendChild(right);
  return header;
}

function createScoreRow(label, leftValue, rightValue, options = {}) {
  const leftNum = toNumber(leftValue, 0);
  const rightNum = toNumber(rightValue, 0);
  const total = options.totalOverride != null ? options.totalOverride : leftNum + rightNum;
  const leftRatio = total > 0 ? leftNum / total : 0;
  const rightRatio = total > 0 ? rightNum / total : 0;
  const leftDisplay =
    options.leftDisplay != null ? options.leftDisplay : formatCardValue(leftValue);
  const rightDisplay =
    options.rightDisplay != null ? options.rightDisplay : formatCardValue(rightValue);
  const noteText = options.note ? String(options.note) : "";
  const better = options.better || "high";

  let lead = "tie";
  if (leftNum !== rightNum) {
    lead = better === "low" ? (leftNum < rightNum ? "a" : "b") : leftNum > rightNum ? "a" : "b";
  }

  const row = document.createElement("div");
  row.className = "score-row";
  row.dataset.lead = lead;
  row.dataset.better = better;
  row.style.setProperty("--left", leftRatio.toFixed(3));
  row.style.setProperty("--right", rightRatio.toFixed(3));

  const fillA = document.createElement("span");
  fillA.className = "score-fill score-fill--a";
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
  row.appendChild(fillB);
  row.appendChild(leftEl);
  row.appendChild(labelEl);
  row.appendChild(rightEl);
  if (noteText) {
    const note = document.createElement("div");
    note.className = "score-note";
    note.textContent = noteText;
    row.appendChild(note);
  }
  return row;
}

function getHighlightInfo(match, side) {
  if (!match) {
    return { score: DASH, date: DASH, opponent: DASH, tournament: DASH };
  }
  const score = side === "b" ? `${match.goals_b}-${match.goals_a}` : formatScore(match);
  const opponent = side === "b" ? state.playerA?.name : state.playerB?.name;
  return {
    score: score || DASH,
    date: match.date || DASH,
    opponent: opponent || DASH,
    tournament: match.tournament_name || DASH,
  };
}

function createHighlightBlock(label, info, side) {
  const block = document.createElement("div");
  block.className = `highlight highlight--${side}`;

  const title = document.createElement("div");
  title.className = "highlight-title";
  title.textContent = label;

  const score = document.createElement("div");
  score.className = "highlight-score";
  score.textContent = info.score;

  const meta = document.createElement("div");
  meta.className = "highlight-meta";
  const opponent = info.opponent !== DASH ? `vs ${info.opponent}` : DASH;
  const date = info.date !== DASH ? info.date : DASH;
  meta.textContent = `${opponent} | ${date}`;

  const tour = document.createElement("div");
  tour.className = "highlight-tour";
  tour.textContent = info.tournament;
  if (info.tournament && info.tournament !== DASH) {
    tour.title = info.tournament;
  }

  block.appendChild(title);
  block.appendChild(score);
  block.appendChild(meta);
  block.appendChild(tour);
  return block;
}

function createHighlightColumn(name, side, winInfo) {
  const column = document.createElement("div");
  column.className = `highlight-column highlight-column--${side}`;

  const title = document.createElement("div");
  title.className = "highlight-column-title";
  title.textContent = name || "Player";
  if (name) title.title = name;

  column.appendChild(title);
  column.appendChild(createHighlightBlock("Largest win", winInfo, side));
  return column;
}

function renderSummary(matches) {
  updateFormTitle();
  if (!state.playerA || !state.playerB) return;
  const summary = computeSummary(matches);
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;

  elements.headline.textContent = `${state.playerA.name} vs ${state.playerB.name}`;
  elements.subhead.textContent = total
    ? `${total} matches across ${summary.tournaments.size} tournaments.`
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
      note: `Draws ${summary.draws}`,
    })
  );
  rows.appendChild(createScoreRow("Total goals scored", summary.goalsA, summary.goalsB));
  rows.appendChild(createScoreRow("Tight wins (1 goal)", summary.tightWins, summary.tightLosses));
  rows.appendChild(createScoreRow("Overtime wins", summary.otWinsA, summary.otWinsB));
  scoreboard.appendChild(rows);

  const highlights = document.createElement("div");
  highlights.className = "scoreboard-highlights";
  const highlightA = createHighlightColumn(
    state.playerA.name,
    "a",
    getHighlightInfo(summary.largestWin, "a")
  );
  const highlightB = createHighlightColumn(
    state.playerB.name,
    "b",
    getHighlightInfo(summary.largestLoss, "b")
  );
  highlights.appendChild(highlightA);
  highlights.appendChild(highlightB);
  scoreboard.appendChild(highlights);

  elements.summaryGrid.appendChild(scoreboard);
}

function renderForm(matches) {
  elements.formChips.innerHTML = "";
  if (!matches.length) {
    elements.formChips.innerHTML = "<span class=\"muted\">No matches</span>";
    return;
  }
  const ordered = [...matches].sort((a, b) => a.ts - b.ts).slice(-10);
  const fragment = document.createDocumentFragment();
  ordered.forEach((match) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const tournament = match.tournament_name || "Unknown tournament";
    const stage = match.stage ? ` | ${match.stage}` : "";
    chip.title = `${match.date || "Unknown date"} | ${state.playerA.name} ${match.goals_a}-${match.goals_b} ${state.playerB.name} | ${tournament}${stage}`;
    if (match.result === "A") {
      chip.textContent = "W";
      chip.classList.add("win");
    } else if (match.result === "B") {
      chip.textContent = "L";
      chip.classList.add("loss");
    } else {
      chip.textContent = "D";
      chip.classList.add("draw");
    }
    fragment.appendChild(chip);
  });
  elements.formChips.appendChild(fragment);
}

function renderRecordChart(matches) {
  if (matches.length < 2) {
    elements.recordChart.textContent = "Not enough data";
    return;
  }
  const ordered = [...matches].sort((a, b) => a.ts - b.ts);
  const values = [];
  let current = 0;
  ordered.forEach((match) => {
    if (match.result === "A") current += 1;
    if (match.result === "B") current -= 1;
    values.push(current);
  });
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const width = 520;
  const height = 180;
  const padding = 28;
  const range = max - min || 1;
  const zeroY = height - padding - ((0 - min) / range) * (height - padding * 2);
  const xScale = (index) =>
    padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
  const yScale = (value) =>
    height - padding - ((value - min) / range) * (height - padding * 2);
  const points = values.map((value, index) => `${xScale(index)},${yScale(value)}`);
  const areaPath = `M ${xScale(0)} ${zeroY} L ${points.join(" ")} L ${xScale(values.length - 1)} ${zeroY} Z`;
  const tickCount = 4;
  const gridLines = [];
  const yLabels = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const ratio = i / tickCount;
    const y = padding + ratio * (height - padding * 2);
    const value = max - ratio * (max - min);
    gridLines.push(
      `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" />`
    );
    yLabels.push(
      `<text x="${padding - 6}" y="${y}" fill="var(--muted)" font-size="10" text-anchor="end" dominant-baseline="middle">${formatAxisValue(value)}</text>`
    );
  }
  const endValue = values[values.length - 1];
  const endColor = endValue >= 0 ? "var(--teal)" : "var(--accent)";
  const leadLabel =
    endValue === 0
      ? "Tied overall"
      : `${endValue > 0 ? state.playerA.name : state.playerB.name} lead`;

  elements.recordChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a"></span>${state.playerA.name}</span>
      <span><span class="legend-dot b"></span>${state.playerB.name}</span>
      <span class="chart-note">${leadLabel}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" aria-label="Cumulative record chart">
      ${gridLines.join("")}
      ${yLabels.join("")}
      <line x1="${padding}" y1="${zeroY}" x2="${width - padding}" y2="${zeroY}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      <path d="${areaPath}" fill="var(--teal-soft)" stroke="none"></path>
      <polyline fill="none" stroke="var(--teal)" stroke-width="3" points="${points.join(" ")}" />
      <circle cx="${xScale(values.length - 1)}" cy="${yScale(endValue)}" r="4.5" fill="${endColor}" />
      <text x="${padding}" y="${zeroY - 6}" fill="var(--muted)" font-size="10">0</text>
      <line class="chart-hover-line" x1="0" y1="${padding}" x2="0" y2="${height - padding}" stroke="var(--muted)" stroke-dasharray="3 5" stroke-width="1" opacity="0" />
      <circle class="chart-hover-point" cx="0" cy="0" r="4" fill="var(--accent)" opacity="0" />
    </svg>
  `;

  const container = elements.recordChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);
  const hoverLine = svg.querySelector(".chart-hover-line");
  const hoverPoint = svg.querySelector(".chart-hover-point");

  const handleMove = (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(
      0,
      Math.min(values.length - 1, Math.round(((x - padding) / (width - padding * 2)) * (values.length - 1)))
    );
    const match = ordered[index];
    const cumulative = values[index];
    if (!match) return;
    const xPos = xScale(index);
    const yPos = yScale(cumulative);

    hoverLine.setAttribute("x1", xPos);
    hoverLine.setAttribute("x2", xPos);
    hoverLine.setAttribute("opacity", "1");
    hoverPoint.setAttribute("cx", xPos);
    hoverPoint.setAttribute("cy", yPos);
    hoverPoint.setAttribute("opacity", "1");

    const containerRect = container.getBoundingClientRect();
    const xLocal = (xPos / width) * rect.width + (rect.left - containerRect.left);
    const yLocal = (yPos / height) * rect.height + (rect.top - containerRect.top);
    const recordValue = cumulative > 0 ? `+${cumulative}` : `${cumulative}`;
    const html = `
      <div class="tooltip-title">${match.date || "Unknown date"}</div>
      <div class="tooltip-row">${state.playerA.name} ${match.goals_a}-${match.goals_b} ${state.playerB.name}</div>
      <div class="tooltip-row">Record: ${recordValue}</div>
    `;
    showChartTooltip(container, tooltip, html, xLocal, yLocal);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
    hoverLine.setAttribute("opacity", "0");
    hoverPoint.setAttribute("opacity", "0");
  };

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
}

function renderGoalsChart(matches) {
  if (!matches.length) {
    elements.goalsChart.textContent = "No data";
    return;
  }
  const byYear = new Map();
  matches.forEach((match) => {
    if (!match.year) return;
    const entry = byYear.get(match.year) || { goalsA: 0, goalsB: 0, games: 0 };
    entry.goalsA += match.goals_a;
    entry.goalsB += match.goals_b;
    entry.games += 1;
    byYear.set(match.year, entry);
  });
  const years = Array.from(byYear.keys()).sort();
  if (!years.length) {
    elements.goalsChart.textContent = "No data";
    return;
  }
  const averages = years.map((year) => {
    const entry = byYear.get(year);
    const games = entry.games || 1;
    return {
      year,
      avgA: entry.goalsA / games,
      avgB: entry.goalsB / games,
    };
  });
  const maxAvg = Math.max(1, ...averages.map((item) => Math.max(item.avgA, item.avgB)));
  const width = 520;
  const height = 180;
  const padding = 28;
  const chartHeight = height - padding * 2;
  const groupWidth = (width - padding * 2) / years.length;
  const barWidth = Math.max(8, groupWidth * 0.35);
  const labelStep = Math.max(1, Math.ceil(years.length / 6));
  let bars = "";
  let labels = "";
  let grid = "";
  let yLabels = "";

  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const y = padding + ratio * chartHeight;
    const value = maxAvg * (1 - ratio);
    grid += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" />`;
    yLabels += `<text x="${padding - 6}" y="${y}" fill="var(--muted)" font-size="10" text-anchor="end" dominant-baseline="middle">${formatAxisValue(value)}</text>`;
  }

  averages.forEach((item, idx) => {
    const aHeight = (item.avgA / maxAvg) * chartHeight;
    const bHeight = (item.avgB / maxAvg) * chartHeight;
    const xBase = padding + idx * groupWidth;
    const aX = xBase + groupWidth * 0.1;
    const bX = aX + barWidth + groupWidth * 0.08;
    const aY = height - padding - aHeight;
    const bY = height - padding - bHeight;
    const aValue = item.avgA.toFixed(2);
    const bValue = item.avgB.toFixed(2);
    bars += `
      <rect x="${aX}" y="${aY}" width="${barWidth}" height="${aHeight}" rx="3" fill="var(--teal)" data-year="${item.year}" data-side="a" data-value="${aValue}" />
      <rect x="${bX}" y="${bY}" width="${barWidth}" height="${bHeight}" rx="3" fill="var(--accent)" data-year="${item.year}" data-side="b" data-value="${bValue}" />
    `;
    if (idx % labelStep === 0 || idx === years.length - 1) {
      labels += `<text x="${xBase + groupWidth * 0.5}" y="${height - 6}" fill="var(--muted)" font-size="10" text-anchor="middle">${item.year}</text>`;
    }
  });

  elements.goalsChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a"></span>${state.playerA.name}</span>
      <span><span class="legend-dot b"></span>${state.playerB.name}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" aria-label="Average goals by year chart">
      ${grid}
      ${yLabels}
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      ${bars}
      ${labels}
    </svg>
  `;

  const container = elements.goalsChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);

  const handleMove = (event) => {
    const target = event.target;
    if (!target || typeof target.tagName !== "string" || target.tagName.toLowerCase() !== "rect") {
      hideChartTooltip(tooltip);
      return;
    }
    const year = target.getAttribute("data-year");
    const side = target.getAttribute("data-side");
    const value = target.getAttribute("data-value");
    const name = side === "b" ? state.playerB.name : state.playerA.name;
    const html = `
      <div class="tooltip-title">${year}</div>
      <div class="tooltip-row">${name}: ${value} avg goals</div>
    `;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    showChartTooltip(container, tooltip, html, x, y);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
  };

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
}

function renderCharts(matches) {
  renderRecordChart(matches);
  renderGoalsChart(matches);
}

function renderTable(matches) {
  elements.matchesBody.innerHTML = "";
  if (!matches.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
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

    const expCell = document.createElement("td");
    const expBtn = document.createElement("button");
    expBtn.type = "button";
    expBtn.className = "expand-btn";
    expBtn.dataset.row = rowId;
    expBtn.textContent = "+";
    expCell.appendChild(expBtn);

    const dateCell = document.createElement("td");
    dateCell.className = "date-cell";
    dateCell.textContent = formatDate(match.date);

    const tournamentCell = document.createElement("td");
    if (match.stage_id) {
      const link = document.createElement("a");
      link.href = `https://th.sportscorpion.com/eng/tournament/stage/${match.stage_id}/matches/`;
      link.target = "_blank";
      link.className = "table-link";
      link.innerHTML = `
        ${match.tournament_name || "-"}
        <svg class="external-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      `;
      tournamentCell.appendChild(link);
    } else {
      tournamentCell.textContent = match.tournament_name || "-";
    }

    const stageCell = document.createElement("td");
    stageCell.textContent = match.stage || "-";

    const roundCell = document.createElement("td");
    roundCell.textContent = formatRound(match);

    const scoreCell = document.createElement("td");
    const scoreSpan = document.createElement("span");
    scoreSpan.className = "match-score";
    scoreSpan.textContent = `${match.goals_a} - ${match.goals_b}`;
    scoreCell.appendChild(scoreSpan);

    const otCell = document.createElement("td");
    if (match.overtime) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "OT";
      otCell.appendChild(badge);
    } else {
      otCell.textContent = "-";
    }

    const winnerCell = document.createElement("td");
    const winner = document.createElement("span");
    winner.className = "winner";
    const nameA = firstName(state.playerA?.name) || "Player A";
    const nameB = firstName(state.playerB?.name) || "Player B";
    if (match.result === "A") {
      winner.classList.add("a");
      winner.textContent = nameA;
      winner.title = state.playerA.name;
    } else if (match.result === "B") {
      winner.classList.add("b");
      winner.textContent = nameB;
      winner.title = state.playerB.name;
    } else {
      winner.classList.add("d");
      winner.textContent = "Draw";
      winner.title = "Draw";
    }
    winnerCell.appendChild(winner);

    row.appendChild(expCell);
    row.appendChild(dateCell);
    row.appendChild(tournamentCell);
    row.appendChild(stageCell);
    row.appendChild(roundCell);
    row.appendChild(scoreCell);
    row.appendChild(otCell);
    row.appendChild(winnerCell);

    const detailRow = document.createElement("tr");
    detailRow.id = `detail-${rowId}`;
    detailRow.className = "detail-row";
    detailRow.hidden = true;
    const detailCell = document.createElement("td");
    detailCell.colSpan = 8;
    const detailGrid = document.createElement("div");
    detailGrid.className = "detail-grid";
    const detailItems = [
      { label: "Stage ID", value: match.stage_id },
      { label: "Tournament ID", value: match.tournament_id },
      { label: "Stage sequence", value: match.stage_sequence },
      { label: "Round number", value: match.round_number },
      { label: "Playoff game", value: match.playoff_game_number },
    ];
    detailItems.forEach((item) => {
      const block = document.createElement("div");
      block.innerHTML = `<strong>${item.label}:</strong> ${item.value ?? "-"}`;
      detailGrid.appendChild(block);
    });
    detailCell.appendChild(detailGrid);
    detailRow.appendChild(detailCell);

    fragment.appendChild(row);
    fragment.appendChild(detailRow);
  });

  elements.matchesBody.appendChild(fragment);

  const end = Math.min(start + state.perPage, matches.length);
  elements.matchCount.textContent = `Showing ${start + 1}-${end} of ${matches.length} matches`;
}

function updatePagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.perPage));
  if (state.page > totalPages) state.page = totalPages;
  elements.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  elements.pageInfoBottom.textContent = `Page ${state.page} of ${totalPages}`;
  elements.prevPage.disabled = state.page <= 1;
  elements.nextPage.disabled = state.page >= totalPages;
  elements.prevPageBottom.disabled = state.page <= 1;
  elements.nextPageBottom.disabled = state.page >= totalPages;
}

function applyStageTab(matches, stageTab) {
  if (stageTab === "round-robin") {
    return matches.filter((match) => match.stage_type === "round-robin");
  }
  if (stageTab === "playoff") {
    return matches.filter((match) => match.stage_type === "playoff");
  }
  return matches;
}

function applyFilters(matches) {
  const filters = state.filters;
  const search = normalizeText(filters.search);
  return matches.filter((match) => {
    if (filters.year !== "all" && match.year !== filters.year) return false;
    if (filters.tournament !== "all" && match.tournament_key !== filters.tournament) return false;
    if (filters.stage !== "all" && match.stage !== filters.stage) return false;
    if (filters.otOnly && !match.overtime) return false;
    if (filters.tightOnly && match.goal_abs > 1) return false;
    if (search) {
      const hay = `${match.tournament_name || ""} ${match.stage || ""}`;
      if (!normalizeText(hay).includes(search)) return false;
    }
    return true;
  });
}

function sortMatches(matches) {
  const sorted = [...matches];
  const stageOrder = (match) => {
    const seq = match.stage_sequence ?? 0;
    const round = match.round_number ?? 0;
    const playoff = match.playoff_game_number ?? 0;
    return [seq, round, playoff];
  };
  const compareStageDesc = (a, b) => {
    const [seqA, roundA, playoffA] = stageOrder(a);
    const [seqB, roundB, playoffB] = stageOrder(b);
    return seqB - seqA || roundB - roundA || playoffB - playoffA;
  };
  const compareStageAsc = (a, b) => {
    const [seqA, roundA, playoffA] = stageOrder(a);
    const [seqB, roundB, playoffB] = stageOrder(b);
    return seqA - seqB || roundA - roundB || playoffA - playoffB;
  };
  switch (state.sort) {
    case "date-asc":
      sorted.sort((a, b) => a.ts - b.ts || compareStageAsc(a, b));
      break;
    case "date-desc":
      sorted.sort((a, b) => b.ts - a.ts || compareStageDesc(a, b));
      break;
    case "tournament":
      sorted.sort((a, b) =>
        (a.tournament_name || "").localeCompare(b.tournament_name || "") ||
        b.ts - a.ts ||
        compareStageDesc(a, b)
      );
      break;
    case "diff-asc":
      sorted.sort((a, b) => a.goal_abs - b.goal_abs || b.ts - a.ts || compareStageDesc(a, b));
      break;
    case "diff-desc":
      sorted.sort((a, b) => b.goal_abs - a.goal_abs || b.ts - a.ts || compareStageDesc(a, b));
      break;
    default:
      break;
  }
  return sorted;
}

function refreshFilterOptions(matches) {
  const years = new Set();
  const tournaments = new Map();
  const stages = new Set();

  matches.forEach((match) => {
    if (match.year) years.add(match.year);
    if (match.tournament_key) {
      tournaments.set(match.tournament_key, match.tournament_name || "Unknown tournament");
    }
    if (match.stage) stages.add(match.stage);
  });

  const yearOptions = ["all", ...Array.from(years).sort()];
  const tournamentOptions = ["all", ...Array.from(tournaments.keys()).sort((a, b) => {
    const nameA = tournaments.get(a) || "";
    const nameB = tournaments.get(b) || "";
    return nameA.localeCompare(nameB);
  })];
  const stageOptions = ["all", ...Array.from(stages).sort()];

  populateSelect(elements.yearFilter, yearOptions, "All years");
  populateSelect(elements.tournamentFilter, tournamentOptions, "All tournaments", tournaments);
  populateSelect(elements.stageFilter, stageOptions, "All stages");
}

function populateSelect(selectEl, values, label, labelsMap) {
  selectEl.innerHTML = "";
  values.forEach((value, index) => {
    const option = document.createElement("option");
    option.value = value;
    if (index === 0) {
      option.textContent = label;
    } else if (labelsMap && labelsMap.has(value)) {
      option.textContent = labelsMap.get(value);
    } else {
      option.textContent = value;
    }
    selectEl.appendChild(option);
  });
  if (values.includes(selectEl.value)) return;
  selectEl.value = "all";
}

function updateStageMeta() {
  const total = state.baseMatches.length;
  const rr = state.baseMatches.filter((match) => match.stage_type === "round-robin").length;
  const po = state.baseMatches.filter((match) => match.stage_type === "playoff").length;
  elements.stageMeta.textContent = `Overall ${total}, Round-robin ${rr}, Playoff ${po}`;
}

function countActiveFilters() {
  let count = 0;
  if (state.filters.year !== "all") count += 1;
  if (state.filters.tournament !== "all") count += 1;
  if (state.filters.stage !== "all") count += 1;
  if (state.filters.search) count += 1;
  if (state.filters.otOnly) count += 1;
  if (state.filters.tightOnly) count += 1;
  return count;
}

function updateFilterBadge() {
  const count = countActiveFilters();
  if (count > 0) {
    elements.filterBadge.textContent = count;
    elements.filterBadge.hidden = false;
  } else {
    elements.filterBadge.hidden = true;
  }
}

function updateView() {
  if (!state.baseMatches.length) {
    renderSummary([]);
    renderForm([]);
    renderCharts([]);
    renderTable([]);
    updatePagination(0);
    return;
  }

  state.stageMatches = applyStageTab(state.baseMatches, state.stageTab);
  const filtered = applyFilters(state.stageMatches);
  state.filteredMatches = sortMatches(filtered);
  const totalPages = Math.max(1, Math.ceil(state.filteredMatches.length / state.perPage));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;

  renderSummary(state.filteredMatches);
  renderForm(state.filteredMatches);
  renderCharts(state.filteredMatches);
  renderTable(state.filteredMatches);
  updatePagination(state.filteredMatches.length);
  updateFilterBadge();
}

function setStageTab(stage) {
  state.stageTab = stage;
  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.stage === stage;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  state.filters.year = "all";
  state.filters.tournament = "all";
  state.filters.stage = "all";
  state.filters.search = "";
  state.filters.otOnly = false;
  state.filters.tightOnly = false;
  elements.yearFilter.value = "all";
  elements.tournamentFilter.value = "all";
  elements.stageFilter.value = "all";
  elements.searchFilter.value = "";
  elements.otToggle.checked = false;
  elements.tightToggle.checked = false;
  refreshFilterOptions(applyStageTab(state.baseMatches, stage));
  state.page = 1;
  updateView();
}

async function handleCompare() {
  const idA = resolvePlayerId(elements.playerA);
  const idB = resolvePlayerId(elements.playerB);

  if (!idA || !idB) {
    setStatus("Select two valid players.");
    return;
  }
  if (idA === idB) {
    setStatus("Choose two different players.");
    return;
  }

  setLoading(true);
  setStatus("Loading matchup...");
  elements.emptyState.hidden = true;
  elements.errorState.hidden = true;
  renderSummarySkeleton();
  renderTableSkeleton();

  try {
    const data = await loadMatchup(idA, idB, (current, total) => {
      setStatus(`Loading chunks ${current}/${total}...`);
    });

    if (!data || !data.matches.length) {
      elements.emptyState.hidden = false;
      state.baseMatches = [];
      state.filteredMatches = [];
      renderSummary([]);
      renderForm([]);
      renderCharts([]);
      renderTable([]);
      updatePagination(0);
      setLoading(false);
      setStatus("No matches found.");
      return;
    }

    state.playerA = getPlayerById(idA) || data.playerA;
    state.playerB = getPlayerById(idB) || data.playerB;
    state.baseMatches = data.matches;
    state.page = 1;
    state.sort = elements.sortFilter.value;
    state.perPage = Number(elements.pageSize.value);

    updateUrl(idA, idB);
    safeStorageSet(STORAGE_KEYS.last, { p1: idA, p2: idB });
    addRecent(idA, idB, state.playerA.name, state.playerB.name);
    updateStageMeta();
    setStageTab("overall");
    setLoading(false);
    setStatus("");
  } catch (err) {
    console.error(err);
    setLoading(false);
    elements.errorState.hidden = false;
    setStatus("Failed to load matchup.");
  }
}

function renderSummarySkeleton() {
  elements.summaryGrid.innerHTML = "";
  const scoreboard = document.createElement("div");
  scoreboard.className = "h2h-scoreboard";

  const head = document.createElement("div");
  head.className = "scoreboard-head skeleton";
  head.innerHTML = "<div class=\"scoreboard-player\">Loading</div><div class=\"scoreboard-title\">...</div><div class=\"scoreboard-player\">Loading</div>";
  scoreboard.appendChild(head);

  const rows = document.createElement("div");
  rows.className = "score-rows";
  for (let i = 0; i < 4; i += 1) {
    const row = document.createElement("div");
    row.className = "score-row skeleton";
    row.innerHTML = "<div class=\"score-value\">...</div><div class=\"score-label\">Loading</div><div class=\"score-value\">...</div>";
    rows.appendChild(row);
  }
  scoreboard.appendChild(rows);

  elements.summaryGrid.appendChild(scoreboard);
}

function renderTableSkeleton() {
  elements.matchesBody.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 6; i += 1) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "skeleton";
    cell.textContent = "Loading";
    row.appendChild(cell);
    fragment.appendChild(row);
  }
  elements.matchesBody.appendChild(fragment);
}

async function handleSwap() {
  const aValue = elements.playerA.value;
  const bValue = elements.playerB.value;
  const aId = elements.playerA.dataset.playerId;
  const bId = elements.playerB.dataset.playerId;

  elements.playerA.value = bValue;
  elements.playerB.value = aValue;
  elements.playerA.dataset.playerId = bId || "";
  elements.playerB.dataset.playerId = aId || "";

  // Reload opponents for the new Player A
  const newAId = bId ? Number(bId) : null;
  if (newAId) {
    elements.playerB.disabled = false;
    await loadOpponentsForPlayer(newAId);
  }

  if (aValue && bValue) {
    handleCompare();
  }
}

function handleCopyLink() {
  const idA = resolvePlayerId(elements.playerA);
  const idB = resolvePlayerId(elements.playerB);
  if (!idA || !idB) {
    setStatus("Select players first.");
    return;
  }
  updateUrl(idA, idB);
  const link = window.location.href;
  const btn = elements.copyLinkBtn;
  const originalText = btn.textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(
      () => {
        btn.textContent = "Copied!";
        btn.classList.add("copy-success");
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove("copy-success");
        }, 2000);
      },
      () => setStatus("Copy failed.")
    );
  } else {
    setStatus("Copy not supported.");
  }
}

async function handleRecentClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const p1 = Number(button.dataset.p1);
  const p2 = Number(button.dataset.p2);
  if (!p1 || !p2) return;
  const player1 = getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
  const player2 = getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
  setInputPlayer(elements.playerA, player1);
  elements.playerB.disabled = false;
  await loadOpponentsForPlayer(p1);
  setInputPlayer(elements.playerB, player2);
  handleCompare();
}

function initFilters() {
  elements.yearFilter.addEventListener("change", () => {
    state.filters.year = elements.yearFilter.value;
    state.page = 1;
    updateView();
  });
  elements.tournamentFilter.addEventListener("change", () => {
    state.filters.tournament = elements.tournamentFilter.value;
    state.page = 1;
    updateView();
  });
  elements.stageFilter.addEventListener("change", () => {
    state.filters.stage = elements.stageFilter.value;
    state.page = 1;
    updateView();
  });

  const toggleFilterMenu = (open) => {
    if (open) {
      elements.filterMenu.hidden = false;
      elements.filterBackdrop.hidden = false;
      // Slight delay for animation
      requestAnimationFrame(() => {
        elements.filterMenu.removeAttribute("hidden");
        elements.filterBackdrop.style.opacity = "1";
      });
    } else {
      elements.filterMenu.setAttribute("hidden", "");
      elements.filterBackdrop.style.opacity = "0";
      setTimeout(() => {
        elements.filterMenu.hidden = true;
        elements.filterBackdrop.hidden = true;
      }, 300);
    }
  };

  elements.filterToggle.addEventListener("click", () => toggleFilterMenu(true));
  elements.filterClose.addEventListener("click", () => toggleFilterMenu(false));
  elements.filterBackdrop.addEventListener("click", () => toggleFilterMenu(false));

  elements.filterReset.addEventListener("click", () => {
    state.filters.year = "all";
    state.filters.tournament = "all";
    state.filters.stage = "all";
    state.filters.search = "";
    state.filters.otOnly = false;
    state.filters.tightOnly = false;
    elements.yearFilter.value = "all";
    elements.tournamentFilter.value = "all";
    elements.stageFilter.value = "all";
    elements.searchFilter.value = "";
    elements.otToggle.checked = false;
    elements.tightToggle.checked = false;
    state.page = 1;
    updateView();
  });

  elements.sortFilter.addEventListener("change", () => {
    state.sort = elements.sortFilter.value;
    state.page = 1;
    updateView();
  });
  elements.otToggle.addEventListener("change", () => {
    state.filters.otOnly = elements.otToggle.checked;
    state.page = 1;
    updateView();
  });
  elements.tightToggle.addEventListener("change", () => {
    state.filters.tightOnly = elements.tightToggle.checked;
    state.page = 1;
    updateView();
  });
  elements.searchFilter.addEventListener(
    "input",
    debounce(() => {
      state.filters.search = elements.searchFilter.value;
      state.page = 1;
      updateView();
    }, 150)
  );
  elements.pageSize.addEventListener("change", () => {
    state.perPage = Number(elements.pageSize.value);
    state.page = 1;
    updateView();
  });
}

function initPagination() {
  const scrollToTable = () => {
    const matchesCard = document.querySelector(".matches-card");
    if (matchesCard) {
      matchesCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  const goPrev = () => {
    if (state.page > 1) {
      state.page -= 1;
      updateView();
      scrollToTable();
    }
  };
  const goNext = () => {
    const totalPages = Math.max(1, Math.ceil(state.filteredMatches.length / state.perPage));
    if (state.page < totalPages) {
      state.page += 1;
      updateView();
      scrollToTable();
    }
  };
  elements.prevPage.addEventListener("click", goPrev);
  elements.nextPage.addEventListener("click", goNext);
  elements.prevPageBottom.addEventListener("click", goPrev);
  elements.nextPageBottom.addEventListener("click", goNext);
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setStageTab(tab.dataset.stage);
    });
  });
}

function initTableDetails() {
  elements.matchesBody.addEventListener("click", (event) => {
    const button = event.target.closest(".expand-btn");
    if (!button) return;
    const rowId = button.dataset.row;
    const detailRow = document.getElementById(`detail-${rowId}`);
    if (!detailRow) return;
    const isOpen = !detailRow.hidden;
    detailRow.hidden = isOpen;
    button.textContent = isOpen ? "+" : "-";
  });
}

async function loadPlayers() {
  setStatus("Loading players...");
  const payload = await fetchJson("data/players.json");
  if (!payload) {
    setStatus("Players not found.");
    return;
  }
  state.players = payload.filter((player) => player.name && player.name.trim());
  state.players.forEach((player) => state.playersById.set(player.id, player));
  try {
    const aliasesPayload = (await fetchJson("aliases.json")) || (await fetchJson("data/aliases.json"));
    if (aliasesPayload) {
      const groups = Array.isArray(aliasesPayload)
        ? aliasesPayload
        : Array.isArray(aliasesPayload.groups)
          ? aliasesPayload.groups
          : [];
      groups.forEach((group) => {
        const ids = Array.isArray(group) ? group : group && Array.isArray(group.ids) ? group.ids : [];
        const normalized = normalizeAliasIds(ids);
        if (normalized.length < 2) return;
        normalized.forEach((id) => {
          state.aliasMap.set(id, normalized);
        });
      });
    }
  } catch (err) {
    // ignore alias load errors
  }
  setStatus("Ready.");
}

async function init() {
  const savedTheme = safeStorageGet(STORAGE_KEYS.theme, "light");
  if (savedTheme === "dark") {
    setTheme("dark");
  }

  elements.themeToggle.addEventListener("click", toggleTheme);
  initInfoPopovers();

  const typeaheadA = setupTypeahead(elements.playerA, elements.listA);
  const typeaheadB = setupTypeahead(elements.playerB, elements.listB, { forPlayerB: true });

  document.querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.clear === "a" ? elements.playerA : elements.playerB;
      const list = button.dataset.clear === "a" ? elements.listA : elements.listB;
      clearInputPlayer(target, list);
      if (button.dataset.clear === "a") {
        clearInputPlayer(elements.playerB, elements.listB);
        state.opponentsOfA = new Map();
        elements.playerB.disabled = true;
        elements.playerB.placeholder = "Select Player 1 first";
      }
    });
  });

  elements.compareBtn.addEventListener("click", handleCompare);
  elements.swapBtn.addEventListener("click", handleSwap);
  elements.copyLinkBtn.addEventListener("click", handleCopyLink);
  elements.recentList.addEventListener("click", handleRecentClick);

  initFilters();
  initPagination();
  initTabs();
  initTableDetails();

  await loadPlayers();
  renderRecent();

  const urlSelection = getUrlSelection();
  const lastSelection = safeStorageGet(STORAGE_KEYS.last, null);
  const selection = urlSelection || lastSelection;
  if (selection) {
    const player1 = getPlayerById(selection.p1) || { id: selection.p1, name: `Player ${selection.p1}` };
    const player2 = getPlayerById(selection.p2) || { id: selection.p2, name: `Player ${selection.p2}` };
    setInputPlayer(elements.playerA, player1);
    elements.playerB.disabled = false;
    await loadOpponentsForPlayer(selection.p1);
    setInputPlayer(elements.playerB, player2);
    handleCompare();
  }
}

init();
