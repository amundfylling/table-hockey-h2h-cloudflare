# Compact Recent Matchups on Mobile

> **Goal:** Reduce the vertical space the "Recent matchups" section consumes on
> mobile viewports (≤ 600 px). Currently each matchup button is full-width and
> stacks vertically, taking up roughly 250–300 px of scroll depth with 5 entries.
> Make the section horizontally scrollable on mobile so it occupies a single row
> of compact pill-shaped buttons.

## Rules

- Do NOT change any data fetching, rendering, filtering, or chart logic.
- Do NOT change how `renderRecent()` or `addRecent()` work in
  `public/js/main.js`. The DOM structure it produces (a `<button>` per entry
  inside `#recent-list`) must remain unchanged.
- Only modify `public/styles.css`. No HTML or JS changes are required.
- Follow existing code style: vanilla CSS, ~100 char lines.
- Follow the design tokens in `DESIGN.md` (Manrope font, HSL colors,
  border-radius, etc.).

## Architecture Context

This is a vanilla JS static site using native ES modules under `public/js/`.
The recent matchups section lives inside the selection card in
`public/index.html`:

```html
<!-- public/index.html lines 101-104 -->
<div class="recent">
  <div class="recent-title">Recent matchups</div>
  <div id="recent-list" class="recent-list"></div>
</div>
```

`renderRecent()` in `public/js/main.js` (line 508) dynamically creates up to 5
`<button>` elements inside `#recent-list`, each containing text like
`"Player A vs Player B"`. The list is stored in `localStorage` and capped at 5
entries via `addRecent()` (line 530).

### Key files you will modify

| File | What to change |
|---|---|
| `public/styles.css` | Add mobile-only horizontal scroll layout for `.recent-list` |

### Files you should NOT modify

| File | Why |
|---|---|
| `public/index.html` | No structural changes needed |
| `public/js/main.js` | `renderRecent()` and `addRecent()` remain unchanged |
| `public/js/state.js` | Element cache is unaffected |

## Current CSS (no mobile overrides exist)

```css
/* public/styles.css lines 575-628 */
.recent {
  display: grid;
  gap: 8px;
}

.recent-title {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.recent-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.recent-list button {
  border: 1px solid var(--border);
  background: var(--bg-alt);
  border-radius: 999px;
  padding: 6px 14px;
  max-width: 100%;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
  -webkit-text-fill-color: currentColor;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.2s ease;
}
```

On desktop the `flex-wrap: wrap` layout works well — buttons sit side by side
and wrap naturally. On mobile (≤ 600 px) each button is almost full width so
they stack into a tall vertical column.

## Detailed Changes

### `public/styles.css`

Add the following inside the existing `@media (max-width: 600px)` block that
starts around line 2266 (the main mobile breakpoint). Place the rules near the
other selection-card overrides.

```css
@media (max-width: 600px) {
  /* ... existing rules ... */

  .recent-list {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;          /* Firefox */
    padding-bottom: 4px;            /* prevent clipping of focus outlines */
  }

  .recent-list::-webkit-scrollbar {
    display: none;                   /* Chrome / Safari */
  }

  .recent-list button {
    flex-shrink: 0;
    max-width: 280px;
    font-size: 0.82rem;
    padding: 5px 12px;
  }
}
```

Key design decisions:

- **`flex-wrap: nowrap` + `overflow-x: auto`** converts the wrapping column
  into a single horizontal scrollable row, drastically reducing vertical space.
- **`scrollbar-width: none`** and **`::-webkit-scrollbar { display: none }`**
  hide the scrollbar for a cleaner mobile look while still allowing swipe.
- **`-webkit-overflow-scrolling: touch`** ensures smooth inertial scrolling on
  older iOS devices.
- **`flex-shrink: 0`** on buttons prevents them from being compressed — they
  keep their natural text width and scroll off-screen instead.
- **`max-width: 280px`** caps very long player names so a single button doesn't
  dominate the scrollable area (text will still truncate via the existing
  `text-overflow: ellipsis`).
- Slightly reduced `font-size` and `padding` to make the pills feel compact
  and appropriate for the horizontal scroll UX pattern.

## Verification

1. Run `python -m http.server --directory public 8000`
2. Open http://localhost:8000/ in a browser
3. Ensure you have at least 3–5 recent matchups saved (select some matchups to
   populate the list)
4. Resize the viewport to ≤ 600 px wide (or use DevTools device mode)
5. Verify:
   - The recent matchups section displays as a single horizontal scrollable row
   - Swiping/scrolling horizontally reveals additional matchup buttons
   - No visible scrollbar appears
   - Button text truncates with ellipsis for very long names
   - On desktop (> 600 px) the layout remains unchanged (wrapping pills)
   - Clicking a recent matchup button still loads the correct comparison
   - Dark mode styling remains intact
   - No console errors
