import { isDeepStrictEqual } from "node:util";
import { BaseService, isNoContent } from "./base.service.js";
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
	PromptListItem,
	PromptVersionListItem,
	PublishPromptRequest,
	PublishPromptResponse,
	RawGetPromptResponse,
	RenderPromptRequest,
	RenderPromptResponse,
	UpdatePromptRequest,
	UpdatePromptResponse,
	ValidateMetadataResult,
} from "./prompts.types.js";

// Re-export types for consumers
export type * from "./prompts.types.js";

export class PromptsService extends BaseService {
	async createPrompt(data: CreatePromptRequest): Promise<CreatePromptResponse> {
		const { is_raw_template, ...rest } = data;
		return this.post<CreatePromptResponse>("/prompts", {
			...rest,
			...(is_raw_template !== undefined
				? { is_raw_template: Number(is_raw_template) }
				: {}),
		});
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
		// API returns version fields flattened at top level, not nested under current_version
		const raw = await this.get<RawGetPromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}`,
		);
		return {
			id: raw.id,
			name: raw.name,
			slug: raw.slug,
			collection_id: raw.collection_id,
			workspace_id: raw.workspace_id,
			created_at: raw.created_at,
			last_updated_at: raw.last_updated_at,
			current_version: raw.prompt_version_id
				? {
						id: raw.prompt_version_id,
						version_number: raw.prompt_version ?? 0,
						version_description: raw.prompt_version_description,
						string: raw.string ?? "",
						parameters: raw.parameters ?? {},
						model: raw.model,
						virtual_key: raw.virtual_key,
						functions: raw.functions ?? undefined,
						tools: raw.tools ?? undefined,
						tool_choice: raw.tool_choice ?? undefined,
						template_metadata: raw.template_metadata,
						is_raw_template:
							raw.is_raw_template === undefined
								? undefined
								: Boolean(raw.is_raw_template),
						created_at: raw.created_at,
					}
				: undefined,
			object: "prompt",
		};
	}

	async updatePrompt(
		promptId: string,
		data: UpdatePromptRequest,
	): Promise<UpdatePromptResponse> {
		// PUT /prompts/:id accepts "string" (same as POST), NOT "prompt_template".
		// "template_metadata" must be remapped to "prompt_metadata".
		const { template_metadata, is_raw_template, ...rest } = data;
		const body: Record<string, unknown> = {
			...rest,
			// Enable partial updates so missing version fields are backfilled from latest version
			patch: true,
		};
		if (template_metadata !== undefined) {
			body.prompt_metadata = template_metadata;
		}
		if (is_raw_template !== undefined) {
			body.is_raw_template = Number(is_raw_template);
		}
		return this.put<UpdatePromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}`,
			body,
		);
	}

	async deletePrompt(promptId: string): Promise<DeletePromptResponse> {
		const result = await this.delete<DeletePromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}`,
		);
		return isNoContent(result) ? {} : result;
	}

	async publishPrompt(
		promptId: string,
		data: PublishPromptRequest,
	): Promise<PublishPromptResponse> {
		return this.put<PublishPromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}/makeDefault`,
			data,
		);
	}

	async getPromptVersion(
		promptId: string,
		versionId: string,
	): Promise<RawGetPromptResponse> {
		// Returns the full prompt object with version fields flattened in
		return this.get<RawGetPromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}/versions/${this.encodePathSegment(versionId)}`,
		);
	}

	async updatePromptVersion(
		promptId: string,
		versionId: string,
		data: { label_id?: string | null },
	): Promise<{ success: boolean }> {
		await this.put(
			`/prompts/${this.encodePathSegment(promptId)}/versions/${this.encodePathSegment(versionId)}`,
			data,
		);
		return { success: true };
	}

	async listPromptVersions(promptId: string): Promise<PromptVersionListItem[]> {
		// API returns { object: "list", total, data: [...] } — unwrap to plain array
		const response = await this.get<ListPromptVersionsResponse>(
			`/prompts/${this.encodePathSegment(promptId)}/versions`,
		);
		return response.data;
	}

	private async findPromptByExactName(
		name: string,
		collectionId: string,
	): Promise<PromptListItem | undefined> {
		const pageSize = 100;
		let currentPage = 1;
		while (true) {
			const page = await this.listPrompts({
				collection_id: collectionId,
				search: name,
				page_size: pageSize,
				current_page: currentPage,
			});
			const exact = page.data.find(
				(prompt) => prompt.name.toLowerCase() === name.toLowerCase(),
			);
			if (exact) {
				return exact;
			}
			if (page.data.length === 0 || currentPage * pageSize >= page.total) {
				return undefined;
			}
			currentPage += 1;
		}
	}

	async renderPrompt(
		promptId: string,
		data: RenderPromptRequest,
	): Promise<RenderPromptResponse> {
		// Flatten hyperparameters like runPromptCompletion does
		return this.post<RenderPromptResponse>(
			`/prompts/${this.encodePathSegment(promptId)}/render`,
			{
				...data.hyperparameters,
				variables: data.variables,
			},
		);
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
			`/prompts/${this.encodePathSegment(promptId)}/completions`,
			{
				...data.hyperparameters,
				variables: data.variables,
				metadata: data.metadata,
				stream: false,
			},
		);
	}

	// Note: listPrompts() + getPrompt() is two API calls per invocation.
	// Portkey doesn't offer get-by-name, so the list-then-get pattern is required.
	// Acceptable at current scale; consider caching if this becomes a hot path.
	async migratePrompt(
		data: MigratePromptRequest,
	): Promise<MigratePromptResponse> {
		const { dry_run = false, app, env } = data;

		const existingPrompt = await this.findPromptByExactName(
			data.name,
			data.collection_id,
		);

		if (existingPrompt) {
			const currentPrompt = await this.getPrompt(existingPrompt.id);
			const currentVersion = currentPrompt.current_version;
			if (!currentVersion) {
				throw new Error(
					`Prompt "${data.name}" exists but has no active version`,
				);
			}

			const templateChanged = !isDeepStrictEqual(
				currentVersion.string,
				data.string,
			);
			const parametersChanged = !isDeepStrictEqual(
				currentVersion.parameters,
				data.parameters,
			);
			const modelChanged =
				data.model !== undefined && currentVersion.model !== data.model;
			const virtualKeyChanged = currentVersion.virtual_key !== data.virtual_key;
			const versionDescriptionChanged =
				data.version_description !== undefined &&
				currentVersion.version_description !== data.version_description;
			const functionsChanged =
				data.functions !== undefined &&
				!isDeepStrictEqual(currentVersion.functions, data.functions);
			const toolsChanged =
				data.tools !== undefined &&
				!isDeepStrictEqual(currentVersion.tools, data.tools);
			const toolChoiceChanged =
				data.tool_choice !== undefined &&
				!isDeepStrictEqual(currentVersion.tool_choice, data.tool_choice);
			const rawTemplateChanged =
				data.is_raw_template !== undefined &&
				currentVersion.is_raw_template !== data.is_raw_template;
			const desiredMetadata = { ...data.template_metadata, app, env };
			const currentMetadata = currentVersion.template_metadata ?? {};
			const metadataChanged = Object.entries(desiredMetadata).some(
				([key, value]) => !isDeepStrictEqual(currentMetadata[key], value),
			);

			const needsUpdate =
				templateChanged ||
				parametersChanged ||
				modelChanged ||
				virtualKeyChanged ||
				versionDescriptionChanged ||
				functionsChanged ||
				toolsChanged ||
				toolChoiceChanged ||
				rawTemplateChanged ||
				metadataChanged;

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
				is_raw_template: data.is_raw_template,
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
			is_raw_template: data.is_raw_template,
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

	// Note: Two API calls (getPrompt + listPrompts) per invocation — same
	// list-then-get pattern as migratePrompt. See note above.
	async promotePrompt(
		data: PromotePromptRequest,
	): Promise<PromotePromptResponse> {
		const sourcePrompt = await this.getPrompt(data.source_prompt_id);
		const sourceVersion = sourcePrompt.current_version;
		if (!sourceVersion) {
			throw new Error(`Source prompt has no active version to promote`);
		}

		const targetName =
			data.target_name ||
			sourcePrompt.name.replace(/-(dev|staging|prod)$/, "") +
				`-${data.target_env}`;

		const existingTarget = await this.findPromptByExactName(
			targetName,
			data.target_collection_id,
		);

		if (existingTarget) {
			const updateResult = await this.updatePrompt(existingTarget.id, {
				string: sourceVersion.string,
				parameters: sourceVersion.parameters,
				model: sourceVersion.model,
				virtual_key: data.virtual_key || sourceVersion.virtual_key,
				functions: sourceVersion.functions,
				tools: sourceVersion.tools,
				tool_choice: sourceVersion.tool_choice,
				is_raw_template: sourceVersion.is_raw_template,
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
			is_raw_template: sourceVersion.is_raw_template,
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
