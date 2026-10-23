import fs from 'fs';
const [rule, a, b] = process.argv.slice(2);
const f = eval(fs.readFileSync(rule, 'utf8'));
const L = JSON.parse(fs.readFileSync(a)), D = JSON.parse(fs.readFileSync(b));
const out = f(L, { name: D.name, theme: D.theme, bodyBgImage: D.bodyBgImage });
let bad = 0;
out.items.forEach((it, i) => { const x = JSON.stringify(it, Object.keys(it).sort()), y = JSON.stringify(D.items[i], Object.keys(D.items[i]).sort());
  if (JSON.stringify(sortObj(it)) !== JSON.stringify(sortObj(D.items[i]))) { bad++; if (bad < 8) console.log(i, JSON.stringify(it).slice(0,300), '\n  want', JSON.stringify(D.items[i]).slice(0,300)); } });
function sortObj(o) { if (Array.isArray(o)) return o.map(sortObj); if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortObj(o[k])])); return o; }
console.log('mismatches', bad, 'of', out.items.length);
