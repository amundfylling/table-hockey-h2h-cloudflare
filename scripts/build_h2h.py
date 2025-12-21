#!/usr/bin/env python3
import json
import os
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

MAX_BYTES = 5 * 1024 * 1024


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


def load_players(players_path: Path) -> Tuple[Iterable[dict], Dict[int, str]]:
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
        payload = {
            "id": int(row.id),
            "name": row.name if pd.notna(row.name) else "",
            "ranking_id": int(row.ranking_id) if pd.notna(row.ranking_id) else None,
            "country": row.country if pd.notna(row.country) else "",
            "city": row.city if pd.notna(row.city) else "",
            "date_of_birth": row.date_of_birth if pd.notna(row.date_of_birth) else "",
            "sex": row.sex if pd.notna(row.sex) else "",
            "search_key": row.search_key,
        }
        players.append(payload)
        id_to_name[int(row.id)] = payload["name"]
    return players, id_to_name


def load_tournaments(tournaments_path: Path) -> Iterable[dict]:
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
            }
        )
    return tournaments


def prepare_matches(matches_path: Path) -> pd.DataFrame:
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
        matches["playoff_game_number"] = pd.Series([pd.NA] * len(matches), index=matches.index)
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

    matches["overtime"] = matches["overtime_raw"].apply(normalize_overtime)
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

    matches["id1"] = matches[["player1_id", "player2_id"]].min(axis=1)
    matches["id2"] = matches[["player1_id", "player2_id"]].max(axis=1)
    is_p1_id1 = matches["player1_id"] == matches["id1"]
    matches["goals_id1"] = matches["goals_player1"].where(is_p1_id1, matches["goals_player2"])
    matches["goals_id2"] = matches["goals_player2"].where(is_p1_id1, matches["goals_player1"])

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
    return matches


def _row_to_match(row) -> dict:
    date_value = row.date if pd.notna(row.date) else None
    return {
        "date": date_value,
        "tournament_id": int(row.tournament_id) if pd.notna(row.tournament_id) else None,
        "tournament_name": row.tournament_name,
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


def build_pairs(matches: pd.DataFrame, player_names: Dict[int, str]) -> None:
    if H2H_DIR.exists():
        shutil.rmtree(H2H_DIR)
    H2H_DIR.mkdir(parents=True, exist_ok=True)

    grouped = matches.groupby(["id1", "id2"], sort=False)
    for (id1, id2), group in grouped:
        id1_int = int(id1)
        id2_int = int(id2)

        first_row = group.iloc[0]
        name1 = player_names.get(id1_int)
        name2 = player_names.get(id2_int)
        if not name1:
            if first_row.player1_id == id1_int:
                name1 = first_row.player1_name
            else:
                name1 = first_row.player2_name
        if not name2:
            if first_row.player1_id == id2_int:
                name2 = first_row.player1_name
            else:
                name2 = first_row.player2_name

        total_matches = 0
        wins_id1 = 0
        wins_id2 = 0
        draws = 0
        goals_for_id1 = 0
        goals_for_id2 = 0
        overtime_games = 0
        first_meeting_date = None
        last_meeting_date = None
        tournaments: Dict[int, str] = {}
        last10 = deque(maxlen=10)

        current_matches = []
        current_size = 0
        chunks = []
        chunk_index = 1
        chunked = False

        def flush_chunk() -> None:
            nonlocal current_matches, current_size, chunk_index
            if not current_matches:
                return
            chunk_name = f"{id1_int}/{id2_int}.part{chunk_index}.json"
            chunk_path = H2H_DIR / chunk_name
            write_json(chunk_path, {"matches": current_matches})
            chunks.append(f"h2h/{chunk_name}")
            chunk_index += 1
            current_matches = []
            current_size = 0

        for row in group.itertuples(index=False):
            match = _row_to_match(row)
            match_bytes = len(
                json.dumps(match, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            )

            if not chunked and current_size + match_bytes + 2 > MAX_BYTES:
                chunked = True
                flush_chunk()

            if chunked and current_size + match_bytes + 2 > MAX_BYTES:
                flush_chunk()

            current_matches.append(match)
            current_size += match_bytes + 1

            total_matches += 1
            goals_for_id1 += match["goals_id1"]
            goals_for_id2 += match["goals_id2"]

            if match["goals_id1"] > match["goals_id2"]:
                wins_id1 += 1
                last10.append("W")
            elif match["goals_id1"] < match["goals_id2"]:
                wins_id2 += 1
                last10.append("L")
            else:
                draws += 1
                last10.append("D")

            if match["overtime"]:
                overtime_games += 1

            if match["date"]:
                if first_meeting_date is None:
                    first_meeting_date = match["date"]
                last_meeting_date = match["date"]

            if match["tournament_id"] is not None:
                tournaments[match["tournament_id"]] = match["tournament_name"]

        if chunked:
            flush_chunk()

        last10_w = sum(1 for r in last10 if r == "W")
        last10_l = sum(1 for r in last10 if r == "L")
        last10_d = sum(1 for r in last10 if r == "D")

        tournaments_list = [
            {"id": tid, "name": name} for tid, name in tournaments.items()
        ]
        tournaments_list.sort(key=lambda x: (x["name"].lower(), x["id"]))

        summary = {
            "total_matches": total_matches,
            "wins_id1": wins_id1,
            "wins_id2": wins_id2,
            "draws": draws,
            "goals_for_id1": goals_for_id1,
            "goals_for_id2": goals_for_id2,
            "overtime_games": overtime_games,
            "first_meeting_date": first_meeting_date,
            "last_meeting_date": last_meeting_date,
            "tournaments": tournaments_list,
            "last_10": {
                "id1": {"wins": last10_w, "losses": last10_l, "draws": last10_d},
                "id2": {"wins": last10_l, "losses": last10_w, "draws": last10_d},
            },
        }

        player1 = {"id": id1_int, "name": name1}
        player2 = {"id": id2_int, "name": name2}

        pair_path = H2H_DIR / f"{id1_int}/{id2_int}.json"
        if chunked:
            manifest = {
                "player1": player1,
                "player2": player2,
                "summary": summary,
                "chunks": chunks,
            }
            write_json(pair_path, manifest)
        else:
            payload = {
                "player1": player1,
                "player2": player2,
                "summary": summary,
                "matches": current_matches,
            }
            write_json(pair_path, payload)


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    matches_url = os.environ.get("MATCHES_PARQUET_URL", dl.DEFAULT_MATCHES_URL)
    players_url = os.environ.get("PLAYERS_CSV_URL", dl.DEFAULT_PLAYERS_URL)
    tournaments_url = os.environ.get("TOURNAMENTS_CSV_URL", dl.DEFAULT_TOURNAMENTS_URL)

    matches_path = CACHE_DIR / "scraped_matches.parquet"
    players_path = CACHE_DIR / "players_data.csv"
    tournaments_path = CACHE_DIR / "tournament_data.csv"

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

    print("Loading players...")
    players, player_names = load_players(players_path)
    write_json(DATA_DIR / "players.json", players)

    print("Loading tournaments...")
    tournaments = load_tournaments(tournaments_path)
    write_json(DATA_DIR / "tournaments.json", tournaments)

    print("Processing matches...")
    matches = prepare_matches(matches_path)

    print("Building H2H pairs...")
    build_pairs(matches, player_names)

    print("Build completed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
