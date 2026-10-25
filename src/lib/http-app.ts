import { readFileSync } from "node:fs";
import {
	createServer as createHttpServer,
	type Server as HttpServer,
} from "node:http";
import {
	createServer as createHttpsServer,
	type Server as HttpsServer,
} from "node:https";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
	createMcpHandler,
	isJsonContentType,
} from "@modelcontextprotocol/server";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import {
	getSharedPortkeyService,
	type HealthService,
} from "../services/index.js";
import {
	isToolDomain,
	TOOL_DOMAIN_NAMES,
	type ToolDomain,
} from "../tools/index.js";
import {
	assertSafeHttpAuthConfig,
	getHttpAuthConfig,
	mcpAuthMiddleware,
} from "./auth.js";
import { getServerConfig, type ServerConfig } from "./config.js";
import { Logger } from "./logger.js";
import { createMcpServer, resolveToolDomains } from "./mcp-server.js";
import { isMcpRequestPath } from "./request-path.js";
import {
	closeRateLimitStore,
	getAllowedOrigins,
	getRateLimitConfig,
	hostValidationMiddleware,
	originValidationMiddleware,
	principalRateLimitMiddleware,
	rateLimitMiddleware,
	validateOrigin,
} from "./security.js";

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
		throw new Error(
			"MCP_TRUST_PROXY=true is unsafe because it trusts forwarding headers from every peer. Set an exact hop count or trusted proxy subnet instead.",
		);
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
	Logger.error("MCP transport request handling failed", {
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

function respondJsonRpcClientError(
	res: express.Response,
	statusCode: number,
	message: string,
	code = -32602,
): void {
	if (res.headersSent) {
		return;
	}

	res.status(statusCode).json({
		jsonrpc: "2.0",
		error: {
			code,
			message,
		},
		id: null,
	});
}

function parseRequestedToolDomains(
	rawQuery: unknown,
): ToolDomain[] | undefined {
	if (rawQuery === undefined) {
		return undefined;
	}

	const rawValues = Array.isArray(rawQuery) ? rawQuery : [rawQuery];
	const requestedDomains = rawValues.flatMap((value) => {
		if (typeof value !== "string") {
			throw new Error(
				"Invalid tools query parameter. Expected a comma-separated list of tool domains.",
			);
		}

		return value.split(",");
	});

	const normalizedDomains = requestedDomains
		.map((value) => value.trim().toLowerCase())
		.filter((value) => value.length > 0);

	if (normalizedDomains.length === 0) {
		throw new Error(
			`Invalid tools query parameter. Expected one or more tool domains from: ${TOOL_DOMAIN_NAMES.join(", ")}`,
		);
	}

	const invalidDomains = normalizedDomains.filter(
		(value): value is string => !isToolDomain(value),
	);
	if (invalidDomains.length > 0) {
		throw new Error(
			`Unknown tool domains: ${invalidDomains.join(", ")}. Valid domains: ${TOOL_DOMAIN_NAMES.join(", ")}`,
		);
	}

	return resolveToolDomains(normalizedDomains as ToolDomain[]);
}

function createHealthHandler(): express.RequestHandler {
	/**
	 * Health check endpoint - always returns 200 if server is running
	 */
	return function healthHandler(_req, res) {
		res.json({
			status: "ok",
			timestamp: new Date().toISOString(),
			uptime: process.uptime(),
		});
	};
}

interface ReadyHandlerDeps {
	getIsReady: () => boolean;
	readyCheckMode: "local" | "portkey";
	healthService: HealthService | null;
	getActiveRequestCount: () => number;
}

function createReadyHandler(deps: ReadyHandlerDeps): express.RequestHandler {
	const { getIsReady, readyCheckMode, healthService, getActiveRequestCount } =
		deps;

	/**
	 * Readiness check endpoint - returns 200 only when server is ready to accept MCP requests
	 */
	return async function readyHandler(_req, res) {
		const activeRequests = getActiveRequestCount();

		if (getIsReady()) {
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
						activeRequests,
						sessionMode: "stateless",
						portkey,
						timestamp: new Date().toISOString(),
					});
					return;
				} catch (error) {
					res.status(503).json({
						status: "not_ready",
						activeRequests,
						sessionMode: "stateless",
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
				activeRequests,
				sessionMode: "stateless",
				check: "local",
				timestamp: new Date().toISOString(),
			});
		} else {
			res.status(503).json({
				status: "not_ready",
				timestamp: new Date().toISOString(),
			});
		}
	};
}

interface RootPageHandlerDeps {
	publicBaseUrl: string;
	authConfig: ReturnType<typeof getHttpAuthConfig>;
	config: ServerConfig;
}

function createRootPageHandler(
	deps: RootPageHandlerDeps,
): express.RequestHandler {
	const { publicBaseUrl, authConfig, config } = deps;

	/**
	 * Lightweight web UI to simplify hosted setup verification.
	 */
	return function rootPageHandler(_req, res) {
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
    <div><strong>Session mode:</strong> <code>${"stateless"}</code></div>
    <div><strong>Event store mode:</strong> <code>${"retired"}</code></div>
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
	};
}

interface AuthInfoHandlerDeps {
	authConfig: ReturnType<typeof getHttpAuthConfig>;
	config: ServerConfig;
	publicBaseUrl: string;
}

function createAuthInfoHandler(
	deps: AuthInfoHandlerDeps,
): express.RequestHandler {
	const { authConfig, config, publicBaseUrl } = deps;

	return function authInfoHandler(_req, res) {
		res.json({
			mode: authConfig.mode,
			sessionMode: "stateless",
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
		});
	};
}

function createMcpRequestHandler(
	config: ServerConfig,
	activeRequests: Set<() => Promise<void>>,
): express.RequestHandler {
	return async (req, res) => {
		let toolDomains: ToolDomain[] | undefined;
		try {
			toolDomains = parseRequestedToolDomains(req.query.tools);
		} catch (error) {
			respondJsonRpcClientError(
				res,
				400,
				error instanceof Error ? error.message : String(error),
			);
			return;
		}
		if (req.method !== "POST") {
			res.set("Allow", "POST");
			respondJsonRpcClientError(res, 405, "Method not allowed.", -32000);
			return;
		}
		if (!isJsonContentType(req.get("content-type") ?? null)) {
			respondJsonRpcClientError(
				res,
				415,
				"Content-Type must be application/json",
				-32000,
			);
			return;
		}
		if (activeRequests.size >= config.maxSessions) {
			respondJsonRpcClientError(
				res,
				503,
				`Maximum active request limit reached (${config.maxSessions})`,
				-32000,
			);
			return;
		}
		let server: ReturnType<typeof createMcpServer>["server"] | undefined;
		const handler = createMcpHandler(() => {
			server = createMcpServer({ toolDomains }).server;
			return server;
		});
		let closePromise: Promise<void> | undefined;
		const close = () => {
			closePromise ??= (async () => {
				try {
					await handler.close();
					await server?.close();
				} finally {
					activeRequests.delete(close);
				}
			})();
			return closePromise;
		};
		activeRequests.add(close);
		try {
			await toNodeHandler(handler, {
				onerror: (error) => {
					Logger.error("MCP HTTP adapter failed", {
						metadata: { error: error.message },
					});
				},
			})(req, res, req.body);
		} catch (error) {
			respondJsonRpcInternalError(res, `${req.method} /mcp`, error);
		} finally {
			await close();
		}
	};
}

export function createHttpAppRuntime(): HttpAppRuntime {
	const config = getServerConfig();
	const authConfig = getHttpAuthConfig();
	assertSafeHttpAuthConfig(authConfig);
	const readyCheckMode = getReadyCheckMode();
	const requestBodyLimit = process.env.MCP_MAX_REQUEST_SIZE?.trim() || "1mb";
	const allowedOrigins = getAllowedOrigins();
	// Reuse the same matcher the 403 origin gate (originValidationMiddleware)
	// uses, so CORS emits Access-Control-Allow-Origin for exactly the origins
	// the gate accepts, including its any-port semantics for a portless
	// allow-list entry, which the `cors` package's own exact-string matching
	// does not understand.
	const corsOriginConfig: cors.CorsOptions["origin"] = (origin, callback) => {
		callback(null, validateOrigin(origin));
	};
	if (allowedOrigins.includes("*") && authConfig.mode === "none") {
		Logger.warn(
			"CORS wildcard (ALLOWED_ORIGINS=*) combined with MCP_AUTH_MODE=none: all origins are accepted with no authentication. Do not expose this server publicly.",
		);
	}

	const healthService = process.env.PORTKEY_API_KEY
		? getSharedPortkeyService().health
		: null;
	const publicBaseUrl = buildConfiguredPublicBaseUrl(config);
	const activeRequests = new Set<() => Promise<void>>();
	const app = express();

	let isReady = false;
	let server: HttpServer | HttpsServer | undefined;
	let closeRuntimeResourcesPromise: Promise<void> | undefined;
	let sigintHandler: (() => void) | undefined;
	let sigtermHandler: (() => void) | undefined;

	const getIsReady = () => isReady;

	app.set("trust proxy", resolveTrustProxy(process.env.MCP_TRUST_PROXY));
	app.use(
		cors({
			origin: corsOriginConfig,
		}),
	);
	app.use(
		helmet({
			frameguard: { action: "deny" },
			strictTransportSecurity: config.tls.enabled
				? {
						maxAge: 31_536_000,
						includeSubDomains: true,
					}
				: false,
		}),
	);
	// In unauthenticated (none) mode there is no bearer/JWT gate, so validate the
	// Host header to block DNS-rebinding against local deployments. Authenticated
	// modes rely on the token and skip this to avoid rejecting proxied Host headers.
	if (authConfig.mode === "none") {
		app.use(hostValidationMiddleware);
	}
	app.use(originValidationMiddleware);
	const rateLimitConfig = getRateLimitConfig();
	app.use(rateLimitMiddleware);
	app.use(mcpAuthMiddleware);
	app.use(principalRateLimitMiddleware);

	// Body parsing runs only after host/origin validation, both rate limiters,
	// and auth. Registering it earlier let a malformed/oversized body trip the
	// parser's error path, which Express routes straight to the error handler
	// below, skipping every non-error middleware in between, including both
	// rate limiters, so a request could evade rate limiting just by sending a
	// broken body. None of the middleware between here and the /mcp route
	// handlers reads req.body.
	app.use(express.json({ limit: requestBodyLimit }));

	// Parse/body-size errors need a controlled JSON response in HTTP mode.
	app.use(
		(
			err: unknown,
			_req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			const errorType =
				err && typeof err === "object" && "type" in err ? err.type : undefined;
			if (errorType === "entity.too.large") {
				res.status(413).json({ error: "Payload too large" });
				return;
			}
			if (errorType === "entity.parse.failed") {
				res.status(400).json({ error: "Malformed JSON request body" });
				return;
			}
			next(err);
		},
	);

	/**
	 * Health check endpoint - always returns 200 if server is running
	 */
	app.get("/health", createHealthHandler());

	/**
	 * Readiness check endpoint - returns 200 only when server is ready to accept MCP requests
	 */
	app.get(
		"/ready",
		createReadyHandler({
			getIsReady,
			readyCheckMode,
			healthService,
			getActiveRequestCount: () => activeRequests.size,
		}),
	);

	/**
	 * Lightweight web UI to simplify hosted setup verification.
	 */
	app.get(
		"/",
		createRootPageHandler({
			publicBaseUrl,
			authConfig,
			config,
		}),
	);

	app.get(
		"/auth/info",
		createAuthInfoHandler({
			authConfig,
			config,
			publicBaseUrl,
		}),
	);

	app.all("/mcp", createMcpRequestHandler(config, activeRequests));

	app.use(
		(
			error: unknown,
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			if (!isMcpRequestPath(req.path)) {
				next(error);
				return;
			}
			respondJsonRpcInternalError(res, `${req.method} /mcp`, error);
		},
	);

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

	async function closeListener(): Promise<void> {
		const listener = server;
		if (!listener?.listening) {
			return;
		}
		await new Promise<void>((resolveClose, reject) => {
			listener.once("close", resolveClose);
			listener.close((error) => {
				if (error) {
					reject(error);
				}
			});
			listener.closeIdleConnections();
		});
	}

	async function closeRuntimeResources(): Promise<void> {
		if (!closeRuntimeResourcesPromise) {
			closeRuntimeResourcesPromise = (async () => {
				isReady = false;
				detachSignalHandlers();

				const failures: unknown[] = [];
				const storeResults = await Promise.allSettled([
					...Array.from(activeRequests, (close) => close()),
					closeRateLimitStore(),
				]);
				for (const result of storeResults) {
					if (result.status === "rejected") {
						failures.push(result.reason);
					}
				}

				try {
					await closeListener();
				} catch (error) {
					failures.push(error);
				}

				if (failures.length > 0) {
					throw failures[0];
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
				sessionMode: "stateless",
				requestBodyLimit,
				allowedOrigins,
				authMode: authConfig.mode,
				readyCheckMode,
				rateLimitEnabled: rateLimitConfig.enabled,
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
		console.log(
			"  GET/DELETE /mcp - Method not allowed (no sessions or replay)",
		);
		console.log(`[MCP] Max active requests: ${config.maxSessions}`);
		console.log(`[MCP] Auth mode: ${authConfig.mode}`);
		console.log(`[MCP] Ready check: ${readyCheckMode}`);
	}

	async function shutdown(signal: string): Promise<void> {
		console.log(`\n[MCP] Received ${signal}, shutting down gracefully...`);
		const shutdownTimeoutMs = config.shutdownTimeout;

		let forced = false;
		const forceExitTimer = setTimeout(() => {
			forced = true;
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

		if (forced) {
			return;
		}

		if (!server) {
			clearTimeout(forceExitTimer);
			process.exit(exitCode);
			return;
		}

		server.close(() => {
			clearTimeout(forceExitTimer);
			console.log("[MCP] All requests closed, exiting...");
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
