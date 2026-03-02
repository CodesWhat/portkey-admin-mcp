#!/usr/bin/env tsx
/**
 * Fixture Recorder — Records live Portkey API responses for contract testing.
 *
 * Usage: PORTKEY_API_KEY=pk-xxx tsx tests/fixtures/record.ts
 *
 * Calls read-only endpoints (list/get) and saves responses as JSON fixtures.
 * These fixtures are committed to the repo and used by contract tests in CI.
 *
 * NOTE: This script only calls non-destructive read endpoints.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESPONSES_DIR = join(__dirname, "responses");

const BASE_URL = process.env.PORTKEY_BASE_URL ?? "https://api.portkey.ai/v1";
const API_KEY = process.env.PORTKEY_API_KEY;

if (!API_KEY) {
	console.error("PORTKEY_API_KEY is required");
	process.exit(1);
}

mkdirSync(RESPONSES_DIR, { recursive: true });

interface Endpoint {
	name: string;
	path: string;
}

const ENDPOINTS: Endpoint[] = [
	{ name: "configs-list", path: "/configs" },
	{ name: "prompts-list", path: "/prompts" },
	{ name: "virtual-keys-list", path: "/virtual-keys" },
	{ name: "api-keys-list", path: "/api-keys" },
];

async function fetchEndpoint(endpoint: Endpoint): Promise<void> {
	const url = `${BASE_URL}${endpoint.path}`;
	console.log(`  GET ${endpoint.path} ...`);

	const response = await fetch(url, {
		headers: {
			"x-portkey-api-key": API_KEY as string,
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		console.error(`  FAILED ${endpoint.name}: HTTP ${response.status}`);
		const body = await response.text();
		console.error(`  ${body.slice(0, 200)}`);
		return;
	}

	const data = await response.json();
	const filePath = join(RESPONSES_DIR, `${endpoint.name}.json`);
	writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
	console.log(`  Saved ${filePath}`);

	// If the list has items, record the first item's detail endpoint
	const items = data.data ?? data;
	if (Array.isArray(items) && items.length > 0) {
		const first = items[0];
		const id = first.slug ?? first.id;
		if (id) {
			const detailName = endpoint.name.replace("-list", "-get");
			const detailPath = `${endpoint.path}/${id}`;
			console.log(`  GET ${detailPath} ...`);

			const detailResponse = await fetch(`${BASE_URL}${detailPath}`, {
				headers: {
					"x-portkey-api-key": API_KEY as string,
					Accept: "application/json",
				},
			});

			if (detailResponse.ok) {
				const detailData = await detailResponse.json();
				const detailFilePath = join(
					RESPONSES_DIR,
					`${detailName}.json`,
				);
				writeFileSync(
					detailFilePath,
					JSON.stringify(detailData, null, 2) + "\n",
				);
				console.log(`  Saved ${detailFilePath}`);
			}
		}
	}
}

async function main(): Promise<void> {
	console.log("Recording Portkey API fixtures...\n");

	for (const endpoint of ENDPOINTS) {
		await fetchEndpoint(endpoint);
		console.log();
	}

	console.log("Done. Commit fixtures in tests/fixtures/responses/");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
