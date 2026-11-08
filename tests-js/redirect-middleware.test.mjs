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

test("sends old bordshockey.net player ids to their 9,000,000 + ITHF id", async () => {
  const { ctx, wasNextCalled } = context("https://h2h.puck.no/?p1=1070077&p2=1234&p2g=1234,1020003");
  const response = await onRequest(ctx);

  assert.equal(response.status, 301);
  assert.equal(
    response.headers.get("location"),
    "https://h2h.puck.no/?p1=9070077&p2=1234&p2g=1234%2C9020003",
  );
  assert.equal(wasNextCalled(), false);
});

test("rewrites old player ids in /h2h/ share paths", async () => {
  const { ctx } = context("https://h2h.puck.no/h2h/12/1070077/");
  const response = await onRequest(ctx);

  assert.equal(response.status, 301);
  assert.equal(response.headers.get("location"), "https://h2h.puck.no/h2h/12/9070077/");
});

test("moves the host and old ids in one redirect", async () => {
  const { ctx } = context("https://table-hockey-h2h.pages.dev/?p1=1070077");
  const response = await onRequest(ctx);

  assert.equal(response.headers.get("location"), "https://h2h.puck.no/?p1=9070077");
});

test("leaves current player ids alone", async () => {
  for (const id of ["1022", "16590", "9070077", "21000447", "50000266", "8007927"]) {
    const { ctx, wasNextCalled } = context(`https://h2h.puck.no/?p1=${id}`);
    const response = await onRequest(ctx);
    assert.equal(response.status, 200);
    assert.equal(wasNextCalled(), true);
  }
});
