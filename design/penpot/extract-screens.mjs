// Renders the live site and dumps a flat, z-ordered list of visual primitives
// (boxes, text runs, inline SVGs) per screen, for rebuilding in Penpot.
import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2];
// SCREENS=list.json swaps in another set of [name, w, h, scheme, url] rows (used for the redesign pages).
const screens = process.env.SCREENS ? JSON.parse(fs.readFileSync(process.env.SCREENS, 'utf8')) : [
  ['Desktop / Home', 1440, 900, 'light', ''],
  ['Desktop / Matchup', 1440, 900, 'light', '?p1=6344&p2=10543'],
  ['Desktop / Matchup (dark)', 1440, 900, 'dark', '?p1=6344&p2=10543'],
  ['Mobile / Home', 390, 844, 'light', ''],
  ['Mobile / Matchup', 390, 844, 'light', '?p1=6344&p2=10543'],
  ['Desktop / Player', 1440, 900, 'light', '?p1=6344'],
  ['Desktop / Player (dark)', 1440, 900, 'dark', '?p1=6344'],
  ['Mobile / Player', 390, 844, 'light', '?p1=6344'],
];
// Optional third argument: a regex picking which screens to extract.
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const MAX_ROWS = { desktop: 12, mobile: 10 };

function dump(maxRows) {
  // Trim long match lists so the design stays a readable artboard.
  document.querySelectorAll('#matches-body > tr').forEach((tr, i) => { if (i >= maxRows) tr.remove(); });
  const rgbHex = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1; if (a === 0) return null;
    return { hex: '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase(), a };
  };
  const visible = (el, cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && !el.closest('.sr-only,[hidden],[aria-hidden="true"].sr-only');
  const clipOf = (el) => {
    let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const b = a.getBoundingClientRect();
        r = { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) };
      }
    }
    return r;
  };
  const sx = scrollX, sy = scrollY;
  // Top-level section an element belongs to; becomes a nested board in Penpot.
  const SECTION_NAMES = { 'site-header': 'Header', 'home-hero': 'Hero', 'selection-card': 'Player selection', 'featured': 'Featured matchups', 'summary-section': 'Head-to-head summary', 'controls-bar': 'Filter bar', 'single-player-section': 'Opponents', 'visualizations-section': 'Charts', 'matches-section': 'Match list', 'site-footer': 'Footer',
    topbar: 'Header', footer: 'Footer', scoreboard: 'Scoreboard', momentum: 'Momentum', breakdown: 'Breakdown', seasons: 'Seasons', tournaments: 'Tournaments',
    profile: 'Profile', rivals: 'Rival map', opponents: 'Opponents', hero: 'Hero', rivalries: 'Biggest rivalries' };
  const secOf = (el) => {
    let e = el;
    while (e && e.parentElement && e.parentElement !== document.body && e.parentElement.tagName !== 'MAIN') e = e.parentElement;
    if (!e || e === document.body) return null;
    const key = Object.keys(SECTION_NAMES).find(k => e.classList.contains(k) || e.id === k);
    return key ? SECTION_NAMES[key] : (e.id || e.className.split(' ')[0] || e.tagName.toLowerCase());
  };
  const items = [];
  const label = (el) => (el.id ? '#' + el.id : '') || (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase());
  const pageBg = rgbHex(getComputedStyle(document.body).backgroundColor) || rgbHex(getComputedStyle(document.documentElement).backgroundColor);
  const bodyBgImage = getComputedStyle(document.body).backgroundImage;
  function walk(el, depth, parentOp = 1) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) return;
    const op = +(parentOp * +cs.opacity).toFixed(3);
    const push = (item) => items.push(op < 1 ? { ...item, op } : item);
    if (cs.position === 'absolute' && (el.classList.contains('sr-only') || el.getBoundingClientRect().width <= 1)) return;
    const b = el.getBoundingClientRect();
    const clip = clipOf(el);
    const cut = (r) => ({ x: Math.max(r.left, clip.l) + sx, y: Math.max(r.top, clip.t) + sy, w: Math.min(r.right, clip.r) - Math.max(r.left, clip.l), h: Math.min(r.bottom, clip.b) - Math.max(r.top, clip.t) });
    const box = cut(b);
    if (box.w <= 0 || box.h <= 0) return;
    if (el.type === 'range') {
      // Range inputs draw their track and thumb from pseudo-elements, so rebuild them from the theme colours.
      const v = (n) => { const probe = document.createElement('i'); probe.style.color = `var(${n})`; el.parentElement.appendChild(probe); const c = rgbHex(getComputedStyle(probe).color); probe.remove(); return c; };
      const t = (+el.value - +el.min) / (+el.max - +el.min), th = 16;
      push({ k: 'box', sec: secOf(el), name: label(el) + ' track', x: box.x, y: box.y + box.h / 2 - 2, w: box.w, h: 4, fill: v('--border'), radius: 2 });
      push({ k: 'box', sec: secOf(el), name: label(el) + ' thumb', x: box.x + (box.w - th) * t, y: box.y + box.h / 2 - th / 2, w: th, h: th, fill: v('--teal'), radius: th / 2, stroke: { ...v('--bg'), w: 2 }, shadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.2)' });
      return;
    }
    if (el.tagName.toLowerCase() === 'svg') {
      const clone = el.cloneNode(true);
      const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
      src.forEach((s, i) => {
        const c = getComputedStyle(s), d = dst[i];
        // Only write a presentation attribute where it differs from what the parent passes down.
        const pc = i ? getComputedStyle(s.parentElement) : null;
        const isText = ['text', 'tspan'].includes(s.tagName.toLowerCase());
        for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline']) {
          if (k.startsWith('font') || k === 'text-anchor' || k === 'dominant-baseline') { if (!isText) continue; }
          const v = c.getPropertyValue(k);
          if (!v || (pc && pc.getPropertyValue(k) === v && k !== 'opacity')) continue;
          if (k === 'opacity' && v === '1') continue;
          d.setAttribute(k, k === 'font-family' ? v.split(',')[0].replace(/["']/g, '').trim() : v);
        }
        for (const a of [...d.attributes]) if (/^(data-|aria-|role$|tabindex$|focusable$)/.test(a.name)) d.removeAttribute(a.name);
        d.removeAttribute('class'); d.removeAttribute('style');
      });
      clone.setAttribute('width', b.width); clone.setAttribute('height', b.height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
      push({ k: 'svg', sec: secOf(el), name: label(el), x: b.left + sx, y: b.top + sy, w: b.width, h: b.height, svg: clone.outerHTML, color: rgbHex(cs.color)?.hex });
      return;
    }
    const bg = rgbHex(cs.backgroundColor);
    const grad = cs.backgroundImage && cs.backgroundImage.includes('gradient') ? cs.backgroundImage : null;
    const bw = parseFloat(cs.borderTopWidth) || 0, bc = rgbHex(cs.borderTopColor);
    const bbw = parseFloat(cs.borderBottomWidth) || 0, bbc = rgbHex(cs.borderBottomColor);
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const shadow = cs.boxShadow !== 'none' ? cs.boxShadow : null;
    const uniformBorder = bw > 0 && bc && ['Right', 'Bottom', 'Left'].every(s => cs[`border${s}Width`] === cs.borderTopWidth);
    if (bg || grad || uniformBorder || shadow) {
      push({ k: 'box', sec: secOf(el), name: label(el), ...box, fill: bg, grad, radius: Math.min(radius, Math.min(box.w, box.h) / 2), stroke: uniformBorder ? { hex: bc.hex, a: bc.a, w: bw } : null, shadow });
    }
    const bgSvg = cs.backgroundImage.match(/url\("data:image\/svg\+xml,(.*)"\)/);
    if (bgSvg) {
      const svgText = decodeURIComponent(bgSvg[1]);
      const iw = parseFloat(svgText.match(/width='([\d.]+)'/)?.[1] || 12), ih = parseFloat(svgText.match(/height='([\d.]+)'/)?.[1] || 12);
      const pos = (v, free) => Function(`return ${v.replace(/calc/g, '').replace(/([\d.]+)%/g, (_, n) => `(${n}*${free}/100)`).replace(/px/g, '')}`)();
      push({ k: 'svg', sec: secOf(el), name: label(el) + ' icon', x: b.left + sx + pos(cs.backgroundPositionX, b.width - iw), y: b.top + sy + pos(cs.backgroundPositionY, b.height - ih), w: iw, h: ih, svg: svgText.replace(/'/g, '"') });
    }
    if (!uniformBorder && bbw > 0 && bbc) push({ k: 'box', sec: secOf(el), name: label(el) + ' border', x: box.x, y: box.y + box.h - bbw, w: box.w, h: bbw, fill: bbc, radius: 0 });
    if (['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
      let text = el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : (el.value || el.placeholder);
      const ph = !el.value && el.tagName !== 'SELECT';
      if (text) {
        const col = ph ? rgbHex(getComputedStyle(el, '::placeholder').color) : rgbHex(cs.color);
        push({ k: 'text', sec: secOf(el), name: label(el) + ' value', text, x: b.left + sx + parseFloat(cs.paddingLeft) + bw, y: b.top + sy + (b.height - parseFloat(cs.fontSize) * 1.3) / 2, w: b.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * bw, h: parseFloat(cs.fontSize) * 1.3, oneLine: true, ff: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, color: col && el.disabled && ph ? { ...col, a: col.a * 0.6 } : col, ls: cs.letterSpacing, tt: cs.textTransform, align: 'left' });
      }
      return;
    }
    const positioned = (n) => n.nodeType === 1 && ['absolute', 'fixed', 'relative', 'sticky'].includes(getComputedStyle(n).position);
    const kids = [...el.childNodes];
    for (const n of [...kids.filter(k => !positioned(k)), ...kids.filter(positioned)]) {
      if (n.nodeType === 3 && n.textContent.trim()) {
        // Measure the trimmed text so gaps between inline runs stay as positions.
        const r = document.createRange();
        const raw = n.textContent, lead = raw.length - raw.trimStart().length;
        r.setStart(n, lead); r.setEnd(n, raw.trimEnd().length);
        const rects = [...r.getClientRects()].filter(q => q.width > 0);
        if (!rects.length) continue;
        const L = Math.min(...rects.map(q => q.left)), T = Math.min(...rects.map(q => q.top)), R = Math.max(...rects.map(q => q.right)), B = Math.max(...rects.map(q => q.bottom));
        if (R < clip.l || L > clip.r || B < clip.t || T > clip.b) continue;
        const lines = new Set(rects.map(q => Math.round(q.top))).size;
        // A wrapping run that shares its paragraph with other inline runs (a bold phrase mid-sentence)
        // cannot be one text box, so it is cut into one single-line item per rendered line.
        const mixed = cs.display === 'inline' || [...el.childNodes].some(k => k !== n && (k.nodeType === 1 || k.textContent.trim()));
        if (lines > 1 && mixed) {
          const byLine = new Map(), re = /\S+/g; let m;
          while ((m = re.exec(raw))) {
            const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
            const q = wr.getBoundingClientRect(); const key = Math.round(q.top);
            const ln = byLine.get(key) || { words: [], l: q.left, t: q.top, r: q.right, b: q.bottom };
            ln.words.push(m[0]); ln.l = Math.min(ln.l, q.left); ln.r = Math.max(ln.r, q.right); ln.b = Math.max(ln.b, q.bottom); ln.t = Math.min(ln.t, q.top);
            byLine.set(key, ln);
          }
          for (const ln of byLine.values()) {
            const text = ln.words.join(' ');
            push({ k: 'text', sec: secOf(el), name: text.slice(0, 40), text, x: ln.l + sx, y: ln.t + sy, w: ln.r - ln.l, h: ln.b - ln.t, oneLine: true, ff: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, color: rgbHex(cs.color), ls: cs.letterSpacing, lh: cs.lineHeight, align: 'left', fstyle: cs.fontStyle });
          }
          continue;
        }
        let text = n.textContent.replace(/\s+/g, ' ');
        // Bake CSS ellipsis truncation into the text itself.
        let ell = null;
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const acs = getComputedStyle(a);
          if (acs.textOverflow === 'ellipsis' && a.scrollWidth > a.clientWidth + 1) { ell = a.getBoundingClientRect().right - parseFloat(acs.paddingRight); break; }
        }
        if (ell != null && R > ell) {
          const end = raw.trimEnd().length, room = ell - parseFloat(cs.fontSize) * 0.9;
          let k = end;
          const rr = document.createRange();
          while (k > lead + 1) { rr.setStart(n, lead); rr.setEnd(n, k); if (rr.getBoundingClientRect().right <= room) break; k--; }
          text = raw.slice(lead, k).replace(/\s+/g, ' ').trimEnd() + '…';
        }
        if (cs.textTransform === 'uppercase') text = text.toUpperCase();
        if (lines === 1) text = text.trim();
        push({ k: 'text', sec: secOf(el), name: text.trim().slice(0, 40), text: text.trim(), x: L + sx, y: T + sy, w: (ell != null && R > ell ? ell : R) - L, h: B - T, oneLine: lines === 1, ff: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), fs: parseFloat(cs.fontSize), fw: cs.fontWeight, color: rgbHex(cs.color), ls: cs.letterSpacing, lh: cs.lineHeight, align: lines > 1 ? cs.textAlign : 'left', fstyle: cs.fontStyle });
      } else if (n.nodeType === 1) walk(n, depth + 1, op);
    }
  }
  walk(document.body, 0);
  return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, pageBg, bodyBgImage, items };
}

const b = await chromium.launch();
const result = [];
for (const [name, w, h, scheme, q] of screens.filter(([n]) => !only || only.test(n))) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(q.includes('://') ? q : 'http://localhost:8000/' + q, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const d = await p.evaluate(dump, w < 600 ? MAX_ROWS.mobile : MAX_ROWS.desktop);
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, '');
  await p.screenshot({ path: `${out}/${slug}.png`, fullPage: true });
  result.push({ name, theme: scheme, ...d });
  console.log(name, d.items.length, 'items', d.width + 'x' + d.height);
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${out}/screens.json`, JSON.stringify(result));
