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
		"List all users in your Portkey organization. Returns each user's ID, name, email, role, and timestamps. Use this for browsing or auditing the full member list; use get_user to fetch a single user by ID.",
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
		"Retrieve per-user request count and cost analytics for a required time range (time_of_generation_min/max). Unlike get_users_analytics which tracks active/new user counts over time, this returns usage-based stats grouped by user. Supports filtering by cost, tokens, status codes, and virtual keys.",
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
		"Retrieve a single user's profile by their ID. Returns ID, name, email, role, and timestamps. Use this when you already have a user ID; use list_all_users to browse or search all organization members.",
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
		"Update a user's first name, last name, or organization role (admin/member). Cannot change the user's email address or workspace-level roles; use update_workspace_member for workspace roles.",
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
		"Remove a user from your Portkey organization by ID. This action cannot be undone. Permanently removes org and workspace memberships and revokes the user's API keys; active sessions will fail immediately. Use delete_user_invite for pending invitations instead.",
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
		"List all pending and sent user invitations in your Portkey organization. Returns each invite's ID, email, role, status, and expiry. Use this to check invitation status; use list_all_users for users who have already accepted.",
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
		"Retrieve a specific invitation by its invite ID. Returns the invite's email, role, status, creation date, and expiry. This looks up a pending invitation, not an existing user; use get_user for accepted members.",
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
		"Cancel and permanently delete a pending user invitation. This revokes the invite link so it can no longer be accepted. Does not remove existing users; use delete_user for that.",
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
		"Resend the invitation email for a pending invite that has not yet been accepted. Use when the original email was lost or expired. The invite must still exist; check with get_user_invite first if unsure.",
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
