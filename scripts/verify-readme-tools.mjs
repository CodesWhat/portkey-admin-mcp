#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const toolsDir = path.join(repoRoot, "src", "tools");
const readmePath = path.join(repoRoot, "README.md");

const toolFileNames = readdirSync(toolsDir).filter((name) =>
	name.endsWith(".tools.ts"),
);

const codeToolNames = [];
const perFileCounts = [];

for (const fileName of toolFileNames) {
	const fullPath = path.join(toolsDir, fileName);
	const source = readFileSync(fullPath, "utf8");
	const matches = [...source.matchAll(/server\.tool\(\s*["']([^"']+)["']/gms)];
	perFileCounts.push({ fileName, count: matches.length });
	for (const match of matches) {
		codeToolNames.push(match[1]);
	}
}

const codeToolSet = new Set(codeToolNames);

// Check for duplicate tool registrations
const failures = [];

if (codeToolNames.length !== codeToolSet.size) {
	failures.push(
		`Duplicate tool registrations in source: total=${codeToolNames.length}, unique=${codeToolSet.size}`,
	);
}

// Verify the README mentions the correct total count
const readme = readFileSync(readmePath, "utf8");
const countMatch = readme.match(/\*\*(\d+)\s+tools\s+total/);
if (countMatch) {
	const readmeCount = Number.parseInt(countMatch[1], 10);
	if (readmeCount !== codeToolSet.size) {
		failures.push(
			`README total count mismatch: README says ${readmeCount}, source has ${codeToolSet.size}`,
		);
	}
}

if (failures.length > 0) {
	console.error("Tool verification failed:");
	for (const failure of failures) {
		console.error(`- ${failure}`);
	}
	console.error("\nPer-file tool counts:");
	for (const row of perFileCounts.sort((a, b) =>
		a.fileName.localeCompare(b.fileName),
	)) {
		console.error(`- ${row.fileName}: ${row.count}`);
	}
	process.exit(1);
}

console.log(
	`Tool verification passed: ${codeToolSet.size} tools across ${toolFileNames.length} files.`,
);

// Print per-file breakdown
for (const row of perFileCounts.sort((a, b) =>
	a.fileName.localeCompare(b.fileName),
)) {
	console.log(`  ${row.fileName}: ${row.count}`);
}
