import { BaseService } from "./base.service.js";

// ===== Types =====

export interface McpServer {
	id: string;
	name: string;
	slug: string;
	description?: string | null;
	tags?: Record<string, string> | null;
	mcp_integration_id: string;
	/** List responses only. */
	mcp_integration_slug?: string | null;
	/** List responses only. */
	mcp_integration_url?: string | null;
	/** Single-server responses for system/service auth only. */
	mcp_integration_details?: McpServerIntegrationDetails | null;
	status: "active" | "archived";
	created_at: string;
	object: "mcp-server";
}

export interface McpServerIntegrationDetails {
	id: string;
	slug: string;
	status: string;
	configurations?: Record<string, unknown> | null;
	url: string;
	transport: string;
	auth_type: string;
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
	id?: string;
	search?: string;
	tags?: Record<string, string>;
}

export interface CreateMcpServerRequest {
	name: string;
	mcp_integration_id: string;
	slug?: string;
	description?: string;
	workspace_id?: string;
	tags?: Record<string, string> | null;
}

export interface CreateMcpServerResponse {
	id: string;
	slug: string;
}

export interface UpdateMcpServerRequest {
	name?: string;
	description?: string;
	tags?: Record<string, string> | null;
}

// Sub-resource: Capabilities
export interface McpServerCapability {
	name: string;
	type: "tool" | "prompt" | "resource" | "resource_template";
	enabled: boolean;
	description?: string | null;
	/** Present for service users: integration-level enabled state. */
	integration_enabled?: boolean | null;
	input_schema?: Record<string, unknown> | null;
	output_schema?: Record<string, unknown> | null;
	uri_template?: string | null;
	mime_type?: string | null;
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
		name: string;
		type: "tool" | "prompt" | "resource";
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
	user_access?: Array<{
		user_id: string;
		enabled: boolean;
	}>;
	default_user_access?: "allow" | "deny";
}

// Sub-resource: Active connections
export interface ListMcpServerConnectionsParams {
	user_id?: string;
	workspace_id?: string;
	current_page?: number;
	page_size?: number;
}

export interface McpServerConnection {
	user_id: string;
	connected: boolean;
	created_at: string;
	last_updated_at: string;
}

export interface ListMcpServerConnectionsResponse {
	data: McpServerConnection[];
	total: number;
	has_more: boolean;
}

export interface DisconnectMcpServerConnectionParams {
	user_id?: string;
	workspace_id?: string;
}

// Test connectivity
export interface TestMcpServerResponse {
	success: boolean;
	error?: string;
	url?: string;
	server_name?: string;
	status_code?: number;
	response_time_ms?: number;
	object: "mcp-server";
}

// ===== Service =====

export class McpServersService extends BaseService {
	async listMcpServerConnections(
		id: string,
		params?: ListMcpServerConnectionsParams,
	): Promise<ListMcpServerConnectionsResponse> {
		return this.get<ListMcpServerConnectionsResponse>(
			`/mcp-servers/${this.encodePathSegment(id)}/connections`,
			params,
		);
	}

	async disconnectMcpServerConnection(
		id: string,
		params?: DisconnectMcpServerConnectionParams,
	): Promise<{ success: boolean }> {
		await this.delete(
			`/mcp-servers/${this.encodePathSegment(id)}/connections`,
			params,
		);
		return { success: true };
	}

	async listMcpServers(
		params?: ListMcpServersParams,
	): Promise<ListMcpServersResponse> {
		return this.get<ListMcpServersResponse>("/mcp-servers", {
			current_page: params?.current_page,
			page_size: params?.page_size,
			workspace_id: params?.workspace_id,
			id: params?.id,
			search: params?.search,
			tags:
				params?.tags === undefined ? undefined : JSON.stringify(params.tags),
		});
	}

	async createMcpServer(
		data: CreateMcpServerRequest,
	): Promise<CreateMcpServerResponse> {
		return this.post<CreateMcpServerResponse>("/mcp-servers", data);
	}

	async getMcpServer(id: string): Promise<McpServer> {
		return this.get<McpServer>(`/mcp-servers/${this.encodePathSegment(id)}`);
	}

	async updateMcpServer(
		id: string,
		data: UpdateMcpServerRequest,
	): Promise<{ success: boolean }> {
		await this.put(`/mcp-servers/${this.encodePathSegment(id)}`, data);
		return { success: true };
	}

	async deleteMcpServer(id: string): Promise<{ success: boolean }> {
		await this.delete(`/mcp-servers/${this.encodePathSegment(id)}`);
		return { success: true };
	}

	async testMcpServer(id: string): Promise<TestMcpServerResponse> {
		return this.post<TestMcpServerResponse>(
			`/mcp-servers/${this.encodePathSegment(id)}/test`,
			{},
		);
	}

	async listMcpServerCapabilities(
		id: string,
		params?: {
			current_page?: number;
			page_size?: number;
			type?: McpServerCapability["type"];
		},
	): Promise<ListMcpServerCapabilitiesResponse> {
		return this.get<ListMcpServerCapabilitiesResponse>(
			`/mcp-servers/${this.encodePathSegment(id)}/capabilities`,
			{
				current_page: params?.current_page,
				page_size: params?.page_size,
				type: params?.type,
			},
		);
	}

	async updateMcpServerCapabilities(
		id: string,
		data: UpdateMcpServerCapabilitiesRequest,
	): Promise<{ success: boolean }> {
		await this.put(
			`/mcp-servers/${this.encodePathSegment(id)}/capabilities`,
			data,
		);
		return { success: true };
	}

	async listMcpServerUserAccess(
		id: string,
		params?: { current_page?: number; page_size?: number; search?: string },
	): Promise<ListMcpServerUserAccessResponse> {
		return this.get<ListMcpServerUserAccessResponse>(
			`/mcp-servers/${this.encodePathSegment(id)}/user-access`,
			{
				current_page: params?.current_page,
				page_size: params?.page_size,
				search: params?.search,
			},
		);
	}

	async updateMcpServerUserAccess(
		id: string,
		data: UpdateMcpServerUserAccessRequest,
	): Promise<{ success: boolean }> {
		await this.put(
			`/mcp-servers/${this.encodePathSegment(id)}/user-access`,
			data,
		);
		return { success: true };
	}
}
