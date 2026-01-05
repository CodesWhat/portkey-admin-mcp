/**
 * Type definitions for Portkey Prompt Partials API
 */

// ===== Create Partial =====

export interface CreatePromptPartialRequest {
	name: string;
	string: string;
	workspace_id?: string;
	version_description?: string;
}

export interface CreatePromptPartialResponse {
	id: string;
	slug: string;
	version_id: string;
}

// ===== List Partials =====

export interface ListPromptPartialsParams {
	collection_id?: string;
}

export interface PromptPartialListItem {
	id: string;
	slug: string;
	name: string;
	collection_id?: string;
	created_at: string;
	last_updated_at: string;
	status: string;
	object: "partial";
}

// ===== Get Partial =====

export interface GetPromptPartialResponse {
	id: string;
	slug: string;
	name: string;
	collection_id?: string;
	string: string;
	version: number;
	version_description?: string;
	prompt_partial_version_id: string;
	created_at: string;
	last_updated_at: string;
	status: string;
}

// ===== Update Partial =====

export interface UpdatePromptPartialRequest {
	name?: string;
	string?: string;
	description?: string;
	status?: string;
}

export interface UpdatePromptPartialResponse {
	prompt_partial_version_id: string;
}

// ===== Delete Partial =====

export type DeletePromptPartialResponse = Record<string, never>;

// ===== List Partial Versions =====

export interface PromptPartialVersion {
	prompt_partial_id: string;
	prompt_partial_version_id: string;
	slug: string;
	version: string;
	string: string;
	description?: string;
	created_at: string;
	prompt_version_status: string;
	object: "partial";
}

// ===== Publish Partial =====

export interface PublishPartialRequest {
	version: number;
}

export type PublishPartialResponse = Record<string, never>;
