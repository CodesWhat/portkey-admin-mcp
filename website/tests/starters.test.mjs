import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manual = JSON.parse(read("../content/manual.config.json"));
const sourceLink = /github\.com\/CodesWhat\/portkey-admin-mcp\/(?:tree|blob)\/([^/\s)#?"'>]+)/gi;

test("starter pages link product source at the pinned commit", () => {
  for (const slug of manual.starters) {
    const page = read(`../content/docs/portkey/${slug}.mdx`);
    assert.ok(page.match(sourceLink), `${slug}.mdx has no link to the product source`);
    for (const [link, ref] of page.matchAll(sourceLink))
      assert.equal(ref, manual.commit, `${slug}.mdx links ${link}, not the pinned commit ${manual.commit}`);
  }
});

test("at least one starter links product source, so the check is not vacuous", () => {
  const count = manual.starters
    .map((slug) => read(`../content/docs/portkey/${slug}.mdx`).match(sourceLink)?.length ?? 0)
    .reduce((a, b) => a + b, 0);
  assert.ok(count > 0);
});
