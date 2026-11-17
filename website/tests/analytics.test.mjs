import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildCtaEvent,
  buildPageleaveEvent,
  buildPageviewEvent,
  buildWebVitalsEvent,
  canonicalizeAnalyticsRoute,
  createPostHogOptions,
  hasPrivacySignal,
  isProductionHostname,
  POSTHOG_PROXY_HOST,
  POSTHOG_UI_HOST,
  sanitizeEvent,
} from "../src/lib/analytics/contract.ts";
import { createWebVitalsReporter } from "../src/lib/analytics/web-vitals-buffer.ts";
import { routesFor } from "../src/lib/routes.mjs";

const BASE = { schema_version: 1, site: "portkey" };
const HASH = { $raw_user_agent: "Mozilla/5.0 (Test Runner)", $host: "portkey.codeswhat.com" };
const PRIVACY = {
  token: "phc_project-token",
  $cookieless_mode: true,
  $process_person_profile: false,
};
const send = (event, properties, extra = {}) =>
  sanitizeEvent({ event, uuid: "uuid-1", properties: { ...HASH, ...PRIVACY, ...properties }, ...extra });

test("every site route canonicalizes to itself, with the right surface", () => {
  for (const parts of routesFor()) {
    const route = parts.length === 0 ? "/" : `/${parts.join("/")}`;
    for (const raw of [route, route === "/" ? route : `${route}/`, `${route}?utm_source=x#frag`]) {
      const { path, surface } = canonicalizeAnalyticsRoute(raw);
      assert.equal(path, route, raw);
      assert.equal(surface, route === "/" ? "marketing" : "docs", raw);
    }
  }
  assert.equal(canonicalizeAnalyticsRoute("/docs/manual/").path, "/docs/manual");
});

test("unknown and malformed paths collapse to /_other and never leak", () => {
  for (const raw of ["/private/customer/acme?token=secret", "//evil.example/x", "nope", "", "/docs/nope/secret", ]) {
    assert.equal(canonicalizeAnalyticsRoute(raw).path, "/_other", raw);
  }
  assert.equal(canonicalizeAnalyticsRoute("/docs/private/customer/acme").path, "/_other");
  assert.equal(canonicalizeAnalyticsRoute("/docs/private/customer/acme").surface, "docs");
  assert.equal(canonicalizeAnalyticsRoute("/private/customer/acme").path, "/_other");
  assert.equal(canonicalizeAnalyticsRoute("/private/customer/acme").surface, "marketing");
});

test("pageview and pageleave events carry the base contract and a mirrored $pathname", () => {
  assert.deepEqual(buildPageviewEvent("/?utm_source=test#hero"), {
    event: "$pageview",
    properties: { ...BASE, surface: "marketing", path: "/", $pathname: "/" },
  });
  assert.deepEqual(buildPageleaveEvent("/docs/tools/?q=secret#x"), {
    event: "$pageleave",
    properties: { ...BASE, surface: "docs", path: "/docs/tools", $pathname: "/docs/tools" },
  });
  const other = buildPageviewEvent("/docs/private/customer/acme?token=secret#f").properties;
  assert.equal(other.$pathname, other.path);
  assert.equal(other.path, "/_other");
});

test("CTA events accept only real component id and placement pairs", () => {
  assert.deepEqual(buildCtaEvent("/", "github_repository", "hero"), {
    event: "cta activated",
    properties: { ...BASE, surface: "marketing", path: "/", cta_id: "github_repository", placement: "hero" },
  });
  assert.equal(buildCtaEvent("/docs", "docs_root", "header").properties.surface, "docs");
  assert.equal(buildCtaEvent("/", "docs_security", "hero"), null);
  assert.equal(buildCtaEvent("/", "install_copy", "header"), null);
  assert.equal(buildCtaEvent("/", "free-form", "hero"), null);
  assert.equal(buildCtaEvent("/", "docs_root", "free-form"), null);
});

test("before_send rebuilds a pageview envelope from an allowlist", () => {
  const timestamp = new Date("2026-11-17T00:00:00Z");
  const result = sanitizeEvent({
    event: "$pageview",
    uuid: "uuid-1",
    timestamp,
    $set: { $initial_referrer: "https://search.example/private" },
    $set_once: { $initial_referrer: "https://search.example/private" },
    properties: {
      ...HASH,
      ...PRIVACY,
      $current_url: "https://portkey.codeswhat.com/docs/tools/?q=secret#private",
      $referrer: "https://search.example/private?x=1",
      $referring_domain: "search.example",
      $ip: "203.0.113.9",
      $initial_referrer: "https://search.example/private",
      title: "customer private title",
      distinct_id: "person-id",
      email: "a@b.c",
      utm_source: "newsletter",
      gclid: "click-id",
    },
  });
  assert.deepEqual(result, {
    event: "$pageview",
    uuid: "uuid-1",
    timestamp,
    properties: {
      ...BASE,
      surface: "docs",
      path: "/docs/tools",
      $pathname: "/docs/tools",
      $referring_domain: "search.example",
      ...PRIVACY,
      ...HASH,
    },
  });
  assert.equal("$set" in result, false);
  assert.equal("$set_once" in result, false);
});

test("before_send keeps the cookieless distinct id and drops any other", () => {
  const keep = send("$pageview", { path: "/", distinct_id: "$posthog_cookieless" });
  assert.equal(keep.properties.distinct_id, "$posthog_cookieless");
  const drop = send("$pageview", { path: "/", distinct_id: "person-id" });
  assert.equal("distinct_id" in drop.properties, false);
});

test("before_send drops unknown events", () => {
  for (const event of ["$autocapture", "$identify", "$exception", "$rageclick", "custom", ""]) {
    assert.equal(send(event, { path: "/" }), null, event);
  }
  assert.equal(sanitizeEvent(null), null);
  assert.equal(sanitizeEvent({ event: "$pageview", uuid: "u" }), null);
});

test("before_send drops CTA events with an unknown cta_id or placement", () => {
  const ok = send("cta activated", { path: "/", cta_id: "docs_root", placement: "footer" });
  assert.equal(ok.properties.cta_id, "docs_root");
  assert.equal(ok.properties.placement, "footer");
  for (const [cta_id, placement] of [
    ["docs_security", "footer"],
    ["docs_root", "hero"],
    ["<script>", "footer"],
    [undefined, "footer"],
    ["docs_root", undefined],
  ]) {
    assert.equal(send("cta activated", { path: "/", cta_id, placement }), null, `${cta_id}:${placement}`);
  }
});

test("before_send requires the privacy flags, a project key, and the cookieless hash fields", () => {
  for (const privacy of [
    { $cookieless_mode: false },
    { $process_person_profile: true },
    { $process_person_profile: undefined },
    { token: undefined },
    { token: "not-a-project-key" },
  ]) {
    assert.equal(send("$pageview", { path: "/", ...privacy }), null, JSON.stringify(privacy));
  }
  for (const key of Object.keys(HASH)) {
    assert.equal(send("$pageview", { path: "/", [key]: undefined }), null, key);
    assert.equal(send("$pageview", { path: "/", [key]: "" }), null, key);
  }
  assert.equal(send("$pageview", {}), null, "no path or $current_url");
});

test("before_send drops events that did not come from the production hostname", () => {
  for (const host of ["localhost", "127.0.0.1:3000", "portkey-admin-mcp.vercel.app", "evil.portkey.codeswhat.com"]) {
    assert.equal(send("$pageview", { path: "/", $host: host }), null, host);
  }
  // $host is location.host, so a port can ride along; the hostname still has to match.
  assert.equal(send("$pageview", { path: "/", $host: "portkey.codeswhat.com:8080" }).properties.$host, "portkey.codeswhat.com:8080");
  assert.equal(isProductionHostname("portkey.codeswhat.com"), true);
  assert.equal(isProductionHostname("localhost"), false);
  assert.equal(isProductionHostname("portkey-git-x-codeswhat.vercel.app"), false);
  assert.equal(isProductionHostname(undefined), false);
});

test("before_send drops a non-hostname $referring_domain and never copies $referrer", () => {
  for (const bad of [
    "https://news.ycombinator.com/item?id=123",
    "news.ycombinator.com/item?id=123",
    "javascript:alert(1)",
    "user:pass@news.ycombinator.com",
    "a b.example",
    "",
    42,
    `${"a".repeat(260)}.example`,
  ]) {
    const result = send("$pageview", { path: "/", $referring_domain: bad });
    assert.equal("$referring_domain" in result.properties, false, JSON.stringify(bad));
  }
  assert.equal(send("$pageview", { path: "/", $referring_domain: "$direct" }).properties.$referring_domain, "$direct");
  assert.equal(
    send("$pageview", { path: "/", $referring_domain: "news.ycombinator.com" }).properties.$referring_domain,
    "news.ycombinator.com",
  );
  const result = send("$pageview", { path: "/", $referrer: "https://news.ycombinator.com/item?id=1" });
  assert.equal("$referrer" in result.properties, false);
});

test("before_send collects no campaign parameters or click ids", () => {
  const result = send("$pageview", {
    path: "/",
    utm_source: "newsletter",
    utm_medium: "email",
    utm_campaign: "launch",
    utm_content: "x",
    utm_term: "y",
    gclid: "a",
    fbclid: "b",
    msclkid: "c",
    gad_source: "1",
    mc_cid: "d",
  });
  assert.deepEqual(Object.keys(result.properties).sort(), [
    "$cookieless_mode",
    "$host",
    "$pathname",
    "$process_person_profile",
    "$raw_user_agent",
    "path",
    "schema_version",
    "site",
    "surface",
    "token",
  ]);
});

test("before_send keeps one sanitized Core Web Vitals envelope", () => {
  const result = send("$web_vitals", {
    $current_url: "https://portkey.codeswhat.com/docs?secret=1#private",
    $web_vitals_CLS_value: 0.01,
    $web_vitals_FCP_value: 123.4,
    $web_vitals_INP_value: -1,
    $web_vitals_LCP_value: 456.7,
    $web_vitals_TTFB_value: 8,
    $web_vitals_LCP_event: { navigationEntry: "private" },
    metric_name: "INP",
  });
  assert.deepEqual(result.properties, {
    ...BASE,
    surface: "docs",
    path: "/docs",
    $web_vitals_CLS_value: 0.01,
    $web_vitals_FCP_value: 123.4,
    $web_vitals_LCP_value: 456.7,
    ...PRIVACY,
    ...HASH,
  });
  assert.equal(
    send("$web_vitals", { path: "/", $web_vitals_INP_value: Number.NaN, $web_vitals_LCP_value: -1 }),
    null,
  );
  assert.equal(buildWebVitalsEvent("/", {}), null);
});

// A fake lifecycle source: the runtime calls flush() on visibilitychange to
// hidden and on pagehide, and a "clock" only orders events here, since the
// reporter no longer uses timers.
function newReporter(path = "/") {
  const emitted = [];
  const reporter = createWebVitalsReporter(
    path,
    (event) => emitted.push(event),
    buildWebVitalsEvent,
    canonicalizeAnalyticsRoute,
  );
  return { emitted, reporter };
}

test("web vitals reporter emits one complete canonical envelope", () => {
  const { emitted, reporter } = newReporter("/docs/tools/?customer=secret#private");
  reporter.record("CLS", 0.01);
  reporter.record("FCP", 123.4);
  reporter.record("INP", 81.25);
  assert.equal(emitted.length, 0);
  reporter.record("LCP", 456.7);
  assert.deepEqual(emitted, [
    {
      event: "$web_vitals",
      properties: {
        ...BASE,
        surface: "docs",
        path: "/docs/tools",
        $web_vitals_CLS_value: 0.01,
        $web_vitals_FCP_value: 123.4,
        $web_vitals_INP_value: 81.25,
        $web_vitals_LCP_value: 456.7,
      },
    },
  ]);
  reporter.record("LCP", 999);
  reporter.flush();
  assert.equal(emitted.length, 1);
});

test("web vitals reporter ignores bad metrics and an empty flush", () => {
  const { emitted, reporter } = newReporter("/?customer=secret#private");
  reporter.record("TTFB", 8);
  reporter.record("CLS", -1);
  reporter.record("FCP", Number.NaN);
  reporter.flush();
  assert.equal(emitted.length, 0);
});

test("web vitals reporter delivers CLS and INP that finalize late, at hidden", () => {
  const { emitted, reporter } = newReporter("/");
  reporter.record("FCP", 100);
  // ten seconds pass with nothing sent, then the page goes hidden
  reporter.record("CLS", 0.05);
  reporter.record("INP", 200);
  assert.equal(emitted.length, 0);
  reporter.flush();
  assert.deepEqual(emitted, [
    {
      event: "$web_vitals",
      properties: {
        ...BASE,
        surface: "marketing",
        path: "/",
        $web_vitals_CLS_value: 0.05,
        $web_vitals_FCP_value: 100,
        $web_vitals_INP_value: 200,
      },
    },
  ]);
});

test("web vitals reporter flushes a partial envelope when a short visit goes hidden", () => {
  const { emitted, reporter } = newReporter("/");
  reporter.record("FCP", 90);
  reporter.record("LCP", 300);
  reporter.flush();
  assert.deepEqual(emitted, [
    {
      event: "$web_vitals",
      properties: { ...BASE, surface: "marketing", path: "/", $web_vitals_FCP_value: 90, $web_vitals_LCP_value: 300 },
    },
  ]);
});

test("web vitals reporter never sends the same metric twice across flushes", () => {
  const { emitted, reporter } = newReporter("/");
  reporter.record("FCP", 90);
  reporter.record("LCP", 300);
  reporter.flush();
  reporter.flush();
  reporter.record("FCP", 91);
  reporter.record("CLS", 0.1);
  reporter.flush();
  reporter.record("LCP", 400);
  reporter.flush();
  assert.equal(emitted.length, 2);
  assert.deepEqual(Object.keys(emitted[1].properties).filter((key) => key.startsWith("$web_vitals_")), [
    "$web_vitals_CLS_value",
  ]);
  reporter.record("INP", 50);
  assert.equal(emitted.length, 3);
  assert.equal(emitted[2].properties.$web_vitals_INP_value, 50);
});

test("an unknown route keeps its surface through the builder and the sanitizer", () => {
  for (const [raw, surface] of [
    ["/docs/nope", "docs"],
    ["/nope", "marketing"],
  ]) {
    const built = buildPageviewEvent(raw);
    assert.equal(built.properties.path, "/_other");
    assert.equal(built.properties.surface, surface);
    const out = send("$pageview", { ...built.properties, $current_url: `https://portkey.codeswhat.com${raw}` });
    assert.equal(out.properties.path, "/_other");
    assert.equal(out.properties.surface, surface);
  }
  const forged = send("$pageview", { path: "/_other", surface: "bogus" });
  assert.equal(forged.properties.surface, "marketing");
});

test("privacy signals are detected and suppress the event filter", () => {
  assert.equal(hasPrivacySignal({ navigator: { doNotTrack: "1" } }), true);
  assert.equal(hasPrivacySignal({ doNotTrack: "1" }), true);
  assert.equal(hasPrivacySignal({ navigator: { msDoNotTrack: "1" } }), true);
  assert.equal(hasPrivacySignal({ navigator: { globalPrivacyControl: true } }), true);
  assert.equal(hasPrivacySignal({ navigator: { doNotTrack: "0", globalPrivacyControl: false } }), false);
  assert.equal(hasPrivacySignal({}), false);
  assert.equal(hasPrivacySignal(undefined), false);

  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    globalThis.window = { navigator: { globalPrivacyControl: true } };
    assert.equal(send("$pageview", { path: "/" }), null);
    assert.equal(send("$pageleave", { path: "/" }), null);
    globalThis.window = { navigator: {} };
    assert.notEqual(send("$pageview", { path: "/" }), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  }
});

test("PostHog initializes only with the exact production proxy contract", () => {
  assert.equal(createPostHogOptions(undefined, undefined, undefined), null);
  assert.equal(createPostHogOptions("phc_project", POSTHOG_PROXY_HOST, undefined), null);
  assert.equal(createPostHogOptions("phc_project", "https://us.i.posthog.com", POSTHOG_UI_HOST), null);
  assert.equal(createPostHogOptions("not-a-project-key", POSTHOG_PROXY_HOST, POSTHOG_UI_HOST), null);
  const options = createPostHogOptions("phc_project-key", POSTHOG_PROXY_HOST, POSTHOG_UI_HOST);
  assert.ok(options);
  assert.deepEqual(
    { ...options, before_send: undefined },
    {
      api_host: "https://e.codeswhat.com",
      ui_host: "https://us.posthog.com",
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: true,
      capture_heatmaps: false,
      capture_dead_clicks: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_surveys_automatic_display: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      advanced_disable_flags: true,
      cookieless_mode: "always",
      person_profiles: "never",
      persistence: "memory",
      disable_persistence: true,
      respect_dnt: true,
      save_campaign_params: false,
      save_referrer: true,
      disable_capture_url_hashes: true,
      disable_scroll_properties: true,
      mask_all_element_attributes: true,
      mask_all_text: true,
      capture_performance: false,
      before_send: undefined,
    },
  );
  assert.equal(options.before_send, sanitizeEvent);
});

test("every CTA marker in the components is an allowed pair, and every allowed pair is used", () => {
  const sources = ["site.tsx", "site-lower.tsx", "install.tsx"]
    .map((file) => readFileSync(new URL(`../src/components/${file}`, import.meta.url), "utf8"))
    .join("\n");
  const marked = new Set([...sources.matchAll(/(?:data-cta|cta)="([a-z_]+:[a-z_]+)"/g)].map((m) => m[1]));
  assert.ok(marked.size > 0);
  for (const pair of marked) {
    const [id, placement] = pair.split(":");
    assert.notEqual(buildCtaEvent("/", id, placement), null, `${pair} is not allowlisted`);
  }
  for (const pair of [
    "install_copy:hero",
    "install_copy:install",
    "install_cursor:install",
    "docs_root:header",
    "docs_root:footer",
    "github_repository:header",
    "github_repository:hero",
    "github_repository:footer",
    "npm_package:trust",
  ])
    assert.ok(marked.has(pair), `${pair} is allowlisted but never rendered`);
});
