import sys
import tempfile
import unittest
from pathlib import Path

from scripts.build_h2h import (  # noqa: E402
    load_tournament_levels,
    load_tournaments,
    normalize_tournament_level,
)


class TestTournamentMetadata(unittest.TestCase):
    def test_normalize_tournament_level(self):
        self.assertEqual(normalize_tournament_level(6.0), "6")
        self.assertEqual(normalize_tournament_level("5.0"), "5")
        self.assertEqual(normalize_tournament_level("International"), "International")
        self.assertIsNone(normalize_tournament_level(""))
        self.assertIsNone(normalize_tournament_level("N/A"))

    def test_load_tournaments_joins_metadata_level(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            tournaments_path = tmp_path / "tournament_data.csv"
            metadata_path = tmp_path / "tournament_metadata.csv"
            tournaments_path.write_text(
                "ID,Name,Type\n"
                "10,World Championship,Individual\n"
                "11,Local League,Individual\n"
                "12,Unknown Cup,Team\n",
                encoding="utf-8",
            )
            metadata_path.write_text(
                "TournamentID,Name,Level\n"
                "10,World Championship,1\n"
                "11,Local League,6.0\n",
                encoding="utf-8",
            )

            levels = load_tournament_levels(metadata_path)
            tournaments = load_tournaments(tournaments_path, levels)

        by_id = {tournament["id"]: tournament for tournament in tournaments}
        self.assertEqual(by_id[10]["level"], "1")
        self.assertEqual(by_id[11]["level"], "6")
        self.assertIsNone(by_id[12]["level"])


if __name__ == "__main__":
    unittest.main()
