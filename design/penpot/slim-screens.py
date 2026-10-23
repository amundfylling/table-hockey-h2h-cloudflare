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
            v = re.sub(r'rgba?\(([^)]+)\)', lambda m: hexify(m) if 'rgba' not in m.group(0) or not m.group(1).strip().endswith(' 0') else 'none', v)
            v = re.sub(r'\d+\.\d{2,}', num, v)
            v = re.sub(r'\s(id|stroke-dasharray="none"|stroke-opacity="1"|fill-opacity="1"|stroke-linecap="butt"|stroke-linejoin="miter")(="[^"]*")?(?=[\s>/])', lambda m: '' if m.group(1) != 'id' else '', v)
            v = re.sub(r'>\s+<', '><', v)
            i['svg'] = v
json.dump(d, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
