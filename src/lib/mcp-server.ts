/**
 * MCP Server factory for creating configured server instances
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	getSharedPortkeyService,
	type PortkeyService,
} from "../services/index.js";
import { registerAllTools } from "../tools/index.js";

function readPackageVersion(): string {
	try {
		return JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf-8"),
		).version;
	} catch {
		return "0.0.0";
	}
}

const PACKAGE_VERSION = readPackageVersion();

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
	// Reuse the service facade across MCP server instances to avoid rebuilding
	// the entire domain-service graph for each stateless/request-scoped server.
	const service = getSharedPortkeyService();

	// Create MCP server
	const server = new McpServer(
		{
			name: "portkey-admin-mcp",
			version: PACKAGE_VERSION,
		},
		{
			capabilities: {
				tools: { listChanged: true },
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
