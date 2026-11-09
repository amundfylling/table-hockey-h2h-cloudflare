# Plan 006: CI runs the fast tests before the data build, and the agent docs name the right test command

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- .github/workflows/build.yml AGENTS.md tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

Every pull request first downloads all sources and builds the full dataset (about 1.5 million
games), and only then runs any test. All test steps are also gated on the build step's `changed`
output. So a pull request that only touches JavaScript waits for the whole data build before the
first test runs, and if an upstream source is down or a rejection budget trips, the pull request
fails without a single test having run. Of the 20 Python test files, only
`tests/test_h2h_counts.py` reads built data; the other 19 and all Node tests need nothing but the
repo. Running them first gives feedback in about a minute and separates "the code is wrong" from
"a data source is unhappy".

Separately, `AGENTS.md` tells agents in one place to verify with `python -m unittest -v`, and in
another place says that exact command runs 0 tests. Agents that follow the first instruction
"verify" nothing.

## Current state

- `.github/workflows/build.yml` — single job `build`. Step names in order (with line numbers at
  the planned commit): `Checkout` (44), `Set up Python` (47), `Set up Node.js` (52), `Cache pip`
  (57), `Install dependencies` (65), `Build H2H data` (70, `id: build`), `Validate JavaScript
  syntax` (77), `Install Node dev tools` (81), `Run frontend and Pages Function tests` (86),
  `Validate H2H data` (90), `Install the accessibility check browser` (94), `Check accessibility`
  (99), `Deploy to Cloudflare Pages` (103).

  ```yaml
  # .github/workflows/build.yml:70
        - name: Build H2H data
          id: build
          env:
            # Only the daily run may skip: code changes always rebuild and deploy.
            SKIP_IF_SOURCES_MATCH_URL: ${{ github.event_name == 'schedule' && 'https://h2h.puck.no/data/meta.json' || '' }}
          run: python scripts/build_h2h.py

        - name: Validate JavaScript syntax
          if: steps.build.outputs.changed == 'true'
          run: find public functions -type f -name '*.js' -print0 | xargs -0 -n1 node --check

        - name: Install Node dev tools
          if: steps.build.outputs.changed == 'true'
          # KaTeX (the ratings page formula test), axe-core and Playwright.
          run: npm ci

        - name: Run frontend and Pages Function tests
          if: steps.build.outputs.changed == 'true'
          run: node --test tests-js/*.test.mjs

        - name: Validate H2H data
          if: steps.build.outputs.changed == 'true'
          run: python -m unittest discover -s tests -v
  ```

  The daily scheduled run sets `changed` to something other than `true` when the sources match
  the live site; then everything after the build is skipped. That behavior must be kept for the
  build-dependent steps (data test, accessibility check, deploy).

- Which tests need built data: `grep -ln "public/data\|\.cache\|DATA_DIR" tests/*.py tests-js/*.mjs`
  prints only `tests/test_h2h_counts.py`. It raises `FileNotFoundError` in `setUpClass` when
  `public/data/h2h` is missing.

- `unittest discover -p` takes an `fnmatch` pattern. `test_[!h]*.py` matches every test file
  whose name does not start with `test_h`, which leaves out `test_h2h_counts.py` (needs data) and
  `test_h2h_redirects.py` (does not need data, but is cheap and still runs after the build).

- `AGENTS.md`:

  ```
  # AGENTS.md:51
  # Run Tests (discovery is required; bare `python -m unittest -v` runs 0 tests)
  python -m unittest discover -s tests -v
  ```

  ```
  # AGENTS.md:227
    * Always use the existing Python test suite (`python -m unittest -v`) to verify data builds and
      sanity instead of checking files manually.
  ```

## Commands you will need

| Purpose        | Command                                                   | Expected on success |
|----------------|-----------------------------------------------------------|---------------------|
| Install        | `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && npm ci` | exit 0 |
| Fast Python    | `python -m unittest discover -s tests -p "test_[!h]*.py"` | OK                  |
| Node tests     | `node --test tests-js/*.test.mjs`                         | 0 fail              |
| YAML parses    | `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build.yml'))"` | exit 0 (if PyYAML is unavailable, use `node -e` with no parser and rely on careful review; do not install extra packages into the repo) |

## Scope

**In scope** (the only files you should modify):
- `.github/workflows/build.yml`
- `AGENTS.md` (line 227 only, plus the Testing Strategy sentence named in Step 3)

**Out of scope** (do NOT touch, even though they look related):
- `tests/test_h2h_counts.py` — do not make it skip when data is missing; after the build it must
  fail loudly if the data is not there.
- The deploy step, the `permissions` block, `concurrency`, and the `env` block of the job.
- Action versions (`actions/checkout@v4` and the others) — a separate decision.
- `package.json` scripts.

## Git workflow

- Branch: `advisor/006-fast-tests-first`
- One commit; plain imperative sentence, e.g.
  `Run the fast tests before the data build in CI`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the fast suite is really data-free

In a checkout with **no** `public/data/` directory (the default for a fresh clone):

**Verify**: `python -m unittest discover -s tests -p "test_[!h]*.py"` → `OK`, and the count of
tests run is greater than 100.
**Verify**: `npm ci && node --test tests-js/*.test.mjs` → `# fail 0`.

If either fails without built data, STOP and report the failing test names.

### Step 2: Reorder the workflow

In `.github/workflows/build.yml`:

1. Move the three steps `Validate JavaScript syntax`, `Install Node dev tools` and
   `Run frontend and Pages Function tests` to directly **after** `Install dependencies` and
   **before** `Build H2H data`. Remove the `if: steps.build.outputs.changed == 'true'` line from
   each of the three (the `build` step has not run yet at that point). Keep the comment on
   `Install Node dev tools`.
2. Directly after them, still before `Build H2H data`, add:

   ```yaml
         - name: Run Python tests that need no built data
           # test_h2h_counts.py reads public/data and runs after the build, with the full suite.
           run: python -m unittest discover -s tests -p "test_[!h]*.py"
   ```

3. Leave `Validate H2H data` (full discovery), `Install the accessibility check browser`,
   `Check accessibility` and `Deploy to Cloudflare Pages` where they are, after the build, with
   their existing `if:` conditions unchanged.

Resulting step order: Checkout, Set up Python, Set up Node.js, Cache pip, Install dependencies,
Validate JavaScript syntax, Install Node dev tools, Run frontend and Pages Function tests, Run
Python tests that need no built data, Build H2H data, Validate H2H data, Install the accessibility
check browser, Check accessibility, Deploy to Cloudflare Pages.

**Verify**: `grep -n "name: " .github/workflows/build.yml` → the order above (plus the workflow's
own `name:` on line 1).
**Verify**: `grep -c "steps.build.outputs.changed == 'true'" .github/workflows/build.yml` → `4`
(data test, browser install, accessibility check, deploy).
**Verify**: the YAML parses (see Commands).

### Step 3: Fix the wrong command in `AGENTS.md`

- Line 227: replace `` (`python -m unittest -v`) `` with
  `` (`python -m unittest discover -s tests -v`, and `node --test tests-js/*.test.mjs` for the
  frontend and Pages Functions) ``. Re-wrap the sentence to about 100 characters per line.
- In the "Testing Strategy" section (about line 191-194), the sentence beginning "The test suite
  runs automatically in the GitHub Actions `Validate H2H data` job" — change it to say that the
  Node tests and the Python tests that need no built data run before the data build on every
  pull request and push, and the full Python suite (including the count checks against built
  data) runs after it. Keep it to two or three sentences.

**Verify**: `grep -n "unittest -v" AGENTS.md` → only line 51 (the comment that warns about the
bare command) and lines containing `discover -s tests -v`.

## Test plan

No new tests. The change is verified by the commands in Steps 1–3 and, after pushing, by the
workflow run itself: the reviewer should confirm on the pull request that the Node and fast
Python steps finish before "Build H2H data" starts.

## Done criteria

- [ ] Step order in `.github/workflows/build.yml` matches Step 2
- [ ] `grep -c "steps.build.outputs.changed == 'true'" .github/workflows/build.yml` prints `4`
- [ ] `python -m unittest discover -s tests -p "test_[!h]*.py"` exits 0 without `public/data/`
- [ ] `grep -n "(\`python -m unittest -v\`)" AGENTS.md` returns no matches
- [ ] `git status --short` shows only `.github/workflows/build.yml`, `AGENTS.md` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any test matched by `test_[!h]*.py` or any Node test needs `public/data/` or `.cache/`
  (Step 1 fails on a fresh clone).
- The workflow has been split into several jobs since this plan was written.
- A step you are asked to move has gained an `if:` condition other than the `changed` check.

## Maintenance notes

- On the daily scheduled run the fast tests now run even when the data build is skipped as
  unchanged. That costs well under a minute and catches a broken `main` a day earlier.
- A new test file that needs built data must be named so the fast pattern skips it (start the
  name with `test_h2h_`) or the fast step will fail on it.
- Not done here, listed in the backlog in `plans/README.md`: lint tooling (ruff, ESLint), pinning
  the remaining actions to commit SHAs, Dependabot, and the other stale lines in `AGENTS.md`
  (the diagram still names `public/app.js`; eight modules are missing from the module map).
