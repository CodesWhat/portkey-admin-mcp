/**
 * MCP Server factory for creating configured server instances
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PortkeyService } from "../services/index.js";
import { registerAllTools } from "../tools/index.js";

/**
 * Result of creating an MCP server
 */
export interface McpServerResult {
	/** The MCP server instance */
	server: McpServer;
	/** The main PortkeyService facade */
	service: PortkeyService;
}

/**
 * Create and configure an MCP server with all tools registered
 * @returns McpServerResult with server and service instances
 */
export function createMcpServer(): McpServerResult {
	// Create service instance
	const service = new PortkeyService();

	// Create MCP server
	const server = new McpServer(
		{
			name: "portkey-admin-mcp",
			version: "0.1.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	// Register all Admin API tools
	registerAllTools(server, service);

	return {
		server,
		service,
	};
}
