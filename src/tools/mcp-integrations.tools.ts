import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	McpIntegration,
	McpIntegrationMetadata,
	McpIntegrationWorkspace,
} from "../services/mcp-integrations.service.js";

const MCP_INTEGRATIONS_TOOL_SCHEMAS = {
	listMcpIntegrations: {
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
	createMcpIntegration: {
		name: z.string().describe("Display name for the MCP integration"),
		url: z.string().describe("URL endpoint of the MCP server to integrate"),
		auth_type: z
			.enum(["oauth_auto", "headers", "none"])
			.describe(
				"Authentication type: 'none', 'headers' (custom headers), or 'oauth_auto' (OAuth)",
			),
		transport: z
			.enum(["http", "sse"])
			.describe(
				"MCP transport protocol: 'http' (streamable HTTP) or 'sse' (server-sent events)",
			),
		slug: z
			.string()
			.optional()
			.describe("Custom slug. Auto-generated if omitted"),
		description: z
			.string()
			.optional()
			.describe("Description of the MCP integration"),
		custom_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'Custom headers for authentication (e.g. { "Authorization": "Bearer xxx" }). Sent via configurations.custom_headers',
			),
		workspace_id: z
			.string()
			.optional()
			.describe(
				"Workspace ID — required when using organization admin API keys",
			),
	},
	getMcpIntegration: {
		id: z.string().describe("The MCP integration ID or slug to retrieve"),
	},
	updateMcpIntegration: {
		id: z.string().describe("The MCP integration ID or slug to update"),
		name: z.string().optional().describe("New display name"),
		description: z.string().optional().describe("New description"),
		url: z.string().optional().describe("New URL endpoint"),
		auth_type: z
			.enum(["oauth_auto", "headers", "none"])
			.optional()
			.describe("New authentication type"),
		transport: z
			.enum(["http", "sse"])
			.optional()
			.describe("New transport protocol"),
		custom_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"New custom headers for authentication. Sent via configurations.custom_headers",
			),
	},
	deleteMcpIntegration: {
		id: z.string().describe("The MCP integration ID or slug to delete"),
	},
	getMcpIntegrationMetadata: {
		id: z.string().describe("The MCP integration ID or slug"),
	},
	listMcpIntegrationCapabilities: {
		id: z.string().describe("The MCP integration ID or slug"),
	},
	updateMcpIntegrationCapabilities: {
		id: z.string().describe("The MCP integration ID or slug"),
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
	listMcpIntegrationWorkspaces: {
		id: z.string().describe("The MCP integration ID or slug"),
	},
	updateMcpIntegrationWorkspaces: {
		id: z.string().describe("The MCP integration ID or slug"),
		workspaces: z
			.array(
				z.object({
					id: z.string().describe("Workspace ID"),
					enabled: z.boolean().describe("Whether workspace has access"),
				}),
			)
			.min(1)
			.describe("Array of workspace access updates"),
	},
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getCustomHeaderNames(
	configurations?: Record<string, unknown>,
): string[] | undefined {
	const customHeaders = configurations?.custom_headers;
	return isRecord(customHeaders) ? Object.keys(customHeaders) : undefined;
}

function formatMcpIntegration(integration: McpIntegration): {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	owner_id: string;
	workspace_id?: string;
	status: "active" | "archived";
	url: string;
	auth_type: string;
	transport: string;
	type?: "workspace" | "organisation";
	global_workspace_access?: unknown;
	configuration_keys?: string[];
	custom_header_names?: string[];
	created_at: string;
	last_updated_at: string | null;
} {
	return {
		id: integration.id,
		name: integration.name,
		slug: integration.slug,
		description: integration.description,
		owner_id: integration.owner_id,
		workspace_id: integration.workspace_id,
		status: integration.status,
		url: integration.url,
		auth_type: integration.auth_type,
		transport: integration.transport,
		type: integration.type,
		global_workspace_access: integration.global_workspace_access,
		configuration_keys: integration.configurations
			? Object.keys(integration.configurations)
			: undefined,
		custom_header_names: getCustomHeaderNames(integration.configurations),
		created_at: integration.created_at,
		last_updated_at: integration.last_updated_at,
	};
}

function formatMcpIntegrationMetadata(metadata: McpIntegrationMetadata): {
	server_name: string | null;
	server_version: string | null;
	title: string | null;
	description: string | null;
	website_url: string | null;
	protocol_version: string | null;
	icon_count: number;
	capability_flags: unknown;
	instructions: string | null;
	sync_status: "pending" | "synced" | "error";
	last_synced_at: string | null;
	sync_error: string | null;
} {
	return {
		server_name: metadata.server_name,
		server_version: metadata.server_version,
		title: metadata.title,
		description: metadata.description,
		website_url: metadata.website_url,
		protocol_version: metadata.protocol_version,
		icon_count: Array.isArray(metadata.icons) ? metadata.icons.length : 0,
		capability_flags: metadata.capability_flags,
		instructions: metadata.instructions,
		sync_status: metadata.sync_status,
		last_synced_at: metadata.last_synced_at,
		sync_error: metadata.sync_error,
	};
}

function formatMcpIntegrationWorkspace(
	workspace: McpIntegrationWorkspace,
): McpIntegrationWorkspace {
	return {
		id: workspace.id,
		enabled: workspace.enabled,
		status: workspace.status,
		created_at: workspace.created_at,
		last_updated_at: workspace.last_updated_at,
	};
}

export function registerMcpIntegrationsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_mcp_integrations",
		"List all MCP integrations in your Portkey organization with optional pagination and workspace filtering. MCP integrations connect external MCP servers to your Portkey org. Use to discover integration IDs needed by other tools. Differs from list_mcp_servers which shows server instances under an integration. Returns paginated array of integrations with total count and has_more flag.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.listMcpIntegrations,
		async (params) => {
			const result = await service.mcpIntegrations.listMcpIntegrations(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								has_more: result.has_more,
								integrations: result.data.map(formatMcpIntegration),
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
		"create_mcp_integration",
		"Create a new MCP integration by registering an external MCP server URL with auth configuration. After creation, use create_mcp_server to add server instances and update_mcp_integration_capabilities to control which tools are exposed. Returns the new integration's id and slug.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.createMcpIntegration,
		async (params) => {
			if (
				params.auth_type === "headers" &&
				(!params.custom_headers ||
					Object.keys(params.custom_headers).length === 0)
			) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: custom_headers must be provided when auth_type is 'headers'",
						},
					],
					isError: true,
				};
			}
			const { custom_headers, ...rest } = params;
			const result = await service.mcpIntegrations.createMcpIntegration({
				...rest,
				...(custom_headers ? { configurations: { custom_headers } } : {}),
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created MCP integration "${params.name}"`,
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
		"get_mcp_integration",
		"Retrieve detailed information about a specific MCP integration by ID or slug. Returns full integration config including auth type, transport, and configuration keys (header values are masked). Use to inspect Portkey-side connection details. Differs from get_mcp_integration_metadata which returns the external server's self-reported info.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.getMcpIntegration,
		async (params) => {
			const integration = await service.mcpIntegrations.getMcpIntegration(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatMcpIntegration(integration), null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_mcp_integration",
		"Update an existing MCP integration's name, description, URL, auth, or transport. Changing url or auth_type may break active connections. Changes take effect immediately for all connected users.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegration,
		async (params) => {
			const { id, custom_headers, ...rest } = params;
			await service.mcpIntegrations.updateMcpIntegration(id, {
				...rest,
				...(custom_headers ? { configurations: { custom_headers } } : {}),
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated MCP integration "${id}"`,
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
		"delete_mcp_integration",
		"Delete an MCP integration permanently. Also removes all MCP servers under this integration. Connected users will lose access immediately. This action cannot be undone.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.deleteMcpIntegration,
		async (params) => {
			await service.mcpIntegrations.deleteMcpIntegration(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted MCP integration "${params.id}"`,
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
		"get_mcp_integration_metadata",
		"Retrieve server-reported metadata for an MCP integration including name, version, protocol, and sync status. Use to verify the external server is responding and check its capabilities. Differs from get_mcp_integration which shows Portkey-side config.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.getMcpIntegrationMetadata,
		async (params) => {
			const metadata = await service.mcpIntegrations.getMcpIntegrationMetadata(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatMcpIntegrationMetadata(metadata),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"list_mcp_integration_capabilities",
		"List all capabilities (tools, resources, prompts) the external MCP server exposes on an integration. Use before update_mcp_integration_capabilities to see what can be enabled or disabled. Returns total count and array of capabilities with their enabled status.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.listMcpIntegrationCapabilities,
		async (params) => {
			const result =
				await service.mcpIntegrations.listMcpIntegrationCapabilities(params.id);
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
		"update_mcp_integration_capabilities",
		"Bulk enable or disable capabilities on an MCP integration to control which MCP tools, resources, and prompts are available to users. Disabled capabilities are hidden from connected clients. Changes take effect immediately.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegrationCapabilities,
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationCapabilities(
				params.id,
				{
					capabilities: params.capabilities,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated capabilities for MCP integration "${params.id}"`,
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
		"list_mcp_integration_workspaces",
		"List which workspaces have access to an MCP integration. Returns global access setting and per-workspace enabled status. Use to audit access before modifying permissions with update_mcp_integration_workspaces.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.listMcpIntegrationWorkspaces,
		async (params) => {
			const result = await service.mcpIntegrations.listMcpIntegrationWorkspaces(
				params.id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								global_workspace_access: result.global_workspace_access,
								workspace_count: result.workspaces.length,
								workspaces: result.workspaces.map(
									formatMcpIntegrationWorkspace,
								),
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
		"update_mcp_integration_workspaces",
		"Grant or revoke workspace access to an MCP integration in bulk. Changes affect all users in the workspace immediately. Use list_mcp_integration_workspaces first to see current access state.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegrationWorkspaces,
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationWorkspaces(params.id, {
				workspaces: params.workspaces,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated workspace access for MCP integration "${params.id}"`,
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
