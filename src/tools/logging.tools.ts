import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type { LogExportField } from "../services/logging.service.js";

// Schema for log export fields enum
const logExportFieldSchema = z.enum([
	"id",
	"trace_id",
	"created_at",
	"request",
	"response",
	"is_success",
	"ai_org",
	"ai_model",
	"req_units",
	"res_units",
	"total_units",
	"request_url",
	"cost",
	"cost_currency",
	"response_time",
	"response_status_code",
	"mode",
	"config",
	"prompt_slug",
	"metadata",
]);

const LOGGING_TOOL_SCHEMAS = {
	insertLog: {
		request_url: z
			.string()
			.optional()
			.describe("The endpoint URL being called"),
		request_provider: z
			.string()
			.optional()
			.describe("AI provider name (e.g., 'openai', 'anthropic')"),
		request_method: z
			.string()
			.optional()
			.default("post")
			.describe("HTTP method used (defaults to 'post')"),
		request_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe("Request headers as key-value pairs"),
		request_body: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Request payload/body"),
		response_status: z.coerce
			.number()
			.optional()
			.default(200)
			.describe("HTTP response status code (defaults to 200)"),
		response_headers: z
			.record(z.string(), z.string())
			.optional()
			.describe("Response headers as key-value pairs"),
		response_body: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Response payload/body"),
		response_time: z.coerce
			.number()
			.optional()
			.describe("Response latency in milliseconds"),
		streaming_mode: z
			.boolean()
			.optional()
			.default(false)
			.describe("Whether the response was streamed"),
		metadata_organization: z
			.string()
			.optional()
			.describe("Organization identifier for the log"),
		metadata_user: z
			.string()
			.optional()
			.describe("User identifier for the log"),
		metadata_trace_id: z
			.string()
			.optional()
			.describe("Trace ID for distributed tracing"),
		metadata_span_id: z.string().optional().describe("Span ID for tracing"),
		metadata_span_name: z.string().optional().describe("Span name for tracing"),
		metadata_parent_span_id: z
			.string()
			.optional()
			.describe("Parent span ID for tracing"),
		metadata_custom: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Additional custom metadata key-value pairs"),
	},
	createLogExport: {
		workspace_id: z.string().optional().describe("Workspace ID for the export"),
		description: z
			.string()
			.optional()
			.describe("Human-readable description for the export job"),
		time_min: z
			.string()
			.describe(
				"Minimum time filter in date format (e.g., '2024-01-01' or ISO 8601)",
			),
		time_max: z
			.string()
			.describe(
				"Maximum time filter in date format (e.g., '2024-01-31' or ISO 8601)",
			),
		cost_min: z.coerce.number().optional().describe("Minimum cost filter"),
		cost_max: z.coerce.number().optional().describe("Maximum cost filter"),
		total_units_min: z.coerce
			.number()
			.optional()
			.describe("Minimum total units (tokens) filter"),
		total_units_max: z.coerce
			.number()
			.optional()
			.describe("Maximum total units (tokens) filter"),
		ai_model: z
			.array(z.string())
			.optional()
			.describe("Filter by specific AI model names"),
		requested_fields: z
			.array(logExportFieldSchema)
			.describe(
				"Fields to include in export: id, trace_id, created_at, request, response, is_success, ai_org, ai_model, req_units, res_units, total_units, request_url, cost, cost_currency, response_time, response_status_code, mode, config, prompt_slug, metadata",
			),
	},
	listLogExports: {
		workspace_id: z
			.string()
			.describe("Workspace ID to list exports for (required)"),
	},
	getLogExport: {
		export_id: z.string().describe("The unique ID of the log export"),
	},
	startLogExport: {
		export_id: z.string().describe("The unique ID of the log export to start"),
	},
	cancelLogExport: {
		export_id: z.string().describe("The unique ID of the log export to cancel"),
	},
	downloadLogExport: {
		export_id: z
			.string()
			.describe("The unique ID of the log export to download"),
	},
	updateLogExport: {
		export_id: z.string().describe("The unique ID of the log export to update"),
		workspace_id: z.string().optional().describe("Workspace ID for the export"),
		time_of_generation_max: z
			.string()
			.optional()
			.describe(
				"Maximum time filter in date format (e.g., '2024-07-25' or ISO 8601)",
			),
		requested_fields: z
			.array(logExportFieldSchema)
			.optional()
			.describe(
				"Fields to include in export: id, trace_id, created_at, request, response, is_success, ai_org, ai_model, req_units, res_units, total_units, request_url, cost, cost_currency, response_time, response_status_code, mode, config, prompt_slug, metadata",
			),
	},
} as const;

export function registerLoggingTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Insert log tool
	server.tool(
		"insert_log",
		"Insert log records for requests that bypassed the gateway. This writes request, response, and trace metadata into Portkey immediately, and the call will fail if request_provider does not match a configured integration. Use the span fields to stitch trace hierarchies together.",
		LOGGING_TOOL_SCHEMAS.insertLog,
		async (params) => {
			const entry = {
				request: {
					url: params.request_url,
					provider: params.request_provider,
					method: params.request_method,
					headers: params.request_headers,
					body: params.request_body,
				},
				response: {
					status: params.response_status,
					headers: params.response_headers,
					body: params.response_body,
					response_time: params.response_time,
					streamingMode: params.streaming_mode,
				},
				metadata: {
					organization: params.metadata_organization,
					user: params.metadata_user,
					traceId: params.metadata_trace_id,
					spanId: params.metadata_span_id,
					spanName: params.metadata_span_name,
					parentSpanId: params.metadata_parent_span_id,
					...params.metadata_custom,
				},
			};

			const result = await service.logging.insertLog(entry);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: "Successfully inserted log entry",
							success: result.success,
						}),
					},
				],
			};
		},
	);

	// Create log export tool
	server.tool(
		"create_log_export",
		"Create a log export definition with filters and requested fields. This only sets up the export and does not start processing; call start_log_export next, then use get_log_export or download_log_export to inspect or retrieve the finished result.",
		LOGGING_TOOL_SCHEMAS.createLogExport,
		async (params) => {
			const result = await service.logging.createLogExport({
				workspace_id: params.workspace_id,
				description: params.description,
				filters: {
					time_of_generation_min: params.time_min,
					time_of_generation_max: params.time_max,
					cost_min: params.cost_min,
					cost_max: params.cost_max,
					total_units_min: params.total_units_min,
					total_units_max: params.total_units_max,
					ai_model: params.ai_model,
				},
				requested_data: params.requested_fields,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: "Successfully created log export",
							id: result.id,
							total: result.total,
							object: result.object,
						}),
					},
				],
			};
		},
	);

	// List log exports tool
	server.tool(
		"list_log_exports",
		"List log export jobs in a workspace with status, filters, and timestamps. Use this to find an export_id before calling get_log_export, start_log_export, cancel_log_export, or download_log_export.",
		LOGGING_TOOL_SCHEMAS.listLogExports,
		async (params) => {
			const result = await service.logging.listLogExports({
				workspace_id: params.workspace_id,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							total: result.total,
							exports: result.data.map((exp) => ({
								id: exp.id,
								status: exp.status,
								description: exp.description,
								filters: exp.filters,
								requested_data: exp.requested_data,
								workspace_id: exp.workspace_id,
								created_at: exp.created_at,
								last_updated_at: exp.last_updated_at,
								created_by: exp.created_by,
							})),
						}),
					},
				],
			};
		},
	);

	// Get log export tool
	server.tool(
		"get_log_export",
		"Fetch one log export job by export_id and return its status, filters, requested fields, and file metadata. Use this when you already know the target; use list_log_exports for a workspace-wide overview.",
		LOGGING_TOOL_SCHEMAS.getLogExport,
		async (params) => {
			const result = await service.logging.getLogExport(params.export_id);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							id: result.id,
							status: result.status,
							description: result.description,
							filters: result.filters,
							requested_data: result.requested_data,
							organisation_id: result.organisation_id,
							workspace_id: result.workspace_id,
							created_at: result.created_at,
							last_updated_at: result.last_updated_at,
							created_by: result.created_by,
						}),
					},
				],
			};
		},
	);

	// Start log export tool
	server.tool(
		"start_log_export",
		"Start processing a previously created log export job. This is asynchronous, only queues the export, and does not return rows or a download file; use get_log_export to poll progress and download_log_export after the job completes.",
		LOGGING_TOOL_SCHEMAS.startLogExport,
		async (params) => {
			const result = await service.logging.startLogExport(params.export_id);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: result.message,
							export_id: params.export_id,
							status: "started",
						}),
					},
				],
			};
		},
	);

	// Cancel log export tool
	server.tool(
		"cancel_log_export",
		"Cancel a pending or running log export job, unlike start_log_export which queues one or delete_integration which removes the source. This permanently stops that export, takes effect immediately, and does not roll back already-processed rows; call create_log_export and start_log_export again to retry.",
		LOGGING_TOOL_SCHEMAS.cancelLogExport,
		async (params) => {
			const result = await service.logging.cancelLogExport(params.export_id);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: result.message,
							export_id: params.export_id,
							status: "cancelled",
						}),
					},
				],
			};
		},
	);

	// Download log export tool
	server.tool(
		"download_log_export",
		"Get a signed URL for downloading a completed log export. The export must already be finished; use get_log_export to confirm readiness and start_log_export if it has not run yet.",
		LOGGING_TOOL_SCHEMAS.downloadLogExport,
		async (params) => {
			const result = await service.logging.downloadLogExport(params.export_id);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: "Download URL generated successfully",
							export_id: params.export_id,
							signed_url: result.signed_url,
						}),
					},
				],
			};
		},
	);

	// Update log export tool
	server.tool(
		"update_log_export",
		"Update an existing log export configuration before or between export runs. Only workspace_id, time_of_generation_max, and requested_fields can change after creation, so use get_log_export to review the current job and start_log_export after the definition is ready.",
		LOGGING_TOOL_SCHEMAS.updateLogExport,
		async (params) => {
			const updateData: {
				filters?: { time_of_generation_max?: string };
				workspace_id?: string;
				requested_data?: LogExportField[];
			} = {};

			if (params.time_of_generation_max) {
				updateData.filters = {
					time_of_generation_max: params.time_of_generation_max,
				};
			}

			if (params.workspace_id) {
				updateData.workspace_id = params.workspace_id;
			}

			if (params.requested_fields) {
				updateData.requested_data = params.requested_fields;
			}

			const result = await service.logging.updateLogExport(
				params.export_id,
				updateData,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							message: "Successfully updated log export",
							id: result.id,
							total: result.total,
							object: result.object,
						}),
					},
				],
			};
		},
	);
}
