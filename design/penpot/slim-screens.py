import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
def hexify(m):
    p = [float(x) for x in re.split(r'[ ,/]+', m.group(1).strip()) if x]
    h = '#' + ''.join(f'{round(v):02X}' for v in p[:3])
    return h if len(p) < 4 or p[3] == 1 else f'{h}" fill-opacity="{p[3]}'
def num(m): return f'{float(m.group(0)):.1f}'.rstrip('0').rstrip('.')
for s in d:
    for i in s['items']:
        for k in ('x', 'y', 'w', 'h'): i[k] = round(i[k], 1)
        if i['k'] == 'svg':
            v = i['svg']
            v = re.sub(r'<title[^>]*>.*?</title>|<desc[^>]*>.*?</desc>', '', v, flags=re.S)
            # Translucent colours become the attribute's matching *-opacity.
            def attr_color(m):
                name, inner = m.group(1), m.group(2)
                p = [float(x) for x in re.split(r'[ ,/]+', inner.strip()) if x]
                if len(p) > 3 and p[3] == 0: return f'{name}="none"'
                h = '#' + ''.join(f'{round(c):02X}' for c in p[:3])
                return f'{name}="{h}"' + (f' {name}-opacity="{p[3]}"' if len(p) > 3 and p[3] != 1 and name in ('fill', 'stroke') else '')
            v = re.sub(r'([\w-]+)="rgba?\(([^)]+)\)"', attr_color, v)
            v = re.sub(r'\d+\.\d{2,}', num, v)
            v = re.sub(r'\s(id|stroke-dasharray="none"|stroke-opacity="1"|fill-opacity="1"|stroke-linecap="butt"|stroke-linejoin="miter")(="[^"]*")?(?=[\s>/])', lambda m: '' if m.group(1) != 'id' else '', v)
            v = re.sub(r'>\s+<', '><', v)
            i['svg'] = v
# Drop default-valued keys and write opaque colours as plain hex.
for s in d:
    items = []
    for i in s['items']:
        i = {k: v for k, v in i.items() if v not in (None, 0, 'normal', 'none', 'left') or k in ('x', 'y')}
        if i['k'] == 'text' and i.get('name', '').strip() == i['text'][:40].strip(): i.pop('name', None)
        if i.get('oneLine'): i['oneLine'] = 1
        for k in ('fill', 'color'):
            if isinstance(i.get(k), dict) and i[k].get('a') == 1: i[k] = i[k]['hex']
        items.append(i)
    s['items'] = items
json.dump(d, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
