/**
 * Unit tests for MCP_AUTH_MODE=clerk code paths in src/lib/auth.ts
 *
 * Covers:
 * - getHttpAuthConfig / getHttpAuthConfigFromEnv under clerk mode
 *   - valid full configuration
 *   - missing CLERK_ISSUER error
 *   - missing CLERK_AUDIENCE error
 *   - JWKS URL auto-derived from CLERK_ISSUER when CLERK_JWKS_URL is absent
 * - mcpAuthMiddleware clerk path
 *   - jwtVerify resolves → request passes (next called)
 *   - jwtVerify rejects  → 401 returned
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
	assertSafeHttpAuthConfig,
	authorizeClerkClaims,
	getHttpAuthConfig,
	getPrincipalOwnerKey,
	mcpAuthMiddleware,
	resetHttpAuthStateForTest,
} from "../src/lib/auth.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	// Restore only the keys we touch so other env vars are left alone
	for (const key of [
		"MCP_AUTH_MODE",
		"MCP_AUTH_TOKEN",
		"MCP_ALLOW_UNAUTHENTICATED_HTTP",
		"CLERK_ISSUER",
		"CLERK_AUDIENCE",
		"CLERK_JWKS_URL",
		"CLERK_ALLOWED_SUBJECTS",
		"CLERK_ALLOWED_ORGANIZATION_IDS",
		"CLERK_ALLOWED_ROLES",
		"CLERK_REQUIRED_PERMISSIONS",
	]) {
		if (key in ORIGINAL_ENV) {
			process.env[key] = ORIGINAL_ENV[key];
		} else {
			delete process.env[key];
		}
	}
}

function allowTestClerkSubject(): void {
	process.env.CLERK_ALLOWED_SUBJECTS = "user_test";
}

function createMockRequest(options?: {
	authorization?: string;
	path?: string;
	method?: string;
	headers?: Record<string, string>;
}) {
	return {
		headers: {
			...(options?.headers ?? {}),
			...(options?.authorization
				? { authorization: options.authorization }
				: {}),
		},
		method: options?.method ?? "POST",
		path: options?.path ?? "/mcp",
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

/**
 * Stubs globalThis.fetch for the duration of `fn`, serving `jwks` as a JSON
 * response for requests to `jwksUrl` and delegating everything else to the
 * real fetch. This is the seam jose's createRemoteJWKSet actually uses: it
 * calls the ambient `fetch` global with no override (auth.ts does not pass a
 * `[customFetch]` option), so stubbing here lets jwtVerify perform a genuine
 * signature/claims verification against a real JWKS response without any
 * network access or a throwaway HTTP server.
 */
async function withStubbedJwksFetch<T>(
	jwksUrl: string,
	jwks: unknown,
	fn: () => Promise<T>,
): Promise<T> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.href
					: input.url;
		if (url === jwksUrl) {
			return new Response(JSON.stringify(jwks), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		}
		return originalFetch(input as never, init);
	}) as typeof fetch;

	try {
		return await fn();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

// ---------------------------------------------------------------------------
// getHttpAuthConfig — clerk configuration validation
// ---------------------------------------------------------------------------

describe("getHttpAuthConfig under clerk mode", () => {
	afterEach(() => {
		resetEnv();
		resetHttpAuthStateForTest();
	});

	it("accepts a valid clerk configuration with explicit JWKS URL", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";

		resetHttpAuthStateForTest();
		const config = getHttpAuthConfig();

		assert.equal(config.mode, "clerk");
		assert.equal(config.issuer, "https://clerk.example.com");
		assert.deepEqual(config.audience, ["my-audience"]);
		assert.equal(
			config.jwksUrl,
			"https://clerk.example.com/.well-known/jwks.json",
		);
	});

	it("rejects clerk mode without an identity-bound authorization policy", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";

		assert.throws(
			() => resetHttpAuthStateForTest(),
			/MCP_AUTH_MODE=clerk requires an identity-bound authorization policy/,
		);
	});

	it("denies verified claims whose subject is outside the allowlist", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";
		process.env.CLERK_ALLOWED_SUBJECTS = "user_admin";
		resetHttpAuthStateForTest();

		assert.throws(
			() => authorizeClerkClaims({ sub: "user_member" }, getHttpAuthConfig()),
			/subject is not authorized/i,
		);
	});

	it("authorizes claims that satisfy every configured constraint", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_ALLOWED_SUBJECTS = "user_admin,user_service";
		process.env.CLERK_ALLOWED_ORGANIZATION_IDS = "org_primary";
		process.env.CLERK_ALLOWED_ROLES = "org:admin";
		process.env.CLERK_REQUIRED_PERMISSIONS =
			"org:sys_memberships:manage,org:sys_domains:manage";
		resetHttpAuthStateForTest();

		const principal = authorizeClerkClaims(
			{
				sub: "user_admin",
				v: 2,
				fea: "o:sys_memberships,o:sys_domains",
				o: { id: "org_primary", rol: "admin", per: "manage", fpm: "1,1" },
			},
			getHttpAuthConfig(),
		);

		assert.deepEqual(principal, {
			id: "clerk:https://clerk.example.com:user_admin",
			mode: "clerk",
			subject: "user_admin",
			organizationId: "org_primary",
			roles: ["org:admin"],
			permissions: ["org:sys_memberships:manage", "org:sys_domains:manage"],
		});
	});

	it("throws a descriptive error when CLERK_ISSUER is missing", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		delete process.env.CLERK_ISSUER;
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";

		assert.throws(
			() => resetHttpAuthStateForTest(),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /MCP_AUTH_MODE=clerk configuration error/);
				assert.match(err.message, /missing: CLERK_ISSUER/);
				return true;
			},
		);
	});

	it("throws a descriptive error when CLERK_AUDIENCE is missing", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		delete process.env.CLERK_AUDIENCE;
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";

		assert.throws(
			() => resetHttpAuthStateForTest(),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /MCP_AUTH_MODE=clerk configuration error/);
				assert.match(err.message, /missing: CLERK_AUDIENCE/);
				return true;
			},
		);
	});

	it("auto-derives JWKS URL from CLERK_ISSUER when CLERK_JWKS_URL is absent", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		delete process.env.CLERK_JWKS_URL;
		resetHttpAuthStateForTest();

		assert.equal(
			getHttpAuthConfig().jwksUrl,
			"https://clerk.example.com/.well-known/jwks.json",
		);
	});

	it("strips trailing slash from CLERK_ISSUER when auto-deriving JWKS URL", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com/";
		process.env.CLERK_AUDIENCE = "my-audience";
		delete process.env.CLERK_JWKS_URL;

		resetHttpAuthStateForTest();
		const config = getHttpAuthConfig();

		assert.equal(
			config.jwksUrl,
			"https://clerk.example.com/.well-known/jwks.json",
		);
	});

	it("parses a comma-separated CLERK_AUDIENCE into an array", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "audience-one, audience-two, audience-three";
		delete process.env.CLERK_JWKS_URL;
		resetHttpAuthStateForTest();

		assert.deepEqual(getHttpAuthConfig().audience, [
			"audience-one",
			"audience-two",
			"audience-three",
		]);
	});

	it("throws when CLERK_ISSUER is not a valid https URL", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "http://insecure.example.com";
		process.env.CLERK_AUDIENCE = "my-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.com/.well-known/jwks.json";

		assert.throws(
			() => resetHttpAuthStateForTest(),
			(err: unknown) => {
				assert.ok(err instanceof Error);
				assert.match(err.message, /invalid https URL: CLERK_ISSUER/);
				return true;
			},
		);
	});
});

// ---------------------------------------------------------------------------
// mcpAuthMiddleware — clerk JWT verification path
//
// jose's named exports (jwtVerify, createRemoteJWKSet) are live ESM bindings
// and cannot be monkey-patched after the module resolves. But
// createRemoteJWKSet delegates HTTP fetches to the ambient `fetch` global
// (see node_modules/jose/dist/webapi/jwks/remote.js: `fetchImpl = fetch`),
// and auth.ts constructs it with no `[customFetch]` override. That makes
// `globalThis.fetch` the narrowest real seam available: stubbing it lets us
// serve a real JWKS document to a real jose verifier without a live Clerk
// tenant or a throwaway HTTP server. See withStubbedJwksFetch above.
//
// Covered here:
//  • Missing Bearer token     → 401 before jwtVerify is ever called
//  • Non-/mcp path            → next() called, no auth attempted
//  • Structurally invalid JWT → jwtVerify throws, 401 returned
//  • JWKS fetch fails         → jwtVerify throws, 401 returned
//  • Valid signed JWT         → next() called, res.locals.authPrincipal is
//                                populated from org claims
// ---------------------------------------------------------------------------

describe("mcpAuthMiddleware clerk JWT verification", () => {
	afterEach(() => {
		resetEnv();
		resetHttpAuthStateForTest();
	});

	it("returns 401 when Authorization header is missing in clerk mode", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "test-audience";
		delete process.env.CLERK_JWKS_URL;
		resetHttpAuthStateForTest();

		const { response, state } = createMockResponse();
		let nextCalled = false;
		await mcpAuthMiddleware(
			createMockRequest({ path: "/mcp" }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, false);
		assert.equal(state.statusCode, 401);
		assert.deepEqual(state.body, {
			error: "Unauthorized: Missing or invalid Authorization Bearer token",
		});
	});

	it("skips auth for non-/mcp paths in clerk mode", async () => {
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "test-audience";
		delete process.env.CLERK_JWKS_URL;
		resetHttpAuthStateForTest();

		const { response, state } = createMockResponse();
		let nextCalled = false;
		await mcpAuthMiddleware(
			createMockRequest({ path: "/health" }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(nextCalled, true);
		assert.equal(state.statusCode, undefined);
	});

	it("returns 401 for a structurally invalid JWT in clerk mode (jwtVerify rejects)", async () => {
		// jose's jwtVerify will reject immediately for a token that is not
		// a valid compact JWS/JWE (three dot-separated base64url segments).
		// This exercises the catch → 401 branch in mcpAuthMiddleware without
		// needing a live JWKS endpoint or any ESM stub.
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.com";
		process.env.CLERK_AUDIENCE = "test-audience";
		delete process.env.CLERK_JWKS_URL;
		resetHttpAuthStateForTest();

		const { response, state } = createMockResponse();
		let nextCalled = false;
		await mcpAuthMiddleware(
			// "not.a.valid.jwt.at.all" has more than 3 segments → jose rejects
			createMockRequest({
				authorization: "Bearer not.a.valid.jwt.at.all",
			}) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(
			nextCalled,
			false,
			"next() must not be called when jwtVerify rejects",
		);
		assert.equal(state.statusCode, 401);
		assert.deepEqual(state.body, {
			error: "Unauthorized: Token validation failed",
		});
	});

	it("returns 401 when JWKS fetch fails (network-unreachable JWKS URL)", async () => {
		// A valid-looking JWT structure (three base64url segments) but with a JWKS
		// URL that will not resolve → createRemoteJWKSet defers the fetch until
		// jwtVerify calls it, which then rejects → 401.
		process.env.MCP_AUTH_MODE = "clerk";
		allowTestClerkSubject();
		process.env.CLERK_ISSUER = "https://clerk.example.test";
		process.env.CLERK_AUDIENCE = "test-audience";
		process.env.CLERK_JWKS_URL =
			"https://clerk.example.test/.well-known/jwks.json";

		resetHttpAuthStateForTest();
		const { response, state } = createMockResponse();
		let nextCalled = false;

		// eyJhbGciOiJSUzI1NiJ9 = {"alg":"RS256"}, the rest is filler
		const fakeJwt =
			"eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyMyJ9.fakesignature";

		await mcpAuthMiddleware(
			createMockRequest({ authorization: `Bearer ${fakeJwt}` }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);

		assert.equal(
			nextCalled,
			false,
			"next() must not be called when JWKS fetch fails",
		);
		assert.equal(state.statusCode, 401);
		assert.deepEqual(state.body, {
			error: "Unauthorized: Token validation failed",
		});
	});

	it("clears cached JWKS providers when an auth reset rejects invalid config", async () => {
		const issuer = "https://clerk.example.com";
		const jwksUrl = `${issuer}/.well-known/jwks.json`;
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = issuer;
		process.env.CLERK_AUDIENCE = "test-audience";
		process.env.CLERK_ALLOWED_SUBJECTS = "user_test";

		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		publicJwk.kid = "cache-reset-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";
		const token = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
			.setSubject("user_test")
			.setIssuer(issuer)
			.setAudience("test-audience")
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);

		await withStubbedJwksFetch(jwksUrl, { keys: [publicJwk] }, async () => {
			const jwksFetch = globalThis.fetch;
			let jwksFetches = 0;
			globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
				jwksFetches += 1;
				return jwksFetch(...args);
			}) as typeof fetch;
			try {
				resetHttpAuthStateForTest();
				await mcpAuthMiddleware(
					createMockRequest({ authorization: `Bearer ${token}` }) as never,
					createMockResponse().response as never,
					() => undefined,
				);
				assert.equal(jwksFetches, 1);

				delete process.env.CLERK_ALLOWED_SUBJECTS;
				assert.throws(
					() => resetHttpAuthStateForTest(),
					/requires an identity-bound authorization policy/,
				);
				await mcpAuthMiddleware(
					createMockRequest({ authorization: `Bearer ${token}` }) as never,
					createMockResponse().response as never,
					() => undefined,
				);
				assert.equal(jwksFetches, 2);
			} finally {
				globalThis.fetch = jwksFetch;
			}
		});
	});

	it("calls next() and populates res.locals.authPrincipal when jwtVerify resolves", async () => {
		const issuer = "https://clerk.example.com";
		const jwksUrl = "https://clerk.example.com/.well-known/jwks.json";

		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = issuer;
		process.env.CLERK_AUDIENCE = "test-audience";
		delete process.env.CLERK_JWKS_URL;
		process.env.CLERK_ALLOWED_ORGANIZATION_IDS = "org_primary";
		process.env.CLERK_ALLOWED_ROLES = "org:admin";
		process.env.CLERK_REQUIRED_PERMISSIONS = "org:sys_memberships:manage";

		// Mint a real RSA keypair and sign a real JWT with it.
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const kid = "test-key-1";
		const publicJwk = await exportJWK(publicKey);
		publicJwk.kid = kid;
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";
		const jwks = { keys: [publicJwk] };

		const token = await new SignJWT({
			org_id: "org_primary",
			org_role: "org:admin",
			org_permissions: ["org:sys_memberships:manage"],
		})
			.setProtectedHeader({ alg: "RS256", kid })
			.setSubject("user_test")
			.setIssuer(issuer)
			.setAudience("test-audience")
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);
		const forbiddenToken = await new SignJWT({
			org_id: "org_other",
			org_role: "org:admin",
			org_permissions: ["org:sys_memberships:manage"],
		})
			.setProtectedHeader({ alg: "RS256", kid })
			.setSubject("user_test")
			.setIssuer(issuer)
			.setAudience("test-audience")
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);

		await withStubbedJwksFetch(jwksUrl, jwks, async () => {
			resetHttpAuthStateForTest();
			const config = getHttpAuthConfig();
			assert.doesNotThrow(() => assertSafeHttpAuthConfig());
			assert.deepEqual(config, {
				mode: "clerk",
				bearerToken: undefined,
				jwksUrl,
				issuer,
				audience: ["test-audience"],
				allowedSubjects: undefined,
				allowedOrganizationIds: ["org_primary"],
				allowedRoles: ["org:admin"],
				requiredPermissions: ["org:sys_memberships:manage"],
			});
			const { response, state } = createMockResponse();
			let nextCalled = false;

			await mcpAuthMiddleware(
				createMockRequest({ authorization: `Bearer ${token}` }) as never,
				response as never,
				() => {
					nextCalled = true;
				},
			);

			assert.equal(
				nextCalled,
				true,
				"next() must be called when jwtVerify resolves",
			);
			assert.equal(state.statusCode, undefined);
			assert.deepEqual(response.locals.authPrincipal, {
				id: `clerk:${issuer}:user_test`,
				mode: "clerk",
				subject: "user_test",
				organizationId: "org_primary",
				roles: ["org:admin"],
				permissions: ["org:sys_memberships:manage"],
			});
			assert.match(
				getPrincipalOwnerKey(response.locals.authPrincipal as never),
				/^[a-f0-9]{64}$/,
			);

			const publicRoute = createMockResponse();
			let publicRouteNext = false;
			await mcpAuthMiddleware(
				createMockRequest({ path: "/ready" }) as never,
				publicRoute.response as never,
				() => {
					publicRouteNext = true;
				},
			);
			assert.equal(publicRouteNext, true);

			for (const authorization of [
				undefined,
				"Basic credential",
				"Bearer token with extra fields",
			]) {
				const rejected = createMockResponse();
				await mcpAuthMiddleware(
					createMockRequest({ authorization }) as never,
					rejected.response as never,
					() => assert.fail("invalid authorization headers must not pass"),
				);
				assert.equal(rejected.state.statusCode, 401);
				assert.deepEqual(rejected.state.body, {
					error: "Unauthorized: Missing or invalid Authorization Bearer token",
				});
			}

			const invalidJwt = createMockResponse();
			await mcpAuthMiddleware(
				createMockRequest({ authorization: "Bearer not.a.jwt" }) as never,
				invalidJwt.response as never,
				() => assert.fail("invalid JWTs must not pass"),
			);
			assert.equal(invalidJwt.state.statusCode, 401);
			assert.deepEqual(invalidJwt.state.body, {
				error: "Unauthorized: Token validation failed",
			});

			const forbidden = createMockResponse();
			await mcpAuthMiddleware(
				createMockRequest({
					authorization: `Bearer ${forbiddenToken}`,
				}) as never,
				forbidden.response as never,
				() => assert.fail("disallowed organizations must not pass"),
			);
			assert.equal(forbidden.state.statusCode, 403);
			assert.deepEqual(forbidden.state.body, {
				error: "Forbidden: Principal is not authorized",
			});

			const policy = {
				mode: "clerk" as const,
				issuer,
				allowedSubjects: ["user_test"],
				allowedOrganizationIds: ["org_primary"],
				allowedRoles: ["org:admin"],
				requiredPermissions: ["org:read", "org:write"],
			};
			const nestedPrincipal = authorizeClerkClaims(
				{
					sub: " user_test ",
					org_id: "org_primary",
					org_role: "org:admin",
					org_permissions: ["org:read", "org:write", "org:read", null],
					roles: ["org:admin", "org:viewer", "", 7],
					permissions: ["org:write"],
				},
				policy,
			);
			assert.deepEqual(nestedPrincipal, {
				id: `clerk:${issuer}:user_test`,
				mode: "clerk",
				subject: "user_test",
				organizationId: "org_primary",
				roles: ["org:admin", "org:viewer"],
				permissions: ["org:read", "org:write"],
			});

			for (const [claims, message] of [
				[{}, /missing a subject/],
				[{ sub: "other" }, /subject is not authorized/],
				[{ sub: "user_test" }, /organization is not authorized/],
				[
					{
						sub: "user_test",
						org_id: "org_primary",
						org_role: "org:viewer",
					},
					/role is not authorized/,
				],
				[
					{
						sub: "user_test",
						org_id: "org_primary",
						org_role: "org:admin",
						org_permissions: ["org:read"],
					},
					/missing a required permission/,
				],
			] as const) {
				assert.throws(() => authorizeClerkClaims(claims, policy), message);
			}
		});
	});
});

describe("clerk identity-bound policy", () => {
	const issuer = "https://clerk.example.com";
	const jwksUrl = `${issuer}/.well-known/jwks.json`;

	afterEach(() => {
		resetEnv();
		resetHttpAuthStateForTest();
	});

	function configureClerk(extra: Record<string, string>): void {
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = issuer;
		process.env.CLERK_AUDIENCE = "test-audience";
		process.env.CLERK_JWKS_URL = jwksUrl;
		for (const key of [
			"CLERK_ALLOWED_SUBJECTS",
			"CLERK_ALLOWED_ORGANIZATION_IDS",
			"CLERK_ALLOWED_ROLES",
			"CLERK_REQUIRED_PERMISSIONS",
		]) {
			delete process.env[key];
		}
		Object.assign(process.env, extra);
	}

	for (const [label, extra] of [
		["roles only", { CLERK_ALLOWED_ROLES: "org:admin" }],
		["permissions only", { CLERK_REQUIRED_PERMISSIONS: "org:billing:read" }],
		[
			"roles and permissions",
			{
				CLERK_ALLOWED_ROLES: "org:admin",
				CLERK_REQUIRED_PERMISSIONS: "org:billing:read",
			},
		],
	] as const) {
		it(`rejects a ${label} policy at startup`, () => {
			configureClerk(extra);
			assert.throws(
				() => resetHttpAuthStateForTest(),
				/requires an identity-bound authorization policy/,
			);
		});
	}

	it("accepts a subject-only or organization-only policy", () => {
		configureClerk({ CLERK_ALLOWED_SUBJECTS: "user_a" });
		assert.doesNotThrow(() => resetHttpAuthStateForTest());
		configureClerk({ CLERK_ALLOWED_ORGANIZATION_IDS: "org_a" });
		assert.doesNotThrow(() => resetHttpAuthStateForTest());
	});

	it("keeps extra constraints conjunctive with the identity allowlist", () => {
		configureClerk({
			CLERK_ALLOWED_ORGANIZATION_IDS: "org_a",
			CLERK_ALLOWED_ROLES: "org:admin",
		});
		resetHttpAuthStateForTest();
		const config = getHttpAuthConfig();
		assert.throws(
			() =>
				authorizeClerkClaims(
					{ sub: "user_a", org_id: "org_a", org_role: "org:member" },
					config,
				),
			/role is not authorized/,
		);
		assert.throws(
			() =>
				authorizeClerkClaims(
					{ sub: "user_a", org_id: "org_b", org_role: "org:admin" },
					config,
				),
			/organization is not authorized/,
		);
	});

	it("rejects signed v1 and v2 tokens from another organization", async () => {
		configureClerk({
			CLERK_ALLOWED_ORGANIZATION_IDS: "org_primary",
			CLERK_ALLOWED_ROLES: "org:admin",
		});
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		publicJwk.kid = "org-bound-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";
		const sign = (claims: Record<string, unknown>) =>
			new SignJWT(claims)
				.setProtectedHeader({ alg: "RS256", kid: "org-bound-key" })
				.setSubject("user_test")
				.setIssuer(issuer)
				.setAudience("test-audience")
				.setIssuedAt()
				.setExpirationTime("5m")
				.sign(privateKey);
		const v1 = await sign({ org_id: "org_other", org_role: "org:admin" });
		const v2 = await sign({ v: 2, o: { id: "org_other", rol: "admin" } });

		await withStubbedJwksFetch(jwksUrl, { keys: [publicJwk] }, async () => {
			resetHttpAuthStateForTest();
			for (const token of [v1, v2]) {
				const { response, state } = createMockResponse();
				await mcpAuthMiddleware(
					createMockRequest({ authorization: `Bearer ${token}` }) as never,
					response as never,
					() => assert.fail("another organization must not pass"),
				);
				assert.equal(state.statusCode, 403);
			}
		});
	});
});

describe("clerk session and claim validation", () => {
	const issuer = "https://clerk.example.com";
	const jwksUrl = `${issuer}/.well-known/jwks.json`;

	afterEach(() => {
		resetEnv();
		resetHttpAuthStateForTest();
	});

	async function setup() {
		process.env.MCP_AUTH_MODE = "clerk";
		process.env.CLERK_ISSUER = issuer;
		process.env.CLERK_AUDIENCE = "test-audience";
		process.env.CLERK_JWKS_URL = jwksUrl;
		process.env.CLERK_ALLOWED_SUBJECTS = "user_test";
		const { publicKey, privateKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const publicJwk = await exportJWK(publicKey);
		publicJwk.kid = "session-key";
		publicJwk.alg = "RS256";
		publicJwk.use = "sig";
		const sign = (
			claims: Record<string, unknown>,
			overrides: {
				issuer?: string;
				audience?: string;
				exp?: string | number;
			} = {},
		) =>
			new SignJWT(claims)
				.setProtectedHeader({ alg: "RS256", kid: "session-key" })
				.setSubject("user_test")
				.setIssuer(overrides.issuer ?? issuer)
				.setAudience(overrides.audience ?? "test-audience")
				.setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
				.setExpirationTime(overrides.exp ?? "5m")
				.sign(privateKey);
		return { jwks: { keys: [publicJwk] }, sign };
	}

	async function run(token: string) {
		resetHttpAuthStateForTest();
		const { response, state } = createMockResponse();
		let nextCalled = false;
		await mcpAuthMiddleware(
			createMockRequest({ authorization: `Bearer ${token}` }) as never,
			response as never,
			() => {
				nextCalled = true;
			},
		);
		return { state, nextCalled };
	}

	it("rejects pending sessions with a generic 401", async () => {
		const { jwks, sign } = await setup();
		const token = await sign({ sts: "pending" });
		await withStubbedJwksFetch(jwksUrl, jwks, async () => {
			const { state, nextCalled } = await run(token);
			assert.equal(nextCalled, false);
			assert.equal(state.statusCode, 401);
			assert.deepEqual(state.body, {
				error: "Unauthorized: Token validation failed",
			});
		});
	});

	it("accepts active sessions and sessions with no sts", async () => {
		const { jwks, sign } = await setup();
		const active = await sign({ sts: "active" });
		const bare = await sign({});
		await withStubbedJwksFetch(jwksUrl, jwks, async () => {
			assert.equal((await run(active)).nextCalled, true);
			assert.equal((await run(bare)).nextCalled, true);
		});
	});

	it("rejects tokens with the wrong audience, wrong issuer or an expired exp", async () => {
		const { jwks, sign } = await setup();
		const tokens = [
			await sign({}, { audience: "someone-else" }),
			await sign({}, { issuer: "https://evil.example.com" }),
			await sign({}, { exp: Math.floor(Date.now() / 1000) - 600 }),
		];
		await withStubbedJwksFetch(jwksUrl, jwks, async () => {
			for (const token of tokens) {
				const { state, nextCalled } = await run(token);
				assert.equal(nextCalled, false);
				assert.equal(state.statusCode, 401);
			}
		});
	});
});

describe("clerk v2 session token decoding", () => {
	const issuer = "https://clerk.example.com";
	const policy = { mode: "clerk" as const, issuer };

	it("reads the organization and role from the compact o claim", () => {
		const principal = authorizeClerkClaims(
			{ sub: "user_a", v: 2, o: { id: "org_a", rol: "admin" } },
			policy,
		);
		assert.equal(principal.organizationId, "org_a");
		assert.deepEqual(principal.roles, ["org:admin"]);
		assert.deepEqual(principal.permissions, []);
	});

	it("keeps v1 flat claims working", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 1,
				org_id: "org_a",
				org_role: "org:admin",
				org_permissions: ["org:billing:read"],
			},
			policy,
		);
		assert.equal(principal.organizationId, "org_a");
		assert.deepEqual(principal.roles, ["org:admin"]);
		assert.deepEqual(principal.permissions, ["org:billing:read"]);
	});

	it("does not trust flat org claims on a v2 token", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				org_id: "org_flat",
				org_role: "org:admin",
				org_permissions: ["org:billing:read"],
			},
			policy,
		);
		assert.equal(principal.organizationId, undefined);
		assert.deepEqual(principal.roles, []);
		assert.deepEqual(principal.permissions, []);
	});

	it("rebuilds permissions from fea, o.per and o.fpm (Clerk docs example)", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				fea: "o:dashboard,o:teams",
				o: { id: "org_a", rol: "admin", per: "manage,read", fpm: "3,2" },
			},
			policy,
		);
		assert.deepEqual(principal.permissions, [
			"org:dashboard:manage",
			"org:dashboard:read",
			"org:teams:read",
		]);
	});

	it("skips zero and missing masks", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				fea: "o:a,o:b,o:c",
				o: { id: "org_a", per: "read,write", fpm: "0,2" },
			},
			policy,
		);
		assert.deepEqual(principal.permissions, ["org:b:write"]);
	});

	it("only counts org-scoped features and keeps their order", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				fea: "u:personal,o:teams,ou:shared",
				o: { id: "org_a", per: "read", fpm: "1,1" },
			},
			policy,
		);
		assert.deepEqual(principal.permissions, [
			"org:teams:read",
			"org:shared:read",
		]);
	});

	it("decodes masks wider than 32 bits", () => {
		const names = Array.from({ length: 40 }, (_, i) => `p${i}`).join(",");
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				fea: "o:wide",
				// bits 0 and 35
				o: { id: "org_a", per: names, fpm: String((1n << 35n) | 1n) },
			},
			policy,
		);
		assert.deepEqual(principal.permissions, ["org:wide:p0", "org:wide:p35"]);
	});

	it("ignores mask bits beyond the permission list", () => {
		const principal = authorizeClerkClaims(
			{
				sub: "user_a",
				v: 2,
				fea: "o:f",
				o: { id: "org_a", per: "read", fpm: "7" },
			},
			policy,
		);
		assert.deepEqual(principal.permissions, ["org:f:read"]);
	});

	it("grants nothing for malformed mappings", () => {
		for (const claims of [
			{ fea: "o:f", o: { id: "org_a", per: "read", fpm: "abc" } },
			{ fea: "o:f", o: { id: "org_a", per: "read", fpm: "-1" } },
			{ fea: "o:f", o: { id: "org_a", per: "read", fpm: "1.5" } },
			{ fea: "nocolon", o: { id: "org_a", per: "read", fpm: "1" } },
			{ fea: "o:f", o: { id: "org_a", per: ["read"], fpm: "1" } },
			{ fea: "o:f", o: { id: "org_a", per: "read" } },
			{ fea: ["o:f"], o: { id: "org_a", per: "read", fpm: "1" } },
			{ o: { id: "org_a", per: "read", fpm: "1" } },
		]) {
			const principal = authorizeClerkClaims(
				{ sub: "user_a", v: 2, ...claims },
				policy,
			);
			assert.deepEqual(principal.permissions, [], JSON.stringify(claims));
		}
	});

	it("authorizes a v2 token against role and permission constraints", () => {
		const config = {
			...policy,
			allowedOrganizationIds: ["org_a"],
			allowedRoles: ["org:admin"],
			requiredPermissions: ["org:billing:read"],
		};
		const claims = {
			sub: "user_a",
			v: 2,
			fea: "o:billing",
			o: { id: "org_a", rol: "admin", per: "read", fpm: "1" },
		};
		assert.doesNotThrow(() => authorizeClerkClaims(claims, config));
		assert.throws(
			() =>
				authorizeClerkClaims(
					{ ...claims, o: { ...claims.o, rol: "member" } },
					config,
				),
			/role is not authorized/,
		);
		assert.throws(
			() =>
				authorizeClerkClaims(
					{ ...claims, o: { ...claims.o, fpm: "0" } },
					config,
				),
			/missing a required permission/,
		);
	});
});
