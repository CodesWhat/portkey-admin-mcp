import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getServerConfig } from "../src/lib/config.js";
import { Logger } from "../src/lib/logger.js";

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
		assert.equal(config.protocol, "http");
		assert.equal(config.port, 3000);
		assert.equal(config.host, "127.0.0.1");
		assert.equal(config.maxSessions, 100);
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

	it("rejects malformed active numeric settings", () => {
		for (const [name, value] of [
			["PORT", "3000oops"],
			["MCP_MAX_SESSIONS", "2.5"],
		]) {
			resetEnv();
			process.env[name] = value;
			assert.throws(
				() => getServerConfig(),
				new RegExp(`Invalid ${name} value`),
			);
		}
	});

	it("ignores retired replay/session settings and warns using names only", (t) => {
		const names = [
			"MCP_SESSION_MODE",
			"MCP_SESSION_TIMEOUT",
			"MCP_EVENT_STORE",
			"MCP_EVENT_TTL_SECONDS",
			"MCP_EVENT_STORE_MAX_EVENTS",
			"MCP_EVENT_STORE_MAX_BYTES",
			"MCP_EVENT_STORE_COMMAND_TIMEOUT_MS",
			"MCP_EVENT_ENCRYPTION_KEY",
			"MCP_REDIS_KEY_PREFIX",
		];
		const sensitive = "private-legacy-value";
		for (const name of names) process.env[name] = sensitive;
		const warn = t.mock.method(Logger, "warn", () => {});
		const config = getServerConfig();
		assert.equal("sessionMode" in config, false);
		assert.equal("eventStore" in config, false);
		assert.equal(config.maxSessions, 100);
		const messages = warn.mock.calls
			.map((call) => JSON.stringify(call.arguments))
			.join("\n");
		for (const name of names) assert.ok(messages.includes(name), name);
		assert.ok(!messages.includes(sensitive));
		assert.match(messages, /ignored/);
	});

	it("rejects a malformed shutdown timeout", () => {
		process.env.MCP_SHUTDOWN_TIMEOUT_MS = "5000ms";

		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_SHUTDOWN_TIMEOUT_MS value/,
		);
	});

	it("validates host, integer and TLS edge cases", () => {
		process.env.MCP_HOST = "   ";
		assert.throws(() => getServerConfig(), /Invalid MCP_HOST value/);
		resetEnv();
		process.env.MCP_SHUTDOWN_TIMEOUT_MS = "0";
		assert.throws(
			() => getServerConfig(),
			/Invalid MCP_SHUTDOWN_TIMEOUT_MS value/,
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
