# Expresses one screen as per-item changes against another with identical
# geometry (the dark theme against the light one).
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
assert len(a['items']) == len(b['items'])
diff = {}
for i, (x, y) in enumerate(zip(a['items'], b['items'])):
    d = {}
    for k in set(x) | set(y):
        if x.get(k) == y.get(k): continue
        if k == 'bars' and x['bars']['r'] == y['bars']['r']:
            d['bars'] = {kk: vv for kk, vv in y['bars'].items() if kk != 'r' and x['bars'].get(kk) != vv}
        else:
            d[k] = y.get(k)
    if d: diff[i] = d
top = {k: v for k, v in b.items() if k != 'items' and a.get(k) != v}
out = json.dumps({'top': top, 'diff': diff}, ensure_ascii=False, separators=(',', ':'))
open(sys.argv[3], 'w').write(out); print(len(out))
