# Prompt: Move "Copy Link" Button into the Summary Header

> **Goal:** Move the "Copy link" button from the selection card (`.selection-actions`)
> into the `.summary-header` section, next to the matchup headline. It should appear
> as a small, subtle icon-button (a link/share icon) that sits beside the `#headline`
> and `#subhead`, aligned right alongside the `#record` box. The button should only
> be visible when a player is loaded (not in the initial empty state).
>
> **Rules:**
> - Do NOT change any data fetching, rendering, filtering, or chart logic.
> - Keep the `#status` `<p>` element in `.selection-actions` (it still shows loading
>   text). Remove only the Copy Link button from there.
> - The button must keep its existing `id="copy-link-btn"` so all JS references
>   continue to work without changes to event listeners or `elements` cache.
> - Follow existing code style: vanilla CSS, ~100 char lines.
> - Follow the design tokens in `DESIGN.md` (Manrope font, HSL colors, border-radius,
>   etc.).

## Architecture Context

This is a vanilla JS static site using native ES modules under `public/js/`.
The DOM element cache is defined in `public/js/state.js` and looks up
`document.getElementById("copy-link-btn")` at module load time.

### Key files you will modify:

| File | What to change |
|---|---|
| `public/index.html` | Move the `#copy-link-btn` from `.selection-actions` into `.summary-header` |
| `public/styles.css` | Style the new button position and add the share/link SVG icon styling |

### Files you should NOT modify:

| File | Why |
|---|---|
| `public/js/state.js` | `elements.copyLinkBtn` will find the button by ID regardless of DOM position |
| `public/js/main.js` | `handleCopyLink()` and the click listener are ID-based, no changes needed |
| `public/js/players.js` | `updateSelectionControls()` toggles `disabled` via `elements.copyLinkBtn`, still works |

## Detailed Changes

### 1. `public/index.html`

**Remove the Copy Link button from `.selection-actions` (around line 97-100).**
The section should become:
```html
<div class="selection-actions">
  <p id="status" class="status" role="status" aria-live="polite"></p>
</div>
```

**Add the Copy Link button into `.summary-header` (around line 187-194).**
Place it as a new child element of `.summary-header`, after the headline `<div>`
and before the `#record` div. Use a compact icon-button style with a small link
SVG icon and a text label:

```html
<section class="summary-section">
  <div class="summary-header">
    <div>
      <h2 id="headline">Pick two players</h2>
      <p id="subhead">Matchup stats and filters appear once you compare.</p>
    </div>
    <div class="summary-header-actions">
      <button id="copy-link-btn" class="ghost copy-link-btn" type="button"
        aria-label="Copy link to this matchup" disabled>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" aria-hidden="true">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
        <span>Copy link</span>
      </button>
      <div id="record" class="record"></div>
    </div>
  </div>
  ...
```

The wrapper div `.summary-header-actions` groups the Copy Link button and Record
box together on the right side.

### 2. `public/styles.css`

**Add styles for the new `.summary-header-actions` wrapper and the repositioned
button.**

```css
.summary-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.copy-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 999px;
  white-space: nowrap;
  transition: opacity 0.2s ease, background 0.2s ease;
}

.copy-link-btn:disabled {
  opacity: 0;
  pointer-events: none;
}

.copy-link-btn svg {
  flex-shrink: 0;
}
```

Key design decisions:
- The button uses the existing `.ghost` class for base styling (border, background,
  hover effects) so it matches the design system.
- When `disabled` (no player selected), it fades to `opacity: 0` so it doesn't
  show in the empty/idle state — `pointer-events: none` prevents accidental clicks.
- The `border-radius: 999px` matches the pill shape used elsewhere in the app.
- The SVG is a standard "link" icon from Feather Icons, matching the icon style
  used throughout the application.

**Also clean up `.selection-actions` if it now only contains the status `<p>`.**
You may want to simplify its styling since it no longer needs flex layout for
buttons. However, if you keep it as-is, it won't break anything since the status
paragraph will just be the only child.

### 3. Mobile responsive considerations

Check the existing media query for `.summary-header` (if any) at the bottom of
`styles.css`. On mobile viewports, `.summary-header` likely stacks vertically.
Make sure `.summary-header-actions` wraps gracefully:

```css
@media (max-width: 600px) {
  .summary-header-actions {
    width: 100%;
    justify-content: space-between;
  }
}
```

## Verification

1. Run `python -m http.server --directory public 8000`
2. Open http://localhost:8000/ in a browser
3. Verify:
   - On initial load (no player selected), the Copy Link button is NOT visible
   - After selecting a player, the Copy Link button fades in next to the headline
   - Clicking Copy Link copies the URL and shows the "✓ Copied!" feedback
   - The button sits naturally next to the Record box on desktop
   - On mobile viewport (≤600px), the layout stacks cleanly
   - No console errors or warnings
   - The status text still appears in the selection card during loading
