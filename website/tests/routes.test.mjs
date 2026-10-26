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
  assert.equal(routeFor("tools"), "/docs/tools");
  assert.equal(routeFor("verify-release"), "/docs/verify-release");
  assert.deepEqual(routesFor(), [
    [],
    ["docs"],
    ["docs", "getting-started"],
    ["docs", "operations"],
    ["docs", "manual"],
    ["docs", "tools"],
    ["docs", "compatibility"],
    ["docs", "architecture"],
    ["docs", "http-deployment"],
    ["docs", "security"],
    ["docs", "prisma-airs"],
    ["docs", "distribution"],
    ["docs", "verify-release"],
  ]);
});

test("sidebar order is the starters, then the manual in config order", () => {
  assert.deepEqual(docSlugs, [
    "overview",
    "getting-started",
    "operations",
    "manual",
    "tools",
    "compatibility",
    "architecture",
    "http-deployment",
    "security",
    "prisma-airs",
    "distribution",
    "verify-release",
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
