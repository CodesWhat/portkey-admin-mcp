/**
 * Type definitions for Portkey Prompts API
 */

// ===== Base Types =====

export interface PromptMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface PromptFunctionDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
}

export interface PromptToolDefinition {
	type: "function";
	function: PromptFunctionDefinition;
}

export type ToolChoice =
	| "auto"
	| "none"
	| { type: "function"; function: { name: string } };

export interface PromptTemplateMetadata {
	app?: string;
	env?: string;
	source_file?: string;
	migrated_at?: string;
	[key: string]: unknown;
}

export interface PromptHyperparameters {
	max_tokens?: number;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	presence_penalty?: number;
	frequency_penalty?: number;
	stop?: string[];
}

// ===== Create Prompt =====

export interface CreatePromptRequest {
	name: string;
	collection_id: string;
	string: string;
	parameters: Record<string, unknown>;
	virtual_key: string;
	functions?: PromptFunctionDefinition[];
	tools?: PromptToolDefinition[];
	tool_choice?: ToolChoice;
	model?: string;
	version_description?: string;
	template_metadata?: PromptTemplateMetadata;
}

export interface CreatePromptResponse {
	id: string;
	slug: string;
	version_id: string;
	object: "prompt";
}

// ===== List Prompts =====

export interface ListPromptsParams {
	collection_id?: string;
	workspace_id?: string;
	current_page?: number;
	page_size?: number;
	search?: string;
}

export interface PromptListItem {
	id: string;
	name: string;
	slug: string;
	collection_id: string;
	workspace_id?: string;
	model?: string;
	status?: string;
	created_at: string;
	last_updated_at: string;
	object: "prompt";
}

export interface ListPromptsResponse {
	data: PromptListItem[];
	total: number;
	object: "list";
}

// ===== Get Prompt =====

export interface PromptVersion {
	id: string;
	version_number: number;
	version_description?: string;
	string: string;
	parameters: Record<string, unknown>;
	model?: string;
	virtual_key?: string;
	functions?: PromptFunctionDefinition[];
	tools?: PromptToolDefinition[];
	tool_choice?: ToolChoice;
	template_metadata?: PromptTemplateMetadata;
	created_at: string;
}

export interface GetPromptResponse {
	id: string;
	name: string;
	slug: string;
	collection_id: string;
	workspace_id?: string;
	created_at: string;
	last_updated_at: string;
	current_version: PromptVersion;
	versions: PromptVersion[];
	object: "prompt";
}

// ===== Update Prompt =====

export interface UpdatePromptRequest {
	name?: string;
	collection_id?: string;
	string?: string;
	parameters?: Record<string, unknown>;
	model?: string;
	virtual_key?: string;
	functions?: PromptFunctionDefinition[];
	tools?: PromptToolDefinition[];
	tool_choice?: ToolChoice;
	version_description?: string;
	template_metadata?: PromptTemplateMetadata;
}

export interface UpdatePromptResponse {
	id: string;
	slug: string;
	prompt_version_id: string;
	object: "prompt";
}

// ===== Render Prompt =====

export interface RenderPromptRequest {
	variables: Record<string, string | number | boolean>;
	hyperparameters?: PromptHyperparameters;
}

export interface RenderPromptResponse {
	success: boolean;
	data: {
		messages: PromptMessage[];
		model?: string;
		max_tokens?: number;
		temperature?: number;
		top_p?: number;
		[key: string]: unknown;
	};
}

// ===== Prompt Completion =====

export interface BillingMetadata {
	client_id: string;
	app: string;
	env: string;
	project_id?: string;
	feature?: string;
	prompt_slug?: string;
	prompt_version?: string;
	[key: string]: unknown;
}

export interface PromptCompletionRequest {
	variables: Record<string, string | number | boolean>;
	metadata?: BillingMetadata;
	stream?: boolean;
	hyperparameters?: PromptHyperparameters;
}

export interface PromptCompletionChoice {
	index: number;
	message: {
		role: string;
		content: string;
	};
	finish_reason: string;
}

export interface PromptCompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

export interface PromptCompletionResponse {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: PromptCompletionChoice[];
	usage: PromptCompletionUsage;
}

// ===== Migrate Prompt =====

export interface MigratePromptRequest {
	name: string;
	app: string;
	env: string;
	collection_id: string;
	string: string;
	parameters: Record<string, unknown>;
	virtual_key: string;
	model?: string;
	version_description?: string;
	template_metadata?: PromptTemplateMetadata;
	functions?: PromptFunctionDefinition[];
	tools?: PromptToolDefinition[];
	tool_choice?: ToolChoice;
	dry_run?: boolean;
}

export interface MigratePromptResponse {
	action: "created" | "updated" | "unchanged";
	prompt_id: string;
	slug: string;
	version_id?: string;
	dry_run: boolean;
	message: string;
}

// ===== Promote Prompt =====

export interface PromotePromptRequest {
	source_prompt_id: string;
	target_collection_id: string;
	target_name?: string;
	target_env: string;
	virtual_key?: string;
}

export interface PromotePromptResponse {
	source_prompt_id: string;
	source_version_id: string;
	target_prompt_id: string;
	target_version_id: string;
	action: "created" | "updated";
	promoted_at: string;
}

// ===== Validation =====

export interface ValidateMetadataResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

// ===== Delete Prompt =====

export type DeletePromptResponse = Record<string, never>;

// ===== Publish Prompt (Make Default) =====

export interface PublishPromptRequest {
	version: number;
}

export type PublishPromptResponse = Record<string, never>;

// ===== List Prompt Versions =====

export interface PromptVersionListItem {
	id: string;
	prompt_id: string;
	prompt_template: string;
	prompt_version: number;
	prompt_description?: string;
	label_id?: string;
	created_at: string;
	status: string;
	object: "prompt";
}

export type ListPromptVersionsResponse = PromptVersionListItem[];
