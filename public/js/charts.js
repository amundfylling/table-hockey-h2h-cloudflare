import { state, elements, isSeriesMode } from "./state.js";
import { getChronologicalItems } from "./form.js";
import { formatPercent } from "./summary.js";
import { escapeHtml } from "./utils.js";
import { SVG_TREND, SVG_BAR_CHART } from "./constants.js";
import { formatSeriesScore } from "./series.js";

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

export function showChartTooltip(container, tooltip, html, x, y) {
  tooltip.innerHTML = html;
  tooltip.classList.add("is-visible");
  const bounds = container.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.max(width / 2 + 8, Math.min(x, bounds.width - width / 2 - 8));
  const top = Math.max(height + 8, y);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function hideChartTooltip(tooltip) {
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
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
  const itemLabel = isSeriesMode() ? "series" : "game";
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
    const scoreLine =
      match.type === "series"
        ? `${state.playerA.name} ${formatSeriesScore(match)} ${match.opponent_name || opponentSeriesLabel} (${match.goals_a}-${match.goals_b} goals)`
        : `${state.playerA.name} ${match.goals_a}-${match.goals_b} ${match.opponent_name || opponentSeriesLabel}`;
    const html = `
      <div class="tooltip-title">${escapeHtml(match.type === "series" ? formatDateRange(match.date, match.end_date) : match.date || "Unknown date")}</div>
      <div class="tooltip-row">${escapeHtml(scoreLine)}</div>
      <div class="tooltip-row">Win rate: ${formatPercent(entry.winRate)}</div>
      <div class="tooltip-row">Record: ${entry.wins}W ${entry.draws}D ${entry.losses}L after ${entry.total} ${itemLabel}${entry.total === 1 || itemLabel === "series" ? "" : "s"}</div>
    `;
    showChartTooltip(container, tooltip, html, xLocal, yLocal);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
    hoverLine.setAttribute("opacity", "0");
    hoverPoint.setAttribute("opacity", "0");
  };

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
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
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--muted)" stroke-width="1" />
      ${bars}
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
    const side = target.getAttribute("data-side");
    const value = target.getAttribute("data-value");
    const name = side === "b" ? state.playerB?.name || "Opponents" : state.playerA.name;
    const suffix = isSeriesMode()
      ? (state.goalsMode === "match" ? "avg goals per match" : "avg goals per series")
      : "avg goals";
    const html = `
      <div class="tooltip-title">${escapeHtml(year)}</div>
      <div class="tooltip-row">${escapeHtml(name)}: ${escapeHtml(value)} ${suffix}</div>
    `;
    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    showChartTooltip(container, tooltip, html, x, y);
  };

  const handleLeave = () => {
    hideChartTooltip(tooltip);
  };

  svg.addEventListener("mousemove", handleMove);
  svg.addEventListener("mouseleave", handleLeave);
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
