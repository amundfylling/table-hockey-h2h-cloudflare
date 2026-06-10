import { normalizeText } from "./utils.js";
import { buildScopedMatchKey } from "./data.js";

export function getSeriesGroupKey(match) {
  return [
    match.tournament_key || `date:${match.date || ""}`,
    match.stage_id ?? "",
    match.stage_sequence ?? "",
    normalizeText(match.stage || ""),
    match.round_number ?? "",
    match.opponent_id ?? "",
  ].join("|");
}

export function buildPlayoffSeries(matches) {
  const groups = new Map();
  matches
    .filter((match) => match.stage_type === "playoff")
    .forEach((match) => {
      const key = getSeriesGroupKey(match);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(match);
    });

  return Array.from(groups.values())
    .map(createSeriesFromMatches)
    .sort((a, b) => a.ts - b.ts || (a.stage_sequence ?? 0) - (b.stage_sequence ?? 0));
}

export function annotatePlayoffGamesWithSeries(matches) {
  const seriesItems = buildPlayoffSeries(matches);
  const seriesByMatch = new Map();
  seriesItems.forEach((series) => {
    series.games.forEach((match) => {
      seriesByMatch.set(buildScopedMatchKey(match), series.best_of);
    });
  });
  return matches.map((match) => ({
    ...match,
    series_best_of: seriesByMatch.get(buildScopedMatchKey(match)) || null,
  }));
}

export function createSeriesFromMatches(matches) {
  const ordered = [...matches].sort((a, b) => {
    const seqA = a.stage_sequence ?? 0;
    const seqB = b.stage_sequence ?? 0;
    const roundA = a.round_number ?? 0;
    const roundB = b.round_number ?? 0;
    const gameA = a.playoff_game_number ?? 0;
    const gameB = b.playoff_game_number ?? 0;
    return a.ts - b.ts || seqA - seqB || roundA - roundB || gameA - gameB;
  });
  const first = ordered[0] || {};
  const last = ordered[ordered.length - 1] || first;
  const summary = {
    gameWinsA: 0,
    gameWinsB: 0,
    gameDraws: 0,
    goalsA: 0,
    goalsB: 0,
    overtimeGames: 0,
  };

  ordered.forEach((match) => {
    summary.goalsA += match.goals_a;
    summary.goalsB += match.goals_b;
    if (match.result === "A") summary.gameWinsA += 1;
    if (match.result === "B") summary.gameWinsB += 1;
    if (match.result === "D") summary.gameDraws += 1;
    if (match.overtime) summary.overtimeGames += 1;
  });

  const result =
    summary.gameWinsA > summary.gameWinsB
      ? "A"
      : summary.gameWinsB > summary.gameWinsA
        ? "B"
        : "D";
  const maxWins = Math.max(summary.gameWinsA, summary.gameWinsB);
  const bestOf =
    result !== "D" && maxWins > 0
      ? Math.max(maxWins * 2 - 1, ordered.length + (ordered.length % 2 === 0 ? 1 : 0))
      : ordered.length > 1
        ? ordered.length + (ordered.length % 2 === 0 ? 1 : 0)
        : 1;
  const gameDiff = summary.gameWinsA - summary.gameWinsB;

  return {
    type: "series",
    date: first.date || "",
    end_date: last.date || first.date || "",
    ts: first.ts || 0,
    year: first.year || "",
    tournament_name: first.tournament_name || "",
    tournament_id: first.tournament_id ?? null,
    tournament_key: first.tournament_key || "",
    tournament_level: first.tournament_level ?? null,
    source: first.source || "",
    source_url: first.source_url || "",
    stage_url: first.stage_url || "",
    result_url: first.result_url || "",
    tournament_url: first.tournament_url || "",
    source_tournament_id: first.source_tournament_id || "",
    source_stage_id: first.source_stage_id || "",
    source_match_id: first.source_match_id || "",
    opponent_id: first.opponent_id ?? null,
    opponent_name: first.opponent_name || "",
    stage: first.stage || "",
    stage_type: "playoff",
    stage_id: first.stage_id ?? null,
    stage_sequence: first.stage_sequence ?? null,
    round_number: first.round_number ?? null,
    playoff_game_number: null,
    games: ordered,
    total_games: ordered.length,
    game_wins_a: summary.gameWinsA,
    game_wins_b: summary.gameWinsB,
    game_draws: summary.gameDraws,
    goals_a: summary.goalsA,
    goals_b: summary.goalsB,
    overtime_games: summary.overtimeGames,
    overtime: summary.overtimeGames > 0,
    result,
    goal_diff: gameDiff,
    goal_abs: Math.abs(gameDiff),
    best_of: bestOf,
  };
}

export function computeSeriesSummary(seriesItems) {
  const summary = {
    total: seriesItems.length,
    winsA: 0,
    winsB: 0,
    draws: 0,
    gameWinsA: 0,
    gameWinsB: 0,
    gameDraws: 0,
    goalsA: 0,
    goalsB: 0,
    totalGames: 0,
    overtimeGames: 0,
    largestWin: null,
    largestLoss: null,
    tournaments: new Set(),
  };

  seriesItems.forEach((series) => {
    if (series.result === "A") summary.winsA += 1;
    if (series.result === "B") summary.winsB += 1;
    if (series.result === "D") summary.draws += 1;
    summary.gameWinsA += series.game_wins_a || 0;
    summary.gameWinsB += series.game_wins_b || 0;
    summary.gameDraws += series.game_draws || 0;
    summary.goalsA += series.goals_a || 0;
    summary.goalsB += series.goals_b || 0;
    summary.totalGames += series.total_games || 0;
    summary.overtimeGames += series.overtime_games || 0;
    if (series.tournament_key) summary.tournaments.add(series.tournament_key);

    if (series.result === "A") {
      if (
        !summary.largestWin ||
        series.goal_abs > summary.largestWin.goal_abs ||
        (series.goal_abs === summary.largestWin.goal_abs &&
          Math.abs(series.goals_a - series.goals_b) > Math.abs(summary.largestWin.goals_a - summary.largestWin.goals_b))
      ) {
        summary.largestWin = series;
      }
    } else if (series.result === "B") {
      if (
        !summary.largestLoss ||
        series.goal_abs > summary.largestLoss.goal_abs ||
        (series.goal_abs === summary.largestLoss.goal_abs &&
          Math.abs(series.goals_a - series.goals_b) > Math.abs(summary.largestLoss.goals_a - summary.largestLoss.goals_b))
      ) {
        summary.largestLoss = series;
      }
    }
  });

  return summary;
}

export function formatSeriesLength(series) {
  if (!series || !series.best_of || series.best_of <= 1) return "Single game";
  return `Best of ${series.best_of}`;
}

export function formatSeriesScore(series) {
  if (!series) return "—";
  return `${series.game_wins_a}-${series.game_wins_b}`;
}
