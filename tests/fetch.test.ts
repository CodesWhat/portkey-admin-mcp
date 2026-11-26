import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, afterEach, before, describe, it } from "node:test";
import { FetchError } from "../src/lib/fetch.js";
import {
	BaseService,
	isNoContent,
	type NoContent,
} from "../src/services/base.service.js";

// The deadline tests mock fetch instead of racing a real server against a
// wall-clock margin. The mocked response resolves in a microtask, so it always
// beats the deadline timer no matter how loaded the machine is. After that the
// body (or the headers) stay pending until the request signal aborts, so the
// only way these tests can settle is through the deadline under test.
const REQUEST_DEADLINE_MS = 20;
const ORDINARY_REQUEST_DEADLINE_MS = 5_000;

class DeadlineTestService extends BaseService {
	protected override readonly timeout: number = REQUEST_DEADLINE_MS;

	read(path: string): Promise<unknown> {
		return this.get(path);
	}

	remove(path: string): Promise<unknown | NoContent> {
		return this.delete(path);
	}
}

class OrdinaryResponseTestService extends DeadlineTestService {
	protected override readonly timeout = ORDINARY_REQUEST_DEADLINE_MS;
}

let server: Server;
let baseUrl: string;
let originalAllowPrivate: string | undefined;
let originalAllowInsecure: string | undefined;
let realFetch: typeof globalThis.fetch;

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}

before(async () => {
	realFetch = globalThis.fetch;
	originalAllowPrivate = process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
	originalAllowInsecure = process.env.PORTKEY_ALLOW_INSECURE_HTTP;
	process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = "true";
	process.env.PORTKEY_ALLOW_INSECURE_HTTP = "true";

	server = createServer((request, response) => {
		switch (request.url) {
			case "/v1/no-content":
				response.writeHead(204).end();
				break;
			default:
				response
					.writeHead(200, { "content-type": "application/json" })
					.end(JSON.stringify({ method: request.method, ok: true }));
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});

	const address = server.address();
	assert.ok(address && typeof address !== "string");
	baseUrl = `http://127.0.0.1:${address.port}/v1`;
});

after(async () => {
	globalThis.fetch = realFetch;
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	restoreEnv("PORTKEY_ALLOW_PRIVATE_BASE_URL", originalAllowPrivate);
	restoreEnv("PORTKEY_ALLOW_INSECURE_HTTP", originalAllowInsecure);
});

function abortReason(signal: AbortSignal | null | undefined): unknown {
	return signal?.reason ?? new Error("aborted");
}

/** Resolves right away with headers, then holds the body open until aborted. */
function mockHeldBody(status: number, firstChunk: string): void {
	globalThis.fetch = (async (
		_url: string | URL | Request,
		init?: RequestInit,
	) =>
		new Response(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(firstChunk));
					const signal = init?.signal;
					if (signal?.aborted) {
						controller.error(abortReason(signal));
						return;
					}
					signal?.addEventListener("abort", () =>
						controller.error(abortReason(signal)),
					);
				},
			}),
			{ status, headers: { "content-type": "application/json" } },
		)) as typeof globalThis.fetch;
}

describe("BaseService request deadline", () => {
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	it("keeps the deadline active while reading a successful response body", async () => {
		mockHeldBody(200, "{");
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(service.read("/held-success-body"));
	});

	it("keeps the deadline active while reading an error response body", async () => {
		mockHeldBody(503, '{"error":');
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(service.read("/held-error-body"), (error: unknown) => {
			assert.ok(error instanceof FetchError);
			assert.equal(error.status, 503);
			return true;
		});
	});

	it("times out while waiting for response headers", async () => {
		let sawRequest = false;
		globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				sawRequest = true;
				const signal = init?.signal;
				if (signal?.aborted) {
					reject(abortReason(signal));
					return;
				}
				signal?.addEventListener("abort", () => reject(abortReason(signal)));
			})) as typeof globalThis.fetch;
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(service.read("/held-headers"));
		assert.equal(sawRequest, true);
	});

	it("preserves prompt JSON responses", async () => {
		const service = new OrdinaryResponseTestService("test-key", baseUrl);

		assert.deepEqual(await service.read("/prompt"), {
			method: "GET",
			ok: true,
		});
	});

	it("preserves allowed 204 responses", async () => {
		const service = new OrdinaryResponseTestService("test-key", baseUrl);

		assert.equal(isNoContent(await service.remove("/no-content")), true);
	});
});
