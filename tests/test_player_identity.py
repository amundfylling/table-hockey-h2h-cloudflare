import unittest

import pandas as pd

from scripts.build_h2h import (
    ithf_id_from_player_id,
    placeholder_player_ids,
    player_nation,
    tidy_display_name,
    tidy_players,
)


def games(rows):
    return pd.DataFrame(rows, columns=["player1_id", "player1_name", "player2_id", "player2_name"])


def profile(pid, name, **extra):
    return {"id": pid, "name": name, "ranking_id": None, "country": "", "ranking_nation": "",
            "world_rank": None, **extra}


class TidyDisplayNameTest(unittest.TestCase):
    def test_one_alphabet_per_word(self):
        self.assertEqual(tidy_display_name("Alexcandуr Ansabaev"), "Alexcandyr Ansabaev")
        self.assertEqual(tidy_display_name("Аnasteyha Кoreckay"), "Anasteyha Koreckay")
        self.assertEqual(tidy_display_name("Виталий Смирнов"), "Виталий Смирнов")

    def test_case_and_punctuation(self):
        self.assertEqual(tidy_display_name("konstantin orlov"), "Konstantin Orlov")
        self.assertEqual(tidy_display_name("IGOR GORELKIN"), "Igor Gorelkin")
        self.assertEqual(tidy_display_name("Annika Persson, "), "Annika Persson")
        self.assertEqual(tidy_display_name("Jiří Chylík ml."), "Jiří Chylík ml.")


class PlaceholderTest(unittest.TestCase):
    def test_filler_names_and_listed_ids(self):
        matches = games([
            (3607, "no no", 1, "Real One"),
            (159, "", 1, "Real One"),
            (13423, "* *", 1, "Real One"),
            (204, "qwerqwerqerqe darqwerqwer", 2, "Real Two"),
        ])
        players = [profile(3607, "no no"), profile(159, "Player 159"),
                   profile(13423, "Player 13423"), profile(1, "Real One")]
        found = placeholder_player_ids(players, matches)
        self.assertIn(3607, found)
        self.assertIn(159, found)
        self.assertIn(204, found)
        self.assertNotIn(13423, found)  # hidden name, but one real person
        self.assertNotIn(1, found)


class TidyPlayersTest(unittest.TestCase):
    def test_names_nations_and_search(self):
        matches = games([
            (289, "Georgii Levashev", 9470, "Vitaliy Smirnov"),
            (13423, "* *", 9070077, "Tomas Behr"),
        ])
        rankings = {70077: {"world_rank": 99, "ranking_nation": "CZE"}}
        players = [
            profile(289, "Player 289"),
            profile(9470, "Виталий Смирнов", country="Россия"),
            profile(13423, "Player 13423"),
            profile(9070077, "Tomas Behr"),
        ]
        by_id = {p["id"]: p for p in tidy_players(players, matches, rankings)}
        self.assertEqual(by_id[289]["name"], "Georgii Levashev")
        self.assertEqual(by_id[13423]["name"], "Hidden player 13423")
        self.assertEqual(by_id[9470]["country"], "Russia")
        self.assertEqual(by_id[9470]["alt_names"], ["Vitaliy Smirnov"])
        self.assertIn("vitaliy smirnov", by_id[9470]["search_key"])
        self.assertEqual(by_id[9070077]["country"], "Czech Republic")
        self.assertEqual(by_id[9070077]["world_rank"], 99)
        self.assertEqual(by_id[9070077]["ranking_id"], 70077)

    def test_ithf_id_range(self):
        self.assertEqual(ithf_id_from_player_id(9070077), 70077)
        self.assertIsNone(ithf_id_from_player_id(8007927))
        self.assertIsNone(ithf_id_from_player_id(21000447))

    def test_austria_code(self):
        self.assertEqual(player_nation({"ranking_nation": "AUT"}), "Austria")


if __name__ == "__main__":
    unittest.main()
