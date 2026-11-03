import unittest
from pathlib import Path

import pandas as pd

from scripts.tournaments import (
    build_brackets,
    build_tournament_files,
    build_standings,
    payload_from_frame,
    classify_stage,
    compute_pre_game_ratings,
)


def _game(p1, p2, g1, g2, stage=1, stage_name="Playoff", stage_type="", seq=2, ot=False,
          date="2024-03-02"):
    return {
        "tournament_id": 7, "tournament_name": "Test Open", "tournament_level": "3",
        "tournament_url": "", "source": "", "date": date, "date_dt": pd.Timestamp(date),
        "stage": stage_name, "stage_type": stage_type, "stage_id": stage,
        "stage_sequence": seq, "round_number": None, "playoff_game_number": None,
        "player1_id": p1, "player2_id": p2, "goals_player1": g1, "goals_player2": g2,
        "overtime": ot,
    }


def _bo1_bracket():
    # Quarterfinals 1-8, 2-7, 3-6, 4-5; semis 1-4, 2-3; final 1-2; third place 4-3.
    return [
        _game(1, 8, 5, 1), _game(2, 7, 4, 2), _game(3, 6, 3, 1), _game(5, 4, 1, 2),
        _game(1, 4, 3, 2), _game(3, 2, 1, 4),
        _game(4, 3, 2, 1),
        _game(1, 2, 3, 2, ot=True),
    ]


class ClassifyStageTest(unittest.TestCase):
    def test_matches_frontend_rules(self):
        self.assertEqual(classify_stage("playoff", "Apļa turnīrs", ""), "playoff")
        self.assertEqual(classify_stage("roundrobin", "x", ""), "round-robin")
        self.assertEqual(classify_stage("", "B-Playoff Kvartsfinal", ""), "playoff")
        self.assertEqual(classify_stage("", "Round-Robin", ""), "round-robin")
        self.assertEqual(classify_stage("", "Playoff", "Team Cup"), "round-robin")


class StandingsTest(unittest.TestCase):
    def test_groups_are_split_by_who_played_whom_and_ranked(self):
        games = [
            {"p1": 1, "p2": 2, "g1": 3, "g2": 1}, {"p1": 1, "p2": 3, "g1": 2, "g2": 2},
            {"p1": 2, "p2": 3, "g1": 5, "g2": 0},
            {"p1": 10, "p2": 11, "g1": 0, "g2": 1},
        ]
        groups = build_standings(games)
        self.assertEqual([len(g) for g in groups], [3, 2])
        self.assertEqual([row["id"] for row in groups[0]], [1, 2, 3])
        self.assertEqual(groups[0][0], {"id": 1, "p": 2, "w": 1, "d": 1, "l": 0, "gf": 5,
                                        "ga": 3, "pts": 3})
        self.assertEqual(groups[0][1]["pts"], 2)
        self.assertEqual([row["id"] for row in groups[1]], [11, 10])


class BracketTest(unittest.TestCase):
    def _payload(self, games):
        frame = pd.DataFrame(games)
        return payload_from_frame(7, frame, {1: "One", 2: "Two"}, {1, 2})

    def test_rounds_champion_and_placement(self):
        payload = self._payload(_bo1_bracket())
        bracket = payload["brackets"][0]
        self.assertEqual([r["name"] for r in bracket["rounds"]],
                         ["Quarterfinals", "Semifinals", "Final"])
        self.assertEqual(len(bracket["rounds"][0]["series"]), 4)
        self.assertEqual(bracket["rounds"][2]["series"], [[1, 2, 1, 0, [[3, 2, 1]]]])
        self.assertEqual(len(bracket["other"]), 1)
        self.assertEqual((payload["champion"], payload["runner_up"]), (1, 2))
        self.assertEqual(payload["players"]["3"], "Player 3")
        self.assertEqual(payload["linked"], [1, 2])

    def test_best_of_series_and_secondary_bracket(self):
        games = [
            _game(1, 2, 3, 1), _game(2, 1, 4, 2), _game(1, 2, 5, 0),
            _game(5, 6, 2, 1, stage=9, stage_name="B-Playoff Final"),
        ]
        payload = self._payload(games)
        self.assertEqual([b["label"] for b in payload["brackets"]], ["Playoff", "B-Playoff"])
        self.assertEqual(payload["brackets"][0]["rounds"][0]["series"][0][:4], [1, 2, 2, 1])
        self.assertEqual(payload["champion"], 1)
        self.assertEqual(payload["brackets"][1]["champion"], 5)

    def test_rounds_named_in_stages_are_ordered_by_name_not_row_order(self):
        # One stage holds the whole bracket; rows arrive final first.
        named = []
        for game, stage_name in zip(_bo1_bracket(), ["Kvartsfinal"] * 4 + ["Semifinal"] * 2
                                    + ["Bronsmatch", "Final"]):
            named.append(dict(game, stage=f"A-slutspel {stage_name}", stage_type="playoff"))
        payload = self._payload(list(reversed(named)))
        bracket = payload["brackets"][0]
        self.assertEqual([r["name"] for r in bracket["rounds"]],
                         ["Quarterfinals", "Semifinals", "Final"])
        self.assertEqual(payload["champion"], 1)

    def test_fractional_round_numbers_order_the_bracket(self):
        games = []
        for game, value in zip(_bo1_bracket(), [0.25] * 4 + [0.5] * 2 + [0.9, 1.0]):
            games.append(dict(game, round_value=value))
        payload = self._payload(list(reversed(games)))
        self.assertEqual([r["name"] for r in payload["brackets"][0]["rounds"]],
                         ["Quarterfinals", "Semifinals", "Final"])
        self.assertEqual((payload["champion"], payload["runner_up"]), (1, 2))

    def test_round_robin_only_tournament_takes_the_table_leader(self):
        games = [_game(1, 2, 3, 1, stage_name="Round-Robin", seq=1),
                 _game(2, 3, 3, 1, stage_name="Round-Robin", seq=1),
                 _game(1, 3, 2, 2, stage_name="Round-Robin", seq=1)]
        payload = self._payload(games)
        self.assertEqual(payload["brackets"], [])
        self.assertEqual((payload["champion"], payload["runner_up"]), (1, 2))
        self.assertEqual(payload["round_robin"][0]["name"], "Round-Robin")


class RatingsTest(unittest.TestCase):
    def test_ratings_are_taken_before_each_game_in_date_order(self):
        frame = pd.DataFrame([
            _game(1, 2, 5, 0, date="2024-01-02"),
            _game(1, 2, 5, 0, date="2024-01-01"),
        ])
        ratings = compute_pre_game_ratings(frame)
        self.assertEqual(ratings.loc[1, "elo1"], 1500)
        self.assertGreater(ratings.loc[0, "elo1"], 1500)
        self.assertEqual(ratings.loc[0, "games1"], 1)

    def test_upsets_need_experienced_players_and_a_big_gap(self):
        game = _game(1, 2, 1, 4)
        game.update(elo1=1800.0, elo2=1600.0, games1=40, games2=35)
        rookie = _game(3, 4, 0, 1)
        rookie.update(elo1=1900.0, elo2=1500.0, games1=40, games2=5)
        payload = payload_from_frame(7, pd.DataFrame([game, rookie]), {}, set())
        self.assertEqual(len(payload["upsets"]), 1)
        self.assertEqual(payload["upsets"][0]["winner"], 2)
        self.assertEqual(payload["upsets"][0]["gap"], 200)


class TournamentFilesTest(unittest.TestCase):
    def test_tournaments_share_files_by_id_bucket(self):
        games = [dict(_game(1, 2, 3, 1), tournament_id=tid) for tid in (7, 1007, 8)]
        written = {}
        index = build_tournament_files(pd.DataFrame(games), {}, set(), {},
                                       lambda path, payload: written.update({path: payload}),
                                       Path("t"))
        self.assertEqual(sorted(written), [Path("t/7.json"), Path("t/8.json")])
        self.assertEqual(sorted(written[Path("t/7.json")]), ["1007", "7"])
        self.assertEqual(len(index), 3)

    def test_fragment_of_another_sources_event_names_no_champion(self):
        # 70 holds the 8 games only one source has; 80 got the 30 games both reported.
        fragment = [dict(g, tournament_id=70) for g in _bo1_bracket()]
        full = [dict(g, tournament_id=80, tournament_name="Full Open") for g in _bo1_bracket()]
        kept = [dict(g, tournament_id=90) for g in _bo1_bracket()]
        written = {}
        index = build_tournament_files(
            pd.DataFrame(fragment + full + kept), {}, set(), {},
            lambda path, payload: written.update({path: payload}), Path("t"),
            merged_into={70: (80, 30), 90: (80, 3)},
        )
        pages = {**written[Path("t/70.json")], **written[Path("t/80.json")],
                 **written[Path("t/90.json")]}
        self.assertIsNone(pages["70"]["champion"])
        self.assertIsNone(pages["70"]["brackets"][0]["champion"])
        self.assertEqual(pages["70"]["part_of"]["id"], 80)
        self.assertEqual(pages["70"]["part_of"]["name"], "Full Open")
        self.assertIsNone({t["id"]: t for t in index}[70]["champion"])
        # A page that kept most of its games keeps its champion.
        self.assertEqual(pages["90"]["champion"], 1)
        self.assertNotIn("part_of", pages["90"])
        self.assertEqual(pages["80"]["champion"], 1)


if __name__ == "__main__":
    unittest.main()
