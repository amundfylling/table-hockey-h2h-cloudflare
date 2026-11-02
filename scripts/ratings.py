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
from typing import Dict, Iterable, List, Optional

import pandas as pd

SCALE = 173.7178
START_RATING = 1500.0
START_RD = 350.0
START_VOLATILITY = 0.3
TAU = 1.5
PERIOD_DAYS = 7.0
GOAL_SCALE = 0.4
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


def compute_ratings(
    matches: pd.DataFrame,
    player_ids: Iterable[int],
    alias_groups: Iterable[Iterable[int]] = (),
) -> Dict[int, dict]:
    """Rating history for each id in player_ids, one point per tournament they played.

    Every game counts, including games against players who get no page. Ids in one alias
    group share a single rating, stored under each of the group's ids.
    """
    canonical: Dict[int, int] = {}
    for group in alias_groups:
        ids = [int(pid) for pid in group]
        for pid in ids:
            canonical[pid] = ids[0]

    order = _playing_order(matches)
    rows = matches.loc[order]
    p1 = rows["player1_id"].astype("int64").tolist()
    p2 = rows["player2_id"].astype("int64").tolist()
    g1 = rows["goals_player1"].astype("int64").tolist()
    g2 = rows["goals_player2"].astype("int64").tolist()
    days = ((rows["date_dt"] - pd.Timestamp("1970-01-01")).dt.days).tolist()
    dates = rows["date"].tolist()
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
            point = [key, dates[i], START_RATING + SCALE * new_mu, SCALE * new_phi, games[pid]]
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
    return result


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
        # [date, rating, rd, tournament id or None] after each tournament (or day, for games
        # without one).
        "history": [
            [point[1], round(point[2]), round(point[3]), point[0][1] if point[0][0] == "t" else None]
            for point in points
        ],
    }
