import { BaseService } from "./base.service.js";
import type {
	CreatePromptPartialRequest,
	CreatePromptPartialResponse,
	DeletePromptPartialResponse,
	GetPromptPartialResponse,
	ListPromptPartialsParams,
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
		return this.get<PromptPartialListItem[]>("/prompts/partials", {
			collection_id: params?.collection_id,
		});
	}

	async getPromptPartial(
		promptPartialId: string,
	): Promise<GetPromptPartialResponse> {
		return this.get<GetPromptPartialResponse>(
			`/prompts/partials/${promptPartialId}`,
		);
	}

	async updatePromptPartial(
		promptPartialId: string,
		data: UpdatePromptPartialRequest,
	): Promise<UpdatePromptPartialResponse> {
		return this.put<UpdatePromptPartialResponse>(
			`/prompts/partials/${promptPartialId}`,
			data,
		);
	}

	async deletePromptPartial(
		promptPartialId: string,
	): Promise<DeletePromptPartialResponse> {
		return this.delete<DeletePromptPartialResponse>(
			`/prompts/partials/${promptPartialId}`,
		);
	}

	async listPartialVersions(
		promptPartialId: string,
	): Promise<PromptPartialVersion[]> {
		return this.get<PromptPartialVersion[]>(
			`/prompts/partials/${promptPartialId}/versions`,
		);
	}

	async publishPartial(
		promptPartialId: string,
		data: PublishPartialRequest,
	): Promise<PublishPartialResponse> {
		return this.put<PublishPartialResponse>(
			`/prompts/partials/${promptPartialId}/makeDefault`,
			data,
		);
	}
}
