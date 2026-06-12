export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Extract player IDs from URL path: /h2h/{p1}/{p2} or /h2h/{p1}/{p2}/ or /h2h/{p1}/{p2}/index.html
  const match = url.pathname.match(/\/h2h\/(\d+)\/(\d+)/);
  if (!match) {
    // Redirect to home if path is invalid or missing IDs
    return Response.redirect(url.origin, 302);
  }

  const p1 = match[1];
  const p2 = match[2];

  let player1Name = `Player ${p1}`;
  let player2Name = `Player ${p2}`;
  let description = "Head-to-Head Matchup Comparison — Table Hockey H2H";

  // Try to load player 1's H2H dataset from static assets
  const dataUrl = new URL(`/data/h2h/${p1}.json`, request.url);
  try {
    const dataResponse = await env.ASSETS.fetch(dataUrl);
    if (dataResponse.ok) {
      const data = await dataResponse.json();
      if (data.player && data.player.name) {
        player1Name = data.player.name;
      }
      
      const oppData = data.opponents && data.opponents[p2];
      if (oppData) {
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
      }
    }
  } catch (error) {
    console.error("Error fetching H2H static data:", error);
  }

  const p1Escaped = escapeHtml(player1Name);
  const p2Escaped = escapeHtml(player2Name);
  const descEscaped = escapeHtml(description);
  const redirectUrl = `${url.origin}/?p1=${p1}&p2=${p2}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${p1Escaped} vs ${p2Escaped} — Table Hockey H2H</title>
<meta property="og:title" content="${p1Escaped} vs ${p2Escaped} — Table Hockey H2H">
<meta property="og:description" content="${descEscaped}">
<meta property="og:image" content="/og-default.png">
<meta http-equiv="refresh" content="0; url=/?p1=${p1}&p2=${p2}">
<link rel="canonical" href="${redirectUrl}">
</head>
<body>
<p>Redirecting to matchup...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html;charset=UTF-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
