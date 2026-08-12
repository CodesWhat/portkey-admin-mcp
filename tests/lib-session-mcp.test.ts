import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, resolveToolDomains } from "../src/lib/mcp-server.js";
import { SessionStore } from "../src/lib/session-store.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

function sessionEntry(
	transport: { close?: () => void | Promise<void> },
	lastActivity: number,
) {
	return {
		transport: transport as never,
		ownerKey: "principal-a",
		createdAt: lastActivity,
		lastActivity,
	};
}

describe("SessionStore lifecycle", () => {
	it("supports lookup, touch, replacement, deletion, and reservation-backed inserts", () => {
		const originalDateNow = Date.now;
		Date.now = () => 500;
		try {
			const store = new SessionStore(1);
			const firstTransport = { close() {} };
			const replacementTransport = { close() {} };

			assert.equal(store.tryReserve(), true);
			store.set("session-1", sessionEntry(firstTransport, 100));
			assert.equal(store.size, 1);
			assert.equal(store.has("session-1"), true);
			assert.equal(store.getTransport("session-1"), firstTransport);
			assert.deepEqual(store.getAllSessionIds(), ["session-1"]);

			store.touch("session-1");
			assert.equal(store.get("session-1")?.lastActivity, 500);
			store.touch("missing-session");
			store.set("session-1", sessionEntry(replacementTransport, 600));
			assert.equal(store.getTransport("session-1"), replacementTransport);
			assert.equal(store.delete("missing-session"), false);
			assert.equal(store.delete("session-1"), true);
			assert.equal(store.size, 0);
		} finally {
			Date.now = originalDateNow;
		}
	});

	it("closes expired sessions and tolerates rejected, synchronous, and throwing closes", async () => {
		const originalDateNow = Date.now;
		Date.now = () => 1_000;
		const closeCalls: string[] = [];
		try {
			const store = new SessionStore();
			store.set(
				"async-close",
				sessionEntry(
					{
						async close() {
							closeCalls.push("async-close");
						},
					},
					100,
				),
			);
			store.set(
				"rejected-close",
				sessionEntry(
					{
						async close() {
							closeCalls.push("rejected-close");
							throw new Error("close failed");
						},
					},
					200,
				),
			);
			store.set(
				"sync-close",
				sessionEntry(
					{
						close() {
							closeCalls.push("sync-close");
						},
					},
					300,
				),
			);
			store.set(
				"throwing-close",
				sessionEntry(
					{
						close() {
							closeCalls.push("throwing-close");
							throw new Error("synchronous close failure");
						},
					},
					400,
				),
			);
			store.set("active", sessionEntry({}, 950));

			assert.deepEqual(await store.cleanup(500), [
				"async-close",
				"rejected-close",
				"sync-close",
				"throwing-close",
			]);
			assert.deepEqual(closeCalls, [
				"async-close",
				"rejected-close",
				"sync-close",
				"throwing-close",
			]);
			assert.deepEqual(store.getAllSessionIds(), ["active"]);
		} finally {
			Date.now = originalDateNow;
		}
	});

	it("closes all transports and resets active and reserved capacity", async () => {
		const store = new SessionStore(2);
		let closeCalls = 0;
		store.set(
			"session-1",
			sessionEntry(
				{
					async close() {
						closeCalls += 1;
					},
				},
				100,
			),
		);
		assert.equal(store.tryReserve(), true);

		await store.closeAll();

		assert.equal(closeCalls, 1);
		assert.equal(store.size, 0);
		assert.equal(store.tryReserve(), true);
		assert.equal(store.tryReserve(), true);
		assert.equal(store.tryReserve(), false);
	});
});

describe("MCP tool-domain resolution", () => {
	it("normalizes caller-selected domains when no deployment allowlist is set", () => {
		delete process.env.PORTKEY_TOOL_DOMAINS;
		delete process.env.MCP_TOOL_DOMAINS;

		assert.equal(resolveToolDomains(), undefined);
		assert.deepEqual(
			resolveToolDomains(["analytics", "prompts", "analytics"]),
			["prompts", "analytics"],
		);
	});

	it("uses the configured allowlist and rejects empty or unknown domains", () => {
		process.env.PORTKEY_TOOL_DOMAINS = " analytics, prompts, analytics ";
		assert.deepEqual(resolveToolDomains(), ["prompts", "analytics"]);
		assert.deepEqual(resolveToolDomains(["prompts"]), ["prompts"]);
		assert.throws(
			() => resolveToolDomains(["keys"]),
			/Requested tool domains are not allowed/,
		);

		process.env.PORTKEY_TOOL_DOMAINS = ", ,";
		assert.throws(() => resolveToolDomains(), /Expected one or more domains/);
		process.env.PORTKEY_TOOL_DOMAINS = "prompts,not-a-domain";
		assert.throws(() => resolveToolDomains(), /Unknown tool domains/);
	});

	it("falls back to the legacy MCP_TOOL_DOMAINS setting", () => {
		delete process.env.PORTKEY_TOOL_DOMAINS;
		process.env.MCP_TOOL_DOMAINS = "keys, users";

		assert.deepEqual(resolveToolDomains(), ["users", "keys"]);
	});
});

describe("built-in MCP workflow guidance", () => {
	it("serves the workflow prompt and guide through the real MCP protocol", async () => {
		delete process.env.PORTKEY_TOOL_DOMAINS;
		delete process.env.MCP_TOOL_DOMAINS;
		process.env.PORTKEY_API_KEY = "test-dummy-key";
		const { server } = createMcpServer({ toolDomains: ["prompts"] });
		const client = new Client({
			name: "lib-runtime-test-client",
			version: "1.0.0",
		});
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();

		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			const prompts = await client.listPrompts();
			assert.ok(
				prompts.prompts.some(
					(prompt) => prompt.name === "plan_portkey_admin_workflow",
				),
			);

			const rendered = await client.getPrompt({
				name: "plan_portkey_admin_workflow",
				arguments: { task: "inspect prompt versions" },
			});
			assert.equal(rendered.messages.length, 2);
			const taskMessage = rendered.messages[1]?.content;
			assert.equal(taskMessage?.type, "text");
			if (taskMessage?.type === "text") {
				assert.match(taskMessage.text, /inspect prompt versions/);
				assert.doesNotMatch(taskMessage.text, /^Area:/m);
				assert.match(
					taskMessage.text,
					/Prefer read-only discovery tools first/,
				);
			}

			const resources = await client.listResources();
			assert.ok(
				resources.resources.some(
					(resource) => resource.uri === "portkey-admin://docs/workflow-guide",
				),
			);
			const guide = await client.readResource({
				uri: "portkey-admin://docs/workflow-guide",
			});
			const guideContent = guide.contents[0];
			assert.ok(guideContent && "text" in guideContent);
			if (guideContent && "text" in guideContent) {
				assert.match(guideContent.text, /least-privileged Portkey API key/);
			}
		} finally {
			await Promise.allSettled([client.close(), server.close()]);
		}
	});
});

describe("HTTP runtime facade", () => {
	it("shares one lazy runtime and closes it idempotently", async () => {
		process.env.MCP_AUTH_MODE = "bearer";
		process.env.MCP_AUTH_TOKEN = "test-secret";
		process.env.RATE_LIMIT_ENABLED = "false";
		delete process.env.PORTKEY_API_KEY;
		const serverModule = await import(
			`../src/server.js?runtime=${Date.now()}-${Math.random()}`
		);

		const first = serverModule.getHttpAppRuntime();
		const second = serverModule.getHttpAppRuntime();
		assert.equal(first, second);
		const runtime = first as unknown as {
			startHttpServer: () => unknown;
		};
		const originalStartHttpServer = runtime.startHttpServer;
		const serverSentinel = { listening: false };
		let startCalls = 0;
		runtime.startHttpServer = () => {
			startCalls += 1;
			return serverSentinel;
		};
		try {
			assert.equal(serverModule.startHttpServer(), serverSentinel);
			assert.equal(startCalls, 1);
		} finally {
			runtime.startHttpServer = originalStartHttpServer;
		}
		serverModule.setServerReady();
		serverModule.setServerReady(false);
		await serverModule.closeHttpApp();
		await serverModule.closeHttpApp();
	});
});
