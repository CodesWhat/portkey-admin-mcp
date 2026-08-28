import { BaseService, isNoContent } from "./base.service.js";

export type DeploymentType = "production" | "non_production";
export type DeploymentStatus = "active" | "archived";

export interface DeploymentAuthSettingsInput {
	gateway_base_url?: string;
	mcp_gateway_base_url?: string;
	is_dataservice_hosted?: 0 | 1;
	is_playground_proxy_allowed?: 0 | 1;
	workspaces_allowed?: string[];
	jwt_subs_allowed?: string[];
	jwt_sub_workspace_mapping?: Record<string, string>;
}

export interface DeploymentAuthSettings extends DeploymentAuthSettingsInput {
	private_link_endpoint?: string;
	use_private_link_proxy?: 0 | 1;
	disable_portkey_gateway?: 0 | 1;
	allow_all_workspaces?: 0 | 1;
}

export interface DeploymentListItem {
	id: string;
	name: string;
	slug: string;
	type: DeploymentType;
	status: DeploymentStatus;
	is_default: 0 | 1;
	connection_status: "healthy" | "unhealthy" | "unknown";
	created_by: string;
	created_at: string;
	last_updated_at: string;
	last_synced_at: string | null;
	last_resynced_at: string | null;
	object: "deployment";
}

export interface DeploymentDetail extends DeploymentListItem {
	auth_settings?: DeploymentAuthSettings;
	deployment_config?: Record<string, unknown> | null;
	workspaces?: Array<{ id: string; slug: string }>;
	credentials?: { username?: string; password?: string };
	client_auth?: string;
}

export interface ListDeploymentsParams {
	organisation_id?: string;
	status?: DeploymentStatus;
	type?: DeploymentType;
	workspace_slug?: string[];
	search?: string;
}

export interface ListDeploymentsResponse {
	object: "list";
	total: number;
	data: DeploymentListItem[];
}

export interface RegisterDeploymentRequest {
	organisation_id?: string;
	name: string;
	slug?: string;
	type?: DeploymentType;
	deployment_config?: Record<string, unknown>;
	is_default?: boolean;
	auth_settings?: DeploymentAuthSettingsInput;
}

export interface RegisterDeploymentResponse {
	id: string;
	organisation_id?: string;
	client_auth?: string;
	credentials?: { username?: string; password?: string };
	object?: "deployment";
}

export interface UpdateDeploymentRequest {
	name?: string;
	type?: DeploymentType;
	status?: DeploymentStatus;
	deployment_config?: Record<string, unknown> | null;
	is_default?: boolean;
	rotate_auth?: boolean;
	override_existing?: boolean;
	auth_settings?: DeploymentAuthSettingsInput & {
		allow_all_workspaces?: boolean;
		remove_workspaces_allowed?: string[];
		remove_subs_allowed?: string[];
	};
}

export class DeploymentsService extends BaseService {
	async listDeployments(
		params?: ListDeploymentsParams,
	): Promise<ListDeploymentsResponse> {
		return this.getV2<ListDeploymentsResponse>("/deployments", params);
	}

	async registerDeployment(
		data: RegisterDeploymentRequest,
	): Promise<RegisterDeploymentResponse> {
		return this.postV2<RegisterDeploymentResponse>("/deployments", data);
	}

	async getDeployment(
		id: string,
		organisation_id?: string,
	): Promise<DeploymentDetail> {
		if (!id.trim()) throw new Error("Deployment ID is required");
		return this.getV2<DeploymentDetail>(
			`/deployments/${this.encodePathSegment(id)}`,
			{ organisation_id },
		);
	}

	async updateDeployment(
		id: string,
		data: UpdateDeploymentRequest,
	): Promise<Record<string, unknown>> {
		if (!id.trim()) throw new Error("Deployment ID is required");
		return this.putV2<Record<string, unknown>>(
			`/deployments/${this.encodePathSegment(id)}`,
			data,
		);
	}

	async archiveDeployment(id: string): Promise<Record<string, unknown>> {
		if (!id.trim()) throw new Error("Deployment ID is required");
		const result = await this.deleteV2<Record<string, unknown>>(
			`/deployments/${this.encodePathSegment(id)}`,
		);
		return isNoContent(result) ? {} : result;
	}
}
