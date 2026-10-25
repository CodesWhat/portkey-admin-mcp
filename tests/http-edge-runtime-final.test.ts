import assert from "node:assert/strict";
import { once } from "node:events";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
	request as httpRequest,
} from "node:http";
import { Server as HttpsServer, request as httpsRequest } from "node:https";
import net, { type AddressInfo } from "node:net";
import { describe, it } from "node:test";
import {
	OPENSSL_AVAILABLE,
	writeSelfSignedCertFiles,
} from "./helpers/tls-cert.js";

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

async function _initializeSession(
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
					sessionMode: "stateless",
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

	it("closes the listener on closeHttpApp so the port can be reused", async () => {
		const port = await getFreePort();
		const restoreExit = interceptExit((code) => {
			throw new Error(`unexpected process.exit(${code})`);
		});
		try {
			await withEnvironment({ PORT: String(port) }, async () => {
				const runtime1 = createHttpAppRuntime();
				const server1 = runtime1.startHttpServer();
				await waitUntilListening(server1);
				assert.equal(server1.listening, true);

				await runtime1.closeHttpApp();
				assert.equal(server1.listening, false);

				const runtime2 = createHttpAppRuntime();
				const server2 = runtime2.startHttpServer();
				try {
					await waitUntilListening(server2);
					assert.equal(server2.listening, true);
					assert.equal((server2.address() as AddressInfo).port, port);
				} finally {
					await runtime2.closeHttpApp();
					assert.equal(server2.listening, false);
					await closeServer(server1);
					await closeServer(server2);
				}
			});
		} finally {
			restoreExit();
		}
	});

	it("serves requests over native HTTPS through startHttpServer", {
		skip: OPENSSL_AVAILABLE ? false : "openssl binary not available",
	}, async () => {
		const { cert, certPath, keyPath, cleanup } = writeSelfSignedCertFiles();
		try {
			const port = await getFreePort();
			await withEnvironment(
				{
					PORT: String(port),
					MCP_TLS_CERT_PATH: certPath,
					MCP_TLS_KEY_PATH: keyPath,
				},
				async () => {
					const runtime = createHttpAppRuntime();
					const server = runtime.startHttpServer();
					try {
						await waitUntilListening(server);
						assert.ok(server instanceof HttpsServer);

						const body = await new Promise<{
							statusCode: number;
							body: string;
						}>((resolveResponse, reject) => {
							const request = httpsRequest(
								{
									host: "127.0.0.1",
									port,
									path: "/auth/info",
									ca: cert,
								},
								(response) => {
									let rawBody = "";
									response.setEncoding("utf8");
									response.on("data", (chunk: string) => {
										rawBody += chunk;
									});
									response.on("end", () => {
										resolveResponse({
											statusCode: response.statusCode ?? 0,
											body: rawBody,
										});
									});
								},
							);
							request.on("error", reject);
							request.end();
						});

						assert.equal(body.statusCode, 200);
						const parsed = JSON.parse(body.body) as {
							tls: { enabled: boolean; protocol: string };
							mcpEndpoint: string;
						};
						assert.deepEqual(parsed.tls, {
							enabled: true,
							protocol: "https",
						});
						assert.equal(parsed.mcpEndpoint, `https://127.0.0.1:${port}/mcp`);
					} finally {
						await runtime.closeHttpApp();
						assert.equal(server.listening, false);
					}
				},
			);
		} finally {
			cleanup();
		}
	});
});
