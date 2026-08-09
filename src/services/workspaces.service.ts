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
}

export interface CreateWorkspaceRequest {
	name: string;
	slug?: string;
	description?: string;
	defaults?: {
		is_default?: number;
		metadata?: Record<string, string>;
	};
}

export interface UpdateWorkspaceRequest {
	name?: string;
	slug?: string;
	description?: string;
	defaults?: {
		is_default?: number;
		metadata?: Record<string, string>;
	};
}

export interface AddWorkspaceMemberRequest {
	user_id: string;
	role: "admin" | "member" | "manager";
}

export interface UpdateWorkspaceMemberRequest {
	role: "admin" | "member" | "manager";
}

export interface WorkspaceMembersResponse {
	total: number;
	object: string;
	data: WorkspaceUser[];
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

/** Create a mapping using exactly one SCIM group identifier. */
export interface CreateScimWorkspaceMappingRequest {
	workspace_id: string;
	role: ScimWorkspaceRole;
	scim_group_id?: string;
	scim_group_name?: string;
}

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
		return this.get<ListScimGroupsResponse>("/scim/groups", params);
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
	): Promise<Workspace> {
		return this.put<Workspace>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}`,
			data,
		);
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
	): Promise<WorkspaceUser> {
		return this.post<WorkspaceUser>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users`,
			data,
		);
	}

	async listWorkspaceMembers(
		workspaceId: string,
	): Promise<WorkspaceMembersResponse> {
		return this.get<WorkspaceMembersResponse>(
			`/admin/workspaces/${this.encodePathSegment(workspaceId)}/users`,
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
