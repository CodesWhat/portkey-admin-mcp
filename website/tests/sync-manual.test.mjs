import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTagPin, rewriteLinksWith } from "../scripts/manual-lib.mjs";

const rewrite = (url) => `R(${url})`;
const run = (text) => rewriteLinksWith(text, rewrite);

test("rewrites links whose label contains a code span", () => {
  assert.equal(run("see [`SECURITY.md`](SECURITY.md) now"), "see [`SECURITY.md`](R(SECURITY.md)) now");
  assert.equal(
    run("[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md)"),
    "[`docs/VERCEL_DEPLOYMENT.md`](R(docs/VERCEL_DEPLOYMENT.md))",
  );
});

test("rewrites plain links, images and titles", () => {
  assert.equal(run('[a](b.md "t") ![i](c.png)'), '[a](R(b.md) "t") ![i](R(c.png))');
});

test("leaves link syntax inside code spans literal", () => {
  assert.equal(run("`see [x](y)` and ``a [x](y)``"), "`see [x](y)` and ``a [x](y)``");
});

test("leaves fenced code blocks untouched", () => {
  const fenced = "```md\n[x](y)\n```";
  assert.equal(run(`${fenced}\n[a](b)`), `${fenced}\n[a](R(b))`);
});

test("rewrites reference definitions", () => {
  assert.equal(run("[ref]: docs/a.md"), "[ref]: R(docs/a.md)");
});

test("checkTagPin", () => {
  assert.equal(checkTagPin("v1", "abc", "abc"), null);
  assert.match(checkTagPin("v1", "", "abc"), /missing/);
  assert.match(checkTagPin("v1", "def", "abc"), /resolves to def/);
});
