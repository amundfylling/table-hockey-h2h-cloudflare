import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from scripts.build_h2h import (  # noqa: E402
    _row_to_match,
    deduplicate_overlapping_source_matches,
    read_extra_matches_csv,
)


class TestBordshockeySourceFields(unittest.TestCase):
    def test_extra_csv_preserves_stage_type_and_source_links(self):
        csv_text = (
            "\ufeffStageID,Player1,Player1ID,Player2,Player2ID,GoalsPlayer1,"
            "GoalsPlayer2,Overtime,Stage,RoundNumber,PlayoffGameNumber,Date,"
            "TournamentName,TournamentID,StageSequence,StageType,TournamentURL,"
            "ResultURL,StageURL,SourceURL,Source,SourceTournamentID,SourceStageID,"
            "SourceMatchID\n"
            "7530,Henrik Brodin,1,Samuel Villius,2,4,2,No,Final groups A,"
            "1,,2002-03-16,Overum Open,115189097,2,round-robin,"
            "https://bordshockey.net/tavlingar/0102/overum-open/,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1,"
            "bordshockey.net,0102/overum-open,7530,104160\n"
            "7531,Henrik Brodin,1,Samuel Villius,2,3,1,No,Final groups A,"
            "2,,2002-03-16,Overum Open,115189097,2,round-robin,"
            "https://bordshockey.net/tavlingar/0102/overum-open/,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1,"
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1,"
            "bordshockey.net,0102/overum-open,7531,\n"
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "bordshockey_results.csv"
            csv_path.write_text(csv_text, encoding="utf-8")
            matches = read_extra_matches_csv(csv_path)

        self.assertEqual(len(matches), 2)
        row = matches.iloc[0]
        self.assertEqual(row.stage_type, "round-robin")
        self.assertEqual(row.source, "bordshockey.net")
        self.assertEqual(
            row.source_url,
            "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1",
        )

        payload = _row_to_match(next(matches.itertuples(index=False)))
        self.assertEqual(payload["stage_type"], "round-robin")
        self.assertEqual(payload["source"], "bordshockey.net")
        self.assertEqual(payload["source_stage_id"], "7530")
        self.assertEqual(payload["source_match_id"], "104160")

    def test_overlapping_scorpion_match_is_replaced_by_bordshockey_match(self):
        matches = pd.DataFrame(
            [
                {
                    "id1": 1,
                    "id2": 2,
                    "date": "2016-02-13",
                    "stage_sequence": 3,
                    "round_number": 7,
                    "playoff_game_number": None,
                    "goals_id1": 2,
                    "goals_id2": 2,
                    "overtime": False,
                    "tournament_id": 1248,
                    "tournament_level": "3",
                    "source": "",
                    "source_url": "",
                },
                {
                    "id1": 1,
                    "id2": 2,
                    "date": "2016-02-13",
                    "stage_sequence": 3,
                    "round_number": 7,
                    "playoff_game_number": None,
                    "goals_id1": 2,
                    "goals_id2": 2,
                    "overtime": False,
                    "tournament_id": 684751752,
                    "tournament_level": None,
                    "source": "bordshockey.net",
                    "source_url": "https://bordshockey.net/tavlingar/1516/swedish-masters/",
                },
            ]
        )

        deduped = deduplicate_overlapping_source_matches(matches)

        self.assertEqual(len(deduped), 1)
        row = deduped.iloc[0]
        self.assertEqual(row.source, "bordshockey.net")
        self.assertEqual(row.tournament_id, 684751752)
        self.assertEqual(row.tournament_level, "3")


if __name__ == "__main__":
    unittest.main()
