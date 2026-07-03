#!/usr/bin/env node
/**
 * Regenerate the tools array in lhm.plugin.json from the built server, so the
 * LobeHub manifest cannot drift from what the server actually registers
 * (descriptions and input schemas are read over MCP tools/list, not from
 * source). Requires a fresh `npm run build`.
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
const client = new Client({
	name: "lobehub-manifest-generator",
	version: "1.0.0",
});
await client.connect(transport);

const tools = [];
let cursor;
do {
	const page = await client.listTools(cursor ? { cursor } : {});
	tools.push(...page.tools);
	cursor = page.nextCursor;
} while (cursor);
await client.close();

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// A shrinking tool list means something filtered or broke upstream — never
// silently publish fewer tools than the manifest already had.
if (tools.length < manifest.tools.length) {
	console.error(
		`Server returned ${tools.length} tools but the manifest has ${manifest.tools.length}; refusing to write a truncated manifest.`,
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
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(`Wrote ${tools.length} tools to lhm.plugin.json`);
