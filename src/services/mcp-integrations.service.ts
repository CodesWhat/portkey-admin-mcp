import { BaseService } from "./base.service.js";

// ===== Types =====

export interface McpIntegration {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	owner_id: string;
	workspace_id?: string;
	status: "active" | "archived";
	url: string;
	auth_type: string;
	transport: string;
	type?: "workspace" | "organisation";
	configurations?: Record<string, unknown>;
	global_workspace_access?: unknown;
	created_at: string;
	last_updated_at: string | null;
	object: "mcp-integration";
}

export interface ListMcpIntegrationsResponse {
	object: "list";
	total: number;
	has_more: boolean;
	data: McpIntegration[];
}

export interface ListMcpIntegrationsParams {
	current_page?: number;
	page_size?: number;
	workspace_id?: string;
}

export interface CreateMcpIntegrationRequest {
	name: string;
	url: string;
	auth_type: string;
	transport: string;
	slug?: string;
	description?: string;
	workspace_id?: string;
	auth_token?: string;
	auth_header_name?: string;
}

export interface CreateMcpIntegrationResponse {
	id: string;
	slug: string;
}

export interface UpdateMcpIntegrationRequest {
	name?: string;
	description?: string;
	url?: string;
	auth_type?: string;
	transport?: string;
	auth_token?: string;
	auth_header_name?: string;
}

// Sub-resource: Capabilities
export interface McpIntegrationCapability {
	id: string;
	name: string;
	enabled: boolean;
	type?: string;
	created_at?: string;
	last_updated_at?: string | null;
}

export interface McpIntegrationCapabilityCounts {
	tools: { total: number; enabled: number };
	prompts: { total: number; enabled: number };
	resources: { total: number; enabled: number };
	resource_templates: { total: number; enabled: number };
}

export interface ListMcpIntegrationCapabilitiesResponse {
	object: "list";
	counts: McpIntegrationCapabilityCounts;
	total: number;
	has_more: boolean;
	data: McpIntegrationCapability[];
}

export interface UpdateMcpIntegrationCapabilitiesRequest {
	capabilities: Array<{
		id: string;
		enabled: boolean;
	}>;
}

// Sub-resource: Workspaces
export interface McpIntegrationWorkspace {
	id: string;
	enabled: boolean;
	status: string;
	created_at: string;
	last_updated_at: string;
}

export interface ListMcpIntegrationWorkspacesResponse {
	workspaces: McpIntegrationWorkspace[];
	global_workspace_access: unknown;
	object: "integration";
}

export interface UpdateMcpIntegrationWorkspacesRequest {
	workspaces: Array<{
		workspace_id: string;
		enabled: boolean;
	}>;
}

// Sub-resource: Metadata
export interface McpIntegrationMetadata {
	server_name: string | null;
	server_version: string | null;
	title: string | null;
	description: string | null;
	website_url: string | null;
	icons: unknown;
	protocol_version: string | null;
	capability_flags: unknown;
	instructions: string | null;
	sync_status: "pending" | "synced" | "error";
	last_synced_at: string | null;
	sync_error: string | null;
	object: "metadata";
}

// ===== Service =====

export class McpIntegrationsService extends BaseService {
	async listMcpIntegrations(
		params?: ListMcpIntegrationsParams,
	): Promise<ListMcpIntegrationsResponse> {
		return this.get<ListMcpIntegrationsResponse>("/mcp-integrations", {
			current_page: params?.current_page,
			page_size: params?.page_size,
			workspace_id: params?.workspace_id,
		});
	}

	async createMcpIntegration(
		data: CreateMcpIntegrationRequest,
	): Promise<CreateMcpIntegrationResponse> {
		return this.post<CreateMcpIntegrationResponse>(
			"/mcp-integrations",
			data,
		);
	}

	async getMcpIntegration(id: string): Promise<McpIntegration> {
		return this.get<McpIntegration>(`/mcp-integrations/${id}`);
	}

	async updateMcpIntegration(
		id: string,
		data: UpdateMcpIntegrationRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-integrations/${id}`, data);
		return { success: true };
	}

	async deleteMcpIntegration(id: string): Promise<{ success: boolean }> {
		await this.delete(`/mcp-integrations/${id}`);
		return { success: true };
	}

	async getMcpIntegrationMetadata(
		id: string,
	): Promise<McpIntegrationMetadata> {
		return this.get<McpIntegrationMetadata>(
			`/mcp-integrations/${id}/metadata`,
		);
	}

	async listMcpIntegrationCapabilities(
		id: string,
	): Promise<ListMcpIntegrationCapabilitiesResponse> {
		return this.get<ListMcpIntegrationCapabilitiesResponse>(
			`/mcp-integrations/${id}/capabilities`,
		);
	}

	async updateMcpIntegrationCapabilities(
		id: string,
		data: UpdateMcpIntegrationCapabilitiesRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-integrations/${id}/capabilities`, data);
		return { success: true };
	}

	async listMcpIntegrationWorkspaces(
		id: string,
	): Promise<ListMcpIntegrationWorkspacesResponse> {
		return this.get<ListMcpIntegrationWorkspacesResponse>(
			`/mcp-integrations/${id}/workspaces`,
		);
	}

	async updateMcpIntegrationWorkspaces(
		id: string,
		data: UpdateMcpIntegrationWorkspacesRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-integrations/${id}/workspaces`, data);
		return { success: true };
	}
}
