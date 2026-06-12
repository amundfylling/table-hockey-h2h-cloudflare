import { state, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { computeSummary, getHighlightInfo, getSeriesHighlightInfo, formatPercent } from "./summary.js";
import { computeSeriesSummary } from "./series.js";
import { formatWorldRank } from "./players.js";
import { getActiveFilterCount } from "./filters.js";
import { getChronologicalItems } from "./form.js";
import { getTournamentLevelLabel } from "./utils.js";

// Helper to sanitize player name for filename
function sanitizeName(name) {
  if (!name) return "player";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

// Draw a rounded rectangle path helper
function roundRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

// Draw a rounded rectangle with fill and stroke
function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  roundRect(ctx, x, y, width, height, radius);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Draw truncated text helper
function drawTruncatedText(ctx, text, x, y, maxWidth, font, color, textAlign = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = textAlign;
  
  let currentText = String(text ?? "");
  if (ctx.measureText(currentText).width > maxWidth) {
    while (currentText.length > 0 && ctx.measureText(currentText + "...").width > maxWidth) {
      currentText = currentText.slice(0, -1);
    }
    currentText += "...";
  }
  ctx.fillText(currentText, x, y);
}

// Draw player name with auto-scaling to prevent overlapping
function drawPlayerName(ctx, name, x, y, isRightAligned, colors, dryRun = false) {
  let fontSize = 42; // Increased from 38px
  ctx.font = `bold ${fontSize}px Fraunces`;
  ctx.textAlign = isRightAligned ? "right" : "left";
  
  // Max width: 420px
  while (ctx.measureText(name).width > 420 && fontSize > 20) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px Fraunces`;
  }
  
  const textWidth = ctx.measureText(name).width;
  
  if (dryRun) {
    return { fontSize, textWidth };
  }
  
  ctx.fillStyle = isRightAligned ? colors.orange : colors.teal;
  ctx.fillText(name, x, y);
  return { fontSize, textWidth };
}

export async function handleShareImage() {
  const playerA = state.playerA;
  const playerB = state.playerB;
  
  if (!playerA) return;
  
  // 1. Wait for web fonts to load
  try {
    await document.fonts.ready;
    await Promise.all([
      document.fonts.load("bold 42px Fraunces"),
      document.fonts.load("bold 22px Manrope"),
      document.fonts.load("bold 20px Manrope"),
      document.fonts.load("bold 16px Manrope"),
      document.fonts.load("bold 15px Manrope"),
      document.fonts.load("bold 14px Manrope"),
      document.fonts.load("bold 24px Manrope"),
      document.fonts.load("bold 32px Manrope"),
      document.fonts.load("bold 60px Fraunces"),
      document.fonts.load("bold 12px Manrope"),
      document.fonts.load("bold 13px Manrope")
    ]);
  } catch (err) {
    console.warn("Font loading API failed or timed out, proceeding with fallback fonts.", err);
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  
  // 3. Theme Colors
  const isDark = document.body.getAttribute("data-theme") === "dark";
  const colors = {
    bg: isDark ? "#0f1215" : "#f6f2ec",
    surface: isDark ? "#1b2128" : "#ffffff",
    text: isDark ? "#f3f5f7" : "#182025",
    muted: isDark ? "#a5b0bb" : "#5c6770",
    border: isDark ? "#262e38" : "#e4dfd5",
    teal: "#2a7564",
    orange: "#ef6c44",
    draw: isDark ? "#2f3944" : "#e4dfd5",
    drawChipBg: isDark ? "#3a4654" : "#d8d2c5",
    drawPillBg: isDark ? "#222a33" : "#ffffff",
    drawPillText: isDark ? "#f3f5f7" : "#182025",
    tealSoft: isDark ? "rgba(42, 117, 100, 0.25)" : "rgba(42, 117, 100, 0.08)",
    orangeSoft: isDark ? "rgba(239, 108, 68, 0.25)" : "rgba(239, 108, 68, 0.08)"
  };
  
  // Fill background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 1080, 1080);
  
  // 5. Player Names & Rank Badges
  const nameA = playerA.name || "Player A";
  const rankA = formatWorldRank(playerA);
  
  // Dry run player A name
  const dryA = drawPlayerName(ctx, nameA, 0, 0, false, colors, true);
  let fontSizeA = dryA.fontSize;
  
  // Player B
  let nameB = "";
  let rankB = null;
  let fontSizeB = 32; // Default for "ALL OPPONENTS" (bold 32px Manrope)
  
  const isSingle = isSinglePlayerMode();
  if (!isSingle) {
    nameB = playerB?.name || "Player B";
    rankB = formatWorldRank(playerB);
    const dryB = drawPlayerName(ctx, nameB, 0, 0, true, colors, true);
    fontSizeB = dryB.fontSize;
  }
  
  // Shared baseline Y
  const maxFontSize = Math.max(fontSizeA, fontSizeB);
  const nameBaselineY = 28 + maxFontSize; // e.g. 70 if max font size is 42
  
  // Draw A name
  drawPlayerName(ctx, nameA, 64, nameBaselineY, false, colors, false);
  
  // Draw B name
  if (isSingle) {
    ctx.font = "bold 32px Manrope";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "right";
    ctx.fillText("ALL OPPONENTS", 1016, nameBaselineY);
  } else {
    drawPlayerName(ctx, nameB, 1016, nameBaselineY, true, colors, false);
  }
  
  // Rank pills
  const pillW = 105;
  const pillH = 32;
  const rankPillY = nameBaselineY + 18;
  const hasRank = !!(rankA || rankB);
  
  if (rankA) {
    drawRoundRect(ctx, 64, rankPillY, pillW, pillH, 6, colors.tealSoft, null);
    ctx.font = "bold 16px Manrope";
    ctx.fillStyle = colors.teal;
    ctx.textAlign = "center";
    ctx.fillText(rankA, 64 + (pillW / 2), rankPillY + 22);
  }
  
  if (rankB && !isSingle) {
    drawRoundRect(ctx, 1016 - pillW, rankPillY, pillW, pillH, 6, colors.orangeSoft, null);
    ctx.font = "bold 16px Manrope";
    ctx.fillStyle = colors.orange;
    ctx.textAlign = "center";
    ctx.fillText(rankB, 1016 - (pillW / 2), rankPillY + 22);
  }
  
  let cursorY = nameBaselineY + (hasRank ? 60 : 10);
  
  // 6. Compute Data
  const matches = state.filteredMatches || [];
  const isSeries = isSeriesMode();
  const summary = isSeries ? computeSeriesSummary(matches) : computeSummary(matches);
  
  // 6b. Last-10 games form strip
  const ordered = getChronologicalItems(matches).slice(-10);
  if (ordered.length > 0) {
    const formLabelY = cursorY + 12;
    const formChipsY = cursorY + 25;
    const chipW = 54;
    const chipH = 42;
    const gap = 8;
    
    // Draw label
    ctx.font = "bold 14px Manrope";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
    const formLabel = isSeries ? "LAST 10 SERIES" : "LAST 10 GAMES";
    ctx.fillText(formLabel, 540, formLabelY);
    if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
    
    // Draw chips
    const totalChipsW = (ordered.length * chipW) + ((ordered.length - 1) * gap);
    let startX = (1080 - totalChipsW) / 2;
    
    ctx.textBaseline = "middle";
    ordered.forEach((match, index) => {
      const x = startX + index * (chipW + gap);
      const y = formChipsY;
      
      let bg, textColor, letter;
      if (match.result === "A") {
        bg = colors.teal;
        textColor = "#ffffff";
        letter = "W";
      } else if (match.result === "B") {
        bg = colors.orange;
        textColor = "#ffffff";
        letter = "L";
      } else {
        bg = colors.drawChipBg;
        textColor = colors.text;
        letter = "D";
      }
      
      drawRoundRect(ctx, x, y, chipW, chipH, 8, bg, colors.border);
      
      ctx.font = "bold 20px Manrope";
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.fillText(letter, x + chipW / 2, y + chipH / 2);
    });
    ctx.textBaseline = "alphabetic";
    
    cursorY = formChipsY + chipH;
  }
  
  // 6c. Games Count Badge
  const gamesCountY = cursorY + 18;
  ctx.font = "bold 14px Manrope";
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "center";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0.5px";
  
  let gamesText = "";
  if (isSeries) {
    gamesText = `${summary.total} SERIES  ·  ${summary.tournaments.size} ${summary.tournaments.size === 1 ? "TOURNAMENT" : "TOURNAMENTS"}`;
  } else {
    gamesText = `${summary.total} ${summary.total === 1 ? "GAME" : "GAMES"}  ·  ${summary.tournaments.size} ${summary.tournaments.size === 1 ? "TOURNAMENT" : "TOURNAMENTS"}`;
  }
  ctx.fillText(gamesText, 540, gamesCountY);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  cursorY = gamesCountY + 22;
  
  // 7. W-D-L Bar
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;
  
  const barX = 64;
  const barY = cursorY + 8;
  const barW = 952;
  const barH = 72;
  const barR = 36;
  
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, barX, barY, barW, barH, barR);
  ctx.closePath();
  ctx.clip();
  
  // Proportional widths
  let wA = 0;
  let wDraw = 0;
  let wB = 0;
  
  if (total > 0) {
    wA = (summary.winsA / total) * barW;
    wDraw = (summary.draws / total) * barW;
    wB = (summary.winsB / total) * barW;
  } else {
    wDraw = barW;
  }
  
  // Draw A wins
  ctx.fillStyle = colors.teal;
  ctx.fillRect(barX, barY, wA, barH);
  
  // Draw Draws
  ctx.fillStyle = colors.draw;
  ctx.fillRect(barX + wA, barY, wDraw, barH);
  
  // Draw B wins/losses
  ctx.fillStyle = colors.orange;
  ctx.fillRect(barX + wA + wDraw, barY, wB, barH);
  ctx.restore();
  
  // Draw win segments text
  ctx.font = "bold 24px Manrope";
  
  // Teal wins text
  if (summary.winsA > 0) {
    if (wA >= 100) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${summary.winsA} (${winPct.toFixed(1)}%)`, barX + wA / 2, barY + barH / 2);
    } else {
      ctx.fillStyle = colors.teal;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${summary.winsA} (${winPct.toFixed(1)}%)`, barX, barY - 8);
    }
  }
  
  // Orange wins text
  if (summary.winsB > 0) {
    if (wB >= 100) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${summary.winsB} (${lossPct.toFixed(1)}%)`, barX + wA + wDraw + wB / 2, barY + barH / 2);
    } else {
      ctx.fillStyle = colors.orange;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${summary.winsB} (${lossPct.toFixed(1)}%)`, barX + barW, barY - 8);
    }
  }
  
  ctx.textBaseline = "alphabetic";
  cursorY = barY + barH;
  
  // 7a. Draws Summary (below bar)
  const drawsSummaryY = cursorY + 20;
  ctx.font = "bold 14px Manrope";
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "center";
  
  let drawsText = "";
  if (isSeries) {
    drawsText = `${summary.draws} Tied (${drawPct.toFixed(1)}%)`;
  } else {
    const drawLabel = summary.draws === 1 ? "Draw" : "Draws";
    drawsText = `${summary.draws} ${drawLabel} (${drawPct.toFixed(1)}%)`;
  }
  
  ctx.fillText(drawsText, 540, drawsSummaryY);
  
  cursorY = cursorY + 42;
  
  // 7b. Active Filters Badge Bar
  const filterLabels = [];
  
  if (state.stageTab === "playoff") {
    filterLabels.push("Playoffs");
  } else if (state.stageTab === "round-robin") {
    filterLabels.push("Round Robin");
  }
  
  if (state.filters.search.trim()) {
    filterLabels.push(`"${state.filters.search}"`);
  }
  if (state.filters.yearFrom !== "all" || state.filters.yearTo !== "all") {
    const from = state.filters.yearFrom === "all" ? "Earliest" : state.filters.yearFrom;
    const to = state.filters.yearTo === "all" ? "Latest" : state.filters.yearTo;
    filterLabels.push(`${from} – ${to}`);
  }
  if (state.filters.tournament !== "all") {
    const selectEl = document.getElementById("tournament-filter");
    const opt = selectEl ? selectEl.querySelector(`option[value="${CSS.escape(state.filters.tournament)}"]`) : null;
    filterLabels.push(opt ? opt.textContent : state.filters.tournament);
  }
  if (state.filters.tournamentLevels.length) {
    const labels = state.filters.tournamentLevels
      .map((v) => getTournamentLevelLabel(v))
      .join(", ");
    filterLabels.push(`Level: ${labels}`);
  }
  if (state.filters.stage !== "all") {
    filterLabels.push(`Stage: ${state.filters.stage}`);
  }
  if (state.filters.otOnly) {
    filterLabels.push("Overtime only");
  }
  if (state.filters.tightOnly) {
    filterLabels.push("Tight games");
  }
  if (state.stageTab === "playoff" && state.filters.bestOf.length) {
    const labels = state.filters.bestOf
      .map((v) => (v === "1" ? "Single" : `Bo${v}`))
      .join(", ");
    filterLabels.push(labels);
  }
  
  const hasActiveFilters = (getActiveFilterCount() > 0 || state.stageTab !== "overall");
  
  const filterBarY = cursorY + 8;
  const filterBarH = 34;
  
  if (!hasActiveFilters) {
    ctx.font = "bold 16px Manrope";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const noFilterText = isSeries ? "Showing all series" : "Showing all matches";
    ctx.fillText(noFilterText, 540, filterBarY + filterBarH / 2);
    ctx.textBaseline = "alphabetic";
  } else {
    ctx.font = "bold 15px Manrope";
    const pillWidths = filterLabels.map(label => {
      return ctx.measureText(label).width + 28;
    });
    
    ctx.font = "bold 13px Manrope";
    const prefixWidth = ctx.measureText("FILTERS:").width + 10;
    
    let totalWidth = prefixWidth;
    for (let i = 0; i < pillWidths.length; i++) {
      totalWidth += pillWidths[i];
      if (i < pillWidths.length - 1) {
        totalWidth += 8;
      }
    }
    
    let visibleCount = filterLabels.length;
    let computedTotalWidth = totalWidth;
    
    if (computedTotalWidth > 952) {
      ctx.font = "bold 15px Manrope";
      const morePillWidth = ctx.measureText("+9 more").width + 28;
      
      let currentWidth = prefixWidth;
      visibleCount = 0;
      for (let i = 0; i < filterLabels.length; i++) {
        const nextWidth = currentWidth + pillWidths[i] + (visibleCount > 0 ? 8 : 0);
        const isLast = (i === filterLabels.length - 1);
        const requiredLimit = isLast ? 952 : 952 - morePillWidth - 8;
        if (nextWidth <= requiredLimit) {
          currentWidth = nextWidth;
          visibleCount++;
        } else {
          break;
        }
      }
      
      const remainingCount = filterLabels.length - visibleCount;
      if (remainingCount > 0) {
        ctx.font = "bold 15px Manrope";
        const actualMorePillWidth = ctx.measureText(`+${remainingCount} more`).width + 28;
        computedTotalWidth = currentWidth + 8 + actualMorePillWidth;
      } else {
        computedTotalWidth = currentWidth;
      }
    }
    
    let filterStartX = (1080 - computedTotalWidth) / 2;
    let currentX = filterStartX;
    
    ctx.font = "bold 13px Manrope";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("FILTERS:", currentX, filterBarY + filterBarH / 2);
    currentX += prefixWidth;
    
    ctx.textBaseline = "middle";
    const pillBg = isDark ? "rgba(42, 117, 100, 0.20)" : "rgba(42, 117, 100, 0.12)";
    
    for (let i = 0; i < visibleCount; i++) {
      const label = filterLabels[i];
      const pW = pillWidths[i];
      
      drawRoundRect(
        ctx,
        currentX,
        filterBarY,
        pW,
        filterBarH,
        filterBarH / 2,
        pillBg,
        null
      );
      
      ctx.font = "bold 15px Manrope";
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "center";
      ctx.fillText(label, currentX + pW / 2, filterBarY + filterBarH / 2);
      
      currentX += pW + 8;
    }
    
    const remainingCount = filterLabels.length - visibleCount;
    if (remainingCount > 0) {
      ctx.font = "bold 15px Manrope";
      const moreLabel = `+${remainingCount} more`;
      const pW = ctx.measureText(moreLabel).width + 28;
      
      drawRoundRect(
        ctx,
        currentX,
        filterBarY,
        pW,
        filterBarH,
        filterBarH / 2,
        pillBg,
        null
      );
      
      ctx.fillStyle = colors.muted;
      ctx.textAlign = "center";
      ctx.fillText(moreLabel, currentX + pW / 2, filterBarY + filterBarH / 2);
    }
    ctx.textBaseline = "alphabetic";
  }
  
  cursorY = filterBarY + filterBarH;
  
  // 8. Stats Grid Card (Row layout)
  const cardX = 64;
  const cardY = cursorY + 16;
  const cardW = 952;
  const cardH = 270;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 12, colors.surface, colors.border);
  
  // Header bar
  ctx.font = "bold 12px Manrope";
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "left";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "1.5px";
  ctx.fillText(isSeries ? "SERIES STATISTICS" : "MATCH STATISTICS", cardX + 32, cardY + 24);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  // Calculate Row Values
  let rowData = [];
  if (isSeries) {
    rowData = [
      {
        label: "GAMES WON IN SERIES",
        left: summary.gameWinsA,
        right: summary.gameWinsB
      },
      {
        label: "TOTAL GOALS IN SERIES",
        left: summary.goalsA,
        right: summary.goalsB
      },
      {
        label: "AVG GOALS / SERIES",
        left: total > 0 ? (summary.goalsA / total).toFixed(1) : "0.0",
        right: total > 0 ? (summary.goalsB / total).toFixed(1) : "0.0"
      }
    ];
  } else {
    rowData = [
      {
        label: isSingle ? "GOALS FOR / AGAINST" : "TOTAL GOALS SCORED",
        left: summary.goalsA,
        right: summary.goalsB
      },
      {
        label: isSingle ? "TIGHT WINS / LOSSES" : "TIGHT WINS (1-GOAL)",
        left: summary.tightWins,
        right: summary.tightLosses
      },
      {
        label: isSingle ? "OVERTIME WINS / LOSSES" : "OVERTIME WINS",
        left: summary.otWinsA,
        right: summary.otWinsB
      }
    ];
  }
  
  // Draw Rows
  const startRowY = cardY + 30;
  const rowH = 80;
  ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    const rY = startRowY + i * rowH;
    const centerY = rY + rowH / 2;
    const rData = rowData[i];
    
    // Draw left value
    ctx.font = "bold 32px Manrope";
    ctx.fillStyle = colors.teal;
    ctx.textAlign = "left";
    ctx.fillText(String(rData.left), cardX + 32, centerY);
    
    // Draw center label
    ctx.font = "bold 16px Manrope";
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
    ctx.fillText(rData.label, 540, centerY - 2);
    if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
    
    // Draw right value
    ctx.font = "bold 32px Manrope";
    ctx.fillStyle = colors.orange;
    ctx.textAlign = "right";
    ctx.fillText(String(rData.right), cardX + cardW - 32, centerY);
    
    // Draw divider lines (between rows)
    if (i < 2) {
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX + 32, rY + rowH);
      ctx.lineTo(cardX + cardW - 32, rY + rowH);
      ctx.stroke();
    }
  }
  ctx.textBaseline = "alphabetic";
  
  cursorY = cardY + cardH;
  
  // 9. Biggest Win Cards
  const panelY = cursorY + 16;
  const panelW = 460;
  const panelH = 210;
  const panelLA_X = 64;
  const panelRB_X = 556;
  
  // Get highlight objects
  let infoA, infoB;
  let labelA = isSingle ? "BIGGEST WIN" : (isSeries ? "LARGEST WIN" : "BIGGEST WIN");
  let labelB = isSingle 
    ? (isSeries ? "BIGGEST SERIES LOSS" : "BIGGEST LOSS") 
    : (isSeries ? "LARGEST WIN" : "BIGGEST WIN");
  
  if (isSeries) {
    infoA = getSeriesHighlightInfo(summary.largestWin, "a");
    infoB = getSeriesHighlightInfo(summary.largestLoss, "b");
  } else {
    infoA = getHighlightInfo(summary.largestWin, "a");
    infoB = getHighlightInfo(summary.largestLoss, "b");
  }
  
  // Draw subtle box shadows in Light theme
  if (!isDark) {
    drawRoundRect(ctx, panelLA_X - 1, panelY + 2, panelW + 2, panelH + 2, 13, "rgba(24, 32, 37, 0.06)", null);
    drawRoundRect(ctx, panelRB_X - 1, panelY + 2, panelW + 2, panelH + 2, 13, "rgba(24, 32, 37, 0.06)", null);
  }
  
  // Panel A
  drawRoundRect(ctx, panelLA_X, panelY, panelW, panelH, 12, colors.surface, colors.border);
  ctx.font = "bold 13px Manrope";
  ctx.fillStyle = colors.teal;
  ctx.textAlign = "left";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
  ctx.fillText(labelA, panelLA_X + 32, panelY + 40);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  if (infoA && infoA.score && infoA.score !== "—") {
    ctx.font = "bold 60px Fraunces";
    ctx.fillStyle = colors.teal;
    ctx.fillText(infoA.score, panelLA_X + 32, panelY + 105);
    
    const oppStr = infoA.opponent !== "—" ? `vs ${infoA.opponent}` : "";
    const dateStr = infoA.date !== "—" ? ` | ${infoA.date}` : "";
    drawTruncatedText(ctx, `${oppStr}${dateStr}`, panelLA_X + 32, panelY + 148, panelW - 64, "15px Manrope", colors.muted);
    drawTruncatedText(ctx, infoA.tournament, panelLA_X + 32, panelY + 178, panelW - 64, "14px Manrope", colors.muted);
  } else {
    ctx.font = "bold 26px Fraunces";
    ctx.fillStyle = colors.muted;
    ctx.fillText("No wins", panelLA_X + 32, panelY + 110);
    ctx.font = "14px Manrope";
    ctx.fillText("For this selection", panelLA_X + 32, panelY + 165);
  }
  
  // Panel B
  drawRoundRect(ctx, panelRB_X, panelY, panelW, panelH, 12, colors.surface, colors.border);
  ctx.font = "bold 13px Manrope";
  ctx.fillStyle = colors.orange;
  ctx.textAlign = "left";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
  ctx.fillText(labelB, panelRB_X + 32, panelY + 40);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  if (infoB && infoB.score && infoB.score !== "—") {
    ctx.font = "bold 60px Fraunces";
    ctx.fillStyle = colors.orange;
    ctx.fillText(infoB.score, panelRB_X + 32, panelY + 105);
    
    const oppStr = infoB.opponent !== "—" ? `vs ${infoB.opponent}` : "";
    const dateStr = infoB.date !== "—" ? ` | ${infoB.date}` : "";
    drawTruncatedText(ctx, `${oppStr}${dateStr}`, panelRB_X + 32, panelY + 148, panelW - 64, "15px Manrope", colors.muted);
    drawTruncatedText(ctx, infoB.tournament, panelRB_X + 32, panelY + 178, panelW - 64, "14px Manrope", colors.muted);
  } else {
    ctx.font = "bold 26px Fraunces";
    ctx.fillStyle = colors.muted;
    ctx.fillText(isSingle ? "No losses" : "No wins", panelRB_X + 32, panelY + 110);
    ctx.font = "14px Manrope";
    ctx.fillText("For this selection", panelRB_X + 32, panelY + 165);
  }
  
  cursorY = panelY + panelH;
  
  // 10. Footer Section
  const dividerY = cursorY + 28;
  const footerTextY = dividerY + 35;
  const footerDateY = footerTextY + 18;
  
  // Gradient divider line
  const grad = ctx.createLinearGradient(64, dividerY, 1016, dividerY);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.5, colors.border);
  grad.addColorStop(1, "transparent");
  
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, dividerY);
  ctx.lineTo(1016, dividerY);
  ctx.stroke();
  
  // Left: Domain Name & Generation Date
  ctx.font = "bold 16px Manrope";
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("table-hockey-h2h.pages.dev", 64, footerTextY);
  
  const dateOptions = { month: "long", day: "numeric", year: "numeric" };
  const dateStr = new Date().toLocaleDateString("en-US", dateOptions);
  ctx.font = "12px Manrope";
  ctx.fillStyle = colors.muted;
  ctx.fillText(dateStr, 64, footerDateY);
  
  // Right: Brand badge icon & Title
  ctx.font = "bold 18px Manrope";
  ctx.fillStyle = colors.orange;
  ctx.textAlign = "right";
  ctx.fillText("Table Hockey H2H", 1016, footerTextY);
  
  const textWidth = ctx.measureText("Table Hockey H2H").width;
  const iconSize = 28;
  const iconX = 1016 - textWidth - 10 - iconSize;
  const iconY = footerTextY - iconSize / 2;
  
  // Draw brand badge background
  drawRoundRect(ctx, iconX, iconY, iconSize, iconSize, 6, colors.orange, null);
  
  // Draw white "H" in badge
  ctx.font = "bold 16px Manrope";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.fillText("H", iconX + iconSize / 2, iconY + iconSize / 2);
  
  ctx.textBaseline = "alphabetic";
  
  // 11. Trigger Web Share or Download Fallback
  canvas.toBlob(async (blob) => {
    if (!blob) {
      console.error("Failed to generate image blob.");
      return;
    }
    
    const fileName = isSinglePlayerMode()
      ? `${sanitizeName(playerA.name)}_profile.png`
      : `${sanitizeName(playerA.name)}_vs_${sanitizeName(playerB?.name)}_h2h.png`;
      
    const file = new File([blob], fileName, { type: "image/png" });
    
    // Dynamically build URL and Text for sharing
    let shareUrl = "";
    try {
      const urlObj = new URL(window.location.href);
      urlObj.host = "table-hockey-h2h.pages.dev";
      urlObj.protocol = "https:";
      urlObj.port = "";
      shareUrl = urlObj.toString();
    } catch (e) {
      shareUrl = isSinglePlayerMode()
        ? `https://table-hockey-h2h.pages.dev/?p1=${playerA.id}`
        : `https://table-hockey-h2h.pages.dev/?p1=${playerA.id}&p2=${playerB?.id}`;
    }

    const shareText = isSinglePlayerMode()
      ? `Check out the competitive stats of ${playerA.name} at ${shareUrl}`
      : `Check out the head-to-head matchup stats between ${playerA.name} and ${playerB?.name} at ${shareUrl}`;
    
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: isSinglePlayerMode() ? `${playerA.name} Profile` : `${playerA.name} vs ${playerB?.name} Matchup`,
          text: shareText
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          downloadImage(blob, fileName);
        }
      }
    } else {
      downloadImage(blob, fileName);
    }
  }, "image/png");
}

function downloadImage(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
