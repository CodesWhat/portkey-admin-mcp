/**
 * MCP Server factory for creating configured server instances
 */
import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	getSharedPortkeyService,
	type PortkeyService,
} from "../services/index.js";
import {
	isToolDomain,
	normalizeToolDomains,
	registerAllTools,
	TOOL_DOMAIN_NAMES,
	type ToolDomain,
} from "../tools/index.js";

const PACKAGE_JSON_URL_CANDIDATES = [
	new URL("../../package.json", import.meta.url),
	new URL("../package.json", import.meta.url),
];

function readPackageVersion(): string {
	for (const packageJsonUrl of PACKAGE_JSON_URL_CANDIDATES) {
		try {
			return JSON.parse(readFileSync(packageJsonUrl, "utf-8")).version;
		} catch {}
	}

	return "0.0.0";
}

const PACKAGE_VERSION = readPackageVersion();
const SERVER_INSTRUCTIONS =
	"Portkey Admin API server. Use list_* tools for discovery and get_* tools for details. " +
	"Analytics tools require time_of_generation_min/max. " +
	"Prompt workflows: create_prompt -> publish_prompt. " +
	"Always validate_completion_metadata before run_prompt_completion. " +
	"If the server is configured with only some domains, stay within that subset instead of assuming every Portkey admin tool is available.";

function parseConfiguredToolDomains(
	rawValue: string | undefined = process.env.PORTKEY_TOOL_DOMAINS?.trim() ||
		process.env.MCP_TOOL_DOMAINS?.trim(),
): ToolDomain[] | undefined {
	if (!rawValue) {
		return undefined;
	}

	const requestedDomains = rawValue
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter((value) => value.length > 0);

	if (requestedDomains.length === 0) {
		throw new Error(
			`Invalid PORTKEY_TOOL_DOMAINS value. Expected one or more domains from: ${TOOL_DOMAIN_NAMES.join(", ")}`,
		);
	}

	const invalidDomains = requestedDomains.filter(
		(value): value is string => !isToolDomain(value),
	);
	if (invalidDomains.length > 0) {
		throw new Error(
			`Unknown tool domains in PORTKEY_TOOL_DOMAINS: ${invalidDomains.join(", ")}. Valid domains: ${TOOL_DOMAIN_NAMES.join(", ")}`,
		);
	}

	return normalizeToolDomains(requestedDomains as ToolDomain[]);
}

/**
 * Result of creating an MCP server
 */
export interface McpServerResult {
	/** The MCP server instance */
	server: McpServer;
	/** The main PortkeyService facade */
	service: PortkeyService;
}

export interface CreateMcpServerOptions {
	toolDomains?: readonly ToolDomain[];
}

/**
 * Create and configure an MCP server with all tools registered
 * @returns McpServerResult with server and service instances
 */
export function createMcpServer(
	options: CreateMcpServerOptions = {},
): McpServerResult {
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
			instructions: SERVER_INSTRUCTIONS,
		},
	);

	// Register all Admin API tools
	registerAllTools(server, service, {
		domains: options.toolDomains ?? parseConfiguredToolDomains(),
	});

	return {
		server,
		service,
	};
}
