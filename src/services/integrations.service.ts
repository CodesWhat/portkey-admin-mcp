import { BaseService } from "./base.service.js";

// Integration Types
export interface IntegrationConfigurations {
	// OpenAI / Azure OpenAI specific
	api_version?: string;
	resource_name?: string;
	deployment_name?: string;
	// AWS Bedrock specific
	aws_region?: string;
	aws_access_key_id?: string;
	aws_secret_access_key?: string;
	aws_session_token?: string;
	// Vertex AI specific
	vertex_project_id?: string;
	vertex_region?: string;
	vertex_service_account_json?: string;
	// Custom base URL
	custom_host?: string;
	// Generic key-value for provider-specific configs
	[key: string]: unknown;
}

export interface IntegrationUsageLimits {
	credit_limit?: number;
	alert_threshold?: number;
	periodic_reset?: "monthly";
}

export interface IntegrationRateLimits {
	type: "requests";
	unit: "rpm";
	value: number;
}

export interface GlobalWorkspaceAccessSettings {
	usage_limits?: IntegrationUsageLimits | null;
	rate_limits?: IntegrationRateLimits[] | null;
}

export interface Integration {
	id: string;
	organisation_id: string;
	ai_provider_id: string;
	name: string;
	status: "active" | "archived";
	created_at: string;
	last_updated_at: string | null;
	slug: string;
	description: string | null;
	object: "integration";
	masked_key?: string;
	configurations?: IntegrationConfigurations;
	global_workspace_access_settings?: GlobalWorkspaceAccessSettings;
	allow_all_models?: boolean;
	workspace_count?: number;
}

export interface ListIntegrationsResponse {
	object: "list";
	total: number;
	data: Integration[];
}

export interface ListIntegrationsParams {
	current_page?: number;
	page_size?: number;
	workspace_id?: string;
	type?: "workspace" | "organisation" | "all";
}

export interface CreateIntegrationRequest {
	name: string;
	ai_provider_id: string;
	slug?: string;
	key?: string;
	description?: string;
	workspace_id?: string;
	configurations?: IntegrationConfigurations;
}

export interface CreateIntegrationResponse {
	id: string;
	slug: string;
}

export interface UpdateIntegrationRequest {
	name?: string;
	key?: string;
	description?: string;
	configurations?: IntegrationConfigurations;
}

// Integration Model Types
export interface IntegrationModel {
	id: string;
	model_id: string;
	model_name: string;
	enabled: boolean;
	custom: boolean;
	created_at: string;
	last_updated_at: string | null;
}

export interface ListIntegrationModelsResponse {
	object: "list";
	total: number;
	data: IntegrationModel[];
}

export interface ListIntegrationModelsParams {
	current_page?: number;
	page_size?: number;
}

export interface UpdateIntegrationModelsRequest {
	models: Array<{
		model_id: string;
		model_name?: string;
		enabled: boolean;
		custom?: boolean;
	}>;
}

// Integration Workspace Types
export interface IntegrationWorkspace {
	id: string;
	workspace_id: string;
	workspace_name: string;
	enabled: boolean;
	usage_limits?: IntegrationUsageLimits | null;
	rate_limits?: IntegrationRateLimits[] | null;
	created_at: string;
	last_updated_at: string | null;
}

export interface ListIntegrationWorkspacesResponse {
	object: "list";
	total: number;
	data: IntegrationWorkspace[];
}

export interface ListIntegrationWorkspacesParams {
	current_page?: number;
	page_size?: number;
}

export interface UpdateIntegrationWorkspacesRequest {
	workspaces: Array<{
		workspace_id: string;
		enabled: boolean;
		usage_limits?: IntegrationUsageLimits | null;
		rate_limits?: IntegrationRateLimits[] | null;
	}>;
}

export class IntegrationsService extends BaseService {
	// List all integrations
	async listIntegrations(
		params?: ListIntegrationsParams,
	): Promise<ListIntegrationsResponse> {
		return this.get<ListIntegrationsResponse>("/integrations", {
			current_page: params?.current_page,
			page_size: params?.page_size,
			workspace_id: params?.workspace_id,
			type: params?.type,
		});
	}

	// Create a new integration
	async createIntegration(
		data: CreateIntegrationRequest,
	): Promise<CreateIntegrationResponse> {
		return this.post<CreateIntegrationResponse>("/integrations", data);
	}

	// Get a specific integration by slug
	async getIntegration(slug: string): Promise<Integration> {
		return this.get<Integration>(`/integrations/${slug}`);
	}

	// Update an integration
	async updateIntegration(
		slug: string,
		data: UpdateIntegrationRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/integrations/${slug}`, data);
		return { success: true };
	}

	// Delete an integration
	async deleteIntegration(slug: string): Promise<{ success: boolean }> {
		await this.delete(`/integrations/${slug}`);
		return { success: true };
	}

	// List models for an integration
	async listIntegrationModels(
		slug: string,
		params?: ListIntegrationModelsParams,
	): Promise<ListIntegrationModelsResponse> {
		return this.get<ListIntegrationModelsResponse>(
			`/integrations/${slug}/models`,
			{
				current_page: params?.current_page,
				page_size: params?.page_size,
			},
		);
	}

	// Update models for an integration
	async updateIntegrationModels(
		slug: string,
		data: UpdateIntegrationModelsRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/integrations/${slug}/models`, data);
		return { success: true };
	}

	// Delete a specific model from an integration
	async deleteIntegrationModel(
		slug: string,
		modelId: string,
	): Promise<{ success: boolean }> {
		await this.delete(`/integrations/${slug}/models/${modelId}`);
		return { success: true };
	}

	// List workspaces for an integration
	async listIntegrationWorkspaces(
		slug: string,
		params?: ListIntegrationWorkspacesParams,
	): Promise<ListIntegrationWorkspacesResponse> {
		return this.get<ListIntegrationWorkspacesResponse>(
			`/integrations/${slug}/workspaces`,
			{
				current_page: params?.current_page,
				page_size: params?.page_size,
			},
		);
	}

	// Update workspaces for an integration
	async updateIntegrationWorkspaces(
		slug: string,
		data: UpdateIntegrationWorkspacesRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/integrations/${slug}/workspaces`, data);
		return { success: true };
	}
}
