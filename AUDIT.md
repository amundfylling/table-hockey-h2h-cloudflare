# Table Hockey H2H deep audit

Date: 2026-07-31

## Outcome

The audit covered the browser application, accessibility and responsive behavior, URL and storage
state, generated-data correctness, source reconciliation, the Cloudflare Pages Function, CI, and
deployment configuration. The highest-risk defects were fixed in the working tree and the generated
dataset was rebuilt from the cached sources.

Current rebuilt output:

- 3,308 eligible players
- 985,492 retained matches
- 3,308 full player H2H files and 3,308 compact share-metadata files
- Player 9763: full H2H JSON is about 1.9 MB; compact share JSON is about 64 KB

## Fixed findings

### Frontend correctness and reliability

- Stale async comparisons could overwrite a cleared or changed selection. Comparisons now use both
  commit tokens and cancellable fetch signals.
- Alias-equivalent profiles could be compared against themselves. Identity overlap is rejected in
  live input, URLs, stored selections, and recent chips.
- Selecting an individual alias entry loaded the whole alias group. Explicit singleton selections
  are now scoped; the grouped option explicitly carries all IDs.
- Invalid Player 2 text was interpreted as single-player mode. Nonempty unresolved input is rejected.
- A guaranteed legacy pair-file 404 delayed every normal matchup. The client now loads the emitted
  player-centric file directly.
- Pagination controls and page counts were stale or permanently disabled. Top and bottom controls,
  boundary state, focus, and page-only rendering are synchronized.
- Clearing or changing input during loading could leave old results visible. Result publication is
  atomic and old views are hidden while the requested view loads.
- A no-match request left the URL describing the old matchup. Requested empty matchups now keep the
  correct shareable URL and show a deliberate empty state.
- Player 2 silently fell back to the global player index when opponent loading failed. The control
  now remains unavailable and reports the failure.
- Typeahead Enter handling could trigger twice; empty suggestion panels could not be closed with
  Escape; one-character Player 1 searches ignored the query. All three paths were corrected.
- Manual Player 1 submission did not initialize opponents. It now follows the same flow as a
  suggestion selection.
- Restored inverted year ranges produced impossible filters. Bounds are normalized.
- Series grouping could merge recurring ID-less tournaments, or later split multi-day events. Stable
  IDs are preferred, with a tournament/year fallback.
- "One-goal" and overtime filters had misleading series semantics. Series labels now say that the
  series *contains* a matching game, and filtering inspects its games.
- External data links now accept only HTTP(S) URLs; unsafe schemes are discarded.
- Share-image creation snapshots one view, has a font timeout, preserves Unicode filenames, uses
  accessible small-text colors, reports view changes, and prevents duplicate operations.
- Copy-link feedback no longer races on double activation.
- Full H2H downloads are bounded by timeout, share in-flight requests, use bounded caches, and abort
  when the user changes or clears the active comparison.

### UI, mobile UX, and accessibility

- Empty placeholder-heavy result panels are hidden until data exists.
- Mobile comparison scrolls to a semantic, focusable result heading.
- Mobile match sorting has an explicit field and direction control.
- Mobile table cards retain real column headers in the accessibility tree.
- Desktop table sorting restores focus after rebuilding headers.
- Opponent rows and sort headers are keyboard-operable; range sliders have visible focus.
- Stage controls now use pressed-button group semantics instead of unassociated tabs.
- Combobox active-descendant state is cleared correctly; Escape and popover focus paths were fixed.
- Result charts have SVG titles/descriptions, keyboard exploration, escaped tooltip content, and
  touch-friendly anchored tooltips that avoid covering the inspected region.
- Recent-form chips are focusable and expose their complete result details visibly and via a live
  region.
- Small orange text uses an AA-oriented darker token; chart/fill orange remains visually distinct.
- Touch targets, focus indicators, forced-colors behavior, system theme following, theme labels, and
  tooltip viewport clamping were improved.
- Extremely small mobile scoreboard labels were raised to readable sizes.
- Loading announcements are no longer hidden by an `aria-busy` ancestor, and busy copy/share controls
  stay visible instead of causing layout shifts.

### Data pipeline and validation

- Fractional, nonpositive, missing, and self-referential IDs and invalid scores are rejected instead
  of truncated or fabricated.
- Walkovers are excluded, including numeric `1.0`; unknown overtime values are false instead of
  truthy, and explicit labels such as "no overtime" are parsed correctly.
- Punctuation-only player names receive deterministic `Player <id>` fallbacks.
- Missing supplemental IDs are recovered only from a unique exact normalized player name. This
  recovered 4,322 ID cells; ambiguous names remain excluded.
- Match-only eligible IDs receive generated player records rather than disappearing from the index.
- Cross-source dedupe now requires a one-to-one tournament mapping based on normalized event names or
  at least three repeated signatures, preserves unmatched multiplicity, and transfers richer
  metadata.
- Undated rows no longer displace genuinely recent results in `last_10` form.
- Every JSON file is written atomically, and the complete data tree is built in staging and swapped
  only after success. An interrupted build keeps the previous complete dataset.
- Cache validators are keyed by source URL, preventing a changed override URL from reusing unrelated
  ETag state.
- `SKIP_DOWNLOADS`, supplemental-source disabling, required rankings, ranking freshness/row minimums,
  required tournament metadata, and source rejection budgets are explicit and tested/documented.
- `meta.json` now records source file hashes, byte sizes, accepted/rejected counts, recovery counts,
  and cross-source dedupe counts.

Current source validation:

| Source | Input | Accepted | Rejected | Rate |
| --- | ---: | ---: | ---: | ---: |
| Primary | 1,002,104 | 1,000,471 | 1,633 | 0.163% |
| Supplemental | 140,716 | 97,741 | 42,975 | 30.540% |

### Cloudflare, security, and CI

- The share route is anchored, length-bounded, GET/HEAD-only, rejects same/missing players and fake
  opponents, escapes names/metadata, emits absolute OG URLs, and applies CSP/noindex/security headers.
- The share Function reads compact summary files rather than parsing full multi-megabyte H2H data.
- Static responses now include CSP, referrer, permissions, MIME-sniffing, framing, and cache headers.
- CI now runs for pull requests, has per-ref concurrency cancellation and a timeout, checks every JS
  file, runs real Python test discovery, and runs executable frontend/Function tests.
- The archived `cloudflare/pages-action` deployment path was replaced with the current
  [`cloudflare/wrangler-action@v4`](https://github.com/cloudflare/wrangler-action) and
  [`wrangler pages deploy`](https://developers.cloudflare.com/workers/wrangler/commands/pages/).

## Known residual risks

1. **Supplemental identity coverage:** 42,975 rows still lack enough trustworthy identity data. The
   build now exposes and budgets this loss, but automatically inventing IDs would risk merging
   different people. The durable fix belongs in the supplemental scraper/player crosswalk.
2. **Independent data oracle:** count validation reconstructs expected output with production readers.
   Rejection budgets and fixtures catch major regressions, but an independently maintained golden
   sample would provide stronger protection.
3. **Conservative dedupe:** rows without usable tournament identity may retain some cross-source
   duplicates. Conflicting nonempty `(source, source_match_id)` values are not yet audited globally.
4. **Scale:** generated public output is about 1.2 GB, and the builder holds player payloads in memory
   before writing. Streaming or sharding will eventually be needed as the dataset grows.
5. **Reproducibility:** source hashes are recorded, but upstream branch URLs and broad dependency
   ranges remain mutable. Pinning source commits and a lockfile would make historical rebuilds exact.
6. **End-to-end regression automation:** logic/Function tests are present and core journeys were
   exercised in a real browser, but a committed Playwright suite for race, responsive, keyboard, and
   share flows would improve future coverage.
7. **Least privilege:** the single CI job declares deployment write permission even though its deploy
   step is skipped for pull requests. Separating deploy cleanly would require transferring the roughly
   1.2 GB build artifact or rebuilding it in a second job.
8. **Source transport:** custom source overrides still permit plain HTTP. Production defaults use
   HTTPS; an explicit opt-in for insecure local sources would tighten this further.

## Verification

- Cached-source production rebuild completed with ranking, metadata, and rejection thresholds enabled.
- 25 Python tests pass after adding validation and atomic-publication coverage.
- 13 Node tests pass for alias/filter/series/encoding/cancellation, streak integrity and motion
  accessibility, and Pages Function behavior.
- All frontend and Function JavaScript passes `node --check`.
- Python compilation, workflow YAML parsing, Wrangler TOML parsing, HTML parsing, CSS brace balance,
  and `git diff --check` pass.
