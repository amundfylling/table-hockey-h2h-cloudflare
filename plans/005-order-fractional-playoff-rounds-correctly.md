# Plan 005: Records and game lists order fractional playoff rounds the way they were played

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- scripts/build_h2h.py scripts/ratings.py scripts/tournaments.py tests/test_records.py`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (changes the order of same-day playoff games in generated data)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

Some result sources number playoff rounds as fractions: `0.125` is the 1/8 final, `0.25` the
quarter-final, `0.5` the semi-final and `1` the final. The build keeps that in a float column
`round_value`, and separately converts `round_number` to integers, which turns every fractional
value into "missing". The ratings and the tournament brackets sort by `round_value` and get the
right order. But two other sorts still use `round_number` with missing values last: the one that
feeds the home page records (winning streaks, unbeaten runs, head-to-head streaks) and the main
sort that sets the order of games in every player file. For a tournament day with fractional
rounds, the final (the only integer, `1`) is placed **before** the quarter- and semi-finals. A
player who wins three knockout games and loses the final is recorded as "lost, then won three",
which shows up as a live three-game winning streak that never existed, and "last games" lists are
in the wrong order. Four copies of this sort key exist and two have drifted; this plan makes all
of them use one helper.

## Current state

- `scripts/build_h2h.py` — where the fractional rounds are lost and kept:

  ```python
  # scripts/build_h2h.py:631
  ensure_int_column(matches, "stage_id")
  ensure_int_column(matches, "stage_sequence")
  # Some sources number playoff rounds as fractions (0.125 = 1/8 final, 1 = final); the
  # integer column drops those, so tournament brackets read the round order from here.
  matches["round_value"] = pd.to_numeric(
      matches.get("round_number", pd.Series(pd.NA, index=matches.index)), errors="coerce"
  )
  ensure_int_column(matches, "round_number")
  ```

  `ensure_int_column` uses `to_int` (line 61), which sets non-whole floats to NA.

- Drifted sort 1, in `build_records`:

  ```python
  # scripts/build_h2h.py:2335
  games = games.sort_values(
      ["date_dt", "tournament_id", "stage_sequence", "round_number", "playoff_game_number"],
      kind="mergesort",
      na_position="last",
  ).reset_index(drop=True)
  ```

- Drifted sort 2, the main sort in `main()`:

  ```python
  # scripts/build_h2h.py:2770
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
  ```

- The correct version, in `scripts/ratings.py`:

  ```python
  # scripts/ratings.py:83
  def _playing_order(matches: pd.DataFrame) -> pd.Index:
      round_column = "round_value" if "round_value" in matches else "round_number"
      return matches.sort_values(
          ["date_dt", "tournament_id", "stage_sequence", "stage_id", round_column,
           "playoff_game_number"],
          kind="mergesort",
          na_position="last",
      ).index
  ```

  `scripts/tournaments.py:86-94` (`compute_pre_game_ratings`) has a copy of the same key.

- Import direction: `scripts/build_h2h.py` imports `ratings` and `tournaments`
  (confirm with `grep -n "^import\|^from" scripts/build_h2h.py`). `scripts/ratings.py` and
  `scripts/tournaments.py` do not import `build_h2h`. Keep it that way (no import cycles).

- Tests: `tests/test_records.py` builds small frames with a helper `_games(rows)` that sets
  `round_number = range(len(frame))` and has **no** `round_value` or `stage_id` column, so the
  helper must tolerate both being absent. `tests/test_ratings.py` builds frames with
  `stage_id` and `round_number` but no `round_value`.

- A records test looks like this (the record names "whoever holds the streak now"):

  ```python
  # tests/test_records.py:59
  def test_unbeaten_run_is_left_out_when_no_longer_than_the_winning_streak(self):
      rows = [(1, 2, 3, 1, _day(i)) for i in range(4)]
      records = build_records(_games(rows), NAMES)
      self.assertEqual(records["win_streak"]["games"], 4)
      self.assertNotIn("unbeaten_streak", records)
  ```

  The test class's `setUp` lowers `build_h2h.MIN_WIN_STREAK` to 3.

- Conventions (from `AGENTS.md`): PEP 8, sorted imports, about 100-character lines, vectorized
  pandas rather than row loops.

## Commands you will need

| Purpose         | Command                                                        | Expected on success |
|-----------------|----------------------------------------------------------------|---------------------|
| Install         | `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt` | exit 0 |
| Focused tests   | `python -m unittest discover -s tests -p "test_records.py" -v` | all pass            |
| Focused tests   | `python -m unittest discover -s tests -p "test_ratings.py" -v` | all pass            |
| Data-free suite | `python -m unittest discover -s tests -p "test_[!h]*.py"`      | OK                  |
| Compile         | `python -m py_compile scripts/build_h2h.py scripts/ratings.py scripts/tournaments.py` | exit 0 |

Do not run `python scripts/build_h2h.py` unless told to; it downloads about 1.5 million rows.

## Scope

**In scope** (the only files you should modify):
- `scripts/ratings.py` (add the shared helper, use it in `_playing_order`)
- `scripts/tournaments.py` (use the helper in `compute_pre_game_ratings`)
- `scripts/build_h2h.py` (use the helper in `build_records` and in the main sort)
- `tests/test_records.py` (add tests)

**Out of scope** (do NOT touch, even though they look related):
- The `round_number` field written into player JSON files (`build_h2h.py` about lines 1813 and
  1937). The frontend reads it; leave its values alone.
- `scripts/tournaments.py:393-425` (bracket ordering with `rank_`) — already correct.
- `public/js/**` — the frontend's own sorting is not part of this plan.
- The separate Elo rating used for tournament upsets (`compute_pre_game_ratings`' math).

## Git workflow

- Branch: `advisor/005-playing-order`
- Commit per step is fine; plain imperative sentences, e.g.
  `Order fractional playoff rounds correctly in records and game lists`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add one shared helper in `scripts/ratings.py`

Above `_playing_order`, add a public function:

```python
def playing_order_columns(matches: pd.DataFrame) -> list:
    """Sort columns that put games in the order they were played.

    Some sources number playoff rounds as fractions (0.125 = 1/8 final, 1 = final), which only
    round_value keeps; frames built in tests may have neither round_value nor stage_id.
    """
    round_column = "round_value" if "round_value" in matches else "round_number"
    columns = ["date_dt", "tournament_id", "stage_sequence", "stage_id", round_column,
               "playoff_game_number"]
    return [column for column in columns if column in matches]
```

Change `_playing_order` to
`return matches.sort_values(playing_order_columns(matches), kind="mergesort", na_position="last").index`.

**Verify**: `python -m unittest discover -s tests -p "test_ratings.py"` → OK.

### Step 2: Use it in `scripts/tournaments.py`

In `compute_pre_game_ratings`, replace the local `round_column` line and the hard-coded column
list with `ratings.playing_order_columns(matches)`. Check how `tournaments.py` can import it:
run `grep -n "^import\|^from" scripts/tournaments.py scripts/stage_fixes.py`. Recent history
(commit `5b27bb8`, "Let stage_fixes import tournaments when loaded as a package module") shows
these scripts are loaded both as top-level modules (`python scripts/build_h2h.py`) and as
`scripts.<name>` (in tests). Copy the exact import pattern that `scripts/stage_fixes.py` uses to
import `tournaments`, applied to `ratings`. If `ratings.py` imports `tournaments` (cycle), STOP.

**Verify**: `python -m py_compile scripts/tournaments.py` → exit 0.
**Verify**: `python -m unittest discover -s tests -p "test_tournament_pages.py"` → OK.

### Step 3: Write the failing records test first

In `tests/test_records.py`, add:

```python
def test_a_lost_final_ends_a_streak_when_rounds_are_fractions(self):
    # Quarter-final, semi-final and final on one day, numbered 0.25, 0.5 and 1 as some
    # sources do. The integer round_number keeps only the final's 1.
    day = _day(0)
    rows = [(1, 2, 3, 1, day), (1, 3, 3, 1, day), (1, 4, 3, 1, day), (2, 1, 3, 1, day)]
    frame = _games(rows)
    frame["round_value"] = [0.125, 0.25, 0.5, 1.0]
    frame["round_number"] = pd.array([pd.NA, pd.NA, pd.NA, 1], dtype="Int64")
    # Hand the rows over out of order, as the source files do.
    records = build_records(frame.iloc[::-1].reset_index(drop=True), NAMES)
    self.assertNotIn("win_streak", records)
```

Player 1 wins three knockout games, then loses the final to player 2. Nobody holds a current
streak of 3, so there must be no `win_streak` record.

**Verify (expected to FAIL before the fix)**:
`python -m unittest discover -s tests -p "test_records.py" -k fractions` → fails with
`win_streak` unexpectedly present (player 1, 3 games). If it passes before the fix, STOP.

### Step 4: Fix `build_records`

Replace the hard-coded column list at `scripts/build_h2h.py:2335` with
`ratings.playing_order_columns(games)` (use whatever name `build_h2h.py` already imports the
ratings module under; check with `grep -n "ratings" scripts/build_h2h.py | head`). Keep
`kind="mergesort"`, `na_position="last"` and `.reset_index(drop=True)`.

**Verify**: `python -m unittest discover -s tests -p "test_records.py" -v` → all pass, including
the new test.

### Step 5: Fix the main sort

At `scripts/build_h2h.py:2770`, replace the list with:

```python
sort_cols = ["id1", "id2", *ratings.playing_order_columns(matches)]
```

This adds `stage_id` between `stage_sequence` and the round, and swaps `round_number` for
`round_value`. Both changes match what ratings and brackets already do.

**Verify**: `python -m py_compile scripts/build_h2h.py` → exit 0.
**Verify**: `grep -n '"round_number",' scripts/build_h2h.py` → no match inside a `sort_values`
column list (matches in column-rename maps and output dicts are expected and fine).

### Step 6: Run the data-free suite

**Verify**: `python -m unittest discover -s tests -p "test_[!h]*.py"` → OK.

## Test plan

- New: `test_a_lost_final_ends_a_streak_when_rounds_are_fractions` in `tests/test_records.py`
  (Step 3).
- Also add `test_playing_order_columns_skip_what_a_frame_lacks` in the same file or in
  `tests/test_ratings.py`: a frame with only `date_dt`, `tournament_id`, `stage_sequence`,
  `round_number`, `playoff_game_number` returns exactly those five names in that order; adding a
  `round_value` column swaps it in for `round_number`.
- Existing suites `test_records.py`, `test_ratings.py`, `test_tournament_pages.py`,
  `test_rivalries.py` must stay green unchanged.

## Done criteria

- [ ] `python -m unittest discover -s tests -p "test_[!h]*.py"` exits 0
- [ ] The two new tests exist and pass
- [ ] `grep -c "playing_order_columns" scripts/build_h2h.py` prints `2`
- [ ] `grep -n "round_column" scripts/tournaments.py` returns no match inside
      `compute_pre_game_ratings`
- [ ] `git status --short` shows only the four in-scope files and `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The new test in Step 3 passes before the fix (the bug is not where this plan says it is).
- Any existing test fails after Step 5 and the failure is about game order inside player files
  (for example a `last_10` or streak expectation). Report the test and the before/after order; a
  human must decide whether the old expectation encoded the bug.
- Importing `ratings` from `tournaments.py` creates an import cycle.
- `round_value` is missing from the frame at the main sort for some source (a `KeyError` or the
  helper silently falling back to `round_number` in a full build). The helper's fallback exists
  for tests only.

## Maintenance notes

- After this lands, the next full data build changes the order of same-day playoff games in
  `data/h2h/*.json` and may change entries in `data/records.json`. That is the intended effect.
  The reviewer should run a full build (`SKIP_DOWNLOADS=1 python3 scripts/build_h2h.py` with a
  warm `.cache/`) and diff `public/data/records.json` against the live
  `https://h2h.puck.no/data/records.json` to see which records move.
- Any new code that needs games "in playing order" should call `playing_order_columns` rather
  than listing columns again.
- Deferred: the tournament-upset Elo (`compute_pre_game_ratings`) is a second rating system next
  to Glicko-2; unifying them is a separate decision (see the backlog in `plans/README.md`).
