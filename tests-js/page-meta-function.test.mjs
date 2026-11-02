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
