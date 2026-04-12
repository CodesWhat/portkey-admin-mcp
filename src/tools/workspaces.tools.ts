import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	SingleWorkspaceResponse,
	Workspace,
	WorkspaceDefaults,
	WorkspaceUser,
} from "../services/workspaces.service.js";

const WORKSPACES_TOOL_SCHEMAS = {
	listWorkspaces: {
		page_size: z.coerce
			.number()
			.positive()
			.optional()
			.describe(
				"Number of workspaces to return per page (default varies by endpoint)",
			),
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number to retrieve when results are paginated"),
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
	},
	getWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z.string().describe("The user ID to retrieve"),
	},
	updateWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z.string().describe("The user ID to update"),
		role: z
			.enum(["admin", "member", "manager"])
			.describe("New role in the workspace"),
	},
	removeWorkspaceMember: {
		workspace_id: z.string().describe("The workspace ID"),
		user_id: z.string().describe("The user ID to remove"),
	},
} as const;

function formatFullName(firstName?: string, lastName?: string): string {
	return [firstName, lastName].filter(Boolean).join(" ").trim();
}

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
	// List workspaces tool
	server.tool(
		"list_workspaces",
		"Retrieve a paginated list of all workspaces in your Portkey organization. Returns id, name, slug, and configuration for each workspace. Use this tool first to discover workspace_id values needed by other workspace-scoped operations.",
		WORKSPACES_TOOL_SCHEMAS.listWorkspaces,
		async (params) => {
			const workspaces = await service.workspaces.listWorkspaces(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: workspaces.total,
								workspaces: workspaces.data.map(formatWorkspaceSummary),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get single workspace tool
	server.tool(
		"get_workspace",
		"Retrieve full details for a single workspace by ID, including its configuration, metadata, and complete member list with roles. Unlike list_workspaces, this includes the full user roster — use it when you need member details or workspace membership counts.",
		WORKSPACES_TOOL_SCHEMAS.getWorkspace,
		async (params) => {
			const workspace = await service.workspaces.getWorkspace(
				params.workspace_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatWorkspaceDetail(workspace), null, 2),
					},
				],
			};
		},
	);

	// Phase 1: Create workspace tool
	server.tool(
		"create_workspace",
		"Create a new workspace to isolate resources, API keys, and team members within your Portkey organization. A URL-friendly slug is auto-generated from the name if not provided. Returns the created workspace's id, name, and slug.",
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
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created workspace "${params.name}"`,
								workspace: formatWorkspaceSummary(workspace),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Update workspace tool
	server.tool(
		"update_workspace",
		"Update a workspace's name, slug, description, default status, or metadata. Only provided fields are changed; omitted fields remain unchanged. Warning: changing a workspace's slug may break existing references and URLs that depend on it.",
		WORKSPACES_TOOL_SCHEMAS.updateWorkspace,
		async (params) => {
			const { workspace_id, is_default, metadata, ...rest } = params;
			// Build defaults object with only defined fields
			const defaults: Record<string, unknown> = {};
			if (is_default !== undefined) defaults.is_default = is_default;
			if (metadata !== undefined) defaults.metadata = metadata;

			const workspace = await service.workspaces.updateWorkspace(workspace_id, {
				...rest,
				...(Object.keys(defaults).length > 0 ? { defaults } : {}),
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: "Successfully updated workspace",
								workspace: formatWorkspaceSummary(workspace),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Delete workspace tool
	server.tool(
		"delete_workspace",
		"Delete a workspace from your organization. Permanently deletes the workspace and all its members, configs, API keys, and resources. Cannot be undone.",
		WORKSPACES_TOOL_SCHEMAS.deleteWorkspace,
		async (params) => {
			await service.workspaces.deleteWorkspace(params.workspace_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted workspace ${params.workspace_id}`,
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

	// Phase 1: Add workspace member tool
	server.tool(
		"add_workspace_member",
		"Add an existing organization user to a workspace with a specified role (admin, manager, or member). Requires user_id as a UUID — use list_all_users to find it. For users not yet in the organization, use invite_user first.",
		WORKSPACES_TOOL_SCHEMAS.addWorkspaceMember,
		async (params) => {
			const member = await service.workspaces.addWorkspaceMember(
				params.workspace_id,
				{
					user_id: params.user_id,
					role: params.role,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully added user to workspace as ${params.role}`,
								member: formatWorkspaceMember(member),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: List workspace members tool
	server.tool(
		"list_workspace_members",
		"List all members of a workspace, returning each member's user_id, name, organization role, workspace role, and status. Use this to discover user_id values needed for get_workspace_member, update_workspace_member, or remove_workspace_member.",
		WORKSPACES_TOOL_SCHEMAS.listWorkspaceMembers,
		async (params) => {
			const members = await service.workspaces.listWorkspaceMembers(
				params.workspace_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: members.total,
								members: members.data.map(formatWorkspaceMember),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Get workspace member tool
	server.tool(
		"get_workspace_member",
		"Get details about a single workspace member by workspace_id and user_id. Returns the member's name, organization role, workspace role, and status. Unlike list_workspace_members, this fetches a single member directly when you already know both IDs.",
		WORKSPACES_TOOL_SCHEMAS.getWorkspaceMember,
		async (params) => {
			const member = await service.workspaces.getWorkspaceMember(
				params.workspace_id,
				params.user_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatWorkspaceMember(member), null, 2),
					},
				],
			};
		},
	);

	// Phase 1: Update workspace member tool
	server.tool(
		"update_workspace_member",
		"Update a workspace member's role. Only the role can be changed — valid values are admin, manager, or member. Use list_workspace_members or get_workspace_member to check the current role first.",
		WORKSPACES_TOOL_SCHEMAS.updateWorkspaceMember,
		async (params) => {
			const member = await service.workspaces.updateWorkspaceMember(
				params.workspace_id,
				params.user_id,
				{
					role: params.role,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated member role to ${params.role}`,
								member: formatWorkspaceMember(member),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Remove workspace member tool
	server.tool(
		"remove_workspace_member",
		"Remove a user from a workspace, revoking their workspace-level access. This does not delete the user from the organization — use delete_user for full org removal. The user can be re-added later with add_workspace_member.",
		WORKSPACES_TOOL_SCHEMAS.removeWorkspaceMember,
		async (params) => {
			await service.workspaces.removeWorkspaceMember(
				params.workspace_id,
				params.user_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully removed user from workspace`,
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
