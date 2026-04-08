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
		delete process.env.MCP_TLS_KEY_PATH;
		delete process.env.MCP_TLS_CERT_PATH;
		delete process.env.MCP_TLS_CA_PATH;

		const config = getServerConfig();
		assert.equal(config.transport, "stdio");
		assert.equal(config.sessionMode, "stateful");
		assert.equal(config.eventStore.mode, "off");
		assert.equal(config.eventStore.ttlSeconds, 3600);
		assert.equal(config.protocol, "http");
		assert.equal(config.port, 3000);
		assert.equal(config.host, "0.0.0.0");
		assert.equal(config.maxSessions, 100);
		assert.equal(config.sessionTimeout, 3_600_000);
		assert.equal(config.tls.enabled, false);
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

	it("uses memory event store by default in stateless mode", () => {
		process.env.MCP_SESSION_MODE = "stateless";
		const config = getServerConfig();
		assert.equal(config.sessionMode, "stateless");
		assert.equal(config.eventStore.mode, "memory");
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

		const config = getServerConfig();
		assert.equal(config.eventStore.mode, "redis");
		assert.equal(config.eventStore.redisUrl, "redis://localhost:6380");
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
});
