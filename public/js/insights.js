// Pure calculations behind the matchup and player views. No DOM access here, so
// the numbers can be tested in Node.
import { getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthYear(date) {
  const value = String(date || "");
  const month = Number(value.slice(5, 7));
  if (!value.slice(0, 4) || !month) return value.slice(0, 4);
  return `${MONTHS[month - 1]} ${value.slice(0, 4)}`;
}

export function lastName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || String(name || "");
}

// Wins minus losses for side A after every item, in playing order.
export function leadSeries(ordered) {
  let lead = 0;
  return ordered.map((item) => {
    if (item.result === "A") lead += 1;
    else if (item.result === "B") lead -= 1;
    return lead;
  });
}

// The point where the current leader was furthest ahead (first time it got there).
export function findPeak(lead) {
  if (!lead.length) return -1;
  const final = lead[lead.length - 1];
  const sign = final !== 0 ? Math.sign(final) : Math.sign(lead.reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0)) || 1;
  let best = 0;
  lead.forEach((value, index) => {
    if (value * sign > lead[best] * sign) best = index;
  });
  return best;
}

// Has the trailing side been winning since the leader's peak? Only reported when
// the swing is big enough to be a story rather than noise.
export function findComeback(ordered, lead) {
  const n = lead.length;
  const peak = findPeak(lead);
  const final = lead[n - 1];
  if (peak < 0 || final === 0 || peak >= n - 1) return null;
  const sign = Math.sign(final);
  const drop = (lead[peak] - final) * sign;
  const span = n - 1 - peak;
  if (drop < 5 || drop < Math.abs(lead[peak]) * 0.1 || span < 10) return null;
  let winsLeader = 0;
  let winsTrailer = 0;
  ordered.slice(peak + 1).forEach((item) => {
    if (item.result === (sign > 0 ? "A" : "B")) winsLeader += 1;
    else if (item.result === (sign > 0 ? "B" : "A")) winsTrailer += 1;
  });
  return {
    start: peak,
    date: ordered[peak + 1]?.date || ordered[peak]?.date || "",
    leader: sign > 0 ? "a" : "b",
    winsLeader,
    winsTrailer,
  };
}

function winnerOf(winsA, winsB) {
  return winsA > winsB ? "a" : winsB > winsA ? "b" : "d";
}

// One entry per tournament, newest first, with the games in playing order.
// One event per key. Name-only tournaments are split by source id or year so
// a recurring cup is not merged across seasons.
function tournamentKey(game) {
  if (game.tournament_id != null) return `id:${game.tournament_id}`;
  if (game.source_tournament_id) return `source:${game.source || ""}:${game.source_tournament_id}`;
  const name = game.tournament_key || `name:${game.tournament_name}`;
  return `${name}:year:${game.year || String(game.date || "").slice(0, 4)}`;
}

export function groupTournaments(games) {
  const groups = new Map();
  getChronologicalItems(games).forEach((game) => {
    const key = tournamentKey(game);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: game.tournament_name || "Unknown tournament",
        date: game.date,
        ts: game.ts,
        level: game.tournament_level,
        games: [],
        winsA: 0,
        winsB: 0,
        draws: 0,
        stages: new Set(),
      };
      groups.set(key, group);
    }
    group.games.push(game);
    group.date = game.date || group.date;
    group.ts = Math.max(group.ts || 0, game.ts || 0);
    if (game.result === "A") group.winsA += 1;
    else if (game.result === "B") group.winsB += 1;
    else group.draws += 1;
    if (game.stage_type) group.stages.add(game.stage_type);
  });
  return Array.from(groups.values())
    .map((group) => ({ ...group, winner: winnerOf(group.winsA, group.winsB) }))
    .sort((a, b) => b.ts - a.ts);
}

export function longestStreak(ordered, result) {
  let best = 0;
  let run = 0;
  ordered.forEach((item) => {
    run = item.result === result ? run + 1 : 0;
    best = Math.max(best, run);
  });
  return best;
}

// Wins, draws and losses per calendar year, oldest first.
export function seasonsOf(items) {
  const years = new Map();
  items.forEach((item) => {
    const year = item.year || String(item.date || "").slice(0, 4);
    if (!year) return;
    const entry = years.get(year) || { year, a: 0, b: 0, d: 0 };
    if (item.result === "A") entry.a += 1;
    else if (item.result === "B") entry.b += 1;
    else entry.d += 1;
    years.set(year, entry);
  });
  return Array.from(years.values()).sort((x, y) => x.year.localeCompare(y.year));
}

// How often each scoreline happened. Scores at or above `cap` share the last
// bucket, so every cell keeps its own win/draw/loss counts for colouring.
export function scorelineGrid(items, { series = false } = {}) {
  const pick = series
    ? (item) => [item.game_wins_a || 0, item.game_wins_b || 0]
    : (item) => [item.goals_a || 0, item.goals_b || 0];
  const maxSeen = items.reduce((m, item) => Math.max(m, ...pick(item)), 0);
  const cap = Math.max(1, Math.min(series ? maxSeen : 7, maxSeen));
  const cells = new Map();
  let best = null;
  items.forEach((item) => {
    const [rawA, rawB] = pick(item);
    const a = Math.min(rawA, cap);
    const b = Math.min(rawB, cap);
    const key = `${a}:${b}`;
    const cell = cells.get(key) || { a, b, count: 0, winsA: 0, winsB: 0, draws: 0 };
    cell.count += 1;
    if (item.result === "A") cell.winsA += 1;
    else if (item.result === "B") cell.winsB += 1;
    else cell.draws += 1;
    cells.set(key, cell);
    if (!best || cell.count > best.count) best = cell;
  });
  cells.forEach((cell) => {
    const top = Math.max(cell.winsA, cell.winsB, cell.draws);
    cell.tone = top === cell.winsA ? "a" : top === cell.winsB ? "b" : "d";
  });
  const max = best ? best.count : 0;
  return { cap, cells, best, max, capped: maxSeen > cap };
}

// The sentence under the matchup scoreboard. Returns parts so the key clause
// can be bold without building HTML from player names.
export function buildVerdict({ ordered, nameA, nameB, unit = "wins", tournaments = [] }) {
  const n = ordered.length;
  if (!n) return [];
  const lead = leadSeries(ordered);
  const final = lead[n - 1];
  const a = lastName(nameA);
  const b = lastName(nameB);
  const parts = [];

  if (n === 1) {
    const item = ordered[0];
    const winner = item.result === "A" ? a : item.result === "B" ? b : null;
    parts.push({ text: winner ? `One meeting so far, and ${winner} won it.` : "One meeting so far, and it was a draw." });
    return parts;
  }

  const leader = final > 0 ? a : b;
  const trailer = final > 0 ? b : a;
  if (final === 0) {
    parts.push({ text: `Dead level after ${n.toLocaleString("en-US")} meetings.` });
  } else {
    parts.push({ text: `${leader} leads by ${Math.abs(final).toLocaleString("en-US")} ${Math.abs(final) === 1 ? unit.replace(/s$/, "") : unit}` });
  }

  const comeback = final === 0 ? null : findComeback(ordered, lead);
  const recent = tournaments.slice(0, 6);
  const recentA = recent.filter((t) => t.winner === "a").length;
  const recentB = recent.filter((t) => t.winner === "b").length;
  const recentClause = (name, count) => `${numberWord(count)} of the last ${numberWord(recent.length)} tournaments`;

  if (comeback) {
    parts.push({ text: ", but the gap is closing: " });
    parts.push({
      text: `${trailer} has won ${comeback.winsTrailer.toLocaleString("en-US")} to ${comeback.winsLeader.toLocaleString("en-US")} since ${monthYear(comeback.date)}`,
      strong: true,
    });
    const trailerRecent = final > 0 ? recentB : recentA;
    if (recent.length >= 3 && trailerRecent > recent.length / 2) {
      parts.push({ text: `, and ${recentClause(trailer, trailerRecent)}.` });
    } else {
      parts.push({ text: "." });
    }
    return parts;
  }

  if (final !== 0 && recent.length >= 3) {
    const leaderRecent = final > 0 ? recentA : recentB;
    const trailerRecent = final > 0 ? recentB : recentA;
    if (leaderRecent > recent.length / 2) {
      parts.push({ text: " and " });
      parts.push({ text: `has won ${recentClause(leader, leaderRecent)}`, strong: true });
      parts.push({ text: "." });
      return parts;
    }
    if (trailerRecent > recent.length / 2) {
      parts.push({ text: ", but " });
      parts.push({ text: `${trailer} has won ${recentClause(trailer, trailerRecent)}`, strong: true });
      parts.push({ text: "." });
      return parts;
    }
  }
  parts.push({ text: "." });
  return parts;
}

function numberWord(n) {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
}

// Per-opponent records for one player, most games first. Colour decisions use
// wins against losses, never win rate, so draws cannot flip the story.
export function opponentRecords(matches, canonicalId = (id) => id, nameOf = () => "") {
  const map = new Map();
  matches.forEach((match) => {
    const raw = Number(match.opponent_id);
    const id = Number.isInteger(raw) && raw > 0 ? canonicalId(raw) : null;
    const name = nameOf(id) || match.opponent_name || (id ? `Player ${id}` : "Unknown opponent");
    const key = id != null ? `id:${id}` : `name:${name}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { id, name, games: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, last: "", lastTs: 0 };
      map.set(key, entry);
    }
    entry.games += 1;
    entry.goalsFor += Number(match.goals_a) || 0;
    entry.goalsAgainst += Number(match.goals_b) || 0;
    if (match.result === "A") entry.wins += 1;
    else if (match.result === "B") entry.losses += 1;
    else entry.draws += 1;
    if ((match.ts || 0) >= entry.lastTs) {
      entry.lastTs = match.ts || 0;
      entry.last = match.end_date || match.date || entry.last;
    }
  });
  return Array.from(map.values())
    .map((entry) => ({ ...entry, edge: recordEdge(entry.wins, entry.losses) }))
    .sort((a, b) => b.games - a.games);
}

export function recordEdge(wins, losses) {
  return wins > losses ? "a" : losses > wins ? "b" : "d";
}

export function winRate(entry) {
  return entry.games ? entry.wins / entry.games : 0;
}

// Best and toughest opponents among those with a meaningful sample.
export function opponentExtremes(records, minGames = 40) {
  let threshold = minGames;
  let pool = records.filter((r) => r.games >= threshold);
  while (pool.length < 3 && threshold > 5) {
    threshold = Math.max(5, Math.floor(threshold / 2));
    pool = records.filter((r) => r.games >= threshold);
  }
  if (pool.length < 2) return null;
  const score = (r) => (r.wins + r.draws / 2) / r.games;
  const best = pool.reduce((m, r) => (score(r) > score(m) ? r : m));
  const worst = pool.reduce((m, r) => (score(r) < score(m) ? r : m));
  return { best, worst, threshold };
}
