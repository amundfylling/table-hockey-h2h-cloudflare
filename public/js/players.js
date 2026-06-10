import { state, elements } from "./state.js";
import { normalizeText, decodeHtmlEntities, toNumber } from "./utils.js";
import { COUNTRY_FLAGS } from "./constants.js";

export function normalizePlayerRecord(player) {
  if (!player) return null;
  const name = decodeHtmlEntities(player.name);
  return {
    ...player,
    name,
    country: decodeHtmlEntities(player.country),
    city: decodeHtmlEntities(player.city),
    search_key: normalizeText(name),
  };
}

export function getCountryFlag(country) {
  return COUNTRY_FLAGS.get(normalizeText(country)) || "";
}

export function getPlayerById(id) {
  return state.playersById.get(id) || null;
}

export function getAliasGroup(id) {
  const group = state.aliasMap.get(id);
  if (group && group.length) {
    return group;
  }
  return [id];
}

export function normalizeAliasIds(ids) {
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

export function expandAliasIds(ids) {
  const expanded = [];
  normalizeAliasIds(ids).forEach((id) => {
    expanded.push(...getAliasGroup(id));
  });
  return normalizeAliasIds(expanded);
}

export function getEffectiveAliasGroup(primaryId, explicitIds = []) {
  const ids = normalizeAliasIds(explicitIds);
  if (ids.length > 1) return expandAliasIds(ids);
  return getAliasGroup(primaryId);
}

export function parseIdList(value) {
  return normalizeAliasIds(String(value || "").split(","));
}

export function getSelectionIds(inputEl) {
  const explicit = parseIdList(inputEl.dataset.playerIds);
  if (explicit.length) return explicit;
  const id = resolvePlayerId(inputEl);
  return id ? [id] : [];
}

export function getSelectionPlayer(inputEl, fallbackId) {
  const id = resolvePlayerId(inputEl) || fallbackId;
  const player = getPlayerById(id) || { id, name: `Player ${id}` };
  const name = inputEl.dataset.playerName || player.name;
  return { ...player, id, name };
}

export function setInputPlayer(inputEl, player) {
  if (!player) return;
  const primaryId = Number(player.id);
  const ids = normalizeAliasIds([primaryId, ...(player.ids || [])]);
  const id = Number.isFinite(primaryId) ? primaryId : ids[0];
  const name = decodeHtmlEntities(player.name);
  inputEl.value = ids.length > 1 ? `${name} (${ids.length} IDs)` : `${name} (${id})`;
  inputEl.dataset.playerId = id;
  inputEl.dataset.playerIds = ids.length > 1 ? ids.join(",") : "";
  inputEl.dataset.playerName = name;
  updatePrimaryActionLabel();
  updateSelectionControls();
}

export function clearInputPlayer(inputEl, listEl) {
  inputEl.value = "";
  inputEl.dataset.playerId = "";
  inputEl.dataset.playerIds = "";
  inputEl.dataset.playerName = "";
  listEl.classList.remove("is-open");
  listEl.innerHTML = "";
  updatePrimaryActionLabel();
  updateSelectionControls();
}

export function resolvePlayerId(inputEl) {
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

export function enrichPlayerRecord(player) {
  if (!player?.id) return player;
  const fullRecord = getPlayerById(Number(player.id));
  return fullRecord ? { ...fullRecord, ...player } : player;
}

export function getWorldRank(player) {
  const rank = Number(player?.world_rank);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

export function formatWorldRank(player) {
  const rank = getWorldRank(enrichPlayerRecord(player));
  return rank ? `WR #${rank}` : "";
}

export function formatPlayerMeta(player) {
  return formatWorldRank(player);
}

export function formatRankingTitle(player) {
  const enriched = enrichPlayerRecord(player);
  const rank = formatWorldRank(enriched);
  if (!rank) return "";
  const parts = [rank];
  if (enriched.ranking_points != null) parts.push(`${enriched.ranking_points} points`);
  if (enriched.ranking_as_of) parts.push(`as of ${enriched.ranking_as_of}`);
  return parts.join(" · ");
}

export function hasInputValue(inputEl) {
  return Boolean(inputEl?.value?.trim() || inputEl?.dataset?.playerId);
}

export function updatePrimaryActionLabel() {
  if (!elements.compareBtn) return;
  elements.compareBtn.textContent = resolvePlayerId(elements.playerB) ? "Compare" : "Display";
  if (elements.swapBtn) {
    elements.swapBtn.disabled = !resolvePlayerId(elements.playerB);
  }
  updateSelectionControls();
}

export function updateSelectionControls() {
  document.querySelectorAll("[data-clear]").forEach((button) => {
    const input = button.dataset.clear === "a" ? elements.playerA : elements.playerB;
    const hasValue = hasInputValue(input);
    button.hidden = !hasValue;
    button.disabled = !hasValue;
  });
  if (elements.copyLinkBtn) {
    elements.copyLinkBtn.disabled = !resolvePlayerId(elements.playerA);
  }
}
