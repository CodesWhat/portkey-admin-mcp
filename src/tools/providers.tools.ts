import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimits, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";

const PROVIDERS_TOOL_SCHEMAS = {
	listProviders: {
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
			.describe("Number of results per page (max 100, default 50)"),
		workspace_id: z
			.string()
			.optional()
			.describe(
				"Workspace ID - required when using organization admin keys, optional with workspace API keys",
			),
	},
	createProvider: {
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
		credit_limit: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Credit limit for usage"),
		alert_threshold: z.coerce
			.number()
			.min(0)
			.max(100)
			.optional()
			.describe("Alert threshold percentage (0-100)"),
		usage_limit_type: z
			.enum(["cost", "tokens"])
			.optional()
			.describe(
				"Type of usage limit: 'cost' (monetary) or 'tokens' (token count). Defaults to 'cost'.",
			),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.optional()
			.describe(
				"Period for resetting usage limits: 'monthly' or 'weekly'. Defaults to 'monthly'.",
			),
		rate_limit_value: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Must be provided together with rate_limit_unit."),
		rate_limit_unit: z
			.enum(["rpm", "rph", "rpd"])
			.optional()
			.describe(
				"Must be provided together with rate_limit_value. Values: 'rpm' (requests/min), 'rph' (requests/hour), or 'rpd' (requests/day).",
			),
		expires_at: z
			.string()
			.optional()
			.describe("Expiration date in ISO 8601 format"),
	},
	getProvider: {
		slug: z
			.string()
			.describe("The unique slug identifier of the provider to retrieve"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID - required when using organization admin keys"),
	},
	updateProvider: {
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
		credit_limit: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New credit limit for usage"),
		alert_threshold: z.coerce
			.number()
			.min(0)
			.max(100)
			.optional()
			.describe("New alert threshold percentage (0-100)"),
		usage_limit_type: z
			.enum(["cost", "tokens"])
			.optional()
			.describe(
				"Type of usage limit: 'cost' (monetary) or 'tokens' (token count). Defaults to 'cost'.",
			),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.optional()
			.describe(
				"Period for resetting usage limits: 'monthly' or 'weekly'. Defaults to 'monthly'.",
			),
		rate_limit_value: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New rate limit value"),
		rate_limit_unit: z
			.enum(["rpm", "rph", "rpd"])
			.optional()
			.describe(
				"Rate limit unit: 'rpm' (requests per minute), 'rph' (requests per hour), or 'rpd' (requests per day)",
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
	deleteProvider: {
		slug: z.string().describe("The slug of the provider to delete"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID - required when using organization admin keys"),
	},
} as const;

export function registerProvidersTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List providers tool
	server.tool(
		"list_providers",
		"List workspace-scoped provider instances and their limits or status. Use this to find provider slugs for workspace-level updates; use list_integrations for the org-level source connection. Returns total plus provider name, slug, integration, status, limits, expiration, and reset flags.",
		PROVIDERS_TOOL_SCHEMAS.listProviders,
		async (params) => {
			const providers = await service.providers.listProviders({
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

	// Create provider tool
	server.tool(
		"create_provider",
		"Create a workspace provider backed by an org integration. The provider inherits the integration key, but its limits and expiration are enforced independently for that workspace. Returns the new provider id and slug.",
		PROVIDERS_TOOL_SCHEMAS.createProvider,
		async (params) => {
			const result = await service.providers.createProvider({
				name: params.name,
				integration_id: params.integration_id,
				workspace_id: params.workspace_id,
				slug: params.slug,
				note: params.note,
				usage_limits: buildUsageLimits({
					credit_limit: params.credit_limit,
					alert_threshold: params.alert_threshold,
					type: params.usage_limit_type,
					periodic_reset: params.periodic_reset,
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
		},
	);

	// Get provider tool
	server.tool(
		"get_provider",
		"Fetch one provider by slug, including limits, rate settings, expiration, and reset status. Use this to check consumption or audit configuration before updating.",
		PROVIDERS_TOOL_SCHEMAS.getProvider,
		async (params) => {
			const provider = await service.providers.getProvider(
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
		},
	);

	// Update provider tool
	server.tool(
		"update_provider",
		"Update a provider's metadata, limits, or expiration. reset_usage clears accumulated usage counters immediately, so use it only when you intend to reset quota tracking. Returns the updated provider id and slug.",
		PROVIDERS_TOOL_SCHEMAS.updateProvider,
		async (params) => {
			const result = await service.providers.updateProvider(
				params.slug,
				{
					name: params.name,
					note: params.note,
					usage_limits: buildUsageLimits({
						credit_limit: params.credit_limit,
						alert_threshold: params.alert_threshold,
						type: params.usage_limit_type,
						periodic_reset: params.periodic_reset,
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
		},
	);

	// Delete provider tool
	server.tool(
		"delete_provider",
		"Delete a workspace provider by slug. This is irreversible and will break prompts, configs, and virtual keys that reference it; use delete_integration for the org source instead. Returns success after the provider is removed.",
		PROVIDERS_TOOL_SCHEMAS.deleteProvider,
		async (params) => {
			await service.providers.deleteProvider(params.slug, params.workspace_id);

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
		},
	);
}
