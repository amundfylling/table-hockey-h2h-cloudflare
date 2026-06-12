# Prompt: Share Image V3 — UI/UX Polish & Visual Refinements

> **Goal:** Apply a comprehensive UI/UX polish pass to the canvas drawing in
> `public/js/share.js`. The current share image is functional but has several
> visual hierarchy, spacing, typographic, and information density issues that
> make it feel like a developer prototype rather than a premium share card. This
> prompt fixes every issue identified in the design audit without changing any
> data fetching, filtering, sharing/download logic, or event listeners.

## Rules

- Only modify `public/js/share.js`. No HTML, CSS, or other JS files.
- Do NOT change any data fetching, filtering, chart, DOM rendering, or event
  listener logic.
- Do NOT change the sharing/download flow (Web Share API, fallback download,
  file naming, share text). Only modify the canvas **drawing** pipeline.
- Keep all existing helper functions (`roundRect`, `drawRoundRect`,
  `drawTruncatedText`, `drawPlayerName`, `sanitizeName`). You may add new
  canvas-only helpers. You may modify existing helpers' internals if needed.
- Follow the design system in `DESIGN.md` (Fraunces display headings, Manrope
  for data, HSL warm rink colors, tight card radii).
- The image must continue to support both Light and Dark themes.
- The image must continue to support H2H mode (two players) and Single-Player
  Profile mode (one player).
- The image must continue to support Game Mode and Series Mode.

---

## Issue 1: Player Name Vertical Alignment & Spacing

### Problem
Player A name is drawn at `y=70` left-aligned, Player B at `y=70`
right-aligned. When names have different font sizes (auto-scaled via
`drawPlayerName`), their baselines don't align, creating an unbalanced header.
The rank pills below sit at a hard-coded `y=95` regardless of actual name
height, causing inconsistent gaps when one name shrinks and the other doesn't.

### Fix
1. Compute font size for both player names FIRST (run the measurement loop
   from `drawPlayerName` for both names without drawing).
2. Use the **larger** of the two font sizes to set a shared baseline `y`.
3. Draw both names at the shared baseline so they appear balanced.
4. Position rank pills relative to each player's actual drawn text bottom
   (baseline + a fixed `18px` gap), not a fixed global `y`.

### Implementation Detail
Refactor `drawPlayerName` to accept an optional `dryRun` parameter. When
`dryRun` is true, return `{ fontSize, textWidth }` without calling
`fillText`. In the main function, call both names in dry-run first, determine
the shared baseline, then draw.

---

## Issue 2: Last-10 Form Strip Is Too Small and Disconnected

### Problem
The form chips (`44×36px` with `16px` font) are small relative to the 1080px
canvas. The `"LAST 10 GAMES"` label at `12px` is nearly invisible. The gap
between the form strip and the W-D-L bar feels arbitrary. On the dark theme
in particular, the draw chip color (`#2f3944`) is very low-contrast against
the dark background (`#0f1215`), making draws hard to identify.

### Fix
1. Increase chip size to `54×42px` with `bold 20px Manrope` letter text.
2. Increase the label to `bold 14px Manrope` with `1px` letter-spacing.
3. Add a subtle `1px` rounded-rect border around each chip matching the
   theme border color (`colors.border`) to ensure draw chips are distinguishable
   from the background in both themes.
4. Move the form strip down to `y=155` with the label at `y=142`, giving
   `~12px` breathing room below the rank pills.
5. Set the W-D-L bar to start at `y=220` (keep current), which naturally
   gives `~24px` gap between form chips bottom and bar top.

---

## Issue 3: W-D-L Bar Draws Label Is Clipped and Misaligned

### Problem
The "WINS" / "SERIES" label above the draws pill is drawn at `y = barY + 14`
which overlaps the top edge of the bar when the draws segment is narrow. The
draws pill itself has an inconsistent `pillY + 15` offset with a `pillH - 4`
height reduction that looks like a math hack rather than intentional design.
When the draws percentage is very small (<5%), the pill and label both
disappear, leaving the viewer with no information about draws in the bar.

### Fix
1. Replace the in-bar draws label system: instead of drawing inside the bar,
   add a centered text **below** the bar that always shows the draw count and
   percentage (e.g., `"13 Draws (13.5%)"` or `"2 Tied (8.3%)"` for series).
   Use `bold 14px Manrope` in `colors.muted`.
2. Position this draws summary at `barY + barH + 20`.
3. Remove the draws pill from inside the bar. The bar should only show the
   teal and orange proportional fills with their win counts.
4. If the teal or orange segment is too narrow for text (< 100px), draw the
   count text **outside** the bar, flush against the respective edge, in the
   matching player color. This prevents text from being hidden when one player
   dominates.
5. Push all content below by adjusting: filter bar Y starts at the new
   `barY + barH + 50` (after draws summary).

---

## Issue 4: Filter Bar Uses Inconsistent Centering

### Problem
The filter bar is centered using a manual width accumulation loop, but the
`"FILTERS:"` prefix text uses `bold 11px Manrope` which is nearly illegible
at 1080px canvas resolution. The pills at `28px` tall with `13px` text feel
cramped. When there are 0 active filters, displaying "All matches" as a pill
looks like a filter is applied, creating user confusion.

### Fix
1. Increase filter pill height to `34px` with `bold 15px Manrope` text.
2. Increase `"FILTERS:"` prefix to `bold 13px Manrope`.
3. When no filters are active, instead of drawing a pill with "All matches",
   draw a simple centered text line: `"Showing all matches"` (or
   `"Showing all series"`) in `colors.muted` at `16px Manrope`, without any
   pill background. This clearly communicates "no filters" vs. "a filter
   called 'All matches' is active".
4. When filters ARE active, keep the pill layout but use a slightly more
   prominent background: `rgba(42, 117, 100, 0.12)` in light mode and
   `rgba(42, 117, 100, 0.20)` in dark mode (teal-tinted rather than generic
   gray) to make them feel more intentional and less like UI chrome.

---

## Issue 5: Stats Grid Row Values Are Not Vertically Centered

### Problem
The stats grid draws left/right values at `centerY + 10` and labels at
`centerY + 5`. These offsets were eyeballed and don't account for actual font
metrics. The `32px` stat values and `16px` labels have different ascender
heights, so they aren't truly vertically centered in their 80px rows. The
values feel like they're sitting too low.

### Fix
1. Use `ctx.textBaseline = "middle"` for the stat value and label drawing.
2. Draw the stat values at exactly `centerY` (no offset).
3. Draw the label text at `centerY - 2` (slight upward nudge since uppercase
   labels have no descenders).
4. Reset `textBaseline` to `"alphabetic"` after the grid is complete.

---

## Issue 6: Stats Grid Card Has No Header / Context

### Problem
The stats grid card (Total Goals, Tight Wins, OT Wins) is a rounded rect
with three rows but no header. A viewer seeing this image for the first time
has no context about what section they're looking at. The live page has visual
context from surrounding elements, but the share image is standalone and
must be self-explanatory.

### Fix
1. Add a small header bar at the top of the stats card: draw a horizontal
   text `"MATCH STATISTICS"` (or `"SERIES STATISTICS"` in series mode) in
   `bold 12px Manrope`, letter-spacing `1.5px`, color `colors.muted`, at
   `cardX + 32, cardY + 24`.
2. Shift the row content down by `30px` to accommodate the header (increase
   `cardH` to `270px` and start the first row at `cardY + 30`).

---

## Issue 7: Biggest Win Panels Have Wasted Vertical Space

### Problem
The "Biggest Win" panels are `240px` tall with content that only uses about
`170px` of that height. The remaining `70px` is dead space at the bottom of
each panel. This is wasted canvas real estate that could be used to make the
overall image feel less cramped at the top and more balanced.

### Fix
1. Reduce panel height from `240px` to `210px`.
2. Keep the label at `panelY + 40`.
3. Keep the score at `panelY + 105`.
4. Move the "vs opponent | date" line to `panelY + 148`.
5. Move the tournament line to `panelY + 178`.
6. For the "No wins" empty state, keep the text at `panelY + 110`.

---

## Issue 8: Footer Is Disconnected and Underdesigned

### Problem
The footer section (divider line at `y=905`, text at `y=950`) has ~80px of
dead space between the biggest win panels (ending at ~865) and the divider.
The footer text is plain: a URL on the left and "Table Hockey H2H" in orange
on the right. There's no visual brand element. The 1080px image is a
standalone asset—the footer is the last thing the viewer sees and should
leave a brand impression.

### Fix
1. Move the divider line and footer text up to sit `40px` below the biggest
   win panels' bottom edge (dynamically computed).
2. Add a small `28×28px` rounded-square brand icon on the right side before
   the "Table Hockey H2H" text. Draw a filled rounded rect in
   `colors.orange` with a white "⊞" or "H" letter inside (matching the app's
   favicon visual). This gives the footer a "brand badge" feel.
3. Change the left text from `"Generated on table-hockey-h2h.pages.dev"` to
   `"table-hockey-h2h.pages.dev"` (shorter, cleaner). Add the generation
   date below it in `12px Manrope, colors.muted` as a second line:
   e.g. `"June 11, 2026"`.
4. Add a subtle top-border gradient to the divider: instead of a straight
   `colors.border` line, draw a short gradient from `transparent` at the
   edges to `colors.border` in the center (fake a fade-in/fade-out effect
   by drawing 3 segments with varying opacity). This makes the divider
   feel less harsh and more editorial.

---

## Issue 9: No Total Games Count Visible at a Glance

### Problem
The live page shows `"96 games across 40 tournaments."` as a subheadline.
The share image has NO equivalent. A viewer receiving this image cannot
immediately tell how many games the stats are based on. This is critical
statistical context—stats from 5 games vs. 96 games have very different
credibility.

### Fix
1. Add a "total games" badge between the form strip and the W-D-L bar:
   centered text reading `"96 GAMES  ·  40 TOURNAMENTS"` (or
   `"12 SERIES  ·  8 TOURNAMENTS"` in series mode) in
   `bold 14px Manrope`, color `colors.muted`, letter-spacing `0.5px`.
2. Position this at `formChipsBottom + 20` (below the form chips, above
   the W-D-L bar).
3. Adjust the W-D-L bar Y downward by `30px` to accommodate.

---

## Issue 10: Light Theme Biggest Win Panels Lack Depth

### Problem
In light mode, the biggest win panels use `colors.surface` (#ffffff) as
fill and `colors.border` (#e4dfd5) as stroke. Against the `colors.bg`
(#f6f2ec) background, this creates very low contrast—the panels barely
look like distinct cards. In dark mode they look great because `#1b2128`
against `#0f1215` has enough contrast.

### Fix
1. In light mode only, add a subtle box shadow effect to the biggest win
   panels. Since canvas doesn't have `box-shadow`, simulate it by drawing
   a slightly larger rounded rect behind the panel in a shadow color:
   - Draw a rect at `(panelX - 1, panelY + 2, panelW + 2, panelH + 2)`
     with fill `rgba(24, 32, 37, 0.06)` and radius `13`.
   - Then draw the actual panel on top.
2. In dark mode, keep the current rendering (no shadow needed).

---

## Issue 11: Draw Chip Color Accessibility

### Problem
The draw chip in the Last-10 form strip uses `colors.draw` which is:
- Light: `#e4dfd5` — decent contrast against `#f6f2ec` bg
- Dark: `#2f3944` — only 1.3:1 contrast against `#0f1215` bg

This fails WCAG AA for both the chip background distinction and the letter
text readability. The letter "D" in a dark draw chip is nearly invisible.

### Fix
1. Add a `drawChipBg` color to the colors object:
   - Light: `#d8d2c5` (slightly darker than current `#e4dfd5`)
   - Dark: `#3a4654` (brighter than current `#2f3944`)
2. Use `drawChipBg` for form strip draw chips instead of `colors.draw`.
3. Ensure the letter text color is `colors.text` (not `colors.muted`) for
   draw chips to maintain readability.

---

## Layout Flow — Full Y-Coordinate Map (after all fixes)

Use a running `cursorY` variable to avoid hard-coded y-positions. Start
at `cursorY = 0` and accumulate:

```
cursorY = 0

[Player Names Header]
  nameBaselineY = 70 (shared baseline, computed from both names)
  cursorY = nameBaselineY + 8 + max(rankPillH, 0)
  → ~130

[Form Strip]
  formLabelY = cursorY + 12 = ~142
  formChipsY = cursorY + 25 = ~155
  cursorY = formChipsY + chipH = ~197

[Games Count Badge]
  gamesCountY = cursorY + 18 = ~215
  cursorY = gamesCountY + 22 = ~237

[W-D-L Bar]
  barY = cursorY + 8 = ~245
  barH = 72
  cursorY = barY + barH = ~317

[Draws Summary (below bar)]
  drawsSummaryY = cursorY + 14 = ~331
  cursorY = drawsSummaryY + 22 = ~353

[Filter Bar]
  filterBarY = cursorY + 8 = ~361
  filterBarH = 34
  cursorY = filterBarY + filterBarH = ~395

[Stats Grid Card]
  cardY = cursorY + 16 = ~411
  cardH = 270 (including header)
  cursorY = cardY + cardH = ~681

[Biggest Win Panels]
  panelY = cursorY + 16 = ~697
  panelH = 210
  cursorY = panelY + panelH = ~907

[Footer]
  dividerY = cursorY + 28 = ~935
  footerTextY = dividerY + 35 = ~970
  footerDateY = footerTextY + 18 = ~988
```

Verify that `footerDateY + 30 < 1080` to ensure nothing is clipped.

If the total layout exceeds 1080px, adjust by:
1. First: reduce inter-section gaps by 4px each
2. Second: reduce panel height to 195px
3. Third: reduce stats card row height from 80px to 70px

---

## Verification Checklist

1. Load `http://localhost:8000/?p1=9763&p2=8566` (H2H with 96 games).
   Click "Share image" and open the downloaded PNG. Verify:
   - Player names are baseline-aligned even when different lengths.
   - Form chips are larger and clearly distinguishable (especially draws).
   - Total games count is visible.
   - W-D-L bar has no internal draws pill; draws are shown below.
   - Filter bar shows "Showing all matches" (no pill) when unfiltered.
   - Stats grid has a section header.
   - Biggest win panels have subtle depth in light mode.
   - Footer has a brand badge and generation date.
   - All content fits within 1080×1080 with no clipping.

2. Apply a year filter (e.g., 2021–Latest). Regenerate. Verify:
   - Filter pills appear with teal-tinted background.
   - The "FILTERS:" prefix is visible.
   - Games count reflects the filtered subset.

3. Switch to **Series Mode** (Playoff tab). Regenerate. Verify:
   - Labels say "LAST 10 SERIES", "SERIES STATISTICS", "X SERIES".
   - Draws summary says "X Tied (Y%)".

4. Switch to **Dark Mode**. Regenerate all above cases. Verify:
   - Draw chips are clearly visible against the dark background.
   - Light shadow is NOT applied to biggest win panels in dark mode.
   - All text maintains sufficient contrast.

5. Test with a **single player** (profile mode). Verify "ALL OPPONENTS"
   label, form strip, and stats all render correctly.

6. Test with a matchup that has **0 draws** to verify draws summary
   reads `"0 Draws (0.0%)"` correctly.

7. Test with a matchup where **one player dominates** (e.g., 90%+ wins)
   to verify the minority count text appears outside the bar rather
   than being hidden inside a tiny segment.
