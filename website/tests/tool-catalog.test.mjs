import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toolDomains } from "../src/lib/tool-catalog.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("../../lhm.plugin.json", import.meta.url), "utf8"),
);
const tools = toolDomains.flatMap(({ tools }) => tools);
test("website inventory covers each published tool once", () => {
  assert.equal(toolDomains.length, 22);
  assert.equal(tools.length, 194);
  assert.deepEqual(
    [...new Set(tools.map((tool) => tool.name))].sort(),
    manifest.tools.map((tool) => tool.name).sort(),
  );
});
test("website flags and Enterprise status match published tool metadata", () => {
  const source = new Map(manifest.tools.map((tool) => [tool.name, tool]));
  for (const tool of tools) {
    const original = source.get(tool.name);
    assert.equal(tool.description, original.description);
    assert.equal(
      tool.flag,
      original.annotations.readOnlyHint
        ? "Read"
        : original.annotations.destructiveHint
          ? "Destructive"
          : "Write",
    );
    assert.equal(tool.enterprise, original.description.includes("Enterprise-gated"));
  }
  assert.equal(tools.filter((tool) => tool.enterprise).length, 56);
});
