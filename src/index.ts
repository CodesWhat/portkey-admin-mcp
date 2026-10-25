#!/usr/bin/env node
/**
 * Portkey MCP Server - stdio transport entry point
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Logger } from "./lib/logger.js";
import { createMcpServer } from "./lib/mcp-server.js";

function main() {
	try {
		if (!process.env.PORTKEY_API_KEY) {
			// The catalog (initialize/tools/list) still works without credentials,
			// but every tool call will fail until this is set. Logger writes to
			// stderr only, so this cannot corrupt the stdout MCP protocol stream.
			Logger.warn(
				"PORTKEY_API_KEY is not set; tool calls will fail until it is configured.",
			);
		}

		const connection = serveStdio(() => createMcpServer().server, {
			onerror: (error) =>
				Logger.error("MCP stdio transport failed", { error: error.message }),
		});

		// Graceful shutdown handlers
		process.on("SIGINT", async () => {
			await connection.close();
			process.exit(0);
		});
		process.on("SIGTERM", async () => {
			await connection.close();
			process.exit(0);
		});
	} catch (error) {
		console.error("Failed to start MCP server:", error);
		process.exit(1);
	}
}

main();
