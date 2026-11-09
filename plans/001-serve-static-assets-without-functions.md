# Plan 001: Static assets are served without invoking Pages Functions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d367849..HEAD -- functions/ public/_headers wrangler.toml tests-js/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `d367849`, 2026-11-09

## Why this matters

The site is deployed to Cloudflare Pages with a `functions/` directory that has a root
`functions/_middleware.js`. There is no `public/_routes.json`, so Cloudflare generates one that
routes **every** request through the Function, including every JavaScript module, the stylesheet,
fonts, images and every `data/*.json` file. Cloudflare's docs state: "once you add Functions on a
Pages project, all requests by default will invoke your Function", and "requests to static assets
are free and unlimited" only when they do not invoke a Function. One page view loads roughly 40 ES
modules plus CSS, fonts and several JSON files, so each view costs about 50 Function invocations
against the account's daily request allowance (100,000 per day on the free plan), and every asset
pays Worker start-up latency. The middleware only needs to see HTML page requests. Adding a
`_routes.json` that excludes the static asset paths removes this cost without changing behavior
for pages.

## Current state

- `functions/_middleware.js` — runs on every request. It does two things: (1) 301-redirects the
  legacy host `table-hockey-h2h.pages.dev` to `h2h.puck.no`, and (2) rewrites old player ids in
  the `p1`, `p2`, `p1g`, `p2g` query parameters and in `/h2h/{a}/{b}` paths. Neither applies to
  static asset files.

  ```js
  // functions/_middleware.js (end of file)
  export async function onRequest(context) {
    const url = new URL(context.request.url);
    const updated = withCurrentPlayerIds(url);
    if (url.hostname !== LEGACY_HOST && !updated) {
      return context.next();
    }
    ...
  ```

- `functions/index.js` — fills in the page head for `/?p1=…&p2=…`. Must keep running on `/`.
- `functions/tournament.js` — same for `/tournament?id=…`. Must keep running on `/tournament`.
- `functions/h2h/[[path]].js` — legacy share links under `/h2h/…`. Must keep running.
- `wrangler.toml` — `pages_build_output_dir = "public"`, so `_routes.json` belongs in `public/`.
- `public/_routes.json` — does not exist (confirm with `ls public/_routes.json`).
- Static files and folders directly under `public/` that never need a Function:
  `data/` (generated at build time, not in git), `js/`, `fonts/`, `katex/`, `guide/` (screenshots
  for the guide page), `styles.css`, `aliases.json`, `manifest.webmanifest`, `robots.txt`,
  `sitemap.xml` (generated), `favicon.png`, `apple-touch-icon.png`, `icon-512.png`,
  `nbhf-logo.png`, `og-default.png`.
- HTML pages (`/`, `/leaderboard`, `/tournaments`, `/tournament`, `/ratings`, `/changelog`,
  `/guide`) must stay routed through Functions so the legacy-host redirect keeps working.

`_routes.json` rules from Cloudflare's docs: a JSON object with `version` (1), `include` and
`exclude` arrays; "exclude always take priority over include"; at least one include rule; no more
than 100 rules combined; each rule at most 100 characters; wildcards (`*`) are accepted.

Tests in this repo are plain `node:test` files in `tests-js/`. Exemplar for style:
`tests-js/redirect-middleware.test.mjs` (imports `node:assert/strict` and `node:test`, one
`test("sentence describing behavior", …)` per case).

## Commands you will need

| Purpose  | Command                                             | Expected on success |
|----------|-----------------------------------------------------|---------------------|
| JS tests | `node --test tests-js/routes.test.mjs`              | all pass            |
| JS tests | `node --test tests-js/redirect-middleware.test.mjs` | all pass            |
| Syntax   | `node -e "JSON.parse(require('fs').readFileSync('public/_routes.json','utf8'))"` | exit 0 |

Note: `node --test tests-js/*.test.mjs` as a whole needs `npm ci` first (one test imports
`katex`). Without `node_modules`, `tests-js/ratings-math.test.mjs` fails; that failure is
unrelated to this plan.

## Scope

**In scope** (the only files you should modify):
- `public/_routes.json` (create)
- `tests-js/routes.test.mjs` (create)

**Out of scope** (do NOT touch, even though they look related):
- `functions/**` — no Function code changes are needed.
- `public/_headers` — response headers are independent of routing and still apply to assets.
- `wrangler.toml`, `.github/workflows/build.yml`.

## Git workflow

- Branch: `advisor/001-routes-json`
- One commit. Message style in this repo is a plain imperative sentence, for example
  `Redirect old bordshockey.net player ids to their new ids`. Suggested:
  `Serve static assets without invoking Pages Functions`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `public/_routes.json`

Create the file with exactly this content:

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": [
    "/data/*",
    "/js/*",
    "/fonts/*",
    "/katex/*",
    "/guide/*",
    "/styles.css",
    "/aliases.json",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/favicon.png",
    "/apple-touch-icon.png",
    "/icon-512.png",
    "/nbhf-logo.png",
    "/og-default.png"
  ]
}
```

Do not add `/h2h/*`, `/tournament`, `/` or any HTML page to `exclude`.

**Verify**: `node -e "const r=JSON.parse(require('fs').readFileSync('public/_routes.json','utf8'));console.log(r.include.length+r.exclude.length)"` → prints `16`.

### Step 2: Add `tests-js/routes.test.mjs`

Write a test file that reads `public/_routes.json` (with `readFileSync` and
`new URL("../public/_routes.json", import.meta.url)`) and asserts:

1. `version === 1`, `include` deep-equals `["/*"]`.
2. Rule limits: `include.length + exclude.length <= 100` and every rule is at most 100 characters
   and starts with `/`.
3. No exclude rule can match a path a Function must handle. Implement a small helper
   `matches(rule, path)` that converts a rule to a RegExp by escaping regex characters and
   replacing `*` with `.*`, anchored with `^…$`. Assert that none of these paths is matched by any
   exclude rule: `/`, `/index.html`, `/tournament`, `/tournaments`, `/leaderboard`, `/ratings`,
   `/changelog`, `/guide`, `/h2h/1/2`, `/h2h/1/2/`.
4. Every one of these asset paths is matched by at least one exclude rule: `/data/players.json`,
   `/data/h2h/1000.json`, `/js/main.js`, `/fonts/schibsted-grotesk-latin.woff2`,
   `/katex/katex.min.css`, `/guide/matchup-light-phone.webp`, `/styles.css`, `/aliases.json`.
5. Every top-level directory in `public/` (use `readdirSync` with `withFileTypes`) is covered by
   an exclude rule `/<dir>/*`. This makes the test fail when someone adds a new asset folder
   without updating the routes file.

**Verify**: `node --test tests-js/routes.test.mjs` → all tests pass, 0 fail.

### Step 3: Confirm nothing else regressed

**Verify**: `node --test tests-js/redirect-middleware.test.mjs tests-js/h2h-function.test.mjs tests-js/page-meta-function.test.mjs tests-js/tournament-function.test.mjs` → all pass.

## Test plan

- New file `tests-js/routes.test.mjs` with the five assertions groups in Step 2.
- Structural pattern: `tests-js/redirect-middleware.test.mjs`.
- CI already runs `node --test tests-js/*.test.mjs`, so the new file is picked up automatically.

## Done criteria

- [ ] `public/_routes.json` exists and parses as JSON
- [ ] `node --test tests-js/routes.test.mjs` exits 0
- [ ] `git status --short` shows only `public/_routes.json`, `tests-js/routes.test.mjs` and
      `plans/README.md`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `public/_routes.json` already exists.
- A new Function file exists under `functions/` that serves a path under one of the excluded
  prefixes (for example a `functions/data/…` file).
- The directory-coverage assertion (Step 2, item 5) fails because `public/` has a directory not
  listed in this plan. Report the directory name; do not guess whether it needs a Function.

## Maintenance notes

- This cannot be verified locally; it takes effect on the next Cloudflare Pages deploy. After the
  deploy, a human should check: `curl -sI https://h2h.puck.no/js/main.js` still returns 200 with
  the `content-security-policy` header (headers come from `public/_headers`, not from a Function),
  `https://table-hockey-h2h.pages.dev/?p1=1000` still redirects to `h2h.puck.no`, and the
  Functions request count in the Cloudflare dashboard drops.
- Trade-off accepted by this plan: asset URLs on the legacy `table-hockey-h2h.pages.dev` host are
  no longer redirected to `h2h.puck.no`; they are served directly. Pages still redirect.
- Any new top-level asset folder under `public/` must be added to `exclude` (the test enforces it).
- Any new Function route must not fall under an excluded prefix.
