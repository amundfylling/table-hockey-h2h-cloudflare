import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/_middleware.js";

function context(url) {
  let nextCalled = false;
  return {
    ctx: {
      request: new Request(url),
      next: async () => {
        nextCalled = true;
        return new Response("ok");
      },
    },
    wasNextCalled: () => nextCalled,
  };
}

test("redirects the pages.dev host to h2h.puck.no, keeping path and query", async () => {
  const { ctx, wasNextCalled } = context("https://table-hockey-h2h.pages.dev/h2h/1/2/?x=1");
  const response = await onRequest(ctx);

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://h2h.puck.no/h2h/1/2/?x=1");
  assert.equal(wasNextCalled(), false);
});

test("passes through requests on the custom domain", async () => {
  const { ctx, wasNextCalled } = context("https://h2h.puck.no/?p1=1&p2=2");
  const response = await onRequest(ctx);

  assert.equal(response.status, 200);
  assert.equal(wasNextCalled(), true);
});

test("passes through preview deployments", async () => {
  const { ctx, wasNextCalled } = context("https://abc123.table-hockey-h2h.pages.dev/");
  await onRequest(ctx);

  assert.equal(wasNextCalled(), true);
});
