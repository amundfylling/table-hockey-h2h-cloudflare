import {
  state,
  elements,
  STORAGE_KEYS,
  safeStorageGet,
  safeStorageSet,
} from "./state.js";
import {
  normalizeAliasIds,
  setInputPlayer,
  getPlayerById,
  getWorldRank,
  parseIdList,
  selectionsShareIdentity,
} from "./players.js";
import { decodeHtmlEntities } from "./utils.js";
import { loadOpponentsForPlayer } from "./data.js";

let onCompareCallback = () => {};
let getRequestSignal = () => null;

// Wire the "compare" action without importing main.js (avoids an import cycle),
// matching the initTable(updateView) / initFilters(updateView) pattern.
export function initRecent({ onCompare, getSignal } = {}) {
  onCompareCallback = onCompare || (() => {});
  getRequestSignal = getSignal || (() => null);
}

function createMatchupChip(p1Id, p2Id, p1Name, p2Name, p1Ids, p2Ids) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${decodeHtmlEntities(p1Name)} vs ${decodeHtmlEntities(p2Name)}`;
  button.dataset.p1 = p1Id;
  button.dataset.p2 = p2Id;
  if (p1Ids?.length > 1) button.dataset.p1Ids = p1Ids.join(",");
  if (p2Ids?.length > 1) button.dataset.p2Ids = p2Ids.join(",");
  return button;
}

function getAliasIds(playerId) {
  return state.aliasMap.get(playerId) || [playerId];
}

function getValidatedAliasIds(playerId, values = []) {
  const allowed = new Set(getAliasIds(playerId));
  const requested = normalizeAliasIds([playerId, ...(Array.isArray(values) ? values : [])]);
  return requested.length && requested.every((id) => allowed.has(id)) ? requested : [playerId];
}

export function renderRecent() {
  const storedRecent = safeStorageGet(STORAGE_KEYS.recent, []);
  const recent = (Array.isArray(storedRecent) ? storedRecent : [])
    .filter((item) => state.playersById.has(Number(item?.p1Id))
      && state.playersById.has(Number(item?.p2Id))
      && !selectionsShareIdentity(
        getValidatedAliasIds(Number(item.p1Id), item.p1Ids),
        getValidatedAliasIds(Number(item.p2Id), item.p2Ids)
      ))
    .slice(0, 5);
  if (!elements.recentList) return;
  elements.recentList.innerHTML = "";
  if (!recent.length) {
    const ranked = state.players
      .filter((player) => player.name && getWorldRank(player) !== null)
      .sort((a, b) => getWorldRank(a) - getWorldRank(b));
    const pairs = [];
    for (const playerA of ranked) {
      if (pairs.flat().some((player) => player.id === playerA.id)) continue;
      const playerB = ranked.find((candidate) => candidate.id !== playerA.id
        && !selectionsShareIdentity(getAliasIds(playerA.id), getAliasIds(candidate.id))
        && !pairs.flat().some((player) => player.id === candidate.id));
      if (!playerB) continue;
      pairs.push([playerA, playerB]);
      if (pairs.length === 2) break;
    }
    if (!pairs.length) {
      elements.recentList.innerHTML = "<span class=\"muted\">No recent matchups</span>";
      return;
    }
    const note = document.createElement("span");
    note.className = "muted recent-note";
    note.textContent = "No recent matchups yet — try:";
    elements.recentList.appendChild(note);
    pairs.forEach(([playerA, playerB]) => {
      elements.recentList.appendChild(
        createMatchupChip(playerA.id, playerB.id, playerA.name, playerB.name, getAliasIds(playerA.id), getAliasIds(playerB.id))
      );
    });
    return;
  }
  const fragment = document.createDocumentFragment();
  recent.forEach((item) => {
    const playerA = getPlayerById(Number(item.p1Id));
    const playerB = getPlayerById(Number(item.p2Id));
    fragment.appendChild(
      createMatchupChip(
        playerA.id,
        playerB.id,
        playerA.name,
        playerB.name,
        getValidatedAliasIds(playerA.id, item.p1Ids),
        getValidatedAliasIds(playerB.id, item.p2Ids)
      )
    );
  });
  elements.recentList.appendChild(fragment);
}

export function addRecent(p1, p2, p1Name, p2Name, p1Ids = [p1], p2Ids = [p2]) {
  const storedRecent = safeStorageGet(STORAGE_KEYS.recent, []);
  const recent = Array.isArray(storedRecent) ? storedRecent : [];
  const filtered = recent.filter((item) => !(item.p1Id === p1 && item.p2Id === p2));
  filtered.unshift({
    p1Id: p1,
    p2Id: p2,
    p1Ids: normalizeAliasIds(p1Ids),
    p2Ids: normalizeAliasIds(p2Ids),
    p1Name,
    p2Name,
    ts: Date.now(),
  });
  safeStorageSet(STORAGE_KEYS.recent, filtered.slice(0, 5));
  renderRecent();
}

export async function handleRecentClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  const p1 = Number(button.dataset.p1);
  const p2 = Number(button.dataset.p2);
  if (!Number.isInteger(p1) || !Number.isInteger(p2)
    || !state.playersById.has(p1) || !state.playersById.has(p2)) return;
  const p1Ids = getValidatedAliasIds(p1, parseIdList(button.dataset.p1Ids || p1));
  const p2Ids = getValidatedAliasIds(p2, parseIdList(button.dataset.p2Ids || p2));
  if (selectionsShareIdentity(p1Ids, p2Ids)) return;
  const player1 = { ...(getPlayerById(p1) || { id: p1, name: `Player ${p1}` }), ids: p1Ids };
  const player2 = { ...(getPlayerById(p2) || { id: p2, name: `Player ${p2}` }), ids: p2Ids };
  setInputPlayer(elements.playerA, player1);
  setInputPlayer(elements.playerB, player2);
  // Start the requested matchup immediately so any older comparison is invalidated.
  const comparePromise = onCompareCallback();
  const opponentsPromise = loadOpponentsForPlayer(p1, p1Ids, getRequestSignal());
  await Promise.all([comparePromise, opponentsPromise]);
}
