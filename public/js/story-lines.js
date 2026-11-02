// One short finding per section for the story rail on player and matchup pages.
// Pure functions with no DOM access, so the sentences can be tested in Node.
import {
  findComeback,
  lastName,
  leadSeries,
  listNames,
  monthYear,
  opponentExtremes,
  winRate,
} from "./insights.js";
import { formatDate } from "./utils.js";

const fmt = (value) => Number(value || 0).toLocaleString("en-US");
const pct = (value) => `${Math.round(value * 100)}%`;
const yearOf = (item) => String(item?.year || item?.date || "").slice(0, 4);

// Index where the current leader went ahead for good, or -1 if they never trailed.
export function leadTakenAt(lead) {
  const n = lead.length;
  if (!n || lead[n - 1] === 0) return null;
  const sign = Math.sign(lead[n - 1]);
  for (let i = n - 1; i >= 0; i -= 1) {
    if (Math.sign(lead[i]) !== sign) {
      // Never behind: only level spells before the leader's first win.
      const trailed = lead.slice(0, i + 1).some((value) => Math.sign(value) === -sign);
      return trailed ? i + 1 : -1;
    }
  }
  return -1;
}

// Latest run of seasons won by the same side: { side, count, since }.
export function seasonRun(seasons) {
  const winner = (s) => (s.a > s.b ? "a" : s.b > s.a ? "b" : "d");
  const last = seasons[seasons.length - 1];
  if (!last) return null;
  const side = winner(last);
  let count = 0;
  for (let i = seasons.length - 1; i >= 0 && winner(seasons[i]) === side; i -= 1) count += 1;
  return { side, count, since: seasons[seasons.length - count].year };
}

// Best win rate in a season with enough games to mean something.
export function bestSeason(seasons) {
  const rows = seasons.map((s) => {
    const games = s.a + s.b + s.d;
    return { ...s, games, rate: games ? s.a / games : 0 };
  });
  if (!rows.length) return null;
  const most = Math.max(...rows.map((r) => r.games));
  const pool = rows.filter((r) => r.games >= Math.min(20, most / 2));
  // Later seasons win ties.
  return pool.reduce((best, r) => (r.rate >= best.rate ? r : best));
}

export function matchupStory({ ordered, nameA, nameB, series = false, tournaments = [], grid = null, seasons = [] }) {
  const n = ordered.length;
  if (!n) return {};
  const a = lastName(nameA);
  const b = lastName(nameB);
  const name = (side) => (side === "a" ? a : b);
  const unit = series ? "series" : n === 1 ? "game" : "games";
  const lead = leadSeries(ordered);
  const final = lead[n - 1];
  const winsA = ordered.filter((item) => item.result === "A").length;
  const winsB = ordered.filter((item) => item.result === "B").length;
  const story = {};

  const inSeries = series ? " in series" : "";
  story.record = final === 0
    ? `Level at ${fmt(winsA)}–${fmt(winsB)}${inSeries}`
    : `${final > 0 ? a : b} leads ${fmt(Math.max(winsA, winsB))}–${fmt(Math.min(winsA, winsB))}${inSeries}`;

  if (n > 1) {
    const comeback = final === 0 ? null : findComeback(ordered, lead);
    const taken = leadTakenAt(lead);
    const leader = final > 0 ? a : b;
    if (final === 0) {
      story.lead = `Dead level after ${fmt(n)} ${unit}`;
    } else if (comeback) {
      const trailer = comeback.leader === "a" ? b : a;
      story.lead = `${trailer} has won ${fmt(comeback.winsTrailer)}–${fmt(comeback.winsLeader)} since ${monthYear(comeback.date)}`;
    } else if (taken === -1) {
      story.lead = `${leader} has never trailed`;
    } else if (taken != null) {
      story.lead = `${leader} has led since ${monthYear(ordered[taken].date)}`;
    }
  }

  if (grid?.best) {
    const { best, cap, capped } = grid;
    const label = (value) => (capped && value === cap ? `${value}+` : String(value));
    const score = `${label(best.a)}–${label(best.b)}`;
    const what = series ? "series score" : "score";
    story.tape = best.tone === "d"
      ? `${score} draws are the most common ${what}`
      : `${score} to ${name(best.tone)} is the most common ${what}`;
  }

  if (seasons.length > 1) {
    const run = seasonRun(seasons);
    const wonA = seasons.filter((s) => s.a > s.b).length;
    const wonB = seasons.filter((s) => s.b > s.a).length;
    if (run && run.side !== "d" && run.count === seasons.length) {
      story.seasons = `${name(run.side)} has won every season`;
    } else if (run && run.side !== "d" && run.count >= 3) {
      story.seasons = `${name(run.side)} has won every season since ${run.since}`;
    } else if (wonA !== wonB) {
      const side = wonA > wonB ? "a" : "b";
      story.seasons = `${name(side)} won ${Math.max(wonA, wonB)} of ${seasons.length} seasons`;
    } else {
      story.seasons = `Seasons split ${wonA}–${wonB}`;
    }
  }

  if (tournaments.length) {
    const tA = tournaments.filter((t) => t.winner === "a").length;
    const tB = tournaments.filter((t) => t.winner === "b").length;
    const events = tournaments.length === 1 ? "tournament" : "tournaments";
    story.tournaments = tA === tB
      ? `Tournaments split ${fmt(tA)}–${fmt(tB)}`
      : `${tA > tB ? a : b} won ${fmt(Math.max(tA, tB))} of ${fmt(tournaments.length)} ${events}`;
  }

  const first = yearOf(ordered[0]);
  const last = yearOf(ordered[n - 1]);
  story.games = `${fmt(n)} ${unit} ${first === last ? "in" : "since"} ${first}`;
  return story;
}

export function playerStory({ ordered, series = false, rating = null, edges = null, beats = null, seasons = [], records = [] }) {
  const n = ordered.length;
  if (!n) return {};
  const unit = series ? "series" : n === 1 ? "game" : "games";
  const wins = ordered.filter((item) => item.result === "A").length;
  const story = {};

  story.overview = `${fmt(n)} ${unit}, ${((wins / n) * 100).toFixed(1)}% won`;

  if (rating && Number.isFinite(rating.rating)) {
    const peak = rating.peak;
    story.rating = peak && Math.round(peak.rating) > Math.round(rating.rating)
      ? `${fmt(Math.round(rating.rating))} now, peak ${fmt(Math.round(peak.rating))} in ${monthYear(peak.date)}`
      : `At a career high of ${fmt(Math.round(rating.rating))}`;
  }

  if (edges && edges.rows?.length >= 2) {
    const names = (rows) => listNames(rows.slice(0, 2).map((row) => row.nation));
    if (edges.over.length && edges.under.length) {
      story.nations = `Better than expected against ${names(edges.over)}, worse against ${names(edges.under)}`;
    } else if (edges.over.length) {
      story.nations = `Overperforms against ${names(edges.over)}`;
    } else if (edges.under.length) {
      story.nations = `Underperforms against ${names(edges.under)}`;
    } else if (edges.overall?.clear) {
      story.nations = edges.overall.diff > 0
        ? "Beats the ratings against almost everyone"
        : "Below the ratings against almost everyone";
    } else {
      story.nations = "Plays to the ratings against every nation";
    }
  }

  const best = seasons.length > 1 ? bestSeason(seasons) : null;
  if (best) story.seasons = `Best season ${best.year}, ${pct(best.rate)} won`;

  const extremes = opponentExtremes(records);
  if (extremes && extremes.best !== extremes.worst) {
    // Same numbers as the "Best record" and "Toughest opponent" lines on the page.
    story.rivals = `Best against ${lastName(extremes.best.name)} (${pct(winRate(extremes.best))}), toughest ${lastName(extremes.worst.name)} (${pct(winRate(extremes.worst))})`;
  }

  if (beats && (beats.over.length || beats.under.length)) {
    // Same order as the "Above and below the ratings" section: most points above or below.
    const top = beats.over[0];
    const bottom = beats.under[0];
    const signed = (row) => `${row.excess >= 0 ? "+" : "−"}${Math.abs(row.excess).toFixed(1)}`;
    if (top && bottom) {
      story.beats = `Most above the ratings vs ${lastName(top.name)} (${signed(top)}), most below vs ${lastName(bottom.name)} (${signed(bottom)})`;
    } else if (top) {
      story.beats = `Most above the ratings vs ${lastName(top.name)} (${signed(top)})`;
    } else {
      story.beats = `Most below the ratings vs ${lastName(bottom.name)} (${signed(bottom)})`;
    }
  }

  if (records.length) {
    const top = records[0];
    story.opponents = records.length === 1
      ? `One opponent: ${top.name}`
      : `${fmt(records.length)} opponents, ${lastName(top.name)} most often`;
  }

  const lastItem = ordered[n - 1];
  const date = lastItem?.end_date || lastItem?.date;
  if (date) story.games = `Last played ${formatDate(date)}`;
  return story;
}
