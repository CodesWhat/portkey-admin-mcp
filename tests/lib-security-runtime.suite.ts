import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const securityModule = await import("../src/lib/security.js");
await securityModule.resetSecurityStateForTest();

const {
	closeRateLimitStore,
	consumeRedisRateLimitToken,
	getRateLimitBucketCountForTest,
	getRateLimitConfig,
	hostValidationMiddleware,
	originValidationMiddleware,
	principalRateLimitMiddleware,
	rateLimitMiddleware,
} = securityModule;

after(async () => {
	await closeRateLimitStore();
});

function createRequest(options: {
	path?: string;
	origin?: string;
	ip?: string;
}) {
	return {
		headers: options.origin ? { origin: options.origin } : {},
		ip: options.ip ?? "192.0.2.1",
		method: "POST",
		path: options.path ?? "/mcp",
	};
}

function createResponse() {
	const state: {
		statusCode?: number;
		body?: unknown;
		headers: Record<string, string>;
	} = { headers: {} };
	return {
		state,
		response: {
			locals: {} as Record<string, unknown>,
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

describe("origin and Host middleware", () => {
	it("rejects disallowed browser origins while allowing server-to-server requests", () => {
		const rejected = createResponse();
		let rejectedNextCalls = 0;

		originValidationMiddleware(
			createRequest({ origin: "https://evil.example.com" }) as never,
			rejected.response as never,
			() => {
				rejectedNextCalls += 1;
			},
		);

		assert.equal(rejectedNextCalls, 0);
		assert.equal(rejected.state.statusCode, 403);
		assert.deepEqual(rejected.state.body, {
			error: "Forbidden: Origin not allowed",
		});

		const allowed = createResponse();
		let allowedNextCalls = 0;
		originValidationMiddleware(
			createRequest({}) as never,
			allowed.response as never,
			() => {
				allowedNextCalls += 1;
			},
		);
		assert.equal(allowedNextCalls, 1);
		assert.equal(allowed.state.statusCode, undefined);
	});

	it("keeps health probes outside origin and Host validation", () => {
		for (const middleware of [
			originValidationMiddleware,
			hostValidationMiddleware,
		]) {
			const { response, state } = createResponse();
			let nextCalls = 0;
			middleware(
				{
					...createRequest({
						path: "/ready",
						origin: "https://evil.example.com",
					}),
					headers: {
						origin: "https://evil.example.com",
						host: "evil.example.com",
					},
				} as never,
				response as never,
				() => {
					nextCalls += 1;
				},
			);
			assert.equal(nextCalls, 1);
			assert.equal(state.statusCode, undefined);
		}
	});
});

describe("rate-limit configuration", () => {
	it("uses the configured in-memory token bucket", () => {
		assert.deepEqual(getRateLimitConfig(), {
			enabled: true,
			store: "memory",
			maxTokens: 2,
			windowMs: 60_000,
			refillRate: 1,
			maxBuckets: 10,
			redisUrl: undefined,
			redisKeyPrefix: "mcp:rate-limit",
		});
	});
});

describe("Redis token-bucket decisions", () => {
	it("passes the atomic bucket inputs through and normalizes Redis decisions", async () => {
		const calls: Array<{ keys: string[]; arguments: string[] }> = [];
		let result: unknown = [1, 0];
		const client = {
			async eval(
				_script: string,
				options: { keys: string[]; arguments: string[] },
			) {
				calls.push(options);
				return result;
			},
		};
		const options = {
			key: "rate:principal-a",
			maxTokens: 5,
			windowMs: 60_000,
			refillRate: 2,
			now: 123_456,
			timeoutMs: 100,
		};

		assert.deepEqual(await consumeRedisRateLimitToken(client, options), {
			allowed: true,
		});
		assert.deepEqual(calls[0], {
			keys: ["rate:principal-a"],
			arguments: ["5", "60000", "2", "123456"],
		});
		result = [0, 0];
		assert.deepEqual(await consumeRedisRateLimitToken(client, options), {
			allowed: false,
		});
		result = { allowed: true };
		await assert.rejects(
			() => consumeRedisRateLimitToken(client, options),
			/Invalid response from Redis rate-limit script/,
		);
	});
});

describe("in-memory request rate limiting", () => {
	it("allows the configured burst and returns retry guidance after exhaustion", () => {
		const initialBucketCount = getRateLimitBucketCountForTest();
		const request = createRequest({ ip: "192.0.2.55" });

		for (let requestNumber = 0; requestNumber < 2; requestNumber += 1) {
			const allowed = createResponse();
			let nextCalls = 0;
			rateLimitMiddleware(request as never, allowed.response as never, () => {
				nextCalls += 1;
			});
			assert.equal(nextCalls, 1);
		}

		const rejected = createResponse();
		let rejectedNextCalls = 0;
		rateLimitMiddleware(request as never, rejected.response as never, () => {
			rejectedNextCalls += 1;
		});
		assert.equal(rejectedNextCalls, 0);
		assert.equal(rejected.state.statusCode, 429);
		assert.equal(rejected.state.headers["Retry-After"], "60");
		assert.deepEqual(rejected.state.body, { error: "Too Many Requests" });
		assert.equal(getRateLimitBucketCountForTest(), initialBucketCount + 1);
	});

	it("separates authenticated principal buckets and skips probe or non-MCP routes", () => {
		const initialBucketCount = getRateLimitBucketCountForTest();
		const principalResponse = createResponse();
		principalResponse.response.locals.authPrincipal = {
			id: "clerk:issuer:user-1",
			mode: "clerk",
			roles: [],
			permissions: [],
		};
		let principalNextCalls = 0;
		principalRateLimitMiddleware(
			createRequest({ ip: "192.0.2.55" }) as never,
			principalResponse.response as never,
			() => {
				principalNextCalls += 1;
			},
		);
		assert.equal(principalNextCalls, 1);
		assert.equal(getRateLimitBucketCountForTest(), initialBucketCount + 1);

		for (const [middleware, path] of [
			[rateLimitMiddleware, "/status"],
			[principalRateLimitMiddleware, "/ready"],
		] as const) {
			const { response, state } = createResponse();
			let nextCalls = 0;
			middleware(createRequest({ path }) as never, response as never, () => {
				nextCalls += 1;
			});
			assert.equal(nextCalls, 1);
			assert.equal(state.statusCode, undefined);
		}
	});
});
