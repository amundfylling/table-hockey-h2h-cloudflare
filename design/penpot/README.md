# Penpot recreation

Scripts that rebuild the live site as a Penpot design file through the
[Penpot MCP server](https://github.com/penpot/penpot/tree/develop/mcp).

1. `extract-screens.mjs <outDir>` renders the site (served on `localhost:8000`
   with built data) in Playwright at desktop and mobile widths, light and dark,
   and dumps every visible box, text run and inline SVG with its computed
   position and style. It also saves full-page reference screenshots.
2. `slim-screens.py <in> <out>` rounds numbers and strips SVG noise, giving
   `screens.json`.
3. `build-in-penpot.js` runs inside Penpot via the MCP `execute_code` tool.
   It registers `storage.h2h`, then:
   - `await storage.h2h.load(url)` fetches `screens.json`
   - `await storage.h2h.buildDesignSystem()` adds library colours,
     typographies, an `h2h` token set and a "Design system" page
   - `await storage.h2h.buildScreen(i)` draws screen `i` on the "Screens"
     page, with one board per page section
4. `preview-build.mjs <builder> <screens.json> <outDir>` runs the builder
   against a small stand-in for the Penpot API and renders the result to PNG,
   to check the output without a Penpot session.

The single-player pages (`?p1=` only) are extracted too. Range inputs are
rebuilt as a track and thumb because their pseudo-elements are not in the DOM.

Long match lists are cut to a dozen rows so the artboards stay readable.
