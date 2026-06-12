# Top 10 Improvement Suggestions

Prioritized improvements for the Table Hockey H2H application under the current
zero-runtime static architecture. Each entry includes a detailed prompt you can hand
directly to a coding agent.

---

## 1. Split `app.js` into ES Modules

**Priority:** Critical — The single 4 300-line `app.js` monolith is the largest
maintenance and collaboration bottleneck in the entire project.

**Impact:** Developer velocity, testability, code review quality, future feature
isolation.

### Agent Prompt

> **Goal:** Refactor `public/app.js` (≈ 4 300 lines) into separate ES module files
> under `public/js/` without changing any runtime behavior.
>
> **Rules:**
> - This is a vanilla JS static site with no bundler — use native `<script type="module">`
>   and `import`/`export` statements.
> - The entry point should remain `public/app.js` (or rename to `public/js/main.js` and
>   update `index.html`).
> - Do **not** change any behavior, DOM output, or data flow. The UI must remain
>   pixel-identical.
> - Follow the existing code style: ES6, no TypeScript, PEP 8-equivalent formatting,
>   lines ≈ 100 chars.
>
> **Suggested module boundaries (at minimum):**
>
> | Module file              | Contents                                                       |
> |--------------------------|----------------------------------------------------------------|
> | `js/state.js`            | `state`, `STORAGE_KEYS`, `elements` lookup, storage helpers    |
> | `js/constants.js`        | Column definitions, SVG strings, `URL_PARAM_KEYS`, flag map    |
> | `js/utils.js`            | `normalizeText`, `decodeHtmlEntities`, `escapeHtml`, `toNumber`, `debounce`, `formatDate`, `formatDateRange` |
> | `js/players.js`          | `normalizePlayerRecord`, player lookup, alias helpers, ranking formatting |
> | `js/data.js`             | `fetchJson`, `fetchPairPayload`, `fetchPlayerPayload`, `loadMatchup`, `loadPlayerStats`, `buildGroupMatches`, match normalization |
> | `js/filters.js`          | `initFilters`, filter application, URL state serialization, active-filter chip rendering |
> | `js/typeahead.js`        | `setupTypeahead`, `buildSuggestions`, `buildOpponentSuggestions`, suggestion identity DOM |
> | `js/summary.js`          | `computeSummary`, `renderSummary`, scoreboard rendering, highlight columns |
> | `js/series.js`           | `buildPlayoffSeries`, `createSeriesFromMatches`, series rendering |
> | `js/charts.js`           | `renderCharts`, win-rate chart, goals chart, tooltip helpers   |
> | `js/table.js`            | `renderTable`, table header rendering, sorting, pagination, detail rows |
> | `js/form.js`             | `renderForm`, streak chip logic, generational-run animation    |
> | `js/theme.js`            | `setTheme`, `toggleTheme`, info-popover initialization         |
> | `js/main.js`             | `init()` orchestration, event binding for compare/swap/copy/recent |
>
> **Verification:**
> 1. Run `python -m http.server --directory public 8000` and verify the app loads
>    identically in a browser.
> 2. Confirm all existing functionality works: player search, compare, swap, copy link,
>    recent matchups, filters, pagination, charts, dark mode, and generational run
>    animation.
> 3. Ensure the browser console has zero new errors or warnings.
> 4. Confirm no circular import issues.

---

## 2. Add a Service Worker for Offline / Cache-First Performance

**Priority:** High — Users are mobile-first tournament attendees often on flaky
venue Wi-Fi. The static JSON architecture is perfectly suited for a service worker
cache strategy.

**Impact:** Perceived load time (repeat visits), offline capability, reduced
Cloudflare bandwidth.

### Agent Prompt

> **Goal:** Add a service worker (`public/sw.js`) that caches the app shell and
> static data JSON files for offline use and instant repeat loads.
>
> **Requirements:**
> - Register the service worker from `app.js` (or `main.js` after the module split).
> - Use a **cache-first** strategy for `styles.css`, `app.js`, `favicon.svg`,
>   font files, and any loaded `data/*.json` files.
> - Use a **network-first** strategy for `data/players.json` so it stays fresh on
>   weekly rebuilds, falling back to cache when offline.
> - Use a **stale-while-revalidate** strategy for Google Fonts CSS and font files.
> - Set a cache version string (e.g., `h2h-v1`) that can be bumped in CI.
> - On activation, delete old caches whose names do not match the current version.
> - Precache the app shell (`index.html`, `styles.css`, `app.js`, `favicon.svg`,
>   `data/players.json`).
> - Do **not** precache all `data/h2h/*.json` files — there are thousands. Cache them
>   on first fetch only.
>
> **Verification:**
> 1. Load the app with DevTools → Application → Service Workers and confirm
>    registration.
> 2. Go offline (DevTools → Network → Offline) and reload. The app shell and the last
>    viewed matchup should still work.
> 3. Confirm that after a new deployment (bumped version), old caches are cleaned up.
> 4. Ensure no regressions in online behavior.

---

## 3. Add Keyboard Navigation and ARIA Live Regions for Accessibility

**Priority:** High — The PRODUCT.md explicitly calls out keyboard-friendly controls,
focus states, and strong contrast. The current typeahead has basic arrow-key support
but lacks screen-reader announcements, ARIA live regions for dynamic content, and
skip-navigation links.

**Impact:** WCAG 2.1 AA compliance, usability for keyboard-only and screen-reader
users.

### Agent Prompt

> **Goal:** Improve the accessibility of the Table Hockey H2H application to meet
> WCAG 2.1 AA standards without changing the visual design.
>
> **Changes to make:**
>
> 1. **Skip navigation link:** Add a visually hidden "Skip to main content" link as
>    the first focusable element in `<body>`, targeting `<main class="container">`.
>
> 2. **Typeahead ARIA live region:** When the typeahead suggestion list updates, announce
>    the result count via an `aria-live="polite"` region (e.g., "5 suggestions available").
>    When a suggestion is highlighted with arrow keys, set `aria-activedescendant` on
>    the input to point to the highlighted button's `id`.
>
> 3. **Dynamic content announcements:** Add `aria-live="polite"` to `#summary-grid`
>    and `#match-count` so screen readers announce updated stats after a comparison.
>
> 4. **Focus management after compare:** After a successful comparison loads, move
>    focus to the headline (`#headline`) so keyboard users land on the result instead
>    of staying on the compare button.
>
> 5. **Table sort headers:** Ensure sort buttons in `#matches-head-row` have
>    `aria-sort="ascending"`, `"descending"`, or `"none"` reflecting current state.
>
> 6. **Chart accessibility:** Add `role="img"` and `aria-label` with a text summary
>    to `#record-chart` and `#goals-chart` (e.g., "Running win rate chart showing
>    Player A at 58% after 42 games").
>
> 7. **Color contrast audit:** Review all text/background combinations (especially
>    `--muted` text on `--bg-alt` surfaces and chart tooltip text) and adjust any
>    that fall below a 4.5:1 contrast ratio. Document any adjustments in a comment.
>
> **Rules:**
> - Do not change the visual appearance for sighted users.
> - Follow existing code style and conventions from `AGENTS.md`.
> - Preserve all existing `prefers-reduced-motion` behavior.
>
> **Verification:**
> 1. Tab through the entire page and confirm every interactive element is reachable
>    and has a visible focus indicator.
> 2. Use VoiceOver (macOS) or NVDA to navigate the page and confirm announcements
>    for: player suggestions, comparison results, pagination changes.
> 3. Run Lighthouse accessibility audit and confirm a score ≥ 95.

---

## 4. Export Matchup Data as CSV or Image

**Priority:** High — Users regularly share matchup stats in tournament communities.
Currently the only sharing mechanism is "Copy link," but many users want to share
in places where a link preview is insufficient (e.g., posting a screenshot in a chat
group or saving stats to a local file).

**Impact:** User engagement, shareability, practical utility for tournament organizers.

### Agent Prompt

> **Goal:** Add two export options to the matchup view:
> 1. **Export CSV** — downloads the currently filtered match list as a `.csv` file.
> 2. **Export as Image** — captures the summary scoreboard section as a PNG image
>    and triggers a download.
>
> **UI placement:**
> - Add two new ghost buttons next to the existing "Copy link" button in
>   `.selection-actions`:
>   - "Export CSV" (📊 icon)
>   - "Export image" (📷 icon)
> - Both buttons should be disabled when no matchup is loaded.
> - Style them identically to the existing "Copy link" ghost button per DESIGN.md.
>
> **CSV export details:**
> - Use the currently filtered and sorted matches from `state.filteredMatches`.
> - Columns: Date, Player A, Player B, Score (A-B), Overtime (Yes/No), Winner,
>   Tournament, Stage, Round.
> - File name: `{PlayerA}_vs_{PlayerB}_h2h.csv` (sanitized names, spaces replaced
>   with underscores).
> - Generate the CSV in JavaScript using `Blob` and `URL.createObjectURL` — no
>   external libraries.
> - Handle special characters and commas in tournament names by proper CSV quoting.
>
> **Image export details:**
> - Use the native `html2canvas`-free approach: create an off-screen SVG or Canvas
>   that reproduces the scoreboard summary (headline, record, win/loss/draw bar).
> - Alternatively, if complexity is too high, use a minimal inline `<canvas>` drawing
>   that recreates the key stats (player names, W-D-L record, win percentage bar)
>   with the design system colors.
> - The generated image should be 1200×630px (Open Graph standard) for easy sharing.
> - Include the app title "Table Hockey H2H" as a small watermark in the bottom-right.
>
> **Rules:**
> - No external dependencies. Pure vanilla JS.
> - Follow the existing button and icon patterns in `index.html`.
> - Mobile: buttons should wrap gracefully in `.selection-actions`.
>
> **Verification:**
> 1. Load a matchup, apply a filter, click "Export CSV," and open the downloaded file
>    in a spreadsheet. Confirm data matches the filtered table.
> 2. Click "Export image," confirm the downloaded PNG contains the correct player
>    names, record, and bar visualization.
> 3. Test on mobile viewport — buttons should remain usable.

---

## 5. Pre-generate Open Graph / Social Sharing Meta Tags at Build Time

**Priority:** Medium-high — When users share a matchup link on social media or in
messaging apps, the preview is a generic "Table Hockey H2H" title with no player
names or stats. Pre-generating `<meta>` tags at build time would make shared links
significantly more engaging.

**Impact:** Link shareability, click-through rate from social posts, professional
appearance.

### Agent Prompt

> **Goal:** During the build step (`scripts/build_h2h.py`), generate per-matchup
> HTML files (or a single `index.html` with injected meta tags via a lightweight
> template) so that shared URLs show rich Open Graph previews.
>
> **Approach (choose one):**
>
> **Option A — Static redirect pages (simpler):**
> For every pair file `public/data/h2h/{id1}/{id2}.json`, generate a minimal HTML
> file at `public/h2h/{id1}/{id2}/index.html` containing:
> - `<meta property="og:title" content="{Player1} vs {Player2} — Table Hockey H2H">`
> - `<meta property="og:description" content="{W}-{D}-{L} record over {N} games">`
> - `<meta property="og:image" content="/og-default.png">`
> - A `<meta http-equiv="refresh" content="0; url=/?p1={id1}&p2={id2}">` redirect
>   to the main app with query params.
> - A `<link rel="canonical" href="...">` pointing to the query-param URL.
>
> **Option B — Cloudflare Workers edge rendering (more advanced):**
> Skip this option for now — it adds runtime complexity.
>
> **Build script changes (`scripts/build_h2h.py`):**
> - After generating pair JSON files, iterate the same pairs and write the redirect
>   HTML files.
> - Use a simple Python string template — no Jinja or external dependency.
> - Only generate for pairs where both player names are known.
> - Create a default OG image `public/og-default.png` (can be a simple branded
>   placeholder — use the existing logo colors).
>
> **URL pattern:**
> - Share URL: `https://yourdomain.com/h2h/{id1}/{id2}/`
> - Canonical: `https://yourdomain.com/?p1={id1}&p2={id2}`
>
> **Rules:**
> - Do not modify any existing `public/data/` output structure.
> - Keep generated HTML minimal (< 1 KB per file).
> - The main `public/index.html` should remain unchanged.
> - Follow Python PEP 8 style and the conventions in `AGENTS.md`.
>
> **Verification:**
> 1. Run `python3 scripts/build_h2h.py` and confirm the new HTML files appear under
>    `public/h2h/`.
> 2. Open one in a browser and confirm it redirects to the main app with correct
>    query params.
> 3. Use the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
>    or `curl -A facebookexternalhit` to confirm OG tags are served.
> 4. Run `python -m unittest -v` and confirm all existing tests still pass.

---

## 6. Add Frontend Error Tracking and Lightweight Analytics

**Priority:** Medium — There is currently zero visibility into frontend errors or
usage patterns. Users may silently encounter broken matchups, fetch failures, or
rendering bugs without any signal reaching the developer.

**Impact:** Bug detection speed, understanding of real user behavior, data-driven
prioritization.

### Agent Prompt

> **Goal:** Add lightweight, privacy-respecting frontend error tracking and basic
> analytics to the Table Hockey H2H application.
>
> **Error tracking:**
> - Add a global `window.onerror` and `window.onunhandledrejection` handler in
>   `app.js`.
> - On error, send a beacon (`navigator.sendBeacon`) to a configurable endpoint with:
>   - Error message and stack trace (truncated to 1 000 chars)
>   - Page URL (without PII)
>   - User agent
>   - Timestamp
> - Store the endpoint URL in a constant at the top of the file, defaulting to an
>   empty string (disabled).
> - If the endpoint is empty, log to `console.error` only (current behavior).
> - Rate-limit beacons to max 5 per page load to avoid flooding.
>
> **Basic analytics (optional, minimal):**
> - Track three events via `sendBeacon`:
>   1. `pageview` — on `init()` completion
>   2. `compare` — on successful `handleCompare()` completion (with player IDs but
>      no names)
>   3. `export` — on CSV or image export (if implemented)
> - Include no PII. Only send: event name, player IDs, timestamp, screen width.
> - Gate analytics behind a constant `ANALYTICS_ENABLED = false` so it ships
>   disabled by default.
>
> **Rules:**
> - No external libraries or third-party scripts (no Google Analytics, no Sentry SDK).
> - Must work in all modern browsers (Chrome, Firefox, Safari, Edge).
> - Follow existing code style and conventions.
> - Do not add any cookies or localStorage for tracking purposes.
>
> **Verification:**
> 1. Introduce a deliberate `throw new Error("test")` after init, confirm beacon
>    is sent (check Network tab for `sendBeacon` call).
> 2. Remove the deliberate error, confirm no beacons fire during normal operation
>    (when endpoint is empty, only console logging).
> 3. Confirm zero regressions in app functionality.

---

## 7. Add "Player Profile" View (Single-Player Stats Page)

**Priority:** Medium — The app currently only works well in H2H mode. Users
frequently want to see a single player's overall record, most common opponents,
win rate over time, and tournament history — without selecting a second player.

**Impact:** User value, daily active usage, new entry point for discovery.

### Agent Prompt

> **Goal:** Enhance the single-player profile view that automatically activates when only Player 1 is selected (and Player 2 is empty/cleared).
>
> **Architecture Context:**
> - The application automatically triggers comparisons/profile views upon player selection (`handleCompare()` is called in `onPlayerASelected` or when Player B is cleared).
> - `isSinglePlayerMode()` (checks `state.comparisonMode === "single"`) already governs UI branching.
> - Data for Player 1 is loaded via `loadPlayerStats(idA)` in `public/js/data.js`, which returns `{ playerA, playerB: { id: null, name: "Opponents" }, matches }`.
>
> **Requirements & Features:**
>
> 1. **Enhanced Player Header:**
>    - Render player profile details (Name, country/flag, world ranking, city) using data from the player record.
>    - Place this cleanly in the `headline` and `subhead` sections or at the top of the summary card.
>
> 2. **Career Summary Stats Card (`public/js/summary.js`):**
>    - In `renderSummary()`, when `isSinglePlayerMode()` is true, display:
>      - Overall W-D-L record (with win percentage)
>      - Goals scored / conceded (with goal difference)
>      - Overtime game count and OT win rate
>      - Career date range (First game date – Last game date)
>
> 3. **Top 10 Opponents Panel:**
>    - Create a new UI card/section (e.g., dynamically inserted or via a toggleable container in `index.html`) displaying a table of the top 10 opponents.
>    - Sort opponents by the total number of games played against them.
>    - Columns: Opponent, Games, Record (W-D-L), Win %, Goal Diff.
>    - **Interactivity:** Make each row clickable. Clicking an opponent must update the Player B input with their name/ID, trigger the normal selection flow, and automatically run `handleCompare()` to load the full H2H comparison with that opponent.
>
> 4. **Tournament Breakdown Panel:**
>    - Display a collapsible or scrollable list of unique tournaments played, showing the game count and W-D-L record per tournament.
>
> 5. **Win Rate Chart Integration (`public/js/charts.js`):**
>    - Adapt the running win rate chart in `renderCharts` so that it handles all opponents combined in single-player mode.
>
> **UI and Integration Rules:**
> - Avoid introducing raw gray colors or complex layouts; conform to `DESIGN.md` guidelines (e.g., use translucent `.card` styles, Manrope for data tables, and Fraunces for display headings).
> - Responsive layout: Ensure the new panels (Top 10 Opponents, Tournament Breakdown) stack neatly on mobile screens and align alongside other widgets on desktop.
> - Ensure all existing filters (year, tournament level, stage, OT, tight) still work and correctly filter the career matches, updating the summary card, win-rate chart, and opponents table dynamically.
>
> **Verification Steps:**
> 1. Select a player for Player 1, and ensure Player 2 is empty. Verify that the career stats, win-rate chart, and top opponents list load automatically.
> 2. Verify that clicking an opponent from the Top 10 list loads the H2H comparison view for both players, updating inputs and url parameters.
> 3. Apply a year filter and confirm stats, charts, and table rows react and update.
> 4. Check the layout on mobile viewport sizes to ensure no horizontal scrolling or overlapping text.
> 5. Confirm that two-player H2H comparison remains fully functional with zero regressions.

---

## 8. Improve Build Script Resilience and Reporting

**Priority:** Medium — The build pipeline (`scripts/build_h2h.py`) downloads from
multiple external URLs. A transient network failure, corrupted Parquet file, or
schema change in an upstream source will silently produce bad data or crash with an
unhelpful traceback.

**Impact:** CI/CD reliability, faster debugging of weekly automated builds, data
quality confidence.

### Agent Prompt

> **Goal:** Improve the resilience, error handling, and reporting of
> `scripts/build_h2h.py` without changing any output data format.
>
> **Changes to make:**
>
> 1. **Retry logic for downloads:** Wrap every `dl.download()` call in a retry loop
>    (3 attempts, exponential backoff starting at 2 seconds). Log each retry attempt
>    with the URL and attempt number.
>
> 2. **Schema validation after download:** After loading each Parquet/CSV file into
>    a DataFrame, validate that expected columns are present. If critical columns are
>    missing, raise a clear `ValueError` with the file name and the missing columns
>    listed — don't let the build silently produce empty data.
>    - Matches Parquet: require `player1_id`, `player2_id`, `goals_player1` (or alias),
>      `date` (or alias).
>    - Players CSV: require `id`, `name`.
>    - Tournament metadata CSV: require `tournament_id`, `level` (or alias).
>
> 3. **Build summary report:** At the end of a successful build, print a summary:
>    - Total source matches loaded
>    - Total matches after deduplication
>    - Total unique players included
>    - Total H2H files written
>    - Total pair files written
>    - Build duration (wall clock)
>    - Any warnings (e.g., players with matches but no name, tournaments with no
>      metadata)
>
> 4. **Structured logging:** Replace all `print()` calls with `logging.info()`,
>    `logging.warning()`, or `logging.error()`. Configure a format that includes
>    timestamp and log level. This allows CI to filter and search logs.
>
> 5. **Exit code on failure:** Ensure any unrecoverable error results in a non-zero
>    exit code so CI detects the failure.
>
> **Rules:**
> - Do not change any output file format or paths.
> - Do not add new pip dependencies — use only `logging`, `time`, `urllib` from stdlib
>   plus the existing `pandas`, `requests`, `pyarrow`.
> - Follow PEP 8 and the conventions in `AGENTS.md`.
>
> **Verification:**
> 1. Run `python3 scripts/build_h2h.py` and confirm the build summary is printed.
> 2. Temporarily break a URL (set an env var to a bad URL), run the build, and confirm
>    it retries 3 times then exits with a clear error and non-zero exit code.
> 3. Run `python -m unittest -v` and confirm all tests still pass.

---

## 9. Add Frontend Unit Tests with a Lightweight Test Runner

**Priority:** Medium-low — The existing test suite is Python-only and validates data
integrity. There are zero tests for the frontend JavaScript logic. Key functions
like `normalizeText`, `buildMatchKey`, `computeSummary`, `buildPlayoffSeries`, and
filter application are pure functions that would benefit greatly from unit tests to
prevent regressions.

**Impact:** Confidence in refactoring (especially after the module split), faster
bug detection, code quality.

### Agent Prompt

> **Goal:** Add a lightweight JavaScript test suite for the core pure functions
> in `app.js` (or the split modules under `public/js/`).
>
> **Test framework:**
> - Use **Node.js built-in test runner** (`node --test`) — available in Node 18+.
> - No external test framework dependencies (no Jest, no Mocha, no Vitest).
> - Test files should live under `tests/js/` with a naming pattern like
>   `test_utils.js`, `test_summary.js`, etc.
>
> **Functions to test (at minimum):**
>
> | Function                    | Test cases                                         |
> |-----------------------------|----------------------------------------------------|
> | `normalizeText`             | ASCII, diacritics, null, empty, numbers             |
> | `decodeHtmlEntities`        | `&#123;`, `&amp;`, `&nbsp;`, null, nested           |
> | `escapeHtml`                | `<script>`, quotes, ampersands, null                |
> | `toNumber`                  | Valid number, NaN, Infinity, null, string            |
> | `normalizeTournamentLevel`  | Integer, float, "nan", null, "N/A", text            |
> | `parseOvertime`             | true, false, "OT", "Overtime", "0", null, ""        |
> | `classifyStage`             | "Playoff", "Quarter-final", "Group A", "Round 2", ""   |
> | `formatDate`                | "2024-03-15", null, "bad-date", ""                  |
> | `computeSummary`            | Empty array, single win, mixed results, OT games    |
> | `buildMatchKey`             | Consistent key for same match data                  |
> | `buildPlayoffSeries`        | Single game, best-of-3, best-of-5 grouping          |
>
> **Setup notes:**
> - Since these functions reference DOM APIs in `app.js`, you'll need to either:
>   (a) extract them into a module that doesn't depend on `document`/`window`, or
>   (b) mock `document` and `window` minimally for the test environment.
> - Option (a) is preferred and aligns with Suggestion #1 (module split).
> - If the module split has already been done, import from `public/js/utils.js`,
>   `public/js/summary.js`, etc.
> - If `app.js` has not been split yet, create a temporary test shim that extracts
>   the pure functions.
>
> **NPM script (optional):**
> - Add a `package.json` at the project root with a single `"test:js"` script:
>   `"node --test tests/js/"`.
> - Do not add any other dependencies.
>
> **CI integration:**
> - Add a step in `.github/workflows/build.yml` that runs
>   `node --test tests/js/` after the Python tests.
>
> **Verification:**
> 1. Run `node --test tests/js/` and confirm all tests pass.
> 2. Introduce a deliberate bug in `normalizeText` and confirm a test fails.
> 3. Confirm the Python test suite still passes: `python -m unittest -v`.

---

## 10. Add Player Comparison Permalink Embeds (iframe / Widget Mode)

**Priority:** Low — A nice-to-have for power users who manage table hockey community
websites or forums. Embeddable widgets would let external sites show live H2H
summaries.

**Impact:** Distribution, community engagement, brand visibility.

### Agent Prompt

> **Goal:** Add a minimal "embed mode" view that renders just the scoreboard summary
> (no header, no footer, no filters) for use in iframes on external sites.
>
> **Implementation:**
>
> 1. **URL parameter:** When `?embed=true` is present alongside `?p1=...&p2=...`,
>    render only the summary scoreboard card (headline, record bar, W-D-L) in a
>    compact layout.
>
> 2. **Embed HTML/CSS changes:**
>    - Add an `embed` class to `<body>` when embed mode is active.
>    - Hide the header, footer, selection card, filter card, charts, match table,
>      and recent matchups using CSS: `body.embed .site-header, body.embed .site-footer, ... { display: none; }`
>    - Reduce padding on `.container` and `.summary-section` so the widget is compact.
>    - Set `body.embed { background: transparent; min-height: auto; }` so it works
>      in transparent iframes.
>    - Target a widget size of approximately 400×200px.
>
> 3. **Embed code generator:**
>    - Add a "Get embed code" button (hidden in embed mode) next to "Copy link."
>    - On click, show a small modal or inline textarea with a pre-filled
>      `<iframe>` snippet: `<iframe src="https://.../?p1=X&p2=Y&embed=true" width="400" height="200" frameborder="0"></iframe>`
>    - The user can copy the snippet.
>
> 4. **Responsive embed:**
>    - The embed view should be responsive within its container.
>    - Use `width: 100%; max-width: 500px;` for the summary card in embed mode.
>
> **Rules:**
> - Do not change normal (non-embed) mode behavior or appearance.
> - Follow existing code style and DESIGN.md conventions.
> - No external dependencies.
>
> **Verification:**
> 1. Open `http://localhost:8000/?p1=1000&p2=2000&embed=true` and confirm only the
>    scoreboard is visible with transparent background.
> 2. Create a test HTML file with an `<iframe>` embedding the embed URL. Confirm it
>    renders cleanly at 400×200px.
> 3. Open the normal app, load a matchup, click "Get embed code," and confirm the
>    generated snippet works.
> 4. Confirm no regressions in normal mode.
