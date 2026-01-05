import { BaseService } from "./base.service.js";

// Provider Types
export interface ProviderRateLimit {
	type: "requests";
	unit: "rpm" | "rpd";
	value: number;
}

export interface ProviderUsageLimits {
	credit_limit: number;
	periodic_reset: "monthly";
	alert_threshold: number;
}

export interface Provider {
	name: string;
	integration_id: string;
	note: string | null;
	status: "active" | "exhausted" | "expired";
	usage_limits: ProviderUsageLimits | null;
	reset_usage: number | null;
	created_at: string;
	slug: string;
	rate_limits: ProviderRateLimit[] | null;
	expires_at: string | null;
	object: "provider";
}

export interface ListProvidersResponse {
	object: "list";
	total: number;
	data: Provider[];
}

export interface ListProvidersParams {
	current_page?: number;
	page_size?: number;
	workspace_id?: string;
}

export interface CreateProviderRequest {
	name: string;
	integration_id: string;
	workspace_id?: string;
	slug?: string;
	note?: string | null;
	usage_limits?: Partial<ProviderUsageLimits>;
	rate_limits?: ProviderRateLimit[];
	expires_at?: string | null;
}

export interface CreateProviderResponse {
	id: string;
	slug: string;
}

export interface UpdateProviderRequest {
	name?: string;
	note?: string | null;
	usage_limits?: Partial<ProviderUsageLimits>;
	rate_limits?: ProviderRateLimit[];
	expires_at?: string | null;
	reset_usage?: boolean;
}

export interface UpdateProviderResponse {
	id: string;
	slug: string;
}

export class ProvidersService extends BaseService {
	async listProviders(
		params?: ListProvidersParams,
	): Promise<ListProvidersResponse> {
		return this.get<ListProvidersResponse>("/providers", params);
	}

	async createProvider(
		data: CreateProviderRequest,
	): Promise<CreateProviderResponse> {
		return this.post<CreateProviderResponse>("/providers", data);
	}

	async getProvider(slug: string, workspaceId?: string): Promise<Provider> {
		return this.get<Provider>(`/providers/${slug}`, {
			workspace_id: workspaceId,
		});
	}

	async updateProvider(
		slug: string,
		data: UpdateProviderRequest,
		workspaceId?: string,
	): Promise<UpdateProviderResponse> {
		const path = workspaceId
			? `/providers/${slug}?workspace_id=${encodeURIComponent(workspaceId)}`
			: `/providers/${slug}`;
		return this.put<UpdateProviderResponse>(path, data);
	}

	async deleteProvider(
		slug: string,
		workspaceId?: string,
	): Promise<Record<string, never>> {
		const path = workspaceId
			? `/providers/${slug}?workspace_id=${encodeURIComponent(workspaceId)}`
			: `/providers/${slug}`;
		return this.delete<Record<string, never>>(path);
	}
}
