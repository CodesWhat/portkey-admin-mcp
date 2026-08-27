#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const toolsDir = path.join(repoRoot, "src", "tools");
const readmePath = path.join(repoRoot, "README.md");
const endpointsPath = path.join(repoRoot, "ENDPOINTS.md");
const toolIndexPath = path.join(toolsDir, "index.ts");

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

const README_CATEGORY_SOURCES = new Map([
	["Prompts", ["prompts.tools.ts"]],
	["Prompt Partials", ["partials.tools.ts"]],
	["Prompt Labels", ["labels.tools.ts"]],
	["Configs", ["configs.tools.ts"]],
	["Deployments", ["deployments.tools.ts"]],
	["Secret References", ["secret-references.tools.ts"]],
	["Virtual Keys", ["keys.tools.ts", /^((?!api_key).)*virtual_key/]],
	["API Keys", ["keys.tools.ts", /api_key/]],
	["Collections", ["collections.tools.ts"]],
	["Providers", ["providers.tools.ts"]],
	["Integrations", ["integrations.tools.ts"]],
	["MCP Integrations", ["mcp-integrations.tools.ts"]],
	["MCP Servers", ["mcp-servers.tools.ts"]],
	["Guardrails", ["guardrails.tools.ts"]],
	["Usage Limits", ["limits.tools.ts", /usage_limit/]],
	["Rate Limits", ["limits.tools.ts", /rate_limit/]],
	["Analytics", ["analytics.tools.ts"]],
	["Logging", ["logging.tools.ts"]],
	["Tracing", ["tracing.tools.ts"]],
	["Users & Workspaces", ["users.tools.ts", "workspaces.tools.ts"]],
	["Audit", ["audit.tools.ts"]],
]);

function namesForFile(fileName) {
	const source = readFileSync(path.join(toolsDir, fileName), "utf8");
	const literalNames = [
		...source.matchAll(/server\.(?:tool|registerTool)\(\s*["']([^"']+)["']/gms),
	].map((match) => match[1]);
	return [...literalNames, ...findTableDrivenToolNames(source)];
}

function expectedCategoryCount(sources) {
	let filter;
	const fileNames = sources.filter((value) => {
		if (value instanceof RegExp) {
			filter = value;
			return false;
		}
		return true;
	});
	const names = fileNames.flatMap(namesForFile);
	return filter
		? names.filter((name) => filter.test(name)).length
		: names.length;
}

// Check for duplicate tool registrations
const failures = [];

if (codeToolNames.length !== codeToolSet.size) {
	failures.push(
		`Duplicate tool registrations in source: total=${codeToolNames.length}, unique=${codeToolSet.size}`,
	);
}

// Verify the README mentions the correct total count
const readme = readFileSync(readmePath, "utf8");
const endpoints = readFileSync(endpointsPath, "utf8");
const countMatch = readme.match(/\*\*(\d+)\s+tools\s+total/);
if (countMatch) {
	const readmeCount = Number.parseInt(countMatch[1], 10);
	if (readmeCount !== codeToolSet.size) {
		failures.push(
			`README total count mismatch: README says ${readmeCount}, source has ${codeToolSet.size}`,
		);
	}
}

if (
	!endpoints.includes(
		`Total: ${codeToolSet.size} tools across ${toolFileNames.length} domains`,
	)
) {
	failures.push("ENDPOINTS.md total/domain inventory is stale");
}
const endpointsCatalog = endpoints.match(
	/<!-- tool-catalog:start -->(.*?)<!-- tool-catalog:end -->/s,
)?.[1];
if (!endpointsCatalog) {
	failures.push("ENDPOINTS.md generated tool catalog markers are missing");
}
for (const name of codeToolSet) {
	const occurrences =
		(endpointsCatalog ?? "").split(`| \`${name}\` |`).length - 1;
	if (occurrences !== 1) {
		failures.push(
			`ENDPOINTS.md must contain exactly one catalog row for ${name}; found ${occurrences}`,
		);
	}
}

for (const [label, sources] of README_CATEGORY_SOURCES) {
	const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = readme.match(
		new RegExp(`^\\| \\*\\*${escapedLabel}\\*\\* \\| (\\d+) \\|`, "m"),
	);
	const expected = expectedCategoryCount(sources);
	if (!match) {
		failures.push(`README category row missing: ${label}`);
	} else if (Number(match[1]) !== expected) {
		failures.push(
			`README category count mismatch for ${label}: README says ${match[1]}, source has ${expected}`,
		);
	}
}

const toolIndexSource = readFileSync(toolIndexPath, "utf8");
const domainBlock = toolIndexSource.match(
	/const TOOL_DOMAIN_REGISTRARS = \[(.*?)\] as const/s,
);
const domainNames = [
	...(domainBlock?.[1] ?? "").matchAll(/\["([^"]+)",\s*register/g),
].map((match) => match[1]);
if (!readme.includes(`${domainNames.length} tool domains`)) {
	failures.push(
		`README must state the current ${domainNames.length} tool domains`,
	);
}

const gatedBlock = toolIndexSource.match(
	/const ENTERPRISE_GATED_TOOL_NAMES = new Set\(\[(.*?)\]\);/s,
);
const gatedNames = new Set(
	[...(gatedBlock?.[1] ?? "").matchAll(/["']([^"']+)["']/g)].map(
		(match) => match[1],
	),
);
const gatedSection = readme.match(
	/### Enterprise-gated tools \(\d+\)(.*?)### Other scope requirements/s,
)?.[1];
const documentedGatedNames = new Set(
	[...(gatedSection ?? "").matchAll(/`([a-z][a-z0-9_]+)`/g)].map(
		(match) => match[1],
	),
);
const gatedCount = readme.match(/### Enterprise-gated tools \((\d+)\)/)?.[1];
if (Number(gatedCount) !== gatedNames.size) {
	failures.push(
		`README Enterprise-gated count mismatch: README says ${gatedCount ?? "none"}, source has ${gatedNames.size}`,
	);
}
for (const name of gatedNames) {
	if (!documentedGatedNames.has(name)) {
		failures.push(`README Enterprise-gated inventory missing ${name}`);
	}
}
for (const name of documentedGatedNames) {
	if (!gatedNames.has(name)) {
		failures.push(`README Enterprise-gated inventory has stale entry ${name}`);
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
