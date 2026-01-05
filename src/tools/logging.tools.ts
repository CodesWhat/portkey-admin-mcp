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

export function registerLoggingTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Insert log tool
	server.tool(
		"insert_log",
		"Insert a log entry (or multiple entries) into Portkey for tracking AI requests and responses",
		{
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
			response_status: z
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
			response_time: z
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
			metadata_span_name: z
				.string()
				.optional()
				.describe("Span name for tracing"),
			metadata_parent_span_id: z
				.string()
				.optional()
				.describe("Parent span ID for tracing"),
			metadata_custom: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("Additional custom metadata key-value pairs"),
		},
		async (params) => {
			try {
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

				const result = await service.insertLog(entry);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: "Successfully inserted log entry",
									success: result.success,
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
							text: `Error inserting log: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create log export tool
	server.tool(
		"create_log_export",
		"Create a new log export job to export logs matching specified filters",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID for the export"),
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
			cost_min: z.number().optional().describe("Minimum cost filter"),
			cost_max: z.number().optional().describe("Maximum cost filter"),
			tokens_min: z.number().optional().describe("Minimum tokens filter"),
			tokens_max: z.number().optional().describe("Maximum tokens filter"),
			models: z
				.array(z.string())
				.optional()
				.describe("Filter by specific model names"),
			requested_fields: z
				.array(logExportFieldSchema)
				.describe(
					"Fields to include in export: id, trace_id, created_at, request, response, is_success, ai_org, ai_model, req_units, res_units, total_units, request_url, cost, cost_currency, response_time, response_status_code, mode, config, prompt_slug, metadata",
				),
		},
		async (params) => {
			try {
				const result = await service.createLogExport({
					workspace_id: params.workspace_id,
					description: params.description,
					filters: {
						time_of_generation_min: params.time_min,
						time_of_generation_max: params.time_max,
						cost_min: params.cost_min,
						cost_max: params.cost_max,
						tokens_min: params.tokens_min,
						tokens_max: params.tokens_max,
						model: params.models,
					},
					requested_data: params.requested_fields,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: "Successfully created log export",
									id: result.id,
									total: result.total,
									object: result.object,
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
							text: `Error creating log export: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List log exports tool
	server.tool(
		"list_log_exports",
		"List all log export jobs for a workspace",
		{
			workspace_id: z
				.string()
				.describe("Workspace ID to list exports for (required)"),
		},
		async (params) => {
			try {
				const result = await service.listLogExports({
					workspace_id: params.workspace_id,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
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
							text: `Error listing log exports: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get log export tool
	server.tool(
		"get_log_export",
		"Get details of a specific log export by its ID",
		{
			export_id: z.string().describe("The unique ID of the log export"),
		},
		async (params) => {
			try {
				const result = await service.getLogExport(params.export_id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
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
							text: `Error getting log export: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Start log export tool
	server.tool(
		"start_log_export",
		"Start a log export job that was previously created",
		{
			export_id: z
				.string()
				.describe("The unique ID of the log export to start"),
		},
		async (params) => {
			try {
				const result = await service.startLogExport(params.export_id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: result.message,
									export_id: params.export_id,
									status: "started",
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
							text: `Error starting log export: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Cancel log export tool
	server.tool(
		"cancel_log_export",
		"Cancel a running log export job",
		{
			export_id: z
				.string()
				.describe("The unique ID of the log export to cancel"),
		},
		async (params) => {
			try {
				const result = await service.cancelLogExport(params.export_id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: result.message,
									export_id: params.export_id,
									status: "cancelled",
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
							text: `Error cancelling log export: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Download log export tool
	server.tool(
		"download_log_export",
		"Get the download URL for a completed log export",
		{
			export_id: z
				.string()
				.describe("The unique ID of the log export to download"),
		},
		async (params) => {
			try {
				const result = await service.downloadLogExport(params.export_id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: "Download URL generated successfully",
									export_id: params.export_id,
									signed_url: result.signed_url,
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
							text: `Error getting download URL: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update log export tool
	server.tool(
		"update_log_export",
		"Update an existing log export configuration. Note: Only time_of_generation_max filter can be modified after creation - other filters (time_min, cost, tokens, models) must be set at creation time. You can also update workspace_id and requested data fields.",
		{
			export_id: z
				.string()
				.describe("The unique ID of the log export to update"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID for the export"),
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
		async (params) => {
			try {
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

				const result = await service.updateLogExport(
					params.export_id,
					updateData,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: "Successfully updated log export",
									id: result.id,
									total: result.total,
									object: result.object,
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
							text: `Error updating log export: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
