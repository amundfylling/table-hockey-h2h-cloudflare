#!/usr/bin/env python3
"""Match the site's tournament pages to tournaments in the ITHF world ranking.

Writes data/ithf-tournaments.json, which the build reads (tournaments.load_ithf_tournaments)
to link each tournament page to its ITHF page and to take the champion from the ITHF final
table when the site's own games name someone else.

Run it after a build, since it reads the built pages in public/data/t/:

    pip install rapidfuzz unidecode
    python3 scripts/ithf_match.py            # fetch what is new and rewrite the file
    python3 scripts/ithf_match.py --offline  # only use what is already in .cache/ithf/

Matching: an ITHF tournament and a site page pair up when they are within MAX_DAYS of each
other and most of their players are the same (names compared without accents and in any word
order, fuzzily for transliterations). Name, country, round number, team vs individual and
World vs European Championships break ties. A site page that holds part of an event the
ITHF lists once (a group stage on one source and the playoff on another) is linked too, as a
non-main page.
"""
import argparse
import collections
import datetime as dt
import html
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

try:
    from rapidfuzz import fuzz, process
    from unidecode import unidecode
except ImportError:  # pragma: no cover - a tool, not part of the build
    sys.exit("Install the matching tools first: pip install rapidfuzz unidecode")

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "ithf"
SITE = ROOT / "public" / "data" / "t"
OUT = ROOT / "data" / "ithf-tournaments.json"
BASE = "https://stiga.trefik.cz/ithf/ranking/"
FIRST_YEAR = 1972
MAX_DAYS = 5
HEADERS = {"User-Agent": "h2h-ithf-match/1.0"}
# Individual World and European Championship series (all classes): always fetched.
CHAMPIONSHIP_SERIES = {"1", "8", "10", "11", "12", "18", "19", "20", "44", "45", "46", "47",
                       "53", "54", "55", "56"}
COUNTRIES = {
    "NOR": "norway", "SWE": "sweden", "FIN": "finland", "RUS": "russia", "LAT": "latvia",
    "EST": "estonia", "UKR": "ukraine", "BLR": "belarus", "CZE": "czechia", "GER": "germany",
    "SUI": "switzerland", "AUT": "austria", "DEN": "denmark", "SVK": "slovakia",
    "HUN": "hungary", "SLO": "slovenia", "LTU": "lithuania", "USA": "usa", "CAN": "canada",
    "POL": "poland", "FRA": "france", "ITA": "italy", "KAZ": "kazakhstan", "ISR": "israel",
    "GBR": "great britain",
}
COUNTRY_ALIASES = {"czech republic": "czechia", "united states": "usa"}
STOP_WORDS = set("open cup tournament turnering championship championships of the stiga "
                 "table hockey th bordshockey".split())
TEAM_RE = re.compile(r"\b(teams?|lag|lagturnering|lag-?sm|lag-?vm|lag-?em|joukkue|komand"
                     r"|команд\w*|parturnering|doubles|pairs?|par)\b", re.I)


def _text(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).replace("\xa0", " ").strip()


def person_key(name: str) -> str:
    """A name without accents, case, punctuation or word order."""
    name = unidecode(name or "").lower().replace("'", "")
    return " ".join(sorted(re.sub(r"[^a-z ]", " ", name).split()))


def _title_key(name: str) -> str:
    name = re.sub(r"[^a-z ]", " ", unidecode(name or "").lower())
    return " ".join(w for w in name.split() if w not in STOP_WORDS)


def _is_team(name: str) -> bool:
    return bool(TEAM_RE.search(unidecode(name or "")) or TEAM_RE.search(name or ""))


def _championship(name: str) -> str:
    name = unidecode(name or "").lower()
    if re.search(r"\b(vm|world champ\w*|chempionat mira|mm)\b", name):
        return "wc"
    if re.search(r"\b(em|europe\w* champ\w*|chempionat evropy)\b", name):
        return "ec"
    return ""


def _round_numbers(name: str) -> set:
    return {int(v) for v in re.findall(r"(?<![\d/])(\d{1,3})(?![\d/])", name or "")}


# ---- ITHF calendar and final tables -------------------------------------------------------

def _form(page: str) -> dict:
    return {m.group(1): html.unescape(m.group(2)) for m in re.finditer(
        r'<input type="hidden" name="([^"]+)" id="[^"]+" value="([^"]*)"', page)}


def fetch_calendar(offline: bool) -> list:
    """Every tournament in the ranking calendar, one cached page per year. The current and
    previous year are fetched again unless offline."""
    CACHE.mkdir(parents=True, exist_ok=True)
    this_year = dt.date.today().year
    session = requests.Session()
    session.headers.update(HEADERS)
    page = None
    for year in range(FIRST_YEAR, this_year + 1):
        path = CACHE / f"cal_{year}.html"
        if offline or (path.exists() and year < this_year - 1):
            continue
        if page is None:
            page = session.get(BASE + "calendar.aspx", timeout=60).text
        form = _form(page)
        form.update({"DLSinceM": "1", "DLSinceY": str(year), "DLTillM": "12",
                     "DLTillY": str(year), "butDate": "Select period", "DLCountry": "0",
                     "DLSerial": "1,5"})
        page = session.post(BASE + "calendar.aspx", data=form, timeout=180).text
        path.write_text(page, encoding="utf-8")
        time.sleep(1)
    rows = []
    for path in sorted(CACHE.glob("cal_*.html")):
        page = path.read_text(encoding="utf-8", errors="replace")
        for tr in re.findall(r'<tr>(<td class="Norm">\d\d\.\d\d\.\d{4}.*?)</tr>', page, re.S):
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            date = _text(tds[0])
            place = _text(tds[3])
            country = re.search(r"\(([A-Z]{3})\)\s*$", place)
            count = _text(tds[6])
            rows.append({
                "id": int(re.search(r"tournament.aspx\?id=(\d+)", tds[1]).group(1)),
                "date": f"{date[6:10]}-{date[3:5]}-{date[0:2]}",
                "name": _text(tds[1]),
                "place": place,
                "cc": country.group(1) if country else "",
                "series": re.findall(r'serial.aspx\?id=(\d+)"', tds[4]),
                "players": int(count) if count.isdigit() else 0,
            })
    return rows


def _final_table(session: requests.Session, ithf_id: int) -> dict:
    for attempt in range(4):
        try:
            page = session.get(f"{BASE}tournament.aspx?id={ithf_id}", timeout=60).text
        except requests.RequestException:
            time.sleep(3 * (attempt + 1))
            continue
        rows = []
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
            player = re.search(r"player.aspx\?id=(\d+)", tr)
            tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
            if not player or len(tds) < 6:
                continue
            place = _text(tds[0]).rstrip(".")
            if place[:1].isdigit():
                rows.append([place, int(player.group(1)), _text(tds[3])])
        return {"id": ithf_id, "rows": rows}
    return {"id": ithf_id, "error": True}


def fetch_final_tables(ids: set, offline: bool) -> dict:
    """ITHF final tables by tournament id, cached in details.jsonl."""
    path = CACHE / "details.jsonl"
    tables = {}
    if path.exists():
        for line in path.open(encoding="utf-8"):
            item = json.loads(line)
            if not item.get("error"):
                tables[item["id"]] = item
    todo = sorted(ids - set(tables))
    if todo and not offline:
        print(f"Fetching {len(todo)} ITHF final tables...")
        session = requests.Session()
        session.headers.update(HEADERS)
        with path.open("a", encoding="utf-8") as out, ThreadPoolExecutor(4) as pool:
            for item in pool.map(lambda i: _final_table(session, i), todo):
                out.write(json.dumps(item, ensure_ascii=False) + "\n")
                if not item.get("error"):
                    tables[item["id"]] = item
    return tables


# ---- Matching -----------------------------------------------------------------------------

def load_site() -> dict:
    pages = {}
    for path in SITE.glob("*.json"):
        for page in json.loads(path.read_text(encoding="utf-8")).values():
            if page.get("name"):
                page.pop("upsets", None)
                pages[page["id"]] = page
    return pages


def map_players(site_names: dict, rows: list) -> dict:
    """ITHF table row index -> site player id (as a string), exact names first."""
    by_key = collections.defaultdict(list)
    for pid, key in site_names.items():
        by_key[key].append(pid)
    used, mapping, rest = set(), {}, []
    for index, row in enumerate(rows):
        free = [pid for pid in by_key.get(person_key(row[2]), []) if pid not in used]
        if free:
            mapping[index] = free[0]
            used.add(free[0])
        else:
            rest.append(index)
    left = {pid: key for pid, key in site_names.items() if pid not in used}
    for index in rest:
        if not left:
            break
        # The top two decide the champion, so they get a looser look (Alexey / Aleksei).
        cutoff = 75 if rows[index][0] in ("1", "2") else 82
        best = process.extractOne(person_key(rows[index][2]), left,
                                  scorer=fuzz.token_sort_ratio, score_cutoff=cutoff)
        if best:
            mapping[index] = best[2]
            left.pop(best[2])
    return mapping


def _date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def candidates(pages: dict, calendar: list):
    by_day = collections.defaultdict(list)
    for item in calendar:
        by_day[item["date"]].append(item)
    for page in pages.values():
        start = _date(page["date"])
        end = _date(page["end_date"]) if page.get("end_date") else start
        for offset in range(-MAX_DAYS, (end - start).days + MAX_DAYS + 1):
            for item in by_day.get(str(start + dt.timedelta(offset)), []):
                yield page, item


def match(pages: dict, calendar: list, tables: dict) -> list:
    site_names = {tid: {pid: person_key(n) for pid, n in p["players"].items()}
                  for tid, p in pages.items()}
    scored = []
    for page, item in candidates(pages, calendar):
        rows = tables.get(item["id"], {}).get("rows")
        site_count = len(page["players"])
        if not rows or not site_count:
            continue
        mapping = map_players(site_names[page["id"]], rows)
        overlap = len(mapping) / min(site_count, len(rows))
        jaccard = len(mapping) / (site_count + len(rows) - len(mapping))
        score = 5 * overlap + 4 * jaccard
        if _is_team(page["name"]) != _is_team(item["name"]):
            score -= 6
        kind_a, kind_b = _championship(page["name"]), _championship(item["name"])
        if kind_a and kind_b and kind_a != kind_b:
            score -= 6
        country = (page.get("country") or "").lower()
        country = COUNTRY_ALIASES.get(country, country)
        if country and item["cc"] in COUNTRIES:
            score += 1 if COUNTRIES[item["cc"]] == country else -2
        score += 2 * fuzz.token_set_ratio(_title_key(page["name"]), _title_key(item["name"])) / 100
        nums_a, nums_b = _round_numbers(page["name"]), _round_numbers(item["name"])
        if nums_a and nums_b:
            score += 1 if nums_a & nums_b else -3
        ithf_count = item["players"] or len(rows)
        bigger = max(site_count, ithf_count)
        score -= (2 * max(0, site_count - ithf_count) + 0.7 * max(0, ithf_count - site_count)) / bigger
        start = _date(page["date"])
        end = _date(page["end_date"]) if page.get("end_date") else start
        day = _date(item["date"])
        if not start <= day <= end:
            score -= 0.4 * min(abs((day - start).days), abs((day - end).days))
        scored.append((score, page["id"], item["id"], overlap, mapping))
    scored.sort(key=lambda s: -s[0])
    used_pages, used_ithf, pairs = set(), set(), []
    for score, page_id, ithf_id, overlap, mapping in scored:
        if page_id in used_pages or ithf_id in used_ithf:
            continue
        if overlap < 0.5 or score < (2.5 if overlap >= 0.85 else 5):
            continue
        if pages[page_id].get("part_of"):  # a fragment; its full page holds the event
            continue
        used_pages.add(page_id)
        used_ithf.add(ithf_id)
        pairs.append((page_id, ithf_id, True, mapping))
    calendar_by_id = {item["id"]: item for item in calendar}
    for _score, page_id, ithf_id, overlap, mapping in scored:
        if page_id in used_pages or ithf_id not in used_ithf or overlap < 0.8:
            continue
        if _is_team(pages[page_id]["name"]) or _is_team(calendar_by_id[ithf_id]["name"]):
            continue
        used_pages.add(page_id)
        pairs.append((page_id, ithf_id, False, mapping))
    return choose_main_pages(pages, pairs, tables)


def choose_main_pages(pages: dict, pairs: list, tables: dict) -> list:
    """When an event is spread over several site pages, make the page with the ITHF
    winner the main one: the one where they are champion, else one they played on."""
    by_event = collections.defaultdict(list)
    for pair in pairs:
        by_event[pair[1]].append(pair)
    out = []
    for ithf_id, group in by_event.items():
        rows = tables[ithf_id]["rows"]
        winner_rows = [i for i, row in enumerate(rows) if row[0] == "1"]

        def rank(pair):
            page_id, _, was_main, mapping = pair
            page = pages[page_id]
            winner = next((mapping[i] for i in winner_rows if i in mapping), None)
            return (page.get("part_of") is not None,
                    winner is None or str(page.get("champion")) != winner,
                    winner is None,
                    not was_main)
        best = min(group, key=rank)
        for pair in group:
            out.append((pair[0], ithf_id, pair is best, pair[3]))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--offline", action="store_true", help="use only cached ITHF pages")
    args = parser.parse_args()
    pages = load_site()
    if not pages:
        sys.exit(f"No built tournament pages in {SITE}; run scripts/build_h2h.py first.")
    calendar = fetch_calendar(args.offline)
    print(f"{len(calendar)} ITHF tournaments, {len(pages)} site pages.")
    wanted = {item["id"] for page, item in candidates(pages, calendar)}
    wanted |= {item["id"] for item in calendar if set(item["series"]) & CHAMPIONSHIP_SERIES}
    tables = fetch_final_tables(wanted, args.offline)
    calendar_by_id = {item["id"]: item for item in calendar}
    out = {}
    for page_id, ithf_id, main_page, mapping in match(pages, calendar, tables):
        rows = tables[ithf_id]["rows"]
        places = []
        for index, row in enumerate(rows):
            if row[0] not in ("1", "2"):
                continue
            site_pid = mapping.get(index)
            places.append([int(row[0]), row[1], row[2], int(site_pid) if site_pid else None])
        out[str(page_id)] = {
            "ithf": ithf_id,
            "name": calendar_by_id[ithf_id]["name"],
            "main": main_page,
            "places": places,
        }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    ordered = dict(sorted(out.items(), key=lambda kv: int(kv[0])))
    OUT.write_text(json.dumps(ordered, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    print(f"Wrote {len(ordered)} links ({sum(e['main'] for e in ordered.values())} main) "
          f"to {OUT.relative_to(ROOT)}.")


if __name__ == "__main__":
    main()
