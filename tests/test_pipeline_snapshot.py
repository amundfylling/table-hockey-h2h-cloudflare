"""Build a small committed fixture end to end and compare the result with a snapshot.

The fixture (tests/fixtures/pipeline/) is a few whole tournaments cut from the real sources, so
the full pipeline runs in a couple of seconds: download cache in, every published file out.
tests/snapshots/pipeline.json holds the readable stats the site shows (player records, ratings,
leaderboard, records, rivalries, tournament results, source counts) plus a hash of every
output, so any change to a computed number shows up here, in review, before it reaches the site.

When a change to the numbers is intended, refresh the snapshot and commit it with the change:

    UPDATE_SNAPSHOTS=1 python -m unittest tests.test_pipeline_snapshot
"""
import difflib
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT_DIR / "tests" / "fixtures" / "pipeline"
SNAPSHOT_PATH = ROOT_DIR / "tests" / "snapshots" / "pipeline.json"
BUILD_ENV = {
    "SKIP_DOWNLOADS": "1",
    "BUILD_DATE": "2026-11-16",
    "MIN_MATCHES": "5",
    "PYTHONHASHSEED": "0",
}


def build_fixture(work_dir: Path, **extra_env: str) -> Path:
    shutil.copytree(FIXTURE_DIR / "cache", work_dir / ".cache")
    (work_dir / "public").mkdir()
    shutil.copy(FIXTURE_DIR / "aliases.json", work_dir / "public" / "aliases.json")
    env = {key: value for key, value in os.environ.items() if not key.startswith("GITHUB_")}
    # Settings the CI build sets must not leak into the fixture build.
    for key in list(env):
        if (key.startswith(("REQUIRE_", "MIN_", "MAX_", "SKIP_IF_", "ITHF_"))
                or key.endswith("_URL")):
            del env[key]
    env.update(BUILD_ENV, H2H_WORK_DIR=str(work_dir), **extra_env)
    result = subprocess.run(
        [sys.executable, str(ROOT_DIR / "scripts" / "build_h2h.py")],
        cwd=ROOT_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode:
        raise AssertionError(
            f"Fixture build failed ({result.returncode}):\n{result.stdout[-3000:]}\n"
            f"{result.stderr[-3000:]}"
        )
    return work_dir / "public"


def _load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _digest(paths) -> str:
    digest = hashlib.sha256()
    for path, root in paths:
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def summarize(public: Path) -> dict:
    data = public / "data"
    players = _load(data / "players.json")
    meta = _load(data / "meta.json")

    player_rows = []
    for player in sorted(players, key=lambda item: item["id"]):
        payload = _load(data / "h2h" / f"{player['id']}.json")
        games = wins = draws = losses = goals_for = goals_against = 0
        for opponent in payload["opponents"].values():
            summary = opponent["summary"]
            games += summary["total_matches"]
            wins += summary["wins_player"]
            draws += summary["draws"]
            losses += summary["wins_opponent"]
            goals_for += summary["goals_for_player"]
            goals_against += summary["goals_for_opponent"]
        rating = payload.get("rating") or {}
        player_rows.append([
            player["id"], player["name"], player.get("country", ""), player.get("world_rank"),
            games, len(payload["opponents"]), wins, draws, losses, goals_for, goals_against,
            rating.get("rating"), rating.get("rd"), (rating.get("peak") or {}).get("rating"),
        ])

    tournament_rows = []
    for path in sorted((data / "t").glob("*.json")):
        for tid, tournament in sorted(_load(path).items(), key=lambda item: int(item[0])):
            if "moved_to" in tournament:
                tournament_rows.append([int(tid), "moved to", tournament["moved_to"]])
                continue
            groups = [
                len(group)
                for stage in tournament.get("round_robin", [])
                for group in stage.get("groups", [])
            ]
            series = sum(
                len(round_["series"])
                for bracket in tournament.get("brackets", [])
                for round_ in bracket.get("rounds", [])
            )
            tournament_rows.append([
                int(tid), tournament["name"], tournament.get("date"), tournament.get("games"),
                tournament.get("goals"), tournament.get("champion"), tournament.get("runner_up"),
                groups, series, len(tournament.get("upsets", [])),
            ])

    outputs = {}
    for path in sorted(data.glob("*.json")):
        outputs[f"data/{path.name}"] = _digest([(path, data)])
    for folder in ("h2h", "og", "t"):
        files = sorted((data / folder).glob("*.json"))
        outputs[f"data/{folder}/ ({len(files)} files)"] = _digest((p, data) for p in files)
    sitemaps = [public / "sitemap.xml", *sorted((public / "sitemaps").glob("*.xml"))]
    outputs[f"sitemaps ({len(sitemaps)} files)"] = _digest((p, public) for p in sitemaps)

    meta_summary = {key: value for key, value in meta.items() if key != "source_files"}
    return {
        "meta": meta_summary,
        "players [id, name, country, world_rank, games, opponents, W, D, L, GF, GA, rating, rd, peak]":
            player_rows,
        "leaderboard": _load(data / "leaderboard.json"),
        "records": _load(data / "records.json"),
        "rivalries": _load(data / "rivalries.json"),
        "tournaments [id, name, date, games, goals, champion, runner_up, group sizes, playoff series, upsets]":
            tournament_rows,
        "tournament_list": _load(data / "tournament-list.json")["tournaments"],
        "output_hashes": outputs,
    }


def render(snapshot: dict) -> str:
    """JSON with one list item per line, so a changed number is a one-line diff."""
    lines = ["{"]
    keys = list(snapshot)
    for index, key in enumerate(keys):
        value = snapshot[key]
        comma = "," if index < len(keys) - 1 else ""
        name = json.dumps(key, ensure_ascii=False)
        if isinstance(value, list):
            lines.append(f"  {name}: [")
            for item_index, item in enumerate(value):
                item_comma = "," if item_index < len(value) - 1 else ""
                lines.append(f"    {json.dumps(item, ensure_ascii=False)}{item_comma}")
            lines.append(f"  ]{comma}")
        else:
            body = json.dumps(value, ensure_ascii=False, indent=2).replace("\n", "\n  ")
            lines.append(f"  {name}: {body}{comma}")
    lines.append("}")
    return "\n".join(lines) + "\n"


class PipelineSnapshotTest(unittest.TestCase):
    def test_fixture_build_matches_snapshot(self):
        with tempfile.TemporaryDirectory() as work:
            actual = render(summarize(build_fixture(Path(work))))
        if os.environ.get("UPDATE_SNAPSHOTS"):
            SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
            SNAPSHOT_PATH.write_text(actual, encoding="utf-8")
            return
        if not SNAPSHOT_PATH.exists():
            self.fail(f"{SNAPSHOT_PATH} is missing; run with UPDATE_SNAPSHOTS=1 to create it.")
        expected = SNAPSHOT_PATH.read_text(encoding="utf-8")
        if actual == expected:
            return
        diff = list(difflib.unified_diff(
            expected.splitlines(), actual.splitlines(), "snapshot", "this build", lineterm="", n=1
        ))
        shown = "\n".join(diff[:120])
        more = f"\n...and {len(diff) - 120} more diff lines." if len(diff) > 120 else ""
        self.fail(
            "The fixture build no longer matches tests/snapshots/pipeline.json, so this change "
            "alters computed stats or published files.\nIf that is intended, run "
            "`UPDATE_SNAPSHOTS=1 python -m unittest tests.test_pipeline_snapshot` and commit "
            f"the snapshot.\n\n{shown}{more}"
        )

    def test_the_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            one = summarize(build_fixture(Path(first)))["output_hashes"]
            # A different hash seed catches output that depends on set or dict ordering.
            two = summarize(build_fixture(Path(second), PYTHONHASHSEED="1"))["output_hashes"]
        self.assertEqual(one, two, "Two builds of the same sources wrote different files.")


if __name__ == "__main__":
    unittest.main()
