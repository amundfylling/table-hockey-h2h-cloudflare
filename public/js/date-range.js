// "3–4 Mar 2018", "28 Feb–2 Mar 2018" or "30 Dec 2018–1 Jan 2019" from ISO dates.
// Shared by the tournament page and its server-rendered head (functions/tournament.js),
// along with where a tournament's data lives.
export function formatDateRange(start, end) {
  const parse = (value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const a = start ? parse(start) : null;
  const b = end ? parse(end) : null;
  if (!a) return "";
  const full = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  if (!b || b.getTime() === a.getTime()) return a.toLocaleDateString("en-GB", full);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
  const first = a.toLocaleDateString("en-GB", sameMonth
    ? { day: "numeric", timeZone: "UTC" }
    : sameYear ? { day: "numeric", month: "short", timeZone: "UTC" } : full);
  return `${first}–${b.toLocaleDateString("en-GB", full)}`;
}

// Tournaments share files by id % 1000 (TOURNAMENT_BUCKETS in scripts/tournaments.py).
export function tournamentDataPath(id) {
  return `data/t/${Number(BigInt(id) % 1000n)}.json`;
}

// A tournament's name with its year added when the name has none, so the many events called
// "SM" or "Swedish Masters" read apart in page titles and the tournament filter.
export function tournamentLabel(name, date) {
  const text = String(name || "");
  const year = /^\d{4}/.exec(String(date || ""))?.[0];
  if (!text || !year || /(?:^|\D)(?:19|20)\d\d(?:\D|$)/.test(text)) return text;
  return `${text} ${year}`;
}
