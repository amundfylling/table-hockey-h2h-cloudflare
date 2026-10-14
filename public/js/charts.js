import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { escapeHtml, formatDateRange } from "./utils.js";
import { SVG_TREND, SVG_BAR_CHART } from "./constants.js";

export function formatAxisValue(value) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value));
}

export function ensureChartTooltip(container) {
  let tooltip = container.querySelector(".chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-live", "polite");
    tooltip.setAttribute("aria-hidden", "true");
    container.appendChild(tooltip);
  }
  return tooltip;
}

export function showChartTooltip(container, tooltip, html, anchorX1, anchorX2, y) {
  tooltip.innerHTML = html;
  // Reset to the origin before measuring so the box reports its natural size,
  // not a size constrained by the previous position.
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  tooltip.classList.add("is-visible");
  tooltip.setAttribute("aria-hidden", "false");
  const bounds = container.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const margin = 8;
  const gap = 14;
  const maxLeft = Math.max(margin, bounds.width - width - margin);
  const maxTop = Math.max(margin, bounds.height - height - margin);
  const centerX = (anchorX1 + anchorX2) / 2;
  const fitsRight = anchorX2 + gap + width <= bounds.width - margin;
  const fitsLeft = anchorX1 - gap - width >= margin;
  const fitsAbove = y - height - gap >= margin;
  const fitsBelow = y + gap + height <= bounds.height - margin;

  let left;
  let top;
  // Beside the hovered region keeps the point/bars visible; above is the fallback.
  const placeSide = () => {
    if (fitsRight) left = anchorX2 + gap;
    else if (fitsLeft) left = anchorX1 - gap - width;
    top = Math.min(Math.max(y - height / 2, margin), maxTop);
    return fitsRight || fitsLeft;
  };
  const placeVertical = () => {
    left = Math.min(Math.max(centerX - width / 2, margin), maxLeft);
    if (fitsAbove) top = y - height - gap;
    else if (fitsBelow) top = y + gap;
    else top = y + gap;
  };

  // Preserve the data under inspection: side, then above, then below.
  if (!placeSide()) placeVertical();
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideChartTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.setAttribute("aria-hidden", "true");
}

// Binds tooltip handlers to a chart svg. Mouse: hover to show, leave to hide.
// Touch: tap/drag to show, keep visible 2.5s after lift so it can be read.
export function bindChartTooltip(svg, handleMove, handleLeave) {
  let touchMode = false;
  let hideTimer = null;
  const cancelHideTimer = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };
  svg.addEventListener("pointerdown", (event) => {
    touchMode = event.pointerType === "touch";
    cancelHideTimer();
    handleMove(event);
  });
  svg.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "touch") touchMode = false;
    cancelHideTimer();
    handleMove(event);
  });
  svg.addEventListener("pointerup", () => {
    if (!touchMode) return;
    cancelHideTimer();
    hideTimer = setTimeout(handleLeave, 2500);
  });
  svg.addEventListener("pointerleave", () => {
    if (!touchMode) handleLeave();
  });
  svg.addEventListener("pointercancel", () => {
    touchMode = false;
    handleLeave();
  });
}

export function renderChartPlaceholder(containerEl, message, iconType) {
  containerEl.replaceChildren();
  const placeholder = document.createElement("div");
  placeholder.className = "chart-placeholder";
  
  let svgInner = "";
  if (iconType === "trend") {
    svgInner = SVG_TREND;
  } else if (iconType === "bar") {
    svgInner = SVG_BAR_CHART;
  }
  
  placeholder.innerHTML = `
    ${svgInner}
    <span>${message}</span>
  `;
  containerEl.appendChild(placeholder);
}

export function renderRecordChart(matches) {
  if (!state.playerA) {
    renderChartPlaceholder(elements.recordChart, "No selection", "trend");
    return;
  }
  if (!matches.length) {
    renderChartPlaceholder(elements.recordChart, "No data available.", "trend");
    return;
  }
  const ordered = getChronologicalItems(matches);
  const measuredWidth = Math.round(elements.recordChart.getBoundingClientRect().width);
  const width = Math.max(280, Math.min(720, measuredWidth || 520));
  const height = 210;
  const padX = 8;
  const padTop = 12;
  const padBottom = 30;
  const plotWidth = width - padX * 2;
  const midY = padTop + (height - padTop - padBottom) / 2;
  const halfHeight = midY - padTop - 2;

  // One bar per result while each bar keeps ~2.5px plus a 1px gap; beyond that,
  // consecutive results share a bar. Bar height is the winning margin (goals, or
  // games won in series mode); a shared bar shows its average margin per result.
  const maxBars = Math.max(1, Math.floor(plotWidth / 3.5));
  const perBar = Math.max(1, Math.ceil(ordered.length / maxBars));
  const buckets = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (let start = 0; start < ordered.length; start += perBar) {
    const items = ordered.slice(start, start + perBar);
    const bucket = { start, end: start + items.length - 1, a: 0, b: 0, d: 0, marginA: 0, marginB: 0 };
    items.forEach((match) => {
      const margin = match.type === "series"
        ? Math.abs((match.game_wins_a || 0) - (match.game_wins_b || 0))
        : Math.abs((match.goals_a || 0) - (match.goals_b || 0));
      if (match.result === "A") {
        bucket.a += 1;
        bucket.marginA += Math.max(1, margin);
      } else if (match.result === "B") {
        bucket.b += 1;
        bucket.marginB += Math.max(1, margin);
      } else bucket.d += 1;
    });
    wins += bucket.a;
    losses += bucket.b;
    draws += bucket.d;
    buckets.push({ ...bucket, wins, losses, draws });
  }

  const maxMargin = Math.max(
    1,
    ...buckets.map((bucket) => {
      const size = bucket.a + bucket.b + bucket.d;
      return Math.max(bucket.marginA, bucket.marginB) / size;
    })
  );
  const marginHeight = (value) => (value > 0 ? Math.max(3, (value / maxMargin) * halfHeight) : 0);
  const slot = plotWidth / buckets.length;
  const gap = slot >= 3 ? Math.min(2, Math.max(1, slot * 0.2)) : 0;
  const barWidth = Math.max(0.5, slot - gap);
  const xAt = (index) => padX + index * slot;
  const bars = buckets
    .map((bucket, index) => {
      const size = bucket.a + bucket.b + bucket.d;
      const x = xAt(index) + gap / 2;
      const upHeight = marginHeight(bucket.marginA / size);
      const downHeight = marginHeight(bucket.marginB / size);
      let markup = "";
      if (upHeight > 0) {
        markup += `<rect x="${x}" y="${midY - 1 - upHeight}" width="${barWidth}" height="${upHeight}" fill="var(--teal)" />`;
      }
      if (downHeight > 0) {
        markup += `<rect x="${x}" y="${midY + 1}" width="${barWidth}" height="${downHeight}" fill="var(--accent-graphic)" />`;
      }
      if (bucket.d === size) {
        markup += `<rect x="${x}" y="${midY - 3}" width="${barWidth}" height="6" fill="var(--muted)" opacity="0.6" />`;
      }
      return markup;
    })
    .join("");

  // Year labels where the year changes, skipping any that would collide.
  const yearLabels = [];
  let lastLabelX = -Infinity;
  let previousYear = "";
  buckets.forEach((bucket, index) => {
    const year = ordered[bucket.start]?.date?.slice(0, 4) || "";
    if (!year || year === previousYear) return;
    previousYear = year;
    const x = xAt(index);
    yearLabels.push(
      `<line x1="${x}" y1="${height - padBottom + 2}" x2="${x}" y2="${height - padBottom + 7}" stroke="var(--muted)" stroke-width="1" />`
    );
    if (x - lastLabelX < 40 || x > width - 30) return;
    lastLabelX = x;
    yearLabels.push(
      `<text x="${x}" y="${height - 8}" fill="var(--muted)" font-size="12" text-anchor="start">${escapeHtml(year)}</text>`
    );
  });

  const isSeries = isSeriesMode();
  const unit = isSeries ? "series" : "game";
  const units = isSeries ? "series" : "games";
  const opponentSeriesLabel = state.playerB?.name || "Opponents";
  const opponentWinsLabel = isSinglePlayerMode() || !state.playerB?.name
    ? "Losses"
    : `${state.playerB.name} wins`;
  const marginUnit = isSeries ? "games" : "goals";
  const tallest = Number.isInteger(maxMargin) ? maxMargin : maxMargin.toFixed(1);
  const bucketNote = perBar > 1
    ? `Each bar is ${perBar} ${units}, height = average margin (tallest ${tallest} ${marginUnit})`
    : `Height = winning margin (tallest ${tallest} ${marginUnit})`;
  const chartDescription = `${ordered.length} ${units} in date order. Bars above the line are wins for ${state.playerA.name} (${wins}), bars below are ${isSinglePlayerMode() ? "losses" : `wins for ${state.playerB?.name}`} (${losses}), with ${draws} draws. Taller bars are bigger winning margins. Use the Left and Right arrow keys to inspect each bar.`;

  elements.recordChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a" aria-hidden="true"></span>${escapeHtml(state.playerA.name)} wins (up)</span>
      <span><span class="legend-dot b" aria-hidden="true"></span>${escapeHtml(opponentWinsLabel)} (down)</span>
      <span class="chart-note">${escapeHtml(bucketNote)}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" tabindex="0"
      aria-labelledby="record-chart-svg-title record-chart-svg-desc">
      <title id="record-chart-svg-title">Every ${unit}, in order</title>
      <desc id="record-chart-svg-desc">${escapeHtml(chartDescription)}</desc>
      <g shape-rendering="crispEdges">${bars}</g>
      <line x1="${padX}" y1="${midY}" x2="${width - padX}" y2="${midY}" stroke="var(--border)" stroke-width="2" />
      <line x1="${padX}" y1="${height - padBottom + 2}" x2="${width - padX}" y2="${height - padBottom + 2}" stroke="var(--border)" stroke-width="1" />
      ${yearLabels.join("")}
      <rect class="chart-hover-band" x="0" y="${padTop}" width="${slot}" height="${height - padTop - padBottom}" fill="var(--muted)" opacity="0" pointer-events="none" />
    </svg>
  `;

  const container = elements.recordChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);
  const hoverBand = svg.querySelector(".chart-hover-band");

  let keyboardIndex = buckets.length - 1;
  const showIndex = (index) => {
    const bucket = buckets[index];
    if (!bucket) return;
    const rect = svg.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const x1 = xAt(index);
    hoverBand.setAttribute("x", x1);
    hoverBand.setAttribute("opacity", "0.14");
    const toLocalX = (x) => (x / width) * rect.width + (rect.left - containerRect.left);
    const yLocal = (midY / height) * rect.height + (rect.top - containerRect.top);
    const record = `<div class="tooltip-kv"><span>Record so far</span><strong>${bucket.wins}W · ${bucket.draws}D · ${bucket.losses}L</strong></div>`;
    let html;
    if (bucket.start === bucket.end) {
      const match = ordered[bucket.start];
      const matchIsSeries = match.type === "series";
      const title = matchIsSeries ? formatDateRange(match.date, match.end_date) : match.date || "Unknown date";
      const valueA = matchIsSeries ? match.game_wins_a : match.goals_a;
      const valueB = matchIsSeries ? match.game_wins_b : match.goals_b;
      const sideRow = (side, name, value) => `
        <div class="tooltip-side${match.result === side ? " is-winner" : ""}">
          <span class="tooltip-side-label"><i class="side-dot ${side.toLowerCase()}" aria-hidden="true"></i>${escapeHtml(name)}</span>
          <span class="tooltip-side-value">${escapeHtml(String(value ?? "—"))}</span>
        </div>`;
      html = `
        <div class="tooltip-title">${escapeHtml(title)}</div>
        ${match.tournament_name ? `<div class="tooltip-kv"><span>${escapeHtml(match.tournament_name)}</span></div>` : ""}
        ${sideRow("A", state.playerA.name, valueA)}
        ${sideRow("B", match.opponent_name || opponentSeriesLabel, valueB)}
        <div class="tooltip-divider"></div>
        ${matchIsSeries ? `<div class="tooltip-kv"><span>Goals</span><strong>${match.goals_a}–${match.goals_b}</strong></div>` : ""}
        ${record}
      `;
    } else {
      const first = ordered[bucket.start]?.date || "";
      const last = ordered[bucket.end]?.date || "";
      html = `
        <div class="tooltip-title">${escapeHtml(formatDateRange(first, last))}</div>
        <div class="tooltip-kv"><span>${escapeHtml(state.playerA.name)}</span><strong>${bucket.a}W · ${bucket.d}D · ${bucket.b}L</strong></div>
        <div class="tooltip-divider"></div>
        ${record}
      `;
    }
    showChartTooltip(container, tooltip, html, toLocalX(x1), toLocalX(x1 + slot), yLocal);
  };

  const handleMove = (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(0, Math.min(buckets.length - 1, Math.floor((x - padX) / slot)));
    keyboardIndex = index;
    showIndex(index);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
    hoverBand.setAttribute("opacity", "0");
  };

  bindChartTooltip(svg, handleMove, handleLeave);
  svg.addEventListener("focus", () => showIndex(keyboardIndex));
  svg.addEventListener("blur", handleLeave);
  svg.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") keyboardIndex = 0;
    else if (event.key === "End") keyboardIndex = buckets.length - 1;
    else if (event.key === "ArrowLeft") keyboardIndex = Math.max(0, keyboardIndex - 1);
    else keyboardIndex = Math.min(buckets.length - 1, keyboardIndex + 1);
    showIndex(keyboardIndex);
  });
}

export function renderGoalsChart(matches) {
  if (!state.playerA) {
    renderChartPlaceholder(elements.goalsChart, "No selection", "bar");
    return;
  }
  if (!matches.length) {
    renderChartPlaceholder(elements.goalsChart, "No data available.", "bar");
    return;
  }
  const byYear = new Map();
  matches.forEach((match) => {
    if (!match.year) return;
    const entry = byYear.get(match.year) || { goalsA: 0, goalsB: 0, games: 0, totalGames: 0 };
    entry.goalsA += match.goals_a;
    entry.goalsB += match.goals_b;
    entry.games += 1;
    entry.totalGames += match.total_games || 1;
    byYear.set(match.year, entry);
  });
  const years = Array.from(byYear.keys()).sort();
  if (!years.length) {
    renderChartPlaceholder(elements.goalsChart, "No data available.", "bar");
    return;
  }
  const averages = years.map((year) => {
    const entry = byYear.get(year);
    let divisor = 1;
    if (isSeriesMode()) {
      divisor = state.goalsMode === "match" ? (entry.totalGames || 1) : (entry.games || 1);
    } else {
      divisor = entry.games || 1;
    }
    return {
      year,
      avgA: entry.goalsA / divisor,
      avgB: entry.goalsB / divisor,
    };
  });
  const maxAvg = Math.max(1, ...averages.map((item) => Math.max(item.avgA, item.avgB)));
  const measuredWidth = Math.round(elements.goalsChart.getBoundingClientRect().width);
  const width = Math.max(280, Math.min(720, measuredWidth || 520));
  const height = 210;
  const padding = width < 360 ? 34 : 42;
  const chartHeight = height - padding * 2;
  const groupWidth = (width - padding * 2) / years.length;
  const barWidth = Math.max(3, Math.min(16, groupWidth * 0.35));
  const labelStep = Math.max(1, Math.ceil(years.length / 6));
  let bars = "";
  let hits = "";
  let labels = "";
  let grid = "";
  let yLabels = "";

  for (let i = 0; i <= 4; i += 1) {
    const ratio = i / 4;
    const y = padding + ratio * chartHeight;
    const value = maxAvg * (1 - ratio);
    grid += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" />`;
    yLabels += `<text x="${padding - 6}" y="${y}" fill="var(--muted)" font-size="12" text-anchor="end" dominant-baseline="middle">${formatAxisValue(value)}</text>`;
  }

  averages.forEach((item, idx) => {
    const aHeight = (item.avgA / maxAvg) * chartHeight;
    const bHeight = (item.avgB / maxAvg) * chartHeight;
    const xBase = padding + idx * groupWidth;
    const aX = xBase + groupWidth * 0.1;
    const bX = aX + barWidth + groupWidth * 0.08;
    const aY = height - padding - aHeight;
    const bY = height - padding - bHeight;
    const aValue = item.avgA.toFixed(2);
    const bValue = item.avgB.toFixed(2);
    bars += `
      <rect x="${aX}" y="${aY}" width="${barWidth}" height="${aHeight}" rx="3" fill="var(--teal)" data-year="${item.year}" data-side="a" data-value="${aValue}" />
      <rect x="${bX}" y="${bY}" width="${barWidth}" height="${bHeight}" rx="3" fill="var(--accent-graphic)" data-year="${item.year}" data-side="b" data-value="${bValue}" />
    `;
    hits += `<rect class="bar-hit" x="${xBase}" y="${padding}" width="${groupWidth}" height="${chartHeight}" fill="transparent" data-year="${item.year}" data-a="${aValue}" data-b="${bValue}" data-top="${Math.min(aY, bY)}" data-x="${xBase}" data-w="${groupWidth}" />`;
    if (idx % labelStep === 0 || idx === years.length - 1) {
      labels += `<text x="${xBase + groupWidth * 0.5}" y="${height - 8}" fill="var(--muted)" font-size="12" text-anchor="middle">${item.year}</text>`;
    }
  });

  const latest = averages[averages.length - 1];
  const averageUnit = isSeriesMode()
    ? (state.goalsMode === "match" ? "match" : "series")
    : "game";
  const chartDescription = `Average goals by year from ${years[0]} to ${years[years.length - 1]}. In ${latest.year}, ${state.playerA.name} averaged ${latest.avgA.toFixed(2)} goals per ${averageUnit}, and ${state.playerB?.name || "opponents"} averaged ${latest.avgB.toFixed(2)}. Use the Left and Right arrow keys to inspect each year.`;

  elements.goalsChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a" aria-hidden="true"></span>${escapeHtml(state.playerA.name)}</span>
      <span><span class="legend-dot b" aria-hidden="true"></span>${escapeHtml(state.playerB?.name || "Opponents")}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" tabindex="0"
      aria-labelledby="goals-chart-svg-title goals-chart-svg-desc">
      <title id="goals-chart-svg-title">Average goals by year</title>
      <desc id="goals-chart-svg-desc">${escapeHtml(chartDescription)}</desc>
      ${grid}
      ${yLabels}
      <text x="${padding - 6}" y="${padding - 12}" fill="var(--muted)" font-size="12" text-anchor="end">goals</text>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      ${bars}
      ${hits}
      ${labels}
    </svg>
  `;

  const container = elements.goalsChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);
  const yearHits = Array.from(svg.querySelectorAll(".bar-hit"));
  let keyboardIndex = Math.max(0, yearHits.length - 1);

  const handleMove = (event) => {
    const target = event.target;
    if (!target || typeof target.tagName !== "string" || target.tagName.toLowerCase() !== "rect") {
      hideChartTooltip(tooltip);
      return;
    }
    const year = target.getAttribute("data-year");
    if (!year) {
      hideChartTooltip(tooltip);
      return;
    }
    const suffix = isSeriesMode()
      ? (state.goalsMode === "match" ? "avg goals per match" : "avg goals per series")
      : "avg goals";
    const sideRow = (side, name, value) => `
      <div class="tooltip-side">
        <span class="tooltip-side-label"><i class="side-dot ${side}" aria-hidden="true"></i>${escapeHtml(name)}</span>
        <span class="tooltip-side-value">${escapeHtml(value)}</span>
      </div>`;
    let rows = "";
    if (target.classList.contains("bar-hit")) {
      rows = sideRow("a", state.playerA.name, target.getAttribute("data-a"))
        + sideRow("b", state.playerB?.name || "Opponents", target.getAttribute("data-b"));
    } else {
      const side = target.getAttribute("data-side");
      const value = target.getAttribute("data-value");
      const name = side === "b" ? state.playerB?.name || "Opponents" : state.playerA.name;
      rows = sideRow(side === "b" ? "b" : "a", name, value);
    }
    const html = `
      <div class="tooltip-title">${escapeHtml(year)} · ${escapeHtml(suffix)}</div>
      ${rows}
    `;
    const containerRect = container.getBoundingClientRect();
    let x1 = event.clientX - containerRect.left;
    let x2 = x1;
    let y = event.clientY - containerRect.top;
    if (target.classList.contains("bar-hit")) {
      // Anchor to the group bounds and the taller bar's top so the tooltip
      // neither chases cursor Y nor covers the hovered bars
      const svgRect = svg.getBoundingClientRect();
      const toLocalX = (viewX) => (viewX / width) * svgRect.width + (svgRect.left - containerRect.left);
      const groupX = Number(target.getAttribute("data-x"));
      const groupW = Number(target.getAttribute("data-w"));
      if (Number.isFinite(groupX) && Number.isFinite(groupW)) {
        x1 = toLocalX(groupX);
        x2 = toLocalX(groupX + groupW);
      }
      const barTop = Number(target.getAttribute("data-top"));
      if (Number.isFinite(barTop)) {
        y = (barTop / height) * svgRect.height + (svgRect.top - containerRect.top);
      }
    }
    showChartTooltip(container, tooltip, html, x1, x2, y);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
  };

  bindChartTooltip(svg, handleMove, handleLeave);
  const showYearAtIndex = (index) => {
    const target = yearHits[index];
    if (!target) return;
    const svgRect = svg.getBoundingClientRect();
    const groupX = Number(target.getAttribute("data-x"));
    const groupW = Number(target.getAttribute("data-w"));
    const clientX = svgRect.left + ((groupX + groupW / 2) / width) * svgRect.width;
    const clientY = svgRect.top + svgRect.height / 2;
    handleMove({ target, clientX, clientY });
  };
  svg.addEventListener("focus", () => showYearAtIndex(keyboardIndex));
  svg.addEventListener("blur", handleLeave);
  svg.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") keyboardIndex = 0;
    else if (event.key === "End") keyboardIndex = Math.max(0, yearHits.length - 1);
    else if (event.key === "ArrowLeft") keyboardIndex = Math.max(0, keyboardIndex - 1);
    else keyboardIndex = Math.min(yearHits.length - 1, keyboardIndex + 1);
    showYearAtIndex(keyboardIndex);
  });
}

export function renderCharts(matches) {
  if (elements.recordChartTitle) {
    const title = elements.recordChartTitle.querySelector(".viz-title-text");
    if (title) title.textContent = isSeriesMode() ? "Every series, in order" : "Every game, in order";
  }
  if (elements.goalsChartTitle) {
    const title = elements.goalsChartTitle.querySelector(".viz-title-text");
    if (title) {
      title.textContent = isSeriesMode()
        ? (state.goalsMode === "match" ? "Average match goals by year" : "Average series goals by year")
        : "Average goals by year";
    }
  }
  if (elements.goalsModeToggle) {
    elements.goalsModeToggle.hidden = !isSeriesMode();
  }
  if (elements.goalsModeButtons) {
    elements.goalsModeButtons.forEach((button) => {
      const isActive = button.dataset.goalsMode === state.goalsMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }
  renderRecordChart(matches);
  renderGoalsChart(matches);
}
