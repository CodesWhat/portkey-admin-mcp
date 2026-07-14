import { BaseService } from "./base.service.js";

export type SecretManagerType = "aws_sm" | "azure_kv" | "hashicorp_vault";
export type SecretReferenceAuthConfig = Record<string, unknown>;

export interface CreateSecretReferenceRequest {
	organisation_id?: string;
	name: string;
	slug?: string;
	description?: string | null;
	manager_type: SecretManagerType;
	auth_config: SecretReferenceAuthConfig;
	secret_path: string;
	secret_key?: string | null;
	allow_all_workspaces?: boolean;
	allowed_workspaces?: string[];
	tags?: Record<string, string> | null;
}

export interface UpdateSecretReferenceRequest {
	name?: string;
	description?: string | null;
	auth_config?: SecretReferenceAuthConfig;
	secret_path?: string;
	secret_key?: string | null;
	allow_all_workspaces?: boolean;
	allowed_workspaces?: string[];
	tags?: Record<string, string> | null;
}

export interface CreateSecretReferenceResponse {
	id: string;
	slug: string;
	object: "secret-reference";
}

export interface SecretReferenceListItem {
	id: string;
	name: string;
	slug: string;
	manager_type: SecretManagerType;
	status: "ACTIVE";
	created_at: string;
	last_updated_at: string;
	object: "secret-reference";
}

export interface SecretReferenceDetail extends SecretReferenceListItem {
	organisation_id: string;
	description: string | null;
	secret_path: string;
	secret_key: string | null;
	allow_all_workspaces: boolean;
	tags: Record<string, string> | null;
	created_by: string;
	auth_config: SecretReferenceAuthConfig;
}

export interface ListSecretReferencesResponse {
	object: "list";
	total: number;
	data: SecretReferenceListItem[];
}

export interface ListSecretReferencesParams {
	manager_type?: SecretManagerType;
	tags?: string;
	search?: string;
	current_page?: number;
	page_size?: number;
}

export class SecretReferencesService extends BaseService {
	async createSecretReference(
		data: CreateSecretReferenceRequest,
	): Promise<CreateSecretReferenceResponse> {
		return this.post<CreateSecretReferenceResponse>("/secret-references", data);
	}

	async listSecretReferences(
		params?: ListSecretReferencesParams,
	): Promise<ListSecretReferencesResponse> {
		return this.get<ListSecretReferencesResponse>("/secret-references", params);
	}

	async getSecretReference(id: string): Promise<SecretReferenceDetail> {
		return this.get<SecretReferenceDetail>(
			`/secret-references/${this.encodePathSegment(id)}`,
		);
	}

	async updateSecretReference(
		id: string,
		data: UpdateSecretReferenceRequest,
	): Promise<Record<string, unknown>> {
		return this.put<Record<string, unknown>>(
			`/secret-references/${this.encodePathSegment(id)}`,
			data,
		);
	}

	async deleteSecretReference(id: string): Promise<{ success: true }> {
		await this.delete(`/secret-references/${this.encodePathSegment(id)}`);
		return { success: true };
	}
}
