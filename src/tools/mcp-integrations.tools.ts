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
		"List MCP integrations in the organization. Returns paginated integration records plus total and has_more for discovering integration IDs; use get_mcp_integration for one integration's full Portkey-side config and list_mcp_servers for the servers under an integration.",
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
		"Create an MCP integration from an external server URL. Registers the Portkey-side connection and returns the new id and slug; if auth_type is headers, custom_headers are required, and you usually follow with create_mcp_server and capability updates.",
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
		"Retrieve one MCP integration by id or slug. Returns the full Portkey-side config, including auth type, transport, and masked configuration keys; use get_mcp_integration_metadata for the server's self-reported metadata.",
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
		"Update an MCP integration's name, description, URL, auth, or transport. Changes apply immediately and altering url or auth_type can break connected clients; use update_mcp_server when you only need to rename or re-describe a server.",
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
		"Delete an MCP integration and all servers beneath it. This is irreversible, removes connected access immediately, and should only be used after confirming nothing depends on the integration.",
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
		"Retrieve the external MCP server's self-reported metadata for an integration. Returns name, version, protocol, capability flags, and sync status; use get_mcp_integration for the Portkey-side connection config.",
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
		"List capabilities exposed by the external MCP server for an integration. Returns total plus enabled-state entries so you can decide what to toggle; use before update_mcp_integration_capabilities when you need to compare the current surface.",
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
		"Bulk enable or disable capabilities on an MCP integration. Changes take effect immediately for connected users and hide or expose the selected tools, resources, and prompts; use list_mcp_integration_capabilities first if you need the current state.",
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
		"List which workspaces can access an MCP integration. Returns the global access mode plus per-workspace enablement for audit or permission review; use before update_mcp_integration_workspaces.",
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
		"Grant or revoke workspace access to an MCP integration in bulk. Changes take effect immediately for all users in the selected workspaces; use list_mcp_integration_workspaces first to review the current access state.",
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
