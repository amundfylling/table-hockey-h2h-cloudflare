import json
import unittest
from unittest import mock

import pandas as pd

import scripts.ratings as ratings_module
from scripts.ratings import START_RATING, compute_ratings, compute_ratings_and_forecasts


def _frame(games):
    rows = []
    for index, (p1, p2, g1, g2, date, tournament) in enumerate(games):
        rows.append({
            "player1_id": p1, "player2_id": p2, "goals_player1": g1, "goals_player2": g2,
            "date": date, "date_dt": pd.Timestamp(date), "tournament_id": tournament,
            "tournament_name": None if tournament is None else f"Open {tournament}",
            "stage_sequence": 1, "stage_id": 1, "round_number": index,
            "playoff_game_number": None,
        })
    frame = pd.DataFrame(rows)
    frame["tournament_id"] = frame["tournament_id"].astype("Int64")
    return frame


class RatingsTest(unittest.TestCase):
    def test_winner_gains_and_bigger_margin_gains_more(self):
        close = compute_ratings(_frame([(1, 2, 3, 2, "2024-01-01", 10)]), [1, 2])
        wide = compute_ratings(_frame([(1, 2, 7, 1, "2024-01-01", 10)]), [1, 2])
        self.assertGreater(close[1]["rating"], START_RATING)
        self.assertLess(close[2]["rating"], START_RATING)
        self.assertGreater(wide[1]["rating"], close[1]["rating"])

    def test_draw_between_equals_keeps_ratings_level(self):
        result = compute_ratings(_frame([(1, 2, 2, 2, "2024-01-01", 10)]), [1, 2])
        self.assertEqual(result[1]["rating"], result[2]["rating"])

    def test_one_history_point_per_tournament(self):
        games = [(1, 2, 3, 1, "2024-01-01", 10), (1, 3, 3, 1, "2024-01-01", 10),
                 (1, 2, 1, 3, "2024-02-01", 11)]
        history = compute_ratings(_frame(games), [1])[1]["history"]
        self.assertEqual([point[0] for point in history], ["2024-01-01", "2024-02-01"])
        self.assertEqual([point[3] for point in history], ["Open 10", "Open 11"])
        self.assertEqual(compute_ratings(_frame(games), [1])[1]["games"], 3)

    def test_rd_widens_after_time_away(self):
        base = [(1, 2, 3, 2, "2024-01-01", 10)] * 20
        soon = compute_ratings(_frame(base + [(1, 2, 3, 2, "2024-01-08", 11)]), [1])
        later = compute_ratings(_frame(base + [(1, 2, 3, 2, "2026-01-01", 11)]), [1])
        # The game itself narrows RD, but less of the time-away widening is undone.
        self.assertGreater(later[1]["rd"], soon[1]["rd"])

    def test_missing_date_serializes_as_null(self):
        frame = _frame([(1, 2, 3, 1, "2024-01-01", 10), (1, 2, 3, 1, "2024-02-01", None)])
        frame.loc[1, "date"] = float("nan")
        frame.loc[1, "date_dt"] = pd.NaT
        history = compute_ratings(frame, [1])[1]["history"]
        self.assertEqual(history[-1][0], None)
        self.assertEqual(history[-1][3], None)
        json.dumps(history, allow_nan=False)

    def test_alias_ids_share_one_rating(self):
        games = [(1, 3, 4, 1, "2024-01-01", 10), (2, 3, 4, 1, "2024-02-01", 11)]
        result = compute_ratings(_frame(games), [1, 2, 3], alias_groups=[[1, 2]])
        self.assertEqual(result[1], result[2])
        self.assertEqual(result[1]["games"], 2)

    def test_forecast_favours_the_stronger_player_and_mirrors(self):
        games = [(1, 3, 5, 1, "2024-01-01", 10), (2, 3, 1, 5, "2024-01-01", 10)] * 10
        _, forecasts = compute_ratings_and_forecasts(
            _frame(games), [1, 2, 3], pairs=[(1, 2), (2, 1)]
        )
        win, draw, loss = forecasts[(1, 2)]
        self.assertGreater(win, loss)
        self.assertAlmostEqual(win + draw + loss, 1.0, places=2)
        self.assertEqual(forecasts[(2, 1)], [loss, draw, win])

    def test_head_to_head_edge_shifts_the_forecast(self):
        # 2 keeps beating 1 by more than the ratings expect, so the edge lowers 1's chances
        # beyond what the rating gap alone gives.
        field = [(1, 3, 3, 2, "2024-01-01", 10), (2, 3, 3, 2, "2024-01-01", 10)] * 10
        lopsided = [(1, 2, 2, 3, "2024-02-01", 11)] * 20
        frame = _frame(field + lopsided)
        _, with_edge = compute_ratings_and_forecasts(frame, [1, 2], pairs=[(1, 2)])
        with mock.patch.object(ratings_module, "H2H_WEIGHT", 0.0):
            _, ratings_only = compute_ratings_and_forecasts(frame, [1, 2], pairs=[(1, 2)])
        self.assertLess(with_edge[(1, 2)][0], ratings_only[(1, 2)][0])

    def test_untracked_players_still_move_tracked_ratings(self):
        result = compute_ratings(_frame([(1, 99, 1, 4, "2024-01-01", 10)]), [1])
        self.assertNotIn(99, result)
        self.assertLess(result[1]["rating"], START_RATING)


if __name__ == "__main__":
    unittest.main()
