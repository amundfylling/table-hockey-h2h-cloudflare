# Prompt: Export and Share Matchup Stats as Image

> **Goal:** Add a "Share image" option to the matchup view. When a matchup is loaded, clicking "Share image" generates a clean, mobile-optimized 1:1 square image (1080×1080px) representing the current stats scoreboard using the HTML5 Canvas API. On mobile, it triggers the native share sheet with the image file (using the Web Share API); on desktop, it falls back to a direct PNG download.

## Rules

- Do NOT change any data fetching, filtering, or chart logic.
- No external libraries (no `html2canvas`, no `dom-to-image`). Use native HTML5 `<canvas>`.
- Follow the design system tokens in `DESIGN.md` (warm rink colors, Fraunces display headings, Manrope stats font).
- The image must support both Light and Dark themes, matching the user's active theme.
- The image must support both H2H matchup mode (two players selected) and Single-Player Profile mode (one player selected).
- The image must support both Game Mode and Series Mode stats structures based on the active view.
- Ensure custom web fonts ("Fraunces" and "Manrope") are fully loaded before rendering the canvas.

---

## Architecture Context

This is a vanilla JS static site using native ES modules under `public/js/`.
To keep the codebase modular, the canvas generation, sharing, and download logic should be implemented in a new module file: `public/js/share.js`.

### Key files you will modify/create:

| File | What to change |
|---|---|
| `public/index.html` | Add `#share-image-btn` to `.summary-header-actions` next to the copy link button. |
| `public/js/state.js` | Add `shareImageBtn: document.getElementById("share-image-btn")` to the `elements` lookup. |
| `public/js/players.js` | Enable/disable the button in `updateSelectionControls()` based on player selection. |
| `public/js/main.js` | Import `handleShareImage` and bind it to the button click listener. |
| `public/js/share.js` **[NEW]** | Implement canvas rendering, Web Share API invocation, and PNG file download fallback. |
| `public/styles.css` | Style the share button and adjust spacing for mobile responsiveness. |

---

## Detailed Changes

### 1. `public/index.html`

Add the Share Image button in `.summary-header-actions` next to the copy link button:

```html
<div class="summary-header-actions">
  <button id="copy-link-btn" class="ghost copy-link-btn" type="button"
    aria-label="Copy link to this matchup" disabled>
    <!-- ... copy link SVG ... -->
    <span>Copy link</span>
  </button>
  <button id="share-image-btn" class="ghost share-image-btn" type="button"
    aria-label="Share matchup as image" disabled>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <circle cx="8.5" cy="8.5" r="1.5"></circle>
      <polyline points="21 15 16 10 5 21"></polyline>
    </svg>
    <span>Share image</span>
  </button>
  <div id="record" class="record"></div>
</div>
```

### 2. `public/styles.css`

Add styling for `.share-image-btn` identical to `.copy-link-btn`:

```css
.share-image-btn {
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

.share-image-btn:disabled {
  opacity: 0;
  pointer-events: none;
}

.share-image-btn svg {
  flex-shrink: 0;
}
```

Ensure on mobile viewports (`@media (max-width: 600px)`), `.summary-header-actions` wraps correctly and buttons shrink or stack cleanly:

```css
@media (max-width: 600px) {
  .summary-header-actions {
    width: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-start;
  }
  
  .copy-link-btn, .share-image-btn {
    flex: 1 1 calc(50% - 4px); /* grow to fill row equally */
    justify-content: center;
    font-size: 0.78rem;
    padding: 8px 10px;
  }
}
```

### 3. `public/js/state.js`

Add `shareImageBtn` to the `elements` mapping:

```javascript
export const elements = {
  // ...
  copyLinkBtn: document.getElementById("copy-link-btn"),
  shareImageBtn: document.getElementById("share-image-btn"),
  // ...
};
```

### 4. `public/js/players.js`

Update the `updateSelectionControls()` function to toggle the state of the Share Image button:

```javascript
export function updateSelectionControls() {
  // ...
  if (elements.copyLinkBtn) {
    elements.copyLinkBtn.disabled = !resolvePlayerId(elements.playerA);
  }
  if (elements.shareImageBtn) {
    elements.shareImageBtn.disabled = !resolvePlayerId(elements.playerA);
  }
}
```

### 5. `public/js/main.js`

Import the click handler and register the event listener:

```javascript
import { handleShareImage } from "./share.js";

// ... inside the DOM binding section (around line 885) ...
if (elements.shareImageBtn) {
  elements.shareImageBtn.addEventListener("click", handleShareImage);
}
```

---

## 6. Implementing `public/js/share.js` [NEW]

Create a clean canvas rendering and sharing workflow. Follow this layout specification for the 1080×1080px (1:1 aspect ratio) mobile-optimized shared image.

### Canvas Layout Blueprint (1080×1080 px)

- **Canvas Size**: 1080 x 1080 px
- **Margins**: Left/Right padding = 64 px (content width = 952 px).
- **Active Theme Selection**:
  Detect theme state `const isDark = document.body.getAttribute("data-theme") === "dark";`.
  - **Light Mode Colors**:
    - Background: `#f6f2ec` (Rink Cream)
    - Card Surfaces: `#ffffff` (Clean Surface)
    - Primary Text: `#182025` (Ink)
    - Muted Text: `#5c6770` (Slate Muted)
    - Card Borders: `#e4dfd5`
  - **Dark Mode Colors**:
    - Background: `#0f1215` (Night Background)
    - Card Surfaces: `#1b2128` (Night Surface)
    - Primary Text: `#f3f5f7` (Night Ink)
    - Muted Text: `#a5b0bb` (Night Muted)
    - Card Borders: `#262e38`
  - **Matchup Accent Colors (Constant)**:
    - Player A (Teal): `#2a7564`
    - Player B (Orange): `#ef6c44`
    - Neutral/Draw: isDark ? `#2f3944` : `#e4dfd5`

### Drawing Pipeline Step-by-Step

#### 1. Font Pre-loading
Wait for the custom web fonts to be completely loaded. This prevents default fallback fonts from drawing on the canvas:
```javascript
await document.fonts.ready;
// Explicitly check key sizes:
await Promise.all([
  document.fonts.load("bold 38px Fraunces"),
  document.fonts.load("bold 16px Manrope"),
  document.fonts.load("22px Manrope"),
  document.fonts.load("bold 64px Fraunces")
]);
```

#### 2. Canvas Background
Fill the entire `(0, 0, 1080, 1080)` rect with the theme background color.

#### 3. Site Watermark Branding (Top Header)
Draw `"TABLE HOCKEY H2H"` in uppercase letter-spaced format centered at `y = 80px`.
- Font: `bold 16px Manrope`, fillStyle: `Puck Orange` (`#ef6c44`).
- Draw `"HEAD TO HEAD"` (or `"PLAYER PROFILE"` in single player mode) at `y = 125px`.
  - Font: `bold 14px Manrope`, fillStyle: `Muted Text`.

#### 4. Player Names and Ranks
- **Player A (Teal)**:
  - Name: Draw at `x = 64px`, `y = 200px`. Font: `bold 38px Fraunces`, fillStyle: Teal.
  - World Ranking Pill: Draw a filled rounded rect at `x = 64px`, `y = 220px`, `w = 90px`, `h = 32px`, `r = 6px`, fillStyle: Teal (10% opacity, e.g. `rgba(42, 117, 100, 0.1)`). Inside the pill, draw `"WR #"` + rank in `bold 14px Manrope` (fillStyle: Teal, center-aligned).
- **Player B (Orange / Opponent)**:
  - If comparison mode is active:
    - Name: Draw at `x = 1016px` (right-aligned). Font: `bold 38px Fraunces`, fillStyle: Orange.
    - World Ranking Pill: Draw a filled rounded rect at `x = 1016px - 90px`, `y = 220px`, `w = 90px`, `h = 32px`, `r = 6px`, fillStyle: Orange (10% opacity). Inside, draw rank in `bold 14px Manrope` (fillStyle: Orange, center-aligned).
  - If single-player mode is active:
    - Draw `"CAREER STATS"` or `"ALL OPPONENTS"` at `x = 1016px` (right-aligned), `y = 200px`. Font: `bold 28px Manrope`, fillStyle: `Muted Text`.

#### 5. W-D-L Scoreboard Bar
- Bar Coordinates: `x = 64px`, `y = 285px`, `w = 952px`, `h = 60px`.
- Draw a rounded bar (radius = 30px) split proportionally into Player A wins, Draws, and Player B wins.
- Draw segment labels inside: e.g., `"341 (40.9%)"`, `"DRAWS 87 (10.4%)"`, `"406 (48.7%)"`.
- *UI Note*: If a segment width is less than 85px, omit the text label to prevent text clipping and overlapping.

#### 6. Stats Grid Card
- Card Container: `x = 64px`, `y = 385px`, `w = 952px`, `h = 240px`, `r = 12px`.
- Fill with `Card Surface` color, stroke with `Card Borders` color (1px border).
- Render three horizontal rows (80px tall each).
- Row Labels & Data:
  - Row 1: `"Total goals scored"` (or `"Goals for / against"` in single mode).
  - Row 2: `"Tight wins (1 goal)"` (or `"Tight games"` in series mode).
  - Row 3: `"Overtime wins"` (or `"Overtime games"` in series mode).
  - *Drawing positions inside each row*:
    - Left value (Teal): `x = 96px`, `y = row_center`, font: `bold 24px Manrope`, left-aligned.
    - Center label (Muted): `x = 540px` (center), `y = row_center`, font: `bold 15px Manrope`, center-aligned.
    - Right value (Orange): `x = 984px`, `y = row_center`, font: `bold 24px Manrope`, right-aligned.
    - Draw a thin divider line between rows.

#### 7. Biggest Win / Highlights Section
Draw two side-by-side card panels:
- **Left Panel (Player A)**: `x = 64px`, `y = 660px`, `w = 460px`, `h = 240px`, `r = 12px`.
- **Right Panel (Player B)**: `x = 556px`, `y = 660px`, `w = 460px`, `h = 240px`, `r = 12px`.
- Fill both panels with `Card Surface` and stroke with `Card Borders`.
- Inside each panel draw:
  - Header Label: `"BIGGEST WIN"` (or `"BIGGEST LOSS"` for single-player card B), font: `bold 14px Manrope`, color: Teal (left card) / Orange (right card).
  - Huge Score Text: e.g., `"6-0"` or `"10-0"`, `y = 770px`, font: `bold 64px Fraunces`.
  - Match details (Opponent Name & Date): `y = 820px`, font: `15px Manrope`, color: `Muted Text`.
  - Tournament details: `y = 855px`, font: `14px Manrope`, color: `Muted Text`.

#### 8. Footer Section
- Draw a thin separator line at `y = 950px`.
- Draw generated credit text: `"Generated on table-hockey-h2h.pages.dev"` at `x = 64px`, `y = 995px`. Font: `15px Manrope`, color: `Muted Text`.
- Draw brand signature: `"Table Hockey H2H"` at `x = 1016px` (right-aligned), `y = 995px`. Font: `bold 16px Manrope`, color: Orange.

---

### Sharing and Download Flow

1. **Format conversion**: Call `canvas.toBlob(callback, "image/png")` to export the high-resolution PNG image.
2. **Web Share API**: Check if `navigator.share` is available and supports files:
   ```javascript
   const file = new File([blob], "matchup-stats.png", { type: "image/png" });
   if (navigator.canShare && navigator.canShare({ files: [file] })) {
     await navigator.share({
       files: [file],
       title: "Table Hockey H2H Matchup",
       text: `Check out these matchup stats!`
     });
   }
   ```
3. **Fallback Download**: If the Web Share API fails or is not supported (e.g. desktop browsers), trigger a file download programmatically using a dynamic link anchor:
   ```javascript
   const url = URL.createObjectURL(blob);
   const a = document.createElement("a");
   a.href = url;
   a.download = `${sanitizeName(playerA.name)}_vs_${sanitizeName(playerB.name)}_matchup.png`;
   a.click();
   ```

---

## Verification

1. Run the local development server: `python -m http.server --directory public 8000`.
2. Load the application in a desktop browser and select a matchup. Verify the "Share image" button is visible and active.
3. Click "Share image" on desktop. Verify that:
   - A file download is triggered with a sanitized name (e.g. `Andreas_Fjermestad_vs_Amund_Risa_Fylling_matchup.png`).
   - The downloaded image is sharp, has a 1:1 aspect ratio, and uses the correct color theme and fonts.
   - All stats, W-D-L ratios, and biggest win details match the values currently shown on screen.
4. Toggle Dark Mode and trigger the share action again. Verify the exported image background, cards, text, and borders update to the dark theme styling.
5. Open the app on a mobile device or inspect using Chrome DevTools device simulation.
6. Click "Share image" on mobile. Verify the native share sheet is presented (allowing direct share to chat apps or image saving) instead of launching a raw file download.
7. Test with a single player compared. Confirm the generated image adjusts layout to single-player profile career mode.
8. Test in playoff series mode. Confirm the labels change to reflect playoff series outcomes.
