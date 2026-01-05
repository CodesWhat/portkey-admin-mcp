#!/usr/bin/env node
/**
 * Portkey MCP Server - stdio transport entry point
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./lib/mcp-server.js";

async function main() {
	try {
		// Create MCP server with all tools registered
		const { server } = createMcpServer();

		// Start server with stdio transport
		const transport = new StdioServerTransport();
		await server.connect(transport);

		// Graceful shutdown handlers
		process.on("SIGINT", async () => {
			await server.close();
			process.exit(0);
		});
		process.on("SIGTERM", async () => {
			await server.close();
			process.exit(0);
		});
	} catch (error) {
		console.error("Failed to start MCP server:", error);
		process.exit(1);
	}
}

main();
