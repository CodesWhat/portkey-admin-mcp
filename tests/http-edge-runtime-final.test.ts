import assert from "node:assert/strict";
import { once } from "node:events";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
	request as httpRequest,
} from "node:http";
import net from "node:net";
import { describe, it } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	type JSONRPCMessage,
	LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/sdk/types.js";
import { createManagedEventStore } from "../src/lib/event-store.js";
import { Logger } from "../src/lib/logger.js";
import { SessionStore } from "../src/lib/session-store.js";

const MANAGED_ENV_KEYS = [
	"ALLOWED_ORIGINS",
	"CLERK_AUDIENCE",
	"CLERK_ISSUER",
	"CLERK_JWKS_URL",
	"MCP_ALLOW_UNAUTHENTICATED_HTTP",
	"MCP_AUTH_MODE",
	"MCP_AUTH_TOKEN",
	"MCP_EVENT_STORE",
	"MCP_EVENT_STORE_MAX_BYTES",
	"MCP_EVENT_STORE_MAX_EVENTS",
	"MCP_HOST",
	"MCP_MAX_SESSIONS",
	"MCP_PUBLIC_BASE_URL",
	"MCP_READY_CHECK_MODE",
	"MCP_SESSION_MODE",
	"MCP_SHUTDOWN_TIMEOUT_MS",
	"MCP_TLS_CA_PATH",
	"MCP_TLS_CERT_PATH",
	"MCP_TLS_KEY_PATH",
	"MCP_TRANSPORT",
	"PORT",
	"PORTKEY_API_KEY",
	"RATE_LIMIT_ENABLED",
] as const;

it("resets event-store limits between runtime tests", () => {
	const managedKeys = new Set<string>(MANAGED_ENV_KEYS);
	assert.equal(managedKeys.has("MCP_EVENT_STORE_MAX_EVENTS"), true);
	assert.equal(managedKeys.has("MCP_EVENT_STORE_MAX_BYTES"), true);
});

const originalModuleEnvironment = new Map(
	MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
);
Object.assign(process.env, {
	ALLOWED_ORIGINS: "http://127.0.0.1",
	MCP_ALLOW_UNAUTHENTICATED_HTTP: "true",
	MCP_AUTH_MODE: "none",
	RATE_LIMIT_ENABLED: "false",
});
const { createHttpAppRuntime } = await import("../src/lib/http-app.js");
for (const [key, value] of originalModuleEnvironment) {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

type Runtime = ReturnType<typeof createHttpAppRuntime>;

const INITIALIZE_BODY = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-11-25",
		capabilities: {},
		clientInfo: { name: "http-final-edge-test", version: "1.0.0" },
	},
};

function setEnvironment(overrides: Record<string, string> = {}): () => void {
	const previous = new Map(
		MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]),
	);
	for (const key of MANAGED_ENV_KEYS) delete process.env[key];
	Object.assign(process.env, {
		ALLOWED_ORIGINS: "http://127.0.0.1",
		MCP_ALLOW_UNAUTHENTICATED_HTTP: "true",
		MCP_AUTH_MODE: "none",
		MCP_EVENT_STORE: "off",
		MCP_HOST: "127.0.0.1",
		MCP_SESSION_MODE: "stateful",
		MCP_TRANSPORT: "http",
		PORT: "32124",
		RATE_LIMIT_ENABLED: "false",
		...overrides,
	});
	return () => {
		for (const key of MANAGED_ENV_KEYS) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
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
	if (!server.listening) return;
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
	if (!server.listening) await once(server, "listening");
}

function jsonHeaders(
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		accept: "text/event-stream, application/json",
		"content-type": "application/json",
		...extra,
	};
}

function initializeBody(protocolVersion = "2025-11-25"): string {
	return JSON.stringify({
		...INITIALIZE_BODY,
		params: { ...INITIALIZE_BODY.params, protocolVersion },
	});
}

async function initializeSession(
	baseUrl: string,
	path = "/mcp",
	protocolVersion = "2025-11-25",
): Promise<string> {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: jsonHeaders(),
		body: initializeBody(protocolVersion),
	});
	assert.equal(response.status, 200, await response.text());
	const sessionId = response.headers.get("mcp-session-id");
	assert.ok(sessionId);
	return sessionId;
}

function requestWithHost(
	url: string,
	host: string,
): Promise<{ status: number; body: string }> {
	return new Promise((resolveResponse, reject) => {
		const request = httpRequest(url, { headers: { host } }, (response) => {
			let body = "";
			response.setEncoding("utf8");
			response.on("data", (chunk: string) => {
				body += chunk;
			});
			response.on("end", () => {
				resolveResponse({ status: response.statusCode ?? 0, body });
			});
		});
		request.on("error", reject);
		request.end();
	});
}

function interceptExit(
	onExit: (code: string | number | null | undefined) => never,
): () => void {
	const originalExit = process.exit;
	process.exit = ((code) => onExit(code)) as typeof process.exit;
	return () => {
		process.exit = originalExit;
	};
}

describe("final HTTP runtime edge behavior", { concurrency: false }, () => {
	it("serves unauthenticated native-TLS metadata and rejects untrusted request metadata", async () => {
		await withListeningApp(
			{
				MCP_HOST: "[::]",
				MCP_TLS_CERT_PATH: "/tmp/metadata-only-cert.pem",
				MCP_TLS_KEY_PATH: "/tmp/metadata-only-key.pem",
			},
			async ({ baseUrl }) => {
				const root = await fetch(`${baseUrl}/`);
				const html = await root.text();
				assert.match(html, /Authentication disabled \(development only\)\./);
				assert.match(html, /native HTTPS enabled/);

				const authInfo = await fetch(`${baseUrl}/auth/info`);
				assert.deepEqual(await authInfo.json(), {
					mode: "none",
					sessionMode: "stateful",
					eventStoreMode: "off",
					mcpEndpoint: "https://127.0.0.1:32124/mcp",
					clerk: {
						issuerConfigured: false,
						jwksConfigured: false,
						audienceConfigured: false,
					},
					tls: { enabled: true, protocol: "https" },
				});

				const badHost = await requestWithHost(
					`${baseUrl}/auth/info`,
					"attacker.example",
				);
				assert.equal(badHost.status, 403);
				assert.deepEqual(JSON.parse(badHost.body), {
					error: "Forbidden: Host not allowed",
				});

				const badOrigin = await fetch(`${baseUrl}/auth/info`, {
					headers: { origin: "https://attacker.example" },
				});
				assert.equal(badOrigin.status, 403);
				assert.deepEqual(await badOrigin.json(), {
					error: "Forbidden: Origin not allowed",
				});

				const probe = await requestWithHost(
					`${baseUrl}/health`,
					"attacker.example",
				);
				assert.equal(probe.status, 200);
			},
		);
	});

	it("enforces stateful protocol, tool-subset, and session ownership branches", async () => {
		await withListeningApp({}, async ({ baseUrl }) => {
			const sessionId = await initializeSession(
				baseUrl,
				"/mcp?tools=prompts",
				"2099-01-01",
			);

			const unsupportedProtocol = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: jsonHeaders({
					"mcp-session-id": sessionId,
					"mcp-protocol-version": "bad<script>",
				}),
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {},
				}),
			});
			assert.equal(unsupportedProtocol.status, 400);
			assert.match(
				((await unsupportedProtocol.json()) as { error: { message: string } })
					.error.message,
				/Unsupported protocol version: badscript/,
			);

			const changedPostTools = await fetch(`${baseUrl}/mcp?tools=analytics`, {
				method: "POST",
				headers: jsonHeaders({
					"mcp-session-id": sessionId,
					"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
				}),
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/list",
					params: {},
				}),
			});
			assert.equal(changedPostTools.status, 400);

			const changedGetTools = await fetch(`${baseUrl}/mcp?tools=analytics`, {
				headers: {
					accept: "text/event-stream",
					"mcp-session-id": sessionId,
					"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
				},
			});
			assert.equal(changedGetTools.status, 400);

			const mismatchedDelete = await fetch(`${baseUrl}/mcp`, {
				method: "DELETE",
				headers: {
					"mcp-session-id": sessionId,
					"mcp-protocol-version": "2024-11-05",
				},
			});
			assert.equal(mismatchedDelete.status, 400);

			const unknownDelete = await fetch(`${baseUrl}/mcp`, {
				method: "DELETE",
				headers: {
					"mcp-session-id": "unknown-session",
					"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
				},
			});
			assert.equal(unknownDelete.status, 404);

			const missingSession = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: jsonHeaders(),
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 4,
					method: "tools/list",
					params: {},
				}),
			});
			assert.equal(missingSession.status, 400);

			const emptyTools = await fetch(`${baseUrl}/mcp?tools=,,,`, {
				method: "POST",
				headers: jsonHeaders(),
				body: initializeBody(),
			});
			assert.equal(emptyTools.status, 400);

			const closed = await fetch(`${baseUrl}/mcp`, {
				method: "DELETE",
				headers: {
					"mcp-session-id": sessionId,
					"mcp-protocol-version": LATEST_PROTOCOL_VERSION,
				},
			});
			assert.equal(closed.status, 200);
		});
	});

	it("releases reserved stateful capacity and controls transport failures", async () => {
		const originalConnect = McpServer.prototype.connect;
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		try {
			await withListeningApp({ MCP_MAX_SESSIONS: "1" }, async ({ baseUrl }) => {
				McpServer.prototype.connect = async () => {
					throw new Error("connect failed");
				};
				const failedInitialize = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: jsonHeaders(),
					body: initializeBody(),
				});
				assert.equal(failedInitialize.status, 500);

				McpServer.prototype.connect = originalConnect;
				const sessionId = await initializeSession(baseUrl);

				StreamableHTTPServerTransport.prototype.handleRequest = async () => {
					throw new Error("existing transport failed");
				};
				const failedSessionRequest = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: jsonHeaders({
						"mcp-session-id": sessionId,
						"mcp-protocol-version": "2025-11-25",
					}),
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 2,
						method: "tools/list",
						params: {},
					}),
				});
				assert.equal(failedSessionRequest.status, 500);
				assert.match(
					(
						(await failedSessionRequest.json()) as {
							error: { message: string };
						}
					).error.message,
					/POST \/mcp stateful session/,
				);
			});
		} finally {
			McpServer.prototype.connect = originalConnect;
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("releases a leaked session reservation after a non-throwing initialize rejection", async () => {
		// The SDK's transport returns a 406 response (rather than throwing) when
		// the client's Accept header is missing "text/event-stream". Before the
		// fix, hasReservedSessionSlot was only released from the catch block
		// wrapping transport.handleRequest(), so this non-throwing rejection path
		// leaked the reservation forever and could exhaust MCP_MAX_SESSIONS.
		await withListeningApp({ MCP_MAX_SESSIONS: "2" }, async ({ baseUrl }) => {
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const rejected = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: jsonHeaders({ accept: "application/json" }),
					body: initializeBody(),
				});
				assert.equal(rejected.status, 406);
			}

			const sessionId = await initializeSession(baseUrl);
			assert.ok(sessionId);
		});
	});

	it("preserves a response already sent by a failing stateless transport", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		StreamableHTTPServerTransport.prototype.handleRequest = async (
			_request,
			response,
		) => {
			response.writeHead(202, { "content-type": "text/plain" });
			response.end("accepted before failure");
			throw "non-error transport failure";
		};
		try {
			await withListeningApp(
				{ MCP_SESSION_MODE: "stateless" },
				async ({ baseUrl }) => {
					const response = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: jsonHeaders(),
						body: initializeBody(),
					});
					assert.equal(response.status, 202);
					assert.equal(await response.text(), "accepted before failure");
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("ends a failed replay and reports a failed lease release", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		const originalLoggerError = Logger.error;
		let firstEventId: string | undefined;
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
						};
					};
				}
			)._webStandardTransport._eventStore;
			assert.ok(eventStore);
			firstEventId = await eventStore.storeEvent("failed-replay", {
				jsonrpc: "2.0",
				method: "notifications/progress",
				params: { progressToken: "failed", progress: 1 },
			});
			response.setHeader("content-type", "application/json");
			response.end(JSON.stringify({ firstEventId }));
		};
		Logger.error = ((message: string) => {
			errors.push(message);
		}) as typeof Logger.error;

		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateless" },
				async ({ baseUrl, runtime }) => {
					await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: jsonHeaders(),
						body: initializeBody(),
					});
					assert.ok(firstEventId);
					StreamableHTTPServerTransport.prototype.handleRequest =
						originalHandleRequest;
					const prototypeProbe = createManagedEventStore(runtime.config);
					const directEventStore =
						prototypeProbe.eventStoreForOwner("prototype-probe");
					assert.ok(directEventStore);
					const eventStorePrototype = Object.getPrototypeOf(
						directEventStore,
					) as {
						acquireReplayLease: (eventId: string) => Promise<unknown>;
						replayEventsAfter: (
							eventId: string,
							options: unknown,
						) => Promise<string>;
					};

					const originalAcquire = eventStorePrototype.acquireReplayLease;
					const originalReplay = eventStorePrototype.replayEventsAfter;
					eventStorePrototype.acquireReplayLease = async function (eventId) {
						const lease = (await originalAcquire.call(this, eventId)) as {
							status: string;
							release?: () => Promise<void>;
						};
						if (lease.status !== "acquired" || !lease.release) return lease;
						return {
							status: "acquired",
							release: async () => {
								await lease.release?.();
								throw new Error("release failed");
							},
						};
					};
					eventStorePrototype.replayEventsAfter = async () => {
						throw new Error("replay failed");
					};

					try {
						runtime.setServerReady();
						const replay = await fetch(`${baseUrl}/mcp`, {
							headers: {
								accept: "text/event-stream",
								"last-event-id": firstEventId,
								"mcp-protocol-version": "2025-11-25",
							},
						});
						assert.equal(replay.status, 200);
						assert.equal(await replay.text(), "");
						assert.ok(
							errors.includes("Failed to release stateless replay lease"),
						);
						assert.ok(errors.includes("GET /mcp stateless replay failed"));
					} finally {
						eventStorePrototype.acquireReplayLease = originalAcquire;
						eventStorePrototype.replayEventsAfter = originalReplay;
					}
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
			Logger.error = originalLoggerError;
		}
	});

	it("reserves stateless replay capacity synchronously before the async lease acquisition", async () => {
		await withListeningApp(
			{
				MCP_EVENT_STORE: "memory",
				MCP_MAX_SESSIONS: "1",
				MCP_SESSION_MODE: "stateless",
			},
			async ({ baseUrl, runtime }) => {
				const initResponse = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: jsonHeaders(),
					body: initializeBody(),
				});
				assert.equal(initResponse.status, 200);
				// The priming SSE event (emitted for clients on protocol >=
				// 2025-11-25) gives us a real, storable event id to replay from.
				const primingMatch = (await initResponse.text()).match(/^id: (\S+)/m);
				assert.ok(primingMatch);
				const firstEventId = primingMatch[1] as string;

				const prototypeProbe = createManagedEventStore(runtime.config);
				const directEventStore =
					prototypeProbe.eventStoreForOwner("prototype-probe");
				assert.ok(directEventStore);
				const eventStorePrototype = Object.getPrototypeOf(directEventStore) as {
					acquireReplayLease: (
						eventId: string,
					) => Promise<{ status: string; release?: () => Promise<void> }>;
					replayEventsAfter: (
						eventId: string,
						options: unknown,
					) => Promise<string>;
				};
				const originalAcquire = eventStorePrototype.acquireReplayLease;
				const originalReplay = eventStorePrototype.replayEventsAfter;

				let releaseGate: (() => void) | undefined;
				const gate = new Promise<void>((resolve) => {
					releaseGate = resolve;
				});
				let signalEntered: (() => void) | undefined;
				const entered = new Promise<void>((resolve) => {
					signalEntered = resolve;
				});
				eventStorePrototype.acquireReplayLease = async function (eventId) {
					// Stand in for the real network round-trip Redis mode performs
					// here: block until the test explicitly lets this call proceed.
					signalEntered?.();
					await gate;
					return originalAcquire.call(this, eventId);
				};
				// The concurrency cap, not replayed content, is under test: fail
				// fast once the (delayed) lease is granted.
				eventStorePrototype.replayEventsAfter = async () => {
					throw new Error("replay content not needed for this test");
				};

				runtime.setServerReady();
				try {
					const firstReplay = fetch(`${baseUrl}/mcp`, {
						headers: {
							accept: "text/event-stream",
							"last-event-id": firstEventId,
							"mcp-protocol-version": "2025-11-25",
						},
					});
					await entered;

					// The first replay is parked inside acquireReplayLease. With
					// MCP_MAX_SESSIONS=1, a second concurrent replay must be rejected
					// by the synchronous capacity check rather than also being
					// admitted into the same await gap before either has registered.
					const secondReplay = await fetch(`${baseUrl}/mcp`, {
						headers: {
							accept: "text/event-stream",
							"last-event-id": firstEventId,
							"mcp-protocol-version": "2025-11-25",
						},
						signal: AbortSignal.timeout(5000),
					});
					assert.equal(secondReplay.status, 503);

					releaseGate?.();
					const firstResponse = await firstReplay;
					assert.equal(firstResponse.status, 200);
				} finally {
					eventStorePrototype.acquireReplayLease = originalAcquire;
					eventStorePrototype.replayEventsAfter = originalReplay;
				}
			},
		);
	});

	it("acquires and releases the managed replay lease around a stateful GET replay", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		const calls: string[] = [];

		StreamableHTTPServerTransport.prototype.handleRequest = async function (
			request,
			response,
			parsedBody,
		) {
			if (request.method === "GET") {
				calls.push("handleRequest");
				response.setHeader("content-type", "application/json");
				response.end("{}");
				return;
			}
			await originalHandleRequest.call(this, request, response, parsedBody);
		};

		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateful" },
				async ({ baseUrl, runtime }) => {
					const initResponse = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: jsonHeaders(),
						body: initializeBody(),
					});
					assert.equal(initResponse.status, 200);
					const sessionId = initResponse.headers.get("mcp-session-id");
					assert.ok(sessionId);
					const primingMatch = (await initResponse.text()).match(/^id: (\S+)/m);
					assert.ok(primingMatch);
					const firstEventId = primingMatch[1] as string;

					const prototypeProbe = createManagedEventStore(runtime.config);
					const directEventStore =
						prototypeProbe.eventStoreForOwner("prototype-probe");
					assert.ok(directEventStore);
					const eventStorePrototype = Object.getPrototypeOf(
						directEventStore,
					) as {
						acquireReplayLease: (
							eventId: string,
						) => Promise<{ status: string; release?: () => Promise<void> }>;
					};
					const originalAcquire = eventStorePrototype.acquireReplayLease;
					eventStorePrototype.acquireReplayLease = async function (eventId) {
						calls.push(`acquire:${eventId}`);
						const lease = await originalAcquire.call(this, eventId);
						if (lease.status !== "acquired" || !lease.release) {
							return lease;
						}
						const originalRelease = lease.release;
						return {
							status: "acquired" as const,
							release: async () => {
								await originalRelease();
								calls.push("release");
							},
						};
					};

					try {
						const replay = await fetch(`${baseUrl}/mcp`, {
							headers: {
								accept: "text/event-stream",
								"last-event-id": firstEventId,
								"mcp-protocol-version": "2025-11-25",
								"mcp-session-id": sessionId as string,
							},
						});
						assert.equal(replay.status, 200);
						assert.deepEqual(calls, [
							`acquire:${firstEventId}`,
							"handleRequest",
							"release",
						]);
					} finally {
						eventStorePrototype.acquireReplayLease = originalAcquire;
					}
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("returns JSON-RPC for stateful GET and DELETE failures and releases replay leases", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateful" },
				async ({ baseUrl, runtime }) => {
					const initResponse = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: jsonHeaders(),
						body: initializeBody(),
					});
					assert.equal(initResponse.status, 200);
					const sessionId = initResponse.headers.get("mcp-session-id");
					assert.ok(sessionId);
					const eventMatch = (await initResponse.text()).match(/^id: (\S+)/m);
					assert.ok(eventMatch);
					const eventId = eventMatch[1] as string;

					const prototypeProbe = createManagedEventStore(runtime.config);
					const directEventStore =
						prototypeProbe.eventStoreForOwner("prototype-probe");
					assert.ok(directEventStore);
					const eventStorePrototype = Object.getPrototypeOf(
						directEventStore,
					) as {
						acquireReplayLease: (
							eventId: string,
						) => Promise<{ status: string; release?: () => Promise<void> }>;
					};
					const originalAcquire = eventStorePrototype.acquireReplayLease;
					let releases = 0;
					eventStorePrototype.acquireReplayLease = async function (id) {
						const lease = await originalAcquire.call(this, id);
						if (lease.status !== "acquired" || !lease.release) return lease;
						return {
							status: "acquired",
							release: async () => {
								await lease.release?.();
								releases += 1;
							},
						};
					};
					StreamableHTTPServerTransport.prototype.handleRequest = async () => {
						throw new Error("stateful transport failed");
					};

					try {
						const failedGet = await fetch(`${baseUrl}/mcp`, {
							headers: {
								accept: "text/event-stream",
								"last-event-id": eventId,
								"mcp-protocol-version": "2025-11-25",
								"mcp-session-id": sessionId,
							},
						});
						assert.equal(failedGet.status, 500);
						assert.match(failedGet.headers.get("content-type") ?? "", /json/);
						assert.equal(
							((await failedGet.json()) as { error: { code: number } }).error
								.code,
							-32603,
						);
						assert.equal(releases, 1);

						const failedDelete = await fetch(`${baseUrl}/mcp`, {
							method: "DELETE",
							headers: {
								"mcp-protocol-version": "2025-11-25",
								"mcp-session-id": sessionId,
							},
						});
						assert.equal(failedDelete.status, 500);
						assert.match(
							failedDelete.headers.get("content-type") ?? "",
							/json/,
						);
						assert.equal(
							((await failedDelete.json()) as { error: { code: number } }).error
								.code,
							-32603,
						);
					} finally {
						eventStorePrototype.acquireReplayLease = originalAcquire;
						await prototypeProbe.close();
					}
				},
			);
		} finally {
			StreamableHTTPServerTransport.prototype.handleRequest =
				originalHandleRequest;
		}
	});

	it("rejects a concurrent stateful replay before it reaches transport.handleRequest", async () => {
		const originalHandleRequest =
			StreamableHTTPServerTransport.prototype.handleRequest;
		const calls: string[] = [];
		StreamableHTTPServerTransport.prototype.handleRequest = async function (
			request,
			response,
			parsedBody,
		) {
			if (request.method === "GET") {
				calls.push("handleRequest");
			}
			await originalHandleRequest.call(this, request, response, parsedBody);
		};

		try {
			await withListeningApp(
				{ MCP_EVENT_STORE: "memory", MCP_SESSION_MODE: "stateful" },
				async ({ baseUrl, runtime }) => {
					const initResponse = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: jsonHeaders(),
						body: initializeBody(),
					});
					assert.equal(initResponse.status, 200);
					const sessionId = initResponse.headers.get("mcp-session-id");
					assert.ok(sessionId);
					const primingMatch = (await initResponse.text()).match(/^id: (\S+)/m);
					assert.ok(primingMatch);
					const firstEventId = primingMatch[1] as string;

					const replayHeaders = {
						accept: "text/event-stream",
						"last-event-id": firstEventId,
						"mcp-protocol-version": "2025-11-25",
						"mcp-session-id": sessionId as string,
					};

					// The first replay acquires the per-stream lease and its
					// transport.handleRequest call opens a long-lived SSE stream that
					// stays open (this fetch resolves once headers arrive, without
					// draining the body). While that lease is still held, a second
					// concurrent replay for the same session + Last-Event-ID must be
					// rejected by the lease guard before it ever reaches
					// transport.handleRequest, mirroring the stateless replay guard's
					// TOCTOU-closing behavior for the stateful path.
					const firstReplay = await fetch(`${baseUrl}/mcp`, {
						headers: replayHeaders,
					});
					assert.equal(firstReplay.status, 200);

					const conflictingReplay = await fetch(`${baseUrl}/mcp`, {
						headers: replayHeaders,
						signal: AbortSignal.timeout(5000),
					});
					assert.equal(conflictingReplay.status, 409);
					assert.match(
						(
							(await conflictingReplay.json()) as {
								error: { message: string };
							}
						).error.message,
						/active replay connection/,
					);
					// Only the first replay's GET should have reached the transport;
					// the rejected second one must never appear here.
					assert.deepEqual(calls, ["handleRequest"]);

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

	it("reports shutdown resource failures", async () => {
		const failurePort = await getFreePort();
		await withEnvironment({ PORT: String(failurePort) }, async () => {
			const originalCloseAll = SessionStore.prototype.closeAll;
			const originalConsoleError = console.error;
			const runtime = createHttpAppRuntime();
			const server = runtime.startHttpServer();
			await waitUntilListening(server);
			SessionStore.prototype.closeAll = async () => {
				throw "close-all failed";
			};
			const messages: unknown[][] = [];
			console.error = (...args: unknown[]) => {
				messages.push(args);
			};
			let resolveExit: ((code: number) => void) | undefined;
			const exited = new Promise<number>((resolve) => {
				resolveExit = resolve;
			});
			const restoreExit = interceptExit((code) => {
				resolveExit?.(Number(code));
				return undefined as never;
			});
			try {
				process.emit("SIGTERM", "SIGTERM");
				assert.equal(await exited, 1);
				assert.ok(
					messages.some(
						([message, error]) =>
							String(message).includes(
								"Error while closing runtime resources",
							) && String(error).includes("close-all failed"),
					),
				);
			} finally {
				restoreExit();
				console.error = originalConsoleError;
				SessionStore.prototype.closeAll = originalCloseAll;
				await closeServer(server);
				await runtime.closeHttpApp().catch(() => {});
			}
		});
	});
});
