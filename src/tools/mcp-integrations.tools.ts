import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	McpIntegration,
	McpIntegrationMetadata,
	McpIntegrationWorkspace,
} from "../services/mcp-integrations.service.js";
import {
	createSecretMappingSchema,
	uniqueSecretMappingsSchema,
} from "./secret-mapping.schemas.js";
import { jsonResult } from "./utils.js";

const mcpSecretMappingSchema = createSecretMappingSchema({
	allowKeyTarget: false,
	targetFieldDescription:
		"Configuration field resolved at runtime, such as configurations.oauth_metadata",
	secretReferenceDescription:
		"Secret Reference UUID or slug accessible to this integration",
	valueFormatDescription:
		"Use json when the target configuration field expects a structured object",
});

const mcpSecretMappingsSchema = uniqueSecretMappingsSchema(
	mcpSecretMappingSchema,
);

const MCP_INTEGRATIONS_TOOL_SCHEMAS = {
	listMcpIntegrations: {
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(1000)
			.optional()
			.describe("Number of results per page (max 100)"),
		workspace_id: z.string().optional().describe("Filter by workspace ID"),
		organisation_id: z
			.string()
			.optional()
			.describe("Filter by organisation UUID"),
		type: z
			.enum(["workspace", "organisation", "all"])
			.optional()
			.describe(
				"Filter by workspace, organisation, or all integration ownership",
			),
		search: z.string().optional().describe("Search integrations by name"),
	},
	createMcpIntegration: {
		name: z.string().describe("Display name for the MCP integration"),
		url: z.string().describe("URL endpoint of the MCP server to integrate"),
		auth_type: z
			.string()
			.min(1)
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
		configurations: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Additional documented or forward-compatible configuration fields",
			),
		workspace_id: z
			.string()
			.optional()
			.describe(
				"Workspace ID — required when using organization admin API keys",
			),
		secret_mappings: mcpSecretMappingsSchema
			.optional()
			.describe(
				"Runtime Secret Reference mappings; every configurations.<field> target must be unique",
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
		auth_type: z.string().min(1).optional().describe("New authentication type"),
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
		configurations: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Replacement documented or forward-compatible configuration fields",
			),
		secret_mappings: mcpSecretMappingsSchema
			.optional()
			.describe(
				"Replacement runtime Secret Reference mappings; each target_field must be unique",
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

const createMcpIntegrationSchema = z
	.object(MCP_INTEGRATIONS_TOOL_SCHEMAS.createMcpIntegration)
	.superRefine((value, ctx) => {
		if (
			value.auth_type === "headers" &&
			(!value.custom_headers ||
				Object.keys(value.custom_headers).length === 0) &&
			!value.secret_mappings?.some(
				(mapping) => mapping.target_field === "configurations.custom_headers",
			)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["custom_headers"],
				message: "custom_headers must be provided when auth_type is 'headers'",
			});
		}
	});

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
	secret_mappings?: Array<{
		target_field: string;
		secret_reference_id: string;
		secret_key?: string | null;
		value_format?: "json" | "string" | null;
	}>;
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
		secret_mappings: integration.secret_mappings,
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
			return jsonResult({
				total: result.total,
				has_more: result.has_more,
				integrations: result.data.map(formatMcpIntegration),
			});
		},
	);

	server.tool(
		"create_mcp_integration",
		"Create a Portkey integration for an external MCP server URL. For headers auth, provide custom_headers or a Secret Reference mapping targeting configurations.custom_headers; secret_mappings resolve protected values at runtime without storing them in the tool call. Organisation admin keys normally need workspace_id. After creation, create_mcp_server and configure capabilities/access; returns the integration id and slug.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.createMcpIntegration,
		{
			title: "Create MCP Integration",
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		async (rawParams) => {
			const params = createMcpIntegrationSchema.parse(rawParams);
			const { custom_headers, configurations, ...rest } = params;
			const result = await service.mcpIntegrations.createMcpIntegration({
				...rest,
				...(configurations !== undefined || custom_headers !== undefined
					? {
							configurations: {
								...configurations,
								...(custom_headers !== undefined ? { custom_headers } : {}),
							},
						}
					: {}),
			});
			return jsonResult({
				message: `Successfully created MCP integration "${params.name}"`,
				id: result.id,
				slug: result.slug,
			});
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
			return jsonResult(formatMcpIntegration(integration));
		},
	);

	server.tool(
		"update_mcp_integration",
		"Update an MCP integration's name, description, URL, auth, transport, headers, or runtime Secret Reference mappings. Only supplied fields change; URL, auth, header, and secret changes apply immediately and can break active clients, so inspect get_mcp_integration first. Use update_mcp_server when changing only a Portkey server instance's display metadata.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegration,
		{
			title: "Update MCP Integration",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) => {
			const { id, custom_headers, configurations, ...rest } = params;
			await service.mcpIntegrations.updateMcpIntegration(id, {
				...rest,
				...(configurations !== undefined || custom_headers !== undefined
					? {
							configurations: {
								...configurations,
								...(custom_headers !== undefined ? { custom_headers } : {}),
							},
						}
					: {}),
			});
			return jsonResult({
				message: `Successfully updated MCP integration "${id}"`,
				success: true,
			});
		},
	);

	server.tool(
		"delete_mcp_integration",
		"Delete an MCP integration and all servers beneath it. This is irreversible, removes connected access immediately, and should only be used after confirming nothing depends on the integration.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.deleteMcpIntegration,
		async (params) => {
			await service.mcpIntegrations.deleteMcpIntegration(params.id);
			return jsonResult({
				message: `Successfully deleted MCP integration "${params.id}"`,
				success: true,
			});
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
			return jsonResult(formatMcpIntegrationMetadata(metadata));
		},
	);

	server.tool(
		"list_mcp_integration_capabilities",
		"List capabilities exposed by the external MCP server for an integration. Returns total plus enabled-state entries so you can decide what to toggle; use before update_mcp_integration_capabilities when you need to compare the current surface.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.listMcpIntegrationCapabilities,
		async (params) => {
			const result =
				await service.mcpIntegrations.listMcpIntegrationCapabilities(params.id);
			return jsonResult({
				total: result.total,
				capabilities: result.data,
			});
		},
	);

	server.tool(
		"update_mcp_integration_capabilities",
		"Bulk enable or disable capabilities (tools, prompts, resources) on an MCP integration. A reversible toggle, not a deletion: only the capabilities named in the array change state, the change hides or exposes them immediately for connected users, and re-running with enabled flipped restores them. Source the integration id from list_mcp_integrations and current capability names, types, and states from list_mcp_integration_capabilities. Returns a success confirmation message.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegrationCapabilities,
		{
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationCapabilities(
				params.id,
				{
					capabilities: params.capabilities,
				},
			);
			return jsonResult({
				message: `Successfully updated capabilities for MCP integration "${params.id}"`,
				success: true,
			});
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
			return jsonResult({
				global_workspace_access: result.global_workspace_access,
				workspace_count: result.workspaces.length,
				workspaces: result.workspaces.map(formatMcpIntegrationWorkspace),
			});
		},
	);

	server.tool(
		"update_mcp_integration_workspaces",
		"Grant or revoke workspace access to an MCP integration in bulk. Reversible: only the workspaces listed change, access applies or is removed immediately for all users in those workspaces, and re-running with enabled flipped undoes a change. Source the integration id from list_mcp_integrations, workspace ids from list_workspaces, and the current access state from list_mcp_integration_workspaces. Returns a success confirmation message.",
		MCP_INTEGRATIONS_TOOL_SCHEMAS.updateMcpIntegrationWorkspaces,
		{
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		async (params) => {
			await service.mcpIntegrations.updateMcpIntegrationWorkspaces(params.id, {
				workspaces: params.workspaces,
			});
			return jsonResult({
				message: `Successfully updated workspace access for MCP integration "${params.id}"`,
				success: true,
			});
		},
	);
}
