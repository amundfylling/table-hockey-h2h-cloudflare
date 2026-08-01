import { state, elements, isSeriesMode } from "./state.js";
import { formatDateRange } from "./utils.js";
import { formatSeriesScore, formatSeriesLength } from "./series.js";

const GENERATIONAL_RUN_MIN = 10;
const PLAYED_RUN_LIMIT = 24;
const playedRunKeys = new Set();

let presentationGeneration = 0;
let activeRunCleanup = null;

export function updateFormTitle() {
  if (!elements.formTitle) return;
  const label = isSeriesMode() ? "Series form" : "Game form";
  if (state.playerA && state.playerA.name) {
    elements.formTitle.textContent = `${label} (last 10 - ${state.playerA.name})`;
  } else {
    elements.formTitle.textContent = `${label} (last 10)`;
  }
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getFormItemIdentity(item = {}) {
  const value = item || {};
  return [
    value.source || "",
    value.source_tournament_id ?? value.tournament_id ?? "",
    value.source_stage_id ?? value.stage_id ?? "",
    value.source_match_id || "",
    value.opponent_id ?? "",
    value.date || "",
    value.stage_sequence ?? "",
    value.round_number ?? "",
    value.playoff_game_number ?? "",
    value.goals_a ?? value.game_wins_a ?? "",
    value.goals_b ?? value.game_wins_b ?? "",
  ].join("|");
}

export function getChronologicalItems(items) {
  return [...items].sort((a, b) => {
    const numericFields = ["ts", "stage_sequence", "round_number", "playoff_game_number"];
    for (const field of numericFields) {
      const difference = numberOrZero(a[field]) - numberOrZero(b[field]);
      if (difference) return difference;
    }

    const sourceIdDifference = numberOrZero(a.source_match_id) - numberOrZero(b.source_match_id);
    if (sourceIdDifference) return sourceIdDifference;

    const identityA = getFormItemIdentity(a);
    const identityB = getFormItemIdentity(b);
    if (identityA < identityB) return -1;
    if (identityA > identityB) return 1;
    return 0;
  });
}

export function getCurrentWinStreak(items) {
  const ordered = getChronologicalItems(items);
  const latest = ordered[ordered.length - 1];
  if (!latest || latest.result !== "A") return 0;

  let count = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index].result !== "A") break;
    count += 1;
  }

  return count;
}

function getLatestItem(items) {
  const ordered = getChronologicalItems(items);
  return ordered[ordered.length - 1] || null;
}

export function getStreakPresentation(viewItems, canonicalItems = viewItems) {
  const viewStreak = getCurrentWinStreak(viewItems);
  const canonicalStreak = getCurrentWinStreak(canonicalItems);
  const viewLatestIdentity = getFormItemIdentity(getLatestItem(viewItems));
  const canonicalLatestIdentity = getFormItemIdentity(getLatestItem(canonicalItems));
  const sameEndpoint = Boolean(viewLatestIdentity)
    && viewLatestIdentity === canonicalLatestIdentity;
  const isGenerational = viewStreak >= GENERATIONAL_RUN_MIN
    && canonicalStreak >= GENERATIONAL_RUN_MIN
    && sameEndpoint;
  const isFilteredView = canonicalItems !== viewItems && (
    canonicalItems.length !== viewItems.length
    || canonicalStreak !== viewStreak
    || !sameEndpoint
  );

  return {
    viewStreak,
    canonicalStreak,
    streak: isGenerational ? canonicalStreak : viewStreak,
    isGenerational,
    isFilteredView,
    latestIdentity: canonicalLatestIdentity || viewLatestIdentity,
  };
}

export function allowsGenerationalMotion({
  supportsObserver,
  visibilityState,
  reducedMotion,
  forcedColors,
}) {
  return Boolean(supportsObserver)
    && visibilityState !== "hidden"
    && !reducedMotion
    && !forcedColors;
}

function canAnimateGenerationalRun() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return allowsGenerationalMotion({
    supportsObserver: typeof IntersectionObserver === "function",
    visibilityState: document.visibilityState,
    reducedMotion: Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
    forcedColors: Boolean(window.matchMedia?.("(forced-colors: active)").matches),
  });
}

function appendTextPart(parent, className, text, hidden = false) {
  const part = document.createElement("span");
  part.className = className;
  part.textContent = text;
  if (hidden) part.setAttribute("aria-hidden", "true");
  parent.appendChild(part);
  return part;
}

export function createCurrentStreakChip(items, canonicalItems = items) {
  const presentation = getStreakPresentation(items, canonicalItems);
  if (presentation.streak < 3) return null;

  const itemLabel = isSeriesMode() ? "series" : "game";
  const itemPlural = itemLabel === "series" ? "series" : "games";
  const playerName = state.playerA?.name || "Player 1";
  const canReplay = presentation.isGenerational && canAnimateGenerationalRun();
  const chip = document.createElement(canReplay ? "button" : "span");
  const baseTitle = `${playerName} has won ${presentation.streak} ${itemPlural} in a row`;
  const generationalTitle = `Generational run. ${baseTitle}.`;

  if (canReplay) chip.type = "button";
  chip.className = "streak-chip";
  chip.dataset.streak = String(presentation.streak);
  chip.dataset.generational = presentation.isGenerational ? "true" : "false";

  if (presentation.isGenerational) {
    chip.classList.add("is-exceptional");
    appendTextPart(chip, "streak-chip__flame", "🔥", true);
    appendTextPart(chip, "streak-chip__count", String(presentation.streak), true);
    appendTextPart(chip, "streak-chip__unit", `-${itemLabel} streak`, true);
    appendTextPart(chip, "streak-chip__honor", "Generational run", true);
    if (canReplay) appendTextPart(chip, "streak-chip__replay", "↻", true);
    if (!canReplay) {
      appendTextPart(chip, "sr-only", generationalTitle);
      chip.setAttribute("role", "status");
    }
  } else {
    chip.textContent = `${presentation.streak}-${itemLabel} streak`;
    if (presentation.isFilteredView) chip.classList.add("is-view-scoped");
  }

  let title = presentation.isGenerational ? generationalTitle : baseTitle;
  if (!presentation.isGenerational && presentation.isFilteredView) {
    title += " in the current filtered view";
  }
  if (canReplay) title += " Activate to replay the celebration.";
  chip.title = title;
  if (canReplay || !presentation.isGenerational) {
    chip.setAttribute("aria-label", title);
  }
  return chip;
}

function rememberRunKey(key) {
  playedRunKeys.delete(key);
  playedRunKeys.add(key);
  while (playedRunKeys.size > PLAYED_RUN_LIMIT) {
    playedRunKeys.delete(playedRunKeys.values().next().value);
  }
}

function buildRunKey(presentation) {
  return [
    state.playerA?.id ?? "player-a",
    state.playerB?.id ?? "all-opponents",
    isSeriesMode() ? "series" : "games",
    state.stageTab || "overall",
    presentation.streak,
    presentation.latestIdentity,
  ].join(":");
}

function createRunLane() {
  const lane = document.createElement("span");
  lane.className = "generational-lane";
  lane.setAttribute("aria-hidden", "true");

  const track = document.createElement("span");
  track.className = "generational-lane__track";
  lane.appendChild(track);

  const runner = document.createElement("span");
  runner.className = "generational-runner";
  appendTextPart(runner, "generational-runner__trail", "");
  appendTextPart(runner, "generational-runner__flame", "🔥");
  appendTextPart(runner, "generational-runner__figure", "🏃");
  lane.appendChild(runner);

  return lane;
}

function centerWithinContainer(element, container) {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return {
    x: elementRect.left - containerRect.left + container.scrollLeft + elementRect.width / 2,
    y: elementRect.top - containerRect.top + container.scrollTop + elementRect.height / 2,
    height: elementRect.height,
  };
}

export function resetFormPresentation() {
  presentationGeneration += 1;
  if (activeRunCleanup) activeRunCleanup();
  activeRunCleanup = null;

  const container = elements.formChips;
  if (!container) return;
  container.classList.remove("is-generational-running");
  container.querySelector(".generational-lane")?.remove();
  container.querySelectorAll(".chip.is-run-lit").forEach((chip) => {
    chip.classList.remove("is-run-lit");
    chip.style.removeProperty("--run-delay");
  });
  container.querySelector(".streak-chip.is-celebrating")
    ?.classList.remove("is-celebrating");
}

export function setupGenerationalRun(
  matches,
  canonicalItems,
  streakChip,
  presentation = getStreakPresentation(matches, canonicalItems)
) {
  if (!presentation.isGenerational || !streakChip || !canAnimateGenerationalRun()) return;

  const container = elements.formChips;
  const generation = presentationGeneration;
  const runKey = buildRunKey(presentation);
  let observer = null;
  let animationFrame = null;
  let lane = null;
  let finishListenersAttached = false;

  const clearVisuals = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
    lane?.remove();
    lane = null;
    container.classList.remove("is-generational-running");
    container.querySelectorAll(".chip.is-run-lit").forEach((chip) => {
      chip.classList.remove("is-run-lit");
      chip.style.removeProperty("--run-delay");
    });
    streakChip.classList.remove("is-celebrating");
  };

  const detachFinishListeners = () => {
    if (!finishListenersAttached) return;
    finishListenersAttached = false;
    streakChip.removeEventListener("animationend", finishRun);
    streakChip.removeEventListener("animationcancel", finishRun);
  };

  const finishRun = (event) => {
    if (event.animationName !== "generational-streak-finale") return;
    detachFinishListeners();
    clearVisuals();
  };

  const attachFinishListeners = () => {
    detachFinishListeners();
    finishListenersAttached = true;
    streakChip.addEventListener("animationend", finishRun);
    streakChip.addEventListener("animationcancel", finishRun);
  };

  const startRun = () => {
    if (generation !== presentationGeneration || !streakChip.isConnected) return;
    if (!canAnimateGenerationalRun()) return;
    observer?.disconnect();
    observer = null;
    detachFinishListeners();
    clearVisuals();

    const winChips = [...container.querySelectorAll(".chip.win")].slice(-10);
    if (winChips.length < GENERATIONAL_RUN_MIN) return;

    const start = centerWithinContainer(winChips[0], container);
    const finish = centerWithinContainer(streakChip, container);
    lane = createRunLane();
    lane.style.setProperty("--run-start-x", `${start.x}px`);
    lane.style.setProperty("--run-track-y", `${start.y + start.height / 2 - 2}px`);
    lane.style.setProperty("--run-distance", `${Math.max(0, finish.x - start.x)}px`);
    container.appendChild(lane);

    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      if (generation !== presentationGeneration || !lane?.isConnected) return;
      container.classList.add("is-generational-running");
      lane.classList.add("is-active");
      winChips.forEach((chip, index) => {
        chip.style.setProperty("--run-delay", `${140 + index * 145}ms`);
        chip.classList.add("is-run-lit");
      });
      streakChip.classList.add("is-celebrating");
      attachFinishListeners();
      rememberRunKey(runKey);
    });
  };

  const replayRun = () => startRun();
  streakChip.addEventListener("click", replayRun);

  activeRunCleanup = () => {
    observer?.disconnect();
    observer = null;
    detachFinishListeners();
    clearVisuals();
    streakChip.removeEventListener("click", replayRun);
  };

  if (!playedRunKeys.has(runKey)) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startRun();
    }, { threshold: 0.5, rootMargin: "0px 0px -8% 0px" });
    observer.observe(container);
  }
}

export function renderForm(matches, canonicalItems = matches) {
  resetFormPresentation();
  elements.formChips.replaceChildren();
  if (elements.formDetail) {
    elements.formDetail.textContent = "";
    elements.formDetail.hidden = true;
  }
  if (!matches.length) {
    elements.formChips.innerHTML = "<span class=\"muted\">No matches</span>";
    return;
  }

  const ordered = getChronologicalItems(matches).slice(-10);
  const fragment = document.createDocumentFragment();
  ordered.forEach((match) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    const tournament = match.tournament_name || "Unknown tournament";
    const stage = match.stage ? ` | ${match.stage}` : "";
    const opponentName = match.opponent_name || state.playerB?.name || "Opponent";
    if (match.type === "series") {
      chip.title = `${formatDateRange(match.date, match.end_date)} | ${state.playerA.name} ${formatSeriesScore(match)} ${opponentName} | ${formatSeriesLength(match)} | ${tournament}${stage}`;
    } else {
      chip.title = `${match.date || "Unknown date"} | ${state.playerA.name} ${match.goals_a}-${match.goals_b} ${opponentName} | ${tournament}${stage}`;
    }
    if (match.result === "A") {
      chip.textContent = "W";
      chip.classList.add("win");
    } else if (match.result === "B") {
      chip.textContent = "L";
      chip.classList.add("loss");
    } else {
      chip.textContent = "D";
      chip.classList.add("draw");
    }
    chip.setAttribute("aria-label", chip.title);
    const showDetail = () => {
      if (!elements.formDetail) return;
      elements.formDetail.textContent = chip.title;
      elements.formDetail.hidden = false;
    };
    chip.addEventListener("focus", showDetail);
    chip.addEventListener("click", showDetail);
    fragment.appendChild(chip);
  });

  const presentation = getStreakPresentation(matches, canonicalItems);
  const streakChip = createCurrentStreakChip(matches, canonicalItems);
  if (streakChip) fragment.appendChild(streakChip);
  elements.formChips.appendChild(fragment);
  if (streakChip) {
    setupGenerationalRun(matches, canonicalItems, streakChip, presentation);
  }
}
