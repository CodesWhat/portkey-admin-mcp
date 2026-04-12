import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

const TRACING_TOOL_SCHEMAS = {
	createFeedback: {
		trace_id: z
			.string()
			.describe(
				"The trace ID to associate the feedback with. This links feedback to a specific request/generation.",
			),
		value: z.coerce
			.number()
			.describe(
				"Feedback value/rating. Common patterns: 1 for positive (thumbs up), 0 for negative (thumbs down), or use a scale like 1-5.",
			),
		weight: z.coerce
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
	updateFeedback: {
		id: z.string().describe("The unique identifier of the feedback to update"),
		value: z.coerce
			.number()
			.optional()
			.describe(
				"New feedback value/rating. Common patterns: 1 for positive, 0 for negative.",
			),
		weight: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New weighting factor for the feedback"),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("New or updated custom metadata for the feedback"),
	},
	getTrace: {
		id: z.string().describe("The unique identifier of the trace to retrieve"),
	},
} as const;

export function registerTracingTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create feedback
	server.tool(
		"create_feedback",
		"Create feedback for a specific trace/request. Use this to capture user feedback (thumbs up/down, ratings) on AI generations. Feedback is linked via trace_id and can include custom metadata for analysis. Use get_trace to find trace_ids for requests you want to provide feedback on.",
		TRACING_TOOL_SCHEMAS.createFeedback,
		async (params) => {
			const result = await service.tracing.createFeedback({
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
								status: result.status,
								feedback_ids: result.feedback_ids,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update feedback
	server.tool(
		"update_feedback",
		"Update existing feedback by ID. Use this instead of create_feedback when feedback already exists and needs correction or refinement. Only value, weight, and metadata can be changed; the trace_id association is immutable. Returns the updated feedback status and IDs.",
		TRACING_TOOL_SCHEMAS.updateFeedback,
		async (params) => {
			const result = await service.tracing.updateFeedback(params.id, {
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
								status: result.status,
								feedback_ids: result.feedback_ids,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get trace
	server.tool(
		"get_trace",
		"Retrieve detailed information about a specific trace by ID. Use this to inspect individual request/response data, spans, metadata, cost, token usage, and associated feedback. Unlike analytics tools which return aggregated metrics across many requests, this returns the full detail of a single trace.",
		TRACING_TOOL_SCHEMAS.getTrace,
		async (params) => {
			const result = await service.tracing.getTrace(params.id);
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
		},
	);
}
