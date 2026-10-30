const LEGACY_HOST = "table-hockey-h2h.pages.dev";
const CANONICAL_HOST = "h2h.puck.no";

// Send the old pages.dev address to the custom domain. Preview deployments
// (<hash>.table-hockey-h2h.pages.dev) keep working because only the exact host matches.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname !== LEGACY_HOST) {
    return context.next();
  }

  url.hostname = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return Response.redirect(url.toString(), 301);
}
