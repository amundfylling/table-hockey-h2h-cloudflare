"""Fixes for match-data errors: placeholder scores, walkover copies, ids, and duplicates."""

import unittest

import pandas as pd

from scripts.build_h2h import (
    deduplicate_overlapping_source_matches,
    deduplicate_within_source_copies,
    drop_walkovers,
    find_id_name_conflicts,
    process_matches_df,
)


def raw_row(p1, p2, g1, g2, **extra):
    return {
        "player1_id": p1,
        "player2_id": p2,
        "player1_name": extra.pop("n1", f"Player {p1}"),
        "player2_name": extra.pop("n2", f"Player {p2}"),
        "goals_player1": g1,
        "goals_player2": g2,
        "overtime_raw": "No",
        "date_raw": extra.pop("date", "2020-01-04"),
        "stage_sequence": 1,
        "round_number": extra.pop("round", 1),
        "tournament_id": extra.pop("tid", 10),
        "tournament_name": extra.pop("tname", "Cup"),
        "source": extra.pop("source", ""),
        **extra,
    }


def processed(rows, keep_walkovers=False):
    return process_matches_df(pd.DataFrame(rows), keep_walkovers=keep_walkovers)


class TestPlaceholderScores(unittest.TestCase):
    def test_fifty_plus_goals_is_dropped_and_long_games_are_kept(self):
        result = processed([
            raw_row(1, 2, 99, 0),
            raw_row(1, 3, 55, 53),
            raw_row(2, 3, 31, 4),
            raw_row(3, 4, 15, 0),
        ])

        scores = sorted(zip(result.goals_player1, result.goals_player2))
        self.assertEqual(scores, [(15, 0), (31, 4)])
        self.assertEqual(result.attrs["validation"]["placeholder_rows"], 2)
        self.assertEqual(result.attrs["validation"]["dropped_rows"], 2)

    def test_listed_stage_drops_only_twenty_plus_rows_of_the_primary_source(self):
        result = processed([
            raw_row(1, 2, 20, 10, stage_id=8419),
            raw_row(1, 3, 4, 3, stage_id=8419),
            raw_row(2, 3, 20, 0, stage_id=8419, source="bordshockey.net"),
            raw_row(3, 4, 20, 10, stage_id=9999),
        ])

        self.assertEqual(len(result), 3)
        self.assertNotIn((1, 2), list(zip(result.player1_id, result.player2_id)))


class TestWalkoverCopies(unittest.TestCase):
    def test_walkovers_are_marked_instead_of_dropped_when_kept(self):
        result = processed(
            [raw_row(1, 2, 5, 0, Walkover="Yes"), raw_row(1, 3, 2, 1, Walkover="No")],
            keep_walkovers=True,
        )

        self.assertEqual(result["is_walkover"].tolist(), [True, False])
        validation = result.attrs["validation"]
        self.assertEqual(validation["walkover_rows"], 1)
        self.assertEqual(validation["accepted_rows"], 1)
        self.assertEqual(validation["dropped_rows"], 1)

    def test_other_source_copy_of_a_walkover_is_removed(self):
        primary = processed(
            [
                raw_row(1, 2, 5, 0, Walkover="Yes", round=1),
                raw_row(1, 3, 2, 1, Walkover="No", round=2),
                raw_row(2, 3, 4, 4, Walkover="No", round=3),
            ],
            keep_walkovers=True,
        )
        copy = processed([
            raw_row(1, 2, 5, 0, round=1, tid=500, source="bordshockey.net"),
            raw_row(1, 3, 2, 1, round=2, tid=500, source="bordshockey.net"),
            raw_row(2, 3, 4, 4, round=3, tid=500, source="bordshockey.net"),
        ])
        matches = deduplicate_overlapping_source_matches(
            pd.concat([primary, copy], ignore_index=True)
        )

        result, copies = drop_walkovers(matches)

        self.assertEqual(copies, 1)
        self.assertEqual(len(result), 2)
        self.assertNotIn("is_walkover", result)
        self.assertFalse(((result.id1 == 1) & (result.id2 == 2)).any())


class TestCrossSourceIds(unittest.TestCase):
    def test_kept_row_takes_the_sportscorpion_ids(self):
        # bordshockey knows player 5 as 9000005 and writes the names in the other order.
        primary = processed([
            raw_row(5, 100 + i, i % 4, 3, n1="Anna Berg", round=i) for i in range(12)
        ])
        copy = processed([
            raw_row(100 + i, 9000005, 3, i % 4, n2="Berg Anna", round=i, tid=500,
                    tname="Other name", source="bordshockey.net")
            for i in range(12)
        ])

        result = deduplicate_overlapping_source_matches(
            pd.concat([primary, copy], ignore_index=True)
        )

        self.assertEqual(len(result), 12)
        self.assertEqual(set(result.source), {"bordshockey.net"})
        self.assertEqual(set(result.player2_id), {5})
        self.assertEqual(set(result.id1), {5})
        row = result[result.player1_id == 103].iloc[0]
        self.assertEqual((row.goals_id1, row.goals_id2), (3, 3))
        row = result[result.player1_id == 101].iloc[0]
        self.assertEqual((row.goals_id1, row.goals_id2), (1, 3))

    def test_games_with_shifted_date_and_other_ids_pair_inside_known_events(self):
        # The event pairs on the first-day games; the second-day games differ in date
        # (bordshockey dates them all on the first day) and in player 5's id.
        primary = processed(
            [raw_row(1, 2 + i, 3, i % 3, round=i) for i in range(12)]
            + [raw_row(5, 60 + i, 2, 1, n1="Anna Berg", date="2020-01-05", round=20 + i)
               for i in range(3)]
        )
        copy = processed(
            [raw_row(1, 2 + i, 3, i % 3, round=i, tid=500, tname="X",
                     source="bordshockey.net") for i in range(12)]
            + [raw_row(9000005, 60 + i, 2, 1, n1="Anna Berg", round=40 + i, tid=500,
                       tname="X", source="bordshockey.net") for i in range(3)]
        )

        result = deduplicate_overlapping_source_matches(
            pd.concat([primary, copy], ignore_index=True)
        )

        self.assertEqual(len(result), 15)
        self.assertEqual(set(result.source), {"bordshockey.net"})
        self.assertNotIn(9000005, set(result.player1_id))


class TestCrosswalkEvidence(unittest.TestCase):
    def frames(self, primary_size, shared):
        primary = processed([
            raw_row(1000 + i, 2000 + i, i % 5, 2, round=i, tname="Big Super Series")
            for i in range(primary_size)
        ])
        copy = processed([
            raw_row(1000 + i, 2000 + i, i % 5, 2, round=i, tid=500, tname="Final",
                    source="bordshockey.net")
            for i in range(shared)
        ])
        return pd.concat([primary, copy], ignore_index=True)

    def test_a_few_look_alike_games_do_not_pair_a_large_event(self):
        result = deduplicate_overlapping_source_matches(self.frames(1000, 11))

        self.assertEqual(len(result), 1011)

    def test_a_small_event_still_pairs_on_a_few_games(self):
        result = deduplicate_overlapping_source_matches(self.frames(60, 3))

        self.assertEqual(len(result), 60)


class TestWithinSourceCopies(unittest.TestCase):
    def test_team_event_copy_is_dropped_and_individual_event_kept(self):
        games = [(i + 1, 50 + i, i % 4, 2) for i in range(12)]
        rows = [raw_row(a, b, x, y, tid=1, TournamentType="Team") for a, b, x, y in games]
        rows += [raw_row(a, b, x, y, tid=2, TournamentType="Individual") for a, b, x, y in games]
        rows.append(raw_row(1, 2, 1, 1, tid=1, TournamentType="Team"))

        result, dropped = deduplicate_within_source_copies(processed(rows))

        self.assertEqual(dropped, 12)
        self.assertEqual(sorted(result.tournament_id.tolist()), [1] + [2] * 12)

    def test_few_shared_games_are_not_copies(self):
        rows = [raw_row(i + 1, 50 + i, 3, 2, tid=1) for i in range(5)]
        rows += [raw_row(i + 1, 50 + i, 3, 2, tid=2) for i in range(5)]

        result, dropped = deduplicate_within_source_copies(processed(rows))

        self.assertEqual(dropped, 0)
        self.assertEqual(len(result), 10)


class TestIdNameConflicts(unittest.TestCase):
    def test_reports_two_unrelated_names_on_one_id_in_one_tournament(self):
        result = processed([
            raw_row(46, 2, 3, 1, n1="Kirill Storchak"),
            raw_row(46, 3, 3, 1, n1="Arseniy Stolyarov"),
            raw_row(7, 2, 3, 1, n1="Peter Östlund"),
            raw_row(7, 3, 3, 1, n1="Ostlund Peter"),
            raw_row(8, 2, 3, 1, n1="Jorn Moldvar"),
            raw_row(8, 3, 3, 1, n1="Jørn Moldvær"),
        ])

        conflicts = find_id_name_conflicts(result)

        self.assertEqual([item["player_id"] for item in conflicts], [46])
        self.assertEqual(conflicts[0]["names"], ["Arseniy Stolyarov", "Kirill Storchak"])


if __name__ == "__main__":
    unittest.main()
