import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimitsRpm, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";

export function registerIntegrationsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List integrations tool
	server.tool(
		"list_integrations",
		"List all integrations in your Portkey organization with optional filtering by workspace or type",
		{
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
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
		async (params) => {
			try {
				const integrations = await service.listIntegrations({
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing integrations: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create integration tool
	server.tool(
		"create_integration",
		"Create a new integration with an AI provider (e.g., OpenAI, Anthropic, Azure OpenAI, AWS Bedrock)",
		{
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
			// Azure OpenAI specific
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
			// AWS Bedrock specific
			aws_region: z
				.string()
				.optional()
				.describe("AWS region (for AWS Bedrock)"),
			aws_access_key_id: z
				.string()
				.optional()
				.describe("AWS access key ID (for AWS Bedrock)"),
			aws_secret_access_key: z
				.string()
				.optional()
				.describe("AWS secret access key (for AWS Bedrock)"),
			// Vertex AI specific
			vertex_project_id: z
				.string()
				.optional()
				.describe("GCP project ID (for Vertex AI)"),
			vertex_region: z
				.string()
				.optional()
				.describe("GCP region (for Vertex AI)"),
			// Custom base URL
			custom_host: z
				.string()
				.optional()
				.describe("Custom base URL for the provider"),
		},
		async (params) => {
			try {
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

				const result = await service.createIntegration({
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error creating integration: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get integration tool
	server.tool(
		"get_integration",
		"Retrieve detailed information about a specific integration by its slug",
		{
			slug: z
				.string()
				.describe("The unique slug identifier of the integration to retrieve"),
		},
		async (params) => {
			try {
				const integration = await service.getIntegration(params.slug);

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error fetching integration: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update integration tool
	server.tool(
		"update_integration",
		"Update an existing integration's name, API key, description, or provider-specific configurations",
		{
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
			// Azure OpenAI specific
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
			// AWS Bedrock specific
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
			// Vertex AI specific
			vertex_project_id: z
				.string()
				.optional()
				.describe("New GCP project ID (for Vertex AI)"),
			vertex_region: z
				.string()
				.optional()
				.describe("New GCP region (for Vertex AI)"),
			// Custom base URL
			custom_host: z
				.string()
				.optional()
				.describe("New custom base URL for the provider"),
		},
		async (params) => {
			try {
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

				const result = await service.updateIntegration(params.slug, {
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating integration: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Delete integration tool
	server.tool(
		"delete_integration",
		"Delete an integration by slug. This action cannot be undone.",
		{
			slug: z.string().describe("The slug of the integration to delete"),
		},
		async (params) => {
			try {
				const result = await service.deleteIntegration(params.slug);

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error deleting integration: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List integration models tool
	server.tool(
		"list_integration_models",
		"List all models available for a specific integration with their enabled status",
		{
			slug: z.string().describe("The slug of the integration"),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe("Number of results per page"),
		},
		async (params) => {
			try {
				const models = await service.listIntegrationModels(params.slug, {
					current_page: params.current_page,
					page_size: params.page_size,
				});

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing integration models: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update integration models tool
	server.tool(
		"update_integration_models",
		"Update model access settings for an integration - enable/disable models or add custom models",
		{
			slug: z.string().describe("The slug of the integration"),
			models: z
				.array(
					z.object({
						model_id: z.string().describe("The model identifier"),
						model_name: z
							.string()
							.optional()
							.describe(
								"Display name for the model (required for custom models)",
							),
						enabled: z.boolean().describe("Whether the model is enabled"),
						custom: z
							.boolean()
							.optional()
							.describe("Whether this is a custom model (default: false)"),
					}),
				)
				.describe("Array of model configurations to update"),
		},
		async (params) => {
			try {
				const result = await service.updateIntegrationModels(params.slug, {
					models: params.models,
				});

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating integration models: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Delete integration model tool
	server.tool(
		"delete_integration_model",
		"Delete a specific custom model from an integration",
		{
			slug: z.string().describe("The slug of the integration"),
			model_id: z.string().describe("The ID of the model to delete"),
		},
		async (params) => {
			try {
				const result = await service.deleteIntegrationModel(
					params.slug,
					params.model_id,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully deleted model "${params.model_id}" from integration "${params.slug}"`,
									success: result.success,
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
							text: `Error deleting integration model: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// List integration workspaces tool
	server.tool(
		"list_integration_workspaces",
		"List all workspaces that have access to a specific integration",
		{
			slug: z.string().describe("The slug of the integration"),
			current_page: z
				.number()
				.positive()
				.optional()
				.describe("Page number for pagination"),
			page_size: z
				.number()
				.int()
				.positive()
				.max(100)
				.optional()
				.describe("Number of results per page"),
		},
		async (params) => {
			try {
				const workspaces = await service.listIntegrationWorkspaces(
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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error listing integration workspaces: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update integration workspaces tool
	server.tool(
		"update_integration_workspaces",
		"Update workspace access settings for an integration - enable/disable workspace access and configure limits",
		{
			slug: z.string().describe("The slug of the integration"),
			workspaces: z
				.array(
					z.object({
						workspace_id: z.string().describe("The workspace ID"),
						enabled: z
							.boolean()
							.describe("Whether the workspace has access to this integration"),
						credit_limit: z
							.number()
							.positive()
							.optional()
							.describe("Credit limit for this workspace"),
						alert_threshold: z
							.number()
							.min(0)
							.max(100)
							.optional()
							.describe("Alert threshold percentage (0-100)"),
						rate_limit_rpm: z
							.number()
							.positive()
							.optional()
							.describe("Rate limit in requests per minute"),
					}),
				)
				.describe("Array of workspace configurations to update"),
		},
		async (params) => {
			try {
				const result = await service.updateIntegrationWorkspaces(params.slug, {
					workspaces: params.workspaces.map((ws) => ({
						workspace_id: ws.workspace_id,
						enabled: ws.enabled,
						usage_limits: buildUsageLimits({
							credit_limit: ws.credit_limit,
							alert_threshold: ws.alert_threshold,
						}),
						rate_limits: buildRateLimitsRpm(ws.rate_limit_rpm),
					})),
				});

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
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error updating integration workspaces: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
