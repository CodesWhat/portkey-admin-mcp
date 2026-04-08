import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	AnalyticsGroup,
	PortkeyUser,
	UserInvite,
} from "../services/users.service.js";

const USERS_TOOL_SCHEMAS = {
	listAllUsers: {},
	inviteUser: {
		email: z.string().email().describe("Email address of the user to invite"),
		role: z
			.enum(["admin", "member"])
			.describe(
				"Organization-level role: 'admin' for full access, 'member' for limited access",
			),
		first_name: z.string().optional().describe("User's first name"),
		last_name: z.string().optional().describe("User's last name"),
		workspaces: z
			.array(
				z.object({
					id: z
						.string()
						.describe(
							"Workspace ID/slug where the user will be granted access",
						),
					role: z
						.enum(["admin", "member", "manager"])
						.describe(
							"Workspace-level role: 'admin' for full access, 'manager' for workspace management, 'member' for basic access",
						),
				}),
			)
			.describe(
				"List of workspaces and corresponding roles to grant to the user",
			),
		workspace_api_key_details: z
			.object({
				name: z
					.string()
					.optional()
					.describe("Name of the API key to be created"),
				expiry: z
					.string()
					.optional()
					.describe("Expiration date for the API key (ISO8601 format)"),
				metadata: z
					.record(z.string(), z.string())
					.optional()
					.describe("Additional metadata key-value pairs for the API key"),
				scopes: z
					.array(z.string())
					.describe("List of permission scopes for the API key"),
			})
			.optional()
			.describe("Optional API key to be created for the user"),
	},
	getUserStats: {
		time_of_generation_min: z
			.string()
			.describe(
				"Start time for the analytics period (ISO8601 format, e.g., '2024-01-01T00:00:00Z')",
			),
		time_of_generation_max: z
			.string()
			.describe(
				"End time for the analytics period (ISO8601 format, e.g., '2024-02-01T00:00:00Z')",
			),
		total_units_min: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Minimum number of total tokens to filter by"),
		total_units_max: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Maximum number of total tokens to filter by"),
		cost_min: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Minimum cost in cents to filter by"),
		cost_max: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Maximum cost in cents to filter by"),
		status_code: z
			.string()
			.optional()
			.describe("Filter by specific HTTP status codes (comma-separated)"),
		virtual_keys: z
			.string()
			.optional()
			.describe("Filter by specific virtual key slugs (comma-separated)"),
		page_size: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Number of results per page (for pagination)"),
	},
	getUser: {
		user_id: z.string().describe("The user ID to retrieve"),
	},
	updateUser: {
		user_id: z.string().describe("The user ID to update"),
		first_name: z.string().optional().describe("New first name"),
		last_name: z.string().optional().describe("New last name"),
		role: z
			.enum(["admin", "member"])
			.optional()
			.describe("New organization-level role"),
	},
	deleteUser: {
		user_id: z.string().describe("The user ID to delete"),
	},
	listUserInvites: {},
	getUserInvite: {
		invite_id: z.string().describe("The invite ID to retrieve"),
	},
	deleteUserInvite: {
		invite_id: z.string().describe("The invite ID to delete"),
	},
	resendUserInvite: {
		invite_id: z.string().describe("The invite ID to resend"),
	},
} as const;

function formatFullName(firstName?: string, lastName?: string): string {
	return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function formatUser(user: PortkeyUser): {
	id: string;
	name: string;
	email: string;
	role: string;
	created_at: string;
	last_updated_at: string;
} {
	return {
		id: user.id,
		name: formatFullName(user.first_name, user.last_name),
		email: user.email,
		role: user.role,
		created_at: user.created_at,
		last_updated_at: user.last_updated_at,
	};
}

function formatUserInvite(invite: UserInvite): {
	id: string;
	email: string;
	role: string;
	status: string;
	created_at: string;
	expires_at: string;
} {
	return {
		id: invite.id,
		email: invite.email,
		role: invite.role,
		status: invite.status,
		created_at: invite.created_at,
		expires_at: invite.expires_at,
	};
}

function formatUserAnalyticsGroup(group: AnalyticsGroup): {
	user: string;
	requests: string;
	cost: string;
} {
	return {
		user: group.user,
		requests: group.requests,
		cost: group.cost,
	};
}

export function registerUsersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List all users tool
	server.tool(
		"list_all_users",
		"List all users in your Portkey organization, including their roles and account details",
		USERS_TOOL_SCHEMAS.listAllUsers,
		async () => {
			const users = await service.users.listUsers();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: users.total,
								users: users.data.map(formatUser),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Invite user tool
	server.tool(
		"invite_user",
		"Invite a new user to your Portkey organization with specific workspace access and API key permissions. After the invite is accepted, use add_workspace_member to assign workspace roles.",
		USERS_TOOL_SCHEMAS.inviteUser,
		async (params) => {
			const result = await service.users.inviteUser(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully invited ${params.email} as ${params.role}`,
								invite_id: result.id,
								invite_link: result.invite_link,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// User analytics tool
	server.tool(
		"get_user_stats",
		"Retrieve detailed analytics data about user activity within a specified time range, including request counts and costs",
		USERS_TOOL_SCHEMAS.getUserStats,
		async (params) => {
			const stats = await service.users.getUserGroupedData(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total_users: stats.total,
								users: stats.data.map(formatUserAnalyticsGroup),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Get user tool
	server.tool(
		"get_user",
		"Retrieve detailed information about a specific user by their ID",
		USERS_TOOL_SCHEMAS.getUser,
		async (params) => {
			const user = await service.users.getUser(params.user_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatUser(user), null, 2),
					},
				],
			};
		},
	);

	// Phase 1: Update user tool
	server.tool(
		"update_user",
		"Update a user's profile information including name and organization role",
		USERS_TOOL_SCHEMAS.updateUser,
		async (params) => {
			const { user_id, ...updateData } = params;
			const user = await service.users.updateUser(user_id, updateData);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: "Successfully updated user",
								user: formatUser(user),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Delete user tool
	server.tool(
		"delete_user",
		"Remove a user from your Portkey organization. Permanently removes the user and all their org/workspace memberships. Cannot be undone.",
		USERS_TOOL_SCHEMAS.deleteUser,
		async (params) => {
			await service.users.deleteUser(params.user_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted user ${params.user_id}`,
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

	// Phase 1: List user invites tool
	server.tool(
		"list_user_invites",
		"List all pending and sent user invitations in your Portkey organization",
		USERS_TOOL_SCHEMAS.listUserInvites,
		async () => {
			const invites = await service.users.listUserInvites();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: invites.total,
								invites: invites.data.map(formatUserInvite),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Get user invite tool
	server.tool(
		"get_user_invite",
		"Retrieve details about a specific user invitation",
		USERS_TOOL_SCHEMAS.getUserInvite,
		async (params) => {
			const invite = await service.users.getUserInvite(params.invite_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatUserInvite(invite), null, 2),
					},
				],
			};
		},
	);

	// Phase 1: Delete user invite tool
	server.tool(
		"delete_user_invite",
		"Cancel and delete a pending user invitation",
		USERS_TOOL_SCHEMAS.deleteUserInvite,
		async (params) => {
			await service.users.deleteUserInvite(params.invite_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted invite ${params.invite_id}`,
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

	// Phase 1: Resend user invite tool
	server.tool(
		"resend_user_invite",
		"Resend an invitation email to a pending user",
		USERS_TOOL_SCHEMAS.resendUserInvite,
		async (params) => {
			await service.users.resendUserInvite(params.invite_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully resent invite ${params.invite_id}`,
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
