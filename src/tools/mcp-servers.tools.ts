import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	McpServerUserAccess,
	McpServer as PortkeyMcpServer,
	TestMcpServerResponse,
} from "../services/mcp-servers.service.js";

const MCP_SERVERS_TOOL_SCHEMAS = {
	listMcpServers: {
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
		workspace_id: z.string().optional().describe("Filter by workspace ID"),
	},
	createMcpServer: {
		name: z.string().describe("Display name for the MCP server"),
		mcp_integration_id: z
			.string()
			.describe("ID or slug of the MCP integration this server belongs to"),
		slug: z
			.string()
			.optional()
			.describe("Custom slug. Auto-generated if omitted"),
		description: z
			.string()
			.optional()
			.describe("Description of the MCP server"),
	},
	getMcpServer: {
		id: z.string().describe("The MCP server ID or slug to retrieve"),
	},
	updateMcpServer: {
		id: z.string().describe("The MCP server ID or slug to update"),
		name: z.string().optional().describe("New display name"),
		description: z.string().optional().describe("New description"),
	},
	deleteMcpServer: {
		id: z.string().describe("The MCP server ID or slug to delete"),
	},
	testMcpServer: {
		id: z.string().describe("The MCP server ID or slug to test"),
	},
	listMcpServerCapabilities: {
		id: z.string().describe("The MCP server ID or slug"),
	},
	updateMcpServerCapabilities: {
		id: z.string().describe("The MCP server ID or slug"),
		capabilities: z
			.array(
				z.object({
					name: z.string().describe("Capability name"),
					type: z
						.enum(["tool", "prompt", "resource"])
						.describe("Capability type"),
					enabled: z.boolean().describe("Whether to enable the capability"),
				}),
			)
			.min(1)
			.describe("Array of capability updates"),
	},
	listMcpServerUserAccess: {
		id: z.string().describe("The MCP server ID or slug"),
	},
	updateMcpServerUserAccess: {
		id: z.string().describe("The MCP server ID or slug"),
		users: z
			.array(
				z.object({
					user_id: z.string().describe("User ID"),
					enabled: z.boolean().describe("Whether user has access"),
				}),
			)
			.min(1)
			.describe("Array of user access updates"),
	},
} as const;

function formatFullName(firstName?: string, lastName?: string): string {
	return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatMcpServer(server: PortkeyMcpServer): {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	mcp_integration_id: string;
	status: "active" | "archived";
	created_at: string;
} {
	return {
		id: server.id,
		name: server.name,
		slug: server.slug,
		description: server.description,
		mcp_integration_id: server.mcp_integration_id,
		status: server.status,
		created_at: server.created_at,
	};
}

function formatMcpServerTest(result: TestMcpServerResponse): {
	success: boolean;
	server_name?: string;
	url?: string;
	status_code?: number;
	response_time_ms?: number;
	error?: string;
} {
	return {
		success: result.success,
		server_name: result.server_name,
		url: result.url,
		status_code: result.status_code,
		response_time_ms: result.response_time_ms,
		error: result.error,
	};
}

function formatMcpServerUserAccess(user: McpServerUserAccess): {
	user_id: string;
	name: string;
	enabled: boolean;
	has_override: boolean;
	connection_status: string;
} {
	return {
		user_id: user.user_id,
		name: formatFullName(user.first_name, user.last_name),
		enabled: user.enabled,
		has_override: user.has_override,
		connection_status: user.connection_status,
	};
}

export function registerMcpServersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_mcp_servers",
		"List all MCP servers in your Portkey organization with optional pagination and workspace filtering. MCP servers are instances under MCP integrations. Use to discover server IDs needed by other tools. Differs from list_mcp_integrations which shows the parent integration connections. Returns paginated array of servers with total count.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServers,
		async (params) => {
			const result = await service.mcpServers.listMcpServers(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								servers: result.data.map(formatMcpServer),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"create_mcp_server",
		"Register a new MCP server instance under an existing MCP integration. Use list_mcp_integrations to find the mcp_integration_id first. Returns the new server's id and slug.",
		MCP_SERVERS_TOOL_SCHEMAS.createMcpServer,
		async (params) => {
			const result = await service.mcpServers.createMcpServer(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created MCP server "${params.name}"`,
								id: result.id,
								slug: result.slug,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_mcp_server",
		"Retrieve detailed information about a specific MCP server by ID or slug. Returns server details including linked integration ID and status. Use to check server configuration and health.",
		MCP_SERVERS_TOOL_SCHEMAS.getMcpServer,
		async (params) => {
			const mcpServer = await service.mcpServers.getMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatMcpServer(mcpServer), null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server",
		"Update an existing MCP server's name or description. Only name and description can be changed on a server. To change the URL or auth configuration, update the parent MCP integration instead.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServer,
		async (params) => {
			const { id, ...data } = params;
			await service.mcpServers.updateMcpServer(id, data);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated MCP server "${id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"delete_mcp_server",
		"Delete an MCP server. This action cannot be undone.",
		MCP_SERVERS_TOOL_SCHEMAS.deleteMcpServer,
		async (params) => {
			await service.mcpServers.deleteMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted MCP server "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"test_mcp_server",
		"Send a connectivity check to an MCP server to verify it is reachable and responding. Returns success/failure, response time in ms, and any error message. Use to diagnose connection issues before investigating configuration.",
		MCP_SERVERS_TOOL_SCHEMAS.testMcpServer,
		async (params) => {
			const result = await service.mcpServers.testMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatMcpServerTest(result), null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_server_capabilities",
		"List all capabilities (tools, resources, prompts) exposed by an MCP server instance. Differs from list_mcp_integration_capabilities which shows integration-level capability settings. Returns total count and array of capabilities.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServerCapabilities,
		async (params) => {
			const result = await service.mcpServers.listMcpServerCapabilities(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ total: result.total, capabilities: result.data },
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server_capabilities",
		"Enable or disable specific capabilities on an MCP server instance. Overrides integration-level capability settings for this server. Changes take effect immediately for connected users.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServerCapabilities,
		async (params) => {
			await service.mcpServers.updateMcpServerCapabilities(params.id, {
				capabilities: params.capabilities,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated capabilities for MCP server "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_server_user_access",
		"List per-user access settings for an MCP server including override flags and connection status. Returns default_user_access setting and array of users. Use to audit who can access this server before modifying permissions.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServerUserAccess,
		async (params) => {
			const result = await service.mcpServers.listMcpServerUserAccess(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								default_user_access: result.default_user_access,
								total: result.total,
								users: result.data.map(formatMcpServerUserAccess),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server_user_access",
		"Grant or revoke individual user access to an MCP server. Overrides the default_user_access setting for specified users. Changes take effect immediately.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServerUserAccess,
		async (params) => {
			await service.mcpServers.updateMcpServerUserAccess(params.id, {
				user_access: params.users,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated user access for MCP server "${params.id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}
