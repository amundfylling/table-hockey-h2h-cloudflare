// Tournament pages (/tournament?id=…) render in the browser from the data/t/ files.
// This fills in the page head on the server so search engines and link previews
// get the tournament's name, dates, place and winner. Anything unexpected falls
// back to the static page unchanged.
import { injectMeta } from "./index.js";
import { pageTitle } from "../public/js/page-title.js";
import { formatDateRange, tournamentDataPath, tournamentLabel } from "../public/js/date-range.js";
import { decodeHtmlEntities } from "../public/js/utils.js";

const ID_RE = /^[1-9]\d{0,9}$/;

export async function onRequest(context) {
  const { request, env } = context;
  const response = await context.next();
  if (request.method !== "GET" || !response.ok) return response;
  if (!(response.headers.get("content-type") || "").includes("text/html")) return response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id || !ID_RE.test(id)) return response;

  let meta;
  try {
    const dataResponse = await env.ASSETS.fetch(new URL(`/${tournamentDataPath(id)}`, url));
    if (!dataResponse.ok) return response;
    const data = (await dataResponse.json())?.[id];
    if (String(data?.id) !== id || !data.name) return response;
    meta = {
      title: pageTitle({ nameA: tournamentLabel(decodeHtmlEntities(data.name), data.date) }),
      description: tournamentDescription(data),
      url: `${url.origin}/tournament?id=${id}`,
      image: `${url.origin}/og-default.png`,
    };
  } catch (error) {
    console.error("Error building tournament metadata:", error);
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(injectMeta(await response.text(), meta), {
    status: response.status,
    headers,
  });
}

function count(value, word) {
  const n = Math.trunc(Number(value) || 0);
  return `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${n === 1 ? word : `${word}s`}`;
}

export function tournamentDescription(data) {
  const name = decodeHtmlEntities(data.name);
  const when = formatDateRange(data.date, data.end_date);
  const where = [data.city, data.country].filter(Boolean).join(", ");
  const playerName = (id) => decodeHtmlEntities(data.players?.[String(id)] || "");
  const champion = data.champion ? playerName(data.champion) : "";
  const runnerUp = data.runner_up ? playerName(data.runner_up) : "";
  const parts = [[name, when, where].filter(Boolean).join(", ") + "."];
  if (champion) parts.push(runnerUp ? `Won by ${champion} ahead of ${runnerUp}.` : `Won by ${champion}.`);
  parts.push(`${count(Object.keys(data.players || {}).length, "player")}, ${count(data.games, "game")}.`);
  parts.push("Playoff bracket, standings and upsets.");
  return parts.join(" ");
}
