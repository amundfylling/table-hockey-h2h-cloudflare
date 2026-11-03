import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderPage, vendorCss } from "../scripts/render-math.mjs";

const page = readFileSync(new URL("../public/ratings.html", import.meta.url), "utf8");

test("ratings page formulas are typeset from their TeX source", () => {
  assert.equal(renderPage(page), page, "run node scripts/render-math.mjs");
  const formulas = page.match(/data-tex="/g) || [];
  const rendered = page.match(/<!--math--><span class="katex/g) || [];
  assert.ok(formulas.length >= 7);
  assert.equal(rendered.length, formulas.length);
  // MathML copy for screen readers next to the visual HTML.
  assert.equal((page.match(/<math xmlns=/g) || []).length, formulas.length);
});

test("vendored KaTeX stylesheet is current and loads only local woff2 fonts", () => {
  const css = readFileSync(new URL("../public/katex/katex.min.css", import.meta.url), "utf8");
  assert.equal(css, vendorCss(), "run node scripts/render-math.mjs");
  for (const [, font] of css.matchAll(/url\(([^)]+)\)/g)) {
    assert.match(font, /^\.\.\/fonts\/katex\/KaTeX_[\w-]+\.woff2$/);
    readFileSync(new URL(`../public/katex/${font}`, import.meta.url));
  }
});
