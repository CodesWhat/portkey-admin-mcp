import { BaseService } from "./base.service.js";

// ===== Types =====

export interface McpServer {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	mcp_integration_id: string;
	status: "active" | "archived";
	created_at: string;
	object: "mcp-server";
}

export interface ListMcpServersResponse {
	object: "list";
	total: number;
	data: McpServer[];
}

export interface ListMcpServersParams {
	current_page?: number;
	page_size?: number;
	workspace_id?: string;
}

export interface CreateMcpServerRequest {
	name: string;
	mcp_integration_id: string;
	slug?: string;
	description?: string;
}

export interface CreateMcpServerResponse {
	id: string;
	slug: string;
}

export interface UpdateMcpServerRequest {
	name?: string;
	description?: string;
}

// Sub-resource: Capabilities
export interface McpServerCapability {
	id: string;
	name: string;
	enabled: boolean;
	type?: string;
	created_at?: string;
	last_updated_at?: string | null;
}

export interface McpServerCapabilityCounts {
	tools: { total: number; enabled: number };
	prompts: { total: number; enabled: number };
	resources: { total: number; enabled: number };
	resource_templates: { total: number; enabled: number };
}

export interface ListMcpServerCapabilitiesResponse {
	object: "list";
	counts: McpServerCapabilityCounts;
	total: number;
	has_more: boolean;
	data: McpServerCapability[];
}

export interface UpdateMcpServerCapabilitiesRequest {
	capabilities: Array<{
		id: string;
		enabled: boolean;
	}>;
}

// Sub-resource: User Access
export interface McpServerUserAccess {
	user_id: string;
	first_name: string;
	last_name: string;
	enabled: boolean;
	has_override: boolean;
	connection_status: string;
	object: "user-acces";
}

export interface ListMcpServerUserAccessResponse {
	object: "list";
	default_user_access: string;
	total: number;
	has_more: boolean;
	data: McpServerUserAccess[];
}

export interface UpdateMcpServerUserAccessRequest {
	users: Array<{
		user_id: string;
		enabled: boolean;
	}>;
}

// Test connectivity
export interface TestMcpServerResponse {
	success: boolean;
	error?: string;
	url?: string;
	server_name?: string;
	object: "mcp-server";
}

// ===== Service =====

export class McpServersService extends BaseService {
	async listMcpServers(
		params?: ListMcpServersParams,
	): Promise<ListMcpServersResponse> {
		return this.get<ListMcpServersResponse>("/mcp-servers", {
			current_page: params?.current_page,
			page_size: params?.page_size,
			workspace_id: params?.workspace_id,
		});
	}

	async createMcpServer(
		data: CreateMcpServerRequest,
	): Promise<CreateMcpServerResponse> {
		return this.post<CreateMcpServerResponse>("/mcp-servers", data);
	}

	async getMcpServer(id: string): Promise<McpServer> {
		return this.get<McpServer>(`/mcp-servers/${id}`);
	}

	async updateMcpServer(
		id: string,
		data: UpdateMcpServerRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-servers/${id}`, data);
		return { success: true };
	}

	async deleteMcpServer(id: string): Promise<{ success: boolean }> {
		await this.delete(`/mcp-servers/${id}`);
		return { success: true };
	}

	async testMcpServer(id: string): Promise<TestMcpServerResponse> {
		return this.post<TestMcpServerResponse>(`/mcp-servers/${id}/test`, {});
	}

	async listMcpServerCapabilities(
		id: string,
	): Promise<ListMcpServerCapabilitiesResponse> {
		return this.get<ListMcpServerCapabilitiesResponse>(
			`/mcp-servers/${id}/capabilities`,
		);
	}

	async updateMcpServerCapabilities(
		id: string,
		data: UpdateMcpServerCapabilitiesRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-servers/${id}/capabilities`, data);
		return { success: true };
	}

	async listMcpServerUserAccess(
		id: string,
	): Promise<ListMcpServerUserAccessResponse> {
		return this.get<ListMcpServerUserAccessResponse>(
			`/mcp-servers/${id}/user-access`,
		);
	}

	async updateMcpServerUserAccess(
		id: string,
		data: UpdateMcpServerUserAccessRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-servers/${id}/user-access`, data);
		return { success: true };
	}
}
