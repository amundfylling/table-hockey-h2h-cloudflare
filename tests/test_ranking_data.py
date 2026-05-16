import tempfile
import unittest
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from scripts.build_h2h import load_players, load_rankings, parse_ranking_date


class TestRankingData(unittest.TestCase):
    def test_parse_ranking_date(self):
        self.assertEqual(
            parse_ranking_date("Table hockey ranking up to 12.5.2026"),
            "2026-05-12",
        )

    def test_load_rankings_parses_text_format(self):
        ranking_text = """
        Table hockey ranking up to 12.5.2026
        Rank ID_Player Player Club Nation Points Player_Value
        1 655257 Rainers Kalnins Incukalns THC LAT 4702 1010
        2 200042 Edgars Caics BJC Laimite LAT 4578 965
        39 79394 Jiri Chylik ml.
        HCS Zabka Praha CZE 3615 834
        """

        with tempfile.TemporaryDirectory() as tmpdir:
            ranking_path = Path(tmpdir) / "ranking.txt"
            ranking_path.write_text(ranking_text, encoding="utf-8")
            rankings = load_rankings(ranking_path)

        self.assertEqual(
            rankings[655257],
            {
                "world_rank": 1,
                "ranking_points": 4702,
                "ranking_player_value": 1010,
                "ranking_nation": "LAT",
                "ranking_as_of": "2026-05-12",
            },
        )
        self.assertEqual(rankings[200042]["world_rank"], 2)
        self.assertEqual(rankings[79394]["world_rank"], 39)
        self.assertEqual(rankings[79394]["ranking_points"], 3615)

    def test_load_players_joins_ranking_by_ranking_id(self):
        players_csv = """PlayerID,Name,RankingID,Country,City,DateOfBirth,Sex
2442,Amund Risa Fylling,660869.0,Norway,Kvernaland,25.06.1999,Male
391,Edgars Caics,200042.0,Latvia,Riga,17.07.1989,Not set
"""
        rankings = {
            660869: {
                "world_rank": 83,
                "ranking_points": 3163,
                "ranking_player_value": 662,
                "ranking_nation": "NOR",
                "ranking_as_of": "2026-05-12",
            }
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            players_path = Path(tmpdir) / "players_data.csv"
            players_path.write_text(players_csv, encoding="utf-8")
            players, _names = load_players(players_path, rankings)

        by_name = {player["name"]: player for player in players}
        self.assertEqual(by_name["Amund Risa Fylling"]["world_rank"], 83)
        self.assertEqual(by_name["Amund Risa Fylling"]["ranking_points"], 3163)
        self.assertIsNone(by_name["Edgars Caics"]["world_rank"])


if __name__ == "__main__":
    unittest.main()
