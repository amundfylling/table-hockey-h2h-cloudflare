#!/usr/bin/env python3
import html
import json
import hashlib
import os
import re
import sys
import shutil
import unicodedata
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple
from urllib.parse import urlparse
from xml.sax.saxutils import escape

import numpy as np
import pandas as pd
import requests

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import download as dl  # noqa: E402
import ratings  # noqa: E402
import tournaments as tournament_pages  # noqa: E402

CACHE_DIR = ROOT_DIR / ".cache"
PUBLIC_DIR = ROOT_DIR / "public"
DATA_DIR = PUBLIC_DIR / "data"
H2H_DIR = DATA_DIR / "h2h"
OG_H2H_DIR = DATA_DIR / "og"
DATA_STAGING_DIR = ROOT_DIR / ".data-build"
DATA_BACKUP_DIR = ROOT_DIR / ".data-previous"
SITEMAP_PATH = PUBLIC_DIR / "sitemap.xml"
SITE_URL = os.environ.get("SITE_URL", "https://h2h.puck.no").rstrip("/")
# One sitemap file holds at most 50,000 URLs. Matchups need this many games to be listed.
SITEMAP_MAX_URLS = 50_000
SITEMAP_MIN_PAIR_GAMES = 5
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


# Letters NFKD does not split into a base letter and a mark.
_PLAYER_NAME_FOLDS = str.maketrans({"ø": "o", "æ": "ae", "đ": "d", "ł": "l", "ß": "ss"})


def normalize_player_name(value: object) -> str:
    """Key for telling whether two sources name the same player.

    Case, accents and word order are ignored ("Östlund Peter" = "Peter Ostlund"), since the
    sources write names in either order and some spell them without accents.
    """
    if pd.isna(value):
        return ""
    text = html.unescape(str(value)).casefold().translate(_PLAYER_NAME_FOLDS)
    text = normalize_dedupe_text(text)
    return " ".join(sorted(text.split()))


def unescape_text(series: pd.Series) -> pd.Series:
    """Decode HTML entities some source rows carry ("Bj&#246;rn" -> "Björn")."""
    return series.map(lambda value: html.unescape(value) if "&" in value else value)


def build_unique_player_name_index(players: Iterable[dict]) -> Dict[str, int]:
    """Return normalized names that identify one and only one player.

    Keys come from normalize_player_name, so accents and word order don't matter
    ("Hamacek Filip" finds "Filip Hamáček"); a key two players share is left out.
    """
    candidates: Dict[str, set[int]] = {}
    for player in players:
        name_key = normalize_player_name(player.get("name", ""))
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


# Player country spellings in the source data mapped to one name per nation. Entries that name
# two countries or no country at all are left out (no known nation).
NATION_ALIASES = {
    "россия": "Russia",
    "росиия": "Russia",
    "казакстан": "Kazakhstan",
    "kazakistan": "Kazakhstan",
    "republic of lithuania": "Lithuania",
}
NATION_IGNORED = {"", "-", "test"}
# ITHF ranking nation codes, used when a player has no country in the player data.
RANKING_NATIONS = {
    "BLR": "Belarus", "CAN": "Canada", "CZE": "Czech Republic", "DEN": "Denmark",
    "ESP": "Spain", "EST": "Estonia", "FIN": "Finland", "FRA": "France", "GER": "Germany",
    "HUN": "Hungary", "IRL": "Ireland", "ISR": "Israel", "ITA": "Italy", "KAZ": "Kazakhstan",
    "LAT": "Latvia", "LTU": "Lithuania", "NED": "Netherlands", "NOR": "Norway",
    "POL": "Poland", "PRT": "Portugal", "POR": "Portugal", "RUS": "Russia", "SLO": "Slovenia",
    "SRB": "Serbia", "SUI": "Switzerland", "SVK": "Slovakia", "SWE": "Sweden",
    "UKR": "Ukraine", "USA": "United States of America", "AUT": "Austria",
}


def player_nation(player: dict) -> str:
    """One nation name for a player record, or "" when the data doesn't say."""
    country = str(player.get("country") or "").strip()
    key = country.casefold()
    if key in NATION_ALIASES:
        return NATION_ALIASES[key]
    if "/" in country or " - " in country:
        return ""  # Two countries: don't guess which one, not even from the ranking.
    if key not in NATION_IGNORED:
        return country
    return RANKING_NATIONS.get(str(player.get("ranking_nation") or "").strip().upper(), "")


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

    players_df["name"] = unescape_text(players_df["name"].fillna("").astype(str)).str.strip()
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
    tourneys_df["name"] = unescape_text(tourneys_df["name"].fillna("").astype(str)).str.strip()
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


# The table-hockey-scrapers repo writes one Parquet per site (Czech Trefik, Finland,
# escore.live, galdahokejs.lv). It also writes all_results.parquet with the four combined;
# the build reads them one by one so each gets its own rejection budget and meta.json entry.
TABLE_HOCKEY_SCRAPERS_DATA_URL = (
    "https://raw.githubusercontent.com/amundfylling/table-hockey-scrapers/"
    "refs/heads/claude/project-thread-1p5hg7/data"
)

# Supplemental result sources, each a Parquet in the bordshockey.net-scraper schema. Rows are
# told apart by their "source" column (see DATA_SOURCES). url_env overrides the URL; an empty
# value disables the source. "key" names the source in meta.json. With "allow_missing", a
# file the server does not have (HTTP 404) skips the source instead of failing the build.
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
    {
        "id": "trefik",
        "key": "trefik",
        "url_env": "TREFIK_MATCHES_URL",
        "url": f"{TABLE_HOCKEY_SCRAPERS_DATA_URL}/trefik_results.parquet",
        "cache_name": "trefik_matches.parquet",
    },
    {
        "id": "finland",
        "key": "finland",
        "url_env": "FINLAND_MATCHES_URL",
        "url": f"{TABLE_HOCKEY_SCRAPERS_DATA_URL}/finland_results.parquet",
        "cache_name": "finland_matches.parquet",
        # The scraper has no Finnish results yet, so the file may not exist.
        "allow_missing": True,
    },
    {
        "id": "escore",
        "key": "escore",
        "url_env": "ESCORE_MATCHES_URL",
        "url": f"{TABLE_HOCKEY_SCRAPERS_DATA_URL}/escore_results.parquet",
        "cache_name": "escore_matches.parquet",
    },
    {
        "id": "galdahokejs",
        "key": "galdahokejs",
        "url_env": "GALDAHOKEJS_MATCHES_URL",
        "url": f"{TABLE_HOCKEY_SCRAPERS_DATA_URL}/galdahokejs_results.parquet",
        "cache_name": "galdahokejs_matches.parquet",
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
    {
        "id": "trefik",
        "name": "stiga.trefik.cz",
        "url": "https://stiga.trefik.cz/",
        "marker": "trefik",
    },
    {
        "id": "finland",
        "name": "tulos.poytajaakiekko.fi",
        "url": "https://tulos.poytajaakiekko.fi/",
        "marker": "poytajaakiekko",
    },
    {
        "id": "escore",
        "name": "escore.live",
        "url": "https://escore.live/",
        "marker": "escore.live",
    },
    {
        "id": "galdahokejs",
        "name": "galdahokejs.lv",
        "url": "https://galdahokejs.lv/",
        "marker": "galdahokejs",
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


# A side with this many goals is a placeholder an organiser typed to move a player on (99-0,
# 55-0, 77-11, 64-2), not a played game. Real long-format games reach about 30.
PLACEHOLDER_MIN_GOALS = 50
# Sportscorpion playoff stages whose 20-10 and 20-0 "games" are series results entered as
# games (18-й Кубок Северо-Запада, 2018). Only their 20+ goal rows are dropped.
PLACEHOLDER_STAGE_IDS = {8419, 8421}
PLACEHOLDER_STAGE_MIN_GOALS = 20


def process_matches_df(matches: pd.DataFrame, keep_walkovers: bool = False) -> pd.DataFrame:
    """Validate and normalize one source's rows.

    Walkovers are dropped, unless keep_walkovers is set: then they stay, marked in an
    is_walkover column, so the cross-source dedupe can also remove other sources' copies
    of them (drop_walkovers removes them afterwards).
    """
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

    most_goals = pd.concat([goals_player1, goals_player2], axis=1).max(axis=1)
    source_text = (
        matches["source"].fillna("").astype(str).str.strip()
        if "source" in matches
        else pd.Series("", index=matches.index)
    )
    stage_ids = to_int(matches["stage_id"]) if "stage_id" in matches else pd.Series(
        pd.NA, index=matches.index, dtype="Int64"
    )
    is_placeholder = (most_goals.ge(PLACEHOLDER_MIN_GOALS) | (
        source_text.eq("")
        & stage_ids.isin(PLACEHOLDER_STAGE_IDS)
        & most_goals.ge(PLACEHOLDER_STAGE_MIN_GOALS)
    )).fillna(False) & valid_rows
    placeholder_rows = int(is_placeholder.sum())
    if placeholder_rows:
        print(f"Dropped {placeholder_rows} rows with placeholder scores.")
        valid_rows &= ~is_placeholder

    walkover_column = first_existing_column(matches, ["walkover", "Walkover"])
    walkover_rows = 0
    is_walkover = pd.Series(False, index=matches.index)
    if walkover_column:
        walkover_text = (
            matches[walkover_column].fillna("").astype(str).str.strip().str.casefold()
        )
        is_walkover = walkover_text.isin(
            {"1", "1.0", "true", "yes", "y", "walkover", "wo", "w/o"}
        )
        is_walkover &= valid_rows
        if is_walkover.any():
            walkover_rows = int(is_walkover.sum())
            if keep_walkovers:
                print(f"Marked {walkover_rows} walkover rows (dropped after the dedupe).")
            else:
                print(f"Dropped {walkover_rows} walkover rows.")
                valid_rows &= ~is_walkover
    # Counted as dropped either way: walkovers never reach the site.
    dropped_rows = int((~valid_rows).sum()) + (walkover_rows if keep_walkovers else 0)
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
    if keep_walkovers:
        matches["is_walkover"] = is_walkover.loc[valid_rows].astype(bool)

    ensure_int_column(matches, "stage_id")
    ensure_int_column(matches, "stage_sequence")
    # Some sources number playoff rounds as fractions (0.125 = 1/8 final, 1 = final); the
    # integer column drops those, so tournament brackets read the round order from here.
    matches["round_value"] = pd.to_numeric(
        matches.get("round_number", pd.Series(pd.NA, index=matches.index)), errors="coerce"
    )
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
    for column in ["tournament_name", "stage", "player1_name", "player2_name"]:
        matches[column] = unescape_text(matches[column])

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
        "accepted_rows": len(matches) - (walkover_rows if keep_walkovers else 0),
        "dropped_rows": dropped_rows,
        "walkover_rows": walkover_rows,
        "placeholder_rows": placeholder_rows,
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
# Two more loose passes, for games the ids or dates hide. Some players have two ids (a
# sportscorpion duplicate record, or a supplemental-source id for someone sportscorpion
# knows), so one pass matches players by name. And one source dates a multi-day event's
# games by the day they were played while the other puts them all on the first day, so the
# last pass lets the dates differ by a day.
NAME_OVERLAP_DEDUPE_COLUMNS = [
    "name_low",
    "name_high",
    "date",
    "goals_name_low",
    "goals_name_high",
    "overtime",
]
SHIFTED_DATE_OVERLAP_DEDUPE_COLUMNS = [
    "id1",
    "id2",
    "shifted_date",
    "goals_id1",
    "goals_id2",
    "overtime",
]
# Last, games that differ in both ids and date (one source dates a multi-day event by its
# first day, and gives a player another id). Without ids or the date this is weak evidence,
# so it only pairs games inside tournament pairs an earlier pass accepted.
SHIFTED_NAME_OVERLAP_DEDUPE_COLUMNS = [
    "name_low",
    "name_high",
    "shifted_date",
    "goals_name_low",
    "goals_name_high",
    "overtime",
]
# Without matching names, a primary event also needs this share of its own games as
# evidence, so a 3,000-game event isn't paired on 11 look-alike games (Riga Cup 2018). Real
# pairs start at about 6% (a world championship bordshockey has only the Swedish games of).
MIN_CROSSWALK_EVIDENCE_SHARE = 0.02


def infer_tournament_crosswalk(
    matches: pd.DataFrame,
    is_preferred: pd.Series,
    tournament_ids: pd.Series,
    tournament_names: Optional[pd.Series],
    signature_columns: list[str] = OVERLAP_DEDUPE_COLUMNS,
    min_matches: int = MIN_TOURNAMENT_CROSSWALK_MATCHES,
    use_names: bool = True,
    known_pairs: Iterable[Tuple[int, int]] = (),
    primary_sizes: Optional[Dict[int, int]] = None,
    known_only: bool = False,
) -> Tuple[
    Dict[Tuple[int, int], int],
    list[Tuple[Tuple[int, int], list[int], list[int]]],
]:
    """Infer unambiguous tournament pairs between two sources from repeated game overlaps.

    is_preferred marks the rows of the source whose rows are kept; the rest are "primary".

    Cross-source tournament IDs and names are not always the same. Matching normalized
    names are direct evidence when use_names is set; otherwise, require min_matches
    distinct matching game signatures. Pairs in known_pairs (accepted by an earlier pass)
    need no more evidence. With known_only, only those pairs are accepted. In all cases
    the inferred ID mapping must be one-to-one.

    primary_sizes gives each primary tournament's game count: without matching names a
    pair needs MIN_CROSSWALK_EVIDENCE_SHARE of the primary event's games as evidence too.
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

    known_pairs = set(known_pairs)
    candidates = {
        pair
        for pair, count in evidence.items()
        if pair in known_pairs
        or (
            not known_only
            and (
                pair in matching_name_pairs
                or count >= extra_primary_evidence(pair[0], min_matches, primary_sizes)
            )
        )
    }
    primary_candidates: Dict[int, set[int]] = {}
    preferred_candidates: Dict[int, set[int]] = {}
    for primary_id, preferred_id in candidates:
        primary_candidates.setdefault(primary_id, set()).add(preferred_id)
        preferred_candidates.setdefault(preferred_id, set()).add(primary_id)

    # One preferred event may stand for several primary ones (bordshockey lists a two-day
    # cup as one event where Sportscorpion has a qualification and a final tournament).
    # That is accepted when each primary event has min_matches games of its own: games
    # shared by two primary events would mean those two are copies, which stays ambiguous.
    pair_signatures = {
        (int(primary_id), int(preferred_id)): set(
            pd.util.hash_pandas_object(group[signature_columns], index=False).tolist()
        )
        for (primary_id, preferred_id), group in unique_signatures.groupby(
            pair_columns, sort=False
        )
    }

    def preferred_is_unambiguous(preferred_id: int) -> bool:
        primaries = preferred_candidates[preferred_id]
        if len(primaries) == 1:
            return True
        seen: set = set()
        for primary_id in primaries:
            pair = (primary_id, preferred_id)
            needed = extra_primary_evidence(primary_id, min_matches, primary_sizes)
            if pair in known_pairs:
                needed = 0
            if evidence[pair] < needed or seen & pair_signatures[pair]:
                return False
            seen |= pair_signatures[pair]
        return True

    crosswalk = {
        (primary_id, preferred_id): evidence[(primary_id, preferred_id)]
        for primary_id, preferred_id in candidates
        if len(primary_candidates[primary_id]) == 1
        and preferred_is_unambiguous(preferred_id)
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


def extra_primary_evidence(
    primary_id: int, min_matches: int, primary_sizes: Optional[Dict[int, int]]
) -> int:
    """Games of evidence needed to pair a primary event without matching names."""
    size = (primary_sizes or {}).get(primary_id, 0)
    return max(min_matches, int(np.ceil(size * MIN_CROSSWALK_EVIDENCE_SHARE)))


def with_overlap_keys(matches: pd.DataFrame) -> pd.DataFrame:
    """Add the name-based columns of NAME_OVERLAP_DEDUPE_COLUMNS.

    name_low/name_high are the two players' normalized names in sorted order, with each
    one's goals. A row whose names are missing or the same gets a key no other row has.
    """
    matches = matches.copy()
    names = {}
    for column in ["player1_name", "player2_name"]:
        values = matches[column] if column in matches else pd.Series("", index=matches.index)
        keys = {value: normalize_player_name(value) for value in values.dropna().unique()}
        names[column] = values.map(keys).fillna("")
    first, second = names["player1_name"], names["player2_name"]
    usable = first.ne("") & second.ne("") & first.ne(second)
    first_low = first <= second
    unique_keys = pd.Series(
        [f"#row {index}" for index in matches.index], index=matches.index, dtype="object"
    )
    matches["name_low"] = first.where(first_low, second).where(usable, unique_keys)
    matches["name_high"] = second.where(first_low, first).where(usable, unique_keys)
    # Frames without the per-player columns have player 1 as id1.
    goals1 = matches["goals_player1"] if "goals_player1" in matches else matches["goals_id1"]
    goals2 = matches["goals_player2"] if "goals_player2" in matches else matches["goals_id2"]
    matches["goals_name_low"] = goals1.where(first_low, goals2)
    matches["goals_name_high"] = goals2.where(first_low, goals1)
    return matches


def match_source_pair(
    matches: pd.DataFrame,
    is_preferred: pd.Series,
    tournament_ids: pd.Series,
    tournament_names: Optional[pd.Series],
    pair_counts: Optional[Dict[Tuple[int, int], int]] = None,
) -> Tuple[list[int], list[int]]:
    """Pair overlapping games between two sources; returns (kept, dropped) row indices.

    With a pair_counts dict, it counts the dropped games per (primary, preferred)
    tournament pair.

    kept[i] is the preferred-source row that replaces dropped[i].
    """
    drop_indices: list[int] = []
    kept_indices: list[int] = []
    # Tournament mappings accepted so far, kept one-to-one across the passes.
    primary_to_preferred: Dict[int, int] = {}
    preferred_to_primary: Dict[int, set[int]] = {}
    matches = with_overlap_keys(matches)
    primary_sizes = {
        int(tournament_id): int(count)
        for tournament_id, count in tournament_ids.loc[~is_preferred].dropna().value_counts().items()
    }
    # (columns, min_matches, use_names, date_shift, known_only)
    passes = [
        (OVERLAP_DEDUPE_COLUMNS, MIN_TOURNAMENT_CROSSWALK_MATCHES, True, 0, False),
        (LOOSE_OVERLAP_DEDUPE_COLUMNS, MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES, False, 0, False),
        (NAME_OVERLAP_DEDUPE_COLUMNS, MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES, False, 0, False),
    ]
    if "date_dt" in matches:
        passes += [
            (SHIFTED_DATE_OVERLAP_DEDUPE_COLUMNS, MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES, False,
             shift, False)
            for shift in (1, -1)
        ]
        passes += [
            (SHIFTED_NAME_OVERLAP_DEDUPE_COLUMNS, MIN_LOOSE_TOURNAMENT_CROSSWALK_MATCHES, False,
             shift, True)
            for shift in (1, -1)
        ]
    # The exact pass runs first; each later pass only sees rows the earlier ones left
    # unpaired.
    for signature_columns, min_matches, use_names, date_shift, known_only in passes:
        remaining = matches.index.difference(drop_indices + kept_indices)
        if date_shift:
            # The preferred source's date moved by date_shift days, the other's as is.
            shifted = matches["date_dt"] + pd.Timedelta(days=date_shift)
            matches["shifted_date"] = shifted.dt.strftime("%Y-%m-%d").where(
                is_preferred, matches["date"]
            )
        tournament_crosswalk, overlap_groups = infer_tournament_crosswalk(
            matches.loc[remaining],
            is_preferred.loc[remaining],
            tournament_ids.loc[remaining],
            tournament_names.loc[remaining] if tournament_names is not None else None,
            signature_columns=signature_columns,
            min_matches=min_matches,
            use_names=use_names,
            known_pairs=primary_to_preferred.items(),
            primary_sizes=primary_sizes,
            known_only=known_only,
        )
        # A primary event keeps the one preferred event it was given. A preferred event
        # mapped earlier can take another primary event only on that event's own
        # min_matches games (the earlier one's games are paired already).
        tournament_crosswalk = {
            (primary_id, preferred_id)
            for (primary_id, preferred_id), count in tournament_crosswalk.items()
            if primary_to_preferred.get(primary_id, preferred_id) == preferred_id
            and (
                preferred_to_primary.get(preferred_id, {primary_id}) == {primary_id}
                or primary_id in preferred_to_primary[preferred_id]
                or count >= extra_primary_evidence(primary_id, min_matches, primary_sizes)
            )
        }
        for primary_id, preferred_id in tournament_crosswalk:
            primary_to_preferred[primary_id] = preferred_id
            preferred_to_primary.setdefault(preferred_id, set()).add(primary_id)
        for pair, primary_indices, preferred_indices in overlap_groups:
            if pair not in tournament_crosswalk:
                continue
            pair_count = min(len(preferred_indices), len(primary_indices))
            kept_indices.extend(preferred_indices[:pair_count])
            drop_indices.extend(primary_indices[:pair_count])
            if pair_counts is not None:
                pair_counts[pair] = pair_counts.get(pair, 0) + pair_count
    return kept_indices, drop_indices


def deduplicate_overlapping_source_matches(
    matches: pd.DataFrame,
    merged_into: Optional[Dict[int, Tuple[int, int]]] = None,
) -> pd.DataFrame:
    """Drop games that two sources both report.

    Each source in DATA_SOURCES is compared with every source listed before it, and on
    overlap the later source's row is kept. A kept row stands for one game, so it replaces
    at most one row from one other source.

    With a merged_into dict, it is filled with {tournament id: (other tournament id, games)}
    for each tournament that lost games to another source's tournament: the one it lost
    the most games to, and how many.
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
            pair_counts: Dict[Tuple[int, int], int] = {}
            kept_indices, pair_drops = match_source_pair(
                matches.loc[rows],
                is_preferred.loc[rows],
                tournament_ids.loc[rows],
                tournament_names.loc[rows] if tournament_names is not None else None,
                pair_counts,
            )
            if merged_into is not None:
                for (lost_id, kept_id), count in pair_counts.items():
                    if count > merged_into.get(lost_id, (None, 0))[1]:
                        merged_into[lost_id] = (kept_id, count)
            if not pair_drops:
                continue
            print(
                f"Matched {len(pair_drops)} {other_id} games also reported by {preferred_id}."
            )
            backfill_tournament_levels(matches, kept_indices, pair_drops)
            carry_over_dropped_row_facts(matches, source_ids, kept_indices, pair_drops)
            drop_indices.extend(pair_drops)
            used_indices.extend(kept_indices)

    if not drop_indices:
        return matches
    return matches.drop(index=drop_indices).reset_index(drop=True)


def carry_over_dropped_row_facts(
    matches: pd.DataFrame,
    source_ids: pd.Series,
    kept_indices: list[int],
    drop_indices: list[int],
) -> None:
    """Copy what the kept row must not lose from the row it replaces, in place.

    A walkover stays a walkover (is_walkover), so drop_walkovers also removes the other
    source's copy. And a Sportscorpion row's player ids win: the kept row's player who is
    the same person (by name, else by id) gets the Sportscorpion id, so a game doesn't move
    to another source's duplicate or synthetic id for that player.
    """
    if "is_walkover" in matches:
        walkover = matches["is_walkover"].fillna(False).astype(bool)
        hits = [kept for kept, dropped in zip(kept_indices, drop_indices) if walkover.at[dropped]]
        if hits:
            matches.loc[hits, "is_walkover"] = True
    columns = ["player1_id", "player2_id", "player1_name", "player2_name"]
    if any(column not in matches for column in columns):
        return
    primary_id = DATA_SOURCES[0]["id"]
    changed: list[int] = []
    for kept, dropped in zip(kept_indices, drop_indices):
        if source_ids.at[dropped] != primary_id or source_ids.at[kept] == primary_id:
            continue
        kept_ids = (int(matches.at[kept, "player1_id"]), int(matches.at[kept, "player2_id"]))
        primary_ids = (
            int(matches.at[dropped, "player1_id"]),
            int(matches.at[dropped, "player2_id"]),
        )
        if set(kept_ids) == set(primary_ids):
            continue
        kept_names = [normalize_player_name(matches.at[kept, c]) for c in columns[2:]]
        primary_names = [normalize_player_name(matches.at[dropped, c]) for c in columns[2:]]

        def same(kept_side: int, primary_side: int) -> bool:
            if kept_ids[kept_side] == primary_ids[primary_side]:
                return True
            name = kept_names[kept_side]
            return bool(name) and name == primary_names[primary_side]

        if same(0, 0) and same(1, 1):
            new_ids = primary_ids
        elif same(0, 1) and same(1, 0):
            new_ids = (primary_ids[1], primary_ids[0])
        else:
            continue
        if new_ids[0] == new_ids[1]:
            continue
        matches.at[kept, "player1_id"] = new_ids[0]
        matches.at[kept, "player2_id"] = new_ids[1]
        changed.append(kept)
    if not changed or "goals_player1" not in matches:
        return
    rows = matches.loc[changed]
    p1_low = rows["player1_id"] <= rows["player2_id"]
    matches.loc[changed, "id1"] = rows["player1_id"].where(p1_low, rows["player2_id"])
    matches.loc[changed, "id2"] = rows["player2_id"].where(p1_low, rows["player1_id"])
    matches.loc[changed, "goals_id1"] = rows["goals_player1"].where(p1_low, rows["goals_player2"])
    matches.loc[changed, "goals_id2"] = rows["goals_player2"].where(p1_low, rows["goals_player1"])
    print(f"Kept Sportscorpion player ids on {len(changed)} games another source reported.")


def drop_walkovers(matches: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Remove rows marked is_walkover; returns the rest and how many came from other sources.

    Those are the other sources' copies of a walkover, which carry no walkover flag.
    """
    if "is_walkover" not in matches:
        return matches, 0
    walkover = matches["is_walkover"].fillna(False).astype(bool)
    copies = int((walkover & classify_sources(matches["source"]).ne(DATA_SOURCES[0]["id"])).sum())
    if copies:
        print(f"Dropped {copies} other-source copies of walkovers.")
    return matches.loc[~walkover].drop(columns="is_walkover").reset_index(drop=True), copies


# A source sometimes files the same games under a second tournament (a team cup re-entered
# as an open championship stage, an event imported twice). Two tournaments of one source are
# copies when they share this many identical games, and that share of the smaller one's.
MIN_WITHIN_SOURCE_COPY_MATCHES = 10
MIN_WITHIN_SOURCE_COPY_SHARE = 0.5
WITHIN_SOURCE_SIGNATURE = ["id1", "id2", "date", "goals_id1", "goals_id2", "overtime"]


def deduplicate_within_source_copies(matches: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """Drop games one source lists in two tournaments; returns the rest and the drop count.

    Of a pair of copied tournaments, the individual one is kept over a team one, else the
    one with more games, else the lower id. Games pair one-to-one, so a game played twice
    that day in the kept tournament stays twice.
    """
    needed = [*WITHIN_SOURCE_SIGNATURE, "tournament_id", "source"]
    if matches.empty or any(column not in matches for column in needed):
        return matches, 0
    frame = matches[needed].copy()
    frame["tournament_id"] = to_int(frame["tournament_id"])
    frame = frame[frame["tournament_id"].notna()]
    frame["source_id"] = classify_sources(frame["source"])
    frame["sig"] = pd.util.hash_pandas_object(
        frame[["source_id", *WITHIN_SOURCE_SIGNATURE]], index=False
    ).to_numpy()
    sizes = frame.groupby(["source_id", "tournament_id"]).size()
    per_event = frame.groupby(["sig", "source_id", "tournament_id"]).size().rename("n").reset_index()
    multi = per_event[per_event.duplicated("sig", keep=False)]
    if multi.empty:
        return matches, 0
    pairs = multi.merge(multi, on=["sig", "source_id"], suffixes=("_a", "_b"))
    pairs = pairs[pairs["tournament_id_a"] < pairs["tournament_id_b"]]
    evidence = pairs.groupby(["source_id", "tournament_id_a", "tournament_id_b"]).size()
    team_events: set = set()
    if "TournamentType" in matches:
        types = matches.loc[frame.index, "TournamentType"].fillna("").astype(str).str.casefold()
        team_events = set(
            zip(frame.loc[types.eq("team"), "source_id"], frame.loc[types.eq("team"), "tournament_id"])
        )

    def rank(source_id: str, tournament_id: int) -> tuple:
        return ((source_id, tournament_id) not in team_events, sizes[(source_id, tournament_id)],
                -tournament_id)

    losers: Dict[Tuple[str, int], set] = {}
    for (source_id, first, second), count in evidence.items():
        smaller = min(sizes[(source_id, first)], sizes[(source_id, second)])
        if count < MIN_WITHIN_SOURCE_COPY_MATCHES or count < MIN_WITHIN_SOURCE_COPY_SHARE * smaller:
            continue
        keep, lose = (first, second) if rank(source_id, first) >= rank(source_id, second) else (second, first)
        losers.setdefault((source_id, lose), set()).add(keep)
    if not losers:
        return matches, 0
    drop: list[int] = []
    taken: set = set()
    for (source_id, lose), keeps in losers.items():
        kept_counts = per_event[
            per_event["source_id"].eq(source_id) & per_event["tournament_id"].isin(keeps)
        ].groupby("sig")["n"].sum()
        rows = frame[frame["source_id"].eq(source_id) & frame["tournament_id"].eq(lose)]
        for sig, group in rows.groupby("sig"):
            available = int(kept_counts.get(sig, 0))
            candidates = [index for index in group.index if index not in taken][:available]
            drop.extend(candidates)
            taken.update(candidates)
        print(
            f"Tournament {lose} ({source_id}) repeats games of {sorted(keeps)}; "
            "dropped its copies."
        )
    return matches.drop(index=drop).reset_index(drop=True), len(drop)


def find_id_name_conflicts(matches: pd.DataFrame, limit: int = 50) -> list[dict]:
    """Ids that carry two unrelated names (no shared word) inside one tournament.

    One id for two people in one event is a source mapping bug; this only reports it.
    """
    columns = ["tournament_id", "player1_id", "player2_id", "player1_name", "player2_name"]
    if matches.empty or any(column not in matches for column in columns):
        return []
    long = pd.concat(
        [
            matches[["tournament_id", f"player{side}_id", f"player{side}_name"]].set_axis(
                ["tournament_id", "id", "name"], axis=1
            )
            for side in (1, 2)
        ],
        ignore_index=True,
    ).dropna(subset=["tournament_id"]).drop_duplicates()
    keys = {name: normalize_player_name(name) for name in long["name"].dropna().unique()}
    long["key"] = long["name"].map(keys).fillna("")
    long = long[long["key"].ne("")].drop_duplicates(["tournament_id", "id", "key"])
    multi = long[long.duplicated(["tournament_id", "id"], keep=False)]
    conflicts = []
    for (tournament_id, player_id), group in multi.groupby(["tournament_id", "id"], sort=False):
        token_sets = [set(key.split()) for key in group["key"]]
        if any(not (a & b) for i, a in enumerate(token_sets) for b in token_sets[i + 1:]):
            conflicts.append({
                "tournament_id": int(tournament_id),
                "player_id": int(player_id),
                "names": sorted(set(group["name"].astype(str))),
            })
    conflicts.sort(key=lambda item: (item["player_id"], item["tournament_id"]))
    if conflicts:
        print(f"Warning: {len(conflicts)} tournament ids carry two unrelated player names:")
        for item in conflicts[:10]:
            print(f"  id {item['player_id']} in tournament {item['tournament_id']}: {item['names']}")
    return conflicts[:limit] if limit else conflicts


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
    return process_matches_df(matches, keep_walkovers=True)


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
            resolved_ids = matches[name_column].map(normalize_player_name).map(
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


# Ids from 9,000,000 up to 20,000,000 are 9,000,000 + the player's ITHF id: the sources give
# that id to a player who has an ITHF id but no Sportscorpion record.
ITHF_ID_BASE = 9_000_000
ITHF_ID_END = 20_000_000

# Sportscorpion accounts that stand in for unknown entrants. Each one covers many different
# people, so they get no page, rating or leaderboard row (their games still count for their
# opponents).
PLACEHOLDER_PLAYER_IDS = {204, 1847, 5600, 6076, 10169}
PLACEHOLDER_NAME_KEYS = {"", "no no", "нет нет", "0 0", "extraplats", "extraplats extraplats"}
HIDDEN_NAME = "* *"

# Look-alike letters for names that mix the two alphabets inside one word.
_CYRILLIC_TO_LATIN = str.maketrans("аеорсухкАВЕКМНОРСТХ", "aeopcyxkABEKMHOPCTX")
_LATIN_TO_CYRILLIC = str.maketrans("aeopcyxkABEKMHOPCTX", "аеорсухкАВЕКМНОРСТХ")
_LATIN_RE = re.compile(r"[A-Za-z]")
_CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")


def ithf_id_from_player_id(player_id: int) -> Optional[int]:
    """The ITHF id a 9,000,000 + ITHF player id was built from, or None."""
    if ITHF_ID_BASE <= int(player_id) < ITHF_ID_END:
        return int(player_id) - ITHF_ID_BASE
    return None


def tidy_display_name(name: str) -> str:
    """A player name fit to show: one alphabet per word, no stray spaces or commas, and
    names typed in all lower or all upper case put in title case."""
    text = re.sub(r"\s+", " ", str(name or "")).strip().strip(",;").strip()
    words = []
    for word in text.split(" "):
        latin = len(_LATIN_RE.findall(word))
        cyrillic = len(_CYRILLIC_RE.findall(word))
        if latin and cyrillic:
            word = word.translate(
                _CYRILLIC_TO_LATIN if latin >= cyrillic else _LATIN_TO_CYRILLIC
            )
        words.append(word)
    text = " ".join(words)
    letters = [character for character in text if character.isalpha()]
    if len(letters) > 3 and (text == text.lower() or text == text.upper()):
        text = " ".join(word[:1].upper() + word[1:].lower() for word in text.split(" "))
    return text


def placeholder_player_ids(players: Iterable[dict], matches: pd.DataFrame) -> set[int]:
    """Ids that stand for unknown entrants rather than one person.

    These are the listed ids plus every id whose profile name and every match name is blank
    or a known filler ("no no", "- -", ...).
    """
    def is_filler(name: object) -> bool:
        key = normalize_dedupe_text(name)
        return key in PLACEHOLDER_NAME_KEYS or re.fullmatch(r"(player \d+)?", key) is not None

    profile_names = {int(player["id"]): player.get("name", "") for player in players}
    names: Dict[int, set] = {}
    for id_column, name_column in [("player1_id", "player1_name"), ("player2_id", "player2_name")]:
        pairs = matches[[id_column, name_column]].drop_duplicates()
        for player_id, name in pairs.itertuples(index=False, name=None):
            names.setdefault(int(player_id), set()).add(clean_optional_string(name))
    found = set(PLACEHOLDER_PLAYER_IDS)
    for player_id, seen in names.items():
        if HIDDEN_NAME in seen:
            continue  # A real player whose name Sportscorpion hides.
        if all(is_filler(name) for name in seen) and is_filler(profile_names.get(player_id, "")):
            found.add(player_id)
    return found


def tidy_players(
    players: Iterable[dict],
    matches: pd.DataFrame,
    rankings: Optional[Dict[int, dict]] = None,
) -> list[dict]:
    """Give each page player a name, a nation and a search key worth showing.

    - A blank Sportscorpion profile ("Player 289") takes the name the games use.
    - A name Sportscorpion hides ("* *") shows as "Hidden player {id}".
    - A 9,000,000 + ITHF id gets the ITHF ranking fields, so it has a nation and world rank.
    - `country` becomes the one cleaned nation (player_nation), also used by the leaderboard.
    - `alt_names` lists other names the games use (e.g. the Latin spelling of a Cyrillic
      profile name), so search finds the player under either.
    """
    rankings = rankings or {}
    match_names: Dict[int, Dict[str, int]] = {}
    for id_column, name_column in [("player1_id", "player1_name"), ("player2_id", "player2_name")]:
        counts = matches.groupby([id_column, name_column]).size()
        for (player_id, name), count in counts.items():
            cleaned = clean_optional_string(name)
            if cleaned and cleaned != HIDDEN_NAME:
                bucket = match_names.setdefault(int(player_id), {})
                bucket[cleaned] = bucket.get(cleaned, 0) + int(count)

    tidied = []
    for player in players:
        player = dict(player)
        pid = int(player["id"])
        seen = match_names.get(pid, {})
        name = str(player.get("name") or "").strip()
        if not name or re.fullmatch(r"Player \d+", name):
            if seen:
                name = max(seen.items(), key=lambda item: (item[1], item[0]))[0]
            else:
                name = f"Hidden player {pid}"
        name = tidy_display_name(name)
        player["name"] = name

        ithf_id = ithf_id_from_player_id(pid)
        if ithf_id is not None and not player.get("ranking_id"):
            player["ranking_id"] = ithf_id
            if ithf_id in rankings:
                player.update(rankings[ithf_id])
        player["country"] = player_nation(player)

        own_key = normalize_player_name(name)
        alt_names = sorted(
            {
                tidy_display_name(other)
                for other in seen
                if normalize_player_name(tidy_display_name(other)) != own_key
            }
        )
        if alt_names:
            player["alt_names"] = alt_names
        else:
            player.pop("alt_names", None)
        player["search_key"] = normalize_search_key(" ".join([name, *alt_names]))
        tidied.append(player)
    tidied.sort(key=lambda player: player["name"].casefold())
    return tidied


def build_player_files(
    matches: pd.DataFrame,
    player_names: Dict[int, str],
    h2h_dir: Path = H2H_DIR,
    og_dir: Path = OG_H2H_DIR,
    ratings: Optional[Dict[int, dict]] = None,
    forecasts: Optional[Dict[Tuple[int, int], list]] = None,
    pair_stats: Optional[Dict[Tuple[int, int], list]] = None,
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
        if ratings and pid in ratings:
            player_payloads[pid]["rating"] = ratings[pid]

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
        # [win, draw, loss] if they met today, from the file owner's side.
        forecast = (forecasts or {}).get((id1_int, id2_int))
        if forecast:
            player_payloads[id1_int]["opponents"][str(id2_int)]["forecast"] = forecast
            player_payloads[id2_int]["opponents"][str(id1_int)]["forecast"] = forecast[::-1]
        # [games, points, expected points, variance] from the file owner's side, against the
        # ratings before each game (all games, both players' aliases merged).
        stats = (pair_stats or {}).get((id1_int, id2_int))
        if stats:
            games, points, expected, variance = stats
            player_payloads[id1_int]["opponents"][str(id2_int)]["vs_rating"] = stats
            player_payloads[id2_int]["opponents"][str(id1_int)]["vs_rating"] = [
                games, round(games - points, 2), round(games - expected, 2), variance
            ]

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



def load_alias_groups(path: Path = PUBLIC_DIR / "aliases.json") -> list:
    """Id groups from aliases.json that belong to one person."""
    try:
        groups = json.loads(path.read_text(encoding="utf-8")).get("groups", [])
    except (OSError, ValueError, AttributeError):
        return []
    return [group["ids"] for group in groups if isinstance(group, dict) and group.get("ids")]


LEADERBOARD_CHANGE_DAYS = 90


def build_leaderboard(
    players: Iterable[dict],
    player_ratings: Dict[int, dict],
    today: str,
    alias_groups: Iterable[dict] = (),
    change_days: int = LEADERBOARD_CHANGE_DAYS,
) -> dict:
    """data/leaderboard.json: every player with a page and a rating, best rating first.

    Each row is a list in `fields` order. `change` is the rating now minus the rating
    `change_days` before `today` (null when the player had no rating yet), so the page can show
    who is climbing, and `world_rank` is the player's ITHF world rank (null when unranked) so the
    page can set the two rankings side by side. Ids in one alias group share a rating and are
    listed once, under the first of the group's ids that has a page, with the group's name and
    the group's best world rank.
    """
    players = list(players)
    page_ids = {int(player["id"]) for player in players}
    listed_as: Dict[int, int] = {}
    group_names: Dict[int, str] = {}
    for group in alias_groups:
        ids = [int(pid) for pid in group.get("ids") or []]
        keep = next((pid for pid in ids if pid in page_ids), None)
        if keep is None:
            continue
        for pid in ids:
            listed_as[pid] = keep
        if group.get("name"):
            group_names[keep] = str(group["name"])
    cutoff = (
        datetime.strptime(today, "%Y-%m-%d").date() - timedelta(days=change_days)
    ).isoformat()

    # The best ITHF world rank among the ids listed as one player.
    world_rank: Dict[int, int] = {}
    for player in players:
        rank = player.get("world_rank")
        if rank is None or rank != rank:
            continue
        keep = listed_as.get(int(player["id"]), int(player["id"]))
        world_rank[keep] = min(int(rank), world_rank.get(keep, int(rank)))

    rows = []
    for player in players:
        pid = int(player["id"])
        if listed_as.get(pid, pid) != pid:
            continue
        rating = player_ratings.get(pid)
        history = (rating or {}).get("history") or []
        if not rating or not history:
            continue
        before = [point for point in history if point[0] and point[0] <= cutoff]
        change = rating["rating"] - before[-1][1] if before else None
        dated = [point[0] for point in history if point[0]]
        peak = rating.get("peak") or {}
        rows.append([
            pid,
            group_names.get(pid) or player.get("name") or f"Player {pid}",
            player_nation(player),
            rating["rating"],
            rating["rd"],
            rating["games"],
            peak.get("rating"),
            peak.get("date"),
            max(dated) if dated else None,
            change,
            world_rank.get(pid),
        ])
    rows.sort(key=lambda row: (-row[3], row[4], row[1]))
    return {
        "as_of": today,
        "change_days": change_days,
        "fields": [
            "id", "name", "nation", "rating", "rd", "games", "peak", "peak_date", "last_played",
            "change", "world_rank",
        ],
        "players": rows,
    }


def load_alias_group_records(path: Path = PUBLIC_DIR / "aliases.json") -> list:
    """The groups in aliases.json with their names ({"name", "ids"})."""
    try:
        groups = json.loads(path.read_text(encoding="utf-8")).get("groups", [])
    except (OSError, ValueError, AttributeError):
        return []
    return [group for group in groups if isinstance(group, dict) and group.get("ids")]


def build_sitemap(
    player_payloads: Dict[int, dict],
    generated_on: str,
    site_url: str = SITE_URL,
    max_urls: int = SITEMAP_MAX_URLS,
    min_pair_games: int = SITEMAP_MIN_PAIR_GAMES,
    tournament_ids: Iterable[int] = (),
    tournament_dates: Optional[Dict[int, str]] = None,
) -> str:
    """sitemap.xml text: the home, ratings, changelog, leaderboard and tournaments pages, every player and tournament, then the most played
    matchups.

    Matchups are listed once, lower id first, most games first, until the file is full. Each page's
    lastmod is the last day its content can have changed (a player's latest game, the later of the
    pair's latest games, a tournament's date), not the build date, so crawlers can trust it.
    """
    base = site_url.rstrip("/")
    tournament_dates = {int(k): v for k, v in (tournament_dates or {}).items()}

    def day(value) -> str:
        text = str(value or "")[:10]
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) or text > generated_on:
            return generated_on
        return text

    last_game: Dict[int, str] = {}
    for pid, payload in player_payloads.items():
        dates = [
            str(opponent["summary"].get("last_meeting_date") or "")[:10]
            for opponent in payload["opponents"].values()
        ]
        # The rating counts every game, including ones against opponents too rare to list.
        history = (payload.get("rating") or {}).get("history") or []
        if history and history[-1]:
            dates.append(str(history[-1][0] or "")[:10])
        last_game[int(pid)] = day(max(dates, default=""))

    urls = [
        (f"{base}/", generated_on),
        (f"{base}/ratings", generated_on),
        (f"{base}/changelog", generated_on),
        (f"{base}/leaderboard", generated_on),
        (f"{base}/tournaments", generated_on),
    ]
    urls.extend(
        (f"{base}/?p1={pid}", last_game[pid]) for pid in sorted(int(pid) for pid in player_payloads)
    )
    urls.extend(
        (f"{base}/tournament?id={tid}", day(tournament_dates.get(tid)))
        for tid in sorted(int(t) for t in tournament_ids)
    )
    pairs = []
    for pid, payload in player_payloads.items():
        for opponent_id, opponent in payload["opponents"].items():
            if int(opponent_id) <= int(pid):
                continue
            games = int(opponent["summary"].get("total_matches", 0) or 0)
            if games >= min_pair_games:
                pairs.append((-games, int(pid), int(opponent_id)))
    pairs.sort()
    room = max(0, max_urls - len(urls))
    urls.extend(
        (f"{base}/?p1={a}&p2={b}", max(last_game.get(a, generated_on), last_game.get(b, generated_on)))
        for _, a, b in pairs[:room]
    )
    urls = urls[:max_urls]
    entries = "".join(
        f"<url><loc>{escape(url)}</loc><lastmod>{lastmod}</lastmod></url>\n"
        for url, lastmod in urls
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{entries}</urlset>\n"
    )


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
        # Pair date ranges aggregate this instead of the "YYYY-MM-DD" strings: pandas
        # has no fast groupby min/max for strings and falls back to a Python loop over
        # every pair (most of the records time). "date" is formatted from date_dt, so
        # the earliest day formats to the same string.
        "day": games["date_dt"].to_numpy(),
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
        first_day=("day", "min"),
        last_day=("day", "max"),
        first_row=("row", "min"),
    ).reset_index()
    pairs["first_date"] = pairs.pop("first_day").dt.strftime("%Y-%m-%d")
    pairs["last_date"] = pairs.pop("last_day").dt.strftime("%Y-%m-%d")

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

    The primary source is always listed; supplemental ones only when in enabled_ids and
    they have games (a source can be enabled before its scraper finds any).
    """
    enabled = {DATA_SOURCES[0]["id"], *enabled_ids}
    source_ids = classify_sources(matches["source"])
    summary = []
    for source in DATA_SOURCES:
        if source["id"] not in enabled:
            continue
        mask = source_ids.eq(source["id"])
        if source["id"] != DATA_SOURCES[0]["id"] and not mask.any():
            continue
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


def describe_source_files(paths: Dict[str, Path]) -> Dict[str, dict]:
    """Checksum and size of each source file, as meta.json records them."""
    return {
        label: {"sha256": file_sha256(path), "bytes": path.stat().st_size}
        for label, path in paths.items()
    }


def sources_unchanged(source_files: Dict[str, dict], published_meta_url: str) -> bool:
    """True when the meta.json at published_meta_url was built from exactly these files.

    Scheduled builds use this to skip rebuilding and redeploying unchanged data. Any doubt
    (no URL, a failed request, a malformed file) means build.
    """
    if not published_meta_url:
        return False
    try:
        response = requests.get(published_meta_url, timeout=30)
        response.raise_for_status()
        published = response.json().get("source_files")
    except (requests.RequestException, ValueError, AttributeError) as exc:
        print(f"Could not read the published meta.json ({exc}); building.")
        return False
    return published == source_files


def write_github_output(name: str, value: str) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT")
    if output_path:
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"{name}={value}\n")


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
        for source in list(enabled_extra_sources):
            if source.get("allow_missing") and not source["path"].exists():
                print(f"Supplemental match source {source['id']} has no cached file; skipping it.")
                enabled_extra_sources.remove(source)
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
                try:
                    download_cached(source["download_url"], source["path"])
                except RuntimeError as exc:
                    if not (source.get("allow_missing") and dl.is_not_found(exc)):
                        raise
                    print(
                        f"Supplemental match source {source['id']} has no file yet "
                        f"({source['download_url']}); skipping it."
                    )
                    source["path"].unlink(missing_ok=True)
                    enabled_extra_sources.remove(source)
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

    source_files = describe_source_files({
        "primary_matches": matches_path,
        **{f"{source['key']}_matches": source["path"] for source in enabled_extra_sources},
        "players": players_path,
        "tournaments": tournaments_path,
        **(
            {"tournament_metadata": tournament_metadata_path}
            if tournament_metadata_path.exists()
            else {}
        ),
        **({"rankings": ranking_path} if ranking_path.exists() else {}),
    })
    if sources_unchanged(source_files, os.environ.get("SKIP_IF_SOURCES_MATCH_URL", "")):
        print("Sources match the published dataset; skipping the build.")
        write_github_output("changed", "false")
        return 0
    write_github_output("changed", "true")

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
    nations = {int(player["id"]): player_nation(player) for player in players}

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
    merged_into: Dict[int, Tuple[int, int]] = {}
    matches = deduplicate_overlapping_source_matches(matches, merged_into)
    deduped_count = before_dedupe_count - len(matches)
    if deduped_count:
        print(f"Removed {deduped_count} overlapping source matches.")
    source_validation["cross_source_duplicates_removed"] = deduped_count
    matches, walkover_copies = drop_walkovers(matches)
    source_validation["walkover_copies_removed"] = walkover_copies
    matches, within_source_copies = deduplicate_within_source_copies(matches)
    source_validation["within_source_copies_removed"] = within_source_copies
    name_conflicts = find_id_name_conflicts(matches, limit=0)
    source_validation["id_name_conflicts"] = {
        "count": len(name_conflicts),
        "examples": name_conflicts[:50],
    }

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
    # A blank profile ("Player 289") keeps the name its games use.
    all_names.update(
        {pid: name for pid, name in player_names.items() if not re.fullmatch(r"Player \d+", name)}
    )
    all_names = {pid: tidy_display_name(name) for pid, name in all_names.items()}
    records = build_records(matches, all_names)

    all_matches = matches
    print(f"Filtering players with {min_matches}+ matches...")
    all_ids = pd.concat([matches["player1_id"], matches["player2_id"]])
    match_counts = all_ids.value_counts()
    eligible_ids = set(match_counts[match_counts >= min_matches].index.astype(int).tolist())
    placeholders = placeholder_player_ids(players, all_matches)
    print(f"Leaving out {len(eligible_ids & placeholders)} placeholder accounts.")
    eligible_ids -= placeholders

    matches = matches[
        matches["player1_id"].isin(eligible_ids)
        & matches["player2_id"].isin(eligible_ids)
    ]

    players, player_names = filter_players(players, eligible_ids, matches)
    players = tidy_players(players, all_matches, rankings)
    player_names = {int(player["id"]): player["name"] for player in players}
    all_names.update(player_names)
    for player_id in pd.concat([all_matches["player1_id"], all_matches["player2_id"]]).unique():
        ithf_id = ithf_id_from_player_id(int(player_id))
        if ithf_id is not None and ithf_id in rankings and not nations.get(int(player_id)):
            nations[int(player_id)] = player_nation(rankings[ithf_id])
    write_json(DATA_STAGING_DIR / "players.json", players)

    print("Computing Glicko-2 ratings and forecasts...")
    pairs = matches[["id1", "id2"]].drop_duplicates().itertuples(index=False, name=None)
    pair_stats: Dict[Tuple[int, int], list] = {}
    player_ratings, pair_forecasts = ratings.compute_ratings_and_forecasts(
        all_matches,
        player_names.keys(),
        load_alias_groups(),
        pairs=list(pairs),
        today=pd.Timestamp(datetime.now(timezone.utc).date()),
        nations=nations,
        pair_stats=pair_stats,
    )

    print("Building H2H player files...")
    player_payloads = build_player_files(
        matches,
        player_names,
        DATA_STAGING_DIR / "h2h",
        DATA_STAGING_DIR / "og",
        ratings=player_ratings,
        forecasts=pair_forecasts,
        pair_stats=pair_stats,
    )
    write_json(DATA_STAGING_DIR / "rivalries.json", build_rivalries(player_payloads, players))
    write_json(
        DATA_STAGING_DIR / "leaderboard.json",
        build_leaderboard(
            players,
            player_ratings,
            datetime.now(timezone.utc).date().isoformat(),
            load_alias_group_records(),
        ),
    )

    print("Building tournament files...")
    tournament_index = tournament_pages.build_tournament_files(
        all_matches,
        all_names,
        {int(player["id"]) for player in players},
        tournament_pages.load_tournament_details(tournament_metadata_path),
        write_json,
        DATA_STAGING_DIR / "t",
        merged_into=merged_into,
    )
    print(f"Wrote {len(tournament_index)} tournament files.")
    write_json(
        DATA_STAGING_DIR / "tournament-list.json",
        tournament_pages.build_tournament_list(
            tournament_index, all_names, {int(player["id"]) for player in players}
        ),
    )
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
            "source_files": source_files,
        },
    )

    print("Publishing complete dataset...")
    publish_staged_data()
    SITEMAP_PATH.write_text(
        build_sitemap(
            player_payloads,
            datetime.now(timezone.utc).date().isoformat(),
            tournament_ids=[entry["id"] for entry in tournament_index],
            tournament_dates={entry["id"]: entry["date"] for entry in tournament_index},
        ),
        encoding="utf-8",
    )
    print("Build completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
