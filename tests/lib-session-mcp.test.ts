import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { createMcpServer, resolveToolDomains } from "../src/lib/mcp-server.js";

const ORIGINAL_ENV = { ...process.env };

describe("MCP argument complexity limit", () => {
	it("rejects excessive arrays and records before schema validation or execution", async () => {
		const { server } = createMcpServer({ toolDomains: ["configs"] });
		const client = new Client({ name: "input-budget-test", version: "1.0.0" });
		let validations = 0;
		let calls = 0;
		server.registerTool(
			"inspect_inputs",
			{
				inputSchema: z.object({
					values: z.unknown().transform((value) => {
						validations += 1;
						return value;
					}),
				}),
			},
			async () => {
				calls += 1;
				return { content: [{ type: "text", text: "accepted" }] };
			},
		);
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		try {
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			for (const values of [
				Array(10_001).fill(0),
				Object.fromEntries(
					Array.from({ length: 10_001 }, (_, i) => [`k${i}`, 0]),
				),
				Array.from({ length: 100 }, () => Array(101).fill(0)),
			]) {
				const result = await client.callTool({
					name: "inspect_inputs",
					arguments: { values },
				});
				assert.equal(result.isError, true);
				assert.match(
					JSON.stringify(result.content),
					/limit|elements|complexity/i,
				);
			}
			assert.equal(validations, 0);
			assert.equal(calls, 0);
			const accepted = await client.callTool({
				name: "inspect_inputs",
				arguments: { values: Array(1_000).fill(0) },
			});
			assert.notEqual(accepted.isError, true);
			assert.equal(validations, 1);
			assert.equal(calls, 1);
		} finally {
			await Promise.allSettled([client.close(), server.close()]);
		}
	});
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

function _sessionEntry(
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
