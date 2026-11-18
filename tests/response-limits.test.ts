import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import {
	assertByteLimitsConfigured,
	DEFAULT_MAX_TOOL_RESULT_BYTES,
	DEFAULT_MAX_UPSTREAM_BODY_BYTES,
	FetchError,
	fetchWithTimeout,
	getMaxToolResultBytes,
	getMaxUpstreamBodyBytes,
	parseErrorResponse,
	ResponseBodyTooLargeError,
	readBoundedJson,
	readBoundedText,
	resolveByteLimit,
} from "../src/lib/fetch.js";
import { createMcpServer } from "../src/lib/mcp-server.js";
import { BaseService } from "../src/services/base.service.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
	process.env.PORTKEY_API_KEY = "test-key-response-limits";
	delete process.env.PORTKEY_BASE_URL;
	delete process.env.PORTKEY_MAX_UPSTREAM_BODY_BYTES;
	delete process.env.PORTKEY_MAX_TOOL_RESULT_BYTES;
});

afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	process.env = { ...ORIGINAL_ENV };
});

function streamOf(chunks: Uint8Array[], onCancel?: () => void): Response {
	let index = 0;
	return new Response(
		new ReadableStream<Uint8Array>({
			pull(controller) {
				const chunk = chunks[index++];
				if (chunk) controller.enqueue(chunk);
				else controller.close();
			},
			cancel() {
				onCancel?.();
			},
		}),
	);
}

describe("readBoundedText", () => {
	it("accepts a body of exactly the limit and rejects one byte more", async () => {
		const exact = new Response("a".repeat(100));
		assert.equal((await readBoundedText(exact, 100)).length, 100);

		await assert.rejects(
			readBoundedText(new Response("a".repeat(101)), 100),
			(error: unknown) =>
				error instanceof ResponseBodyTooLargeError && error.limit === 100,
		);
	});

	it("counts bytes, not characters, for multibyte content", async () => {
		const fiveE = "é".repeat(5); // 10 bytes
		assert.equal(await readBoundedText(new Response(fiveE), 10), fiveE);
		await assert.rejects(
			readBoundedText(new Response(fiveE), 9),
			ResponseBodyTooLargeError,
		);

		const emoji = "\u{1F600}".repeat(3); // 12 bytes
		assert.equal(await readBoundedText(new Response(emoji), 12), emoji);
		await assert.rejects(
			readBoundedText(new Response(emoji), 11),
			ResponseBodyTooLargeError,
		);
	});

	it("decodes a multibyte character split across chunks", async () => {
		const bytes = new TextEncoder().encode("éé");
		const response = streamOf([bytes.slice(0, 1), bytes.slice(1)]);
		assert.equal(await readBoundedText(response, 4), "éé");
	});

	it("ignores a Content-Length that understates the body", async () => {
		const response = new Response("a".repeat(500), {
			headers: { "content-length": "5" },
		});
		await assert.rejects(
			readBoundedText(response, 100),
			ResponseBodyTooLargeError,
		);
	});

	it("ignores a Content-Length that overstates the body", async () => {
		const response = new Response("ok", {
			headers: { "content-length": "999999999" },
		});
		assert.equal(await readBoundedText(response, 100), "ok");
	});

	it("cancels the stream as soon as the limit is passed", async () => {
		let cancelled = false;
		let pulled = 0;
		const response = new Response(
			new ReadableStream<Uint8Array>({
				pull(controller) {
					pulled += 1;
					controller.enqueue(new Uint8Array(40));
				},
				cancel() {
					cancelled = true;
				},
			}),
		);
		await assert.rejects(
			readBoundedText(response, 100),
			ResponseBodyTooLargeError,
		);
		assert.equal(cancelled, true);
		assert.ok(pulled < 10, `read ${pulled} chunks from an endless body`);
	});

	it("still rejects when the deadline fires while the body is streaming", async () => {
		globalThis.fetch = (async (
			_url: string | URL | Request,
			init?: RequestInit,
		) =>
			new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("{"));
						init?.signal?.addEventListener("abort", () =>
							controller.error(init.signal?.reason),
						);
					},
				}),
			)) as typeof globalThis.fetch;

		const response = await fetchWithTimeout("https://api.example.com/x", {
			timeout: 30,
		});
		await assert.rejects(readBoundedText(response, 1000));
	});

	it("parses JSON and keeps response.json() failure semantics", async () => {
		assert.deepEqual(await readBoundedJson(new Response('{"a":1}'), 100), {
			a: 1,
		});
		await assert.rejects(readBoundedJson(new Response(""), 100), SyntaxError);
	});
});

describe("byte limit configuration", () => {
	it("uses the documented defaults", () => {
		assert.equal(getMaxUpstreamBodyBytes(), 8 * 1024 * 1024);
		assert.equal(getMaxToolResultBytes(), 4 * 1024 * 1024);
		assert.equal(DEFAULT_MAX_UPSTREAM_BODY_BYTES, 8_388_608);
		assert.equal(DEFAULT_MAX_TOOL_RESULT_BYTES, 4_194_304);
	});

	it("reads valid overrides and treats blank as unset", () => {
		process.env.PORTKEY_MAX_UPSTREAM_BODY_BYTES = " 1024 ";
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "  ";
		assert.equal(getMaxUpstreamBodyBytes(), 1024);
		assert.equal(getMaxToolResultBytes(), DEFAULT_MAX_TOOL_RESULT_BYTES);
	});

	for (const bad of ["abc", "0", "-5", "1.5", "1e6", "0x10", "2147483648"]) {
		it(`rejects ${JSON.stringify(bad)}`, () => {
			process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = bad;
			assert.throws(
				() => resolveByteLimit("PORTKEY_MAX_TOOL_RESULT_BYTES", 10),
				/Invalid PORTKEY_MAX_TOOL_RESULT_BYTES value/,
			);
			assert.throws(
				() => assertByteLimitsConfigured(),
				/PORTKEY_MAX_TOOL_RESULT_BYTES/,
			);
		});
	}
});

class RequestClient extends BaseService {
	request(path: string): Promise<unknown> {
		return this.get(path);
	}
}

describe("BaseService upstream body limit", () => {
	it("returns a body at the limit and errors explicitly above it", async () => {
		const body = JSON.stringify({ data: "x".repeat(50) });
		process.env.PORTKEY_MAX_UPSTREAM_BODY_BYTES = String(
			Buffer.byteLength(body),
		);
		globalThis.fetch = (async () =>
			new Response(body, {
				headers: { "content-length": "1" },
			})) as typeof globalThis.fetch;
		const client = new RequestClient("test-key");
		assert.deepEqual(await client.request("/ok"), JSON.parse(body));

		process.env.PORTKEY_MAX_UPSTREAM_BODY_BYTES = String(
			Buffer.byteLength(body) - 1,
		);
		await assert.rejects(
			client.request("/big"),
			/GET \/big returned a response larger than \d+ bytes \(PORTKEY_MAX_UPSTREAM_BODY_BYTES\)/,
		);
	});

	it("limits error bodies and keeps the HTTP status", async () => {
		process.env.PORTKEY_MAX_UPSTREAM_BODY_BYTES = "100";
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: { message: "x".repeat(500) } }), {
				status: 500,
			})) as typeof globalThis.fetch;

		await assert.rejects(
			new RequestClient("test-key").request("/err"),
			(error: unknown) =>
				error instanceof FetchError &&
				error.status === 500 &&
				/status: 500 \(error body over the 100-byte limit\)/.test(
					error.message,
				),
		);
	});

	it("keeps parsing small error bodies", async () => {
		const parsed = await parseErrorResponse(
			new Response(JSON.stringify({ error: { message: "nope" } }), {
				status: 400,
			}),
			1000,
		);
		assert.equal(parsed.message, "nope");
	});
});

async function callTool(
	name: string,
	args: Record<string, unknown>,
	toolDomains: Array<"logging" | "configs">,
) {
	const { server } = createMcpServer({ toolDomains });
	const client = new Client({ name: "response-limits-test", version: "1.0.0" });
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	try {
		await server.connect(serverTransport);
		await client.connect(clientTransport);
		return await client.callTool({ name, arguments: args });
	} finally {
		await Promise.allSettled([client.close(), server.close()]);
	}
}

function respondWith(body: unknown): void {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			headers: { "content-type": "application/json" },
		})) as typeof globalThis.fetch;
}

describe("tool result size limit", () => {
	const BIG = "x".repeat(5000);

	it("returns an explicit error for an oversized get_log result", async () => {
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "6000";
		respondWith({ id: "log-1", request: { body: BIG } });
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);

		assert.equal(result.isError, true);
		const text = JSON.stringify(result.content);
		assert.match(text, /over the 6000-byte limit/);
		assert.match(text, /PORTKEY_MAX_TOOL_RESULT_BYTES/);
		assert.match(text, /Nothing was truncated/);
		assert.ok(!text.includes(BIG));
		assert.ok(text.length < 1000);
	});

	it("returns an explicit error for an oversized list_config_versions result", async () => {
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "6000";
		respondWith({
			object: "list",
			total: 1,
			data: [
				{
					id: "v1",
					version_id: "ver-1",
					config: JSON.stringify({ big: BIG }),
				},
			],
		});
		const result = await callTool("list_config_versions", { slug: "cfg" }, [
			"configs",
		]);

		assert.equal(result.isError, true);
		assert.match(JSON.stringify(result.content), /over the 6000-byte limit/);
		assert.equal((result.structuredContent as { ok: boolean }).ok, false);
	});

	it("counts both the text block and structuredContent", async () => {
		// The envelope is about 2450 bytes, so it fits a 4800-byte cap only if it
		// is counted once. It travels twice.
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "4800";
		respondWith({ id: "log-1", request: { body: "y".repeat(2400) } });
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);
		assert.equal(result.isError, true);
	});

	it("counts JSON escaping of the text block", async () => {
		// Each quote is 2 bytes in the envelope and 4 once the text block is
		// escaped as a JSON string: about 4100 bytes if escaping were ignored
		// (envelope counted twice), about 6100 with it. A 5000 cap sits between.
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "5000";
		respondWith({ id: "log-1", request: { body: '"'.repeat(1000) } });
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);
		assert.equal(result.isError, true);
	});

	it("caps an oversized error result too", async () => {
		process.env.PORTKEY_MAX_TOOL_RESULT_BYTES = "6000";
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: { message: BIG } }), {
				status: 500,
			})) as typeof globalThis.fetch;
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);

		assert.equal(result.isError, true);
		const text = JSON.stringify(result.content);
		assert.match(text, /over the 6000-byte limit/);
		assert.ok(!text.includes(BIG));
		assert.ok(text.length < 1000);
	});

	it("keeps a short error message unchanged", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: { message: "nope" } }), {
				status: 400,
			})) as typeof globalThis.fetch;
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);

		assert.equal(result.isError, true);
		assert.match(JSON.stringify(result.content), /failed: .*nope/);
	});

	it("passes a result under the limit through unchanged", async () => {
		respondWith({ id: "log-1", request: { body: "small" } });
		const result = await callTool("get_log", { log_id: "log-1" }, ["logging"]);
		assert.notEqual(result.isError, true);
		assert.deepEqual((result.structuredContent as { data: unknown }).data, {
			id: "log-1",
			request: { body: "small" },
		});
	});
});
