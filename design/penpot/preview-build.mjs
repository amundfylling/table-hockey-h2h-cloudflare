// Runs build-in-penpot.js against a minimal stand-in for the Penpot plugin API
// and renders the resulting shape tree to SVG/PNG for a visual check.
import fs from 'fs';
import { chromium } from 'playwright';
const [builderPath, screensPath, outDir] = process.argv.slice(2);
let idc = 0;
const pages = [];
function shape(type, extra = {}) {
  const s = { id: 'id' + (++idc), type, name: type, x: 0, y: 0, width: 100, height: 100, fills: [], strokes: [], shadows: [], children: [], parent: null,
    resize(w, h) { this.width = w; this.height = h; if (this.type === 'text') this.growType = 'fixed'; },
    appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); },
    applyTypography() {}, ...extra };
  return s;
}
function newPage(name = 'Page 1') { const root = shape('root'); const p = { id: 'p' + (++idc), name, root }; pages.push(p); return p; }
let current = newPage();
const add = (s) => { current.root.appendChild(s); return s; };
const fonts = { findByName: (n) => ['Manrope', 'Fraunces'].includes(n) ? { fontFamily: n, fontId: n, variants: ['400', '500', '600', '700', '800'].map(w => ({ fontWeight: w, fontStyle: 'normal', fontVariantId: w })), applyToText(t, v) { t.fontFamily = n; t.fontWeight = v.fontWeight; } } : null };
const lib = { colors: [], typographies: [], createColor() { const c = {}; this.colors.push(c); return c; }, createTypography() { const t = { setFont(f, v) { this.fontFamily = f.fontFamily; this.fontWeight = v?.fontWeight; } }; this.typographies.push(t); return t; },
  tokens: { sets: [], addSet({ name }) { const s = { name, active: false, tokens: [], toggleActive() { this.active = !this.active; }, addToken(t) { this.tokens.push(t); return t; } }; this.sets.push(s); return s; } } };
const penpot = {
  get currentPage() { return current; }, get root() { return current.root; },
  createRectangle: () => add(shape('rectangle')), createBoard: () => add(shape('board')),
  createText: (t) => t ? add(shape('text', { characters: t, growType: 'auto-width' })) : null,
  createShapeFromSvg: (svg) => { const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/); return add(shape('group', { svg, width: +m[1], height: +m[2] })); },
  createPage: () => newPage(), openPage: async (p) => { current = p; }, fonts, library: { local: lib },
};
const all = (r) => [r, ...r.children.flatMap(all)];
const penpotUtils = { getPages: () => pages, getPageByName: (n) => pages.find(p => p.name === n) || null,
  findShape: (pred, root) => all(root).find(s => s !== root && pred(s)) || null, findShapeById: (id) => pages.flatMap(p => all(p.root)).find(s => s.id === id) || null };
const storage = {};
const code = fs.readFileSync(builderPath, 'utf8');
const fn = new Function('penpot', 'penpotUtils', 'storage', 'fetch', `return (async () => { ${code} })();`);
console.log(await fn(penpot, penpotUtils, storage, fetch));
storage.h2h.screens = JSON.parse(fs.readFileSync(screensPath, 'utf8'));
console.log(JSON.stringify(await storage.h2h.buildDesignSystem()));
for (let i = 0; i < storage.h2h.screens.length; i++) { const r = await storage.h2h.buildScreen(i); console.log(storage.h2h.screens[i].name, JSON.stringify(r.counts), r.failures.join('; ')); }

// --- render to SVG ---
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let gid = 0;
function paint(fills, defs) {
  const f = fills[0]; if (!f) return 'fill="none"';
  if (f.fillColorGradient) { const g = f.fillColorGradient, id = 'g' + (++gid);
    defs.push(`<linearGradient id="${id}" x1="${g.startX}" y1="${g.startY}" x2="${g.endX}" y2="${g.endY}">${g.stops.map(s => `<stop offset="${s.offset}" stop-color="${s.color}" stop-opacity="${s.opacity ?? 1}"/>`).join('')}</linearGradient>`); return `fill="url(#${id})"`; }
  return `fill="${f.fillColor}" fill-opacity="${f.fillOpacity ?? 1}"`;
}
function render(s, defs) { const inner = render0(s, defs); return s.opacity != null ? `<g opacity="${s.opacity}">${inner}</g>` : inner; }
function render0(s, defs) {
  const st = s.strokes[0] ? ` stroke="${s.strokes[0].strokeColor}" stroke-opacity="${s.strokes[0].strokeOpacity}" stroke-width="${s.strokes[0].strokeWidth}"` : '';
  if (s.type === 'rectangle' || s.type === 'board') {
    const r = `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.borderRadius || 0}" ${paint(s.fills, defs)}${st}/>`;
    return r + s.children.map(c => render(c, defs)).join('');
  }
  if (s.type === 'text') {
    const fsz = +s.fontSize, lh = +s.lineHeight * fsz; const col = s.fills[0];
    const anchor = s.align === 'center' ? 'middle' : s.align === 'right' ? 'end' : 'start';
    const ax = anchor === 'middle' ? s.x + s.width / 2 : anchor === 'end' ? s.x + s.width : s.x;
    return `<text x="${ax}" y="${s.y + lh / 2 + fsz * 0.35}" font-family="${s.fontFamily}" font-weight="${s.fontWeight}" font-size="${fsz}" letter-spacing="${s.letterSpacing}" text-anchor="${s.growType === 'auto-height' ? anchor : 'start'}" fill="${col.fillColor}" fill-opacity="${col.fillOpacity}">${esc(s.textTransform === 'uppercase' ? s.characters.toUpperCase() : s.characters)}</text>`;
  }
  if (s.type === 'group') return `<g transform="translate(${s.x},${s.y})">${s.svg}</g>`;
  return '';
}
const b = await chromium.launch();
for (const p of pages) {
  for (const board of p.root.children) {
    const defs = []; const body = render(board, defs);
    const html = `<html><head><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="${board.width}" height="${board.height}" viewBox="${board.x} ${board.y} ${board.width} ${board.height}"><defs>${defs.join('')}</defs>${body}</svg></body></html>`;
    const pg = await b.newPage({ viewport: { width: Math.ceil(board.width), height: Math.ceil(board.height) } });
    await pg.setContent(html, { waitUntil: 'networkidle' });
    const slug = board.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '');
    await pg.screenshot({ path: `${outDir}/mock-${slug}.png`, fullPage: true }); await pg.close();
  }
}
await b.close();
