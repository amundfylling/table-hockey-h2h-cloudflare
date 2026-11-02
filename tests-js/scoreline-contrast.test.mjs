import assert from "node:assert/strict";
import test from "node:test";

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window = {
  location: { search: "", href: "https://example.test/" },
  matchMedia: () => ({ matches: false, addEventListener: () => {} }),
};

const { cellLabelFill, contrastRatio } = await import("../public/js/charts.js");

// The colour tokens from styles.css, as [r, g, b].
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const THEMES = {
  light: { a: "#1D6A59", b: "#D4532A", d: "#B6BABF", surface: "#FFFFFF", ink2: "#4A525B" },
  dark: { a: "#4DBFA3", b: "#F07A52", d: "#59606A", surface: "#171A1D", ink2: "#A9B0B8" },
};

for (const [name, tokens] of Object.entries(THEMES)) {
  test(`scoreline cell labels reach 4.5:1 in ${name} mode`, () => {
    const colors = Object.fromEntries(Object.entries(tokens).map(([key, hex]) => [key, rgb(hex)]));
    for (const tone of ["a", "b", "d"]) {
      for (let step = 0; step <= 88; step += 1) {
        const opacity = 0.12 + step / 100;
        const alpha = Number(opacity.toFixed(2));
        const cell = colors[tone].map((c, i) => c * alpha + colors.surface[i] * (1 - alpha));
        const fill = cellLabelFill(colors, tone, opacity);
        const text = fill === "var(--ink-2)" ? colors.ink2 : rgb(fill);
        const ratio = contrastRatio(text, cell);
        assert.ok(ratio >= 4.5, `${tone} at ${alpha}: ${fill} is ${ratio.toFixed(2)}:1`);
      }
    }
  });
}

test("scoreline labels keep the default colours when the theme can't be read", () => {
  assert.equal(cellLabelFill(null, "a", 0.2), "var(--ink-2)");
  assert.equal(cellLabelFill(null, "a", 0.9), "#FFFFFF");
});
