# Prompt: Auto-Display on Player Selection

> **Goal:** Remove the Compare/Display button and instead automatically trigger
> `handleCompare()` the moment a player is selected. When only Player 1 is
> selected, show that player's all-opponents stats immediately. When Player 2
> is then selected, show the head-to-head matchup immediately.
>
> **Rules:**
> - Do NOT change any data fetching, rendering, filtering, or chart logic.
> - The UI must remain visually identical except the Compare/Display button is gone.
> - Keep the Copy Link button and status text in `.selection-actions`.
> - All existing features must keep working: swap, copy link, recent matchups,
>   URL restore, filters, pagination, theme toggle.
> - Follow existing code style: ES6 modules, ~100 char lines.

## Architecture Context

This is a vanilla JS static site using native ES modules under `public/js/`.
The entry point is `public/js/main.js` loaded via
`<script type="module" src="js/main.js">` in `public/index.html`.

### Key files you will modify:

| File | What to change |
|---|---|
| `public/index.html` | Remove the `#compare-btn` button element |
| `public/js/main.js` | Remove compare button event listener, add auto-compare on selection |
| `public/js/typeahead.js` | Trigger compare after Player B selection |
| `public/js/players.js` | Remove `updatePrimaryActionLabel` references to compareBtn |

## Detailed Changes

### 1. `public/index.html` (line 98)

Remove this line:
```html
<button id="compare-btn" class="primary" type="button">Display</button>
```

Keep the surrounding `<div class="selection-actions">` with the Copy Link button
and status paragraph intact.

### 2. `public/js/players.js`

**`updatePrimaryActionLabel()` (line 155-162):**
This function currently sets `elements.compareBtn.textContent` and disables the
swap button. Since the compare button no longer exists:
- Remove the `elements.compareBtn.textContent` line.
- Keep the swap button disable logic (`elements.swapBtn.disabled = ...`).
- Keep the `updateSelectionControls()` call.
- Guard against `elements.compareBtn` being null (it will be since the DOM
  element is removed). Simply check `if (elements.compareBtn)` before touching it.

### 3. `public/js/typeahead.js`

**Player B click/Enter selection (lines 280-312):**
Currently, when a Player B suggestion is clicked or selected via Enter, the code
calls `setInputPlayer(inputEl, player)` and `closeList()` but does NOT call any
`onCompare` callback — it only calls `onPlayerSelect` for Player A.

Add: after `setInputPlayer` + `closeList` for Player B selections, call
`options.onCompare()` if it exists. This triggers the matchup load immediately.

Specifically, in the `listEl.addEventListener("click", ...)` handler (line 301-312):
```javascript
listEl.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const player = currentItems[Number(button.dataset.index)]
    || getPlayerById(Number(button.dataset.id));
  if (player) {
    setInputPlayer(inputEl, player);
    closeList();
    if (!isPlayerB && options.onPlayerSelect) {
      options.onPlayerSelect(player);
    }
    // NEW: auto-compare when Player B is selected
    if (isPlayerB && options.onCompare) {
      options.onCompare();
    }
  }
});
```

And in the Enter key handler (line 280-289), add the same pattern:
```javascript
} else if (event.key === "Enter") {
  event.preventDefault();
  const selected = items[activeIndex] || items[0];
  if (selected) {
    setInputPlayer(inputEl, selected);
    closeList();
    if (!isPlayerB && options.onPlayerSelect) {
      options.onPlayerSelect(selected);
    }
    // NEW: auto-compare when Player B is selected via Enter
    if (isPlayerB && options.onCompare) {
      options.onCompare();
    }
  }
}
```

Also: the second `keydown` listener (line 295-299) fires `onCompare` when Enter
is pressed with the list closed. Keep this behavior — it allows re-triggering
a compare via Enter on Player A when no dropdown is open. But also consider
whether Player A's `onPlayerSelect` callback already triggers display for the
single-player view (see next section).

### 4. `public/js/main.js`

**`onPlayerASelected()` (line 806-811):**
Currently this function only loads opponents for the new Player A and resets
the view. It does NOT auto-display the single-player stats. Change it to also
call `handleCompare()` after loading opponents:

```javascript
async function onPlayerASelected(player) {
  if (!player || !player.id) return;
  clearInputPlayer(elements.playerB, elements.listB);
  resetCurrentResults({ keepPlayerA: true, message: "" });
  await loadOpponentsForPlayer(player.id, player.ids || [player.id]);
  // NEW: auto-display single-player stats
  await handleCompare();
}
```

**`init()` function (line 866):**
Remove the compare button event listener:
```javascript
// DELETE this line:
if (elements.compareBtn) elements.compareBtn.addEventListener("click", handleCompare);
```

**`setLoading()` (line 56-60):**
Guard the compareBtn reference since the element no longer exists:
```javascript
export function setLoading(isLoading) {
  state.loading = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
  if (elements.compareBtn) elements.compareBtn.disabled = isLoading;
}
```
This already has an `if` guard, so it should be fine. But double-check.

**`renderIdleState()` (line 165-232):**
Update the placeholder messages that say "Display this player" — since there's
no Display button anymore, change them to something like "Select an opponent
to compare" or "Loading...". Specifically update these strings:
- Line 176: `"Choose an opponent, or display all games for this player."`
  → `"Choose an opponent to compare, or view all games below."`
- Line 208: `"Display this player to build the record."`
  → `"Select a player to build the record."`
- Line 213: `"Display this player to see yearly scoring."`
  → `"Select a player to see yearly scoring."`
- Line 228: `"Display this player or choose an opponent."`
  → `"Select a player to show matches."`

BUT WAIT: since `onPlayerASelected` now auto-displays, `renderIdleState()`
will only be seen very briefly (before `handleCompare` resolves). These messages
matter mostly for the initial page load with no selection. So keep them
reasonable but don't overthink them.

### 5. Edge cases to handle

1. **Debounce / race conditions:** When the user quickly selects Player A then
   Player B, `onPlayerASelected` calls `handleCompare()` for single-player mode.
   Then Player B selection also calls `handleCompare()`. The second call should
   naturally supersede the first since `handleCompare` sets loading state and
   replaces all results. Make sure `handleCompare` doesn't error if called
   while already loading — check that `setLoading(true)` early in
   `handleCompare` prevents double-triggers. Currently `handleCompare` does
   NOT check `state.loading` before proceeding, so two concurrent calls could
   race. Consider adding a guard at the top of `handleCompare`:
   ```javascript
   if (state.loading) return;
   ```
   This is a simple approach. A more robust approach would be to use an
   AbortController or a request generation counter, but the simple guard
   should work for typical user interaction speeds.

2. **Recent matchups:** `handleRecentClick` already calls `handleCompare()`
   directly after setting both players. No changes needed.

3. **Swap button:** `handleSwap` already calls `handleCompare()` at the end
   when both values exist. No changes needed.

4. **URL restore on page load:** The `init()` function already calls
   `handleCompare()` after restoring URL state. No changes needed.

5. **Clear button (X):** When Player B is cleared, `resetCurrentResults` is
   called with `keepPlayerA: true`. After this reset, the user now has only
   Player A selected. Should we auto-display single-player stats? Currently
   the clear handler in `init()` does NOT call `handleCompare`. Consider
   adding it for consistency:
   ```javascript
   // In the data-clear "b" handler (around line 851-862):
   resetCurrentResults({
     keepPlayerA: Boolean(idA),
     message: idA ? "" : "",
   });
   if (idA) await handleCompare(); // auto-show single player
   ```
   Make the click handler `async` to support this.

## Verification

1. Run `python -m http.server --directory public 8000`
2. Open http://localhost:8000/ in a browser
3. Verify:
   - Selecting Player 1 immediately shows single-player stats
   - Selecting Player 2 immediately shows H2H comparison
   - Swap still works and re-loads the comparison
   - Copy Link still works
   - Recent matchups still load correctly
   - URL parameters restore correctly on page load
   - Clear (X) on Player 2 reverts to single-player view
   - Clear (X) on Player 1 fully resets
   - No console errors or warnings
   - The Compare/Display button is completely gone from the DOM
   - Theme toggle, filters, pagination all still work
