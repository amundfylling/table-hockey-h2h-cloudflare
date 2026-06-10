import { state, elements, isSeriesMode } from "./state.js";
import { formatDateRange } from "./utils.js";
import { formatSeriesScore, formatSeriesLength } from "./series.js";

export function updateFormTitle() {
  if (!elements.formTitle) return;
  const label = isSeriesMode() ? "Series form" : "Game form";
  if (state.playerA && state.playerA.name) {
    elements.formTitle.textContent = `${label} (last 10 - ${state.playerA.name})`;
  } else {
    elements.formTitle.textContent = `${label} (last 10)`;
  }
}

export function getChronologicalItems(items) {
  return [...items].sort((a, b) => {
    const seqA = a.stage_sequence ?? 0;
    const seqB = b.stage_sequence ?? 0;
    const roundA = a.round_number ?? 0;
    const roundB = b.round_number ?? 0;
    const gameA = a.playoff_game_number ?? 0;
    const gameB = b.playoff_game_number ?? 0;
    return a.ts - b.ts || seqA - seqB || roundA - roundB || gameA - gameB;
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

export function createCurrentStreakChip(items) {
  const streak = getCurrentWinStreak(items);
  if (streak < 3) return null;

  const chip = document.createElement("span");
  const itemLabel = isSeriesMode() ? "series" : "game";
  const baseTitle = `${state.playerA?.name || "Player 1"} has won ${streak} ${itemLabel}s in a row`;
  chip.className = "streak-chip";
  chip.textContent = `🔥 ${streak}`;
  chip.title = streak >= 7 ? `Generational run. ${baseTitle}` : baseTitle;
  chip.setAttribute("aria-label", chip.title);
  return chip;
}

export function setupGenerationalRun(matches, streakChip, fragment) {
  const streak = getCurrentWinStreak(matches);
  if (streak < 10) return;

  elements.formChips.classList.add("has-generational-run");

  // Glowing Neon Track
  const track = document.createElement("div");
  track.className = "generational-track";
  fragment.appendChild(track);

  // Runner Emojis (Flame runner 🔥🏃‍♂️)
  const runner = document.createElement("span");
  runner.className = "generational-runner";
  runner.innerHTML = `
    <span class="runner-flame">🔥</span>
    <span class="runner-emoji">🏃‍♂️</span>
  `;
  fragment.appendChild(runner);

  // Upgraded Text Banner
  const runText = document.createElement("div");
  runText.className = "generational-run-text";
  runText.textContent = "👑 Generational run!";
  fragment.appendChild(runText);

  // Mark the streak chip to celebrate at the end of the run
  streakChip.classList.add("burst");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Find win chips inside formChips container
        const winChips = elements.formChips.querySelectorAll(".chip.win");
        if (winChips.length > 0) {
          const firstChip = winChips[0];
          const lastChip = winChips[winChips.length - 1];
          
          const startX = firstChip.offsetLeft + (firstChip.offsetWidth / 2) - 10;
          const endX = lastChip.offsetLeft + (lastChip.offsetWidth / 2) - 10;
          const runnerY = firstChip.offsetTop - 20;

          elements.formChips.style.setProperty("--runner-start-x", `${startX}px`);
          elements.formChips.style.setProperty("--runner-end-x", `${endX}px`);
          elements.formChips.style.setProperty("--runner-y", `${runnerY}px`);

          let flameDropX = 35; // Default fallback
          if (streakChip) {
            const lastChipCenter = lastChip.offsetLeft + (lastChip.offsetWidth / 2);
            const streakChipCenter = streakChip.offsetLeft + (streakChip.offsetWidth / 2);
            flameDropX = streakChipCenter - lastChipCenter;
          }
          elements.formChips.style.setProperty("--flame-drop-x", `${flameDropX}px`);

          // Add sequential lighting delay to each Win chip
          winChips.forEach((chip, index) => {
            // Stagger ignite based on horizontal position relative to the track length
            const delay = (index / winChips.length) * 4.2;
            chip.style.animationDelay = `${delay}s`;
            chip.classList.add("ignite");
          });
        }

        // Start animations
        track.classList.add("animate-run");
        runner.classList.add("animate-run");
        runText.classList.add("animate-run");
        observer.disconnect();

        // Graceful cleanup after animations finish
        setTimeout(() => {
          runner.classList.add("animate-hide");
          runText.classList.add("animate-hide");
          track.style.transition = "opacity 0.5s ease";
          track.style.opacity = "0";
          setTimeout(() => {
            runner.remove();
            runText.remove();
            track.remove();
            
            // Revert win chips back to original styles
            const winChips = elements.formChips.querySelectorAll(".chip.win");
            winChips.forEach((chip) => {
              chip.classList.remove("ignite");
              chip.style.animationDelay = "";
            });
            
            // Revert streak chip back to normal
            if (streakChip) {
              streakChip.classList.remove("burst");
            }

            // Remove the generational class to restore normal layout padding and streak chip display
            elements.formChips.classList.remove("has-generational-run");
          }, 500);
        }, 5500);
      }
    });
  }, { threshold: 0.1 });
  observer.observe(streakChip);
}

export function renderForm(matches) {
  elements.formChips.innerHTML = "";
  elements.formChips.classList.remove("has-generational-run");
  if (!matches.length) {
    elements.formChips.innerHTML = "<span class=\"muted\">No matches</span>";
    return;
  }
  const ordered = getChronologicalItems(matches).slice(-10);
  const fragment = document.createDocumentFragment();
  ordered.forEach((match) => {
    const chip = document.createElement("span");
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
    fragment.appendChild(chip);
  });
  const streakChip = createCurrentStreakChip(matches);
  if (streakChip) {
    fragment.appendChild(streakChip);
    setupGenerationalRun(matches, streakChip, fragment);
  }
  elements.formChips.appendChild(fragment);
}
