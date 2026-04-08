import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
} from "node:http";
import {
	createServer as createHttpsServer,
	type Server as HttpsServer,
} from "node:https";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { getSharedHealthService } from "../services/index.js";
import {
	assertSafeHttpAuthConfig,
	getHttpAuthConfig,
	mcpAuthMiddleware,
} from "./auth.js";
import { getServerConfig, type ServerConfig } from "./config.js";
import { createManagedEventStore } from "./event-store.js";
import { Logger } from "./logger.js";
import { createMcpServer } from "./mcp-server.js";
import {
	getAllowedOrigins,
	originValidationMiddleware,
	rateLimitMiddleware,
} from "./security.js";
import { SessionStore } from "./session-store.js";

export interface HttpAppRuntime {
	app: express.Express;
	authConfig: ReturnType<typeof getHttpAuthConfig>;
	config: ServerConfig;
	closeHttpApp(): Promise<void>;
	setServerReady(value?: boolean): void;
	startHttpServer(): HttpServer | HttpsServer;
}

function getReadyCheckMode(): "local" | "portkey" {
	const readyCheckMode =
		(process.env.MCP_READY_CHECK_MODE?.trim().toLowerCase() || "local") as
			| "local"
			| "portkey";

	if (readyCheckMode !== "local" && readyCheckMode !== "portkey") {
		throw new Error(
			`Invalid MCP_READY_CHECK_MODE value: ${readyCheckMode}. Must be 'local' or 'portkey'`,
		);
	}

	return readyCheckMode;
}

function resolveTrustProxy(raw: string | undefined): boolean | number | string {
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
	if (
		Number.isInteger(hopCount) &&
		String(hopCount) === trimmed &&
		hopCount >= 0
	) {
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

function normalizeBaseUrlPath(pathname: string): string {
	const trimmed = pathname.replace(/\/+$/, "");
	return trimmed === "" || trimmed === "/" ? "" : trimmed;
}

function normalizeAdvertisedHost(host: string): string {
	const trimmed = host.trim();
	const withoutIpv6Brackets =
		trimmed.startsWith("[") && trimmed.endsWith("]")
			? trimmed.slice(1, -1)
			: trimmed;
	if (
		withoutIpv6Brackets === "0.0.0.0" ||
		withoutIpv6Brackets === "::" ||
		withoutIpv6Brackets === ""
	) {
		return "127.0.0.1";
	}
	return withoutIpv6Brackets;
}

function parsePublicBaseUrl(raw: string): string {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error(
			`Invalid MCP_PUBLIC_BASE_URL value: ${raw}. Must be an absolute http(s) URL`,
		);
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		throw new Error(
			`Invalid MCP_PUBLIC_BASE_URL value: ${raw}. Must use http or https`,
		);
	}

	if (!parsed.hostname) {
		throw new Error(
			`Invalid MCP_PUBLIC_BASE_URL value: ${raw}. Hostname is required`,
		);
	}

	return `${parsed.origin}${normalizeBaseUrlPath(parsed.pathname)}`;
}

function buildConfiguredPublicBaseUrl(config: ServerConfig): string {
	const configured = process.env.MCP_PUBLIC_BASE_URL?.trim();
	if (configured) {
		return parsePublicBaseUrl(configured);
	}

	const url = new URL(`${config.protocol}://localhost`);
	url.hostname = normalizeAdvertisedHost(config.host);
	url.port = String(config.port);
	return `${url.origin}${normalizeBaseUrlPath(url.pathname)}`;
}

function respondJsonRpcInternalError(
	res: express.Response,
	context: string,
	error: unknown,
): void {
	Logger.error("Stateless transport request handling failed", {
		metadata: {
			context,
			error: error instanceof Error ? error.message : String(error),
		},
	});

	if (res.headersSent) {
		return;
	}

	res.status(500).json({
		jsonrpc: "2.0",
		error: {
			code: -32603,
			message: `Internal server error (${context})`,
		},
		id: null,
	});
}

export function createHttpAppRuntime(): HttpAppRuntime {
	const config = getServerConfig();
	const authConfig = getHttpAuthConfig();
	assertSafeHttpAuthConfig(authConfig);
	const managedEventStore = createManagedEventStore(config);
	const readyCheckMode = getReadyCheckMode();
	const requestBodyLimit = process.env.MCP_MAX_REQUEST_SIZE?.trim() || "1mb";
	const allowedOrigins = getAllowedOrigins();
	const corsOriginConfig: cors.CorsOptions["origin"] = allowedOrigins.includes(
		"*",
	)
		? true
		: allowedOrigins;
	const healthService = process.env.PORTKEY_API_KEY
		? getSharedHealthService()
		: null;
	const isStatefulSessionMode = config.sessionMode === "stateful";
	const publicBaseUrl = buildConfiguredPublicBaseUrl(config);
	const sessionStore = new SessionStore(config.maxSessions);
	const app = express();

	let isReady = false;
	let server: HttpServer | HttpsServer | undefined;
	let statelessTransportPromise:
		| Promise<StreamableHTTPServerTransport>
		| undefined;
	let cleanupInterval: NodeJS.Timeout | undefined;
	let closeRuntimeResourcesPromise: Promise<void> | undefined;
	let sigintHandler: (() => void) | undefined;
	let sigtermHandler: (() => void) | undefined;

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

	app.set("trust proxy", resolveTrustProxy(process.env.MCP_TRUST_PROXY));
	app.use(
		cors({
			origin: corsOriginConfig,
		}),
	);
	app.use(
		helmet({
			frameguard: { action: "deny" },
			strictTransportSecurity: {
				maxAge: 31_536_000,
				includeSubDomains: true,
			},
		}),
	);
	app.use(express.json({ limit: requestBodyLimit }));
	app.use(originValidationMiddleware);
	app.use(rateLimitMiddleware);
	app.use(mcpAuthMiddleware);

	// Parse/body-size errors need a controlled JSON response in HTTP mode.
	app.use(
		(
			err: unknown,
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
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
		},
	);

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
	app.get("/", (_req, res) => {
		const baseUrl = publicBaseUrl;
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

	app.get("/auth/info", (_req, res) => {
		res.json({
			mode: authConfig.mode,
			sessionMode: config.sessionMode,
			eventStoreMode: config.eventStore.mode,
			mcpEndpoint: `${publicBaseUrl}/mcp`,
			clerk: {
				issuerConfigured: Boolean(process.env.CLERK_ISSUER),
				jwksConfigured: Boolean(
					process.env.CLERK_JWKS_URL || process.env.CLERK_ISSUER,
				),
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
			try {
				const statelessTransport = await getStatelessTransport();
				await statelessTransport.handleRequest(req, res, req.body);
			} catch (error) {
				respondJsonRpcInternalError(res, "POST /mcp stateless", error);
			}
			return;
		}

		const sessionId = req.headers["mcp-session-id"] as string | undefined;
		let transport: StreamableHTTPServerTransport | undefined;
		let hasReservedSessionSlot = false;

		if (sessionId) {
			transport = sessionStore.getTransport(sessionId) as
				| StreamableHTTPServerTransport
				| undefined;
			if (transport) {
				sessionStore.touch(sessionId);
			}
		}

		if (!transport && !sessionId && isInitializeRequest(req.body)) {
			if (!sessionStore.tryReserve()) {
				Logger.warn("Rejected MCP session initialization at capacity", {
					metadata: {
						activeSessions: sessionStore.size,
						maxSessions: config.maxSessions,
					},
				});
				res.status(503).json({
					jsonrpc: "2.0",
					error: {
						code: -32000,
						message: `Maximum active session limit reached (${config.maxSessions})`,
					},
					id: null,
				});
				return;
			}
			hasReservedSessionSlot = true;

			const newTransport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				eventStore: managedEventStore.eventStore,
				onsessioninitialized: (id) => {
					sessionStore.set(id, {
						transport: newTransport,
						createdAt: Date.now(),
						lastActivity: Date.now(),
					});
					hasReservedSessionSlot = false;
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

			newTransport.onclose = () => {
				if (newTransport.sessionId) {
					sessionStore.delete(newTransport.sessionId);
				}
			};
			transport = newTransport;

			try {
				const { server: mcpServer } = createMcpServer();
				await mcpServer.connect(transport);
			} catch (error) {
				if (hasReservedSessionSlot) {
					sessionStore.releaseReservation();
					hasReservedSessionSlot = false;
				}
				respondJsonRpcInternalError(
					res,
					"POST /mcp stateful initialize",
					error,
				);
				return;
			}
		} else if (!transport) {
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

		try {
			await transport.handleRequest(req, res, req.body);
		} catch (error) {
			if (hasReservedSessionSlot) {
				sessionStore.releaseReservation();
			}
			respondJsonRpcInternalError(
				res,
				sessionId
					? "POST /mcp stateful session"
					: "POST /mcp stateful initialize",
				error,
			);
		}
	});

	/**
	 * MCP GET endpoint - handles SSE streams for server-to-client notifications
	 */
	app.get("/mcp", async (req, res) => {
		if (!isStatefulSessionMode) {
			try {
				const statelessTransport = await getStatelessTransport();
				await statelessTransport.handleRequest(req, res);
			} catch (error) {
				respondJsonRpcInternalError(res, "GET /mcp stateless", error);
			}
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

	cleanupInterval = isStatefulSessionMode
		? setInterval(async () => {
				try {
					const expiredIds = await sessionStore.cleanup(config.sessionTimeout);
					for (const id of expiredIds) {
						Logger.info("MCP session expired and cleaned up", {
							metadata: { sessionId: id },
						});
					}
				} catch (error) {
					Logger.error("Session cleanup tick failed", {
						metadata: {
							fn: "sessionStore.cleanup",
							error: error instanceof Error ? error.message : String(error),
						},
					});
				}
			}, 60000)
		: undefined;
	cleanupInterval?.unref?.();

	function setServerReady(value = true): void {
		isReady = value;
	}

	function detachSignalHandlers(): void {
		if (sigintHandler) {
			process.off("SIGINT", sigintHandler);
			sigintHandler = undefined;
		}
		if (sigtermHandler) {
			process.off("SIGTERM", sigtermHandler);
			sigtermHandler = undefined;
		}
	}

	async function closeRuntimeResources(): Promise<void> {
		if (!closeRuntimeResourcesPromise) {
			closeRuntimeResourcesPromise = (async () => {
				isReady = false;
				detachSignalHandlers();

				if (cleanupInterval) {
					clearInterval(cleanupInterval);
					cleanupInterval = undefined;
				}

				try {
					if (isStatefulSessionMode) {
						await sessionStore.closeAll();
					} else if (statelessTransportPromise) {
						const transportPromise = statelessTransportPromise;
						statelessTransportPromise = undefined;
						const statelessTransport = await transportPromise;
						await statelessTransport.close();
					}
				} finally {
					await managedEventStore.close();
				}
			})();
		}

		await closeRuntimeResourcesPromise;
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
				maxSessions: config.maxSessions,
				publicBaseUrl,
			},
		});
		console.log(
			`[MCP] Portkey MCP server running on ${config.protocol}://${config.host}:${config.port}`,
		);
		console.log(`[MCP] Advertised base URL: ${publicBaseUrl}`);
		console.log("[MCP] Endpoints:");
		console.log("  GET  /       - Web status/auth page");
		console.log("  GET  /auth/info - Auth metadata");
		console.log("  GET  /health - Health check");
		console.log("  GET  /ready  - Readiness check");
		console.log("  POST /mcp    - MCP requests");
		console.log("  GET  /mcp    - SSE notifications");
		console.log(
			`  DELETE /mcp  - ${isStatefulSessionMode ? "Close session" : "Not used in stateless mode"}`,
		);
		console.log(`[MCP] Session timeout: ${config.sessionTimeout}ms`);
		console.log(`[MCP] Max sessions: ${config.maxSessions}`);
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

	function startHttpServer(): HttpServer | HttpsServer {
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

		server.on("close", () => {
			detachSignalHandlers();
			server = undefined;
		});

		if (!sigintHandler) {
			sigintHandler = () => {
				void shutdown("SIGINT");
			};
			process.on("SIGINT", sigintHandler);
		}

		if (!sigtermHandler) {
			sigtermHandler = () => {
				void shutdown("SIGTERM");
			};
			process.on("SIGTERM", sigtermHandler);
		}

		return server;
	}

	return {
		app,
		authConfig,
		config,
		closeHttpApp: closeRuntimeResources,
		setServerReady,
		startHttpServer,
	};
}
