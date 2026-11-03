import unittest

from scripts.build_h2h import build_leaderboard
from scripts.tournaments import build_tournament_list


def _rating(value, history, rd=60, games=100, peak=None):
    return {
        "rating": value,
        "rd": rd,
        "games": games,
        "peak": peak,
        "history": [[date, r, rd, "T"] for date, r in history],
    }


class LeaderboardTest(unittest.TestCase):
    def setUp(self):
        self.players = [
            {"id": 1, "name": "Ann", "country": "Norway"},
            {"id": 2, "name": "Bo", "country": "Sweden"},
            {"id": 3, "name": "Cy", "country": "Latvia"},
            {"id": 4, "name": "Unrated", "country": "Finland"},
        ]
        self.ratings = {
            1: _rating(1700, [("2025-01-01", 1650), ("2026-10-01", 1700)],
                       peak={"rating": 1720, "date": "2026-05-01"}),
            2: _rating(1800, [("2026-09-01", 1800)]),
            3: _rating(1600, [("2024-01-01", 1600)]),
        }

    def _rows(self, **kwargs):
        board = build_leaderboard(self.players, self.ratings, "2026-11-01", **kwargs)
        return [dict(zip(board["fields"], row)) for row in board["players"]]

    def test_sorted_by_rating_and_unrated_players_left_out(self):
        self.assertEqual([row["id"] for row in self._rows()], [2, 1, 3])

    def test_change_compares_with_the_rating_ninety_days_back(self):
        rows = {row["id"]: row for row in self._rows()}
        self.assertEqual(rows[1]["change"], 50)
        # No rating yet 90 days ago: no change to show.
        self.assertIsNone(rows[2]["change"])
        # Has not played since: unchanged.
        self.assertEqual(rows[3]["change"], 0)

    def test_row_carries_nation_peak_and_last_game(self):
        row = {row["id"]: row for row in self._rows()}[1]
        self.assertEqual(row["nation"], "Norway")
        self.assertEqual((row["peak"], row["peak_date"]), (1720, "2026-05-01"))
        self.assertEqual(row["last_played"], "2026-10-01")

    def test_alias_group_listed_once_under_its_name(self):
        self.ratings[4] = self.ratings[1]
        rows = self._rows(alias_groups=[{"name": "Ann Alias", "ids": [9, 4, 1]}])
        listed = [row for row in rows if row["rating"] == 1700]
        self.assertEqual(len(listed), 1)
        # Id 9 has no page, so the first id in the group with one (4) is kept.
        self.assertEqual((listed[0]["id"], listed[0]["name"]), (4, "Ann Alias"))


class TournamentListTest(unittest.TestCase):
    def test_names_finalists_and_skips_partial_pages(self):
        index = [
            {"id": 10, "name": "Open", "date": "2026-10-01", "end_date": "2026-10-02",
             "level": "2", "city": "Oslo", "country": "Norway", "games": 120, "players": 30,
             "champion": 1, "runner_up": 7, "part_of": None},
            {"id": 11, "name": "Open extra", "date": "2026-10-01", "end_date": "",
             "level": None, "city": "", "country": "", "games": 4, "players": 4,
             "champion": None, "runner_up": None, "part_of": 10},
        ]
        result = build_tournament_list(index, {1: "Ann", 7: "Gus"}, {1})
        rows = [dict(zip(result["fields"], row)) for row in result["tournaments"]]
        self.assertEqual([row["id"] for row in rows], [10])
        self.assertEqual((rows[0]["champion"], rows[0]["runner_up"]), (1, 7))
        self.assertEqual(result["players"], {"1": ["Ann", True], "7": ["Gus", False]})
        self.assertEqual(rows[0]["city"], "Oslo")
        self.assertEqual(rows[0]["end_date"], "2026-10-02")

    def test_one_day_event_has_no_end_date(self):
        index = [{"id": 1, "name": "Cup", "date": "2026-01-01", "end_date": "2026-01-01",
                  "level": None, "country": "", "games": 3, "players": 3, "champion": None}]
        row = build_tournament_list(index, {}, set())["tournaments"][0]
        self.assertEqual(row[3], "")
        self.assertIsNone(row[9])


if __name__ == "__main__":
    unittest.main()
