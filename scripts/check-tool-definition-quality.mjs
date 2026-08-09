#!/usr/bin/env node
/**
 * Deterministic release preflight based on Glama's Tool Definition Quality
 * Score (TDQS) context signals and hard gates. The six scored TDQS dimensions
 * still require Glama's LLM evaluation after indexing; this script catches the
 * reproducible definition defects locally before publication.
 *
 * Specification:
 * https://github.com/glama-ai/tool-definition-quality-score
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_ANNOTATIONS = [
	"readOnlyHint",
	"destructiveHint",
	"idempotentHint",
	"openWorldHint",
];
const GUIDANCE_PATTERN =
	/\b(?:instead of|unlike|distinct from|rather than)\b|does not|\buse this (?:before|after|when)\b|\b(?:review|inspect) (?:the )?(?:matching )?(?:list|read|detail) tool\b/i;
const TOOL_REFERENCE_PATTERN = /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/gi;

const {
	PORTKEY_TOOL_DOMAINS: _portkeyDomains,
	MCP_TOOL_DOMAINS: _mcpDomains,
	...cleanEnv
} = process.env;

const transport = new StdioClientTransport({
	command: "node",
	args: [resolve(ROOT, "build/index.js")],
	env: { ...cleanEnv, PORTKEY_API_KEY: "tdqs-preflight-dummy-key" },
	stderr: "pipe",
});
// The child writes startup diagnostics to stderr. Drain the pipe before
// connecting so enough output can never block the MCP stdio transport.
transport.stderr?.on("data", () => undefined);
const client = new Client({ name: "tdqs-release-preflight", version: "1.0.0" });

const tools = [];
try {
	await client.connect(transport);
	let cursor;
	do {
		const page = await client.listTools(cursor ? { cursor } : {});
		tools.push(...page.tools);
		cursor = page.nextCursor;
	} while (cursor);
} finally {
	await client.close().catch(() => undefined);
}

const failures = [];
const manifestToolCount = JSON.parse(
	readFileSync(resolve(ROOT, "lhm.plugin.json"), "utf8"),
).tools.length;
const signals = {
	toolCount: tools.length,
	descriptionsPresent: 0,
	nonTautologicalDescriptions: 0,
	schemaDescriptionCoverage: 0,
	toolsWithOutputSchema: 0,
	toolsWithAnnotations: 0,
	toolsWithSelectionGuidance: 0,
};
let parameterCount = 0;
let describedParameterCount = 0;

function* walkParameters(schema, path) {
	if (!schema || typeof schema !== "object") return;
	for (const [name, child] of Object.entries(schema.properties ?? {})) {
		const childPath = `${path}.${name}`;
		yield [childPath, child];
		yield* walkParameters(child, childPath);
	}
	if (schema.items) yield* walkParameters(schema.items, `${path}[]`);
	for (const keyword of ["anyOf", "oneOf", "allOf"]) {
		for (const branch of schema[keyword] ?? []) {
			yield* walkParameters(branch, path);
		}
	}
}

const toolNames = new Set(tools.map((tool) => tool.name));
function hasSelectionGuidance(tool) {
	const description = tool.description ?? "";
	if (GUIDANCE_PATTERN.test(description)) return true;

	return [...description.matchAll(TOOL_REFERENCE_PATTERN)].some(
		([candidate]) => candidate !== tool.name && toolNames.has(candidate),
	);
}

for (const tool of tools) {
	const description = tool.description?.trim() ?? "";
	const title = tool.title ?? tool.annotations?.title ?? "";
	if (!description) {
		failures.push(`${tool.name}: missing description`);
	} else {
		signals.descriptionsPresent += 1;
	}

	if (
		description &&
		description.toLowerCase() !== tool.name.trim().toLowerCase() &&
		description.toLowerCase() !== String(title).trim().toLowerCase()
	) {
		signals.nonTautologicalDescriptions += 1;
	} else if (description) {
		failures.push(`${tool.name}: tautological description`);
	}

	if (hasSelectionGuidance(tool)) {
		signals.toolsWithSelectionGuidance += 1;
	}

	for (const [parameterName, schema] of walkParameters(
		tool.inputSchema,
		tool.name,
	)) {
		parameterCount += 1;
		if (schema?.description?.trim()) {
			describedParameterCount += 1;
		} else {
			failures.push(`${parameterName}: missing parameter description`);
		}
	}

	if (tool.outputSchema && Object.keys(tool.outputSchema).length > 0) {
		signals.toolsWithOutputSchema += 1;
	} else {
		failures.push(`${tool.name}: missing output schema`);
	}

	const annotations = tool.annotations ?? {};
	const missingAnnotations = REQUIRED_ANNOTATIONS.filter(
		(key) => typeof annotations[key] !== "boolean",
	);
	if (missingAnnotations.length === 0) {
		signals.toolsWithAnnotations += 1;
	} else {
		failures.push(
			`${tool.name}: missing annotations ${missingAnnotations.join(", ")}`,
		);
	}
}

signals.schemaDescriptionCoverage =
	parameterCount === 0
		? 100
		: Math.round((describedParameterCount / parameterCount) * 100);

const guidanceCoverage =
	tools.length === 0
		? 0
		: Math.round((signals.toolsWithSelectionGuidance / tools.length) * 100);
if (guidanceCoverage < 75) {
	failures.push(
		`selection guidance coverage is ${guidanceCoverage}%; expected at least 75%`,
	);
}

if (tools.length < manifestToolCount) {
	failures.push(
		`server exposed ${tools.length} tools but lhm.plugin.json declares ${manifestToolCount}`,
	);
}

const report = {
	framework:
		"Glama Tool Definition Quality Score (TDQS) deterministic preflight",
	...signals,
	parameterCount,
	describedParameterCount,
	selectionGuidanceCoverage: guidanceCoverage,
	status: failures.length === 0 ? "pass" : "fail",
	failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
