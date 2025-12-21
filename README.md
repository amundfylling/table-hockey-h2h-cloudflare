# Table Hockey H2H

Static, zero-runtime head-to-head comparisons for table hockey matchups. The site builds all data at CI time and ships only static files to Cloudflare Pages.

## Data source

Source of truth lives in the external repo:
- https://github.com/amundfylling/Scorpion-Scraper-2.0

Raw URLs (overridable via env vars):
- `MATCHES_PARQUET_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/scraped_matches.parquet`
- `PLAYERS_CSV_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/players_data.csv`
- `TOURNAMENTS_CSV_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/tournament_data.csv`

## Build-time slicing

`python scripts/build_h2h.py`:
- Downloads raw data into `.cache/`.
- Converts and normalizes types.
- Filters to players with at least 50 matches.
- Generates static JSON into `public/data/`:
  - `players.json` (50+ matches only)
  - `tournaments.json`
  - `h2h/{playerId}.json` (one file per player; opponents nested)

No Parquet/CSV source files are stored in this repo, and generated JSON is a build artifact deployed to Pages.

## Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install pandas pyarrow requests
python scripts/build_h2h.py
python -m http.server --directory public 8000
```

Open `http://localhost:8000`.

## Cloudflare Pages deployment

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

The GitHub Actions workflow builds the dataset and uploads `public/` to Pages on push, on a weekly schedule, or via manual dispatch.

## Changing the data source

Override URLs at build time using environment variables:

```bash
export MATCHES_PARQUET_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/scraped_matches.parquet"
export PLAYERS_CSV_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/players_data.csv"
export TOURNAMENTS_CSV_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/tournament_data.csv"
python scripts/build_h2h.py
```
