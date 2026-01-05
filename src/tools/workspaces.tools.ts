import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerWorkspacesTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List workspaces tool
	server.tool(
		"list_workspaces",
		"Retrieve all workspaces in your Portkey organization, including their configurations and metadata",
		{
			page_size: z
				.number()
				.positive()
				.optional()
				.describe(
					"Number of workspaces to return per page (default varies by endpoint)",
				),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number to retrieve when results are paginated"),
		},
		async (params) => {
			try {
				const workspaces = await service.listWorkspaces(params);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(workspaces, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching workspaces: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get single workspace tool
	server.tool(
		"get_workspace",
		"Retrieve detailed information about a specific workspace, including its configuration, metadata, and user access details",
		{
			workspace_id: z
				.string()
				.describe(
					"The unique identifier of the workspace to retrieve. " +
						"This can be found in the workspace's URL or from the list_workspaces tool response",
				),
		},
		async (params) => {
			try {
				const workspace = await service.getWorkspace(params.workspace_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									id: workspace.id,
									name: workspace.name,
									slug: workspace.slug,
									description: workspace.description,
									created_at: workspace.created_at,
									last_updated_at: workspace.last_updated_at,
									defaults: workspace.defaults,
									users: workspace.users.map((user) => ({
										id: user.id,
										name: `${user.first_name} ${user.last_name}`,
										organization_role: user.org_role,
										workspace_role: user.role,
										status: user.status,
										created_at: user.created_at,
										last_updated_at: user.last_updated_at,
									})),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching workspace details: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Create workspace tool
	server.tool(
		"create_workspace",
		"Create a new workspace in your Portkey organization",
		{
			name: z.string().describe("Name of the workspace"),
			slug: z
				.string()
				.optional()
				.describe("URL-friendly slug (auto-generated if not provided)"),
			description: z
				.string()
				.optional()
				.describe("Description of the workspace"),
			is_default: z
				.number()
				.optional()
				.describe("Set as default workspace (1 = yes, 0 = no)"),
			metadata: z
				.record(z.string(), z.string())
				.optional()
				.describe("Custom metadata key-value pairs"),
		},
		async (params) => {
			try {
				const workspace = await service.createWorkspace({
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
									workspace,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error creating workspace: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Update workspace tool
	server.tool(
		"update_workspace",
		"Update an existing workspace's settings and metadata",
		{
			workspace_id: z.string().describe("The workspace ID to update"),
			name: z.string().optional().describe("New name for the workspace"),
			slug: z.string().optional().describe("New slug for the workspace"),
			description: z.string().optional().describe("New description"),
			is_default: z
				.number()
				.optional()
				.describe("Set as default workspace (1 = yes, 0 = no)"),
			metadata: z
				.record(z.string(), z.string())
				.optional()
				.describe("New metadata key-value pairs"),
		},
		async (params) => {
			try {
				const { workspace_id, is_default, metadata, ...rest } = params;
				// Build defaults object with only defined fields
				const defaults: Record<string, unknown> = {};
				if (is_default !== undefined) defaults.is_default = is_default;
				if (metadata !== undefined) defaults.metadata = metadata;

				const workspace = await service.updateWorkspace(workspace_id, {
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
									workspace,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating workspace: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Delete workspace tool
	server.tool(
		"delete_workspace",
		"Delete a workspace from your organization. This action cannot be undone.",
		{
			workspace_id: z.string().describe("The workspace ID to delete"),
		},
		async (params) => {
			try {
				await service.deleteWorkspace(params.workspace_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting workspace: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Add workspace member tool
	server.tool(
		"add_workspace_member",
		"Add a user to a workspace with a specific role",
		{
			workspace_id: z
				.string()
				.describe("The workspace ID to add the member to"),
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
		async (params) => {
			try {
				const member = await service.addWorkspaceMember(params.workspace_id, {
					user_id: params.user_id,
					role: params.role,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully added user to workspace as ${params.role}`,
									member,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error adding member: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: List workspace members tool
	server.tool(
		"list_workspace_members",
		"List all members of a workspace with their roles",
		{
			workspace_id: z.string().describe("The workspace ID to list members for"),
		},
		async (params) => {
			try {
				const members = await service.listWorkspaceMembers(params.workspace_id);
				return {
					content: [{ type: "text", text: JSON.stringify(members, null, 2) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing members: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Get workspace member tool
	server.tool(
		"get_workspace_member",
		"Get details about a specific member of a workspace",
		{
			workspace_id: z.string().describe("The workspace ID"),
			user_id: z.string().describe("The user ID to retrieve"),
		},
		async (params) => {
			try {
				const member = await service.getWorkspaceMember(
					params.workspace_id,
					params.user_id,
				);
				return {
					content: [{ type: "text", text: JSON.stringify(member, null, 2) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching member: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Update workspace member tool
	server.tool(
		"update_workspace_member",
		"Update a member's role in a workspace",
		{
			workspace_id: z.string().describe("The workspace ID"),
			user_id: z.string().describe("The user ID to update"),
			role: z
				.enum(["admin", "member", "manager"])
				.describe("New role in the workspace"),
		},
		async (params) => {
			try {
				const member = await service.updateWorkspaceMember(
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
									member,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating member: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Remove workspace member tool
	server.tool(
		"remove_workspace_member",
		"Remove a user from a workspace",
		{
			workspace_id: z.string().describe("The workspace ID"),
			user_id: z.string().describe("The user ID to remove"),
		},
		async (params) => {
			try {
				await service.removeWorkspaceMember(
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error removing member: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
