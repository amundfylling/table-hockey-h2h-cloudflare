// Tournament page (tournament.html?id=…): champion, upsets, playoff brackets and
// round-robin standings from the build's data/t/ files (see tournamentDataPath).
import { el } from "./dom.js";
import { setTheme, toggleTheme } from "./theme.js";
import { safeStorageGet, STORAGE_KEYS } from "./state.js";
import { pageTitle } from "./page-title.js";
import { formatDateRange, tournamentDataPath } from "./date-range.js";
import { decodeHtmlEntities, formatNumber, safeExternalUrl } from "./utils.js";

const ID_RE = /^[1-9]\d{0,9}$/;

function initChrome() {
  const saved = safeStorageGet(STORAGE_KEYS.theme, null);
  const preferred = saved === "dark" || saved === "light"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(preferred, { persist: saved === "dark" || saved === "light" });
  document.getElementById("theme-toggle")?.addEventListener("click", toggleTheme);

  const menuButton = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-menu");
  menuButton?.addEventListener("click", () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    menuButton.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
}

function makePlayerLink(data) {
  const linked = new Set((data.linked || []).map(Number));
  return (id, className = "t-player") => {
    const name = decodeHtmlEntities(data.players?.[String(id)] || `Player ${id}`);
    return linked.has(Number(id))
      ? el("a", { class: className, href: `./?p1=${id}` }, name)
      : el("span", { class: className }, name);
  };
}

function scoreText(a, b, ot) {
  return `${a}–${b}${ot ? " OT" : ""}`;
}

function renderHeader(data) {
  document.getElementById("t-title").textContent = data.name;
  const bits = [
    formatDateRange(data.date, data.end_date),
    [data.city, data.country].filter(Boolean).join(", "),
    data.level ? `Level ${data.level}` : "",
    `${formatNumber(Object.keys(data.players || {}).length)} players`,
    `${formatNumber(data.games)} games`,
  ].filter(Boolean);
  document.getElementById("t-meta").textContent = bits.join(" · ");
  const url = safeExternalUrl(data.url);
  if (url) {
    const source = document.getElementById("t-source");
    let host = data.source || "";
    try { host = new URL(url).hostname; } catch { /* keep the source name */ }
    source.replaceChildren(el("a", {
      href: url, target: "_blank", rel: "noopener noreferrer external",
    }, `Full results on ${host}`));
    source.hidden = false;
  }
  document.title = pageTitle({ nameA: data.name });
}

function renderPodium(data, player) {
  const podium = document.getElementById("t-podium");
  const cards = [];
  if (data.champion) {
    cards.push(el("div", { class: "panel t-podium-card is-champion" },
      el("span", { class: "eyebrow" }, "Champion"),
      player(data.champion, "t-podium-name")));
  }
  if (data.runner_up) {
    cards.push(el("div", { class: "panel t-podium-card" },
      el("span", { class: "eyebrow" }, "Runner-up"),
      player(data.runner_up, "t-podium-name")));
  }
  const goalsPerGame = data.games ? (data.goals / data.games).toFixed(1) : "0";
  cards.push(el("div", { class: "panel t-podium-card" },
    el("span", { class: "eyebrow" }, "Goals per game"),
    el("span", { class: "t-podium-num" }, goalsPerGame)));
  podium.replaceChildren(...cards);
}

function renderUpsets(data, player) {
  const upsets = data.upsets || [];
  if (!upsets.length) return;
  const list = document.getElementById("t-upsets");
  list.replaceChildren(...upsets.map((u) => el("li", { class: "t-upset" },
    el("span", { class: "t-upset-line" },
      player(u.winner), " beat ", player(u.loser), " ",
      el("span", { class: "t-score" }, scoreText(u.score[0], u.score[1], u.ot))),
    el("span", { class: "t-upset-meta" },
      [u.stage, `rated ${formatNumber(u.gap)} lower (${u.winner_rating} v ${u.loser_rating})`]
        .filter(Boolean).join(" · ")))));
  document.getElementById("t-upsets-section").hidden = false;
}

function seriesCard(series, player) {
  const [a, b, winsA, winsB, games] = series;
  const single = games.length === 1;
  const side = (id, wins, won) => el("div", { class: `t-series-side${won ? " is-winner" : ""}` },
    player(id),
    el("span", { class: "t-series-wins" }, single ? String(games[0][id === a ? 0 : 1]) : String(wins)));
  return el("li", { class: "t-series" },
    side(a, winsA, winsA > winsB),
    side(b, winsB, winsB > winsA),
    single
      ? (games[0][2] ? el("p", { class: "t-series-games" }, "Overtime") : null)
      : el("p", { class: "t-series-games" },
        games.map(([ga, gb, ot]) => scoreText(ga, gb, ot)).join(" · ")));
}

function renderPlayoffs(data, player) {
  const host = document.getElementById("t-playoffs");
  const sections = (data.brackets || []).map((bracket) => {
    const columns = bracket.rounds.map((round) => el("section", { class: "t-round" },
      el("h3", { class: "t-round-title" }, round.name),
      el("ol", { class: "t-series-list" }, round.series.map((s) => seriesCard(s, player)))));
    if (bracket.other.length) {
      columns.push(el("section", { class: "t-round" },
        el("h3", { class: "t-round-title" }, "Placement"),
        el("ol", { class: "t-series-list" }, bracket.other.map((s) => seriesCard(s, player)))));
    }
    const sub = bracket.champion
      ? el("span", { class: "sec-sub" }, "Won by ", player(bracket.champion))
      : null;
    return el("div", { class: "wrap section" },
      el("div", { class: "sec-head" }, el("h2", { class: "sec-title" }, bracket.label), sub),
      el("div", { class: "t-bracket" }, columns));
  });
  host.replaceChildren(...sections);
}

function standingsTable(rows, player, caption) {
  const head = el("tr", {},
    el("th", { scope: "col", class: "num" }, "#"),
    el("th", { scope: "col" }, "Player"),
    ...[["P", "Played"], ["W", "Won"], ["D", "Drawn"], ["L", "Lost"], ["Goals", "Goals for and against"],
      ["Pts", "Points"]]
      .map(([label, title]) => el("th", { scope: "col", class: "num" },
        el("abbr", { title }, label))));
  const body = rows.map((row, index) => el("tr", {},
    el("td", { class: "num" }, String(index + 1)),
    el("td", {}, player(row.id)),
    el("td", { class: "num" }, String(row.p)),
    el("td", { class: "num" }, String(row.w)),
    el("td", { class: "num" }, String(row.d)),
    el("td", { class: "num" }, String(row.l)),
    el("td", { class: "num" }, `${row.gf}–${row.ga}`),
    el("td", { class: "num t-pts" }, String(row.pts))));
  return el("div", { class: "panel t-table-wrap" },
    el("table", { class: "t-table" },
      el("caption", { class: "sr-only" }, caption),
      el("thead", {}, head),
      el("tbody", {}, body)));
}

// A few stages show open; a long list of qualifying groups starts folded so the
// bracket and upsets stay near the top.
function renderRoundRobin(data, player) {
  const host = document.getElementById("t-round-robin");
  const stages = data.round_robin || [];
  const startOpen = stages.length <= 2;
  const items = stages.map((stage) => {
    const many = stage.groups.length > 1;
    const playerCount = stage.groups.reduce((sum, rows) => sum + rows.length, 0);
    // Plain text: a link inside <summary> would be a control nested in a control.
    const leaderId = stage.groups.length === 1 ? stage.groups[0][0]?.id : null;
    const leader = leaderId
      ? `Top: ${decodeHtmlEntities(data.players?.[String(leaderId)] || `Player ${leaderId}`)}`
      : `${stage.groups.length} groups`;
    return el("details", { class: "t-stage", open: startOpen },
      el("summary", { class: "t-stage-summary" },
        el("span", { class: "t-stage-name" }, stage.name),
        el("span", { class: "sec-sub" }, `${formatNumber(playerCount)} players · ${leader}`)),
      el("div", { class: "t-groups" }, stage.groups.map((rows, index) => {
        const label = many ? `Group ${index + 1}` : stage.name;
        return el("div", { class: "t-group" },
          many ? el("h3", { class: "t-round-title" }, label) : null,
          standingsTable(rows, player, label));
      })));
  });
  host.replaceChildren(...(items.length ? [el("div", { class: "wrap section" },
    el("div", { class: "sec-head" },
      el("h2", { class: "sec-title" }, "Round-robin"),
      el("span", { class: "sec-sub" }, "Standings with 2 points for a win and 1 for a draw")),
    el("div", { class: "t-stages" }, items))] : []));
}

function showError(message) {
  document.getElementById("t-title").textContent = "Tournament not found";
  document.getElementById("t-error-text").textContent = message;
  document.getElementById("t-error").hidden = false;
}

async function init() {
  initChrome();
  const main = document.getElementById("main");
  const id = new URLSearchParams(window.location.search).get("id") || "";
  try {
    if (!ID_RE.test(id)) {
      showError("This link does not name a tournament.");
      return;
    }
    const response = await fetch(tournamentDataPath(id));
    const bucket = response.ok ? await response.json() : null;
    const data = bucket?.[id];
    if (!data) {
      showError("We have no games recorded for this tournament.");
      return;
    }
    data.name = decodeHtmlEntities(data.name);
    const player = makePlayerLink(data);
    renderHeader(data);
    renderPodium(data, player);
    renderUpsets(data, player);
    renderPlayoffs(data, player);
    renderRoundRobin(data, player);
    document.getElementById("t-content").hidden = false;
  } catch (error) {
    console.error(error);
    showError("The tournament could not be loaded. Please refresh to try again.");
  } finally {
    main.removeAttribute("aria-busy");
  }
}

init();
