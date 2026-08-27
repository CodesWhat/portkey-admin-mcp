import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import {
	assertSafeHttpAuthConfig,
	authorizeClerkClaims,
	getPrincipalOwnerKey,
	mcpAuthMiddleware,
	resetHttpAuthStateForTest,
} from "../src/lib/auth.js";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_TIMING_SAFE_EQUAL = crypto.timingSafeEqual;
const securityModule = await import("../src/lib/security.js");

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

	it("builds release packages only from the trusted workflow commit", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const packageJob = workflow.match(
			/\n {2}package-npm:[\s\S]*?(?=\n {2}publish-npm:)/,
		)?.[0];

		assert.ok(packageJob, "expected an isolated package-npm job");
		assert.match(packageJob, /ref: \$\{\{ github\.sha \}\}/);
		assert.doesNotMatch(
			packageJob,
			/ref: \$\{\{ needs\.release-ref\.outputs\.tag \}\}/,
		);
		assert.match(packageJob, /git rev-parse "\$\{GITHUB_SHA\}\^\{commit\}"/);
		assert.match(packageJob, /tag_commit.*trusted_commit/);
	});

	it("skips package execution when a backfilled version already exists", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const packageJob = workflow.match(
			/\n {2}package-npm:[\s\S]*?(?=\n {2}publish-npm:)/,
		)?.[0];
		const publishJob = workflow.match(
			/\n {2}publish-npm:[\s\S]*?(?=\n {2}publish-registry:)/,
		)?.[0];

		assert.ok(packageJob);
		assert.match(packageJob, /already_published:/);
		assert.match(packageJob, /npm view "portkey-admin-mcp@\$\{VERSION\}"/);
		for (const step of [
			"Verify release source",
			"Install dependencies without lifecycle scripts",
			"Build package",
			"Pack package without lifecycle scripts",
			"Smoke-test packed package",
			"Upload package artifact",
		]) {
			assert.match(
				packageJob,
				new RegExp(
					`- name: ${step}\\n\\s+if: steps\\.publication\\.outputs\\.already_published != 'true'`,
				),
			);
		}

		assert.ok(publishJob);
		assert.match(
			publishJob,
			/if: needs\.package-npm\.outputs\.already_published != 'true'/,
		);
	});

	it("passes packed artifact paths through the environment before shell use", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const packageJob = workflow.match(
			/\n {2}package-npm:[\s\S]*?(?=\n {2}publish-npm:)/,
		)?.[0];

		assert.ok(packageJob);
		assert.doesNotMatch(
			packageJob,
			/run:.*\$\{\{ steps\.pack\.outputs\.tarball \}\}/,
		);
		assert.match(
			packageJob,
			/env:\s+TARBALL: \$\{\{ steps\.pack\.outputs\.tarball \}\}\s+run: node scripts\/smoke-package\.mjs "\$TARBALL"/,
		);
	});

	it("dispatches the release workflow at the new tag", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/auto-tag.yml", import.meta.url),
			"utf8",
		);

		assert.match(
			workflow,
			/gh workflow run release\.yml --ref "\$tag" -f tag="\$tag"/,
		);
	});

	it("smoke-tests the exact packed artifact before upload", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const packageJob = workflow.match(
			/\n {2}package-npm:[\s\S]*?(?=\n {2}publish-npm:)/,
		)?.[0];
		assert.ok(packageJob);
		assert.match(packageJob, /Smoke-test packed package/);
		assert.match(packageJob, /node scripts\/smoke-package\.mjs/);

		const smokeScript = readFileSync(
			new URL("../scripts/smoke-package.mjs", import.meta.url),
			"utf8",
		);
		assert.match(smokeScript, /npm[\s\S]*install[\s\S]*--ignore-scripts/);
		assert.match(smokeScript, /portkey-admin-mcp-http/);
		assert.match(smokeScript, /portkey-admin-mcp/);
		assert.match(smokeScript, /initialize/);
		assert.match(smokeScript, /\/health/);
	});

	it("gates every release ref on protected-main ancestry before publishing", () => {
		const workflow = readFileSync(
			new URL("../.github/workflows/release.yml", import.meta.url),
			"utf8",
		);
		const gateJob = workflow.match(/\n {2}release-ref:[\s\S]*?\n {2}ci:/)?.[0];

		assert.ok(gateJob, "expected a release-ref job before CI");
		assert.match(gateJob, /git fetch origin main/);
		assert.match(gateJob, /git merge-base --is-ancestor/);
		assert.match(gateJob, /MANIFEST_REF/);
		for (const job of [
			"ci",
			"github-release",
			"package-npm",
			"publish-npm",
			"publish-registry",
		]) {
			const block = workflow.match(
				new RegExp(`\\n {2}${job}:[\\s\\S]*?(?=\\n {2}[a-z][a-z-]+:|$)`),
			)?.[0];
			assert.ok(block, `expected ${job} job`);
			assert.match(block, /needs:.*release-ref/);
		}
		for (const job of ["publish-npm", "publish-registry"]) {
			const block = workflow.match(
				new RegExp(`\\n {2}${job}:[\\s\\S]*?(?=\\n {2}[a-z][a-z-]+:|$)`),
			)?.[0];
			assert.match(block ?? "", /environment:\s*release/);
		}
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

	it("requires deployments to choose their production rate-limit topology", () => {
		const dockerfile = readFileSync(
			new URL("../Dockerfile", import.meta.url),
			"utf8",
		);

		assert.doesNotMatch(dockerfile, /ENV RATE_LIMIT_SINGLE_PROCESS=/);
	});
});

function resetEnv(): void {
	process.env = { ...ORIGINAL_ENV };
}

async function resetSecurityModule() {
	await securityModule.resetSecurityStateForTest();
	return securityModule;
}

async function loadBaseService() {
	return import("../src/services/base.service.js");
}

async function loadOriginHelpers() {
	const { getAllowedOrigins, isAllowedHost, validateOrigin } =
		await resetSecurityModule();
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
	afterEach(async () => {
		crypto.timingSafeEqual = ORIGINAL_TIMING_SAFE_EQUAL;
		resetEnv();
		resetHttpAuthStateForTest();
		await securityModule.resetSecurityStateForTest();
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
		const { hostValidationMiddleware } = await resetSecurityModule();
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
		const { hostValidationMiddleware } = await resetSecurityModule();
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
		const { hostValidationMiddleware } = await resetSecurityModule();
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

	it("authenticates bearer requests and rejects malformed or mismatched credentials", async () => {
		process.env.MCP_AUTH_MODE = "bearer";
		process.env.MCP_AUTH_TOKEN = "expected-secret-token";
		resetHttpAuthStateForTest();
		let timingSafeEqualCalls = 0;

		crypto.timingSafeEqual = ((left: Buffer, right: Buffer) => {
			timingSafeEqualCalls += 1;
			assert.equal(left.length, 32);
			assert.equal(right.length, 32);
			return ORIGINAL_TIMING_SAFE_EQUAL(left, right);
		}) as typeof crypto.timingSafeEqual;

		assert.doesNotThrow(() => assertSafeHttpAuthConfig());

		const publicRoute = createMockResponse();
		let publicRouteNext = false;
		await mcpAuthMiddleware(
			createMockRequest({ path: "/health" }) as never,
			publicRoute.response as never,
			() => {
				publicRouteNext = true;
			},
		);
		assert.equal(publicRouteNext, true);

		for (const authorization of [undefined, "Basic credential", "Bearer a b"]) {
			const rejected = createMockResponse();
			let rejectedNext = false;
			await mcpAuthMiddleware(
				createMockRequest({ authorization }) as never,
				rejected.response as never,
				() => {
					rejectedNext = true;
				},
			);
			assert.equal(rejectedNext, false);
			assert.equal(rejected.state.statusCode, 401);
			assert.deepEqual(rejected.state.body, {
				error: "Unauthorized: Missing or invalid Authorization Bearer token",
			});
		}

		const mismatch = createMockResponse();
		await mcpAuthMiddleware(
			createMockRequest("Bearer short") as never,
			mismatch.response as never,
			() => assert.fail("mismatched credentials must not be accepted"),
		);
		assert.equal(mismatch.state.statusCode, 401);
		assert.deepEqual(mismatch.state.body, {
			error: "Unauthorized: Token validation failed",
		});

		const accepted = createMockResponse();
		let acceptedNext = false;
		await mcpAuthMiddleware(
			createMockRequest("bearer expected-secret-token") as never,
			accepted.response as never,
			() => {
				acceptedNext = true;
			},
		);
		assert.equal(acceptedNext, true);
		assert.equal(accepted.state.statusCode, undefined);
		const principal = accepted.response.locals.authPrincipal as {
			id: string;
			mode: string;
		};
		assert.equal(principal.mode, "bearer");
		assert.match(principal.id, /^bearer:[a-f0-9]{64}$/);
		assert.match(getPrincipalOwnerKey(principal as never), /^[a-f0-9]{64}$/);
		assert.equal(timingSafeEqualCalls, 2);
	});

	it("requires an explicit override for anonymous HTTP authentication", async () => {
		delete process.env.MCP_AUTH_MODE;
		delete process.env.MCP_ALLOW_UNAUTHENTICATED_HTTP;
		resetHttpAuthStateForTest();

		assert.throws(
			() => assertSafeHttpAuthConfig(),
			/MCP_AUTH_MODE=none is not allowed for HTTP transport/,
		);
		process.env.MCP_ALLOW_UNAUTHENTICATED_HTTP = "true";
		assert.doesNotThrow(() => assertSafeHttpAuthConfig());

		const anonymous = createMockResponse();
		let nextCalled = false;
		await mcpAuthMiddleware(
			createMockRequest() as never,
			anonymous.response as never,
			() => {
				nextCalled = true;
			},
		);
		assert.equal(nextCalled, true);
		assert.deepEqual(anonymous.response.locals.authPrincipal, {
			id: "anonymous",
			mode: "none",
			roles: [],
			permissions: [],
		});
	});

	it("requires an explicit rate-limit store policy in production", async () => {
		process.env.NODE_ENV = "production";
		process.env.RATE_LIMIT_ENABLED = "true";
		process.env.RATE_LIMIT_STORE = "memory";
		delete process.env.RATE_LIMIT_SINGLE_PROCESS;

		await assert.rejects(
			() => resetSecurityModule(),
			/RATE_LIMIT_SINGLE_PROCESS=true/,
		);
	});

	it("serializes Redis client creation and keeps command timeouts finite", () => {
		const securitySource = readFileSync(
			new URL("../src/lib/security.ts", import.meta.url),
			"utf8",
		);

		assert.match(securitySource, /rateLimitRedisCreatePromise\s*\?\?=/);
		assert.doesNotMatch(
			securitySource,
			/commandOptions:\s*\{\s*timeout:\s*undefined\s*\}/,
		);
	});

	it("fails closed when a Redis rate-limit command stalls", async () => {
		const { consumeRedisRateLimitToken } = await resetSecurityModule();
		const stalledClient = {
			eval: () => new Promise<never>(() => undefined),
		};
		const decision = consumeRedisRateLimitToken(stalledClient, {
			key: "test:stalled",
			maxTokens: 1,
			windowMs: 60_000,
			refillRate: 1,
			now: Date.now(),
			timeoutMs: 5,
		} as never).then(
			() => "resolved",
			() => "rejected",
		);
		const outcome = await Promise.race([
			decision,
			new Promise<"hung">((resolve) => {
				setTimeout(() => resolve("hung"), 50);
			}),
		]);

		assert.equal(outcome, "rejected");
	});

	it("uses one refillable limiter before auth and a principal limiter after auth", () => {
		const httpApp = readFileSync(
			new URL("../src/lib/http-app.ts", import.meta.url),
			"utf8",
		);
		const preAuthIndex = httpApp.indexOf("app.use(rateLimitMiddleware);");
		const authIndex = httpApp.indexOf("app.use(mcpAuthMiddleware);");
		const principalIndex = httpApp.indexOf(
			"app.use(principalRateLimitMiddleware);",
		);

		assert.doesNotMatch(httpApp, /expressRateLimit\(|express-rate-limit/);
		assert.ok(preAuthIndex >= 0, "expected a pre-authentication limiter");
		assert.ok(
			preAuthIndex < authIndex,
			"pre-auth limiter must run before auth",
		);
		assert.ok(
			authIndex < principalIndex,
			"principal limiter must run after auth",
		);
	});

	it("shares a pre-authentication bucket across attempted credentials", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const securityModule = (await resetSecurityModule()) as {
			rateLimitMiddleware: typeof import("../src/lib/security.js").rateLimitMiddleware;
		};
		const { rateLimitMiddleware } = securityModule;
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
		let firstNextCalled = false;
		let secondNextCalled = false;

		rateLimitMiddleware(
			createMockRequest({
				authorization: "Bearer invalid-token-a",
				ip: "203.0.113.40",
			}) as never,
			first.response as never,
			() => {
				firstNextCalled = true;
			},
		);
		rateLimitMiddleware(
			createMockRequest({
				authorization: "Bearer invalid-token-b",
				ip: "203.0.113.40",
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
	});

	it("uses req.ip for rate limiting even when X-Forwarded-For is spoofed", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const { rateLimitMiddleware } = await resetSecurityModule();
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

	it("shares a pre-authentication bucket across an IPv6 subnet", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const { rateLimitMiddleware } = await resetSecurityModule();
		const first = createMockResponse();
		const second = createMockResponse();
		let firstNextCalled = false;
		let secondNextCalled = false;

		rateLimitMiddleware(
			createMockRequest({ ip: "2001:db8:abcd:1200::1" }) as never,
			first.response as never,
			() => {
				firstNextCalled = true;
			},
		);
		rateLimitMiddleware(
			createMockRequest({ ip: "2001:db8:abcd:12ff::2" }) as never,
			second.response as never,
			() => {
				secondNextCalled = true;
			},
		);

		assert.equal(firstNextCalled, true);
		assert.equal(secondNextCalled, false);
		assert.equal(second.state.statusCode, 429);
		assert.deepEqual(second.state.body, { error: "Too Many Requests" });
	});

	it("separates rate-limit buckets by authenticated principal and IP", async () => {
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "60000";

		const securityModule = (await resetSecurityModule()) as {
			principalRateLimitMiddleware?: typeof import("../src/lib/security.js").rateLimitMiddleware;
		};
		const { principalRateLimitMiddleware } = securityModule;
		assert.ok(
			principalRateLimitMiddleware,
			"expected principalRateLimitMiddleware to be exported",
		);
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

		principalRateLimitMiddleware(
			createMockRequest({ ip: "203.0.113.30" }) as never,
			first.response as never,
			() => {
				allowed += 1;
			},
		);
		principalRateLimitMiddleware(
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

		const { rateLimitMiddleware } = await resetSecurityModule();
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

		const securityModule = (await resetSecurityModule()) as {
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

	it("applies bearer, origin, and rate-limit policies through their middleware contracts", async () => {
		process.env.MCP_AUTH_MODE = "bearer";
		process.env.MCP_AUTH_TOKEN = "integrated-secret";
		process.env.ALLOWED_ORIGINS =
			"https://trusted.example:8443, internal.example";
		process.env.RATE_LIMIT_MAX = "1";
		process.env.RATE_LIMIT_REFILL = "1";
		process.env.RATE_LIMIT_WINDOW_MS = "10";
		resetHttpAuthStateForTest();

		const security = await resetSecurityModule();

		const authenticated = createMockResponse();
		let authenticatedNext = false;
		await mcpAuthMiddleware(
			createMockRequest("  Bearer   integrated-secret  ") as never,
			authenticated.response as never,
			() => {
				authenticatedNext = true;
			},
		);
		assert.equal(authenticatedNext, true);
		const authenticatedPrincipal = authenticated.response.locals
			.authPrincipal as { mode: string };
		assert.equal(authenticatedPrincipal?.mode, "bearer");
		assert.match(
			getPrincipalOwnerKey(authenticatedPrincipal as never),
			/^[a-f0-9]{64}$/,
		);

		const clerkConfig = {
			mode: "clerk" as const,
			issuer: "https://clerk.example.com",
			allowedSubjects: ["user-2"],
			allowedOrganizationIds: ["org-2"],
			allowedRoles: ["admin"],
			requiredPermissions: ["read"],
		};
		const clerkPrincipal = authorizeClerkClaims(
			{
				sub: "user-2",
				o: { id: "org-2", rol: "admin", per: ["read", "read", null] },
				roles: "ignored",
			},
			clerkConfig,
		);
		assert.deepEqual(clerkPrincipal, {
			id: "clerk:https://clerk.example.com:user-2",
			mode: "clerk",
			subject: "user-2",
			organizationId: "org-2",
			roles: ["admin"],
			permissions: ["read"],
		});
		for (const [payload, message] of [
			[{}, /missing a subject/],
			[{ sub: "other" }, /subject is not authorized/],
			[{ sub: "user-2" }, /organization is not authorized/],
			[
				{ sub: "user-2", org_id: "org-2", org_role: "viewer" },
				/role is not authorized/,
			],
			[
				{ sub: "user-2", org_id: "org-2", org_role: "admin" },
				/missing a required permission/,
			],
		] as const) {
			assert.throws(() => authorizeClerkClaims(payload, clerkConfig), message);
		}

		assert.deepEqual(security.getAllowedOrigins(), [
			"https://trusted.example:8443",
			"internal.example",
		]);
		assert.equal(security.validateOrigin(undefined), true);
		assert.equal(security.validateOrigin("https://trusted.example:8443"), true);
		assert.equal(
			security.validateOrigin("https://trusted.example:9443"),
			false,
		);
		assert.equal(security.validateOrigin("not a URL"), false);
		assert.equal(security.isAllowedHost("internal.example:3000"), true);

		const rejectedOrigin = createMockResponse();
		security.originValidationMiddleware(
			createMockRequest({
				headers: { origin: "https://attacker.example" },
			}) as never,
			rejectedOrigin.response as never,
			() => assert.fail("untrusted origins must not be accepted"),
		);
		assert.equal(rejectedOrigin.state.statusCode, 403);
		assert.deepEqual(rejectedOrigin.state.body, {
			error: "Forbidden: Origin not allowed",
		});

		for (const request of [
			createMockRequest({ path: "/ready" }),
			createMockRequest({
				headers: { origin: "https://trusted.example:8443" },
			}),
		]) {
			const allowedOrigin = createMockResponse();
			let allowedOriginNext = false;
			security.originValidationMiddleware(
				request as never,
				allowedOrigin.response as never,
				() => {
					allowedOriginNext = true;
				},
			);
			assert.equal(allowedOriginNext, true);
		}

		const missingHost = createMockResponse();
		let missingHostNext = false;
		security.hostValidationMiddleware(
			createMockRequest() as never,
			missingHost.response as never,
			() => {
				missingHostNext = true;
			},
		);
		assert.equal(missingHostNext, true);

		const evalCalls: Array<{
			keys: string[];
			arguments: string[];
		}> = [];
		const redisClient = {
			async eval(
				_script: string,
				options: { keys: string[]; arguments: string[] },
			) {
				evalCalls.push(options);
				return evalCalls.length === 1 ? [1, 0] : [0, 0];
			},
		};
		const redisOptions = {
			key: "rate:test",
			maxTokens: 2,
			windowMs: 1000,
			refillRate: 1,
			now: 123,
			timeoutMs: 50,
		};
		assert.deepEqual(
			await security.consumeRedisRateLimitToken(redisClient, redisOptions),
			{ allowed: true },
		);
		assert.deepEqual(
			await security.consumeRedisRateLimitToken(redisClient, redisOptions),
			{ allowed: false },
		);
		assert.deepEqual(evalCalls[0], {
			keys: ["rate:test"],
			arguments: ["2", "1000", "1", "123"],
		});
		await assert.rejects(
			() =>
				security.consumeRedisRateLimitToken(
					{ eval: async () => ({ invalid: true }) },
					redisOptions,
				),
			/Invalid response/,
		);

		assert.equal(security.getRateLimitConfig().store, "memory");
		for (const path of ["/health", "/other"]) {
			const skipped = createMockResponse();
			let skippedNext = false;
			await security.rateLimitMiddleware(
				createMockRequest({ path }) as never,
				skipped.response as never,
				() => {
					skippedNext = true;
				},
			);
			assert.equal(skippedNext, true);
		}

		const originalDateNow = Date.now;
		let now = 1_000;
		Date.now = () => now;
		try {
			const request = createMockRequest({ ip: "203.0.113.99" });
			const first = createMockResponse();
			first.response.locals.authPrincipal = clerkPrincipal;
			let allowed = 0;
			await security.principalRateLimitMiddleware(
				request as never,
				first.response as never,
				() => {
					allowed += 1;
				},
			);

			const limited = createMockResponse();
			limited.response.locals.authPrincipal = clerkPrincipal;
			await security.principalRateLimitMiddleware(
				request as never,
				limited.response as never,
				() => {
					allowed += 1;
				},
			);
			assert.equal(limited.state.statusCode, 429);

			now += 10;
			const refilled = createMockResponse();
			refilled.response.locals.authPrincipal = clerkPrincipal;
			await security.principalRateLimitMiddleware(
				request as never,
				refilled.response as never,
				() => {
					allowed += 1;
				},
			);
			assert.equal(allowed, 2);
		} finally {
			Date.now = originalDateNow;
		}

		await security.closeRateLimitStore();
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
