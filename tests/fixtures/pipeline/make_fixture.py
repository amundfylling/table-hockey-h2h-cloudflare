#!/usr/bin/env python3
"""Cut the pipeline snapshot fixture out of a full source download in .cache/.

The fixture is a handful of whole tournaments chosen to run every part of the build:
tournaments reported by two sources (Sportscorpion and bordshockey.net, one only partly
overlapping), a final group that repeats an earlier stage's games, walkovers, overtime, a team
event, a World Championship with a full playoff bracket, and one tournament from each smaller
source. Run it again only to change the selection; then refresh the snapshot with
UPDATE_SNAPSHOTS=1 python -m unittest tests.test_pipeline_snapshot

    python3 scripts/build_h2h.py          # fills .cache/ with the full sources
    python3 tests/fixtures/pipeline/make_fixture.py
"""
import csv
import io
import json
import re
import sys
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT_DIR / ".cache"
OUT_DIR = Path(__file__).resolve().parent / "cache"

SPORTSCORPION = [
    2215, 2241, 2243, 2316,  # Swedish leagues also on bordshockey.net (2243 only partly)
    843, 844,  # 844 repeats games of 843
    8264,  # walkovers and overtime
    8417,  # team event
    893,  # XIV World Championship 2015
]
EXTRA = {
    "extra_matches.parquet": [491683938, 228664264, 493844175, 485839677, 946460669],
    "trefik_matches.parquet": [3000000366],
    "escore_matches.parquet": [5000000073],
    "galdahokejs_matches.parquet": [6000000040],
    "table_hockey_eu_matches.parquet": [2000000061],
}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    primary = pd.read_parquet(CACHE_DIR / "scraped_matches.parquet")
    primary = primary[primary["TournamentID"].isin(SPORTSCORPION)]
    primary.to_parquet(OUT_DIR / "scraped_matches.parquet", index=False)
    names = set(primary["Player1"]) | set(primary["Player2"])
    ids = set(primary["Player1ID"].astype(int)) | set(primary["Player2ID"].astype(int))
    tournament_ids = set(SPORTSCORPION)
    for name, wanted in EXTRA.items():
        frame = pd.read_parquet(CACHE_DIR / name)
        frame = frame[frame["TournamentID"].isin(wanted)]
        frame.to_parquet(OUT_DIR / name, index=False)
        names |= set(frame["Player1"].dropna()) | set(frame["Player2"].dropna())
        tournament_ids |= set(wanted)

    players = pd.read_csv(CACHE_DIR / "players_data.csv", dtype=str, encoding="utf-8-sig")
    keep = players["PlayerID"].astype(int).isin(ids) | players["Name"].isin(names)
    players = players[keep]
    players.to_csv(OUT_DIR / "players_data.csv", index=False)

    tournaments = pd.read_csv(CACHE_DIR / "tournament_data.csv", dtype=str)
    tournaments[tournaments["ID"].astype(int).isin(tournament_ids)].to_csv(
        OUT_DIR / "tournament_data.csv", index=False
    )
    metadata = pd.read_csv(CACHE_DIR / "tournament_metadata.csv", dtype=str)
    metadata[metadata["TournamentID"].astype(int).isin(tournament_ids)].to_csv(
        OUT_DIR / "tournament_metadata.csv", index=False, quoting=csv.QUOTE_MINIMAL
    )

    ranking_ids = {str(int(float(value))) for value in players["RankingID"].dropna()}
    lines = (CACHE_DIR / "ranking.txt").read_text(encoding="utf-8").splitlines()
    out = io.StringIO()
    for index, line in enumerate(lines):
        fields = re.split(r"\t", line)
        if index < 2 or (len(fields) > 1 and fields[1] in ranking_ids):
            out.write(line + "\n")
    (OUT_DIR / "ranking.txt").write_text(out.getvalue(), encoding="utf-8")
    # The real alias groups that name a fixture player, so the merge paths run too.
    aliases = json.loads((ROOT_DIR / "public" / "aliases.json").read_text(encoding="utf-8"))
    fixture_ids = set(players["PlayerID"].astype(int)) | ids
    groups = [g for g in aliases["groups"] if any(i in fixture_ids for i in g["ids"])]
    (OUT_DIR.parent / "aliases.json").write_text(
        json.dumps({"groups": groups}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    for path in sorted(OUT_DIR.iterdir()):
        print(f"{path.name}: {path.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
