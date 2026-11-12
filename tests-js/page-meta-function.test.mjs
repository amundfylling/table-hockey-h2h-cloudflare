import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { onRequest } from "../functions/index.js";

const indexHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

const payload = {
  player: { id: 1, name: "<Alice & Co>" },
  opponents: {
    2: {
      player: { id: 2, name: 'Bob "Two"' },
      summary: { wins_player: 3, draws: 1, wins_opponent: 2, total_matches: 6 },
    },
    3: {
      player: { id: 3, name: "Cy" },
      summary: { wins_player: 1000, draws: 0, wins_opponent: 1, total_matches: 1001 },
    },
  },
};

function run(path, options = {}) {
  const requestedAssets = [];
  const page = new Response(options.method === "HEAD" ? null : indexHtml, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'",
      etag: '"abc"',
    },
  });
  const context = {
    request: new Request(`https://stats.example${path}`, { method: options.method || "GET" }),
    env: {
      ASSETS: {
        fetch: async (url) => {
          requestedAssets.push(String(url));
          if (options.assetStatus) return new Response("", { status: options.assetStatus });
          const id = String(url).match(/\/og\/(\d+)\.json$/)?.[1];
          if (options.files) {
            return options.files[id] ? Response.json(options.files[id]) : new Response("", { status: 404 });
          }
          return Response.json(options.payload || payload);
        },
      },
    },
    next: async () => page,
  };
  return { response: onRequest(context), requestedAssets, page };
}

test("matchup URLs get an escaped title, description and canonical URL", async () => {
  const { response, requestedAssets } = run("/?p1=1&p2=2&stage=playoff");
  const res = await response;
  const html = await res.text();
  assert.equal(requestedAssets[0], "https://stats.example/data/og/1.json");
  assert.match(html, /<title>&lt;Alice &amp; Co&gt; vs Bob &quot;Two&quot; · Table Hockey H2H<\/title>/);
  assert.match(html, /&lt;Alice &amp; Co&gt; leads Bob &quot;Two&quot; 3–2, with 1 draw, over 6 games\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/stats.example\/\?p1=1&amp;p2=2" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/stats.example\/\?p1=1&amp;p2=2" \/>/);
  assert.doesNotMatch(html, /<Alice & Co>/);
  assert.equal(res.headers.get("content-security-policy"), "default-src 'self'");
  assert.equal(res.headers.get("etag"), null);
});

test("a matchup's canonical URL puts the lower id first; the preview keeps the shared order", async () => {
  const reversed = {
    player: { id: 5, name: "Eve" },
    opponents: { 2: { player: { id: 2, name: "Bob" }, summary: { wins_player: 1, total_matches: 1 } } },
  };
  const html = await (await run("/?p1=5&p2=2", { payload: reversed }).response).text();
  assert.match(html, /<link rel="canonical" href="https:\/\/stats.example\/\?p1=2&amp;p2=5" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/stats.example\/\?p1=5&amp;p2=2" \/>/);
  assert.match(html, /<title>Eve vs Bob · Table Hockey H2H<\/title>/);
});

test("player URLs sum the record across opponents", async () => {
  const html = await (await run("/?p1=1").response).text();
  assert.match(html, /<title>&lt;Alice &amp; Co&gt; · Table Hockey H2H<\/title>/);
  assert.match(html, /1,003 wins, 1 draw and 3 losses in 1,007 games against 2 opponents\./);
  assert.match(html, /<link rel="canonical" href="https:\/\/stats.example\/\?p1=1" \/>/);
});

test("alias-grouped views keep the names but leave out the single-file record", async () => {
  const html = await (await run("/?p1=1&p1g=1,7&p2=2").response).text();
  assert.match(html, /<title>&lt;Alice &amp; Co&gt; vs Bob &quot;Two&quot; · Table Hockey H2H<\/title>/);
  assert.doesNotMatch(html, /3–2/);
});

test("entity-encoded names are decoded before escaping", async () => {
  payload.player.name = "Ann &amp; Lee";
  try {
    const html = await (await run("/?p1=1").response).text();
    assert.match(html, /<title>Ann &amp; Lee · Table Hockey H2H<\/title>/);
  } finally {
    payload.player.name = "<Alice & Co>";
  }
});

test("an unknown opponent falls back to the player head", async () => {
  const html = await (await run("/?p1=1&p2=99").response).text();
  assert.match(html, /<title>&lt;Alice &amp; Co&gt; · Table Hockey H2H<\/title>/);
});

test("the plain home page, bad ids, HEAD and missing data pass through unchanged", async () => {
  for (const [path, options] of [
    ["/", {}],
    ["/?p1=abc", {}],
    ["/?p1=1", { method: "HEAD" }],
    ["/?p1=1", { assetStatus: 404 }],
  ]) {
    const { response, page } = run(path, options);
    assert.equal(await response, page, path);
  }
});

test("player and matchup views preload the player index and the player's file", async () => {
  const html = await (await run("/?p1=1&p2=2").response).text();
  assert.match(html, /<link rel="preload" href="\/data\/players\.json" as="fetch" crossorigin \/>/);
  assert.match(html, /<link rel="preload" href="\/data\/h2h\/1\.json" as="fetch" crossorigin \/>\s*<\/head>/);
  const missing = await (await run("/?p1=1", { assetStatus: 404 }).response).text();
  assert.doesNotMatch(missing, /data\/h2h\/1\.json/);
});

const files = {
  10: {
    player: { id: 10, name: "Ann", country: "Norway", rating: 1712, peak: { rating: 1800, date: "2019-03-02" } },
    opponents: {
      20: {
        player: { id: 20, name: "Ben <b>" },
        summary: {
          total_matches: 5, wins_player: 3, wins_opponent: 1, draws: 1,
          goals_for_player: 14, goals_for_opponent: 9,
          first_meeting_date: "2015-04-01", last_meeting_date: "2024-10-12",
        },
      },
      30: {
        player: { id: 30, name: "Cy" },
        summary: { total_matches: 1, wins_player: 0, wins_opponent: 1, draws: 0, last_meeting_date: "2020-01-01" },
      },
    },
  },
  20: {
    player: { id: 20, name: "Ben <b>", country: "Sweden", world_rank: 7 },
    opponents: {
      10: { player: { id: 10, name: "Ann" }, summary: { total_matches: 5, wins_player: 1, wins_opponent: 3, draws: 1 } },
      5: { player: { id: 5, name: "Dee" }, summary: { total_matches: 2, wins_player: 2, wins_opponent: 0, draws: 0 } },
    },
  },
};

function jsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)];
  return blocks.map((block) => JSON.parse(block[1]));
}

test("player pages carry a crawlable summary with links and ProfilePage data", async () => {
  const { response, requestedAssets } = run("/?p1=10", { files });
  const html = await (await response).text();
  assert.deepEqual(requestedAssets, ["https://stats.example/data/og/10.json"]);
  const summary = html.match(/<section id="page-summary"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(summary, /Ann \(Norway\) has 3 wins, 1 draw and 2 losses in 6 games against 2 opponents\./);
  assert.match(summary, /Goals 14–9\. Games from 2015-04-01 to 2024-10-12\. Current rating 1,712 \(peak 1,800 in 2019\)\./);
  // Most played first; opponent and matchup links use the canonical pair order.
  assert.match(summary, /<li><a href="\/\?p1=20">Ben &lt;b&gt;<\/a>: <a href="\/\?p1=10&amp;p2=20">3 wins, 1 draw and 1 loss in 5 games<\/a>, last met 2024-10-12<\/li><li><a href="\/\?p1=30">Cy<\/a>/);
  assert.match(html, /<h1 id="home-title" class="home-title" data-home-title="Every table hockey rivalry, settled\.">Ann<\/h1>/);
  assert.ok(html.indexOf('id="page-summary"') < html.indexOf("</main>"));
  const profile = jsonLd(html).find((item) => item["@type"] === "ProfilePage");
  assert.equal(profile.url, "https://stats.example/?p1=10");
  assert.deepEqual(profile.mainEntity.nationality, { "@type": "Country", name: "Norway" });
  assert.equal(profile.dateModified, "2024-10-12");
});

test("matchup pages summarise the pair from both players' files", async () => {
  const { response, requestedAssets } = run("/?p1=20&p2=10", { files });
  const html = await (await response).text();
  assert.deepEqual(requestedAssets, [
    "https://stats.example/data/og/20.json",
    "https://stats.example/data/og/10.json",
  ]);
  const summary = html.match(/<section id="page-summary"[^>]*>([\s\S]*?)<\/section>/)[1];
  assert.match(summary, /Ben &lt;b&gt; vs Ann: head-to-head record/);
  assert.match(summary, /Ann leads Ben &lt;b&gt; 3–1, with 1 draw, over 5 games\./);
  assert.match(summary, /\(ITHF world rank 7\)/);
  assert.match(summary, /Other rivalries of Ben &lt;b&gt;<\/h3><ul><li><a href="\/\?p1=5">Dee<\/a>: <a href="\/\?p1=5&amp;p2=20">/);
  assert.match(summary, /Other rivalries of Ann<\/h3><ul><li><a href="\/\?p1=30">Cy<\/a>/);
  assert.doesNotMatch(summary, /<b>/);
  const page = jsonLd(html).find((item) => item["@type"] === "WebPage");
  assert.equal(page.url, "https://stats.example/?p1=10&p2=20");
  assert.deepEqual(page.about.map((person) => person.name), ["Ben <b>", "Ann"]);
  assert.equal(page.about[1].nationality.name, "Norway");
  // The raw name only appears escaped inside the JSON-LD script.
  assert.doesNotMatch(html.split("<body")[0], /Ben <b>/);
});

test("a matchup still gets its summary when the opponent's file is missing", async () => {
  const html = await (await run("/?p1=10&p2=20", { files: { 10: files[10] } }).response).text();
  assert.match(html, /Ann leads Ben &lt;b&gt; 3–1/);
  assert.doesNotMatch(html, /Other rivalries of Ben/);
});

test("alias-grouped views get no summary", async () => {
  const html = await (await run("/?p1=10&p1g=10,11", { files }).response).text();
  assert.doesNotMatch(html, /page-summary/);
  assert.match(html, /<h1 id="home-title" class="home-title">Every table hockey rivalry, settled\.<\/h1>/);
});
