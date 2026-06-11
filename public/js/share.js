import { state, isSeriesMode, isSinglePlayerMode } from "./state.js";
import { computeSummary, getHighlightInfo, getSeriesHighlightInfo, formatPercent } from "./summary.js";
import { computeSeriesSummary } from "./series.js";
import { formatWorldRank } from "./players.js";

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
function drawPlayerName(ctx, name, x, y, isRightAligned, colors) {
  let fontSize = 42; // Increased from 38px
  ctx.font = `bold ${fontSize}px Fraunces`;
  ctx.textAlign = isRightAligned ? "right" : "left";
  
  // Max width: 420px
  while (ctx.measureText(name).width > 420 && fontSize > 20) {
    fontSize -= 2;
    ctx.font = `bold ${fontSize}px Fraunces`;
  }
  
  ctx.fillStyle = isRightAligned ? colors.orange : colors.teal;
  ctx.fillText(name, x, y);
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
      document.fonts.load("bold 16px Manrope"),
      document.fonts.load("bold 15px Manrope"),
      document.fonts.load("bold 24px Manrope"),
      document.fonts.load("bold 32px Manrope"),
      document.fonts.load("bold 60px Fraunces")
    ]);
  } catch (err) {
    console.warn("Font loading API failed or timed out, proceeding with fallback fonts.", err);
  }
  
  // 2. Setup Canvas
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
    drawPillBg: isDark ? "#222a33" : "#ffffff",
    drawPillText: isDark ? "#f3f5f7" : "#182025",
    tealSoft: isDark ? "rgba(42, 117, 100, 0.25)" : "rgba(42, 117, 100, 0.08)",
    orangeSoft: isDark ? "rgba(239, 108, 68, 0.25)" : "rgba(239, 108, 68, 0.08)"
  };
  
  // Fill background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 1080, 1080);
  
  // 4. Header Watermark
  ctx.textAlign = "center";
  ctx.font = "bold 22px Manrope"; // Increased from 16px
  ctx.fillStyle = colors.orange;
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = "3px";
  }
  ctx.fillText("TABLE HOCKEY H2H", 540, 75);
  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = "0px";
  }
  
  ctx.font = "bold 15px Manrope"; // Increased from 13px
  ctx.fillStyle = colors.muted;
  const matchModeLabel = isSinglePlayerMode() 
    ? "PLAYER PROFILE" 
    : (isSeriesMode() ? "PLAYOFF SERIES HEAD TO HEAD" : "HEAD TO HEAD COMPARISON");
  ctx.fillText(matchModeLabel, 540, 115);
  
  // 5. Player Names & Rank Badges
  const nameA = playerA.name || "Player A";
  const rankA = formatWorldRank(playerA);
  
  // Player A
  drawPlayerName(ctx, nameA, 64, 185, false, colors);
  if (rankA) {
    // Rank Pill
    const pillW = 105; // Increased width from 95
    const pillH = 32;
    drawRoundRect(ctx, 64, 210, pillW, pillH, 6, colors.tealSoft, null);
    ctx.font = "bold 16px Manrope"; // Increased from 14px
    ctx.fillStyle = colors.teal;
    ctx.textAlign = "center";
    ctx.fillText(rankA, 64 + (pillW / 2), 232);
  }
  
  // Player B
  if (isSinglePlayerMode()) {
    ctx.font = "bold 32px Manrope"; // Increased from 28px
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "right";
    ctx.fillText("ALL OPPONENTS", 1016, 185);
  } else {
    const nameB = playerB?.name || "Player B";
    const rankB = formatWorldRank(playerB);
    drawPlayerName(ctx, nameB, 1016, 185, true, colors);
    if (rankB) {
      // Rank Pill
      const pillW = 105; // Increased width from 95
      const pillH = 32;
      drawRoundRect(ctx, 1016 - pillW, 210, pillW, pillH, 6, colors.orangeSoft, null);
      ctx.font = "bold 16px Manrope"; // Increased from 14px
      ctx.fillStyle = colors.orange;
      ctx.textAlign = "center";
      ctx.fillText(rankB, 1016 - (pillW / 2), 232);
    }
  }
  
  // 6. Compute Data
  const matches = state.filteredMatches || [];
  const isSeries = isSeriesMode();
  const summary = isSeries ? computeSeriesSummary(matches) : computeSummary(matches);
  
  // 7. W-D-L Bar
  const total = summary.total || 0;
  const winPct = total ? (summary.winsA / total) * 100 : 0;
  const drawPct = total ? (summary.draws / total) * 100 : 0;
  const lossPct = total ? (summary.winsB / total) * 100 : 0;
  
  const barX = 64;
  const barY = 275;
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
  
  // Draw text labels in segments if space permits
  ctx.textBaseline = "middle";
  
  // Teal wins text
  if (wA > 120 && summary.winsA > 0) {
    ctx.font = "bold 24px Manrope"; // Increased from 20px
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(`${summary.winsA} (${winPct.toFixed(1)}%)`, barX + wA / 2, barY + barH / 2);
  }
  
  // Orange wins text
  if (wB > 120 && summary.winsB > 0) {
    ctx.font = "bold 24px Manrope"; // Increased from 20px
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(`${summary.winsB} (${lossPct.toFixed(1)}%)`, barX + wA + wDraw + wB / 2, barY + barH / 2);
  }
  
  // Draws Center Pill
  if (wDraw > 170) {
    const pillW = 175; // Increased from 150
    const pillH = 38; // Increased from 34
    const pillX = barX + wA + (wDraw - pillW) / 2;
    const pillY = barY + 17; // Centered inside 72px bar (72 - 38)/2 = 17px
    
    ctx.font = "bold 12px Manrope"; // Increased from 10px
    ctx.fillStyle = isDark ? colors.muted : "#606870";
    ctx.textAlign = "center";
    ctx.fillText(isSeries ? "SERIES" : "WINS", barX + wA + wDraw / 2, barY + 14);
    
    drawRoundRect(ctx, pillX, pillY + 15, pillW, pillH - 4, 17, colors.drawPillBg, null);
    
    ctx.font = "bold 14px Manrope"; // Increased from 11px
    ctx.fillStyle = colors.drawPillText;
    ctx.textAlign = "center";
    const drawLabelText = isSeries ? `TIED ${summary.draws}` : `DRAWS ${summary.draws} (${drawPct.toFixed(1)}%)`;
    ctx.fillText(drawLabelText, barX + wA + wDraw / 2, pillY + 15 + (pillH - 4) / 2);
  }
  ctx.textBaseline = "alphabetic"; // Reset text baseline
  
  // 8. Stats Grid Card (Row layout)
  const cardX = 64;
  const cardY = 385;
  const cardW = 952;
  const cardH = 240;
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, 12, colors.surface, colors.border);
  
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
        label: isSinglePlayerMode() ? "GOALS FOR / AGAINST" : "TOTAL GOALS SCORED",
        left: summary.goalsA,
        right: summary.goalsB
      },
      {
        label: isSinglePlayerMode() ? "TIGHT WINS / LOSSES" : "TIGHT WINS (1-GOAL)",
        left: summary.tightWins,
        right: summary.tightLosses
      },
      {
        label: isSinglePlayerMode() ? "OVERTIME WINS / LOSSES" : "OVERTIME WINS",
        left: summary.otWinsA,
        right: summary.otWinsB
      }
    ];
  }
  
  // Draw Rows
  const rowH = 80;
  for (let i = 0; i < 3; i++) {
    const rY = cardY + i * rowH;
    const centerY = rY + rowH / 2;
    const rData = rowData[i];
    
    // Draw left value
    ctx.font = "bold 32px Manrope"; // Increased from 24px
    ctx.fillStyle = colors.teal;
    ctx.textAlign = "left";
    ctx.fillText(String(rData.left), cardX + 32, centerY + 10);
    
    // Draw center label
    ctx.font = "bold 16px Manrope"; // Increased from 13px
    ctx.fillStyle = colors.muted;
    ctx.textAlign = "center";
    if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
    ctx.fillText(rData.label, 540, centerY + 5);
    if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
    
    // Draw right value
    ctx.font = "bold 32px Manrope"; // Increased from 24px
    ctx.fillStyle = colors.orange;
    ctx.textAlign = "right";
    ctx.fillText(String(rData.right), cardX + cardW - 32, centerY + 10);
    
    // Draw divider lines (between rows)
    if (i < 2) {
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(cardX + 32, rY + rowH);
      ctx.lineTo(cardX + cardW - 32, rY + rowH);
      ctx.stroke();
    }
  }
  
  // 9. Biggest Win Cards
  const panelY = 660;
  const panelW = 460;
  const panelH = 240;
  const panelLA_X = 64;
  const panelRB_X = 556;
  
  // Get highlight objects
  let infoA, infoB;
  let labelA = isSinglePlayerMode() ? "BIGGEST WIN" : (isSeries ? "LARGEST WIN" : "BIGGEST WIN");
  let labelB = isSinglePlayerMode() 
    ? (isSeries ? "BIGGEST SERIES LOSS" : "BIGGEST LOSS") 
    : (isSeries ? "LARGEST WIN" : "BIGGEST WIN");
  
  if (isSeries) {
    infoA = getSeriesHighlightInfo(summary.largestWin, "a");
    infoB = getSeriesHighlightInfo(summary.largestLoss, "b");
  } else {
    infoA = getHighlightInfo(summary.largestWin, "a");
    infoB = getHighlightInfo(summary.largestLoss, "b");
  }
  
  // Panel A
  drawRoundRect(ctx, panelLA_X, panelY, panelW, panelH, 12, colors.surface, colors.border);
  ctx.font = "bold 13px Manrope";
  ctx.fillStyle = colors.teal;
  ctx.textAlign = "left";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
  ctx.fillText(labelA, panelLA_X + 32, panelY + 45);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  if (infoA && infoA.score && infoA.score !== "—") {
    ctx.font = "bold 60px Fraunces";
    ctx.fillStyle = colors.teal;
    ctx.fillText(infoA.score, panelLA_X + 32, panelY + 115);
    
    const oppStr = infoA.opponent !== "—" ? `vs ${infoA.opponent}` : "";
    const dateStr = infoA.date !== "—" ? ` | ${infoA.date}` : "";
    drawTruncatedText(ctx, `${oppStr}${dateStr}`, panelLA_X + 32, panelY + 165, panelW - 64, "15px Manrope", colors.muted);
    drawTruncatedText(ctx, infoA.tournament, panelLA_X + 32, panelY + 200, panelW - 64, "14px Manrope", colors.muted);
  } else {
    ctx.font = "bold 26px Fraunces";
    ctx.fillStyle = colors.muted;
    ctx.fillText("No wins", panelLA_X + 32, panelY + 120);
    ctx.font = "14px Manrope";
    ctx.fillText("For this selection", panelLA_X + 32, panelY + 165);
  }
  
  // Panel B
  drawRoundRect(ctx, panelRB_X, panelY, panelW, panelH, 12, colors.surface, colors.border);
  ctx.font = "bold 13px Manrope";
  ctx.fillStyle = colors.orange;
  ctx.textAlign = "left";
  if ('letterSpacing' in ctx) ctx.letterSpacing = "1px";
  ctx.fillText(labelB, panelRB_X + 32, panelY + 45);
  if ('letterSpacing' in ctx) ctx.letterSpacing = "0px";
  
  if (infoB && infoB.score && infoB.score !== "—") {
    ctx.font = "bold 60px Fraunces";
    ctx.fillStyle = colors.orange;
    ctx.fillText(infoB.score, panelRB_X + 32, panelY + 115);
    
    const oppStr = infoB.opponent !== "—" ? `vs ${infoB.opponent}` : "";
    const dateStr = infoB.date !== "—" ? ` | ${infoB.date}` : "";
    drawTruncatedText(ctx, `${oppStr}${dateStr}`, panelRB_X + 32, panelY + 165, panelW - 64, "15px Manrope", colors.muted);
    drawTruncatedText(ctx, infoB.tournament, panelRB_X + 32, panelY + 200, panelW - 64, "14px Manrope", colors.muted);
  } else {
    ctx.font = "bold 26px Fraunces";
    ctx.fillStyle = colors.muted;
    ctx.fillText(isSinglePlayerMode() ? "No losses" : "No wins", panelRB_X + 32, panelY + 120);
    ctx.font = "14px Manrope";
    ctx.fillText("For this selection", panelRB_X + 32, panelY + 165);
  }
  
  // 10. Footer Section
  ctx.strokeStyle = colors.border;
  ctx.beginPath();
  ctx.moveTo(64, 945);
  ctx.lineTo(1016, 945);
  ctx.stroke();
  
  ctx.font = "16px Manrope"; // Increased from 14px
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "left";
  ctx.fillText("Generated on table-hockey-h2h.pages.dev", 64, 990);
  
  ctx.font = "bold 18px Manrope"; // Increased from 15px
  ctx.fillStyle = colors.orange;
  ctx.textAlign = "right";
  ctx.fillText("Table Hockey H2H", 1016, 990);
  
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
