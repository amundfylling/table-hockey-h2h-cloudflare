const LEGACY_HOST = "table-hockey-h2h.pages.dev";
const CANONICAL_HOST = "h2h.puck.no";

// bordshockey.net used to number players who have an ITHF id but no Sportscorpion record
// 1,000,000 + ITHF id. Every source now uses 9,000,000 + ITHF id, and nothing else uses
// the old range, so links with an old id are sent to the same player's new id.
const OLD_ITHF_BASE = 1_000_000;
const NEW_ITHF_BASE = 9_000_000;
const PLAYER_PARAMS = ["p1", "p2", "p1g", "p2g"];
const H2H_PATH_RE = /^\/h2h\/(\d+)\/(\d+)(\/.*)?$/;

export function currentPlayerId(value) {
  if (!/^[1-9]\d{6}$/.test(value)) return value;
  const id = Number(value);
  if (id < OLD_ITHF_BASE || id >= NEW_ITHF_BASE) return value;
  return String(id - OLD_ITHF_BASE + NEW_ITHF_BASE);
}

// The same URL with old player ids replaced, or null when it has none.
function withCurrentPlayerIds(url) {
  const next = new URL(url);
  let changed = false;
  for (const key of PLAYER_PARAMS) {
    const value = next.searchParams.get(key);
    if (!value) continue;
    const updated = value.split(",").map(currentPlayerId).join(",");
    if (updated !== value) {
      next.searchParams.set(key, updated);
      changed = true;
    }
  }
  const match = next.pathname.match(H2H_PATH_RE);
  if (match) {
    const [, a, b, rest = ""] = match;
    const path = `/h2h/${currentPlayerId(a)}/${currentPlayerId(b)}${rest}`;
    if (path !== next.pathname) {
      next.pathname = path;
      changed = true;
    }
  }
  return changed ? next : null;
}

// Send the old pages.dev address to the custom domain. Preview deployments
// (<hash>.table-hockey-h2h.pages.dev) keep working because only the exact host matches.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const updated = withCurrentPlayerIds(url);
  if (url.hostname !== LEGACY_HOST && !updated) {
    return context.next();
  }

  const target = updated || url;
  if (target.hostname === LEGACY_HOST) {
    target.hostname = CANONICAL_HOST;
    target.protocol = "https:";
    target.port = "";
  }
  return Response.redirect(target.toString(), 301);
}
