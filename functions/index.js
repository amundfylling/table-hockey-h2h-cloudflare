// The home page doubles as every player and matchup view (/?p1=…&p2=…). The app
// renders those in the browser, so this fills in the page head on the server:
// title, description, canonical URL and social preview tags name the player or
// matchup for search engines and link previews. Anything unexpected falls back
// to the static page unchanged.
import { pageTitle } from "../public/js/page-title.js";
import { decodeHtmlEntities } from "../public/js/utils.js";

const ID_RE = /^[1-9]\d{0,9}$/;
const TAGLINE = "Head-to-head record, form and playoff series.";

export async function onRequest(context) {
  const { request, env } = context;
  const response = await context.next();
  if (request.method !== "GET" || !response.ok) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  const url = new URL(request.url);
  const p1 = url.searchParams.get("p1");
  if (!p1 || !ID_RE.test(p1)) return response;
  let p2 = url.searchParams.get("p2");
  if (p2 && (!ID_RE.test(p2) || p2 === p1)) p2 = null;

  // An alias group (p1g/p2g) merges several player files in the browser, so the
  // single-file record here would be wrong: name the view but leave the numbers out.
  const grouped = ["p1g", "p2g"].some((key) => (url.searchParams.get(key) || "").includes(","));

  let meta;
  try {
    meta = await buildMeta(env, url, p1, p2, { withRecord: !grouped });
  } catch (error) {
    console.error("Error building page metadata:", error);
    return response;
  }
  if (!meta) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  const html = injectPreload(injectMeta(await response.text(), meta), [
    "/data/players.json",
    `/data/h2h/${p1}.json`,
  ]);
  return new Response(html, {
    status: response.status,
    headers,
  });
}

export async function buildMeta(env, url, p1, p2, { withRecord = true } = {}) {
  const dataResponse = await env.ASSETS.fetch(new URL(`/data/og/${p1}.json`, url));
  if (!dataResponse.ok) return null;
  const data = await dataResponse.json();
  // Names are decoded the same way the browser does (normalizePlayerRecord).
  const nameA = decodeHtmlEntities(data?.player?.name);
  if (!nameA || String(data.player.id) !== p1) return null;

  const opponent = p2 ? data.opponents?.[p2] : null;
  const nameB = decodeHtmlEntities(opponent?.player?.name);
  if (opponent && nameB) {
    return {
      title: pageTitle({ nameA, nameB }),
      description: withRecord
        ? matchupDescription(nameA, nameB, opponent.summary || {})
        : `${nameA} vs ${nameB}. ${TAGLINE}`,
      url: `${url.origin}/?p1=${p1}&p2=${p2}`,
      image: `${url.origin}/og-default.png`,
    };
  }
  return {
    title: pageTitle({ nameA }),
    description: withRecord
      ? playerDescription(nameA, Object.values(data.opponents || {}))
      : `${nameA}: head-to-head records, form and playoff series.`,
    url: `${url.origin}/?p1=${p1}`,
    image: `${url.origin}/og-default.png`,
  };
}

function formatCount(value) {
  return String(Math.trunc(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function plural(value, word, pluralWord = `${word}s`) {
  return `${formatCount(value)} ${value === 1 ? word : pluralWord}`;
}

export function matchupDescription(nameA, nameB, summary) {
  const wins = summary.wins_player ?? 0;
  const losses = summary.wins_opponent ?? 0;
  const draws = summary.draws ?? 0;
  const games = summary.total_matches ?? wins + losses + draws;
  const score = (a, b) => `${formatCount(a)}–${formatCount(b)}`;
  const lead = wins > losses
    ? `${nameA} leads ${nameB} ${score(wins, losses)}`
    : losses > wins
      ? `${nameB} leads ${nameA} ${score(losses, wins)}`
      : `${nameA} and ${nameB} are level at ${score(wins, losses)}`;
  const drawText = draws ? `, with ${plural(draws, "draw")},` : "";
  return `${lead}${drawText} over ${plural(games, "game")}. ${TAGLINE}`;
}

export function playerDescription(name, opponents) {
  const totals = { wins: 0, draws: 0, losses: 0, games: 0 };
  for (const { summary = {} } of opponents) {
    totals.wins += summary.wins_player ?? 0;
    totals.draws += summary.draws ?? 0;
    totals.losses += summary.wins_opponent ?? 0;
    totals.games += summary.total_matches ?? 0;
  }
  if (!totals.games) return `${name}: head-to-head records, form and playoff series.`;
  return `${name}: ${plural(totals.wins, "win")}, ${plural(totals.draws, "draw")} and `
    + `${plural(totals.losses, "loss", "losses")} in ${plural(totals.games, "game")} `
    + `against ${plural(opponents.length, "opponent")}. Head-to-head records, form and playoff series.`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setTag(html, pattern, replacement) {
  return html.replace(pattern, () => replacement);
}

function setMeta(html, attr, key, value) {
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`);
  return setTag(html, pattern, `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`);
}

// A player or matchup view needs the player index and the player's own file before it can
// show anything, but the browser only asks for them once the app's scripts have run. Naming
// them in the head starts both downloads alongside the scripts.
export function injectPreload(html, paths) {
  if (!html.includes("</head>")) return html;
  const links = paths
    .map((path) => `  <link rel="preload" href="${escapeHtml(path)}" as="fetch" crossorigin />\n`)
    .join("");
  return html.replace("</head>", () => `${links}</head>`);
}

export function injectMeta(html, meta) {
  let out = setTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  out = setMeta(out, "name", "description", meta.description);
  out = setMeta(out, "property", "og:title", meta.title);
  out = setMeta(out, "property", "og:description", meta.description);
  out = setMeta(out, "property", "og:url", meta.url);
  out = setMeta(out, "property", "og:image", meta.image);
  out = setTag(
    out,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
  );
  return out;
}
