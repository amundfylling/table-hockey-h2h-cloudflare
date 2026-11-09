# Plan 007: The build reads the Czech and Latvian sources from a stable branch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- scripts/build_h2h.py README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S (plus one action by the maintainer in another repository, see "Prerequisite")
- **Risk**: LOW
- **Depends on**: none inside this repo; a prerequisite outside it
- **Category**: migration
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

Four result sources (Czech Trefik, Finland, escore.live and galdahokejs.lv, together about
347,000 of the site's games) are downloaded from a working branch of another repository:
`amundfylling/table-hockey-scrapers`, branch `claude/project-thread-1p5hg7`. That branch name is a
temporary agent-session branch. On 2026-11-09 the files existed only there: the same paths on
`main` returned HTTP 404. If that branch is merged and deleted, or simply stops being updated,
the daily build either fails on a 404 (Trefik, escore and galdahokejs are required) or keeps
publishing data that no longer refreshes. The site would keep serving the last good deploy, but
nothing new would ship until someone notices. Pointing at `main` removes a silent dependency on a
branch nobody will remember.

## Prerequisite (maintainer action, outside this repo)

The scraper repository must publish these files on its `main` branch and keep them updated there:
`data/trefik_results.parquet`, `data/escore_results.parquet`, `data/galdahokejs_results.parquet`
(and `data/finland_results.parquet` once the Finnish scraper has results).

The executor must not attempt this. Step 1 checks whether it has happened.

## Current state

- `scripts/build_h2h.py`:

  ```python
  # scripts/build_h2h.py:398
  # The table-hockey-scrapers repo writes one Parquet per site (Czech Trefik, Finland,
  # escore.live, galdahokejs.lv). It also writes all_results.parquet with the four combined;
  # the build reads them one by one so each gets its own rejection budget and meta.json entry.
  TABLE_HOCKEY_SCRAPERS_DATA_URL = (
      "https://raw.githubusercontent.com/amundfylling/table-hockey-scrapers/"
      "refs/heads/claude/project-thread-1p5hg7/data"
  )
  ```

  The four `EXTRA_SOURCES` entries below it (`trefik`, `finland`, `escore`, `galdahokejs`) build
  their URLs from this constant. Only `finland` has `"allow_missing": True`.

- `README.md` lines 20-23 repeat the four full URLs with the same branch name (entries
  `TREFIK_MATCHES_URL`, `FINLAND_MATCHES_URL`, `ESCORE_MATCHES_URL`, `GALDAHOKEJS_MATCHES_URL`).

- The other two supplemental sources already use `refs/heads/main` in their own repositories.

## Commands you will need

| Purpose              | Command | Expected on success |
|----------------------|---------|---------------------|
| Check a file on main | `curl -s -o /dev/null -w "%{http_code}\n" -I https://raw.githubusercontent.com/amundfylling/table-hockey-scrapers/refs/heads/main/data/trefik_results.parquet` | `200` |
| Find references      | `grep -rn "project-thread-1p5hg7" --include="*.py" --include="*.md" --include="*.yml" . --exclude-dir=plans --exclude-dir=node_modules` | lists the lines to change |
| Compile              | `python -m py_compile scripts/build_h2h.py` | exit 0 |
| Data-free tests      | `python -m unittest discover -s tests -p "test_[!h]*.py"` | OK |

## Scope

**In scope** (the only files you should modify):
- `scripts/build_h2h.py` (the one constant)
- `README.md` (the four URLs)

**Out of scope** (do NOT touch, even though they look related):
- The `amundfylling/table-hockey-scrapers` repository.
- `.github/workflows/build.yml` — it does not override these URLs.
- The `allow_missing` flags.

## Git workflow

- Branch: `advisor/007-scraper-main-branch`
- One commit; plain imperative sentence, e.g.
  `Read the table-hockey-scrapers results from main`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Check the prerequisite

Run the `curl` command from the table for each of `trefik_results.parquet`,
`escore_results.parquet` and `galdahokejs_results.parquet` on `refs/heads/main`.

**Verify**: all three print `200`. If any prints `404`, STOP: the prerequisite has not been done.
Report which files are missing. Do not change any code.

### Step 2: Confirm the files on main are current

For each of the three files, compare sizes between the two branches:

`curl -sI <url on main> | grep -i content-length` and the same for the
`claude/project-thread-1p5hg7` URL.

**Verify**: for each file, the size on `main` is at least 95% of the size on the working branch.
If `main` is clearly smaller, STOP and report both sizes (main may hold an older scrape).

### Step 3: Switch the constant

In `scripts/build_h2h.py`, change the second string of `TABLE_HOCKEY_SCRAPERS_DATA_URL` from
`"refs/heads/claude/project-thread-1p5hg7/data"` to `"refs/heads/main/data"`.

**Verify**: `python -m py_compile scripts/build_h2h.py` → exit 0.

### Step 4: Update the README

In `README.md` lines 20-23, replace `refs/heads/claude/project-thread-1p5hg7` with
`refs/heads/main` in the four URLs.

**Verify**: the "Find references" grep from the table returns no lines.

### Step 5: Run the data-free suite

**Verify**: `python -m unittest discover -s tests -p "test_[!h]*.py"` → OK.

## Test plan

No new tests; no test references the branch name (confirm with
`grep -rn "project-thread" tests tests-js`, expected: no output).

## Done criteria

- [ ] The "Find references" grep returns no lines
- [ ] `python -m py_compile scripts/build_h2h.py` exits 0
- [ ] `python -m unittest discover -s tests -p "test_[!h]*.py"` exits 0
- [ ] `git status --short` shows only `scripts/build_h2h.py`, `README.md` and `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any required file returns 404 on `main` (Step 1). Set this plan's status to
  `BLOCKED (scraper data not on main yet)` in `plans/README.md`.
- The files on `main` are clearly older or smaller than on the working branch (Step 2).
- The constant or the README lines no longer contain `claude/project-thread-1p5hg7` (someone
  already changed them; check whether the new target is stable and report).

## Maintenance notes

- The first build after this change downloads from the new URLs; `meta.json`'s `source_files`
  hashes for `trefik_matches`, `escore_matches` and `galdahokejs_matches` should match the
  previous build if the two branches hold the same files. The reviewer can compare against
  `https://h2h.puck.no/data/meta.json`.
- The scraper repository's scheduled job must commit to `main` from now on, or the data stops
  refreshing without any error here. The footer's per-source "latest date" (from `meta.json`
  `sources[].latest_date`) is the place to watch.
- `AUDIT.md` lists mutable upstream branch URLs as a known residual risk in general; this plan
  only removes the temporary branch, it does not pin commits.
