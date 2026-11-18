/**
 * Drives tools through a real createMcpServer + in-memory client so the output
 * schemas run against upstream-shaped responses. Calling the raw tool callbacks
 * skips that validation, which is how a rotate_api_key output schema that
 * rejected a valid upstream response went unnoticed.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createMcpServer } from "../src/lib/mcp-server.js";

const ORIGINAL_ENV = { ...process.env };
const API_KEY_ID = "550e8400-e29b-41d4-a716-446655440000";
const REFERENCE_ID = "3c90c3cc-0d44-4b50-8888-8dd25736052a";

let originalFetch: typeof globalThis.fetch;
let upstreamBody: unknown;
let upstreamCalls: Array<{ url: string; method: string }>;

beforeEach(() => {
	process.env.PORTKEY_API_KEY = "test-key-output-validation";
	delete process.env.PORTKEY_TOOL_DOMAINS;
	originalFetch = globalThis.fetch;
	upstreamCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		upstreamCalls.push({
			url: String(input instanceof Request ? input.url : input),
			method: init?.method ?? "GET",
		});
		return new Response(JSON.stringify(upstreamBody), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof globalThis.fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env = { ...ORIGINAL_ENV };
});

async function callTool(
	name: string,
	args: Record<string, unknown>,
): Promise<{
	isError?: boolean;
	structuredContent?: Record<string, unknown>;
	content?: unknown;
}> {
	const { server } = createMcpServer({
		toolDomains: ["keys", "secret-references"],
	});
	const client = new Client({
		name: "output-validation-test",
		version: "1.0.0",
	});
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		return (await client.callTool({ name, arguments: args })) as never;
	} finally {
		await Promise.allSettled([client.close(), server.close()]);
	}
}

describe("rotate_api_key output validation", () => {
	for (const [label, transition] of [
		[
			"a Z timestamp",
			{ key_transition_expires_at: "2026-07-14T12:00:00.000Z" },
		],
		[
			"an RFC 3339 offset timestamp",
			{ key_transition_expires_at: "2026-07-14T12:00:00+00:00" },
		],
		["an omitted key_transition_expires_at", {}],
	] as const) {
		it(`keeps the new key for ${label}`, async () => {
			upstreamBody = { id: API_KEY_ID, key: "pk-new-secret", ...transition };
			const result = await callTool("rotate_api_key", { id: API_KEY_ID });

			assert.notEqual(result.isError, true, JSON.stringify(result.content));
			assert.equal(upstreamCalls.length, 1);
			const data = result.structuredContent?.data as Record<string, unknown>;
			assert.equal(data.key, "pk-new-secret");
			assert.equal(data.id, API_KEY_ID);
		});
	}
});

describe("list_secret_references output validation", () => {
	const reference = {
		id: REFERENCE_ID,
		name: "prod-vault",
		slug: "prod-vault",
		manager_type: "hashicorp_vault",
		status: "ACTIVE",
		created_at: "2026-07-14T00:00:00.000Z",
		last_updated_at: "2026-07-14T00:00:00.000Z",
	};

	it("accepts RFC 3339 offset timestamps", async () => {
		upstreamBody = {
			total: 1,
			object: "list",
			data: [
				{
					...reference,
					created_at: "2026-07-14T00:00:00+00:00",
					last_updated_at: "2026-07-14T02:00:00+02:00",
				},
			],
		};
		const result = await callTool("list_secret_references", {});
		assert.notEqual(result.isError, true, JSON.stringify(result.content));
		const data = result.structuredContent?.data as {
			secret_references: Array<Record<string, unknown>>;
		};
		assert.equal(
			data.secret_references[0]?.created_at,
			"2026-07-14T00:00:00+00:00",
		);
	});

	it("accepts a status other than ACTIVE", async () => {
		upstreamBody = {
			total: 1,
			object: "list",
			data: [{ ...reference, status: "ARCHIVED" }],
		};
		const result = await callTool("list_secret_references", {});
		assert.notEqual(result.isError, true, JSON.stringify(result.content));
		const data = result.structuredContent?.data as {
			secret_references: Array<Record<string, unknown>>;
		};
		assert.equal(data.secret_references[0]?.status, "ARCHIVED");
	});
});

describe("get_secret_reference output validation", () => {
	it("accepts a status other than ACTIVE", async () => {
		upstreamBody = {
			id: REFERENCE_ID,
			name: "prod-vault",
			slug: "prod-vault",
			manager_type: "hashicorp_vault",
			auth_config: {},
			object: "secret-reference",
			organisation_id: REFERENCE_ID,
			description: "",
			secret_path: "secret/data/prod",
			secret_key: "key",
			allow_all_workspaces: true,
			tags: {},
			created_by: "user-1",
			status: "ARCHIVED",
			created_at: "2026-07-14T00:00:00.000Z",
			last_updated_at: "2026-07-14T00:00:00.000Z",
		};
		const result = await callTool("get_secret_reference", {
			id: REFERENCE_ID,
		});
		assert.notEqual(result.isError, true, JSON.stringify(result.content));
		assert.equal(upstreamCalls.length, 1);
		const data = result.structuredContent?.data as Record<string, unknown>;
		assert.equal(data.status, "ARCHIVED");
	});
});
