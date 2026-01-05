import { BaseService } from "./base.service.js";

// Types
export interface Collection {
	id: string;
	name: string;
	slug: string;
	workspace_id: string;
	created_at: string;
	last_updated_at: string;
	description?: string;
	object: "collection";
}

export interface ListCollectionsParams {
	workspace_id?: string;
	current_page?: number;
	page_size?: number;
	search?: string;
}

export interface ListCollectionsResponse {
	data: Collection[];
	total: number;
	object: "list";
}

export interface CreateCollectionRequest {
	name: string;
	workspace_id?: string;
}

export interface CreateCollectionResponse {
	id: string;
	slug: string;
	object: "collection";
}

// Phase 1 types
export interface UpdateCollectionRequest {
	name?: string;
	description?: string;
}

export class CollectionsService extends BaseService {
	async listCollections(
		params?: ListCollectionsParams,
	): Promise<ListCollectionsResponse> {
		return this.get<ListCollectionsResponse>("/collections", {
			workspace_id: params?.workspace_id,
			current_page: params?.current_page,
			page_size: params?.page_size,
			search: params?.search,
		});
	}

	async createCollection(
		data: CreateCollectionRequest,
	): Promise<CreateCollectionResponse> {
		return this.post<CreateCollectionResponse>("/collections", data);
	}

	async getCollection(collectionId: string): Promise<Collection> {
		return this.get<Collection>(`/collections/${collectionId}`);
	}

	// Phase 1: Collection CRUD
	async updateCollection(
		collectionId: string,
		data: UpdateCollectionRequest,
	): Promise<Collection> {
		return this.put<Collection>(`/collections/${collectionId}`, data);
	}

	async deleteCollection(collectionId: string): Promise<{ success: boolean }> {
		return this.delete<{ success: boolean }>(`/collections/${collectionId}`);
	}
}
