import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	BillingMetadataSchema,
	HyperparametersSchema,
	PromptFunctionSchema,
	PromptToolSchema,
	ToolChoiceSchema,
} from "../lib/schemas.js";
import type { PortkeyService } from "../services/index.js";

export function registerPromptsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// Create prompt tool
	server.tool(
		"create_prompt",
		"Create a new prompt template in Portkey. Prompts are versioned message templates with variable substitution support.",
		{
			name: z.string().describe("Display name for the prompt"),
			collection_id: z
				.string()
				.describe(
					"Collection ID to organize the prompt in (use list_collections to find)",
				),
			string: z
				.string()
				.describe("Prompt template string with {{variable}} mustache syntax"),
			parameters: z
				.record(z.string(), z.unknown())
				.describe("Default values for template variables"),
			virtual_key: z.string().describe("Virtual key slug for model access"),
			model: z
				.string()
				.optional()
				.describe("Model identifier (e.g., 'gpt-4', 'claude-3-opus')"),
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
		async (params) => {
			try {
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

				const result = await service.createPrompt({
					name: params.name,
					collection_id: params.collection_id,
					string: params.string,
					parameters: params.parameters,
					virtual_key: params.virtual_key,
					model: params.model,
					version_description: params.version_description,
					template_metadata: params.template_metadata,
					functions: params.functions,
					tools: params.tools,
					tool_choice: params.tool_choice,
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error creating prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List prompts tool
	server.tool(
		"list_prompts",
		"List all prompts in your Portkey organization with optional filtering by collection, workspace, or search query",
		{
			collection_id: z
				.string()
				.optional()
				.describe(
					"Filter by collection ID (recommended for app-specific prompts)",
				),
			workspace_id: z.string().optional().describe("Filter by workspace ID"),
			search: z.string().optional().describe("Search prompts by name"),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.positive()
				.max(100)
				.optional()
				.describe("Results per page (max 100)"),
		},
		async (params) => {
			try {
				const prompts = await service.listPrompts(params);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									total: prompts.total,
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
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing prompts: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get prompt tool
	server.tool(
		"get_prompt",
		"Retrieve detailed information about a specific prompt including its template, parameters, and version history",
		{
			prompt_id: z.string().describe("Prompt ID or slug to retrieve"),
		},
		async (params) => {
			try {
				const prompt = await service.getPrompt(params.prompt_id);
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
												template: prompt.current_version.string,
												parameters: prompt.current_version.parameters,
												metadata: prompt.current_version.template_metadata,
												has_tools: !!prompt.current_version.tools?.length,
												has_functions:
													!!prompt.current_version.functions?.length,
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update prompt tool
	server.tool(
		"update_prompt",
		"Update an existing prompt template. Creates a new version with the changes.",
		{
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
					"New prompt template string with {{variable}} mustache syntax",
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
		async (params) => {
			try {
				const { prompt_id, dry_run, ...updateData } = params;

				if (dry_run) {
					const current = await service.getPrompt(prompt_id);
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

				const result = await service.updatePrompt(prompt_id, updateData);

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Delete prompt tool
	server.tool(
		"delete_prompt",
		"Delete a prompt by its ID. This action cannot be undone and will remove the prompt and all its versions.",
		{
			prompt_id: z.string().describe("Prompt ID or slug to delete"),
		},
		async (params) => {
			try {
				await service.deletePrompt(params.prompt_id);
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Publish prompt tool
	server.tool(
		"publish_prompt",
		"Publish a specific version of a prompt, making it the default version that will be used when the prompt is called. This is useful for promoting a tested version to production.",
		{
			prompt_id: z.string().describe("Prompt ID or slug to publish"),
			version: z
				.number()
				.positive()
				.describe("Version number to publish as the default"),
		},
		async (params) => {
			try {
				await service.publishPrompt(params.prompt_id, {
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error publishing prompt version: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List prompt versions tool
	server.tool(
		"list_prompt_versions",
		"List all versions of a specific prompt with their details, including version number, description, template content, and creation date.",
		{
			prompt_id: z.string().describe("Prompt ID or slug to list versions for"),
		},
		async (params) => {
			try {
				const response = await service.listPromptVersions(params.prompt_id);
				// Handle both response formats: array directly or { data: [...], total: N }
				type VersionItem = {
					id: string;
					prompt_version: number;
					prompt_description?: string;
					status?: string;
					label_id?: string;
					created_at: string;
					prompt_template?: string | object;
				};
				const versions: VersionItem[] = Array.isArray(response)
					? response
					: (response as { data?: VersionItem[] }).data || [];
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
										template_preview:
											typeof v.prompt_template === "string"
												? v.prompt_template.substring(0, 200) +
													(v.prompt_template.length > 200 ? "..." : "")
												: "[object]",
									})),
								},
								null,
								2,
							),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing prompt versions: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Render prompt tool
	server.tool(
		"render_prompt",
		"Render a prompt template by substituting variables, returning the final messages without executing",
		{
			prompt_id: z.string().describe("Prompt ID or slug to render"),
			variables: z
				.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
				.describe("Variable values to substitute into the template"),
			hyperparameters: HyperparametersSchema.optional().describe(
				"Override default hyperparameters",
			),
		},
		async (params) => {
			try {
				const result = await service.renderPrompt(params.prompt_id, {
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error rendering prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Run prompt completion tool
	server.tool(
		"run_prompt_completion",
		"Execute a prompt template with variables and get the model completion response. REQUIRES billing metadata (client_id, app, env).",
		{
			prompt_id: z.string().describe("Prompt ID or slug to execute"),
			variables: z
				.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
				.describe("Variable values to substitute into the template"),
			metadata: BillingMetadataSchema.describe(
				"Billing metadata - client_id, app, env are REQUIRED for cost attribution",
			),
			hyperparameters: HyperparametersSchema.optional().describe(
				"Override default hyperparameters",
			),
		},
		async (params) => {
			try {
				const result = await service.runPromptCompletion(params.prompt_id, {
					variables: params.variables,
					metadata: params.metadata,
					hyperparameters: params.hyperparameters,
					stream: false,
				});

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error running prompt completion: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Migrate prompt tool
	server.tool(
		"migrate_prompt",
		"Create or update a prompt based on whether it exists. Useful for CI/CD and prompt-as-code workflows. Finds existing prompts by name within the collection.",
		{
			name: z.string().describe("Prompt name to create or find for update"),
			app: z
				.enum(["hourlink", "apizone", "research-pilot"])
				.describe("App identifier"),
			env: z.enum(["dev", "staging", "prod"]).describe("Environment"),
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
		async (params) => {
			try {
				const result = await service.migratePrompt({
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
					tool_choice: params.tool_choice,
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error migrating prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Promote prompt tool
	server.tool(
		"promote_prompt",
		"Promote a prompt from one environment to another (e.g., staging → prod). Copies the current version to the target environment.",
		{
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
			target_env: z
				.enum(["dev", "staging", "prod"])
				.describe("Target environment"),
			virtual_key: z
				.string()
				.optional()
				.describe(
					"Virtual key ID to use (defaults to source prompt's virtual_key)",
				),
		},
		async (params) => {
			try {
				const result = await service.promotePrompt({
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error promoting prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Validate completion metadata tool
	server.tool(
		"validate_completion_metadata",
		"Validate billing metadata before running a completion. Checks for required fields (client_id, app, env) and valid values.",
		{
			client_id: z
				.string()
				.optional()
				.describe("Client ID for billing attribution"),
			app: z
				.enum(["hourlink", "apizone", "research-pilot"])
				.optional()
				.describe("App identifier"),
			env: z
				.enum(["dev", "staging", "prod"])
				.optional()
				.describe("Environment"),
			project_id: z
				.string()
				.optional()
				.describe("Project ID for granular billing"),
			feature: z.string().optional().describe("Feature name for tracking"),
		},
		async (params) => {
			try {
				const result = service.validateBillingMetadata(params);

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error validating metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
