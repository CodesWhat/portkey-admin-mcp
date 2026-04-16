#!/usr/bin/env node
/**
 * Extract (name, description) pairs from every src/tools/*.tools.ts and write
 * docs/glama-score/current-descriptions.json. Run before score-tools.mjs so the
 * scorer has a fresh snapshot of main.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SRC = resolve(ROOT, "src/tools");
const OUT = resolve(ROOT, "docs/glama-score/current-descriptions.json");

const files = readdirSync(SRC)
	.filter((f) => f.endsWith(".tools.ts"))
	.map((f) => resolve(SRC, f));

// Match server.tool("<name>", "<description>", ...schema...)
// Handles multiline descriptions that use standard double-quoted strings.
const pattern =
	/server\.tool\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,/gs;

function unescapeDescription(s) {
	return s
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");
}

const tools = [];
for (const fp of files) {
	const src = readFileSync(fp, "utf8");
	for (const m of src.matchAll(pattern)) {
		tools.push({
			name: m[1],
			description: unescapeDescription(m[2]),
			file: fp.replace(`${ROOT}/`, ""),
		});
	}
}

console.log(`Extracted ${tools.length} tools from ${files.length} files`);
writeFileSync(OUT, JSON.stringify(tools, null, 2));
console.log(`Wrote: ${OUT}`);
