const H2H_PATH_RE = /^\/h2h\/([1-9]\d{0,9})\/([1-9]\d{0,9})(?:\/index\.html|\/)?$/;

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "content-type": "text/plain;charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  }

  // Extract player IDs from URL path: /h2h/{p1}/{p2} or /h2h/{p1}/{p2}/ or /h2h/{p1}/{p2}/index.html
  const match = url.pathname.match(H2H_PATH_RE);
  if (!match) {
    return redirectNoStore(url.origin);
  }

  const p1 = match[1];
  const p2 = match[2];
  if (p1 === p2) {
    return redirectNoStore(url.origin);
  }

  let player1Name = `Player ${p1}`;
  let player2Name = `Player ${p2}`;
  let description = "Head-to-Head Matchup Comparison — Table Hockey H2H";

  // Load the player-centric H2H dataset and reject fabricated share paths.
  const dataUrl = new URL(`/data/og/${p1}.json`, request.url);
  try {
    const dataResponse = await env.ASSETS.fetch(dataUrl);
    if (!dataResponse.ok) {
      return redirectNoStore(url.origin);
    }
    const data = await dataResponse.json();
    if (!data.player || String(data.player.id) !== p1) {
      return redirectNoStore(url.origin);
    }
    if (data.player.name) {
      player1Name = data.player.name;
    }

    const oppData = data.opponents && data.opponents[p2];
    if (!oppData) {
      return redirectNoStore(`${url.origin}/?p1=${p1}`);
    }
    if (oppData.player && oppData.player.name) {
      player2Name = oppData.player.name;
    }

    const summary = oppData.summary;
    if (summary) {
      const w = summary.wins_player ?? 0;
      const d = summary.draws ?? 0;
      const l = summary.wins_opponent ?? 0;
      const n = summary.total_matches ?? 0;
      description = `${w}-${d}-${l} record over ${n} games`;
    }
  } catch (error) {
    console.error("Error fetching H2H static data:", error);
    return redirectNoStore(url.origin);
  }

  const p1Escaped = escapeHtml(player1Name);
  const p2Escaped = escapeHtml(player2Name);
  const descEscaped = escapeHtml(description);
  const redirectUrl = `${url.origin}/?p1=${p1}&p2=${p2}`;
  const redirectUrlEscaped = escapeHtml(redirectUrl);
  const ogImageUrlEscaped = escapeHtml(`${url.origin}/og-default.png`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p1Escaped} vs ${p2Escaped} — Table Hockey H2H</title>
<meta property="og:title" content="${p1Escaped} vs ${p2Escaped} — Table Hockey H2H">
<meta property="og:description" content="${descEscaped}">
<meta property="og:type" content="website">
<meta property="og:url" content="${redirectUrlEscaped}">
<meta property="og:image" content="${ogImageUrlEscaped}">
<meta http-equiv="refresh" content="0; url=${redirectUrlEscaped}">
<link rel="canonical" href="${redirectUrlEscaped}">
</head>
<body>
<p>Redirecting to <a href="${redirectUrlEscaped}">${p1Escaped} vs ${p2Escaped}</a>...</p>
</body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=3600",
      "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "x-robots-tag": "noindex, follow",
    },
  });
}

function redirectNoStore(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, follow",
    },
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
