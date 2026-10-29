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

// One card per record the build kept. The build drops a record as soon as a
// game breaks it, so a missing key simply means no card.
function recordCards() {
  const cards = [];
  const known = (...players) => players.every((p) => state.playersById.has(Number(p?.id)));
  const { win_streak: win, unbeaten_streak: unbeaten, perfect_record: perfect,
    h2h_streak: h2h, dead_even: even, rematch_gap: gap } = records;
  if (win && known(win.player)) {
    cards.push({ label: "Longest winning streak", value: formatNumber(win.games), unit: "wins in a row",
      who: playerName(win.player), when: spanText(win.start_date, win.end_date), view: { p1: win.player.id } });
  }
  if (unbeaten && known(unbeaten.player)) {
    cards.push({ label: "Longest unbeaten run", value: formatNumber(unbeaten.games), unit: "games without a loss",
      who: playerName(unbeaten.player), when: spanText(unbeaten.start_date, unbeaten.end_date), view: { p1: unbeaten.player.id } });
  }
  if (perfect && known(perfect.player, perfect.opponent)) {
    cards.push({ label: "Perfect record", value: `${formatNumber(perfect.games)}–0`, unit: "and never a draw",
      who: `${playerName(perfect.player)} against ${playerName(perfect.opponent)}`,
      when: yearSpan(perfect.first_date, perfect.last_date), view: { p1: perfect.player.id, p2: perfect.opponent.id } });
  }
  if (h2h && known(h2h.player, h2h.opponent)) {
    cards.push({ label: "Most wins in a row over one rival", value: formatNumber(h2h.games), unit: "straight wins",
      who: `${playerName(h2h.player)} over ${playerName(h2h.opponent)}`,
      when: yearSpan(h2h.start_date, h2h.end_date), view: { p1: h2h.player.id, p2: h2h.opponent.id } });
  }
  if (even && known(even.player, even.opponent)) {
    cards.push({ label: "Dead even", value: `${formatNumber(even.wins)}–${formatNumber(even.wins)}`,
      unit: even.draws ? `with ${formatNumber(even.draws)} draws` : "",
      who: `${playerName(even.player)} and ${playerName(even.opponent)}`,
      when: `After ${formatNumber(even.games)} games`, view: { p1: even.player.id, p2: even.opponent.id } });
  }
  if (gap && known(gap.player, gap.opponent)) {
    const years = Math.floor(gap.days / 365.25);
    cards.push({ label: "Longest wait for a rematch", value: String(years), unit: years === 1 ? "year" : "years",
      who: `${playerName(gap.player)} and ${playerName(gap.opponent)}`,
      when: `${yearOf(gap.before_date)}, then again in ${yearOf(gap.after_date)}`,
      view: { p1: gap.player.id, p2: gap.opponent.id } });
  }
  return cards;
}

function renderRecords() {
  const list = document.getElementById("records-list");
  const section = document.getElementById("records");
  if (!list || !section) return;
  const cards = recordCards();
  section.hidden = cards.length === 0;
  list.replaceChildren(...cards.map((card) => el("button", {
    class: "panel record",
    type: "button",
    "aria-label": `${card.label}: ${card.value} ${card.unit}, ${card.who}, ${card.when}`,
    onclick: () => requestView({ p1: Number(card.view.p1), ...(card.view.p2 ? { p2: Number(card.view.p2) } : {}) }),
  },
  el("span", { class: "eyebrow" }, card.label),
  el("span", { class: "record-value" },
    el("span", { class: "record-num" }, card.value),
    card.unit ? el("span", { class: "record-unit" }, card.unit) : null),
  el("span", { class: "record-who" }, card.who),
  el("span", { class: "record-when" }, card.when))));
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
