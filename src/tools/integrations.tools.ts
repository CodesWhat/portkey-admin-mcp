import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimitsRpm, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";

const INTEGRATIONS_TOOL_SCHEMAS = {
	listIntegrations: {
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
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
	},
	deleteIntegration: {
		slug: z.string().describe("The slug of the integration to delete"),
	},
	listIntegrationModels: {
		slug: z.string().describe("The slug of the integration"),
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
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
			.positive()
			.optional()
			.describe("Page number for pagination"),
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
				}),
			)
			.describe("Array of workspace configurations to update"),
	},
} as const;

export function registerIntegrationsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List integrations tool
	server.tool(
		"list_integrations",
		"List all integrations in your Portkey organization with optional filtering by workspace or type",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrations,
		async (params) => {
			const integrations = await service.integrations.listIntegrations({
				current_page: params.current_page,
				page_size: params.page_size,
				workspace_id: params.workspace_id,
				type: params.type,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
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
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Create integration tool
	server.tool(
		"create_integration",
		"Create a new integration with an AI provider (e.g., OpenAI, Anthropic, Azure OpenAI, AWS Bedrock). Provider-specific params: Azure needs api_version + resource_name + deployment_name. AWS needs aws_region. Vertex AI needs vertex_project_id + vertex_region.",
		INTEGRATIONS_TOOL_SCHEMAS.createIntegration,
		async (params) => {
			const configurations: Record<string, unknown> = {};

			// Azure OpenAI configurations
			if (params.api_version) configurations.api_version = params.api_version;
			if (params.resource_name)
				configurations.resource_name = params.resource_name;
			if (params.deployment_name)
				configurations.deployment_name = params.deployment_name;

			// AWS Bedrock configurations
			if (params.aws_region) configurations.aws_region = params.aws_region;
			if (params.aws_access_key_id)
				configurations.aws_access_key_id = params.aws_access_key_id;
			if (params.aws_secret_access_key)
				configurations.aws_secret_access_key = params.aws_secret_access_key;

			// Vertex AI configurations
			if (params.vertex_project_id)
				configurations.vertex_project_id = params.vertex_project_id;
			if (params.vertex_region)
				configurations.vertex_region = params.vertex_region;

			// Custom host
			if (params.custom_host) configurations.custom_host = params.custom_host;

			const result = await service.integrations.createIntegration({
				name: params.name,
				ai_provider_id: params.ai_provider_id,
				slug: params.slug,
				key: params.key,
				description: params.description,
				workspace_id: params.workspace_id,
				configurations:
					Object.keys(configurations).length > 0 ? configurations : undefined,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created integration "${params.name}"`,
								id: result.id,
								slug: result.slug,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get integration tool
	server.tool(
		"get_integration",
		"Retrieve detailed information about a specific integration by its slug",
		INTEGRATIONS_TOOL_SCHEMAS.getIntegration,
		async (params) => {
			const integration = await service.integrations.getIntegration(
				params.slug,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
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
								created_at: integration.created_at,
								last_updated_at: integration.last_updated_at,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update integration tool
	server.tool(
		"update_integration",
		"Update an existing integration's name, API key, description, or provider-specific configurations",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegration,
		async (params) => {
			const configurations: Record<string, unknown> = {};

			// Azure OpenAI configurations
			if (params.api_version !== undefined)
				configurations.api_version = params.api_version;
			if (params.resource_name !== undefined)
				configurations.resource_name = params.resource_name;
			if (params.deployment_name !== undefined)
				configurations.deployment_name = params.deployment_name;

			// AWS Bedrock configurations
			if (params.aws_region !== undefined)
				configurations.aws_region = params.aws_region;
			if (params.aws_access_key_id !== undefined)
				configurations.aws_access_key_id = params.aws_access_key_id;
			if (params.aws_secret_access_key !== undefined)
				configurations.aws_secret_access_key = params.aws_secret_access_key;

			// Vertex AI configurations
			if (params.vertex_project_id !== undefined)
				configurations.vertex_project_id = params.vertex_project_id;
			if (params.vertex_region !== undefined)
				configurations.vertex_region = params.vertex_region;

			// Custom host
			if (params.custom_host !== undefined)
				configurations.custom_host = params.custom_host;

			const result = await service.integrations.updateIntegration(params.slug, {
				name: params.name,
				key: params.key,
				description: params.description,
				configurations:
					Object.keys(configurations).length > 0 ? configurations : undefined,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated integration "${params.slug}"`,
								success: result.success,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Delete integration tool
	server.tool(
		"delete_integration",
		"Delete an integration by slug. This action cannot be undone.",
		INTEGRATIONS_TOOL_SCHEMAS.deleteIntegration,
		async (params) => {
			const result = await service.integrations.deleteIntegration(params.slug);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted integration "${params.slug}"`,
								success: result.success,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// List integration models tool
	server.tool(
		"list_integration_models",
		"List all models available for a specific integration with their enabled status",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrationModels,
		async (params) => {
			const models = await service.integrations.listIntegrationModels(
				params.slug,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: models.total,
								integration_slug: params.slug,
								models: models.data.map((model) => ({
									id: model.id,
									model_id: model.model_id,
									model_name: model.model_name,
									enabled: model.enabled,
									custom: model.custom,
									created_at: model.created_at,
									last_updated_at: model.last_updated_at,
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

	// Update integration models tool
	server.tool(
		"update_integration_models",
		"Update model access settings for an integration - enable/disable models or add custom models",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegrationModels,
		async (params) => {
			const result = await service.integrations.updateIntegrationModels(
				params.slug,
				{
					models: params.models,
				},
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated models for integration "${params.slug}"`,
								success: result.success,
								models_updated: params.models.length,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Delete integration model tool
	server.tool(
		"delete_integration_model",
		"Delete a specific custom model from an integration",
		INTEGRATIONS_TOOL_SCHEMAS.deleteIntegrationModel,
		async (params) => {
			const result = await service.integrations.deleteIntegrationModel(
				params.slug,
				params.model_slug,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted model "${params.model_slug}" from integration "${params.slug}"`,
								success: result.success,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// List integration workspaces tool
	server.tool(
		"list_integration_workspaces",
		"List all workspaces that have access to a specific integration",
		INTEGRATIONS_TOOL_SCHEMAS.listIntegrationWorkspaces,
		async (params) => {
			const workspaces = await service.integrations.listIntegrationWorkspaces(
				params.slug,
				{
					current_page: params.current_page,
					page_size: params.page_size,
				},
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: workspaces.total,
								integration_slug: params.slug,
								workspaces: workspaces.data.map((ws) => ({
									id: ws.id,
									workspace_id: ws.workspace_id,
									workspace_name: ws.workspace_name,
									enabled: ws.enabled,
									usage_limits: ws.usage_limits,
									rate_limits: ws.rate_limits,
									created_at: ws.created_at,
									last_updated_at: ws.last_updated_at,
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

	// Update integration workspaces tool
	server.tool(
		"update_integration_workspaces",
		"Update workspace access settings for an integration - enable/disable workspace access and configure limits",
		INTEGRATIONS_TOOL_SCHEMAS.updateIntegrationWorkspaces,
		async (params) => {
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
						};
					}),
				},
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated workspace access for integration "${params.slug}"`,
								success: result.success,
								workspaces_updated: params.workspaces.length,
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
