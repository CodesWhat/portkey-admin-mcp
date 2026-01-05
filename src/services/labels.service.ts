import { BaseService } from "./base.service.js";

// ===== Types =====

export type LabelStatus = "active" | "archived";

export interface Label {
	id: string;
	name: string;
	description?: string;
	color_code?: string;
	organisation_id: string;
	workspace_id?: string;
	is_universal: boolean;
	created_at: string;
	last_updated_at: string;
	status: LabelStatus;
}

export interface CreateLabelRequest {
	name: string;
	organisation_id?: string;
	workspace_id?: string;
	description?: string;
	color_code?: string;
}

export interface CreateLabelResponse {
	id: string;
}

export interface ListLabelsParams {
	organisation_id?: string;
	workspace_id?: string;
	search?: string;
	current_page?: number;
	page_size?: number;
}

export interface ListLabelsResponse {
	total: number;
	data: Label[];
}

export interface UpdateLabelRequest {
	name?: string;
	description?: string;
	color_code?: string;
}

export type UpdateLabelResponse = Record<string, never>;

export type DeleteLabelResponse = Record<string, never>;

export interface GetLabelParams {
	organisation_id?: string;
	workspace_id?: string;
}

// ===== Service =====

export class LabelsService extends BaseService {
	async createLabel(data: CreateLabelRequest): Promise<CreateLabelResponse> {
		return this.post<CreateLabelResponse>("/labels", data);
	}

	async listLabels(params?: ListLabelsParams): Promise<ListLabelsResponse> {
		return this.get<ListLabelsResponse>("/labels", {
			organisation_id: params?.organisation_id,
			workspace_id: params?.workspace_id,
			search: params?.search,
			current_page: params?.current_page,
			page_size: params?.page_size,
		});
	}

	async getLabel(labelId: string, params?: GetLabelParams): Promise<Label> {
		return this.get<Label>(`/labels/${labelId}`, {
			organisation_id: params?.organisation_id,
			workspace_id: params?.workspace_id,
		});
	}

	async updateLabel(
		labelId: string,
		data: UpdateLabelRequest,
	): Promise<UpdateLabelResponse> {
		return this.put<UpdateLabelResponse>(`/labels/${labelId}`, data);
	}

	async deleteLabel(labelId: string): Promise<DeleteLabelResponse> {
		return this.delete<DeleteLabelResponse>(`/labels/${labelId}`);
	}
}
