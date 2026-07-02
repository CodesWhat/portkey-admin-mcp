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

const transport = new StdioClientTransport({
	command: "node",
	args: [resolve(ROOT, "build/index.js")],
	// tools/list never calls the Portkey API, so a dummy key is fine here.
	env: { ...process.env, PORTKEY_API_KEY: "manifest-generation-dummy-key" },
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

if (tools.length === 0) {
	console.error(
		"Server returned no tools; refusing to write an empty manifest.",
	);
	process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
manifest.tools = tools.map(({ name, description, inputSchema }) => ({
	name,
	description,
	inputSchema,
}));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(`Wrote ${tools.length} tools to lhm.plugin.json`);
