import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	CreateScimWorkspaceMappingRequest,
	SingleWorkspaceResponse,
	Workspace,
	WorkspaceDefaults,
	WorkspaceUser,
} from "../services/workspaces.service.js";
import { formatFullName, jsonResult } from "./utils.js";

const scimWorkspaceMappingBaseShape = {
	workspace_id: z
		.string()
		.describe("Portkey workspace ID that the SCIM group should access"),
	role: z
		.enum(["admin", "member", "manager"])
		.describe("Workspace role automatically granted to group members"),
};

const createScimWorkspaceMappingShape = {
	...scimWorkspaceMappingBaseShape,
	scim_group_id: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Existing identity-provider SCIM group ID; provide this or scim_group_name, but not both",
		),
	scim_group_name: z
		.string()
		.min(1)
		.optional()
		.describe(
			"Existing SCIM group display name; provide this or scim_group_id, but not both",
		),
};

const workspaceUsageLimitSchema = z.object({
	credit_limit: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Maximum cost or token usage for the workspace"),
	type: z
		.enum(["cost", "tokens"])
		.optional()
		.describe("Whether the limit measures cost or tokens"),
	alert_threshold: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Percentage of the limit that triggers an alert"),
	periodic_reset: z
		.enum(["monthly", "weekly"])
		.nullable()
		.optional()
		.describe("Built-in weekly or monthly reset cadence"),
	periodic_reset_days: z.coerce
		.number()
		.int()
		.min(1)
		.max(365)
		.nullable()
		.optional()
		.describe("Custom reset cadence in days, from 1 through 365"),
	next_usage_reset_at: z.iso
		.datetime({ offset: true })
		.nullable()
		.optional()
		.describe("Next reset timestamp in ISO 8601 format"),
});

const workspaceRateLimitSchema = z.object({
	type: z
		.enum(["requests", "tokens"])
		.optional()
		.describe("Whether the limit counts requests or tokens"),
	unit: z
		.enum(["rpd", "rph", "rpm"])
		.optional()
		.describe("Rate window: requests per day, hour, or minute"),
	value: z.coerce
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Maximum count in the selected rate window"),
});

// Registered as the raw shape so the cross-field rule runs inside the handler,
// where wrapToolCallback can turn the ZodError into the same message shape every
// other tool returns. Registering the refined schema instead hands validation to
// the SDK, which answers with an unenveloped "MCP error -32602" string.
const createScimWorkspaceMappingSchema = z
	.object(createScimWorkspaceMappingShape)
	.superRefine((input, context) => {
		if (Boolean(input.scim_group_id) === Boolean(input.scim_group_name)) {
			context.addIssue({
				code: "custom",
				path: ["scim_group_id"],
				message: "Provide exactly one of scim_group_id or scim_group_name",
			});
		}
	});

const WORKSPACES_TOOL_SCHEMAS = {
	listWorkspaces: {
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of workspaces to return per page (max 100)"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Page number to retrieve when results are paginated"),
		name: z.string().optional().describe("Case-sensitive name filter"),
		exact_name: z.string().optional().describe("Exact workspace name filter"),
		status: z
			.enum(["active", "archived"])
			.optional()
			.describe("Filter by workspace lifecycle status"),
	},
	getWorkspace: {
		workspace_id: z
			.string()
			.describe(
				"The unique identifier of the workspace to retrieve. " +
					"This can be found in the workspace's URL or from the list_workspaces tool response",
			),
	},
	createWorkspace: {
		name: z.string().describe("Name of the workspace"),
		slug: z
			.string()
			.optional()
			.describe("URL-friendly slug (auto-generated if not provided)"),
		description: z.string().optional().describe("Description of the workspace"),
		is_default: z.coerce
			.number()
			.optional()
			.describe("Set as default workspace (1 = yes, 0 = no)"),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("Custom metadata key-value pairs"),
		users: z.array(z.string()).optional().describe("Existing user IDs to add"),
		usage_limits: z
			.array(workspaceUsageLimitSchema)
			.optional()
			.describe("Initial workspace usage-limit settings"),
		rate_limits: z
			.array(workspaceRateLimitSchema)
			.optional()
			.describe("Initial workspace rate-limit settings"),
	},
	updateWorkspace: {
		workspace_id: z.string().describe("The workspace ID to update"),
		name: z.string().optional().describe("New name for the workspace"),
		slug: z.string().optional().describe("New slug for the workspace"),
		description: z.string().optional().describe("New description"),
		is_default: z.coerce
			.number()
			.optional()
			.describe("Set as default workspace (1 = yes, 0 = no)"),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("New metadata key-value pairs"),
		input_guardrails: z
			.array(z.string())
			.optional()
			.describe("Guardrail IDs applied to workspace model inputs"),
		output_guardrails: z
			.array(z.string())
			.optional()
			.describe("Guardrail IDs applied to workspace model outputs"),
		user_api_key_config: z
			.string()
			.nullable()
			.optional()
			.describe(
				"Default config slug for workspace-user API keys, or null to clear",
			),
		usage_limits: z
			.array(workspaceUsageLimitSchema)
			.optional()
			.describe("Replacement workspace usage-limit settings"),
		rate_limits: z
			.array(workspaceRateLimitSchema)
			.optional()
			.describe("Replacement workspace rate-limit settings"),
	},
	deleteWorkspace: {
		workspace_id: z.string().describe("The workspace ID to delete"),
	},
	addWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID to add the member to"),
		user_id: z
			.string()
			.uuid(
				"user_id must be a valid UUID (use list_all_users to find user IDs)",
			)
			.describe(
				"The user ID to add (must be a valid UUID from list_all_users, not an email address)",
			),
		role: z
			.enum(["admin", "member", "manager"])
			.describe("Role in the workspace"),
	},
	listWorkspaceMembers: {
		workspace_id: z.string().describe("The workspace ID to list members for"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.optional()
			.describe("Number of members per page"),
		role: z
			.enum(["admin", "manager", "member"])
			.optional()
			.describe("Filter by workspace role"),
		email: z.string().email().optional().describe("Filter by member email"),
	},
	getWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z
			.string()
			.uuid(
				"user_id must be a valid UUID (use list_all_users to find user IDs)",
			)
			.describe(
				"The user ID to retrieve (must be a valid UUID from list_all_users, not an email address)",
			),
	},
	updateWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z
			.string()
			.uuid(
				"user_id must be a valid UUID (use list_all_users to find user IDs)",
			)
			.describe(
				"The user ID to update (must be a valid UUID from list_all_users, not an email address)",
			),
		role: z
			.enum(["admin", "member", "manager"])
			.describe("New role in the workspace"),
	},
	removeWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z
			.string()
			.uuid(
				"user_id must be a valid UUID (use list_all_users to find user IDs)",
			)
			.describe("The user ID to remove"),
	},
	listScimWorkspaceMappings: {
		workspace_id: z
			.string()
			.optional()
			.describe("Return only mappings for this Portkey workspace ID"),
		scim_group_id: z
			.string()
			.optional()
			.describe(
				"Return only mappings for this identity-provider SCIM group ID",
			),
		role: z
			.enum(["admin", "member", "manager"])
			.optional()
			.describe("Return only mappings that grant this workspace role"),
		page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				"Zero-based results page to retrieve; the first page is 0. Unlike current_page used by other list tools in this API (which is 1-based), do not pass 1 for the first page here.",
			),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Mappings per page, from 1 through 100"),
	},
	deleteScimWorkspaceMapping: {
		mapping_id: z
			.string()
			.describe("SCIM workspace mapping ID from list_scim_workspace_mappings"),
	},
	listScimGroups: {
		search: z
			.string()
			.optional()
			.describe("Case-insensitive text to match against SCIM group names"),
		page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe(
				"Zero-based results page to retrieve; the first page is 0. Unlike current_page used by other list tools in this API (which is 1-based), do not pass 1 for the first page here.",
			),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("SCIM groups per page, from 1 through 100"),
	},
} as const;

function formatWorkspaceDefaults(
	defaults: WorkspaceDefaults | null,
): { is_default?: number; metadata?: Record<string, string> } | null {
	if (!defaults) {
		return null;
	}

	return {
		is_default: defaults.is_default,
		metadata: defaults.metadata,
	};
}

function formatWorkspaceSummary(workspace: Workspace): {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	created_at: string;
	last_updated_at: string;
	defaults: { is_default?: number; metadata?: Record<string, string> } | null;
} {
	return {
		id: workspace.id,
		name: workspace.name,
		slug: workspace.slug,
		description: workspace.description,
		created_at: workspace.created_at,
		last_updated_at: workspace.last_updated_at,
		defaults: formatWorkspaceDefaults(workspace.defaults),
	};
}

function formatWorkspaceMember(user: WorkspaceUser): {
	id: string;
	name: string;
	organization_role: string;
	workspace_role: string;
	status: string;
	created_at: string;
	last_updated_at: string;
} {
	return {
		id: user.id,
		name: formatFullName(user.first_name, user.last_name),
		organization_role: user.org_role,
		workspace_role: user.role,
		status: user.status,
		created_at: user.created_at,
		last_updated_at: user.last_updated_at,
	};
}

function formatWorkspaceDetail(workspace: SingleWorkspaceResponse): {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	created_at: string;
	last_updated_at: string;
	defaults: { is_default?: number; metadata?: Record<string, string> } | null;
	users: Array<ReturnType<typeof formatWorkspaceMember>>;
} {
	return {
		id: workspace.id,
		name: workspace.name,
		slug: workspace.slug,
		description: workspace.description,
		created_at: workspace.created_at,
		last_updated_at: workspace.last_updated_at,
		defaults: formatWorkspaceDefaults(workspace.defaults),
		users: workspace.users.map(formatWorkspaceMember),
	};
}

export function registerWorkspacesTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_scim_workspace_mappings",
		"List identity-provider SCIM group mappings that automatically grant Portkey workspace roles. Use it to audit provisioned access or obtain mapping_id before delete_scim_workspace_mapping; filter by workspace, group, or role and page through large directories. This reads mappings only and does not query individual workspace members.",
		WORKSPACES_TOOL_SCHEMAS.listScimWorkspaceMappings,
		{
			title: "List SCIM Workspace Mappings",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(await service.workspaces.listScimWorkspaceMappings(params)),
	);

	server.registerTool(
		"create_scim_workspace_mapping",
		{
			description:
				"Map one identity-provider SCIM group to a Portkey workspace role so current and future group members receive access automatically. Provide exactly one of scim_group_id or scim_group_name; a name can pre-create the Portkey SCIM group before the IdP provisions it. Use list_scim_groups to discover existing groups and list_workspaces for the workspace ID. This changes access provisioning and is distinct from add_workspace_member, which grants one user directly.",
			inputSchema: createScimWorkspaceMappingShape,
			annotations: {
				title: "Create SCIM Workspace Mapping",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: true,
			},
		},
		async (rawParams) => {
			const params = createScimWorkspaceMappingSchema.parse(rawParams);
			let request: CreateScimWorkspaceMappingRequest;
			if (params.scim_group_id !== undefined) {
				request = {
					workspace_id: params.workspace_id,
					role: params.role,
					scim_group_id: params.scim_group_id,
				};
			} else if (params.scim_group_name !== undefined) {
				request = {
					workspace_id: params.workspace_id,
					role: params.role,
					scim_group_name: params.scim_group_name,
				};
			} else {
				throw new Error(
					"Provide exactly one of scim_group_id or scim_group_name",
				);
			}
			const result =
				await service.workspaces.createScimWorkspaceMapping(request);
			return jsonResult(result);
		},
	);

	server.tool(
		"delete_scim_workspace_mapping",
		"Delete a SCIM group-to-workspace mapping by mapping_id and stop future group updates from affecting that workspace. Existing provisioned members remain in the workspace and must be managed separately. Inspect list_scim_workspace_mappings first; this does not delete the identity-provider group or the Portkey workspace.",
		WORKSPACES_TOOL_SCHEMAS.deleteScimWorkspaceMapping,
		{
			title: "Delete SCIM Workspace Mapping",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.workspaces.deleteScimWorkspaceMapping(
				params.mapping_id,
			);
			return jsonResult({
				message: `Deleted SCIM workspace mapping "${params.mapping_id}"`,
				...result,
			});
		},
	);

	server.tool(
		"list_scim_groups",
		"Search and page through identity-provider groups synchronized to Portkey over SCIM. Use this to resolve a group ID or exact display name before create_scim_workspace_mapping; it reads directory groups only and does not show their workspace mappings or individual members.",
		WORKSPACES_TOOL_SCHEMAS.listScimGroups,
		{
			title: "List SCIM Groups",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(await service.workspaces.listScimGroups(params)),
	);

	// List workspaces tool
	server.tool(
		"list_workspaces",
		"List workspaces with id, name, slug, default settings, and timestamps. Use this to find a workspace_id before get_workspace, update_workspace, add_workspace_member, or remove_workspace_member.",
		WORKSPACES_TOOL_SCHEMAS.listWorkspaces,
		async (params) => {
			const workspaces = await service.workspaces.listWorkspaces(params);
			return jsonResult({
				total: workspaces.total,
				workspaces: workspaces.data.map(formatWorkspaceSummary),
			});
		},
	);

	// Get single workspace tool
	server.tool(
		"get_workspace",
		"Get one workspace by id and return its full details, including defaults and the complete member list. Use this when you need membership detail; use list_workspaces for an overview.",
		WORKSPACES_TOOL_SCHEMAS.getWorkspace,
		async (params) => {
			const workspace = await service.workspaces.getWorkspace(
				params.workspace_id,
			);
			return jsonResult(formatWorkspaceDetail(workspace));
		},
	);

	// Phase 1: Create workspace tool
	server.tool(
		"create_workspace",
		"Create a workspace to isolate resources, API keys, and team members. If slug is omitted it is auto-generated from the name; returns the new workspace id, name, and slug.",
		WORKSPACES_TOOL_SCHEMAS.createWorkspace,
		async (params) => {
			const workspace = await service.workspaces.createWorkspace({
				name: params.name,
				slug: params.slug,
				description: params.description,
				defaults:
					params.is_default !== undefined || params.metadata
						? {
								is_default: params.is_default,
								metadata: params.metadata,
							}
						: undefined,
				...(params.users !== undefined ? { users: params.users } : {}),
				...(params.usage_limits !== undefined
					? { usage_limits: params.usage_limits }
					: {}),
				...(params.rate_limits !== undefined
					? { rate_limits: params.rate_limits }
					: {}),
			});
			return jsonResult({
				message: `Successfully created workspace "${params.name}"`,
				workspace: formatWorkspaceSummary(workspace),
			});
		},
	);

	// Phase 1: Update workspace tool
	server.tool(
		"update_workspace",
		"Update a workspace's name, slug, description, default flag, or metadata by id, unlike update_workspace_member which changes role assignments within a workspace. Only provided fields change and updates take effect immediately; changing the slug can break URLs, API key references, and other external links, so confirm no dependencies first.",
		WORKSPACES_TOOL_SCHEMAS.updateWorkspace,
		async (params) => {
			const {
				workspace_id,
				is_default,
				metadata,
				input_guardrails,
				output_guardrails,
				user_api_key_config,
				...rest
			} = params;
			// Build defaults object with only defined fields
			const defaults: Record<string, unknown> = {};
			if (is_default !== undefined) defaults.is_default = is_default;
			if (metadata !== undefined) defaults.metadata = metadata;
			if (input_guardrails !== undefined)
				defaults.input_guardrails = input_guardrails;
			if (output_guardrails !== undefined)
				defaults.output_guardrails = output_guardrails;
			if (user_api_key_config !== undefined)
				defaults.user_api_key_config = user_api_key_config;

			const result = await service.workspaces.updateWorkspace(workspace_id, {
				...rest,
				...(Object.keys(defaults).length > 0 ? { defaults } : {}),
			});
			return jsonResult({
				message: "Successfully updated workspace",
				success: result.success,
				workspace_id,
			});
		},
	);

	// Phase 1: Delete workspace tool
	server.tool(
		"delete_workspace",
		"Delete a workspace by id. This is permanent and removes the workspace, its members, configs, API keys, and resources.",
		WORKSPACES_TOOL_SCHEMAS.deleteWorkspace,
		async (params) => {
			await service.workspaces.deleteWorkspace(params.workspace_id);
			return jsonResult({
				message: `Successfully deleted workspace ${params.workspace_id}`,
				success: true,
			});
		},
	);

	// Phase 1: Add workspace member tool
	server.tool(
		"add_workspace_member",
		"Add an existing org user to a workspace with a role. Requires a UUID user_id; use list_all_users to find it, and invite_user first if the person is not yet in the org.",
		WORKSPACES_TOOL_SCHEMAS.addWorkspaceMember,
		async (params) => {
			const result = await service.workspaces.addWorkspaceMember(
				params.workspace_id,
				{
					user_id: params.user_id,
					role: params.role,
				},
			);
			return jsonResult({
				message: `Successfully added user to workspace as ${params.role}`,
				success: result.success,
				workspace_id: result.workspace_id,
				user_id: result.user_id,
				role: result.role,
			});
		},
	);

	// Phase 1: List workspace members tool
	server.tool(
		"list_workspace_members",
		"List every member in a workspace with organization role, workspace role, status, and timestamps. Use this to find a user_id before get_workspace_member, update_workspace_member, or remove_workspace_member.",
		WORKSPACES_TOOL_SCHEMAS.listWorkspaceMembers,
		async (params) => {
			const { workspace_id, ...filters } = params;
			const members = await service.workspaces.listWorkspaceMembers(
				workspace_id,
				filters,
			);
			return jsonResult({
				total: members.total,
				members: members.data.map(formatWorkspaceMember),
			});
		},
	);

	// Phase 1: Get workspace member tool
	server.tool(
		"get_workspace_member",
		"Get one workspace member by workspace_id and user_id. Use this when you already know both IDs; use list_workspace_members to browse the full roster.",
		WORKSPACES_TOOL_SCHEMAS.getWorkspaceMember,
		async (params) => {
			const member = await service.workspaces.getWorkspaceMember(
				params.workspace_id,
				params.user_id,
			);
			return jsonResult(formatWorkspaceMember(member));
		},
	);

	// Phase 1: Update workspace member tool
	server.tool(
		"update_workspace_member",
		"Update a workspace member's role by workspace_id and user_id. Only the role changes here; use list_workspace_members or get_workspace_member to confirm the current assignment first.",
		WORKSPACES_TOOL_SCHEMAS.updateWorkspaceMember,
		async (params) => {
			const member = await service.workspaces.updateWorkspaceMember(
				params.workspace_id,
				params.user_id,
				{
					role: params.role,
				},
			);
			return jsonResult({
				message: `Successfully updated member role to ${params.role}`,
				member: formatWorkspaceMember(member),
			});
		},
	);

	// Phase 1: Remove workspace member tool
	server.tool(
		"remove_workspace_member",
		"Remove a user from a workspace and revoke workspace access. This does not delete the user from the organization; use delete_user for full removal.",
		WORKSPACES_TOOL_SCHEMAS.removeWorkspaceMember,
		async (params) => {
			await service.workspaces.removeWorkspaceMember(
				params.workspace_id,
				params.user_id,
			);
			return jsonResult({
				message: `Successfully removed user from workspace`,
				success: true,
			});
		},
	);
}
