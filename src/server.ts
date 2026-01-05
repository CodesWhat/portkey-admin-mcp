#!/usr/bin/env node
/**
 * Portkey MCP Server - HTTP transport entry point
 */
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import cors from "cors";
import express from "express";
import { getServerConfig } from "./lib/config.js";
import { createMcpServer } from "./lib/mcp-server.js";
import { SessionStore } from "./lib/session-store.js";

// Get configuration
const config = getServerConfig();

// Create session store
const sessionStore = new SessionStore();

// Create Express app
const app = express();
app.use(
	cors({
		origin: process.env.CORS_ORIGIN || "*",
	}),
);
app.use(express.json());

// Server readiness state
let isReady = false;

// HTTP server instance (declared here for access in shutdown handler)
let server: ReturnType<typeof app.listen>;

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
app.get("/ready", (_req, res) => {
	if (isReady) {
		res.json({
			status: "ready",
			sessions: sessionStore.size,
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
 * MCP POST endpoint - handles MCP requests
 * Creates new sessions on initialize requests, reuses existing sessions otherwise
 */
app.post("/mcp", async (req, res) => {
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
			onsessioninitialized: (id) => {
				sessionStore.set(id, {
					transport: newTransport,
					createdAt: Date.now(),
					lastActivity: Date.now(),
				});
				console.log(`[MCP] Session initialized: ${id}`);
			},
			onsessionclosed: (id) => {
				sessionStore.delete(id);
				console.log(`[MCP] Session closed: ${id}`);
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
const cleanupInterval = setInterval(async () => {
	const expiredIds = await sessionStore.cleanup(config.sessionTimeout);
	for (const id of expiredIds) {
		console.log(`[MCP] Session expired and cleaned up: ${id}`);
	}
}, 60000);

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
	console.log(`\n[MCP] Received ${signal}, shutting down gracefully...`);

	// Stop accepting new connections
	isReady = false;

	// Clear cleanup interval
	clearInterval(cleanupInterval);

	// Close all sessions
	await sessionStore.closeAll();

	// Close HTTP server and exit
	server.close(() => {
		console.log("[MCP] All sessions closed, exiting...");
		process.exit(0);
	});
}

// Register shutdown handlers
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start the server
server = app.listen(config.port, config.host, () => {
	isReady = true;
	console.log(
		`[MCP] Portkey MCP HTTP server running on http://${config.host}:${config.port}`,
	);
	console.log("[MCP] Endpoints:");
	console.log(`  GET  /health - Health check`);
	console.log(`  GET  /ready  - Readiness check`);
	console.log(`  POST /mcp    - MCP requests`);
	console.log(`  GET  /mcp    - SSE notifications`);
	console.log(`  DELETE /mcp  - Close session`);
	console.log(`[MCP] Session timeout: ${config.sessionTimeout}ms`);
});

// Handle server errors
server.on("error", (err: NodeJS.ErrnoException) => {
	if (err.code === "EADDRINUSE") {
		console.error(`[MCP] Error: Port ${config.port} is already in use`);
	} else {
		console.error("[MCP] Server error:", err);
	}
	process.exit(1);
});
