# Prompt: Share Image V2 — Show Active Filters & Last-10 Form

> **Goal:** Modify the canvas drawing in `public/js/share.js` so the generated
> 1080×1080 share image (a) removes the current top watermark text ("TABLE HOCKEY
> H2H" + "HEAD TO HEAD COMPARISON") and replaces it with a **last-10-games form
> strip** (the same W/L/D chip row shown on the live page), and (b) draws an
> **active-filters badge bar** on the image so a viewer can immediately see which
> filters were applied to the stats being shown. If no filters are active the
> badge bar should read "All matches" (or "All series" in series mode) instead.

## Rules

- Only modify `public/js/share.js`. No HTML, CSS, or other JS files should change.
- Do NOT change any data fetching, filtering, chart, DOM rendering, or event
  listener logic.
- Do NOT change the sharing/download flow (Web Share API, fallback download,
  file naming, share text). Only modify the canvas **drawing** pipeline.
- Keep all existing helper functions (`roundRect`, `drawRoundRect`,
  `drawTruncatedText`, `drawPlayerName`, `sanitizeName`, `downloadImage`).
- Follow existing code style: vanilla ES6, ~100 char line wraps.
- Follow design tokens in `DESIGN.md` (Manrope for data, Fraunces for display
  headings, HSL-based colors, `border-radius: 12px` for cards).

---

## Architecture Context

This is a vanilla JS static site using ES modules under `public/js/`.
The share image is drawn entirely with the HTML5 Canvas API inside
`handleShareImage()` in `public/js/share.js`.

### Key files you will read (but NOT modify):

| File | What to read |
|---|---|
| `public/js/state.js` | `state.filters`, `state.stageTab`, `state.filteredMatches`, `isSeriesMode()`, `isSinglePlayerMode()` |
| `public/js/filters.js` | `getActiveFilterCount()` to check if any filters are active; `renderActiveFilterChips()` logic (lines 276-358) to see how filter labels are built |
| `public/js/form.js` | `getChronologicalItems()` to sort matches chronologically; `renderForm()` to see how the last-10 chip strip is built (lines 157-195) |
| `public/js/utils.js` | `getTournamentLevelLabel()` to format tournament level values |
| `public/js/summary.js` | `computeSummary()`, `computeSeriesSummary()`, `getHighlightInfo()`, `getSeriesHighlightInfo()` — already imported in share.js |

### File you WILL modify:

| File | What to change |
|---|---|
| `public/js/share.js` | Replace the header watermark section (step 4 "Header Watermark", lines 130–147) with the Last-10 Form strip. Add a new "Active Filters" badge bar between the W-D-L bar and the stats grid card. Shift the Y-coordinates of downstream sections as needed. |

---

## Detailed Changes to `public/js/share.js`

### 0. New imports

Add imports at the top of the file:

```javascript
import { getActiveFilterCount } from "./filters.js";
import { getChronologicalItems } from "./form.js";
import { getTournamentLevelLabel } from "./utils.js";
```

### 1. Remove the Header Watermark (current lines 130–147)

Delete the entire "4. Header Watermark" section that currently draws:
- `"TABLE HOCKEY H2H"` in bold 22px Manrope at y=75
- The mode label (`"HEAD TO HEAD COMPARISON"` / `"PLAYER PROFILE"` /
  `"PLAYOFF SERIES HEAD TO HEAD"`) in bold 15px Manrope at y=115

### 2. Draw the Last-10 Form Strip (replacement for the watermark)

Insert a new section **after** the player names + rank pills and **before** the
W-D-L bar. The form strip should sit at approximately `y = 255` (or wherever
makes visual sense after the player rank pills end at ~y=242).

#### 2a. Compute the last 10 results

Use the already-computed `matches` array (`state.filteredMatches`):

```javascript
const ordered = getChronologicalItems(matches).slice(-10);
```

Each item has a `.result` property: `"A"` = win, `"B"` = loss, `"D"` = draw.

#### 2b. Draw the chip row

Draw a horizontally centered row of small rounded-rect "chips", one per game,
colored to match the live page form strip:

| Result | Chip letter | Fill color | Text color |
|--------|-------------|------------|------------|
| `"A"` (Win) | `W` | `colors.teal` | `#ffffff` |
| `"B"` (Loss) | `L` | `colors.orange` | `#ffffff` |
| `"D"` (Draw) | `D` | `colors.draw` | `isDark ? "#f3f5f7" : "#182025"` |

**Chip dimensions:**
- Width: `44px`, Height: `36px`, Border-radius: `8px`
- Gap between chips: `8px`
- Font: `bold 16px Manrope`, centered in each chip.

**Positioning:**
- Total row width = `(chipCount * 44) + ((chipCount - 1) * 8)`.
- Center the row horizontally: `startX = (1080 - totalRowWidth) / 2`.
- Draw at a fixed Y, e.g., `chipY = 255`.

If `ordered.length === 0` (no matches), skip drawing the form strip entirely.

#### 2c. Draw the "LAST 10" label

Above the chip row, draw a small muted label:

```
"LAST 10 GAMES" (or "LAST 10 SERIES" in series mode)
```

- Font: `bold 12px Manrope`, color: `colors.muted`.
- Center-aligned at `x = 540`, `y = chipY - 10`.

### 3. Draw the Active Filters Badge Bar (new section)

Insert a new section **between** the W-D-L bar (currently ending at ~y=360)
and the Stats Grid Card (currently starting at y=385).

#### 3a. Compute active filter labels

Build an array of short human-readable strings representing each active filter.
Mirror the logic from `renderActiveFilterChips()` in `filters.js` (lines
276-358):

```javascript
const filterLabels = [];

if (state.filters.search.trim()) {
  filterLabels.push(`"${state.filters.search}"`);
}
if (state.filters.yearFrom !== "all" || state.filters.yearTo !== "all") {
  const from = state.filters.yearFrom === "all" ? "Earliest" : state.filters.yearFrom;
  const to = state.filters.yearTo === "all" ? "Latest" : state.filters.yearTo;
  filterLabels.push(`${from} – ${to}`);
}
if (state.filters.tournament !== "all") {
  const opt = document.querySelector(
    `#tournament-filter option[value="${CSS.escape(state.filters.tournament)}"]`
  );
  filterLabels.push(opt ? opt.textContent : state.filters.tournament);
}
if (state.filters.tournamentLevels.length) {
  const labels = state.filters.tournamentLevels
    .map((v) => getTournamentLevelLabel(v))
    .join(", ");
  filterLabels.push(`Level: ${labels}`);
}
if (state.filters.stage !== "all") {
  filterLabels.push(`Stage: ${state.filters.stage}`);
}
if (state.filters.otOnly) {
  filterLabels.push("Overtime only");
}
if (state.filters.tightOnly) {
  filterLabels.push("Tight games");
}
if (state.stageTab === "playoff" && state.filters.bestOf.length) {
  const labels = state.filters.bestOf
    .map((v) => (v === "1" ? "Single" : `Bo${v}`))
    .join(", ");
  filterLabels.push(labels);
}
```

Also include the **stage tab** context if it is not "overall":

```javascript
if (state.stageTab === "playoff") {
  filterLabels.unshift("Playoffs");
} else if (state.stageTab === "round-robin") {
  filterLabels.unshift("Round Robin");
}
```

#### 3b. Draw the filter badge bar

If `filterLabels.length === 0`, draw a single muted badge that reads
`"All matches"` (or `"All series"` in series mode).

If there are active filters, draw each label as a small rounded-rect pill badge
laid out in a horizontal row. Use this style:

| Property | Value |
|----------|-------|
| Pill height | `28px` |
| Pill border-radius | `14px` |
| Pill horizontal padding | `14px` left + right |
| Pill fill | `isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"` |
| Pill text font | `bold 13px Manrope` |
| Pill text color | `colors.muted` |
| Gap between pills | `8px` |

**Positioning:**
- Measure total row width = sum of each pill width + gaps.
- Center the row horizontally: `startX = (1080 - totalRowWidth) / 2`.
- If the total row width exceeds 952px (the content width), truncate by
  showing only the pills that fit and append a final `"+N more"` pill.
- Draw at `y = filterBarY` (see Y-coordinate adjustments below).

#### 3c. "Filters" icon/label prefix (optional but recommended)

Before the first pill, draw a small funnel/filter icon or the text `"FILTERS:"`
in `bold 11px Manrope`, color `colors.muted`, to make it obvious these are
filters. If no filters are active, skip this prefix and just show the
`"All matches"` badge.

### 4. Adjust Y-coordinates for all downstream sections

Because we removed the 75px-tall watermark header and added the form strip +
filter bar, the vertical layout needs re-flowing. Here is the suggested new
Y-coordinate map:

| Section | Old Y | New Y (approx) |
|---------|-------|-----------------|
| Player Names | 185 | 70 |
| Player Rank Pills | 210 | 95 |
| Last-10 Form label | (new) | 145 |
| Last-10 Form chips | (new) | 160 |
| W-D-L Bar | 275 | 210 |
| Active Filters bar | (new) | 300 |
| Stats Grid Card | 385 | 340 |
| Biggest Win Panels | 660 | 615 |
| Footer separator | 945 | 900 |
| Footer text | 990 | 945 |

> **Important:** These Y values are approximate. Adjust as needed so that
> the content is vertically centered on the 1080px canvas with balanced
> whitespace at top and bottom. The key constraint is that all content must
> fit within the 1080px height without clipping.

> **Tip:** You may want to compute `y` offsets incrementally using a running
> `cursorY` variable instead of hard-coded absolute values, so the layout
> adjusts naturally when sections are skipped (e.g., no form chips to draw).

### 5. Keep everything else unchanged

Do NOT modify:
- The W-D-L bar drawing logic (proportional segments, text labels, draw pill)
- The Stats Grid Card (3 rows of stats)
- The Biggest Win panels (left/right cards with scores and tournament links)
- The Footer section (separator, generated-on text, brand name)
- The sharing/download flow (`canvas.toBlob`, `navigator.share`, `downloadImage`)
- The `colors` object mapping
- The font pre-loading block (but add any new font sizes you use)

---

## Data Access Reference

Here is exactly how to get each piece of data needed:

### Last-10 form results
```javascript
import { getChronologicalItems } from "./form.js";
// ...
const matches = state.filteredMatches || [];
const ordered = getChronologicalItems(matches).slice(-10);
// Each item: { result: "A"|"B"|"D", ... }
```

### Active filter count
```javascript
import { getActiveFilterCount } from "./filters.js";
// ...
const count = getActiveFilterCount(); // 0 means no filters active
```

### Active filter labels
Build the labels array as shown in section 3a above. This mirrors the DOM
rendering in `renderActiveFilterChips()` in `filters.js` (lines 276-358).

### Stage tab context
```javascript
state.stageTab // "overall" | "playoff" | "round-robin"
```

### Series mode
```javascript
import { isSeriesMode } from "./state.js"; // already imported
const isSeries = isSeriesMode();
```

---

## Visual Reference

The final image should look like this (top-to-bottom):

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Player A Name                      Player B Name        │  ← Fraunces bold
│  [WR #12]                              [WR #8]          │  ← rank pills
│                                                          │
│                    LAST 10 GAMES                         │  ← muted label
│            [W] [W] [L] [W] [D] [W] [L] [W] [W] [L]     │  ← colored chips
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  341 (40.9%)  ░░ DRAWS 87 ░░  406 (48.7%)       │    │  ← W-D-L bar
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│        [Playoffs]  [2022 – 2024]  [Level: 1, 2]         │  ← filter pills
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  45    TOTAL GOALS SCORED               38       │    │
│  │──────────────────────────────────────────────────│    │
│  │  12    TIGHT WINS (1-GOAL)               9       │    │
│  │──────────────────────────────────────────────────│    │
│  │   3    OVERTIME WINS                     5       │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐          │
│  │  BIGGEST WIN       │  │  BIGGEST WIN       │          │
│  │  6-0               │  │  5-1               │          │
│  │  vs Opponent | Date│  │  vs Opponent | Date│          │
│  │  Tournament Name   │  │  Tournament Name   │          │
│  └────────────────────┘  └────────────────────┘          │
│                                                          │
│  ─────────────────────────────────────────────────       │
│  Generated on table-hockey-h2h.pages.dev    TH H2H      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

When **no filters are active**, the filter bar shows a single centered badge:

```
                       [All matches]
```

When the **stage tab** is not "overall", it is prepended as the first badge:

```
              [Round Robin]  [2023 – Latest]
```

---

## Verification

1. Run the local development server:
   ```bash
   python -m http.server --directory public 8000
   ```
2. Load a matchup (two players). Click "Share image".
   - Verify the top watermark text ("TABLE HOCKEY H2H" / "HEAD TO HEAD") is
     **gone**.
   - Verify the **last-10 form chips** appear near the top, colored correctly
     (teal W, orange L, muted D).
   - Verify the label reads "LAST 10 GAMES" in game mode and "LAST 10 SERIES"
     in series mode.
3. With **no filters** active, verify a single `"All matches"` badge appears
   between the W-D-L bar and the stats grid.
4. Apply some filters (e.g., year range 2022–2024, tournament level 1).
   Click "Share image" again.
   - Verify the filter badge bar shows `[2022 – 2024]` and `[Level: 1]` as
     separate pills.
5. Switch to the **Playoffs** tab. Click "Share image".
   - Verify a `[Playoffs]` badge appears as the first pill.
6. Switch to **Series Mode** within Playoffs. Click "Share image".
   - Verify the form label says "LAST 10 SERIES" and the stats grid labels
     update accordingly.
7. Test with a **single player** (profile mode). Verify the form strip and
   filter bar still render correctly.
8. Toggle **Dark Mode** and regenerate. Verify the form chips, filter pills,
   and all other elements use the correct dark theme colors.
9. Verify the image is not clipped — all content fits within the 1080×1080
   canvas with balanced spacing.
