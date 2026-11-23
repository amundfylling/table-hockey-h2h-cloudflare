import unittest
from collections import Counter

from scripts import data_drift


def keys(*games):
    return Counter(games)


class LostGamesTest(unittest.TestCase):
    def test_game_moved_to_another_tournament_is_not_lost(self):
        old = keys(("7", "2019-12-01", 3680, 3, 2))
        new = keys(("7", "2019-12-01", 461124434, 3, 2))
        lost, moved = data_drift.lost_games(old, new)
        self.assertEqual(lost, Counter())
        self.assertEqual(moved, 1)

    def test_game_moved_a_day_with_its_tournament_is_not_lost(self):
        old = keys(("7", "2019-12-01", 3680, 3, 2), ("7", "2019-12-01", 3680, 2, 2))
        new = keys(("7", "2019-11-30", 461124434, 3, 2), ("7", "2019-11-30", 461124434, 2, 2))
        lost, moved = data_drift.lost_games(old, new)
        self.assertEqual(lost, Counter())
        self.assertEqual(moved, 2)

    def test_game_gone_or_far_away_is_lost(self):
        old = keys(("7", "2019-12-01", 3680, 3, 2), ("8", "2019-12-01", 3680, 1, 0))
        new = keys(("7", "2019-12-20", 3681, 3, 2))
        lost, moved = data_drift.lost_games(old, new)
        self.assertEqual(sum(lost.values()), 2)
        self.assertEqual(moved, 0)

    def test_one_new_game_stands_for_one_old_game(self):
        old = keys(("7", "2019-12-01", 3680, 3, 2), ("7", "2019-12-02", 3680, 3, 2))
        new = keys(("7", "2019-12-01", 99, 3, 2))
        lost, moved = data_drift.lost_games(old, new)
        self.assertEqual(lost, keys(("7", "2019-12-02", 3680, 3, 2)))
        self.assertEqual(moved, 1)

    def test_nearby_dates_are_matched_as_a_whole(self):
        old = keys(("7", "2019-12-01", 1, 3, 2), ("7", "2019-12-04", 1, 3, 2))
        new = keys(("7", "2019-12-02", 2, 3, 2), ("7", "2019-11-28", 2, 3, 2))
        lost, moved = data_drift.lost_games(old, new)
        self.assertEqual(lost, Counter())
        self.assertEqual(moved, 2)


class SourceRowsTest(unittest.TestCase):
    def test_reads_accepted_rows_per_source(self):
        meta = {"source_validation": {
            "primary": {"accepted_rows": 10}, "supplemental": {"accepted_rows": 4},
            "cross_source_duplicates_removed": 3,
        }}
        self.assertEqual(
            data_drift.source_rows(meta), {"sportscorpion": 10, "bordshockey": 4}
        )


if __name__ == "__main__":
    unittest.main()
