import unittest

from scripts.build_h2h import build_rivalries


def _payload(pid, opponents):
    return {
        "player": {"id": pid, "name": f"P{pid}"},
        "opponents": {
            str(oid): {
                "player": {"id": oid, "name": f"P{oid}"},
                "summary": {"total_matches": games, "wins_player": games, "wins_opponent": 0, "draws": 0},
                "matches": [
                    {"goals_for_player": 1, "goals_for_opponent": 0, "date": "2024-01-01"}
                ] * games,
            }
            for oid, games in opponents.items()
        },
    }


class RivalriesTest(unittest.TestCase):
    def setUp(self):
        self.payloads = {
            1: _payload(1, {2: 5, 3: 50}),
            2: _payload(2, {1: 5, 3: 7}),
            3: _payload(3, {1: 50, 2: 7}),
        }
        # Player 3 is ranked first, then 2, then 1.
        self.players = [
            {"id": 1, "world_rank": 3},
            {"id": 2, "world_rank": 2},
            {"id": 3, "world_rank": 1},
        ]

    def test_most_played_is_sorted_by_games(self):
        result = build_rivalries(self.payloads, self.players)
        self.assertEqual(
            [(r["p1"]["id"], r["p2"]["id"]) for r in result["most_played"]],
            [(1, 3), (2, 3), (1, 2)],
        )
        self.assertEqual(result["most_played"][0]["results"], "W" * 50)

    def test_top_ranked_follows_ranking_order_with_better_player_first(self):
        result = build_rivalries(self.payloads, self.players)
        self.assertEqual(
            [(r["p1"]["id"], r["p2"]["id"]) for r in result["top_ranked"]],
            [(3, 2), (3, 1), (2, 1)],
        )

    def test_top_ranked_is_empty_without_rankings(self):
        self.assertEqual(build_rivalries(self.payloads)["top_ranked"], [])


if __name__ == "__main__":
    unittest.main()
