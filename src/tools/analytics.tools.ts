import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	GenericGraphAnalyticsResponse,
	GroupAnalyticsResponse,
} from "../services/analytics.service.js";
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

const analyticsGroupMetadataSchema = {
	...paginatedAnalyticsSchema,
	metadata_key: z
		.string()
		.describe("The metadata key to group by (e.g., 'env', 'app', 'client_id')"),
};

function formatGraphAnalytics(
	summary: Record<string, unknown>,
	dataPoints: Record<string, unknown>[],
): {
	summary: Record<string, unknown>;
	point_count: number;
	data_points: Record<string, unknown>[];
} {
	return {
		summary,
		point_count: dataPoints.length,
		data_points: dataPoints,
	};
}

function formatGenericGraphAnalytics(
	analytics: GenericGraphAnalyticsResponse,
): {
	summary: Record<string, unknown>;
	point_count: number;
	data_points: Record<string, unknown>[];
} {
	return formatGraphAnalytics(analytics.summary, analytics.data_points);
}

function formatGroupedAnalytics(
	analytics: GroupAnalyticsResponse,
	groupLabel: string,
): Record<string, unknown> {
	return {
		total_groups: analytics.total,
		group_count: analytics.data.length,
		[groupLabel]: analytics.data,
	};
}

export function registerAnalyticsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Cost Analytics (existing) ====================

	server.tool(
		"get_cost_analytics",
		"Returns time-series of total and average cost per request over the specified period. Use to track spending trends and identify cost spikes. Differs from get_token_analytics which measures token consumption, not monetary cost. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCostAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				total_cost: point.total,
				average_cost: point.avg,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_cost: analytics.summary.total,
									average_cost_per_request: analytics.summary.avg,
								},
								dataPoints,
							),
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
		"Returns time-series of total, successful, and failed request counts over the specified period. Use to monitor traffic volume and success/failure trends. Differs from get_error_analytics which only shows error counts. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getRequestAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				total: point.total,
				success: point.success,
				failed: point.failed,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_requests: analytics.summary.total,
									successful_requests: analytics.summary.success,
									failed_requests: analytics.summary.failed,
								},
								dataPoints,
							),
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
		"Returns time-series of total, prompt, and completion token counts over the specified period. Use to track token consumption and identify usage patterns. Differs from get_cost_analytics which shows monetary cost, not token volume. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getTokenAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				total: point.total,
				prompt: point.prompt,
				completion: point.completion,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_tokens: analytics.summary.total,
									prompt_tokens: analytics.summary.prompt,
									completion_tokens: analytics.summary.completion,
								},
								dataPoints,
							),
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
		"Returns time-series of avg, p50, p90, and p99 latency percentiles in ms over the specified period. Use to monitor response times and detect latency regressions. Differs from get_cache_hit_latency which only measures latency for cached responses. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getLatencyAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				avg: point.avg,
				p50: point.p50,
				p90: point.p90,
				p99: point.p99,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									avg_latency_ms: analytics.summary.avg,
									p50_latency_ms: analytics.summary.p50,
									p90_latency_ms: analytics.summary.p90,
									p99_latency_ms: analytics.summary.p99,
								},
								dataPoints,
							),
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
		"Returns time-series of total error counts over the specified period. Use for high-level error trend monitoring. For error breakdown by status code, use get_error_status_codes_analytics or get_error_stacks_analytics; for error rate as a percentage, use get_error_rate_analytics. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				total_errors: point.total,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_errors: analytics.summary.total,
								},
								dataPoints,
							),
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
		"Returns time-series of error rate as a percentage of total requests over the specified period. Use to track reliability trends and SLA compliance. Differs from get_error_analytics which shows absolute error counts, not percentages. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorRateAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				error_rate_percent: point.rate,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									error_rate_percent: analytics.summary.rate,
								},
								dataPoints,
							),
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
		"Returns time-series of latency specifically for cache hits over the specified period. Use to evaluate cache performance and response speed for cached requests. Differs from get_latency_analytics which measures latency across all requests. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitLatency(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				total: point.total,
				avg: point.avg,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_latency: analytics.summary.total,
									avg_latency: analytics.summary.avg,
								},
								dataPoints,
							),
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
		"Returns time-series of cache hit rate percentage, total hits, and misses over the specified period. Use to evaluate cache effectiveness and tune caching strategy. Unrelated to get_cache_hit_latency which measures speed of cached responses, not hit/miss ratio. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitRate(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				rate: point.rate,
				hits: point.hits,
				misses: point.misses,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									hit_rate: analytics.summary.rate,
									total_hits: analytics.summary.total_hits,
									total_misses: analytics.summary.total_misses,
								},
								dataPoints,
							),
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
		"Returns time-series of active and new user counts over the specified period. Use for user growth tracking and adoption metrics. Differs from get_user_requests_analytics which shows per-user request breakdown, and get_analytics_group_users which shows per-user cost/token data. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getUsersAnalytics(params);
			const dataPoints = analytics.data_points.map((point) => ({
				timestamp: point.timestamp,
				active_users: point.active_users,
				new_users: point.new_users,
			}));
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGraphAnalytics(
								{
									total_active_users: analytics.summary.total_active_users,
									total_new_users: analytics.summary.total_new_users,
								},
								dataPoints,
							),
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
		"Returns errors broken down by status code stacks (e.g., 429, 500, 502) over the specified period. Use to identify which error types are most common and how they trend. Differs from get_error_status_codes_analytics which shows unique code distribution rather than stacked/cumulative breakdown. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorStacksAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_status_codes_analytics",
		"Returns distribution of unique HTTP error status codes over the specified period. Use to see which status codes are occurring and their frequency. Differs from get_error_stacks_analytics which shows stacked/cumulative error breakdown rather than individual code distribution. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getErrorStatusCodesAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_user_requests_analytics",
		"Returns per-user request count breakdown over the specified period. Use to identify heavy users and per-user traffic patterns. Differs from get_users_analytics which shows aggregate active/new user counts, not individual user breakdowns. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getUserRequestsAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_rescued_requests_analytics",
		"Returns time-series of requests saved by retry or fallback strategies over the specified period. Use to evaluate the effectiveness of your Portkey configs' resilience features. Only relevant if configs include retry or fallback targets. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getRescuedRequestsAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_analytics",
		"Returns time-series of feedback submission counts over the specified period. Use to track feedback volume trends. For breakdown by model, use get_feedback_models_analytics; for score distribution, use get_feedback_scores_analytics; for weighted scores, use get_feedback_weighted_analytics. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_models_analytics",
		"Returns feedback counts grouped by AI model over the specified period. Use to compare user satisfaction and feedback volume across different models. Differs from get_feedback_analytics which shows total volume without model breakdown. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackModelsAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_scores_analytics",
		"Returns distribution of raw feedback score values over the specified period. Use to understand score patterns (e.g., mostly positive vs mixed). Differs from get_feedback_weighted_analytics which applies weight factors for calibrated metrics. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackScoresAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_weighted_analytics",
		"Returns weighted feedback scores over the specified period, applying the weight factor set during feedback creation. Use for calibrated quality metrics where different feedback types have different importance. Differs from get_feedback_scores_analytics which shows raw unweighted scores. Requires time_of_generation_min and time_of_generation_max.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics =
				await service.analytics.getFeedbackWeightedAnalytics(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGenericGraphAnalytics(analytics),
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== Analytics Groups (Paginated) ====================

	server.tool(
		"get_analytics_group_users",
		"Returns analytics data aggregated per user with pagination, showing each user's request count, cost, and token usage. Use for per-user billing, audit, or identifying top consumers. Differs from get_users_analytics which shows aggregate active/new user counts over time. Requires time_of_generation_min and time_of_generation_max.",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupUsers(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGroupedAnalytics(analytics, "users"),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_analytics_group_models",
		"Returns analytics data aggregated per AI model with pagination, showing each model's request count, cost, and token usage. Use to compare model costs, popularity, and efficiency. Requires time_of_generation_min and time_of_generation_max.",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupModels(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGroupedAnalytics(analytics, "models"),
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_analytics_group_metadata",
		"Returns analytics data grouped by a custom metadata key (e.g., 'env', 'app', 'client_id') with pagination. Use for custom breakdowns like per-environment or per-feature cost analysis. Requires the metadata_key parameter in addition to time_of_generation_min and time_of_generation_max.",
		analyticsGroupMetadataSchema,
		async (params) => {
			const { metadata_key, ...analyticsParams } = params;
			const analytics = await service.analytics.getAnalyticsGroupMetadata(
				metadata_key,
				analyticsParams,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGroupedAnalytics(analytics, "metadata_groups"),
							null,
							2,
						),
					},
				],
			};
		},
	);
}
