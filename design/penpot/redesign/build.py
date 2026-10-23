# Generates the redesign pages as static HTML from real site data.
import re, sys, os, datetime
import data, charts

PAL = {
    'light': dict(bg='#F4F3EF', surface='#FFFFFF', sunk='#ECEAE4', ink='#15181B', **{'ink-2': '#4A525B', 'ink-3': '#6F757D', 'line': '#E2DFD8', 'line-2': '#CFCBC2'}, a='#1D6A59', b='#D4532A', draw='#B6BABF'),
    'dark': dict(bg='#0F1113', surface='#171A1D', sunk='#1E2226', ink='#EEF0F2', **{'ink-2': '#A9B0B8', 'ink-3': '#8A929B', 'line': '#262B30', 'line-2': '#343A40'}, a='#4DBFA3', b='#F07A52', draw='#59606A'),
}
def resolve(s, theme):
    return re.sub(r'var\(--([\w-]+)\)', lambda m: PAL[theme][m.group(1)], s)

def fmt(n): return f'{n:,}'
def day(d): return datetime.date.fromisoformat(d).strftime('%-d %b %Y')

MARK = '<svg width="16" height="16" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="11" width="7" height="26" rx="3.5" fill="#FFFFFF"/><rect x="32" y="11" width="7" height="26" rx="3.5" fill="#FFFFFF"/><circle cx="24" cy="24" r="5.5" fill="#F07A52"/></svg>'
def icon(path, size=18, stroke='var(--ink-2)', sw=1.75):
    return f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">{path}</svg>'
I_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'
I_MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'
I_CHEV = '<path d="M6 9l6 6 6-6"/>'
I_RIGHT = '<path d="M9 6l6 6-6 6"/>'
I_LINK = '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
I_SHARE = '<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>'
I_MENU = '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'
I_FILTER = '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>'
I_SWAP = '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>'

def topbar(active, search=True, share=False):
    nav = ''.join(f'<a class="{"on" if n == active else ""}">{n}</a>' for n in ('Head-to-head', 'Players', 'Rivalries'))
    # Mobile gets the menu (the nav has no room) and, on a matchup, a share button.
    mb = (f'<div class="iconbtn">{icon(I_SHARE)}</div>' if share else '') + (f'<div class="iconbtn">{icon(I_SEARCH)}</div>' if search else '') + f'<div class="iconbtn">{icon(I_MENU)}</div>'
    sb = f'<div class="search">{icon(I_SEARCH, 16, "var(--ink-3)")}Search players<span class="kbd">/</span></div>' if search else '<div class="spacer"></div>'
    return f'''<header class="topbar" id="topbar"><div class="wrap">
<a class="brand"><span class="mark">{MARK}</span>Table Hockey H2H</a>
<nav class="nav only-d">{nav}</nav>
{sb}
<div class="iconbtn only-d">{icon(I_MOON)}</div>
<div class="mbtns only-m">{mb}</div>
</div></header>'''

def footer():
    return '''<footer class="footer" id="footer"><div class="wrap"><span>Data from Scorpion Scraper and bordshockey.net</span><span>3,324 players · 999,213 matches</span><span class="right">Updated 23 Oct 2026</span></div></footer>'''

def page(title, body, theme):
    return f'''<!doctype html><html data-theme="{theme}"><head><meta charset="utf-8"><title>{title}</title>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=Golos+Text:wght@400;500;600;700&family=Barlow+Condensed:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css"></head><body>{body}</body></html>'''

# ---------------------------------------------------------------- matchup
def matchup_page(mu):
    s = mu['s']; W, D, L, G = s['wins_player'], s['draws'], s['wins_opponent'], s['total_matches']
    pa, pd, pb = W / G * 100, D / G * 100, L / G * 100
    wa, la = mu['after_peak']
    last = [(data.res(g), f'{g["goals_for_player"]}–{g["goals_for_opponent"]}') for g in mu['matches'][-10:]][::-1]
    lw = sum(r == 'W' for r, _ in last); ll = sum(r == 'L' for r, _ in last)
    chips = ''.join(f'<div class="chip {r.lower()}"><b>{sc}</b>{r}</div>' for r, sc in last)
    tw = mu['tour_wins']; recent = [t['winner'] for t in mu['tours'][-6:]]
    hero = f'''<section class="hero" id="scoreboard"><div class="wrap">
<div class="crumbs"><span>Head-to-head</span><span class="sep">/</span><span>Fateev vs Dudkin</span></div>
<div class="board">
 <div class="who a"><div class="tick" style="background:var(--a)"></div><div class="name">Dmitriy Fateev</div><div class="meta">Belgorod, Russia</div></div>
 <div class="mid"><div class="score"><span class="a">{W}</span><span class="dash">–</span><span class="b">{L}</span></div><div class="facts">{fmt(G)} games · {s["first_meeting_date"][:4]}–{s["last_meeting_date"][:4]} · {len(s["tournaments"])} tournaments</div></div>
 <div class="who b"><div class="tick" style="background:var(--b)"></div><div class="name">Denis Dudkin</div><div class="meta">Oryol, Russia</div></div>
</div>
<div class="share"><div class="share-bar"><div style="width:{pa}%;background:var(--a);border-radius:5px 0 0 5px"></div><div style="width:{pd}%;background:var(--draw)"></div><div style="width:{pb}%;background:var(--b);border-radius:0 5px 5px 0"></div></div>
<div class="share-labels"><span><b>{pa:.1f}%</b> wins</span><span>{D} draws · {pd:.1f}%</span><span><b>{pb:.1f}%</b> wins</span></div></div>
<p class="verdict">Fateev leads by {W - L} wins, but the gap is closing: <em>Dudkin has won {la} to {wa} since the peak in May 2024</em>, and {recent.count("b")} of the last six tournaments.</p>
<div class="form-strip"><div class="fs-label"><span class="eyebrow">Last 10 games</span><span>Fateev {lw} · Dudkin {ll}</span></div><div class="chips"><span class="latest">Latest</span>{chips}</div></div>
<div class="controls">
 <div class="seg"><span class="on">All <small>{fmt(G)}</small></span><span>Round-robin <small>563</small></span><span>Playoff <small>1,104</small></span></div>
 <div class="select only-d">All years {icon(I_CHEV, 16)}</div><div class="select only-d">All tournaments {icon(I_CHEV, 16)}</div><div class="btn only-m filters">{icon(I_FILTER, 16)}Filters</div>
 <div class="right only-d"><div class="btn">{icon(I_LINK, 16)}Copy link</div><div class="btn">{icon(I_SHARE, 16)}Share image</div></div>
</div></div></section>'''

    lead = f'''<section class="section" id="momentum"><div class="wrap"><div class="panel chart-panel">
<div class="chart-head"><div><div class="chart-title">How the lead has moved</div><div class="chart-sub">Fateev's wins minus losses, game by game. Years mark each season's first game.</div></div>
<div class="legend"><span><i class="dot" style="background:var(--a)"></i>Fateev's lead</span><span><i class="dot" style="background:var(--b);opacity:.35"></i>Dudkin winning since the peak</span></div></div>
<div class="only-d">{charts.lead_chart(mu, 1150, 260)}</div><div class="only-m">{charts.lead_chart(mu, 326, 200, compact=True)}</div>
<div class="only-d"><div class="strip-label"><span>Every tournament, in order, by who won the series</span><span><i class="dot" style="background:var(--a)"></i>Fateev {tw[0]}</span><span><i class="dot" style="background:var(--b)"></i>Dudkin {tw[1]}</span><span><i class="dot" style="background:var(--draw)"></i>Tied {tw[2]}</span></div>{charts.tour_strip(mu, 1150, 28)}</div>
</div></div></section>'''

    def tape_row(k, a, b):
        # One bar split by share: the split point is the finding, not two near-full bars.
        sa = a / (a + b) * 100
        ca = 'win a' if a > b else ''; cb = 'win b' if b > a else ''
        return f'''<div class="tape-row"><div class="tape-top"><span class="v {ca}">{fmt(a)}</span><span class="k">{k}</span><span class="v r {cb}">{fmt(b)}</span></div>
<div class="tape-bar"><div style="width:{sa:.1f}%;background:var(--a)"></div><div style="flex:1;background:var(--b)"></div><i></i></div></div>'''
    tape = ''.join([
        tape_row('Wins', W, L),
        tape_row('Goals', s['goals_for_player'], s['goals_for_opponent']),
        tape_row('One-goal wins', *mu['one']),
        tape_row('Overtime wins', *mu['ot']),
        tape_row('Playoff series won', *mu['series']),
        tape_row('Longest win streak', *mu['streak']),
    ])
    best = max(mu['grid'], key=mu['grid'].get)
    stats = f'''<section class="section" id="breakdown"><div class="wrap"><div class="cols c-6-6">
<div><div class="sec-head"><h2 class="sec-title">Tale of the tape</h2><span class="sec-sub">All {fmt(G)} games · centre line is 50/50</span></div><div class="flat tape">{tape}</div></div>
<div><div class="sec-head"><h2 class="sec-title">Scorelines</h2><span class="sec-sub">How often each result happened</span></div><div class="panel heat">
<div class="only-d">{charts.heatmap(mu, 40)}</div><div class="only-m">{charts.heatmap(mu, 34)}</div>
<p class="heat-cap"><b>{best[0]}–{best[1]} to Fateev</b> is the most common result ({mu["grid"][best]} games). {mu["one"][0] + mu["one"][1]:,} of {fmt(G)} games were decided by one goal. Above the dotted line Fateev won, below it Dudkin won.</p></div></div>
</div></div></section>'''

    rows = ''
    ymax = max(max(r['W'], r['L']) / (r['W'] + r['D'] + r['L']) for r in mu['years'].values())
    last_y = list(mu['years'])[-1]
    for y, r in mu['years'].items():
        g = r['W'] + r['D'] + r['L']
        edge = r['W'] - r['L']
        # Diverging from the centre: Fateev's wins to the left, Dudkin's to the right.
        rows += f'''<div class="srow"><span class="yr">{y}{'<small>to Oct</small>' if y == last_y else ''}</span><span class="rec">{r["W"]}–{r["D"]}–{r["L"]}</span><div class="div"><div class="half l"><div style="width:{r["W"] / g / ymax * 100:.1f}%;background:var(--a)"></div></div><div class="half r"><div style="width:{r["L"] / g / ymax * 100:.1f}%;background:var(--b)"></div></div></div><span class="edge {"a" if edge > 0 else "b"}"><span class="only-d">{"Fateev" if edge > 0 else "Dudkin"} </span>+{abs(edge)}</span></div>'''
    seasons = f'''<section class="section" id="seasons"><div class="wrap">
<div class="sec-head"><h2 class="sec-title">Season by season</h2><span class="sec-sub">Share of each year's games won, Fateev left, Dudkin right</span></div>
<div class="flat seasons"><div class="srow head"><span>Year</span><span class="rec">W–D–L</span><div class="div"><span class="l">Fateev wins</span><span class="r">Dudkin wins</span></div><span class="edge">Edge</span></div>{rows}</div>
</div></section>'''

    trows = ''
    tours = mu['tours'][::-1][:6]
    for i, t in enumerate(tours):
        gw = sum(1 for g in t['games'] if g['goals_for_player'] > g['goals_for_opponent']); gl = sum(1 for g in t['games'] if g['goals_for_player'] < g['goals_for_opponent'])
        win = 'Fateev' if gw > gl else 'Dudkin' if gl > gw else None
        wc = 'a' if win == 'Fateev' else 'b' if win else 'd'
        pill = f'<span class="pill {wc}">{win + " won" if win else "Tied"}</span>'
        stage = t['games'][-1]['stage'].replace('Round-Robin', 'Round-robin')
        trows += f'''<div class="trow"><span class="date">{day(t["date"])}</span><span class="tname"><span class="nm">{t["name"]}</span><span class="sub only-m">{pill}{day(t["date"])} · {len(t["games"])} games</span></span><span class="stage">{stage} · {len(t["games"])} games</span><span class="res"><span class="only-d">{pill}</span><span class="sc {wc}">{gw}–{gl}</span></span><span class="chev">{icon(I_CHEV if i else '<path d="M6 15l6-6 6 6"/>', 18)}</span></div>'''
        if i == 0:
            gs = ''.join(f'<div class="g">G{g["playoff_game_number"]}<b><span class="{"wa" if g["goals_for_player"] > g["goals_for_opponent"] else ""}">{g["goals_for_player"]}</span>–<span class="{"wb" if g["goals_for_player"] < g["goals_for_opponent"] else ""}">{g["goals_for_opponent"]}</span></b></div>' for g in t['games'])
            trows += f'<div class="games">{gs}</div>'
    tl = f'''<section class="section" id="tournaments"><div class="wrap"><div class="sec-head"><h2 class="sec-title">Tournaments</h2><span class="sec-sub">{len(s["tournaments"])} events, newest first</span><span class="right">Fateev won {tw[0]} · Dudkin won {tw[1]} · {tw[2]} tied</span></div>
<div class="panel tlist">{trows}<div class="tfoot">Show all {len(s["tournaments"])} tournaments</div></div></div></section>'''
    return topbar('Head-to-head', share=True) + '<main>' + hero + lead + stats + seasons + tl + '</main>' + footer()

# ---------------------------------------------------------------- player
def player_page(p, mu):
    G, W, D, L = p['games'], p['w'], p['d'], p['l']
    two = p['opp'][0]['g'] + p['opp'][1]['g']
    hero = f'''<section class="p-hero" id="profile"><div class="wrap">
<div class="crumbs"><span>Players</span><span class="sep">/</span><span>Dmitriy Fateev</span></div>
<div class="p-top"><div><h1 class="p-name">Dmitriy Fateev</h1><div class="p-meta">Belgorod, Russia · Born 1978 · Playing since {datetime.date.fromisoformat(p["first"]).strftime("%B %Y")}</div></div>
<div class="actions"><div class="btn">{icon(I_LINK, 16)}Copy link</div><div class="btn primary">{icon(I_SWAP, 16, 'var(--bg)')}Compare with…</div></div></div>
<div class="panel kpis">
 <div class="kpi"><div class="eyebrow">Games</div><div class="v">{fmt(G)}</div><div class="s">{p["tours"]} tournaments</div></div>
 <div class="kpi rec"><div class="eyebrow">Record</div><div class="v">{fmt(W)}–{D}–{fmt(L)}</div><div class="s">Wins, draws, losses</div></div>
 <div class="kpi"><div class="eyebrow">Win rate</div><div class="v">{W / G * 100:.1f}%</div><div class="s">{(W + D / 2) / G * 100:.1f}% counting draws as half</div></div>
 <div class="kpi"><div class="eyebrow">Goals</div><div class="v">{fmt(p["gf"])}–{fmt(p["ga"])}</div><div class="s">{(p["gf"] - p["ga"]) / G:+.2f} per game</div></div>
 <div class="kpi"><div class="eyebrow">Opponents</div><div class="v">{len(p["opp"])}</div><div class="s">{two / G * 100:.0f}% of games against two of them</div></div>
</div></div></section>'''
    a, b = p['opp'][0], p['opp'][1]
    rest = p['opp'][2:]; rw = sum(o['w'] for o in rest); rg = G - two
    wr = lambda w, g: f'{w / g * 100:.0f}%'
    reg = [o for o in p['opp'] if o['g'] >= 40]
    best = max(reg, key=lambda o: o['w'] / o['g']); worst = min(reg, key=lambda o: o['w'] / o['g'])
    split = f'''<div class="split"><div style="width:{a["g"] / G * 100:.1f}%;background:var(--a)"></div><div style="width:{b["g"] / G * 100:.1f}%;background:var(--a);opacity:.55"></div><div style="flex:1;background:var(--line-2)"></div></div>
<div class="split-legend"><div class="head">Opponent<b style="color:var(--ink-3);font-weight:400">Games</b><em style="color:var(--ink-3)">Won</em></div><div><i class="dot" style="background:var(--a)"></i>{a["name"]}<b>{fmt(a["g"])}</b><em>{wr(a["w"], a["g"])}</em></div><div><i class="dot" style="background:var(--a);opacity:.55"></i>{b["name"]}<b>{fmt(b["g"])}</b><em>{wr(b["w"], b["g"])}</em></div><div><i class="dot" style="background:var(--line-2)"></i>{len(p["opp"]) - 2} other opponents<b>{fmt(rg)}</b><em>{wr(rw, rg)}</em></div></div>
<div class="extremes"><div><div class="eyebrow">Best record</div><div class="xn">{best["name"]}</div><div class="xs"><span style="color:var(--a)">{wr(best["w"], best["g"])}</span> in {best["g"]} games</div></div><div><div class="eyebrow">Toughest opponent</div><div class="xn">{worst["name"]}</div><div class="xs"><span style="color:var(--b)">{wr(worst["w"], worst["g"])}</span> in {worst["g"]} games</div></div></div>
<div class="xfoot">Opponents with 40+ games</div>'''
    seasons = f'''<section class="section" id="seasons"><div class="wrap"><div class="cols c-7-5">
<div class="panel chart-panel"><div class="chart-head"><div><div class="chart-title">Win rate by season</div><div class="chart-sub">Share of games won each year. Fainter bars are seasons with fewer games (count underneath).</div></div></div>
<div class="only-d">{charts.season_bars(p, 640, 300)}</div><div class="only-m">{charts.season_bars(p, 326, 220, compact=True)}</div></div>
<div class="panel callout"><div class="eyebrow">Who Fateev plays</div><p class="big"><span>{two / G * 100:.0f}%</span> of games are against just two opponents.</p>{split}</div>
</div></div></section>'''
    labels = {'Denis Dudkin': (-14, 'end'), 'Andrej Demidov': (-14, 'end'), 'Aleksandr Zavyalov': (12, 'start'), 'Maxim Starkov': (10, 'start'), 'Igor Scherbakov': (12, 'start'), 'Oleg Proskurin': (-10, 'end')}
    labels_m = {'Denis Dudkin': (-12, 'end'), 'Andrej Demidov': (-12, 'end'), 'Aleksandr Zavyalov': (9, 'start'), 'Maxim Starkov': (9, 'start')}
    scat = f'''<section class="section" id="rivals"><div class="wrap"><div class="panel chart-panel">
<div class="chart-head"><div><div class="chart-title">Rival map</div><div class="chart-sub">Every opponent with 5+ games. Higher is a better win rate for Fateev, further right is more games.</div></div>
<div class="legend"><span><i class="dot" style="background:var(--a)"></i>Fateev wins more</span><span><i class="dot" style="background:var(--b)"></i>Opponent wins more</span><span><i class="dot" style="background:var(--ink-3);opacity:.35"></i>Faded: under 40 games</span></div></div>
<div class="only-d">{charts.scatter(p, 1150, 320, labels)}</div><div class="only-m">{charts.scatter(p, 326, 260, labels_m)}</div></div></div></section>'''
    rows = ''
    for o in p['opp'][:8]:
        r = (o['w']) / o['g'] * 100
        # Colour by who has won more, so draws can't flip it (73-6-70 is still ahead).
        oc = 'var(--a)' if o['w'] > o['l'] else 'var(--b)' if o['l'] > o['w'] else 'var(--draw)'
        rows += f'''<div class="orow"><span class="n">{o["name"]}</span><span class="r num">{fmt(o["g"])}</span><span class="r mut hide-m">{o["w"]}–{o["d"]}–{o["l"]}</span><span class="wbar hide-m"><span class="t"><span class="f" style="display:block;width:{r:.0f}%;background:{oc}"></span></span><span>{r:.0f}%</span></span><span class="r mut hide-m">{day(o["last"])}</span><span class="cmp"><span class="only-d">Compare</span><span class="only-m" style="font-weight:600;color:{oc}">{r:.0f}%</span>{icon(I_RIGHT, 16, 'var(--ink)')}</span></div>'''
    table = f'''<section class="section" id="opponents"><div class="wrap"><div class="sec-head"><h2 class="sec-title">Opponents</h2><span class="sec-sub">Sorted by games played</span><span class="right only-d">Showing 8 of {len(p["opp"])}</span></div>
<div class="panel otable"><div class="orow head"><span>Opponent</span><span class="r sorted">Games ↓</span><span class="r hide-m">W–D–L</span><span class="hide-m">Win rate</span><span class="r hide-m">Last played</span><span class="r">{'<span class="only-d"></span><span class="only-m">Win</span>'}</span></div>{rows}<div class="tfoot">Show all {len(p["opp"])} opponents</div></div></div></section>'''
    return topbar('Players') + '<main>' + hero + seasons + scat + table + '</main>' + footer()

# ---------------------------------------------------------------- home
def home_page(riv, mu):
    s = mu['s']
    rows = ''
    for i, r in enumerate(riv):
        g = r['g']
        rows += f'''<div class="rrow"><span class="rank">{i + 1}</span><span class="pair">{r["a"]}<i>vs</i>{r["b"]}</span><span class="rec"><span>{r["w"]}</span><span class="mini"><span style="width:{r["w"] / g * 100:.1f}%;background:var(--a)"></span><span style="width:{r["d"] / g * 100:.1f}%;background:var(--draw)"></span><span style="width:{r["l"] / g * 100:.1f}%;background:var(--b)"></span></span><span>{r["l"]}</span></span><span class="gn num">{fmt(g)}</span><span class="mut">{day(r["last"])}</span><span class="chev">{icon(I_RIGHT, 18)}</span></div>'''
    hero = f'''<section class="h-hero" id="hero"><div class="wrap"><div class="h-grid">
<div><h1 class="h-title">999,213 games. Every rivalry, settled.</h1><p class="h-sub">Look up any of 3,324 table hockey players, or put two side by side to see every game they have played against each other.</p>
<div class="panel finder"><div class="finder-row">
 <div class="field"><label>Player</label><div class="input">{icon(I_SEARCH, 18, 'var(--ink-3)')}Search 3,324 players</div></div>
 <div class="swap">{icon(I_SWAP, 18, 'var(--ink-3)')}</div>
 <div class="field"><label>Opponent <span style="font-weight:400;color:var(--ink-3)">optional</span></label><div class="input">{icon(I_SEARCH, 18, 'var(--ink-3)')}Anyone</div></div>
</div><div class="finder-foot"><span class="hint">Add an opponent to compare head-to-head.</span><div class="btn primary">View player</div></div></div>
</div>
<div class="panel feature"><div class="eyebrow">Most-played rivalry</div>
<div class="names"><span>Dmitriy Fateev</span><span></span><span class="r">Denis Dudkin</span></div>
<div class="sc" style="justify-content:space-between;margin-top:6px"><span style="color:var(--a)">{s["wins_player"]}</span><span style="color:var(--b)">{s["wins_opponent"]}</span></div>
<div style="margin-top:16px"><div class="only-d">{charts.lead_chart(mu, 390, 120, compact=True, label=False)}</div><div class="only-m">{charts.lead_chart(mu, 324, 110, compact=True, label=False)}</div></div>
<p>{fmt(s["total_matches"])} games since 2021. Fateev built a lead of 183, and Dudkin has cut it to {s["wins_player"] - s["wins_opponent"]} since the peak in May 2024.</p>
<div class="open">Open the matchup {icon(I_RIGHT, 16, 'var(--ink)')}</div></div>
</div></div></section>'''
    riv_s = f'''<section class="section" id="rivalries" style="padding-top:64px"><div class="wrap"><div class="sec-head"><h2 class="sec-title">Biggest rivalries</h2><span class="sec-sub">Most games between two players</span></div>
<div class="panel rlist"><div class="rrow head"><span>#</span><span>Rivalry</span><span>Record, first player's wins left</span><span class="gn">Games</span><span class="mut">Last played</span><span></span></div>{rows}<div class="tfoot">See all rivalries</div></div></div></section>'''
    return topbar('Head-to-head', search=False) + '<main>' + hero + riv_s + '</main>' + footer()


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    mu = data.matchup()
    for theme in ('light', 'dark'):
        open(f'{out}/matchup-{theme}.html', 'w').write(resolve(page('Matchup', matchup_page(mu), theme), theme))
    open(f'{out}/player-light.html', 'w').write(resolve(page('Player', player_page(data.player(), mu), 'light'), 'light'))
    open(f'{out}/home-light.html', 'w').write(resolve(page('Home', home_page(data.rivalries(), mu), 'light'), 'light'))
    import shutil; shutil.copy(os.path.join(os.path.dirname(__file__), 'style.css'), out)

