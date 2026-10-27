import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkTagPin,
  rewriteLinksWith,
  stripLeadingRules,
  stripTrailingRules,
} from "../scripts/manual-lib.mjs";

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

test("rewrites a link whose label has a double-backtick code span", () => {
  assert.equal(run("[``a``](x.md)"), "[``a``](R(x.md))");
});

test("does not backtrack catastrophically on unbalanced backticks", () => {
  const input = `[${"``".repeat(5000)}x`;
  const start = performance.now();
  run(input);
  assert.ok(performance.now() - start < 500);
});

test("strips leading rules, single and repeated, with blank lines between", () => {
  assert.equal(stripLeadingRules("---\nbody"), "body");
  assert.equal(stripLeadingRules("\n---  \n\n---\n\n---\nbody\n---\nmore"), "body\n---\nmore");
});

test("strips trailing rules, single and repeated, with blank lines between", () => {
  assert.equal(stripTrailingRules("body\n---"), "body");
  assert.equal(stripTrailingRules("body\n\n---\n\n  ---\n---\n"), "body");
  assert.equal(stripTrailingRules("a\n---\nb"), "a\n---\nb");
});

test("does not strip four-dash lines", () => {
  assert.equal(stripLeadingRules("----\nbody"), "----\nbody");
  assert.equal(stripTrailingRules("body\n----"), "body\n----");
});

test("rule stripping stays linear on pathological input", () => {
  const input = `\n---${"\n\n---".repeat(20000)}x`;
  const start = performance.now();
  stripLeadingRules(input);
  stripTrailingRules(input);
  stripTrailingRules(input.slice(0, -1));
  stripLeadingRules(`${input.slice(1)}`);
  assert.ok(performance.now() - start < 500);
});
