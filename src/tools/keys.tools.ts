import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimitsRpm, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";

const KEYS_TOOL_SCHEMAS = {
	listVirtualKeys: {},
	createVirtualKey: {
		name: z.string().describe("Display name for the virtual key"),
		provider: z
			.string()
			.describe(
				"Provider slug (e.g., 'openai', 'anthropic', 'azure-openai', 'google')",
			),
		key: z.string().describe("The actual provider API key to store"),
		note: z
			.string()
			.optional()
			.describe("Optional note or description for this key"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to create the key in"),
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
		credit_limit: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Maximum usage cost threshold"),
		alert_threshold: z.coerce
			.number()
			.min(0)
			.max(100)
			.optional()
			.describe(
				"Percentage of credit_limit at which to send alert emails (0-100)",
			),
		rate_limit_rpm: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Requests per minute limit"),
	},
	getVirtualKey: {
		slug: z
			.string()
			.describe("The unique slug identifier of the virtual key to retrieve"),
	},
	updateVirtualKey: {
		slug: z.string().describe("The slug of the virtual key to update"),
		name: z.string().optional().describe("New display name for the key"),
		key: z.string().optional().describe("New provider API key value"),
		note: z.string().optional().describe("New note or description"),
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
		rate_limit_rpm: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New rate limit in requests per minute"),
	},
	deleteVirtualKey: {
		slug: z.string().describe("The slug of the virtual key to delete"),
	},
	createApiKey: {
		type: z
			.enum(["organisation", "workspace"])
			.describe(
				"Key type: 'organisation' for org-wide access or 'workspace' for workspace-scoped",
			),
		sub_type: z
			.enum(["user", "service"])
			.describe(
				"Sub-type: 'user' for user-associated keys or 'service' for service accounts",
			),
		name: z.string().describe("Display name for the API key"),
		description: z
			.string()
			.optional()
			.describe("Optional description for the key"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID (required for workspace-type keys)"),
		user_id: z
			.string()
			.optional()
			.describe("User ID (required for user sub-type keys)"),
		scopes: z
			.array(z.string())
			.describe(
				"Permission scopes for the key (e.g., ['logs.read', 'analytics.read'])",
			),
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
		rate_limit_rpm: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Rate limit in requests per minute"),
		default_config_id: z
			.string()
			.optional()
			.describe("Default configuration ID to use with this key"),
		default_metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("Default metadata key-value pairs"),
		alert_emails: z
			.array(z.string())
			.optional()
			.describe("Email addresses for alerts"),
		expires_at: z
			.string()
			.optional()
			.describe("Expiration date in ISO 8601 format"),
	},
	listApiKeys: {
		page_size: z.coerce
			.number()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
		current_page: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		workspace_id: z.string().optional().describe("Filter by workspace ID"),
	},
	getApiKey: {
		id: z.string().uuid().describe("The UUID of the API key to retrieve"),
	},
	updateApiKey: {
		id: z.string().uuid().describe("The UUID of the API key to update"),
		name: z.string().optional().describe("New display name for the key"),
		description: z.string().optional().describe("New description for the key"),
		scopes: z
			.array(z.string())
			.optional()
			.describe("New permission scopes for the key"),
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
		rate_limit_rpm: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New rate limit in requests per minute"),
		default_config_id: z
			.string()
			.optional()
			.describe("New default configuration ID"),
		default_metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("New default metadata key-value pairs"),
		alert_emails: z
			.array(z.string())
			.optional()
			.describe("New email addresses for alerts"),
		expires_at: z
			.string()
			.nullable()
			.optional()
			.describe(
				"New expiration date in ISO 8601 format, or null to remove expiration",
			),
	},
	deleteApiKey: {
		id: z.string().uuid().describe("The UUID of the API key to delete"),
	},
} as const;

export function registerKeysTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List virtual keys tool
	server.tool(
		"list_virtual_keys",
		"List provider API keys stored as virtual keys in your Portkey org. Use this to find slugs before wiring prompts/configs or auditing limits. Returns total plus name, slug, status, usage limits, rate limits, reset state, and model config.",
		KEYS_TOOL_SCHEMAS.listVirtualKeys,
		async () => {
			const virtualKeys = await service.keys.listVirtualKeys();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: virtualKeys.total,
								virtual_keys: virtualKeys.data.map((key) => ({
									name: key.name,
									slug: key.slug,
									status: key.status,
									note: key.note,
									usage_limits: key.usage_limits
										? {
												credit_limit: key.usage_limits.credit_limit,
												alert_threshold: key.usage_limits.alert_threshold,
												periodic_reset: key.usage_limits.periodic_reset,
											}
										: null,
									rate_limits:
										key.rate_limits?.map((limit) => ({
											type: limit.type,
											unit: limit.unit,
											value: limit.value,
										})) ?? null,
									reset_usage: key.reset_usage,
									created_at: key.created_at,
									model_config: key.model_config,
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

	// Phase 2: Create virtual key tool
	server.tool(
		"create_virtual_key",
		"Store a provider API key as a virtual key. The raw key is encrypted and only returned at creation time, so save the returned slug and use it in prompts/configs. Optional usage and rate limits apply immediately, and the tool returns the new slug.",
		KEYS_TOOL_SCHEMAS.createVirtualKey,
		async (params) => {
			const result = await service.keys.createVirtualKey({
				name: params.name,
				provider: params.provider,
				key: params.key,
				note: params.note,
				workspace_id: params.workspace_id,
				apiVersion: params.api_version,
				resourceName: params.resource_name,
				deploymentName: params.deployment_name,
				usage_limits: buildUsageLimits({
					credit_limit: params.credit_limit,
					alert_threshold: params.alert_threshold,
				}),
				rate_limits: buildRateLimitsRpm(params.rate_limit_rpm),
			});

			// Handle both response formats: { data: { slug } } or { slug }
			const slug = result.data?.slug ?? (result as { slug?: string }).slug;
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created virtual key "${params.name}"`,
								success: result.success,
								slug,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 2: Get virtual key tool
	server.tool(
		"get_virtual_key",
		"Fetch one virtual key by slug, including metadata, a masked secret, limits, status, and model config. Use this before updating or to inspect the current configuration.",
		KEYS_TOOL_SCHEMAS.getVirtualKey,
		async (params) => {
			const virtualKey = await service.keys.getVirtualKey(params.slug);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								name: virtualKey.name,
								slug: virtualKey.slug,
								status: virtualKey.status,
								note: virtualKey.note,
								usage_limits: virtualKey.usage_limits
									? {
											credit_limit: virtualKey.usage_limits.credit_limit,
											alert_threshold: virtualKey.usage_limits.alert_threshold,
											periodic_reset: virtualKey.usage_limits.periodic_reset,
										}
									: null,
								rate_limits:
									virtualKey.rate_limits?.map((limit) => ({
										type: limit.type,
										unit: limit.unit,
										value: limit.value,
									})) ?? null,
								reset_usage: virtualKey.reset_usage,
								created_at: virtualKey.created_at,
								model_config: virtualKey.model_config,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 2: Update virtual key tool
	server.tool(
		"update_virtual_key",
		"Update a virtual key's name, secret, note, or limits. Rotating the key takes effect immediately, and limit changes apply to downstream prompts and configs using this slug. Returns the updated name, slug, and status.",
		KEYS_TOOL_SCHEMAS.updateVirtualKey,
		async (params) => {
			const result = await service.keys.updateVirtualKey(params.slug, {
				name: params.name,
				key: params.key,
				note: params.note,
				usage_limits: buildUsageLimits({
					credit_limit: params.credit_limit,
					alert_threshold: params.alert_threshold,
				}),
				rate_limits: buildRateLimitsRpm(params.rate_limit_rpm),
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated virtual key "${params.slug}"`,
								name: result.name,
								slug: result.slug,
								status: result.status,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 2: Delete virtual key tool
	server.tool(
		"delete_virtual_key",
		"Delete a virtual key by slug. This is irreversible and will break prompts and configs that reference the slug, so confirm no active dependencies first. Returns success after removal.",
		KEYS_TOOL_SCHEMAS.deleteVirtualKey,
		async (params) => {
			const result = await service.keys.deleteVirtualKey(params.slug);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted virtual key "${params.slug}"`,
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

	// Phase 2: Create API key tool
	server.tool(
		"create_api_key",
		"Create a Portkey API key for auth. Org keys grant broader access; workspace keys are scoped. The secret is only returned once, and using the key grants access immediately according to its scopes, defaults, and limits. Workspace keys require workspace_id and user keys require user_id.",
		KEYS_TOOL_SCHEMAS.createApiKey,
		async (params) => {
			// Validate required fields based on type and sub_type
			if (params.type === "workspace" && !params.workspace_id) {
				return {
					content: [
						{
							type: "text",
							text: "Error creating API key: workspace_id is required for workspace-type keys",
						},
					],
					isError: true,
				};
			}
			if (params.sub_type === "user" && !params.user_id) {
				return {
					content: [
						{
							type: "text",
							text: "Error creating API key: user_id is required for user sub-type keys",
						},
					],
					isError: true,
				};
			}

			const result = await service.keys.createApiKey(
				params.type,
				params.sub_type,
				{
					name: params.name,
					description: params.description,
					workspace_id: params.workspace_id,
					user_id: params.user_id,
					scopes: params.scopes,
					usage_limits: buildUsageLimits({
						credit_limit: params.credit_limit,
						alert_threshold: params.alert_threshold,
					}),
					rate_limits: buildRateLimitsRpm(params.rate_limit_rpm),
					defaults: (() => {
						const d: Record<string, unknown> = {};
						if (params.default_config_id !== undefined)
							d.config_id = params.default_config_id;
						if (params.default_metadata !== undefined)
							d.metadata = params.default_metadata;
						return Object.keys(d).length > 0 ? d : undefined;
					})(),
					alert_emails: params.alert_emails,
					expires_at: params.expires_at,
				},
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created API key "${params.name}"`,
								id: result.id,
								key: result.key,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 2: List API keys tool
	server.tool(
		"list_api_keys",
		"List Portkey API keys for auditing access, scopes, defaults, limits, and expiration. Use this for API keys only; use list_virtual_keys for provider keys. Returns total plus id, type, status, workspace/user scope, limits, defaults, alert emails, and creation mode.",
		KEYS_TOOL_SCHEMAS.listApiKeys,
		async (params) => {
			const apiKeys = await service.keys.listApiKeys({
				page_size: params.page_size,
				current_page: params.current_page,
				workspace_id: params.workspace_id,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: apiKeys.total,
								api_keys: apiKeys.data.map((key) => ({
									id: key.id,
									name: key.name,
									description: key.description,
									type: key.type,
									status: key.status,
									organisation_id: key.organisation_id,
									workspace_id: key.workspace_id,
									user_id: key.user_id,
									scopes: key.scopes,
									usage_limits: key.usage_limits
										? {
												credit_limit: key.usage_limits.credit_limit,
												alert_threshold: key.usage_limits.alert_threshold,
												periodic_reset: key.usage_limits.periodic_reset,
											}
										: null,
									rate_limits:
										key.rate_limits?.map((limit) => ({
											type: limit.type,
											unit: limit.unit,
											value: limit.value,
										})) ?? null,
									defaults: key.defaults,
									alert_emails: key.alert_emails,
									expires_at: key.expires_at,
									created_at: key.created_at,
									last_updated_at: key.last_updated_at,
									creation_mode: key.creation_mode,
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

	// Phase 2: Get API key tool
	server.tool(
		"get_api_key",
		"Fetch one API key by UUID without revealing the secret. Use this to inspect scopes, defaults, limits, expiration, and reset state before changing access.",
		KEYS_TOOL_SCHEMAS.getApiKey,
		async (params) => {
			const apiKey = await service.keys.getApiKey(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: apiKey.id,
								name: apiKey.name,
								description: apiKey.description,
								type: apiKey.type,
								status: apiKey.status,
								organisation_id: apiKey.organisation_id,
								workspace_id: apiKey.workspace_id,
								user_id: apiKey.user_id,
								scopes: apiKey.scopes,
								usage_limits: apiKey.usage_limits
									? {
											credit_limit: apiKey.usage_limits.credit_limit,
											alert_threshold: apiKey.usage_limits.alert_threshold,
											periodic_reset: apiKey.usage_limits.periodic_reset,
										}
									: null,
								rate_limits:
									apiKey.rate_limits?.map((limit) => ({
										type: limit.type,
										unit: limit.unit,
										value: limit.value,
									})) ?? null,
								defaults: apiKey.defaults,
								alert_emails: apiKey.alert_emails,
								expires_at: apiKey.expires_at,
								reset_usage: apiKey.reset_usage,
								created_at: apiKey.created_at,
								last_updated_at: apiKey.last_updated_at,
								creation_mode: apiKey.creation_mode,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 2: Update API key tool
	server.tool(
		"update_api_key",
		"Update an API key's name, description, scopes, defaults, or limits, unlike delete_api_key which revokes it or create_api_key which issues a new one. Changes take effect immediately for downstream callers, type and sub-type stay fixed after creation, and the call returns success without rotating the secret.",
		KEYS_TOOL_SCHEMAS.updateApiKey,
		async (params) => {
			const result = await service.keys.updateApiKey(params.id, {
				name: params.name,
				description: params.description,
				scopes: params.scopes,
				usage_limits: buildUsageLimits({
					credit_limit: params.credit_limit,
					alert_threshold: params.alert_threshold,
				}),
				rate_limits: buildRateLimitsRpm(params.rate_limit_rpm),
				defaults:
					params.default_config_id !== undefined ||
					params.default_metadata !== undefined
						? {
								config_id: params.default_config_id,
								metadata: params.default_metadata,
							}
						: undefined,
				alert_emails: params.alert_emails,
				expires_at: params.expires_at,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated API key "${params.id}"`,
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

	// Phase 2: Delete API key tool
	server.tool(
		"delete_api_key",
		"Delete an API key by UUID. This cannot be undone, revokes access immediately, and can break active sessions using the key. Returns success after revocation.",
		KEYS_TOOL_SCHEMAS.deleteApiKey,
		async (params) => {
			const result = await service.keys.deleteApiKey(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted API key "${params.id}"`,
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
}
