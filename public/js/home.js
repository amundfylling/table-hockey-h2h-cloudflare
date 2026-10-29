// Home page: the most-played rivalry card and the biggest-rivalries list,
// both from data/rivalries.json (written by the build), the records cards from
// data/records.json, and the top-ranked players list from the loaded players.
import { state } from "./state.js";
import { getCountryFlag, getWorldRank } from "./players.js";
import { fetchJson } from "./data.js";
import { formatDate, formatNumber, decodeHtmlEntities } from "./utils.js";
import { el, icon, ICONS, requestView } from "./dom.js";
import { findPeak, lastName, leadSeries } from "./insights.js";

const LIST_ROWS = 6;
let mostPlayed = [];
let rivalries = [];
let ranked = false;
let showAll = false;
let topPlayers = [];
let records = {};
let showAllPlayers = false;

function playerName(player) {
  const known = state.playersById.get(Number(player?.id));
  return decodeHtmlEntities(known?.name || player?.name || `Player ${player?.id}`);
}

function rankOf(player) {
  return getWorldRank(state.playersById.get(Number(player?.id)));
}

function namedPlayer(player) {
  const rank = ranked ? rankOf(player) : null;
  return el("span", { class: "who" },
    rank ? el("span", { class: "wr" }, `#${rank}`) : null,
    playerName(player));
}

function openRivalry(rivalry) {
  requestView({ p1: Number(rivalry.p1.id), p2: Number(rivalry.p2.id) });
}

function recordBar(rivalry) {
  const total = rivalry.games || 1;
  return el("span", { class: "mini-bar", "aria-hidden": "true" },
    el("span", { style: { width: `${(rivalry.wins_p1 / total) * 100}%`, background: "var(--a)" } }),
    rivalry.draws ? el("span", { style: { width: `${(rivalry.draws / total) * 100}%`, background: "var(--draw)" } }) : null,
    el("span", { style: { width: `${(rivalry.wins_p2 / total) * 100}%`, background: "var(--b)" } }));
}

function renderList() {
  const list = document.getElementById("rivalries-list");
  const section = document.getElementById("rivalries");
  if (!list || !section) return;
  section.hidden = rivalries.length === 0;
  const title = document.getElementById("rivalries-title");
  const sub = section.querySelector(".sec-sub");
  if (title) title.textContent = ranked ? "Top-ranked rivalries" : "Biggest rivalries";
  if (sub) sub.textContent = ranked ? "The world's best players against each other, in ranking order" : "Most games between two players";
  const head = el("div", { class: "rrow head", "aria-hidden": "true" },
    el("span", {}, "#"),
    el("span", {}, "Rivalry"),
    el("span", {}, "Record, first player's wins left"),
    el("span", { class: "gn" }, "Games"),
    el("span", { class: "mut" }, "Last played"),
    el("span"));
  const rows = (showAll ? rivalries : rivalries.slice(0, LIST_ROWS)).map((rivalry, index) => {
    const nameA = playerName(rivalry.p1);
    const nameB = playerName(rivalry.p2);
    return el("button", {
      class: "rrow",
      type: "button",
      "aria-label": `${nameA} against ${nameB}: ${rivalry.wins_p1} wins to ${rivalry.wins_p2} in ${formatNumber(rivalry.games)} games`,
      onclick: () => openRivalry(rivalry),
    },
    el("span", { class: "rank" }, String(index + 1)),
    el("span", { class: "pair" }, namedPlayer(rivalry.p1), el("i", {}, "vs"), namedPlayer(rivalry.p2)),
    el("span", { class: "rec" },
      el("span", {}, formatNumber(rivalry.wins_p1)),
      recordBar(rivalry),
      el("span", {}, formatNumber(rivalry.wins_p2))),
    el("span", { class: "gn" }, formatNumber(rivalry.games)),
    el("span", { class: "mut" }, formatDate(rivalry.last_meeting_date)),
    el("span", { class: "chev" }, icon(ICONS.right)));
  });
  const children = [head, ...rows];
  if (rivalries.length > LIST_ROWS) {
    children.push(el("button", {
      class: "tfoot",
      type: "button",
      onclick: () => {
        showAll = !showAll;
        renderList();
      },
    }, showAll ? "Show fewer" : ranked ? "See more ranked rivalries" : "See all rivalries"));
  }
  list.replaceChildren(...children);
  list.classList.add("panel");
}

function renderPlayers() {
  const list = document.getElementById("players-list");
  const section = document.getElementById("players");
  if (!list || !section) return;
  section.hidden = topPlayers.length === 0;
  if (!topPlayers.length) return;
  const head = el("div", { class: "rrow prow head", "aria-hidden": "true" },
    el("span", {}, "WR"),
    el("span", {}, "Player"),
    el("span", { class: "mut" }, "Country"),
    el("span", { class: "gn" }, "Points"),
    el("span"));
  const rows = (showAllPlayers ? topPlayers : topPlayers.slice(0, LIST_ROWS)).map((player) => {
    const name = decodeHtmlEntities(player.name);
    const rank = getWorldRank(player);
    const flag = getCountryFlag(player.country);
    return el("button", {
      class: "rrow prow",
      type: "button",
      "aria-label": `${name}, world rank ${rank}${player.country ? `, ${player.country}` : ""}: open career`,
      onclick: () => requestView({ p1: Number(player.id) }),
    },
    el("span", { class: "rank" }, String(rank)),
    el("span", { class: "pair" }, name),
    el("span", { class: "mut" }, [flag, player.country].filter(Boolean).join(" ")),
    el("span", { class: "gn" }, player.ranking_points == null ? "" : formatNumber(player.ranking_points)),
    el("span", { class: "chev" }, icon(ICONS.right)));
  });
  const children = [head, ...rows];
  if (topPlayers.length > LIST_ROWS) {
    children.push(el("button", {
      class: "tfoot",
      type: "button",
      onclick: () => {
        showAllPlayers = !showAllPlayers;
        renderPlayers();
      },
    }, showAllPlayers ? "Show fewer" : "See more ranked players"));
  }
  list.replaceChildren(...children);
  list.classList.add("panel");
}

// Small lead chart for the featured card, drawn from the results string.
function miniLeadChart(rivalry, lead) {
  const width = 392;
  const height = 120;
  const pl = 32;
  const pr = 10;
  const pt = 18;
  const pb = 20;
  const n = lead.length;
  const pw = width - pl - pr;
  const ph = height - pt - pb;
  const maxV = Math.max(0, ...lead);
  const minV = Math.min(0, ...lead);
  const span = Math.max(1, maxV - minV);
  const X = (i) => pl + (pw * i) / Math.max(1, n - 1);
  const Y = (v) => pt + (ph * (maxV - v)) / span;
  const step = Math.max(1, Math.floor(n / pw));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push(`${X(i).toFixed(1)},${Y(lead[i]).toFixed(1)}`);
  pts.push(`${X(n - 1).toFixed(1)},${Y(lead[n - 1]).toFixed(1)}`);
  const peak = findPeak(lead);
  const final = lead[n - 1];
  const color = final >= 0 ? "var(--a)" : "var(--b)";
  const parts = [];
  const tick = niceStep(span / 4);
  for (let v = Math.ceil(minV / tick) * tick; v <= maxV; v += tick) {
    parts.push(`<line x1="${pl}" x2="${width - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${v === 0 ? "var(--line-2)" : "var(--line)"}"/>`);
    parts.push(`<text x="${pl - 6}" y="${(Y(v) + 4).toFixed(1)}" font-size="11" fill="var(--ink-3)" text-anchor="end">${v > 0 ? "+" : ""}${v}</text>`);
  }
  if (peak > 0 && peak < n - 1) {
    parts.push(`<rect x="${X(peak).toFixed(1)}" y="${pt}" width="${(X(n - 1) - X(peak)).toFixed(1)}" height="${ph}" fill="${final >= 0 ? "var(--b)" : "var(--a)"}" fill-opacity="0.07"/>`);
  }
  parts.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`);
  Object.entries(rivalry.year_starts || {}).forEach(([year, index], i, all) => {
    if (all.length > 4 && i % 2) return;
    parts.push(`<text x="${(X(index) + 2).toFixed(1)}" y="${height - 4}" font-size="11" fill="var(--ink-3)">${year}</text>`);
  });
  if (peak > 0 && peak < n - 1) {
    parts.push(`<circle cx="${X(peak).toFixed(1)}" cy="${Y(lead[peak]).toFixed(1)}" r="3.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`);
    parts.push(`<text x="${X(peak).toFixed(1)}" y="${(Y(lead[peak]) - 8).toFixed(1)}" font-size="11" font-weight="600" fill="var(--ink)" text-anchor="middle">Peak ${lead[peak] > 0 ? "+" : ""}${lead[peak]}</text>`);
  }
  parts.push(`<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(final).toFixed(1)}" r="3.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`);
  if (peak > 0 && peak < n - 1) {
    parts.push(`<text x="${width - pr - 2}" y="${(Y(final) + 20).toFixed(1)}" font-size="11" font-weight="600" fill="var(--ink)" text-anchor="end">${final > 0 ? "+" : ""}${final} now</text>`);
  }
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lead over time" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  return [1, 2, 5, 10].map((m) => m * pow).find((step) => step >= raw) || pow * 10;
}

// Approximate month of a game from the year boundaries, assuming games are
// spread evenly through each year.
function monthAt(rivalry, index) {
  const starts = Object.entries(rivalry.year_starts || {}).map(([year, start]) => [Number(year), start]);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const [year, start] = starts[i];
    if (start > index) continue;
    const end = starts[i + 1]?.[1] ?? rivalry.games;
    const isLast = i === starts.length - 1;
    const months = isLast ? Number(String(rivalry.last_meeting_date || "").slice(5, 7)) || 12 : 12;
    const month = Math.min(months - 1, Math.floor(((index - start) / Math.max(1, end - start)) * months));
    return new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  return "";
}

function renderFeature() {
  const card = document.getElementById("feature");
  const rivalry = mostPlayed[0];
  if (!card || !rivalry?.results) {
    if (card) card.hidden = true;
    return;
  }
  const nameA = playerName(rivalry.p1);
  const nameB = playerName(rivalry.p2);
  const lead = leadSeries([...rivalry.results].map((r) => ({ result: r === "W" ? "A" : r === "L" ? "B" : "D" })));
  const peak = findPeak(lead);
  const final = lead[lead.length - 1];
  const leader = final >= 0 ? lastName(nameA) : lastName(nameB);
  const trailer = final >= 0 ? lastName(nameB) : lastName(nameA);
  const since = String(rivalry.first_meeting_date || "").slice(0, 4);
  let story = `${formatNumber(rivalry.games)} games since ${since}.`;
  if (peak > 0 && peak < lead.length - 1 && Math.abs(lead[peak]) - Math.abs(final) >= 5) {
    story += ` ${leader} built a lead of ${Math.abs(lead[peak])}, and ${trailer} has cut it to ${Math.abs(final)} since the peak in ${monthAt(rivalry, peak)}.`;
  } else if (final) {
    story += ` ${leader} leads by ${Math.abs(final)}.`;
  }
  const chart = el("div", { class: "mini-chart" });
  chart.innerHTML = miniLeadChart(rivalry, lead);
  card.replaceChildren(
    el("h2", { id: "feature-title", class: "eyebrow" }, "Most-played rivalry"),
    el("div", { class: "names" }, el("span", {}, nameA), el("span", { class: "r" }, nameB)),
    el("div", { class: "sc" },
      el("span", { class: "a" }, formatNumber(rivalry.wins_p1)),
      el("span", { class: "b r" }, formatNumber(rivalry.wins_p2))),
    chart,
    el("p", {}, story),
    el("button", { class: "open", type: "button", onclick: () => openRivalry(rivalry) },
      "Open the matchup", icon(ICONS.right)));
  card.hidden = false;
}

function monthYear(dateStr) {
  const [year, month] = String(dateStr || "").split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function spanText(start, end) {
  const first = monthYear(start);
  const last = monthYear(end);
  return first === last ? first : `${first} – ${last}`;
}

function yearOf(dateStr) {
  return String(dateStr || "").slice(0, 4);
}

function yearSpan(start, end) {
  return yearOf(start) === yearOf(end) ? yearOf(start) : `${yearOf(start)} – ${yearOf(end)}`;
}

function knownPlayers(...players) {
  return players.every((p) => state.playersById.has(Number(p?.id)));
}

function openView(p1, p2) {
  requestView({ p1: Number(p1.id), ...(p2 ? { p2: Number(p2.id) } : {}) });
}

// One square per game: a streak you can count.
function pips(results) {
  return el("span", { class: "pips", "aria-hidden": "true" },
    [...results].map((r) => el("i", { class: r === "D" ? "d" : "w" })));
}

function streakRow(record, unit, results, legend) {
  return el("button", {
    class: "streak-row",
    type: "button",
    "aria-label": `${formatNumber(record.games)} ${unit}: ${playerName(record.player)}, ${spanText(record.start_date, record.end_date)}`,
    onclick: () => openView(record.player),
  },
  el("span", { class: "streak-head" },
    el("span", { class: "record-num" }, formatNumber(record.games)),
    el("span", { class: "streak-text" },
      el("span", { class: "record-unit" }, unit),
      el("span", { class: "record-who" }, playerName(record.player)),
      el("span", { class: "record-when" }, spanText(record.start_date, record.end_date))),
    legend),
  pips(results));
}

function streaksCard() {
  const { win_streak: win, unbeaten_streak: unbeaten } = records;
  const rows = [];
  if (win && knownPlayers(win.player)) {
    rows.push(streakRow(win, "wins in a row", "W".repeat(win.games)));
  }
  if (unbeaten && knownPlayers(unbeaten.player)) {
    const results = unbeaten.results || "W".repeat(unbeaten.games);
    const draws = [...results].filter((r) => r === "D").length;
    rows.push(streakRow(unbeaten, "games without a loss", results,
      draws ? el("span", { class: "pip-legend" }, el("i", { class: "w" }), "Win", el("i", { class: "d" }), "Draw") : null));
  }
  if (!rows.length) return null;
  return el("section", { class: "panel record record--streaks", "aria-label": "Longest streaks" },
    el("span", { class: "eyebrow" }, "Longest streaks"),
    ...rows);
}

function recordCard({ kind, label, visual, value, unit, who, when, onclick }) {
  return el("button", {
    class: `panel record record--${kind}`,
    type: "button",
    "aria-label": `${label}: ${value} ${unit}, ${who}, ${when}`,
    onclick,
  },
  el("span", { class: "eyebrow" }, label),
  el("span", { class: "record-visual", "aria-hidden": "true" }, visual),
  el("span", { class: "record-value" },
    el("span", { class: "record-num" }, value),
    unit ? el("span", { class: "record-unit" }, unit) : null),
  el("span", { class: "record-who" }, who),
  el("span", { class: "record-when" }, when));
}

// Scoreboard with an empty right side: the zero is the point.
function perfectVisual(record) {
  return el("span", { class: "shutout" },
    el("span", { class: "shutout-bar" }, el("i")),
    el("span", { class: "shutout-labels" },
      el("span", {}, `${lastName(playerName(record.player))} ${formatNumber(record.games)}`),
      el("span", {}, `0 ${lastName(playerName(record.opponent))}`)));
}

// The lead in the rivalry climbing one game at a time.
function climbVisual(record) {
  const { games } = record;
  const width = 240;
  const height = 64;
  const steps = [`M0 ${height}`];
  for (let i = 0; i < games; i += 1) {
    const x = ((i + 1) / games) * width;
    const y = height - ((i + 1) / games) * (height - 6);
    steps.push(`H${x.toFixed(1)} V${y.toFixed(1)}`);
  }
  const svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`
    + `<path d="${steps.join(" ")} V${height} Z" fill="var(--a-tint)"/>`
    + `<path d="${steps.join(" ")}" fill="none" stroke="var(--a)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  const chart = el("span", { class: "climb-chart" });
  chart.innerHTML = svg;
  return el("span", { class: "climb" }, chart,
    el("span", { class: "gap-labels" },
      el("span", {}, yearOf(record.start_date)),
      el("span", {}, `+${formatNumber(games)} in ${yearOf(record.end_date)}`)));
}

// A bar split down the middle, draws in between.
function evenVisual(record) {
  const total = record.games || 1;
  const side = `${(record.wins / total) * 100}%`;
  return el("span", { class: "balance" },
    el("span", { class: "balance-bar" },
      el("i", { style: { width: side, background: "var(--a)" } }),
      record.draws ? el("i", { style: { flex: "1", background: "var(--draw)" } }) : null,
      el("i", { style: { width: side, background: "var(--b)" } })),
    el("span", { class: "balance-mid" }),
    el("span", { class: "shutout-labels" },
      el("span", {}, `${lastName(playerName(record.player))} ${formatNumber(record.wins)}`),
      el("span", {}, `${formatNumber(record.wins)} ${lastName(playerName(record.opponent))}`)));
}

// Two meetings with decades of nothing in between.
function gapVisual(record) {
  return el("span", { class: "gap" },
    el("span", { class: "gap-line" }, el("i", { class: "dot" }), el("i", { class: "dash" }), el("i", { class: "dot" })),
    el("span", { class: "gap-labels" },
      el("span", {}, yearOf(record.before_date)),
      el("span", {}, yearOf(record.after_date))));
}

function smallCards() {
  const cards = [];
  const { perfect_record: perfect, h2h_streak: h2h, dead_even: even, rematch_gap: gap } = records;
  if (perfect && knownPlayers(perfect.player, perfect.opponent)) {
    cards.push(recordCard({ kind: "perfect", label: "Perfect record", visual: perfectVisual(perfect),
      value: `${formatNumber(perfect.games)}–0`, unit: "not even a draw",
      who: `${playerName(perfect.player)} against ${playerName(perfect.opponent)}`,
      when: yearSpan(perfect.first_date, perfect.last_date), onclick: () => openView(perfect.player, perfect.opponent) }));
  }
  if (h2h && knownPlayers(h2h.player, h2h.opponent)) {
    cards.push(recordCard({ kind: "climb", label: "Most wins in a row over one rival", visual: climbVisual(h2h),
      value: formatNumber(h2h.games), unit: "straight wins",
      who: `${playerName(h2h.player)} over ${playerName(h2h.opponent)}`,
      when: yearSpan(h2h.start_date, h2h.end_date), onclick: () => openView(h2h.player, h2h.opponent) }));
  }
  if (even && knownPlayers(even.player, even.opponent)) {
    cards.push(recordCard({ kind: "even", label: "Dead even", visual: evenVisual(even),
      value: `${formatNumber(even.wins)}–${formatNumber(even.wins)}`,
      unit: even.draws ? `and ${formatNumber(even.draws)} draws` : "",
      who: `${playerName(even.player)} and ${playerName(even.opponent)}`,
      when: `After ${formatNumber(even.games)} games`, onclick: () => openView(even.player, even.opponent) }));
  }
  if (gap && knownPlayers(gap.player, gap.opponent)) {
    const years = Math.floor(gap.days / 365.25);
    cards.push(recordCard({ kind: "gap", label: "Longest wait for a rematch", visual: gapVisual(gap),
      value: String(years), unit: years === 1 ? "year" : "years",
      who: `${playerName(gap.player)} and ${playerName(gap.opponent)}`,
      when: `${yearOf(gap.before_date)}, then again in ${yearOf(gap.after_date)}`,
      onclick: () => openView(gap.player, gap.opponent) }));
  }
  return cards;
}

// The build drops a record as soon as a game breaks it, so a missing key
// simply means no card.
function renderRecords() {
  const list = document.getElementById("records-list");
  const section = document.getElementById("records");
  if (!list || !section) return;
  const cards = [streaksCard(), ...smallCards()].filter(Boolean);
  section.hidden = cards.length === 0;
  list.replaceChildren(...cards);
}

export async function renderHome() {
  const seenRanks = new Set();
  topPlayers = state.players
    .filter((player) => getWorldRank(player))
    .sort((a, b) => getWorldRank(a) - getWorldRank(b))
    .filter((player) => !seenRanks.has(getWorldRank(player)) && seenRanks.add(getWorldRank(player)))
    .slice(0, 50);
  renderPlayers();
  const recordsReady = fetchJson("data/records.json")
    .then((payload) => { records = payload && typeof payload === "object" ? payload : {}; })
    .catch((err) => {
      console.warn("Could not load records:", err);
      records = {};
    })
    .then(renderRecords);
  try {
    const payload = await fetchJson("data/rivalries.json");
    const known = (list) => (Array.isArray(list) ? list : [])
      .filter((r) => state.playersById.has(Number(r?.p1?.id)) && state.playersById.has(Number(r?.p2?.id)));
    // Older builds wrote a plain list of the most-played pairs.
    mostPlayed = known(Array.isArray(payload) ? payload : payload?.most_played);
    const topRanked = known(payload?.top_ranked)
      .filter((r) => rankOf(r.p1) && rankOf(r.p2))
      .sort((x, y) => {
        const [xa, xb] = [rankOf(x.p1), rankOf(x.p2)].sort((a, b) => a - b);
        const [ya, yb] = [rankOf(y.p1), rankOf(y.p2)].sort((a, b) => a - b);
        return xb - yb || xa - ya;
      });
    ranked = topRanked.length > 0;
    rivalries = ranked ? topRanked : mostPlayed;
  } catch (err) {
    console.warn("Could not load rivalries:", err);
    mostPlayed = [];
    rivalries = [];
    ranked = false;
  }
  renderFeature();
  renderList();
  await recordsReady;
}
