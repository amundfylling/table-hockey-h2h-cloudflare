# Plan 004: Typing in the opponent box no longer writes an unchosen opponent into the URL

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- public/js/url-state.js public/js/main.js public/js/players.js tests-js/frontend-logic.test.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

On a player page, when the user types in the second ("opponent") search box, each keystroke resets
the current results and rewrites the URL to "player A only". But the URL writer treats a `null`
opponent as "work it out from the input box", and the resolver accepts any text that exactly
equals one player's name or ends in digits. So typing a full name (without picking a suggestion)
adds `?p2=<id>` to the address bar and pushes a browser history entry, although no matchup was
chosen or loaded. Reload, Back, or "copy link" then lead to a matchup the user never asked for,
and one typing session can push several history entries.

## Current state

- `public/js/url-state.js` — URL writer.

  ```js
  // public/js/url-state.js:54
  export function updateUrl(p1, p2 = null, p1Ids = [], p2Ids = []) {
    const idA = p1 || resolvePlayerId(elements.playerA);
    const idB = p2 || (p1 === null ? null : resolvePlayerId(elements.playerB));
    const idsA = (p1Ids && p1Ids.length > 0) ? p1Ids : getSelectionIds(elements.playerA);
    const idsB = (p2Ids && p2Ids.length > 0) ? p2Ids : (p1 === null ? [] : getSelectionIds(elements.playerB));
  ```

  `writeUrl(url)` (line 23) calls `history.pushState` when any of `p1`, `p1g`, `p2`, `p2g`
  changed and pushing is enabled, otherwise `replaceState`.

- Callers of `updateUrl` (`grep -n "updateUrl(" public/js/*.js`):
  - `public/js/main.js:273` and `:291` — `updateUrl()` with **no arguments** (after filters or
    view updates). These rely on the fallback to the input boxes and must keep working.
  - `public/js/main.js:438`, `:976`, `:1000` — `updateUrl(idA, null, idsA, [])`. All three mean
    "player A only, no opponent".
  - `public/js/main.js:447` — `updateUrl(idA, isSingle ? null : idB, idsA, isSingle ? [] : idsB)`.
  - `public/js/main.js:628` — `updateUrl(idA, idB || null, idsA, idsB)`.

- The typing path: `public/js/typeahead.js:344` clears `dataset.playerId` on every `input` event
  and calls `options.onReset()`; for the opponent box that is:

  ```js
  // public/js/main.js:971
  onReset: () => {
    const idA = resolvePlayerId(elements.playerA);
    const idsA = getSelectionIds(elements.playerA);
    resetCurrentResults({ keepPlayerA: Boolean(idA), message: "" });
    if (idA) {
      updateUrl(idA, null, idsA, []);
      safeStorageSet(STORAGE_KEYS.last, { p1: idA, p2: null, p1Ids: idsA, p2Ids: [] });
    }
  },
  ```

- `public/js/players.js:127` — `resolvePlayerId(inputEl)` returns the stored `dataset.playerId`,
  else an id parsed from trailing digits, else the id of the single player whose normalized name
  equals the text (and writes that id back into `dataset.playerId`).

- Tests: `tests-js/frontend-logic.test.mjs` stubs `globalThis.document`/`globalThis.window` at the
  top, imports `state` from `../public/js/state.js`, and already imports
  `../public/js/url-state.js` inside one test (`"a URL gives a complete view, so Back and Forward
  reset what it leaves out"`, about line 196). `elements` in `public/js/state.js` is a plain
  exported object whose fields are `null` under the stub, so a test can assign fake inputs to
  `elements.playerA` / `elements.playerB`.

## Commands you will need

| Purpose  | Command                                        | Expected on success |
|----------|------------------------------------------------|---------------------|
| Syntax   | `node --check public/js/url-state.js`          | exit 0              |
| JS tests | `node --test tests-js/frontend-logic.test.mjs` | all pass            |
| JS tests | `node --test tests-js/data-cache.test.mjs tests-js/story.test.mjs tests-js/share.test.mjs` | all pass |

## Scope

**In scope** (the only files you should modify):
- `public/js/url-state.js` (only `updateUrl`)
- `tests-js/frontend-logic.test.mjs`

**Out of scope** (do NOT touch, even though they look related):
- `public/js/players.js` — `resolvePlayerId` writing `dataset.playerId` is a side effect other
  code depends on (the Compare button accepts a typed exact name). Leave it.
- `public/js/typeahead.js` and the `onReset` handlers in `public/js/main.js` — the callers already
  pass the right arguments; only the callee misreads them.

## Git workflow

- Branch: `advisor/004-opponent-typing-url`
- One commit; plain imperative sentence, e.g.
  `Keep an unchosen opponent out of the URL while typing`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Distinguish "no opponent" from "not specified" in `updateUrl`

Change the signature and the two opponent lines so that an explicit `null` for `p2` means "no
opponent" and only an omitted argument (`undefined`) falls back to the input box:

```js
// p2 === null means "no opponent"; leave p2 out to read it from the opponent box.
export function updateUrl(p1, p2, p1Ids = [], p2Ids = []) {
  const idA = p1 || resolvePlayerId(elements.playerA);
  const fromInputs = p2 === undefined && p1 !== null;
  const idB = p2 || (fromInputs ? resolvePlayerId(elements.playerB) : null);
  const idsA = (p1Ids && p1Ids.length > 0) ? p1Ids : getSelectionIds(elements.playerA);
  const idsB = (p2Ids && p2Ids.length > 0)
    ? p2Ids
    : (fromInputs ? getSelectionIds(elements.playerB) : []);
```

Leave the rest of the function unchanged.

Check each caller against the new meaning:
- `updateUrl()` (main.js:273, 291): `p2` is `undefined`, `p1` is `undefined` → falls back to the
  inputs, as before.
- `updateUrl(idA, null, idsA, [])` (main.js:438, 976, 1000): now writes no `p2`. This is the fix.
- main.js:447 and :628 pass a real id or `null` for single-player mode → unchanged in practice.

**Verify**: `node --check public/js/url-state.js` → exit 0.
**Verify**: `grep -n "updateUrl(" public/js/*.js` → the same seven call sites listed above; if
there are others, check each the same way.

### Step 2: Add a regression test

In `tests-js/frontend-logic.test.mjs`, add a test named
`"typing an exact name in the opponent box does not put that player in the URL"`. Outline:

1. `const { elements } = await import("../public/js/state.js");` and
   `const { updateUrl } = await import("../public/js/url-state.js");`
2. Save and replace `state.players` with two players, e.g. `{ id: 1, name: "Anna" }` and
   `{ id: 2, name: "Bo" }`. If `getPlayerById` needs an index (check `public/js/players.js` for
   how `getPlayerById` looks players up, e.g. a `state.playerById` map), populate that too.
3. Assign fake inputs: `elements.playerA = { dataset: { playerId: "1" }, value: "Anna" };`
   `elements.playerB = { dataset: {}, value: "Bo" };`
4. Stub history: `const written = []; window.history = { replaceState: (s, t, url) => written.push(String(url)), pushState: (s, t, url) => written.push(String(url)) };`
   and set `window.location.href = "https://example.test/?p1=1"`, `window.location.search = "?p1=1"`,
   `window.location.hash = ""`. `document.title` assignment must not throw on the stub (it is a
   plain object, so it will not).
5. Call `updateUrl(1, null, [1], [])`. Assert the last written URL has `p1=1` and
   `new URL(written.at(-1)).searchParams.has("p2") === false`.
6. Call `updateUrl()` with no arguments. Assert the last written URL has `p2=2` (the fallback
   still works).
7. In a `finally`, restore `state.players`, `elements.playerA`, `elements.playerB`,
   `window.history` and `window.location.search`/`href` to their previous values so later tests in
   the file are unaffected.

**Verify**: `node --test tests-js/frontend-logic.test.mjs` → all pass, including the new test.
To prove the test catches the bug, temporarily restore the old `updateUrl` lines, confirm the new
test fails at step 5, then re-apply the fix.

### Step 3: Run the neighbouring suites

**Verify**: `node --test tests-js/data-cache.test.mjs tests-js/story.test.mjs tests-js/share.test.mjs tests-js/browse-pages.test.mjs` → all pass.

## Test plan

Covered by Step 2. Pattern: the existing url-state test in the same file.

## Done criteria

- [ ] `node --check public/js/url-state.js` exits 0
- [ ] `node --test tests-js/frontend-logic.test.mjs` exits 0 with the new test present
- [ ] `grep -n "p2 = null" public/js/url-state.js` returns no matches
- [ ] `git status --short` shows only `public/js/url-state.js`,
      `tests-js/frontend-logic.test.mjs` and `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `updateUrl` no longer matches the excerpt, or has callers beyond the seven listed whose intent
  for a `null` second argument is unclear.
- The regression test cannot drive `updateUrl` under the existing stubs without changing
  production code beyond Step 1 (for example, `writeUrl` needs a real `URL`/`history` feature the
  stub cannot provide). Report what is missing.

## Maintenance notes

- New callers: pass `null` for "no opponent", omit the argument to read the opponent box.
- Related, deliberately not fixed here: `resolvePlayerId` mutates `dataset.playerId` as a side
  effect and scans all players on each call; see the backlog in `plans/README.md`.
