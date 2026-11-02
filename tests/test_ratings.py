import unittest

import pandas as pd

from scripts.ratings import START_RATING, compute_ratings


def _frame(games):
    rows = []
    for index, (p1, p2, g1, g2, date, tournament) in enumerate(games):
        rows.append({
            "player1_id": p1, "player2_id": p2, "goals_player1": g1, "goals_player2": g2,
            "date": date, "date_dt": pd.Timestamp(date), "tournament_id": tournament,
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
        self.assertEqual(compute_ratings(_frame(games), [1])[1]["games"], 3)

    def test_rd_widens_after_time_away(self):
        base = [(1, 2, 3, 2, "2024-01-01", 10)] * 20
        soon = compute_ratings(_frame(base + [(1, 2, 3, 2, "2024-01-08", 11)]), [1])
        later = compute_ratings(_frame(base + [(1, 2, 3, 2, "2026-01-01", 11)]), [1])
        # The game itself narrows RD, but less of the time-away widening is undone.
        self.assertGreater(later[1]["rd"], soon[1]["rd"])

    def test_alias_ids_share_one_rating(self):
        games = [(1, 3, 4, 1, "2024-01-01", 10), (2, 3, 4, 1, "2024-02-01", 11)]
        result = compute_ratings(_frame(games), [1, 2, 3], alias_groups=[[1, 2]])
        self.assertEqual(result[1], result[2])
        self.assertEqual(result[1]["games"], 2)

    def test_untracked_players_still_move_tracked_ratings(self):
        result = compute_ratings(_frame([(1, 99, 1, 4, "2024-01-01", 10)]), [1])
        self.assertNotIn(99, result)
        self.assertLess(result[1]["rating"], START_RATING)


if __name__ == "__main__":
    unittest.main()
