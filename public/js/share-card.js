// Draws the share image (1080×1350, 4:5) from a plain data object built in share.js.
// No app state is read here, so the same data can be drawn in either theme.
// Text sizes are picked for a phone feed, where the image shows at about a third of
// its size: nothing is smaller than 24px, and body text is 28px or larger.

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const PAD = 72;
const INNER = CARD_WIDTH - PAD * 2;
const SANS = "\"Schibsted Grotesk\", \"Golos Text\", system-ui, sans-serif";
const NUM = "\"Barlow Condensed\", \"Schibsted Grotesk\", \"Golos Text\", sans-serif";

// Mirrors the colour tokens in styles.css.
export const SHARE_PALETTES = {
  light: {
    bg: "#F4F3EF",
    surface: "#FFFFFF",
    sunk: "#ECEAE4",
    ink: "#15181B",
    ink2: "#4A525B",
    ink3: "#60666E",
    line: "#E2DFD8",
    a: "#1D6A59",
    aTint: "#DDEBE6",
    b: "#D4532A",
    bTint: "#F7E0D6",
    bText: "#A93F1C",
    draw: "#B6BABF",
    onA: "#FFFFFF",
  },
  dark: {
    bg: "#0F1113",
    surface: "#171A1D",
    sunk: "#1E2226",
    ink: "#EEF0F2",
    ink2: "#A9B0B8",
    ink3: "#8A929B",
    line: "#262B30",
    a: "#4DBFA3",
    aTint: "#183A33",
    b: "#F07A52",
    bTint: "#40241B",
    bText: "#F07A52",
    draw: "#59606A",
    onA: "#0F1113",
  },
};

// Every font the card uses, so share.js can wait for them before drawing.
export const CARD_FONTS = [
  `700 40px ${SANS}`,
  `600 40px ${SANS}`,
  `500 40px ${SANS}`,
  `400 40px ${SANS}`,
  `600 40px ${NUM}`,
  `500 40px ${NUM}`,
];

function sans(size, weight = 400) {
  return `${weight} ${size}px ${SANS}`;
}

function num(size, weight = 600) {
  return `${weight} ${size}px ${NUM}`;
}

function setSpacing(ctx, value) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
  }
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, fill, stroke) {
  roundRectPath(ctx, x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// Cuts text to fit, ending in an ellipsis.
function clip(ctx, text, maxWidth) {
  let value = String(text ?? "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1).trimEnd();
  }
  return `${value}…`;
}

function text(ctx, value, x, y, { font, color, align = "left", maxWidth = INNER, spacing } = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (spacing) setSpacing(ctx, spacing);
  const shown = clip(ctx, value, maxWidth);
  ctx.fillText(shown, x, y);
  const width = ctx.measureText(shown).width;
  if (spacing) setSpacing(ctx, "0px");
  return width;
}

// Largest size from `max` down to `min` at which the text fits.
function fitSize(ctx, value, maxWidth, max, min, fontFor) {
  let size = max;
  ctx.font = fontFor(size);
  while (size > min && ctx.measureText(value).width > maxWidth) {
    size -= 2;
    ctx.font = fontFor(size);
  }
  return size;
}

// Draws runs of { text, strong } left to right; returns the end x.
function drawRuns(ctx, runs, x, y, { size, color, strongColor = color, align = "left" }) {
  const measured = runs.map((run) => {
    ctx.font = sans(size, run.strong ? 700 : 400);
    return { ...run, width: ctx.measureText(run.text).width };
  });
  const total = measured.reduce((sum, run) => sum + run.width, 0);
  let cursor = align === "right" ? x - total : align === "center" ? x - total / 2 : x;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  measured.forEach((run) => {
    ctx.font = sans(size, run.strong ? 700 : 400);
    ctx.fillStyle = run.strong ? strongColor : color;
    ctx.fillText(run.text, cursor, y);
    cursor += run.width;
  });
  return cursor;
}

// Splits { text, strong } parts into words and wraps them into at most `maxLines` lines.
export function wrapRuns(measure, parts, maxWidth, maxLines = 2) {
  const words = [];
  parts.forEach((part) => {
    String(part.text).split(/(\s+)/).forEach((piece) => {
      if (piece) words.push({ text: piece, strong: Boolean(part.strong) });
    });
  });
  const lines = [[]];
  let width = 0;
  for (const word of words) {
    const line = lines[lines.length - 1];
    const isSpace = /^\s+$/.test(word.text);
    if (isSpace && !line.length) continue;
    const w = measure(word);
    if (!isSpace && width + w > maxWidth && line.length) {
      if (lines.length === maxLines) {
        line.push({ text: "…", strong: word.strong });
        return lines.map(trimLine);
      }
      lines.push([]);
      width = 0;
    }
    if (isSpace && width + w > maxWidth) continue;
    lines[lines.length - 1].push(word);
    width += w;
  }
  return lines.map(trimLine);
}

function trimLine(line) {
  const out = line.slice();
  while (out.length && /^\s+$/.test(out[out.length - 1].text)) out.pop();
  if (out.length >= 2 && out[out.length - 1].text === "…") {
    // "word …" → "word…"
    const prev = out[out.length - 2];
    if (/^\s+$/.test(prev.text)) out.splice(out.length - 2, 1);
  }
  // Merge neighbours with the same weight so they draw as one run.
  return out.reduce((runs, word) => {
    const last = runs[runs.length - 1];
    if (last && last.strong === word.strong) last.text += word.text;
    else runs.push({ ...word });
    return runs;
  }, []);
}

// A bar split into segments with small gaps, like the bars on the page.
function drawSplitBar(ctx, x, y, w, h, segments) {
  const shown = segments.filter((segment) => segment.value > 0);
  const total = shown.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) {
    fillRound(ctx, x, y, w, h, h / 2, segments[segments.length - 1]?.empty, null);
    return;
  }
  const gap = 4;
  const usable = w - gap * (shown.length - 1);
  let cursor = x;
  shown.forEach((segment, index) => {
    const segmentWidth = index === shown.length - 1
      ? x + w - cursor
      : Math.max(h / 2, (segment.value / total) * usable);
    fillRound(ctx, cursor, y, segmentWidth, h, h / 2, segment.color, null);
    cursor += segmentWidth + gap;
  });
}

function eyebrow(ctx, value, x, y, colors, align = "left", maxWidth = INNER) {
  return text(ctx, value.toUpperCase(), x, y, {
    font: sans(24, 600),
    color: colors.ink2,
    align,
    spacing: "2px",
    maxWidth,
  });
}

function drawHeader(ctx, data, colors, logo) {
  const y = 64;
  let x = PAD;
  if (logo) {
    const h = 48;
    const w = (logo.naturalWidth / logo.naturalHeight) * h || 32;
    ctx.drawImage(logo, x, y, w, h);
    x += w + 16;
  }
  text(ctx, "Table Hockey H2H", x, y + 36, { font: sans(32, 700), color: colors.ink });
  eyebrow(ctx, data.scope, CARD_WIDTH - PAD, y + 34, colors, "right", 520);
  return y + 48;
}

function drawFooter(ctx, data, colors) {
  const lineY = CARD_HEIGHT - 112;
  ctx.fillStyle = colors.line;
  ctx.fillRect(PAD, lineY, INNER, 2);
  const y = CARD_HEIGHT - 56;
  text(ctx, data.site || "h2h.puck.no", PAD, y, { font: sans(32, 700), color: colors.ink });
  if (data.updated) {
    text(ctx, data.updated, CARD_WIDTH - PAD, y, {
      font: sans(26, 400),
      color: colors.ink2,
      align: "right",
      maxWidth: 520,
    });
  }
  return lineY;
}

// Labelled three-way bar: "Record so far" and "If they met today".
function drawThreeWay(ctx, y, { label, a, d, b, labels }, colors) {
  eyebrow(ctx, label, PAD, y, colors);
  const barY = y + 22;
  drawSplitBar(ctx, PAD, barY, INNER, 20, [
    { value: a, color: colors.a },
    { value: d, color: colors.draw },
    { value: b, color: colors.b, empty: colors.sunk },
  ]);
  const labelY = barY + 20 + 42;
  drawRuns(ctx, labels[0], PAD, labelY, { size: 30, color: colors.ink2, strongColor: colors.ink });
  drawRuns(ctx, labels[1], CARD_WIDTH / 2, labelY, { size: 30, color: colors.ink2, align: "center" });
  drawRuns(ctx, labels[2], CARD_WIDTH - PAD, labelY, {
    size: 30,
    color: colors.ink2,
    strongColor: colors.ink,
    align: "right",
  });
  return labelY;
}

// Draws findings one per line while they fit above `limit`.
function drawFindings(ctx, y, findings, colors, { gap = 50, limit = CARD_HEIGHT } = {}) {
  let cursor = y;
  findings.forEach((finding) => {
    if (cursor > limit) return;
    const dot = finding.side === "b" ? colors.b : finding.side === "a" ? colors.a : colors.ink3;
    fillRound(ctx, PAD, cursor - 22, 12, 12, 3, dot, null);
    text(ctx, finding.text, PAD + 30, cursor, {
      font: sans(30, 400),
      color: colors.ink,
      maxWidth: INNER - 30,
    });
    cursor += gap;
  });
  return cursor - gap;
}

function drawForm(ctx, y, form, colors) {
  if (!form.items.length) return y;
  eyebrow(ctx, form.label, PAD, y, colors, "left", 560);
  if (form.tally) {
    text(ctx, form.tally, CARD_WIDTH - PAD, y, {
      font: sans(26, 400),
      color: colors.ink2,
      align: "right",
      maxWidth: 360,
    });
  }
  const top = y + 24;
  const gap = 10;
  const slots = 10;
  const w = (INNER - gap * (slots - 1)) / slots;
  const h = 96;
  form.items.forEach((item, index) => {
    const x = PAD + index * (w + gap);
    const tone = item.result === "A"
      ? { bg: colors.a, fg: colors.onA }
      : item.result === "B"
        ? { bg: colors.bTint, fg: colors.bText }
        : { bg: colors.sunk, fg: colors.ink2 };
    fillRound(ctx, x, top, w, h, 10, tone.bg, null);
    if (index === 0) {
      // The latest game gets the same ring as on the page.
      roundRectPath(ctx, x - 5, top - 5, w + 10, h + 10, 14);
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = tone.fg;
    const scoreSize = fitSize(ctx, item.score, w - 10, 40, 26, (s) => num(s, 600));
    ctx.font = num(scoreSize, 600);
    ctx.fillText(item.score, x + w / 2, top + 50);
    ctx.font = sans(24, 600);
    ctx.fillText(item.letter, x + w / 2, top + 82);
  });
  return top + h;
}

function drawPlayerName(ctx, name, x, y, align, maxWidth, color) {
  const size = fitSize(ctx, name, maxWidth, 54, 36, (s) => sans(s, 700));
  text(ctx, name, x, y, { font: sans(size, 700), color, align, maxWidth });
}

function drawMatchup(ctx, data, colors, limit) {
  // Players
  const tickY = 156;
  const half = INNER / 2 - 24;
  ctx.fillStyle = colors.a;
  ctx.fillRect(PAD, tickY, 44, 6);
  ctx.fillStyle = colors.b;
  ctx.fillRect(CARD_WIDTH - PAD - 44, tickY, 44, 6);
  const nameY = tickY + 58;
  drawPlayerName(ctx, data.a.name, PAD, nameY, "left", half, colors.ink);
  drawPlayerName(ctx, data.b.name, CARD_WIDTH - PAD, nameY, "right", half, colors.ink);
  const metaY = nameY + 42;
  text(ctx, data.a.meta, PAD, metaY, { font: sans(28, 400), color: colors.ink2, maxWidth: half });
  text(ctx, data.b.meta, CARD_WIDTH - PAD, metaY, {
    font: sans(28, 400),
    color: colors.ink2,
    align: "right",
    maxWidth: half,
  });
  const ratingY = metaY + 38;
  if (data.a.rating) {
    drawRuns(ctx, [{ text: "Rating " }, { text: data.a.rating, strong: true }], PAD, ratingY, {
      size: 28,
      color: colors.ink2,
      strongColor: colors.ink,
    });
  }
  if (data.b.rating) {
    drawRuns(ctx, [{ text: "Rating " }, { text: data.b.rating, strong: true }], CARD_WIDTH - PAD, ratingY, {
      size: 28,
      color: colors.ink2,
      strongColor: colors.ink,
      align: "right",
    });
  }

  // Score
  const scoreY = ratingY + 178;
  const left = data.record.winsLabelA;
  const right = data.record.winsLabelB;
  const size = fitSize(ctx, `${left} – ${right}`, INNER, 184, 110, (s) => num(s, 600));
  ctx.font = num(size, 600);
  const wl = ctx.measureText(left).width;
  const wr = ctx.measureText(right).width;
  const dashW = size * 0.42;
  const gap = size * 0.12;
  const total = wl + wr + dashW + gap * 2;
  let x = CARD_WIDTH / 2 - total / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = colors.a;
  ctx.fillText(left, x, scoreY);
  x += wl + gap;
  ctx.fillStyle = colors.line;
  ctx.fillRect(x, scoreY - size * 0.36, dashW, size * 0.07);
  x += dashW + gap;
  ctx.fillStyle = colors.b;
  ctx.fillText(right, x, scoreY);
  const factsY = scoreY + 48;
  text(ctx, data.facts, CARD_WIDTH / 2, factsY, { font: sans(30, 400), color: colors.ink2, align: "center" });

  let cursor = factsY + 62;
  cursor = drawThreeWay(ctx, cursor, data.recordBar, colors) + 56;
  if (data.forecastBar) cursor = drawThreeWay(ctx, cursor, data.forecastBar, colors) + 64;

  return drawHeadlineAndFindings(ctx, cursor, data, colors, limit);
}

function drawHeadlineAndFindings(ctx, y, data, colors, limit) {
  let cursor = y;
  if (data.headline?.length && cursor + 48 <= limit) {
    const size = 36;
    const lines = wrapRuns((word) => {
      ctx.font = sans(size, word.strong ? 700 : 400);
      return ctx.measureText(word.text).width;
    }, data.headline, INNER, 2);
    lines.forEach((line, index) => {
      drawRuns(ctx, line, PAD, cursor + index * 48, { size, color: colors.ink });
    });
    cursor += (lines.length - 1) * 48 + 62;
  }
  if (data.findings?.length) cursor = drawFindings(ctx, cursor, data.findings, colors, { limit }) + 20;
  return cursor;
}

function drawKpis(ctx, y, kpis, colors) {
  const gap = 16;
  const w = (INNER - gap * (kpis.length - 1)) / kpis.length;
  const h = 168;
  kpis.forEach((kpi, index) => {
    const x = PAD + index * (w + gap);
    fillRound(ctx, x, y, w, h, 12, colors.surface, colors.line);
    eyebrow(ctx, kpi.label, x + 24, y + 44, colors, "left", w - 48);
    const size = fitSize(ctx, kpi.value, w - 48, 76, 44, (s) => num(s, 600));
    text(ctx, kpi.value, x + 24, y + 116, { font: num(size, 600), color: kpi.color || colors.ink, maxWidth: w - 48 });
    if (kpi.sub) {
      text(ctx, kpi.sub, x + 24, y + 150, { font: sans(24, 400), color: colors.ink2, maxWidth: w - 48 });
    }
  });
  return y + h;
}

function drawRatingChart(ctx, y, chart, colors) {
  const h = 220;
  fillRound(ctx, PAD, y, INNER, h, 12, colors.surface, colors.line);
  const innerX = PAD + 28;
  const innerW = INNER - 56;
  eyebrow(ctx, chart.label, innerX, y + 46, colors, "left", 420);
  if (chart.note) {
    text(ctx, chart.note, PAD + INNER - 28, y + 46, {
      font: sans(26, 400),
      color: colors.ink2,
      align: "right",
      maxWidth: 480,
    });
  }
  const points = chart.points;
  const plotTop = y + 72;
  const plotBottom = y + h - 48;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const t0 = points[0].time;
  const t1 = points[points.length - 1].time;
  const span = Math.max(1, t1 - t0);
  const px = (p) => innerX + ((p.time - t0) / span) * innerW;
  const py = (p) => plotBottom - ((p.value - min) / range) * (plotBottom - plotTop);

  // Area under the line, then the line.
  ctx.beginPath();
  ctx.moveTo(px(points[0]), plotBottom);
  points.forEach((p) => ctx.lineTo(px(p), py(p)));
  ctx.lineTo(px(points[points.length - 1]), plotBottom);
  ctx.closePath();
  ctx.fillStyle = colors.aTint;
  ctx.fill();
  ctx.beginPath();
  points.forEach((p, index) => (index ? ctx.lineTo(px(p), py(p)) : ctx.moveTo(px(p), py(p))));
  ctx.strokeStyle = colors.a;
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.stroke();
  const last = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(px(last), py(last), 8, 0, Math.PI * 2);
  ctx.fillStyle = colors.a;
  ctx.fill();

  const axisY = y + h - 14;
  text(ctx, chart.from, innerX, axisY, { font: sans(24, 400), color: colors.ink2 });
  text(ctx, chart.to, innerX + innerW, axisY, { font: sans(24, 400), color: colors.ink2, align: "right" });
  return y + h;
}

function drawPlayer(ctx, data, colors, limit) {
  const tickY = 156;
  ctx.fillStyle = colors.a;
  ctx.fillRect(PAD, tickY, 44, 6);
  const nameY = tickY + 72;
  const size = fitSize(ctx, data.a.name, INNER, 72, 44, (s) => sans(s, 700));
  text(ctx, data.a.name, PAD, nameY, { font: sans(size, 700), color: colors.ink });
  const metaY = nameY + 48;
  text(ctx, data.a.meta, PAD, metaY, { font: sans(30, 400), color: colors.ink2 });

  let cursor = metaY + 40;
  cursor = drawKpis(ctx, cursor, data.kpis, colors) + 64;
  cursor = drawThreeWay(ctx, cursor, data.recordBar, colors) + 52;
  if (data.ratingChart) cursor = drawRatingChart(ctx, cursor, data.ratingChart, colors) + 62;
  else cursor += 10;
  if (data.findings?.length) cursor = drawFindings(ctx, cursor, data.findings, colors, { limit }) + 20;
  return cursor;
}

// Draws the whole card. `logo` is an optional loaded <img> for the header mark.
export function drawShareCard(ctx, data, { theme = "light", logo = null } = {}) {
  const colors = SHARE_PALETTES[theme] || SHARE_PALETTES.light;
  ctx.save();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawHeader(ctx, data, colors, logo);
  // The footer and the form strip are pinned to the bottom; the blocks above fill
  // down to them and leave out findings that would not fit.
  const footerTop = drawFooter(ctx, data, colors);
  const formTop = data.form.items.length ? footerTop - 48 - 96 - 24 : footerTop;
  const limit = formTop - 52;
  if (data.kind === "player") drawPlayer(ctx, data, colors, limit);
  else drawMatchup(ctx, data, colors, limit);
  drawForm(ctx, formTop, data.form, colors);
  ctx.restore();
}
