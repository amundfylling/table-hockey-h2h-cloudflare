#!/usr/bin/env python3
import json
import hashlib
import os
import re
import sys
import shutil
import unicodedata
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple
from urllib.parse import urlparse

import numpy as np
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import download as dl  # noqa: E402

CACHE_DIR = ROOT_DIR / ".cache"
PUBLIC_DIR = ROOT_DIR / "public"
DATA_DIR = PUBLIC_DIR / "data"
H2H_DIR = DATA_DIR / "h2h"
OG_H2H_DIR = DATA_DIR / "og"
DATA_STAGING_DIR = ROOT_DIR / ".data-build"
DATA_BACKUP_DIR = ROOT_DIR / ".data-previous"
RANKING_HEADER = "Rank ID_Player Player Club Nation Points Player_Value"
RANKING_ROW_RE = re.compile(
    r"(?:^|\s)(\d+)\s+(\d+)\s+(.+?)\s+([A-Z]{3})\s+(\d+)\s+(\d+)"
    r"(?=\s+\d+\s+\d+\s+|$)",
    re.DOTALL,
)


def normalize_search_key(value: Optional[str]) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    return text.lower()


def to_int(series: pd.Series) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    numeric = numeric.replace([float("inf"), float("-inf")], pd.NA)
    if pd.api.types.is_float_dtype(numeric):
        numeric = numeric.where(numeric.isna() | (numeric == numeric.round(0)))
    return numeric.astype("Int64")


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    # json.dumps uses the C encoder; json.dump streams through the pure-Python
    # one and is several times slower on the per-player files. No fsync: the
    # whole dataset is published by swapping the staging directory.
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    temporary_path.write_text(text, encoding="utf-8")
    temporary_path.replace(path)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_data_staging(
    data_dir: Path = DATA_DIR,
    staging_dir: Path = DATA_STAGING_DIR,
    backup_dir: Path = DATA_BACKUP_DIR,
) -> None:
    """Prepare a clean output tree while keeping the last complete dataset live."""
    if not data_dir.exists() and backup_dir.exists():
        backup_dir.replace(data_dir)
    elif backup_dir.exists():
        shutil.rmtree(backup_dir)
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True)


def publish_staged_data(
    data_dir: Path = DATA_DIR,
    staging_dir: Path = DATA_STAGING_DIR,
    backup_dir: Path = DATA_BACKUP_DIR,
) -> None:
    """Swap a complete staged dataset into place, restoring the old one on failure."""
    if backup_dir.exists():
        shutil.rmtree(backup_dir)
    if data_dir.exists():
        data_dir.replace(backup_dir)
    try:
        staging_dir.replace(data_dir)
    except Exception:
        if backup_dir.exists() and not data_dir.exists():
            backup_dir.replace(data_dir)
        raise
    if backup_dir.exists():
        shutil.rmtree(backup_dir)


def enforce_rejection_budget(label: str, metrics: dict, maximum_rate: float) -> None:
    input_rows = int(metrics.get("input_rows", 0))
    dropped_rows = int(metrics.get("dropped_rows", 0))
    rejection_rate = dropped_rows / input_rows if input_rows else 0.0
    metrics["rejection_rate"] = round(rejection_rate, 6)
    if rejection_rate > maximum_rate:
        raise RuntimeError(
            f"{label} rejected {rejection_rate:.1%} of source rows; "
            f"maximum allowed is {maximum_rate:.1%}."
        )


def normalize_tournament_level(value: object) -> Optional[str]:
    if pd.isna(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "na", "n/a"}:
        return None
    try:
        numeric = float(text)
    except ValueError:
        return text
    if numeric.is_integer():
        return str(int(numeric))
    return str(numeric)


def clean_optional_string(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalize_dedupe_text(value: object) -> str:
    """Normalize an event label without discarding non-Latin alphabets."""
    if pd.isna(value):
        return ""
    text = unicodedata.normalize("NFKD", str(value).strip())
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = text.casefold()
    return re.sub(r"[\W_]+", " ", text, flags=re.UNICODE).strip()


def build_unique_player_name_index(players: Iterable[dict]) -> Dict[str, int]:
    """Return exact normalized names that identify one and only one player."""
    candidates: Dict[str, set[int]] = {}
    for player in players:
        name_key = normalize_dedupe_text(player.get("name", ""))
        if name_key:
            candidates.setdefault(name_key, set()).add(int(player["id"]))
    return {
        name_key: next(iter(player_ids))
        for name_key, player_ids in candidates.items()
        if len(player_ids) == 1
    }


def first_existing_column(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    return next((column for column in candidates if column in df.columns), None)


def parse_ranking_date(text: str) -> str:
    match = re.search(
        r"ranking\s+up\s+to\s+(\d{1,2})\.(\d{1,2})\.(\d{4})",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return ""
    day, month, year = match.groups()
    return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"


def load_rankings(ranking_path: Path) -> Dict[int, dict]:
    text = ranking_path.read_text(encoding="utf-8-sig")
    ranking_as_of = parse_ranking_date(text)
    compact = re.sub(r"\s+", " ", text).strip()
    if RANKING_HEADER in compact:
        compact = compact.split(RANKING_HEADER, 1)[1].strip()

    rankings: Dict[int, dict] = {}
    for match in RANKING_ROW_RE.finditer(compact):
        rank, player_id, _name_and_club, nation, points, player_value = match.groups()
        ranking_id = int(player_id)
        rankings[ranking_id] = {
            "world_rank": int(rank),
            "ranking_points": int(points),
            "ranking_player_value": int(player_value),
            "ranking_nation": nation,
            "ranking_as_of": ranking_as_of,
        }
    return rankings


def load_players(
    players_path: Path, rankings: Optional[Dict[int, dict]] = None
) -> Tuple[Iterable[dict], Dict[int, str]]:
    rankings = rankings or {}
    players_df = pd.read_csv(players_path)
    players_df = players_df.rename(
        columns={
            "PlayerID": "id",
            "Name": "name",
            "RankingID": "ranking_id",
            "Country": "country",
            "City": "city",
            "DateOfBirth": "date_of_birth",
            "Sex": "sex",
        }
    )
    players_df["id"] = to_int(players_df["id"])
    players_df = players_df.loc[players_df["id"].notna() & players_df["id"].gt(0)].copy()
    players_df["id"] = players_df["id"].astype("int64")
    duplicate_ids = int(players_df.duplicated("id", keep="last").sum())
    if duplicate_ids:
        print(f"Dropped {duplicate_ids} duplicate player records.")
        players_df = players_df.drop_duplicates("id", keep="last")
    if "ranking_id" in players_df:
        players_df["ranking_id"] = to_int(players_df["ranking_id"])
    else:
        players_df["ranking_id"] = pd.Series([pd.NA] * len(players_df), index=players_df.index)

    players_df["name"] = players_df["name"].fillna("").astype(str).str.strip()
    blank_names = players_df["name"].eq("") | players_df["name"].map(
        normalize_dedupe_text
    ).eq("")
    if blank_names.any():
        print(f"Assigned fallback names to {int(blank_names.sum())} player records.")
        players_df.loc[blank_names, "name"] = players_df.loc[blank_names, "id"].map(
            lambda player_id: f"Player {int(player_id)}"
        )
    players_df["search_key"] = players_df["name"].apply(normalize_search_key)
    players_df = players_df.sort_values(by="name", key=lambda s: s.str.lower())

    players = []
    id_to_name = {}
    for row in players_df.itertuples(index=False):
        ranking_id = int(row.ranking_id) if pd.notna(row.ranking_id) else None
        payload = {
            "id": int(row.id),
            "name": row.name if pd.notna(row.name) else "",
            "ranking_id": ranking_id,
            "world_rank": None,
            "ranking_points": None,
            "ranking_player_value": None,
            "ranking_nation": "",
            "ranking_as_of": "",
            "country": row.country if pd.notna(row.country) else "",
            "city": row.city if pd.notna(row.city) else "",
            "date_of_birth": row.date_of_birth if pd.notna(row.date_of_birth) else "",
            "sex": row.sex if pd.notna(row.sex) else "",
            "search_key": row.search_key,
        }
        if ranking_id in rankings:
            payload.update(rankings[ranking_id])
        players.append(payload)
        id_to_name[int(row.id)] = payload["name"]
    return players, id_to_name


def load_tournament_levels(metadata_path: Path) -> Dict[int, Optional[str]]:
    if not metadata_path.exists():
        return {}

    metadata_df = pd.read_csv(metadata_path)
    id_col = first_existing_column(
        metadata_df, ["TournamentID", "ID", "tournament_id", "id"]
    )
    level_col = first_existing_column(
        metadata_df, ["Level", "TournamentLevel", "tournament_level", "level"]
    )
    if not id_col or not level_col:
        return {}

    metadata_df[id_col] = to_int(metadata_df[id_col])
    metadata_df = metadata_df.loc[
        metadata_df[id_col].notna() & metadata_df[id_col].gt(0)
    ].copy()
    metadata_df[id_col] = metadata_df[id_col].astype("int64")

    levels: Dict[int, Optional[str]] = {}
    for row in metadata_df[[id_col, level_col]].itertuples(index=False):
        levels[int(row[0])] = normalize_tournament_level(row[1])
    return levels


def load_tournaments(
    tournaments_path: Path, tournament_levels: Optional[Dict[int, Optional[str]]] = None
) -> Iterable[dict]:
    tournament_levels = tournament_levels or {}
    tourneys_df = pd.read_csv(tournaments_path)
    tourneys_df = tourneys_df.rename(columns={"ID": "id", "Name": "name", "Type": "type"})
    tourneys_df["id"] = to_int(tourneys_df["id"])
    tourneys_df = tourneys_df.loc[
        tourneys_df["id"].notna() & tourneys_df["id"].gt(0)
    ].copy()
    tourneys_df["id"] = tourneys_df["id"].astype("int64")
    tourneys_df = tourneys_df.drop_duplicates("id", keep="last")
    tourneys_df["name"] = tourneys_df["name"].fillna("").astype(str).str.strip()
    tourneys_df = tourneys_df.sort_values(by="name", key=lambda s: s.str.lower())

    tournaments = []
    for row in tourneys_df.itertuples(index=False):
        tournaments.append(
            {
                "id": int(row.id),
                "name": row.name if pd.notna(row.name) else "",
                "type": row.type if pd.notna(row.type) else "",
                "level": tournament_levels.get(int(row.id)),
            }
        )
    return tournaments


# Supplemental result sources, each a Parquet in the bordshockey.net-scraper schema. Rows are
# told apart by their "source" column (see DATA_SOURCES). url_env overrides the URL; an empty
# value disables the source. "key" names the source in meta.json.
EXTRA_SOURCES = [
    {
        "id": "bordshockey",
        "key": "supplemental",
        "url_env": "EXTRA_MATCHES_URL",
        "url": (
            "https://raw.githubusercontent.com/amundfylling/bordshockey.net-scraper/"
            "refs/heads/main/data/bordshockey_results.parquet"
        ),
        "cache_name": "extra_matches.parquet",
    },
    {
        "id": "table-hockey-eu",
        "key": "table_hockey_eu",
        "url_env": "TABLE_HOCKEY_EU_MATCHES_URL",
        "url": (
            "https://raw.githubusercontent.com/amundfylling/table-hockey-eu-fetch/"
            "refs/heads/main/data/table_hockey_eu_results.parquet"
        ),
        "cache_name": "table_hockey_eu_matches.parquet",
    },
]
EXTRA_MATCHES_URL = EXTRA_SOURCES[0]["url"]


def extra_source_url(source: dict) -> str:
    return os.environ.get(source["url_env"], source["url"]).strip()


# Source websites listed in the site footer. "marker" is matched against a row's lowercased
# "source" column; rows matching no marker come from the primary source (Sportscorpion).
DATA_SOURCES = [
    {"id": "sportscorpion", "name": "th.sportscorpion.com", "url": "https://th.sportscorpion.com/"},
    {
        "id": "bordshockey",
        "name": "resultat.bordshockey.se",
        "url": "https://resultat.bordshockey.se/",
        "marker": "bordshockey",
    },
    {
        "id": "table-hockey-eu",
        "name": "table-hockey.eu",
        "url": "https://table-hockey.eu/",
        "marker": "table-hockey.eu",
    },
]


def classify_sources(source: pd.Series) -> pd.Series:
    """DATA_SOURCES id for each row's "source" value."""
    source_text = source.fillna("").astype(str).str.lower()
    source_ids = pd.Series(DATA_SOURCES[0]["id"], index=source.index, dtype="object")
    for data_source in DATA_SOURCES[1:]:
        source_ids.loc[source_text.str.contains(data_source["marker"], regex=False)] = (
            data_source["id"]
        )
    return source_ids


def ensure_int_column(df: pd.DataFrame, name: str) -> None:
    if name in df:
        df[name] = to_int(df[name])
    else:
        df[name] = pd.Series([pd.NA] * len(df), index=df.index)


def ensure_string_column(
    df: pd.DataFrame,
    name: str,
    default: str = "",
    lower: bool = False,
) -> None:
    if name in df:
        val = df[name].fillna("").astype(str).str.strip()
        df[name] = val.str.lower() if lower else val
    else:
        df[name] = default


def process_matches_df(matches: pd.DataFrame) -> pd.DataFrame:
    matches = matches.copy()
    input_rows = len(matches)
    player1_ids = to_int(matches["player1_id"])
    player2_ids = to_int(matches["player2_id"])
    goals_player1 = to_int(matches["goals_player1"])
    goals_player2 = to_int(matches["goals_player2"])

    valid_rows = (
        player1_ids.notna()
        & player2_ids.notna()
        & goals_player1.notna()
        & goals_player2.notna()
        & player1_ids.gt(0)
        & player2_ids.gt(0)
        & player1_ids.ne(player2_ids)
        & goals_player1.ge(0)
        & goals_player2.ge(0)
    ).fillna(False)

    walkover_column = first_existing_column(matches, ["walkover", "Walkover"])
    walkover_rows = 0
    if walkover_column:
        walkover_text = (
            matches[walkover_column].fillna("").astype(str).str.strip().str.casefold()
        )
        is_walkover = walkover_text.isin(
            {"1", "1.0", "true", "yes", "y", "walkover", "wo", "w/o"}
        )
        if is_walkover.any():
            walkover_rows = int(is_walkover.sum())
            print(f"Dropped {walkover_rows} walkover rows.")
            valid_rows &= ~is_walkover
    dropped_rows = int((~valid_rows).sum())
    if dropped_rows:
        print(
            f"Dropped {dropped_rows} match rows with missing, non-integral, "
            "or invalid player IDs/scores, self-matches, or walkovers."
        )

    matches = matches.loc[valid_rows].copy()
    matches["player1_id"] = player1_ids.loc[valid_rows].astype("int64")
    matches["player2_id"] = player2_ids.loc[valid_rows].astype("int64")
    matches["goals_player1"] = goals_player1.loc[valid_rows].astype("int64")
    matches["goals_player2"] = goals_player2.loc[valid_rows].astype("int64")

    ensure_int_column(matches, "stage_id")
    ensure_int_column(matches, "stage_sequence")
    ensure_int_column(matches, "round_number")
    ensure_int_column(matches, "playoff_game_number")
    ensure_int_column(matches, "tournament_id")

    overtime_raw = matches.get(
        "overtime_raw", pd.Series("", index=matches.index, dtype="object")
    )
    overtime_text = overtime_raw.fillna("").astype(str).str.strip().str.casefold()
    false_overtime = overtime_text.isin(
        {
            "",
            "none",
            "nan",
            "null",
            "na",
            "n/a",
            "0",
            "0.0",
            "false",
            "no",
            "n",
            "no overtime",
            "regulation",
        }
    )
    true_overtime = overtime_text.isin(
        {
            "1",
            "1.0",
            "true",
            "yes",
            "y",
            "ot",
            "overtime",
            "over time",
            "sudden death",
        }
    )
    unknown_overtime = ~(false_overtime | true_overtime)
    if unknown_overtime.any():
        print(
            f"Treated {int(unknown_overtime.sum())} unrecognized overtime values as false."
        )
    matches["overtime"] = true_overtime
    matches["date_dt"] = pd.to_datetime(matches["date_raw"], errors="coerce")
    matches["date"] = matches["date_dt"].dt.strftime("%Y-%m-%d")

    ensure_string_column(matches, "tournament_name")
    ensure_string_column(matches, "stage")
    ensure_string_column(matches, "stage_type", lower=True)
    ensure_string_column(matches, "player1_name")
    ensure_string_column(matches, "player2_name")

    for column in [
        "source",
        "source_url",
        "stage_url",
        "result_url",
        "tournament_url",
        "source_tournament_id",
        "source_stage_id",
        "source_match_id",
    ]:
        ensure_string_column(matches, column)

    matches["id1"] = matches["player1_id"].where(
        matches["player1_id"] <= matches["player2_id"], matches["player2_id"]
    )
    matches["id2"] = matches["player2_id"].where(
        matches["player1_id"] <= matches["player2_id"], matches["player1_id"]
    )
    is_p1_id1 = matches["player1_id"] == matches["id1"]
    matches["goals_id1"] = matches["goals_player1"].where(
        is_p1_id1, matches["goals_player2"]
    )
    matches["goals_id2"] = matches["goals_player2"].where(
        is_p1_id1, matches["goals_player1"]
    )

    matches.attrs["validation"] = {
        "input_rows": input_rows,
        "accepted_rows": len(matches),
        "dropped_rows": dropped_rows,
        "walkover_rows": walkover_rows,
        "unknown_overtime_rows": int(unknown_overtime.sum()),
    }

    return matches

OVERLAP_DEDUPE_COLUMNS = [
    "id1",
    "id2",
    "date",
    "stage_sequence",
    "round_number",
    "playoff_game_number",
    "goals_id1",
    "goals_id2",
    "overtime",
]
MIN_TOURNAMENT_CROSSWALK_MATCHES = 3
# The sources sometimes number stages and rounds differently for the same event,
# so a second pass matches games on players, date and score alone. Without the
# round numbers a single overlap is weak evidence, so this pass needs many
# distinct games and ignores tournament names.
LOOSE_OVERLAP_DEDUPE_COLUMNS = [
    "id1",
    "id2",
    "date",
    "goals_id1",
    "goals_id2",
    "overtime",
]
MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES = 10


def infer_tournament_crosswalk(
    matches: pd.DataFrame,
    is_preferred: pd.Series,
    tournament_ids: pd.Series,
    tournament_names: Optional[pd.Series],
    signature_columns: list[str] = OVERLAP_DEDUPE_COLUMNS,
    min_matches: int = MIN_TOURNAMENT_CROSSWALK_MATCHES,
    use_names: bool = True,
) -> Tuple[
    Dict[Tuple[int, int], int],
    list[Tuple[Tuple[int, int], list[int], list[int]]],
]:
    """Infer unambiguous tournament pairs between two sources from repeated game overlaps.

    is_preferred marks the rows of the source whose rows are kept; the rest are "primary".

    Cross-source tournament IDs and names are not always the same. Matching normalized
    names are direct evidence when use_names is set; otherwise, require min_matches
    distinct matching game signatures. In both cases the inferred ID mapping must be
    one-to-one.
    """
    signature_hashes = pd.util.hash_pandas_object(
        matches[signature_columns], index=False
    )
    preferred_hashes = set(signature_hashes.loc[is_preferred].tolist())
    primary_mask = (
        ~is_preferred
        & tournament_ids.notna()
        & signature_hashes.isin(preferred_hashes)
    )
    preferred_mask = is_preferred & tournament_ids.notna()

    primary = matches.loc[primary_mask, signature_columns].copy()
    primary["_primary_index"] = primary.index
    primary["_primary_tournament_id"] = tournament_ids.loc[primary.index].astype(
        "int64"
    )
    preferred = matches.loc[preferred_mask, signature_columns].copy()
    preferred["_preferred_index"] = preferred.index
    preferred["_preferred_tournament_id"] = tournament_ids.loc[
        preferred.index
    ].astype("int64")

    if tournament_names is not None:
        primary["_primary_tournament_name"] = tournament_names.loc[primary.index]
        preferred["_preferred_tournament_name"] = tournament_names.loc[
            preferred.index
        ]
    else:
        primary["_primary_tournament_name"] = ""
        preferred["_preferred_tournament_name"] = ""

    overlaps = primary.merge(
        preferred,
        on=signature_columns,
        how="inner",
        sort=False,
    )
    if overlaps.empty:
        return {}, []

    pair_columns = ["_primary_tournament_id", "_preferred_tournament_id"]
    unique_signatures = overlaps.drop_duplicates(
        [*pair_columns, *signature_columns]
    )
    evidence_counts = unique_signatures.groupby(pair_columns, sort=False).size()
    evidence = {
        (int(primary_id), int(preferred_id)): int(count)
        for (primary_id, preferred_id), count in evidence_counts.items()
    }

    matching_name_pairs: set[Tuple[int, int]] = set()
    if use_names:
        primary_name_keys = overlaps["_primary_tournament_name"].map(
            normalize_dedupe_text
        )
        preferred_name_keys = overlaps["_preferred_tournament_name"].map(
            normalize_dedupe_text
        )
        matching_names = primary_name_keys.ne("") & primary_name_keys.eq(
            preferred_name_keys
        )
        matching_name_pairs = {
            (int(primary_id), int(preferred_id))
            for primary_id, preferred_id in overlaps.loc[
                matching_names, pair_columns
            ].itertuples(index=False, name=None)
        }

    candidates = {
        pair
        for pair, count in evidence.items()
        if count >= min_matches or pair in matching_name_pairs
    }
    primary_candidates: Dict[int, set[int]] = {}
    preferred_candidates: Dict[int, set[int]] = {}
    for primary_id, preferred_id in candidates:
        primary_candidates.setdefault(primary_id, set()).add(preferred_id)
        preferred_candidates.setdefault(preferred_id, set()).add(primary_id)

    crosswalk = {
        (primary_id, preferred_id): evidence[(primary_id, preferred_id)]
        for primary_id, preferred_id in candidates
        if len(primary_candidates[primary_id]) == 1
        and len(preferred_candidates[preferred_id]) == 1
    }
    accepted_pairs = [
        (int(primary_id), int(preferred_id)) in crosswalk
        for primary_id, preferred_id in overlaps[pair_columns].itertuples(
            index=False, name=None
        )
    ]
    overlap_groups = []
    accepted_overlaps = overlaps.loc[accepted_pairs]
    for _, group in accepted_overlaps.groupby(
        [*pair_columns, *signature_columns],
        dropna=False,
        sort=False,
    ):
        pair = (
            int(group.iloc[0]["_primary_tournament_id"]),
            int(group.iloc[0]["_preferred_tournament_id"]),
        )
        primary_indices = list(dict.fromkeys(group["_primary_index"].tolist()))
        preferred_indices = list(
            dict.fromkeys(group["_preferred_index"].tolist())
        )
        overlap_groups.append((pair, primary_indices, preferred_indices))
    return crosswalk, overlap_groups


def match_source_pair(
    matches: pd.DataFrame,
    is_preferred: pd.Series,
    tournament_ids: pd.Series,
    tournament_names: Optional[pd.Series],
) -> Tuple[list[int], list[int]]:
    """Pair overlapping games between two sources; returns (kept, dropped) row indices.

    kept[i] is the preferred-source row that replaces dropped[i].
    """
    drop_indices: list[int] = []
    kept_indices: list[int] = []
    # Tournament mappings accepted so far, kept one-to-one across both passes.
    primary_to_preferred: Dict[int, int] = {}
    preferred_to_primary: Dict[int, int] = {}
    # The exact pass runs first; the loose pass only sees rows it left unpaired.
    for signature_columns, min_matches, use_names in [
        (OVERLAP_DEDUPE_COLUMNS, MIN_TOURNAMENT_CROSSWALK_MATCHES, True),
        (LOOSE_OVERLAP_DEDUPE_COLUMNS, MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES, False),
    ]:
        remaining = matches.index.difference(drop_indices + kept_indices)
        tournament_crosswalk, overlap_groups = infer_tournament_crosswalk(
            matches.loc[remaining],
            is_preferred.loc[remaining],
            tournament_ids.loc[remaining],
            tournament_names.loc[remaining] if tournament_names is not None else None,
            signature_columns=signature_columns,
            min_matches=min_matches,
            use_names=use_names,
        )
        tournament_crosswalk = {
            (primary_id, preferred_id)
            for primary_id, preferred_id in tournament_crosswalk
            if primary_to_preferred.get(primary_id, preferred_id) == preferred_id
            and preferred_to_primary.get(preferred_id, primary_id) == primary_id
        }
        for primary_id, preferred_id in tournament_crosswalk:
            primary_to_preferred[primary_id] = preferred_id
            preferred_to_primary[preferred_id] = primary_id
        for pair, primary_indices, preferred_indices in overlap_groups:
            if pair not in tournament_crosswalk:
                continue
            pair_count = min(len(preferred_indices), len(primary_indices))
            kept_indices.extend(preferred_indices[:pair_count])
            drop_indices.extend(primary_indices[:pair_count])
    return kept_indices, drop_indices


def deduplicate_overlapping_source_matches(matches: pd.DataFrame) -> pd.DataFrame:
    """Drop games that two sources both report.

    Each source in DATA_SOURCES is compared with every source listed before it, and on
    overlap the later source's row is kept. A kept row stands for one game, so it replaces
    at most one row from one other source.
    """
    if matches.empty or "source" not in matches:
        return matches

    missing_columns = [column for column in OVERLAP_DEDUPE_COLUMNS if column not in matches]
    if missing_columns:
        return matches

    matches = matches.copy()
    if "tournament_level" not in matches:
        matches["tournament_level"] = None

    source_ids = classify_sources(matches["source"])
    if "tournament_id" in matches:
        tournament_ids = to_int(matches["tournament_id"])
    else:
        tournament_ids = pd.Series(pd.NA, index=matches.index, dtype="Int64")

    tournament_names = matches.get("tournament_name")
    drop_indices: list[int] = []
    used_indices: list[int] = []
    ordered_ids = [source["id"] for source in DATA_SOURCES]
    for position, preferred_id in enumerate(ordered_ids):
        for other_id in ordered_ids[:position]:
            in_pair = source_ids.isin([preferred_id, other_id])
            in_pair.loc[drop_indices] = False
            in_pair.loc[used_indices] &= ~source_ids.loc[used_indices].eq(preferred_id)
            is_preferred = source_ids.eq(preferred_id) & in_pair
            if not is_preferred.any() or not (in_pair & ~is_preferred).any():
                continue
            rows = matches.index[in_pair]
            kept_indices, pair_drops = match_source_pair(
                matches.loc[rows],
                is_preferred.loc[rows],
                tournament_ids.loc[rows],
                tournament_names.loc[rows] if tournament_names is not None else None,
            )
            if not pair_drops:
                continue
            print(
                f"Matched {len(pair_drops)} {other_id} games also reported by {preferred_id}."
            )
            backfill_tournament_levels(matches, kept_indices, pair_drops)
            drop_indices.extend(pair_drops)
            used_indices.extend(kept_indices)

    if not drop_indices:
        return matches
    return matches.drop(index=drop_indices).reset_index(drop=True)


def backfill_tournament_levels(
    matches: pd.DataFrame, kept_indices: list[int], drop_indices: list[int]
) -> None:
    """Copy a dropped row's tournament level onto the kept row that replaces it."""
    # Each row sits in at most one accepted group (the crosswalk is one-to-one and
    # the passes see disjoint rows), so the level backfill is one assignment.
    levels = matches["tournament_level"]
    # Plain lists, not Series.map: map would infer a string dtype and turn the
    # None returned for missing levels into NaN.
    dropped_levels = [
        normalize_tournament_level(value) for value in levels.loc[drop_indices].tolist()
    ]
    kept_levels = [
        normalize_tournament_level(value) for value in levels.loc[kept_indices].tolist()
    ]
    backfill = [
        (kept_index, dropped_level)
        for kept_index, kept_level, dropped_level in zip(
            kept_indices, kept_levels, dropped_levels
        )
        if dropped_level is not None and kept_level is None
    ]
    if backfill:
        backfill_indices, backfill_levels = zip(*backfill)
        matches.loc[list(backfill_indices), "tournament_level"] = list(backfill_levels)


def read_matches_parquet(matches_path: Path) -> pd.DataFrame:
    matches = pd.read_parquet(matches_path, engine="pyarrow")
    matches = matches.rename(
        columns={
            "StageID": "stage_id",
            "Player1": "player1_name",
            "Player1ID": "player1_id",
            "Player2": "player2_name",
            "Player2ID": "player2_id",
            "GoalsPlayer1": "goals_player1",
            "GoalsPlayer2": "goals_player2",
            "Overtime": "overtime_raw",
            "Stage": "stage",
            "RoundNumber": "round_number",
            "PlayoffGameNumber": "playoff_game_number",
            "Date": "date_raw",
            "TournamentName": "tournament_name",
            "TournamentID": "tournament_id",
            "StageSequence": "stage_sequence",
            "MatchID": "source_match_id",
        }
    )
    return process_matches_df(matches)


def read_extra_matches_parquet(
    parquet_path: Path,
    player_name_to_id: Optional[Dict[str, int]] = None,
) -> pd.DataFrame:
    matches = pd.read_parquet(parquet_path)
    # Map source columns to internal schema
    matches = matches.rename(
        columns={
            "StageID": "stage_id",
            "StageType": "stage_type",
            "Player1": "player1_name",
            "Player1ID": "player1_id",
            "Player2": "player2_name",
            "Player2ID": "player2_id",
            "GoalsPlayer1": "goals_player1",
            "GoalsPlayer2": "goals_player2",
            "Overtime": "overtime_raw",
            "Stage": "stage",
            "RoundNumber": "round_number",
            "PlayoffGameNumber": "playoff_game_number",
            "Date": "date_raw",
            "TournamentName": "tournament_name",
            "TournamentID": "tournament_id",
            "StageSequence": "stage_sequence",
            "TournamentURL": "tournament_url",
            "ResultURL": "result_url",
            "StageURL": "stage_url",
            "SourceURL": "source_url",
            "Source": "source",
            "SourceTournamentID": "source_tournament_id",
            "SourceStageID": "source_stage_id",
            "SourceMatchID": "source_match_id",
        }
    )
    if "source_match_id" not in matches and "MatchID" in matches:
        matches["source_match_id"] = matches["MatchID"]
    # Ensure missing IDs are NaN so they get dropped or handled correctly
    if "stage_id" not in matches:
        matches["stage_id"] = pd.NA
    if "tournament_id" not in matches:
        matches["tournament_id"] = pd.NA

    resolved_total = 0
    if player_name_to_id:
        for id_column, name_column in [
            ("player1_id", "player1_name"),
            ("player2_id", "player2_name"),
        ]:
            if id_column not in matches:
                matches[id_column] = pd.NA
            if name_column not in matches:
                continue
            raw_ids = matches[id_column]
            missing_ids = raw_ids.astype("string").fillna("").str.strip().eq("")
            resolved_ids = matches[name_column].map(normalize_dedupe_text).map(
                player_name_to_id
            )
            resolved_mask = missing_ids & resolved_ids.notna()
            if resolved_mask.any():
                resolved_column = matches[id_column].astype("object").copy()
                resolved_column.loc[resolved_mask] = resolved_ids.loc[
                    resolved_mask
                ].astype("int64")
                matches[id_column] = resolved_column
                resolved_total += int(resolved_mask.sum())
        if resolved_total:
            print(
                f"Resolved {resolved_total} missing supplemental player IDs "
                "from unique exact names."
            )

    processed = process_matches_df(matches)
    processed.attrs["validation"]["resolved_missing_player_ids"] = resolved_total
    return processed

def filter_players(
    players: Iterable[dict],
    eligible_ids: set[int],
    matches: Optional[pd.DataFrame] = None,
) -> Tuple[Iterable[dict], Dict[int, str]]:
    filtered = []
    id_to_name = {}
    for player in players:
        if player["id"] in eligible_ids:
            filtered.append(player)
            id_to_name[player["id"]] = player["name"]

    missing_ids = sorted(eligible_ids.difference(id_to_name))
    if missing_ids and matches is not None:
        source_names: Dict[int, str] = {}
        for id_column, name_column in [
            ("player1_id", "player1_name"),
            ("player2_id", "player2_name"),
        ]:
            candidates = matches.loc[
                matches[id_column].isin(missing_ids), [id_column, name_column]
            ].drop_duplicates(id_column, keep="last")
            for player_id, name in candidates.itertuples(index=False, name=None):
                cleaned_name = clean_optional_string(name)
                if cleaned_name:
                    source_names[int(player_id)] = cleaned_name

        print(f"Added {len(missing_ids)} players referenced only by match data.")
        for player_id in missing_ids:
            name = source_names.get(player_id, f"Player {player_id}")
            payload = {
                "id": player_id,
                "name": name,
                "ranking_id": None,
                "world_rank": None,
                "ranking_points": None,
                "ranking_player_value": None,
                "ranking_nation": "",
                "ranking_as_of": "",
                "country": "",
                "city": "",
                "date_of_birth": "",
                "sex": "",
                "search_key": normalize_search_key(name),
            }
            filtered.append(payload)
            id_to_name[player_id] = name

    filtered.sort(key=lambda player: player["name"].casefold())
    return filtered, id_to_name


def build_player_files(
    matches: pd.DataFrame,
    player_names: Dict[int, str],
    h2h_dir: Path = H2H_DIR,
    og_dir: Path = OG_H2H_DIR,
) -> Dict[int, dict]:
    if h2h_dir.exists():
        shutil.rmtree(h2h_dir)
    h2h_dir.mkdir(parents=True, exist_ok=True)
    if og_dir.exists():
        shutil.rmtree(og_dir)
    og_dir.mkdir(parents=True, exist_ok=True)

    player_payloads: Dict[int, dict] = {}
    for pid, name in player_names.items():
        player_payloads[pid] = {"player": {"id": pid, "name": name}, "opponents": {}}

    def finish_group(
        id1_int: int,
        id2_int: int,
        first_player1_id: int,
        first_player1_name: str,
        first_player2_name: str,
        total_matches: int,
        wins_id1: int,
        wins_id2: int,
        draws: int,
        goals_for_id1: int,
        goals_for_id2: int,
        overtime_games: int,
        first_meeting_date: Optional[str],
        last_meeting_date: Optional[str],
        tournaments: Dict[int, dict],
        last10: deque,
        matches_id1: list,
    ) -> None:
        if id1_int not in player_payloads or id2_int not in player_payloads:
            return

        name1 = player_names.get(id1_int)
        name2 = player_names.get(id2_int)
        if not name1:
            if first_player1_id == id1_int:
                name1 = first_player1_name
            else:
                name1 = first_player2_name
        if not name2:
            if first_player1_id == id2_int:
                name2 = first_player1_name
            else:
                name2 = first_player2_name

        last10_w = sum(1 for r in last10 if r == "W")
        last10_l = sum(1 for r in last10 if r == "L")
        last10_d = sum(1 for r in last10 if r == "D")

        tournaments_list = [
            {"id": tid, "name": item["name"], "level": item.get("level")}
            for tid, item in tournaments.items()
        ]
        tournaments_list.sort(key=lambda x: (x["name"].lower(), x["id"]))

        summary_id1 = {
            "total_matches": total_matches,
            "wins_player": wins_id1,
            "wins_opponent": wins_id2,
            "draws": draws,
            "goals_for_player": goals_for_id1,
            "goals_for_opponent": goals_for_id2,
            "overtime_games": overtime_games,
            "first_meeting_date": first_meeting_date,
            "last_meeting_date": last_meeting_date,
            "tournaments": tournaments_list,
            "last_10": {"wins": last10_w, "losses": last10_l, "draws": last10_d},
        }

        matches_id2 = [
            {
                **match,
                "goals_for_player": match["goals_for_opponent"],
                "goals_for_opponent": match["goals_for_player"],
            }
            for match in matches_id1
        ]

        summary_id2 = {
            "total_matches": total_matches,
            "wins_player": wins_id2,
            "wins_opponent": wins_id1,
            "draws": draws,
            "goals_for_player": goals_for_id2,
            "goals_for_opponent": goals_for_id1,
            "overtime_games": overtime_games,
            "first_meeting_date": first_meeting_date,
            "last_meeting_date": last_meeting_date,
            "tournaments": tournaments_list,
            "last_10": {"wins": last10_l, "losses": last10_w, "draws": last10_d},
        }

        player_payloads[id1_int]["opponents"][str(id2_int)] = {
            "player": {"id": id2_int, "name": name2},
            "summary": summary_id1,
            "matches": matches_id1,
        }
        player_payloads[id2_int]["opponents"][str(id1_int)] = {
            "player": {"id": id1_int, "name": name1},
            "summary": summary_id2,
            "matches": matches_id2,
        }

    id1_values = matches["id1"].to_numpy(dtype="int64", copy=False)
    id2_values = matches["id2"].to_numpy(dtype="int64", copy=False)
    player1_id_values = matches["player1_id"].to_numpy(dtype="int64", copy=False)
    player1_name_values = matches["player1_name"].to_numpy(dtype=object, copy=False)
    player2_name_values = matches["player2_name"].to_numpy(dtype=object, copy=False)
    date_values = matches["date"].to_numpy(dtype=object, copy=False)
    tournament_id_values = matches["tournament_id"].to_numpy(
        dtype="int64", na_value=-1, copy=False
    )
    tournament_name_values = matches["tournament_name"].to_numpy(dtype=object, copy=False)
    if "tournament_level" not in matches:
        matches["tournament_level"] = None
    tournament_level_values = matches["tournament_level"].to_numpy(dtype=object, copy=False)
    stage_values = matches["stage"].to_numpy(dtype=object, copy=False)
    stage_type_values = matches["stage_type"].to_numpy(dtype=object, copy=False)
    stage_id_values = matches["stage_id"].to_numpy(dtype="int64", na_value=-1, copy=False)
    stage_sequence_values = matches["stage_sequence"].to_numpy(
        dtype="int64", na_value=-1, copy=False
    )
    round_number_values = matches["round_number"].to_numpy(
        dtype="int64", na_value=-1, copy=False
    )
    playoff_game_number_values = matches["playoff_game_number"].to_numpy(
        dtype="int64", na_value=-1, copy=False
    )
    goals_id1_values = matches["goals_id1"].to_numpy(dtype="int64", copy=False)
    goals_id2_values = matches["goals_id2"].to_numpy(dtype="int64", copy=False)
    overtime_values = matches["overtime"].to_numpy(dtype=bool, copy=False)
    source_values = matches["source"].to_numpy(dtype=object, copy=False)
    source_url_values = matches["source_url"].to_numpy(dtype=object, copy=False)
    stage_url_values = matches["stage_url"].to_numpy(dtype=object, copy=False)
    result_url_values = matches["result_url"].to_numpy(dtype=object, copy=False)
    tournament_url_values = matches["tournament_url"].to_numpy(dtype=object, copy=False)
    source_tournament_id_values = matches["source_tournament_id"].to_numpy(
        dtype=object, copy=False
    )
    source_stage_id_values = matches["source_stage_id"].to_numpy(dtype=object, copy=False)
    source_match_id_values = matches["source_match_id"].to_numpy(dtype=object, copy=False)

    current_id1 = None
    current_id2 = None
    first_player1_id = None
    first_player1_name = ""
    first_player2_name = ""
    total_matches = 0
    wins_id1 = 0
    wins_id2 = 0
    draws = 0
    goals_for_id1 = 0
    goals_for_id2 = 0
    overtime_games = 0
    first_meeting_date = None
    last_meeting_date = None
    tournaments: Dict[int, dict] = {}
    last10 = deque(maxlen=10)
    matches_id1 = []

    for idx in range(len(id1_values)):
        id1_int = int(id1_values[idx])
        id2_int = int(id2_values[idx])

        if current_id1 is None:
            current_id1 = id1_int
            current_id2 = id2_int
            first_player1_id = int(player1_id_values[idx])
            first_player1_name = player1_name_values[idx]
            first_player2_name = player2_name_values[idx]
        elif id1_int != current_id1 or id2_int != current_id2:
            finish_group(
                current_id1,
                current_id2,
                first_player1_id,
                first_player1_name,
                first_player2_name,
                total_matches,
                wins_id1,
                wins_id2,
                draws,
                goals_for_id1,
                goals_for_id2,
                overtime_games,
                first_meeting_date,
                last_meeting_date,
                tournaments,
                last10,
                matches_id1,
            )
            current_id1 = id1_int
            current_id2 = id2_int
            first_player1_id = int(player1_id_values[idx])
            first_player1_name = player1_name_values[idx]
            first_player2_name = player2_name_values[idx]
            total_matches = 0
            wins_id1 = 0
            wins_id2 = 0
            draws = 0
            goals_for_id1 = 0
            goals_for_id2 = 0
            overtime_games = 0
            first_meeting_date = None
            last_meeting_date = None
            tournaments = {}
            last10 = deque(maxlen=10)
            matches_id1 = []

        date_raw = date_values[idx]
        date_value = date_raw if isinstance(date_raw, str) else None
        tournament_id_raw = int(tournament_id_values[idx])
        tournament_id = None if tournament_id_raw == -1 else tournament_id_raw
        tournament_level_raw = tournament_level_values[idx]
        tournament_level = normalize_tournament_level(tournament_level_raw)
        stage_id_raw = int(stage_id_values[idx])
        stage_id = None if stage_id_raw == -1 else stage_id_raw
        stage_sequence_raw = int(stage_sequence_values[idx])
        stage_sequence = None if stage_sequence_raw == -1 else stage_sequence_raw
        round_number_raw = int(round_number_values[idx])
        round_number = None if round_number_raw == -1 else round_number_raw
        playoff_game_number_raw = int(playoff_game_number_values[idx])
        playoff_game_number = (
            None if playoff_game_number_raw == -1 else playoff_game_number_raw
        )
        goals_id1 = int(goals_id1_values[idx])
        goals_id2 = int(goals_id2_values[idx])
        overtime = bool(overtime_values[idx])
        source = clean_optional_string(source_values[idx])
        source_url = clean_optional_string(source_url_values[idx])
        stage_url = clean_optional_string(stage_url_values[idx])
        result_url = clean_optional_string(result_url_values[idx])
        tournament_url = clean_optional_string(tournament_url_values[idx])
        source_tournament_id = clean_optional_string(source_tournament_id_values[idx])
        source_stage_id = clean_optional_string(source_stage_id_values[idx])
        source_match_id = clean_optional_string(source_match_id_values[idx])

        matches_id1.append(
            {
                "date": date_value,
                "tournament_id": tournament_id,
                "tournament_name": tournament_name_values[idx],
                "tournament_level": tournament_level,
                "stage": stage_values[idx],
                "stage_type": clean_optional_string(stage_type_values[idx]),
                "stage_id": stage_id,
                "stage_sequence": stage_sequence,
                "round_number": round_number,
                "playoff_game_number": playoff_game_number,
                "goals_for_player": goals_id1,
                "goals_for_opponent": goals_id2,
                "overtime": overtime,
                "source": source,
                "source_url": source_url,
                "stage_url": stage_url,
                "result_url": result_url,
                "tournament_url": tournament_url,
                "source_tournament_id": source_tournament_id,
                "source_stage_id": source_stage_id,
                "source_match_id": source_match_id,
            }
        )

        total_matches += 1
        goals_for_id1 += goals_id1
        goals_for_id2 += goals_id2

        if goals_id1 > goals_id2:
            wins_id1 += 1
            result_marker = "W"
        elif goals_id1 < goals_id2:
            wins_id2 += 1
            result_marker = "L"
        else:
            draws += 1
            result_marker = "D"

        if overtime:
            overtime_games += 1

        if date_value:
            last10.append(result_marker)
            if first_meeting_date is None:
                first_meeting_date = date_value
            last_meeting_date = date_value

        if tournament_id is not None:
            tournaments[tournament_id] = {
                "name": tournament_name_values[idx],
                "level": tournament_level,
            }

    if current_id1 is not None:
        finish_group(
            current_id1,
            current_id2,
            first_player1_id,
            first_player1_name,
            first_player2_name,
            total_matches,
            wins_id1,
            wins_id2,
            draws,
            goals_for_id1,
            goals_for_id2,
            overtime_games,
            first_meeting_date,
            last_meeting_date,
            tournaments,
            last10,
            matches_id1,
        )

    for pid, payload in player_payloads.items():
        write_json(h2h_dir / f"{pid}.json", payload)
        og_opponents = {
            opponent_id: {
                "player": opponent["player"],
                "summary": {
                    key: opponent["summary"].get(key, 0)
                    for key in [
                        "total_matches",
                        "wins_player",
                        "wins_opponent",
                        "draws",
                    ]
                },
            }
            for opponent_id, opponent in payload["opponents"].items()
        }
        write_json(
            og_dir / f"{pid}.json",
            {"player": payload["player"], "opponents": og_opponents},
        )
    return player_payloads



def _rivalry_entry(payload: dict, opponent: dict) -> dict:
    summary = opponent["summary"]
    return {
        "p1": payload["player"],
        "p2": opponent["player"],
        "games": summary.get("total_matches", 0),
        "wins_p1": summary.get("wins_player", 0),
        "wins_p2": summary.get("wins_opponent", 0),
        "draws": summary.get("draws", 0),
        "first_meeting_date": summary.get("first_meeting_date"),
        "last_meeting_date": summary.get("last_meeting_date"),
    }


def build_rivalries(
    player_payloads: Dict[int, dict],
    players: Optional[list] = None,
    limit: int = 20,
    ranked_players: int = 10,
) -> dict:
    """Home-page rivalries, each pair listed once.

    "most_played" holds the pairs with the most games (lower id first). The top
    pair also carries its results in order ("W", "L" or "D" for the first player)
    so the home page can draw its lead chart without loading a player file.

    "top_ranked" holds the pairs between the best-ranked players that have met,
    in ranking order: #1 v #2, #1 v #3, #2 v #3, #1 v #4 and so on. The
    better-ranked player is listed first.
    """
    pairs = []
    for pid, payload in player_payloads.items():
        for opponent_id, opponent in payload["opponents"].items():
            if int(opponent_id) <= int(pid):
                continue
            pair = _rivalry_entry(payload, opponent)
            pair["_matches"] = opponent["matches"]
            pairs.append(pair)
    pairs.sort(key=lambda pair: (-pair["games"], pair["p1"]["id"], pair["p2"]["id"]))
    most_played = pairs[:limit]
    for index, pair in enumerate(most_played):
        matches = pair.pop("_matches")
        if index == 0:
            pair["results"] = "".join(
                "W" if m["goals_for_player"] > m["goals_for_opponent"]
                else "L" if m["goals_for_player"] < m["goals_for_opponent"]
                else "D"
                for m in matches
            )
            year_starts = {}
            for position, match in enumerate(matches):
                year = str(match.get("date") or "")[:4]
                if year and year not in year_starts:
                    year_starts[year] = position
            pair["year_starts"] = year_starts

    ranks = {}
    for player in players or []:
        rank = player.get("world_rank")
        if rank and int(player["id"]) in player_payloads:
            ranks[int(player["id"])] = int(rank)
    best = sorted(ranks, key=lambda player_id: ranks[player_id])[:ranked_players]
    top_ranked = []
    for index_b, worse in enumerate(best):
        for better in best[:index_b]:
            opponent = player_payloads[better]["opponents"].get(str(worse)) or player_payloads[
                better
            ]["opponents"].get(worse)
            if opponent and opponent["summary"].get("total_matches"):
                top_ranked.append(_rivalry_entry(player_payloads[better], opponent))
    return {"most_played": most_played, "top_ranked": top_ranked[:limit]}


MIN_WIN_STREAK = 20
MIN_PERFECT_RECORD_GAMES = 30
MIN_DEAD_EVEN_GAMES = 100
MIN_REMATCH_GAP_DAYS = 5 * 365


def _streak_record(long: pd.DataFrame, keys: list, hit: pd.Series) -> Optional[dict]:
    """Longest run of rows where `hit` holds, inside groups of `keys` (rows in game order)."""
    if not hit.any():
        return None
    new_group = long[keys].ne(long[keys].shift()).any(axis=1)
    run_id = (new_group | ~hit).cumsum()
    runs = long[hit].groupby(run_id[hit]).agg(
        games=("date", "size"),
        start=("date", "first"),
        end=("date", "last"),
        pid=("pid", "first"),
        oid=("oid", "first"),
        first_row=("row", "first"),
    )
    # Ties go to whoever got there first.
    ranked = runs.sort_values(["games", "first_row"], ascending=[False, True])
    best = ranked.iloc[0]
    rows = long[hit & run_id.eq(ranked.index[0])]
    return {
        "results": "".join(np.where(rows["gf"] > rows["ga"], "W", "D")),
        "games": int(best["games"]),
        "start_date": best["start"],
        "end_date": best["end"],
        "pid": int(best["pid"]),
        "oid": int(best["oid"]),
    }


def build_records(matches: pd.DataFrame, player_names: Dict[int, str]) -> dict:
    """Home-page records ("fun facts"), recomputed from every game on each build.

    Each record has a rule, and a record is left out when no game history meets it, so
    a single new or corrected game can never leave a stale claim on the page. A perfect
    record disappears the moment that player drops a game, a dead-even rivalry the
    moment someone pulls ahead, and a streak always names whoever holds it now.
    """
    def player(pid: int) -> dict:
        return {"id": int(pid), "name": player_names.get(int(pid), f"Player {pid}")}

    # Placeholder entries such as "* *" are not real players.
    real = {
        pid for pid, name in player_names.items()
        if any(ch.isalpha() for ch in str(name or ""))
    }
    # Undated games still count in pair totals, the way the matchup page counts
    # them; only the records that need game order (streaks, gaps) skip them.
    games = matches[matches["player1_id"].isin(real) & matches["player2_id"].isin(real)]
    records: dict = {}
    if games.empty:
        return records
    games = games.sort_values(
        ["date_dt", "tournament_id", "stage_sequence", "round_number", "playoff_game_number"],
        kind="mergesort",
        na_position="last",
    ).reset_index(drop=True)
    games = games.assign(row=range(len(games)))

    side1 = pd.DataFrame({
        "pid": games["player1_id"].to_numpy(),
        "oid": games["player2_id"].to_numpy(),
        "gf": games["goals_player1"].to_numpy(),
        "ga": games["goals_player2"].to_numpy(),
        "date": games["date"].to_numpy(),
        "row": games["row"].to_numpy(),
    })
    side2 = side1.rename(columns={"pid": "oid", "oid": "pid", "gf": "ga", "ga": "gf"})
    long = pd.concat([side1, side2], ignore_index=True)

    dated = long[long["date"].notna()]
    by_player = dated.sort_values(["pid", "row"], kind="mergesort").reset_index(drop=True)
    wins = by_player["gf"] > by_player["ga"]
    win_streak = _streak_record(by_player, ["pid"], wins)
    if win_streak and win_streak["games"] >= MIN_WIN_STREAK:
        records["win_streak"] = {
            "player": player(win_streak["pid"]),
            "games": win_streak["games"],
            "start_date": win_streak["start_date"],
            "end_date": win_streak["end_date"],
        }
    unbeaten = _streak_record(by_player, ["pid"], by_player["gf"] >= by_player["ga"])
    # Only worth a card when draws stretched it past the winning streak.
    if (
        unbeaten
        and "win_streak" in records
        and unbeaten["games"] > records["win_streak"]["games"]
    ):
        records["unbeaten_streak"] = {
            "player": player(unbeaten["pid"]),
            "games": unbeaten["games"],
            "results": unbeaten["results"],
            "start_date": unbeaten["start_date"],
            "end_date": unbeaten["end_date"],
        }

    pairs = long.assign(win=long["gf"] > long["ga"], loss=long["gf"] < long["ga"]).groupby(
        ["pid", "oid"], sort=False
    ).agg(
        games=("win", "size"),
        wins=("win", "sum"),
        losses=("loss", "sum"),
        first_date=("date", "min"),
        last_date=("date", "max"),
        first_row=("row", "min"),
    ).reset_index()

    perfect = pairs[
        (pairs["wins"] == pairs["games"]) & (pairs["games"] >= MIN_PERFECT_RECORD_GAMES)
    ].sort_values(["games", "first_row"], ascending=[False, True])
    if not perfect.empty:
        best = perfect.iloc[0]
        records["perfect_record"] = {
            "player": player(best["pid"]),
            "opponent": player(best["oid"]),
            "games": int(best["games"]),
            "first_date": best["first_date"],
            "last_date": best["last_date"],
        }

    by_pair = dated.sort_values(["pid", "oid", "row"], kind="mergesort").reset_index(drop=True)
    h2h_streak = _streak_record(by_pair, ["pid", "oid"], by_pair["gf"] > by_pair["ga"])
    perfect_pair = (
        (records["perfect_record"]["player"]["id"], records["perfect_record"]["opponent"]["id"])
        if "perfect_record" in records
        else None
    )
    if (
        h2h_streak
        and h2h_streak["games"] >= MIN_WIN_STREAK
        and (h2h_streak["pid"], h2h_streak["oid"]) != perfect_pair
    ):
        records["h2h_streak"] = {
            "player": player(h2h_streak["pid"]),
            "opponent": player(h2h_streak["oid"]),
            "games": h2h_streak["games"],
            "start_date": h2h_streak["start_date"],
            "end_date": h2h_streak["end_date"],
        }

    even = pairs[
        (pairs["pid"] < pairs["oid"])
        & (pairs["wins"] == pairs["losses"])
        & (pairs["games"] >= MIN_DEAD_EVEN_GAMES)
    ].sort_values(["games", "first_row"], ascending=[False, True])
    if not even.empty:
        best = even.iloc[0]
        records["dead_even"] = {
            "player": player(best["pid"]),
            "opponent": player(best["oid"]),
            "games": int(best["games"]),
            "wins": int(best["wins"]),
            "draws": int(best["games"] - 2 * best["wins"]),
        }

    meetings = by_pair[by_pair["pid"] < by_pair["oid"]]
    meeting_dates = pd.to_datetime(meetings["date"])
    gaps = meeting_dates.groupby([meetings["pid"], meetings["oid"]]).diff().dt.days
    if gaps.notna().any() and gaps.max() >= MIN_REMATCH_GAP_DAYS:
        at = gaps.idxmax()
        records["rematch_gap"] = {
            "player": player(meetings.at[at, "pid"]),
            "opponent": player(meetings.at[at, "oid"]),
            "days": int(gaps[at]),
            "before_date": (meeting_dates[at] - pd.Timedelta(days=int(gaps[at]))).strftime(
                "%Y-%m-%d"
            ),
            "after_date": meetings.at[at, "date"],
        }
    return records


def build_source_summary(matches: pd.DataFrame, enabled_ids: Iterable[str]) -> list[dict]:
    """Game count and latest game date per source website.

    The primary source is always listed; supplemental ones only when in enabled_ids.
    """
    enabled = {DATA_SOURCES[0]["id"], *enabled_ids}
    source_ids = classify_sources(matches["source"])
    summary = []
    for source in DATA_SOURCES:
        if source["id"] not in enabled:
            continue
        mask = source_ids.eq(source["id"])
        latest = matches.loc[mask, "date_dt"].max()
        summary.append(
            {
                "id": source["id"],
                "name": source["name"],
                "url": source["url"],
                "matches": int(mask.sum()),
                "latest_date": latest.strftime("%Y-%m-%d") if pd.notna(latest) else None,
            }
        )
    return summary


def download_cached(url: str, path: Path) -> None:
    parsed_url = urlparse(url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ValueError(f"Unsupported source URL: {url!r}")
    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
    dl.download(
        url,
        path,
        etag_path=CACHE_DIR / f"{path.stem}.{cache_key}.etag",
        last_modified_path=CACHE_DIR / f"{path.stem}.{cache_key}.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    matches_url = os.environ.get("MATCHES_PARQUET_URL", dl.DEFAULT_MATCHES_URL)
    players_url = os.environ.get("PLAYERS_CSV_URL", dl.DEFAULT_PLAYERS_URL)
    tournaments_url = os.environ.get("TOURNAMENTS_CSV_URL", dl.DEFAULT_TOURNAMENTS_URL)
    tournament_metadata_url = os.environ.get(
        "TOURNAMENT_METADATA_CSV_URL", dl.DEFAULT_TOURNAMENT_METADATA_URL
    )
    ranking_url = os.environ.get("RANKING_TXT_URL", dl.DEFAULT_RANKING_URL)
    extra_sources = [
        {
            **source,
            "download_url": extra_source_url(source),
            "path": CACHE_DIR / source["cache_name"],
        }
        for source in EXTRA_SOURCES
    ]
    enabled_extra_sources = [source for source in extra_sources if source["download_url"]]
    require_rankings = os.environ.get("REQUIRE_RANKINGS", "0").strip().casefold() in {
        "1",
        "true",
        "yes",
    }
    require_tournament_metadata = os.environ.get(
        "REQUIRE_TOURNAMENT_METADATA", "0"
    ).strip().casefold() in {"1", "true", "yes"}
    skip_downloads = os.environ.get("SKIP_DOWNLOADS", "0").strip().casefold() in {
        "1",
        "true",
        "yes",
    }
    try:
        min_matches = int(os.environ.get("MIN_MATCHES", "50"))
    except ValueError as exc:
        raise ValueError("MIN_MATCHES must be an integer.") from exc
    if min_matches < 1:
        raise ValueError("MIN_MATCHES must be at least 1.")
    try:
        min_ranking_rows = int(os.environ.get("MIN_RANKING_ROWS", "1"))
        min_tournament_levels = int(os.environ.get("MIN_TOURNAMENT_LEVELS", "1"))
    except ValueError as exc:
        raise ValueError(
            "MIN_RANKING_ROWS and MIN_TOURNAMENT_LEVELS must be integers."
        ) from exc
    max_ranking_age_raw = os.environ.get("MAX_RANKING_AGE_DAYS", "").strip()
    try:
        max_ranking_age_days = int(max_ranking_age_raw) if max_ranking_age_raw else None
    except ValueError as exc:
        raise ValueError("MAX_RANKING_AGE_DAYS must be an integer.") from exc
    if min_ranking_rows < 1 or min_tournament_levels < 1:
        raise ValueError("Ranking and tournament metadata minimums must be at least 1.")
    if max_ranking_age_days is not None and max_ranking_age_days < 0:
        raise ValueError("MAX_RANKING_AGE_DAYS cannot be negative.")
    try:
        max_main_rejection_rate = float(
            os.environ.get("MAX_MAIN_REJECTION_RATE", "1")
        )
        max_extra_rejection_rate = float(
            os.environ.get("MAX_EXTRA_REJECTION_RATE", "1")
        )
    except ValueError as exc:
        raise ValueError("Source rejection-rate limits must be numbers.") from exc
    if not 0 <= max_main_rejection_rate <= 1 or not 0 <= max_extra_rejection_rate <= 1:
        raise ValueError("Source rejection-rate limits must be between 0 and 1.")

    matches_path = CACHE_DIR / "scraped_matches.parquet"
    players_path = CACHE_DIR / "players_data.csv"
    tournaments_path = CACHE_DIR / "tournament_data.csv"
    tournament_metadata_path = CACHE_DIR / "tournament_metadata.csv"
    ranking_path = CACHE_DIR / "ranking.txt"

    if skip_downloads:
        required_paths = [matches_path, players_path, tournaments_path]
        required_paths.extend(source["path"] for source in enabled_extra_sources)
        if require_tournament_metadata:
            required_paths.append(tournament_metadata_path)
        if require_rankings:
            required_paths.append(ranking_path)
        missing_paths = [path for path in required_paths if not path.exists()]
        if missing_paths:
            missing = ", ".join(str(path) for path in missing_paths)
            raise FileNotFoundError(f"SKIP_DOWNLOADS requested but cache files are missing: {missing}")
        print("Using cached source data (SKIP_DOWNLOADS=1).")
    else:
        print("Downloading source data...")
        download_cached(matches_url, matches_path)
        for source in extra_sources:
            if source["download_url"]:
                download_cached(source["download_url"], source["path"])
            else:
                print(
                    f"Supplemental match source {source['id']} disabled "
                    f"({source['url_env']} is empty)."
                )
        download_cached(players_url, players_path)
        download_cached(tournaments_url, tournaments_path)
        download_cached(tournament_metadata_url, tournament_metadata_path)
        try:
            download_cached(ranking_url, ranking_path)
        except RuntimeError as exc:
            if require_rankings:
                raise RuntimeError(
                    "Ranking refresh failed while REQUIRE_RANKINGS is enabled."
                ) from exc
            if ranking_path.exists():
                print(f"Warning: failed to refresh ranking; using cached file. {exc}")
            else:
                print(f"Warning: failed to download ranking; continuing without it. {exc}")


    print("Loading players...")
    rankings = load_rankings(ranking_path) if ranking_path.exists() else {}
    if require_rankings and len(rankings) < min_ranking_rows:
        raise RuntimeError(
            f"Ranking data has {len(rankings)} rows; at least {min_ranking_rows} are required."
        )
    if require_rankings and max_ranking_age_days is not None:
        ranking_dates = {
            item.get("ranking_as_of", "") for item in rankings.values()
            if item.get("ranking_as_of")
        }
        if len(ranking_dates) != 1:
            raise RuntimeError("Ranking data must contain one unambiguous as-of date.")
        ranking_date = datetime.strptime(ranking_dates.pop(), "%Y-%m-%d").date()
        ranking_age = datetime.now(timezone.utc).date() - ranking_date
        if ranking_age.days < 0 or ranking_age.days > max_ranking_age_days:
            raise RuntimeError(
                f"Ranking data is {ranking_age.days} days old; maximum is "
                f"{max_ranking_age_days}."
            )
    players, player_names = load_players(players_path, rankings)

    print("Loading tournaments...")
    tournament_levels = load_tournament_levels(tournament_metadata_path)
    if require_tournament_metadata and len(tournament_levels) < min_tournament_levels:
        raise RuntimeError(
            f"Tournament metadata has {len(tournament_levels)} levels; at least "
            f"{min_tournament_levels} are required."
        )
    tournaments = load_tournaments(tournaments_path, tournament_levels)
    prepare_data_staging()
    write_json(DATA_STAGING_DIR / "tournaments.json", tournaments)

    print("Processing matches...")
    matches_main = read_matches_parquet(matches_path)
    source_validation = {"primary": dict(matches_main.attrs.get("validation", {}))}
    enforce_rejection_budget(
        "Primary match source",
        source_validation["primary"],
        max_main_rejection_rate,
    )
    match_frames = [matches_main]
    player_name_to_id = build_unique_player_name_index(players)
    for source in enabled_extra_sources:
        print(f"Reading supplemental source {source['id']}...")
        matches_extra = read_extra_matches_parquet(source["path"], player_name_to_id)
        source_validation[source["key"]] = dict(matches_extra.attrs.get("validation", {}))
        enforce_rejection_budget(
            f"Supplemental match source {source['id']}",
            source_validation[source["key"]],
            max_extra_rejection_rate,
        )
        match_frames.append(matches_extra)

    matches = pd.concat(match_frames, ignore_index=True)
    matches["tournament_level"] = matches["tournament_id"].map(
        lambda tid: tournament_levels.get(int(tid)) if pd.notna(tid) else None
    )
    before_dedupe_count = len(matches)
    matches = deduplicate_overlapping_source_matches(matches)
    deduped_count = before_dedupe_count - len(matches)
    if deduped_count:
        print(f"Removed {deduped_count} overlapping source matches.")
    source_validation["cross_source_duplicates_removed"] = deduped_count

    sort_cols = [
        "id1",
        "id2",
        "date_dt",
        "tournament_id",
        "stage_sequence",
        "round_number",
        "playoff_game_number",
    ]
    matches = matches.sort_values(sort_cols, kind="mergesort", na_position="last")

    # Records count every game, including those against players below MIN_MATCHES.
    print("Building records...")
    all_names = {
        int(player_id): clean_optional_string(name)
        for id_column, name_column in [("player1_id", "player1_name"), ("player2_id", "player2_name")]
        for player_id, name in matches[[id_column, name_column]]
        .drop_duplicates(id_column, keep="last")
        .itertuples(index=False, name=None)
    }
    all_names.update(player_names)
    records = build_records(matches, all_names)

    print(f"Filtering players with {min_matches}+ matches...")
    all_ids = pd.concat([matches["player1_id"], matches["player2_id"]])
    match_counts = all_ids.value_counts()
    eligible_ids = set(match_counts[match_counts >= min_matches].index.astype(int).tolist())

    matches = matches[
        matches["player1_id"].isin(eligible_ids)
        & matches["player2_id"].isin(eligible_ids)
    ]

    players, player_names = filter_players(players, eligible_ids, matches)
    write_json(DATA_STAGING_DIR / "players.json", players)

    print("Building H2H player files...")
    player_payloads = build_player_files(
        matches,
        player_names,
        DATA_STAGING_DIR / "h2h",
        DATA_STAGING_DIR / "og",
    )
    write_json(DATA_STAGING_DIR / "rivalries.json", build_rivalries(player_payloads, players))
    write_json(DATA_STAGING_DIR / "records.json", records)

    write_json(
        DATA_STAGING_DIR / "meta.json",
        {
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "players": len(players),
            "matches": int(len(matches)),
            "sources": build_source_summary(
                matches, [source["id"] for source in enabled_extra_sources]
            ),
            "source_validation": source_validation,
            "source_files": {
                label: {
                    "sha256": file_sha256(path),
                    "bytes": path.stat().st_size,
                }
                for label, path in {
                    "primary_matches": matches_path,
                    **{
                        f"{source['key']}_matches": source["path"]
                        for source in enabled_extra_sources
                    },
                    "players": players_path,
                    "tournaments": tournaments_path,
                    **(
                        {"tournament_metadata": tournament_metadata_path}
                        if tournament_metadata_path.exists()
                        else {}
                    ),
                    **({"rankings": ranking_path} if ranking_path.exists() else {}),
                }.items()
            },
        },
    )

    print("Publishing complete dataset...")
    publish_staged_data()
    print("Build completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
