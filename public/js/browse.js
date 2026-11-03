// Shared parts of the browse pages (leaderboard, tournaments): rows from the build's compact
// "fields + rows" JSON, filters kept in the URL so a filtered list can be shared, and a list
// that grows a page at a time.
import { el } from "./dom.js";
import { normalizeText } from "./utils.js";

export const PAGE_SIZE = 100;

// [{field: value}] from {fields: [...], [key]: [[...], ...]}.
export function rowsFromTable(data, key) {
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const rows = Array.isArray(data?.[key]) ? data[key] : [];
  return rows.map((row) => Object.fromEntries(fields.map((field, index) => [field, row[index]])));
}

export function readParams() {
  return new URLSearchParams(window.location.search);
}

// Replaces the query string with the given values, leaving out empty ones and defaults.
export function writeParams(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value != null && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
}

// Every word of the query appears somewhere in the text (accents and case ignored).
export function matchesQuery(text, query) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalizeText(text);
  return words.every((word) => haystack.includes(word));
}

// Fills a <select> with options after its first ("All …") option.
export function fillSelect(select, options, selected) {
  const first = select.options[0];
  select.replaceChildren(first, ...options.map(({ value, label }) =>
    el("option", { value }, label)));
  select.value = options.some((option) => option.value === selected) ? selected : "";
}
