import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type {
	BaseAnalyticsParams,
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
		.describe(
			"Legacy Portkey query param for HTTP status codes. Comma-separated string; prefer status_codes for structured inputs.",
		),
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
		.describe(
			"Legacy Portkey query param for virtual key slugs. Comma-separated string; prefer virtual_key_slugs for structured inputs.",
		),
	configs: z
		.string()
		.optional()
		.describe(
			"Legacy Portkey query param for config slugs. Comma-separated string; prefer config_slugs for structured inputs.",
		),
	status_codes: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for status_code. Use an array of HTTP status codes; normalized to the legacy comma-separated Portkey query param.",
		),
	virtual_key_slugs: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for virtual_keys. Use an array of virtual key slugs; normalized to the legacy comma-separated Portkey query param.",
		),
	config_slugs: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for configs. Use an array of config slugs; normalized to the legacy comma-separated Portkey query param.",
		),
	workspace_slug: z
		.string()
		.optional()
		.describe("Filter by specific workspace"),
	api_key_ids: z
		.preprocess((value) => {
			if (value == null) {
				return value;
			}
			if (Array.isArray(value)) {
				return value.map((item) => String(item)).join(",");
			}
			return value;
		}, z.string().optional())
		.describe(
			"Legacy Portkey query param for API key UUIDs. Comma-separated string; request_analytics also accepts an array and normalizes it to this form.",
		),
	metadata: z
		.string()
		.optional()
		.describe(
			'Legacy Portkey query param for metadata filtering. Stringified JSON object, e.g. \'{"env":"prod","app":"myapp"}\'; prefer metadata_filter for structured inputs.',
		),
	ai_org_model: z
		.string()
		.optional()
		.describe(
			"Legacy Portkey query param for provider/model pairs. Format: 'provider__model' with double underscore, e.g. 'openai__gpt-4' or 'anthropic__claude-3-opus'. Comma-separated string; prefer provider_models for structured inputs.",
		),
	provider_models: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for ai_org_model. Use provider__model strings in an array; normalized to the legacy comma-separated Portkey query param.",
		),
	trace_id: z
		.string()
		.optional()
		.describe(
			"Legacy Portkey query param for trace IDs. Comma-separated string; prefer trace_ids for structured inputs.",
		),
	trace_ids: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for trace_id. Use an array of trace IDs; normalized to the legacy comma-separated Portkey query param.",
		),
	span_id: z
		.string()
		.optional()
		.describe(
			"Legacy Portkey query param for span IDs. Comma-separated string; prefer span_ids for structured inputs.",
		),
	span_ids: z
		.array(z.string())
		.optional()
		.describe(
			"Structured alias for span_id. Use an array of span IDs; normalized to the legacy comma-separated Portkey query param.",
		),
	metadata_filter: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"Structured alias for metadata. Use an object such as { env: 'prod' }; normalized to a JSON string before the request is sent.",
		),
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

function normalizeCommaSeparatedParam(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(",");
	}
	if (typeof value === "string") {
		return value;
	}
	return undefined;
}

function normalizeMetadataFilter(value: unknown): string | undefined {
	if (value == null) {
		return undefined;
	}
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return undefined;
}

function normalizeAnalyticsParams<T extends Record<string, unknown>>(
	params: T,
): Record<string, unknown> & BaseAnalyticsParams {
	const {
		status_codes,
		virtual_key_slugs,
		config_slugs,
		api_key_ids,
		trace_ids,
		span_ids,
		provider_models,
		metadata_filter,
		...legacyParams
	} = params;

	const normalizedParams: Record<string, unknown> = {
		...(legacyParams as Partial<BaseAnalyticsParams>),
	};

	const statusCode =
		normalizeCommaSeparatedParam(status_codes) ??
		normalizeCommaSeparatedParam(legacyParams.status_code);
	if (statusCode !== undefined) {
		normalizedParams.status_code = statusCode;
	}

	const virtualKeys =
		normalizeCommaSeparatedParam(virtual_key_slugs) ??
		normalizeCommaSeparatedParam(legacyParams.virtual_keys);
	if (virtualKeys !== undefined) {
		normalizedParams.virtual_keys = virtualKeys;
	}

	const configs =
		normalizeCommaSeparatedParam(config_slugs) ??
		normalizeCommaSeparatedParam(legacyParams.configs);
	if (configs !== undefined) {
		normalizedParams.configs = configs;
	}

	const apiKeyIds =
		normalizeCommaSeparatedParam(api_key_ids) ??
		normalizeCommaSeparatedParam(legacyParams.api_key_ids);
	if (apiKeyIds !== undefined) {
		normalizedParams.api_key_ids = apiKeyIds;
	}

	const metadata =
		normalizeMetadataFilter(metadata_filter) ??
		normalizeMetadataFilter(legacyParams.metadata);
	if (metadata !== undefined) {
		normalizedParams.metadata = metadata;
	}

	const providerModels =
		normalizeCommaSeparatedParam(provider_models) ??
		normalizeCommaSeparatedParam(legacyParams.ai_org_model);
	if (providerModels !== undefined) {
		normalizedParams.ai_org_model = providerModels;
	}

	const traceId =
		normalizeCommaSeparatedParam(trace_ids) ??
		normalizeCommaSeparatedParam(legacyParams.trace_id);
	if (traceId !== undefined) {
		normalizedParams.trace_id = traceId;
	}

	const spanId =
		normalizeCommaSeparatedParam(span_ids) ??
		normalizeCommaSeparatedParam(legacyParams.span_id);
	if (spanId !== undefined) {
		normalizedParams.span_id = spanId;
	}

	return normalizedParams as Record<string, unknown> & BaseAnalyticsParams;
}

export function registerAnalyticsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Cost Analytics (existing) ====================

	server.tool(
		"get_cost_analytics",
		"Get cost time-series data with summary.total_cost, summary.average_cost_per_request, and per-bucket total/avg cost. Use this for spend analysis and spike detection; use get_token_analytics when you need token volume instead of monetary cost.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCostAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	// ==================== Graph Analytics ====================

	server.tool(
		"get_request_analytics",
		"Get request-volume time-series data with summary.total_requests, summary.successful_requests, summary.failed_requests, and per-bucket total/success/failed counts. Use this for traffic and reliability trends; use get_error_analytics when you only need error counts.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getRequestAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_token_analytics",
		"Get token-usage time-series data with summary.total_tokens, summary.prompt_tokens, summary.completion_tokens, and per-bucket total/prompt/completion counts. Use this for consumption trends; use get_cost_analytics when you need spend instead of token volume.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getTokenAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_latency_analytics",
		"Get latency time-series data with summary.avg_latency_ms, summary.p50_latency_ms, summary.p90_latency_ms, summary.p99_latency_ms, and per-bucket latency percentiles in ms. Use this to spot slowdowns and regressions; use get_cache_hit_latency when you only want cache-hit latency.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getLatencyAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_analytics",
		"Get error-count time-series data with summary.total_errors and per-bucket counts. Use this for high-level error trends; use get_error_rate_analytics for percentages, or get_error_status_codes_analytics and get_error_stacks_analytics for breakdowns.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_rate_analytics",
		"Get error-rate time-series data with summary.error_rate_percent and per-bucket percentages of total requests. Use this for reliability and SLA trends; use get_error_analytics for absolute error counts instead.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorRateAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	// ==================== Cache Analytics ====================

	server.tool(
		"get_cache_hit_latency",
		"Get cache-hit-only latency time-series data with summary.total_latency, summary.avg_latency, and per-bucket total/avg latency. Use this to evaluate cached-response speed; use get_latency_analytics for all requests.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitLatency(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	server.tool(
		"get_cache_hit_rate",
		"Get cache-effectiveness time-series data with summary.hit_rate, summary.total_hits, summary.total_misses, and per-bucket hits/misses/rate. Use this to measure cache effectiveness; use get_cache_hit_latency for speed rather than hit/miss ratio.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getCacheHitRate(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	// ==================== User Analytics ====================

	server.tool(
		"get_users_analytics",
		"Get user-growth time-series data with summary.total_active_users, summary.total_new_users, and per-bucket active/new user counts. Use this for growth and adoption trends; use get_user_requests_analytics for per-user traffic or get_analytics_group_users for per-user cost and token detail.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getUsersAnalytics(
				normalizeAnalyticsParams(params),
			);
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
						),
					},
				],
			};
		},
	);

	// ==================== Extended Graph Analytics ====================

	server.tool(
		"get_error_stacks_analytics",
		"Get stacked error-series data grouped by HTTP status code over time, with summary and per-code series. Use this to see which error classes dominate; use get_error_status_codes_analytics for distinct-code distribution instead.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorStacksAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_error_status_codes_analytics",
		"Get HTTP error-code distribution time-series data with summary and per-code series. Use this to see which codes occur most often; use get_error_stacks_analytics for stacked or cumulative breakdowns.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getErrorStatusCodesAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_user_requests_analytics",
		"Get per-user request-count time-series data with counts grouped by user. Use this to find heavy users and traffic concentration; use get_users_analytics for aggregate active and new user trends instead.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getUserRequestsAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_rescued_requests_analytics",
		"Get rescued-request time-series data showing requests recovered by retry or fallback handling. Use this only when your configs include resilience features, and use it to measure how often recovery logic saved requests.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getRescuedRequestsAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_analytics",
		"Get feedback-submission time-series data with summary totals and per-bucket counts. Use this as the top-level feedback trend view; use get_feedback_models_analytics, get_feedback_scores_analytics, or get_feedback_weighted_analytics for breakdowns.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_models_analytics",
		"Get feedback time-series data grouped by model, with per-model counts over time. Use this to compare feedback volume and satisfaction across models; use get_feedback_analytics for the overall total instead.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackModelsAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_scores_analytics",
		"Get raw feedback-score distribution time-series data with per-score buckets. Use this to understand sentiment mix; use get_feedback_weighted_analytics for calibrated scores with weighting.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackScoresAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	server.tool(
		"get_feedback_weighted_analytics",
		"Get weighted feedback-score time-series data using the weight recorded at feedback creation. Use this for calibrated quality metrics; use get_feedback_scores_analytics for the raw unweighted distribution.",
		baseAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getFeedbackWeightedAnalytics(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGenericGraphAnalytics(analytics)),
					},
				],
			};
		},
	);

	// ==================== Analytics Groups (Paginated) ====================

	server.tool(
		"get_analytics_group_users",
		"Get a paginated per-user breakdown with total_groups, group_count, and a users array containing request count, cost, and token usage. Use this for billing, audits, or top-consumer analysis; use get_users_analytics for aggregate active and new user trends.",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupUsers(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGroupedAnalytics(analytics, "users")),
					},
				],
			};
		},
	);

	server.tool(
		"get_analytics_group_models",
		"Get a paginated per-model breakdown with total_groups, group_count, and a models array containing request count, cost, and token usage. Use this to compare model cost, popularity, and efficiency; use get_token_analytics or get_cost_analytics for time-series trends instead.",
		paginatedAnalyticsSchema,
		async (params) => {
			const analytics = await service.analytics.getAnalyticsGroupModels(
				normalizeAnalyticsParams(params),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatGroupedAnalytics(analytics, "models")),
					},
				],
			};
		},
	);

	server.tool(
		"get_analytics_group_metadata",
		"Get a paginated metadata breakdown with total_groups, group_count, and a metadata_groups array grouped by the required metadata_key. Use this for custom breakdowns like per-environment or per-feature analysis; pass metadata_key in addition to the time window.",
		analyticsGroupMetadataSchema,
		async (params) => {
			const { metadata_key, ...analyticsParams } = params;
			const analytics = await service.analytics.getAnalyticsGroupMetadata(
				metadata_key,
				normalizeAnalyticsParams(analyticsParams),
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatGroupedAnalytics(analytics, "metadata_groups"),
						),
					},
				],
			};
		},
	);
}
