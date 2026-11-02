"""Glicko-2 ratings with goal difference, updated game by game in playing order.

Each game updates both players straight away (not once per rating period). The score a
player gets from a game uses the goal difference, so a 7-1 win counts for more than a 3-2:
score = 1 / (1 + exp(-GOAL_SCALE * goal_difference)), 0.5 for a draw.

Rating deviation (RD) grows before each game by volatility^2 for the game itself plus
volatility^2 for every PERIOD_DAYS since the player's last game, so it widens with time away.

The settings were picked by a walk-forward backtest (tuned on 2017-2021 games, scored on
2022-2026): this model predicted results better than plain Elo, tuned Elo, goal-difference Elo
and plain Glicko-2, most of all for newer players and players coming back after a break.
"""

from __future__ import annotations

import math
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd

SCALE = 173.7178
START_RATING = 1500.0
START_RD = 350.0
START_VOLATILITY = 0.3
TAU = 1.5
PERIOD_DAYS = 7.0
GOAL_SCALE = 0.4
# Forecast for one game: win = sigmoid(FORECAST_BETA * x - FORECAST_CUT), loss mirrored, draw the
# rest, where x = g(combined RD) * rating gap + H2H_WEIGHT * pair edge. The pair edge is the
# pair's past results minus what the ratings expected, divided by (meetings + H2H_PRIOR_GAMES),
# so a long rivalry where one player keeps beating their rating shifts the forecast.
# Fitted on 2017-2021 games; on 2022-2026 the head-to-head term lowered log loss from 0.7549
# to 0.7534 (and from 0.8144 to 0.8119 for pairs with 10+ earlier meetings).
FORECAST_BETA = 2.1396
FORECAST_CUT = 0.2933
H2H_WEIGHT = 1.0947
H2H_PRIOR_GAMES = 20.0
_PHI_MAX = START_RD / SCALE
_EPSILON = 1e-6
_PI2 = math.pi ** 2


def _g(phi: float) -> float:
    return 1.0 / math.sqrt(1.0 + 3.0 * phi * phi / _PI2)


def _new_volatility(sigma: float, phi: float, v: float, delta: float) -> float:
    """Glickman's step 5 (Illinois method) for the new volatility."""
    a = math.log(sigma * sigma)
    tau2 = TAU * TAU
    phi2 = phi * phi
    delta2 = delta * delta

    def f(x: float) -> float:
        ex = math.exp(x)
        denom = phi2 + v + ex
        return ex * (delta2 - phi2 - v - ex) / (2.0 * denom * denom) - (x - a) / tau2

    low = a
    if delta2 > phi2 + v:
        high = math.log(delta2 - phi2 - v)
    else:
        k = 1
        while f(a - k * TAU) < 0:
            k += 1
        high = a - k * TAU
    f_low = f(low)
    f_high = f(high)
    for _ in range(60):
        if abs(high - low) <= _EPSILON:
            break
        mid = low + (low - high) * f_low / (f_high - f_low)
        f_mid = f(mid)
        if f_mid * f_high <= 0:
            low, f_low = high, f_high
        else:
            f_low /= 2.0
        high, f_high = mid, f_mid
    return math.exp(low / 2.0)


def _playing_order(matches: pd.DataFrame) -> pd.Index:
    round_column = "round_value" if "round_value" in matches else "round_number"
    return matches.sort_values(
        ["date_dt", "tournament_id", "stage_sequence", "stage_id", round_column,
         "playoff_game_number"],
        kind="mergesort",
        na_position="last",
    ).index


def _outcome_probabilities(x: float) -> Tuple[float, float, float]:
    win = 1.0 / (1.0 + math.exp(-(FORECAST_BETA * x - FORECAST_CUT)))
    loss = 1.0 / (1.0 + math.exp(-(-FORECAST_BETA * x - FORECAST_CUT)))
    return win, 1.0 - win - loss, loss


def compute_ratings(
    matches: pd.DataFrame,
    player_ids: Iterable[int],
    alias_groups: Iterable[Iterable[int]] = (),
) -> Dict[int, dict]:
    """Rating history for each id in player_ids (see compute_ratings_and_forecasts)."""
    return compute_ratings_and_forecasts(matches, player_ids, alias_groups)[0]


def compute_ratings_and_forecasts(
    matches: pd.DataFrame,
    player_ids: Iterable[int],
    alias_groups: Iterable[Iterable[int]] = (),
    pairs: Iterable[Tuple[int, int]] = (),
    today: Optional[pd.Timestamp] = None,
    nations: Optional[Dict[int, str]] = None,
    pair_stats: Optional[Dict[Tuple[int, int], List[float]]] = None,
) -> Tuple[Dict[int, dict], Dict[Tuple[int, int], List[float]]]:
    """Rating history for each id in player_ids, one point per tournament they played, and
    a [win, draw, loss] forecast (first player's side) for each (a, b) in pairs if they met
    on `today` (default: the day after the last game).

    Every game counts, including games against players who get no page. Ids in one alias
    group share a single rating, stored under each of the group's ids.

    With `nations` (player id -> nation name), each rating also gets a `nations` list: the
    player's results against each opponent nation next to what the ratings expected before
    each game (see _nation_rows).

    With a `pair_stats` dict, it is filled for each (a, b) in pairs with a's results against b
    next to what the ratings expected: [games, points, expected points, variance], points
    counting a win as 1 and a draw as 0.5 (the same terms as the nation rows).
    """
    canonical: Dict[int, int] = {}
    for group in alias_groups:
        ids = [int(pid) for pid in group]
        for pid in ids:
            canonical[pid] = ids[0]
    nation_of: Dict[int, str] = {}
    for pid, nation in (nations or {}).items():
        if nation:
            nation_of.setdefault(canonical.get(int(pid), int(pid)), nation)

    order = _playing_order(matches)
    rows = matches.loc[order]
    p1 = rows["player1_id"].astype("int64").tolist()
    p2 = rows["player2_id"].astype("int64").tolist()
    g1 = rows["goals_player1"].astype("int64").tolist()
    g2 = rows["goals_player2"].astype("int64").tolist()
    days = ((rows["date_dt"] - pd.Timestamp("1970-01-01")).dt.days).tolist()
    # Missing dates and names become None so the JSON stays valid (no bare NaN).
    dates = [value if isinstance(value, str) and value else None for value in rows["date"]]
    names = [
        value if isinstance(value, str) and value else None for value in rows["tournament_name"]
    ]
    tournaments = rows["tournament_id"].astype("Int64").tolist()

    wanted = {int(pid) for pid in player_ids}
    tracked = {canonical.get(pid, pid) for pid in wanted}
    mu: Dict[int, float] = {}
    phi: Dict[int, float] = {}
    sigma: Dict[int, float] = {}
    last_day: Dict[int, int] = {}
    games: Dict[int, int] = {}
    # Per tracked player: [event key, date, rating, rd, games] points, the last one still open.
    history: Dict[int, List[list]] = {}
    # Per pair (low id, high id), for the low id: [results minus expected, meetings,
    # expected points, variance of the points].
    pair_edge: Dict[Tuple[int, int], List[float]] = {}
    # Per tracked player and opponent nation ("" when unknown):
    # [games, wins, draws, losses, expected points, variance of the points].
    by_nation: Dict[int, Dict[str, List[float]]] = {}

    for i in range(len(p1)):
        a = canonical.get(p1[i], p1[i])
        b = canonical.get(p2[i], p2[i])
        if a == b:
            continue
        day = days[i]
        if day != day:  # NaN date: keep the order but skip time-based widening
            day = None
        pre = []
        for pid in (a, b):
            ph = phi.get(pid, _PHI_MAX)
            if pid in last_day:
                sg = sigma[pid]
                elapsed = 0 if day is None or last_day[pid] is None else max(
                    0, day - last_day[pid]
                )
                ph = min(_PHI_MAX, math.sqrt(ph * ph + sg * sg * (1.0 + elapsed / PERIOD_DAYS)))
            pre.append(ph)
        mu_a, mu_b = mu.get(a, 0.0), mu.get(b, 0.0)
        score_a = 1.0 / (1.0 + math.exp(-GOAL_SCALE * (g1[i] - g2[i])))
        win, draw, _ = _outcome_probabilities(
            _g(math.sqrt(pre[0] * pre[0] + pre[1] * pre[1])) * (mu_a - mu_b)
        )
        result_a = 1.0 if g1[i] > g2[i] else 0.0 if g1[i] < g2[i] else 0.5
        expected_a = win + 0.5 * draw
        surprise = result_a - expected_a
        variance = (
            win * (1.0 - expected_a) ** 2
            + draw * (0.5 - expected_a) ** 2
            + (1.0 - win - draw) * expected_a ** 2
        )
        if nations is not None:
            for pid, opponent, result, expected in (
                (a, b, result_a, expected_a),
                (b, a, 1.0 - result_a, 1.0 - expected_a),
            ):
                if pid not in tracked:
                    continue
                row = by_nation.setdefault(pid, {}).setdefault(
                    nation_of.get(opponent, ""), [0, 0, 0, 0, 0.0, 0.0]
                )
                row[0] += 1
                row[1 if result == 1.0 else 3 if result == 0.0 else 2] += 1
                row[4] += expected
                row[5] += variance
        edge = pair_edge.setdefault((a, b) if a < b else (b, a), [0.0, 0, 0.0, 0.0])
        edge[0] += surprise if a < b else -surprise
        edge[1] += 1
        edge[2] += expected_a if a < b else 1.0 - expected_a
        edge[3] += variance
        updates = []
        for pid, mine, theirs, ph, ph_opp, score in (
            (a, mu_a, mu_b, pre[0], pre[1], score_a),
            (b, mu_b, mu_a, pre[1], pre[0], 1.0 - score_a),
        ):
            gg = _g(ph_opp)
            expected = 1.0 / (1.0 + math.exp(-gg * (mine - theirs)))
            v = 1.0 / (gg * gg * expected * (1.0 - expected))
            delta = v * gg * (score - expected)
            new_sigma = _new_volatility(sigma.get(pid, START_VOLATILITY), ph, v, delta)
            new_phi = 1.0 / math.sqrt(1.0 / (ph * ph) + 1.0 / v)
            updates.append((pid, mine + new_phi * new_phi * gg * (score - expected),
                            new_phi, new_sigma))
        for pid, new_mu, new_phi, new_sigma in updates:
            mu[pid], phi[pid], sigma[pid] = new_mu, new_phi, new_sigma
            last_day[pid] = day if day is not None else last_day.get(pid)
            games[pid] = games.get(pid, 0) + 1
            if pid not in tracked:
                continue
            tournament = tournaments[i]
            key = ("t", int(tournament)) if tournament is not pd.NA else ("d", dates[i])
            point = [key, dates[i], START_RATING + SCALE * new_mu, SCALE * new_phi, games[pid],
                     names[i] if key[0] == "t" else None]
            points = history.setdefault(pid, [])
            if points and points[-1][0] == key:
                points[-1] = point
            else:
                points.append(point)

    result: Dict[int, dict] = {}
    for pid in wanted:
        points = history.get(canonical.get(pid, pid))
        if not points:
            continue
        result[pid] = _payload(points)
        if nations is not None:
            result[pid]["nation"] = nation_of.get(canonical.get(pid, pid), "")
            result[pid]["nations"] = _nation_rows(by_nation.get(canonical.get(pid, pid), {}))

    if today is None:
        valid_days = [day for day in days if day == day]
        today_day = (max(valid_days) + 1) if valid_days else 0
    else:
        today_day = (pd.Timestamp(today) - pd.Timestamp("1970-01-01")).days

    def rd_today(pid: int) -> float:
        ph = phi.get(pid, _PHI_MAX)
        if last_day.get(pid) is None:
            return ph
        elapsed = max(0, today_day - last_day[pid])
        return min(_PHI_MAX, math.sqrt(ph * ph + sigma[pid] ** 2 * (1.0 + elapsed / PERIOD_DAYS)))

    forecasts: Dict[Tuple[int, int], List[float]] = {}
    for pair in pairs:
        a = canonical.get(int(pair[0]), int(pair[0]))
        b = canonical.get(int(pair[1]), int(pair[1]))
        if a == b or a not in mu or b not in mu:
            continue
        total, meetings, expected_low, variance = pair_edge.get(
            (a, b) if a < b else (b, a), [0.0, 0, 0.0, 0.0]
        )
        edge = (total if a < b else -total) / (meetings + H2H_PRIOR_GAMES)
        if pair_stats is not None and meetings:
            expected = expected_low if a < b else meetings - expected_low
            pair_stats[(int(pair[0]), int(pair[1]))] = [
                int(meetings), round(expected + (total if a < b else -total), 2),
                round(expected, 2), round(variance, 2),
            ]
        x = _g(math.sqrt(rd_today(a) ** 2 + rd_today(b) ** 2)) * (mu[a] - mu[b])
        win, draw, loss = _outcome_probabilities(x + H2H_WEIGHT * edge)
        forecasts[(int(pair[0]), int(pair[1]))] = [round(win, 3), round(draw, 3), round(loss, 3)]
    return result, forecasts


def _nation_rows(rows: Dict[str, List[float]]) -> List[list]:
    """[nation, games, wins, draws, losses, expected points, variance], most games first.

    Points count a win as 1 and a draw as 0.5. Expected points add up win + draw / 2 from the
    forecast before each game (ratings only, no head-to-head term), so a player who keeps
    scoring more than that against one nation does better against it than their rating says.
    The variance of the points lets the page tell a real pattern from chance. Opponents with
    no known nation are grouped under "".
    """
    ordered = sorted(rows.items(), key=lambda item: (-item[1][0], item[0]))
    return [
        [nation, int(row[0]), int(row[1]), int(row[2]), int(row[3]), round(row[4], 2),
         round(row[5], 2)]
        for nation, row in ordered
    ]


def _payload(points: List[list]) -> dict:
    peak: Optional[list] = None
    for point in points:
        # A peak only counts once the rating is reasonably settled.
        if point[3] <= 120 and (peak is None or point[2] > peak[2]):
            peak = point
    last = points[-1]
    return {
        "rating": round(last[2]),
        "rd": round(last[3]),
        "games": last[4],
        "peak": {"rating": round(peak[2]), "date": peak[1]} if peak else None,
        # [date, rating, rd, tournament name or None] after each tournament (or day, for games
        # without one). The name is stored because games against players without a page are
        # not in the player's match list.
        "history": [
            [point[1], round(point[2]), round(point[3]), point[5]] for point in points
        ],
    }
