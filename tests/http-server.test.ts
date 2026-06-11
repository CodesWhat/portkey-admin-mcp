import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import net from "node:net";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const TSX_CLI_PATH = resolve(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const AUTH_TOKEN = "test-secret";
const INIT_PAYLOAD = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "http-server-test", version: "1.0.0" },
	},
};

const spawnedServers = new Set<ChildProcess>();

async function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = net.createServer();
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to determine free port"));
				return;
			}

			const { port } = address;
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolvePort(port);
			});
		});
		server.on("error", reject);
	});
}

async function waitForHealthy(
	baseUrl: string,
	timeoutMs = 10_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${baseUrl}/health`);
			if (response.ok) {
				return;
			}
		} catch {
			// Retry until the server is reachable.
		}

		await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
	}

	throw new Error(`HTTP server did not become healthy within ${timeoutMs}ms`);
}

async function stopServer(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.killed) {
		spawnedServers.delete(child);
		return;
	}

	child.kill("SIGINT");
	const exitPromise = once(child, "exit");
	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error("Timed out waiting for HTTP server to stop"));
		}, 10_000).unref();
	});

	try {
		await Promise.race([exitPromise, timeoutPromise]);
	} finally {
		spawnedServers.delete(child);
	}
}

async function requestJsonWithHeaders(
	url: string,
	headers: Record<string, string>,
): Promise<{
	statusCode: number;
	body: Record<string, unknown>;
}> {
	return new Promise((resolveResponse, reject) => {
		const request = httpRequest(url, { method: "GET", headers }, (response) => {
			let rawBody = "";
			response.setEncoding("utf8");
			response.on("data", (chunk: string) => {
				rawBody += chunk;
			});
			response.on("end", () => {
				try {
					resolveResponse({
						statusCode: response.statusCode ?? 0,
						body: JSON.parse(rawBody) as Record<string, unknown>,
					});
				} catch (error) {
					reject(error);
				}
			});
		});

		request.on("error", reject);
		request.end();
	});
}

async function withHttpServer(
	envOverrides: Record<string, string>,
	run: (context: { baseUrl: string }) => Promise<void>,
): Promise<void> {
	const port = await getFreePort();
	const child = spawn(process.execPath, [TSX_CLI_PATH, "src/server.ts"], {
		cwd: process.cwd(),
		env: {
			...process.env,
			PORT: String(port),
			MCP_HOST: "127.0.0.1",
			PORTKEY_API_KEY: "test-dummy-key",
			MCP_AUTH_MODE: "bearer",
			MCP_AUTH_TOKEN: AUTH_TOKEN,
			RATE_LIMIT_ENABLED: "false",
			...envOverrides,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});

	spawnedServers.add(child);
	let stderr = "";
	child.stderr?.setEncoding("utf8");
	child.stderr?.on("data", (chunk: string) => {
		stderr += chunk;
	});

	child.on("exit", (code) => {
		if (code !== 0 && code !== null) {
			console.error(stderr);
		}
	});

	const baseUrl = `http://127.0.0.1:${port}`;
	try {
		await waitForHealthy(baseUrl);
		await run({ baseUrl });
	} catch (error) {
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}\nServer stderr:\n${stderr}`,
		);
	} finally {
		await stopServer(child);
	}
}

afterEach(async () => {
	await Promise.all(Array.from(spawnedServers, stopServer));
});

describe("HTTP server integration", () => {
	it("defers HTTP runtime creation until explicitly requested", async () => {
		const child = spawn(
			process.execPath,
			[
				TSX_CLI_PATH,
				"--eval",
				"import('./src/server.ts').then((mod) => console.log(typeof mod.createHttpAppRuntime))",
			],
			{
				cwd: process.cwd(),
				env: {
					...process.env,
					PORTKEY_API_KEY: "",
					MCP_AUTH_MODE: "",
					MCP_AUTH_TOKEN: "",
					MCP_ALLOW_UNAUTHENTICATED_HTTP: "",
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.setEncoding("utf8");
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});

		const [code] = (await once(child, "exit")) as [number | null];
		assert.equal(code, 0, stderr);
		assert.match(stdout, /function/);
	});

	it("serves auth metadata and readiness over HTTP", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const ready = await fetch(`${baseUrl}/ready`);
			assert.equal(ready.status, 200);
			assert.equal(ready.headers.get("x-content-type-options"), "nosniff");
			assert.equal(ready.headers.get("x-frame-options"), "DENY");
			assert.equal(ready.headers.get("x-dns-prefetch-control"), "off");
			assert.equal(
				ready.headers.get("x-permitted-cross-domain-policies"),
				"none",
			);
			const readyBody = (await ready.json()) as Record<string, unknown>;
			assert.equal(readyBody.status, "ready");
			assert.equal(readyBody.sessionMode, "stateful");

			const authInfo = await fetch(`${baseUrl}/auth/info`);
			assert.equal(authInfo.status, 200);
			assert.equal(authInfo.headers.get("x-content-type-options"), "nosniff");
			assert.equal(authInfo.headers.get("x-frame-options"), "DENY");
			assert.equal(authInfo.headers.get("x-dns-prefetch-control"), "off");
			assert.equal(
				authInfo.headers.get("x-permitted-cross-domain-policies"),
				"none",
			);
			const authInfoBody = (await authInfo.json()) as Record<string, unknown>;
			assert.equal(authInfoBody.mode, "bearer");
			assert.equal(authInfoBody.sessionMode, "stateful");
			assert.equal(authInfoBody.mcpEndpoint, `${baseUrl}/mcp`);
		});
	});

	it("omits HSTS when TLS is not configured in app (even with x-forwarded-proto: https)", async () => {
		await withHttpServer(
			{
				MCP_TRUST_PROXY: "true",
			},
			async ({ baseUrl }) => {
				const authInfo = await fetch(`${baseUrl}/auth/info`, {
					headers: {
						"x-forwarded-proto": "https",
					},
				});

				assert.equal(authInfo.status, 200);
				assert.equal(authInfo.headers.get("strict-transport-security"), null);
			},
		);
	});

	it("does not trust the Host header when advertising the MCP endpoint", async () => {
		await withHttpServer(
			{
				MCP_PUBLIC_BASE_URL: "https://mcp.example.com/portkey",
			},
			async ({ baseUrl }) => {
				const response = await requestJsonWithHeaders(`${baseUrl}/auth/info`, {
					host: "attacker.example",
				});

				assert.equal(response.statusCode, 200);
				assert.equal(
					response.body.mcpEndpoint,
					"https://mcp.example.com/portkey/mcp",
				);
			},
		);
	});

	it("rejects unauthenticated MCP initialize requests", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "text/event-stream, application/json",
				},
				body: JSON.stringify(INIT_PAYLOAD),
			});

			assert.equal(response.status, 401);
			assert.deepEqual(await response.json(), {
				error: "Unauthorized: Missing or invalid Authorization Bearer token",
			});
		});
	});

	it("rejects new initialize requests after hitting MCP_MAX_SESSIONS", async () => {
		await withHttpServer(
			{
				MCP_MAX_SESSIONS: "1",
			},
			async ({ baseUrl }) => {
				const headers = {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"content-type": "application/json",
					accept: "text/event-stream, application/json",
				};

				const first = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers,
					body: JSON.stringify(INIT_PAYLOAD),
				});
				assert.equal(first.status, 200);
				assert.ok(first.headers.get("mcp-session-id"));

				const second = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers,
					body: JSON.stringify(INIT_PAYLOAD),
				});

				assert.equal(second.status, 503);
				assert.deepEqual(await second.json(), {
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Maximum active session limit reached (1)",
					},
					id: null,
				});
			},
		);
	});

	it("returns 404 for requests against an unknown session id", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"content-type": "application/json",
					accept: "text/event-stream, application/json",
					"mcp-session-id": "00000000-0000-0000-0000-000000000000",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/list",
					params: {},
				}),
			});

			assert.equal(response.status, 404);
			assert.deepEqual(await response.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Session not found",
				},
				id: null,
			});
		});
	});

	it("requires MCP-Protocol-Version on requests after initialization", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const initHeaders = {
				authorization: `Bearer ${AUTH_TOKEN}`,
				"content-type": "application/json",
				accept: "text/event-stream, application/json",
			};

			const initialize = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: initHeaders,
				body: JSON.stringify(INIT_PAYLOAD),
			});
			assert.equal(initialize.status, 200);

			const sessionId = initialize.headers.get("mcp-session-id");
			assert.ok(
				sessionId,
				"expected initialize response to include mcp-session-id",
			);

			const missingHeader = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					...initHeaders,
					"mcp-session-id": sessionId,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {},
				}),
			});
			assert.equal(missingHeader.status, 400);
			assert.deepEqual(await missingHeader.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message:
						"Bad Request: MCP-Protocol-Version header is required for requests after initialization",
				},
				id: null,
			});

			const mismatchedHeader = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					...initHeaders,
					"mcp-session-id": sessionId,
					"mcp-protocol-version": "2025-03-26",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/list",
					params: {},
				}),
			});
			assert.equal(mismatchedHeader.status, 400);
			assert.deepEqual(await mismatchedHeader.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message:
						"Bad Request: MCP-Protocol-Version 2025-03-26 does not match negotiated session protocol version 2024-11-05",
				},
				id: null,
			});
		});
	});

	it("uses a fresh stateless MCP server and transport for each request", async () => {
		await withHttpServer(
			{
				MCP_SESSION_MODE: "stateless",
			},
			async ({ baseUrl }) => {
				const headers = {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"content-type": "application/json",
					accept: "text/event-stream, application/json",
				};

				const first = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers,
					body: JSON.stringify(INIT_PAYLOAD),
				});
				const second = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						...INIT_PAYLOAD,
						id: 2,
					}),
				});

				assert.equal(first.status, 200);
				assert.equal(second.status, 200);
				assert.equal(first.headers.get("mcp-session-id"), null);
				assert.equal(second.headers.get("mcp-session-id"), null);
			},
		);
	});

	it("registers only the selected tool domains for an HTTP session", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const transport = new StreamableHTTPClientTransport(
				new URL(`${baseUrl}/mcp?tools=prompts,analytics`),
				{
					requestInit: {
						headers: {
							authorization: `Bearer ${AUTH_TOKEN}`,
						},
					},
				},
			);
			const client = new Client({
				name: "http-tools-filter-test",
				version: "1.0.0",
			});

			try {
				await client.connect(transport);
				const result = await client.listTools();
				const toolNames = result.tools.map((tool) => tool.name);

				assert.ok(toolNames.includes("create_prompt"));
				assert.ok(toolNames.includes("get_request_analytics"));
				assert.ok(!toolNames.includes("list_all_users"));
				assert.ok(!toolNames.includes("list_workspaces"));
			} finally {
				await client.close();
			}
		});
	});
});
