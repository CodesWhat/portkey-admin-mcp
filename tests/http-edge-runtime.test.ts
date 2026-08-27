import assert from "node:assert/strict";
import { once } from "node:events";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
} from "node:http";
import net from "node:net";
import { describe, it } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "../src/lib/logger.js";
import { SessionStore } from "../src/lib/session-store.js";

const AUTH_TOKEN = "http-edge-secret";
const INIT_PAYLOAD = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "http-edge-runtime-test", version: "1.0.0" },
	},
};

const MANAGED_ENV_KEYS = [
	"ALLOWED_ORIGINS",
	"CLERK_AUDIENCE",
	"CLERK_ISSUER",
	"CLERK_JWKS_URL",
	"MCP_ALLOW_UNAUTHENTICATED_HTTP",
	"MCP_AUTH_MODE",
	"MCP_AUTH_TOKEN",
	"MCP_EVENT_STORE",
	"MCP_EVENT_TTL_SECONDS",
	"MCP_HOST",
	"MCP_MAX_SESSIONS",
	"MCP_PUBLIC_BASE_URL",
	"MCP_READY_CHECK_MODE",
	"MCP_SESSION_MODE",
	"MCP_SESSION_TIMEOUT",
	"MCP_SHUTDOWN_TIMEOUT_MS",
	"MCP_TLS_CA_PATH",
	"MCP_TLS_CERT_PATH",
	"MCP_TLS_KEY_PATH",
	"MCP_TRANSPORT",
	"MCP_TRUST_PROXY",
	"PORT",
	"PORTKEY_ALLOW_INSECURE_HTTP",
	"PORTKEY_ALLOW_PRIVATE_BASE_URL",
	"PORTKEY_API_KEY",
	"PORTKEY_BASE_URL",
	"RATE_LIMIT_ENABLED",
] as const;

const moduleLoadEnvironment = new Map(
	MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
);
process.env.MCP_AUTH_MODE = "bearer";
process.env.MCP_AUTH_TOKEN = AUTH_TOKEN;
const httpAppModule = await import("../src/lib/http-app.js");
const { createHttpAppRuntime } = httpAppModule;
const { resetSecurityStateForTest } = await import("../src/lib/security.js");
for (const [key, value] of moduleLoadEnvironment) {
	if (value === undefined) {
		delete process.env[key];
	} else {
		process.env[key] = value;
	}
}

type Runtime = ReturnType<typeof createHttpAppRuntime>;

function setEnvironment(overrides: Record<string, string> = {}): () => void {
	const previous = new Map(
		MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
	);
	for (const key of MANAGED_ENV_KEYS) {
		delete process.env[key];
	}
	Object.assign(process.env, {
		MCP_AUTH_MODE: "bearer",
		MCP_AUTH_TOKEN: AUTH_TOKEN,
		MCP_EVENT_STORE: "off",
		MCP_HOST: "127.0.0.1",
		MCP_SESSION_MODE: "stateful",
		MCP_TRANSPORT: "http",
		PORT: "32123",
		RATE_LIMIT_ENABLED: "false",
		...overrides,
	});

	return () => {
		for (const key of MANAGED_ENV_KEYS) {
			const value = previous.get(key);
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	};
}

async function withEnvironment<T>(
	overrides: Record<string, string>,
	run: () => Promise<T> | T,
): Promise<T> {
	const restore = setEnvironment(overrides);
	try {
		return await run();
	} finally {
		restore();
	}
}

async function closeServer(server: HttpServer): Promise<void> {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
}

async function withListeningApp(
	overrides: Record<string, string>,
	run: (context: {
		baseUrl: string;
		runtime: Runtime;
		server: HttpServer;
	}) => Promise<void>,
): Promise<void> {
	await withEnvironment(overrides, async () => {
		const runtime = createHttpAppRuntime();
		const server = createHttpServer(runtime.app);
		await new Promise<void>((resolveListen, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolveListen);
		});
		const address = server.address();
		assert.ok(address && typeof address !== "string");

		try {
			await run({
				baseUrl: `http://127.0.0.1:${address.port}`,
				runtime,
				server,
			});
		} finally {
			await runtime.closeHttpApp().catch(() => {});
			await closeServer(server);
		}
	});
}

async function getFreePort(): Promise<number> {
	const server = net.createServer();
	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const { port } = address;
	await new Promise<void>((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
	return port;
}

async function waitUntilListening(server: HttpServer): Promise<void> {
	if (!server.listening) {
		await once(server, "listening");
	}
}

function authorizationHeaders(): Record<string, string> {
	return {
		authorization: `Bearer ${AUTH_TOKEN}`,
		accept: "text/event-stream, application/json",
		"content-type": "application/json",
	};
}

function replaceProcessExit(
	onExit: (code: string | number | null | undefined) => never,
): () => void {
	const originalExit = process.exit;
	process.exit = ((code) => onExit(code)) as typeof process.exit;
	return () => {
		process.exit = originalExit;
	};
}

describe("HTTP runtime edge behavior", { concurrency: false }, () => {
	it("backs off idle replay polling and resets after delivery", () => {
		const getNextReplayPollDelay = (
			httpAppModule as typeof httpAppModule & {
				getNextReplayPollDelay?: (
					currentDelayMs: number,
					deliveredEvent: boolean,
				) => number;
			}
		).getNextReplayPollDelay;
		assert.equal(typeof getNextReplayPollDelay, "function");
		assert.equal(getNextReplayPollDelay?.(100, false), 200);
		assert.equal(getNextReplayPollDelay?.(800, false), 1000);
		assert.equal(getNextReplayPollDelay?.(1000, false), 1000);
		assert.equal(getNextReplayPollDelay?.(1000, true), 100);
	});

	it("rejects unsafe runtime configuration and accepts bounded trust proxy variants", async () => {
		await withEnvironment({ MCP_READY_CHECK_MODE: "remote" }, () => {
			assert.throws(
				() => createHttpAppRuntime(),
				/Invalid MCP_READY_CHECK_MODE value: remote/,
			);
		});

		for (const publicBaseUrl of ["not-a-url", "ftp://mcp.example.com"]) {
			await withEnvironment({ MCP_PUBLIC_BASE_URL: publicBaseUrl }, () => {
				assert.throws(
					() => createHttpAppRuntime(),
					/Invalid MCP_PUBLIC_BASE_URL value/,
				);
			});
		}

		await withEnvironment({ MCP_TRUST_PROXY: "true" }, () => {
			assert.throws(
				() => createHttpAppRuntime(),
				/MCP_TRUST_PROXY=true is unsafe/,
			);
		});

		for (const [raw, expected] of [
			["false", false],
			["2", 2],
			["uniquelocal", "uniquelocal"],
		] as const) {
			await withEnvironment({ MCP_TRUST_PROXY: raw }, async () => {
				const runtime = createHttpAppRuntime();
				try {
					assert.equal(runtime.app.get("trust proxy"), expected);
				} finally {
					await runtime.closeHttpApp();
				}
			});
		}
	});

	it("logs the effective rate-limit configuration", async () => {
		const port = await getFreePort();
		await withEnvironment(
			{ PORT: String(port), RATE_LIMIT_ENABLED: " FALSE " },
			async () => {
				await resetSecurityStateForTest();
				const originalInfo = Logger.info;
				let metadata: Record<string, unknown> | undefined;
				Logger.info = ((message, extra) => {
					if (message === "HTTP(S) server configuration") {
						metadata = extra?.metadata;
					}
				}) as typeof Logger.info;
				const runtime = createHttpAppRuntime();
				const server = runtime.startHttpServer();
				try {
					await waitUntilListening(server);
					assert.equal(metadata?.rateLimitEnabled, false);
				} finally {
					Logger.info = originalInfo;
					await closeServer(server);
					await runtime.closeHttpApp();
				}
			},
		);
	});

	it("serves explicit readiness, health, root, and auth metadata states", async () => {
		await withListeningApp(
			{
				CLERK_AUDIENCE: "edge-audience",
				CLERK_ISSUER: "https://clerk.example.com",
				MCP_HOST: "0.0.0.0",
			},
			async ({ baseUrl, runtime }) => {
				const initiallyNotReady = await fetch(`${baseUrl}/ready`);
				assert.equal(initiallyNotReady.status, 503);
				assert.equal(
					((await initiallyNotReady.json()) as { status: string }).status,
					"not_ready",
				);

				runtime.setServerReady();
				const ready = await fetch(`${baseUrl}/ready`);
				assert.equal(ready.status, 200);
				assert.deepEqual(
					Object.fromEntries(
						Object.entries(
							(await ready.json()) as Record<string, unknown>,
						).filter(([key]) => key !== "timestamp"),
					),
					{
						status: "ready",
						sessions: 0,
						sessionMode: "stateful",
						eventStoreMode: "off",
						check: "local",
					},
				);

				const health = await fetch(`${baseUrl}/health`);
				assert.equal(health.status, 200);
				const healthBody = (await health.json()) as Record<string, unknown>;
				assert.equal(healthBody.status, "ok");
				assert.equal(typeof healthBody.timestamp, "string");
				assert.equal(typeof healthBody.uptime, "number");

				const root = await fetch(`${baseUrl}/`);
				const html = await root.text();
				assert.match(html, /http:\/\/127\.0\.0\.1:32123\/mcp/);
				assert.match(html, /Send Authorization: Bearer &lt;MCP_AUTH_TOKEN&gt;/);

				const authInfo = await fetch(`${baseUrl}/auth/info`);
				assert.deepEqual(await authInfo.json(), {
					mode: "bearer",
					sessionMode: "stateful",
					eventStoreMode: "off",
					mcpEndpoint: "http://127.0.0.1:32123/mcp",
					clerk: {
						issuerConfigured: true,
						jwksConfigured: true,
						audienceConfigured: true,
					},
					tls: { enabled: false, protocol: "http" },
				});

				runtime.setServerReady(false);
				assert.equal((await fetch(`${baseUrl}/ready`)).status, 503);
			},
		);
	});

	it("reports Portkey readiness failures from a local upstream", async () => {
		const upstream = createHttpServer((_request, response) => {
			response.writeHead(503, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: "temporarily unavailable" }));
		});
		await new Promise<void>((resolveListen) => {
			upstream.listen(0, "127.0.0.1", resolveListen);
		});
		const address = upstream.address();
		assert.ok(address && typeof address !== "string");

		try {
			await withListeningApp(
				{
					MCP_READY_CHECK_MODE: "portkey",
					PORTKEY_ALLOW_INSECURE_HTTP: "true",
					PORTKEY_ALLOW_PRIVATE_BASE_URL: "true",
					PORTKEY_API_KEY: "edge-readiness-key",
					PORTKEY_BASE_URL: `http://127.0.0.1:${address.port}`,
				},
				async ({ baseUrl, runtime }) => {
					runtime.setServerReady();
					const response = await fetch(`${baseUrl}/ready`);
					assert.equal(response.status, 503);
					const body = (await response.json()) as {
						portkey: { status: string; error: string };
					};
					assert.equal(body.portkey.status, "error");
					assert.match(body.portkey.error, /Health check failed/);
				},
			);
		} finally {
			await closeServer(upstream);
		}
	});

	it("runs and reports both successful and failed session cleanup ticks", async () => {
		await withEnvironment({}, async () => {
			const originalSetInterval = globalThis.setInterval;
			const originalClearInterval = globalThis.clearInterval;
			const originalCleanup = SessionStore.prototype.cleanup;
			const originalInfo = Logger.info;
			const originalError = Logger.error;
			let cleanupTick: (() => Promise<void>) | undefined;
			let unrefCalled = false;
			let cleanupCalls = 0;
			const infoMessages: string[] = [];
			const errorMessages: string[] = [];
			const fakeInterval = {
				unref() {
					unrefCalled = true;
				},
			} as NodeJS.Timeout;

			globalThis.setInterval = ((callback: () => Promise<void>) => {
				cleanupTick = callback;
				return fakeInterval;
			}) as typeof setInterval;
			globalThis.clearInterval = (() => {}) as typeof clearInterval;
			SessionStore.prototype.cleanup = async () => {
				cleanupCalls += 1;
				if (cleanupCalls === 1) {
					return ["expired-session"];
				}
				throw new Error("cleanup failed");
			};
			Logger.info = ((message: string) => {
				infoMessages.push(message);
			}) as typeof Logger.info;
			Logger.error = ((message: string) => {
				errorMessages.push(message);
			}) as typeof Logger.error;

			let runtime: Runtime | undefined;
			try {
				runtime = createHttpAppRuntime();
				assert.equal(unrefCalled, true);
				assert.ok(cleanupTick);
				await cleanupTick();
				await cleanupTick();
				assert.deepEqual(infoMessages, ["MCP session expired and cleaned up"]);
				assert.deepEqual(errorMessages, ["Session cleanup tick failed"]);
			} finally {
				await runtime?.closeHttpApp();
				globalThis.setInterval = originalSetInterval;
				globalThis.clearInterval = originalClearInterval;
				SessionStore.prototype.cleanup = originalCleanup;
				Logger.info = originalInfo;
				Logger.error = originalError;
			}
		});
	});

	it("delegates stateless event-store callbacks and closes an active failed connection", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		const originalMcpClose = McpServer.prototype.close;
		const originalLoggerError = Logger.error;
		const replayed: Array<{ eventId: string; message: JSONRPCMessage }> = [];
		const errors: string[] = [];

		StreamableHTTPServerTransport.prototype.handleRequest = async function (
			_request,
			response,
		) {
			const eventStore = (
				this as unknown as {
					_webStandardTransport: {
						_eventStore?: {
							storeEvent(
								streamId: string,
								message: JSONRPCMessage,
							): Promise<string>;
							getStreamIdForEventId?(
								eventId: string,
							): Promise<string | undefined>;
							replayEventsAfter(
								lastEventId: string,
								options: {
									send(eventId: string, message: JSONRPCMessage): Promise<void>;
								},
							): Promise<string>;
						};
					};
				}
			)._webStandardTransport._eventStore;
			assert.ok(eventStore);
			const firstMessage = {
				jsonrpc: "2.0",
				method: "notifications/progress",
				params: { progressToken: "edge", progress: 1 },
			} satisfies JSONRPCMessage;
			const finalMessage = {
				jsonrpc: "2.0",
				id: 1,
				result: { ok: true },
			} satisfies JSONRPCMessage;
			const firstEventId = await eventStore.storeEvent(
				"edge-stream",
				firstMessage,
			);
			assert.equal(
				await eventStore.getStreamIdForEventId?.(firstEventId),
				"edge-stream",
			);
			await eventStore.storeEvent("edge-stream", finalMessage);
			assert.equal(
				await eventStore.replayEventsAfter(firstEventId, {
					send: async (eventId, message) => {
						replayed.push({ eventId, message });
					},
				}),
				"edge-stream",
			);
			response.statusCode = 200;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ firstEventId }));
		};
		McpServer.prototype.close = async () => {
			throw new Error("close failed");
		};
		Logger.error = ((message: string) => {
			errors.push(message);
		}) as typeof Logger.error;

		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateless" },
				async ({ baseUrl, runtime }) => {
					const response = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: authorizationHeaders(),
						body: JSON.stringify(INIT_PAYLOAD),
					});
					assert.equal(response.status, 200);
					assert.equal(replayed.length, 1);
					assert.deepEqual(replayed[0]?.message, {
						jsonrpc: "2.0",
						id: 1,
						result: { ok: true },
					});
					await runtime.closeHttpApp();
					assert.ok(
						errors.includes("Failed to close stateless MCP connection"),
					);
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
			McpServer.prototype.close = originalMcpClose;
			Logger.error = originalLoggerError;
		}
	});

	it("returns a controlled internal error when a stateless transport fails", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		StreamableHTTPServerTransport.prototype.handleRequest = async () => {
			throw new Error("transport exploded");
		};

		try {
			await withListeningApp(
				{ MCP_SESSION_MODE: "stateless" },
				async ({ baseUrl }) => {
					const response = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: authorizationHeaders(),
						body: JSON.stringify(INIT_PAYLOAD),
					});
					assert.equal(response.status, 500);
					assert.deepEqual(await response.json(), {
						jsonrpc: "2.0",
						error: {
							code: -32603,
							message: "Internal server error (POST /mcp stateless)",
						},
						id: null,
					});
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("rejects a concurrent stateless replay and releases the first lease on close", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		let firstEventId: string | undefined;
		StreamableHTTPServerTransport.prototype.handleRequest = async function (
			_request,
			response,
		) {
			const eventStore = (
				this as unknown as {
					_webStandardTransport: {
						_eventStore?: {
							storeEvent(
								streamId: string,
								message: JSONRPCMessage,
							): Promise<string>;
						};
					};
				}
			)._webStandardTransport._eventStore;
			assert.ok(eventStore);
			firstEventId = await eventStore.storeEvent("held-stream", {
				jsonrpc: "2.0",
				method: "notifications/progress",
				params: { progressToken: "held", progress: 1 },
			});
			response.statusCode = 200;
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ firstEventId }));
		};

		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateless" },
				async ({ baseUrl, runtime }) => {
					const post = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: authorizationHeaders(),
						body: JSON.stringify(INIT_PAYLOAD),
					});
					assert.equal(post.status, 200);
					assert.ok(firstEventId);
					runtime.setServerReady();
					const replayHeaders = {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
						"last-event-id": firstEventId,
						"mcp-protocol-version": "2025-11-25",
					};
					const firstReplay = await fetch(`${baseUrl}/mcp`, {
						headers: replayHeaders,
					});
					assert.equal(firstReplay.status, 200);

					const conflictingReplay = await fetch(`${baseUrl}/mcp`, {
						headers: replayHeaders,
					});
					assert.equal(conflictingReplay.status, 409);
					assert.match(
						((await conflictingReplay.json()) as { error: { message: string } })
							.error.message,
						/active replay connection/,
					);

					const closing = runtime.closeHttpApp();
					await firstReplay.text();
					await closing;
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("starts idempotently, logs both server error forms, and can restart after close", async () => {
		const port = await getFreePort();
		await withEnvironment({ PORT: String(port) }, async () => {
			const runtime = createHttpAppRuntime();
			const originalConsoleError = console.error;
			const errors: unknown[][] = [];
			const exitCodes: Array<string | number | null | undefined> = [];
			const restoreExit = replaceProcessExit((code) => {
				exitCodes.push(code);
				return undefined as never;
			});
			console.error = (...args: unknown[]) => {
				errors.push(args);
			};

			let first: HttpServer | undefined;
			let restarted: HttpServer | undefined;
			try {
				first = runtime.startHttpServer();
				assert.equal(runtime.startHttpServer(), first);
				await waitUntilListening(first);
				first.emit(
					"error",
					Object.assign(new Error("occupied"), { code: "EADDRINUSE" }),
				);
				first.emit("error", new Error("unexpected server failure"));
				assert.deepEqual(exitCodes, [1, 1]);
				assert.ok(
					errors.some(([message]) =>
						String(message).includes("already in use"),
					),
				);
				assert.ok(
					errors.some(([message]) => message === "[MCP] Server error:"),
				);

				await closeServer(first);
				restarted = runtime.startHttpServer();
				assert.notEqual(restarted, first);
				await waitUntilListening(restarted);
			} finally {
				console.error = originalConsoleError;
				restoreExit();
				if (restarted) {
					await closeServer(restarted);
				} else if (first) {
					await closeServer(first);
				}
				await runtime.closeHttpApp();
			}
		});
	});

	it("fails safely when native TLS files cannot be loaded", async () => {
		await withEnvironment(
			{
				MCP_TLS_CERT_PATH: "/tmp/portkey-missing-cert.pem",
				MCP_TLS_KEY_PATH: "/tmp/portkey-missing-key.pem",
			},
			async () => {
				const runtime = createHttpAppRuntime();
				const sentinel = new Error("process exit intercepted");
				const originalConsoleError = console.error;
				const errors: unknown[][] = [];
				const restoreExit = replaceProcessExit(() => {
					throw sentinel;
				});
				console.error = (...args: unknown[]) => {
					errors.push(args);
				};

				try {
					assert.throws(() => runtime.startHttpServer(), sentinel);
					assert.ok(
						errors.some(([message]) =>
							String(message).includes("Failed to create HTTP(S) server"),
						),
					);
				} finally {
					console.error = originalConsoleError;
					restoreExit();
					await runtime.closeHttpApp();
				}
			},
		);
	});

	it("handles SIGTERM graceful shutdown and forced SIGINT timeout", async () => {
		const gracefulPort = await getFreePort();
		await withEnvironment({ PORT: String(gracefulPort) }, async () => {
			const runtime = createHttpAppRuntime();
			const server = runtime.startHttpServer();
			await waitUntilListening(server);
			let resolveExit: ((code: number) => void) | undefined;
			const exited = new Promise<number>((resolve) => {
				resolveExit = resolve;
			});
			const restoreExit = replaceProcessExit((code) => {
				resolveExit?.(Number(code));
				return undefined as never;
			});
			try {
				process.emit("SIGTERM", "SIGTERM");
				assert.equal(await exited, 0);
				assert.equal(server.listening, false);
			} finally {
				restoreExit();
				await closeServer(server);
				await runtime.closeHttpApp();
			}
		});

		const forcedPort = await getFreePort();
		await withEnvironment(
			{ MCP_SHUTDOWN_TIMEOUT_MS: "20", PORT: String(forcedPort) },
			async () => {
				const runtime = createHttpAppRuntime();
				const server = runtime.startHttpServer();
				await waitUntilListening(server);
				const originalClose = server.close;
				server.close = (() => server) as typeof server.close;
				let resolveExit: ((code: number) => void) | undefined;
				const exited = new Promise<number>((resolve) => {
					resolveExit = resolve;
				});
				const restoreExit = replaceProcessExit((code) => {
					resolveExit?.(Number(code));
					return undefined as never;
				});

				try {
					process.emit("SIGINT", "SIGINT");
					assert.equal(await exited, 1);
				} finally {
					restoreExit();
					server.close = originalClose;
					await closeServer(server);
					await runtime.closeHttpApp();
				}
			},
		);
	});
});
