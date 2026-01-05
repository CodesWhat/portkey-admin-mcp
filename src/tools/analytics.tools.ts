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
	total_units_min: z
		.number()
		.positive()
		.optional()
		.describe("Minimum number of total tokens to filter by"),
	total_units_max: z
		.number()
		.positive()
		.optional()
		.describe("Maximum number of total tokens to filter by"),
	cost_min: z
		.number()
		.positive()
		.optional()
		.describe("Minimum cost in cents to filter by"),
	cost_max: z
		.number()
		.positive()
		.optional()
		.describe("Maximum cost in cents to filter by"),
	prompt_token_min: z
		.number()
		.positive()
		.optional()
		.describe("Minimum number of prompt tokens"),
	prompt_token_max: z
		.number()
		.positive()
		.optional()
		.describe("Maximum number of prompt tokens"),
	completion_token_min: z
		.number()
		.positive()
		.optional()
		.describe("Minimum number of completion tokens"),
	completion_token_max: z
		.number()
		.positive()
		.optional()
		.describe("Maximum number of completion tokens"),
	status_code: z
		.string()
		.optional()
		.describe("Filter by specific HTTP status codes (comma-separated)"),
	weighted_feedback_min: z
		.number()
		.min(-10)
		.max(10)
		.optional()
		.describe("Minimum weighted feedback score (-10 to 10)"),
	weighted_feedback_max: z
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
		.describe("Filter by metadata (stringified JSON object)"),
	ai_org_model: z
		.string()
		.optional()
		.describe(
			"Filter by AI provider and model (comma-separated, use __ as separator)",
		),
	trace_id: z
		.string()
		.optional()
		.describe("Filter by trace IDs (comma-separated)"),
	span_id: z
		.string()
		.optional()
		.describe("Filter by span IDs (comma-separated)"),
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
			try {
				const analytics = await service.getCostAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// ==================== Graph Analytics ====================

	server.tool(
		"get_request_analytics",
		"Retrieve request analytics as time-series data, showing total, successful, and failed requests over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getRequestAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching request analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	server.tool(
		"get_token_analytics",
		"Retrieve token usage analytics as time-series data, showing total, prompt, and completion tokens over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getTokenAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching token analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	server.tool(
		"get_latency_analytics",
		"Retrieve latency analytics as time-series data, showing average, p50, p90, and p99 latency percentiles over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getLatencyAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching latency analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	server.tool(
		"get_error_analytics",
		"Retrieve error count analytics as time-series data, showing total error counts over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getErrorAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching error analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	server.tool(
		"get_error_rate_analytics",
		"Retrieve error rate analytics as time-series data, showing the percentage of failed requests over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getErrorRateAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching error rate analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// ==================== Cache Analytics ====================

	server.tool(
		"get_cache_hit_latency",
		"Retrieve cache hit latency analytics as time-series data, showing total and average latency for cache hits over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getCacheHitLatency(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching cache hit latency analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	server.tool(
		"get_cache_hit_rate",
		"Retrieve cache hit rate analytics as time-series data, showing hit rate percentage, total hits, and misses over time",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getCacheHitRate(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching cache hit rate analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// ==================== User Analytics ====================

	server.tool(
		"get_users_analytics",
		"Retrieve user activity analytics over time, showing active and new user counts",
		baseAnalyticsSchema,
		async (params) => {
			try {
				const analytics = await service.getUsersAnalytics(params);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching users analytics: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
