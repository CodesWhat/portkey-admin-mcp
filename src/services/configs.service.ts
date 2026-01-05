import { BaseService } from "./base.service.js";

// Types
export interface Config {
	id: string;
	name: string;
	slug: string;
	organisation_id: string;
	workspace_id: string;
	is_default: number;
	status: string;
	owner_id: string;
	updated_by: string;
	created_at: string;
	last_updated_at: string;
}

export interface ListConfigsResponse {
	success: boolean;
	data: Config[];
}

export interface ConfigTarget {
	provider?: string;
	virtual_key?: string;
}

export interface ConfigDetails {
	retry?: {
		attempts?: number;
		on_status_codes?: number[];
	};
	cache?: {
		mode?: string;
		max_age?: number;
	};
	strategy?: {
		mode?: string;
	};
	targets?: ConfigTarget[];
}

export interface GetConfigResponse {
	success?: boolean;
	data?: {
		config?: ConfigDetails;
	};
}

// Phase 1 types
export interface CreateConfigRequest {
	name: string;
	config: ConfigDetails;
	workspace_id?: string;
}

export interface UpdateConfigRequest {
	name?: string;
	config?: Partial<ConfigDetails>;
	status?: string;
}

export interface ConfigVersion {
	id: string;
	version: number;
	config: ConfigDetails;
	created_at: string;
	created_by?: string;
}

export interface ConfigVersionsResponse {
	object: "list";
	total: number;
	data: ConfigVersion[];
}

export class ConfigsService extends BaseService {
	async listConfigs(): Promise<ListConfigsResponse> {
		return this.get<ListConfigsResponse>("/configs");
	}

	async getConfig(slug: string): Promise<GetConfigResponse> {
		return this.get<GetConfigResponse>(`/configs/${slug}`);
	}

	// Phase 1: Config CRUD
	async createConfig(data: CreateConfigRequest): Promise<GetConfigResponse> {
		return this.post<GetConfigResponse>("/configs", data);
	}

	async updateConfig(
		slug: string,
		data: UpdateConfigRequest,
	): Promise<GetConfigResponse> {
		return this.put<GetConfigResponse>(`/configs/${slug}`, data);
	}

	async deleteConfig(slug: string): Promise<{ success: boolean }> {
		return this.delete<{ success: boolean }>(`/configs/${slug}`);
	}

	async listConfigVersions(slug: string): Promise<ConfigVersionsResponse> {
		return this.get<ConfigVersionsResponse>(`/configs/${slug}/versions`);
	}
}
