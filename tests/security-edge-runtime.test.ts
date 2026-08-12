import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { after, describe, it } from "node:test";

const ORIGINAL_ENV = { ...process.env };

process.env.ALLOWED_ORIGINS = " , ";
delete process.env.CORS_ORIGIN;
process.env.RATE_LIMIT_ENABLED = "true";
process.env.RATE_LIMIT_STORE = "memory";
process.env.RATE_LIMIT_MAX = "2";
process.env.RATE_LIMIT_WINDOW_MS = "10";
process.env.RATE_LIMIT_REFILL = "1";
delete process.env.RATE_LIMIT_MAX_BUCKETS;

interface FakeRedisClient {
	isOpen: boolean;
	connectCalls: number;
	closeCalls: number;
	evalCalls: Array<{ script: string; keys: string[]; arguments: string[] }>;
	connect(): Promise<unknown>;
	close(): Promise<unknown>;
	eval(
		script: string,
		options: { keys: string[]; arguments: string[] },
	): Promise<unknown>;
	on(event: "error", listener: (error: unknown) => void): FakeRedisClient;
	emitError(error: unknown): void;
}

function createFakeRedisClient(options?: {
	connect?: (client: FakeRedisClient) => Promise<void>;
	eval?: (
		client: FakeRedisClient,
		call: { script: string; keys: string[]; arguments: string[] },
	) => Promise<unknown>;
}): FakeRedisClient {
	let errorListener: ((error: unknown) => void) | undefined;
	const client: FakeRedisClient = {
		isOpen: false,
		connectCalls: 0,
		closeCalls: 0,
		evalCalls: [],
		async connect() {
			client.connectCalls += 1;
			if (options?.connect) {
				await options.connect(client);
			} else {
				client.isOpen = true;
			}
		},
		async close() {
			client.closeCalls += 1;
			client.isOpen = false;
		},
		async eval(script, callOptions) {
			const call = { script, ...callOptions };
			client.evalCalls.push(call);
			return options?.eval ? options.eval(client, call) : [1, 0];
		},
		on(_event, listener) {
			errorListener = listener;
			return client;
		},
		emitError(error) {
			errorListener?.(error);
		},
	};
	return client;
}

let redisFactory: (options: unknown) => FakeRedisClient = () => {
	throw new Error("Unexpected Redis client creation");
};
const redisCreateOptions: unknown[] = [];
const factoryName = "__portkeySecurityRedisFactory";
(globalThis as Record<string, unknown>)[factoryName] = (options: unknown) => {
	redisCreateOptions.push(options);
	return redisFactory(options);
};

const fakeRedisModuleUrl = `data:text/javascript,${encodeURIComponent(
	`export const createClient = (options) => globalThis.${factoryName}(options);`,
)}`;
const moduleHooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "redis") {
			return { shortCircuit: true, url: fakeRedisModuleUrl };
		}
		return nextResolve(specifier, context);
	},
});

// Keep the environment-variant suites in this worker so they share the
// canonical security module and its explicit reset lifecycle.
await import("./lib-security-runtime.test.js");
await import("./security.test.js");
const security = await import("../src/lib/security.js");
const rateLimitConfig = security.getRateLimitConfig();

after(async () => {
	await security.closeRateLimitStore();
	moduleHooks.deregister();
	delete (globalThis as Record<string, unknown>)[factoryName];
	process.env = { ...ORIGINAL_ENV };
});

function createRequest(options: {
	path?: string;
	ip?: string;
	method?: string;
	headers?: Record<string, string>;
}) {
	return {
		headers: options.headers ?? {},
		ip: options.ip ?? "192.0.2.1",
		method: options.method ?? "POST",
		path: options.path ?? "/mcp",
	};
}

function createResponse(principal?: {
	id: string;
	mode: "none" | "bearer" | "clerk";
	roles: string[];
	permissions: string[];
}) {
	const state: {
		statusCode?: number;
		body?: unknown;
		headers: Record<string, string>;
	} = { headers: {} };
	return {
		state,
		response: {
			locals: principal ? { authPrincipal: principal } : {},
			setHeader(name: string, value: string) {
				state.headers[name] = value;
				return this;
			},
			status(statusCode: number) {
				state.statusCode = statusCode;
				return this;
			},
			json(body: unknown) {
				state.body = body;
				return this;
			},
		},
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	assert.fail("Timed out waiting for deterministic test state");
}

describe("origin and Host edge validation", () => {
	it("normalizes IPv6 Host values and malformed allow-list entries", () => {
		const allowedOrigins = security.getAllowedOrigins();
		assert.deepEqual(allowedOrigins, ["https://admin.example.com"]);
		const originalOrigins = [...allowedOrigins];
		allowedOrigins.splice(
			0,
			allowedOrigins.length,
			...[
				"http://localhost",
				"https://localhost",
				"http://127.0.0.1",
				"https://127.0.0.1",
				"http://[::1]",
				"https://[::1]",
			],
		);
		try {
			assert.equal(security.validateOrigin(undefined), true);
			assert.equal(security.validateOrigin("not an origin"), false);
			assert.equal(security.validateOrigin("ftp://localhost"), false);
			assert.equal(security.isAllowedHost("LOCALHOST:3000"), true);
			assert.equal(security.isAllowedHost("[::1]"), true);
			assert.equal(security.isAllowedHost("[::1]:3000"), true);
			assert.equal(security.isAllowedHost("[::1"), false);
			assert.equal(security.isAllowedHost("[::1]:invalid"), false);

			allowedOrigins.push("https://admin.example.com:8443", "internal.example");
			assert.equal(
				security.validateOrigin("https://admin.example.com:8443"),
				true,
			);
			assert.equal(
				security.validateOrigin("https://admin.example.com:9443"),
				false,
			);
			assert.equal(security.isAllowedHost("internal.example:9000"), true);

			allowedOrigins.push("*");
			assert.equal(security.validateOrigin("https://any.example"), true);
			assert.equal(security.isAllowedHost("anything.example"), true);
		} finally {
			allowedOrigins.splice(0, allowedOrigins.length, ...originalOrigins);
		}
	});

	it("applies origin and Host rejection responses while exempting probes", () => {
		for (const middleware of [
			security.originValidationMiddleware,
			security.hostValidationMiddleware,
		]) {
			const probe = createResponse();
			let probeNext = 0;
			middleware(
				createRequest({
					path: "/health",
					headers: {
						host: "evil.example",
						origin: "https://evil.example",
					},
				}) as never,
				probe.response as never,
				() => {
					probeNext += 1;
				},
			);
			assert.equal(probeNext, 1);
		}

		const originRejection = createResponse();
		security.originValidationMiddleware(
			createRequest({
				headers: { origin: "https://evil.example" },
			}) as never,
			originRejection.response as never,
			() => assert.fail("Rejected origin reached the next middleware"),
		);
		assert.equal(originRejection.state.statusCode, 403);
		assert.deepEqual(originRejection.state.body, {
			error: "Forbidden: Origin not allowed",
		});

		const hostRejection = createResponse();
		security.hostValidationMiddleware(
			createRequest({ headers: { host: "evil.example" } }) as never,
			hostRejection.response as never,
			() => assert.fail("Rejected Host reached the next middleware"),
		);
		assert.equal(hostRejection.state.statusCode, 403);
		assert.deepEqual(hostRejection.state.body, {
			error: "Forbidden: Host not allowed",
		});

		for (const headers of [
			{} as Record<string, string>,
			{ host: "admin.example.com:3000" },
		]) {
			const allowed = createResponse();
			let nextCalls = 0;
			security.hostValidationMiddleware(
				createRequest({ headers }) as never,
				allowed.response as never,
				() => {
					nextCalls += 1;
				},
			);
			assert.equal(nextCalls, 1);
		}
	});
});

describe("in-memory rate-limit edge behavior", () => {
	it("skips disabled, probe, and non-MCP authentication requests", async () => {
		const initialBuckets = security.getRateLimitBucketCountForTest();
		rateLimitConfig.enabled = false;
		const disabled = createResponse();
		let disabledNext = 0;
		await security.rateLimitMiddleware(
			createRequest({}) as never,
			disabled.response as never,
			() => {
				disabledNext += 1;
			},
		);
		assert.equal(disabledNext, 1);

		rateLimitConfig.enabled = true;
		for (const path of ["/health", "/ready", "/status"]) {
			const skipped = createResponse();
			let nextCalls = 0;
			await security.rateLimitMiddleware(
				createRequest({ path }) as never,
				skipped.response as never,
				() => {
					nextCalls += 1;
				},
			);
			assert.equal(nextCalls, 1);
		}
		assert.equal(security.getRateLimitBucketCountForTest(), initialBuckets);
	});

	it("refills buckets and keys principal work separately from authentication", async () => {
		const originalDateNow = Date.now;
		let now = Date.now();
		Date.now = () => now;
		rateLimitConfig.store = "memory";
		rateLimitConfig.maxTokens = 1;
		rateLimitConfig.windowMs = 10;
		rateLimitConfig.refillRate = 1;
		rateLimitConfig.maxBuckets = 100;

		try {
			const initialBuckets = security.getRateLimitBucketCountForTest();
			const request = createRequest({ ip: "" });
			const first = createResponse();
			let allowed = 0;
			await security.rateLimitMiddleware(
				request as never,
				first.response as never,
				() => {
					allowed += 1;
				},
			);

			const limited = createResponse();
			await security.rateLimitMiddleware(
				request as never,
				limited.response as never,
				() => {
					allowed += 1;
				},
			);
			assert.equal(limited.state.statusCode, 429);
			assert.equal(limited.state.headers["Retry-After"], "1");

			now += 10;
			const refilled = createResponse();
			await security.rateLimitMiddleware(
				request as never,
				refilled.response as never,
				() => {
					allowed += 1;
				},
			);
			assert.equal(allowed, 2);

			const anonymousPrincipal = createResponse();
			const authenticatedPrincipal = createResponse({
				id: "bearer:principal-a",
				mode: "bearer",
				roles: [],
				permissions: [],
			});
			for (const response of [anonymousPrincipal, authenticatedPrincipal]) {
				let principalNext = 0;
				await security.principalRateLimitMiddleware(
					createRequest({ ip: "" }) as never,
					response.response as never,
					() => {
						principalNext += 1;
					},
				);
				assert.equal(principalNext, 1);
			}
			assert.equal(
				security.getRateLimitBucketCountForTest(),
				initialBuckets + 3,
			);
		} finally {
			Date.now = originalDateNow;
		}
	});

	it("cleans stale buckets and expires shared overflow capacity", async () => {
		const originalDateNow = Date.now;
		let now = Date.now() + 40;
		Date.now = () => now;
		rateLimitConfig.maxTokens = 1;
		rateLimitConfig.windowMs = 10;
		rateLimitConfig.refillRate = 1;
		rateLimitConfig.maxBuckets = 1;

		try {
			const first = createResponse();
			let firstNext = 0;
			await security.rateLimitMiddleware(
				createRequest({ ip: "198.51.100.1" }) as never,
				first.response as never,
				() => {
					firstNext += 1;
				},
			);
			assert.equal(firstNext, 1);
			assert.equal(security.getRateLimitBucketCountForTest(), 1);

			const overflowAllowed = createResponse();
			let overflowNext = 0;
			await security.rateLimitMiddleware(
				createRequest({ ip: "198.51.100.2" }) as never,
				overflowAllowed.response as never,
				() => {
					overflowNext += 1;
				},
			);
			assert.equal(overflowNext, 1);

			const overflowLimited = createResponse();
			await security.rateLimitMiddleware(
				createRequest({ ip: "198.51.100.3" }) as never,
				overflowLimited.response as never,
				() => assert.fail("Exhausted overflow bucket allowed a request"),
			);
			assert.equal(overflowLimited.state.statusCode, 429);

			now += 30;
			const afterCleanup = createResponse();
			let afterCleanupNext = 0;
			await security.rateLimitMiddleware(
				createRequest({ ip: "198.51.100.4" }) as never,
				afterCleanup.response as never,
				() => {
					afterCleanupNext += 1;
				},
			);
			assert.equal(afterCleanupNext, 1);
			assert.equal(security.getRateLimitBucketCountForTest(), 1);
		} finally {
			Date.now = originalDateNow;
			rateLimitConfig.maxBuckets = 10_000;
		}
	});
});

describe("Redis-backed rate-limit lifecycle", () => {
	it("fails closed without a URL, retries client creation, and applies decisions", async () => {
		rateLimitConfig.store = "redis";
		rateLimitConfig.redisUrl = undefined;
		const missingUrl = createResponse();
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.1" }) as never,
			missingUrl.response as never,
			() => assert.fail("Missing Redis URL allowed a request"),
		);
		assert.equal(missingUrl.state.statusCode, 503);

		rateLimitConfig.redisUrl = "redis://fake.example";
		rateLimitConfig.redisKeyPrefix = "edge:rate";
		redisFactory = () => {
			throw new Error("client creation failed");
		};
		const creationFailure = createResponse();
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.2" }) as never,
			creationFailure.response as never,
			() => assert.fail("Failed Redis client creation allowed a request"),
		);
		assert.equal(creationFailure.state.statusCode, 503);

		let nextDecision: unknown = [1, 0];
		const client = createFakeRedisClient({
			eval: async () => nextDecision,
		});
		redisFactory = () => client;
		const allowed = createResponse();
		let allowedNext = 0;
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.2" }) as never,
			allowed.response as never,
			() => {
				allowedNext += 1;
			},
		);
		assert.equal(allowedNext, 1);
		assert.equal(client.connectCalls, 1);
		assert.match(client.evalCalls[0]?.script ?? "", /HMGET/);
		assert.match(client.evalCalls[0]?.keys[0] ?? "", /^edge:rate:/);
		assert.deepEqual(client.evalCalls[0]?.arguments.slice(0, 3), [
			"1",
			"10",
			"1",
		]);
		assert.equal(
			Number.isFinite(Number(client.evalCalls[0]?.arguments[3])),
			true,
		);
		assert.deepEqual(redisCreateOptions.at(-1), {
			url: "redis://fake.example",
			RESP: 2,
			socket: { keepAliveInitialDelay: 5_000 },
			commandOptions: { timeout: 5_000 },
		});

		client.emitError(new Error("socket failed"));
		client.emitError("socket failed again");
		nextDecision = [0, 0];
		const rejected = createResponse();
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.2" }) as never,
			rejected.response as never,
			() => assert.fail("Redis rejection reached the next middleware"),
		);
		assert.equal(rejected.state.statusCode, 429);
		assert.equal(rejected.state.headers["Retry-After"], "1");

		await security.closeRateLimitStore();
		assert.equal(client.closeCalls, 1);
	});

	it("shares connections, retries failures, and closes pending connections", async () => {
		rateLimitConfig.store = "redis";
		rateLimitConfig.redisUrl = "redis://fake.example";
		let releaseConnection: (() => void) | undefined;
		const connectionGate = new Promise<void>((resolve) => {
			releaseConnection = resolve;
		});
		const sharedClient = createFakeRedisClient({
			connect: async (client) => {
				await connectionGate;
				client.isOpen = true;
			},
		});
		redisFactory = () => sharedClient;

		let allowed = 0;
		const firstResponse = createResponse();
		const secondResponse = createResponse();
		const firstRequest = security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.10" }) as never,
			firstResponse.response as never,
			() => {
				allowed += 1;
			},
		);
		const secondRequest = security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.11" }) as never,
			secondResponse.response as never,
			() => {
				allowed += 1;
			},
		);
		await waitFor(() => sharedClient.connectCalls === 1);
		releaseConnection?.();
		await Promise.all([firstRequest, secondRequest]);
		assert.equal(allowed, 2);
		assert.equal(sharedClient.connectCalls, 1);
		await security.closeRateLimitStore();

		let retryConnectCalls = 0;
		const retryClient = createFakeRedisClient({
			connect: async (client) => {
				retryConnectCalls += 1;
				if (retryConnectCalls === 1) {
					throw "Redis temporarily unavailable";
				}
				client.isOpen = true;
			},
		});
		redisFactory = () => retryClient;
		const failed = createResponse();
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.12" }) as never,
			failed.response as never,
			() => assert.fail("Failed connection allowed a request"),
		);
		assert.equal(failed.state.statusCode, 503);

		const retried = createResponse();
		let retriedNext = 0;
		await security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.12" }) as never,
			retried.response as never,
			() => {
				retriedNext += 1;
			},
		);
		assert.equal(retriedNext, 1);
		assert.equal(retryConnectCalls, 2);
		await security.closeRateLimitStore();

		let rejectPendingConnection: ((reason: unknown) => void) | undefined;
		const pendingConnection = new Promise<void>((_resolve, reject) => {
			rejectPendingConnection = reject;
		});
		const pendingClient = createFakeRedisClient({
			connect: async () => pendingConnection,
		});
		redisFactory = () => pendingClient;
		const pendingResponse = createResponse();
		const pendingRequest = security.rateLimitMiddleware(
			createRequest({ ip: "203.0.113.13" }) as never,
			pendingResponse.response as never,
			() => assert.fail("Pending connection allowed a request"),
		);
		await waitFor(() => pendingClient.connectCalls === 1);
		const closeRequest = security.closeRateLimitStore();
		rejectPendingConnection?.(new Error("connection closed"));
		await Promise.all([pendingRequest, closeRequest]);
		assert.equal(pendingResponse.state.statusCode, 503);
		assert.equal(pendingClient.closeCalls, 0);
	});

	it("validates direct Redis script failures and default timeout setup", async () => {
		await assert.rejects(
			security.consumeRedisRateLimitToken(
				{
					async eval() {
						throw new Error("eval failed");
					},
				},
				{
					key: "edge:direct",
					maxTokens: 1,
					windowMs: 10,
					refillRate: 1,
					now: 1,
				},
			),
			/eval failed/,
		);
		await assert.rejects(
			security.consumeRedisRateLimitToken(
				{ eval: async () => [] },
				{
					key: "edge:empty",
					maxTokens: 1,
					windowMs: 10,
					refillRate: 1,
					now: 1,
				},
			),
			/Invalid response from Redis rate-limit script/,
		);
	});
});
