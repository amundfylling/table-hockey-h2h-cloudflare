import { state, elements } from "./state.js";
import {
  normalizeText,
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
  getSelectionPlayer,
  updatePrimaryActionLabel,
} from "./players.js";

export function withGroupedDuplicateSuggestions(items) {
  const usedGroups = new Set();
  const output = [];
  items.forEach((player) => {
    const ids = normalizeAliasIds(state.aliasMap.get(Number(player.id)) || []);
    if (ids.length < 2) {
      output.push(player);
      return;
    }
    const key = ids.join(",");
    if (usedGroups.has(key)) return;
    usedGroups.add(key);
    const group = ids.map((id) => getPlayerById(id)).filter(Boolean);
    if (!group.length) {
      output.push(player);
      return;
    }
    const countries = new Set(group.map((item) => item.country).filter(Boolean));
    output.push({
      ...player,
      ids,
      isGroup: true,
      country: countries.size === 1 ? player.country : "",
      totalMatches: player.totalMatches ?? null,
    });
    output.push(...group.map((item) => ({ ...item, inGroup: true })));
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
  if (value.length === 0) {
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

  return withGroupedDuplicateSuggestions(results).slice(0, 20);
}

export function buildOpponentSuggestions(query, opponents = state.opponentsOfA, limit = 20) {
  if (!opponents.size) return [];
  const value = normalizeText(query);
  let results = [];

  for (const [oppId, oppData] of opponents) {
    const player = getPlayerById(oppId);
    if (!player || !player.name) continue;
    if (value.length >= 1) {
      if (!player.search_key || !player.search_key.includes(value)) continue;
    }
    results.push({ ...player, totalMatches: oppData.totalMatches });
  }

  results.sort((a, b) => b.totalMatches - a.totalMatches);
  return withGroupedDuplicateSuggestions(results).slice(0, limit);
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

// The opponent list opens with the first player's career as its top option,
// so the single-player page is visible right where the eye already is.
function careerOptionFor(inputEl) {
  if (inputEl.value.trim()) return null;
  const idA = resolvePlayerId(elements.playerA);
  if (!idA) return null;
  const player = getSelectionPlayer(elements.playerA, idA);
  if (!player?.name) return null;
  return { isCareer: true, id: idA, name: player.name };
}

function createCareerOption(option) {
  const firstName = option.name.trim().split(/\s+/)[0];
  const wrap = document.createElement("span");
  wrap.className = "typeahead-career";
  wrap.innerHTML = `<span class="typeahead-career-icon" aria-hidden="true"><svg viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg></span>`;
  const text = document.createElement("span");
  text.className = "typeahead-career-text";
  const title = document.createElement("span");
  title.className = "typeahead-career-title";
  title.textContent = `${firstName}’s career`;
  const sub = document.createElement("span");
  sub.className = "typeahead-career-sub";
  sub.textContent = "All games, every opponent";
  text.append(title, sub);
  const arrow = document.createElement("span");
  arrow.className = "typeahead-career-go";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  wrap.append(text, arrow);
  return wrap;
}

export function setupTypeahead(inputEl, listEl, options = {}) {
  let activeIndex = -1;
  let currentItems = [];
  let debouncedUpdate = null;
  const isPlayerB = options.forPlayerB || false;
  inputEl.setAttribute("aria-autocomplete", "list");
  inputEl.setAttribute("aria-controls", listEl.id);
  inputEl.setAttribute("aria-expanded", "false");

  const closeList = () => {
    if (debouncedUpdate) debouncedUpdate.cancel();
    listEl.classList.remove("is-open");
    listEl.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
    inputEl.setAttribute("aria-expanded", "false");
    inputEl.removeAttribute("aria-activedescendant");
  };

  const openList = () => {
    listEl.classList.add("is-open");
    inputEl.setAttribute("aria-expanded", "true");
  };

  const renderList = (items) => {
    listEl.innerHTML = "";
    const career = isPlayerB && options.onViewPlayer ? careerOptionFor(inputEl) : null;
    if (career) items = items.filter((item) => !item.isCareer);
    if (isPlayerB && !state.opponentsOfA.size && !state.opponentsLoading) {
      if (!resolvePlayerId(elements.playerA)) {
        const msg = document.createElement("div");
        msg.className = "empty-message";
        msg.textContent = "Pick a player first";
        msg.setAttribute("role", "option");
        msg.setAttribute("aria-disabled", "true");
        listEl.appendChild(msg);
        openList();
        currentItems = [];
        return;
      }
    }
    if (!items.length && !career) {
      if (isPlayerB && resolvePlayerId(elements.playerA)) {
        const msg = document.createElement("div");
        msg.className = "empty-message";
        msg.textContent = state.opponentsLoading
          ? "Loading opponents…"
          : state.opponentsOfA.size
            ? "No matching opponents"
            : "No recorded opponents available";
        msg.setAttribute("role", "option");
        msg.setAttribute("aria-disabled", "true");
        listEl.appendChild(msg);
        openList();
        currentItems = [];
        return;
      }
      closeList();
      return;
    }
    currentItems = items.some((item) => item.isGroup) ? items : withGroupedDuplicateSuggestions(items);
    if (career) currentItems = [career, ...currentItems];
    const fragment = document.createDocumentFragment();
    currentItems.forEach((player, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = `${listEl.id}-option-${idx}`;
      btn.dataset.index = idx;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", idx === activeIndex ? "true" : "false");
      btn.tabIndex = -1;
      if (idx === activeIndex) btn.classList.add("is-active");
      if (player.isCareer) {
        btn.classList.add("typeahead-career-option");
        btn.appendChild(createCareerOption(player));
        fragment.appendChild(btn);
        const heading = document.createElement("div");
        heading.className = "typeahead-heading";
        heading.setAttribute("role", "presentation");
        heading.textContent = state.opponentsLoading
          ? "Loading opponents…"
          : currentItems.length > 1 ? "Or compare with" : "No recorded opponents";
        fragment.appendChild(heading);
        return;
      }
      btn.dataset.id = player.id;
      if (player.ids?.length > 1) btn.dataset.ids = player.ids.join(",");
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
        const playerMeta = player.inGroup ? `#${player.id}` : formatPlayerMeta(player);
        if (playerMeta) {
          const meta = document.createElement("span");
          meta.className = "muted";
          meta.textContent = playerMeta;
          meta.title = formatRankingTitle(player);
          btn.appendChild(meta);
        }
      }
      fragment.appendChild(btn);
    });
    listEl.appendChild(fragment);
    if (activeIndex >= 0) {
      const activeId = `${listEl.id}-option-${activeIndex}`;
      inputEl.setAttribute("aria-activedescendant", activeId);
      const activeOption = listEl.querySelector(`#${activeId}`);
      if (activeOption) activeOption.scrollIntoView({ block: "nearest" });
    } else {
      inputEl.removeAttribute("aria-activedescendant");
    }
    openList();
  };

  const updateList = () => {
    let items;
    if (isPlayerB) {
      items = state.opponentsLoading ? [] : buildOpponentSuggestions(inputEl.value);
    } else {
      items = buildSuggestions(inputEl.value);
    }
    activeIndex = -1;
    renderList(items);
  };

  debouncedUpdate = debounce(updateList, 150);

  inputEl.addEventListener("input", () => {
    inputEl.dataset.playerId = "";
    inputEl.dataset.playerIds = "";
    inputEl.dataset.playerName = "";
    closeList();
    updatePrimaryActionLabel();
    if (isPlayerB) {
      if (options.onReset) options.onReset();
    } else {
      clearInputPlayer(elements.playerB, elements.listB);
      state.opponentsOfA = new Map();
      elements.playerB.disabled = true;
      elements.playerB.placeholder = "Pick a player first";
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
    if (event.key === "Escape") {
      event.preventDefault();
      closeList();
      return;
    }
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
      if (selected?.isCareer) {
        closeList();
        options.onViewPlayer();
        return;
      }
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
    }
  });

  inputEl.addEventListener("keydown", (event) => {
    if (!event.defaultPrevented && event.key === "Enter" && !listEl.classList.contains("is-open")) {
      if (options.onCompare) options.onCompare();
    }
  });

  listEl.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const player = currentItems[Number(button.dataset.index)] || getPlayerById(Number(button.dataset.id));
    if (player?.isCareer) {
      closeList();
      options.onViewPlayer();
      return;
    }
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
