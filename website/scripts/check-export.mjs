import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalFor, docSlugs, routesFor } from "../src/lib/routes.mjs";

const vercel = JSON.parse(
  readFileSync(new URL("../vercel.json", import.meta.url), "utf8"),
);
const csp = vercel.headers
  .flatMap((entry) => entry.headers)
  .find((entry) => entry.key === "Content-Security-Policy").value;
const cspSources = (directive) =>
  (csp.split(";").map((part) => part.trim().split(/\s+/)).find(([name]) => name === directive) || []).slice(1);
const externalOrigins = new Set();
const root = fileURLToPath(new URL("../out", import.meta.url));
const routes = routesFor();
const decode = (value) => {
  const text = value
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};
const expectedCanonical = new Map(
  ["home", ...docSlugs].map((page, index) => [
    "/" + routes[index].join("/"),
    canonicalFor(page),
  ]),
);
const pages = new Map();
for (const parts of routes) {
  const path = join(root, ...parts, "index.html");
  const html = readFileSync(path, "utf8");
  pages.set(
    "/" + parts.join("/"),
    new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => decode(m[1]))),
  );
}
let anchorsChecked = 0;
for (const parts of routes) {
  const path = join(root, ...parts, "index.html");
  const html = readFileSync(path, "utf8");
  assert.equal(
    (html.match(/<h1(?:\s|>)/g) || []).length,
    1,
    `${path}: one main heading`,
  );
  assert.ok(!/noindex/i.test(html), `${path}: page must be indexable`);
  const canonicals = [
    ...html.matchAll(/<link\s[^>]*rel="canonical"[^>]*>/g),
  ].map((m) => m[0].match(/href="([^"]*)"/)?.[1]);
  assert.deepEqual(
    canonicals,
    [expectedCanonical.get("/" + parts.join("/"))],
    `${path}: exactly one canonical link with the expected URL`,
  );
  for (const [element, tag, url] of html.matchAll(
    /<(img|script|link|iframe|source|video|audio|form)\b[^>]*?\s(?:src|href|action)="(https?:\/\/[^"]+)"[^>]*>/g,
  )) {
    if (tag === "link" && /\srel="canonical"/.test(element)) continue;
    const origin = new URL(url).origin;
    const image = tag === "img" || (tag === "link" && /\sas="image"/.test(element));
    const directive = image ? "img-src" : tag === "script" ? "script-src" : "default-src";
    assert.ok(
      cspSources(directive).includes(origin),
      `${path}: <${tag}> loads ${origin}, which ${directive} in vercel.json does not allow`,
    );
    externalOrigins.add(`${directive} ${origin}`);
  }
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"?#]*)/g)) {
    const target = join(root, decodeURIComponent(href));
    assert.ok(
      existsSync(target) || existsSync(join(target, "index.html")),
      `${path}: missing local destination ${href}`,
    );
  }
  for (const [, raw] of html.matchAll(/\shref="(\/[^"]*)"/g)) {
    const href = decode(raw);
    if (href.startsWith("//") || href.startsWith("/_next/") || href.startsWith("/#")) continue;
    const pathname = href.split(/[?#]/)[0];
    if (/\.[A-Za-z0-9]+$/.test(pathname.split("/").pop())) continue;
    assert.ok(
      pathname.endsWith("/") && !pathname.includes("//"),
      `${path}: internal link ${raw} must end in one trailing slash with no empty segments (trailingSlash export redirects otherwise)`,
    );
  }
  const here = "/" + parts.join("/");
  for (const [, href] of html.matchAll(/href="([^"]*#[^"]*)"/g)) {
    const [base, ...frag] = decode(href).split("#");
    const fragment = frag.join("#");
    if (!fragment) continue;
    const page = base === "" ? here : base.replace(/\/+$/, "") || "/";
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(base) || !pages.has(page)) continue;
    assert.ok(
      pages.get(page).has(fragment),
      `${path}: link ${href} has no matching id in ${page}`,
    );
    anchorsChecked++;
  }
  if (parts.includes("docs")) {
    assert.match(
      html,
      /<article class="prose">/,
      `${path}: rendered MDX article`,
    );
    assert.match(html, /Find a guide/, `${path}: guide search`);
    assert.match(html, /<h2/, `${path}: compiled MDX headings`);
  }
}
for (const id of ["drydock", "sockguard", "portwing", "careerrat", "portkey"])
  assert.equal(
    existsSync(join(root, id, "index.html")),
    false,
    `export leaked a ${id} route`,
  );
const robotsTxt = readFileSync(join(root, "robots.txt"), "utf8");
assert.ok(
  robotsTxt.includes("Sitemap: https://portkey.codeswhat.com/sitemap.xml"),
  "robots.txt names the sitemap",
);
const sitemapLocs = [
  ...readFileSync(join(root, "sitemap.xml"), "utf8").matchAll(
    /<loc>([^<]+)<\/loc>/g,
  ),
].map((m) => m[1]);
assert.deepEqual(
  [...sitemapLocs].sort(),
  [...expectedCanonical.values()].sort(),
  "sitemap.xml lists every route and no others",
);
assert.ok(existsSync(join(root, "favicon.ico")), "out/favicon.ico is missing");
const favicon = readFileSync(join(root, "favicon.ico"));
assert.ok(
  favicon.length >= 6 && favicon.readUInt16LE(0) === 0 && favicon.readUInt16LE(2) === 1,
  "out/favicon.ico is not an ICO file",
);
const notFound = readFileSync(join(root, "404.html"), "utf8");
assert.match(notFound, /name="robots"[^>]*noindex|noindex[^>]*name="robots"/i, "404.html must stay noindex");
assert.match(notFound, /Nothing to administer here/, "404.html is the styled page");
const home = readFileSync(join(root, "index.html"), "utf8");
for (const pattern of [
  /rel="icon"[^>]*portkey-64\.webp/,
  /name="theme-color"[^>]*#f9f5fc/,
  /name="theme-color"[^>]*#16101e/,
  /property="og:image"[^>]*content="https:\/\/portkey\.codeswhat\.com\/assets\/[^"]+"/,
  /name="twitter:image"[^>]*content="https:\/\/portkey\.codeswhat\.com\/assets\//,
  /not affiliated with or endorsed by Portkey or Palo Alto Networks/,
])
  assert.match(home, pattern, `home is missing ${pattern}`);
assert.ok(!/id="product-animation"|Play product animation/.test(home), "the old play button is gone");
assert.ok(!home.includes("All local previews"));
assert.match(home, /Portkey Admin MCP/);
console.log(
  `Verified ${routes.length} exported routes, ${anchorsChecked} anchor links, local links/assets and MDX for Portkey. External origins covered by the CSP: ${[...externalOrigins].sort().join(", ") || "none"}.`,
);
