import { BaseService } from "./base.service.js";

// Types
export interface PortkeyUser {
	object: string;
	id: string;
	first_name: string;
	last_name: string;
	role: string;
	email: string;
	created_at: string;
	last_updated_at: string;
}

export interface PortkeyUsersResponse {
	total: number;
	object: string;
	data: PortkeyUser[];
}

export interface WorkspaceDetails {
	id: string;
	role: "admin" | "member" | "manager";
}

export interface WorkspaceApiKeyDetails {
	name?: string;
	expiry?: string;
	metadata?: Record<string, string>;
	scopes: string[];
}

export interface InviteUserRequest {
	email: string;
	role: "admin" | "member";
	first_name?: string;
	last_name?: string;
	workspaces: WorkspaceDetails[];
	workspace_api_key_details?: WorkspaceApiKeyDetails;
}

export interface InviteUserResponse {
	id: string;
	invite_link: string;
}

export interface UserInvite {
	id: string;
	email: string;
	role: string;
	status: string;
	created_at: string;
	expires_at: string;
}

export interface UserInvitesResponse {
	total: number;
	object: string;
	data: UserInvite[];
}

export interface UpdateUserRequest {
	first_name?: string;
	last_name?: string;
	role?: "admin" | "member";
}

export interface UserGroupedDataParams {
	time_of_generation_min: string;
	time_of_generation_max: string;
	total_units_min?: number;
	total_units_max?: number;
	cost_min?: number;
	cost_max?: number;
	prompt_token_min?: number;
	prompt_token_max?: number;
	completion_token_min?: number;
	completion_token_max?: number;
	status_code?: string;
	weighted_feedback_min?: number;
	weighted_feedback_max?: number;
	virtual_keys?: string;
	configs?: string;
	workspace_slug?: string;
	api_key_ids?: string;
	current_page?: number;
	page_size?: number;
	metadata?: string;
	ai_org_model?: string;
	trace_id?: string;
	span_id?: string;
}

export interface AnalyticsGroup {
	user: string;
	requests: string;
	cost: string;
	object: "analytics-group";
}

export interface UserGroupedData {
	total: number;
	object: string;
	data: AnalyticsGroup[];
}

export class UsersService extends BaseService {
	async listUsers(): Promise<PortkeyUsersResponse> {
		return this.get<PortkeyUsersResponse>("/admin/users");
	}

	async inviteUser(data: InviteUserRequest): Promise<InviteUserResponse> {
		return this.post<InviteUserResponse>("/admin/users/invites", data);
	}

	async getUserGroupedData(
		params: UserGroupedDataParams,
	): Promise<UserGroupedData> {
		return this.get<UserGroupedData>("/analytics/groups/users", {
			time_of_generation_min: params.time_of_generation_min,
			time_of_generation_max: params.time_of_generation_max,
			total_units_min: params.total_units_min,
			total_units_max: params.total_units_max,
			cost_min: params.cost_min,
			cost_max: params.cost_max,
			prompt_token_min: params.prompt_token_min,
			prompt_token_max: params.prompt_token_max,
			completion_token_min: params.completion_token_min,
			completion_token_max: params.completion_token_max,
			status_code: params.status_code,
			weighted_feedback_min: params.weighted_feedback_min,
			weighted_feedback_max: params.weighted_feedback_max,
			virtual_keys: params.virtual_keys,
			configs: params.configs,
			workspace_slug: params.workspace_slug,
			api_key_ids: params.api_key_ids,
			current_page: params.current_page,
			page_size: params.page_size,
			metadata: params.metadata,
			ai_org_model: params.ai_org_model,
			trace_id: params.trace_id,
			span_id: params.span_id,
		});
	}

	// Phase 1: User Management CRUD
	async getUser(userId: string): Promise<PortkeyUser> {
		return this.get<PortkeyUser>(`/admin/users/${userId}`);
	}

	async updateUser(
		userId: string,
		data: UpdateUserRequest,
	): Promise<PortkeyUser> {
		return this.put<PortkeyUser>(`/admin/users/${userId}`, data);
	}

	async deleteUser(userId: string): Promise<{ success: boolean }> {
		await this.delete(`/admin/users/${userId}`);
		return { success: true };
	}

	// Phase 1: User Invites CRUD
	async listUserInvites(): Promise<UserInvitesResponse> {
		return this.get<UserInvitesResponse>("/admin/users/invites");
	}

	async getUserInvite(inviteId: string): Promise<UserInvite> {
		return this.get<UserInvite>(`/admin/users/invites/${inviteId}`);
	}

	async deleteUserInvite(inviteId: string): Promise<{ success: boolean }> {
		await this.delete(`/admin/users/invites/${inviteId}`);
		return { success: true };
	}

	async resendUserInvite(inviteId: string): Promise<{ success: boolean }> {
		await this.post(`/admin/users/invites/${inviteId}/resend`);
		return { success: true };
	}
}
