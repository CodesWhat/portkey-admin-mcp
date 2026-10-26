import assert from "node:assert/strict";
import test from "node:test";
import {
  productId,
  docSlugs,
  routeFor,
  routesFor,
  resolveRoute,
} from "../src/lib/routes.mjs";

test("the site is always Portkey", () => {
  assert.equal(productId, "portkey");
});

test("marketing is at the root and every docs page sits under /docs", () => {
  assert.equal(routeFor("home"), "/");
  assert.equal(routeFor("overview"), "/docs");
  assert.equal(routeFor("getting-started"), "/docs/getting-started");
  assert.equal(routeFor("operations"), "/docs/operations");
  assert.deepEqual(routesFor(), [
    [],
    ["docs"],
    ["docs", "getting-started"],
    ["docs", "operations"],
  ]);
});

test("every route resolves back to its page", () => {
  for (const page of ["home", ...docSlugs]) {
    const parts = routeFor(page).split("/").filter(Boolean);
    assert.deepEqual(resolveRoute(parts), { page });
  }
});

test("foreign product routes and unknown pages do not resolve", () => {
  for (const id of [
    "drydock",
    "sockguard",
    "portwing",
    "careerrat",
    "portkey",
  ]) {
    assert.equal(resolveRoute([id]), undefined);
    assert.equal(resolveRoute([id, "docs"]), undefined);
  }
  assert.equal(resolveRoute(["docs", "missing"]), undefined);
  assert.equal(resolveRoute(["docs", "operations", "extra"]), undefined);
  assert.throws(() => routeFor("missing"), /Unknown page/);
});
