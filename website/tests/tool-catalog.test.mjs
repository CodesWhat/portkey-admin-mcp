import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
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

for (const [label, eol] of [
  ["CRLF", "\r\n"],
  ["lone CR", "\r"],
]) {
  test(`website inventory accepts ${label} endpoint tables`, () => {
    const fixture = mkdtempSync(join(tmpdir(), "portkey-catalog-"));
    try {
      mkdirSync(join(fixture, "website"));
      writeFileSync(join(fixture, "lhm.plugin.json"), JSON.stringify(manifest));
      const endpoints = readFileSync(new URL("../../ENDPOINTS.md", import.meta.url), "utf8");
      writeFileSync(join(fixture, "ENDPOINTS.md"), endpoints.replace(/\r?\n/g, eol));
      const moduleUrl = new URL("../src/lib/tool-catalog.mjs", import.meta.url).href;
      const output = execFileSync(process.execPath, ["--input-type=module", "-e",
        `const { toolDomains } = await import(${JSON.stringify(moduleUrl)}); console.log(toolDomains.flatMap(d => d.tools).length);`
      ], { cwd: join(fixture, "website"), encoding: "utf8", timeout: 10_000 });
      assert.equal(output.trim(), "194");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
