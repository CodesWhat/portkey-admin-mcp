import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	McpServerUserAccess,
	McpServer as PortkeyMcpServer,
	TestMcpServerResponse,
} from "../services/mcp-servers.service.js";
import { formatFullName } from "./utils.js";

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
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
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
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
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
		"List MCP servers in the organization. Returns paginated server records plus total for discovering server IDs; use get_mcp_server for one server's details and list_mcp_integrations for the parent integration.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServers,
		async (params) => {
			const result = await service.mcpServers.listMcpServers(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							total: result.total,
							servers: result.data.map(formatMcpServer),
						}),
					},
				],
			};
		},
	);

	server.tool(
		"create_mcp_server",
		"Create an MCP server under an existing integration. Registers the server and returns the new id and slug; use list_mcp_integrations first to find the parent integration, then capabilities or access tools to configure it.",
		MCP_SERVERS_TOOL_SCHEMAS.createMcpServer,
		async (params) => {
			const result = await service.mcpServers.createMcpServer(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: `Successfully created MCP server "${params.name}"`,
							id: result.id,
							slug: result.slug,
						}),
					},
				],
			};
		},
	);

	server.tool(
		"get_mcp_server",
		"Retrieve one MCP server by id or slug. Returns server details including the parent integration, status, and created time; use get_mcp_server when you need the server record rather than the integration config.",
		MCP_SERVERS_TOOL_SCHEMAS.getMcpServer,
		async (params) => {
			const mcpServer = await service.mcpServers.getMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatMcpServer(mcpServer)),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server",
		"Update an MCP server's name or description. Changes apply immediately, but URL and auth live on the parent integration, so use update_mcp_integration for those fields.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServer,
		async (params) => {
			const { id, ...data } = params;
			await service.mcpServers.updateMcpServer(id, data);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: `Successfully updated MCP server "${id}"`,
							success: true,
						}),
					},
				],
			};
		},
	);

	server.tool(
		"delete_mcp_server",
		"Delete an MCP server instance. This is irreversible, removes connected users' access immediately, and should be used only after confirming no workflows depend on the server.",
		MCP_SERVERS_TOOL_SCHEMAS.deleteMcpServer,
		async (params) => {
			await service.mcpServers.deleteMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: `Successfully deleted MCP server "${params.id}"`,
							success: true,
						}),
					},
				],
			};
		},
	);

	server.tool(
		"test_mcp_server",
		"Test connectivity to an MCP server. Sends a live check and returns success, response time, HTTP status, and any error; use this before changing configuration or when diagnosing reachability.",
		MCP_SERVERS_TOOL_SCHEMAS.testMcpServer,
		async (params) => {
			const result = await service.mcpServers.testMcpServer(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatMcpServerTest(result)),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_server_capabilities",
		"List capabilities exposed by an MCP server instance. Returns total plus the current tool, resource, and prompt surface; use this instead of the integration-level capability list when you need server-specific exposure.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServerCapabilities,
		async (params) => {
			const result = await service.mcpServers.listMcpServerCapabilities(
				params.id,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							total: result.total,
							has_more: result.has_more,
							capabilities: result.data,
						}),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server_capabilities",
		"Enable or disable capabilities on an MCP server. Changes take effect immediately and override the integration-level settings for this server; use list_mcp_server_capabilities first to inspect the current surface.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServerCapabilities,
		async (params) => {
			await service.mcpServers.updateMcpServerCapabilities(params.id, {
				capabilities: params.capabilities,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: `Successfully updated capabilities for MCP server "${params.id}"`,
							success: true,
						}),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_server_user_access",
		"List per-user access for an MCP server. Returns the default access mode, override flags, and connection status so you can audit who can use it; use before update_mcp_server_user_access.",
		MCP_SERVERS_TOOL_SCHEMAS.listMcpServerUserAccess,
		async (params) => {
			const result = await service.mcpServers.listMcpServerUserAccess(
				params.id,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							default_user_access: result.default_user_access,
							total: result.total,
							has_more: result.has_more,
							users: result.data.map(formatMcpServerUserAccess),
						}),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_server_user_access",
		"Grant or revoke individual user access to an MCP server. Changes take effect immediately and override the default access setting for the selected users; use list_mcp_server_user_access first if you need the current state.",
		MCP_SERVERS_TOOL_SCHEMAS.updateMcpServerUserAccess,
		async (params) => {
			await service.mcpServers.updateMcpServerUserAccess(params.id, {
				user_access: params.users,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: `Successfully updated user access for MCP server "${params.id}"`,
							success: true,
						}),
					},
				],
			};
		},
	);
}
