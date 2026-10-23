# Packs bar-chart SVGs (hundreds of <rect>s) into compact arrays that the
# Penpot builder expands again with h2h.expandSvg.
import json, re, sys
RECT = re.compile(r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-F]{6})"></rect>')
def pack(it):
    if it.get('k') != 'svg' or it['svg'].count('<rect') < 50: return it
    svg = it['svg']; rects = RECT.findall(svg)
    first = RECT.search(svg).start(); last = list(RECT.finditer(svg))[-1].end()
    if len(RECT.findall(svg[first:last])) != svg[first:last].count('<rect'): return it
    ws = {r[2] for r in rects}
    if len(ws) != 1: return it
    colors = sorted({r[4] for r in rects})
    it = dict(it); it.pop('svg')
    it['bars'] = {'head': svg[:first], 'tail': svg[last:], 'w': ws.pop(), 'colors': colors,
                  'r': [[float(r[0]), float(r[1]), float(r[3]), colors.index(r[4])] for r in rects]}
    it['bars']['r'] = [[int(v) if v == int(v) else v for v in r] for r in it['bars']['r']]
    return it
for path in sys.argv[1:]:
    s = json.load(open(path)); s['items'] = [pack(i) for i in s['items']]
    out = json.dumps(s, ensure_ascii=False, separators=(',', ':'))
    open(path.replace('.json', '.packed.json'), 'w').write(out); print(path, len(out))
