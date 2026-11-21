/**
 * Misconfigured security settings must stop the server at startup, not fall
 * back to something permissive. Each case below is a guard that previously
 * had no test.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetHttpAuthStateForTest } from "../src/lib/auth.js";

const ORIGINAL_ENV = { ...process.env };

const SECURITY_KEYS = [
	"RATE_LIMIT_ENABLED",
	"RATE_LIMIT_STORE",
	"RATE_LIMIT_REDIS_URL",
	"MCP_REDIS_URL",
	"REDIS_URL",
	"RATE_LIMIT_SINGLE_PROCESS",
	"NODE_ENV",
	"MCP_AUTH_MODE",
	"MCP_AUTH_TOKEN",
];

function clearSecurityEnv(): void {
	for (const key of SECURITY_KEYS) delete process.env[key];
}

// security.ts resolves its config when it evaluates, so it is loaded only
// after the ambient security env is cleared; a static import would run first.
clearSecurityEnv();
const { resetSecurityStateForTest } = await import("../src/lib/security.js");

beforeEach(() => {
	clearSecurityEnv();
});

afterEach(async () => {
	// Reset against a clean env before restoring the ambient one, so neither a
	// case's invalid values nor the caller's environment can make cleanup throw.
	clearSecurityEnv();
	await resetSecurityStateForTest();
	resetHttpAuthStateForTest();
	process.env = { ...ORIGINAL_ENV };
});

/**
 * security.ts resolves its rate-limit config at module load. The test reset
 * hook re-runs the same resolution against the current env and throws before
 * mutating state when the config is invalid, so no fresh module copy is needed.
 */
function loadSecurityModule(): Promise<void> {
	return resetSecurityStateForTest();
}

describe("rate-limit store configuration", () => {
	it("loads with the in-memory default", async () => {
		await assert.doesNotReject(loadSecurityModule());
	});

	it("rejects an unknown RATE_LIMIT_STORE", async () => {
		process.env.RATE_LIMIT_STORE = "bogus";
		await assert.rejects(
			loadSecurityModule(),
			/Invalid RATE_LIMIT_STORE value: bogus\. Must be 'memory' or 'redis'/,
		);
	});

	it("requires a Redis URL when the store is redis", async () => {
		process.env.RATE_LIMIT_STORE = "redis";
		await assert.rejects(
			loadSecurityModule(),
			/RATE_LIMIT_STORE=redis requires RATE_LIMIT_REDIS_URL, MCP_REDIS_URL, or REDIS_URL/,
		);
	});

	it("rejects an unparsable Redis URL", async () => {
		process.env.RATE_LIMIT_STORE = "redis";
		process.env.RATE_LIMIT_REDIS_URL = "not a url";
		await assert.rejects(
			loadSecurityModule(),
			/Rate-limit Redis URL must be a valid redis:\/\/ or rediss:\/\/ URL/,
		);
	});

	it("rejects a Redis URL with the wrong scheme", async () => {
		process.env.RATE_LIMIT_STORE = "redis";
		process.env.RATE_LIMIT_REDIS_URL = "http://cache.example.com:6379";
		await assert.rejects(
			loadSecurityModule(),
			/Rate-limit Redis URL must use redis:\/\/ or rediss:\/\//,
		);
	});

	it("rejects a plaintext redis:// URL in production", async () => {
		process.env.RATE_LIMIT_STORE = "redis";
		process.env.REDIS_URL = "redis://cache.example.com:6379";
		process.env.NODE_ENV = "production";
		await assert.rejects(
			loadSecurityModule(),
			/Rate-limit Redis URL must use rediss:\/\/ in production/,
		);
	});

	it("accepts rediss:// in production and redis:// outside it", async () => {
		process.env.RATE_LIMIT_STORE = "redis";
		process.env.REDIS_URL = "rediss://cache.example.com:6380";
		process.env.NODE_ENV = "production";
		await assert.doesNotReject(loadSecurityModule());

		process.env.REDIS_URL = "redis://cache.example.com:6379";
		process.env.NODE_ENV = "development";
		await assert.doesNotReject(loadSecurityModule());
	});

	it("refuses unshared in-memory limiting in production", async () => {
		process.env.NODE_ENV = "production";
		await assert.rejects(
			loadSecurityModule(),
			/Production in-memory rate limiting requires RATE_LIMIT_SINGLE_PROCESS=true/,
		);
	});
});

describe("HTTP auth mode configuration", () => {
	it("rejects an unknown MCP_AUTH_MODE", () => {
		process.env.MCP_AUTH_MODE = "bogus";
		assert.throws(
			() => resetHttpAuthStateForTest(),
			/Invalid MCP_AUTH_MODE value: bogus\. Must be 'none', 'bearer', or 'clerk'/,
		);
	});

	it("rejects bearer mode without MCP_AUTH_TOKEN", () => {
		process.env.MCP_AUTH_MODE = "bearer";
		assert.throws(
			() => resetHttpAuthStateForTest(),
			/MCP_AUTH_MODE=bearer requires MCP_AUTH_TOKEN to be set/,
		);

		process.env.MCP_AUTH_TOKEN = "   ";
		assert.throws(
			() => resetHttpAuthStateForTest(),
			/MCP_AUTH_MODE=bearer requires MCP_AUTH_TOKEN to be set/,
		);
	});

	it("accepts bearer mode once a token is set", () => {
		process.env.MCP_AUTH_MODE = "bearer";
		process.env.MCP_AUTH_TOKEN = "a-real-shared-secret";
		assert.doesNotThrow(() => resetHttpAuthStateForTest());
	});
});
