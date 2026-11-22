#!/usr/bin/env python3
"""Compare the freshly built public/data with the dataset the live site serves.

Runs in CI after the build and before the deploy. It writes a report of what this build
changes (to stdout and, in GitHub Actions, the job summary) and fails when the change looks
like lost data rather than new results:

* fewer games, players or tournaments than the live site by more than a small margin,
* a source that disappeared or whose file lost more than a few percent of its games,
* past games that vanished from a sample of player files.

A game another source also reports is shown once, under one source and one tournament (see
deduplicate_overlapping_source_matches in build_h2h.py). When a source starts covering events
an earlier source already had, those games move to it: the earlier source's shown count falls
and the old tournament id becomes a `moved_to` page. Neither is lost data, so the source check
uses the rows each source file supplied (meta.json source_validation), and a past game counts
as kept when the same game (opponent, score, date within a few days, since sources can date
a multi-day event differently) is still there under another tournament.

New results only ever add games, so on the daily run these numbers should only grow. On a code
change with unchanged sources, every difference in the report comes from the code, so it shows
reviewers which stats the change moves. When a drop is intended (an alias merge, a deduplication
fix), set ALLOW_DATA_DRIFT=1 (CI does this for pull requests labelled "data-drift-ok" and for
pushes whose commit message contains "[data-drift-ok]"); the report is still written.

If the live site cannot be reached the check is skipped, so an outage never blocks a deploy.

Environment:
  DRIFT_BASE_URL       site to compare with (default SITE_URL or https://h2h.puck.no)
  ALLOW_DATA_DRIFT     1 to report without failing
  MAX_GAME_DROP        largest allowed fall in total games, as a fraction (default 0.005)
  MAX_PLAYER_DROP      same for players (default 0.01)
  MAX_TOURNAMENT_DROP  same for tournaments (default 0.01)
  MAX_SOURCE_DROP      same for any one source's games (default 0.05)
  MAX_HISTORY_LOSS     largest allowed share of sampled past games that vanish (default 0.01)
  DRIFT_SAMPLE_PLAYERS how many player files to compare game by game (default 12)
"""
import json
import os
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Tuple

import requests

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

from build_h2h import DATA_SOURCES, EXTRA_SOURCES  # noqa: E402

ROOT_DIR = SCRIPTS_DIR.parent
DATA_DIR = ROOT_DIR / "public" / "data"
TIMEOUT = 60
# Games in the last few weeks may still be corrected upstream; older ones should be stable.
HISTORY_SETTLE_DAYS = 30


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        raise SystemExit(f"{name} must be a number.") from None


def fetch(session: requests.Session, base: str, path: str):
    response = session.get(f"{base}/data/{path}", timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()


def load(path: str):
    with (DATA_DIR / path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def rows(payload: dict, key: str) -> dict:
    fields = payload["fields"]
    return {row[0]: dict(zip(fields, row)) for row in payload[key]}


def pct(new: float, old: float) -> str:
    if not old:
        return "new" if new else "0%"
    return f"{(new - old) / old:+.2%}"


def drop(new: float, old: float) -> float:
    return (old - new) / old if old else 0.0


# meta.json source_validation key of each source id: "primary" for Sportscorpion, else the
# EXTRA_SOURCES "key".
VALIDATION_KEYS = {
    DATA_SOURCES[0]["id"]: "primary",
    **{source["id"]: source["key"] for source in EXTRA_SOURCES},
}


def game_keys(payload: dict, before: str) -> Counter:
    """(opponent, date, tournament, goals for, goals against) of each game before a date."""
    keys = Counter()
    for opponent_id, opponent in payload.get("opponents", {}).items():
        for game in opponent.get("matches", []):
            if game["date"] < before:
                keys[(
                    opponent_id, game["date"], game.get("tournament_id"),
                    game["goals_for_player"], game["goals_for_opponent"],
                )] += 1
    return keys


# Two sources can date a multi-day event differently, so a game that moved to another
# source's tournament may also have moved by a day or two.
MOVED_DATE_DAYS = 3


def lost_games(old_keys: Counter, new_keys: Counter) -> Tuple[Counter, int]:
    """Games of old_keys that new_keys no longer has, and how many others only moved to
    another tournament (one source's copy of the game replaced by another's), possibly
    dated up to MOVED_DATE_DAYS apart.

    Keys are game_keys tuples: (opponent, date, tournament, goals for, goals against).
    """
    gone = old_keys - new_keys
    # Games this build has that live doesn't, by (opponent, goals for, goals against).
    spare: dict = {}
    for (opponent_id, day, _tournament, goals_for, goals_against), count in (
        new_keys - old_keys
    ).items():
        spare.setdefault((opponent_id, goals_for, goals_against), Counter())[
            date.fromisoformat(day)
        ] += count
    lost = Counter()
    moved = 0
    # Exact dates first, so a nearby date never takes a game an exact one needs.
    for max_shift in (0, MOVED_DATE_DAYS):
        for key in sorted(gone):
            opponent_id, day, _tournament, goals_for, goals_against = key
            days = spare.get((opponent_id, goals_for, goals_against), Counter())
            when = date.fromisoformat(day)
            for shift in sorted(range(-max_shift, max_shift + 1), key=abs):
                candidate = when + timedelta(days=shift)
                take = min(gone[key], days[candidate])
                if take:
                    days[candidate] -= take
                    gone[key] -= take
                    moved += take
    for key, count in gone.items():
        if count > 0:
            lost[key] = count
    return lost, moved


def source_rows(meta: dict) -> dict:
    """{source id: rows its file supplied before the cross-source dedupe}, where known."""
    validation = meta.get("source_validation") or {}
    out = {}
    for source_id, key in VALIDATION_KEYS.items():
        accepted = (validation.get(key) or {}).get("accepted_rows")
        if isinstance(accepted, int):
            out[source_id] = accepted
    return out


def sample_players(live_board: dict, new_ids: set, count: int) -> list:
    """The players with most games, then an even spread over the rest of the leaderboard."""
    candidates = [pid for pid in live_board if pid in new_ids]
    by_games = sorted(candidates, key=lambda pid: -live_board[pid]["games"])
    chosen = by_games[: max(1, count // 3)]
    rest = [pid for pid in candidates if pid not in chosen]
    step = max(1, len(rest) // max(1, count - len(chosen)))
    chosen += rest[::step][: count - len(chosen)]
    return chosen


def main() -> int:
    base = (
        os.environ.get("DRIFT_BASE_URL") or os.environ.get("SITE_URL") or "https://h2h.puck.no"
    ).rstrip("/")
    allow = os.environ.get("ALLOW_DATA_DRIFT", "").strip().casefold() in {"1", "true", "yes"}
    limits = {
        "games": env_float("MAX_GAME_DROP", 0.005),
        "players": env_float("MAX_PLAYER_DROP", 0.01),
        "tournaments": env_float("MAX_TOURNAMENT_DROP", 0.01),
        "source": env_float("MAX_SOURCE_DROP", 0.05),
        "history": env_float("MAX_HISTORY_LOSS", 0.01),
    }
    sample_size = int(os.environ.get("DRIFT_SAMPLE_PLAYERS", "12") or 12)

    session = requests.Session()
    session.headers["User-Agent"] = "table-hockey-h2h-ci"
    try:
        live_meta = fetch(session, base, "meta.json")
        live_players = fetch(session, base, "players.json")
        live_board = rows(fetch(session, base, "leaderboard.json"), "players")
        live_list = rows(fetch(session, base, "tournament-list.json"), "tournaments")
        live_records = fetch(session, base, "records.json")
    except (requests.RequestException, ValueError, KeyError) as exc:
        print(f"Could not read the live dataset from {base} ({exc}); skipping the drift check.")
        return 0

    meta = load("meta.json")
    players = load("players.json")
    board = rows(load("leaderboard.json"), "players")
    tournament_list = rows(load("tournament-list.json"), "tournaments")
    records = load("records.json")

    out: list[str] = []
    failures: list[str] = []
    out.append(f"## Data drift against {base}\n")
    out.append(
        f"Live data built {live_meta.get('generated_at', '?')}; this build "
        f"{meta.get('generated_at', '?')}.\n"
    )
    live_files = live_meta.get("source_files", {})
    new_files = meta.get("source_files", {})
    changed_sources = sorted(
        key for key in set(live_files) | set(new_files)
        if (live_files.get(key) or {}).get("sha256") != (new_files.get(key) or {}).get("sha256")
    )
    if changed_sources:
        out.append(f"Source files that changed since the live build: {', '.join(changed_sources)}. "
                   "Differences below mix new results with any code change.\n")
    else:
        out.append("**The source files are the same as the live build's, so every difference "
                   "below comes from code or config in this change.**\n")

    # Totals
    out.append("| | Live | This build | Change |\n|---|---:|---:|---:|")

    def total(label: str, old: int, new: int, limit_key: str | None = None) -> None:
        out.append(f"| {label} | {old:,} | {new:,} | {pct(new, old)} |")
        if limit_key and drop(new, old) > limits[limit_key]:
            failures.append(
                f"{label} fell from {old:,} to {new:,} ({pct(new, old)}); "
                f"the limit is -{limits[limit_key]:.1%}."
            )

    total("Games", live_meta.get("matches", 0), meta["matches"], "games")
    total("Players", len(live_players), len(players), "players")
    total("Tournaments", len(live_list), len(tournament_list), "tournaments")
    live_sources = {s["id"]: s["matches"] for s in live_meta.get("sources", [])}
    new_sources = {s["id"]: s["matches"] for s in meta.get("sources", [])}
    live_rows, new_rows = source_rows(live_meta), source_rows(meta)
    for source_id in sorted(set(live_sources) | set(new_sources)):
        old, new = live_sources.get(source_id, 0), new_sources.get(source_id, 0)
        # Shown games move between sources when two report the same event, so judge a
        # source by what its file supplied when both builds recorded that.
        by_rows = source_id in live_rows and source_id in new_rows
        total(f"Games from {source_id}", old, new, None if by_rows else "source")
        if old and not new:
            failures.append(f"Source {source_id} has no games in this build.")
    for source_id in sorted(set(live_rows) & set(new_rows) & (set(live_sources) | set(new_sources))):
        total(f"Rows in the {source_id} file", live_rows[source_id], new_rows[source_id], "source")
    out.append("")

    # Players
    live_ids = {int(p["id"]): p["name"] for p in live_players}
    new_ids = {int(p["id"]): p["name"] for p in players}
    removed = sorted(set(live_ids) - set(new_ids))
    added = sorted(set(new_ids) - set(live_ids))
    renamed = [pid for pid in set(live_ids) & set(new_ids) if live_ids[pid] != new_ids[pid]]
    out.append(f"**Players:** {len(added)} added, {len(removed)} removed, {len(renamed)} renamed.")
    for pid in removed[:10]:
        out.append(f"- removed {live_ids[pid]} ({pid})")
    for pid in sorted(renamed)[:10]:
        out.append(f"- renamed {live_ids[pid]} → {new_ids[pid]} ({pid})")
    out.append("")

    # Ratings and games per player
    common = [pid for pid in board if pid in live_board]
    fewer = sorted(
        (pid for pid in common if board[pid]["games"] < live_board[pid]["games"]),
        key=lambda pid: board[pid]["games"] - live_board[pid]["games"],
    )
    moved = sorted(
        (pid for pid in common if board[pid]["rating"] != live_board[pid]["rating"]),
        key=lambda pid: -abs(board[pid]["rating"] - live_board[pid]["rating"]),
    )
    out.append(
        f"**Leaderboard:** {len(common):,} players on both; {len(moved):,} have a different "
        f"rating; {len(fewer):,} have fewer rated games than live."
    )
    if moved:
        out.append("\n| Player | Live rating | This build | Games live → now |\n|---|---:|---:|---:|")
        for pid in moved[:10]:
            old, new = live_board[pid], board[pid]
            out.append(f"| {new['name']} | {old['rating']} | {new['rating']} | "
                       f"{old['games']} → {new['games']} |")
    if fewer:
        out.append("\nFewest games compared with live:")
        for pid in fewer[:10]:
            out.append(f"- {board[pid]['name']} ({pid}): {live_board[pid]['games']} → "
                       f"{board[pid]['games']}")
    out.append("")

    # Tournaments
    gone = sorted(set(live_list) - set(tournament_list))
    settled = (date.today() - timedelta(days=HISTORY_SETTLE_DAYS)).isoformat()
    result_changes = [
        tid for tid in set(live_list) & set(tournament_list)
        if (live_list[tid]["date"] or "") < settled and any(
            live_list[tid][field] != tournament_list[tid][field]
            for field in ("games", "champion", "runner_up")
        )
    ]
    out.append(
        f"**Tournaments:** {len(set(tournament_list) - set(live_list))} added, {len(gone)} "
        f"removed, {len(result_changes)} older than {HISTORY_SETTLE_DAYS} days with a different "
        "game count, champion or runner-up."
    )
    for tid in gone[:10]:
        out.append(f"- removed {live_list[tid]['name']} ({tid})")
    for tid in sorted(result_changes)[:10]:
        old, new = live_list[tid], tournament_list[tid]
        out.append(
            f"- {new['name']} ({tid}): games {old['games']} → {new['games']}, champion "
            f"{old['champion']} → {new['champion']}, runner-up {old['runner_up']} → "
            f"{new['runner_up']}"
        )
    out.append("")

    # Records
    changed_records = [key for key in set(records) | set(live_records)
                       if records.get(key) != live_records.get(key)]
    out.append(f"**Records:** {len(changed_records)} changed"
               + (f" ({', '.join(sorted(changed_records))})." if changed_records else "."))
    out.append("")

    # Past games, game by game, for a sample of players
    sample = sample_players(live_board, set(new_ids), sample_size)
    lost_total = checked_total = moved_total = 0
    lost_examples = []
    for pid in sample:
        try:
            live_payload = fetch(session, base, f"h2h/{pid}.json")
        except (requests.RequestException, ValueError) as exc:
            out.append(f"- could not read live h2h/{pid}.json ({exc})")
            continue
        old_keys = game_keys(live_payload, settled)
        new_keys = game_keys(load(f"h2h/{pid}.json"), settled)
        lost, moved = lost_games(old_keys, new_keys)
        checked_total += sum(old_keys.values())
        lost_total += sum(lost.values())
        moved_total += moved
        for key in list(lost)[:2]:
            lost_examples.append(f"{new_ids.get(pid, pid)} v {key[0]} on {key[1]} "
                                 f"(tournament {key[2]}, {key[3]}-{key[4]})")
    share = lost_total / checked_total if checked_total else 0.0
    out.append(
        f"**Past games** (before {settled}) in {len(sample)} sampled player files: "
        f"{checked_total:,} checked, {lost_total:,} missing from this build ({share:.2%}); "
        f"{moved_total:,} more are now listed under another source's tournament."
    )
    for example in lost_examples[:10]:
        out.append(f"- missing: {example}")
    if share > limits["history"]:
        failures.append(
            f"{lost_total:,} of {checked_total:,} sampled past games ({share:.2%}) are gone; "
            f"the limit is {limits['history']:.1%}."
        )
    out.append("")

    if failures:
        verdict = "allowed (ALLOW_DATA_DRIFT)" if allow else "failed"
        out.append(f"### Drift check {verdict}\n")
        out.extend(f"- {failure}" for failure in failures)
        if not allow:
            out.append(
                "\nIf this drop is intended, label the pull request `data-drift-ok` (or put "
                "`[data-drift-ok]` in the commit message on main) and re-run."
            )
    else:
        out.append("### Drift check passed")

    report = "\n".join(out) + "\n"
    print(report)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as handle:
            handle.write(report)
    return 1 if failures and not allow else 0


if __name__ == "__main__":
    sys.exit(main())
