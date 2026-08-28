import { BaseService } from "./base.service.js";

// Types
export interface WorkspaceDefaults {
	is_default?: number;
	metadata?: Record<string, string>;
	object: "workspace";
}

export interface Workspace {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	created_at: string;
	last_updated_at: string;
	defaults: WorkspaceDefaults | null;
	usage_limits?: WorkspaceUsageLimit[];
	rate_limits?: WorkspaceRateLimit[];
	object: "workspace";
}

export interface ListWorkspacesResponse {
	total: number;
	object: "list";
	data: Workspace[];
}

export interface ListWorkspacesParams {
	page_size?: number;
	current_page?: number;
	name?: string;
	exact_name?: string;
	status?: "active" | "archived";
}

export interface WorkspaceUsageLimit {
	credit_limit?: number;
	type?: "cost" | "tokens";
	alert_threshold?: number;
	periodic_reset?: "monthly" | "weekly" | null;
	periodic_reset_days?: number | null;
	next_usage_reset_at?: string | null;
}

export interface WorkspaceRateLimit {
	type?: "requests" | "tokens";
	unit?: "rpd" | "rph" | "rpm";
	value?: number;
}

export interface WorkspaceUser {
	object: "workspace-user";
	id: string;
	first_name: string;
	last_name: string;
	org_role: "admin" | "member" | "owner";
	role: "admin" | "member" | "manager";
	status: "active";
	created_at: string;
	last_updated_at: string;
}

export interface SingleWorkspaceResponse {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	created_at: string;
	last_updated_at: string;
	defaults:
		| (WorkspaceDefaults & {
				is_default: number;
				metadata: Record<string, string>;
		  })
		| null;
	users: WorkspaceUser[];
	usage_limits?: WorkspaceUsageLimit[];
	rate_limits?: WorkspaceRateLimit[];
}

export interface CreateWorkspaceRequest {
	name: string;
	slug?: string;
	description?: string;
	defaults?: {
		is_default?: number;
		metadata?: Record<string, string>;
	};
	users?: string[];
	usage_limits?: WorkspaceUsageLimit[];
	rate_limits?: WorkspaceRateLimit[];
}

export interface UpdateWorkspaceRequest {
	name?: string;
	slug?: string;
	description?: string;
	defaults?: {
		is_default?: number;
		metadata?: Record<string, string>;
		input_guardrails?: string[];
		output_guardrails?: string[];
		user_api_key_config?: string | null;
	};
	usage_limits?: WorkspaceUsageLimit[];
	rate_limits?: WorkspaceRateLimit[];
}

export interface AddWorkspaceMemberRequest {
	user_id: string;
	role: "admin" | "member" | "manager";
}

export interface AddWorkspaceMemberResult extends AddWorkspaceMemberRequest {
	success: true;
	workspace_id: string;
}

export interface UpdateWorkspaceMemberRequest {
	role: "admin" | "member" | "manager";
}

export interface WorkspaceMembersResponse {
	total: number;
	object: string;
	data: WorkspaceUser[];
}

export interface ListWorkspaceMembersParams {
	current_page?: number;
	page_size?: number;
	role?: "admin" | "manager" | "member";
	email?: string;
}

export type ScimWorkspaceRole = "admin" | "member" | "manager";

/** Filters and pagination for SCIM group-to-workspace mappings. */
export interface ListScimWorkspaceMappingsParams {
	workspace_id?: string;
	scim_group_id?: string;
	role?: ScimWorkspaceRole;
	page?: number;
	page_size?: number;
}

/** A SCIM group mapping that grants members a role in a workspace. */
export interface ScimWorkspaceMapping {
	id: string;
	workspace_id: string;
	scim_group_id?: string;
	scim_group_name?: string;
	role: ScimWorkspaceRole;
	[key: string]: unknown;
}

export interface ListScimWorkspaceMappingsResponse {
	mappings: ScimWorkspaceMapping[];
	total_count: number;
	[key: string]: unknown;
}

type CreateScimWorkspaceMappingBase = {
	workspace_id: string;
	role: ScimWorkspaceRole;
};

/** Create a mapping using exactly one SCIM group identifier. */
export type CreateScimWorkspaceMappingRequest =
	| (CreateScimWorkspaceMappingBase & {
			scim_group_id: string;
			scim_group_name?: never;
	  })
	| (CreateScimWorkspaceMappingBase & {
			scim_group_name: string;
			scim_group_id?: never;
	  });

/** Filters and pagination for SCIM groups synchronized to Portkey. */
export interface ListScimGroupsParams {
	search?: string;
	page?: number;
	page_size?: number;
}

export interface ScimGroup {
	id: string;
	name: string;
	[key: string]: unknown;
}

export interface ListScimGroupsResponse {
	groups: ScimGroup[];
	total_count: number;
	[key: string]: unknown;
}

export class WorkspacesService extends BaseService {
	async listScimWorkspaceMappings(
		params?: ListScimWorkspaceMappingsParams,
	): Promise<ListScimWorkspaceMappingsResponse> {
		return this.get<ListScimWorkspaceMappingsResponse>(
			"/scim/workspaces",
			params,
		);
	}

	async createScimWorkspaceMapping(
		data: CreateScimWorkspaceMappingRequest,
	): Promise<ScimWorkspaceMapping> {
		return this.post<ScimWorkspaceMapping>("/scim/workspaces", data);
	}

	async deleteScimWorkspaceMapping(
		mappingId: string,
	): Promise<{ success: boolean }> {
		await this.delete(`/scim/workspaces/${this.encodePathSegment(mappingId)}`);
		return { success: true };
	}

	async listScimGroups(
		params?: ListScimGroupsParams,
	): Promise<ListScimGroupsResponse> {
		return this.getV2<ListScimGroupsResponse>("/scim/groups", params);
	}

	async listWorkspaces(
		params?: ListWorkspacesParams,
	): Promise<ListWorkspacesResponse> {
		return this.get<ListWorkspacesResponse>("/admin/workspaces", params);
	}

	async getWorkspace(workspaceId: string): Promise<SingleWorkspaceResponse> {
		return this.get<SingleWorkspaceResponse>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}`,
		);
	}

	async createWorkspace(data: CreateWorkspaceRequest): Promise<Workspace> {
		return this.post<Workspace>("/admin/workspaces", data);
	}

	async updateWorkspace(
		workspaceId: string,
		data: UpdateWorkspaceRequest,
	): Promise<{ success: true }> {
		await this.put<Record<string, never>>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}`,
			data,
		);
		return { success: true };
	}

	async deleteWorkspace(workspaceId: string): Promise<{ success: boolean }> {
		await this.delete(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}`,
		);
		return { success: true };
	}

	async addWorkspaceMember(
		workspaceId: string,
		data: AddWorkspaceMemberRequest,
	): Promise<AddWorkspaceMemberResult> {
		await this.post<Record<string, never>>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users`,
			{ users: [{ id: data.user_id, role: data.role }] },
		);
		return {
			success: true,
			workspace_id: workspaceId,
			user_id: data.user_id,
			role: data.role,
		};
	}

	async listWorkspaceMembers(
		workspaceId: string,
		params?: ListWorkspaceMembersParams,
	): Promise<WorkspaceMembersResponse> {
		return this.get<WorkspaceMembersResponse>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users`,
			params,
		);
	}

	async getWorkspaceMember(
		workspaceId: string,
		userId: string,
	): Promise<WorkspaceUser> {
		return this.get<WorkspaceUser>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users/${this.encodePathSegment(userId)}`,
		);
	}

	async updateWorkspaceMember(
		workspaceId: string,
		userId: string,
		data: UpdateWorkspaceMemberRequest,
	): Promise<WorkspaceUser> {
		return this.put<WorkspaceUser>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users/${this.encodePathSegment(userId)}`,
			data,
		);
	}

	async removeWorkspaceMember(
		workspaceId: string,
		userId: string,
	): Promise<{ success: boolean }> {
		await this.delete(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users/${this.encodePathSegment(userId)}`,
		);
		return { success: true };
	}
}
