import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimits, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";

export function registerProvidersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List providers tool
	server.tool(
		"list_providers",
		"List all providers in your Portkey organization with optional pagination and workspace filtering",
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
				.describe("Number of results per page (max 100, default 50)"),
			workspace_id: z
				.string()
				.optional()
				.describe(
					"Workspace ID - required when using organization admin keys, optional with workspace API keys",
				),
		},
		async (params) => {
			try {
				const providers = await service.listProviders({
					current_page: params.current_page,
					page_size: params.page_size,
					workspace_id: params.workspace_id,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									total: providers.total,
									providers: providers.data.map((provider) => ({
										name: provider.name,
										slug: provider.slug,
										integration_id: provider.integration_id,
										status: provider.status,
										note: provider.note,
										usage_limits: provider.usage_limits
											? {
													credit_limit: provider.usage_limits.credit_limit,
													alert_threshold:
														provider.usage_limits.alert_threshold,
													periodic_reset: provider.usage_limits.periodic_reset,
												}
											: null,
										rate_limits:
											provider.rate_limits?.map((limit) => ({
												type: limit.type,
												unit: limit.unit,
												value: limit.value,
											})) ?? null,
										reset_usage: provider.reset_usage,
										expires_at: provider.expires_at,
										created_at: provider.created_at,
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
							text: `Error listing providers: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create provider tool
	server.tool(
		"create_provider",
		"Create a new provider configuration in Portkey. Providers define integrations with AI model providers like OpenAI, Anthropic, etc.",
		{
			name: z.string().describe("Display name for the provider"),
			integration_id: z
				.string()
				.describe(
					"Integration slug for the provider (e.g., 'openai', 'anthropic', 'azure-openai')",
				),
			workspace_id: z
				.string()
				.optional()
				.describe(
					"Workspace ID - required when using organization admin API keys",
				),
			slug: z
				.string()
				.optional()
				.describe(
					"Custom slug for the provider. Auto-generated with random suffix if omitted",
				),
			note: z
				.string()
				.optional()
				.describe("Optional note or description for the provider"),
			credit_limit: z
				.number()
				.positive()
				.optional()
				.describe("Credit limit for usage"),
			alert_threshold: z
				.number()
				.min(0)
				.max(100)
				.optional()
				.describe("Alert threshold percentage (0-100)"),
			rate_limit_value: z
				.number()
				.positive()
				.optional()
				.describe("Rate limit value"),
			rate_limit_unit: z
				.enum(["rpm", "rpd"])
				.optional()
				.describe(
					"Rate limit unit: 'rpm' (requests per minute) or 'rpd' (requests per day)",
				),
			expires_at: z
				.string()
				.optional()
				.describe("Expiration date in ISO 8601 format"),
		},
		async (params) => {
			try {
				const result = await service.createProvider({
					name: params.name,
					integration_id: params.integration_id,
					workspace_id: params.workspace_id,
					slug: params.slug,
					note: params.note,
					usage_limits: buildUsageLimits({
						credit_limit: params.credit_limit,
						alert_threshold: params.alert_threshold,
					}),
					rate_limits:
						params.rate_limit_value !== undefined &&
						params.rate_limit_unit !== undefined
							? buildRateLimits({
									value: params.rate_limit_value,
									unit: params.rate_limit_unit,
								})
							: undefined,
					expires_at: params.expires_at,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully created provider "${params.name}"`,
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
							text: `Error creating provider: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Get provider tool
	server.tool(
		"get_provider",
		"Retrieve detailed information about a specific provider by its slug",
		{
			slug: z
				.string()
				.describe("The unique slug identifier of the provider to retrieve"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID - required when using organization admin keys"),
		},
		async (params) => {
			try {
				const provider = await service.getProvider(
					params.slug,
					params.workspace_id,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									name: provider.name,
									slug: provider.slug,
									integration_id: provider.integration_id,
									status: provider.status,
									note: provider.note,
									usage_limits: provider.usage_limits
										? {
												credit_limit: provider.usage_limits.credit_limit,
												alert_threshold: provider.usage_limits.alert_threshold,
												periodic_reset: provider.usage_limits.periodic_reset,
											}
										: null,
									rate_limits:
										provider.rate_limits?.map((limit) => ({
											type: limit.type,
											unit: limit.unit,
											value: limit.value,
										})) ?? null,
									reset_usage: provider.reset_usage,
									expires_at: provider.expires_at,
									created_at: provider.created_at,
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
							text: `Error fetching provider: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update provider tool
	server.tool(
		"update_provider",
		"Update an existing provider's name, note, limits, or expiration",
		{
			slug: z.string().describe("The slug of the provider to update"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID - required when using organization admin keys"),
			name: z.string().optional().describe("New display name for the provider"),
			note: z
				.string()
				.optional()
				.describe("New note or description for the provider"),
			credit_limit: z
				.number()
				.positive()
				.optional()
				.describe("New credit limit for usage"),
			alert_threshold: z
				.number()
				.min(0)
				.max(100)
				.optional()
				.describe("New alert threshold percentage (0-100)"),
			rate_limit_value: z
				.number()
				.positive()
				.optional()
				.describe("New rate limit value"),
			rate_limit_unit: z
				.enum(["rpm", "rpd"])
				.optional()
				.describe(
					"Rate limit unit: 'rpm' (requests per minute) or 'rpd' (requests per day)",
				),
			expires_at: z
				.string()
				.optional()
				.describe("New expiration date in ISO 8601 format"),
			reset_usage: z
				.boolean()
				.optional()
				.describe("Set to true to reset accumulated usage metrics"),
		},
		async (params) => {
			try {
				const result = await service.updateProvider(
					params.slug,
					{
						name: params.name,
						note: params.note,
						usage_limits: buildUsageLimits({
							credit_limit: params.credit_limit,
							alert_threshold: params.alert_threshold,
						}),
						rate_limits:
							params.rate_limit_value !== undefined &&
							params.rate_limit_unit !== undefined
								? buildRateLimits({
										value: params.rate_limit_value,
										unit: params.rate_limit_unit,
									})
								: undefined,
						expires_at: params.expires_at,
						reset_usage: params.reset_usage,
					},
					params.workspace_id,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated provider "${params.slug}"`,
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
							text: `Error updating provider: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Delete provider tool
	server.tool(
		"delete_provider",
		"Delete a provider by slug. This action cannot be undone.",
		{
			slug: z.string().describe("The slug of the provider to delete"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID - required when using organization admin keys"),
		},
		async (params) => {
			try {
				await service.deleteProvider(params.slug, params.workspace_id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully deleted provider "${params.slug}"`,
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
							text: `Error deleting provider: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
