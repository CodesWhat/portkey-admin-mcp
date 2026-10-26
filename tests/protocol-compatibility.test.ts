import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { type TestContext, test } from "node:test";
import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { resetHttpAuthStateForTest } from "../src/lib/auth.js";
import { createHttpAppRuntime } from "../src/lib/http-app.js";

type RpcResponse = {
	result?: {
		capabilities?: { tools?: unknown };
		tools?: Array<{ name: string }>;
		ttlMs?: number;
		cacheScope?: string;
		protocolVersion?: string;
	};
};

async function readRpc(response: Response): Promise<RpcResponse> {
	const text = await response.text();
	if (response.headers.get("content-type")?.includes("text/event-stream")) {
		const data = text.split("\n").find((line) => line.startsWith("data: "));
		assert.ok(data, text);
		return JSON.parse(data.slice(6));
	}
	return JSON.parse(text);
}

async function withProtocolServer(
	t: TestContext,
	overrides: Record<string, string>,
	run: (
		url: string,
		runtime: ReturnType<typeof createHttpAppRuntime>,
	) => Promise<void>,
) {
	const originalEnv = { ...process.env };
	t.after(() => {
		process.env = originalEnv;
		resetHttpAuthStateForTest();
	});
	Object.assign(process.env, {
		NODE_ENV: "development",
		PORTKEY_API_KEY: "protocol-test-key",
		MCP_AUTH_MODE: "bearer",
		MCP_AUTH_TOKEN: "protocol-test-secret",
		MCP_SESSION_MODE: "stateful",
		MCP_EVENT_STORE: "off",
		RATE_LIMIT_ENABLED: "false",
		...overrides,
	});
	delete process.env.MCP_TLS_KEY_PATH;
	delete process.env.MCP_TLS_CERT_PATH;
	delete process.env.MCP_TLS_CA_PATH;
	resetHttpAuthStateForTest();
	const runtime = createHttpAppRuntime();
	const listener = createServer(runtime.app);
	try {
		await new Promise<void>((resolve) =>
			listener.listen(0, "127.0.0.1", resolve),
		);
		const address = listener.address();
		assert.ok(address && typeof address !== "string");
		const url = `http://127.0.0.1:${address.port}/mcp`;
		await run(url, runtime);
	} finally {
		await runtime.closeHttpApp();
		await new Promise<void>((resolve) => listener.close(() => resolve()));
	}
}

const headers = {
	Authorization: "Bearer protocol-test-secret",
	"Content-Type": "application/json",
	Accept: "application/json, text/event-stream",
};
const modernParams = {
	_meta: {
		"io.modelcontextprotocol/protocolVersion": "2026-07-28",
		"io.modelcontextprotocol/clientInfo": {
			name: "compatibility-test",
			version: "1.0.0",
		},
		"io.modelcontextprotocol/clientCapabilities": {},
	},
};

test("serves modern and legacy discovery on the same authenticated HTTP endpoint", async (t) => {
	await withProtocolServer(t, {}, async (url) => {
		const modernResponse = await fetch(url, {
			method: "POST",
			headers: {
				...headers,
				"MCP-Protocol-Version": "2026-07-28",
				"Mcp-Method": "server/discover",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "server/discover",
				params: modernParams,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		assert.equal(modernResponse.status, 200);
		assert.equal(modernResponse.headers.get("mcp-session-id"), null);
		const modern = await readRpc(modernResponse);
		assert.ok(modern.result?.capabilities?.tools, JSON.stringify(modern));
		const toolsResponse = await fetch(url, {
			method: "POST",
			headers: {
				...headers,
				"MCP-Protocol-Version": "2026-07-28",
				"Mcp-Method": "tools/list",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 2,
				method: "tools/list",
				params: modernParams,
			}),
			signal: AbortSignal.timeout(10_000),
		});
		const modernTools = await readRpc(toolsResponse);
		assert.equal(toolsResponse.status, 200);
		assert.equal(modernTools.result?.tools?.length, 194);
		assert.ok((modernTools.result?.ttlMs ?? 0) > 0);
		assert.equal(modernTools.result?.cacheScope, "private");
		const legacyResponse = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 3,
				method: "initialize",
				params: {
					protocolVersion: "2025-11-25",
					capabilities: {},
					clientInfo: { name: "legacy-test", version: "1.0.0" },
				},
			}),
			signal: AbortSignal.timeout(10_000),
		});
		assert.equal(legacyResponse.status, 200);
		const legacy = await readRpc(legacyResponse);
		assert.equal(legacy.result?.protocolVersion, "2025-11-25");
		const sessionId = legacyResponse.headers.get("mcp-session-id");
		assert.equal(sessionId, null);
		const legacyToolsResponse = await fetch(url, {
			method: "POST",
			headers: {
				...headers,
				"MCP-Protocol-Version": "2025-11-25",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/list",
				params: {},
			}),
			signal: AbortSignal.timeout(10_000),
		});
		const legacyTools = await readRpc(legacyToolsResponse);
		assert.deepEqual(
			legacyTools.result?.tools?.map((tool) => tool.name).sort(),
			modernTools.result?.tools?.map((tool) => tool.name).sort(),
		);
	});
});

for (const mode of ["legacy", "auto", { pin: "2026-07-28" }] as const) {
	test(`HTTP SDK client negotiation ${JSON.stringify(mode)} respects deployment and request tool filters`, async (t) => {
		await withProtocolServer(
			t,
			{ PORTKEY_TOOL_DOMAINS: "prompts,analytics" },
			async (url) => {
				const client = new Client(
					{ name: "http-negotiation-test", version: "1" },
					{ versionNegotiation: { mode } },
				);
				try {
					await client.connect(
						new StreamableHTTPClientTransport(new URL(`${url}?tools=prompts`), {
							requestInit: { headers },
						}),
					);
					assert.equal(
						client.getProtocolEra(),
						mode === "legacy" ? "legacy" : "modern",
					);
					const capabilities = client.getServerCapabilities();
					assert.equal(capabilities?.tools?.listChanged, false);
					assert.equal(capabilities?.prompts?.listChanged, false);
					assert.equal(capabilities?.resources?.listChanged, false);
					const invalidCall = await client.callTool({
						name: "create_prompt",
						arguments: {},
					});
					assert.equal(
						invalidCall.isError,
						true,
						"invalid input must not reach Portkey",
					);
					const resources = await client.listResources();
					assert.equal(resources.resources.length, 1);
					const guide = await client.readResource({
						uri: resources.resources[0].uri,
					});
					assert.ok(guide.contents.length > 0);
					const first = await client.listTools();
					const second = await client.listTools();
					assert.deepEqual(first.tools, second.tools);
					assert.ok(first.tools.some((tool) => tool.name === "create_prompt"));
					assert.ok(
						!first.tools.some((tool) => tool.name === "get_request_analytics"),
					);
				} finally {
					await client.close();
				}
			},
		);
	});
}

test("retired GET replay and DELETE session operations stay behind authentication and Origin checks", async (t) => {
	await withProtocolServer(t, {}, async (url) => {
		for (const method of ["GET", "DELETE"]) {
			assert.equal((await fetch(url, { method })).status, 401);
			assert.equal(
				(
					await fetch(url, {
						method,
						headers: { ...headers, Origin: "https://attacker.example" },
					})
				).status,
				403,
			);
			const response = await fetch(url, {
				method,
				headers: {
					...headers,
					"Mcp-Session-Id": "old-session",
					"Last-Event-ID": "old-cursor",
				},
			});
			assert.equal(response.status, 405);
		}
	});
});

test("validates modern routing headers and tool domains before dispatch", async (t) => {
	await withProtocolServer(
		t,
		{ PORTKEY_TOOL_DOMAINS: "prompts" },
		async (url) => {
			const body = JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/list",
				params: modernParams,
			});
			for (const extraHeaders of [
				{ "MCP-Protocol-Version": "2026-07-28" },
				{ "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call" },
			] as Record<string, string>[]) {
				const response = await fetch(url, {
					method: "POST",
					headers: { ...headers, ...extraHeaders },
					body,
				});
				assert.equal(response.status, 400);
				assert.equal(
					((await response.json()) as { error: { code: number } }).error.code,
					-32020,
				);
			}
			for (const query of ["tools=unknown", "tools=keys", "tools="]) {
				const response = await fetch(`${url}?${query}`, {
					method: "POST",
					headers: {
						...headers,
						"MCP-Protocol-Version": "2026-07-28",
						"Mcp-Method": "tools/list",
					},
					body,
				});
				assert.equal(response.status, 400);
			}
		},
	);
});

test("MCP_MAX_SESSIONS bounds concurrent requests and frees capacity after completion", async (t) => {
	await withProtocolServer(
		t,
		{ MCP_MAX_SESSIONS: "1" },
		async (url, runtime) => {
			let release!: () => void;
			let entered!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			const started = new Promise<void>((resolve) => {
				entered = resolve;
			});
			const original = McpServer.prototype.connect;
			const connect = t.mock.method(
				McpServer.prototype,
				"connect",
				async function (
					this: McpServer,
					...args: Parameters<McpServer["connect"]>
				) {
					entered();
					await gate;
					return original.apply(this, args);
				},
			);
			const first = fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2025-11-25",
						capabilities: {},
						clientInfo: { name: "capacity", version: "1" },
					},
				}),
				signal: AbortSignal.timeout(5000),
			});
			try {
				await started;
				runtime.setServerReady();
				const ready = await fetch(url.replace(/mcp$/, "ready"));
				assert.equal(
					((await ready.json()) as { activeRequests: number }).activeRequests,
					1,
				);
				const second = await fetch(url, {
					method: "POST",
					headers,
					body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
				});
				assert.equal(second.status, 503);
			} finally {
				release();
				const response = await first;
				await response.text();
				connect.mock.restore();
			}
			const third = await fetch(url, {
				method: "POST",
				headers: {
					...headers,
					"MCP-Protocol-Version": "2026-07-28",
					"Mcp-Method": "tools/list",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/list",
					params: modernParams,
				}),
			});
			assert.equal(third.status, 200);
			await third.text();
		},
	);
});

for (const method of ["POST", "DELETE"] as const) {
	test(`${method} rejects unsupported input before buffering an unfinished non-JSON body`, async (t) => {
		await withProtocolServer(t, {}, async (url) => {
			const status = await new Promise<number>((resolve, reject) => {
				const request = httpRequest(
					url,
					{
						method,
						headers: {
							...headers,
							"Content-Type": "text/plain",
							"Content-Length": "1024",
						},
					},
					(response) => {
						resolve(response.statusCode ?? 0);
						response.resume();
						request.destroy();
					},
				);
				request.on("error", reject);
				request.setTimeout(1000, () =>
					request.destroy(
						new Error(
							"server buffered unsupported input instead of rejecting headers",
						),
					),
				);
				request.flushHeaders();
			});
			assert.equal(status, method === "POST" ? 415 : 405);
		});
	});
}
