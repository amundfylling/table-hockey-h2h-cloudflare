// Typesets the formulas on the ratings page with KaTeX, ahead of time, so the page ships plain
// HTML and CSS and runs no maths code in the browser.
//
//   node scripts/render-math.mjs          re-render the formulas and refresh the vendored KaTeX
//   node scripts/render-math.mjs --check  exit non-zero when ratings.html is out of date
//
// Each formula in public/ratings.html is written as
//
//   <span class="math" data-tex="TeX source"><!--math-->…<!--/math--></span>
//
// with `data-display` on the element for a formula on its own line. Edit the TeX in data-tex
// (HTML-escaped, so `&` is `&amp;`), then run this script: it replaces everything between the
// two comments with KaTeX's output (HTML for the eye, MathML for screen readers).
//
// The KaTeX stylesheet goes to public/katex/katex.min.css, trimmed to woff2 fonts, and the
// fonts to public/fonts/katex/. A browser only downloads the few fonts a page uses.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const katex = require("katex");

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PAGES = ["ratings.html"];
const KATEX_DIST = join(dirname(require.resolve("katex/package.json")), "dist");
const KATEX_VERSION = require("katex/package.json").version;

const MATH = /(<(span|div)\b([^>]*)\bdata-tex="([^"]*)"([^>]*)>)<!--math-->[\s\S]*?<!--\/math-->/g;

function unescapeHtml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function renderPage(html) {
  return html.replace(MATH, (_, open, _tag, before, tex, after) => {
    const displayMode = /\bdata-display\b/.test(before + after);
    const out = katex.renderToString(unescapeHtml(tex), {
      displayMode,
      output: "htmlAndMathml",
      throwOnError: true,
      strict: "error",
    });
    return `${open}<!--math-->${out}<!--/math-->`;
  });
}

export function vendorCss() {
  let css = readFileSync(join(KATEX_DIST, "katex.min.css"), "utf8");
  css = css.replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, "");
  if (/\.(woff|ttf)\)/.test(css)) throw new Error("KaTeX CSS still lists woff/ttf fonts");
  css = css.replace(/url\(fonts\//g, "url(../fonts/katex/");
  return `/* KaTeX ${KATEX_VERSION} (MIT, https://katex.org), vendored by scripts/render-math.mjs: woff2 only, fonts in /fonts/katex/. */\n${css}`;
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  const write = (path, content) => {
    let current = null;
    try {
      current = readFileSync(path, "utf8");
    } catch {}
    if (current === content) return;
    if (check) stale.push(path);
    else writeFileSync(path, content);
  };

  for (const page of PAGES) {
    const path = join(PUBLIC, page);
    write(path, renderPage(readFileSync(path, "utf8")));
  }
  mkdirSync(join(PUBLIC, "katex"), { recursive: true });
  write(join(PUBLIC, "katex", "katex.min.css"), vendorCss());
  if (!check) {
    const fontsOut = join(PUBLIC, "fonts", "katex");
    mkdirSync(fontsOut, { recursive: true });
    for (const font of readdirSync(join(KATEX_DIST, "fonts"))) {
      if (font.endsWith(".woff2")) copyFileSync(join(KATEX_DIST, "fonts", font), join(fontsOut, font));
    }
  }

  if (stale.length) {
    console.error(`Out of date, run node scripts/render-math.mjs:\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
