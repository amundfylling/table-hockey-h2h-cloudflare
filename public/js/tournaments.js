// Matchup "Tournaments" list: one row per event, newest first, expandable to
// the games played there.
import { state, isSeriesMode } from "./state.js";
import { formatDate, formatNumber } from "./utils.js";
import { getItemSourceUrl } from "./table.js";
import { el, icon, ICONS } from "./dom.js";
import { groupTournaments, lastName } from "./insights.js";

const INITIAL_ROWS = 6;
let showAll = false;
let expanded = new Set();
let lastKey = "";

function stageLabel(group) {
  const stages = Array.from(group.stages);
  if (stages.length === 1) return stages[0] === "playoff" ? "Playoff" : "Round-robin";
  return stages.length ? "Round-robin and playoff" : "";
}

function gameLabel(game) {
  if (game.playoff_game_number != null) return `G${game.playoff_game_number}`;
  if (game.round_number != null) return `R${game.round_number}`;
  return "";
}

function gameChip(game) {
  const url = getItemSourceUrl(game);
  const a = el("span", { class: game.result === "A" ? "wa" : null }, String(game.goals_a));
  const b = el("span", { class: game.result === "B" ? "wb" : null }, String(game.goals_b));
  const children = [
    gameLabel(game),
    el("b", {}, a, "–", b),
    game.overtime ? el("small", {}, "OT") : null,
  ];
  const label = `${formatDate(game.date)}: ${state.playerA.name} ${game.goals_a}–${game.goals_b} ${state.playerB.name}${game.overtime ? " after overtime" : ""}`;
  return url
    ? el("a", { class: "g", href: url, target: "_blank", rel: "noopener noreferrer external", title: label }, ...children)
    : el("span", { class: "g", title: label }, ...children);
}

function winnerPill(group, names) {
  const text = group.winner === "a" ? `${names.a} won` : group.winner === "b" ? `${names.b} won` : "Tied";
  return el("span", { class: `pill ${group.winner}` }, text);
}

function createRow(group, names, index, rerender) {
  const id = `tgames-${index}`;
  const open = expanded.has(group.key);
  const count = `${formatNumber(group.games.length)} ${group.games.length === 1 ? "game" : "games"}`;
  const stage = stageLabel(group);
  const row = el("button", {
    class: "trow",
    type: "button",
    "aria-expanded": open ? "true" : "false",
    "aria-controls": id,
    onclick: () => {
      if (expanded.has(group.key)) expanded.delete(group.key);
      else expanded.add(group.key);
      rerender();
    },
  },
  el("span", { class: "date" }, formatDate(group.date)),
  el("span", { class: "tname" }, group.name,
    el("span", { class: "tsub" }, winnerPill(group, names), `${formatDate(group.date)} · ${[stage, count].filter(Boolean).join(" · ")}`)),
  el("span", { class: "stage" }, [stage, count].filter(Boolean).join(" · ")),
  el("span", { class: "res" }, winnerPill(group, names),
    el("span", { class: `sc ${group.winner}` }, `${group.winsA}–${group.winsB}`)),
  el("span", { class: "chev" }, icon(ICONS.down)));
  const games = el("div", { class: "games", id, hidden: !open }, ...group.games.map(gameChip));
  return el("div", { class: "titem" }, row, games);
}

export function renderTournaments(items) {
  const container = document.getElementById("tournaments");
  if (!container || !state.playerA || !state.playerB) return;
  const games = isSeriesMode() ? items.flatMap((series) => series.games || []) : items;
  const groups = groupTournaments(games);
  const names = { a: lastName(state.playerA.name), b: lastName(state.playerB.name) };
  const key = `${state.playerA.id}:${state.playerB.id}`;
  if (key !== lastKey) {
    lastKey = key;
    showAll = false;
    expanded = new Set(groups[0] ? [groups[0].key] : []);
  }

  const sub = document.getElementById("tournaments-sub");
  if (sub) sub.textContent = `${formatNumber(groups.length)} ${groups.length === 1 ? "event" : "events"}, newest first`;
  const tally = document.getElementById("tournaments-tally");
  if (tally) {
    const won = { a: 0, b: 0, d: 0 };
    groups.forEach((group) => { won[group.winner] += 1; });
    tally.textContent = `${names.a} won ${formatNumber(won.a)} · ${names.b} won ${formatNumber(won.b)} · ${formatNumber(won.d)} tied`;
  }

  const rerender = () => renderTournaments(items);
  const visible = showAll ? groups : groups.slice(0, INITIAL_ROWS);
  const rows = visible.map((group, index) => createRow(group, names, index, rerender));
  if (groups.length > INITIAL_ROWS) {
    rows.push(el("button", {
      class: "tfoot",
      type: "button",
      onclick: () => {
        showAll = !showAll;
        rerender();
      },
    }, showAll ? "Show fewer" : `Show all ${formatNumber(groups.length)} tournaments`));
  }
  container.replaceChildren(...rows);
}
