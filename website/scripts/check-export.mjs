import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { routesFor } from "../src/lib/routes.mjs";

const root = fileURLToPath(new URL("../out", import.meta.url));
const routes = routesFor();
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
  `Verified ${routes.length} exported routes, local links/assets and MDX for Portkey.`,
);
