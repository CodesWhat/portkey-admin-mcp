import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getServerConfig } from "../src/lib/config.js";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
	process.env = { ...ORIGINAL_ENV };
}

describe("getServerConfig", () => {
	afterEach(() => {
		resetEnv();
	});

	it("uses safe defaults for HTTP hosting", () => {
		delete process.env.MCP_TRANSPORT;
		delete process.env.PORT;
		delete process.env.MCP_PORT;
		delete process.env.MCP_HOST;
		delete process.env.MCP_MAX_SESSIONS;
		delete process.env.MCP_SESSION_TIMEOUT;
		delete process.env.MCP_EVENT_STORE_COMMAND_TIMEOUT_MS;
		delete process.env.MCP_EVENT_STORE_MAX_EVENTS;
		delete process.env.MCP_EVENT_STORE_MAX_BYTES;
		delete process.env.MCP_TLS_KEY_PATH;
		delete process.env.MCP_TLS_CERT_PATH;
		delete process.env.MCP_TLS_CA_PATH;

		const config = getServerConfig();
		assert.equal(config.transport, "stdio");
		assert.equal(config.sessionMode, "stateful");
		assert.equal(config.eventStore.mode, "off");
		assert.equal(config.eventStore.ttlSeconds, 300);
		assert.equal(config.eventStore.commandTimeoutMs, 5_000);
		assert.equal(config.eventStore.maxEvents, 10_000);
		assert.equal(config.eventStore.maxBytes, 64 * 1024 * 1024);
		assert.equal(config.protocol, "http");
		assert.equal(config.port, 3000);
		assert.equal(config.host, "127.0.0.1");
		assert.equal(config.maxSessions, 100);
		assert.equal(config.sessionTimeout, 3_600_000);
		assert.equal(config.shutdownTimeout, 10_000);
		assert.equal(config.tls.enabled, false);
	});

	it("allows explicitly binding HTTP transport to all interfaces", () => {
		process.env.MCP_HOST = "0.0.0.0";

		const config = getServerConfig();

		assert.equal(config.host, "0.0.0.0");
	});

	it("prefers PORT over MCP_PORT", () => {
		process.env.PORT = "4321";
		process.env.MCP_PORT = "9999";

		const config = getServerConfig();
		assert.equal(config.port, 4321);
	});

	it("throws on invalid transport", () => {
		process.env.MCP_TRANSPORT = "grpc";
		assert.throws(() => getServerConfig(), /Invalid MCP_TRANSPORT value/);
	});

	it("throws on invalid session mode", () => {
		process.env.MCP_SESSION_MODE = "redis";
		assert.throws(() => getServerConfig(), /Invalid MCP_SESSION_MODE value/);
	});

	it("disables the event store by default in stateless mode", () => {
		process.env.MCP_SESSION_MODE = "stateless";
		const config = getServerConfig();
		assert.equal(config.sessionMode, "stateless");
		assert.equal(config.eventStore.mode, "off");
	});

	it("requires Redis URL when MCP_EVENT_STORE=redis", () => {
		process.env.MCP_EVENT_STORE = "redis";
		delete process.env.MCP_REDIS_URL;
		delete process.env.REDIS_URL;
		assert.throws(
			() => getServerConfig(),
			/MCP_EVENT_STORE=redis requires MCP_REDIS_URL/,
		);
	});

	it("prefers MCP_REDIS_URL over REDIS_URL", () => {
		process.env.MCP_EVENT_STORE = "redis";
		process.env.MCP_REDIS_URL = "redis://localhost:6380";
		process.env.REDIS_URL = "redis://localhost:6379";
		process.env.MCP_EVENT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
			"base64",
		);

		const config = getServerConfig();
		assert.equal(config.eventStore.mode, "redis");
		assert.equal(config.eventStore.redisUrl, "redis://localhost:6380");
	});

	it("requires rediss transport for Redis in production", () => {
		process.env.NODE_ENV = "production";
		process.env.MCP_EVENT_STORE = "redis";
		process.env.MCP_REDIS_URL = "redis://cache.example.com:6379";
		process.env.MCP_EVENT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
			"base64",
		);

		assert.throws(
			() => getServerConfig(),
			/MCP_REDIS_URL must use rediss:\/\/ in production/,
		);
	});

	it("requires a 32-byte encryption key for Redis event payloads", () => {
		process.env.MCP_EVENT_STORE = "redis";
		process.env.MCP_REDIS_URL = "redis://localhost:6379";
		delete process.env.MCP_EVENT_ENCRYPTION_KEY;

		assert.throws(
			() => getServerConfig(),
			/MCP_EVENT_ENCRYPTION_KEY must be base64-encoded 32-byte key/,
		);

		process.env.MCP_EVENT_ENCRYPTION_KEY = Buffer.alloc(31).toString("base64");
		assert.throws(
			() => getServerConfig(),
			/MCP_EVENT_ENCRYPTION_KEY must be base64-encoded 32-byte key/,
		);
	});

	it("throws on invalid event store mode", () => {
		process.env.MCP_EVENT_STORE = "s3";
		assert.throws(() => getServerConfig(), /Invalid MCP_EVENT_STORE value/);
	});

	it("throws when only one TLS path is set", () => {
		process.env.MCP_TLS_KEY_PATH = "/tmp/key.pem";
		delete process.env.MCP_TLS_CERT_PATH;
		assert.throws(
			() => getServerConfig(),
			/MCP_TLS_KEY_PATH and MCP_TLS_CERT_PATH must both be set/,
		);
	});

	it("allows overriding the maximum active session count", () => {
		process.env.MCP_MAX_SESSIONS = "250";

		const config = getServerConfig();

		assert.equal(config.maxSessions, 250);
	});

	it("throws on invalid maximum session count", () => {
		process.env.MCP_MAX_SESSIONS = "0";

		assert.throws(() => getServerConfig(), /Invalid MCP_MAX_SESSIONS value/);
	});

	it("allows overriding the event store command timeout", () => {
		process.env.MCP_EVENT_STORE_COMMAND_TIMEOUT_MS = "2500";

		const config = getServerConfig();

		assert.equal(config.eventStore.commandTimeoutMs, 2_500);
	});

	it("allows 0 as a sentinel to disable the event store command timeout", () => {
		process.env.MCP_EVENT_STORE_COMMAND_TIMEOUT_MS = "0";

		const config = getServerConfig();

		assert.equal(config.eventStore.commandTimeoutMs, 0);
	});

	it("throws on a negative event store command timeout", () => {
		process.env.MCP_EVENT_STORE_COMMAND_TIMEOUT_MS = "-1";

		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_EVENT_STORE_COMMAND_TIMEOUT_MS value/,
		);
	});

	it("configures positive in-memory event count and byte caps", () => {
		process.env.MCP_EVENT_STORE_MAX_EVENTS = "25";
		process.env.MCP_EVENT_STORE_MAX_BYTES = "4096";
		const config = getServerConfig();
		assert.equal(config.eventStore.maxEvents, 25);
		assert.equal(config.eventStore.maxBytes, 4096);

		for (const [name, value] of [
			["MCP_EVENT_STORE_MAX_EVENTS", "0"],
			["MCP_EVENT_STORE_MAX_BYTES", "1.5"],
		] as const) {
			resetEnv();
			process.env[name] = value;
			assert.throws(() => getServerConfig(), new RegExp(`Invalid ${name}`));
		}
	});

	it("rejects numeric environment values with trailing characters", () => {
		const invalidValues = [
			["PORT", "3000oops", /Invalid PORT value/],
			["MCP_SESSION_TIMEOUT", "1000ms", /Invalid MCP_SESSION_TIMEOUT value/],
			["MCP_MAX_SESSIONS", "2.5", /Invalid MCP_MAX_SESSIONS value/],
			[
				"MCP_EVENT_TTL_SECONDS",
				"60seconds",
				/Invalid MCP_EVENT_TTL_SECONDS value/,
			],
			[
				"MCP_EVENT_STORE_COMMAND_TIMEOUT_MS",
				"5000ms",
				/Invalid MCP_EVENT_STORE_COMMAND_TIMEOUT_MS value/,
			],
			[
				"MCP_EVENT_STORE_MAX_EVENTS",
				"100events",
				/Invalid MCP_EVENT_STORE_MAX_EVENTS value/,
			],
		] as const;

		for (const [name, value, expectedError] of invalidValues) {
			resetEnv();
			process.env[name] = value;
			assert.throws(() => getServerConfig(), expectedError);
		}
	});

	it("rejects a malformed shutdown timeout", () => {
		process.env.MCP_SHUTDOWN_TIMEOUT_MS = "5000ms";

		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_SHUTDOWN_TIMEOUT_MS value/,
		);
	});

	it("validates host, integer, Redis URL, and TLS edge cases", () => {
		process.env.MCP_HOST = "   ";
		assert.throws(() => getServerConfig(), /Invalid MCP_HOST value/);

		resetEnv();
		process.env.MCP_SESSION_TIMEOUT = "9007199254740992";
		assert.throws(() => getServerConfig(), /Invalid MCP_SESSION_TIMEOUT value/);

		resetEnv();
		process.env.MCP_SHUTDOWN_TIMEOUT_MS = "0";
		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_SHUTDOWN_TIMEOUT_MS value/,
		);

		resetEnv();
		process.env.MCP_EVENT_TTL_SECONDS = "0";
		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_EVENT_TTL_SECONDS value/,
		);

		for (const redisUrl of ["not a URL", "https://cache.example.com"]) {
			resetEnv();
			process.env.MCP_EVENT_STORE = "redis";
			process.env.MCP_REDIS_URL = redisUrl;
			process.env.MCP_EVENT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
				"base64",
			);
			assert.throws(() => getServerConfig(), /MCP_REDIS_URL must/);
		}

		resetEnv();
		process.env.MCP_EVENT_STORE = "redis";
		process.env.MCP_REDIS_URL = "redis://localhost:6379";
		process.env.MCP_EVENT_ENCRYPTION_KEY = Buffer.alloc(32, 7)
			.toString("base64")
			.replace(/=+$/, "");
		assert.throws(
			() => getServerConfig(),
			/MCP_EVENT_ENCRYPTION_KEY must be base64-encoded 32-byte key/,
		);

		resetEnv();
		process.env.MCP_TLS_KEY_PATH = "/tmp/server-key.pem";
		process.env.MCP_TLS_CERT_PATH = "/tmp/server-cert.pem";
		process.env.MCP_TLS_CA_PATH = "/tmp/server-ca.pem";
		const tlsConfig = getServerConfig();
		assert.equal(tlsConfig.protocol, "https");
		assert.deepEqual(tlsConfig.tls, {
			enabled: true,
			keyPath: "/tmp/server-key.pem",
			certPath: "/tmp/server-cert.pem",
			caPath: "/tmp/server-ca.pem",
		});
	});
});

describe("Logger level filtering", () => {
	afterEach(() => {
		resetEnv();
	});

	it("defaults invalid levels to info and writes structured entries", async () => {
		process.env.LOG_LEVEL = "verbose";
		const { Logger } = await import("../src/lib/logger.js");
		const originalWrite = process.stderr.write;
		const writes: string[] = [];
		process.stderr.write = ((chunk: string | Uint8Array) => {
			writes.push(String(chunk));
			return true;
		}) as typeof process.stderr.write;

		try {
			Logger.debug("debug message");
			Logger.info("info message", { requestId: "request-1" });
			Logger.warn("warn message", { statusCode: 429 });
			Logger.error("error message", { error: "upstream failure" });
		} finally {
			process.stderr.write = originalWrite;
		}

		const entries = writes.map(
			(write) => JSON.parse(write) as Record<string, unknown>,
		);
		assert.deepEqual(
			entries.map((entry) => entry.level),
			["info", "warn", "error"],
		);
		assert.equal(entries[0]?.requestId, "request-1");
		assert.equal(entries.at(-1)?.message, "error message");
		assert.equal(entries.at(-1)?.error, "upstream failure");
	});
});
