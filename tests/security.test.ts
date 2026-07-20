import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_TIMING_SAFE_EQUAL = crypto.timingSafeEqual;

describe("supply-chain configuration", () => {
	it("holds dependency updates for review after a seven-day release age", () => {
		const renovate = JSON.parse(
			readFileSync(new URL("../renovate.json", import.meta.url), "utf8"),
		) as {
			minimumReleaseAge?: string;
			lockFileMaintenance?: { automerge?: boolean };
			packageRules?: Array<{
				automerge?: boolean;
				minimumReleaseAge?: string;
			}>;
		};

		assert.equal(renovate.minimumReleaseAge, "7 days");
		assert.equal(renovate.lockFileMaintenance?.automerge, false);
		assert.ok(
			renovate.packageRules?.every((rule) => rule.automerge !== true) ?? true,
		);
		assert.ok(
			renovate.packageRules?.every(
				(rule) => rule.minimumReleaseAge === "7 days",
			) ?? true,
		);
	});

	it("keeps dependency execution out of the OIDC npm publishing job", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const packageJob = workflow.match(
			/\n {2}package-npm:[\s\S]*?\n {2}publish-npm:/,
		)?.[0];
		const publishJob = workflow.match(
			/\n {2}publish-npm:[\s\S]*?\n {2}publish-registry:/,
		)?.[0];

		assert.ok(packageJob, "expected an isolated package-npm job");
		assert.doesNotMatch(packageJob, /id-token:\s*write/);
		assert.match(
			packageJob,
			/actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
		);

		assert.ok(publishJob, "expected a publish-npm job");
		assert.match(publishJob, /id-token:\s*write/);
		assert.doesNotMatch(publishJob, /npm ci|npm run/);
		assert.match(
			publishJob,
			/actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/,
		);
		assert.match(publishJob, /npm publish "\$TARBALL"[\s\S]*--ignore-scripts/);
	});

	it("removes npm tooling from the production container", () => {
		const dockerfile = readFileSync(
			new URL("../Dockerfile", import.meta.url),
			"utf8",
		);
		const productionStage = dockerfile.split(" AS production")[1];

		assert.ok(productionStage, "expected a production container stage");
		assert.match(productionStage, /\/usr\/local\/lib\/node_modules\/npm/);
		assert.match(productionStage, /\/usr\/local\/bin\/npm/);
		assert.match(productionStage, /\/usr\/local\/bin\/npx/);
	});
});

function resetEnv(): void {
	process.env = { ...ORIGINAL_ENV };
}

async function loadAuthModule() {
	return import(`../src/lib/auth.js?test=${Date.now()}-${Math.random()}`);
}

async function loadSecurityModule() {
	return import(`../src/lib/security.js?test=${Date.now()}-${Math.random()}`);
}

async function loadBaseService() {
	return import(
		`../src/services/base.service.js?test=${Date.now()}-${Math.random()}`
	);
}

async function loadOriginHelpers() {
	const { getAllowedOrigins, isAllowedHost, validateOrigin } =
		await loadSecurityModule();
	return { getAllowedOrigins, isAllowedHost, validateOrigin };
}

function createMockRequest(
	options?:
		| string
		| {
				authorization?: string;
				ip?: string;
				path?: string;
				method?: string;
				headers?: Record<string, string>;
		  },
) {
	const normalized =
		typeof options === "string" ? { authorization: options } : options;

	return {
		headers: {
			...(normalized?.headers || {}),
			...(normalized?.authorization
				? { authorization: normalized.authorization }
				: {}),
		},
		ip: normalized?.ip,
		method: normalized?.method || "POST",
		path: normalized?.path || "/mcp",
	} as const;
}

function createMockResponse() {
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
			status(code: number) {
				state.statusCode = code;
				return this;
			},
			json(body: unknown) {
				state.body = body;
				return this;
			},
		},
	};
}

describe("origin security configuration", () => {
	afterEach(() => {
		resetEnv();
		crypto.timingSafeEqual = ORIGINAL_TIMING_SAFE_EQUAL;
	});

	it("uses ALLOWED_ORIGINS when configured", async () => {
		process.env.ALLOWED_ORIGINS =
			"https://admin.example.com,https://mcp.example.com";
		delete process.env.CORS_ORIGIN;
		const { getAllowedOrigins, validateOrigin } = await loadOriginHelpers();

		assert.deepEqual(getAllowedOrigins(), [
			"https://admin.example.com",
			"https://mcp.example.com",
		]);
		assert.equal(validateOrigin("https://admin.example.com"), true);
		assert.equal(validateOrigin("https://evil.example.com"), false);
	});

	it("falls back to CORS_ORIGIN when ALLOWED_ORIGINS is unset", async () => {
		delete process.env.ALLOWED_ORIGINS;
		process.env.CORS_ORIGIN = "https://fallback.example.com";
		const { getAllowedOrigins, validateOrigin } = await loadOriginHelpers();

		assert.deepEqual(getAllowedOrigins(), ["https://fallback.example.com"]);
		assert.equal(validateOrigin("https://fallback.example.com"), true);
	});

	it("allows all origins when wildcard is configured", async () => {
		process.env.ALLOWED_ORIGINS = "*";
		const { isAllowedHost, validateOrigin } = await loadOriginHelpers();

		assert.equal(validateOrigin("https://any-origin.example"), true);
		assert.equal(isAllowedHost("anything.local"), true);
	});

	it("does not allow prefix-based origin spoofing", async () => {
		process.env.ALLOWED_ORIGINS = "https://example.com";
		const { validateOrigin } = await loadOriginHelpers();

		assert.equal(validateOrigin("https://example.com"), true);
		assert.equal(validateOrigin("https://example.com.evil"), false);
	});

	it("allows any port when allow-listed origin has no explicit port", async () => {
		process.env.ALLOWED_ORIGINS = "http://localhost";
		const { validateOrigin } = await loadOriginHelpers();

		assert.equal(validateOrigin("http://localhost:3000"), true);
		assert.equal(validateOrigin("http://localhost:9999"), true);
		assert.equal(validateOrigin("https://localhost:3000"), false);
	});

	it("allows default IPv4 and IPv6 loopback hosts", async () => {
		delete process.env.ALLOWED_ORIGINS;
		delete process.env.CORS_ORIGIN;
		const { isAllowedHost, validateOrigin } = await loadOriginHelpers();

		assert.equal(validateOrigin("http://127.0.0.1:3000"), true);
		assert.equal(isAllowedHost("127.0.0.1:3000"), true);
		assert.equal(isAllowedHost("[::1]:3000"), true);
		assert.equal(isAllowedHost("[::1].evil.example:3000"), false);
		assert.equal(isAllowedHost("[::1]junk"), false);
	});

	it("uses strict host comparison for non-URL allow-list entries", async () => {
		process.env.ALLOWED_ORIGINS = "example.local";
		const { isAllowedHost } = await loadOriginHelpers();

		assert.equal(isAllowedHost("example.local"), true);
		assert.equal(isAllowedHost("example.local:3000"), true);
		assert.equal(isAllowedHost("evil-example.local"), false);
	});

	it("rejects requests whose Host header is not allow-listed", async () => {
		process.env.ALLOWED_ORIGINS = "https://mcp.example.com";
		const { hostValidationMiddleware } = await loadSecurityModule();
		const { response, state } = createMockResponse();
		let nextCalled = false;

		hostValidationMiddleware(
			createMockRequest({ headers: { host: "evil.example.com" } }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, false);
		assert.equal(state.statusCode, 403);
		assert.deepEqual(state.body, { error: "Forbidden: Host not allowed" });
	});

	it("allows requests whose Host header matches the allow-list", async () => {
		process.env.ALLOWED_ORIGINS = "https://mcp.example.com";
		const { hostValidationMiddleware } = await loadSecurityModule();
		const { response, state } = createMockResponse();
		let nextCalled = false;

		hostValidationMiddleware(
			createMockRequest({ headers: { host: "mcp.example.com:3000" } }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.equal(state.statusCode, undefined);
	});

	it("skips Host validation for health and readiness probes", async () => {
		process.env.ALLOWED_ORIGINS = "https://mcp.example.com";
		const { hostValidationMiddleware } = await loadSecurityModule();
		const { response, state } = createMockResponse();
		let nextCalled = false;

		hostValidationMiddleware(
			createMockRequest({
				headers: { host: "evil.example.com" },
				path: "/health",
			}) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.equal(state.statusCode, undefined);
	});

	it("caches parsed allowed origins at module load", async () => {
		process.env.ALLOWED_ORIGINS = "https://cached.example.com";
		const { getAllowedOrigins, validateOrigin } = await loadOriginHelpers();

		process.env.ALLOWED_ORIGINS = "https://mutated.example.com";

		assert.deepEqual(getAllowedOrigins(), ["https://cached.example.com"]);
		assert.equal(validateOrigin("https://cached.example.com"), true);
		assert.equal(validateOrigin("https://mutated.example.com"), false);
	});

	it("hashes mismatched bearer tokens before constant-time comparison", async () => {
		process.env.MCP_AUTH_MODE = "bearer";
		process.env.MCP_AUTH_TOKEN = "expected-secret-token";

		const { mcpAuthMiddleware } = await loadAuthModule();
		const { response, state } = createMockResponse();
		let nextCalled = false;
		let timingSafeEqualCalls = 0;

		crypto.timingSafeEqual = ((left: Buffer, right: Buffer) => {
			timingSafeEqualCalls += 1;
			assert.equal(left.length, 32);
			assert.equal(right.length, 32);
			return ORIGINAL_TIMING_SAFE_EQUAL(left, right);
		}) as typeof crypto.timingSafeEqual;

		await mcpAuthMiddleware(
			createMockRequest("Bearer short") as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(timingSafeEqualCalls, 1);
		assert.equal(nextCalled, false);
		assert.equal(state.statusCode, 401);
		assert.deepEqual(state.body, {
			error: "Unauthorized: Token validation failed",
		});
	});

	it("refuses unauthenticated HTTP startup by default", async () => {
		delete process.env.MCP_AUTH_MODE;
		delete process.env.MCP_ALLOW_UNAUTHENTICATED_HTTP;

		const { assertSafeHttpAuthConfig } = await loadAuthModule();

		assert.throws(
			() => assertSafeHttpAuthConfig(),
			/MCP_AUTH_MODE=none is not allowed for HTTP transport/,
		);
	});

	it("allows unauthenticated HTTP startup only when explicitly overridden", async () => {
		delete process.env.MCP_AUTH_MODE;
		process.env.MCP_ALLOW_UNAUTHENTICATED_HTTP = "true";

		const { assertSafeHttpAuthConfig } = await loadAuthModule();

		assert.doesNotThrow(() => assertSafeHttpAuthConfig());
	});

	it("requires an explicit rate-limit store policy in production", async () => {
		process.env.NODE_ENV = "production";
		process.env.RATE_LIMIT_ENABLED = "true";
		process.env.RATE_LIMIT_STORE = "memory";
		delete process.env.RATE_LIMIT_SINGLE_PROCESS;

		await assert.rejects(
			() => loadSecurityModule(),
			/RATE_LIMIT_SINGLE_PROCESS=true/,
		);
	});

	it("uses req.ip for rate limiting even when X-Forwarded-For is spoofed", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const { rateLimitMiddleware } = await loadSecurityModule();
		const first = createMockResponse();
		const second = createMockResponse();
		let firstNextCalled = false;
		let secondNextCalled = false;

		rateLimitMiddleware(
			createMockRequest({
				ip: "203.0.113.10",
				headers: { "x-forwarded-for": "198.51.100.1" },
			}) as never,
			first.response as never,
			() => {
				firstNextCalled = true;
			},
		);

		rateLimitMiddleware(
			createMockRequest({
				ip: "203.0.113.10",
				headers: { "x-forwarded-for": "198.51.100.2" },
			}) as never,
			second.response as never,
			() => {
				secondNextCalled = true;
			},
		);

		assert.equal(firstNextCalled, true);
		assert.equal(first.state.statusCode, undefined);
		assert.equal(secondNextCalled, false);
		assert.equal(second.state.statusCode, 429);
		assert.deepEqual(second.state.body, { error: "Too Many Requests" });
		assert.equal(second.state.headers["Retry-After"], "60");
	});

	it("separates rate-limit buckets by authenticated principal and IP", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const { rateLimitMiddleware } = await loadSecurityModule();
		const first = createMockResponse();
		const second = createMockResponse();
		first.response.locals.authPrincipal = {
			id: "clerk:issuer:user-a",
			mode: "clerk",
			roles: [],
			permissions: [],
		};
		second.response.locals.authPrincipal = {
			id: "clerk:issuer:user-b",
			mode: "clerk",
			roles: [],
			permissions: [],
		};
		let allowed = 0;

		rateLimitMiddleware(
			createMockRequest({ ip: "203.0.113.30" }) as never,
			first.response as never,
			() => {
				allowed += 1;
			},
		);
		rateLimitMiddleware(
			createMockRequest({ ip: "203.0.113.30" }) as never,
			second.response as never,
			() => {
				allowed += 1;
			},
		);

		assert.equal(allowed, 2);
		assert.equal(first.state.statusCode, undefined);
		assert.equal(second.state.statusCode, undefined);
	});

	it("falls back when a rate-limit integer contains trailing characters", async () => {
		process.env.RATE_LIMIT_MAX = "1oops";
		process.env.RATE_LIMIT_REFILL = "60";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const { rateLimitMiddleware } = await loadSecurityModule();
		let nextCalls = 0;

		for (let attempt = 0; attempt < 2; attempt += 1) {
			const mock = createMockResponse();
			rateLimitMiddleware(
				createMockRequest({ ip: "203.0.113.20" }) as never,
				mock.response as never,
				() => {
					nextCalls += 1;
				},
			);
			assert.equal(mock.state.statusCode, undefined);
		}

		assert.equal(nextCalls, 2);
	});

	it("caps unique rate-limit buckets and shares overflow capacity", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";
		process.env.RATE_LIMIT_MAX_BUCKETS = "2";

		const securityModule = (await loadSecurityModule()) as {
			rateLimitMiddleware: typeof import("../src/lib/security.js").rateLimitMiddleware;
			getRateLimitBucketCountForTest?: () => number;
		};
		const { rateLimitMiddleware, getRateLimitBucketCountForTest } =
			securityModule;
		const first = createMockResponse();
		const second = createMockResponse();
		const third = createMockResponse();
		const fourth = createMockResponse();
		let firstNextCalled = false;
		let secondNextCalled = false;
		let thirdNextCalled = false;
		let fourthNextCalled = false;

		rateLimitMiddleware(
			createMockRequest({ ip: "198.51.100.1" }) as never,
			first.response as never,
			() => {
				firstNextCalled = true;
			},
		);
		rateLimitMiddleware(
			createMockRequest({ ip: "198.51.100.2" }) as never,
			second.response as never,
			() => {
				secondNextCalled = true;
			},
		);
		rateLimitMiddleware(
			createMockRequest({ ip: "198.51.100.3" }) as never,
			third.response as never,
			() => {
				thirdNextCalled = true;
			},
		);
		rateLimitMiddleware(
			createMockRequest({ ip: "198.51.100.4" }) as never,
			fourth.response as never,
			() => {
				fourthNextCalled = true;
			},
		);

		assert.equal(firstNextCalled, true);
		assert.equal(secondNextCalled, true);
		assert.equal(thirdNextCalled, true);
		assert.equal(fourthNextCalled, false);
		assert.equal(getRateLimitBucketCountForTest?.(), 2);
		assert.equal(fourth.state.statusCode, 429);
		assert.deepEqual(fourth.state.body, { error: "Too Many Requests" });
		assert.equal(fourth.state.headers["Retry-After"], "60");
	});
});

describe("base URL SSRF validation", () => {
	afterEach(() => {
		resetEnv();
	});

	it("flags loopback, private, and link-local hosts", async () => {
		const { isPrivateOrLocalHost } = await loadBaseService();

		for (const host of [
			"localhost",
			"app.localhost",
			"127.0.0.1",
			"10.1.2.3",
			"172.16.0.1",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"::1",
			"fe80::1",
			"fd00::1",
			"::ffff:127.0.0.1",
		]) {
			assert.equal(
				isPrivateOrLocalHost(host),
				true,
				`${host} should be treated as private`,
			);
		}
	});

	it("allows public hosts and internal DNS names", async () => {
		const { isPrivateOrLocalHost } = await loadBaseService();

		for (const host of [
			"api.portkey.ai",
			"gateway.internal",
			"8.8.8.8",
			"203.0.113.5",
			"example.com",
		]) {
			assert.equal(
				isPrivateOrLocalHost(host),
				false,
				`${host} should be allowed`,
			);
		}
	});

	it("rejects a private PORTKEY_BASE_URL by default", async () => {
		delete process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL;
		const { validateUrl } = await loadBaseService();

		assert.throws(
			() => validateUrl("http://169.254.169.254/latest/meta-data"),
			/private-network/,
		);
	});

	it("rejects insecure HTTP base URLs without an explicit opt-in", async () => {
		delete process.env.PORTKEY_ALLOW_INSECURE_HTTP;
		const { validateUrl } = await loadBaseService();

		assert.throws(
			() => validateUrl("http://api.example.com/v1"),
			/PORTKEY_ALLOW_INSECURE_HTTP=true/,
		);
	});

	it("allows a private PORTKEY_BASE_URL when explicitly opted in", async () => {
		process.env.PORTKEY_ALLOW_PRIVATE_BASE_URL = "true";
		process.env.PORTKEY_ALLOW_INSECURE_HTTP = "true";
		const { validateUrl } = await loadBaseService();

		assert.doesNotThrow(() => validateUrl("http://localhost:8787/v1"));
	});

	it("rejects non-http(s) base URL protocols", async () => {
		const { validateUrl } = await loadBaseService();

		assert.throws(() => validateUrl("ftp://example.com"), /protocol/);
	});

	it("accepts the default public base URL", async () => {
		const { validateUrl } = await loadBaseService();

		assert.doesNotThrow(() => validateUrl("https://api.portkey.ai/v1"));
	});
});
