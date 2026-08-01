import { state, elements } from "./state.js";
import {
  normalizeText,
  decodeHtmlEntities,
  toNumber,
  normalizeTournamentLevel,
  parseOvertime,
  normalizeStageType,
  normalizeStageName,
} from "./utils.js";
import {
  normalizePlayerRecord,
  getEffectiveAliasGroup,
  getAliasGroup,
  getPlayerById,
  normalizeAliasIds,
  resolvePlayerId,
  parseIdList,
} from "./players.js";

function setBoundedCache(cache, key, value, maxEntries = 12) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    cache.delete(cache.keys().next().value);
  }
}

export async function fetchJson(url, timeoutMs = 20000, externalSignal = null) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) {
      const error = new Error(`Failed to fetch ${url} (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      if (timedOut) throw new Error(`Timed out loading ${url}`);
      throw err;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function fetchPairPayload(id1, id2, onProgress, signal = null) {
  const payload = await fetchJson(`data/h2h/${id1}/${id2}.json`, 20000, signal);
  if (!payload) return null;
  const normalizedPlayers = {
    player1: normalizePlayerRecord(payload.player1),
    player2: normalizePlayerRecord(payload.player2),
  };
  if (payload.chunks && Array.isArray(payload.chunks)) {
    const matches = [];
    for (let i = 0; i < payload.chunks.length; i += 1) {
      const chunkPath = payload.chunks[i];
      const chunkUrl = chunkPath.startsWith("data/") ? chunkPath : `data/${chunkPath}`;
      if (onProgress) {
        onProgress(i + 1, payload.chunks.length);
      }
      const chunkPayload = await fetchJson(chunkUrl, 20000, signal);
      if (!chunkPayload) {
        throw new Error(`Missing chunk ${chunkUrl}`);
      }
      if (Array.isArray(chunkPayload.matches)) {
        matches.push(...chunkPayload.matches);
      }
    }
    return { ...payload, ...normalizedPlayers, matches };
  }
  return { ...payload, ...normalizedPlayers };
}

export async function fetchPlayerPayload(playerId, signal = null) {
  if (state.playerFileCache.has(playerId)) {
    return state.playerFileCache.get(playerId);
  }
  const existingRequest = state.playerFileRequests.get(playerId);
  if (existingRequest && !existingRequest.signal?.aborted) {
    return existingRequest.promise;
  }
  if (existingRequest) {
    state.playerFileRequests.delete(playerId);
  }
  const request = (async () => {
    const payload = await fetchJson(`data/h2h/${playerId}.json`, 20000, signal);
    if (!payload) return null;
    const normalizedPayload = {
      ...payload,
      player: normalizePlayerRecord(payload.player),
    };
    setBoundedCache(state.playerFileCache, playerId, normalizedPayload);
    return normalizedPayload;
  })();
  const requestEntry = { promise: request, signal };
  state.playerFileRequests.set(playerId, requestEntry);
  try {
    return await request;
  } finally {
    if (state.playerFileRequests.get(playerId) === requestEntry) {
      state.playerFileRequests.delete(playerId);
    }
  }
}

export function normalizeMatchBase(raw) {
  const date = raw.date || raw.Date || "";
  const ts = Date.parse(date);
  const stage = decodeHtmlEntities(raw.stage || raw.Stage || "");
  const tournamentName = decodeHtmlEntities(raw.tournament_name || raw.TournamentName || "");
  const tournamentId = raw.tournament_id ?? raw.TournamentID ?? null;
  const tournamentLevel = normalizeTournamentLevel(
    raw.tournament_level ?? raw.TournamentLevel ?? raw.Level ?? null
  );
  const stageId = raw.stage_id ?? raw.StageID ?? null;
  const stageSequence = raw.stage_sequence ?? raw.StageSequence ?? null;
  const roundNumber = raw.round_number ?? raw.RoundNumber ?? null;
  const playoffGameNumber = raw.playoff_game_number ?? raw.PlayoffGameNumber ?? null;
  const source = decodeHtmlEntities(raw.source || raw.Source || "");
  const sourceUrl = decodeHtmlEntities(raw.source_url || raw.SourceURL || "");
  const stageUrl = decodeHtmlEntities(raw.stage_url || raw.StageURL || "");
  const resultUrl = decodeHtmlEntities(raw.result_url || raw.ResultURL || "");
  const tournamentUrl = decodeHtmlEntities(raw.tournament_url || raw.TournamentURL || "");
  const sourceTournamentId = raw.source_tournament_id ?? raw.SourceTournamentID ?? "";
  const sourceStageId = raw.source_stage_id ?? raw.SourceStageID ?? "";
  const sourceMatchId = raw.source_match_id ?? raw.SourceMatchID ?? "";

  const stageType = normalizeStageType(raw.stage_type ?? raw.StageType ?? "", stage, tournamentName);
  const displayStage = normalizeStageName(stage, stageType);

  return {
    date,
    ts: Number.isFinite(ts) ? ts : 0,
    year: date ? date.slice(0, 4) : "",
    tournament_name: tournamentName,
    tournament_id: tournamentId !== null ? Number(tournamentId) : null,
    tournament_key: tournamentId != null ? `id:${tournamentId}` : `name:${tournamentName || "unknown"}`,
    tournament_level: tournamentLevel,
    stage: displayStage,
    stage_type: stageType,
    stage_id: stageId != null ? Number(stageId) : null,
    stage_sequence: stageSequence != null ? Number(stageSequence) : null,
    round_number: roundNumber != null ? Number(roundNumber) : null,
    playoff_game_number: playoffGameNumber != null ? Number(playoffGameNumber) : null,
    source,
    source_url: sourceUrl,
    stage_url: stageUrl,
    result_url: resultUrl,
    tournament_url: tournamentUrl,
    source_tournament_id: sourceTournamentId != null ? String(sourceTournamentId) : "",
    source_stage_id: sourceStageId != null ? String(sourceStageId) : "",
    source_match_id: sourceMatchId != null ? String(sourceMatchId) : "",
  };
}

export function finishMatchNormalization(raw, goalsA, goalsB) {
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

export function normalizePairMatch(raw, aIsId1) {
  const goalsId1 = toNumber(
    raw.goals_id1 ?? raw.goals_for_id1 ?? raw.goalsPlayer1 ?? raw.goals_player1 ?? raw.goals_player ?? 0
  );
  const goalsId2 = toNumber(
    raw.goals_id2 ?? raw.goals_for_id2 ?? raw.goalsPlayer2 ?? raw.goals_player2 ?? raw.goals_opponent ?? 0
  );
  return finishMatchNormalization(raw, aIsId1 ? goalsId1 : goalsId2, aIsId1 ? goalsId2 : goalsId1);
}

export function normalizePlayerMatch(raw, isPlayerA) {
  const goalsFor = toNumber(raw.goals_for_player ?? raw.goals_player ?? raw.goals_id1 ?? 0);
  const goalsOpp = toNumber(raw.goals_for_opponent ?? raw.goals_opponent ?? raw.goals_id2 ?? 0);
  return finishMatchNormalization(raw, isPlayerA ? goalsFor : goalsOpp, isPlayerA ? goalsOpp : goalsFor);
}

export function normalizeSinglePlayerMatch(raw, opponentId, opponentPlayer) {
  const normalized = normalizePlayerMatch(raw, true);
  const fallbackName = opponentId ? `Player ${opponentId}` : "Unknown opponent";
  return {
    ...normalized,
    opponent_id: opponentId ?? null,
    opponent_name: decodeHtmlEntities(opponentPlayer?.name || getPlayerById(opponentId)?.name || fallbackName),
  };
}

export function buildMatchKey(match) {
  const stableSourceId = match.source_match_id
    ? `${match.source || ""}|${match.source_tournament_id || ""}|${match.source_stage_id || ""}|${match.source_match_id}`
    : "";
  if (stableSourceId) return stableSourceId;
  return [
    match.date || "",
    match.tournament_id ?? match.tournament_name ?? "",
    match.stage_id ?? match.stage ?? "",
    match.stage_type || "",
    match.stage_sequence ?? "",
    match.round_number ?? "",
    match.playoff_game_number ?? "",
    match.goals_a ?? "",
    match.goals_b ?? "",
    match.overtime ? 1 : 0,
  ].join("|");
}

export function buildScopedMatchKey(match) {
  return `${match.opponent_id ?? ""}|${buildMatchKey(match)}`;
}

export async function buildGroupMatches(groupA, groupB, onProgress, signal = null) {
  const matches = [];
  const seen = new Set();
  const opponentIds = groupB.map((id) => String(id));

  for (let i = 0; i < groupA.length; i += 1) {
    const playerId = groupA[i];
    if (onProgress) {
      onProgress(i + 1, groupA.length);
    }
    const payload = await fetchPlayerPayload(playerId, signal);
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

export async function loadPlayerStats(
  playerId,
  onProgress,
  explicitIds = [],
  signal = null
) {
  const groupA = getEffectiveAliasGroup(playerId, explicitIds);
  const cacheKey = groupA.join(",");
  if (state.playerStatsCache.has(cacheKey)) {
    return state.playerStatsCache.get(cacheKey);
  }

  const selfIds = new Set(groupA.map((id) => Number(id)));
  const matches = [];
  const seen = new Set();
  let playerA = getPlayerById(playerId) || { id: playerId, name: `Player ${playerId}` };

  for (let index = 0; index < groupA.length; index += 1) {
    const groupId = groupA[index];
    if (onProgress) onProgress(index + 1, groupA.length);
    const payload = await fetchPlayerPayload(groupId, signal);
    if (!payload || !payload.opponents) continue;
    if (!playerA?.name && payload.player) playerA = payload.player;

    Object.entries(payload.opponents).forEach(([opponentIdRaw, opponentPayload]) => {
      const opponentId = Number(opponentIdRaw);
      if (!Number.isFinite(opponentId) || selfIds.has(opponentId)) return;
      if (!opponentPayload || !Array.isArray(opponentPayload.matches)) return;
      const opponentPlayer = opponentPayload.player || getPlayerById(opponentId);

      opponentPayload.matches.forEach((match) => {
        const normalized = normalizeSinglePlayerMatch(match, opponentId, opponentPlayer);
        const key = buildScopedMatchKey(normalized);
        if (seen.has(key)) return;
        seen.add(key);
        matches.push(normalized);
      });
    });
  }

  const data = {
    playerA,
    playerB: { id: null, name: "Opponents" },
    matches,
  };
  setBoundedCache(state.playerStatsCache, cacheKey, data, 6);
  return data;
}

export async function loadMatchup(
  p1,
  p2,
  onProgress,
  explicitIdsA = [],
  explicitIdsB = [],
  signal = null
) {
  const groupA = getEffectiveAliasGroup(p1, explicitIdsA);
  const groupB = getEffectiveAliasGroup(p2, explicitIdsB);
  const cacheKey = `${groupA.join(",")}-${groupB.join(",")}`;
  if (state.pairCache.has(cacheKey)) {
    return state.pairCache.get(cacheKey);
  }

  if (groupA.length > 1 || groupB.length > 1) {
    const matches = await buildGroupMatches(groupA, groupB, onProgress, signal);
    const playerA = getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
    const playerB = getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
    const data = { playerA, playerB, matches };
    setBoundedCache(state.pairCache, cacheKey, data, 20);
    return data;
  }

  // The build emits player-centric files, so start with p1 instead of making
  // a guaranteed 404 request for a legacy pair-centric path.
  const playerPayload = await fetchPlayerPayload(p1, signal);
  if (playerPayload && playerPayload.opponents) {
    const opponent = playerPayload.opponents[String(p2)];
    if (opponent) {
      const playerA = playerPayload.player || getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
      const playerB = opponent.player || getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
      const matches = Array.isArray(opponent.matches)
        ? opponent.matches.map((match) => normalizePlayerMatch(match, true))
        : [];
      const data = { playerA, playerB, matches };
      setBoundedCache(state.pairCache, cacheKey, data, 20);
      return data;
    }
  }

  const otherPayload = await fetchPlayerPayload(p2, signal);
  if (otherPayload && otherPayload.opponents) {
    const opponent = otherPayload.opponents[String(p1)];
    if (opponent) {
      const playerA = getPlayerById(p1) || { id: p1, name: `Player ${p1}` };
      const playerB = otherPayload.player || getPlayerById(p2) || { id: p2, name: `Player ${p2}` };
      const matches = Array.isArray(opponent.matches)
        ? opponent.matches.map((match) => normalizePlayerMatch(match, false))
        : [];
      const data = { playerA, playerB, matches };
      setBoundedCache(state.pairCache, cacheKey, data, 20);
      return data;
    }
  }

  return null;
}

let opponentsRequestToken = 0;

export function cancelOpponentLoading() {
  opponentsRequestToken += 1;
  state.opponentsLoading = false;
  if (elements.playerBLoader) elements.playerBLoader.hidden = true;
  if (elements.playerB) elements.playerB.removeAttribute("aria-busy");
}

export async function loadOpponentsForPlayer(playerId, explicitIds = [], signal = null) {
  opponentsRequestToken += 1;
  const currentToken = opponentsRequestToken;
  state.opponentsLoading = true;
  elements.playerBLoader.hidden = false;
  elements.playerB.disabled = true;
  elements.playerB.setAttribute("aria-busy", "true");
  elements.playerB.placeholder = "Loading opponents...";

  try {
    const groupIds = getEffectiveAliasGroup(playerId, explicitIds);
    const opponentMap = new Map();

    for (const gId of groupIds) {
      const payload = await fetchPlayerPayload(gId, signal);
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
    const selfGroup = getEffectiveAliasGroup(playerId, explicitIds);
    for (const selfId of selfGroup) {
      expandedMap.delete(selfId);
    }

    if (currentToken !== opponentsRequestToken) return false;
    state.opponentsOfA = expandedMap;
    elements.playerB.placeholder = "Search opponent";
    elements.playerB.disabled = false;
    return true;
  } catch (err) {
    if (currentToken !== opponentsRequestToken) return false;
    console.error("Failed to load opponents:", err);
    state.opponentsOfA = new Map();
    elements.playerB.placeholder = "Could not load opponents";
    elements.playerB.disabled = true;
    return false;
  } finally {
    if (currentToken === opponentsRequestToken) {
      state.opponentsLoading = false;
      elements.playerBLoader.hidden = true;
      elements.playerB.removeAttribute("aria-busy");
    }
  }
}
