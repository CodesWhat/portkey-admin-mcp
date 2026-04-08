import { BaseService } from "./base.service.js";
import type {
	CreatePromptPartialRequest,
	CreatePromptPartialResponse,
	DeletePromptPartialResponse,
	GetPromptPartialResponse,
	ListPartialVersionsResponse,
	ListPromptPartialsParams,
	ListPromptPartialsResponse,
	PromptPartialListItem,
	PromptPartialVersion,
	PublishPartialRequest,
	PublishPartialResponse,
	UpdatePromptPartialRequest,
	UpdatePromptPartialResponse,
} from "./partials.types.js";

// Re-export types for consumers
export type * from "./partials.types.js";

export class PartialsService extends BaseService {
	async createPromptPartial(
		data: CreatePromptPartialRequest,
	): Promise<CreatePromptPartialResponse> {
		return this.post<CreatePromptPartialResponse>("/prompts/partials", data);
	}

	async listPromptPartials(
		params?: ListPromptPartialsParams,
	): Promise<PromptPartialListItem[]> {
		// API returns { object: "list", total, data: [...] } — unwrap to plain array
		const response = await this.get<ListPromptPartialsResponse>(
			"/prompts/partials",
			{ collection_id: params?.collection_id },
		);
		return response.data;
	}

	async getPromptPartial(
		promptPartialId: string,
	): Promise<GetPromptPartialResponse> {
		return this.get<GetPromptPartialResponse>(
			`/prompts/partials/${this.encodePathSegment(promptPartialId)}`,
		);
	}

	async updatePromptPartial(
		promptPartialId: string,
		data: UpdatePromptPartialRequest,
	): Promise<UpdatePromptPartialResponse> {
		// Portkey API inconsistency: POST /prompts/partials accepts "description"
		// in the response as "description", but PUT expects "version_description"
		// for the same field. Remap here for consistency.
		const { description, ...rest } = data;
		const body: Record<string, unknown> = { ...rest };
		if (description !== undefined) {
			body.version_description = description;
		}
		return this.put<UpdatePromptPartialResponse>(
			`/prompts/partials/${this.encodePathSegment(promptPartialId)}`,
			body,
		);
	}

	async deletePromptPartial(
		promptPartialId: string,
	): Promise<DeletePromptPartialResponse> {
		return this.delete<DeletePromptPartialResponse>(
			`/prompts/partials/${this.encodePathSegment(promptPartialId)}`,
		);
	}

	async listPartialVersions(
		promptPartialId: string,
	): Promise<PromptPartialVersion[]> {
		// API returns { object: "list", total, data: [...] } — unwrap to plain array
		const response = await this.get<ListPartialVersionsResponse>(
			`/prompts/partials/${this.encodePathSegment(promptPartialId)}/versions`,
		);
		return response.data;
	}

	async publishPartial(
		promptPartialId: string,
		data: PublishPartialRequest,
	): Promise<PublishPartialResponse> {
		return this.put<PublishPartialResponse>(
			`/prompts/partials/${this.encodePathSegment(promptPartialId)}/makeDefault`,
			data,
		);
	}
}
