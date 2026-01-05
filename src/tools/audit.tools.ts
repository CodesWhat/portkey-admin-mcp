import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerAuditTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List audit logs
	server.tool(
		"list_audit_logs",
		"Retrieve audit logs for your Portkey organization. Audit logs track all administrative actions including user management, configuration changes, and access events. Supports filtering by time range, actor, action type, and resource.",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter audit logs by workspace ID"),
			actor_id: z
				.string()
				.optional()
				.describe("Filter by the user ID who performed the action"),
			action: z
				.string()
				.optional()
				.describe(
					"Filter by action type (e.g., 'create', 'update', 'delete', 'login')",
				),
			resource_type: z
				.string()
				.optional()
				.describe(
					"Filter by resource type (e.g., 'user', 'workspace', 'config', 'virtual_key')",
				),
			resource_id: z
				.string()
				.optional()
				.describe("Filter by specific resource ID"),
			start_time: z
				.string()
				.optional()
				.describe(
					"Start of time range filter (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')",
				),
			end_time: z
				.string()
				.optional()
				.describe(
					"End of time range filter (ISO 8601 format, e.g., '2024-01-31T23:59:59Z')",
				),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination (starts at 1)"),
			page_size: z
				.number()
				.positive()
				.max(100)
				.optional()
				.describe("Number of results per page (max 100)"),
		},
		async (params) => {
			try {
				const result = await service.listAuditLogs({
					workspace_id: params.workspace_id,
					actor_id: params.actor_id,
					action: params.action,
					resource_type: params.resource_type,
					resource_id: params.resource_id,
					start_time: params.start_time,
					end_time: params.end_time,
					current_page: params.current_page,
					page_size: params.page_size,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									total: result.total,
									current_page: result.current_page,
									page_size: result.page_size,
									audit_logs: result.data.map((log) => ({
										id: log.id,
										action: log.action,
										actor_id: log.actor_id,
										actor_email: log.actor_email,
										actor_name: log.actor_name,
										resource_type: log.resource_type,
										resource_id: log.resource_id,
										resource_name: log.resource_name,
										workspace_id: log.workspace_id,
										organisation_id: log.organisation_id,
										metadata: log.metadata,
										ip_address: log.ip_address,
										user_agent: log.user_agent,
										created_at: log.created_at,
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
							text: `Error fetching audit logs: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
