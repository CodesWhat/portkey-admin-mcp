import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import { after, before, describe, it } from "node:test";
import { FetchError } from "../src/lib/fetch.js";
import {
	BaseService,
	isNoContent,
	type NoContent,
} from "../src/services/base.service.js";

const REQUEST_DEADLINE_MS = 50;
const DELAYED_RESPONSE_MS = 400;

class DeadlineTestService extends BaseService {
	protected override readonly timeout = REQUEST_DEADLINE_MS;

	read(path: string): Promise<unknown> {
		return this.get(path);
	}

	remove(path: string): Promise<unknown | NoContent> {
		return this.delete(path);
	}
}

let server: Server;
let baseUrl: string;
let originalAllowPrivate: string | undefined;
let originalAllowInsecure: string | undefined;
const sentResponses = new Set<string>();

function sendLater(
	response: ServerResponse,
	status: number,
	body: string,
	flushHeaders: boolean,
	responseName: string,
): void {
	response.writeHead(status, { "content-type": "application/json" });
	if (flushHeaders) response.flushHeaders();

	const delayedBody = setTimeout(() => {
		sentResponses.add(responseName);
		response.end(body);
	}, DELAYED_RESPONSE_MS);
	response.once("close", () => clearTimeout(delayedBody));
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}

before(async () => {
	originalAllowPrivate = process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
	originalAllowInsecure = process.env.PORTKEY_ALLOW_INSECURE_HTTP;
	process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = "true";
	process.env.PORTKEY_ALLOW_INSECURE_HTTP = "true";

	server = createServer((request, response) => {
		switch (request.url) {
			case "/v1/delayed-headers":
				sendLater(
					response,
					200,
					JSON.stringify({ ok: true }),
					false,
					"headers",
				);
				break;
			case "/v1/delayed-success-body":
				sendLater(
					response,
					200,
					JSON.stringify({ ok: true }),
					true,
					"success-body",
				);
				break;
			case "/v1/delayed-error-body":
				sendLater(
					response,
					503,
					JSON.stringify({ error: { message: "upstream unavailable" } }),
					true,
					"error-body",
				);
				break;
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
	server.closeAllConnections();
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
	restoreEnv("PORTKEY_ALLOW_PRIVATE_BASE_URL", originalAllowPrivate);
	restoreEnv("PORTKEY_ALLOW_INSECURE_HTTP", originalAllowInsecure);
});

describe("BaseService request deadline", () => {
	it("keeps the deadline active while reading a successful response body", async () => {
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(service.read("/delayed-success-body"));
		assert.equal(sentResponses.has("success-body"), false);
	});

	it("keeps the deadline active while reading an error response body", async () => {
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(
			service.read("/delayed-error-body"),
			(error: unknown) => {
				assert.ok(error instanceof FetchError);
				assert.equal(error.status, 503);
				return true;
			},
		);
		assert.equal(sentResponses.has("error-body"), false);
	});

	it("times out while waiting for response headers", async () => {
		const service = new DeadlineTestService("test-key", baseUrl);

		await assert.rejects(service.read("/delayed-headers"));
		assert.equal(sentResponses.has("headers"), false);
	});

	it("preserves prompt JSON responses", async () => {
		const service = new DeadlineTestService("test-key", baseUrl);

		assert.deepEqual(await service.read("/prompt"), {
			method: "GET",
			ok: true,
		});
	});

	it("preserves allowed 204 responses", async () => {
		const service = new DeadlineTestService("test-key", baseUrl);

		assert.equal(isNoContent(await service.remove("/no-content")), true);
	});
});
