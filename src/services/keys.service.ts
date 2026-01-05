import { BaseService } from "./base.service.js";

// Virtual Key Types
export interface VirtualKeyRateLimit {
	type: "requests";
	unit: "rpm";
	value: number;
}

export interface VirtualKeyUsageLimits {
	alert_threshold: number;
	credit_limit: number;
	periodic_reset: "monthly";
}

export interface VirtualKey {
	name: string;
	note: string | null;
	status: "active" | "exhausted";
	usage_limits: VirtualKeyUsageLimits | null;
	reset_usage: number | null;
	created_at: string;
	slug: string;
	model_config: Record<string, unknown>;
	rate_limits: VirtualKeyRateLimit[] | null;
	object: "virtual-key";
}

export interface ListVirtualKeysResponse {
	object: "list";
	total: number;
	data: VirtualKey[];
}

// Phase 2: Virtual Key Create/Update Types
export interface CreateVirtualKeyRequest {
	name: string;
	provider: string;
	key: string;
	note?: string | null;
	workspace_id?: string;
	apiVersion?: string | null;
	resourceName?: string | null;
	deploymentName?: string | null;
	usage_limits?: Partial<VirtualKeyUsageLimits>;
	rate_limits?: VirtualKeyRateLimit[];
}

export interface CreateVirtualKeyResponse {
	success: boolean;
	data: {
		slug: string;
	};
}

export interface UpdateVirtualKeyRequest {
	name?: string;
	key?: string;
	note?: string | null;
	usage_limits?: Partial<VirtualKeyUsageLimits>;
	rate_limits?: VirtualKeyRateLimit[];
}

// Phase 2: API Key Types
export interface ApiKeyRateLimit {
	type: "requests";
	unit: "rpm";
	value: number;
}

export interface ApiKeyUsageLimits {
	credit_limit: number;
	periodic_reset: "monthly";
	alert_threshold: number;
}

export interface ApiKeyDefaults {
	metadata?: Record<string, string>;
	config_id?: string;
}

export interface ApiKey {
	id: string;
	key: string;
	name: string;
	description?: string;
	type: "organisation-service" | "workspace-service" | "workspace-user";
	organisation_id: string;
	workspace_id?: string;
	user_id?: string;
	status: "active" | "exhausted";
	created_at: string;
	last_updated_at: string;
	creation_mode: "ui" | "api" | "auto";
	rate_limits: ApiKeyRateLimit[] | null;
	usage_limits: ApiKeyUsageLimits | null;
	reset_usage: number | null;
	scopes: string[];
	defaults: ApiKeyDefaults | null;
	alert_emails: string[];
	expires_at: string | null;
	object: "api-key";
}

export interface ListApiKeysResponse {
	total: number;
	object: "list";
	data: ApiKey[];
}

export interface ListApiKeysParams {
	page_size?: number;
	current_page?: number;
	workspace_id?: string;
}

export interface CreateApiKeyRequest {
	name: string;
	description?: string;
	workspace_id?: string;
	user_id?: string;
	rate_limits?: ApiKeyRateLimit[];
	usage_limits?: Partial<ApiKeyUsageLimits>;
	scopes?: string[];
	defaults?: ApiKeyDefaults;
	alert_emails?: string[];
	expires_at?: string;
}

export interface CreateApiKeyResponse {
	id: string;
	key: string;
	object: "api-key";
}

export interface UpdateApiKeyRequest {
	name?: string;
	description?: string;
	rate_limits?: ApiKeyRateLimit[];
	usage_limits?: Partial<ApiKeyUsageLimits>;
	scopes?: string[];
	defaults?: ApiKeyDefaults;
	alert_emails?: string[];
}

export class KeysService extends BaseService {
	// Virtual Keys
	async listVirtualKeys(): Promise<ListVirtualKeysResponse> {
		return this.get<ListVirtualKeysResponse>("/virtual-keys");
	}

	// Phase 2: Virtual Keys CRUD
	async createVirtualKey(
		data: CreateVirtualKeyRequest,
	): Promise<CreateVirtualKeyResponse> {
		return this.post<CreateVirtualKeyResponse>("/virtual-keys", data);
	}

	async getVirtualKey(slug: string): Promise<VirtualKey> {
		return this.get<VirtualKey>(`/virtual-keys/${slug}`);
	}

	async updateVirtualKey(
		slug: string,
		data: UpdateVirtualKeyRequest,
	): Promise<VirtualKey> {
		return this.put<VirtualKey>(`/virtual-keys/${slug}`, data);
	}

	async deleteVirtualKey(slug: string): Promise<{ success: boolean }> {
		await this.delete(`/virtual-keys/${slug}`);
		return { success: true };
	}

	// Phase 2: API Keys CRUD
	async createApiKey(
		type: "organisation" | "workspace",
		subType: "user" | "service",
		data: CreateApiKeyRequest,
	): Promise<CreateApiKeyResponse> {
		return this.post<CreateApiKeyResponse>(
			`/api-keys/${type}/${subType}`,
			data,
		);
	}

	async listApiKeys(params?: ListApiKeysParams): Promise<ListApiKeysResponse> {
		return this.get<ListApiKeysResponse>("/api-keys", {
			page_size: params?.page_size,
			current_page: params?.current_page,
			workspace_id: params?.workspace_id,
		});
	}

	async getApiKey(id: string): Promise<ApiKey> {
		return this.get<ApiKey>(`/api-keys/${id}`);
	}

	async updateApiKey(
		id: string,
		data: UpdateApiKeyRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/api-keys/${id}`, data);
		return { success: true };
	}

	async deleteApiKey(id: string): Promise<{ success: boolean }> {
		await this.delete(`/api-keys/${id}`);
		return { success: true };
	}
}
