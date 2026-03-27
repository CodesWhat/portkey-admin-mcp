import { BaseService } from "./base.service.js";

// ── Shared condition / group_by types ──

export interface LimitCondition {
	field: string;
	operator: string;
	value: string;
}

// ── Rate Limit Types ──

export interface RateLimit {
	id: string;
	name?: string;
	type: "requests" | "tokens";
	unit: "rpm" | "rph" | "rpd";
	value: number;
	status: string;
	conditions: LimitCondition[];
	group_by: string[];
	workspace_id?: string;
	organisation_id?: string;
	created_at: string;
	last_updated_at: string;
	object: string;
}

export interface ListRateLimitsResponse {
	object: "list";
	data: RateLimit[];
	total: number;
}

export interface CreateRateLimitRequest {
	conditions: LimitCondition[];
	group_by: string[];
	type: "requests" | "tokens";
	unit: "rpm" | "rph" | "rpd";
	value: number;
	name?: string;
	workspace_id?: string;
	organisation_id?: string;
}

export interface UpdateRateLimitRequest {
	name?: string;
	unit?: "rpm" | "rph" | "rpd";
	value?: number;
}

// ── Usage Limit Types ──

export interface UsageLimit {
	id: string;
	name?: string;
	type: "cost" | "tokens";
	credit_limit: number;
	alert_threshold?: number;
	periodic_reset?: "monthly" | "weekly";
	status: string;
	conditions: LimitCondition[];
	group_by: string[];
	workspace_id?: string;
	organisation_id?: string;
	value_key_usage_map?: Record<string, unknown>;
	created_at: string;
	last_updated_at: string;
	object: string;
}

export interface ListUsageLimitsResponse {
	object: "list";
	data: UsageLimit[];
	total: number;
}

export interface CreateUsageLimitRequest {
	conditions: LimitCondition[];
	group_by: string[];
	type: "cost" | "tokens";
	credit_limit: number;
	name?: string;
	alert_threshold?: number;
	periodic_reset?: "monthly" | "weekly";
	workspace_id?: string;
	organisation_id?: string;
}

export interface UpdateUsageLimitRequest {
	name?: string;
	credit_limit?: number;
	alert_threshold?: number;
	periodic_reset?: "monthly" | "weekly";
	reset_usage_for_value?: string;
}

// ── Usage Limit Entity Types ──

export interface UsageLimitEntity {
	id: string;
	entity_id: string;
	entity_type: string;
	usage: number;
	limit_id: string;
	last_reset_at?: string;
}

export interface ListUsageLimitEntitiesResponse {
	object: "list";
	data: UsageLimitEntity[];
	total: number;
}

export class LimitsService extends BaseService {
	// ── Rate Limits ──

	async listRateLimits(
		workspace_id?: string,
	): Promise<ListRateLimitsResponse> {
		return this.get<ListRateLimitsResponse>("/policies/rate-limits", {
			workspace_id,
		});
	}

	async getRateLimit(id: string): Promise<RateLimit> {
		if (!id?.trim()) {
			throw new Error("Rate limit ID is required");
		}
		return this.get<RateLimit>(`/policies/rate-limits/${id}`);
	}

	async createRateLimit(data: CreateRateLimitRequest): Promise<RateLimit> {
		return this.post<RateLimit>("/policies/rate-limits", data);
	}

	async updateRateLimit(
		id: string,
		data: UpdateRateLimitRequest,
	): Promise<RateLimit> {
		if (!id?.trim()) {
			throw new Error("Rate limit ID is required");
		}
		return this.put<RateLimit>(`/policies/rate-limits/${id}`, data);
	}

	async deleteRateLimit(id: string): Promise<{ success: boolean }> {
		if (!id?.trim()) {
			throw new Error("Rate limit ID is required");
		}
		return this.delete<{ success: boolean }>(`/policies/rate-limits/${id}`);
	}

	// ── Usage Limits ──

	async listUsageLimits(
		workspace_id?: string,
	): Promise<ListUsageLimitsResponse> {
		return this.get<ListUsageLimitsResponse>("/policies/usage-limits", {
			workspace_id,
		});
	}

	async getUsageLimit(id: string): Promise<UsageLimit> {
		if (!id?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		return this.get<UsageLimit>(`/policies/usage-limits/${id}`);
	}

	async createUsageLimit(data: CreateUsageLimitRequest): Promise<UsageLimit> {
		return this.post<UsageLimit>("/policies/usage-limits", data);
	}

	async updateUsageLimit(
		id: string,
		data: UpdateUsageLimitRequest,
	): Promise<UsageLimit> {
		if (!id?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		return this.put<UsageLimit>(`/policies/usage-limits/${id}`, data);
	}

	async deleteUsageLimit(id: string): Promise<{ success: boolean }> {
		if (!id?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		return this.delete<{ success: boolean }>(`/policies/usage-limits/${id}`);
	}

	// ── Usage Limit Entities ──

	async listUsageLimitEntities(
		limitId: string,
	): Promise<ListUsageLimitEntitiesResponse> {
		if (!limitId?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		return this.get<ListUsageLimitEntitiesResponse>(
			`/policies/usage-limits/${limitId}/entities`,
		);
	}

	async resetUsageLimitEntity(
		limitId: string,
		entityId: string,
	): Promise<{ success: boolean }> {
		if (!limitId?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		if (!entityId?.trim()) {
			throw new Error("Entity ID is required");
		}
		return this.post<{ success: boolean }>(
			`/policies/usage-limits/${limitId}/entities/reset`,
			{ entity_id: entityId },
		);
	}
}
