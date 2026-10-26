# Pulls the real numbers the redesign shows from the built site data.
import json, collections, glob, os
ROOT = os.path.join(os.path.dirname(__file__), '../../../public/data')
A, B = 6344, 10543

def load(pid):
    return json.load(open(f'{ROOT}/h2h/{pid}.json'))

def res(x):
    a, b = x['goals_for_player'], x['goals_for_opponent']
    return 'W' if a > b else 'L' if b > a else 'D'

def matchup(a=A, b=B):
    d = load(a); o = d['opponents'][str(b)]; m = o['matches']
    m.sort(key=lambda x: (x['date'], x['stage_sequence'] or 0, x['round_number'] or 0, x['playoff_game_number'] or 0))
    s = o['summary']
    lead, c = [], 0
    years = collections.OrderedDict()
    for x in m:
        r = res(x); c += (r == 'W') - (r == 'L'); lead.append(c)
        y = years.setdefault(x['date'][:4], {'W': 0, 'D': 0, 'L': 0, 'gf': 0, 'ga': 0, 'start': len(lead) - 1})
        y[r] += 1; y['gf'] += x['goals_for_player']; y['ga'] += x['goals_for_opponent']
    peak = max(range(len(lead)), key=lambda i: lead[i])
    grid = collections.Counter((min(x['goals_for_player'], 7), min(x['goals_for_opponent'], 7)) for x in m)
    # Capped cells (7+) can hold wins, draws and losses; keep the split to colour them honestly.
    gridres = collections.defaultdict(collections.Counter)
    for x in m:
        gridres[(min(x['goals_for_player'], 7), min(x['goals_for_opponent'], 7))][res(x)] += 1
    margins = [x['goals_for_player'] - x['goals_for_opponent'] for x in m]
    def streak(t):
        best = run = 0
        for x in m:
            run = run + 1 if res(x) == t else 0; best = max(best, run)
        return best
    ser = collections.defaultdict(lambda: [0, 0])
    for x in m:
        if x['stage'] == 'Playoff':
            ser[x['stage_id']][0] += res(x) == 'W'; ser[x['stage_id']][1] += res(x) == 'L'
    one = [sum(1 for x in m if res(x) == t and abs(x['goals_for_player'] - x['goals_for_opponent']) == 1) for t in 'WL']
    ot = [sum(1 for x in m if x['overtime'] and res(x) == t) for t in 'WL']
    tours = collections.OrderedDict()
    for x in m:
        tours.setdefault(x['tournament_id'], {'name': x['tournament_name'], 'date': x['date'], 'games': []})['games'].append(x)
    since = [sum(1 for x in m if x['date'] >= '2024' and res(x) == t) for t in 'WL']
    after = [sum(1 for x in m[peak + 1:] if res(x) == t) for t in 'WL']
    tw = [0, 0, 0]
    for t in tours.values():
        gw = sum(res(g) == 'W' for g in t['games']); gl = sum(res(g) == 'L' for g in t['games'])
        t['winner'] = 'a' if gw > gl else 'b' if gl > gw else 'd'
        tw['abd'.index(t['winner'])] += 1
    return dict(s=s, lead=lead, peak=peak, peak_date=m[peak]['date'], years=years, grid=grid, gridres=gridres, after_peak=after, tour_wins=tw, margins=margins,
                streak=[streak('W'), streak('L')], series=[sum(a > b for a, b in ser.values()), sum(b > a for a, b in ser.values())],
                one=one, ot=ot, tours=list(tours.values()), since2024=since, matches=m)

def player():
    d = load(A); years = collections.OrderedDict(); opp = []; games = []
    for o in d['opponents'].values():
        s = o['summary']
        opp.append(dict(name=o['player']['name'], id=o['player']['id'], g=s['total_matches'], w=s['wins_player'], d=s['draws'], l=s['wins_opponent'], gf=s['goals_for_player'], ga=s['goals_for_opponent'], last=s['last_meeting_date']))
        for x in o['matches']:
            games.append((x['date'], res(x), x['tournament_id']))
    for dt, r, _ in sorted(games):
        y = years.setdefault(dt[:4], {'W': 0, 'D': 0, 'L': 0}); y[r] += 1
    opp.sort(key=lambda o: -o['g'])
    return dict(years=years, opp=opp, games=len(games), w=sum(o['w'] for o in opp), d=sum(o['d'] for o in opp), l=sum(o['l'] for o in opp),
                gf=sum(o['gf'] for o in opp), ga=sum(o['ga'] for o in opp), tours=len({g[2] for g in games}), first=min(g[0] for g in games))

def rivalries(n=6):
    pairs = []
    for f in glob.glob(f'{ROOT}/h2h/*.json'):
        d = json.load(open(f)); pid = d['player']['id']
        for oid, o in d['opponents'].items():
            if pid < int(oid):
                s = o['summary']
                pairs.append(dict(a=d['player']['name'], b=o['player']['name'], g=s['total_matches'], w=s['wins_player'], d=s['draws'], l=s['wins_opponent'], last=s['last_meeting_date']))
    pairs.sort(key=lambda p: -p['g'])
    return pairs[:n]
