import { state, elements, isSeriesMode } from "./state.js";
import { getChronologicalItems } from "./form.js";
import { formatPercent } from "./summary.js";
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
    container.appendChild(tooltip);
  }
  return tooltip;
}

export function showChartTooltip(container, tooltip, html, anchorX1, anchorX2, y, options = {}) {
  tooltip.innerHTML = html;
  // Reset to the origin before measuring so the box reports its natural size,
  // not a size constrained by the previous position.
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  tooltip.classList.add("is-visible");
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
  const fitsAbove = y - height - 6 >= margin;

  let left;
  let top;
  // Beside the hovered region keeps the point/bars visible; above is the fallback.
  const placeSide = () => {
    if (fitsRight) left = anchorX2 + gap;
    else if (fitsLeft) left = anchorX1 - gap - width;
    top = Math.min(Math.max(y - height / 2, margin), maxTop);
    return fitsRight || fitsLeft;
  };
  const placeAbove = () => {
    left = Math.min(Math.max(centerX - width / 2, margin), maxLeft);
    top = fitsAbove ? y - height - 6 : Math.min(y + 20, maxTop);
  };

  if (options.prefer === "side") {
    if (!placeSide()) placeAbove();
  } else if (fitsAbove) {
    placeAbove();
  } else if (!placeSide()) {
    placeAbove();
  }
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideChartTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
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
  if (matches.length < 2) {
    renderChartPlaceholder(elements.recordChart, "Not enough data to build trend.", "trend");
    return;
  }
  const ordered = getChronologicalItems(matches);
  const values = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  ordered.forEach((match) => {
    if (match.result === "A") wins += 1;
    else if (match.result === "B") losses += 1;
    else draws += 1;
    const total = wins + losses + draws;
    values.push({
      winRate: total ? (wins / total) * 100 : 0,
      wins,
      losses,
      draws,
      total,
    });
  });
  const width = 520;
  const height = 180;
  const padding = 38;
  const min = 0;
  const max = 100;
  const range = max - min;
  const referenceValue = 50;
  const referenceY = height - padding - ((referenceValue - min) / range) * (height - padding * 2);
  const xScale = (index) =>
    padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
  const yScale = (value) =>
    height - padding - ((value - min) / range) * (height - padding * 2);
  const points = values.map((value, index) => `${xScale(index)},${yScale(value.winRate)}`);
  const areaPath = `M ${xScale(0)} ${referenceY} L ${points.join(" ")} L ${xScale(values.length - 1)} ${referenceY} Z`;
  const ticks = [0, 25, 50, 75, 100];
  const gridLines = [];
  const yLabels = [];
  ticks.forEach((value) => {
    const y = yScale(value);
    gridLines.push(
      `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="var(--border)" stroke-width="1" />`
    );
    yLabels.push(
      `<text x="${padding - 6}" y="${y}" fill="var(--muted)" font-size="10" text-anchor="end" dominant-baseline="middle">${value}%</text>`
    );
  });
  const endValue = values[values.length - 1];
  const endColor = endValue.winRate >= referenceValue ? "var(--teal)" : "var(--accent)";
  const leadLabel = `Current ${formatPercent(endValue.winRate)} win rate`;
  const opponentSeriesLabel = state.playerB?.name || "Opponents";
  const firstLabel = ordered[0]?.date?.slice(0, 4) || "";
  const lastLabel = ordered[ordered.length - 1]?.date?.slice(0, 4) || "";
  const endX = xScale(values.length - 1);
  const endY = yScale(endValue.winRate);
  const endpointTextAnchor = endX > width - 95 ? "end" : "start";
  const endpointTextX = endpointTextAnchor === "end" ? endX - 8 : endX + 8;
  const endpointTextY = Math.max(padding + 10, Math.min(height - padding - 8, endY - 8));

  elements.recordChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a"></span>${escapeHtml(state.playerA.name)} win rate</span>
      <span class="chart-note">${escapeHtml(leadLabel)}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" aria-label="Running win rate chart">
      ${gridLines.join("")}
      ${yLabels.join("")}
      <line x1="${padding}" y1="${referenceY}" x2="${width - padding}" y2="${referenceY}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1.4" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      <path d="${areaPath}" fill="var(--teal-soft)" stroke="none"></path>
      <polyline fill="none" stroke="var(--teal)" stroke-width="3" points="${points.join(" ")}" />
      <circle cx="${endX}" cy="${endY}" r="4.5" fill="${endColor}" />
      <text x="${padding}" y="${referenceY - 6}" fill="var(--muted)" font-size="10">50%</text>
      <text x="${endpointTextX}" y="${endpointTextY}" fill="${endColor}" font-size="11" font-weight="700" text-anchor="${endpointTextAnchor}">${formatPercent(endValue.winRate)}</text>
      ${firstLabel ? `<text x="${padding}" y="${height - 6}" fill="var(--muted)" font-size="10" text-anchor="start">${escapeHtml(firstLabel)}</text>` : ""}
      ${lastLabel && lastLabel !== firstLabel ? `<text x="${width - padding}" y="${height - 6}" fill="var(--muted)" font-size="10" text-anchor="end">${escapeHtml(lastLabel)}</text>` : ""}
      <line class="chart-hover-line" x1="0" y1="${padding}" x2="0" y2="${height - padding}" stroke="var(--muted)" stroke-dasharray="3 5" stroke-width="1" opacity="0" />
      <circle class="chart-hover-point" cx="0" cy="0" r="4" fill="var(--accent)" opacity="0" />
    </svg>
  `;

  const container = elements.recordChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);
  const hoverLine = svg.querySelector(".chart-hover-line");
  const hoverPoint = svg.querySelector(".chart-hover-point");

  const handleMove = (event) => {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(
      0,
      Math.min(values.length - 1, Math.round(((x - padding) / (width - padding * 2)) * (values.length - 1)))
    );
    const match = ordered[index];
    const entry = values[index];
    if (!match) return;
    const xPos = xScale(index);
    const yPos = yScale(entry.winRate);

    hoverLine.setAttribute("x1", xPos);
    hoverLine.setAttribute("x2", xPos);
    hoverLine.setAttribute("opacity", "1");
    hoverPoint.setAttribute("cx", xPos);
    hoverPoint.setAttribute("cy", yPos);
    hoverPoint.setAttribute("opacity", "1");

    const containerRect = container.getBoundingClientRect();
    const xLocal = (xPos / width) * rect.width + (rect.left - containerRect.left);
    const yLocal = (yPos / height) * rect.height + (rect.top - containerRect.top);
    const isSeries = match.type === "series";
    const title = isSeries ? formatDateRange(match.date, match.end_date) : match.date || "Unknown date";
    const valueA = isSeries ? match.game_wins_a : match.goals_a;
    const valueB = isSeries ? match.game_wins_b : match.goals_b;
    const sideRow = (side, name, value) => `
      <div class="tooltip-side${match.result === side ? " is-winner" : ""}">
        <span class="tooltip-side-label"><i class="tooltip-dot ${side.toLowerCase()}"></i>${escapeHtml(name)}</span>
        <span class="tooltip-side-value">${escapeHtml(String(value ?? "—"))}</span>
      </div>`;
    const html = `
      <div class="tooltip-title">${escapeHtml(title)}</div>
      ${sideRow("A", state.playerA.name, valueA)}
      ${sideRow("B", match.opponent_name || opponentSeriesLabel, valueB)}
      <div class="tooltip-divider"></div>
      <div class="tooltip-kv"><span>Win rate</span><strong>${formatPercent(entry.winRate)}</strong></div>
      <div class="tooltip-kv"><span>Record</span><strong>${entry.wins}W · ${entry.draws}D · ${entry.losses}L</strong></div>
      ${isSeries ? `<div class="tooltip-kv"><span>Goals</span><strong>${match.goals_a}–${match.goals_b}</strong></div>` : ""}
    `;
    showChartTooltip(container, tooltip, html, xLocal, xLocal, yLocal, { prefer: "side" });
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
    hoverLine.setAttribute("opacity", "0");
    hoverPoint.setAttribute("opacity", "0");
  };

  bindChartTooltip(svg, handleMove, handleLeave);
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
  const width = 520;
  const height = 180;
  const padding = 38;
  const chartHeight = height - padding * 2;
  const groupWidth = (width - padding * 2) / years.length;
  const barWidth = Math.max(8, groupWidth * 0.35);
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
    yLabels += `<text x="${padding - 6}" y="${y}" fill="var(--muted)" font-size="10" text-anchor="end" dominant-baseline="middle">${formatAxisValue(value)}</text>`;
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
      <rect x="${bX}" y="${bY}" width="${barWidth}" height="${bHeight}" rx="3" fill="var(--accent)" data-year="${item.year}" data-side="b" data-value="${bValue}" />
    `;
    hits += `<rect class="bar-hit" x="${xBase}" y="${padding}" width="${groupWidth}" height="${chartHeight}" fill="transparent" data-year="${item.year}" data-a="${aValue}" data-b="${bValue}" data-top="${Math.min(aY, bY)}" data-x="${xBase}" data-w="${groupWidth}" />`;
    if (idx % labelStep === 0 || idx === years.length - 1) {
      labels += `<text x="${xBase + groupWidth * 0.5}" y="${height - 6}" fill="var(--muted)" font-size="10" text-anchor="middle">${item.year}</text>`;
    }
  });

  elements.goalsChart.innerHTML = `
    <div class="chart-legend">
      <span><span class="legend-dot a"></span>${escapeHtml(state.playerA.name)}</span>
      <span><span class="legend-dot b"></span>${escapeHtml(state.playerB?.name || "Opponents")}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" aria-label="Average goals by year chart">
      ${grid}
      ${yLabels}
      <text x="${padding - 6}" y="${padding - 12}" fill="var(--muted)" font-size="10" text-anchor="end">goals</text>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      ${bars}
      ${hits}
      ${labels}
    </svg>
  `;

  const container = elements.goalsChart;
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);

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
        <span class="tooltip-side-label"><i class="tooltip-dot ${side}"></i>${escapeHtml(name)}</span>
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
}

export function renderCharts(matches) {
  if (elements.recordChartTitle) {
    const title = elements.recordChartTitle.querySelector(".viz-title-text");
    if (title) title.textContent = isSeriesMode() ? "Running series win rate" : "Running win rate";
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
