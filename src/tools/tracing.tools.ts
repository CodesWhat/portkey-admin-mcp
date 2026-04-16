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
} as const;

export function registerTracingTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create feedback
	server.tool(
		"create_feedback",
		"Create feedback for a trace or request. Writes a new feedback record linked by trace_id, returns the created feedback IDs and status, and takes effect immediately; use update_feedback when correcting an existing record.",
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
		"Update an existing feedback record by ID. Returns the updated status and feedback IDs, changes only value, weight, and metadata, and leaves the trace linkage immutable; use create_feedback only for a new record.",
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
}
