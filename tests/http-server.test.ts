import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import {
	createServer as createHttpServer,
	request as httpRequest,
} from "node:http";
import https, { type Server as HttpsServer } from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

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

interface SseEvent {
	id?: string;
	data: string;
}

function parseSseEvents(raw: string): SseEvent[] {
	return raw
		.split("\n\n")
		.map((block) => {
			const lines = block.split("\n");
			const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
			const data = lines
				.filter((line) => line.startsWith("data: "))
				.map((line) => line.slice(6))
				.join("\n");
			return { id, data };
		})
		.filter((event) => event.id !== undefined || event.data.length > 0);
}

async function readSseEvents(
	response: Response,
	minimumEvents: number,
): Promise<SseEvent[]> {
	assert.ok(response.body, "expected SSE response body");
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let raw = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			raw += decoder.decode(value, { stream: true });
			const events = parseSseEvents(raw);
			if (events.length >= minimumEvents) {
				return events;
			}
		}
	} finally {
		await reader.cancel();
	}

	return parseSseEvents(raw);
}

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

// ---------------------------------------------------------------------------
// Clerk-mode multi-principal test fixture
//
// A live server can only ever authenticate a second, distinct principal
// (distinct ownerKey) via MCP_AUTH_MODE=clerk — bearer mode accepts exactly
// one MCP_AUTH_TOKEN, so every authenticated bearer request maps to the same
// ownerKey. Clerk config requires an https:// JWKS URL (auth.ts rejects
// http://), so this stands up a real local HTTPS server, backed by an
// openssl-generated self-signed cert, serving a JWKS document produced by a
// jose-generated RSA keypair. The spawned server process trusts that cert via
// NODE_TLS_REJECT_UNAUTHORIZED=0 for the duration of the test only.
// ---------------------------------------------------------------------------

const CLERK_TEST_ISSUER = "https://clerk.example.com";
const CLERK_TEST_AUDIENCE = "portkey-admin-mcp-tests";
const CLERK_TEST_KID = "session-isolation-test-key";

// The clerk isolation test shells out to `openssl` to mint a throwaway cert for
// the local HTTPS JWKS server. openssl isn't guaranteed on every machine (or CI
// image), so probe for it once and skip that single test where it's absent
// rather than failing the suite on a missing system binary.
function hasOpenssl(): boolean {
	try {
		execFileSync("openssl", ["version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

const OPENSSL_AVAILABLE = hasOpenssl();

function generateSelfSignedCert(): { key: string; cert: string } {
	const dir = mkdtempSync(join(tmpdir(), "portkey-mcp-jwks-cert-"));
	try {
		const keyPath = join(dir, "key.pem");
		const certPath = join(dir, "cert.pem");
		execFileSync("openssl", [
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-keyout",
			keyPath,
			"-out",
			certPath,
			"-days",
			"1",
			"-subj",
			"/CN=127.0.0.1",
		]);
		return {
			key: readFileSync(keyPath, "utf8"),
			cert: readFileSync(certPath, "utf8"),
		};
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

interface JwksTestContext {
	jwksUrl: string;
	signToken: (subject: string) => Promise<string>;
}

async function withJwksHttpsServer(
	run: (context: JwksTestContext) => Promise<void>,
): Promise<void> {
	const { publicKey, privateKey } = await generateKeyPair("RS256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	publicJwk.kid = CLERK_TEST_KID;
	publicJwk.alg = "RS256";
	publicJwk.use = "sig";

	const { key, cert } = generateSelfSignedCert();
	const server: HttpsServer = https.createServer({ key, cert }, (_req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({ keys: [publicJwk] }));
	});

	const port = await new Promise<number>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				reject(new Error("Failed to determine JWKS server port"));
				return;
			}
			resolveListen(address.port);
		});
	});

	const signToken = (subject: string): Promise<string> =>
		new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: CLERK_TEST_KID })
			.setSubject(subject)
			.setIssuer(CLERK_TEST_ISSUER)
			.setAudience(CLERK_TEST_AUDIENCE)
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(privateKey);

	try {
		await run({
			jwksUrl: `https://127.0.0.1:${port}/.well-known/jwks.json`,
			signToken,
		});
	} finally {
		await new Promise<void>((resolveClose) =>
			server.close(() => resolveClose()),
		);
	}
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

	it("serves the hosted setup page with escaped deployment metadata", async () => {
		await withHttpServer(
			{
				MCP_PUBLIC_BASE_URL: "https://mcp.example.com/tenant&one/",
			},
			async ({ baseUrl }) => {
				const response = await fetch(`${baseUrl}/`);
				assert.equal(response.status, 200);
				assert.equal(
					response.headers.get("content-security-policy"),
					"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
				);
				assert.match(response.headers.get("content-type") ?? "", /text\/html/);
				const html = await response.text();
				assert.match(html, /https:\/\/mcp\.example\.com\/tenant&amp;one\/mcp/);
				assert.match(
					html,
					/Send Authorization: Bearer &lt;MCP_AUTH_TOKEN&gt;\./,
				);
				assert.match(html, /Session mode:<\/strong> <code>stateful<\/code>/);
			},
		);
	});

	it("reports why Portkey readiness cannot run without an API key", async () => {
		await withHttpServer(
			{
				MCP_READY_CHECK_MODE: "portkey",
				PORTKEY_API_KEY: "",
			},
			async ({ baseUrl }) => {
				const response = await fetch(`${baseUrl}/ready`);
				assert.equal(response.status, 503);
				const body = (await response.json()) as Record<string, unknown>;
				assert.equal(body.status, "not_ready");
				assert.equal(body.reason, "PORTKEY_API_KEY is not configured");
				assert.equal(typeof body.timestamp, "string");
			},
		);
	});

	it("includes a successful Portkey API check in readiness", async () => {
		const upstreamPort = await getFreePort();
		const upstream = createHttpServer((_request, response) => {
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ object: "list", total: 0, data: [] }));
		});
		await new Promise<void>((resolveListen) => {
			upstream.listen(upstreamPort, "127.0.0.1", resolveListen);
		});

		try {
			await withHttpServer(
				{
					MCP_READY_CHECK_MODE: "portkey",
					PORTKEY_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
					PORTKEY_ALLOW_PRIVATE_BASE_URL: "true",
					PORTKEY_ALLOW_INSECURE_HTTP: "true",
				},
				async ({ baseUrl }) => {
					const response = await fetch(`${baseUrl}/ready`);
					assert.equal(response.status, 200);
					const body = (await response.json()) as Record<string, unknown>;
					assert.equal(body.status, "ready");
					assert.equal(body.sessionMode, "stateful");
					assert.equal(body.eventStoreMode, "off");
					assert.deepEqual(body.portkey, {
						status: "ok",
						latency_ms: (body.portkey as { latency_ms: number }).latency_ms,
					});
					assert.equal(
						typeof (body.portkey as { latency_ms: unknown }).latency_ms,
						"number",
					);
				},
			);
		} finally {
			await new Promise<void>((resolveClose, reject) => {
				upstream.close((error) => (error ? reject(error) : resolveClose()));
			});
		}
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

	it("returns a controlled JSON error for malformed request JSON", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"content-type": "application/json",
					accept: "application/json",
				},
				body: '{"jsonrpc":',
			});

			assert.equal(response.status, 400);
			assert.match(
				response.headers.get("content-type") ?? "",
				/application\/json/,
			);
			assert.deepEqual(await response.json(), {
				error: "Malformed JSON request body",
			});
		});
	});

	it("returns 413 for a request body exceeding MCP_MAX_REQUEST_SIZE", async () => {
		await withHttpServer(
			{ MCP_MAX_REQUEST_SIZE: "1kb" },
			async ({ baseUrl }) => {
				const oversizedBody = JSON.stringify({
					...INIT_PAYLOAD,
					params: {
						...INIT_PAYLOAD.params,
						oversizedField: "x".repeat(5_000),
					},
				});

				const response = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						"content-type": "application/json",
						accept: "application/json",
					},
					body: oversizedBody,
				});

				assert.equal(response.status, 413);
				assert.match(
					response.headers.get("content-type") ?? "",
					/application\/json/,
				);
				assert.deepEqual(await response.json(), {
					error: "Payload too large",
				});
			},
		);
	});

	it("rate limits a trailing-slash /mcp/ request the same as /mcp", async () => {
		await withHttpServer(
			{
				RATE_LIMIT_ENABLED: "true",
				RATE_LIMIT_MAX: "2",
				RATE_LIMIT_WINDOW_MS: "60000",
				RATE_LIMIT_REFILL: "2",
			},
			async ({ baseUrl }) => {
				const statuses: number[] = [];
				for (let attempt = 0; attempt < 5; attempt += 1) {
					const response = await fetch(`${baseUrl}/mcp/`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json",
						},
						body: JSON.stringify(INIT_PAYLOAD),
					});
					statuses.push(response.status);
					if (response.status === 429) {
						break;
					}
				}

				assert.ok(
					statuses.includes(429),
					`expected a 429 among repeated /mcp/ requests, got ${statuses.join(", ")}`,
				);
			},
		);
	});

	it("rate limits an uppercase /MCP request the same as /mcp", async () => {
		await withHttpServer(
			{
				RATE_LIMIT_ENABLED: "true",
				RATE_LIMIT_MAX: "2",
				RATE_LIMIT_WINDOW_MS: "60000",
				RATE_LIMIT_REFILL: "2",
			},
			async ({ baseUrl }) => {
				const statuses: number[] = [];
				for (let attempt = 0; attempt < 5; attempt += 1) {
					const response = await fetch(`${baseUrl}/MCP`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json",
						},
						body: JSON.stringify(INIT_PAYLOAD),
					});
					statuses.push(response.status);
					if (response.status === 429) {
						break;
					}
				}

				// Express 5 routes /MCP to the /mcp handler case-insensitively; the
				// auth gate and rate limiters must recognize it too, so it never 500s
				// on an unset authPrincipal and never escapes rate limiting.
				assert.ok(
					!statuses.includes(500),
					`uppercase /MCP should not 500, got ${statuses.join(", ")}`,
				);
				assert.ok(
					statuses.includes(429),
					`expected a 429 among repeated /MCP requests, got ${statuses.join(", ")}`,
				);
			},
		);
	});

	it("rejects a malformed-JSON /mcp request from an unauthenticated client before parsing its body", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json",
				},
				body: '{"jsonrpc":',
			});

			// Auth (or rate limiting) must reject this request before it ever
			// reaches the body parser's error handler; a 400 "Malformed JSON
			// request body" here would mean the parser ran first.
			assert.equal(response.status, 401);
			assert.deepEqual(await response.json(), {
				error: "Unauthorized: Missing or invalid Authorization Bearer token",
			});
		});
	});

	it("emits Access-Control-Allow-Origin for a portless allow-list entry on a non-default port", async () => {
		await withHttpServer(
			{ ALLOWED_ORIGINS: "http://localhost" },
			async ({ baseUrl }) => {
				const response = await fetch(`${baseUrl}/health`, {
					headers: { origin: "http://localhost:5173" },
				});

				assert.equal(response.status, 200);
				assert.equal(
					response.headers.get("access-control-allow-origin"),
					"http://localhost:5173",
				);
			},
		);
	});

	it("skips origin/Host validation for case- and trailing-slash health/ready path variants", async () => {
		await withHttpServer(
			{ ALLOWED_ORIGINS: "http://localhost" },
			async ({ baseUrl }) => {
				for (const path of ["/health/", "/HEALTH", "/ready/", "/READY"]) {
					const response = await requestJsonWithHeaders(`${baseUrl}${path}`, {
						host: "attacker.example",
						origin: "https://evil.example",
					});

					assert.equal(
						response.statusCode,
						200,
						`expected ${path} with a disallowed Origin/Host to skip validation`,
					);
				}
			},
		);
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

	it("uses the negotiated protocol when a post-initialize header is missing", async () => {
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
			assert.equal(missingHeader.status, 200);
			assert.match(await missingHeader.text(), /"tools"/);

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
		await withHttpServer(
			{ PORTKEY_TOOL_DOMAINS: "prompts,analytics,keys" },
			async ({ baseUrl }) => {
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
					assert.ok(!toolNames.includes("create_api_key"));
					assert.ok(!toolNames.includes("list_all_users"));
					assert.ok(!toolNames.includes("list_workspaces"));
				} finally {
					await client.close();
				}
			},
		);
	});

	it("rejects tool domains outside the server-configured allowlist", async () => {
		for (const sessionMode of ["stateful", "stateless"] as const) {
			await withHttpServer(
				{
					PORTKEY_TOOL_DOMAINS: "prompts",
					MCP_SESSION_MODE: sessionMode,
				},
				async ({ baseUrl }) => {
					const response = await fetch(`${baseUrl}/mcp?tools=keys`, {
						method: "POST",
						headers: {
							authorization: `Bearer ${AUTH_TOKEN}`,
							"content-type": "application/json",
							accept: "text/event-stream, application/json",
						},
						body: JSON.stringify(INIT_PAYLOAD),
					});
					const body = (await response.json()) as {
						error?: { message?: string };
					};

					assert.equal(response.status, 400);
					assert.match(body.error?.message ?? "", /not allowed/i);
				},
			);
		}
	});

	// ---------------------------------------------------------------------------
	// DELETE /mcp
	// ---------------------------------------------------------------------------

	it("DELETE /mcp succeeds for an open stateful session", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const authHeaders = {
				authorization: `Bearer ${AUTH_TOKEN}`,
				"content-type": "application/json",
				accept: "text/event-stream, application/json",
			};

			const initialize = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify(INIT_PAYLOAD),
			});
			assert.equal(initialize.status, 200);

			const sessionId = initialize.headers.get("mcp-session-id");
			assert.ok(
				sessionId,
				"expected initialize response to include mcp-session-id",
			);

			const deleteResponse = await fetch(`${baseUrl}/mcp`, {
				method: "DELETE",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"mcp-session-id": sessionId,
					"mcp-protocol-version": "2024-11-05",
				},
			});

			assert.equal(deleteResponse.status, 200);
		});
	});

	it("DELETE /mcp without mcp-session-id header returns 400", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const deleteResponse = await fetch(`${baseUrl}/mcp`, {
				method: "DELETE",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
				},
			});

			assert.equal(deleteResponse.status, 400);
			assert.deepEqual(await deleteResponse.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Missing session ID",
				},
				id: null,
			});
		});
	});

	it("DELETE /mcp in stateless session mode returns 405", async () => {
		await withHttpServer(
			{ MCP_SESSION_MODE: "stateless" },
			async ({ baseUrl }) => {
				const deleteResponse = await fetch(`${baseUrl}/mcp`, {
					method: "DELETE",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						"mcp-session-id": "00000000-0000-0000-0000-000000000000",
					},
				});

				assert.equal(deleteResponse.status, 405);
				assert.deepEqual(await deleteResponse.json(), {
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "DELETE /mcp is not used in stateless session mode",
					},
					id: null,
				});
			},
		);
	});

	// ---------------------------------------------------------------------------
	// GET /mcp (SSE notifications stream)
	// ---------------------------------------------------------------------------

	it("GET /mcp without mcp-session-id header returns 400", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const getResponse = await fetch(`${baseUrl}/mcp`, {
				method: "GET",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					accept: "text/event-stream",
				},
			});

			assert.equal(getResponse.status, 400);
			assert.deepEqual(await getResponse.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Missing session ID",
				},
				id: null,
			});
		});
	});

	it("GET /mcp with unknown session id returns 404", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const getResponse = await fetch(`${baseUrl}/mcp`, {
				method: "GET",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					accept: "text/event-stream",
					"mcp-session-id": "00000000-0000-0000-0000-000000000000",
					"mcp-protocol-version": "2024-11-05",
				},
			});

			assert.equal(getResponse.status, 404);
			assert.deepEqual(await getResponse.json(), {
				jsonrpc: "2.0",
				error: {
					code: -32000,
					message: "Session not found",
				},
				id: null,
			});
		});
	});

	it("GET /mcp replays stateless SSE events after Last-Event-ID without a session id", async () => {
		await withHttpServer(
			{
				MCP_SESSION_MODE: "stateless",
				MCP_EVENT_STORE: "memory",
			},
			async ({ baseUrl }) => {
				const postResponse = await fetch(`${baseUrl}/mcp`, {
					method: "POST",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream, application/json",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						...INIT_PAYLOAD,
						params: {
							...INIT_PAYLOAD.params,
							protocolVersion: "2025-11-25",
						},
					}),
				});

				assert.equal(postResponse.status, 200);
				assert.equal(postResponse.headers.get("mcp-session-id"), null);
				const originalEvents = parseSseEvents(await postResponse.text());
				assert.equal(originalEvents.length, 2);
				assert.ok(originalEvents[0]?.id);
				assert.ok(originalEvents[1]?.id);
				assert.equal(originalEvents[0]?.data, "");
				assert.match(originalEvents[1]?.data ?? "", /"protocolVersion"/);

				const getResponse = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
						"last-event-id": originalEvents[0].id as string,
						"mcp-protocol-version": "2025-11-25",
					},
				});

				assert.equal(getResponse.status, 200);
				assert.equal(
					getResponse.headers.get("content-type"),
					"text/event-stream",
				);
				assert.equal(getResponse.headers.get("mcp-session-id"), null);
				const replayedEvents = parseSseEvents(await getResponse.text());
				assert.deepEqual(replayedEvents, [originalEvents[1]]);
			},
		);
	});

	it("finishes and replays a stateless request after the POST stream disconnects", async () => {
		const upstreamPort = await getFreePort();
		const upstream = createHttpServer((_request, response) => {
			setTimeout(() => {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(JSON.stringify({ object: "list", total: 0, data: [] }));
			}, 250);
		});
		await new Promise<void>((resolveListen) => {
			upstream.listen(upstreamPort, "127.0.0.1", resolveListen);
		});

		try {
			await withHttpServer(
				{
					MCP_SESSION_MODE: "stateless",
					MCP_EVENT_STORE: "memory",
					PORTKEY_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
					PORTKEY_ALLOW_PRIVATE_BASE_URL: "true",
					PORTKEY_ALLOW_INSECURE_HTTP: "true",
				},
				async ({ baseUrl }) => {
					const postResponse = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: {
							authorization: `Bearer ${AUTH_TOKEN}`,
							accept: "text/event-stream, application/json",
							"content-type": "application/json",
							"mcp-protocol-version": "2025-11-25",
						},
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: 77,
							method: "tools/call",
							params: { name: "list_configs", arguments: {} },
						}),
					});
					const [primingEvent] = await readSseEvents(postResponse, 1);
					assert.ok(primingEvent?.id);
					assert.equal(primingEvent?.data, "");

					const replayResponse = await fetch(`${baseUrl}/mcp`, {
						method: "GET",
						headers: {
							authorization: `Bearer ${AUTH_TOKEN}`,
							accept: "text/event-stream",
							"last-event-id": primingEvent.id as string,
							"mcp-protocol-version": "2025-11-25",
						},
					});
					const replayed = parseSseEvents(await replayResponse.text());
					assert.equal(replayed.length, 1);
					assert.match(replayed[0]?.data ?? "", /"id":77/);
				},
			);
		} finally {
			await new Promise<void>((resolveClose, reject) => {
				upstream.close((error) => (error ? reject(error) : resolveClose()));
			});
		}
	});

	it("GET /mcp rejects stateless replay when the event store is disabled", async () => {
		await withHttpServer(
			{
				MCP_SESSION_MODE: "stateless",
				MCP_EVENT_STORE: "off",
			},
			async ({ baseUrl }) => {
				const response = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
						"last-event-id": "1",
					},
				});

				assert.equal(response.status, 405);
				assert.deepEqual(await response.json(), {
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message:
							"Stateless GET /mcp replay requires MCP_EVENT_STORE=memory or redis",
					},
					id: null,
				});
			},
		);
	});

	it("GET /mcp rejects a standalone stateless SSE stream without Last-Event-ID", async () => {
		await withHttpServer(
			{
				MCP_SESSION_MODE: "stateless",
				MCP_EVENT_STORE: "memory",
			},
			async ({ baseUrl }) => {
				const response = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
					},
				});

				assert.equal(response.status, 405);
				assert.equal(response.headers.get("allow"), "POST");
				assert.deepEqual(await response.json(), {
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message:
							"Stateless GET /mcp only supports replay with Last-Event-ID",
					},
					id: null,
				});
			},
		);
	});

	it("GET /mcp validates stateless replay headers and cursor", async () => {
		await withHttpServer(
			{
				MCP_SESSION_MODE: "stateless",
				MCP_EVENT_STORE: "memory",
			},
			async ({ baseUrl }) => {
				const missingAccept = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						"last-event-id": "not-an-event",
					},
				});
				assert.equal(missingAccept.status, 406);

				const unsupportedProtocol = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
						"last-event-id": "not-an-event",
						"mcp-protocol-version": "2099-01-01",
					},
				});
				assert.equal(unsupportedProtocol.status, 400);

				const invalidCursor = await fetch(`${baseUrl}/mcp`, {
					method: "GET",
					headers: {
						authorization: `Bearer ${AUTH_TOKEN}`,
						accept: "text/event-stream",
						"last-event-id": "not-an-event",
						"mcp-protocol-version": "2025-11-25",
					},
				});
				assert.equal(invalidCursor.status, 400);
				assert.deepEqual(await invalidCursor.json(), {
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: "Invalid event ID format",
					},
					id: null,
				});
			},
		);
	});

	// ---------------------------------------------------------------------------
	// ?tools=nonexistent-domain — parseRequestedToolDomains rejection
	// ---------------------------------------------------------------------------

	it("POST /mcp with unknown ?tools domain returns 400 JSON-RPC error", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp?tools=nonexistent-domain`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					"content-type": "application/json",
					accept: "text/event-stream, application/json",
				},
				body: JSON.stringify(INIT_PAYLOAD),
			});

			assert.equal(response.status, 400);
			const body = (await response.json()) as Record<string, unknown>;
			assert.equal(body.jsonrpc, "2.0");
			assert.equal(body.id, null);
			const error = body.error as Record<string, unknown>;
			assert.ok(
				typeof error.message === "string" &&
					error.message.includes("nonexistent-domain"),
				`expected error message to mention "nonexistent-domain", got: ${error.message}`,
			);
		});
	});

	it("GET /mcp with unknown ?tools domain returns 400 JSON-RPC error", async () => {
		await withHttpServer({}, async ({ baseUrl }) => {
			const response = await fetch(`${baseUrl}/mcp?tools=nonexistent-domain`, {
				method: "GET",
				headers: {
					authorization: `Bearer ${AUTH_TOKEN}`,
					accept: "text/event-stream",
					"mcp-session-id": "00000000-0000-0000-0000-000000000000",
				},
			});

			assert.equal(response.status, 400);
			const body = (await response.json()) as Record<string, unknown>;
			assert.equal(body.jsonrpc, "2.0");
			assert.equal(body.id, null);
			const error = body.error as Record<string, unknown>;
			assert.ok(
				typeof error.message === "string" &&
					error.message.includes("nonexistent-domain"),
				`expected error message to mention "nonexistent-domain", got: ${error.message}`,
			);
		});
	});

	// ---------------------------------------------------------------------------
	// MCP session isolation between distinct clerk principals
	// ---------------------------------------------------------------------------

	it("isolates MCP sessions between two distinct clerk principals on the same server", {
		skip: OPENSSL_AVAILABLE ? false : "openssl binary not available",
	}, async () => {
		await withJwksHttpsServer(async ({ jwksUrl, signToken }) => {
			const tokenA = await signToken("user_a");
			const tokenB = await signToken("user_b");

			await withHttpServer(
				{
					MCP_AUTH_MODE: "clerk",
					CLERK_ISSUER: CLERK_TEST_ISSUER,
					CLERK_AUDIENCE: CLERK_TEST_AUDIENCE,
					CLERK_JWKS_URL: jwksUrl,
					CLERK_ALLOWED_SUBJECTS: "user_a,user_b",
					NODE_TLS_REJECT_UNAUTHORIZED: "0",
				},
				async ({ baseUrl }) => {
					const headersFor = (token: string) => ({
						authorization: `Bearer ${token}`,
						"content-type": "application/json",
						accept: "text/event-stream, application/json",
					});
					const notFoundBody = {
						jsonrpc: "2.0",
						error: {
							code: -32000,
							message: "Session not found",
						},
						id: null,
					};

					const initialize = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: headersFor(tokenA),
						body: JSON.stringify(INIT_PAYLOAD),
					});
					assert.equal(initialize.status, 200);

					const sessionId = initialize.headers.get("mcp-session-id");
					assert.ok(
						sessionId,
						"expected initialize response to include mcp-session-id",
					);

					const toolsListBody = JSON.stringify({
						jsonrpc: "2.0",
						id: 2,
						method: "tools/list",
						params: {},
					});

					// Principal B must not be able to reach principal A's session on
					// any of the three /mcp verbs.
					const postAsB = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: { ...headersFor(tokenB), "mcp-session-id": sessionId },
						body: toolsListBody,
					});
					assert.equal(postAsB.status, 404);
					assert.deepEqual(await postAsB.json(), notFoundBody);

					const getAsB = await fetch(`${baseUrl}/mcp`, {
						method: "GET",
						headers: {
							authorization: `Bearer ${tokenB}`,
							accept: "text/event-stream",
							"mcp-session-id": sessionId,
							"mcp-protocol-version": "2024-11-05",
						},
					});
					assert.equal(getAsB.status, 404);
					assert.deepEqual(await getAsB.json(), notFoundBody);

					const deleteAsB = await fetch(`${baseUrl}/mcp`, {
						method: "DELETE",
						headers: {
							authorization: `Bearer ${tokenB}`,
							"mcp-session-id": sessionId,
							"mcp-protocol-version": "2024-11-05",
						},
					});
					assert.equal(deleteAsB.status, 404);
					assert.deepEqual(await deleteAsB.json(), notFoundBody);

					// Control: principal A still owns the session after B's rejected
					// attempts, on all three verbs.
					const postAsA = await fetch(`${baseUrl}/mcp`, {
						method: "POST",
						headers: { ...headersFor(tokenA), "mcp-session-id": sessionId },
						body: toolsListBody,
					});
					assert.equal(postAsA.status, 200);
					assert.match(await postAsA.text(), /"tools"/);

					const getAsA = await fetch(`${baseUrl}/mcp`, {
						method: "GET",
						headers: {
							authorization: `Bearer ${tokenA}`,
							accept: "text/event-stream",
							"mcp-session-id": sessionId,
							"mcp-protocol-version": "2024-11-05",
						},
					});
					assert.equal(getAsA.status, 200);
					await getAsA.body?.cancel();

					const deleteAsA = await fetch(`${baseUrl}/mcp`, {
						method: "DELETE",
						headers: {
							authorization: `Bearer ${tokenA}`,
							"mcp-session-id": sessionId,
							"mcp-protocol-version": "2024-11-05",
						},
					});
					assert.equal(deleteAsA.status, 200);
				},
			);
		});
	});

	it("removes both backpressure listeners after drain or close", async () => {
		const httpApp = (await import("../src/lib/http-app.js")) as unknown as {
			waitForResponseWritable?: (response: EventEmitter) => Promise<void>;
		};
		const waitForResponseWritable = httpApp.waitForResponseWritable;
		assert.ok(
			waitForResponseWritable,
			"expected a testable backpressure wait helper",
		);

		for (const event of ["drain", "close"] as const) {
			const response = new EventEmitter();
			const pending = waitForResponseWritable(response);
			assert.equal(response.listenerCount("drain"), 1);
			assert.equal(response.listenerCount("close"), 1);

			response.emit(event);
			await pending;

			assert.equal(response.listenerCount("drain"), 0);
			assert.equal(response.listenerCount("close"), 0);
		}
	});
});
