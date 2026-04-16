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
		"List workspaces with id, name, slug, default settings, and timestamps. Use this to find a workspace_id before get_workspace, update_workspace, add_workspace_member, or remove_workspace_member.",
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
		"Get one workspace by id and return its full details, including defaults and the complete member list. Use this when you need membership detail; use list_workspaces for an overview.",
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
		"Update a workspace's name, slug, description, default flag, or metadata by id, unlike update_workspace_member which changes role assignments within a workspace. Only provided fields change and updates take effect immediately; changing the slug can break URLs, API key references, and other external links, so confirm no dependencies first.",
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
		"Delete a workspace by id. This is permanent and removes the workspace, its members, configs, API keys, and resources.",
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
		"Add an existing org user to a workspace with a role. Requires a UUID user_id; use list_all_users to find it, and invite_user first if the person is not yet in the org.",
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
		"List every member in a workspace with organization role, workspace role, status, and timestamps. Use this to find a user_id before get_workspace_member, update_workspace_member, or remove_workspace_member.",
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
		"Get one workspace member by workspace_id and user_id. Use this when you already know both IDs; use list_workspace_members to browse the full roster.",
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
		"Remove a user from a workspace and revoke workspace access. This does not delete the user from the organization; use delete_user for full removal.",
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
