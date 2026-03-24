import { BaseService } from "./base.service.js";

// Usage Limit Types
export interface UsageLimit {
	id: string;
	name: string;
	workspace_id: string;
	status: string;
	value: number;
	metric: string;
	period: string;
	created_at: string;
	updated_at: string;
	created_by?: string;
	updated_by?: string;
}

export interface ListUsageLimitsResponse {
	success: boolean;
	data: UsageLimit[];
}

export interface GetUsageLimitResponse {
	success: boolean;
	data: UsageLimit;
}

export interface CreateUsageLimitRequest {
	name: string;
	workspace_id?: string;
	value: number;
	metric: string;
	period: string;
}

export interface UpdateUsageLimitRequest {
	name?: string;
	value?: number;
	metric?: string;
	period?: string;
	status?: string;
}

// Rate Limit Types
export interface RateLimit {
	id: string;
	name: string;
	workspace_id: string;
	status: string;
	value: number;
	metric: string;
	window: string;
	created_at: string;
	updated_at: string;
	created_by?: string;
	updated_by?: string;
}

export interface ListRateLimitsResponse {
	success: boolean;
	data: RateLimit[];
}

export interface GetRateLimitResponse {
	success: boolean;
	data: RateLimit;
}

export interface CreateRateLimitRequest {
	name: string;
	workspace_id?: string;
	value: number;
	metric: string;
	window: string;
}

export interface UpdateRateLimitRequest {
	name?: string;
	value?: number;
	metric?: string;
	window?: string;
	status?: string;
}

// Usage Limit Entity Types
export interface UsageLimitEntity {
	id: string;
	entity_id: string;
	entity_type: string;
	usage: number;
	limit_id: string;
	last_reset_at?: string;
}

export interface ListUsageLimitEntitiesResponse {
	success: boolean;
	data: UsageLimitEntity[];
}

export class LimitsService extends BaseService {
	// Usage Limits Methods

	async listUsageLimits(
		workspace_id?: string,
	): Promise<ListUsageLimitsResponse> {
		return this.get<ListUsageLimitsResponse>("/policies/usage-limits", {
			workspace_id,
		});
	}

	async getUsageLimit(id: string): Promise<GetUsageLimitResponse> {
		if (!id?.trim()) {
			throw new Error("Usage limit ID is required");
		}
		return this.get<GetUsageLimitResponse>(`/policies/usage-limits/${id}`);
	}

	async createUsageLimit(
		data: CreateUsageLimitRequest,
	): Promise<GetUsageLimitResponse> {
		return this.post<GetUsageLimitResponse>("/policies/usage-limits", data);
	}

	async updateUsageLimit(
		id: string,
		data: UpdateUsageLimitRequest,
	): Promise<GetUsageLimitResponse> {
		return this.put<GetUsageLimitResponse>(
			`/policies/usage-limits/${id}`,
			data,
		);
	}

	async deleteUsageLimit(id: string): Promise<{ success: boolean }> {
		return this.delete<{ success: boolean }>(`/policies/usage-limits/${id}`);
	}

	// Rate Limits Methods

	async listRateLimits(workspace_id?: string): Promise<ListRateLimitsResponse> {
		return this.get<ListRateLimitsResponse>("/policies/rate-limits", {
			workspace_id,
		});
	}

	async getRateLimit(id: string): Promise<GetRateLimitResponse> {
		return this.get<GetRateLimitResponse>(`/policies/rate-limits/${id}`);
	}

	async createRateLimit(
		data: CreateRateLimitRequest,
	): Promise<GetRateLimitResponse> {
		return this.post<GetRateLimitResponse>("/policies/rate-limits", data);
	}

	async updateRateLimit(
		id: string,
		data: UpdateRateLimitRequest,
	): Promise<GetRateLimitResponse> {
		return this.put<GetRateLimitResponse>(`/policies/rate-limits/${id}`, data);
	}

	async deleteRateLimit(id: string): Promise<{ success: boolean }> {
		return this.delete<{ success: boolean }>(`/policies/rate-limits/${id}`);
	}

	// Usage Limit Entity Methods

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
		await this.put(
			`/policies/usage-limits/${limitId}/entities/${entityId}/reset`,
			{},
		);
		return { success: true };
	}
}
