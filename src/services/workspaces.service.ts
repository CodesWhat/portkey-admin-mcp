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

export class WorkspacesService extends BaseService {
	async listWorkspaces(
		params?: ListWorkspacesParams,
	): Promise<ListWorkspacesResponse> {
		return this.get<ListWorkspacesResponse>("/admin/workspaces", params);
	}

	async getWorkspace(workspaceId: string): Promise<SingleWorkspaceResponse> {
		return this.get<SingleWorkspaceResponse>(
			`/admin/workspaces/${workspaceId}`,
		);
	}

	async createWorkspace(data: CreateWorkspaceRequest): Promise<Workspace> {
		return this.post<Workspace>("/admin/workspaces", data);
	}

	async updateWorkspace(
		workspaceId: string,
		data: UpdateWorkspaceRequest,
	): Promise<Workspace> {
		return this.put<Workspace>(`/admin/workspaces/${workspaceId}`, data);
	}

	async deleteWorkspace(workspaceId: string): Promise<{ success: boolean }> {
		await this.delete(`/admin/workspaces/${workspaceId}`);
		return { success: true };
	}

	async addWorkspaceMember(
		workspaceId: string,
		data: AddWorkspaceMemberRequest,
	): Promise<WorkspaceUser> {
		return this.post<WorkspaceUser>(
			`/admin/workspaces/${workspaceId}/users`,
			data,
		);
	}

	async listWorkspaceMembers(
		workspaceId: string,
	): Promise<WorkspaceMembersResponse> {
		return this.get<WorkspaceMembersResponse>(
			`/admin/workspaces/${workspaceId}/users`,
		);
	}

	async getWorkspaceMember(
		workspaceId: string,
		userId: string,
	): Promise<WorkspaceUser> {
		return this.get<WorkspaceUser>(
			`/admin/workspaces/${workspaceId}/users/${userId}`,
		);
	}

	async updateWorkspaceMember(
		workspaceId: string,
		userId: string,
		data: UpdateWorkspaceMemberRequest,
	): Promise<WorkspaceUser> {
		return this.put<WorkspaceUser>(
			`/admin/workspaces/${workspaceId}/users/${userId}`,
			data,
		);
	}

	async removeWorkspaceMember(
		workspaceId: string,
		userId: string,
	): Promise<{ success: boolean }> {
		await this.delete(`/admin/workspaces/${workspaceId}/users/${userId}`);
		return { success: true };
	}
}
