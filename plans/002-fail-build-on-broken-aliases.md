# Plan 002: A broken `aliases.json` fails the build instead of silently un-merging players

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- scripts/build_h2h.py public/aliases.json tests/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

`public/aliases.json` is a hand-edited file listing groups of player ids that belong to one
person (235 groups today). The build reads it to merge those players' ratings and leaderboard
rows. Both loaders catch every read and parse error and return an empty list without printing
anything. One stray comma in the file therefore produces a successful build and deploy in which
every alias group is split: ratings are computed per id and the same person appears several times
on the leaderboard. Nothing in the test suites reads the file, so CI does not notice either.
After this plan, a malformed file stops the build with a clear message, and a test validates the
committed file on every pull request.

## Current state

- `scripts/build_h2h.py` — the build script. Two near-identical loaders:

  ```python
  # scripts/build_h2h.py:2028
  def load_alias_groups(path: Path = PUBLIC_DIR / "aliases.json") -> list:
      """Id groups from aliases.json that belong to one person."""
      try:
          groups = json.loads(path.read_text(encoding="utf-8")).get("groups", [])
      except (OSError, ValueError, AttributeError):
          return []
      return [group["ids"] for group in groups if isinstance(group, dict) and group.get("ids")]
  ```

  ```python
  # scripts/build_h2h.py:2120
  def load_alias_group_records(path: Path = PUBLIC_DIR / "aliases.json") -> list:
      """The groups in aliases.json with their names ({"name", "ids"})."""
      try:
          groups = json.loads(path.read_text(encoding="utf-8")).get("groups", [])
      except (OSError, ValueError, AttributeError):
          return []
      return [group for group in groups if isinstance(group, dict) and group.get("ids")]
  ```

  Callers: `load_alias_groups()` at about line 2827 (passed to the ratings computation) and
  `load_alias_group_records()` at about line 2851 (passed to the leaderboard build). Find them
  with `grep -n "load_alias_group" scripts/build_h2h.py`.

- `public/aliases.json` — shape is `{"groups": [{"name": "Bogdan Bilovusyak", "ids": [1079, 771]}, …]}`.
  At the planned commit it has 235 groups, every id is a positive integer, every group has at
  least two ids, and no id appears in two groups.

- Tests: Python `unittest` files in `tests/`, imported as `from scripts import build_h2h`.
  Exemplar for a small, data-free test file: `tests/test_records.py` (imports, one `TestCase`
  class, method names that read as sentences such as
  `test_h2h_streak_skips_the_pair_already_shown_as_a_perfect_record`).

- Conventions (from `AGENTS.md`): PEP 8, sorted imports, lines wrapped at about 100 characters.

## Commands you will need

| Purpose        | Command                                               | Expected on success |
|----------------|-------------------------------------------------------|---------------------|
| Install        | `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt` | exit 0 |
| New test only  | `python -m unittest discover -s tests -p "test_aliases.py" -v` | all pass   |
| Data-free tests| `python -m unittest discover -s tests -p "test_[!h]*.py"` | OK              |
| Compile        | `python -m py_compile scripts/build_h2h.py`           | exit 0              |

`tests/test_h2h_counts.py` needs a full data build (`public/data/`), which downloads about 1.5
million rows. Do not run the build for this plan; the `test_[!h]*.py` pattern skips that file.

## Scope

**In scope** (the only files you should modify):
- `scripts/build_h2h.py` (only the two loader functions and, if needed, their two call sites)
- `tests/test_aliases.py` (create)

**Out of scope** (do NOT touch, even though they look related):
- `public/aliases.json` — do not edit the data. If validation finds a problem in it, STOP.
- `public/js/players.js` and other frontend code that also reads `aliases.json`.
- `scripts/ratings.py` and the leaderboard code that consume the groups.

## Git workflow

- Branch: `advisor/002-aliases-fail-loudly`
- One commit; plain imperative sentence, e.g.
  `Fail the build when aliases.json is malformed`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add one strict reader

In `scripts/build_h2h.py`, directly above `load_alias_groups`, add a function
`read_alias_group_records(path: Path) -> list` that:

1. Returns `[]` only when the file does not exist (`FileNotFoundError`). This keeps unit tests and
   local runs that point at a temp directory working.
2. Otherwise parses the JSON and raises `ValueError` with a message naming the file and the
   problem when any of these holds:
   - the file is not valid JSON (re-raise `json.JSONDecodeError` as `ValueError` with the path in
     the message, using `raise ValueError(...) from err`);
   - the top level is not an object or `groups` is not a list;
   - a group is not an object, or its `ids` is not a list of at least two values;
   - an id is not a positive `int` (reject `bool`, which is an `int` subclass in Python);
   - an id appears in more than one group, or twice in one group.
3. Returns the list of group dicts unchanged when valid.

### Step 2: Make both loaders use it

Replace the bodies of the two existing functions so they keep their names, signatures and return
shapes but no longer swallow errors:

```python
def load_alias_groups(path: Path = PUBLIC_DIR / "aliases.json") -> list:
    """Id groups from aliases.json that belong to one person."""
    return [group["ids"] for group in read_alias_group_records(path)]


def load_alias_group_records(path: Path = PUBLIC_DIR / "aliases.json") -> list:
    """The groups in aliases.json with their names ({"name", "ids"})."""
    return read_alias_group_records(path)
```

**Verify**: `python -m py_compile scripts/build_h2h.py` → exit 0.
**Verify**: `python -c "from scripts import build_h2h as b; print(len(b.load_alias_groups()))"` →
prints `235` (or the current group count if the file has grown; it must not be `0`).

### Step 3: Add `tests/test_aliases.py`

Cases (write temp files with `tempfile.TemporaryDirectory`):

1. `test_the_committed_aliases_file_is_valid` — `build_h2h.load_alias_groups()` on the real file
   returns a non-empty list.
2. `test_a_missing_file_means_no_aliases` — a path that does not exist returns `[]`.
3. `test_invalid_json_stops_the_build` — file content `{"groups": [` raises `ValueError`.
4. `test_groups_must_be_a_list` — `{"groups": {}}` raises `ValueError`.
5. `test_an_id_in_two_groups_is_rejected` — two groups sharing an id raise `ValueError`.
6. `test_ids_must_be_positive_integers` — ids `["12", 3]`, `[0, 3]` and `[True, 3]` each raise
   `ValueError`.
7. `test_a_group_needs_two_ids` — `{"groups": [{"name": "A", "ids": [5]}]}` raises `ValueError`.
8. `test_records_keep_their_names` — a valid two-group file returned by
   `load_alias_group_records` equals the input groups.

**Verify**: `python -m unittest discover -s tests -p "test_aliases.py" -v` → 8 tests, OK.

### Step 4: Run the data-free suite

**Verify**: `python -m unittest discover -s tests -p "test_[!h]*.py"` → `OK` (no failures, no
errors).

## Test plan

Covered by Step 3. Model the file layout on `tests/test_records.py`.

## Done criteria

- [ ] `grep -n "except (OSError, ValueError, AttributeError)" scripts/build_h2h.py` returns no
      matches
- [ ] `python -m unittest discover -s tests -p "test_aliases.py"` exits 0 with 8 tests
- [ ] `python -m unittest discover -s tests -p "test_[!h]*.py"` exits 0
- [ ] `git status --short` shows only `scripts/build_h2h.py`, `tests/test_aliases.py` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The committed `public/aliases.json` fails the new validation (case 1 fails). Report exactly
  which rule and which ids; a human must decide how to fix the data.
- An existing test relies on the old behavior of returning `[]` for a malformed file.
- `grep -n "load_alias_group" scripts/ tests/ -r` shows callers other than the two named above.

## Maintenance notes

- The frontend also fetches `aliases.json` at runtime (`public/js/`); it has its own tolerance for
  a bad file. This plan only hardens the build.
- If a future alias format adds fields to a group, the reader accepts them as long as `ids` stays
  valid.
- Reviewer: check that a missing file still returns `[]` (several unit tests build in temp
  directories without an aliases file).
