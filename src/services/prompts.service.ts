import { BaseService } from "./base.service.js";
import type {
	BillingMetadata,
	CreatePromptRequest,
	CreatePromptResponse,
	DeletePromptResponse,
	GetPromptResponse,
	ListPromptsParams,
	ListPromptsResponse,
	ListPromptVersionsResponse,
	MigratePromptRequest,
	MigratePromptResponse,
	PromotePromptRequest,
	PromotePromptResponse,
	PromptCompletionRequest,
	PromptCompletionResponse,
	PublishPromptRequest,
	PublishPromptResponse,
	RenderPromptRequest,
	RenderPromptResponse,
	UpdatePromptRequest,
	UpdatePromptResponse,
	ValidateMetadataResult,
} from "./prompts.types.js";

// Re-export types for consumers
export type * from "./prompts.types.js";

// Valid values for billing metadata validation
const VALID_APPS = ["hourlink", "apizone", "research-pilot"] as const;
const VALID_ENVS = ["dev", "staging", "prod"] as const;

export class PromptsService extends BaseService {
	async createPrompt(data: CreatePromptRequest): Promise<CreatePromptResponse> {
		return this.post<CreatePromptResponse>("/prompts", data);
	}

	async listPrompts(params?: ListPromptsParams): Promise<ListPromptsResponse> {
		return this.get<ListPromptsResponse>("/prompts", {
			collection_id: params?.collection_id,
			workspace_id: params?.workspace_id,
			current_page: params?.current_page,
			page_size: params?.page_size,
			search: params?.search,
		});
	}

	async getPrompt(promptId: string): Promise<GetPromptResponse> {
		return this.get<GetPromptResponse>(`/prompts/${promptId}`);
	}

	async updatePrompt(
		promptId: string,
		data: UpdatePromptRequest,
	): Promise<UpdatePromptResponse> {
		return this.put<UpdatePromptResponse>(`/prompts/${promptId}`, data);
	}

	async deletePrompt(promptId: string): Promise<DeletePromptResponse> {
		return this.delete<DeletePromptResponse>(`/prompts/${promptId}`);
	}

	async publishPrompt(
		promptId: string,
		data: PublishPromptRequest,
	): Promise<PublishPromptResponse> {
		return this.put<PublishPromptResponse>(
			`/prompts/${promptId}/makeDefault`,
			data,
		);
	}

	async listPromptVersions(
		promptId: string,
	): Promise<ListPromptVersionsResponse> {
		return this.get<ListPromptVersionsResponse>(
			`/prompts/${promptId}/versions`,
		);
	}

	async renderPrompt(
		promptId: string,
		data: RenderPromptRequest,
	): Promise<RenderPromptResponse> {
		// Flatten hyperparameters like runPromptCompletion does
		return this.post<RenderPromptResponse>(`/prompts/${promptId}/render`, {
			...data.hyperparameters,
			variables: data.variables,
		});
	}

	async runPromptCompletion(
		promptId: string,
		data: PromptCompletionRequest,
	): Promise<PromptCompletionResponse> {
		if (!data.metadata) {
			throw new Error("Billing metadata is required for prompt completions");
		}
		const validationResult = this.validateBillingMetadata(data.metadata);
		if (!validationResult.valid) {
			throw new Error(
				`Billing metadata validation failed: ${validationResult.errors.join(", ")}`,
			);
		}

		// Note: stream is always false because MCP protocol uses request-response pattern,
		// not streaming. The MCP SDK handles its own transport-level streaming if needed.
		return this.post<PromptCompletionResponse>(
			`/prompts/${promptId}/completions`,
			{
				...data.hyperparameters,
				variables: data.variables,
				metadata: data.metadata,
				stream: false,
			},
		);
	}

	async migratePrompt(
		data: MigratePromptRequest,
	): Promise<MigratePromptResponse> {
		const { dry_run = false, app, env } = data;

		const existingPrompts = await this.listPrompts({
			collection_id: data.collection_id,
			search: data.name,
		});

		const existingPrompt = existingPrompts.data.find(
			(p) => p.name.toLowerCase() === data.name.toLowerCase(),
		);

		if (existingPrompt) {
			const currentPrompt = await this.getPrompt(existingPrompt.id);
			const currentVersion = currentPrompt.current_version;

			const templateChanged =
				JSON.stringify(currentVersion.string) !== JSON.stringify(data.string);
			const parametersChanged =
				JSON.stringify(currentVersion.parameters) !==
				JSON.stringify(data.parameters);
			const modelChanged =
				data.model !== undefined && currentVersion.model !== data.model;

			const needsUpdate = templateChanged || parametersChanged || modelChanged;

			if (!needsUpdate) {
				return {
					action: "unchanged",
					prompt_id: existingPrompt.id,
					slug: existingPrompt.slug,
					dry_run,
					message: `Prompt "${data.name}" already exists and is up to date`,
				};
			}

			if (dry_run) {
				return {
					action: "updated",
					prompt_id: existingPrompt.id,
					slug: existingPrompt.slug,
					dry_run: true,
					message: `Would update prompt "${data.name}" (changes detected)`,
				};
			}

			const updateResult = await this.updatePrompt(existingPrompt.id, {
				string: data.string,
				parameters: data.parameters,
				model: data.model,
				virtual_key: data.virtual_key,
				version_description: data.version_description,
				template_metadata: {
					...data.template_metadata,
					app,
					env,
					migrated_at: new Date().toISOString(),
				},
				functions: data.functions,
				tools: data.tools,
				tool_choice: data.tool_choice,
			});

			return {
				action: "updated",
				prompt_id: updateResult.id,
				slug: updateResult.slug,
				version_id: updateResult.prompt_version_id,
				dry_run: false,
				message: `Updated prompt "${data.name}" with new version`,
			};
		}

		if (dry_run) {
			return {
				action: "created",
				prompt_id: "",
				slug: "",
				dry_run: true,
				message: `Would create new prompt "${data.name}"`,
			};
		}

		const createResult = await this.createPrompt({
			name: data.name,
			collection_id: data.collection_id,
			string: data.string,
			parameters: data.parameters,
			virtual_key: data.virtual_key,
			model: data.model,
			version_description: data.version_description,
			template_metadata: {
				...data.template_metadata,
				app,
				env,
				migrated_at: new Date().toISOString(),
			},
			functions: data.functions,
			tools: data.tools,
			tool_choice: data.tool_choice,
		});

		return {
			action: "created",
			prompt_id: createResult.id,
			slug: createResult.slug,
			version_id: createResult.version_id,
			dry_run: false,
			message: `Created new prompt "${data.name}"`,
		};
	}

	async promotePrompt(
		data: PromotePromptRequest,
	): Promise<PromotePromptResponse> {
		const sourcePrompt = await this.getPrompt(data.source_prompt_id);
		const sourceVersion = sourcePrompt.current_version;

		const targetName =
			data.target_name ||
			sourcePrompt.name.replace(/-(dev|staging|prod)$/, "") +
				`-${data.target_env}`;

		const existingTargets = await this.listPrompts({
			collection_id: data.target_collection_id,
			search: targetName,
		});

		const existingTarget = existingTargets.data.find(
			(p) => p.name.toLowerCase() === targetName.toLowerCase(),
		);

		if (existingTarget) {
			const updateResult = await this.updatePrompt(existingTarget.id, {
				string: sourceVersion.string,
				parameters: sourceVersion.parameters,
				model: sourceVersion.model,
				virtual_key: sourceVersion.virtual_key,
				functions: sourceVersion.functions,
				tools: sourceVersion.tools,
				tool_choice: sourceVersion.tool_choice,
				version_description: `Promoted from ${sourcePrompt.slug} v${sourceVersion.version_number}`,
				template_metadata: {
					...sourceVersion.template_metadata,
					env: data.target_env,
					promoted_from: sourcePrompt.slug,
					promoted_from_version: sourceVersion.version_number.toString(),
					promoted_at: new Date().toISOString(),
				},
			});

			return {
				source_prompt_id: data.source_prompt_id,
				source_version_id: sourceVersion.id,
				target_prompt_id: updateResult.id,
				target_version_id: updateResult.prompt_version_id,
				action: "updated",
				promoted_at: new Date().toISOString(),
			};
		}

		const virtualKey = data.virtual_key || sourceVersion.virtual_key;
		if (!virtualKey) {
			throw new Error(
				"Cannot promote prompt: source version has no virtual_key and none was provided",
			);
		}

		const createResult = await this.createPrompt({
			name: targetName,
			collection_id: data.target_collection_id,
			string: sourceVersion.string,
			parameters: sourceVersion.parameters,
			virtual_key: virtualKey,
			model: sourceVersion.model,
			functions: sourceVersion.functions,
			tools: sourceVersion.tools,
			tool_choice: sourceVersion.tool_choice,
			version_description: `Promoted from ${sourcePrompt.slug} v${sourceVersion.version_number}`,
			template_metadata: {
				...sourceVersion.template_metadata,
				env: data.target_env,
				promoted_from: sourcePrompt.slug,
				promoted_from_version: sourceVersion.version_number.toString(),
				promoted_at: new Date().toISOString(),
			},
		});

		return {
			source_prompt_id: data.source_prompt_id,
			source_version_id: sourceVersion.id,
			target_prompt_id: createResult.id,
			target_version_id: createResult.version_id,
			action: "created",
			promoted_at: new Date().toISOString(),
		};
	}

	validateBillingMetadata(
		metadata: Partial<BillingMetadata>,
	): ValidateMetadataResult {
		const errors: string[] = [];
		const warnings: string[] = [];

		if (!metadata.client_id) {
			errors.push("Missing required field: client_id");
		}
		if (!metadata.app) {
			errors.push("Missing required field: app");
		}
		if (!metadata.env) {
			errors.push("Missing required field: env");
		}

		if (
			metadata.app &&
			!VALID_APPS.includes(metadata.app as (typeof VALID_APPS)[number])
		) {
			warnings.push(
				`Unrecognized app: "${metadata.app}". Expected one of: ${VALID_APPS.join(", ")}`,
			);
		}

		if (
			metadata.env &&
			!VALID_ENVS.includes(metadata.env as (typeof VALID_ENVS)[number])
		) {
			warnings.push(
				`Unrecognized env: "${metadata.env}". Expected one of: ${VALID_ENVS.join(", ")}`,
			);
		}

		if (!metadata.project_id) {
			warnings.push(
				"Missing recommended field: project_id (helps with billing attribution)",
			);
		}

		return {
			valid: errors.length === 0,
			errors,
			warnings,
		};
	}
}
