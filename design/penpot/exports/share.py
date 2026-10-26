# Generates the suggested head-to-head share image (1080x1080) in the redesign style.
import os, sys, shutil
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../redesign'))
import data
from build import PAL, resolve, fmt, day, MARK

# The matchup from the current export: Magnus Klippen vs Amund Risa Fylling.
A_ID, B_ID = 1647, 2442
A_NAME, B_NAME = 'Magnus Klippen', 'Amund Risa Fylling'
A_SHORT, B_SHORT = 'Klippen', 'Fylling'
A_META, B_META = 'World #30 · Norway', 'World #83 · Norway'
TODAY = '26 Oct 2026'

def season_columns(mu, w, h):
    # Wins per season, mirrored: the first player's above the line, the opponent's below.
    yrs = list(mu['years'].items()); n = len(yrs)
    pl, pr, pt, pb = 0, 0, 22, 22
    mid = pt + (h - pt - pb) * 0.62
    up, down = mid - pt, h - pb - mid
    top = max(max(r['W'] for _, r in yrs), 1)
    scale = min(up, down / max(max(r['L'] for _, r in yrs) / top, 1e-9)) / top
    slot = (w - pl - pr) / n; bw = min(34, slot * 0.62)
    out = [f'<line x1="0" x2="{w}" y1="{mid:.1f}" y2="{mid:.1f}" stroke="var(--line-2)"/>']
    for i, (y, r) in enumerate(yrs):
        x = pl + slot * i + (slot - bw) / 2; cx = x + bw / 2
        hw, hl = r['W'] * scale, r['L'] * scale
        if hw: out.append(f'<rect x="{x:.1f}" y="{mid - hw - 1:.1f}" width="{bw:.1f}" height="{hw:.1f}" rx="2" fill="var(--a)"/>')
        if hl: out.append(f'<rect x="{x:.1f}" y="{mid + 1:.1f}" width="{bw:.1f}" height="{hl:.1f}" rx="2" fill="var(--b)"/>')
        out.append(f'<text x="{cx:.1f}" y="{mid - hw - 7:.1f}" font-family="Barlow Condensed" font-size="15" font-weight="600" fill="var(--ink)" text-anchor="middle">{r["W"]}</text>')
        out.append(f'<text x="{cx:.1f}" y="{mid + hl + 17:.1f}" font-family="Barlow Condensed" font-size="15" font-weight="600" fill="var(--ink-2)" text-anchor="middle">{r["L"]}</text>')
        out.append(f'<text x="{cx:.1f}" y="{h - 2}" font-family="Schibsted Grotesk" font-size="12" fill="var(--ink-3)" text-anchor="middle">{"’" + y[2:] if i else y}</text>')
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg">{"".join(out)}</svg>'

def share(mu):
    s = mu['s']; W, D, L, G = s['wins_player'], s['draws'], s['wins_opponent'], s['total_matches']
    pa, pd, pb = W / G * 100, D / G * 100, L / G * 100
    m = mu['matches']
    last = [(data.res(g), f'{g["goals_for_player"]}–{g["goals_for_opponent"]}') for g in m[-10:]][::-1]
    chips = ''.join(f'<div class="chip {r.lower()}"><b>{sc}</b>{r}</div>' for r, sc in last)
    lw = sum(r == 'W' for r, _ in last); ll = sum(r == 'L' for r, _ in last)
    yrs = list(mu['years'].items()); cy, cr = yrs[-1]
    # Biggest win each way: widest margin, the most recent one on a tie.
    big = lambda f: max(m, key=lambda x: (f(x), x['date']))
    ba = big(lambda x: x['goals_for_player'] - x['goals_for_opponent'])
    bb = big(lambda x: x['goals_for_opponent'] - x['goals_for_player'])
    def tape_row(k, a, b):
        sa = a / (a + b) * 100
        return f'''<div class="trow"><div class="ttop"><span class="v {"wa" if a > b else ""}">{fmt(a)}</span><span class="k">{k}</span><span class="v r {"wb" if b > a else ""}">{fmt(b)}</span></div>
<div class="tbar"><div style="width:{sa:.1f}%;background:var(--a)"></div><div style="flex:1;background:var(--b)"></div><i></i></div></div>'''
    tape = tape_row('Goals', s['goals_for_player'], s['goals_for_opponent']) + tape_row('One-goal wins', *mu['one']) + tape_row('Overtime wins', *mu['ot'])
    return f'''<div class="card">
<div class="top"><span class="brand"><span class="mark">{MARK}</span>Table Hockey H2H</span><span class="eyebrow">Head-to-head · All games</span></div>
<div class="board">
 <div class="who"><div class="tick" style="background:var(--a)"></div><div class="name">{A_NAME}</div><div class="meta">{A_META}</div></div>
 <div class="mid"><div class="score"><span class="a">{W}</span><span class="dash">–</span><span class="b">{L}</span></div><div class="facts">{fmt(G)} games · {s["first_meeting_date"][:4]}–{s["last_meeting_date"][:4]} · {len(s["tournaments"])} tournaments</div></div>
 <div class="who b"><div class="tick" style="background:var(--b)"></div><div class="name">{B_NAME}</div><div class="meta">{B_META}</div></div>
</div>
<div class="share"><div class="bar"><div style="width:{pa:.2f}%;background:var(--a)"></div><div style="width:{pd:.2f}%;background:var(--draw)"></div><div style="flex:1;background:var(--b)"></div></div>
<div class="labels"><span><b>{pa:.1f}%</b> {A_SHORT}</span><span>{D} draws · {pd:.1f}%</span><span><b>{pb:.1f}%</b> {B_SHORT}</span></div></div>
<p class="verdict">{A_SHORT} has won 7 of every 10 games, and <em>{cr["W"]} of {cr["W"] + cr["D"] + cr["L"]} this year</em>.</p>
<div class="panel chart"><div class="chart-head"><span class="title">Wins per season</span><span class="legend"><span><i style="background:var(--a)"></i>{A_SHORT} above</span><span><i style="background:var(--b)"></i>{B_SHORT} below</span></span></div>
{season_columns(mu, 904, 250)}</div>
<div class="bottom">
 <div class="col form"><div class="eyebrow">Last 10 games<span>{A_SHORT} {lw} · {B_SHORT} {ll}</span></div><div class="chips">{chips}</div><div class="latest">Latest first</div></div>
 <div class="col tape"><div class="eyebrow">Tale of the tape</div>{tape}</div>
 <div class="col big"><div class="eyebrow">Biggest wins</div>
  <div class="bw"><b class="a">{ba["goals_for_player"]}–{ba["goals_for_opponent"]}</b><span>{A_SHORT}<br><small>{day(ba["date"])}</small></span></div>
  <div class="bw"><b class="b">{bb["goals_for_opponent"]}–{bb["goals_for_player"]}</b><span>{B_SHORT}<br><small>{day(bb["date"])}</small></span></div></div>
</div>
<div class="foot"><span><b>table-hockey-h2h.pages.dev</b></span><span>Updated {TODAY}</span></div>
</div>'''

CSS = '''
* { box-sizing: border-box; margin: 0; padding: 0; }
body { width: 1080px; height: 1080px; background: var(--bg); color: var(--ink); font-family: "Schibsted Grotesk", "Golos Text", sans-serif; font-size: 14px; line-height: 20px; }
.card { width: 1080px; height: 1080px; padding: 56px 64px 0; position: relative; }
.num, .score, .chip b, .v, .bw b { font-family: "Barlow Condensed", sans-serif; }
.top { display: flex; align-items: center; justify-content: space-between; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
.mark { width: 28px; height: 28px; border-radius: 7px; background: #15181B; border: 1px solid var(--line-2); display: flex; align-items: center; justify-content: center; }
.eyebrow { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); display: flex; justify-content: space-between; }
.eyebrow span { text-transform: none; letter-spacing: 0; font-weight: 500; color: var(--ink-2); font-size: 13px; }
.board { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; margin-top: 40px; }
.tick { width: 32px; height: 4px; border-radius: 2px; margin-bottom: 12px; }
.who .name { font-size: 30px; line-height: 34px; font-weight: 700; letter-spacing: -0.02em; }
.who .meta { font-size: 15px; color: var(--ink-2); margin-top: 6px; }
.who.b { text-align: right; } .who.b .tick { margin-left: auto; }
.mid { display: flex; flex-direction: column; align-items: center; padding: 0 16px; }
.score { display: flex; align-items: baseline; gap: 16px; font-weight: 600; font-size: 120px; line-height: 100px; }
.score .a { color: var(--a); } .score .b { color: var(--b); } .score .dash { color: var(--line-2); font-weight: 400; font-size: 80px; }
.facts { font-size: 15px; color: var(--ink-2); margin-top: 12px; }
.share { margin-top: 28px; }
.bar { display: flex; height: 12px; gap: 2px; border-radius: 6px; overflow: hidden; }
.labels { display: flex; justify-content: space-between; margin-top: 8px; font-size: 14px; color: var(--ink-2); }
.labels b { color: var(--ink); }
.verdict { margin-top: 28px; font-size: 22px; line-height: 30px; letter-spacing: -0.01em; }
.verdict em { font-style: normal; font-weight: 700; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.chart { margin-top: 28px; padding: 20px 24px 18px; }
.chart-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.chart-head .title { font-size: 15px; font-weight: 700; }
.legend { display: flex; gap: 16px; font-size: 13px; color: var(--ink-2); }
.legend span { display: flex; align-items: center; gap: 6px; } .legend i { width: 10px; height: 10px; border-radius: 5px; display: inline-block; }
.bottom { display: grid; grid-template-columns: 300px 1fr 196px; gap: 36px; margin-top: 36px; }
.col .eyebrow { margin-bottom: 12px; }
.chips { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.chip { height: 50px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-size: 12px; }
.chip b { font-size: 17px; line-height: 18px; font-weight: 600; }
.chip.w { background: var(--a); color: var(--bg); } .chip.l { background: var(--b-tint); color: var(--b); } .chip.d { background: var(--sunk); color: var(--ink-2); }
.chip:first-child { box-shadow: 0 0 0 2px var(--bg), 0 0 0 3px var(--ink); }
.latest { font-size: 12px; color: var(--ink-3); margin-top: 8px; }
.trow + .trow { margin-top: 12px; }
.ttop { display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline; }
.ttop .v { font-size: 20px; line-height: 22px; font-weight: 600; color: var(--ink-2); } .ttop .v.r { text-align: right; }
.ttop .v.wa { color: var(--a); font-weight: 600; } .ttop .v.wb { color: var(--b); font-weight: 600; }
.ttop .k { font-size: 13px; color: var(--ink-2); }
.tbar { position: relative; display: flex; gap: 2px; height: 6px; margin-top: 6px; border-radius: 2px; overflow: hidden; }
.tbar i { position: absolute; left: 50%; top: 0; width: 2px; margin-left: -1px; height: 6px; background: var(--bg); }
.bw { display: flex; align-items: center; gap: 14px; } .bw + .bw { margin-top: 14px; }
.bw b { font-size: 44px; line-height: 44px; font-weight: 600; width: 72px; } .bw b.a { color: var(--a); } .bw b.b { color: var(--b); }
.bw span { font-size: 14px; font-weight: 600; line-height: 18px; } .bw small { font-size: 13px; font-weight: 400; color: var(--ink-2); }
.foot { position: absolute; left: 64px; right: 64px; bottom: 0; height: 64px; border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; font-size: 14px; color: var(--ink-2); }
.foot b { color: var(--ink); font-weight: 600; }
'''

def page(theme, body):
    tint = {'light': '#F7E0D6', 'dark': '#40241B'}[theme]
    css = resolve(CSS.replace('var(--b-tint)', tint), theme)
    return f'''<!doctype html><html data-theme="{theme}"><head><meta charset="utf-8"><title>Share image</title>
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=Golos+Text:wght@400;600;700&family=Barlow+Condensed:wght@400;500;600&display=swap" rel="stylesheet">
<style>{css}</style></head><body>{resolve(body, theme)}</body></html>'''

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'
    os.makedirs(out, exist_ok=True)
    mu = data.matchup(A_ID, B_ID)
    for theme in ('light', 'dark'):
        open(f'{out}/share-{theme}.html', 'w').write(page(theme, share(mu)))
