"""Invariants of the full built dataset in public/data (run after scripts/build_h2h.py).

Each check is something that must hold for every player, pair, game and tournament whatever
the source data says, so a failure means the build wrote stats that contradict each other:
a summary that disagrees with its games, a pair whose two sides disagree, a link to a player
or tournament that has no page, a playoff series whose score is not the games it lists.

The file name starts with "test_h" on purpose: CI runs the tests matching test_[!h]*.py before
the data build and the rest (these and test_h2h_counts.py) after it.
"""
import json
import unittest
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "public" / "data"
ALIASES_PATH = ROOT_DIR / "public" / "aliases.json"
# The raw stage types the frontend's normalizeStageType understands.
STAGE_TYPES = {"", "round-robin", "roundrobin", "playoff"}
# Highest score one player can plausibly reach in a game (the record is in the 40s).
MAX_GOALS = 60
EARLIEST_DATE = "1970-01-01"
TOURNAMENT_BUCKETS = 1000
MAX_EXAMPLES = 15


def _load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _result(gf: int, ga: int) -> str:
    return "W" if gf > ga else "L" if gf < ga else "D"


class Problems:
    """Collects failures by check, so one run reports every broken invariant at once."""

    def __init__(self):
        self.counts = defaultdict(int)
        self.examples = defaultdict(list)

    def add(self, check: str, example) -> None:
        self.counts[check] += 1
        if len(self.examples[check]) < MAX_EXAMPLES:
            self.examples[check].append(example)

    def report(self, check: str) -> str:
        examples = "\n  ".join(str(example) for example in self.examples[check])
        return f"{check}: {self.counts[check]} problem(s), for example:\n  {examples}"


class BuiltDataIntegrityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (DATA_DIR / "players.json").exists():
            raise FileNotFoundError("public/data is missing. Run scripts/build_h2h.py first.")
        cls.players = _load(DATA_DIR / "players.json")
        cls.meta = _load(DATA_DIR / "meta.json")
        cls.player_ids = {int(player["id"]) for player in cls.players}
        leaderboard = _load(DATA_DIR / "leaderboard.json")
        fields = leaderboard["fields"]
        cls.leaderboard_rows = [dict(zip(fields, row)) for row in leaderboard["players"]]
        cls.tournaments = {}
        cls.bucket_problems = []
        for path in (DATA_DIR / "t").glob("*.json"):
            for key, tournament in _load(path).items():
                if int(key) % TOURNAMENT_BUCKETS != int(path.stem):
                    cls.bucket_problems.append(f"tournament {key} is in t/{path.name}")
                cls.tournaments[int(key)] = tournament
        cls.alias_groups = [
            [int(pid) for pid in group["ids"]] for group in _load(ALIASES_PATH)["groups"]
        ]
        cls._scan_player_files()

    @classmethod
    def _scan_player_files(cls):
        """Read every data/h2h file once and run the per-file checks."""
        problems = Problems()
        pair_sides = {}
        cls.ratings = {}
        cls.pair_totals = {}
        cls.total_games = 0
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        for player_id in sorted(cls.player_ids):
            path = DATA_DIR / "h2h" / f"{player_id}.json"
            if not path.exists():
                problems.add("player without a file", player_id)
                continue
            payload = _load(path)
            if payload.get("player", {}).get("id") != player_id:
                problems.add("file names another player", (player_id, payload.get("player")))
            cls.ratings[player_id] = payload.get("rating")
            og_path = DATA_DIR / "og" / f"{player_id}.json"
            og = _load(og_path)["opponents"] if og_path.exists() else None
            if og is None:
                problems.add("player without an og file", player_id)
            for key, opponent in payload.get("opponents", {}).items():
                opponent_id = int(key)
                where = (player_id, opponent_id)
                if opponent_id == player_id:
                    problems.add("player listed as own opponent", where)
                if opponent_id not in cls.player_ids:
                    problems.add("opponent without a page", where)
                if opponent.get("player", {}).get("id") != opponent_id:
                    problems.add("opponent entry names another player", where)
                summary = opponent["summary"]
                games = opponent["matches"]
                cls._check_pair(problems, where, summary, games, tomorrow)
                if og is not None:
                    og_summary = (og.get(key) or {}).get("summary") or {}
                    for field, value in og_summary.items():
                        if summary.get(field) != value:
                            problems.add("og summary differs from h2h", (where, field))
                            break
                low, high = sorted(where)
                record = (
                    summary["total_matches"], summary["draws"],
                    summary["wins_player"], summary["wins_opponent"],
                    summary["goals_for_player"], summary["goals_for_opponent"],
                )
                if player_id != low:
                    record = (record[0], record[1], record[3], record[2], record[5], record[4])
                pair_sides.setdefault((low, high), []).append(record)
                cls.total_games += summary["total_matches"]
        for pair, sides in pair_sides.items():
            if len(sides) != 2:
                problems.add("pair listed by one player only", pair)
            elif sides[0] != sides[1]:
                problems.add("pair's two files disagree", (pair, sides))
            cls.pair_totals[pair] = sides[0]
        cls.problems = problems

    @classmethod
    def _check_pair(cls, problems, where, summary, games, tomorrow):
        if summary.get("total_matches") != len(games):
            problems.add("total_matches is not the number of games", where)
        results = [_result(g["goals_for_player"], g["goals_for_opponent"]) for g in games]
        counts = (results.count("W"), results.count("D"), results.count("L"))
        if counts != (summary["wins_player"], summary["draws"], summary["wins_opponent"]):
            problems.add("wins/draws/losses differ from the games", (where, counts))
        if sum(g["goals_for_player"] for g in games) != summary["goals_for_player"]:
            problems.add("goals for differ from the games", where)
        if sum(g["goals_for_opponent"] for g in games) != summary["goals_for_opponent"]:
            problems.add("goals against differ from the games", where)
        if "overtime_games" in summary:
            if sum(bool(g["overtime"]) for g in games) != summary["overtime_games"]:
                problems.add("overtime count differs from the games", where)
        dates = [g["date"] for g in games]
        if dates != sorted(dates):
            problems.add("games are not in date order", where)
        if dates and (
            dates[0] != summary["first_meeting_date"] or dates[-1] != summary["last_meeting_date"]
        ):
            problems.add("first/last meeting dates differ from the games", where)
        last_10 = summary.get("last_10")
        if last_10 is not None:
            recent = results[-10:]
            expected = {
                "wins": recent.count("W"), "losses": recent.count("L"), "draws": recent.count("D")
            }
            if last_10 != expected:
                problems.add("last_10 differs from the last ten games", where)
        for game in games:
            gf, ga = game["goals_for_player"], game["goals_for_opponent"]
            if not (isinstance(gf, int) and isinstance(ga, int)) or min(gf, ga) < 0:
                problems.add("score is not two non-negative integers", (where, gf, ga))
            elif max(gf, ga) > MAX_GOALS:
                problems.add(f"score above {MAX_GOALS} goals", (where, game["date"], gf, ga))
            if game["overtime"] and abs(gf - ga) != 1:
                problems.add("overtime game not won by one goal", (where, game["date"], gf, ga))
            if not game["date"] or not EARLIEST_DATE <= game["date"] <= tomorrow:
                problems.add("game date out of range", (where, game["date"]))
            if (game.get("stage_type") or "") not in STAGE_TYPES:
                problems.add("unknown stage type", (where, game.get("stage_type")))
            tournament_id = game.get("tournament_id")
            if tournament_id is not None and tournament_id not in cls.tournaments:
                problems.add("game links a tournament with no page", (where, tournament_id))

    def _assert_no(self, *checks):
        failing = [check for check in checks if self.problems.counts.get(check)]
        if failing:
            self.fail("\n\n".join(self.problems.report(check) for check in failing))

    # Player files

    def test_every_player_has_consistent_files(self):
        self._assert_no(
            "player without a file", "file names another player", "player without an og file",
            "og summary differs from h2h",
        )

    def test_opponents_are_real_players(self):
        self._assert_no(
            "player listed as own opponent", "opponent without a page",
            "opponent entry names another player",
        )

    def test_summaries_match_their_games(self):
        self._assert_no(
            "total_matches is not the number of games", "wins/draws/losses differ from the games",
            "goals for differ from the games", "goals against differ from the games",
            "overtime count differs from the games", "first/last meeting dates differ from the games",
            "last_10 differs from the last ten games", "games are not in date order",
        )

    def test_both_sides_of_a_pair_agree(self):
        self._assert_no("pair listed by one player only", "pair's two files disagree")

    def test_games_are_plausible(self):
        self._assert_no(
            "score is not two non-negative integers", f"score above {MAX_GOALS} goals",
            "overtime game not won by one goal", "game date out of range", "unknown stage type",
        )

    def test_games_link_existing_tournaments(self):
        self._assert_no("game links a tournament with no page")

    # Site-wide files

    def test_meta_counts_match_the_player_files(self):
        self.assertEqual(self.meta["players"], len(self.players))
        self.assertEqual(len(self.player_ids), len(self.players), "players.json repeats an id")
        self.assertEqual(self.meta["matches"] * 2, self.total_games)
        self.assertEqual(
            sum(source["matches"] for source in self.meta["sources"]), self.meta["matches"]
        )

    def test_leaderboard_matches_the_ratings(self):
        problems = []
        ids = [row["id"] for row in self.leaderboard_rows]
        if len(ids) != len(set(ids)):
            problems.append("leaderboard lists a player twice")
        ratings = [row["rating"] for row in self.leaderboard_rows]
        if ratings != sorted(ratings, reverse=True):
            problems.append("leaderboard is not sorted by rating")
        for row in self.leaderboard_rows:
            rating = self.ratings.get(row["id"])
            if row["id"] not in self.player_ids:
                problems.append(f"{row['id']} has no page")
            elif not rating:
                problems.append(f"{row['id']} has no rating in its file")
            elif (row["rating"], row["rd"], row["games"]) != (
                rating["rating"], rating["rd"], rating["games"]
            ):
                problems.append(f"{row['id']} differs from its file's rating")
        listed = set(ids)
        for group in self.alias_groups:
            if len(listed.intersection(group)) > 1:
                problems.append(f"alias group {group} is listed more than once")
            rated = {
                (self.ratings[pid] or {}).get("rating")
                for pid in group if self.ratings.get(pid)
            }
            if len(rated) > 1:
                problems.append(f"alias group {group} has different ratings {sorted(rated)}")
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))

    def test_rivalries_match_the_player_files(self):
        rivalries = _load(DATA_DIR / "rivalries.json")
        problems = []
        for kind, entries in rivalries.items():
            for entry in entries:
                p1, p2 = entry["p1"]["id"], entry["p2"]["id"]
                total = self.pair_totals.get(tuple(sorted((p1, p2))))
                if total is None:
                    problems.append(f"{kind}: {p1} v {p2} has no pair")
                    continue
                games, draws, wins_low, wins_high = total[:4]
                wins = (wins_low, wins_high) if p1 < p2 else (wins_high, wins_low)
                if (entry["games"], entry["draws"], entry["wins_p1"], entry["wins_p2"]) != (
                    games, draws, *wins
                ):
                    problems.append(f"{kind}: {p1} v {p2} differs from their files")
        most_played = [entry["games"] for entry in rivalries.get("most_played", [])]
        if most_played != sorted(most_played, reverse=True):
            problems.append("most_played is not sorted by games")
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))

    def test_records_name_real_players(self):
        records = _load(DATA_DIR / "records.json")
        for name, record in records.items():
            with self.subTest(record=name):
                self.assertGreater(record.get("games", record.get("days", 0)), 0)
                for role in ("player", "opponent"):
                    if role in record:
                        self.assertIsInstance(record[role]["id"], int)
                        self.assertTrue(record[role]["name"])

    # Tournaments

    def test_tournaments_are_in_their_buckets(self):
        self.assertFalse(self.bucket_problems, "\n".join(self.bucket_problems[:MAX_EXAMPLES]))

    def test_moved_tournaments_point_at_full_pages(self):
        problems = [
            f"{tid} moved to {tournament['moved_to']}, which is no full page"
            for tid, tournament in self.tournaments.items()
            if "moved_to" in tournament
            and "games" not in self.tournaments.get(tournament["moved_to"], {})
        ]
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))

    def test_tournament_list_matches_the_tournament_files(self):
        listing = _load(DATA_DIR / "tournament-list.json")
        fields = listing["fields"]
        problems = []
        for row in listing["tournaments"]:
            entry = dict(zip(fields, row))
            tournament = self.tournaments.get(entry["id"])
            if tournament is None:
                problems.append(f"{entry['id']} is listed but has no file")
                continue
            for field in ("name", "date", "games", "champion", "runner_up"):
                if entry[field] != tournament.get(field):
                    problems.append(f"{entry['id']} {field}: {entry[field]!r} vs "
                                    f"{tournament.get(field)!r}")
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))

    def test_standings_add_up(self):
        problems = []
        for tid, tournament in self.tournaments.items():
            players = tournament.get("players", {})
            for stage in tournament.get("round_robin", []):
                for group in stage.get("groups", []):
                    if sum(row["gf"] for row in group) != sum(row["ga"] for row in group):
                        problems.append(f"{tid} {stage['name']}: goals for != goals against")
                    if sum(row["w"] for row in group) != sum(row["l"] for row in group):
                        problems.append(f"{tid} {stage['name']}: wins != losses")
                    for row in group:
                        if row["p"] != row["w"] + row["d"] + row["l"]:
                            problems.append(f"{tid} {row['id']}: played != w + d + l")
                        if row["pts"] != 2 * row["w"] + row["d"]:
                            problems.append(f"{tid} {row['id']}: points != 2w + d")
                        if str(row["id"]) not in players:
                            problems.append(f"{tid} {row['id']}: standings player has no name")
            for role in ("champion", "runner_up"):
                if tournament.get(role) is not None and str(tournament[role]) not in players:
                    problems.append(f"{tid}: {role} has no name")
            if tournament.get("champion") is not None and (
                tournament.get("champion") == tournament.get("runner_up")
            ):
                problems.append(f"{tid}: champion is also runner-up")
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))

    def test_playoff_series_scores_match_their_games(self):
        problems = []
        for tid, tournament in self.tournaments.items():
            for bracket in tournament.get("brackets", []):
                series_lists = [r["series"] for r in bracket.get("rounds", [])]
                series_lists.append(bracket.get("other", []))
                for series_list in series_lists:
                    for series in series_list:
                        _, _, wins_a, wins_b, games = series[:5]
                        won_a = sum(1 for game in games if game[0] > game[1])
                        won_b = sum(1 for game in games if game[1] > game[0])
                        if (won_a, won_b) != (wins_a, wins_b):
                            problems.append(f"{tid}: series {series[:4]} has games {games}")
        self.assertFalse(problems, "\n".join(problems[:MAX_EXAMPLES]))


if __name__ == "__main__":
    unittest.main()
