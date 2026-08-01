# Table Hockey H2H

Static, zero-runtime head-to-head comparisons for table hockey matchups. The site builds all data at CI time and ships only static files to Cloudflare Pages.

## Data source

Source of truth lives in the external repo:

- https://github.com/amundfylling/Scorpion-Scraper-2.0

Raw URLs (overridable via env vars):

- `MATCHES_PARQUET_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/scraped_matches.parquet`
- `PLAYERS_CSV_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/players_data.csv`
- `TOURNAMENTS_CSV_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/tournament_data.csv`
- `TOURNAMENT_METADATA_CSV_URL`: `https://raw.githubusercontent.com/amundfylling/Scorpion-Scraper-2.0/main/data/tournament_metadata.csv`
- `RANKING_TXT_URL`: `https://stiga.trefik.cz/ithf/ranking/ranking.txt`
- `EXTRA_MATCHES_URL`: bordshockey.net supplemental results CSV (set to an empty string to disable)
- `REQUIRE_RANKINGS`: set to `1` to fail the build instead of deploying without ranking data
- `MIN_RANKING_ROWS`: minimum parsed ranking rows when rankings are required (CI: `1000`)
- `MAX_RANKING_AGE_DAYS`: optional maximum age for required ranking data (CI: `45`)
- `REQUIRE_TOURNAMENT_METADATA`: set to `1` to require tournament-level metadata
- `MIN_TOURNAMENT_LEVELS`: minimum parsed tournament levels when metadata is required (CI: `1000`)
- `MAX_MAIN_REJECTION_RATE`: maximum rejected fraction of primary match rows (CI: `0.01`)
- `MAX_EXTRA_REJECTION_RATE`: maximum rejected fraction of supplemental rows (CI: `0.40`)

## Build-time slicing

`python3 scripts/build_h2h.py`:

- Downloads raw data into `.cache/`.
- Converts and normalizes types.
- Joins current world ranking data by `RankingID` / `ID_Player`.
- Joins tournament level metadata by `TournamentID`.
- Filters to players with at least `MIN_MATCHES` matches (`50` by default).
- Generates static JSON into `public/data/`:
  - `players.json` (50+ matches only)
  - `tournaments.json`
  - `meta.json` (counts, validation metrics, and source hashes; powers the freshness footer)
  - `h2h/{playerId}.json` (one file per player; opponents nested)
  - `og/{playerId}.json` (compact share metadata for the Pages Function)

The build writes a complete sibling staging tree and swaps it into `public/data/` only after every
artifact succeeds, so an interrupted local build leaves the previous complete dataset available.

No Parquet/CSV source files are stored in this repo, and generated JSON is a build artifact deployed to Pages.

## Local run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 scripts/build_h2h.py
python3 -m http.server --directory public 8000
```

Open `http://localhost:8000`.

Run the data validation tests with:

```bash
python -m unittest discover -s tests -v
node --test tests-js/*.test.mjs
```

For a smaller local H2H build, raise the match threshold:

```bash
MIN_MATCHES=1000 python3 scripts/build_h2h.py
```

To rebuild from files already present in `.cache/` without refreshing the sources:

```bash
SKIP_DOWNLOADS=1 python3 scripts/build_h2h.py
```

## Cloudflare Pages deployment

Required GitHub Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`

The GitHub Actions workflow validates pull requests, then builds and deploys the dataset on
push, on a weekly schedule, or via manual dispatch.

## Changing the data source

Override URLs at build time using environment variables:

```bash
export MATCHES_PARQUET_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/scraped_matches.parquet"
export PLAYERS_CSV_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/players_data.csv"
export TOURNAMENTS_CSV_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/tournament_data.csv"
export TOURNAMENT_METADATA_CSV_URL="https://raw.githubusercontent.com/your-org/your-repo/main/data/tournament_metadata.csv"
export RANKING_TXT_URL="https://example.com/ranking.txt"
export EXTRA_MATCHES_URL="https://example.com/supplemental-results.csv"
export REQUIRE_RANKINGS=1
python3 scripts/build_h2h.py
```
