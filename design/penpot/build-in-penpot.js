// Penpot builder for the Table Hockey H2H design file.
//
// Runs inside Penpot through the Penpot MCP `execute_code` tool, which exposes
// `penpot`, `penpotUtils` and `storage`. Paste this whole file into one
// execute_code call to register the helpers on `storage`, then call them:
//
//   await storage.h2h.load(SCREENS_URL)      // fetch screens.json (or set storage.h2h.screens yourself)
//   storage.h2h.buildDesignSystem()          // library colours, typographies, tokens + a "Design system" page
//   await storage.h2h.buildScreen(0)         // one call per screen, 0..4, on the "Screens" page
//
// screens.json is produced by extract-screens.mjs from the live site.

const h2h = { screens: (storage.h2h && storage.h2h.screens) || [] };

h2h.COLORS = [
  ["Rink cream", "#F6F2EC", "Default light background"],
  ["Rink cream pressed", "#F0EBE3", "Inputs, tab rails, nested tonal areas"],
  ["Clean surface", "#FFFDFA", "Light-mode cards, menus, tables"],
  ["Ink", "#182025", "Primary text"],
  ["Slate muted", "#5C6770", "Secondary labels and metadata"],
  ["Puck orange", "#EF6C44", "Player B, logo, primary action"],
  ["Puck orange deep", "#CC5132", "Small orange text, button gradient end"],
  ["Player teal", "#2A7564", "Player A"],
  ["Night background", "#0F1215", "Dark-mode page"],
  ["Night surface", "#1D242C", "Dark-mode cards"],
  ["Night ink", "#F3F5F7", "Dark-mode primary text"],
  ["Night muted", "#A5B0BB", "Dark-mode secondary text"],
];

// The six font-size tokens from styles.css, plus the families and weights they pair with.
h2h.TYPE = [
  ["Display", "Fraunces", "700", 44, 1.1, 0],
  ["Headline", "Fraunces", "600", 28, 1.15, 0],
  ["Title", "Manrope", "700", 20, 1.3, 0],
  ["Body", "Manrope", "400", 16, 1.5, 0],
  ["Body small", "Manrope", "500", 14, 1.45, 0],
  ["Label", "Manrope", "700", 12, 1.2, 0.96],
];

h2h.SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
h2h.RADIUS = { sm: 6, md: 8, lg: 10, xl: 12, pill: 999 };

h2h.load = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`screens.json fetch failed: ${res.status}`);
  h2h.screens = await res.json();
  return h2h.screens.map((s, i) => `${i}: ${s.name} (${s.items.length} items)`);
};

// --- colour and CSS parsing -------------------------------------------------

h2h.parseColor = (str) => {
  if (!str) return null;
  let m = str.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { hex: h2h.hex(p), a: p.length > 3 ? p[3] : 1 };
  }
  m = str.match(/color\(srgb ([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return { hex: h2h.hex(p.slice(0, 3).map((v) => v * 255)), a: p.length > 3 ? p[3] : 1 };
  }
  m = str.match(/#[0-9a-fA-F]{6}/);
  return m ? { hex: m[0].toUpperCase(), a: 1 } : null;
};

h2h.hex = (p) => "#" + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

// Split on commas that are not inside parentheses.
h2h.splitTop = (str) => {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

h2h.parseGradient = (css) => {
  const m = css && css.match(/linear-gradient\((.*)\)\s*$/);
  if (!m) return null;
  const parts = h2h.splitTop(m[1]);
  let angle = 180;
  if (/deg$/.test(parts[0])) angle = parseFloat(parts.shift());
  else if (/^to /.test(parts[0])) {
    const dir = parts.shift();
    angle = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 }[dir] ?? 180;
  }
  const stops = parts.map((p, i) => {
    const c = h2h.parseColor(p);
    const off = p.match(/(-?[\d.]+)%\s*$/);
    return { color: c.hex, opacity: c.a, offset: off ? parseFloat(off[1]) / 100 : i / Math.max(1, parts.length - 1) };
  });
  // CSS angle: 0deg points up, clockwise. Penpot uses unit-square start/end points.
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad) / 2, dy = -Math.cos(rad) / 2;
  return { type: "linear", startX: 0.5 - dx, startY: 0.5 - dy, endX: 0.5 + dx, endY: 0.5 + dy, width: 1, stops };
};

h2h.parseShadows = (css) => {
  if (!css) return [];
  return h2h.splitTop(css).map((s) => {
    const color = h2h.parseColor(s) || { hex: "#000000", a: 0.1 };
    const rest = s.replace(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-fA-F]{3,8}/g, "");
    const inset = /inset/.test(rest);
    const n = (rest.match(/-?[\d.]+px|-?\b0\b/g) || []).map(parseFloat);
    return {
      style: inset ? "inner-shadow" : "drop-shadow",
      offsetX: n[0] || 0, offsetY: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0,
      color: { color: color.hex, opacity: color.a },
    };
  });
};

// --- fonts ------------------------------------------------------------------

h2h.fontCache = {};
h2h.applyFont = (text, family, weight, style) => {
  const fam = { "Segoe UI": "Manrope", Georgia: "Fraunces" }[family] || family;
  if (!(fam in h2h.fontCache)) h2h.fontCache[fam] = penpot.fonts.findByName(fam) || null;
  const font = h2h.fontCache[fam];
  if (!font) {
    text.fontFamily = fam;
    text.fontWeight = String(weight);
    return;
  }
  const want = String(weight);
  const italic = style === "italic";
  const variants = font.variants || [];
  const pick =
    variants.find((v) => String(v.fontWeight) === want && (v.fontStyle === "italic") === italic) ||
    variants.find((v) => String(v.fontWeight) === want) ||
    variants.slice().sort((a, b) => Math.abs(+a.fontWeight - +want) - Math.abs(+b.fontWeight - +want))[0];
  font.applyToText(text, pick);
};

// --- shape factories --------------------------------------------------------

// Colours arrive as "#RRGGBB" (opaque) or { hex, a }.
h2h.col = (c) => (typeof c === "string" ? { hex: c, a: 1 } : c);
h2h.fill = (c) => (c ? [{ fillColor: h2h.col(c).hex, fillOpacity: h2h.col(c).a }] : []);

h2h.makeBox = (it, ox, oy) => {
  const r = penpot.createRectangle();
  r.name = it.name;
  r.resize(Math.max(it.w, 0.5), Math.max(it.h, 0.5));
  r.x = ox + it.x;
  r.y = oy + it.y;
  const grad = h2h.parseGradient(it.grad);
  r.fills = grad ? [{ fillColorGradient: grad, fillOpacity: 1 }] : h2h.fill(it.fill);
  if (it.stroke) r.strokes = [{ strokeColor: it.stroke.hex, strokeOpacity: it.stroke.a, strokeWidth: it.stroke.w, strokeAlignment: "inner", strokeStyle: "solid" }];
  if (it.radius) r.borderRadius = it.radius;
  const shadows = h2h.parseShadows(it.shadow);
  if (shadows.length) r.shadows = shadows;
  return r;
};

h2h.makeText = (it, ox, oy) => {
  const t = penpot.createText(it.text);
  if (!t) return null;
  t.name = it.name || it.text.slice(0, 40);
  h2h.applyFont(t, it.ff, it.fw, it.fstyle);
  t.fontSize = String(it.fs);
  const ls = parseFloat(it.ls);
  t.letterSpacing = String(Number.isFinite(ls) ? ls : 0);
  if (it.tt === "uppercase") t.textTransform = "uppercase";
  t.fills = h2h.fill(it.color || { hex: "#182025", a: 1 });
  if (it.oneLine) {
    // Line height equal to the measured run height keeps the baseline where the browser put it.
    t.lineHeight = String(Math.max(1, +(it.h / it.fs).toFixed(3)));
    t.growType = "auto-width";
  } else {
    const lh = parseFloat(it.lh);
    t.lineHeight = String(+((Number.isFinite(lh) ? lh : it.fs * 1.4) / it.fs).toFixed(3));
    t.align = ["center", "right"].includes(it.align) ? it.align : "left";
    // Penpot sets display fonts a touch wider than browsers, so give wrapped text slack to keep its line breaks.
    const extra = Math.round(it.w * 0.06) + 2;
    t.resize(it.w + extra, it.h);
    t.growType = "auto-height";
    if (t.align === "center") ox -= extra / 2;
    else if (t.align === "right") ox -= extra;
  }
  t.x = ox + it.x;
  t.y = oy + it.y;
  return t;
};

// Bar charts arrive packed as [x, y, height, colourIndex] rows sharing one bar width.
h2h.expandSvg = (b) => b.head + b.r.map(([x, y, h, c]) => `<rect x="${x}" y="${y}" width="${b.w}" height="${h}" fill="${b.colors[c]}"></rect>`).join("") + b.tail;

// SVG <text> inherits the page font in the browser; make that explicit for Penpot.
h2h.svgFont = (svg) => (/<text/.test(svg) && !/^<svg[^>]*font-family/.test(svg) ? svg.replace(/^<svg/, '<svg font-family="Manrope"') : svg);

h2h.makeSvg = (it, ox, oy) => {
  const g = penpot.createShapeFromSvg(h2h.svgFont(it.svg || h2h.expandSvg(it.bars)));
  if (!g) return null;
  g.name = it.name === "svg" ? "icon" : it.name;
  // Penpot sizes imported SVGs by their viewBox; scale back to the rendered size.
  if (Math.abs(g.width - it.w) > 0.5 || Math.abs(g.height - it.h) > 0.5) g.resize(it.w, it.h);
  g.x = ox + it.x;
  g.y = oy + it.y;
  return g;
};

// A screen with the same geometry as another (dark against light), given as per-item changes.
h2h.applyDiff = (baseIndex, { top, diff }) => {
  const base = h2h.screens[baseIndex];
  const items = base.items.map((it, i) => {
    const d = diff[i];
    if (!d) return it;
    const out = { ...it, ...d };
    if (d.bars) out.bars = { ...it.bars, ...d.bars };
    for (const k of Object.keys(d)) if (d[k] === null) delete out[k];
    return out;
  });
  return { ...base, ...top, items };
};

// Derives the dark theme of a screen from the light one: a palette swap plus
// the few places where dark mode changes more than a colour. Checked to
// reproduce the extracted dark screen exactly (see darkcheck.mjs).
h2h.darkFrom = (light, top) => {
  const M = { "#182025": "#F3F5F7", "#4A5568": "#A5B0BB", "#5c6770": "#a5b0bb", "#246857": "#7ED9C6", "#AD3F24": "#F08B6F", "#2A7564": "#5DC2AE", "#C44B2D": "#F08B6F", "#FFFDFA": "#1D242C", "#F0EBE3": "#151A1F" };
  const swap = (v) => JSON.parse(JSON.stringify(v).replace(/#[0-9A-Fa-f]{6}/g, (h) => M[h] ?? h));
  const items = light.items.map((it, i) => {
    if (i === 2) return it; // logo glyph stays white
    const d = swap(it);
    if (it.fill === "#FFFFFF") d.fill = "#1B2128";
    if (it.color === "#FFFFFF") d.color = "#0F1215";
    if (it.fill === "#FFFDFA") {
      d.stroke = { hex: "#FFFFFF", a: 0.1, w: 1 };
      if (it.shadow === "rgba(0, 0, 0, 0.05) 0px 6px 18px 0px") d.shadow = "rgba(0, 0, 0, 0.35) 0px 8px 24px 0px";
    }
    if (it.name === ".hero-lead-tag") d.fill = { hex: "#5DC2AE", a: 0.2 };
    if (it.grad) d.grad = it.name === ".logo" ? "linear-gradient(135deg, rgb(239, 108, 68) 0%, rgb(240, 139, 111) 100%)" : top.bodyBgImage;
    if (it.shadow && it.shadow.startsWith("rgb(255, 255, 255) 0px 0px 0px 2px")) d.shadow = "rgb(27, 33, 40) 0px 0px 0px 2px, color(srgb 0.647059 0.690196 0.733333 / 0.45) 0px 0px 0px 4px";
    if (it.name === "svg" && it.svg && it.svg.includes("M12 3a6 6 0 0 0 9 7.4")) d.svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#F3F5F7" stroke-width="1.8px" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"></line><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"></line><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"></line></svg>';
    return d;
  });
  return { ...light, ...top, items };
};

// --- pages ------------------------------------------------------------------

h2h.page = async (name) => {
  let page = penpotUtils.getPageByName(name);
  if (!page) {
    page = penpot.currentPage && penpot.currentPage.root.children.length === 0 && penpotUtils.getPages().length === 1
      ? penpot.currentPage
      : penpot.createPage();
    page.name = name;
  }
  if (penpot.currentPage.id !== page.id) await penpot.openPage(page);
  return page;
};

// Screens sit side by side with a gap; the x position is derived from the
// widths of the screens before it so each call is independent.
h2h.screenOrigin = (index) => {
  let x = 0;
  for (let i = 0; i < index; i++) x += h2h.screens[i].width + 160;
  return { x, y: 0 };
};

// Screens are built in steps so no single execute_code call runs into the
// tool timeout: startScreen draws the frame, buildSections fills a few
// sections per call, buildScreen does everything at once for small screens.
h2h.startScreen = async (index) => {
  const s = h2h.screens[index];
  await h2h.page("Screens");
  const existing = penpotUtils.findShape((sh) => sh.type === "board" && sh.name === s.name, penpot.root);
  if (existing) existing.remove();
  const { x: ox, y: oy } = h2h.screenOrigin(index);
  const board = penpot.createBoard();
  board.name = s.name;
  board.resize(s.width, s.height);
  board.x = ox;
  board.y = oy;
  board.clipContent = true;
  const bodyGrad = h2h.parseGradient(s.bodyBgImage);
  board.fills = bodyGrad ? [{ fillColorGradient: bodyGrad, fillOpacity: 1 }] : h2h.fill(s.pageBg || { hex: "#F6F2EC", a: 1 });

  // One transparent board per page section, sized to what it holds.
  const sections = {};
  const order = [];
  for (const it of s.items) {
    if (it.sec === "html" && it.name === "body") continue;
    const key = it.sec || "Page";
    if (!sections[key]) { sections[key] = { items: [], l: 1e9, t: 1e9, r: -1e9, b: -1e9 }; order.push(key); }
    const sec = sections[key];
    sec.items.push(it);
    sec.l = Math.min(sec.l, it.x); sec.t = Math.min(sec.t, it.y);
    sec.r = Math.max(sec.r, it.x + it.w); sec.b = Math.max(sec.b, it.y + it.h);
  }
  h2h.job = { index, boardId: board.id, ox, oy, sections, order, next: 0, counts: { box: 0, text: 0, svg: 0, failed: 0 }, failures: [] };
  return { boardId: board.id, sections: order };
};

h2h.buildSections = async (maxItems = 120) => {
  const job = h2h.job;
  const board = penpotUtils.findShapeById(job.boardId);
  let done = 0;
  while (job.next < job.order.length && done < maxItems) {
    const key = job.order[job.next++];
    const sec = job.sections[key];
    const sb = penpot.createBoard();
    sb.name = key;
    sb.fills = [];
    sb.clipContent = false;
    board.appendChild(sb);
    sb.resize(Math.max(1, sec.r - sec.l), Math.max(1, sec.b - sec.t));
    sb.x = job.ox + sec.l;
    sb.y = job.oy + sec.t;
    for (const it of sec.items) {
      try {
        const shape = it.k === "box" ? h2h.makeBox(it, job.ox, job.oy) : it.k === "text" ? h2h.makeText(it, job.ox, job.oy) : h2h.makeSvg(it, job.ox, job.oy);
        if (!shape) { job.counts.failed++; job.failures.push(`${it.k} ${it.name}`); continue; }
        if (it.op != null) shape.opacity = it.op;
        const x = shape.x, y = shape.y;
        sb.appendChild(shape);
        shape.x = x; shape.y = y;
        job.counts[it.k]++;
      } catch (e) {
        job.counts.failed++;
        job.failures.push(`${it.k} ${it.name}: ${e.message}`);
      }
    }
    done += sec.items.length;
  }
  return { boardId: job.boardId, remaining: job.order.slice(job.next), counts: job.counts, failures: job.failures.slice(0, 20) };
};

h2h.buildScreen = async (index) => {
  await h2h.startScreen(index);
  return h2h.buildSections(Infinity);
};

// Swap one section of an existing screen board for a freshly built one.
h2h.rebuildSection = async (index, key) => {
  const s = h2h.screens[index];
  await h2h.page("Screens");
  const board = penpotUtils.findShape((sh) => sh.type === "board" && sh.name === s.name, penpot.root);
  const old = board.children.find((c) => c.name === key);
  const at = board.children.indexOf(old);
  if (old) old.remove();
  const { x: ox, y: oy } = h2h.screenOrigin(index);
  const items = s.items.filter((it) => it.sec === key);
  const sec = { items, l: Math.min(...items.map((i) => i.x)), t: Math.min(...items.map((i) => i.y)), r: Math.max(...items.map((i) => i.x + i.w)), b: Math.max(...items.map((i) => i.y + i.h)) };
  h2h.job = { index, boardId: board.id, ox, oy, sections: { [key]: sec }, order: [key], next: 0, counts: { box: 0, text: 0, svg: 0, failed: 0 }, failures: [] };
  const r = await h2h.buildSections(Infinity);
  const sb = board.children[board.children.length - 1];
  if (at >= 0) sb.setParentIndex(at);
  return r;
};

// --- design system ----------------------------------------------------------

h2h.buildDesignSystem = async () => {
  const lib = penpot.library.local;
  const report = { colors: 0, typographies: 0, tokens: 0 };

  for (const [name, hex] of h2h.COLORS) {
    if (lib.colors.some((c) => c.name === name)) continue;
    const c = lib.createColor();
    c.name = name;
    c.path = "H2H";
    c.color = hex;
    c.opacity = 1;
    report.colors++;
  }

  for (const [name, family, weight, size, lh, ls] of h2h.TYPE) {
    if (lib.typographies.some((t) => t.name === name)) continue;
    const t = lib.createTypography();
    t.name = name;
    t.path = "H2H";
    const font = penpot.fonts.findByName(family);
    const variant = font && font.variants.find((v) => String(v.fontWeight) === weight && v.fontStyle !== "italic");
    if (font) t.setFont(font, variant || undefined);
    else { t.fontFamily = family; t.fontWeight = weight; }
    t.fontSize = String(size);
    t.lineHeight = String(lh);
    t.letterSpacing = String(ls);
    if (name === "Label") t.textTransform = "uppercase";
    report.typographies++;
  }

  const tokens = lib.tokens;
  if (tokens && !tokens.sets.some((s) => s.name === "h2h")) {
    const set = tokens.addSet({ name: "h2h" });
    if (!set.active) set.toggleActive();
    const slug = (n) => n.toLowerCase().replace(/\s+/g, "-");
    for (const [name, hex] of h2h.COLORS) { set.addToken({ type: "color", name: `color.${slug(name)}`, value: hex }); report.tokens++; }
    for (const [k, v] of Object.entries(h2h.SPACING)) { set.addToken({ type: "spacing", name: `space.${k}`, value: String(v) }); report.tokens++; }
    for (const [k, v] of Object.entries(h2h.RADIUS)) { set.addToken({ type: "borderRadius", name: `radius.${k}`, value: String(v) }); report.tokens++; }
    for (const [name, , , size] of h2h.TYPE) { set.addToken({ type: "fontSizes", name: `font-size.${slug(name)}`, value: String(size) }); report.tokens++; }
  }

  await h2h.page("Design system");
  const old = penpotUtils.findShape((sh) => sh.type === "board" && sh.name === "Design system", penpot.root);
  if (old) old.remove();
  const board = penpot.createBoard();
  board.name = "Design system";
  board.resize(1200, 980);
  board.x = 0;
  board.y = 0;
  board.fills = [{ fillColor: "#F6F2EC", fillOpacity: 1 }];

  const addText = (str, x, y, family, weight, size, color = "#182025", extra = {}) => {
    const t = penpot.createText(str);
    h2h.applyFont(t, family, weight);
    t.fontSize = String(size);
    t.lineHeight = "1.2";
    t.fills = [{ fillColor: color, fillOpacity: 1 }];
    Object.assign(t, extra);
    t.growType = "auto-width";
    board.appendChild(t);
    t.x = board.x + x;
    t.y = board.y + y;
    return t;
  };

  addText("Table Hockey H2H design system", 48, 40, "Fraunces", "700", 44);
  addText("The Match Analyst's Bench. Warm rink neutrals, teal for Player A, orange for Player B.", 48, 104, "Manrope", "400", 16, "#5C6770");

  addText("COLOURS", 48, 160, "Manrope", "700", 12, "#5C6770", { letterSpacing: "0.96" });
  h2h.COLORS.forEach(([name, hex, use], i) => {
    const col = i % 6, row = Math.floor(i / 6);
    const x = 48 + col * 184, y = 188 + row * 196;
    const sw = penpot.createRectangle();
    sw.name = name;
    sw.resize(168, 96);
    sw.borderRadius = 8;
    sw.fills = [{ fillColor: hex, fillOpacity: 1 }];
    sw.strokes = [{ strokeColor: "#182025", strokeOpacity: 0.08, strokeWidth: 1, strokeAlignment: "inner", strokeStyle: "solid" }];
    board.appendChild(sw);
    sw.x = board.x + x;
    sw.y = board.y + y;
    addText(name, x, y + 106, "Manrope", "700", 14);
    addText(hex, x, y + 126, "Manrope", "500", 14, "#5C6770");
    const u = addText(use, x, y + 146, "Manrope", "400", 12, "#5C6770");
    u.resize(168, 32);
    u.growType = "auto-height";
  });

  addText("TYPE SCALE", 48, 600, "Manrope", "700", 12, "#5C6770", { letterSpacing: "0.96" });
  let y = 628;
  for (const [name, family, weight, size] of h2h.TYPE) {
    addText(`${name} · ${family} ${weight} · ${size}px`, 48, y + Math.max(0, size * 0.4 - 6), "Manrope", "500", 12, "#5C6770");
    const sample = addText(name === "Label" ? "Head to head · overall" : "Every table hockey rivalry, settled.", 320, y, family, weight, size, "#182025",
      name === "Label" ? { textTransform: "uppercase", letterSpacing: "0.96" } : {});
    const typo = lib.typographies.find((t) => t.name === name);
    if (typo) sample.applyTypography(typo);
    y += Math.round(size * 1.4) + 20;
  }
  return report;
};

storage.h2h = h2h;
return "storage.h2h ready";
