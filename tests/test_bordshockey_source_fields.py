import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.build_h2h import (  # noqa: E402
    build_unique_player_name_index,
    deduplicate_overlapping_source_matches,
    read_extra_matches_parquet,
)


INT_COLUMNS = {
    "StageID",
    "Player1ID",
    "Player2ID",
    "GoalsPlayer1",
    "GoalsPlayer2",
    "RoundNumber",
    "PlayoffGameNumber",
    "TournamentID",
    "StageSequence",
}


def with_source_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Match the scraper's Parquet schema: nullable Int64 ids/counts, strings elsewhere."""
    return df.astype(
        {
            column: "Int64" if column in INT_COLUMNS else "string"
            for column in df.columns
        }
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

    def test_extra_parquet_preserves_stage_type_and_source_links(self):
        shared = {
            "StageID": 7530,
            "Player1": "Henrik Brodin",
            "Player1ID": 1,
            "Player2": "Samuel Villius",
            "Player2ID": 2,
            "Overtime": "No",
            "Stage": "Final groups A",
            "PlayoffGameNumber": None,
            "Date": "2002-03-16",
            "TournamentName": "Overum Open",
            "TournamentID": 115189097,
            "StageSequence": 2,
            "StageType": "round-robin",
            "TournamentURL": "https://bordshockey.net/tavlingar/0102/overum-open/",
            "ResultURL": "https://bordshockey.net/tavlingar/0102/overum-open/resultat/",
            "StageURL": (
                "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1"
            ),
            "SourceURL": (
                "https://bordshockey.net/tavlingar/0102/overum-open/resultat/group/?matcher=1"
            ),
            "Source": "bordshockey.net",
            "SourceTournamentID": "0102/overum-open",
            "SourceStageID": "7530",
        }
        source = with_source_dtypes(
            pd.DataFrame(
                [
                    {
                        **shared,
                        "GoalsPlayer1": 4,
                        "GoalsPlayer2": 2,
                        "RoundNumber": 1,
                        "SourceMatchID": "104160",
                    },
                    {
                        **shared,
                        "GoalsPlayer1": 3,
                        "GoalsPlayer2": 1,
                        "RoundNumber": 2,
                        "SourceMatchID": None,
                    },
                ]
            )
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            parquet_path = Path(tmpdir) / "bordshockey_results.parquet"
            source.to_parquet(parquet_path, index=False)
            matches = read_extra_matches_parquet(parquet_path)

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
        self.assertEqual(matches.iloc[1].source_match_id, "")

    def test_extra_parquet_resolves_only_missing_ids_from_unique_exact_names(self):
        source = with_source_dtypes(
            pd.DataFrame(
                [
                    {
                        "Player1": "José Example",
                        "Player1ID": None,
                        "Player2": "Other Player",
                        "Player2ID": 22,
                        "GoalsPlayer1": 4,
                        "GoalsPlayer2": 2,
                        "Overtime": "No",
                        "Date": "2026-01-02",
                    },
                    {
                        "Player1": "Unknown Player",
                        "Player1ID": None,
                        "Player2": "Other Player",
                        "Player2ID": 22,
                        "GoalsPlayer1": 3,
                        "GoalsPlayer2": 1,
                        "Overtime": "No",
                        "Date": "2026-01-03",
                    },
                ]
            )
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            parquet_path = Path(tmpdir) / "missing_player_ids.parquet"
            source.to_parquet(parquet_path, index=False)
            matches = read_extra_matches_parquet(
                parquet_path,
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

    def test_level_backfill_with_mixed_known_and_missing_levels(self):
        shared = {
            "id1": 1,
            "id2": 2,
            "date": "2016-02-13",
            "stage_sequence": 3,
            "playoff_game_number": None,
            "goals_id1": 2,
            "goals_id2": 2,
            "overtime": False,
            "tournament_name": "Swedish Masters",
        }
        primary = {**shared, "tournament_id": 1248, "tournament_level": "3", "source": ""}
        bordshockey = {
            **shared,
            "tournament_id": 684751752,
            "source": "bordshockey.net",
        }
        matches = pd.DataFrame(
            [
                {**primary, "round_number": 1},
                {**primary, "round_number": 2},
                {**bordshockey, "round_number": 1, "tournament_level": "5"},
                {**bordshockey, "round_number": 2, "tournament_level": None},
            ]
        )

        deduped = deduplicate_overlapping_source_matches(matches)

        self.assertEqual(deduped["source"].tolist(), ["bordshockey.net"] * 2)
        levels = dict(zip(deduped["round_number"], deduped["tournament_level"]))
        self.assertEqual(levels, {1: "5", 2: "3"})

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

    def loose_overlap_rows(self, games):
        rows = []
        for game in range(games):
            shared = {
                "id1": game + 1,
                "id2": game + 100,
                "date": "2018-11-03",
                "playoff_game_number": None,
                "goals_id1": game % 5,
                "goals_id2": 2,
                "overtime": False,
                "tournament_level": None,
            }
            rows.extend(
                [
                    {
                        **shared,
                        "stage_sequence": 7,
                        "round_number": game + 20,
                        "tournament_id": 100,
                        "tournament_name": "X Saint Petersburg Open 2018",
                        "source": "",
                    },
                    {
                        **shared,
                        "stage_sequence": 1,
                        "round_number": game + 1,
                        "tournament_id": 200,
                        "tournament_name": "St. Petersburg Open",
                        "source": "bordshockey.net",
                    },
                ]
            )
        return rows

    def test_overlap_with_different_stage_numbering_is_deduped(self):
        deduped = deduplicate_overlapping_source_matches(
            pd.DataFrame(self.loose_overlap_rows(10))
        )

        self.assertEqual(len(deduped), 10)
        self.assertTrue((deduped.source == "bordshockey.net").all())

    def test_few_overlaps_with_different_stage_numbering_are_preserved(self):
        deduped = deduplicate_overlapping_source_matches(
            pd.DataFrame(self.loose_overlap_rows(9))
        )

        self.assertEqual(len(deduped), 18)

    def test_loose_pass_keeps_exact_tournament_mapping_one_to_one(self):
        rows = []
        for round_number in range(1, 4):
            shared = {
                "id1": round_number,
                "id2": round_number + 10,
                "date": "2018-11-03",
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
                    {**shared, "tournament_id": 200, "source": "bordshockey.net"},
                ]
            )
        loose_rows = self.loose_overlap_rows(10)
        for row in loose_rows:
            row["tournament_id"] = 101 if row["source"] == "" else 200
        rows.extend(loose_rows)

        deduped = deduplicate_overlapping_source_matches(pd.DataFrame(rows))

        self.assertEqual((deduped.tournament_id == 100).sum(), 0)
        self.assertEqual((deduped.tournament_id == 101).sum(), 10)
        self.assertEqual((deduped.tournament_id == 200).sum(), 13)


if __name__ == "__main__":
    unittest.main()
