import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { release } from "../src/lib/products.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const config = JSON.parse(read("../vercel.json"));
const rule = config.headers.find((entry) => entry.source === "/(.*)");
const header = (key) => rule?.headers.find((entry) => entry.key === key)?.value;

test("vercel.json sets the static security headers on every route", () => {
  assert.ok(rule, "a catch-all header rule exists");
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(header("X-Frame-Options"), "DENY");
  const permissions = header("Permissions-Policy");
  for (const feature of ["camera", "microphone", "geolocation"])
    assert.ok(permissions.includes(`${feature}=()`), `${feature} is disabled`);
});

test("the CSP carries the required directives", () => {
  const csp = header("Content-Security-Policy");
  assert.ok(csp, "Content-Security-Policy is set");
  const directives = Object.fromEntries(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  assert.deepEqual(directives["default-src"], ["'self'"]);
  assert.deepEqual(directives["frame-ancestors"], ["'none'"]);
  assert.deepEqual(directives["base-uri"], ["'self'"]);
  assert.deepEqual(directives["form-action"], ["'self'"]);
  assert.deepEqual(directives["object-src"], ["'none'"]);
  assert.ok(directives["script-src"].includes("'self'"));
});

test("the release label comes from the manual's pinned tag", () => {
  const manual = JSON.parse(read("../content/manual.config.json"));
  assert.equal(release.tag, manual.tag);
  assert.equal(release.tag, `v${release.version}`);
  assert.ok(release.notes.endsWith(`/releases/tag/${release.tag}`));
});

test("static assets get long-lived cache headers, other assets a day", () => {
  const cache = (source) =>
    config.headers
      .find((entry) => entry.source === source)
      ?.headers.find((entry) => entry.key === "Cache-Control")?.value;
  const immutable = "public, max-age=31536000, immutable";
  assert.equal(cache("/_next/static/(.*)"), immutable);
  assert.equal(cache("/assets/fonts/(.*)"), immutable);
  assert.equal(cache("/assets/(.*)"), "public, max-age=86400");
  // Vercel applies later matching rules last, so the font rule must follow the generic one.
  const sources = config.headers.map((entry) => entry.source);
  assert.ok(sources.indexOf("/assets/fonts/(.*)") > sources.indexOf("/assets/(.*)"));
});
