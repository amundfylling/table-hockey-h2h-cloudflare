#!/usr/bin/env python3
import json
import os
import re
import sys
import shutil
import unicodedata
from collections import deque
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

import download as dl  # noqa: E402

CACHE_DIR = ROOT_DIR / ".cache"
PUBLIC_DIR = ROOT_DIR / "public"
DATA_DIR = PUBLIC_DIR / "data"
H2H_DIR = DATA_DIR / "h2h"
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
    if pd.api.types.is_float_dtype(numeric):
        numeric = numeric.where(numeric.isna() | (numeric == numeric.round(0)))
    return numeric.astype("Int64")


def normalize_overtime(value: object) -> bool:
    if pd.isna(value):
        return False
    text = str(value).strip().lower()
    if not text or text in {"none", "nan", "null", "na", "0", "false", "no"}:
        return False
    return True


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


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
    players_df["id"] = pd.to_numeric(players_df["id"], errors="coerce")
    players_df = players_df.dropna(subset=["id"])
    players_df["id"] = players_df["id"].astype(int)
    if "ranking_id" in players_df:
        players_df["ranking_id"] = to_int(players_df["ranking_id"])
    else:
        players_df["ranking_id"] = pd.Series([pd.NA] * len(players_df), index=players_df.index)

    players_df["name"] = players_df["name"].fillna("")
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

    metadata_df[id_col] = pd.to_numeric(metadata_df[id_col], errors="coerce")
    metadata_df = metadata_df.dropna(subset=[id_col])
    metadata_df[id_col] = metadata_df[id_col].astype(int)

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
    tourneys_df["id"] = pd.to_numeric(tourneys_df["id"], errors="coerce")
    tourneys_df = tourneys_df.dropna(subset=["id"])
    tourneys_df["id"] = tourneys_df["id"].astype(int)
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


EXTRA_MATCHES_URL = (
    "https://raw.githubusercontent.com/amundfylling/bordshockey.net-scraper/"
    "refs/heads/main/bordshockey_results.csv"
)

def process_matches_df(matches: pd.DataFrame) -> pd.DataFrame:
    matches["player1_id"] = pd.to_numeric(matches["player1_id"], errors="coerce")
    matches["player2_id"] = pd.to_numeric(matches["player2_id"], errors="coerce")
    matches = matches.dropna(subset=["player1_id", "player2_id"])
    matches["player1_id"] = matches["player1_id"].astype(int)
    matches["player2_id"] = matches["player2_id"].astype(int)

    if "stage_id" in matches:
        matches["stage_id"] = to_int(matches["stage_id"])
    else:
        matches["stage_id"] = pd.Series([pd.NA] * len(matches), index=matches.index)
    if "stage_sequence" in matches:
        matches["stage_sequence"] = to_int(matches["stage_sequence"])
    else:
        matches["stage_sequence"] = pd.Series([pd.NA] * len(matches), index=matches.index)
    if "round_number" in matches:
        matches["round_number"] = to_int(matches["round_number"])
    else:
        matches["round_number"] = pd.Series([pd.NA] * len(matches), index=matches.index)
    if "playoff_game_number" in matches:
        matches["playoff_game_number"] = to_int(matches["playoff_game_number"])
    else:
        matches["playoff_game_number"] = pd.Series(
            [pd.NA] * len(matches), index=matches.index
        )
    if "tournament_id" in matches:
        matches["tournament_id"] = to_int(matches["tournament_id"])
    else:
        matches["tournament_id"] = pd.Series([pd.NA] * len(matches), index=matches.index)

    matches["goals_player1"] = (
        pd.to_numeric(matches["goals_player1"], errors="coerce").fillna(0).astype(int)
    )
    matches["goals_player2"] = (
        pd.to_numeric(matches["goals_player2"], errors="coerce").fillna(0).astype(int)
    )

    overtime_text = matches["overtime_raw"].fillna("").astype(str).str.strip().str.lower()
    matches["overtime"] = ~overtime_text.isin({"", "none", "nan", "null", "na", "0", "false", "no"})
    matches["date_dt"] = pd.to_datetime(matches["date_raw"], errors="coerce")
    matches["date"] = matches["date_dt"].dt.strftime("%Y-%m-%d")

    if "tournament_name" in matches:
        matches["tournament_name"] = matches["tournament_name"].fillna("")
    else:
        matches["tournament_name"] = ""
    if "stage" in matches:
        matches["stage"] = matches["stage"].fillna("")
    else:
        matches["stage"] = ""
    if "player1_name" in matches:
        matches["player1_name"] = matches["player1_name"].fillna("")
    else:
        matches["player1_name"] = ""
    if "player2_name" in matches:
        matches["player2_name"] = matches["player2_name"].fillna("")
    else:
        matches["player2_name"] = ""

    matches["id1"] = matches["player1_id"].where(
        matches["player1_id"] <= matches["player2_id"], matches["player2_id"]
    )
    matches["id2"] = matches["player2_id"].where(
        matches["player1_id"] <= matches["player2_id"], matches["player1_id"]
    )
    is_p1_id1 = matches["player1_id"] == matches["id1"]
    matches["goals_id1"] = matches["goals_player1"].where(is_p1_id1, matches["goals_player2"])
    matches["goals_id2"] = matches["goals_player2"].where(is_p1_id1, matches["goals_player1"])

    return matches


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
        }
    )
    return process_matches_df(matches)


def read_extra_matches_csv(csv_path: Path) -> pd.DataFrame:
    matches = pd.read_csv(csv_path)
    # Map CSV columns to internal schema
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
        }
    )
    # Ensure missing IDs are NaN so they get dropped or handled correctly
    if "stage_id" not in matches:
        matches["stage_id"] = pd.NA
    if "tournament_id" not in matches:
        matches["tournament_id"] = pd.NA

    return process_matches_df(matches)


def _row_to_match(row) -> dict:
    date_value = row.date if pd.notna(row.date) else None
    return {
        "date": date_value,
        "tournament_id": int(row.tournament_id) if pd.notna(row.tournament_id) else None,
        "tournament_name": row.tournament_name,
        "tournament_level": (
            normalize_tournament_level(row.tournament_level)
            if hasattr(row, "tournament_level")
            else None
        ),
        "stage": row.stage,
        "stage_id": int(row.stage_id) if pd.notna(row.stage_id) else None,
        "stage_sequence": int(row.stage_sequence) if pd.notna(row.stage_sequence) else None,
        "round_number": int(row.round_number) if pd.notna(row.round_number) else None,
        "playoff_game_number": (
            int(row.playoff_game_number) if pd.notna(row.playoff_game_number) else None
        ),
        "goals_id1": int(row.goals_id1),
        "goals_id2": int(row.goals_id2),
        "overtime": bool(row.overtime),
    }


def filter_players(players: Iterable[dict], eligible_ids: set[int]) -> Tuple[Iterable[dict], Dict[int, str]]:
    filtered = []
    id_to_name = {}
    for player in players:
        if player["id"] in eligible_ids:
            filtered.append(player)
            id_to_name[player["id"]] = player["name"]
    return filtered, id_to_name


def build_player_files(matches: pd.DataFrame, player_names: Dict[int, str]) -> None:
    if H2H_DIR.exists():
        shutil.rmtree(H2H_DIR)
    H2H_DIR.mkdir(parents=True, exist_ok=True)

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

        matches_id1.append(
            {
                "date": date_value,
                "tournament_id": tournament_id,
                "tournament_name": tournament_name_values[idx],
                "tournament_level": tournament_level,
                "stage": stage_values[idx],
                "stage_id": stage_id,
                "stage_sequence": stage_sequence,
                "round_number": round_number,
                "playoff_game_number": playoff_game_number,
                "goals_for_player": goals_id1,
                "goals_for_opponent": goals_id2,
                "overtime": overtime,
            }
        )

        total_matches += 1
        goals_for_id1 += goals_id1
        goals_for_id2 += goals_id2

        if goals_id1 > goals_id2:
            wins_id1 += 1
            last10.append("W")
        elif goals_id1 < goals_id2:
            wins_id2 += 1
            last10.append("L")
        else:
            draws += 1
            last10.append("D")

        if overtime:
            overtime_games += 1

        if date_value:
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
        write_json(H2H_DIR / f"{pid}.json", payload)


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    matches_url = os.environ.get("MATCHES_PARQUET_URL", dl.DEFAULT_MATCHES_URL)
    players_url = os.environ.get("PLAYERS_CSV_URL", dl.DEFAULT_PLAYERS_URL)
    tournaments_url = os.environ.get("TOURNAMENTS_CSV_URL", dl.DEFAULT_TOURNAMENTS_URL)
    tournament_metadata_url = os.environ.get(
        "TOURNAMENT_METADATA_CSV_URL", dl.DEFAULT_TOURNAMENT_METADATA_URL
    )
    ranking_url = os.environ.get("RANKING_TXT_URL", dl.DEFAULT_RANKING_URL)
    try:
        min_matches = int(os.environ.get("MIN_MATCHES", "50"))
    except ValueError as exc:
        raise ValueError("MIN_MATCHES must be an integer.") from exc
    if min_matches < 1:
        raise ValueError("MIN_MATCHES must be at least 1.")

    matches_path = CACHE_DIR / "scraped_matches.parquet"
    extra_matches_path = CACHE_DIR / "extra_matches.csv"
    players_path = CACHE_DIR / "players_data.csv"
    tournaments_path = CACHE_DIR / "tournament_data.csv"
    tournament_metadata_path = CACHE_DIR / "tournament_metadata.csv"
    ranking_path = CACHE_DIR / "ranking.txt"

    print("Downloading source data...")
    dl.download(
        matches_url,
        matches_path,
        etag_path=CACHE_DIR / "scraped_matches.etag",
        last_modified_path=CACHE_DIR / "scraped_matches.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )
    dl.download(
        EXTRA_MATCHES_URL,
        extra_matches_path,
        etag_path=CACHE_DIR / "extra_matches.etag",
        last_modified_path=CACHE_DIR / "extra_matches.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )
    dl.download(
        players_url,
        players_path,
        etag_path=CACHE_DIR / "players_data.etag",
        last_modified_path=CACHE_DIR / "players_data.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )
    dl.download(
        tournaments_url,
        tournaments_path,
        etag_path=CACHE_DIR / "tournament_data.etag",
        last_modified_path=CACHE_DIR / "tournament_data.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )
    dl.download(
        tournament_metadata_url,
        tournament_metadata_path,
        etag_path=CACHE_DIR / "tournament_metadata.etag",
        last_modified_path=CACHE_DIR / "tournament_metadata.last_modified",
        retries=5,
        backoff=1.5,
        timeout=120,
    )
    try:
        dl.download(
            ranking_url,
            ranking_path,
            etag_path=CACHE_DIR / "ranking.etag",
            last_modified_path=CACHE_DIR / "ranking.last_modified",
            retries=5,
            backoff=1.5,
            timeout=120,
        )
    except RuntimeError as exc:
        if ranking_path.exists():
            print(f"Warning: failed to refresh ranking; using cached file. {exc}")
        else:
            print(f"Warning: failed to download ranking; continuing without it. {exc}")

    print("Loading players...")
    rankings = load_rankings(ranking_path) if ranking_path.exists() else {}
    players, player_names = load_players(players_path, rankings)

    print("Loading tournaments...")
    tournament_levels = load_tournament_levels(tournament_metadata_path)
    tournaments = load_tournaments(tournaments_path, tournament_levels)
    write_json(DATA_DIR / "tournaments.json", tournaments)

    print("Processing matches...")
    matches_main = read_matches_parquet(matches_path)
    matches_extra = read_extra_matches_csv(extra_matches_path)

    matches = pd.concat([matches_main, matches_extra], ignore_index=True)
    matches["tournament_level"] = matches["tournament_id"].map(
        lambda tid: tournament_levels.get(int(tid)) if pd.notna(tid) else None
    )

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

    print(f"Filtering players with {min_matches}+ matches...")
    all_ids = pd.concat([matches["player1_id"], matches["player2_id"]])
    match_counts = all_ids.value_counts()
    eligible_ids = set(match_counts[match_counts >= min_matches].index.astype(int).tolist())

    matches = matches[
        matches["player1_id"].isin(eligible_ids)
        & matches["player2_id"].isin(eligible_ids)
    ]

    players, player_names = filter_players(players, eligible_ids)
    write_json(DATA_DIR / "players.json", players)

    print("Building H2H player files...")
    build_player_files(matches, player_names)

    print("Build completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
