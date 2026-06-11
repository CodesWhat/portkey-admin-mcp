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
	object: "list";
	total: number;
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
	id: string;
	name: string;
	workspace_id: string;
	slug: string;
	organisation_id: string;
	is_default: number;
	status: string;
	owner_id: string;
	updated_by: string;
	created_at: string;
	last_updated_at: string;
	config: ConfigDetails;
	format: string;
	type: string;
	version_id: string;
	object: "config";
}

interface RawGetConfigResponse {
	id: string;
	name: string;
	workspace_id: string;
	slug: string;
	organisation_id: string;
	is_default: number;
	status: string;
	owner_id: string;
	updated_by: string;
	created_at: string;
	last_updated_at: string;
	config: string;
	format: string;
	type: string;
	version_id: string;
	object: "config";
}

// Phase 1 types
export interface CreateConfigRequest {
	name: string;
	config: ConfigDetails;
	workspace_id?: string;
}

export interface CreateConfigApiResponse {
	success: boolean;
	data: {
		id: string;
		version_id: string;
	};
}

export interface CreateConfigResponse {
	id: string;
	version_id: string;
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

export interface ListConfigsParams {
	page_size?: number;
	current_page?: number;
}

export class ConfigsService extends BaseService {
	private parseConfigResponse(
		response: RawGetConfigResponse,
	): GetConfigResponse {
		return {
			...response,
			config: JSON.parse(response.config || "{}") as ConfigDetails,
		};
	}

	async listConfigs(params?: ListConfigsParams): Promise<ListConfigsResponse> {
		return this.get<ListConfigsResponse>("/configs", {
			page_size: params?.page_size,
			current_page: params?.current_page,
		});
	}

	async getConfig(slug: string): Promise<GetConfigResponse> {
		const response = await this.get<RawGetConfigResponse>(
			`/configs/${this.encodePathSegment(slug)}`,
		);
		return this.parseConfigResponse(response);
	}

	// Phase 1: Config CRUD
	async createConfig(data: CreateConfigRequest): Promise<CreateConfigResponse> {
		const response = await this.post<CreateConfigApiResponse>("/configs", data);
		return response.data;
	}

	async updateConfig(
		slug: string,
		data: UpdateConfigRequest,
	): Promise<GetConfigResponse> {
		const response = await this.put<RawGetConfigResponse>(
			`/configs/${this.encodePathSegment(slug)}`,
			data,
		);
		return this.parseConfigResponse(response);
	}

	async deleteConfig(slug: string): Promise<{ success: boolean }> {
		return this.delete<{ success: boolean }>(
			`/configs/${this.encodePathSegment(slug)}`,
		);
	}

	async listConfigVersions(slug: string): Promise<ConfigVersionsResponse> {
		return this.get<ConfigVersionsResponse>(
			`/configs/${this.encodePathSegment(slug)}/versions`,
		);
	}
}
