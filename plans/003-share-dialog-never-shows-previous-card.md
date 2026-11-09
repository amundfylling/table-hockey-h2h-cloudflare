# Plan 003: The share dialog never draws the previous matchup's card

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- public/js/share.js tests-js/share.test.mjs`
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

The "share image" dialog opens immediately and then waits up to 3 seconds for rating data before
it collects the data for the card. During that wait the Light/Dark buttons are clickable. A click
starts a render with whatever card data is left over from the last time the dialog was used, and
cancels the pending first render. The result: the user opens the dialog for matchup B, taps
"Dark", and gets matchup A's image, saved under B's file name, ready to share. On the very first
use the same tap shows "Could not make the image". A shared image with the wrong players is a
trust problem for a statistics site.

## Current state

All in `public/js/share.js` (633 lines). Relevant pieces:

- Module-level state:

  ```js
  // public/js/share.js:346
  const session = {
    dialog: null,
    parts: null,
    data: null,
    theme: "light",
    blob: null,
    url: "",
    file: null,
    shareUrl: "",
    token: 0,
    resetTimer: 0,
  };
  ```

- Theme buttons call `generate()` at any time:

  ```js
  // public/js/share.js:433
  themeButtons.forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.theme !== session.theme) {
      session.theme = button.dataset.theme;
      generate();
    }
  }));
  ```

- `generate()` bumps the token and draws `session.data`:

  ```js
  // public/js/share.js:513
  async function generate() {
    const token = ++session.token;
    resetActionLabels();
    setBusy(true);
    setStatus("Making the image…");
    try {
      const blob = await renderCard(session.data, session.theme);
      if (token !== session.token || !session.dialog.open) return;
  ```

- `handleShareImage()` opens the dialog, awaits, then sets `session.data`. The token check after
  the await makes it give up if a theme click bumped the token:

  ```js
  // public/js/share.js:613
  const token = ++session.token;
  resetActionLabels();
  setBusy(true);
  setStatus("Making the image…");

  const [updated] = await Promise.all([
    within(loadUpdatedLabel(), 600, ""),
    within(ensureRatings(), 3000, null),
  ]);
  if (token !== session.token || !session.dialog.open) return;
  try {
    session.data = collectShareData(updated);
  ```

- `onDialogClose()` (line 581) clears `session.url`, `session.blob`, `session.file` but **not**
  `session.data`, so the previous card's data survives until the next open.

- `setBusy(busy)` (line 472) also refreshes each theme button's `aria-pressed` from
  `session.theme`.

Tests: `tests-js/share.test.mjs` stubs `globalThis.document` and `globalThis.window` at the top
and imports pure helpers from `share.js` (`shareScope`, `pickFindings`, `shortNames`). There is
no DOM in the test environment, so the dialog itself is not unit-tested today.

## Commands you will need

| Purpose  | Command                                   | Expected on success |
|----------|-------------------------------------------|---------------------|
| Syntax   | `node --check public/js/share.js`         | exit 0              |
| JS tests | `node --test tests-js/share.test.mjs`     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `public/js/share.js`
- `tests-js/share.test.mjs`

**Out of scope** (do NOT touch, even though they look related):
- `public/js/share-card.js` — draws the card; not part of the bug.
- The dialog's markup, CSS, or the copy/share/download handlers.
- `public/changelog.html` — the maintainer writes changelog entries.

## Git workflow

- Branch: `advisor/003-share-dialog-stale-card`
- One commit; plain imperative sentence, e.g.
  `Stop the share dialog drawing the previous matchup's card`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the theme decision into a pure, exported helper

Add near the other exported helpers in `public/js/share.js`:

```js
// What a tap on a theme button should do. Before the card's data is ready, the tap only
// records the theme; the first render picks it up.
export function themeChange(current, requested, hasData) {
  if (requested === current) return "none";
  return hasData ? "render" : "remember";
}
```

### Step 2: Use it in the theme button handler

Replace the handler shown in "Current state" with:

```js
themeButtons.forEach((button) => button.addEventListener("click", () => {
  const action = themeChange(session.theme, button.dataset.theme, Boolean(session.data));
  if (action === "none") return;
  session.theme = button.dataset.theme;
  if (action === "render") generate();
  else setBusy(true); // Still waiting for the data: only show the new choice as pressed.
}));
```

`setBusy(true)` is safe here: the dialog is already busy in this state, and the call refreshes
`aria-pressed` on the theme buttons. It does not bump `session.token`, so the pending first render
in `handleShareImage` continues and uses the remembered `session.theme`.

### Step 3: Clear the card data when the dialog closes

In `onDialogClose()`, next to `session.blob = null;`, add `session.data = null;`.

Then confirm nothing reads `session.data` after close:
`grep -n "session.data" public/js/share.js`. Expected readers: `fileName()`, `generate()`,
`altText` call sites inside `generate()`, and the assignment in `handleShareImage()`. All run
only while the dialog is open.

**Verify**: `node --check public/js/share.js` → exit 0.

### Step 4: Test the helper

In `tests-js/share.test.mjs`, add `themeChange` to the existing destructured import from
`../public/js/share.js` and add one test:

```js
test("a theme tap before the card data is ready only records the theme", () => {
  assert.equal(themeChange("light", "light", true), "none");
  assert.equal(themeChange("light", "dark", true), "render");
  assert.equal(themeChange("light", "dark", false), "remember");
});
```

**Verify**: `node --test tests-js/share.test.mjs` → all pass, including the new test.

## Test plan

- Unit test from Step 4.
- Manual check for the reviewer (cannot be automated without a browser): build data or use the
  live data, open a matchup, open the share dialog, close it, open another matchup, open the share
  dialog and tap "Dark" within the first second. The preview must show the second matchup.

## Done criteria

- [ ] `node --check public/js/share.js` exits 0
- [ ] `node --test tests-js/share.test.mjs` exits 0 and includes the new test
- [ ] `grep -n "session.data = null" public/js/share.js` returns a match inside `onDialogClose`
- [ ] `git status --short` shows only `public/js/share.js`, `tests-js/share.test.mjs` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The theme handler, `generate()` or `onDialogClose()` no longer match the excerpts above.
- `grep -n "session.data" public/js/share.js` shows a reader that can run while the dialog is
  closed (clearing the data would then break it).
- `share.js` is imported with a `?v=` query string somewhere (check
  `grep -rn "share.js" public/js public/*.html`); if so, report it rather than changing versions.

## Maintenance notes

- If more controls are added to the dialog that trigger `generate()`, they need the same
  "is the data ready" guard.
- `AGENTS.md` asks for a changelog line when a visible fix ships; the maintainer decides whether
  this one is worth a "fixed" entry in `public/changelog.html`.
