#!/usr/bin/env node
/**
 * Portkey MCP Server - HTTP transport entry point
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";
import { mcpAuthMiddleware, getHttpAuthConfig } from "./lib/auth.js";
import { getServerConfig } from "./lib/config.js";
import { createManagedEventStore } from "./lib/event-store.js";
import { Logger } from "./lib/logger.js";
import { createMcpServer } from "./lib/mcp-server.js";
import {
	getAllowedOrigins,
	originValidationMiddleware,
	rateLimitMiddleware,
} from "./lib/security.js";
import { SessionStore } from "./lib/session-store.js";
import { HealthService } from "./services/health.service.js";

// Get configuration
const config = getServerConfig();
const authConfig = getHttpAuthConfig();
const managedEventStore = createManagedEventStore(config);

const readyCheckMode = (process.env.MCP_READY_CHECK_MODE?.trim().toLowerCase() ||
	"local") as "local" | "portkey";

if (readyCheckMode !== "local" && readyCheckMode !== "portkey") {
	throw new Error(
		`Invalid MCP_READY_CHECK_MODE value: ${readyCheckMode}. Must be 'local' or 'portkey'`,
	);
}

const requestBodyLimit = process.env.MCP_MAX_REQUEST_SIZE?.trim() || "1mb";
const allowedOrigins = getAllowedOrigins();
const corsOriginConfig: cors.CorsOptions["origin"] = allowedOrigins.includes("*")
	? true
	: allowedOrigins;
const healthService = process.env.PORTKEY_API_KEY ? new HealthService() : null;
const isStatefulSessionMode = config.sessionMode === "stateful";

function resolveTrustProxy(
	raw: string | undefined,
): boolean | number | string {
	const trimmed = raw?.trim();
	if (!trimmed) {
		return "loopback";
	}

	const normalized = trimmed.toLowerCase();
	if (normalized === "true") {
		return true;
	}
	if (normalized === "false") {
		return false;
	}

	const hopCount = Number.parseInt(trimmed, 10);
	if (Number.isInteger(hopCount) && String(hopCount) === trimmed && hopCount >= 0) {
		return hopCount;
	}

	return trimmed;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function getPublicBaseUrl(req: express.Request): string {
	const protocol = req.protocol || config.protocol;
	const host = req.get("host") || req.headers.host || `${config.host}:${config.port}`;
	return `${protocol}://${host}`;
}

// Create session store
const sessionStore = new SessionStore();
let statelessTransportPromise:
	| Promise<StreamableHTTPServerTransport>
	| undefined;

async function getStatelessTransport(): Promise<StreamableHTTPServerTransport> {
	if (!statelessTransportPromise) {
		const initPromise = (async () => {
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				eventStore: managedEventStore.eventStore,
			});
			const { server: mcpServer } = createMcpServer();
			await mcpServer.connect(transport);
			return transport;
		})();
		statelessTransportPromise = initPromise.catch((error) => {
			statelessTransportPromise = undefined;
			throw error;
		});
	}

	return statelessTransportPromise;
}

// Create Express app
const app = express();
app.set("trust proxy", resolveTrustProxy(process.env.MCP_TRUST_PROXY));
app.use(
	cors({
		origin: corsOriginConfig,
	}),
);
app.use(express.json({ limit: requestBodyLimit }));
app.use(originValidationMiddleware);
app.use(rateLimitMiddleware);
app.use(mcpAuthMiddleware);

// Parse/body-size errors need a controlled JSON response in HTTP mode.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
	if (
		err &&
		typeof err === "object" &&
		"type" in err &&
		err.type === "entity.too.large"
	) {
		res.status(413).json({ error: "Payload too large" });
		return;
	}
	next(err);
});

// Server readiness state
let isReady = false;

// HTTP server instance (declared here for access in shutdown handler)
let server: HttpServer | HttpsServer | undefined;

/**
 * Health check endpoint - always returns 200 if server is running
 */
app.get("/health", (_req, res) => {
	res.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	});
});

/**
 * Readiness check endpoint - returns 200 only when server is ready to accept MCP requests
 */
app.get("/ready", async (_req, res) => {
	const sessionCount = isStatefulSessionMode ? sessionStore.size : 0;

	if (isReady) {
		if (readyCheckMode === "portkey") {
			if (!healthService) {
				res.status(503).json({
					status: "not_ready",
					reason: "PORTKEY_API_KEY is not configured",
					timestamp: new Date().toISOString(),
				});
				return;
			}

			try {
				const portkey = await healthService.ping();
				res.json({
					status: "ready",
					sessions: sessionCount,
					sessionMode: config.sessionMode,
					eventStoreMode: config.eventStore.mode,
					portkey,
					timestamp: new Date().toISOString(),
				});
				return;
			} catch (error) {
				res.status(503).json({
					status: "not_ready",
					sessions: sessionCount,
					sessionMode: config.sessionMode,
					eventStoreMode: config.eventStore.mode,
					portkey: {
						status: "error",
						error: error instanceof Error ? error.message : "Unknown error",
					},
					timestamp: new Date().toISOString(),
				});
				return;
			}
		}

		res.json({
			status: "ready",
			sessions: sessionCount,
			sessionMode: config.sessionMode,
			eventStoreMode: config.eventStore.mode,
			check: "local",
			timestamp: new Date().toISOString(),
		});
	} else {
		res.status(503).json({
			status: "not_ready",
			timestamp: new Date().toISOString(),
		});
	}
});

/**
 * Lightweight web UI to simplify hosted setup verification.
 */
app.get("/", (req, res) => {
	const baseUrl = getPublicBaseUrl(req);
	const mcpUrl = `${baseUrl}/mcp`;
	const authHelp =
		authConfig.mode === "none"
			? "Authentication disabled (development only)."
			: authConfig.mode === "bearer"
				? "Send Authorization: Bearer <MCP_AUTH_TOKEN>."
				: "Send Authorization: Bearer <Clerk JWT> (verified via CLERK_ISSUER/JWKS).";

	res.setHeader(
		"Content-Security-Policy",
		"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
	);
	res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Portkey MCP Server</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; margin: 2rem; line-height: 1.5; max-width: 900px; }
    h1 { margin: 0 0 0.75rem 0; }
    .card { border: 1px solid #6b7280; border-radius: 12px; padding: 1rem; margin: 0.75rem 0; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .ok { color: #16a34a; font-weight: 600; }
    .bad { color: #dc2626; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Portkey Admin MCP Server</h1>
  <div class="card">
    <div><strong>MCP endpoint:</strong> <code>${escapeHtml(mcpUrl)}</code></div>
    <div><strong>Transport security:</strong> <code>${config.tls.enabled ? "native HTTPS enabled" : "HTTP in app (use proxy/platform HTTPS in production)"}</code></div>
    <div><strong>Session mode:</strong> <code>${escapeHtml(config.sessionMode)}</code></div>
    <div><strong>Event store mode:</strong> <code>${escapeHtml(config.eventStore.mode)}</code></div>
    <div><strong>Auth mode:</strong> <code>${escapeHtml(authConfig.mode)}</code></div>
    <div><strong>Auth usage:</strong> ${escapeHtml(authHelp)}</div>
  </div>
  <div class="card">
    <div><strong>/health:</strong> <span id="health">checking...</span></div>
    <div><strong>/ready:</strong> <span id="ready">checking...</span></div>
  </div>
  <div class="card">
    <div><strong>Useful endpoints</strong></div>
    <div><code>GET /auth/info</code> auth metadata for hosted clients</div>
    <div><code>GET /health</code> process health</div>
    <div><code>GET /ready</code> readiness + optional Portkey ping</div>
  </div>
  <script>
    async function ping(id, path) {
      const el = document.getElementById(id);
      try {
        const res = await fetch(path);
        el.textContent = res.ok ? "ok" : "error (" + res.status + ")";
        el.className = res.ok ? "ok" : "bad";
      } catch (_e) {
        el.textContent = "unreachable";
        el.className = "bad";
      }
    }
    ping("health", "/health");
    ping("ready", "/ready");
  </script>
</body>
</html>`);
});

app.get("/auth/info", (req, res) => {
	res.json({
		mode: authConfig.mode,
		sessionMode: config.sessionMode,
		eventStoreMode: config.eventStore.mode,
		mcpEndpoint: `${getPublicBaseUrl(req)}/mcp`,
		clerk: {
			issuerConfigured: Boolean(process.env.CLERK_ISSUER),
			jwksConfigured: Boolean(process.env.CLERK_JWKS_URL || process.env.CLERK_ISSUER),
			audienceConfigured: Boolean(process.env.CLERK_AUDIENCE),
		},
		tls: {
			enabled: config.tls.enabled,
			protocol: config.protocol,
		},
		redis: {
			configured: Boolean(config.eventStore.redisUrl),
		},
	});
});

/**
 * MCP POST endpoint - handles MCP requests
 * Creates new sessions on initialize requests, reuses existing sessions otherwise
 */
app.post("/mcp", async (req, res) => {
	if (!isStatefulSessionMode) {
		const statelessTransport = await getStatelessTransport();
		await statelessTransport.handleRequest(req, res, req.body);
		return;
	}

	const sessionId = req.headers["mcp-session-id"] as string | undefined;
	let transport: StreamableHTTPServerTransport | undefined;

	if (sessionId) {
		// Try to reuse existing session
		transport = sessionStore.getTransport(sessionId) as
			| StreamableHTTPServerTransport
			| undefined;
		if (transport) {
			sessionStore.touch(sessionId);
		}
	}

	if (!transport && !sessionId && isInitializeRequest(req.body)) {
		// New session initialization
		const newTransport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			eventStore: managedEventStore.eventStore,
			onsessioninitialized: (id) => {
				sessionStore.set(id, {
					transport: newTransport,
					createdAt: Date.now(),
					lastActivity: Date.now(),
				});
				Logger.info("MCP session initialized", {
					metadata: { sessionId: id },
				});
			},
			onsessionclosed: (id) => {
				sessionStore.delete(id);
				Logger.info("MCP session closed", {
					metadata: { sessionId: id },
				});
			},
		});

		// Clean up on transport close
		newTransport.onclose = () => {
			if (newTransport.sessionId) {
				sessionStore.delete(newTransport.sessionId);
			}
		};
		transport = newTransport;

		// Create MCP server for this session
		const { server } = createMcpServer();
		await server.connect(transport);
	} else if (!transport) {
		// Invalid request - no session ID and not an initialize request
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: sessionId
					? "Session not found"
					: "Missing session ID or invalid initialize request",
			},
			id: null,
		});
		return;
	}

	await transport.handleRequest(req, res, req.body);
});

/**
 * MCP GET endpoint - handles SSE streams for server-to-client notifications
 */
app.get("/mcp", async (req, res) => {
	if (!isStatefulSessionMode) {
		const statelessTransport = await getStatelessTransport();
		await statelessTransport.handleRequest(req, res);
		return;
	}

	const sessionId = req.headers["mcp-session-id"] as string | undefined;

	if (!sessionId) {
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Missing session ID",
			},
			id: null,
		});
		return;
	}

	const transport = sessionStore.getTransport(sessionId) as
		| StreamableHTTPServerTransport
		| undefined;

	if (transport) {
		sessionStore.touch(sessionId);
		await transport.handleRequest(req, res);
	} else {
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Invalid session ID",
			},
			id: null,
		});
	}
});

/**
 * MCP DELETE endpoint - closes sessions
 */
app.delete("/mcp", async (req, res) => {
	if (!isStatefulSessionMode) {
		res.status(405).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "DELETE /mcp is not used in stateless session mode",
			},
			id: null,
		});
		return;
	}

	const sessionId = req.headers["mcp-session-id"] as string | undefined;

	if (!sessionId) {
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Missing session ID",
			},
			id: null,
		});
		return;
	}

	const transport = sessionStore.getTransport(sessionId) as
		| StreamableHTTPServerTransport
		| undefined;

	if (transport) {
		await transport.handleRequest(req, res);
	} else {
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Invalid session ID",
			},
			id: null,
		});
	}
});

// Session cleanup interval (every minute)
const cleanupInterval = isStatefulSessionMode
	? setInterval(async () => {
			const expiredIds = await sessionStore.cleanup(config.sessionTimeout);
			for (const id of expiredIds) {
				Logger.info("MCP session expired and cleaned up", {
					metadata: { sessionId: id },
				});
			}
		}, 60000)
	: undefined;

export function setServerReady(value = true): void {
	isReady = value;
}

async function closeRuntimeResources(): Promise<void> {
	// Stop accepting new requests
	isReady = false;

	// Clear cleanup interval
	if (cleanupInterval) {
		clearInterval(cleanupInterval);
	}

	if (isStatefulSessionMode) {
		await sessionStore.closeAll();
	} else if (statelessTransportPromise) {
		const statelessTransport = await statelessTransportPromise;
		await statelessTransport.close();
	}
	await managedEventStore.close();
}

export async function closeHttpApp(): Promise<void> {
	await closeRuntimeResources();
}

function createNodeServer(): HttpServer | HttpsServer {
	if (config.tls.enabled) {
		return createHttpsServer(
			{
				key: readFileSync(config.tls.keyPath as string),
				cert: readFileSync(config.tls.certPath as string),
				ca: config.tls.caPath ? readFileSync(config.tls.caPath) : undefined,
			},
			app,
		);
	}

	return createHttpServer(app);
}

function logStartup(): void {
	Logger.info("HTTP(S) server configuration", {
		metadata: {
			host: config.host,
			port: config.port,
			protocol: config.protocol,
			sessionMode: config.sessionMode,
			eventStoreMode: config.eventStore.mode,
			requestBodyLimit,
			allowedOrigins,
			authMode: authConfig.mode,
			readyCheckMode,
			rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== "false",
		},
	});
	console.log(
		`[MCP] Portkey MCP server running on ${config.protocol}://${config.host}:${config.port}`,
	);
	console.log("[MCP] Endpoints:");
	console.log(`  GET  /       - Web status/auth page`);
	console.log(`  GET  /auth/info - Auth metadata`);
	console.log(`  GET  /health - Health check`);
	console.log(`  GET  /ready  - Readiness check`);
	console.log(`  POST /mcp    - MCP requests`);
	console.log(`  GET  /mcp    - SSE notifications`);
	console.log(
		`  DELETE /mcp  - ${isStatefulSessionMode ? "Close session" : "Not used in stateless mode"}`,
	);
	console.log(`[MCP] Session timeout: ${config.sessionTimeout}ms`);
	console.log(`[MCP] Session mode: ${config.sessionMode}`);
	console.log(`[MCP] Event store mode: ${config.eventStore.mode}`);
	console.log(`[MCP] Auth mode: ${authConfig.mode}`);
	console.log(`[MCP] Ready check: ${readyCheckMode}`);
}

async function shutdown(signal: string): Promise<void> {
	console.log(`\n[MCP] Received ${signal}, shutting down gracefully...`);
	const rawShutdownTimeout = process.env.MCP_SHUTDOWN_TIMEOUT_MS?.trim();
	const parsedShutdownTimeout = rawShutdownTimeout
		? Number.parseInt(rawShutdownTimeout, 10)
		: 10_000;
	const shutdownTimeoutMs =
		Number.isFinite(parsedShutdownTimeout) && parsedShutdownTimeout > 0
			? parsedShutdownTimeout
			: 10_000;

	const forceExitTimer = setTimeout(() => {
		console.error(
			`[MCP] Forced shutdown after ${shutdownTimeoutMs}ms timeout`,
		);
		process.exit(1);
	}, shutdownTimeoutMs);
	forceExitTimer.unref();

	let exitCode = 0;
	try {
		await closeRuntimeResources();
	} catch (error) {
		exitCode = 1;
		console.error(
			"[MCP] Error while closing runtime resources:",
			error instanceof Error ? error.message : String(error),
		);
	}

	if (!server) {
		clearTimeout(forceExitTimer);
		process.exit(exitCode);
	}

	server.close(() => {
		clearTimeout(forceExitTimer);
		console.log("[MCP] All sessions closed, exiting...");
		process.exit(exitCode);
	});
}

export function startHttpServer(): HttpServer | HttpsServer {
	if (server) {
		return server;
	}

	try {
		server = createNodeServer();
	} catch (error) {
		console.error(
			"[MCP] Failed to create HTTP(S) server:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}

	server.listen(config.port, config.host, () => {
		setServerReady(true);
		logStartup();
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error(`[MCP] Error: Port ${config.port} is already in use`);
		} else {
			console.error("[MCP] Server error:", err);
		}
		process.exit(1);
	});

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});
	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});

	return server;
}

function isMainModule(): boolean {
	const entrypoint = process.argv[1];
	if (!entrypoint) {
		return false;
	}
	return import.meta.url === pathToFileURL(entrypoint).href;
}

export { app, authConfig, config };
export default app;

if (isMainModule()) {
	startHttpServer();
}
