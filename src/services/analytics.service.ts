import { BaseService } from "./base.service.js";

// ==================== Common Types ====================

/**
 * Base parameters shared across all analytics endpoints
 */
export interface BaseAnalyticsParams {
	time_of_generation_min: string;
	time_of_generation_max: string;
	total_units_min?: number;
	total_units_max?: number;
	cost_min?: number;
	cost_max?: number;
	prompt_token_min?: number;
	prompt_token_max?: number;
	completion_token_min?: number;
	completion_token_max?: number;
	status_code?: string;
	weighted_feedback_min?: number;
	weighted_feedback_max?: number;
	virtual_keys?: string;
	configs?: string;
	workspace_slug?: string;
	api_key_ids?: string;
	metadata?: string;
	ai_org_model?: string;
	trace_id?: string;
	span_id?: string;
}

/**
 * Pagination parameters for grouped analytics endpoints
 */
export interface PaginatedAnalyticsParams extends BaseAnalyticsParams {
	current_page?: number;
	page_size?: number;
}

// ==================== Cost Analytics Types ====================

export interface CostDataPoint {
	timestamp: string;
	total: number;
	avg: number;
}

export interface CostSummary {
	total: number;
	avg: number;
}

export interface CostAnalyticsResponse {
	object: "analytics-graph";
	data_points: CostDataPoint[];
	summary: CostSummary;
}

export interface CostAnalyticsParams extends BaseAnalyticsParams {}

// ==================== Graph Analytics Types ====================

export interface RequestDataPoint {
	timestamp: string;
	total: number;
	success: number;
	failed: number;
}

export interface RequestSummary {
	total: number;
	success: number;
	failed: number;
}

export interface RequestAnalyticsResponse {
	object: "analytics-graph";
	data_points: RequestDataPoint[];
	summary: RequestSummary;
}

export interface TokenDataPoint {
	timestamp: string;
	total: number;
	prompt: number;
	completion: number;
}

export interface TokenSummary {
	total: number;
	prompt: number;
	completion: number;
}

export interface TokenAnalyticsResponse {
	object: "analytics-graph";
	data_points: TokenDataPoint[];
	summary: TokenSummary;
}

export interface LatencyDataPoint {
	timestamp: string;
	avg: number;
	p50: number;
	p90: number;
	p99: number;
}

export interface LatencySummary {
	avg: number;
	p50: number;
	p90: number;
	p99: number;
}

export interface LatencyAnalyticsResponse {
	object: "analytics-graph";
	data_points: LatencyDataPoint[];
	summary: LatencySummary;
}

export interface ErrorDataPoint {
	timestamp: string;
	total: number;
}

export interface ErrorSummary {
	total: number;
}

export interface ErrorAnalyticsResponse {
	object: "analytics-graph";
	data_points: ErrorDataPoint[];
	summary: ErrorSummary;
}

export interface ErrorRateDataPoint {
	timestamp: string;
	rate: number;
}

export interface ErrorRateSummary {
	rate: number;
}

export interface ErrorRateAnalyticsResponse {
	object: "analytics-graph";
	data_points: ErrorRateDataPoint[];
	summary: ErrorRateSummary;
}

// ==================== Phase 7: Extended Analytics Types ====================

// Cache Hit Latency
export interface CacheHitLatencyDataPoint {
	timestamp: string;
	total: number;
	avg: number;
}

export interface CacheHitLatencySummary {
	total: number;
	avg: number;
}

export interface CacheHitLatencyResponse {
	object: "analytics-graph";
	data_points: CacheHitLatencyDataPoint[];
	summary: CacheHitLatencySummary;
}

// Cache Hit Rate
export interface CacheHitRateDataPoint {
	timestamp: string;
	rate: number;
	hits: number;
	misses: number;
}

export interface CacheHitRateSummary {
	rate: number;
	total_hits: number;
	total_misses: number;
}

export interface CacheHitRateResponse {
	object: "analytics-graph";
	data_points: CacheHitRateDataPoint[];
	summary: CacheHitRateSummary;
}

// ==================== Users Analytics Types ====================
export interface UsersDataPoint {
	timestamp: string;
	active_users: number;
	new_users: number;
}

export interface UsersSummary {
	total_active_users: number;
	total_new_users: number;
}

export interface UsersAnalyticsResponse {
	object: "analytics-graph";
	data_points: UsersDataPoint[];
	summary: UsersSummary;
}

export class AnalyticsService extends BaseService {
	/**
	 * Helper method to build query params from analytics parameters
	 */
	private buildAnalyticsParams(
		params: BaseAnalyticsParams | PaginatedAnalyticsParams,
	): Record<string, string | number | undefined> {
		const baseParams: Record<string, string | number | undefined> = {
			time_of_generation_min: params.time_of_generation_min,
			time_of_generation_max: params.time_of_generation_max,
			total_units_min: params.total_units_min,
			total_units_max: params.total_units_max,
			cost_min: params.cost_min,
			cost_max: params.cost_max,
			prompt_token_min: params.prompt_token_min,
			prompt_token_max: params.prompt_token_max,
			completion_token_min: params.completion_token_min,
			completion_token_max: params.completion_token_max,
			status_code: params.status_code,
			weighted_feedback_min: params.weighted_feedback_min,
			weighted_feedback_max: params.weighted_feedback_max,
			virtual_keys: params.virtual_keys,
			configs: params.configs,
			workspace_slug: params.workspace_slug,
			api_key_ids: params.api_key_ids,
			metadata: params.metadata,
			ai_org_model: params.ai_org_model,
			trace_id: params.trace_id,
			span_id: params.span_id,
		};

		// Add pagination params if present
		if ("current_page" in params) {
			baseParams.current_page = params.current_page;
		}
		if ("page_size" in params) {
			baseParams.page_size = params.page_size;
		}

		return baseParams;
	}

	// ==================== Cost Analytics ====================

	async getCostAnalytics(
		params: CostAnalyticsParams,
	): Promise<CostAnalyticsResponse> {
		return this.get<CostAnalyticsResponse>(
			"/analytics/graphs/cost",
			this.buildAnalyticsParams(params),
		);
	}

	// ==================== Graph Analytics ====================

	async getRequestAnalytics(
		params: BaseAnalyticsParams,
	): Promise<RequestAnalyticsResponse> {
		return this.get<RequestAnalyticsResponse>(
			"/analytics/graphs/requests",
			this.buildAnalyticsParams(params),
		);
	}

	async getTokenAnalytics(
		params: BaseAnalyticsParams,
	): Promise<TokenAnalyticsResponse> {
		return this.get<TokenAnalyticsResponse>(
			"/analytics/graphs/tokens",
			this.buildAnalyticsParams(params),
		);
	}

	async getLatencyAnalytics(
		params: BaseAnalyticsParams,
	): Promise<LatencyAnalyticsResponse> {
		return this.get<LatencyAnalyticsResponse>(
			"/analytics/graphs/latency",
			this.buildAnalyticsParams(params),
		);
	}

	async getErrorAnalytics(
		params: BaseAnalyticsParams,
	): Promise<ErrorAnalyticsResponse> {
		return this.get<ErrorAnalyticsResponse>(
			"/analytics/graphs/errors",
			this.buildAnalyticsParams(params),
		);
	}

	async getErrorRateAnalytics(
		params: BaseAnalyticsParams,
	): Promise<ErrorRateAnalyticsResponse> {
		return this.get<ErrorRateAnalyticsResponse>(
			"/analytics/graphs/errors/rate",
			this.buildAnalyticsParams(params),
		);
	}

	// ==================== Phase 7: Extended Analytics Methods ====================

	/**
	 * Get cache hit latency analytics over time
	 */
	async getCacheHitLatency(
		params: BaseAnalyticsParams,
	): Promise<CacheHitLatencyResponse> {
		return this.get<CacheHitLatencyResponse>(
			"/analytics/graphs/cache/latency",
			this.buildAnalyticsParams(params),
		);
	}

	/**
	 * Get cache hit rate analytics over time
	 */
	async getCacheHitRate(
		params: BaseAnalyticsParams,
	): Promise<CacheHitRateResponse> {
		return this.get<CacheHitRateResponse>(
			"/analytics/graphs/cache/hit-rate",
			this.buildAnalyticsParams(params),
		);
	}

	/**
	 * Get user activity metrics
	 * Note: Returns 403 with standard API key - requires elevated permissions
	 */
	async getUsersAnalytics(
		params: BaseAnalyticsParams,
	): Promise<UsersAnalyticsResponse> {
		return this.get<UsersAnalyticsResponse>(
			"/analytics/graphs/users",
			this.buildAnalyticsParams(params),
		);
	}
}
