import unittest
from pathlib import Path

import pandas as pd

from scripts.tournaments import (
    apply_ithf,
    build_tournament_files,
    load_ithf_tournaments,
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
        self.assertEqual(classify_stage("", "Playoff", "WC 2023 - OPEN TEAMS"), "round-robin")

    def test_team_is_a_whole_word(self):
        self.assertEqual(classify_stage("", "Playoff", "Steampunk Winter Cup #1"), "playoff")


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


class MainPlayoffTest(unittest.TestCase):
    """A and B playoffs of the same size: the one with the round robin's best player wins."""

    def _league(self):
        # Round robin: 1 and 2 top it, 3 and 4 are at the bottom. The B playoff (3 v 4) is
        # played before the A playoff (1 v 2), so the older order would have made it main.
        rr = [_game(1, 3, 4, 0, stage=1, stage_name="Round-Robin", seq=1),
              _game(2, 4, 4, 0, stage=1, stage_name="Round-Robin", seq=1),
              _game(1, 4, 4, 1, stage=1, stage_name="Round-Robin", seq=1),
              _game(2, 3, 4, 1, stage=1, stage_name="Round-Robin", seq=1),
              _game(1, 2, 2, 2, stage=1, stage_name="Round-Robin", seq=1),
              _game(3, 4, 2, 2, stage=1, stage_name="Round-Robin", seq=1)]
        b_final = [_game(3, 4, 3, 1, stage=2, stage_name="Playoff", seq=2)]
        a_final = [_game(2, 1, 3, 1, stage=3, stage_name="Playoff", seq=3)]
        return payload_from_frame(7, pd.DataFrame(rr + b_final + a_final), {}, set())

    def test_playoff_of_the_best_round_robin_players_is_main(self):
        payload = self._league()
        self.assertEqual((payload["champion"], payload["runner_up"]), (2, 1))
        self.assertEqual([b["label"] for b in payload["brackets"]], ["Playoff", "Playoff 2"])
        self.assertEqual(payload["brackets"][1]["champion"], 3)


class IthfTest(unittest.TestCase):
    def _payload(self):
        return {
            "players": {"1": "Ann Berg", "2": "Bo Ek", "3": "Cecilia Öst", "4": "Dan Ås"},
            "champion": 3, "runner_up": 4,
            "brackets": [
                {"label": "Playoff", "secondary": False, "champion": 3, "runner_up": 4},
                {"label": "Playoff 2", "secondary": False, "champion": 1, "runner_up": 2},
            ],
        }

    def test_link_without_a_main_entry_changes_nothing_else(self):
        payload = self._payload()
        entry = {"ithf": 123, "name": "Test Open", "main": False,
                 "places": [[1, 900, "Ann Berg", 1]]}
        self.assertIsNone(apply_ithf(payload, entry))
        self.assertEqual(payload["ithf"], {"id": 123, "name": "Test Open"})
        self.assertEqual(payload["champion"], 3)

    def test_ithf_winner_of_another_playoff_makes_it_main(self):
        payload = self._payload()
        entry = {"ithf": 5, "main": True, "places": [[1, 900, "Ann Berg", 1],
                                                     [2, 901, "Bo Ek", 2]]}
        self.assertEqual(apply_ithf(payload, entry), "bracket")
        self.assertEqual((payload["champion"], payload["runner_up"]), (1, 2))
        self.assertEqual([b["champion"] for b in payload["brackets"]], [1, 3])
        self.assertEqual([b["label"] for b in payload["brackets"]], ["Playoff", "Playoff 2"])
        self.assertNotIn("result_source", payload)

    def test_ithf_table_sets_the_champion_when_no_playoff_has_them(self):
        payload = self._payload()
        payload["brackets"] = []
        # No site id: found by ranking id, then by name without accents.
        entry = {"ithf": 5, "main": True, "places": [[1, 900, "Dan As", None],
                                                     [2, 777, "Someone", None]]}
        self.assertEqual(apply_ithf(payload, entry, {777: 2}), "ithf")
        self.assertEqual((payload["champion"], payload["runner_up"]), (4, 2))
        self.assertEqual(payload["result_source"], "ithf")

    def test_unknown_winner_or_fragment_is_left_alone(self):
        payload = self._payload()
        entry = {"ithf": 5, "main": True, "places": [[1, 900, "Not Here", None]]}
        self.assertIsNone(apply_ithf(payload, entry))
        self.assertEqual(payload["champion"], 3)
        payload["part_of"] = {"id": 99}
        entry["places"] = [[1, 900, "Ann Berg", 1]]
        self.assertIsNone(apply_ithf(payload, entry))
        self.assertEqual(payload["champion"], 3)

    def test_committed_links_load(self):
        path = Path(__file__).resolve().parent.parent / "data" / "ithf-tournaments.json"
        links = load_ithf_tournaments(path)
        self.assertGreater(len(links), 5000)
        self.assertTrue(all(isinstance(entry["ithf"], int) for entry in links.values()))
        self.assertEqual(load_ithf_tournaments(path.with_name("missing.json")), {})


class SeparateStagesTest(unittest.TestCase):
    def _payload(self, games, details=None):
        return payload_from_frame(7, pd.DataFrame(games), {}, set(), details)

    def _knockout(self, players, stage, seq):
        # A full knockout over 8 players in one stage: the first player beats everyone.
        a = players
        pairs = [(a[0], a[7]), (a[1], a[6]), (a[2], a[5]), (a[3], a[4]),
                 (a[0], a[3]), (a[1], a[2]), (a[0], a[1])]
        values = [0.25] * 4 + [0.5] * 2 + [1.0]
        return [dict(_game(p, q, 3, 1, stage=stage, seq=seq), round_value=v)
                for (p, q), v in zip(pairs, values)]

    def test_side_cup_before_the_group_stage_stays_its_own_bracket(self):
        # A cup with everyone first, then the group stage, then the A-playoff. Player 18 won
        # the cup; 8 is the A-playoff winner and lost to 18 in the cup.
        cup = self._knockout([18, 8, 11, 12, 13, 14, 15, 16], stage=1, seq=1)
        groups = [_game(8, 11, 2, 1, stage=2, stage_name="Round-Robin", seq=2),
                  _game(11, 12, 2, 1, stage=2, stage_name="Round-Robin", seq=2)]
        a_playoff = self._knockout([8, 1, 2, 3, 4, 5, 6, 18], stage=3, seq=3)
        payload = self._payload(cup + groups + a_playoff)
        self.assertEqual(len(payload["brackets"]), 2)
        self.assertEqual(payload["champion"], 8)
        self.assertEqual(payload["brackets"][1]["champion"], 18)
        self.assertEqual(payload["brackets"][0]["other"], [])

    def test_rounds_stored_as_stages_still_form_one_bracket(self):
        games = []
        for game, stage, name in zip(
                _bo1_bracket(), [11] * 4 + [12] * 2 + [13, 14],
                ["Playoff 1/4"] * 4 + ["Playoff 1/2"] * 2 + ["Playoff 3rd", "Playoff Final"]):
            games.append(dict(game, stage_id=stage, stage=name))
        payload = self._payload(games)
        self.assertEqual(len(payload["brackets"]), 1)
        self.assertEqual((payload["champion"], payload["runner_up"]), (1, 2))


class TournamentDetailsTest(unittest.TestCase):
    def _payload(self, details):
        games = [_game(1, 2, 3, 1, date="2024-03-02"), _game(1, 2, 2, 1, date="2024-03-03")]
        return payload_from_frame(7, pd.DataFrame(games), {}, set(), details)

    def test_end_date_long_after_the_games_is_ignored(self):
        payload = self._payload({"date": "2024-03-02", "end_date": "2026-01-31"})
        self.assertEqual(payload["end_date"], "2024-03-03")

    def test_end_date_before_the_start_is_ignored(self):
        payload = self._payload({"date": "2024-03-02", "end_date": "2024-02-18"})
        self.assertEqual(payload["end_date"], "2024-03-03")

    def test_plausible_end_date_is_kept(self):
        payload = self._payload({"date": "2024-03-02", "end_date": "2024-03-04"})
        self.assertEqual(payload["end_date"], "2024-03-04")

    def test_whitespace_in_names_is_collapsed(self):
        games = [dict(_game(1, 2, 3, 1), tournament_name="XVI  World\tChampionship")]
        payload = payload_from_frame(7, pd.DataFrame(games), {}, set())
        self.assertEqual(payload["name"], "XVI World Championship")


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

    def test_fragment_links_past_another_fragment_to_the_full_event(self):
        pages = {}
        games = [dict(g, tournament_id=tid) for tid in (70, 71, 72) for g in _bo1_bracket()]
        build_tournament_files(
            pd.DataFrame(games), {}, set(), {},
            lambda path, payload: pages.update(payload), Path("t"),
            merged_into={70: (71, 20), 71: (72, 20)},
        )
        self.assertEqual(pages["70"]["part_of"]["id"], 72)
        self.assertEqual(pages["71"]["part_of"]["id"], 72)
        self.assertEqual(pages["72"]["champion"], 1)

    def test_tournament_that_gave_away_all_its_games_points_at_the_full_page(self):
        # 60 lost every game to fragment 70, whose full event is 80; 50 lost them to a
        # tournament that has no page.
        pages = {}
        games = [dict(g, tournament_id=tid) for tid in (70, 80) for g in _bo1_bracket()]
        index = build_tournament_files(
            pd.DataFrame(games), {}, set(), {},
            lambda path, payload: pages.update(payload), Path("t"),
            merged_into={60: (70, 5), 70: (80, 30), 50: (40, 5)},
        )
        self.assertEqual(pages["60"], {"id": 60, "moved_to": 80})
        self.assertNotIn("50", pages)
        self.assertEqual(sorted(t["id"] for t in index), [70, 80])


if __name__ == "__main__":
    unittest.main()
