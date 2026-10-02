import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CurrentPageSchema, PageSizeSchema } from "../lib/schemas.js";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

const AUDIT_TOOL_SCHEMAS = {
	listAuditLogs: {
		start_time: z
			.string()
			.describe(
				"Start of time range filter (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')",
			),
		end_time: z
			.string()
			.describe(
				"End of time range filter (ISO 8601 format, e.g., '2024-01-31T23:59:59Z')",
			),
		organisation_id: z
			.string()
			.describe("Organisation ID whose audit logs to list"),
		workspace_id: z
			.string()
			.optional()
			.describe("Filter audit logs by workspace ID"),
		user_id: z
			.string()
			.optional()
			.describe(
				"Filter by the ID of the user or API key that made the request",
			),
		user_type: z
			.enum(["user", "api_key"])
			.optional()
			.describe("Filter by whether the request came from a user or an API key"),
		request_id: z.string().optional().describe("Filter by request ID"),
		method: z
			.enum(["POST", "PUT", "DELETE"])
			.optional()
			.describe("Filter by HTTP method of the audited request"),
		uri: z.string().optional().describe("Filter by request URI path"),
		client_ip: z.string().optional().describe("Filter by client IP address"),
		country: z
			.string()
			.optional()
			.describe("Filter by country derived from the client IP"),
		response_status_code: z.coerce
			.number()
			.int()
			.optional()
			.describe("Filter by HTTP response status code (e.g., 200, 403)"),
		action: z
			.string()
			.optional()
			.describe("Filter by action type (e.g., 'create', 'update', 'delete')"),
		resource_type: z
			.string()
			.optional()
			.describe(
				"Filter by resource type (e.g., 'workspace', 'config', 'virtual_key')",
			),
		current_page: CurrentPageSchema,
		page_size: PageSizeSchema.describe("Number of results per page (max 100)"),
	},
} as const;

export function registerAuditTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List audit logs
	server.tool(
		"list_audit_logs",
		"List audit log records for a Portkey organization within a time range (Enterprise plan only; other plans get a permissions error). Each record is a state-changing API request (POST, PUT, or DELETE) with timestamp, method, uri, request_id, user_id, user_type (user or api_key), organisation_id, workspace_id, response_status_code, resource_type, action, client_ip, country, plus request_body, query_params, and request_headers as JSON strings. Use it for compliance or incident review of individual events; use analytics instead for aggregates.",
		AUDIT_TOOL_SCHEMAS.listAuditLogs,
		async (params) => {
			const result = await service.audit.listAuditLogs({
				start_time: params.start_time,
				end_time: params.end_time,
				organisation_id: params.organisation_id,
				workspace_id: params.workspace_id,
				user_id: params.user_id,
				user_type: params.user_type,
				request_id: params.request_id,
				method: params.method,
				uri: params.uri,
				client_ip: params.client_ip,
				country: params.country,
				response_status_code: params.response_status_code,
				action: params.action,
				resource_type: params.resource_type,
				current_page: params.current_page,
				page_size: params.page_size,
			});
			return jsonResult({
				total: result.total,
				audit_logs: (result.records ?? []).map((log) => ({
					timestamp: log.timestamp,
					method: log.method,
					uri: log.uri,
					request_id: log.request_id,
					user_id: log.user_id,
					user_type: log.user_type,
					organisation_id: log.organisation_id,
					workspace_id: log.workspace_id,
					response_status_code: log.response_status_code,
					resource_type: log.resource_type,
					action: log.action,
					client_ip: log.client_ip,
					country: log.country,
					request_body: log.request_body,
					query_params: log.query_params,
					request_headers: log.request_headers,
				})),
			});
		},
	);
}
