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
	onFail?: string;
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

export class GuardrailsService extends BaseService {
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
		return this.get<GuardrailDetail>(`/guardrails/${guardrailId}`);
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
			`/guardrails/${guardrailId}`,
			data,
		);
	}

	/**
	 * Delete a guardrail
	 */
	async deleteGuardrail(guardrailId: string): Promise<{ success: boolean }> {
		await this.delete(`/guardrails/${guardrailId}`);
		return { success: true };
	}
}
