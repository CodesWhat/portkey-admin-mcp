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
const readme = readFileSync(readmePath, "utf8");
const toolsStart = readme.indexOf("## 🔧 Tools");
const toolsEnd = readme.indexOf("## 🏗️ Architecture");

if (toolsStart < 0 || toolsEnd < 0 || toolsEnd <= toolsStart) {
	console.error("README tools section boundaries were not found.");
	process.exit(1);
}

const toolsSection = readme.slice(toolsStart, toolsEnd);

const headlineCountMatch = toolsSection.match(/##\s+🔧\s+Tools\s+\((\d+)\)/);
if (!headlineCountMatch) {
	console.error("README tools headline count was not found.");
	process.exit(1);
}
const headlineCount = Number.parseInt(headlineCountMatch[1], 10);

const categoryCounts = [
	...toolsSection.matchAll(
		/<summary><strong>[^<]+<\/strong>\s+\((\d+)\s+tools?\)<\/summary>/g,
	),
].map((m) => Number.parseInt(m[1], 10));
const categoryTotal = categoryCounts.reduce((sum, count) => sum + count, 0);

const readmeToolNames = [...toolsSection.matchAll(/\|\s+`([^`]+)`\s+\|/g)].map(
	(match) => match[1],
);
const readmeToolSet = new Set(readmeToolNames);

const failures = [];

if (codeToolNames.length !== codeToolSet.size) {
	failures.push(
		`Duplicate tool registrations in source: total=${codeToolNames.length}, unique=${codeToolSet.size}`,
	);
}

if (readmeToolNames.length !== readmeToolSet.size) {
	failures.push(
		`Duplicate tool entries in README tools section: total=${readmeToolNames.length}, unique=${readmeToolSet.size}`,
	);
}

if (headlineCount !== codeToolSet.size) {
	failures.push(
		`README headline mismatch: README=${headlineCount}, source=${codeToolSet.size}`,
	);
}

if (categoryTotal !== codeToolSet.size) {
	failures.push(
		`README category total mismatch: README=${categoryTotal}, source=${codeToolSet.size}`,
	);
}

if (readmeToolSet.size !== codeToolSet.size) {
	failures.push(
		`README tool count mismatch: README=${readmeToolSet.size}, source=${codeToolSet.size}`,
	);
}

const missingInReadme = [...codeToolSet]
	.filter((name) => !readmeToolSet.has(name))
	.sort();
const missingInSource = [...readmeToolSet]
	.filter((name) => !codeToolSet.has(name))
	.sort();

if (missingInReadme.length > 0) {
	failures.push(
		`Tools missing in README (${missingInReadme.length}): ${missingInReadme.join(", ")}`,
	);
}
if (missingInSource.length > 0) {
	failures.push(
		`Tools listed in README but not registered in source (${missingInSource.length}): ${missingInSource.join(", ")}`,
	);
}

if (failures.length > 0) {
	console.error("README tool verification failed:");
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
	`README tool verification passed: ${codeToolSet.size} tools across ${toolFileNames.length} files.`,
);
