#!/usr/bin/env tsx
/**
 * Fixture Recorder — Records live Portkey API responses for contract testing.
 *
 * Read-only usage: PORTKEY_API_KEY=pk-xxx tsx tests/fixtures/record.ts
 * Disposable mutation fixtures:
 * PORTKEY_API_KEY=pk-xxx PORTKEY_FIXTURES=api-key-rotation,secret-references \
 *   PORTKEY_RECORD_MUTATIONS=true tsx tests/fixtures/record.ts
 *
 * Calls read-only endpoints (list/get) and saves responses as JSON fixtures.
 * Mutation fixtures are opt-in, use disposable resources, redact returned
 * secrets, and clean up in finally blocks.
 * These fixtures are committed to the repo and used by contract tests in CI.
 *
 * By default this script only calls read endpoints. Mutation capture requires
 * PORTKEY_RECORD_MUTATIONS=true and creates disposable resources that are
 * deleted in finally blocks.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESPONSES_DIR = join(__dirname, "responses");
const MANIFEST_PATH = join(__dirname, "manifest.json");

const recordedFixtures = new Set<string>();

function saveFixture(name: string, data: unknown): void {
	const filePath = join(RESPONSES_DIR, `${name}.json`);
	writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
	recordedFixtures.add(name);
	console.log(`  Saved ${filePath}`);
}

function writeManifest(): void {
	let documentationDerivedFixtures: string[] = [];
	let liveCaptureStatus: string | undefined;
	try {
		const previous = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
			documentationDerivedFixtures?: string[];
			liveCaptureStatus?: string;
		};
		documentationDerivedFixtures = (
			previous.documentationDerivedFixtures ?? []
		).filter((name) => !recordedFixtures.has(name));
		liveCaptureStatus = previous.liveCaptureStatus;
	} catch {
		// The first capture has no prior provenance to preserve.
	}
	const manifest = {
		_comment:
			"Provenance for the recorded Portkey Admin API fixtures used by contract tests. Regenerate with `PORTKEY_API_KEY=... npm run record:fixtures`, which rewrites this file and stamps recordedAt. The contract suite asserts this list stays in sync with tests/fixtures/responses/.",
		recordedAt: new Date().toISOString().slice(0, 10),
		source: BASE_URL,
		recorderScript: "tests/fixtures/record.ts",
		...(documentationDerivedFixtures.length > 0
			? { documentationDerivedFixtures, liveCaptureStatus }
			: {}),
		fixtures: readdirSync(RESPONSES_DIR)
			.filter((file) => file.endsWith(".json"))
			.map((file) => file.replace(/\.json$/, ""))
			.sort(),
	};
	writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
	console.log(`  Wrote ${MANIFEST_PATH}`);
}

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
	{ name: "workspaces-list", path: "/admin/workspaces" },
	{ name: "users-list", path: "/admin/users" },
	{ name: "secret-references-list", path: "/secret-references" },
];

async function requestJson(
	method: "GET" | "POST" | "DELETE",
	path: string,
	body?: unknown,
): Promise<unknown> {
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			"x-portkey-api-key": API_KEY as string,
			Accept: "application/json",
			...(body === undefined ? {} : { "Content-Type": "application/json" }),
		},
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
	}
	if (response.status === 204) return {};
	const text = await response.text();
	return text ? JSON.parse(text) : {};
}

async function recordDisposableApiKeyRotation(): Promise<void> {
	let keyId: string | undefined;
	let fixture: Record<string, unknown> | undefined;
	try {
		const created = (await requestJson(
			"POST",
			"/api-keys/organisation/service",
			{
				name: `mcp-fixture-rotation-${Date.now()}`,
				description: "Disposable contract-fixture key; safe to delete",
				scopes: ["completions.write"],
				expires_at: new Date(Date.now() + 3_600_000).toISOString(),
			},
		)) as { id?: string };
		if (!created.id) throw new Error("API-key creation response omitted id");
		keyId = created.id;
		const rotated = (await requestJson(
			"POST",
			`/api-keys/${encodeURIComponent(keyId)}/rotate`,
			{ key_transition_period_ms: 1_800_000 },
		)) as Record<string, unknown>;
		if (typeof rotated.key !== "string") {
			throw new Error("API-key rotation response omitted key");
		}
		// Never persist or print the real one-time secret returned by rotation.
		fixture = {
			...rotated,
			key: "[REDACTED_LIVE_ROTATED_KEY]",
		};
	} finally {
		if (keyId) {
			await requestJson("DELETE", `/api-keys/${encodeURIComponent(keyId)}`);
		}
	}
	if (fixture) {
		saveFixture("api-keys-rotate", fixture);
	}
}

async function recordDisposableSecretReference(): Promise<void> {
	let referenceId: string | undefined;
	let createFixture: unknown;
	let getFixture: unknown;
	let listFixture: unknown;
	const uniqueName = `mcp-fixture-secret-${Date.now()}`;
	try {
		const created = (await requestJson("POST", "/secret-references", {
			name: uniqueName,
			manager_type: "aws_sm",
			auth_config: {
				aws_auth_type: "serviceRole",
				aws_region: "us-east-1",
			},
			secret_path: "mcp-fixtures/nonexistent",
			allow_all_workspaces: true,
			tags: { purpose: "contract-fixture" },
		})) as { id?: string };
		if (!created.id) {
			throw new Error("Secret Reference creation response omitted id");
		}
		referenceId = created.id;
		createFixture = created;
		getFixture = await requestJson(
			"GET",
			`/secret-references/${encodeURIComponent(referenceId)}`,
		);
		listFixture = await requestJson(
			"GET",
			`/secret-references?search=${encodeURIComponent(uniqueName)}&current_page=0&page_size=20`,
		);
	} finally {
		if (referenceId) {
			await requestJson(
				"DELETE",
				`/secret-references/${encodeURIComponent(referenceId)}`,
			);
		}
	}
	if (createFixture && getFixture && listFixture) {
		saveFixture("secret-references-create", createFixture);
		saveFixture("secret-references-get", getFixture);
		saveFixture("secret-references-list", listFixture);
	}
}

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
	saveFixture(endpoint.name, data);

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
				saveFixture(detailName, detailData);
			}
		}
	}
}

async function main(): Promise<void> {
	console.log("Recording Portkey API fixtures...\n");
	const selected = new Set(
		(process.env.PORTKEY_FIXTURES ?? "")
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
	const recordAll = selected.size === 0;

	for (const endpoint of ENDPOINTS.filter(
		(endpoint) => recordAll || selected.has(endpoint.name),
	)) {
		await fetchEndpoint(endpoint);
		console.log();
	}

	if (process.env.PORTKEY_RECORD_MUTATIONS === "true") {
		if (recordAll || selected.has("api-key-rotation")) {
			console.log("  Recording disposable API-key rotation fixture ...");
			await recordDisposableApiKeyRotation();
		}
		if (recordAll || selected.has("secret-references")) {
			console.log("  Recording disposable Secret Reference fixtures ...");
			await recordDisposableSecretReference();
		}
	} else if (
		selected.has("api-key-rotation") ||
		selected.has("secret-references")
	) {
		throw new Error(
			"Disposable mutation fixtures require PORTKEY_RECORD_MUTATIONS=true",
		);
	}

	writeManifest();
	console.log("Done. Commit fixtures in tests/fixtures/responses/");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
