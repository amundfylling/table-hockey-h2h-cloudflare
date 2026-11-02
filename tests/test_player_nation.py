import unittest

from scripts.build_h2h import player_nation


class PlayerNationTest(unittest.TestCase):
    def test_spellings_map_to_one_nation(self):
        self.assertEqual(player_nation({"country": "Россия"}), "Russia")
        self.assertEqual(player_nation({"country": "kazakistan"}), "Kazakhstan")
        self.assertEqual(player_nation({"country": "Republic of Lithuania"}), "Lithuania")
        self.assertEqual(player_nation({"country": "Norway", "ranking_nation": "SWE"}), "Norway")

    def test_ranking_nation_fills_a_missing_country(self):
        self.assertEqual(player_nation({"country": "", "ranking_nation": "SWE"}), "Sweden")
        self.assertEqual(player_nation({"country": "-", "ranking_nation": "GER"}), "Germany")

    def test_two_countries_or_none_is_unknown(self):
        self.assertEqual(player_nation({"country": "Sweden / Portugal"}), "")
        self.assertEqual(player_nation({"country": "Portugal - Sverige"}), "")
        self.assertEqual(
            player_nation({"country": "Sweden / Portugal", "ranking_nation": "SWE"}), ""
        )
        self.assertEqual(player_nation({"country": "test"}), "")
        self.assertEqual(player_nation({}), "")


if __name__ == "__main__":
    unittest.main()
