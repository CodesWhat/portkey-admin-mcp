import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

// ==================== Shared Zod Schemas ====================

/**
 * Base analytics filter parameters schema - shared across all analytics endpoints
 */
const baseAnalyticsSchema = {
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
	prompt_token_min: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Minimum number of prompt tokens"),
	prompt_token_max: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Maximum number of prompt tokens"),
	completion_token_min: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Minimum number of completion tokens"),
	completion_token_max: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Maximum number of completion tokens"),
	status_code: z
		.string()
		.optional()
		.describe("Filter by specific HTTP status codes (comma-separated)"),
	weighted_feedback_min: z.coerce
		.number()
		.min(-10)
		.max(10)
		.optional()
		.describe("Minimum weighted feedback score (-10 to 10)"),
	weighted_feedback_max: z.coerce
		.number()
		.min(-10)
		.max(10)
		.optional()
		.describe("Maximum weighted feedback score (-10 to 10)"),
	virtual_keys: z
		.string()
		.optional()
		.describe("Filter by specific virtual key slugs (comma-separated)"),
	configs: z
		.string()
		.optional()
		.describe("Filter by specific config slugs (comma-separated)"),
	workspace_slug: z
		.string()
		.optional()
		.describe("Filter by specific workspace"),
	api_key_ids: z
		.string()
		.optional()
		.describe("Filter by specific API key UUIDs (comma-separated)"),
	metadata: z
		.string()
		.optional()
		.describe(
			'Stringified JSON object for metadata filtering, e.g. \'{"env":"prod","app":"myapp"}\'.',
		),
	ai_org_model: z
		.string()
		.optional()
		.describe(
			"Filter by provider and model, format: 'provider__model' with double underscore, e.g. 'openai__gpt-4' or 'anthropic__claude-3-opus'. Comma-separated for multiple.",
		),
	trace_id: z
		.string()
		.optional()
		.describe("Filter by trace IDs (comma-separated)"),
	span_id: z
		.string()
		.optional()
		.describe("Filter by span IDs (comma-separated)"),
	prompt_slug: z.string().optional().describe("Filter by prompt slug"),
};

export function registerAnalyticsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Cost Analytics (existing) ====================

	server.tool(
		"get_cost_analytics",
		"Retrieve detailed cost analytics data over time, including total costs and averages per request",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCostAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_cost: analytics.summary.total,
									average_cost_per_request: analytics.summary.avg,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									total_cost: point.total,
									average_cost: point.avg,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== Graph Analytics ====================

	server.tool(
		"get_request_analytics",
		"Retrieve request analytics as time-series data, showing total, successful, and failed requests over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getRequestAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_requests: analytics.summary.total,
									successful_requests: analytics.summary.success,
									failed_requests: analytics.summary.failed,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									total: point.total,
									success: point.success,
									failed: point.failed,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_token_analytics",
		"Retrieve token usage analytics as time-series data, showing total, prompt, and completion tokens over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getTokenAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_tokens: analytics.summary.total,
									prompt_tokens: analytics.summary.prompt,
									completion_tokens: analytics.summary.completion,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									total: point.total,
									prompt: point.prompt,
									completion: point.completion,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_latency_analytics",
		"Retrieve latency analytics as time-series data, showing average, p50, p90, and p99 latency percentiles over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getLatencyAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									avg_latency_ms: analytics.summary.avg,
									p50_latency_ms: analytics.summary.p50,
									p90_latency_ms: analytics.summary.p90,
									p99_latency_ms: analytics.summary.p99,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									avg: point.avg,
									p50: point.p50,
									p90: point.p90,
									p99: point.p99,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_analytics",
		"Retrieve error count analytics as time-series data, showing total error counts over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_errors: analytics.summary.total,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									total_errors: point.total,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_rate_analytics",
		"Retrieve error rate analytics as time-series data, showing the percentage of failed requests over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorRateAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									error_rate_percent: analytics.summary.rate,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									error_rate_percent: point.rate,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== Cache Analytics ====================

	server.tool(
		"get_cache_hit_latency",
		"Retrieve cache hit latency analytics as time-series data, showing total and average latency for cache hits over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitLatency(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_latency: analytics.summary.total,
									avg_latency: analytics.summary.avg,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									total: point.total,
									avg: point.avg,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_cache_hit_rate",
		"Retrieve cache hit rate analytics as time-series data, showing hit rate percentage, total hits, and misses over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitRate(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									hit_rate: analytics.summary.rate,
									total_hits: analytics.summary.total_hits,
									total_misses: analytics.summary.total_misses,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									rate: point.rate,
									hits: point.hits,
									misses: point.misses,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== User Analytics ====================

	server.tool(
		"get_users_analytics",
		"Retrieve user activity analytics over time, showing active and new user counts",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getUsersAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								summary: {
									total_active_users: analytics.summary.total_active_users,
									total_new_users: analytics.summary.total_new_users,
								},
								data_points: analytics.data_points.map((point) => ({
									timestamp: point.timestamp,
									active_users: point.active_users,
									new_users: point.new_users,
								})),
								object: analytics.object,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== Extended Graph Analytics ====================

	server.tool(
		"get_error_stacks_analytics",
		"Retrieve error analytics broken down by status code stacks over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorStacksAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_error_status_codes_analytics",
		"Retrieve unique error status code distribution analytics over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getErrorStatusCodesAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_user_requests_analytics",
		"Retrieve per-user request count analytics over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getUserRequestsAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_rescued_requests_analytics",
		"Retrieve analytics for requests rescued by retry or fallback strategies over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getRescuedRequestsAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_feedback_analytics",
		"Retrieve feedback submission analytics over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_feedback_models_analytics",
		"Retrieve feedback analytics grouped by AI model over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackModelsAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_feedback_scores_analytics",
		"Retrieve feedback score distribution analytics over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackScoresAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_feedback_weighted_analytics",
		"Retrieve weighted feedback analytics over time",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackWeightedAnalytics(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	// ==================== Analytics Groups (Paginated) ====================

	const paginatedAnalyticsSchema = {
		...baseAnalyticsSchema,
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Results per page (max 100)"),
	};

	server.tool(
		"get_analytics_group_users",
		"Retrieve analytics data grouped by user with pagination",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupUsers(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_analytics_group_models",
		"Retrieve analytics data grouped by AI model with pagination",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupModels(params);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);

	server.tool(
		"get_analytics_group_metadata",
		"Retrieve analytics data grouped by a specific metadata key with pagination",
		{
			...paginatedAnalyticsSchema,
			metadata_key: z
				.string()
				.describe(
					"The metadata key to group by (e.g., 'env', 'app', 'client_id')",
				),
		},
		async (params) => {
			const { metadata_key, ...analyticsParams } = params;
			const analytics = await service.analytics.getAnalyticsGroupMetadata(
				metadata_key,
				analyticsParams,
			);
			return {
				content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }],
			};
		},
	);
}
