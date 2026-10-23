# SVG charts for the redesign, drawn at fixed pixel sizes per breakpoint.
import datetime
A, B, DRAW, INK2, INK3, LINE = 'var(--a)', 'var(--b)', 'var(--draw)', 'var(--ink-2)', 'var(--ink-3)', 'var(--line)'
FONT = 'font-family="Schibsted Grotesk" font-size="12"'

def svg(w, h, body):
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">{body}</svg>'

def month(d):
    return datetime.date.fromisoformat(d).strftime('%b %Y')

def lead_chart(mu, w, h, compact=False, label=True):
    lead, years = mu['lead'], mu['years']
    n = len(lead); top = 200
    pl, pr, pt, pb = 36, 12, 28, 26
    pw, ph = w - pl - pr, h - pt - pb
    X = lambda i: pl + pw * i / (n - 1)
    Y = lambda v: pt + ph * (1 - v / top)
    out = []
    p = mu['peak']
    # Shade from the peak on: the stretch where the trailing player has been winning.
    out.append(f'<rect x="{X(p):.1f}" y="{pt}" width="{X(n - 1) - X(p):.1f}" height="{ph}" fill="{B}" fill-opacity="0.08"/>')
    out.append(f'<line x1="{X(p):.1f}" x2="{X(p):.1f}" y1="{pt}" y2="{pt + ph}" stroke="{B}" stroke-opacity="0.5" stroke-dasharray="3 3"/>')
    for v in (0, 50, 100, 150, 200):
        out.append(f'<line x1="{pl}" x2="{w - pr}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{LINE}" stroke-width="1"/>')
        out.append(f'<text x="{pl - 8}" y="{Y(v) + 4:.1f}" {FONT} fill="{INK3}" text-anchor="end">{"+" if v else ""}{v}</text>')
    step = max(1, n // (pw // 2))
    pts = [(X(i), Y(lead[i])) for i in range(0, n, step)] + [(X(n - 1), Y(lead[-1]))]
    d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    out.append(f'<path d="{d}" fill="none" stroke="{A}" stroke-width="2.25" stroke-linejoin="round"/>')
    for y, info in years.items():
        x = X(info['start'])
        out.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{h - pb}" y2="{h - pb + 5}" stroke="{INK3}"/>')
        out.append(f'<text x="{x + 4:.1f}" y="{h - 6}" {FONT} fill="{INK3}">{y if not compact or y in ("2021", "2023", "2025") else ""}</text>')
    px, py = X(p), Y(lead[p])
    out.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4" fill="{A}" stroke="var(--surface)" stroke-width="2"/>')
    out.append(f'<text x="{px - 8:.1f}" y="{py - 10:.1f}" {FONT} font-weight="600" fill="var(--ink)" text-anchor="end">{"Peak +%d" % lead[p] if compact else "Peak +%d · %s" % (lead[p], month(mu["peak_date"]))}</text>')
    ex, ey = X(n - 1), Y(lead[-1])
    out.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="4" fill="{A}" stroke="var(--surface)" stroke-width="2"/>')
    out.append(f'<text x="{ex - 8:.1f}" y="{ey + 20:.1f}" {FONT} font-weight="600" fill="var(--ink)" text-anchor="end">+{lead[-1]} now</text>')
    wa, la = mu['after_peak']
    lab = f'Dudkin {la}–{wa} since' if compact else f'Dudkin {la}–{wa} since the peak'
    if label:
        out.append(f'<text x="{w - pr:.1f}" y="{pt - 10}" {FONT} font-weight="600" fill="{B}" text-anchor="end">{lab}</text>')
    return svg(w, h, ''.join(out))

def tour_strip(mu, w, h):
    # One tick per tournament, in order, coloured by who won the series.
    t = mu['tours']; n = len(t)
    pl, pr = 36, 12
    pw = w - pl - pr; pitch = pw / n; bw = max(1, pitch - 1.5)
    out = []
    for i, x in enumerate(t):
        col = {'a': A, 'b': B, 'd': DRAW}[x['winner']]
        hh = h if x['winner'] != 'd' else h * 0.5
        out.append(f'<rect x="{pl + i * pitch:.1f}" y="{(h - hh) / 2:.1f}" width="{bw:.1f}" height="{hh:.1f}" rx="1" fill="{col}"/>')
    return svg(w, h, ''.join(out))

def heatmap(mu, cell, gap=2, names=('Fateev', 'Dudkin')):
    g = mu['grid']; gr = mu['gridres']; mx = max(g.values())
    lw, th = 46, 40
    size = 8 * cell + 7 * gap
    w, h = lw + size + 4, th + size + 4
    out = []
    best = max(g, key=g.get)
    for a in range(8):
        for b in range(8):
            c = g[(a, b)]
            if not c:
                continue
            x = lw + b * (cell + gap); y = th + (7 - a) * (cell + gap)
            op = 0.1 + 0.9 * (c / mx) ** 0.7
            r = gr[(a, b)]
            if len([k for k in r if r[k]]) > 1:
                # A capped cell holding mixed results: split it diagonally instead of guessing.
                out.append(f'<path d="M{x},{y} h{cell} L{x},{y + cell} Z" fill="{A}" fill-opacity="{op:.2f}"/>')
                out.append(f'<path d="M{x + cell},{y} v{cell} h{-cell} Z" fill="{B}" fill-opacity="{op:.2f}"/>')
            else:
                col = A if a > b else B if b > a else DRAW
                out.append(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}" rx="3" fill="{col}" fill-opacity="{op:.2f}"/>')
            tc = '#FFFFFF' if op > 0.55 else 'var(--ink-2)'
            out.append(f'<text x="{x + cell / 2}" y="{y + cell / 2 + 4}" font-family="Schibsted Grotesk" font-size="{11 if cell < 40 else 12}" fill="{tc}" text-anchor="middle">{c}</text>')
            if (a, b) == best:
                out.append(f'<rect x="{x - 1.5}" y="{y - 1.5}" width="{cell + 3}" height="{cell + 3}" rx="4" fill="none" stroke="var(--ink)" stroke-width="1.5"/>')
    # Draws sit on the diagonal: above it Fateev won, below it Dudkin won.
    out.append(f'<line x1="{lw - 2}" y1="{th + size + 2}" x2="{lw + size + 2}" y2="{th - 2}" stroke="var(--ink-3)" stroke-opacity="0.6" stroke-dasharray="2 3"/>')
    for i in range(8):
        lab = '7+' if i == 7 else str(i)
        out.append(f'<text x="{lw + i * (cell + gap) + cell / 2}" y="{th - 8}" {FONT} fill="{INK3}" text-anchor="middle">{lab}</text>')
        out.append(f'<text x="{lw - 8}" y="{th + (7 - i) * (cell + gap) + cell / 2 + 4}" {FONT} fill="{INK3}" text-anchor="end">{lab}</text>')
    out.append(f'<text x="{lw + size / 2}" y="12" {FONT} font-weight="600" fill="{INK2}" text-anchor="middle">{names[1]} goals →</text>')
    cy = th + size / 2
    out.append(f'<text x="12" y="{cy}" {FONT} font-weight="600" fill="{INK2}" text-anchor="middle" transform="rotate(-90 12 {cy})">← {names[0]} goals</text>')
    return svg(w, h, ''.join(out))

def season_bars(p, w, h, compact=False):
    years = p['years']; ys = list(years)
    pl, pr, pt, pb = 44, 8, 16, 40
    pw, ph = w - pl - pr, h - pt - pb
    bw = pw / len(ys); top = 75
    out = []
    for v in (0, 25, 50, 75):
        y = pt + ph * (1 - v / top)
        out.append(f'<line x1="{pl}" x2="{w - pr}" y1="{y:.1f}" y2="{y:.1f}" stroke="{"var(--line-2)" if v == 50 else LINE}" {"stroke-dasharray=\"3 3\"" if v == 50 else ""}/>')
        out.append(f'<text x="{pl - 8}" y="{y + 4:.1f}" {FONT} fill="{INK3}" text-anchor="end">{v}%</text>')
    gmax = max(r['W'] + r['D'] + r['L'] for r in years.values())
    for i, y in enumerate(ys):
        r = years[y]; g = r['W'] + r['D'] + r['L']; wp = r['W'] / g * 100
        x = pl + i * bw + bw * 0.2; bwi = bw * 0.6
        tp = pt + ph * (1 - wp / top)
        # One colour; opacity follows sample size so thin seasons read as less certain.
        op = 0.3 + 0.7 * min(1, g / (gmax * 0.6))
        out.append(f'<rect x="{x:.1f}" y="{tp:.1f}" width="{bwi:.1f}" height="{pt + ph - tp:.1f}" rx="2" fill="{A}" fill-opacity="{op:.2f}"/>')
        out.append(f'<text x="{x + bwi / 2:.1f}" y="{tp - 6:.1f}" {FONT if not compact else 'font-family="Schibsted Grotesk" font-size="10"'} font-weight="600" fill="var(--ink)" text-anchor="middle">{wp:.0f}{"%" if not compact else ""}</text>')
        lab = y if not compact else "'" + y[2:]
        out.append(f'<text x="{x + bwi / 2:.1f}" y="{h - 22}" {FONT} fill="{INK2}" text-anchor="middle">{lab}</text>')
        out.append(f'<text x="{x + bwi / 2:.1f}" y="{h - 6}" font-family="Schibsted Grotesk" font-size="11" fill="{INK3}" text-anchor="middle">{g:,}</text>')
    return svg(w, h, ''.join(out))

def scatter(p, w, h, labels):
    import math
    opp = [o for o in p['opp'] if o['g'] >= 5]
    pl, pr, pt, pb = 44, 16, 16, 44
    pw, ph = w - pl - pr, h - pt - pb
    lo, hi = math.log10(5), math.log10(2000)
    X = lambda g: pl + pw * (math.log10(g) - lo) / (hi - lo)
    Y = lambda r: pt + ph * (1 - r)
    out = []
    for v in (0, .25, .5, .75, 1):
        out.append(f'<line x1="{pl}" x2="{w - pr}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{"var(--line-2)" if v == .5 else LINE}" {"stroke-dasharray=\"3 3\"" if v == .5 else ""}/>')
        out.append(f'<text x="{pl - 8}" y="{Y(v) + 4:.1f}" {FONT} fill="{INK3}" text-anchor="end">{int(v * 100)}%</text>')
    for g in (5, 10, 50, 100, 500, 1000):
        out.append(f'<text x="{X(g):.1f}" y="{h - 22}" {FONT} fill="{INK3}" text-anchor="middle">{g:,}</text>')
    out.append(f'<text x="{w - pr}" y="{h - 4}" {FONT} fill="{INK2}" text-anchor="end">Games played (log scale) →</text>')
    for o in sorted(opp, key=lambda o: o['g']):
        r = o['w'] / o['g']
        col = A if o['w'] > o['l'] else B if o['l'] > o['w'] else DRAW
        solid = o['g'] >= 40
        out.append(f'<circle cx="{X(o["g"]):.1f}" cy="{Y(r):.1f}" r="{5 if solid else 3.5}" fill="{col}" fill-opacity="{0.9 if solid else 0.35}"/>')
    for o in opp:
        if o['name'] in labels:
            r = o['w'] / o['g']; dx, anchor = labels[o['name']]
            out.append(f'<text x="{X(o["g"]) + dx:.1f}" y="{Y(r) + 4:.1f}" {FONT} font-weight="600" fill="var(--ink)" text-anchor="{anchor}">{o["name"].split()[-1]} {r * 100:.0f}%</text>')
    return svg(w, h, ''.join(out))
