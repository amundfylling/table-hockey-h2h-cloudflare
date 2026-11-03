import assert from "node:assert/strict";
import test from "node:test";

import { onRequest, tournamentDescription } from "../functions/tournament.js";
import { tournamentLabel } from "../public/js/date-range.js";

const pageHtml = `<!doctype html><html><head>
<title>Tournament · Table Hockey H2H</title>
<meta name="description" content="generic" />
<meta property="og:title" content="generic" />
<meta property="og:description" content="generic" />
<meta property="og:url" content="https://h2h.puck.no/tournament" />
<meta property="og:image" content="https://h2h.puck.no/og-default.png" />
<link rel="canonical" href="https://h2h.puck.no/tournament" />
</head><body></body></html>`;

const data = {
  id: 7,
  name: "Riga &amp; Friends Open",
  date: "2024-03-02",
  end_date: "2024-03-03",
  city: "Riga",
  country: "Latvia",
  games: 1200,
  champion: 1,
  runner_up: 2,
  players: { 1: "<Ann>", 2: "Bo", 3: "Cy" },
};

const requested = [];

function run(path, { status = 200 } = {}) {
  const page = new Response(pageHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
  return {
    page,
    response: onRequest({
      request: new Request(`https://stats.example${path}`),
      env: {
        ASSETS: {
          fetch: async (assetUrl) => {
            requested.push(String(assetUrl));
            return status === 200 ? Response.json({ 7: data }) : new Response("", { status });
          },
        },
      },
      next: async () => page,
    }),
  };
}

test("tournament pages get a named, escaped head", async () => {
  const html = await (await run("/tournament?id=7").response).text();
  assert.match(html, /<title>Riga &amp; Friends Open 2024 · Table Hockey H2H<\/title>/);
  assert.match(html, /Won by &lt;Ann&gt; ahead of Bo\. 3 players, 1,200 games\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/stats.example\/tournament\?id=7" \/>/);
  assert.equal(requested.at(-1), "https://stats.example/data/t/7.json");
});

test("the description reads naturally", () => {
  assert.equal(
    tournamentDescription(data),
    "Riga & Friends Open, 2–3 Mar 2024, Riga, Latvia. Won by <Ann> ahead of Bo. "
      + "3 players, 1,200 games. Playoff bracket, standings and upsets.",
  );
});

test("a page holding part of an event names the full event instead of a champion", () => {
  const part = { ...data, champion: null, runner_up: null, part_of: { id: 8, name: "EM &amp; Co" } };
  assert.equal(
    tournamentDescription(part),
    "Riga & Friends Open, 2–3 Mar 2024, Riga, Latvia. Part of EM & Co. "
      + "3 players, 1,200 games. Playoff bracket, standings and upsets.",
  );
});

test("bad ids, mismatched data and missing files pass through", async () => {
  for (const [path, options] of [["/tournament", {}], ["/tournament?id=x", {}],
    ["/tournament?id=8", {}], ["/tournament?id=7", { status: 404 }]]) {
    const { page, response } = run(path, options);
    assert.equal(await response, page, path);
  }
});

test("tournament labels add the year only when the name lacks one", () => {
  assert.equal(tournamentLabel("SM", "2022-05-14"), "SM 2022");
  assert.equal(tournamentLabel("Latvia Open 2018 / 2", "2018-10-13"), "Latvia Open 2018 / 2");
  assert.equal(tournamentLabel("Latvijas Kauss 2016/2017 #1", "2016-11-05"), "Latvijas Kauss 2016/2017 #1");
  assert.equal(tournamentLabel("Umeligan 17", "2019-02-01"), "Umeligan 17 2019");
  assert.equal(tournamentLabel("Cup 120", "2019-02-01"), "Cup 120 2019");
  assert.equal(tournamentLabel("Riga Cup", ""), "Riga Cup");
});
