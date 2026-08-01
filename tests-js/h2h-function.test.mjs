import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/h2h/[[path]].js";

const payload = {
  player: { id: 1, name: "<Alice & Co>" },
  opponents: {
    2: {
      player: { id: 2, name: 'Bob "Two"' },
      summary: {
        wins_player: 3,
        draws: 1,
        wins_opponent: 2,
        total_matches: 6,
      },
    },
  },
};

function context(path, options = {}) {
  const requestedAssets = [];
  const env = {
    ASSETS: {
      fetch: async (url) => {
        requestedAssets.push(String(url));
        if (options.assetStatus) return new Response("", { status: options.assetStatus });
        return Response.json(options.payload || payload);
      },
    },
  };
  return {
    context: {
      request: new Request(`https://stats.example${path}`, {
        method: options.method || "GET",
      }),
      env,
    },
    requestedAssets,
  };
}

test("valid share routes use compact metadata and escape generated HTML", async () => {
  for (const path of ["/h2h/1/2", "/h2h/1/2/", "/h2h/1/2/index.html"]) {
    const { context: requestContext, requestedAssets } = context(path);
    const response = await onRequest(requestContext);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(requestedAssets[0], "https://stats.example/data/og/1.json");
    assert.match(html, /&lt;Alice &amp; Co&gt; vs Bob &quot;Two&quot;/);
    assert.doesNotMatch(html, /<Alice & Co>/);
    assert.match(html, /3-1-2 record over 6 games/);
  }
});

test("HEAD and unsupported methods have correct response semantics", async () => {
  const head = context("/h2h/1/2", { method: "HEAD" });
  const headResponse = await onRequest(head.context);
  assert.equal(headResponse.status, 200);
  assert.equal(await headResponse.text(), "");

  const post = context("/h2h/1/2", { method: "POST" });
  const postResponse = await onRequest(post.context);
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("allow"), "GET, HEAD");
});

test("invalid, missing, and fabricated matchups redirect without caching", async () => {
  const cases = [
    context("/prefix/h2h/1/2"),
    context("/h2h/1/1"),
    context("/h2h/1/999"),
    context("/h2h/1/2", { assetStatus: 404 }),
  ];
  for (const item of cases) {
    const response = await onRequest(item.context);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(cases[2].requestedAssets.length, 1);
  const fabricatedResponse = await onRequest(cases[2].context);
  assert.equal(fabricatedResponse.headers.get("location"), "https://stats.example/?p1=1");
});
