import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerUsersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List all users tool
	server.tool(
		"list_all_users",
		"List all users in your Portkey organization, including their roles and account details",
		{},
		async () => {
			const users = await service.listUsers();
			return {
				content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
			};
		},
	);

	// Invite user tool
	server.tool(
		"invite_user",
		"Invite a new user to your Portkey organization with specific workspace access and API key permissions",
		{
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
		async (params) => {
			try {
				const result = await service.inviteUser(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error inviting user: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// User analytics tool
	server.tool(
		"get_user_stats",
		"Retrieve detailed analytics data about user activity within a specified time range, including request counts and costs",
		{
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
			total_units_min: z
				.number()
				.positive()
				.optional()
				.describe("Minimum number of total tokens to filter by"),
			total_units_max: z
				.number()
				.positive()
				.optional()
				.describe("Maximum number of total tokens to filter by"),
			cost_min: z
				.number()
				.positive()
				.optional()
				.describe("Minimum cost in cents to filter by"),
			cost_max: z
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
			page_size: z
				.number()
				.positive()
				.optional()
				.describe("Number of results per page (for pagination)"),
		},
		async (params) => {
			try {
				const stats = await service.getUserGroupedData(params);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(stats, null, 2),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching user statistics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Get user tool
	server.tool(
		"get_user",
		"Retrieve detailed information about a specific user by their ID",
		{
			user_id: z.string().describe("The user ID to retrieve"),
		},
		async (params) => {
			try {
				const user = await service.getUser(params.user_id);
				return {
					content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching user: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Update user tool
	server.tool(
		"update_user",
		"Update a user's profile information including name and organization role",
		{
			user_id: z.string().describe("The user ID to update"),
			first_name: z.string().optional().describe("New first name"),
			last_name: z.string().optional().describe("New last name"),
			role: z
				.enum(["admin", "member"])
				.optional()
				.describe("New organization-level role"),
		},
		async (params) => {
			try {
				const { user_id, ...updateData } = params;
				const user = await service.updateUser(user_id, updateData);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: "Successfully updated user",
									user,
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
							text: `Error updating user: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Delete user tool
	server.tool(
		"delete_user",
		"Remove a user from your Portkey organization. This action cannot be undone.",
		{
			user_id: z.string().describe("The user ID to delete"),
		},
		async (params) => {
			try {
				await service.deleteUser(params.user_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting user: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: List user invites tool
	server.tool(
		"list_user_invites",
		"List all pending and sent user invitations in your Portkey organization",
		{},
		async () => {
			try {
				const invites = await service.listUserInvites();
				return {
					content: [{ type: "text", text: JSON.stringify(invites, null, 2) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing invites: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Get user invite tool
	server.tool(
		"get_user_invite",
		"Retrieve details about a specific user invitation",
		{
			invite_id: z.string().describe("The invite ID to retrieve"),
		},
		async (params) => {
			try {
				const invite = await service.getUserInvite(params.invite_id);
				return {
					content: [{ type: "text", text: JSON.stringify(invite, null, 2) }],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching invite: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Delete user invite tool
	server.tool(
		"delete_user_invite",
		"Cancel and delete a pending user invitation",
		{
			invite_id: z.string().describe("The invite ID to delete"),
		},
		async (params) => {
			try {
				await service.deleteUserInvite(params.invite_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting invite: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Phase 1: Resend user invite tool
	server.tool(
		"resend_user_invite",
		"Resend an invitation email to a pending user",
		{
			invite_id: z.string().describe("The invite ID to resend"),
		},
		async (params) => {
			try {
				await service.resendUserInvite(params.invite_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error resending invite: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
