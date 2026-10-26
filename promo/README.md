# Promo video

A 9:16 promo cut from real recordings of the production site.

- `capture/` records takes against https://table-hockey-h2h.pages.dev with Playwright on a
  virtual display and ffmpeg. `node capture/take-search.js` writes `capture/takes/search/`.
  Needs Xvfb, ffmpeg and Playwright's Chromium.
- `video/` is the Remotion project (from `.claude/skills/saas-product-demo-video`). Copy a take's
  `<name>.mp4` and `take.json` into `video/public/takes/` (as `<name>.mp4` and `<name>.json`),
  then `npm install`, `npm run dev` for Studio, or `npx remotion render Master out/master.mp4`.
- The brief and decisions are in `docs/video/`.
