import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimitsRpm, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";
import {
	createSecretMappingSchema,
	uniqueSecretMappingsSchema,
} from "./secret-mapping.schemas.js";
import { jsonResult } from "./utils.js";

const integrationSecretMappingSchema = createSecretMappingSchema({
	allowKeyTarget: true,
	targetFieldDescription:
		"Integration field populated at runtime: key or configurations.<field>",
	secretReferenceDescription:
		"Secret Reference UUID or slug accessible to the workspace",
	valueFormatDescription:
		"Treat the resolved value as a plain string or parsed JSON",
});

const integrationSecretMappingsSchema = uniqueSecretMappingsSchema(
	integrationSecretMappingSchema,
);

const nullableMultiplier = (description: string) =>
	z.coerce.number().nonnegative().nullable().optional().describe(description);

const pricingMultiplierSchema = z.object({
	default: nullableMultiplier(
		"Fallback multiplier for pricing units; 1 is unchanged, 0.8 is a 20% discount",
	),
	request_token: nullableMultiplier("Input token price multiplier"),
	response_token: nullableMultiplier("Output token price multiplier"),
	cache_read_input_token: nullableMultiplier(
		"Cache-read input token price multiplier",
	),
	cache_write_input_token: nullableMultiplier(
		"Cache-write input token price multiplier",
	),
	cache_read_audio_input_token: nullableMultiplier(
		"Cache-read audio input token price multiplier",
	),
	request_audio_token: nullableMultiplier("Audio input token price multiplier"),
	response_audio_token: nullableMultiplier(
		"Audio output token price multiplier",
	),
	reasoning_token: nullableMultiplier("Reasoning token price multiplier"),
	prediction_accepted_token: nullableMultiplier(
		"Accepted predicted-output token price multiplier",
	),
	prediction_rejected_token: nullableMultiplier(
		"Rejected predicted-output token price multiplier",
	),
	request_image_token: nullableMultiplier("Image input token price multiplier"),
	response_image_token: nullableMultiplier(
		"Image output token price multiplier",
	),
	request_text_token: nullableMultiplier("Text input token price multiplier"),
	response_text_token: nullableMultiplier("Text output token price multiplier"),
	cache_read_image_input_token: nullableMultiplier(
		"Cache-read image input token price multiplier",
	),
	cache_read_text_input_token: nullableMultiplier(
		"Cache-read text input token price multiplier",
	),
	cache_write_text_input_token: nullableMultiplier(
		"Cache-write text input token price multiplier",
	),
	cache_write_image_input_token: nullableMultiplier(
		"Cache-write image input token price multiplier",
	),
	image: z
		.object({
			default: nullableMultiplier("Default image-generation price multiplier"),
		})
		.nullable()
		.optional()
		.describe("Image-generation pricing multipliers"),
	additional_units: z
		.record(z.string(), z.coerce.number().nonnegative().nullable())
		.nullable()
		.optional()
		.describe(
			"Multipliers keyed by Portkey pricing unit, such as web_search or file_search",
		),
});

const pricingAdjustmentsSchema = z
	.object({
		multiplier: pricingMultiplierSchema
			.optional()
			.describe("Per-unit multipliers applied over Portkey catalog pricing"),
	})
	.nullable();

const modelConfigurationsSchema = z.object({
	custom_host: z
		.string()
		.url()
		.optional()
		.describe("Custom upstream URL used only for this model"),
	custom_headers: z
		.record(z.string(), z.string())
		.optional()
		.describe("Headers sent only for this model; values may contain secrets"),
});

const tokenPricingSchema = z.object({
	price: z.coerce
		.number()
		.nonnegative()
		.describe("Static price per token in the integration pricing unit"),
});

const integrationModelPricingSchema = z.object({
	type: z.literal("static").describe("Static per-token pricing configuration"),
	pay_as_you_go: z
		.object({
			request_token: tokenPricingSchema
				.optional()
				.describe("Input token pricing"),
			response_token: tokenPricingSchema
				.optional()
				.describe("Output token pricing"),
		})
		.optional()
		.describe("Pay-as-you-go rates for this integration model"),
});

const INTEGRATIONS_TOOL_SCHEMAS = {
	getModelPricing: {
		provider: z
			.string()
			.describe(
				"Lowercase Portkey provider identifier, such as openai, anthropic, bedrock, or x-ai",
			),
		model: z
			.string()
			.describe("Exact provider model identifier, such as gpt-4o"),
	},
	listIntegrations: {
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number; the first page is 0"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (default 100, max 100)"),
		workspace_id: z
			.string()
			.optional()
			.describe("Filter integrations accessible by a specific workspace"),
		type: z
			.enum(["workspace", "organisation", "all"])
			.optional()
			.describe(
				"Filter by integration type: 'workspace', 'organisation', or 'all' (default)",
			),
	},
	createIntegration: {
		name: z.string().describe("Human-readable name for the integration"),
		ai_provider_id: z
			.string()
			.describe(
				"ID of the AI provider (e.g., 'openai', 'anthropic', 'azure-openai', 'aws-bedrock', 'vertex-ai')",
			),
		slug: z
			.string()
			.optional()
			.describe(
				"URL-friendly identifier (auto-generated from name if not provided)",
			),
		key: z
			.string()
			.optional()
			.describe("API key for the provider (if required)"),
		description: z
			.string()
			.optional()
			.describe("Optional description of the integration"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID for workspace-scoped integrations"),
		api_version: z
			.string()
			.optional()
			.describe("API version (for Azure OpenAI)"),
		resource_name: z
			.string()
			.optional()
			.describe("Resource name (for Azure OpenAI)"),
		deployment_name: z
			.string()
			.optional()
			.describe("Deployment name (for Azure OpenAI)"),
		aws_region: z.string().optional().describe("AWS region (for AWS Bedrock)"),
		aws_access_key_id: z
			.string()
			.optional()
			.describe("AWS access key ID (for AWS Bedrock)"),
		aws_secret_access_key: z
			.string()
			.optional()
			.describe("AWS secret access key (for AWS Bedrock)"),
		vertex_project_id: z
			.string()
			.optional()
			.describe("GCP project ID (for Vertex AI)"),
		vertex_region: z.string().optional().describe("GCP region (for Vertex AI)"),
		custom_host: z
			.string()
			.optional()
			.describe("Custom base URL for the provider"),
		create_default_provider: z
			.boolean()
			.optional()
			.describe(
				"Create a provider automatically for a workspace-scoped integration; defaults to true",
			),
		default_provider_slug: z
			.string()
			.max(255)
			.regex(/^[a-zA-Z0-9_-]+$/)
			.optional()
			.describe("Custom slug for the automatically created workspace provider"),
		secret_mappings: integrationSecretMappingsSchema
			.optional()
			.describe(
				"Unique runtime Secret Reference mappings; mapping key allows the key field to be omitted",
			),
		pricing_adjustments: pricingAdjustmentsSchema
			.optional()
			.describe(
				"Negotiated discount or markup multipliers for cost accounting",
			),
	},
	getIntegration: {
		slug: z
			.string()
			.describe("The unique slug identifier of the integration to retrieve"),
	},
	updateIntegration: {
		slug: z.string().describe("The slug of the integration to update"),
		name: z
			.string()
			.optional()
			.describe("New human-readable name for the integration"),
		key: z.string().optional().describe("New API key for the provider"),
		description: z
			.string()
			.optional()
			.describe("New description for the integration"),
		api_version: z
			.string()
			.optional()
			.describe("New API version (for Azure OpenAI)"),
		resource_name: z
			.string()
			.optional()
			.describe("New resource name (for Azure OpenAI)"),
		deployment_name: z
			.string()
			.optional()
			.describe("New deployment name (for Azure OpenAI)"),
		aws_region: z
			.string()
			.optional()
			.describe("New AWS region (for AWS Bedrock)"),
		aws_access_key_id: z
			.string()
			.optional()
			.describe("New AWS access key ID (for AWS Bedrock)"),
		aws_secret_access_key: z
			.string()
			.optional()
			.describe("New AWS secret access key (for AWS Bedrock)"),
		vertex_project_id: z
			.string()
			.optional()
			.describe("New GCP project ID (for Vertex AI)"),
		vertex_region: z
			.string()
			.optional()
			.describe("New GCP region (for Vertex AI)"),
		custom_host: z
			.string()
			.optional()
			.describe("New custom base URL for the provider"),
		secret_mappings: integrationSecretMappingsSchema
			.optional()
			.describe(
				"Replacement runtime Secret Reference mappings; each target_field must be unique",
			),
		pricing_adjustments: pricingAdjustmentsSchema
			.optional()
			.describe(
				"Replacement cost multiplier configuration, or null to clear adjustments",
			),
	},
	deleteIntegration: {
		slug: z.string().describe("The slug of the integration to delete"),
	},
	listIntegrationModels: {
		slug: z.string().describe("The slug of the integration"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number; the first page is 0"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page"),
	},
	updateIntegrationModels: {
		slug: z.string().describe("The slug of the integration"),
		allow_all_models: z
			.boolean()
			.optional()
			.describe(
				"Whether newly available provider models are enabled by default",
			),
		models: z
			.array(
				z.object({
					slug: z.string().describe("The model slug identifier"),
					model_name: z
						.string()
						.optional()
						.describe(
							"Display name for the model (required for custom models)",
						),
					enabled: z.boolean().describe("Whether the model is enabled"),
					is_custom: z
						.boolean()
						.optional()
						.describe("Whether this is a custom model (default: false)"),
					is_finetune: z
						.boolean()
						.optional()
						.describe("Whether this entry is a fine-tuned model"),
					base_model_slug: z
						.string()
						.optional()
						.describe("Base model slug for a fine-tuned model"),
					configurations: modelConfigurationsSchema
						.optional()
						.describe("Per-model custom upstream host and headers"),
					pricing_config: integrationModelPricingSchema
						.optional()
						.describe("Static custom pricing for this integration model"),
				}),
			)
			.describe("Array of model configurations to update"),
	},
	deleteIntegrationModel: {
		slug: z.string().describe("The slug of the integration"),
		model_slug: z.string().describe("The slug of the model to delete"),
	},
	listIntegrationWorkspaces: {
		slug: z.string().describe("The slug of the integration"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number; the first page is 0"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page"),
	},
	updateIntegrationWorkspaces: {
		slug: z.string().describe("The slug of the integration"),
		workspaces: z
			.array(
				z.object({
					id: z.string().describe("The workspace ID"),
					enabled: z
						.boolean()
						.describe("Whether the workspace has access to this integration"),
					credit_limit: z.coerce
						.number()
						.positive()
						.optional()
						.describe("Credit limit for this workspace"),
					alert_threshold: z.coerce
						.number()
						.min(0)
						.max(100)
						.optional()
						.describe("Alert threshold percentage (0-100)"),
					rate_limit_rpm: z.coerce
						.number()
						.positive()
						.optional()
						.describe("Rate limit in requests per minute"),
					reset_usage: z
						.boolean()
						.optional()
						.describe("Reset exhausted usage status to active"),
					create_default_provider: z
						.boolean()
						.optional()
						.describe(
							"Override whether a provider is auto-created for this workspace",
						),
					default_provider_slug: z
						.string()
						.optional()
						.describe(
							"Override the auto-created provider slug for this workspace",
						),
				}),
			)
			.describe("Array of workspace configurations to update"),
		global_workspace_access_enabled: z
			.boolean()
			.optional()
			.describe(
				"Enable or disable access for all current and future workspaces",
			),
		global_credit_limit: z.coerce
			.number()
			.positive()
			.optional()
			.describe(
				"Global cost credit limit applied with global workspace access",
			),
		global_alert_threshold: z.coerce
			.number()
			.nonnegative()
			.max(100)
			.optional()
			.describe("Global cost alert threshold applied to workspace access"),
		global_rate_limit_rpm: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Global requests-per-minute limit for workspace access"),
		override_existing_workspace_access: z
			.boolean()
			.optional()
			.describe("Apply global settings over existing per-workspace access"),
		create_default_provider: z
			.boolean()
			.optional()
			.describe("Auto-create providers when granting workspace access"),
		default_provider_slug: z
			.string()
			.optional()
			.describe("Default slug for providers auto-created in workspaces"),
	},
} as const;

const updateIntegrationWorkspacesSchema = z
	.object(INTEGRATIONS_TOOL_SCHEMAS.updateIntegrationWorkspaces)
	.superRefine((value, ctx) => {
		const hasGlobalLimits =
			value.global_credit_limit !== undefined ||
			value.global_alert_threshold !== undefined ||
			value.global_rate_limit_rpm !== undefined;
		if (
			hasGlobalLimits &&
			value.global_workspace_access_enabled === undefined
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["global_workspace_access_enabled"],
				message:
					"global_workspace_access_enabled is required when setting global limits.",
			});
		}
	});

function buildIntegrationConfigurations(params: {
	api_version?: string;
	resource_name?: string;
	deployment_name?: string;
	aws_region?: string;
	aws_access_key_id?: string;
	aws_secret_access_key?: string;
	vertex_project_id?: string;
	vertex_region?: string;
	custom_host?: string;
}): Record<string, unknown> | undefined {
	const configurations: Record<string, unknown> = {};
	if (params.api_version !== undefined)
		configurations.api_version = params.api_version;
	if (params.resource_name !== undefined)
		configurations.resource_name = params.resource_name;
	if (params.deployment_name !== undefined)
		configurations.deployment_name = params.deployment_name;
	if (params.aws_region !== undefined)
		configurations.aws_region = params.aws_region;
	if (params.aws_access_key_id !== undefined)
		configurations.aws_access_key_id = params.aws_access_key_id;
	if (params.aws_secret_access_key !== undefined)
		configurations.aws_secret_access_key = params.aws_secret_access_key;
	if (params.vertex_project_id !== undefined)
		configurations.vertex_project_id = params.vertex_project_id;
	if (params.vertex_region !== undefined)
		configurations.vertex_region = params.vertex_region;
	if (params.custom_host !== undefined)
		configurations.custom_host = params.custom_host;
	return Object.keys(configurations).length > 0 ? configurations : undefined;
}

export function registerIntegrationsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"get_model_pricing",
		"Get Portkey's current public pricing configuration for one exact provider/model pair. Prices are returned in USD cents per token or provider-specific unit and may include cache, audio, image, fine-tuning, and calculation metadata. Use this read-only catalog lookup before setting integration pricing_adjustments or custom-model pricing; it does not return your negotiated integration multiplier or require Portkey authentication.",
		INTEGRATIONS_TOOL_SCHEMAS.getModelPricing,
		{
			title: "Get Model Pricing",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(
				await service.integrations.getModelPricing(
					params.provider,
					params.model,
				),
			),
	);

	// List integrations tool
	server.tool(
		"list_integrations",
		"List org-level AI provider connections with optional workspace or type filters. Use this to find integration slugs before model or workspace updates. Returns total plus id, name, slug, provider, status, description, workspace counts, and config summary.",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrations,
		async (params) => {
			const integrations = await service.integrations.listIntegrations({
				current_page: params.current_page,
				page_size: params.page_size,
				workspace_id: params.workspace_id,
				type: params.type,
			});

			return jsonResult({
				total: integrations.total,
				integrations: integrations.data.map((integration) => ({
					id: integration.id,
					name: integration.name,
					slug: integration.slug,
					ai_provider_id: integration.ai_provider_id,
					status: integration.status,
					description: integration.description,
					organisation_id: integration.organisation_id,
					created_at: integration.created_at,
					last_updated_at: integration.last_updated_at,
				})),
			});
		},
	);

	// Create integration tool
	server.tool(
		"create_integration",
		"Create an AI-provider integration that becomes the source for workspace providers. ai_provider_id identifies the backend; provider-specific fields configure Azure, Bedrock, Vertex, or custom hosts. For workspace-scoped integrations, create_default_provider controls automatic provider creation. key is write-only, but secret_mappings can resolve it or configuration fields from Secret References at runtime. pricing_adjustments apply negotiated discounts or markups to cost accounting. Use update_integration_models and update_integration_workspaces after creation; returns the new integration id and slug.",
		INTEGRATIONS_TOOL_SCHEMAS.createIntegration,
		{
			title: "Create AI Provider Integration",
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.integrations.createIntegration({
				name: params.name,
				ai_provider_id: params.ai_provider_id,
				slug: params.slug,
				key: params.key,
				description: params.description,
				workspace_id: params.workspace_id,
				configurations: buildIntegrationConfigurations(params),
				...(params.create_default_provider !== undefined
					? { create_default_provider: params.create_default_provider }
					: {}),
				...(params.default_provider_slug !== undefined
					? { default_provider_slug: params.default_provider_slug }
					: {}),
				...(params.secret_mappings !== undefined
					? { secret_mappings: params.secret_mappings }
					: {}),
				...(params.pricing_adjustments !== undefined
					? { pricing_adjustments: params.pricing_adjustments }
					: {}),
			});

			return jsonResult({
				message: `Successfully created integration "${params.name}"`,
				id: result.id,
				slug: result.slug,
			});
		},
	);

	// Get integration tool
	server.tool(
		"get_integration",
		"Fetch one integration by slug, including masked key, workspace access, allowed models, and configuration metadata. Use this before editing provider-specific settings or auditing access.",
		INTEGRATIONS_TOOL_SCHEMAS.getIntegration,
		async (params) => {
			const integration = await service.integrations.getIntegration(
				params.slug,
			);

			return jsonResult({
				id: integration.id,
				name: integration.name,
				slug: integration.slug,
				ai_provider_id: integration.ai_provider_id,
				status: integration.status,
				description: integration.description,
				organisation_id: integration.organisation_id,
				masked_key: integration.masked_key,
				configurations: integration.configurations,
				global_workspace_access_settings:
					integration.global_workspace_access_settings,
				allow_all_models: integration.allow_all_models,
				workspace_count: integration.workspace_count,
				secret_mappings: integration.secret_mappings,
				pricing_adjustments: integration.pricing_adjustments,
				created_at: integration.created_at,
				last_updated_at: integration.last_updated_at,
			});
		},
	);

	// Update integration tool
	server.tool(
		"update_integration",
		"Update an integration's name, description, API key, provider config, Secret Reference mappings, or pricing adjustments by slug. Only provided fields change; key, secret mapping, and config changes take effect immediately and can disrupt dependent providers or live requests, while pricing multipliers change cost analytics and budget accounting. Review get_integration first. Model availability and workspace access remain separate in update_integration_models and update_integration_workspaces.",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegration,
		{
			title: "Update AI Provider Integration",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.integrations.updateIntegration(params.slug, {
				name: params.name,
				key: params.key,
				description: params.description,
				configurations: buildIntegrationConfigurations(params),
				secret_mappings: params.secret_mappings,
				pricing_adjustments: params.pricing_adjustments,
			});

			return jsonResult({
				message: `Successfully updated integration "${params.slug}"`,
				success: result.success,
			});
		},
	);

	// Delete integration tool
	server.tool(
		"delete_integration",
		"Delete an integration by slug. This is irreversible and stops the org-level connection, which will break dependent virtual keys, providers, and workspace access.",
		INTEGRATIONS_TOOL_SCHEMAS.deleteIntegration,
		async (params) => {
			const result = await service.integrations.deleteIntegration(params.slug);

			return jsonResult({
				message: `Successfully deleted integration "${params.slug}"`,
				success: result.success,
			});
		},
	);

	// List integration models tool
	server.tool(
		"list_integration_models",
		"List models enabled on an integration. Use this to verify model availability before creating prompts or configs. Returns total plus model ids, display names, enabled state, and custom-model markers.",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrationModels,
		async (params) => {
			const models = await service.integrations.listIntegrationModels(
				params.slug,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);

			return jsonResult({
				total: models.total,
				integration_slug: params.slug,
				models: models.data.map((model) => ({
					id: model.id,
					slug: model.slug ?? model.model_id,
					name: model.name ?? model.model_name,
					enabled: model.enabled,
					is_custom: model.is_custom ?? model.custom,
					is_finetune: model.is_finetune,
					base_model_slug: model.base_model_slug,
					configurations: model.configurations,
					pricing_config: model.pricing_config,
					created_at: model.created_at,
					last_updated_at: model.last_updated_at,
				})),
			});
		},
	);

	// Update integration models tool
	server.tool(
		"update_integration_models",
		"Bulk enable or disable integration models, register custom or fine-tuned models, set per-model hosts and headers, and attach static token pricing. allow_all_models controls whether future provider models start enabled. These changes affect every workspace using the integration; inspect list_integration_models first and use get_model_pricing when deriving custom rates. Returns success and the number of models updated.",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegrationModels,
		{
			title: "Update Integration Models",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.integrations.updateIntegrationModels(
				params.slug,
				{
					models: params.models,
					allow_all_models: params.allow_all_models,
				},
			);

			return jsonResult({
				message: `Successfully updated models for integration "${params.slug}"`,
				success: result.success,
				models_updated: params.models.length,
			});
		},
	);

	// Delete integration model tool
	server.tool(
		"delete_integration_model",
		"Delete a custom model from an integration. Built-in models should be disabled instead, because deletion only applies to custom entries. Returns success after the custom model is removed.",
		INTEGRATIONS_TOOL_SCHEMAS.deleteIntegrationModel,
		async (params) => {
			const result = await service.integrations.deleteIntegrationModel(
				params.slug,
				params.model_slug,
			);

			return jsonResult({
				message: `Successfully deleted model "${params.model_slug}" from integration "${params.slug}"`,
				success: result.success,
			});
		},
	);

	// List integration workspaces tool
	server.tool(
		"list_integration_workspaces",
		"List workspaces that can use an integration, with their limits. Use this to audit access or confirm per-workspace cost and rate settings. Returns total plus workspace ids, names, enabled state, usage limits, and rate limits.",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrationWorkspaces,
		async (params) => {
			const workspaces = await service.integrations.listIntegrationWorkspaces(
				params.slug,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);

			return jsonResult({
				total: workspaces.total,
				integration_slug: params.slug,
				workspaces: workspaces.data.map((ws) => ({
					id: ws.id,
					workspace_id: ws.workspace_id ?? ws.id,
					workspace_name: ws.workspace_name,
					enabled: ws.enabled,
					usage_limits: ws.usage_limits,
					rate_limits: ws.rate_limits,
					created_at: ws.created_at,
					last_updated_at: ws.last_updated_at,
				})),
			});
		},
	);

	// Update integration workspaces tool
	server.tool(
		"update_integration_workspaces",
		"Control per-workspace and global access to an integration, including cost/rate limits, usage resets, and automatic default-provider creation. global_workspace_access_enabled affects current and future workspaces; override_existing_workspace_access determines whether it replaces explicit workspace settings. Per-workspace default-provider fields override top-level values. Review list_integration_workspaces first because access and limits change downstream usage immediately.",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegrationWorkspaces,
		{
			title: "Update Integration Workspace Access",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (rawParams) => {
			const params = updateIntegrationWorkspacesSchema.parse(rawParams);

			const globalUsageLimits =
				params.global_credit_limit !== undefined ||
				params.global_alert_threshold !== undefined
					? [
							{
								type: "cost" as const,
								credit_limit: params.global_credit_limit,
								alert_threshold: params.global_alert_threshold,
							},
						]
					: undefined;
			const globalRateLimits = buildRateLimitsRpm(params.global_rate_limit_rpm);
			const globalWorkspaceAccess =
				params.global_workspace_access_enabled !== undefined
					? {
							enabled: params.global_workspace_access_enabled,
							usage_limits: globalUsageLimits,
							rate_limits: globalRateLimits,
						}
					: undefined;

			const result = await service.integrations.updateIntegrationWorkspaces(
				params.slug,
				{
					workspaces: params.workspaces.map((ws) => {
						const usageLimits = buildUsageLimits({
							credit_limit: ws.credit_limit,
							alert_threshold: ws.alert_threshold,
						});
						return {
							id: ws.id,
							enabled: ws.enabled,
							usage_limits: usageLimits ? [usageLimits] : undefined,
							rate_limits: buildRateLimitsRpm(ws.rate_limit_rpm),
							reset_usage: ws.reset_usage,
							create_default_provider: ws.create_default_provider,
							default_provider_slug: ws.default_provider_slug,
						};
					}),
					global_workspace_access: globalWorkspaceAccess,
					override_existing_workspace_access:
						params.override_existing_workspace_access,
					create_default_provider: params.create_default_provider,
					default_provider_slug: params.default_provider_slug,
				},
			);

			return jsonResult({
				message: `Successfully updated workspace access for integration "${params.slug}"`,
				success: result.success,
				workspaces_updated: params.workspaces.length,
			});
		},
	);
}
