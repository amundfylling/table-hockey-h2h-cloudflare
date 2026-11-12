import unittest

from scripts.build_h2h import og_payload


class OgPayloadTest(unittest.TestCase):
    def test_keeps_what_the_page_summary_needs(self):
        payload = {
            "player": {"id": 1, "name": "Alice"},
            "rating": {"rating": 1712, "rd": 60, "peak": {"rating": 1800, "date": "2019-03-02"},
                       "history": [["2019-03-02", 1800, 60, "Cup"]]},
            "opponents": {
                "2": {
                    "player": {"id": 2, "name": "Bob"},
                    "summary": {
                        "total_matches": 3, "wins_player": 2, "wins_opponent": 1, "draws": 0,
                        "goals_for_player": 9, "goals_for_opponent": 5,
                        "first_meeting_date": "2018-01-05T00:00:00", "last_meeting_date": "2024-02-01",
                        "tournaments": [{"id": 4, "name": "Cup"}],
                    },
                    "matches": [{"date": "2018-01-05"}],
                },
                "3": {
                    "player": {"id": 3, "name": "Cy"},
                    "summary": {"total_matches": 1, "wins_player": 1, "wins_opponent": 0,
                                "draws": 0, "first_meeting_date": None},
                    "matches": [],
                },
            },
        }
        og = og_payload(payload, {"country": "Norway", "world_rank": 12, "city": "Oslo"})
        self.assertEqual(og["player"], {
            "id": 1, "name": "Alice", "country": "Norway", "world_rank": 12,
            "rating": 1712, "peak": {"rating": 1800, "date": "2019-03-02"},
        })
        self.assertEqual(og["opponents"]["2"], {
            "player": {"id": 2, "name": "Bob"},
            "summary": {
                "total_matches": 3, "wins_player": 2, "wins_opponent": 1, "draws": 0,
                "goals_for_player": 9, "goals_for_opponent": 5,
                "first_meeting_date": "2018-01-05", "last_meeting_date": "2024-02-01",
            },
        })
        # Missing dates are left out rather than written as null.
        self.assertNotIn("first_meeting_date", og["opponents"]["3"]["summary"])
        self.assertEqual(og["opponents"]["3"]["summary"]["goals_for_player"], 0)

    def test_player_without_rating_or_info(self):
        og = og_payload({"player": {"id": 5, "name": "Dee"}, "opponents": {}})
        self.assertEqual(og, {"player": {"id": 5, "name": "Dee"}, "opponents": {}})


if __name__ == "__main__":
    unittest.main()
