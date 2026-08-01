import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.build_h2h import (  # noqa: E402
    build_unique_player_name_index,
    deduplicate_overlapping_source_matches,
    read_extra_matches_csv,
)



class TestBordshockeySourceFields(unittest.TestCase):
    def test_player_name_index_excludes_ambiguous_normalized_names(self):
        index = build_unique_player_name_index(
            [
                {"id": 1, "name": "José Example"},
                {"id": 2, "name": "Jose Example"},
                {"id": 3, "name": "Unique Player"},
            ]
        )

        self.assertNotIn("jose example", index)
        self.assertEqual(index["unique player"], 3)

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

        self.assertEqual(row.source_stage_id, "7530")
        self.assertEqual(row.source_match_id, "104160")

    def test_extra_csv_resolves_only_missing_ids_from_unique_exact_names(self):
        csv_text = (
            "Player1,Player1ID,Player2,Player2ID,GoalsPlayer1,GoalsPlayer2,"
            "Overtime,Date\n"
            "José Example,,Other Player,22,4,2,No,2026-01-02\n"
            "José Example,not-an-id,Other Player,22,3,1,No,2026-01-03\n"
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            csv_path = Path(tmpdir) / "missing_player_ids.csv"
            csv_path.write_text(csv_text, encoding="utf-8")
            matches = read_extra_matches_csv(
                csv_path,
                {"jose example": 11, "other player": 22},
            )

        self.assertEqual(len(matches), 1)
        self.assertEqual(matches.iloc[0].player1_id, 11)
        self.assertEqual(matches.iloc[0].player2_id, 22)


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
                    "tournament_name": "Swedish Masters",
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
                    "tournament_name": "Swedish Masters",
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

    def test_same_match_signature_in_different_tournaments_is_preserved(self):
        shared = {
            "id1": 1,
            "id2": 2,
            "date": "2016-02-13",
            "stage_sequence": 3,
            "round_number": 7,
            "playoff_game_number": None,
            "goals_id1": 2,
            "goals_id2": 2,
            "overtime": False,
            "tournament_level": None,
        }
        matches = pd.DataFrame(
            [
                {
                    **shared,
                    "tournament_id": 10,
                    "tournament_name": "Saturday Cup",
                    "source": "",
                },
                {
                    **shared,
                    "tournament_id": 20,
                    "tournament_name": "Sunday Cup",
                    "source": "bordshockey.net",
                },
            ]
        )

        deduped = deduplicate_overlapping_source_matches(matches)

        self.assertEqual(len(deduped), 2)
        self.assertEqual(set(deduped.tournament_id), {10, 20})

    def test_overlap_dedupe_preserves_unmatched_multiplicity(self):
        shared = {
            "id1": 1,
            "id2": 2,
            "date": "2016-02-13",
            "stage_sequence": 3,
            "round_number": 7,
            "playoff_game_number": None,
            "goals_id1": 2,
            "goals_id2": 2,
            "overtime": False,
            "tournament_name": "Swedish Masters",
            "tournament_level": "3",
        }
        matches = pd.DataFrame(
            [
                {**shared, "tournament_id": 1248, "source": ""},
                {**shared, "tournament_id": 1248, "source": ""},
                {
                    **shared,
                    "tournament_id": 684751752,
                    "tournament_level": None,
                    "source": "bordshockey.net",
                },
            ]
        )

        deduped = deduplicate_overlapping_source_matches(matches)

        self.assertEqual(len(deduped), 2)
        self.assertEqual((deduped.source == "bordshockey.net").sum(), 1)
        self.assertEqual((deduped.source == "").sum(), 1)
        bordshockey = deduped.loc[deduped.source == "bordshockey.net"].iloc[0]
        self.assertEqual(bordshockey.tournament_level, "3")

    def test_repeated_overlap_infers_cross_source_tournament_alias(self):
        rows = []
        for round_number, score in enumerate([(2, 1), (3, 2), (4, 3)], start=1):
            shared = {
                "id1": round_number,
                "id2": round_number + 10,
                "date": "2022-06-18",
                "stage_sequence": 1,
                "round_number": round_number,
                "playoff_game_number": None,
                "goals_id1": score[0],
                "goals_id2": score[1],
                "overtime": False,
                "tournament_level": "1",
            }
            rows.extend(
                [
                    {
                        **shared,
                        "tournament_id": 100,
                        "tournament_name": "European Championships 2022 Open",
                        "source": "",
                    },
                    {
                        **shared,
                        "tournament_id": 200,
                        "tournament_name": "EM",
                        "tournament_level": None,
                        "source": "bordshockey.net",
                    },
                ]
            )

        deduped = deduplicate_overlapping_source_matches(pd.DataFrame(rows))

        self.assertEqual(len(deduped), 3)
        self.assertTrue((deduped.source == "bordshockey.net").all())
        self.assertTrue((deduped.tournament_level == "1").all())

    def test_ambiguous_many_to_one_tournament_crosswalk_is_preserved(self):
        rows = []
        for round_number in range(1, 4):
            shared = {
                "id1": round_number,
                "id2": round_number + 10,
                "date": "2022-06-18",
                "stage_sequence": 1,
                "round_number": round_number,
                "playoff_game_number": None,
                "goals_id1": round_number + 1,
                "goals_id2": round_number,
                "overtime": False,
                "tournament_level": None,
                "tournament_name": "",
            }
            rows.extend(
                [
                    {**shared, "tournament_id": 100, "source": ""},
                    {**shared, "tournament_id": 101, "source": ""},
                    {
                        **shared,
                        "tournament_id": 200,
                        "source": "bordshockey.net",
                    },
                ]
            )

        deduped = deduplicate_overlapping_source_matches(pd.DataFrame(rows))

        self.assertEqual(len(deduped), 9)
        self.assertEqual(set(deduped.tournament_id), {100, 101, 200})


if __name__ == "__main__":
    unittest.main()
