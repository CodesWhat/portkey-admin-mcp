import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerTracingTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create feedback
	server.tool(
		"create_feedback",
		"Create feedback for a specific trace/request. Use this to capture user feedback (thumbs up/down, ratings) on AI generations. Feedback is linked via trace_id and can include custom metadata for analysis.",
		{
			trace_id: z
				.string()
				.describe(
					"The trace ID to associate the feedback with. This links feedback to a specific request/generation.",
				),
			value: z
				.number()
				.describe(
					"Feedback value/rating. Common patterns: 1 for positive (thumbs up), 0 for negative (thumbs down), or use a scale like 1-5.",
				),
			weight: z
				.number()
				.positive()
				.optional()
				.describe(
					"Optional weighting factor for the feedback. Use to give more importance to certain feedback.",
				),
			metadata: z
				.record(z.string(), z.unknown())
				.optional()
				.describe(
					"Optional custom metadata for categorization and analysis (e.g., feedback_source, category, user_segment).",
				),
		},
		async (params) => {
			try {
				const result = await service.createFeedback({
					trace_id: params.trace_id,
					value: params.value,
					weight: params.weight,
					metadata: params.metadata,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully created feedback for trace "${params.trace_id}"`,
									success: result.success,
									id: result.data?.id,
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
							text: `Error creating feedback: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update feedback
	server.tool(
		"update_feedback",
		"Update existing feedback by ID. Allows modifying the feedback value, weight, or metadata after initial creation.",
		{
			id: z
				.string()
				.describe("The unique identifier of the feedback to update"),
			value: z
				.number()
				.optional()
				.describe(
					"New feedback value/rating. Common patterns: 1 for positive, 0 for negative.",
				),
			weight: z
				.number()
				.positive()
				.optional()
				.describe("New weighting factor for the feedback"),
			metadata: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("New or updated custom metadata for the feedback"),
		},
		async (params) => {
			try {
				const result = await service.updateFeedback(params.id, {
					value: params.value,
					weight: params.weight,
					metadata: params.metadata,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated feedback "${params.id}"`,
									success: result.success,
									id: result.data?.id,
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
							text: `Error updating feedback: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List traces
	server.tool(
		"list_traces",
		"List all traces in your Portkey workspace with optional filtering. Returns trace metadata including requests, responses, costs, and token usage.",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter traces by workspace ID"),
			search: z
				.string()
				.optional()
				.describe("Search traces by metadata or request details"),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.positive()
				.max(100)
				.optional()
				.describe("Results per page (max 100)"),
		},
		async (params) => {
			try {
				const result = await service.listTraces(params);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									total: result.total,
									traces: result.data.map((trace) => ({
										id: trace.id,
										trace_id: trace.trace_id,
										request: trace.request,
										response: trace.response,
										cost: trace.cost,
										tokens: trace.tokens,
										metadata: trace.metadata,
										workspace_id: trace.workspace_id,
										created_at: trace.created_at,
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
							text: `Error listing traces: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get trace
	server.tool(
		"get_trace",
		"Retrieve detailed information about a specific trace by ID. Returns full request/response data, all spans, metadata, cost, token usage, and any associated feedback.",
		{
			id: z.string().describe("The unique identifier of the trace to retrieve"),
		},
		async (params) => {
			try {
				const result = await service.getTrace(params.id);
				const trace = result.data;
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									trace: {
										id: trace.id,
										trace_id: trace.trace_id,
										request: trace.request,
										response: trace.response,
										metadata: trace.metadata,
										workspace_id: trace.workspace_id,
										organisation_id: trace.organisation_id,
										cost: trace.cost,
										tokens: trace.tokens,
										spans: trace.spans?.map((span) => ({
											span_id: span.span_id,
											span_name: span.span_name,
											parent_span_id: span.parent_span_id,
											start_time: span.start_time,
											end_time: span.end_time,
											status: span.status,
											attributes: span.attributes,
										})),
										feedback: trace.feedback,
										created_at: trace.created_at,
									},
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
							text: `Error fetching trace: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
