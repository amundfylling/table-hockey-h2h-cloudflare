import { buildScopedMatchKey } from "./data.js";
import { getSeriesGroupKey, createSeriesFromMatches } from "./series.js";
import { toNumber } from "./utils.js";

// Playing order: date, then stage, round and playoff game within the day.
export function compareMatchOrder(a, b) {
  return (
    toNumber(a.ts, 0) - toNumber(b.ts, 0) ||
    toNumber(a.stage_sequence, 0) - toNumber(b.stage_sequence, 0) ||
    toNumber(a.round_number, 0) - toNumber(b.round_number, 0) ||
    toNumber(a.playoff_game_number, 0) - toNumber(b.playoff_game_number, 0)
  );
}

export function gameShortLabel(match) {
  if (match.playoff_game_number != null) return `G${match.playoff_game_number}`;
  if (match.round_number != null) return `R${match.round_number}`;
  return "–";
}

function toTile(game, currentKey) {
  return {
    label: gameShortLabel(game),
    goalsA: game.goals_a,
    goalsB: game.goals_b,
    result: game.result,
    overtime: Boolean(game.overtime),
    isCurrent: buildScopedMatchKey(game) === currentKey,
  };
}

// Everything the expanded game row shows beyond the row itself. `allMatches` is the
// unfiltered list for the matchup; in single-player mode pass only this opponent's games.
export function buildGameContext(match, allMatches) {
  const currentKey = buildScopedMatchKey(match);
  const ordered = [...allMatches].sort(compareMatchOrder);
  const index = ordered.findIndex((game) => buildScopedMatchKey(game) === currentKey);
  if (index === -1) return null;

  let series = null;
  let tournament = null;
  let group = [];

  if (match.stage_type === "playoff") {
    const seriesKey = getSeriesGroupKey(match);
    group = ordered.filter((game) => game.stage_type === "playoff" && getSeriesGroupKey(game) === seriesKey);
    if (group.length > 1) {
      const summary = createSeriesFromMatches(group);
      const position = group.findIndex((game) => buildScopedMatchKey(game) === currentKey);
      const last = group[group.length - 1];
      series = {
        tiles: group.map((game) => toTile(game, currentKey)),
        winsA: summary.game_wins_a,
        winsB: summary.game_wins_b,
        result: summary.result,
        gameNumber: position + 1,
        totalGames: group.length,
        clinched: buildScopedMatchKey(last) === currentKey && summary.result === match.result,
      };
    } else {
      group = [];
    }
  }

  if (!series) {
    const tournamentGames = ordered.filter((game) => game.tournament_key === match.tournament_key);
    if (tournamentGames.length > 1) {
      group = tournamentGames;
      tournament = { tiles: tournamentGames.map((game) => toTile(game, currentKey)) };
    }
  }

  const recordAfter = { winsA: 0, winsB: 0, draws: 0 };
  ordered.slice(0, index + 1).forEach((game) => {
    if (game.result === "A") recordAfter.winsA += 1;
    else if (game.result === "B") recordAfter.winsB += 1;
    else recordAfter.draws += 1;
  });

  const groupKeys = new Set(group.map(buildScopedMatchKey));
  let previous = null;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (groupKeys.has(buildScopedMatchKey(ordered[i]))) continue;
    previous = { match: ordered[i], sameDay: ordered[i].date === match.date };
    break;
  }

  return {
    series,
    tournament,
    recordAfter,
    previous,
    meetingNumber: index + 1,
    totalMeetings: ordered.length,
  };
}
