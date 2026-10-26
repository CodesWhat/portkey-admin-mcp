import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { routesFor } from "../src/lib/routes.mjs";

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
  assert.match(
    html,
    /name="robots" content="noindex, nofollow"/,
    `${path}: site is not indexable yet`,
  );
  for (const [, href] of html.matchAll(/(?:href|src)="(\/[^"?#]*)/g)) {
    const target = join(root, decodeURIComponent(href));
    assert.ok(
      existsSync(target) || existsSync(join(target, "index.html")),
      `${path}: missing local destination ${href}`,
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
const home = readFileSync(join(root, "index.html"), "utf8");
assert.ok(!home.includes("All local previews"));
assert.match(home, /Portkey Admin MCP/);
console.log(
  `Verified ${routes.length} exported routes, ${anchorsChecked} anchor links, local links/assets and MDX for Portkey.`,
);
