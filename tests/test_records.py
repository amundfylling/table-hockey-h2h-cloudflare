import unittest

import pandas as pd

from scripts import build_h2h
from scripts.build_h2h import build_records

NAMES = {1: "Anna", 2: "Bo", 3: "Cy", 4: "Di", 9: "* *"}


def _games(rows):
    """rows: (p1, p2, goals1, goals2, date) in the order they were played."""
    frame = pd.DataFrame(rows, columns=["player1_id", "player2_id", "goals_player1", "goals_player2", "date"])
    frame["date_dt"] = pd.to_datetime(frame["date"])
    frame["tournament_id"] = 1
    frame["stage_sequence"] = 1
    frame["round_number"] = range(len(frame))
    frame["playoff_game_number"] = pd.NA
    return frame


def _day(index):
    return (pd.Timestamp("2020-01-01") + pd.Timedelta(days=index)).strftime("%Y-%m-%d")


class RecordsTest(unittest.TestCase):
    def setUp(self):
        self._saved = (
            build_h2h.MIN_WIN_STREAK,
            build_h2h.MIN_PERFECT_RECORD_GAMES,
            build_h2h.MIN_DEAD_EVEN_GAMES,
            build_h2h.MIN_REMATCH_GAP_DAYS,
        )
        build_h2h.MIN_WIN_STREAK = 3
        build_h2h.MIN_PERFECT_RECORD_GAMES = 3
        build_h2h.MIN_DEAD_EVEN_GAMES = 4
        build_h2h.MIN_REMATCH_GAP_DAYS = 365

    def tearDown(self):
        (
            build_h2h.MIN_WIN_STREAK,
            build_h2h.MIN_PERFECT_RECORD_GAMES,
            build_h2h.MIN_DEAD_EVEN_GAMES,
            build_h2h.MIN_REMATCH_GAP_DAYS,
        ) = self._saved

    def test_win_streak_runs_across_opponents_and_ends_at_a_draw(self):
        rows = [(1, 2, 3, 1, _day(0)), (3, 1, 0, 2, _day(1)), (1, 4, 5, 0, _day(2)),
                (1, 2, 4, 2, _day(3)), (1, 3, 2, 2, _day(4)), (1, 4, 3, 0, _day(5))]
        records = build_records(_games(rows), NAMES)
        self.assertEqual(records["win_streak"]["player"], {"id": 1, "name": "Anna"})
        self.assertEqual(records["win_streak"]["games"], 4)
        self.assertEqual(records["win_streak"]["start_date"], _day(0))
        self.assertEqual(records["win_streak"]["end_date"], _day(3))
        self.assertEqual(records["unbeaten_streak"]["games"], 6)
        self.assertEqual(records["unbeaten_streak"]["results"], "WWWWDW")

    def test_unbeaten_run_is_left_out_when_no_longer_than_the_winning_streak(self):
        rows = [(1, 2, 3, 1, _day(i)) for i in range(4)]
        records = build_records(_games(rows), NAMES)
        self.assertEqual(records["win_streak"]["games"], 4)
        self.assertNotIn("unbeaten_streak", records)

    def test_perfect_record_disappears_after_one_lost_game(self):
        rows = [(1, 2, 3, 1, _day(i)) for i in range(5)]
        self.assertEqual(build_records(_games(rows), NAMES)["perfect_record"]["games"], 5)
        rows.append((1, 2, 1, 2, _day(5)))
        self.assertNotIn("perfect_record", build_records(_games(rows), NAMES))

    def test_perfect_record_disappears_after_one_draw(self):
        rows = [(1, 2, 3, 1, _day(i)) for i in range(5)] + [(2, 1, 2, 2, _day(5))]
        self.assertNotIn("perfect_record", build_records(_games(rows), NAMES))

    def test_h2h_streak_skips_the_pair_already_shown_as_a_perfect_record(self):
        rows = [(1, 2, 3, 1, _day(i)) for i in range(5)]
        self.assertNotIn("h2h_streak", build_records(_games(rows), NAMES))
        rows.append((1, 2, 0, 1, _day(5)))
        records = build_records(_games(rows), NAMES)
        self.assertEqual(records["h2h_streak"]["games"], 5)
        self.assertEqual(records["h2h_streak"]["opponent"]["id"], 2)

    def test_an_undated_loss_still_breaks_a_perfect_record(self):
        rows = [(1, 2, 3, 1, _day(i)) for i in range(5)] + [(1, 2, 0, 1, None)]
        records = build_records(_games(rows), NAMES)
        self.assertNotIn("perfect_record", records)
        self.assertEqual(records["win_streak"]["games"], 5)

    def test_dead_even_disappears_when_someone_pulls_ahead(self):
        rows = [(3, 4, 2, 1, _day(0)), (3, 4, 1, 2, _day(1)), (4, 3, 2, 2, _day(2)),
                (4, 3, 3, 1, _day(3)), (3, 4, 4, 1, _day(4))]
        even = build_records(_games(rows), NAMES)["dead_even"]
        self.assertEqual((even["games"], even["wins"], even["draws"]), (5, 2, 1))
        rows.append((3, 4, 5, 1, _day(5)))
        self.assertNotIn("dead_even", build_records(_games(rows), NAMES))
        rows[-1] = (3, 4, 5, 1, None)
        self.assertNotIn("dead_even", build_records(_games(rows), NAMES))

    def test_rematch_gap(self):
        rows = [(1, 2, 1, 0, "2010-05-01"), (1, 2, 1, 0, "2010-06-01"), (2, 1, 1, 0, "2015-06-01")]
        gap = build_records(_games(rows), NAMES)["rematch_gap"]
        self.assertEqual((gap["before_date"], gap["after_date"]), ("2010-06-01", "2015-06-01"))
        self.assertEqual({gap["player"]["id"], gap["opponent"]["id"]}, {1, 2})

    def test_placeholder_players_never_hold_a_record(self):
        rows = [(9, 2, 3, 0, _day(i)) for i in range(10)]
        self.assertEqual(build_records(_games(rows), NAMES), {})

    def test_records_below_their_thresholds_are_left_out(self):
        rows = [(1, 2, 3, 1, _day(0)), (1, 2, 1, 3, _day(1))]
        self.assertEqual(build_records(_games(rows), NAMES), {})


if __name__ == "__main__":
    unittest.main()
