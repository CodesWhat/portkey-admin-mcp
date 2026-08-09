#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const toolsDir = path.join(repoRoot, "src", "tools");
const readmePath = path.join(repoRoot, "README.md");

const toolFileNames = readdirSync(toolsDir).filter((name) =>
	name.endsWith(".tools.ts"),
);

const codeToolNames = [];
const perFileCounts = [];

// Some tool domains table-drive a batch of near-identical tool registrations
// via `for (const x of SOME_TABLE) { server.tool(x.name, ...) }` instead of a
// literal string per call site (see analytics.tools.ts). The static scan
// below can't see through the loop variable, so it separately finds any such
// loop, resolves the array it iterates, and pulls tool names from that
// array's `name: "..."` entries instead of the loop's single call site.
function findTableDrivenToolNames(source) {
	const names = [];
	const loopPattern =
		/for\s*\(\s*const\s+(\w+)\s+of\s+(\w+)\s*\)\s*\{[^}]*?server\.(?:tool|registerTool)\(\s*\1\.name/gs;
	for (const loopMatch of source.matchAll(loopPattern)) {
		const arrayName = loopMatch[2];
		const declIndex = source.indexOf(`const ${arrayName}`);
		if (declIndex === -1) continue;
		// The array's type annotation (if any) commonly contains `=>` for
		// function-typed fields, so don't stop at the first `=`; the actual
		// assignment operator is followed directly by `[`.
		const assignIndex = source.indexOf("= [", declIndex);
		if (assignIndex === -1) continue;

		// Walk forward from the opening `[` to find its matching `]`, then pull
		// every `name: "..."` entry declared inside that array literal.
		const start = assignIndex + 2;
		let depth = 0;
		let end = start;
		for (let i = start; i < source.length; i++) {
			if (source[i] === "[") depth++;
			else if (source[i] === "]") {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		const arrayBody = source.slice(start, end);
		for (const nameMatch of arrayBody.matchAll(/name:\s*["']([^"']+)["']/g)) {
			names.push(nameMatch[1]);
		}
	}
	return names;
}

for (const fileName of toolFileNames) {
	const fullPath = path.join(toolsDir, fileName);
	const source = readFileSync(fullPath, "utf8");
	const matches = [
		...source.matchAll(/server\.(?:tool|registerTool)\(\s*["']([^"']+)["']/gms),
	];
	const tableDrivenNames = findTableDrivenToolNames(source);
	perFileCounts.push({
		fileName,
		count: matches.length + tableDrivenNames.length,
	});
	for (const match of matches) {
		codeToolNames.push(match[1]);
	}
	codeToolNames.push(...tableDrivenNames);
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
