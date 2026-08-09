#!/usr/bin/env node
/**
 * Regenerate the MCP capability arrays in lhm.plugin.json from the built
 * server, so the LobeHub owner manifest cannot drift from tools/list,
 * prompts/list, resources/list, or resources/templates/list. Requires a fresh
 * `npm run build`.
 *
 * Usage: node scripts/generate-lobehub-tools.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = resolve(ROOT, "lhm.plugin.json");
const PACKAGE_JSON = resolve(ROOT, "package.json");

// Strip the domain-filter knobs: a stray PORTKEY_TOOL_DOMAINS/MCP_TOOL_DOMAINS
// exported in the caller's shell would make the server register a subset and
// this script silently write a truncated manifest.
const {
	PORTKEY_TOOL_DOMAINS: _ptd,
	MCP_TOOL_DOMAINS: _mtd,
	...cleanEnv
} = process.env;

const transport = new StdioClientTransport({
	command: "node",
	args: [resolve(ROOT, "build/index.js")],
	// tools/list never calls the Portkey API, so a dummy key is fine here.
	env: { ...cleanEnv, PORTKEY_API_KEY: "manifest-generation-dummy-key" },
	stderr: "pipe",
});
transport.stderr?.on("data", () => undefined);
const client = new Client({
	name: "lobehub-manifest-generator",
	version: "1.0.0",
});

async function collectPages(listPage, field) {
	const items = [];
	let cursor;
	do {
		const page = await listPage(cursor ? { cursor } : {});
		items.push(...(page[field] ?? []));
		cursor = page.nextCursor;
	} while (cursor);
	return items;
}

let tools;
let prompts;
let resources;
let resourceTemplates;
try {
	await client.connect(transport);
	tools = await collectPages((params) => client.listTools(params), "tools");
	prompts = await collectPages(
		(params) => client.listPrompts(params),
		"prompts",
	);
	resources = await collectPages(
		(params) => client.listResources(params),
		"resources",
	);
	resourceTemplates = await collectPages(
		(params) => client.listResourceTemplates(params),
		"resourceTemplates",
	);
} finally {
	await client.close().catch(() => undefined);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const packageMetadata = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));

// A shrinking tool list means something filtered or broke upstream — never
// silently publish fewer tools than the manifest already had.
if (tools.length < manifest.tools.length) {
	console.error(
		`Server returned ${tools.length} tools but the manifest has ${manifest.tools.length}; refusing to write a truncated manifest.`,
	);
	process.exit(1);
}

const manifestResourceCount = manifest.resources?.length ?? 0;
const discoveredResourceCount = resources.length + resourceTemplates.length;
if (discoveredResourceCount < manifestResourceCount) {
	console.error(
		`Server returned ${discoveredResourceCount} resources/templates but the manifest has ${manifestResourceCount}; refusing to write a truncated manifest.`,
	);
	process.exit(1);
}

if (prompts.length < (manifest.prompts?.length ?? 0)) {
	console.error(
		`Server returned ${prompts.length} prompts but the manifest has ${manifest.prompts.length}; refusing to write a truncated manifest.`,
	);
	process.exit(1);
}

manifest.tools = tools.map(
	({ name, description, inputSchema, annotations }) => ({
		name,
		description,
		inputSchema,
		...(annotations ? { annotations } : {}),
	}),
);
manifest.prompts = prompts;
manifest.resources = [...resources, ...resourceTemplates];
manifest.version = packageMetadata.version;
manifest.description = `Portkey Admin API MCP server with current control-plane coverage, ${tools.length} tools, and Prisma AIRS interoperability guidance.`;
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(
	`Wrote ${tools.length} tools, ${prompts.length} prompts, and ${discoveredResourceCount} resources/templates to lhm.plugin.json`,
);
