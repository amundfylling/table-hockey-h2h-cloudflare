// Lint rules that catch bugs, not style: undefined names, unused code, unreachable code and the
// like. Formatting is left to the authors.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["public/katex/**", "public/data/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["public/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.browser } },
  },
  {
    files: ["functions/**/*.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.serviceworker } },
  },
  {
    // Node scripts and tests; Playwright callbacks and DOM stubs use browser names too.
    files: ["**/*.mjs"],
    languageOptions: { sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
    },
  },
];
