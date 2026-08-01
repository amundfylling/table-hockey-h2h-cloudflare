import unittest

import pandas as pd

from scripts.build_h2h import process_matches_df


class TestMatchValidation(unittest.TestCase):
    def test_invalid_ids_and_scores_are_dropped_instead_of_coerced(self):
        base = {
            "player1_id": 1,
            "player2_id": 2,
            "goals_player1": 3,
            "goals_player2": 2,
            "overtime_raw": "No",
            "date_raw": "2026-01-02",
        }
        matches = pd.DataFrame(
            [
                base,
                {**base, "player1_id": 1.5},
                {**base, "player2_id": None},
                {**base, "goals_player1": 3.5},
                {**base, "goals_player2": None},
                {**base, "goals_player1": -1},
            ]
        )

        processed = process_matches_df(matches)

        self.assertEqual(len(processed), 1)
        row = processed.iloc[0]
        self.assertEqual(row.player1_id, 1)
        self.assertEqual(row.player2_id, 2)
        self.assertEqual(row.goals_player1, 3)
        self.assertEqual(row.goals_player2, 2)

    def test_integral_numeric_strings_remain_valid(self):
        matches = pd.DataFrame(
            [
                {
                    "player1_id": "1.0",
                    "player2_id": "2",
                    "goals_player1": "3.0",
                    "goals_player2": "2",
                    "overtime_raw": "No",
                    "date_raw": "2026-01-02",
                }
            ]
        )

        processed = process_matches_df(matches)

        self.assertEqual(len(processed), 1)
        self.assertEqual(processed.iloc[0].goals_player1, 3)

    def test_self_matches_and_walkovers_are_excluded(self):
        matches = pd.DataFrame(
            [
                {
                    "player1_id": 1,
                    "player2_id": 1,
                    "goals_player1": 3,
                    "goals_player2": 2,
                    "overtime_raw": "No",
                    "date_raw": "2026-01-02",
                    "Walkover": "No",
                },
                {
                    "player1_id": 1,
                    "player2_id": 2,
                    "goals_player1": 3,
                    "goals_player2": 0,
                    "overtime_raw": "No",
                    "date_raw": "2026-01-02",
                    "Walkover": "Yes",
                },
                {
                    "player1_id": 3,
                    "player2_id": 4,
                    "goals_player1": 3,
                    "goals_player2": 0,
                    "overtime_raw": "No",
                    "date_raw": "2026-01-02",
                    "Walkover": "1.0",
                },
            ]
        )

        self.assertTrue(process_matches_df(matches).empty)

    def test_unknown_overtime_value_is_not_treated_as_overtime(self):
        matches = pd.DataFrame(
            [
                {
                    "player1_id": 1,
                    "player2_id": 2,
                    "goals_player1": 3,
                    "goals_player2": 2,
                    "overtime_raw": "unverified",
                    "date_raw": "2026-01-02",
                },
                {
                    "player1_id": 3,
                    "player2_id": 4,
                    "goals_player1": 4,
                    "goals_player2": 3,
                    "overtime_raw": "OT",
                    "date_raw": "2026-01-02",
                },
                {
                    "player1_id": 5,
                    "player2_id": 6,
                    "goals_player1": 2,
                    "goals_player2": 1,
                    "overtime_raw": "no overtime",
                    "date_raw": "2026-01-02",
                },
                {
                    "player1_id": 7,
                    "player2_id": 8,
                    "goals_player1": 2,
                    "goals_player2": 1,
                    "overtime_raw": "1.0",
                    "date_raw": "2026-01-02",
                },
            ]
        )

        processed = process_matches_df(matches)

        self.assertFalse(bool(processed.iloc[0].overtime))
        self.assertTrue(bool(processed.iloc[1].overtime))
        self.assertFalse(bool(processed.iloc[2].overtime))
        self.assertTrue(bool(processed.iloc[3].overtime))


if __name__ == "__main__":
    unittest.main()
