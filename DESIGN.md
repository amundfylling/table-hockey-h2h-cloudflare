---
name: Table Hockey H2H
description: Serious head-to-head table hockey statistics with fast player comparison and mobile-first match inspection.
colors:
  rink-cream: "#F4F3EF"
  rink-cream-pressed: "#ECEAE4"
  clean-surface: "#ffffff"
  ink: "#15181B"
  slate-muted: "#4A525B"
  puck-orange: "#D4532A"
  puck-orange-deep: "#B4441F"
  player-teal: "#1D6A59"
  night-bg: "#0F1113"
  night-surface: "#171A1D"
  night-ink: "#EEF0F2"
  night-muted: "#A9B0B8"
typography:
  display:
    fontFamily: "Schibsted Grotesk, Golos Text, sans-serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Schibsted Grotesk, Golos Text, sans-serif"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0"
  body:
    fontFamily: "Schibsted Grotesk, Golos Text, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Schibsted Grotesk, Golos Text, sans-serif"
    fontSize: "0.85rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.puck-orange}"
    textColor: "{colors.clean-surface}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.clean-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "24px"
  input:
    backgroundColor: "{colors.rink-cream-pressed}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
---

# Design System: Table Hockey H2H

## 1. Overview

**Creative North Star: "The Match Analyst's Bench"**

The design system should feel like a focused stats bench beside a competitive table hockey rink: warm enough to belong to the sport, disciplined enough to make the numbers trustworthy. Users arrive with a matchup question, so every visual choice should shorten the path from player selection to evidence.

The current system uses a warm rink-cream base, orange and teal player contrast, Schibsted Grotesk text with Golos Text for Cyrillic, Barlow Condensed numerals, tight card radii, and layered surfaces. Keep the serious stats-tool posture from `PRODUCT.md`: sharp, credible, sporting. The system rejects spreadsheet density, generic SaaS dashboard patterns, sportsbook drama, and startup landing-page gloss.

**Key Characteristics:**
- Comparison-first composition with Player A and Player B colors kept consistent.
- Warm neutral canvas instead of corporate gray or cold dashboard blue.
- Data density is allowed, but it must be organized for fast scanning.
- Mobile is a primary workflow, not a compressed desktop afterthought.
- Future playoff-series views should make series outcomes legible while keeping individual game evidence nearby.

## 2. Colors

The palette is a restrained sports-stat palette: warm rink neutrals, one puck-orange action color, and one teal opponent color for comparison balance.

### Primary
- **Puck Orange** (`#ef6c44`): Primary action color, Player B color, winner badges for Player B, logo gradient start, and active emphasis. Use sparingly so it keeps its competitive energy.
- **Deep Puck Orange** (`#cc5132`): Primary button gradient end and stronger orange emphasis in light mode.

### Secondary
- **Player Teal** (`#2a7564`): Player A color, comparative wins, chart legend color, and the counterweight to orange. It should always describe a side of the matchup, not decoration.

### Neutral
- **Rink Cream** (`#f6f2ec`): Default light background. It gives the app a warmer, sport-specific feel than plain white.
- **Pressed Rink Cream** (`#f0ebe3`): Input shells, tab rails, record panels, and nested tonal areas.
- **Clean Surface** (`#ffffff`): Light-mode cards, menus, tables, tooltips, and dropdowns.
- **Ink** (`#182025`): Primary text and readable foreground.
- **Slate Muted** (`#5c6770`): Secondary labels, helper text, table headers, and subdued metadata.
- **Night Background** (`#0f1215`): Dark-mode page background.
- **Night Surface** (`#1d242c`): Dark-mode cards and elevated panels.
- **Night Ink** (`#f3f5f7`): Dark-mode primary text.
- **Night Muted** (`#a5b0bb`): Dark-mode secondary text.

### Named Rules

**The Two-Player Color Rule.** Orange and teal must carry matchup meaning first. Do not spend them on unrelated decoration when a player comparison is present.

**The Small Orange Text Rule.** Bright puck orange (`#ef6c44`) measures ~3:1 on white — fine for large text, fills, and graphics, but below WCAG AA for small text. Orange text under ~18px bold (winner badges, score values, chips, links) uses Deep Puck Orange (`#cc5132`, `var(--accent-dark)`) instead. Dark mode redefines `--accent-dark` to a lighter orange, so the same variable keeps both themes compliant.

**The Neutral Chrome Rule.** UI chrome (focus rings, active tabs, selected options, toggles, links, hover borders) uses ink via `--ui` and `--ui-soft`, never orange. Orange is reserved for Player B, the logo, and the one primary action, so it always means something when it appears.

**The No Spreadsheet Gray Rule.** Neutral surfaces should stay warm or tinted. Avoid flat white-gray table dumps that make the app feel like exported data.

## 3. Typography

**Display and Body Font:** Schibsted Grotesk, with Golos Text as the Cyrillic fallback so Russian tournament and player names keep the same weight and width.
**Numerals:** Barlow Condensed for scores, counts and chart figures.

**Character:** One grotesk family keeps headings, controls and tables consistent. The condensed numerals give scores a scoreboard feel and let large records fit on phones.

### Hierarchy
- **Display** (700, heading scale, line-height 1.1): App title and rare high-level identity moments.
- **Headline** (600-700, heading scale, line-height 1.15): Section headers such as matchup headline, filter title, and empty states.
- **Title** (600-700, 1.1rem to 1.2rem): Scoreboard player names, stat labels with emphasis, and component headers.
- **Body** (400-500, 1rem, line-height 1.5): Controls, table cells, filter values, status text, and explanatory copy.
- **Label** (600-700, 0.7rem to 0.9rem, uppercase allowed at 0.08em): Recent labels, scoreboard labels, table metadata, chips, and compact badges.

### Named Rules

**The Stats Stay Readable Rule.** Use Manrope for dense data and controls. Fraunces is for hierarchy, not table cells or chart labels.

**The No Tiny Evidence Rule.** Match evidence on mobile must stay readable at 0.85rem or larger unless it is a badge or compact label.

**The No Zoom Rule.** Form controls never go below 1rem (16px); iOS Safari auto-zooms on focus for smaller text. Reclaim density with padding, not font size.

**The Six Sizes Rule.** The interface uses exactly six font sizes, defined as tokens in `styles.css`: `--fs-xs` 0.75rem, `--fs-sm` 0.875rem, `--fs-md` 1rem, `--fs-lg` 1.25rem, `--fs-xl` 1.75rem and `--fs-2xl` 2.75rem. Never write a literal `font-size` in rem or px; pick a token.

**The Figures Rule.** All numbers render with tabular figures (set on `body`), large counts use thousands separators (`formatNumber`), records and score ranges use an en dash (77–43), and dates use one format everywhere: `5 Dec 2021` (`formatDate`).

**The One Label Rule.** Small uppercase labels (eyebrows, stat labels, section labels) share one style: `--fs-xs`, weight 700, 0.08em tracking, muted color.

## 4. Elevation

The system uses solid card surfaces, `1px` borders, and soft ambient shadows. Elevation should separate functional regions, not decorate every element: no cards nested inside cards, no tinted boxes around charts, and no backdrop blur.

**The One Result Rule.** A matchup's headline record appears once, in the hero scoreboard at the top of the summary card. Everything else (stat bars, biggest wins, form) supports it rather than repeating it.

### Shadow Vocabulary
- **Ambient Surface** (`0 8px 24px rgba(0, 0, 0, 0.06)`): Default light-mode card shadow.
- **Ambient Surface Dark** (`0 8px 24px rgba(0, 0, 0, 0.35)`): Default dark-mode card shadow.
- **Popover Shadow** (`0 20px 50px rgba(24, 32, 37, 0.12)`): Typeahead, tooltip, and larger floating surfaces.
- **Action Glow** (`0 14px 30px rgba(239, 108, 68, 0.35)`): Primary button hover only.
- **Sidebar Shadow** (`-4px 0 24px rgba(0, 0, 0, 0.1)`): Filter menu drawer.

### Named Rules

**The Evidence Over Atmosphere Rule.** Shadows and blur may clarify layers, but they must never make charts, filters, or match rows harder to read.

**The Hover Is Feedback Rule.** Lift and glow should communicate interactivity. Do not apply hover elevation to static cards or data blocks that are not actionable.

## 5. Components

### Buttons
- **Shape:** Fully rounded pill controls (`999px`) for primary, ghost, pagination, recent matchup, and tab buttons.
- **Primary:** Orange gradient (`#ef6c44` to `#cc5132`), white text, medium-weight label, `12px 24px` padding.
- **Hover / Focus:** Primary buttons lift slightly and can use an orange glow; ghost buttons use a tonal background and border contrast. Focus states must be visible at least as strongly as hover states.
- **Secondary / Ghost:** Transparent background, `1px` border, pill shape, text in Ink or Night Ink. Use for theme toggle, copy link, pagination, and close actions.

### Chips
- **Form chips:** Compact circles. A win is solid teal, a loss is a muted outline, a draw is a tonal fill, so a streak reads at a glance without leaning on red/green. The most recent game carries a ring.
- **Scores and winners:** No pills. A score is plain tabular figures with an en dash; the winning side's goals are bold in that player's color. A winner is a small colored dot plus the name.

### Cards / Containers
- **Corner Style:** Tight rounded surfaces (`8px` default card radius, `8px` nested block radius, `12px` for the scoreboard family: scoreboard head, score rows, highlight columns).
- **Background:** Use translucent card backgrounds for top-level cards and tonal backgrounds for nested functional groups.
- **Shadow Strategy:** Top-level surfaces may use ambient shadows; static cards should not lift on hover. Nested blocks should prefer borders and tonal background.
- **Border:** Use `1px` borders from the current border token. Do not introduce colored side stripes.
- **Internal Padding:** Use `24px` for top-level cards, `16px` to `20px` for compact panels, and `10px` to `12px` for table rows and controls.

### Inputs / Fields
- **Style:** Inputs sit inside a rounded shell (`14px`) with tonal background and a subtle border. Text inputs and selects should feel practical and quiet.
- **Focus:** Add clear focus affordance without heavy glow. The field must remain readable in both themes.
- **Disabled:** Player 2 can be disabled until Player 1 is selected. Disabled inputs should keep layout stable and use reduced opacity without disappearing.

### Navigation
- **Style, typography, default/hover/active states, mobile treatment.** Stage tabs use a pill segmented control. The active tab gets a surface fill and shadow; inactive tabs stay muted and gain light tonal feedback on hover. On mobile, controls should stack or wrap without compressing labels into unreadable fragments.

### Matchup Scoreboard

The scoreboard is the signature component. It should make the current comparison understandable before the user reaches charts or the table.

- **Structure:** Player A left, Player B right, matchup title centered when space allows.
- **Color:** Player A uses teal, Player B uses orange. Labels and values must also identify sides so color is not the only cue.
- **Rows:** Ratio fills are useful, but they must remain secondary to the numbers.
- **Highlights:** Largest wins/losses should stay compact, with tournament context clamped rather than spilling.

### Charts

Charts are compact evidence panels, not decorative illustrations. Use teal/orange legends, visible tooltips, and restrained motion. Preserve enough whitespace for labels and hover targets on mobile.

### Chart Tooltips

Tooltips are compact evidence cards, not ornaments: a muted uppercase caption (date or period), one row per player with a teal/orange dot and a right-aligned tabular value, a hairline divider, then muted/bold key-value rows. Placement must never cover the hovered element: anchor to the hovered region and place beside it first, above it second, below it last, always clamped inside the chart card. On touch, a tap shows the tooltip and it persists about 2.5s after the finger lifts.

### Filter Drawer

The filter drawer is a practical control surface opened from the stage controls, not a floating global action. It should keep strong hierarchy: title, close button, search, period, tournament, stage, playoff-only best-of multi-select, sort, then options. The backdrop may blur slightly, but the drawer itself should stay crisp and readable.

### Home Screen

With no matchup selected the page leads with a display headline and a quiet stat strip (players, matches, last update). Below the picker, "Top-ranked rivalries" offers up to four one-tap matchups built from the current world ranking. Home-only blocks use `.home-only` and are driven by `body[data-home]`, which is set before data loads so shared links never flash the home screen.

### Loading and Score Bug

While a matchup loads, a shimmer skeleton in the shape of the scoreboard holds the layout. Once the scoreboard scrolls out of view, a slim fixed score bug (names and record) stays pinned to the top on screens up to 900px. Hero numbers count up once (600ms) unless the user prefers reduced motion.

### Match Table

Desktop uses a proper table for scanability. Mobile (600px and below) converts rows into a borderless list: the score leads in a fixed left column, tournament on the first line, date, stage and round on the second, with overtime marked next to the score; the winner column is dropped because the bold side of the score already says it. Preserve this mobile-card behavior when adding playoff series features. Expanded playoff series should open into a compact evidence panel with a series header, game-by-game scorelines, OT badges placed next to the game result, winners, and the running series score after each game.

## 6. Do's and Don'ts

### Do:
- **Do** keep the interface a serious stats tool: sharp, credible, sporting.
- **Do** keep Player A and Player B visually consistent across scoreboard, charts, badges, and table evidence.
- **Do** make mobile player selection, filters, charts, and match rows comfortable to use with clear tap targets.
- **Do** keep summary stats, charts, filters, and the match list connected so users can trace every conclusion back to evidence.
- **Do** plan future playoff-series UI so best-of-3, best-of-5, and best-of-7 outcomes can sit beside individual game results without replacing them.
- **Do** use warm neutrals and measured contrast instead of default dashboard gray.

### Don't:
- **Don't** make the app feel like a spreadsheet.
- **Don't** make the app feel like a generic SaaS dashboard.
- **Don't** make the app feel like a sportsbook or an overly polished startup landing page.
- **Don't** use identical metric-card grids as the default answer for new stats.
- **Don't** use colored side-stripe borders, gradient text, decorative glassmorphism, or purple-blue AI-style gradients.
- **Don't** rely on color alone to distinguish players, wins, losses, or series outcomes.
