import { state, elements } from "./state.js";
import {
  normalizeText,
  toNumber,
  debounce,
} from "./utils.js";
import {
  getPlayerById,
  resolvePlayerId,
  clearInputPlayer,
  setInputPlayer,
  getCountryFlag,
  formatWorldRank,
  formatRankingTitle,
  formatPlayerMeta,
  getWorldRank,
  updatePrimaryActionLabel,
} from "./players.js";

export function withGroupedDuplicateSuggestions(items) {
  const byName = new Map();
  items.forEach((player) => {
    const key = normalizeText(player.name);
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(player);
  });

  const usedGroups = new Set();
  const output = [];
  items.forEach((player) => {
    const key = normalizeText(player.name);
    const group = byName.get(key) || [];
    if (group.length < 2) {
      output.push(player);
      return;
    }
    if (usedGroups.has(key)) return;
    usedGroups.add(key);
    const ids = normalizeAliasIds(group.map((item) => item.id));
    const countries = new Set(group.map((item) => item.country).filter(Boolean));
    const totalMatches = group.reduce((sum, item) => sum + toNumber(item.totalMatches, 0), 0);
    output.push({
      ...group[0],
      ids,
      isGroup: true,
      country: countries.size === 1 ? group[0].country : "",
      totalMatches: totalMatches || null,
    });
    output.push(...group);
  });
  return output;
}

// Helper needed by withGroupedDuplicateSuggestions
function normalizeAliasIds(ids) {
  const unique = Array.from(
    new Set(
      (ids || [])
        .filter((value) => value != null && String(value).trim() !== "")
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
    )
  );
  unique.sort((a, b) => a - b);
  return unique;
}

export function buildSuggestions(query) {
  const value = normalizeText(query);
  let results = [];
  if (value.length < 2) {
    results = [...state.players];
  } else {
    for (const player of state.players) {
      if (!player.name) continue;
      if (player.search_key && player.search_key.includes(value)) {
        results.push(player);
      }
    }
  }

  results.sort((a, b) => {
    const rA = getWorldRank(a);
    const rB = getWorldRank(b);
    if (rA !== null && rB !== null) return rA - rB;
    if (rA !== null) return -1;
    if (rB !== null) return 1;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, 20);
}

export function buildOpponentSuggestions(query) {
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

export function createSuggestionIdentity(player) {
  const identity = document.createElement("span");
  identity.className = player.isGroup ? "typeahead-player typeahead-player--group" : "typeahead-player";

  const flag = getCountryFlag(player.country);
  if (flag) {
    const flagEl = document.createElement("span");
    flagEl.className = "typeahead-flag";
    flagEl.textContent = flag;
    flagEl.title = player.country;
    flagEl.setAttribute("aria-label", player.country);
    identity.appendChild(flagEl);
  }

  const name = document.createElement("span");
  name.className = "typeahead-name";
  name.textContent = player.name;
  identity.appendChild(name);

  if (player.isGroup) {
    const groupLabel = document.createElement("span");
    groupLabel.className = "typeahead-group-label";
    groupLabel.textContent = "grouped";
    identity.appendChild(groupLabel);
  }

  return identity;
}

export function setupTypeahead(inputEl, listEl, options = {}) {
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
    currentItems = items.some((item) => item.isGroup) ? items : withGroupedDuplicateSuggestions(items);
    const fragment = document.createDocumentFragment();
    currentItems.forEach((player, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.id = player.id;
      if (player.ids?.length > 1) btn.dataset.ids = player.ids.join(",");
      btn.dataset.index = idx;
      btn.appendChild(createSuggestionIdentity(player));
      if (player.isGroup) {
        const groupMeta = document.createElement("span");
        groupMeta.className = "game-count";
        const games = isPlayerB && player.totalMatches != null
          ? ` · ${player.totalMatches} game${player.totalMatches !== 1 ? "s" : ""}`
          : "";
        groupMeta.textContent = `${player.ids.length} IDs${games}`;
        btn.appendChild(groupMeta);
      } else if (isPlayerB && player.totalMatches != null) {
        const count = document.createElement("span");
        count.className = "game-count";
        const rank = formatWorldRank(player);
        count.textContent = `${player.totalMatches} game${player.totalMatches !== 1 ? "s" : ""}${rank ? ` · ${rank}` : ""}`;
        count.title = formatRankingTitle(player);
        btn.appendChild(count);
      } else {
        const playerMeta = formatPlayerMeta(player);
        if (playerMeta) {
          const meta = document.createElement("span");
          meta.className = "muted";
          meta.textContent = playerMeta;
          meta.title = formatRankingTitle(player);
          btn.appendChild(meta);
        }
      }
      if (idx === activeIndex) {
        btn.classList.add("is-active");
      }
      fragment.appendChild(btn);
    });
    listEl.appendChild(fragment);
    openList();
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
    inputEl.dataset.playerIds = "";
    inputEl.dataset.playerName = "";
    updatePrimaryActionLabel();
    if (isPlayerB) {
      if (options.onReset) options.onReset();
    } else {
      clearInputPlayer(elements.playerB, elements.listB);
      state.opponentsOfA = new Map();
      elements.playerB.disabled = true;
      elements.playerB.placeholder = "Select Player 1 first";
      if (options.onReset) options.onReset();
    }
    debouncedUpdate();
  });

  inputEl.addEventListener("focus", () => {
    if (!isPlayerB || (state.opponentsOfA.size && !inputEl.dataset.playerId)) {
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
        if (!isPlayerB && options.onPlayerSelect) {
          options.onPlayerSelect(selected);
        }
        if (isPlayerB && options.onCompare) {
          options.onCompare();
        }
      }
    } else if (event.key === "Escape") {
      closeList();
    }
  });

  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !listEl.classList.contains("is-open")) {
      if (options.onCompare) options.onCompare();
    }
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const player = currentItems[Number(button.dataset.index)] || getPlayerById(Number(button.dataset.id));
    if (player) {
      setInputPlayer(inputEl, player);
      closeList();
      if (!isPlayerB && options.onPlayerSelect) {
        options.onPlayerSelect(player);
      }
      if (isPlayerB && options.onCompare) {
        options.onCompare();
      }
    }
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(closeList, 150);
  });

  return { closeList, renderList, updateList };
}
