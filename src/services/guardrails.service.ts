import { BaseService } from "./base.service.js";

// Types

/** Parameters for individual guardrail checks */
export interface GuardrailCheckParameters {
	[key: string]: unknown;
}

/** A single check within a guardrail */
export interface GuardrailCheck {
	id: string;
	name?: string;
	is_enabled?: boolean;
	parameters?: GuardrailCheckParameters;
}

/** Feedback configuration for guardrail actions */
export interface GuardrailFeedback {
	value?: number;
	weight?: number;
	metadata?: Record<string, unknown>;
}

/** Actions to take when guardrail checks pass or fail */
export interface GuardrailAction {
	deny?: boolean;
	async?: boolean;
	on_success?: GuardrailFeedback;
	on_fail?: GuardrailFeedback;
	on_fail_action?: string;
	message?: string;
}

/** Guardrail resource from list endpoint */
export interface Guardrail {
	id: string;
	name: string;
	slug: string;
	created_at: string;
	last_updated_at: string;
	owner_id: string;
	organisation_id: string;
	workspace_id: string;
	status: "active" | "archived";
	updated_by: string | null;
}

/** Detailed guardrail with checks and actions */
export interface GuardrailDetail extends Guardrail {
	checks: GuardrailCheck[];
	actions: GuardrailAction;
}

/** Parameters for listing guardrails */
export interface ListGuardrailsParams {
	workspace_id?: string;
	organisation_id?: string;
	page_size?: number;
	current_page?: number;
}

/** Response from listing guardrails */
export interface ListGuardrailsResponse {
	data: Guardrail[];
	total: number;
}

/** Request body for creating a guardrail */
export interface CreateGuardrailRequest {
	name: string;
	checks: GuardrailCheck[];
	actions: GuardrailAction;
	workspace_id?: string;
	organisation_id?: string;
}

/** Request body for updating a guardrail */
export interface UpdateGuardrailRequest {
	name?: string;
	checks?: GuardrailCheck[];
	actions?: GuardrailAction;
}

/** Response from create/update guardrail operations */
export interface GuardrailMutationResponse {
	id: string;
	slug: string;
	version_id: string;
}

/** Whether organisation guardrails run before or after the model call */
export type GuardrailDirection = "input" | "output";

/** Guardrail reference returned by the organisation defaults endpoint */
export interface OrganisationGuardrailReference {
	id: string;
	slug: string;
}

/** Organisation-wide input and output guardrail defaults */
export interface OrganisationGuardrailDefaults {
	input_guardrails: OrganisationGuardrailReference[];
	output_guardrails: OrganisationGuardrailReference[];
}

/** Request body for replacing organisation-wide guardrail defaults */
export interface UpdateOrganisationGuardrailDefaultsRequest {
	input_guardrails?: string[];
	output_guardrails?: string[];
}

/** Query parameters for workspace guardrail exclusions */
export interface ListWorkspaceExclusionsParams {
	organisation_id: string;
}

/** A workspace's exclusion state for an organisation guardrail direction */
export interface WorkspaceGuardrailExclusion {
	workspace_id: string;
	excluded: boolean;
	[key: string]: unknown;
}

/** Workspace exclusions returned for one guardrail direction */
export interface ListWorkspaceExclusionsResponse {
	workspaces: WorkspaceGuardrailExclusion[];
	[key: string]: unknown;
}

/** Request body for updating workspace exclusions */
export interface UpdateWorkspaceExclusionsRequest {
	organisation_id: string;
	workspaces: WorkspaceGuardrailExclusion[];
	override_existing?: boolean;
}

export class GuardrailsService extends BaseService {
	/** Get the organisation-wide input and output guardrail defaults. */
	async getOrganisationDefaults(): Promise<OrganisationGuardrailDefaults> {
		return this.get<OrganisationGuardrailDefaults>(
			"/admin/organisation/defaults",
		);
	}

	/** Replace either or both organisation-wide guardrail default lists. */
	async updateOrganisationDefaults(
		data: UpdateOrganisationGuardrailDefaultsRequest,
	): Promise<OrganisationGuardrailDefaults> {
		return this.put<OrganisationGuardrailDefaults>(
			"/admin/organisation/defaults",
			data,
		);
	}

	/** List workspace exclusions for input or output organisation guardrails. */
	async listWorkspaceExclusions(
		direction: GuardrailDirection,
		params: ListWorkspaceExclusionsParams,
	): Promise<ListWorkspaceExclusionsResponse> {
		return this.get<ListWorkspaceExclusionsResponse>(
			`/workspace-exclusions/${direction}-guardrails`,
			params,
		);
	}

	/** Update workspace exclusions for input or output organisation guardrails. */
	async updateWorkspaceExclusions(
		direction: GuardrailDirection,
		data: UpdateWorkspaceExclusionsRequest,
	): Promise<ListWorkspaceExclusionsResponse> {
		return this.put<ListWorkspaceExclusionsResponse>(
			`/workspace-exclusions/${direction}-guardrails`,
			data,
		);
	}

	/**
	 * List all guardrails with optional filtering
	 */
	async listGuardrails(
		params?: ListGuardrailsParams,
	): Promise<ListGuardrailsResponse> {
		return this.get<ListGuardrailsResponse>("/guardrails", {
			workspace_id: params?.workspace_id,
			organisation_id: params?.organisation_id,
			page_size: params?.page_size,
			current_page: params?.current_page,
		});
	}

	/**
	 * Get a single guardrail by ID or slug
	 */
	async getGuardrail(guardrailId: string): Promise<GuardrailDetail> {
		return this.get<GuardrailDetail>(
			`/guardrails/${this.encodePathSegment(guardrailId)}`,
		);
	}

	/**
	 * Create a new guardrail
	 */
	async createGuardrail(
		data: CreateGuardrailRequest,
	): Promise<GuardrailMutationResponse> {
		return this.post<GuardrailMutationResponse>("/guardrails", data);
	}

	/**
	 * Update an existing guardrail
	 */
	async updateGuardrail(
		guardrailId: string,
		data: UpdateGuardrailRequest,
	): Promise<GuardrailMutationResponse> {
		return this.put<GuardrailMutationResponse>(
			`/guardrails/${this.encodePathSegment(guardrailId)}`,
			data,
		);
	}

	/**
	 * Delete a guardrail
	 */
	async deleteGuardrail(guardrailId: string): Promise<{ success: boolean }> {
		await this.delete(`/guardrails/${this.encodePathSegment(guardrailId)}`);
		return { success: true };
	}
}
