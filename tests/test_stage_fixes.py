import unittest

import pandas as pd

from scripts import stage_fixes


def _row(tid, stage_id, stage, seq, a, b, ga, gb, tournament_type="Individual"):
    return {
        "tournament_id": tid, "tournament_name": "Open", "stage_id": stage_id, "stage": stage,
        "stage_sequence": seq, "stage_type": "roundrobin", "id1": a, "id2": b,
        "goals_id1": ga, "goals_id2": gb, "TournamentType": tournament_type,
        "date": "2026-04-18",
    }


def _basic_and_final(copy_scores=True, players=6):
    rows = []
    ids = list(range(1, players + 1))
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            rows.append(_row(1, 10, "Basic groups 1", 1, a, b, 3, 1))
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            score = (3, 1) if copy_scores else (1, 2)
            rows.append(_row(1, 20, "Final groups A1", 2, a, b, *score))
    rows.append(_row(1, 20, "Final groups A1", 2, 1, 99, 4, 0))
    return pd.DataFrame(rows)


class CarriedOverCopiesTest(unittest.TestCase):
    def test_final_group_copies_of_basic_group_games_are_dropped(self):
        frame = _basic_and_final(copy_scores=True)
        cleaned, report = stage_fixes.drop_carried_over_copies(frame)
        self.assertEqual(len(cleaned), 15 + 1)
        self.assertEqual(report, [{"tournament_id": 1, "stage": "Final groups A1",
                                   "dropped": 15, "pairs": 15}])
        # The new final-group game stays.
        self.assertEqual(int((cleaned["id2"] == 99).sum()), 1)

    def test_real_rematches_with_other_scores_stay(self):
        frame = _basic_and_final(copy_scores=False)
        cleaned, report = stage_fixes.drop_carried_over_copies(frame)
        self.assertEqual(len(cleaned), len(frame))
        self.assertEqual(report, [])

    def test_a_few_repeated_scores_are_not_enough(self):
        frame = _basic_and_final(copy_scores=True, players=4)  # only 6 pairs met before
        cleaned, report = stage_fixes.drop_carried_over_copies(frame)
        self.assertEqual(len(cleaned), len(frame))
        self.assertEqual(report, [])

    def test_playoff_rematches_are_never_touched(self):
        frame = _basic_and_final(copy_scores=True)
        frame.loc[frame["stage_id"] == 20, "stage_type"] = "playoff"
        cleaned, _ = stage_fixes.drop_carried_over_copies(frame)
        self.assertEqual(len(cleaned), len(frame))


class TeamStagesTest(unittest.TestCase):
    def test_team_events_become_round_robin(self):
        frame = pd.DataFrame([
            dict(_row(1, 1, "Playoff", 2, 1, 2, 1, 1, "Team"), stage_type=""),
            dict(_row(2, 2, "Playoff", 2, 1, 2, 1, 0, "Individual"), stage_type=""),
        ])
        self.assertEqual(stage_fixes.mark_team_stages(frame), 1)
        self.assertEqual(frame["stage_type"].tolist(), ["round-robin", ""])


class DateOverridesTest(unittest.TestCase):
    def test_known_wrong_dates_are_corrected(self):
        frame = pd.DataFrame([dict(_row(80, 1, "Round-Robin", 1, 1, 2, 1, 0),
                                   date="2010-01-19", date_dt=pd.Timestamp("2010-01-19"))])
        self.assertEqual(stage_fixes.apply_date_overrides(frame), 1)
        self.assertEqual(frame.loc[0, "date"], "2011-01-19")
        self.assertEqual(frame.loc[0, "date_dt"], pd.Timestamp("2011-01-19"))


if __name__ == "__main__":
    unittest.main()
