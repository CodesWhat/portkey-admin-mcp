import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	BillingMetadataSchema,
	HyperparametersSchema,
	PromptAppIdentifierSchema,
	PromptEnvironmentIdentifierSchema,
	PromptFunctionSchema,
	PromptToolSchema,
	ToolChoiceSchema,
	toPromptToolChoice,
} from "../lib/schemas.js";
import type { PortkeyService } from "../services/index.js";
import type { RawGetPromptResponse } from "../services/prompts.types.js";

const PROMPT_VARIABLES_SCHEMA = z
	.record(z.string(), z.union([z.string(), z.coerce.number(), z.boolean()]))
	.describe("Variable values to substitute into the template");

const PROMPTS_TOOL_SCHEMAS = {
	createPrompt: {
		name: z.string().describe("Display name for the prompt"),
		collection_id: z
			.string()
			.describe(
				"Collection ID to organize the prompt in (use list_collections to find)",
			),
		string: z
			.string()
			.describe(
				'The prompt template. Plain text OR a JSON-encoded messages array string for multi-message chat prompts: \'[{"role":"system","content":[{"type":"text","text":"..."}]},{"role":"user","content":[{"type":"text","text":"{{input}}"}]}]\'. Use get_prompt on an existing prompt to see the exact format.',
			),
		parameters: z
			.record(z.string(), z.unknown())
			.describe("Default values for template variables"),
		virtual_key: z.string().describe("Virtual key slug for model access"),
		model: z
			.string()
			.optional()
			.describe(
				"Model identifier (e.g., 'gpt-4', 'claude-3-opus'). Required unless ai_model_id or finetune_id is provided",
			),
		ai_model_id: z
			.string()
			.optional()
			.describe(
				"AI model ID (alternative to model). Required unless model or finetune_id is provided",
			),
		finetune_id: z
			.string()
			.optional()
			.describe(
				"Fine-tune ID (alternative to model). Required unless model or ai_model_id is provided",
			),
		version_description: z
			.string()
			.optional()
			.describe("Description for this prompt version"),
		template_metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Custom metadata (app, env, source_file, etc.)"),
		functions: z
			.array(PromptFunctionSchema)
			.optional()
			.describe("Function definitions for function calling"),
		tools: z
			.array(PromptToolSchema)
			.optional()
			.describe("Tool definitions for tool use"),
		tool_choice: ToolChoiceSchema.optional().describe("Tool choice strategy"),
		dry_run: z
			.boolean()
			.optional()
			.describe("When true, validate without creating"),
	},
	listPrompts: {
		collection_id: z
			.string()
			.optional()
			.describe(
				"Filter by collection ID (recommended for app-specific prompts)",
			),
		workspace_id: z.string().optional().describe("Filter by workspace ID"),
		search: z.string().optional().describe("Search prompts by name"),
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.positive()
			.max(100)
			.optional()
			.describe("Results per page (max 100)"),
	},
	getPrompt: {
		prompt_id: z.string().describe("Prompt ID or slug to retrieve"),
	},
	updatePrompt: {
		prompt_id: z.string().describe("Prompt ID or slug to update"),
		name: z.string().optional().describe("New display name for the prompt"),
		collection_id: z
			.string()
			.optional()
			.describe("Move to a different collection"),
		string: z
			.string()
			.optional()
			.describe(
				"Updated prompt template. Plain text OR a JSON-encoded messages array string for multi-message chat prompts. Use get_prompt to see the current format before updating.",
			),
		parameters: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("New default values for template variables"),
		model: z.string().optional().describe("New model identifier"),
		virtual_key: z.string().optional().describe("New virtual key slug"),
		version_description: z
			.string()
			.optional()
			.describe("Description for this version"),
		template_metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("New metadata"),
		functions: z
			.array(PromptFunctionSchema)
			.optional()
			.describe("New function definitions"),
		tools: z
			.array(PromptToolSchema)
			.optional()
			.describe("New tool definitions"),
		tool_choice: ToolChoiceSchema.optional().describe(
			"New tool choice strategy",
		),
		dry_run: z
			.boolean()
			.optional()
			.describe("When true, validate without updating"),
	},
	deletePrompt: {
		prompt_id: z.string().describe("Prompt ID or slug to delete"),
	},
	publishPrompt: {
		prompt_id: z.string().describe("Prompt ID or slug to publish"),
		version: z.coerce
			.number()
			.positive()
			.describe("Version number to publish as the default"),
	},
	listPromptVersions: {
		prompt_id: z.string().describe("Prompt ID or slug to list versions for"),
	},
	renderPrompt: {
		prompt_id: z.string().describe("Prompt ID or slug to render"),
		variables: PROMPT_VARIABLES_SCHEMA,
		hyperparameters: HyperparametersSchema.optional().describe(
			"Override default hyperparameters",
		),
	},
	runPromptCompletion: {
		prompt_id: z.string().describe("Prompt ID or slug to execute"),
		variables: PROMPT_VARIABLES_SCHEMA,
		metadata: BillingMetadataSchema.describe(
			"Billing metadata - client_id, app, env are REQUIRED for cost attribution",
		),
		hyperparameters: HyperparametersSchema.optional().describe(
			"Override default hyperparameters",
		),
	},
	migratePrompt: {
		name: z.string().describe("Prompt name to create or find for update"),
		app: PromptAppIdentifierSchema,
		env: PromptEnvironmentIdentifierSchema,
		collection_id: z
			.string()
			.describe("Collection ID to search in and create under"),
		string: z
			.string()
			.describe("Prompt template string with {{variable}} mustache syntax"),
		parameters: z
			.record(z.string(), z.unknown())
			.describe("Default values for template variables"),
		virtual_key: z.string().describe("Virtual key slug for model access"),
		model: z.string().optional().describe("Model identifier"),
		version_description: z
			.string()
			.optional()
			.describe("Description for this version"),
		template_metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("Additional custom metadata"),
		functions: z
			.array(PromptFunctionSchema)
			.optional()
			.describe("Function definitions"),
		tools: z.array(PromptToolSchema).optional().describe("Tool definitions"),
		tool_choice: ToolChoiceSchema.optional().describe("Tool choice strategy"),
		dry_run: z
			.boolean()
			.optional()
			.describe(
				"When true, only check what action would be taken without making changes",
			),
	},
	promotePrompt: {
		source_prompt_id: z
			.string()
			.describe("Source prompt ID or slug (e.g., staging prompt)"),
		target_collection_id: z
			.string()
			.describe("Target collection ID for the promoted prompt"),
		target_name: z
			.string()
			.optional()
			.describe(
				"Target prompt name (defaults to source name with env suffix replaced)",
			),
		target_env: PromptEnvironmentIdentifierSchema,
		virtual_key: z
			.string()
			.optional()
			.describe(
				"Virtual key ID to use (defaults to source prompt's virtual_key)",
			),
	},
	validateCompletionMetadata: {
		client_id: z
			.string()
			.optional()
			.describe("Client ID for billing attribution"),
		app: PromptAppIdentifierSchema.optional(),
		env: PromptEnvironmentIdentifierSchema.optional(),
		project_id: z
			.string()
			.optional()
			.describe("Project ID for granular billing"),
		feature: z.string().optional().describe("Feature name for tracking"),
	},
	getPromptVersion: {
		prompt_id: z.string().describe("Prompt ID or slug"),
		version_id: z.string().describe("Version UUID to retrieve"),
	},
	updatePromptVersion: {
		prompt_id: z.string().describe("Prompt ID or slug"),
		version_id: z.string().describe("Version UUID to update"),
		label_id: z
			.string()
			.nullable()
			.describe(
				"Label ID to assign to this version, or null to remove the label",
			),
	},
} as const;

function extractPromptTemplateString(template: unknown): string {
	const inner =
		typeof template === "object" && template !== null && "string" in template
			? (template as Record<string, unknown>).string
			: template;

	if (inner === undefined) {
		return "";
	}

	return typeof inner === "string" ? inner : JSON.stringify(inner);
}

function formatPromptVersion(version: RawGetPromptResponse): {
	prompt: {
		id: string;
		name: string;
		slug: string;
		collection_id: string;
		workspace_id?: string;
	};
	version: {
		id: string | undefined;
		number: number | undefined;
		description: string | undefined;
		status: string | undefined;
		model: string | undefined;
		virtual_key: string | undefined;
		template: string;
		parameters: Record<string, unknown> | undefined;
		metadata: Record<string, unknown> | undefined;
		function_names: string[];
		tool_names: string[];
		tool_choice: RawGetPromptResponse["tool_choice"];
		created_at: string;
		last_updated_at: string;
	};
} {
	return {
		prompt: {
			id: version.id,
			name: version.name,
			slug: version.slug,
			collection_id: version.collection_id,
			workspace_id: version.workspace_id,
		},
		version: {
			id: version.prompt_version_id,
			number: version.prompt_version,
			description: version.prompt_version_description,
			status: version.prompt_version_status,
			model: version.model,
			virtual_key: version.virtual_key,
			template: extractPromptTemplateString(version.string),
			parameters: version.parameters,
			metadata: version.template_metadata,
			function_names: (version.functions ?? []).map((fn) => fn.name),
			tool_names: (version.tools ?? []).map((tool) => tool.function.name),
			tool_choice: version.tool_choice,
			created_at: version.created_at,
			last_updated_at: version.last_updated_at,
		},
	};
}

function formatPromptListResponse(
	prompts: Awaited<ReturnType<PortkeyService["prompts"]["listPrompts"]>>,
	params: {
		current_page?: number;
		page_size?: number;
	},
): {
	total: number;
	current_page: number;
	page_size: number;
	returned_count: number;
	has_more: boolean;
	next_offset: number | null;
	next_page: number | null;
	prompts: Array<{
		id: string;
		name: string;
		slug: string;
		collection_id: string;
		model: string | undefined;
		status: string | undefined;
		created_at: string;
		last_updated_at: string;
	}>;
} {
	const currentPage = params.current_page ?? 1;
	const returnedCount = prompts.data.length;
	const pageSize = params.page_size ?? returnedCount;
	const nextOffset = currentPage * pageSize;
	const hasMore = returnedCount > 0 && nextOffset < prompts.total;

	return {
		total: prompts.total,
		current_page: currentPage,
		page_size: pageSize,
		returned_count: returnedCount,
		has_more: hasMore,
		next_offset: hasMore ? nextOffset : null,
		next_page: hasMore ? currentPage + 1 : null,
		prompts: prompts.data.map((prompt) => ({
			id: prompt.id,
			name: prompt.name,
			slug: prompt.slug,
			collection_id: prompt.collection_id,
			model: prompt.model,
			status: prompt.status,
			created_at: prompt.created_at,
			last_updated_at: prompt.last_updated_at,
		})),
	};
}

export function registerPromptsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create prompt tool
	server.tool(
		"create_prompt",
		`Create a new prompt template in Portkey. Supports both single-message and multi-message (chat) templates.

IMPORTANT: The "string" parameter accepts TWO formats:
1. Plain text: "Hello {{name}}, how can I help?"
2. Multi-message JSON array (MUST be a JSON-encoded string):
   '[{"role":"system","content":[{"type":"text","text":"You are a helpful assistant."}]},{"role":"user","content":[{"type":"text","text":"{{user_input}}"}]}]'

Most production prompts use format #2 (multi-message). Use get_prompt to see examples of the format.`,
		PROMPTS_TOOL_SCHEMAS.createPrompt,
		async (params) => {
			if (!params.model && !params.ai_model_id && !params.finetune_id) {
				return {
					content: [
						{
							type: "text",
							text: "Error creating prompt: At least one of model, ai_model_id, or finetune_id must be provided",
						},
					],
					isError: true,
				};
			}

			if (params.dry_run) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									dry_run: true,
									action: "create",
									message: `Would create prompt "${params.name}" in collection ${params.collection_id}`,
									prompt_preview: {
										name: params.name,
										collection_id: params.collection_id,
										model: params.model,
										template_length: params.string.length,
										parameter_count: Object.keys(params.parameters ?? {})
											.length,
									},
								},
								null,
								2,
							),
						},
					],
				};
			}

			const result = await service.prompts.createPrompt({
				name: params.name,
				collection_id: params.collection_id,
				string: params.string,
				parameters: params.parameters,
				virtual_key: params.virtual_key,
				model: params.model,
				ai_model_id: params.ai_model_id,
				finetune_id: params.finetune_id,
				version_description: params.version_description,
				template_metadata: params.template_metadata,
				functions: params.functions,
				tools: params.tools,
				tool_choice: toPromptToolChoice(params.tool_choice),
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created prompt "${params.name}"`,
								id: result.id,
								slug: result.slug,
								version_id: result.version_id,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// List prompts tool
	server.tool(
		"list_prompts",
		"List all prompts in your Portkey organization with optional filtering by collection, workspace, or search query. Returns paginated results with id, name, slug, model, and status. Use collection_id to filter by app. Use to discover prompt_id values before calling get_prompt.",
		PROMPTS_TOOL_SCHEMAS.listPrompts,
		async (params) => {
			const prompts = await service.prompts.listPrompts(params);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							formatPromptListResponse(prompts, params),
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get prompt tool
	server.tool(
		"get_prompt",
		`Retrieve detailed information about a specific prompt including its template, parameters, and version history.

The template field shows the raw "string" value stored in Portkey:
- If it starts with "[", it is a JSON-encoded messages array (multi-message prompt with roles).
- Otherwise it is a plain string template.
When updating a prompt, pass the same format back in the "string" field of update_prompt.`,
		PROMPTS_TOOL_SCHEMAS.getPrompt,
		async (params) => {
			const prompt = await service.prompts.getPrompt(params.prompt_id);

			// Resolve the raw template string — Portkey may return it as a nested { string: "..." } object
			const templateString = extractPromptTemplateString(
				prompt.current_version?.string,
			);

			// Detect format for caller guidance
			let templateFormat = "plain string";
			if (typeof templateString === "string") {
				const trimmed = templateString.trim();
				if (trimmed.startsWith("[")) {
					try {
						const parsed = JSON.parse(trimmed);
						if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role) {
							templateFormat = "multi-message (JSON messages array)";
						}
					} catch {
						// Not valid JSON — treat as plain string
					}
				}
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: prompt.id,
								name: prompt.name,
								slug: prompt.slug,
								collection_id: prompt.collection_id,
								created_at: prompt.created_at,
								last_updated_at: prompt.last_updated_at,
								current_version: prompt.current_version
									? {
											id: prompt.current_version.id,
											version_number: prompt.current_version.version_number,
											description: prompt.current_version.version_description,
											model: prompt.current_version.model,
											template_format: templateFormat,
											template: templateString,
											parameters: prompt.current_version.parameters,
											metadata: prompt.current_version.template_metadata,
											has_tools: !!prompt.current_version.tools?.length,
											has_functions: !!prompt.current_version.functions?.length,
										}
									: null,
								version_count: (prompt.versions || []).length,
								versions: (prompt.versions || []).map((v) => ({
									id: v.id,
									version_number: v.version_number,
									description: v.version_description,
									created_at: v.created_at,
								})),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update prompt tool
	server.tool(
		"update_prompt",
		`Update an existing prompt template. Creates a new version. Uses patch mode — only provided fields are updated, others are kept from the current version.

IMPORTANT: The "string" parameter accepts the same two formats as create_prompt:
1. Plain text: "Hello {{name}}"
2. Multi-message JSON array (MUST be a JSON-encoded string):
   '[{"role":"system","content":[{"type":"text","text":"..."}]},{"role":"user","content":[{"type":"text","text":"{{input}}"}]}]'

Use get_prompt first to see the current format, then pass the same format back. New versions are created in "archived" status — use publish_prompt to make active.`,
		PROMPTS_TOOL_SCHEMAS.updatePrompt,
		async (params) => {
			const { prompt_id, dry_run, ...updateData } = params;

			if (dry_run) {
				const current = await service.prompts.getPrompt(prompt_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									dry_run: true,
									action: "update",
									message: `Would update prompt "${current.name}"`,
									current_version:
										current.current_version?.version_number ?? null,
									changes: Object.keys(updateData).filter(
										(k) =>
											updateData[k as keyof typeof updateData] !== undefined,
									),
								},
								null,
								2,
							),
						},
					],
				};
			}

			const result = await service.prompts.updatePrompt(prompt_id, {
				...updateData,
				tool_choice: toPromptToolChoice(updateData.tool_choice),
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: "Successfully updated prompt",
								id: result.id,
								slug: result.slug,
								new_version_id: result.prompt_version_id,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Delete prompt tool
	server.tool(
		"delete_prompt",
		"Delete a prompt and all its versions by ID. This action cannot be undone. Applications calling this prompt slug will fail immediately. Use list_prompt_versions first to review history; consider archiving via update_prompt status instead if an audit trail is needed.",
		PROMPTS_TOOL_SCHEMAS.deletePrompt,
		async (params) => {
			await service.prompts.deletePrompt(params.prompt_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted prompt "${params.prompt_id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Publish prompt tool
	server.tool(
		"publish_prompt",
		"Publish a specific version of a prompt, making it the default version that will be used when the prompt is called. This is useful for promoting a tested version to production.",
		PROMPTS_TOOL_SCHEMAS.publishPrompt,
		async (params) => {
			await service.prompts.publishPrompt(params.prompt_id, {
				version: params.version,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully published version ${params.version} of prompt "${params.prompt_id}"`,
								prompt_id: params.prompt_id,
								published_version: params.version,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// List prompt versions tool
	server.tool(
		"list_prompt_versions",
		"List all versions of a specific prompt with their details, including version number, description, template content, and creation date.",
		PROMPTS_TOOL_SCHEMAS.listPromptVersions,
		async (params) => {
			const versions = await service.prompts.listPromptVersions(
				params.prompt_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								prompt_id: params.prompt_id,
								total_versions: versions.length,
								versions: versions.map((v) => ({
									id: v.id,
									version_number: v.prompt_version,
									description: v.prompt_description,
									status: v.status,
									label_id: v.label_id,
									created_at: v.created_at,
									template_preview: (() => {
										const tmpl = v.prompt_template;
										const str =
											typeof tmpl === "string"
												? tmpl
												: typeof tmpl === "object" &&
														tmpl !== null &&
														"string" in tmpl
													? (tmpl as { string: string }).string
													: JSON.stringify(tmpl);
										return (
											str.substring(0, 200) + (str.length > 200 ? "..." : "")
										);
									})(),
								})),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Render prompt tool
	server.tool(
		"render_prompt",
		"Render a prompt template by substituting variables, returning the final messages without executing. Previews the final messages after variable substitution without sending to the AI model. Use to verify template output before running a completion. Differs from run_prompt_completion which actually calls the model.",
		PROMPTS_TOOL_SCHEMAS.renderPrompt,
		async (params) => {
			const result = await service.prompts.renderPrompt(params.prompt_id, {
				variables: params.variables,
				hyperparameters: params.hyperparameters,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								success: result.success,
								rendered_messages: result.data.messages,
								model: result.data.model,
								hyperparameters: {
									max_tokens: result.data.max_tokens,
									temperature: result.data.temperature,
									top_p: result.data.top_p,
								},
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Run prompt completion tool
	server.tool(
		"run_prompt_completion",
		"Execute a prompt template against the configured AI model and return the model's response. Costs money — use render_prompt to preview first. REQUIRES billing metadata (client_id, app, env). Use validate_completion_metadata first if uncertain.",
		PROMPTS_TOOL_SCHEMAS.runPromptCompletion,
		async (params) => {
			const result = await service.prompts.runPromptCompletion(
				params.prompt_id,
				{
					variables: params.variables,
					metadata: params.metadata,
					hyperparameters: params.hyperparameters,
					stream: false,
				},
			);

			const choice = result.choices?.[0];
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: result.id,
								model: result.model,
								response: choice?.message?.content ?? null,
								finish_reason: choice?.finish_reason ?? null,
								usage: result.usage
									? {
											prompt_tokens: result.usage.prompt_tokens,
											completion_tokens: result.usage.completion_tokens,
											total_tokens: result.usage.total_tokens,
										}
									: null,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Migrate prompt tool
	server.tool(
		"migrate_prompt",
		"Create or update a prompt based on whether it exists. Useful for CI/CD and prompt-as-code workflows. Finds existing prompts by name within the collection. The app and env values are added to template_metadata automatically.",
		PROMPTS_TOOL_SCHEMAS.migratePrompt,
		async (params) => {
			const result = await service.prompts.migratePrompt({
				name: params.name,
				app: params.app,
				env: params.env,
				collection_id: params.collection_id,
				string: params.string,
				parameters: params.parameters,
				virtual_key: params.virtual_key,
				model: params.model,
				version_description: params.version_description,
				template_metadata: params.template_metadata,
				functions: params.functions,
				tools: params.tools,
				tool_choice: toPromptToolChoice(params.tool_choice),
				dry_run: params.dry_run,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								action: result.action,
								dry_run: result.dry_run,
								message: result.message,
								prompt_id: result.prompt_id ?? undefined,
								slug: result.slug ?? undefined,
								version_id: result.version_id ?? undefined,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Promote prompt tool
	server.tool(
		"promote_prompt",
		"Promote a prompt from one environment to another (e.g., staging -> prod). Copies the current version to the target environment. If the target prompt already exists it is updated with a new version; otherwise a new prompt is created.",
		PROMPTS_TOOL_SCHEMAS.promotePrompt,
		async (params) => {
			const result = await service.prompts.promotePrompt({
				source_prompt_id: params.source_prompt_id,
				target_collection_id: params.target_collection_id,
				target_name: params.target_name,
				target_env: params.target_env,
				virtual_key: params.virtual_key,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully promoted prompt to ${params.target_env}`,
								source: {
									prompt_id: result.source_prompt_id,
									version_id: result.source_version_id,
								},
								target: {
									prompt_id: result.target_prompt_id,
									version_id: result.target_version_id,
									action: result.action,
								},
								promoted_at: result.promoted_at,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Validate completion metadata tool
	server.tool(
		"validate_completion_metadata",
		"Validate billing metadata before running a completion. Checks for required fields (client_id, app, env) and valid values. Call this before run_prompt_completion to catch missing or invalid billing fields. Does not make any changes.",
		PROMPTS_TOOL_SCHEMAS.validateCompletionMetadata,
		async (params) => {
			const result = service.prompts.validateBillingMetadata(params);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								valid: result.valid,
								errors: result.errors,
								warnings: result.warnings,
								metadata: params,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// ==================== Individual Version Management ====================

	server.tool(
		"get_prompt_version",
		"Retrieve a specific version of a prompt by its version UUID. Use list_prompt_versions to find version IDs. Returns full template, parameters, and model config for that version.",
		PROMPTS_TOOL_SCHEMAS.getPromptVersion,
		async (params) => {
			const version = await service.prompts.getPromptVersion(
				params.prompt_id,
				params.version_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatPromptVersion(version), null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"update_prompt_version",
		"Update a specific prompt version. Currently only supports assigning or removing a label. Use list_prompt_labels to find label IDs. Pass null to remove the current label.",
		PROMPTS_TOOL_SCHEMAS.updatePromptVersion,
		async (params) => {
			if (params.label_id === undefined) {
				return {
					content: [
						{
							type: "text" as const,
							text: "Error: label_id is required — pass a label ID to assign, or null to remove the label",
						},
					],
					isError: true,
				};
			}
			await service.prompts.updatePromptVersion(
				params.prompt_id,
				params.version_id,
				{
					label_id: params.label_id,
				},
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated version "${params.version_id}" of prompt "${params.prompt_id}"`,
								success: true,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}
