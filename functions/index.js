// The home page doubles as every player and matchup view (/?p1=…&p2=…). The app
// renders those in the browser, so this fills in the page on the server: title,
// description, canonical URL and social preview tags name the player or matchup
// for search engines and link previews, and a plain HTML summary with structured
// data (JSON-LD) gives crawlers that do not run scripts the record and links to
// related pages. The app removes the summary when it starts. Anything unexpected
// falls back to the static page unchanged.
import { pageTitle, SITE_NAME } from "../public/js/page-title.js";
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

  const cache = edgeCache();
  // The page changes with each deploy (its etag) and each data refresh (at most daily).
  const cacheKey = cache && new Request(
    `${url.origin}${url.pathname}${url.search}#${response.headers.get("etag") || ""}`,
  );
  if (cache) {
    const cached = await cache.match(cacheKey).catch(() => null);
    if (cached) return cached;
  }

  let meta;
  let summary = null;
  try {
    const data = await loadPlayerFile(env, url, p1);
    if (!data) return response;
    meta = buildMetaFromData(data, url, p1, p2, { withRecord: !grouped });
    if (meta && !grouped) {
      const other = meta.opponentId ? await loadPlayerFile(env, url, meta.opponentId) : null;
      summary = buildSummary(data, other, url, p1, meta.opponentId);
    }
  } catch (error) {
    console.error("Error building page metadata:", error);
    return response;
  }
  if (!meta) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  let html = injectMeta(await response.text(), meta);
  if (summary) html = injectSummary(html, summary);
  html = injectPreload(html, ["/data/players.json", `/data/h2h/${p1}.json`]);
  const page = new Response(html, {
    status: response.status,
    headers,
  });
  if (cache) {
    const stored = page.clone();
    const storedHeaders = new Headers(stored.headers);
    storedHeaders.set("cache-control", `public, max-age=${EDGE_CACHE_SECONDS}`);
    const put = cache
      .put(cacheKey, new Response(stored.body, { status: stored.status, headers: storedHeaders }))
      .catch(() => {});
    if (context.waitUntil) context.waitUntil(put);
  }
  return page;
}

// Crawlers can ask for thousands of these pages in a row; keeping each rendered page at the
// edge for a few hours spares the CPU. Browsers still get the page's own no-cache header.
const EDGE_CACHE_SECONDS = 6 * 3600;

function edgeCache() {
  try {
    return typeof caches !== "undefined" && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

async function loadPlayerFile(env, url, id) {
  const dataResponse = await env.ASSETS.fetch(new URL(`/data/og/${id}.json`, url));
  if (!dataResponse.ok) return null;
  const data = await dataResponse.json();
  if (String(data?.player?.id) !== String(id)) return null;
  return data;
}

export function buildMetaFromData(data, url, p1, p2, { withRecord = true } = {}) {
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
      // Both orders show the same games, so search engines get one address per pair: lower
      // id first, as in the sitemap. Link previews keep the order that was shared.
      canonical: Number(p1) < Number(p2)
        ? `${url.origin}/?p1=${p1}&p2=${p2}`
        : `${url.origin}/?p1=${p2}&p2=${p1}`,
      image: `${url.origin}/og-default.png`,
      opponentId: p2,
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
    `<link rel="canonical" href="${escapeHtml(meta.canonical || meta.url)}" />`,
  );
  return out;
}

// ----- Plain HTML summary for crawlers -----------------------------------------------------

const SUMMARY_OPPONENTS = 30;
const SUMMARY_OTHER_RIVALRIES = 10;
const HOME_TITLE_RE = /<h1 id="home-title" class="home-title">([^<]*)<\/h1>/;

const playerPath = (id) => `/?p1=${id}`;
// Matchup links use the canonical order (lower id first) so crawlers find one address per pair.
const matchupPath = (a, b) => (Number(a) < Number(b) ? `/?p1=${a}&p2=${b}` : `/?p1=${b}&p2=${a}`);

function totalsOf(opponents) {
  const totals = { wins: 0, draws: 0, losses: 0, games: 0, goalsFor: 0, goalsAgainst: 0, first: "", last: "" };
  for (const { summary = {} } of opponents) {
    totals.wins += summary.wins_player ?? 0;
    totals.draws += summary.draws ?? 0;
    totals.losses += summary.wins_opponent ?? 0;
    totals.games += summary.total_matches ?? 0;
    totals.goalsFor += summary.goals_for_player ?? 0;
    totals.goalsAgainst += summary.goals_for_opponent ?? 0;
    const first = summary.first_meeting_date || "";
    const last = summary.last_meeting_date || "";
    if (first && (!totals.first || first < totals.first)) totals.first = first;
    if (last > totals.last) totals.last = last;
  }
  return totals;
}

function byGames(opponents) {
  return [...opponents].sort(
    (x, y) => (y.summary?.total_matches ?? 0) - (x.summary?.total_matches ?? 0)
      || Number(x.player?.id) - Number(y.player?.id),
  );
}

function recordText(summary = {}) {
  const games = summary.total_matches ?? 0;
  return `${plural(summary.wins_player ?? 0, "win")}, ${plural(summary.draws ?? 0, "draw")} and `
    + `${plural(summary.wins_opponent ?? 0, "loss", "losses")} in ${plural(games, "game")}`;
}

function nameOf(player) {
  return decodeHtmlEntities(player?.name) || `Player ${player?.id}`;
}

function personLd(player, origin) {
  const person = { "@type": "Person", name: nameOf(player), url: `${origin}${playerPath(player.id)}` };
  if (player.country) person.nationality = { "@type": "Country", name: player.country };
  return person;
}

function opponentItem(ownerId, opponent) {
  const id = opponent.player?.id;
  const name = escapeHtml(nameOf(opponent.player));
  const last = opponent.summary?.last_meeting_date;
  return `<li><a href="${escapeHtml(playerPath(id))}">${name}</a>: `
    + `<a href="${escapeHtml(matchupPath(ownerId, id))}">${escapeHtml(recordText(opponent.summary))}</a>`
    + `${last ? `, last met ${escapeHtml(last)}` : ""}</li>`;
}

function ratingText(player) {
  const parts = [];
  if (player.rating) {
    let text = `rating ${formatCount(player.rating)}`;
    if (player.peak?.rating) {
      text += ` (peak ${formatCount(player.peak.rating)}${player.peak.date ? ` in ${String(player.peak.date).slice(0, 4)}` : ""})`;
    }
    parts.push(text);
  }
  if (player.world_rank) parts.push(`ITHF world rank ${formatCount(player.world_rank)}`);
  return parts.join(", ");
}

// {heading, html, jsonLd} for the page, or null. `other` is the opponent's own file, if loaded.
export function buildSummary(data, other, url, p1, p2) {
  const origin = url.origin;
  const player = data.player;
  const nameA = nameOf(player);
  const opponents = Object.values(data.opponents || {});
  const opponent = p2 ? data.opponents?.[p2] : null;

  if (opponent) {
    const playerB = { ...opponent.player, ...(other?.player || {}) };
    const nameB = nameOf(playerB);
    const summary = opponent.summary || {};
    const lead = matchupDescription(nameA, nameB, summary).replace(` ${TAGLINE}`, "");
    const facts = [];
    if (summary.goals_for_player != null && summary.goals_for_opponent != null && summary.total_matches) {
      facts.push(`Goals: ${escapeHtml(nameA)} ${formatCount(summary.goals_for_player)}, `
        + `${escapeHtml(nameB)} ${formatCount(summary.goals_for_opponent)}.`);
    }
    if (summary.first_meeting_date) {
      facts.push(summary.first_meeting_date === summary.last_meeting_date || !summary.last_meeting_date
        ? `They met on ${escapeHtml(summary.first_meeting_date)}.`
        : `First meeting ${escapeHtml(summary.first_meeting_date)}, latest ${escapeHtml(summary.last_meeting_date)}.`);
    }
    const others = (ownerData, ownerId, skipId) => byGames(Object.values(ownerData?.opponents || {}))
      .filter((item) => String(item.player?.id) !== String(skipId))
      .slice(0, SUMMARY_OTHER_RIVALRIES)
      .map((item) => opponentItem(ownerId, item))
      .join("");
    const othersA = others(data, p1, p2);
    const othersB = other ? others(other, p2, p1) : "";
    const heading = `${nameA} vs ${nameB}`;
    const html = [
      `<h2 id="page-summary-title">${escapeHtml(heading)}: head-to-head record</h2>`,
      `<p>${[escapeHtml(lead), ...facts].join(" ")}</p>`,
      `<p>Player pages: <a href="${escapeHtml(playerPath(p1))}">${escapeHtml(nameA)}</a>`
        + `${ratingText(player) ? ` (${escapeHtml(ratingText(player))})` : ""}, `
        + `<a href="${escapeHtml(playerPath(p2))}">${escapeHtml(nameB)}</a>`
        + `${ratingText(playerB) ? ` (${escapeHtml(ratingText(playerB))})` : ""}.</p>`,
      othersA ? `<h3>Other rivalries of ${escapeHtml(nameA)}</h3><ul>${othersA}</ul>` : "",
      othersB ? `<h3>Other rivalries of ${escapeHtml(nameB)}</h3><ul>${othersB}</ul>` : "",
    ].join("");
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: heading,
      url: `${origin}${matchupPath(p1, p2)}`,
      description: lead,
      about: [personLd(player, origin), personLd(playerB, origin)],
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${origin}/` },
    };
    if (summary.last_meeting_date) jsonLd.dateModified = summary.last_meeting_date;
    return { heading, html, jsonLd };
  }

  const totals = totalsOf(opponents);
  if (!totals.games) return null;
  const top = byGames(opponents).slice(0, SUMMARY_OPPONENTS);
  const rest = opponents.length - top.length;
  const where = player.country ? ` (${player.country})` : "";
  const sentences = [
    `${nameA}${where} has ${recordText({
      wins_player: totals.wins,
      draws: totals.draws,
      wins_opponent: totals.losses,
      total_matches: totals.games,
    })} against ${plural(opponents.length, "opponent")}.`,
  ];
  if (totals.goalsFor || totals.goalsAgainst) {
    sentences.push(`Goals ${formatCount(totals.goalsFor)}–${formatCount(totals.goalsAgainst)}.`);
  }
  if (totals.first && totals.last) sentences.push(`Games from ${totals.first} to ${totals.last}.`);
  const rating = ratingText(player);
  if (rating) sentences.push(`Current ${rating}.`);
  const html = [
    `<h2 id="page-summary-title">${escapeHtml(nameA)}: career head-to-head records</h2>`,
    `<p>${escapeHtml(sentences.join(" "))}</p>`,
    `<h3>Most played opponents</h3>`,
    `<ul>${top.map((item) => opponentItem(p1, item)).join("")}</ul>`,
    rest > 0 ? `<p>And ${escapeHtml(plural(rest, "more opponent"))}.</p>` : "",
  ].join("");
  const person = personLd(player, origin);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${nameA}: table hockey head-to-head records`,
    url: `${origin}${playerPath(p1)}`,
    description: playerDescription(nameA, opponents),
    mainEntity: { ...person, description: `Table hockey player${where}` },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${origin}/` },
  };
  if (totals.last) jsonLd.dateModified = totals.last;
  return { heading: nameA, html, jsonLd };
}

// JSON inside <script> must not be able to close the tag.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// The summary goes at the end of <main>, below the app's own content, and the page heading
// names the player or matchup. Crawlers read the HTML whatever the styles say; in a browser
// the summary only shows with scripts off, and the app drops it and restores the home heading
// when it starts (main.js).
export function injectSummary(html, summary) {
  if (!html.includes("</main>") || !html.includes("</head>")) return html;
  let out = html.replace(HOME_TITLE_RE, (match, text) =>
    `<h1 id="home-title" class="home-title" data-home-title="${text}">${escapeHtml(summary.heading)}</h1>`);
  // Hidden by default so readers with scripts never see it flash before the app starts.
  out = out.replace("</head>", () =>
    `  <script type="application/ld+json">${jsonForScript(summary.jsonLd)}</script>\n`
    + `  <noscript><style>#page-summary { display: block; }</style></noscript>\n</head>`);
  out = out.replace("</main>", () =>
    `  <section id="page-summary" class="wrap page-summary" aria-labelledby="page-summary-title">`
    + `${summary.html}</section>\n  </main>`);
  return out;
}
