// Home page: the most-played rivalry card and the biggest-rivalries list,
// both from data/rivalries.json (written by the build).
import { state } from "./state.js";
import { fetchJson } from "./data.js";
import { formatDate, formatNumber, decodeHtmlEntities } from "./utils.js";
import { el, icon, ICONS, requestView } from "./dom.js";
import { findPeak, lastName, leadSeries } from "./insights.js";

const LIST_ROWS = 6;
let rivalries = [];
let showAll = false;

function playerName(player) {
  const known = state.playersById.get(Number(player?.id));
  return decodeHtmlEntities(known?.name || player?.name || `Player ${player?.id}`);
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
    el("span", { class: "pair" }, nameA, el("i", {}, "vs"), nameB),
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
    }, showAll ? "Show fewer" : "See all rivalries"));
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
  const rivalry = rivalries[0];
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

export async function renderHome() {
  try {
    const payload = await fetchJson("data/rivalries.json");
    rivalries = Array.isArray(payload)
      ? payload.filter((r) => state.playersById.has(Number(r?.p1?.id)) && state.playersById.has(Number(r?.p2?.id)))
      : [];
  } catch (err) {
    console.warn("Could not load rivalries:", err);
    rivalries = [];
  }
  renderFeature();
  renderList();
}
