import { state, elements, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { getChronologicalItems } from "./form.js?v=20260801-generational-run-v3";
import { escapeHtml, formatDate, formatDateRange } from "./utils.js";
import { SVG_TREND, SVG_BAR_CHART } from "./constants.js";
import { getAliasGroup, getPlayerById } from "./players.js";
import { requestView } from "./dom.js";
import {
  findComeback,
  findPeak,
  groupTournaments,
  lastName,
  leadSeries,
  monthYear,
  opponentExtremes,
  opponentRecords,
  scorelineGrid,
  seasonsOf,
  winRate,
} from "./insights.js";

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

// ── Shared drawing helpers ──────────────────────────────────────────
const A = "var(--a)";
const B = "var(--b)";
const DRAW = "var(--draw)";
const INK = "var(--ink)";
const INK2 = "var(--ink-2)";
const INK3 = "var(--ink-3)";
const LINE = "var(--line)";
const LINE2 = "var(--line-2)";
const FONT = 'font-size="12"';
const TONE = { a: A, b: B, d: DRAW };

function fmt(value) {
  return Number(value).toLocaleString("en-US");
}

function signed(value) {
  if (value > 0) return `+${fmt(value)}`;
  if (value < 0) return `−${fmt(Math.abs(value))}`;
  return "0";
}

function widthOf(container, fallback = 640) {
  const measured = Math.round(container.getBoundingClientRect().width);
  return Math.max(260, measured || fallback);
}

function svgMarkup(width, height, body, label) {
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(label)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function niceStep(range, maxTicks = 5) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((step) => range / step <= maxTicks) || steps[steps.length - 1];
}

function scoreOf(item) {
  return item.type === "series"
    ? `${item.game_wins_a}–${item.game_wins_b}`
    : `${item.goals_a}–${item.goals_b}${item.overtime ? " OT" : ""}`;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setLegend(id, items) {
  const node = document.getElementById(id);
  if (!node) return;
  node.replaceChildren(...items.map(([tone, text]) => {
    const span = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = `dot ${tone}`;
    span.append(dot, text);
    return span;
  }));
}

function namesOf() {
  const a = lastName(state.playerA?.name || "Player A");
  const b = isSinglePlayerMode() ? "Opponents" : lastName(state.playerB?.name || "Player B");
  return { a, b };
}

// ── How the lead has moved ──────────────────────────────────────────
function renderLeadChart(items) {
  const container = elements.recordChart;
  if (!container) return;
  const ordered = getChronologicalItems(items);
  const series = isSeriesMode();
  const { a, b } = namesOf();
  setText("lead-sub", `${a}'s wins minus losses, ${series ? "series by series" : "game by game"}. Years mark each season's first ${series ? "series" : "game"}.`);
  if (ordered.length < 2) {
    renderChartPlaceholder(container, "Not enough results to draw a trend.", "trend");
    setLegend("lead-legend", []);
    return;
  }
  const lead = leadSeries(ordered);
  const n = lead.length;
  const comeback = findComeback(ordered, lead);
  const peak = findPeak(lead);
  const width = widthOf(container, 1150);
  const compact = width < 560;
  const height = compact ? 210 : 260;
  const pl = 40;
  const pr = 12;
  const pt = 28;
  const pb = 26;
  const pw = width - pl - pr;
  const ph = height - pt - pb;
  const maxV = Math.max(0, ...lead);
  const minV = Math.min(0, ...lead);
  const step = niceStep(Math.max(1, maxV - minV));
  let top = Math.ceil(maxV / step) * step;
  let bottom = Math.floor(minV / step) * step;
  if (top === bottom) top = step;
  if (top === 0 && bottom === 0) top = step;
  const X = (i) => pl + (pw * i) / (n - 1);
  const Y = (v) => pt + (ph * (top - v)) / (top - bottom);
  const zeroY = Y(0);
  const parts = [];

  // Colour the line by who is ahead: split the gradient at the zero line.
  const gradId = `lead-grad-${Math.random().toString(36).slice(2, 8)}`;
  const zeroPct = ((zeroY - pt) / ph) * 100;
  parts.push(`<defs><linearGradient id="${gradId}" gradientUnits="userSpaceOnUse" x1="0" y1="${pt}" x2="0" y2="${pt + ph}">
    <stop offset="0%" stop-color="${A}"/><stop offset="${zeroPct.toFixed(2)}%" stop-color="${A}"/>
    <stop offset="${zeroPct.toFixed(2)}%" stop-color="${B}"/><stop offset="100%" stop-color="${B}"/></linearGradient>
    <clipPath id="${gradId}-pre"><rect x="${pl}" y="${pt - 2}" width="${(comeback ? X(comeback.start) : width) - pl}" height="${ph + 4}"/></clipPath></defs>`);

  if (comeback) {
    const bx = X(comeback.start);
    const tone = comeback.leader === "a" ? B : A;
    parts.push(`<rect x="${bx.toFixed(1)}" y="${pt}" width="${(X(n - 1) - bx).toFixed(1)}" height="${ph}" fill="${tone}" fill-opacity="0.07"/>`);
    parts.push(`<line x1="${bx.toFixed(1)}" x2="${bx.toFixed(1)}" y1="${pt}" y2="${pt + ph}" stroke="${tone}" stroke-opacity="0.5" stroke-dasharray="2 3"/>`);
  }

  for (let v = bottom; v <= top; v += step) {
    const y = Y(v);
    parts.push(`<line x1="${pl}" x2="${width - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${v === 0 ? LINE2 : LINE}"/>`);
    parts.push(`<text x="${pl - 8}" y="${(y + 4).toFixed(1)}" ${FONT} fill="${INK3}" text-anchor="end">${signed(v)}</text>`);
  }

  const sample = Math.max(1, Math.floor(n / (pw * 1.5)));
  const points = [];
  for (let i = 0; i < n; i += sample) points.push([X(i), Y(lead[i])]);
  if ((n - 1) % sample) points.push([X(n - 1), Y(lead[n - 1])]);
  const d = `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")}`;
  parts.push(`<path d="${d} L${X(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${pl},${zeroY.toFixed(1)} Z" fill="url(#${gradId})" fill-opacity="0.1" clip-path="url(#${gradId}-pre)"/>`);
  parts.push(`<path d="${d}" fill="none" stroke="url(#${gradId})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);

  // Year ticks at each season's first result, skipping labels that would collide.
  let lastLabelX = -Infinity;
  ordered.forEach((item, index) => {
    const year = item.year || String(item.date).slice(0, 4);
    if (index && (ordered[index - 1].year || String(ordered[index - 1].date).slice(0, 4)) === year) return;
    const x = X(index);
    parts.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${height - pb}" y2="${height - pb + 5}" stroke="${INK3}"/>`);
    if (x - lastLabelX >= 40 && x <= width - 24) {
      parts.push(`<text x="${(x + 3).toFixed(1)}" y="${height - 6}" ${FONT} fill="${INK3}">${year}</text>`);
      lastLabelX = x;
    }
  });

  const peakValue = lead[peak];
  if (peak > 0 && peak < n - 1 && peakValue !== 0) {
    const px = X(peak);
    const py = Y(peakValue);
    const label = compact ? `Peak ${signed(peakValue)}` : `Peak ${signed(peakValue)} · ${monthYear(ordered[peak].date)}`;
    const anchor = px > width * 0.35 ? "end" : "start";
    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${peakValue > 0 ? A : B}" stroke="var(--surface)" stroke-width="2"/>`);
    parts.push(`<text x="${(px + (anchor === "end" ? -8 : 8)).toFixed(1)}" y="${(py + (peakValue > 0 ? -10 : 18)).toFixed(1)}" ${FONT} font-weight="600" fill="${INK}" text-anchor="${anchor}">${label}</text>`);
  }
  const ex = X(n - 1);
  const ey = Y(lead[n - 1]);
  parts.push(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="${lead[n - 1] >= 0 ? A : B}" stroke="var(--surface)" stroke-width="2"/>`);
  const nowBelow = ey < pt + 24 || lead[n - 1] >= 0;
  parts.push(`<text x="${(ex - 8).toFixed(1)}" y="${(ey + (nowBelow ? 20 : -10)).toFixed(1)}" ${FONT} font-weight="600" fill="${INK}" text-anchor="end">${signed(lead[n - 1])} now</text>`);

  const legend = [];
  if (maxV > 0) legend.push(["a", `${a} ahead`]);
  if (minV < 0) legend.push(["b", `${b} ahead`]);
  if (comeback) {
    const trailer = comeback.leader === "a" ? b : a;
    const story = `${trailer} ${fmt(comeback.winsTrailer)}–${fmt(comeback.winsLeader)} since the peak`;
    // On phones the peak label needs the space; the verdict above tells the story.
    if (!compact) parts.push(`<text x="${width - pr}" y="${pt - 10}" ${FONT} font-weight="600" fill="${comeback.leader === "a" ? "var(--b-text)" : A}" text-anchor="end">${escapeHtml(story)}</text>`);
    legend.push([comeback.leader === "a" ? "band" : "a", `${trailer} winning since the peak`]);
  }
  setLegend("lead-legend", legend);

  // Hover guide line, moved by the pointer handler.
  parts.push(`<line class="lead-guide" x1="0" x2="0" y1="${pt}" y2="${pt + ph}" stroke="${INK3}" stroke-dasharray="2 2" opacity="0"/>`);
  parts.push(`<circle class="lead-cursor" r="4" fill="var(--surface)" stroke="${INK}" stroke-width="2" opacity="0"/>`);
  parts.push(`<rect x="${pl}" y="${pt}" width="${pw}" height="${ph}" fill="transparent"/>`);

  const label = `${a}'s lead over ${b} after each ${series ? "series" : "game"}: ${signed(lead[n - 1])} now${peak > 0 ? `, peak ${signed(peakValue)} in ${monthYear(ordered[peak].date)}` : ""}.`;
  container.innerHTML = svgMarkup(width, height, parts.join(""), label);
  const svg = container.querySelector("svg");
  const guide = svg.querySelector(".lead-guide");
  const cursor = svg.querySelector(".lead-cursor");
  const tooltip = ensureChartTooltip(container);
  const hide = () => {
    guide.setAttribute("opacity", "0");
    cursor.setAttribute("opacity", "0");
    hideChartTooltip(tooltip);
  };
  bindChartTooltip(svg, (event) => {
    const box = svg.getBoundingClientRect();
    const scale = width / box.width;
    const x = (event.clientX - box.left) * scale;
    const index = Math.max(0, Math.min(n - 1, Math.round(((x - pl) / pw) * (n - 1))));
    const item = ordered[index];
    const gx = X(index);
    const gy = Y(lead[index]);
    guide.setAttribute("x1", gx);
    guide.setAttribute("x2", gx);
    guide.setAttribute("opacity", "1");
    cursor.setAttribute("cx", gx);
    cursor.setAttribute("cy", gy);
    cursor.setAttribute("opacity", "1");
    const winner = item.result === "A" ? state.playerA.name : item.result === "B" ? state.playerB.name : "Draw";
    const html = `<div class="tooltip-title">${series ? "Series" : "Game"} ${fmt(index + 1)} · ${escapeHtml(item.type === "series" ? formatDateRange(item.date, item.end_date) : formatDate(item.date))}</div>
      <div class="tooltip-kv">${escapeHtml(item.tournament_name || "")}</div>
      <div class="tooltip-kv"><strong>${escapeHtml(scoreOf(item))}</strong> · ${escapeHtml(winner)}</div>
      <div class="tooltip-kv">Lead after: <strong>${signed(lead[index])}</strong></div>`;
    showChartTooltip(container, tooltip, html, gx / scale - 2, gx / scale + 2, gy / scale);
  }, hide);
}

// One tick per tournament, coloured by who won more of its games.
function renderTournamentStrip(items) {
  const container = document.getElementById("tournament-strip");
  const label = document.getElementById("strip-label");
  if (!container || !label) return;
  const groups = groupTournaments(items).reverse();
  const block = container.closest(".strip-block");
  if (groups.length < 2) {
    if (block) block.hidden = true;
    return;
  }
  if (block) block.hidden = false;
  const { a, b } = namesOf();
  const counts = { a: 0, b: 0, d: 0 };
  groups.forEach((group) => { counts[group.winner] += 1; });
  label.replaceChildren();
  const lead = document.createElement("span");
  lead.textContent = isSeriesMode()
    ? "Every tournament, in order, by who won more series"
    : "Every tournament, in order, by who won more games";
  label.append(lead);
  [["a", `${a} ${counts.a}`], ["b", `${b} ${counts.b}`], ["d", `Tied ${counts.d}`]].forEach(([tone, text]) => {
    if (tone === "d" && !counts.d) return;
    const span = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = `dot ${tone}`;
    span.append(dot, text);
    label.append(span);
  });

  const width = widthOf(container, 1150);
  const height = 28;
  const pl = 40;
  const pr = 12;
  const pw = width - pl - pr;
  const slot = pw / groups.length;
  const gap = slot > 3 ? 1 : 0;
  const parts = groups.map((group, index) => {
    const x = pl + index * slot;
    return `<rect x="${x.toFixed(2)}" y="2" width="${Math.max(0.6, slot - gap).toFixed(2)}" height="${height - 4}" fill="${TONE[group.winner]}" rx="${slot > 4 ? 1 : 0}"/>`;
  });
  container.innerHTML = svgMarkup(width, height, parts.join(""),
    `${groups.length} tournaments: ${a} won more in ${counts.a}, ${b} in ${counts.b}, ${counts.d} tied.`);
  const svg = container.querySelector("svg");
  const tooltip = ensureChartTooltip(container);
  bindChartTooltip(svg, (event) => {
    const box = svg.getBoundingClientRect();
    const scale = width / box.width;
    const x = (event.clientX - box.left) * scale;
    const index = Math.max(0, Math.min(groups.length - 1, Math.floor((x - pl) / slot)));
    const group = groups[index];
    const html = `<div class="tooltip-title">${escapeHtml(group.name)}</div>
      <div class="tooltip-kv">${escapeHtml(formatDate(group.date))} · ${group.games.length} ${isSeriesMode() ? "series" : "games"}</div>
      <div class="tooltip-kv"><strong>${group.winsA}–${group.winsB}</strong>${group.draws ? ` · ${group.draws} drawn` : ""}</div>`;
    const cx = (pl + index * slot + slot / 2) / scale;
    showChartTooltip(container, tooltip, html, cx - 2, cx + 2, 0);
  }, () => hideChartTooltip(tooltip));
}

// ── Scorelines heatmap ──────────────────────────────────────────────
function renderScorelines(items) {
  const container = document.getElementById("scorelines");
  const caption = document.getElementById("scorelines-cap");
  if (!container) return;
  const series = isSeriesMode();
  const { a, b } = namesOf();
  setText("scorelines-sub", series ? "How often each series score happened" : "How often each result happened");
  if (!items.length) {
    container.replaceChildren();
    if (caption) caption.textContent = "";
    return;
  }
  const grid = scorelineGrid(items, { series });
  const size = grid.cap + 1;
  const available = Math.min(420, widthOf(container, 420)) - 44;
  const gap = 2;
  const cell = Math.max(24, Math.min(40, Math.floor((available - gap * (size - 1)) / size)));
  const lw = 44;
  const th = 40;
  const span = size * cell + (size - 1) * gap;
  const width = lw + span;
  const height = th + span + 4;
  const label = (value) => (grid.capped && value === grid.cap ? `${value}+` : String(value));
  const parts = [];
  parts.push(`<text x="${lw + span / 2}" y="12" ${FONT} font-weight="600" fill="${INK2}" text-anchor="middle">${escapeHtml(b)} ${series ? "games" : "goals"} →</text>`);
  parts.push(`<text transform="translate(12 ${th + span / 2}) rotate(-90)" ${FONT} font-weight="600" fill="${INK2}" text-anchor="middle">${escapeHtml(a)} ${series ? "games" : "goals"} →</text>`);
  for (let i = 0; i < size; i += 1) {
    const x = lw + i * (cell + gap) + cell / 2;
    const y = th + (size - 1 - i) * (cell + gap) + cell / 2 + 4;
    parts.push(`<text x="${x}" y="${th - 8}" ${FONT} fill="${INK3}" text-anchor="middle">${label(i)}</text>`);
    parts.push(`<text x="${lw - 8}" y="${y}" ${FONT} fill="${INK3}" text-anchor="end">${label(i)}</text>`);
  }
  for (let ga = 0; ga < size; ga += 1) {
    for (let gb = 0; gb < size; gb += 1) {
      const entry = grid.cells.get(`${ga}:${gb}`);
      if (!entry) continue;
      const x = lw + gb * (cell + gap);
      const y = th + (size - 1 - ga) * (cell + gap);
      const opacity = 0.12 + 0.88 * (entry.count / grid.max) ** 0.7;
      const text = opacity > 0.55 ? "#FFFFFF" : INK2;
      const result = entry.tone === "a" ? `${a} won` : entry.tone === "b" ? `${b} won` : "Draw";
      parts.push(`<g><title>${escapeHtml(`${label(ga)}–${label(gb)}: ${fmt(entry.count)} ${series ? "series" : "games"} (${result})`)}</title>`);
      parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${TONE[entry.tone]}" fill-opacity="${opacity.toFixed(2)}"/>`);
      parts.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="${cell < 32 ? 11 : 12}" fill="${text}" text-anchor="middle">${fmt(entry.count)}</text></g>`);
      if (entry === grid.best) {
        parts.push(`<rect x="${x - 1.5}" y="${y - 1.5}" width="${cell + 3}" height="${cell + 3}" rx="4" fill="none" stroke="${INK}" stroke-width="1.5"/>`);
      }
    }
  }
  // Draw diagonal: above it the left player won, below it the right player won.
  parts.push(`<line x1="${lw}" y1="${th + span}" x2="${lw + span}" y2="${th}" stroke="${INK3}" stroke-dasharray="2 3" opacity="0.7"/>`);
  container.innerHTML = svgMarkup(width, height, parts.join(""),
    `Scoreline grid: ${a} ${series ? "games" : "goals"} down the side, ${b} across the top.`);

  if (!caption) return;
  caption.replaceChildren();
  const best = grid.best;
  const strong = document.createElement("b");
  const bestLabel = `${label(best.a)}–${label(best.b)}`;
  strong.textContent = best.tone === "d" ? `${bestLabel} draws` : `${bestLabel} to ${best.tone === "a" ? a : b}`;
  const unit = series ? "series" : "games";
  const oneGoal = series ? 0 : items.filter((item) => item.goal_abs === 1).length;
  caption.append(
    strong,
    ` ${best.tone === "d" ? "are" : "is"} the most common ${series ? "series score" : "result"} (${fmt(best.count)} ${unit}).`,
    series ? "" : ` ${fmt(oneGoal)} of ${fmt(items.length)} games were decided by one goal.`,
    ` Above the dotted line ${a} won, below it ${b} won.`
  );
}

// ── Season by season (diverging bars) ───────────────────────────────
function renderSeasons(items) {
  const container = document.getElementById("seasons");
  if (!container) return;
  const { a, b } = namesOf();
  const series = isSeriesMode();
  setText("seasons-sub", `Share of each year's ${series ? "series" : "games"} won, ${a} left, ${b} right`);
  const seasons = seasonsOf(items);
  const latest = getChronologicalItems(items).at(-1);
  const currentYear = String(new Date().getFullYear());
  const row = (cells, className = "srow") => {
    const div = document.createElement("div");
    div.className = className;
    div.innerHTML = cells;
    return div;
  };
  const rows = [row(`<span>Year</span><span class="rec">W–D–L</span>
    <span class="div"><span class="half l">${escapeHtml(a)} wins</span><span class="half r">${escapeHtml(b)} wins</span></span>
    <span class="edge">Edge</span>`, "srow head")];
  seasons.forEach((season) => {
    const games = season.a + season.b + season.d;
    const partial = season.year === currentYear && latest?.date?.startsWith(currentYear);
    const month = partial ? monthYear(latest.end_date || latest.date).split(" ")[0] : "";
    const diff = season.a - season.b;
    const edge = diff > 0 ? `<span class="edge a">${escapeHtml(a)} +${diff}</span>`
      : diff < 0 ? `<span class="edge b">${escapeHtml(b)} +${-diff}</span>`
        : `<span class="edge d">Level</span>`;
    const div = row(`<span class="yr">${season.year}${partial ? `<small>to ${month}</small>` : ""}</span>
      <span class="rec">${season.a}–${season.d}–${season.b}</span>
      <span class="div" role="img" aria-label="${season.year}: ${escapeHtml(a)} won ${season.a}, ${escapeHtml(b)} won ${season.b}, ${season.d} drawn">
        <span class="half l"><span style="width:${((season.a / games) * 100).toFixed(1)}%;background:var(--a)"></span></span>
        <span class="half r"><span style="width:${((season.b / games) * 100).toFixed(1)}%;background:var(--b)"></span></span>
      </span>${edge}`);
    rows.push(div);
  });
  container.replaceChildren(...rows);
}

// ── Player: win rate by season ──────────────────────────────────────
function renderSeasonBars(items) {
  const container = document.getElementById("season-chart");
  if (!container) return;
  const seasons = seasonsOf(items);
  if (!seasons.length) {
    container.replaceChildren();
    return;
  }
  const width = widthOf(container, 640);
  const compact = width < 480;
  const height = compact ? 230 : 300;
  const pl = 40;
  const pr = 8;
  const pt = 20;
  const pb = 40;
  const pw = width - pl - pr;
  const ph = height - pt - pb;
  const rates = seasons.map((s) => {
    const games = s.a + s.b + s.d;
    return { ...s, games, rate: games ? s.a / games : 0 };
  });
  const top = rates.some((r) => r.rate > 0.75) ? 1 : 0.75;
  const maxGames = Math.max(...rates.map((r) => r.games));
  const bw = pw / rates.length;
  const Y = (v) => pt + ph * (1 - v / top);
  const parts = [];
  for (let v = 0; v <= top + 1e-9; v += 0.25) {
    const y = Y(v);
    const mid = Math.abs(v - 0.5) < 1e-9;
    parts.push(`<line x1="${pl}" x2="${width - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${mid ? LINE2 : LINE}"${mid ? ' stroke-dasharray="3 3"' : ""}/>`);
    parts.push(`<text x="${pl - 8}" y="${(y + 4).toFixed(1)}" ${FONT} fill="${INK3}" text-anchor="end">${Math.round(v * 100)}%</text>`);
  }
  const skipEvery = compact && rates.length > 8 ? 2 : 1;
  rates.forEach((r, index) => {
    const x = pl + index * bw + bw * 0.18;
    const w = bw * 0.64;
    const y = Y(r.rate);
    const opacity = 0.3 + 0.7 * Math.sqrt(r.games / maxGames);
    parts.push(`<g><title>${r.year}: ${Math.round(r.rate * 100)}% of ${fmt(r.games)} ${isSeriesMode() ? "series" : "games"} won</title>`);
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(pt + ph - y).toFixed(1)}" rx="2" fill="${A}" fill-opacity="${opacity.toFixed(2)}"/></g>`);
    parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="${compact ? 10 : 12}" font-weight="600" fill="${INK}" text-anchor="middle">${Math.round(r.rate * 100)}${compact ? "" : "%"}</text>`);
    if (index % skipEvery === 0 || index === rates.length - 1) {
      parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${height - 22}" ${FONT} fill="${INK2}" text-anchor="middle">${compact ? `'${r.year.slice(2)}` : r.year}</text>`);
      parts.push(`<text x="${(x + w / 2).toFixed(1)}" y="${height - 6}" font-size="11" fill="${INK3}" text-anchor="middle">${fmt(r.games)}</text>`);
    }
  });
  container.innerHTML = svgMarkup(width, height, parts.join(""),
    `Win rate by season: ${rates.map((r) => `${r.year} ${Math.round(r.rate * 100)}%`).join(", ")}.`);
}

// ── Player: who they play ───────────────────────────────────────────
function opponentButton(record, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `link-btn ${className}`;
  button.textContent = record.name;
  button.title = `Compare with ${record.name}`;
  button.addEventListener("click", () => {
    if (record.id) requestView({ p2: record.id });
  });
  return button;
}

function renderWhoPlays(items, records) {
  const container = document.getElementById("who-plays");
  if (!container) return;
  container.replaceChildren();
  if (!records.length) return;
  const total = items.length;
  const series = isSeriesMode();
  const unit = series ? "series" : "games";
  const { a } = namesOf();
  const eyebrow = document.createElement("div");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Who ${a} plays`;
  const big = document.createElement("p");
  big.className = "big";
  const top = records.slice(0, 2);
  const topGames = top.reduce((sum, r) => sum + r.games, 0);
  const share = total ? Math.round((topGames / total) * 100) : 0;
  const pct = document.createElement("span");
  pct.textContent = `${share}%`;
  if (records.length > 2) {
    big.append(pct, ` of ${unit} are against just two opponents.`);
  } else {
    big.append(`${records.length === 1 ? "One opponent" : "Two opponents"} so far.`);
  }
  const rest = records.slice(2);
  const restGames = rest.reduce((sum, r) => sum + r.games, 0);
  const restWins = rest.reduce((sum, r) => sum + r.wins, 0);
  const split = document.createElement("div");
  split.className = "split";
  split.setAttribute("aria-hidden", "true");
  const segment = (games, style) => {
    const span = document.createElement("span");
    span.style.width = `${(games / total) * 100}%`;
    Object.assign(span.style, style);
    return span;
  };
  split.append(segment(top[0].games, { background: "var(--a)" }));
  if (top[1]) split.append(segment(top[1].games, { background: "var(--a)", opacity: "0.55" }));
  if (restGames) split.append(segment(restGames, { background: "var(--line-2)", flex: "1" }));
  const legend = document.createElement("div");
  legend.className = "split-legend";
  const rate = (wins, games) => (games ? `${Math.round((wins / games) * 100)}%` : "—");
  const legendRow = (dotStyle, name, games, wins) => {
    const div = document.createElement("div");
    const dot = document.createElement("i");
    dot.className = "dot";
    Object.assign(dot.style, dotStyle);
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.append(name);
    const g = document.createElement("b");
    g.textContent = fmt(games);
    const w = document.createElement("em");
    w.textContent = rate(wins, games);
    div.append(dot, nm, g, w);
    return div;
  };
  const head = document.createElement("div");
  head.className = "head";
  head.innerHTML = `<span>Opponent</span><b>${series ? "Series" : "Games"}</b><em>Won</em>`;
  legend.append(head, legendRow({ background: "var(--a)" }, opponentButton(top[0], ""), top[0].games, top[0].wins));
  if (top[1]) legend.append(legendRow({ background: "var(--a)", opacity: "0.55" }, opponentButton(top[1], ""), top[1].games, top[1].wins));
  if (rest.length) legend.append(legendRow({ background: "var(--line-2)" }, `${fmt(rest.length)} other opponent${rest.length === 1 ? "" : "s"}`, restGames, restWins));
  container.append(eyebrow, big, split, legend);

  const extremes = opponentExtremes(records, series ? 8 : 40);
  if (extremes && extremes.best !== extremes.worst) {
    const block = document.createElement("div");
    block.className = "extremes";
    const side = (title, record, tone) => {
      const div = document.createElement("div");
      const label = document.createElement("div");
      label.className = "eyebrow";
      label.textContent = title;
      const meta = document.createElement("div");
      meta.className = "xs";
      const strong = document.createElement("span");
      strong.className = tone;
      strong.textContent = rate(record.wins, record.games);
      meta.append(strong, ` won in ${fmt(record.games)} ${unit}`);
      div.append(label, opponentButton(record, "xn"), meta);
      return div;
    };
    block.append(side("Best record", extremes.best, "a"), side("Toughest opponent", extremes.worst, "b"));
    const foot = document.createElement("p");
    foot.className = "xfoot";
    foot.textContent = `Opponents with ${extremes.threshold}+ ${unit}, draws counted as half`;
    container.append(block, foot);
  }
}

// ── Player: rival map ───────────────────────────────────────────────
function renderRivalMap(items, records) {
  const container = document.getElementById("rival-map");
  if (!container) return;
  const series = isSeriesMode();
  const unit = series ? "series" : "games";
  const { a } = namesOf();
  let minGames = series ? 2 : 5;
  let pool = records.filter((r) => r.games >= minGames && r.id);
  if (pool.length < 6) {
    minGames = 1;
    pool = records.filter((r) => r.id);
  }
  setText("rival-sub", `Every opponent with ${minGames}+ ${unit}. Higher is a better win rate for ${a}, further right is more ${unit}.`);
  if (!pool.length) {
    container.replaceChildren();
    return;
  }
  const extremes = opponentExtremes(records, series ? 8 : 40);
  const solidFrom = extremes ? extremes.threshold : 0;
  setLegend("rival-legend", [
    ["a", `${a} wins more`],
    ["b", "Opponent wins more"],
    ...(solidFrom > minGames ? [["faint", `Faded: under ${solidFrom} ${unit}`]] : []),
  ]);
  const width = widthOf(container, 1150);
  const compact = width < 560;
  const height = compact ? 260 : 320;
  const pl = 44;
  const pr = 16;
  const pt = 16;
  const pb = 44;
  const pw = width - pl - pr;
  const ph = height - pt - pb;
  const maxGames = Math.max(...pool.map((r) => r.games));
  const lo = Math.log10(Math.max(1, minGames));
  const hi = Math.log10(Math.max(minGames * 4, maxGames * 1.15));
  const X = (g) => pl + (pw * (Math.log10(g) - lo)) / (hi - lo);
  const Y = (rate) => pt + ph * (1 - rate);
  const parts = [];
  [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
    const y = Y(v);
    parts.push(`<line x1="${pl}" x2="${width - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${v === 0.5 ? LINE2 : LINE}"${v === 0.5 ? ' stroke-dasharray="3 3"' : ""}/>`);
    parts.push(`<text x="${pl - 8}" y="${(y + 4).toFixed(1)}" ${FONT} fill="${INK3}" text-anchor="end">${v * 100}%</text>`);
  });
  [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
    .filter((g) => Math.log10(g) >= lo - 1e-9 && Math.log10(g) <= hi)
    .filter((g, i, list) => !compact || [1, 5, 10, 50, 100, 500, 1000].includes(g) || list.length < 6)
    .forEach((g) => {
      parts.push(`<text x="${X(g).toFixed(1)}" y="${height - 22}" ${FONT} fill="${INK3}" text-anchor="middle">${fmt(g)}</text>`);
    });
  parts.push(`<text x="${width - pr}" y="${height - 4}" ${FONT} fill="${INK2}" text-anchor="end">${series ? "Series" : "Games"} played (log scale) →</text>`);

  const ordered = [...pool].sort((x, y) => x.games - y.games);
  const points = ordered.map((record) => ({
    record,
    x: X(record.games),
    y: Y(winRate(record)),
    solid: record.games >= solidFrom,
  }));
  points.forEach((p) => {
    const tone = TONE[p.record.edge];
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.solid ? 5 : 3.5}" fill="${tone}" fill-opacity="${p.solid ? 0.9 : 0.35}"/>`);
  });

  // Label the most-played opponents and the extremes, skipping overlaps.
  const labelled = [];
  const want = [...records.slice(0, 2)];
  if (extremes) want.push(extremes.best, extremes.worst);
  if (!compact) {
    const solid = records.filter((r) => r.games >= solidFrom && r.id);
    const byRate = [...solid].sort((x, y) => winRate(y) - winRate(x));
    if (byRate[1]) want.push(byRate[1]);
    if (byRate.length > 2) want.push(byRate[byRate.length - 2]);
  }
  const boxes = [];
  want.forEach((record) => {
    if (!record || labelled.includes(record)) return;
    const point = points.find((p) => p.record === record);
    if (!point) return;
    const text = `${lastName(record.name)} ${Math.round(winRate(record) * 100)}%`;
    const textWidth = text.length * 6.6;
    const right = point.x < width * 0.7;
    const x1 = right ? point.x + 10 : point.x - 10 - textWidth;
    const box = [x1, point.y - 10, x1 + textWidth, point.y + 6];
    if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) return;
    boxes.push(box);
    labelled.push(record);
    parts.push(`<text x="${(right ? point.x + 10 : point.x - 10).toFixed(1)}" y="${(point.y + 4).toFixed(1)}" ${FONT} font-weight="600" fill="${INK}" text-anchor="${right ? "start" : "end"}">${escapeHtml(text)}</text>`);
  });
  parts.push(`<circle class="rival-cursor" r="8" fill="none" stroke="${INK}" stroke-width="1.5" opacity="0"/>`);
  container.innerHTML = svgMarkup(width, height, parts.join(""),
    `Rival map of ${pool.length} opponents by ${unit} played and win rate.`);

  const svg = container.querySelector("svg");
  const cursor = svg.querySelector(".rival-cursor");
  const tooltip = ensureChartTooltip(container);
  let active = null;
  const nearest = (event) => {
    const box = svg.getBoundingClientRect();
    const scale = width / box.width;
    const x = (event.clientX - box.left) * scale;
    const y = (event.clientY - box.top) * scale;
    let best = null;
    let bestDistance = 18 * 18;
    points.forEach((p) => {
      const distance = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (distance < bestDistance) {
        best = p;
        bestDistance = distance;
      }
    });
    return { point: best, scale };
  };
  const hide = () => {
    active = null;
    cursor.setAttribute("opacity", "0");
    svg.style.cursor = "";
    hideChartTooltip(tooltip);
  };
  bindChartTooltip(svg, (event) => {
    const { point, scale } = nearest(event);
    if (!point) {
      hide();
      return;
    }
    active = point;
    svg.style.cursor = "pointer";
    cursor.setAttribute("cx", point.x);
    cursor.setAttribute("cy", point.y);
    cursor.setAttribute("opacity", "1");
    const r = point.record;
    const html = `<div class="tooltip-title">${escapeHtml(r.name)}</div>
      <div class="tooltip-kv"><strong>${r.wins}–${r.draws}–${r.losses}</strong> in ${fmt(r.games)} ${unit}</div>
      <div class="tooltip-kv">${Math.round(winRate(r) * 100)}% won · click to compare</div>`;
    showChartTooltip(container, tooltip, html, point.x / scale - 6, point.x / scale + 6, point.y / scale);
  }, hide);
  svg.addEventListener("click", (event) => {
    const { point } = nearest(event);
    const target = point || active;
    if (target?.record?.id) {
      requestView({ p2: target.record.id });
    }
  });
}

// ── Entry point ─────────────────────────────────────────────────────
let lastItems = [];
let lastWidth = 0;
let resizeBound = false;

function bindResize() {
  if (resizeBound || typeof window === "undefined") return;
  resizeBound = true;
  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const width = window.innerWidth;
      if (width === lastWidth || !lastItems.length) return;
      renderCharts(lastItems);
    }, 150);
  });
}

export function renderCharts(items) {
  lastItems = items;
  lastWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  bindResize();
  if (!state.playerA) return;
  if (isSinglePlayerMode()) {
    const records = opponentRecords(items, (id) => getAliasGroup(id)[0], (id) => getPlayerById(id)?.name);
    renderSeasonBars(items);
    renderWhoPlays(items, records);
    renderRivalMap(items, records);
    return;
  }
  renderLeadChart(items);
  renderTournamentStrip(items);
  renderScorelines(items);
  renderSeasons(items);
}
