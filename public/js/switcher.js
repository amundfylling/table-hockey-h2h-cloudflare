// Matchup hero player switcher: tapping a name opens a small search of the
// other player's opponents, so one side of the matchup can be swapped without
// leaving the page. The player's career stays one tap away in the same popover.
import { state, elements } from "./state.js";
import { formatNumber } from "./utils.js";
import { getSelectionIds } from "./players.js";
import { fetchOpponentCounts } from "./data.js";
import { buildOpponentSuggestions, createSuggestionIdentity } from "./typeahead.js";
import { el, icon, ICONS, requestView } from "./dom.js";

let openSwitcher = null;
let switcherCount = 0;

export function closePlayerSwitcher({ restoreFocus = false } = {}) {
  const current = openSwitcher;
  if (!current) return;
  openSwitcher = null;
  current.close(restoreFocus);
}

// Opponents of the player who stays, ready to fill the empty side.
function keptSelection(side) {
  const keptSide = side === "a" ? "b" : "a";
  const player = keptSide === "a" ? state.playerA : state.playerB;
  return { player, ids: sideIds(keptSide, player) };
}

function pickIds(pick) {
  if (pick.isGroup && pick.ids?.length) return pick.ids;
  return [Number(pick.id)];
}

function openMatchup(side, kept, pick) {
  const pickedIds = pickIds(pick);
  const keptId = Number(kept.player.id);
  if (side === "b") {
    requestView({ p1: keptId, p1Ids: kept.ids, p2: Number(pick.id), p2Ids: pickedIds });
  } else {
    requestView({ p1: Number(pick.id), p1Ids: pickedIds, p2: keptId, p2Ids: kept.ids });
  }
}

// Builds the name button plus its popover for one side of the matchup hero.
export function createPlayerSwitcher(player, side, careerIds) {
  switcherCount += 1;
  const uid = `switch-${side}-${switcherCount}`;
  const listId = `${uid}-list`;
  const other = side === "a" ? state.playerB : state.playerA;

  const trigger = el("button", {
    class: "name switch-trigger",
    type: "button",
    "aria-haspopup": "dialog",
    "aria-expanded": "false",
    "aria-controls": uid,
    title: `Change ${player.name} or open their career`,
  }, el("span", { class: "switch-name" }, player.name), icon(ICONS.down, "switch-chevron"));

  const input = el("input", {
    type: "text",
    autocomplete: "off",
    spellcheck: "false",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "true",
    "aria-controls": listId,
    "aria-label": `Search players ${other.name} has faced`,
    placeholder: "Search opponents",
  });
  const list = el("div", { id: listId, class: "typeahead switcher-list", role: "listbox", "aria-label": "Opponents" });
  const career = el("button", { class: "switcher-career", type: "button" },
    el("span", {}, `View ${player.name}'s career`), icon(ICONS.right));

  const popover = el("div", {
    id: uid,
    class: `switcher switcher--${side}`,
    role: "dialog",
    "aria-label": `Change ${player.name}`,
    hidden: true,
  },
  el("p", { class: "switcher-head" }, el("span", { class: "switcher-kept" }, other.name), " vs"),
  el("div", { class: "input-shell switcher-search" },
    icon(["M20 20l-3.5-3.5", "M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"], "input-icon"),
    input),
  list,
  career);

  let opponents = null;
  let items = [];
  let activeIndex = -1;
  let loadController = null;

  const message = (text) => {
    items = [];
    activeIndex = -1;
    input.removeAttribute("aria-activedescendant");
    list.replaceChildren(el("div", { class: "empty-message", role: "option", "aria-disabled": "true" }, text));
  };

  const render = () => {
    if (!opponents) return;
    // The player being replaced is already on screen, so leave them out.
    const currentIds = new Set(sideIds(side, player));
    items = buildOpponentSuggestions(input.value, opponents, 40)
      .filter((item) => !currentIds.has(Number(item.id)));
    if (!items.length) {
      message(input.value.trim() ? "No opponents match" : "No other opponents yet");
      return;
    }
    if (activeIndex >= items.length) activeIndex = items.length - 1;
    list.replaceChildren(...items.map((item, index) => {
      const games = item.totalMatches != null && !item.inGroup
        ? `${formatNumber(item.totalMatches)} game${item.totalMatches === 1 ? "" : "s"}`
        : item.inGroup ? `#${item.id}` : "";
      return el("button", {
        id: `${listId}-${index}`,
        type: "button",
        role: "option",
        tabindex: "-1",
        class: index === activeIndex ? "is-active" : null,
        "aria-selected": index === activeIndex ? "true" : "false",
        dataset: { index: String(index) },
      }, createSuggestionIdentity(item), games ? el("span", { class: "game-count" }, games) : null);
    }));
    if (activeIndex >= 0) {
      input.setAttribute("aria-activedescendant", `${listId}-${activeIndex}`);
      list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  };

  const choose = (item) => {
    if (!item) return;
    const kept = keptSelection(side);
    closePlayerSwitcher();
    openMatchup(side, kept, item);
  };

  const load = async () => {
    if (opponents) return render();
    message("Loading opponents…");
    const kept = keptSelection(side);
    loadController = new AbortController();
    try {
      opponents = await fetchOpponentCounts(Number(kept.player.id), kept.ids, loadController.signal);
      if (!popover.hidden) render();
    } catch (err) {
      if (loadController?.signal.aborted) return;
      console.error("Could not load opponents:", err);
      message("Could not load opponents");
    }
  };

  const onOutside = (event) => {
    if (!popover.contains(event.target) && !trigger.contains(event.target)) closePlayerSwitcher();
  };

  const handle = {
    close(restoreFocus) {
      popover.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      trigger.closest(".who")?.classList.remove("is-switching");
      document.removeEventListener("pointerdown", onOutside, true);
      loadController?.abort();
      loadController = null;
      if (restoreFocus) trigger.focus();
    },
  };

  const open = () => {
    closePlayerSwitcher();
    openSwitcher = handle;
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    trigger.closest(".who")?.classList.add("is-switching");
    document.addEventListener("pointerdown", onOutside, true);
    input.value = "";
    activeIndex = -1;
    load();
    input.focus({ preventScroll: true });
  };

  trigger.addEventListener("click", () => {
    if (openSwitcher === handle) closePlayerSwitcher();
    else open();
  });

  input.addEventListener("input", () => {
    activeIndex = -1;
    render();
  });

  popover.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      // Keep the global Escape handler from also closing the finder.
      event.stopPropagation();
      closePlayerSwitcher({ restoreFocus: true });
      return;
    }
    if (event.target !== input || !items.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      activeIndex = (activeIndex + step + items.length) % items.length;
      render();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[activeIndex] || items[0]);
    }
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest("button[data-index]");
    if (option) choose(items[Number(option.dataset.index)]);
  });

  career.addEventListener("click", () => {
    closePlayerSwitcher();
    requestView({ p1: Number(player.id), p1Ids: careerIds });
  });

  return { trigger, popover };
}

function sideIds(side, player) {
  const input = side === "a" ? elements.playerA : elements.playerB;
  const ids = input ? getSelectionIds(input) : [];
  return ids.length ? ids : [Number(player.id)];
}
