// Story rail: a section tracker that sums up the page as you scroll. On wide screens
// it is a sticky column beside the content, with one finding per section; on smaller
// screens it is a slim bar at the top that names the section you are in and opens the
// full list on tap. The findings come from story-lines.js.
import { state, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { getAliasGroup, getPlayerById } from "./players.js";
import {
  groupTournaments,
  lastName,
  nationEdges,
  opponentRecords,
  scorelineGrid,
  seasonsOf,
} from "./insights.js";
import { getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { matchupStory, playerStory } from "./story-lines.js";

// [data-story value, finding key, label] in page order.
const SECTIONS = {
  matchup: [
    ["summary", "record", "The record"],
    ["lead", "lead", "The lead"],
    ["tape", "tape", "Tale of the tape"],
    ["seasons", "seasons", "Seasons"],
    ["tournaments", "tournaments", "Tournaments"],
    ["games", "games", "Every game"],
  ],
  player: [
    ["summary", "overview", "Overview"],
    ["rating", "rating", "Rating"],
    ["nations", "nations", "Nations"],
    ["win-rate", "seasons", "Seasons"],
    ["rivals", "rivals", "Rivals"],
    ["opponents", "opponents", "Opponents"],
    ["games", "games", "Every game"],
  ],
};

let rail = null;
let bar = null;
let entries = [];
let active = -1;
let frame = 0;
let listening = false;

function ratingOf(playerId) {
  for (const id of getAliasGroup(playerId)) {
    const rating = state.playerFileCache.get(id)?.rating;
    if (rating && Array.isArray(rating.history) && rating.history.length) return rating;
  }
  return null;
}

function findings(items) {
  const ordered = getChronologicalItems(items);
  const series = isSeriesMode();
  const seasons = seasonsOf(items);
  if (isSinglePlayerMode()) {
    const rating = ratingOf(state.playerA.id);
    return playerStory({
      ordered,
      series,
      rating,
      edges: nationEdges(rating?.nations),
      seasons,
      records: opponentRecords(items, (id) => getAliasGroup(id)[0], (id) => getPlayerById(id)?.name),
    });
  }
  return matchupStory({
    ordered,
    nameA: state.playerA.name,
    nameB: state.playerB.name,
    series,
    // Tournaments are always grouped from games, as in the Tournaments section.
    tournaments: groupTournaments(series ? items.flatMap((item) => item.games || []) : items),
    grid: items.length ? scorelineGrid(items, { series }) : null,
    seasons,
  });
}

function isShown(el) {
  return Boolean(el) && !el.hidden && el.getClientRects().length > 0;
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function scrollToEntry(index) {
  const entry = entries[index];
  if (!entry) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  entry.el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  setBarOpen(false);
}

function buildList(className) {
  const list = make("ol", className);
  entries.forEach((entry, index) => {
    const item = make("li", "story-item");
    const button = make("button", "story-link");
    button.type = "button";
    button.append(make("span", "story-name", entry.label));
    if (entry.text) button.append(make("span", "story-text", entry.text));
    button.addEventListener("click", () => scrollToEntry(index));
    item.append(button);
    list.append(item);
  });
  return list;
}

function ensureElements() {
  const main = document.getElementById("main");
  if (!main) return false;
  if (!rail) {
    rail = make("nav", "story-rail");
    rail.setAttribute("aria-label", "On this page");
    main.prepend(rail);
  }
  if (!bar) {
    bar = make("div", "story-bar");
    document.body.append(bar);
    document.addEventListener("click", (event) => {
      if (bar.classList.contains("is-open") && !bar.contains(event.target)) setBarOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && bar.classList.contains("is-open")) {
        setBarOpen(false);
        bar.querySelector(".story-bar-toggle")?.focus();
      }
    });
  }
  return true;
}

function setBarOpen(open) {
  if (!bar) return;
  bar.classList.toggle("is-open", open);
  bar.querySelector(".story-bar-toggle")?.setAttribute("aria-expanded", String(open));
}

function title() {
  if (isSinglePlayerMode()) return state.playerA?.name || "";
  return `${lastName(state.playerA?.name)} vs ${lastName(state.playerB?.name)}`;
}

// Called before the charts render so they measure the narrower column.
export function prepareStory() {
  document.body.classList.add("has-story");
}

export function clearStory() {
  entries = [];
  active = -1;
  document.body.classList.remove("has-story");
  rail?.replaceChildren();
  bar?.replaceChildren();
}

export function renderStory(items) {
  if (!state.playerA || (!isSinglePlayerMode() && !state.playerB) || !items.length) {
    clearStory();
    return;
  }
  if (!ensureElements()) return;
  const story = findings(items);
  const config = SECTIONS[isSinglePlayerMode() ? "player" : "matchup"];
  entries = config
    .map(([key, finding, label]) => ({
      el: document.querySelector(`[data-story="${key}"]`),
      text: story[finding] || "",
      label,
    }))
    .filter((entry) => isShown(entry.el));
  if (entries.length < 3) {
    clearStory();
    return;
  }

  const head = make("p", "story-head", title());
  const track = make("div", "story-track");
  track.append(make("span", "story-fill"), buildList("story-list"));
  rail.replaceChildren(head, track);

  const toggle = make("button", "story-bar-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "story-bar-panel");
  const panel = buildList("story-list story-bar-panel");
  panel.id = "story-bar-panel";
  bar.replaceChildren(toggle, panel);
  toggle.addEventListener("click", () => setBarOpen(!bar.classList.contains("is-open")));

  document.body.classList.add("has-story");
  active = -1;
  listen();
  update();
}

function update() {
  frame = 0;
  if (!entries.length) return;
  const line = window.innerHeight * 0.35;
  let index = 0;
  entries.forEach((entry, i) => {
    if (entry.el.getBoundingClientRect().top <= line) index = i;
  });
  const doc = document.documentElement;
  if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2) index = entries.length - 1;
  if (index === active) return;
  active = index;

  [rail, bar].forEach((root) => {
    root?.querySelectorAll(".story-item").forEach((item, i) => {
      item.classList.toggle("is-past", i < index);
      const button = item.firstElementChild;
      if (i === index) button.setAttribute("aria-current", "location");
      else button.removeAttribute("aria-current");
    });
  });
  const current = rail?.querySelectorAll(".story-item")[index];
  const fill = rail?.querySelector(".story-fill");
  if (current && fill) fill.style.height = `${current.offsetTop + 14}px`;

  const toggle = bar?.querySelector(".story-bar-toggle");
  if (toggle) {
    const entry = entries[index];
    const top = make("span", "story-bar-top");
    top.append(
      make("span", "story-bar-where", `${title()} · ${entry.label}`),
      make("span", "story-bar-count", `${index + 1} / ${entries.length}`)
    );
    const steps = make("span", "story-bar-steps");
    steps.setAttribute("aria-hidden", "true");
    entries.forEach((_, i) => steps.append(make("i", i < index ? "is-past" : i === index ? "is-on" : "")));
    toggle.replaceChildren(top);
    if (entry.text) toggle.append(make("span", "story-bar-text", entry.text));
    toggle.append(steps);
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    active = -1;
    schedule();
  });
}
