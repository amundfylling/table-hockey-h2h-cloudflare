---
name: Table Hockey H2H
description: Serious head-to-head table hockey statistics with fast player comparison and mobile-first match inspection.
colors:
  rink-cream: "#f6f2ec"
  rink-cream-pressed: "#f0ebe3"
  clean-surface: "#ffffff"
  ink: "#182025"
  slate-muted: "#5c6770"
  puck-orange: "#ef6c44"
  puck-orange-deep: "#cc5132"
  player-teal: "#2a7564"
  night-bg: "#0f1215"
  night-surface: "#1b2128"
  night-ink: "#f3f5f7"
  night-muted: "#a5b0bb"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0"
  body:
    fontFamily: "Manrope, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Manrope, Segoe UI, sans-serif"
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

The current system uses a warm rink-cream base, orange and teal player contrast, Fraunces headings, Manrope interface text, tight card radii, and layered surfaces. Keep the serious stats-tool posture from `PRODUCT.md`: sharp, credible, sporting. The system rejects spreadsheet density, generic SaaS dashboard patterns, sportsbook drama, and startup landing-page gloss.

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
- **Night Surface** (`#1b2128`): Dark-mode cards and elevated panels.
- **Night Ink** (`#f3f5f7`): Dark-mode primary text.
- **Night Muted** (`#a5b0bb`): Dark-mode secondary text.

### Named Rules

**The Two-Player Color Rule.** Orange and teal must carry matchup meaning first. Do not spend them on unrelated decoration when a player comparison is present.

**The No Spreadsheet Gray Rule.** Neutral surfaces should stay warm or tinted. Avoid flat white-gray table dumps that make the app feel like exported data.

## 3. Typography

**Display Font:** Fraunces, with Georgia and serif fallback.
**Body Font:** Manrope, with Segoe UI and sans-serif fallback.
**Label/Mono Font:** Manrope.

**Character:** Fraunces gives the product a sporting editorial signature without turning the app into a landing page. Manrope keeps controls, tables, charts, and filters clear at small sizes.

### Hierarchy
- **Display** (700, heading scale, line-height 1.1): App title and rare high-level identity moments.
- **Headline** (600-700, heading scale, line-height 1.15): Section headers such as matchup headline, filter title, and empty states.
- **Title** (600-700, 1.1rem to 1.2rem): Scoreboard player names, stat labels with emphasis, and component headers.
- **Body** (400-500, 1rem, line-height 1.5): Controls, table cells, filter values, status text, and explanatory copy.
- **Label** (600-700, 0.7rem to 0.9rem, uppercase allowed at 0.08em): Recent labels, scoreboard labels, table metadata, chips, and compact badges.

### Named Rules

**The Stats Stay Readable Rule.** Use Manrope for dense data and controls. Fraunces is for hierarchy, not table cells or chart labels.

**The No Tiny Evidence Rule.** Match evidence on mobile must stay readable at 0.85rem or larger unless it is a badge or compact label.

## 4. Elevation

The system uses a hybrid of tonal layering, translucent cards, borders, and soft shadows. Elevation should separate functional regions, not decorate every element. Cards currently use a translucent background with `backdrop-filter: blur(12px)`, `1px` borders, and soft ambient shadows.

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
- **Style:** Pills with clear semantic color: teal for Player A wins, orange for Player B wins, muted neutral for draws.
- **State:** Form chips are compact circles. Winner badges and match-score pills are compact but must remain legible on mobile.

### Cards / Containers
- **Corner Style:** Tight rounded surfaces (`8px` default card radius, `8px` nested block radius).
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

### Filter Drawer

The filter drawer is a practical control surface opened from the stage controls, not a floating global action. It should keep strong hierarchy: title, close button, search, period, tournament, stage, playoff-only best-of multi-select, sort, then options. The backdrop may blur slightly, but the drawer itself should stay crisp and readable.

### Match Table

Desktop uses a proper table for scanability. Mobile converts rows into cards with date, score, winner, tournament, stage, and overtime placed in predictable positions. Preserve this mobile-card behavior when adding playoff series features. Expanded playoff series should open into a compact evidence panel with a series header, game-by-game scorelines, OT badges placed next to the game result, winners, and the running series score after each game.

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
