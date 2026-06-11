import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	AnalyticsGroup,
	PortkeyUser,
	UserInvite,
} from "../services/users.service.js";
import { formatFullName } from "./utils.js";

const USERS_TOOL_SCHEMAS = {
	listAllUsers: {
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
	listUserInvites: {
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
		"List accepted org users with id, name, email, role, and timestamps. Use this to find a user_id before get_user, update_user, delete_user, or add_workspace_member; use list_user_invites for pending invitations.",
		USERS_TOOL_SCHEMAS.listAllUsers,
		async (params) => {
			const users = await service.users.listUsers({
				current_page: params.current_page,
				page_size: params.page_size,
			});
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
		"Invite a new org user and optionally provision workspace access and an API key in one call. Workspace assignments apply only after acceptance; use add_workspace_member or update_workspace_member later for follow-up changes.",
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
		"Return per-user request and cost analytics for a required time range. This is usage-by-user, not population metrics; use get_users_analytics for active-user or cohort trends.",
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
		"Get one accepted user by id and return their profile, role, and timestamps. Use list_all_users to find the id if you only have a name or email, and get_user_invite for pending invitations.",
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
		"Update a user's first name, last name, or organization role by id. Email and workspace roles are not editable here; use update_workspace_member for workspace membership changes.",
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
		"Delete a user from the org by id. This is permanent, removes org and workspace memberships, revokes API keys, and ends active sessions; use delete_user_invite for pending invites instead.",
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
		"List pending and sent invitations with id, email, role, status, and expiry. Use this to check invite state; use list_all_users for users who already accepted.",
		USERS_TOOL_SCHEMAS.listUserInvites,
		async (params) => {
			const invites = await service.users.listUserInvites({
				current_page: params.current_page,
				page_size: params.page_size,
			});
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
		"Get one invitation by invite id and return its email, role, status, and expiry. Use this for pending invites only; use get_user for accepted users.",
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
		"Delete a pending invite and revoke its invite link. This does not affect existing users; use delete_user for full user removal.",
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
		"Resend the email for a pending invite that has not been accepted, unlike invite_user which creates a new invite. This sends a fresh email without modifying the invite record, expiry, or role; use get_user_invite first if you are unsure whether the invite still exists and list_user_invites to discover invite_ids.",
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
