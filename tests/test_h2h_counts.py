import json
import unittest
from pathlib import Path

import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "public" / "data"
H2H_DIR = DATA_DIR / "h2h"
PLAYERS_PATH = DATA_DIR / "players.json"
MATCHES_PATH = ROOT_DIR / ".cache" / "scraped_matches.parquet"


def load_player_totals(player_ids):
    totals = {}
    errors = []
    for player_id in player_ids:
        path = H2H_DIR / f"{player_id}.json"
        if not path.exists():
            errors.append(f"Missing H2H file for player {player_id}.")
            continue
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        opponents = payload.get("opponents", {})
        total = 0
        for opponent_id, opponent_payload in opponents.items():
            summary = opponent_payload.get("summary", {})
            matches = opponent_payload.get("matches", [])
            if not isinstance(matches, list):
                errors.append(
                    f"Player {player_id} vs {opponent_id}: matches is not a list."
                )
                continue
            total_matches = summary.get("total_matches")
            if not isinstance(total_matches, int):
                errors.append(
                    f"Player {player_id} vs {opponent_id}: total_matches missing or not int."
                )
                continue
            if total_matches != len(matches):
                errors.append(
                    f"Player {player_id} vs {opponent_id}: total_matches={total_matches} "
                    f"but matches has {len(matches)} entries."
                )
            total += total_matches
        totals[player_id] = total
    return totals, errors


class TestH2HCounts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not PLAYERS_PATH.exists():
            raise FileNotFoundError("players.json missing. Run scripts/build_h2h.py first.")
        if not H2H_DIR.exists():
            raise FileNotFoundError("public/data/h2h missing. Run scripts/build_h2h.py first.")

        with PLAYERS_PATH.open("r", encoding="utf-8") as handle:
            players = json.load(handle)
        cls.player_ids = []
        for player in players:
            raw_id = player.get("id")
            try:
                player_id = int(raw_id)
            except (TypeError, ValueError):
                continue
            cls.player_ids.append(player_id)
        cls.player_id_set = set(cls.player_ids)
        cls.player_totals, cls.internal_errors = load_player_totals(cls.player_ids)

    def test_internal_match_counts(self):
        if self.internal_errors:
            preview = "\n".join(self.internal_errors[:20])
            extra = ""
            if len(self.internal_errors) > 20:
                extra = f"\n...and {len(self.internal_errors) - 20} more."
            self.fail(f"Found match count issues:\n{preview}{extra}")

    def test_counts_match_source_parquet(self):
        if not MATCHES_PATH.exists():
            self.skipTest("No cached matches parquet found; skipping source count check.")

        matches = pd.read_parquet(
            MATCHES_PATH, engine="pyarrow", columns=["Player1ID", "Player2ID"]
        )
        matches = matches.rename(
            columns={"Player1ID": "player1_id", "Player2ID": "player2_id"}
        )
        matches["player1_id"] = pd.to_numeric(matches["player1_id"], errors="coerce")
        matches["player2_id"] = pd.to_numeric(matches["player2_id"], errors="coerce")
        matches = matches.dropna(subset=["player1_id", "player2_id"])
        matches["player1_id"] = matches["player1_id"].astype(int)
        matches["player2_id"] = matches["player2_id"].astype(int)

        eligible = self.player_id_set
        matches = matches[
            matches["player1_id"].isin(eligible) & matches["player2_id"].isin(eligible)
        ]
        counts = pd.concat([matches["player1_id"], matches["player2_id"]]).value_counts()
        expected_counts = {int(pid): int(count) for pid, count in counts.items()}

        mismatches = []
        for player_id in self.player_ids:
            expected = expected_counts.get(player_id, 0)
            actual = self.player_totals.get(player_id, 0)
            if actual != expected:
                mismatches.append(
                    f"Player {player_id}: expected {expected}, got {actual}."
                )

        if mismatches:
            preview = "\n".join(mismatches[:20])
            extra = ""
            if len(mismatches) > 20:
                extra = f"\n...and {len(mismatches) - 20} more."
            self.fail(f"Player match counts do not match source data:\n{preview}{extra}")
