"""Tournament pages: one compact JSON file per tournament, built from every retained game.

Each file holds the tournament's details, round-robin standings per group, playoff brackets
worked out from the series themselves (with every playoff game), and the biggest upsets by
pre-game rating.
Sources number playoff rounds differently (fractions, per-round stages, plain counters), so
brackets are rebuilt from who beat whom rather than from round numbers.
"""

from __future__ import annotations

import html
import math
import re
import unicodedata
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd

ELO_START = 1500.0
ELO_K = 24.0
# A rating needs this many earlier games before an upset involving it is counted.
UPSET_MIN_GAMES = 30
UPSET_MIN_GAP = 100
UPSET_LIMIT = 5

_PLAYOFF_WORDS = (
    "playoff", "knockout", "elimination", "bracket", "final", "semi", "quarter",
    "round of", "1/",
)
_SECONDARY_BRACKET_RE = re.compile(
    r"^\s*([b-h])\s*[-\s]?\s*(?:playoff|slutspel|sluttspill)", re.IGNORECASE
)
# Playoff rounds named in the stage (ASCII-folded), earliest first. Checked in this order, so
# "semifinal" and "kvartsfinal" are matched before plain "final".
_ROUND_NAME_RANKS = [
    (re.compile(r"1/64|64-del|round of 128"), 1 / 64),
    (re.compile(r"1/32|32-del|round of 64"), 1 / 32),
    (re.compile(r"1/16|16-del|sextondel|round of 32"), 1 / 16),
    (re.compile(r"1/8|8-del|attondel|round of 16|eighth"), 1 / 8),
    (re.compile(r"kvarts|quarter|1/4|ceturtdal"), 1 / 4),
    (re.compile(r"semi|1/2|pusfin"), 1 / 2),
    (re.compile(r"brons|bronze|third|3rd|tredje"), 0.9),
    (re.compile(r"final|finals"), 1.0),
]


def _plain(value: object) -> str:
    text = "" if value is None or (isinstance(value, float) and math.isnan(value)) else str(value)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return text.strip().lower()


def classify_stage(stage_type: object, stage: object, tournament_name: object) -> str:
    """'playoff' or 'round-robin', mirroring normalizeStageType in public/js/utils.js."""
    text = _plain(stage_type).replace("_", "-")
    if text == "playoff":
        return "playoff"
    if text in ("round-robin", "round robin", "roundrobin"):
        return "round-robin"
    stage_text = _plain(stage)
    if "team" in stage_text or "team" in _plain(tournament_name):
        return "round-robin"
    if any(word in stage_text for word in _PLAYOFF_WORDS):
        return "playoff"
    return "round-robin"


def playoff_round_rank(stage: object, round_value: object) -> float:
    """Sort key for when a playoff round was played: a round named in the stage, else the
    source's round number (fractions like 0.125 for a 1/8 final, or a plain counter)."""
    text = _plain(stage)
    for pattern, rank in _ROUND_NAME_RANKS:
        if pattern.search(text):
            return rank
    try:
        value = float(round_value)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if math.isnan(value) else value


def compute_pre_game_ratings(matches: pd.DataFrame) -> pd.DataFrame:
    """Elo rating and games played for both players before each game, in playing order."""
    round_column = "round_value" if "round_value" in matches else "round_number"
    order = matches.sort_values(
        ["date_dt", "tournament_id", "stage_sequence", "stage_id", round_column,
         "playoff_game_number"],
        kind="mergesort",
        na_position="last",
    ).index
    p1 = matches.loc[order, "player1_id"].astype("int64").tolist()
    p2 = matches.loc[order, "player2_id"].astype("int64").tolist()
    g1 = matches.loc[order, "goals_player1"].astype("int64").tolist()
    g2 = matches.loc[order, "goals_player2"].astype("int64").tolist()
    count = len(order)
    elo1 = [0.0] * count
    elo2 = [0.0] * count
    games1 = [0] * count
    games2 = [0] * count
    rating: Dict[int, float] = {}
    played: Dict[int, int] = {}
    for i in range(count):
        a, b = p1[i], p2[i]
        ra = rating.get(a, ELO_START)
        rb = rating.get(b, ELO_START)
        elo1[i], elo2[i] = ra, rb
        games1[i], games2[i] = played.get(a, 0), played.get(b, 0)
        expected = 1.0 / (1.0 + 10.0 ** ((rb - ra) / 400.0))
        score = 1.0 if g1[i] > g2[i] else 0.0 if g1[i] < g2[i] else 0.5
        change = ELO_K * (score - expected)
        rating[a] = ra + change
        rating[b] = rb - change
        played[a] = games1[i] + 1
        played[b] = games2[i] + 1
    return pd.DataFrame(
        {"elo1": elo1, "elo2": elo2, "games1": games1, "games2": games2}, index=order
    )


class _UnionFind:
    def __init__(self) -> None:
        self.parent: Dict[int, int] = {}

    def find(self, item: int) -> int:
        self.parent.setdefault(item, item)
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, a: int, b: int) -> None:
        self.parent[self.find(a)] = self.find(b)


def _components(pairs: Iterable[Tuple[int, int]]) -> List[set]:
    uf = _UnionFind()
    for a, b in pairs:
        uf.union(a, b)
    groups: Dict[int, set] = {}
    for item in list(uf.parent):
        groups.setdefault(uf.find(item), set()).add(item)
    return list(groups.values())


def build_standings(games: List[dict]) -> List[dict]:
    """Round-robin groups (players linked by games), each with a standings table.

    Two points for a win, one for a draw; ties broken by goal difference, then goals scored.
    """
    groups = _components((g["p1"], g["p2"]) for g in games)
    result = []
    for members in groups:
        rows = {pid: {"id": pid, "p": 0, "w": 0, "d": 0, "l": 0, "gf": 0, "ga": 0}
                for pid in members}
        for g in games:
            if g["p1"] not in members:
                continue
            for pid, gf, ga in ((g["p1"], g["g1"], g["g2"]), (g["p2"], g["g2"], g["g1"])):
                row = rows[pid]
                row["p"] += 1
                row["gf"] += gf
                row["ga"] += ga
                row["w" if gf > ga else "l" if gf < ga else "d"] += 1
        table = []
        for row in rows.values():
            row["pts"] = row["w"] * 2 + row["d"]
            table.append(row)
        table.sort(key=lambda r: (-r["pts"], -(r["gf"] - r["ga"]), -r["gf"], r["id"]))
        result.append(table)
    result.sort(key=lambda t: (-len(t), t[0]["id"] if t else 0))
    return result


def _round_name(depth: int) -> str:
    if depth == 0:
        return "Final"
    if depth == 1:
        return "Semifinals"
    if depth == 2:
        return "Quarterfinals"
    return f"Round of {2 ** (depth + 1)}"


def build_brackets(series: List[dict], stage_names: Dict[object, str]) -> List[dict]:
    """Group playoff series into brackets and name their rounds.

    A bracket is a set of players linked by series. Walking the series in playing order, a
    series is on the main path when neither player has lost a series yet; the champion is the
    one main-path player who never loses. Rounds count back from the final (0): a series is
    one round before the next main-path series its winner played. Other series (third place,
    placement) are listed separately.
    """
    brackets = []
    for members in _components((s["a"], s["b"]) for s in series):
        items = sorted((s for s in series if s["a"] in members), key=lambda s: s["order"])
        lost: set = set()
        for s in items:
            s["main"] = s["a"] not in lost and s["b"] not in lost
            if s["winner"] is not None:
                lost.add(s["b"] if s["winner"] == s["a"] else s["a"])
        main = [s for s in items if s["main"] and s["winner"] is not None]
        unbeaten = {s["winner"] for s in main} - lost
        champion = next(iter(unbeaten)) if len(unbeaten) == 1 else None
        runner_up = None
        if champion is not None:
            final = [s for s in main if champion in (s["a"], s["b"])][-1]
            runner_up = final["b"] if final["a"] == champion else final["a"]
        # Walk back from the end: a series is one round before the next one its winner played.
        next_depth: Dict[int, int] = {}
        for s in reversed(main):
            following = next_depth.get(s["winner"])
            s["depth"] = 0 if following is None else following + 1
            next_depth[s["a"]] = s["depth"]
            next_depth[s["b"]] = s["depth"]
        rounds: Dict[int, list] = {}
        other = []
        for s in items:
            if not s["main"] or s["winner"] is None:
                other.append(s)
                continue
            rounds.setdefault(s["depth"], []).append(s)
        names = {stage_names.get(s["stage"], "") for s in items}
        prefix = next((m.group(1).upper() for m in map(_SECONDARY_BRACKET_RE.match, names) if m),
                      None)
        brackets.append({
            "label": f"{prefix}-Playoff" if prefix else "Playoff",
            "secondary": prefix is not None,
            "champion": champion,
            "runner_up": runner_up,
            "rounds": [
                {"name": _round_name(depth), "series": [_series_out(s) for s in rounds[depth]]}
                for depth in sorted(rounds, reverse=True)
            ],
            "other": [_series_out(s) for s in other],
            "_size": len(items),
            "_first": min(s["order"] for s in items),
        })
    brackets.sort(key=lambda b: (b["secondary"], -b["_size"], b["_first"]))
    for bracket in brackets:
        del bracket["_size"], bracket["_first"]
    if len(brackets) > 1 and not any(b["secondary"] for b in brackets[1:]):
        for index, bracket in enumerate(brackets[1:], start=2):
            bracket["label"] = f"Playoff {index}"
    return brackets


def _series_out(s: dict) -> list:
    """[player a, player b, wins a, wins b, [[goals a, goals b, overtime], ...]]."""
    return [s["a"], s["b"], s["wins_a"], s["wins_b"],
            [[g1, g2, 1 if ot else 0] for g1, g2, ot in s["games"]]]


def _series_from_games(games: List[dict]) -> List[dict]:
    by_key: Dict[tuple, dict] = {}
    for g in games:
        a, b = sorted((g["p1"], g["p2"]))
        key = (g["stage"], a, b)
        if key not in by_key:
            by_key[key] = {"stage": g["stage"], "a": a, "b": b, "order": g["order"],
                           "wins_a": 0, "wins_b": 0, "games": []}
        s = by_key[key]
        ga, gb = (g["g1"], g["g2"]) if g["p1"] == a else (g["g2"], g["g1"])
        s["games"].append((ga, gb, g["ot"]))
        if ga > gb:
            s["wins_a"] += 1
        elif gb > ga:
            s["wins_b"] += 1
    for s in by_key.values():
        s["winner"] = (s["a"] if s["wins_a"] > s["wins_b"]
                       else s["b"] if s["wins_b"] > s["wins_a"] else None)
    return list(by_key.values())


def _natural(text: str) -> list:
    return [(0, int(part), "") if part.isdigit() else (1, 0, part.lower())
            for part in re.split(r"(\d+)", text or "") if part]


def _clean(value: object) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)) or value is pd.NA:
        return ""
    return html.unescape(str(value)).strip()


def _opt_int(value: object) -> Optional[int]:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(number) else int(number)


_ROW_COLUMNS = [
    "tournament_id", "tournament_name", "tournament_level", "tournament_url", "source", "date",
    "stage", "stage_id", "stage_sequence", "kind_", "player1_id", "player2_id",
    "goals_player1", "goals_player2", "overtime", "elo1", "elo2", "games1", "games2",
]


def prepare_rows(frame: pd.DataFrame) -> pd.DataFrame:
    """Games with a stage kind and playing order, sorted by tournament then playing order."""
    frame = frame.copy()
    if "round_value" not in frame:
        frame["round_value"] = pd.to_numeric(frame["round_number"], errors="coerce")
    for column, default in (("elo1", np.nan), ("elo2", np.nan), ("games1", 0), ("games2", 0)):
        if column not in frame:
            frame[column] = default
    kinds: Dict[tuple, str] = {}
    ranks: Dict[tuple, float] = {}
    kind_values = []
    rank_values = []
    # .tolist() first: iterating pandas extension arrays element by element is very slow.
    for stage_type, stage, name, round_value in zip(
        frame["stage_type"].tolist(), frame["stage"].tolist(),
        frame["tournament_name"].tolist(), frame["round_value"].tolist(),
    ):
        key = (stage_type, stage, name)
        kind = kinds.get(key)
        if kind is None:
            kind = kinds[key] = classify_stage(stage_type, stage, name)
        rank = 0.0
        if kind == "playoff":
            rank_key = (stage, round_value)
            rank = ranks.get(rank_key)
            if rank is None:
                rank = ranks[rank_key] = playoff_round_rank(stage, round_value)
        kind_values.append(kind)
        rank_values.append(rank)
    frame["kind_"] = kind_values
    frame["rank_"] = rank_values
    return frame.sort_values(
        ["tournament_id", "stage_sequence", "rank_", "stage_id", "round_value",
         "playoff_game_number", "date"],
        kind="mergesort",
        na_position="last",
    )


def build_tournament_payload(
    tournament_id: int,
    rows: list,
    names: Dict[int, str],
    linked_ids: set,
    details: Optional[dict] = None,
) -> dict:
    """The JSON for one tournament page. `rows` are tuples in _ROW_COLUMNS order, in playing
    order, as prepare_rows sorts them."""
    details = details or {}
    (_, tournament_name, level, tournament_url, source, *_rest) = rows[0]
    tournament_name = _clean(tournament_name)
    stages: Dict[object, dict] = {}
    games: List[dict] = []
    dates = []
    for order, row in enumerate(rows):
        (_, _, _, _, _, date, stage, stage_id, stage_sequence, kind, p1, p2, g1, g2, ot,
         elo1, elo2, games1, games2) = row
        if isinstance(date, str) and date:
            dates.append(date)
        stage_id = _opt_int(stage_id)
        stage_key = (stage_id if stage_id is not None else _clean(stage) or "stage", kind)
        if stage_key not in stages:
            stages[stage_key] = {
                "key": stage_key,
                "name": _clean(stage),
                "type": kind,
                "seq": _opt_int(stage_sequence),
                "games": [],
            }
        game = {
            "stage": stage_key,
            "order": order,
            "p1": int(p1),
            "p2": int(p2),
            "g1": int(g1),
            "g2": int(g2),
            "ot": bool(ot),
            "elo1": None if elo1 is None or elo1 != elo1 else float(elo1),
            "elo2": None if elo2 is None or elo2 != elo2 else float(elo2),
            "games1": int(games1 or 0),
            "games2": int(games2 or 0),
        }
        stages[stage_key]["games"].append(game)
        games.append(game)

    # Stages run in sequence order; parallel stages (Group 1, Group 2, ...) by name.
    ordered_stages = sorted(
        stages.values(),
        key=lambda s: (s["seq"] if s["seq"] is not None else 1_000_000, _natural(s["name"]),
                       s["games"][0]["order"]),
    )
    stage_names = {s["key"]: s["name"] for s in ordered_stages}
    round_robin = []
    for stage in ordered_stages:
        if stage["type"] != "round-robin":
            continue
        round_robin.append({
            "name": stage["name"] or "Round-robin",
            "groups": build_standings(stage["games"]),
        })
    playoff_games = [g for s in ordered_stages if s["type"] == "playoff" for g in s["games"]]
    brackets = build_brackets(_series_from_games(playoff_games), stage_names)

    champion = runner_up = None
    main_bracket = next((b for b in brackets if not b["secondary"]), None)
    if main_bracket:
        champion, runner_up = main_bracket["champion"], main_bracket["runner_up"]
    elif round_robin and len(round_robin[-1]["groups"]) == 1:
        table = round_robin[-1]["groups"][0]
        champion = table[0]["id"] if table else None
        runner_up = table[1]["id"] if len(table) > 1 else None

    upsets = []
    for g in games:
        if g["g1"] == g["g2"] or g["elo1"] is None:
            continue
        if min(g["games1"], g["games2"]) < UPSET_MIN_GAMES:
            continue
        p1_won = g["g1"] > g["g2"]
        winner_elo, loser_elo = (g["elo1"], g["elo2"]) if p1_won else (g["elo2"], g["elo1"])
        gap = loser_elo - winner_elo
        if gap < UPSET_MIN_GAP:
            continue
        winner, loser = (g["p1"], g["p2"]) if p1_won else (g["p2"], g["p1"])
        gw, gl = (g["g1"], g["g2"]) if p1_won else (g["g2"], g["g1"])
        upsets.append({
            "winner": winner, "loser": loser, "score": [gw, gl], "ot": g["ot"],
            "stage": stage_names.get(g["stage"], ""), "gap": int(round(gap)),
            "winner_rating": int(round(winner_elo)), "loser_rating": int(round(loser_elo)),
        })
    upsets.sort(key=lambda u: -u["gap"])

    player_ids = sorted({g["p1"] for g in games} | {g["p2"] for g in games})
    dates.sort()
    url = _clean(details.get("url")) or _clean(tournament_url)
    return {
        "id": int(tournament_id),
        "name": tournament_name or _clean(details.get("name")) or f"Tournament {tournament_id}",
        "date": _clean(details.get("date")) or (dates[0] if dates else ""),
        "end_date": _clean(details.get("end_date")) or (dates[-1] if dates else ""),
        "level": _clean(level) or None,
        "city": _clean(details.get("city")),
        "country": _clean(details.get("country")),
        "url": url if url.startswith(("https://", "http://")) else "",
        "source": _clean(source) or "th.sportscorpion.com",
        "games": len(games),
        "goals": int(sum(g["g1"] + g["g2"] for g in games)),
        "champion": champion,
        "runner_up": runner_up,
        "players": {str(pid): names.get(pid) or f"Player {pid}" for pid in player_ids},
        "linked": [pid for pid in player_ids if pid in linked_ids],
        "round_robin": round_robin,
        "brackets": brackets,
        "upsets": upsets[:UPSET_LIMIT],
    }


def _group_rows(frame: pd.DataFrame):
    """(tournament id, row tuples) for each tournament in a prepare_rows frame."""
    current = None
    rows: list = []
    for row in zip(*(frame[column].tolist() for column in _ROW_COLUMNS)):
        tid = int(row[0])
        if tid != current:
            if rows:
                yield current, rows
            current, rows = tid, []
        rows.append(row)
    if rows:
        yield current, rows


def payload_from_frame(tournament_id, frame, names, linked_ids, details=None) -> dict:
    """build_tournament_payload for a frame of one tournament's games, in any order."""
    prepared = prepare_rows(frame)
    rows = list(zip(*(prepared[column].tolist() for column in _ROW_COLUMNS)))
    return build_tournament_payload(tournament_id, rows, names, linked_ids, details)


def load_tournament_details(metadata_path) -> Dict[int, dict]:
    """Date, place and source link per tournament from the scraper's metadata CSV."""
    try:
        frame = pd.read_csv(metadata_path)
    except (FileNotFoundError, OSError):
        return {}
    columns = {"TournamentID", "Name", "Date", "EndDate", "City", "Country", "DetailURL"}
    if not columns.issubset(frame.columns):
        return {}
    details = {}
    for row in frame[list(columns)].itertuples(index=False):
        tid = _opt_int(row.TournamentID)
        if tid is None:
            continue
        details[tid] = {
            "name": _clean(row.Name),
            "date": _clean(row.Date)[:10],
            "end_date": _clean(row.EndDate)[:10],
            "city": _clean(row.City),
            "country": _clean(row.Country),
            "url": _clean(row.DetailURL),
        }
    return details


# Tournaments share files by id % TOURNAMENT_BUCKETS, keeping the deployment well under
# Cloudflare Pages' per-site file limit. public/js/tournament-page.js and
# functions/tournament.js read the same buckets.
TOURNAMENT_BUCKETS = 1000


def tournament_bucket(tournament_id: int) -> int:
    return int(tournament_id) % TOURNAMENT_BUCKETS


def build_tournament_files(
    matches: pd.DataFrame,
    names: Dict[int, str],
    linked_ids: set,
    details: Dict[int, dict],
    write,
    out_dir,
) -> List[dict]:
    """Write data/t/{bucket}.json files ({id: tournament}); return the index entries."""
    frame = matches.loc[matches["tournament_id"].notna()]
    frame = prepare_rows(frame.join(compute_pre_game_ratings(frame)))
    index = []
    buckets: Dict[int, dict] = {}
    for tournament_id, rows in _group_rows(frame):
        payload = build_tournament_payload(
            tournament_id, rows, names, linked_ids, details.get(tournament_id)
        )
        buckets.setdefault(tournament_bucket(tournament_id), {})[str(tournament_id)] = payload
        index.append({
            "id": payload["id"],
            "name": payload["name"],
            "date": payload["date"],
            "level": payload["level"],
            "country": payload["country"],
            "games": payload["games"],
            "players": len(payload["players"]),
            "champion": payload["champion"],
        })
    for bucket, payloads in buckets.items():
        write(out_dir / f"{bucket}.json", payloads)
    index.sort(key=lambda t: (t["date"] or "", t["id"]), reverse=True)
    return index
