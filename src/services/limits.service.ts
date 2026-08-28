import { BaseService } from "./base.service.js";

export type PolicyStatus = "active" | "archived";
export type RateLimitUnit = "rpm" | "rph" | "rpd" | "rpw";
export type RateLimitTarget = "llm" | "mcp_tools";

export interface LimitCondition {
	key: string;
	value: string | string[];
	excludes?: string | string[];
}

export interface LimitGroupBy {
	key: string;
}

export interface RateLimit {
	id: string;
	name?: string | null;
	type: "requests" | "tokens";
	unit: RateLimitUnit;
	value: number;
	target?: RateLimitTarget;
	status: PolicyStatus;
	conditions: LimitCondition[];
	group_by: LimitGroupBy[];
	workspace_id: string;
	organisation_id: string;
	created_at: string;
	last_updated_at: string;
	object?: string;
}

export interface ListRateLimitsParams {
	workspace_id?: string;
	status?: PolicyStatus;
	type?: "requests" | "tokens";
	unit?: RateLimitUnit;
	target?: RateLimitTarget;
	page_size?: number;
	current_page?: number;
}

export interface ListRateLimitsResponse {
	object: "list";
	data: RateLimit[];
	total: number;
}

export interface CreateRateLimitRequest {
	conditions: LimitCondition[];
	group_by: LimitGroupBy[];
	type: "requests" | "tokens";
	unit: RateLimitUnit;
	value: number;
	name?: string;
	target?: RateLimitTarget;
	workspace_id?: string;
	organisation_id?: string;
}

export interface UpdateRateLimitRequest {
	name?: string;
	unit?: RateLimitUnit;
	value?: number;
	conditions?: LimitCondition[];
}

export interface CreatePolicyResponse {
	id?: string;
	object?: string;
}

export interface ValueKeyUsage {
	current_usage?: number;
	status?: "active" | "exhausted";
	is_threshold_alerts_sent?: boolean;
	is_exhausted_alerts_sent?: boolean;
}

export interface UsageLimit {
	id: string;
	name?: string | null;
	type: "cost" | "tokens";
	credit_limit: number;
	alert_threshold?: number | null;
	periodic_reset?: "monthly" | "weekly" | null;
	periodic_reset_days?: number | null;
	next_usage_reset_at?: string | null;
	last_reset_at?: string | null;
	status: PolicyStatus;
	conditions: LimitCondition[];
	group_by: LimitGroupBy[];
	workspace_id: string;
	organisation_id: string;
	value_key_usage_map?: Record<string, ValueKeyUsage>;
	created_at: string;
	last_updated_at: string;
	object?: string;
}

export interface ListUsageLimitsParams {
	workspace_id?: string;
	status?: PolicyStatus;
	type?: "cost" | "tokens";
	page_size?: number;
	current_page?: number;
}

export interface ListUsageLimitsResponse {
	object: "list";
	data: UsageLimit[];
	total: number;
}

export interface GetUsageLimitParams {
	status?: PolicyStatus;
	include_usage?: boolean;
}

export interface CreateUsageLimitRequest {
	conditions: LimitCondition[];
	group_by: LimitGroupBy[];
	type: "cost" | "tokens";
	credit_limit: number;
	name?: string;
	alert_threshold?: number | null;
	periodic_reset?: "monthly" | "weekly" | null;
	workspace_id?: string;
	organisation_id?: string;
}

export interface UpdateUsageLimitRequest {
	name?: string;
	credit_limit?: number;
	alert_threshold?: number | null;
	periodic_reset?: "monthly" | "weekly" | null;
	reset_usage_for_value?: string;
}

export interface UsageLimitEntity {
	id: string;
	value_key: string;
	current_usage: number;
}

export interface ListUsageLimitEntitiesParams {
	status?: "active" | "exhausted";
	search?: string;
	page_size?: number;
	current_page?: number;
}

export interface ListUsageLimitEntitiesResponse {
	object: "list";
	data: UsageLimitEntity[];
	total: number;
}

export class LimitsService extends BaseService {
	async listRateLimits(
		params?: ListRateLimitsParams,
	): Promise<ListRateLimitsResponse> {
		return this.get<ListRateLimitsResponse>("/policies/rate-limits", params);
	}

	async getRateLimit(id: string, status?: PolicyStatus): Promise<RateLimit> {
		if (!id.trim()) throw new Error("Rate limit ID is required");
		return this.get<RateLimit>(
			`/policies/rate-limits/${this.encodePathSegment(id)}`,
			{ status },
		);
	}

	async createRateLimit(
		data: CreateRateLimitRequest,
	): Promise<CreatePolicyResponse> {
		return this.post<CreatePolicyResponse>("/policies/rate-limits", data);
	}

	async updateRateLimit(
		id: string,
		data: UpdateRateLimitRequest,
	): Promise<Record<string, never>> {
		if (!id.trim()) throw new Error("Rate limit ID is required");
		return this.put<Record<string, never>>(
			`/policies/rate-limits/${this.encodePathSegment(id)}`,
			data,
		);
	}

	async deleteRateLimit(id: string): Promise<{ success: true }> {
		if (!id.trim()) throw new Error("Rate limit ID is required");
		await this.delete<Record<string, never>>(
			`/policies/rate-limits/${this.encodePathSegment(id)}`,
		);
		return { success: true };
	}

	async listUsageLimits(
		params?: ListUsageLimitsParams,
	): Promise<ListUsageLimitsResponse> {
		return this.get<ListUsageLimitsResponse>("/policies/usage-limits", params);
	}

	async getUsageLimit(
		id: string,
		params?: GetUsageLimitParams,
	): Promise<UsageLimit> {
		if (!id.trim()) throw new Error("Usage limit ID is required");
		return this.get<UsageLimit>(
			`/policies/usage-limits/${this.encodePathSegment(id)}`,
			params,
		);
	}

	async createUsageLimit(
		data: CreateUsageLimitRequest,
	): Promise<CreatePolicyResponse> {
		return this.post<CreatePolicyResponse>("/policies/usage-limits", data);
	}

	async updateUsageLimit(
		id: string,
		data: UpdateUsageLimitRequest,
	): Promise<Record<string, never>> {
		if (!id.trim()) throw new Error("Usage limit ID is required");
		return this.put<Record<string, never>>(
			`/policies/usage-limits/${this.encodePathSegment(id)}`,
			data,
		);
	}

	async deleteUsageLimit(id: string): Promise<{ success: true }> {
		if (!id.trim()) throw new Error("Usage limit ID is required");
		await this.delete<Record<string, never>>(
			`/policies/usage-limits/${this.encodePathSegment(id)}`,
		);
		return { success: true };
	}

	async listUsageLimitEntities(
		limitId: string,
		params?: ListUsageLimitEntitiesParams,
	): Promise<ListUsageLimitEntitiesResponse> {
		if (!limitId.trim()) throw new Error("Usage limit ID is required");
		return this.get<ListUsageLimitEntitiesResponse>(
			`/policies/usage-limits/${this.encodePathSegment(limitId)}/entities`,
			params,
		);
	}

	async resetUsageLimitEntity(
		limitId: string,
		entityId: string,
	): Promise<{ success: true }> {
		if (!limitId.trim()) throw new Error("Usage limit ID is required");
		if (!entityId.trim()) throw new Error("Entity ID is required");
		await this.put<Record<string, never>>(
			`/policies/usage-limits/${this.encodePathSegment(limitId)}/entities/${this.encodePathSegment(entityId)}/reset`,
		);
		return { success: true };
	}
}
