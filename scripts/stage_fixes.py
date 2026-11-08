"""Fixes to tournament stage data that the sources get wrong."""
from typing import List, Tuple

import pandas as pd

import tournaments as tournament_pages

# A later round-robin stage is a copy of earlier results when at least this share of the
# pairs that already met earlier in the tournament show the same score again, over at least
# this many pairs. Real rematches repeat the score about 5% of the time.
CARRIED_MIN_SHARE = 0.6
CARRIED_MIN_PAIRS = 10


def apply_date_overrides(matches: pd.DataFrame) -> int:
    """Correct game dates of tournaments listed in tournaments.DATE_OVERRIDES."""
    if "tournament_id" not in matches or "date" not in matches:
        return 0
    changed = 0
    for tid, date in tournament_pages.DATE_OVERRIDES.items():
        rows = matches["tournament_id"].eq(tid).fillna(False).astype(bool)
        if not rows.any():
            continue
        changed += int(rows.sum())
        matches.loc[rows, "date"] = date
        if "date_dt" in matches:
            matches.loc[rows, "date_dt"] = pd.Timestamp(date)
    return changed


def mark_team_stages(matches: pd.DataFrame) -> int:
    """Set stage_type to round-robin for games of team events (TournamentType "Team").

    Team events list team matches, not knockout series, and their names are often not in
    English, so the "team" name check misses them. Returns the number of games changed.
    """
    if "TournamentType" not in matches or "stage_type" not in matches:
        return 0
    team = matches["TournamentType"].astype("string").str.strip().str.casefold().eq("team")
    team = team.fillna(False).astype(bool)
    changed = team & matches["stage_type"].astype("string").ne("round-robin").fillna(True)
    matches.loc[team, "stage_type"] = "round-robin"
    return int(changed.sum())


def drop_carried_over_copies(matches: pd.DataFrame) -> Tuple[pd.DataFrame, List[dict]]:
    """Drop final-group games that copy a game from an earlier group of the same tournament.

    In the ITHF format players take their results against the others from their basic group
    into the final group. Some sources store those results a second time in the final group
    (same pair, same score), so the game would count twice. A later round-robin stage loses
    its copies when CARRIED_MIN_SHARE of its earlier-met pairs repeat the score, over at
    least CARRIED_MIN_PAIRS pairs. Returns the frame and one entry per cleaned stage.
    """
    needed = {"tournament_id", "stage", "stage_sequence", "stage_type", "id1", "id2",
              "goals_id1", "goals_id2"}
    if matches.empty or not needed.issubset(matches.columns):
        return matches, []
    names = matches["tournament_name"] if "tournament_name" in matches else pd.Series(
        "", index=matches.index)
    kinds = {}
    is_rr = []
    for stage_type, stage, name in zip(matches["stage_type"].tolist(),
                                       matches["stage"].tolist(), names.tolist()):
        key = (stage_type, stage, name)
        kind = kinds.get(key)
        if kind is None:
            kind = kinds[key] = tournament_pages.classify_stage(stage_type, stage, name)
        is_rr.append(kind == "round-robin")
    rr = matches.loc[is_rr, ["tournament_id", "stage", "stage_sequence", "id1", "id2",
                             "goals_id1", "goals_id2"]].copy()
    if "stage_id" in matches:
        stage_ids = matches.loc[rr.index, "stage_id"].astype("string")
        rr["stage_key"] = stage_ids.fillna("name:" + rr["stage"].astype("string"))
    else:
        rr["stage_key"] = "name:" + rr["stage"].astype("string")
    rr = rr[rr["tournament_id"].notna() & rr["stage_sequence"].notna()]
    rr["seq"] = pd.to_numeric(rr["stage_sequence"], errors="coerce")
    rr = rr[rr["seq"].notna()]
    # id1/id2 and their goals are already in a fixed player order, so a pair and its score
    # compare directly.
    rr["row"] = rr.index
    first_seq = rr.groupby("tournament_id")["seq"].transform("min")
    later = rr[rr["seq"] > first_seq]
    if later.empty:
        return matches, []
    pairs = later[["tournament_id", "id1", "id2"]].drop_duplicates()
    candidates = rr.merge(pairs, on=["tournament_id", "id1", "id2"])
    joined = later.merge(
        candidates[["tournament_id", "id1", "id2", "seq", "goals_id1", "goals_id2"]],
        on=["tournament_id", "id1", "id2"],
        suffixes=("", "_earlier"),
    )
    joined = joined[joined["seq_earlier"] < joined["seq"]]
    if joined.empty:
        return matches, []
    joined["same"] = (joined["goals_id1"] == joined["goals_id1_earlier"]) & (
        joined["goals_id2"] == joined["goals_id2_earlier"])
    per_row = joined.groupby("row").agg(
        tournament_id=("tournament_id", "first"),
        stage_key=("stage_key", "first"),
        stage=("stage", "first"),
        same=("same", "any"),
    )
    per_stage = per_row.groupby(["tournament_id", "stage_key"]).agg(
        stage=("stage", "first"), pairs=("same", "size"), copies=("same", "sum"))
    copied = per_stage[(per_stage["pairs"] >= CARRIED_MIN_PAIRS)
                       & (per_stage["copies"] >= CARRIED_MIN_SHARE * per_stage["pairs"])]
    if copied.empty:
        return matches, []
    keys = set(copied.index)
    drop = [row for row, item in per_row.iterrows()
            if item["same"] and (item["tournament_id"], item["stage_key"]) in keys]
    report = [
        {"tournament_id": int(tid), "stage": item["stage"], "dropped": int(item["copies"]),
         "pairs": int(item["pairs"])}
        for (tid, _), item in copied.iterrows()
    ]
    return matches.drop(index=drop).reset_index(drop=True), report
