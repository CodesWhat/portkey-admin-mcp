import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildRateLimitsRpm, buildUsageLimits } from "../lib/limits.js";
import type { PortkeyService } from "../services/index.js";
import type {
	ApiKey,
	ApiKeyRateLimit,
	ApiKeyUsageLimits,
	VirtualKey,
	VirtualKeyRateLimit,
	VirtualKeyUsageLimits,
} from "../services/keys.service.js";
import { jsonResult } from "./utils.js";

const virtualKeySecretMappingSchema = z.object({
	target_field: z
		.string()
		.refine(
			(value) => value === "key" || value.startsWith("model_config."),
			"target_field must be 'key' or start with 'model_config.'",
		)
		.describe("Virtual Key field populated from the Secret Reference"),
	secret_reference_id: z
		.string()
		.describe("Secret Reference ID that owns the external secret"),
	secret_key: z
		.string()
		.nullable()
		.optional()
		.describe("Optional key selected from a structured external secret"),
	value_format: z
		.enum(["json", "string"])
		.nullable()
		.optional()
		.describe("Whether Portkey reads the mapped value as JSON or a string"),
});

const virtualKeyDeploymentSchema = z.object({
	api_version: z.string().min(1).describe("Azure OpenAI API version"),
	deployment_name: z.string().min(1).describe("Azure deployment name"),
	alias: z
		.string()
		.optional()
		.describe("Optional model alias for the deployment"),
	is_default: z
		.boolean()
		.optional()
		.describe("Whether this is the default Azure deployment"),
});

const apiKeyRateLimitSchema = z.object({
	type: z
		.enum(["requests", "tokens"])
		.describe("Whether the limit counts requests or tokens"),
	unit: z
		.enum(["rpd", "rph", "rpm", "rps", "rpw"])
		.describe("Rate window unit for the request or token count"),
	value: z.coerce
		.number()
		.int()
		.nonnegative()
		.describe("Maximum count in the selected rate window"),
});

const rotationPolicySchema = z
	.object({
		rotation_period: z
			.enum(["weekly", "monthly"])
			.nullable()
			.optional()
			.describe("Built-in weekly or monthly automatic rotation cadence"),
		next_rotation_at: z.iso
			.datetime({ offset: true })
			.nullable()
			.optional()
			.describe("Explicit next rotation timestamp in ISO 8601 format"),
		key_transition_period_ms: z.coerce
			.number()
			.int()
			.min(1_800_000)
			.optional()
			.describe("Overlap in milliseconds before the previous key expires"),
	})
	.superRefine((value, context) => {
		if (value.rotation_period && value.next_rotation_at) {
			context.addIssue({
				code: "custom",
				path: [],
				message: "next_rotation_at and rotation_period are mutually exclusive",
			});
		}
	})
	.describe("Automatic API-key rotation policy, or null to remove it");

const KEYS_TOOL_SCHEMAS = {
	listVirtualKeys: {
		current_page: z.coerce
			.number()
			.int()
			.positive()
			.optional()
			.describe("Page number for pagination"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
	},
	createVirtualKey: {
		name: z.string().describe("Display name for the virtual key"),
		provider: z
			.string()
			.describe(
				"Provider slug (e.g., 'openai', 'anthropic', 'azure-openai', 'google')",
			),
		key: z
			.string()
			.optional()
			.describe("Provider API key; omit when secret_mappings supplies key"),
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
		deployment_configurations: z
			.array(virtualKeyDeploymentSchema)
			.optional()
			.describe(
				"Azure deployment configurations with API versions and aliases",
			),
		expires_at: z.iso
			.datetime({ offset: true })
			.optional()
			.describe("Expiration in ISO 8601 format"),
		secret_mappings: z
			.array(virtualKeySecretMappingSchema)
			.optional()
			.describe("Secret Reference mappings for key or model_config fields"),
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
		deployment_configurations: z
			.array(virtualKeyDeploymentSchema)
			.optional()
			.describe("Replacement Azure deployment configurations"),
		secret_mappings: z
			.array(virtualKeySecretMappingSchema)
			.optional()
			.describe("Replacement Secret Reference mappings"),
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
		organisation_id: z.string().optional().describe("Organisation UUID"),
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
		rate_limits: z
			.array(apiKeyRateLimitSchema)
			.nullable()
			.optional()
			.describe("Request or token rate limits, or null to clear them"),
		default_config_id: z
			.string()
			.optional()
			.describe("Default configuration ID to use with this key"),
		default_metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("Default metadata key-value pairs"),
		default_allow_config_override: z
			.boolean()
			.optional()
			.describe("Allow callers to override the default config"),
		alert_emails: z
			.array(z.string())
			.optional()
			.describe("Email addresses for alerts"),
		expires_at: z.iso
			.datetime({ offset: true })
			.optional()
			.describe("Expiration date in ISO 8601 format"),
		rotation_policy: rotationPolicySchema
			.nullable()
			.optional()
			.describe("Automatic API-key rotation policy, or null to disable it"),
	},
	listApiKeys: {
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of results per page (max 100)"),
		current_page: z.coerce
			.number()
			.int()
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
		rate_limits: z
			.array(apiKeyRateLimitSchema)
			.nullable()
			.optional()
			.describe("Replacement request or token rate limits, or null to clear"),
		reset_usage: z.coerce
			.number()
			.nonnegative()
			.optional()
			.describe("Set to a nonnegative acknowledgement value to reset usage"),
		default_config_id: z
			.string()
			.optional()
			.describe("New default configuration ID"),
		default_metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe("New default metadata key-value pairs"),
		default_allow_config_override: z
			.boolean()
			.optional()
			.describe("Whether callers may override the key's default config"),
		alert_emails: z
			.array(z.string())
			.optional()
			.describe("New email addresses for alerts"),
		expires_at: z.iso
			.datetime({ offset: true })
			.nullable()
			.optional()
			.describe(
				"New expiration date in ISO 8601 format, or null to remove expiration",
			),
		rotation_policy: rotationPolicySchema
			.nullable()
			.optional()
			.describe("Replacement rotation policy, or null to disable it"),
	},
	rotateApiKey: {
		id: z.string().uuid().describe("API key UUID obtained from list_api_keys"),
		key_transition_period_ms: z.coerce
			.number()
			.int()
			.min(1_800_000)
			.optional()
			.describe(
				"Overlap in milliseconds while the previous key remains valid; minimum 1,800,000 (30 minutes), for example 3,600,000 for 1 hour",
			),
	},
	deleteApiKey: {
		id: z.string().uuid().describe("The UUID of the API key to delete"),
	},
} as const;

const createVirtualKeySchema = z
	.object(KEYS_TOOL_SCHEMAS.createVirtualKey)
	.superRefine((value, context) => {
		if (
			value.key === undefined &&
			!value.secret_mappings?.some((mapping) => mapping.target_field === "key")
		) {
			context.addIssue({
				code: "custom",
				path: [],
				message: "key or a secret_mappings entry targeting key is required",
			});
		}
	});

const createApiKeySchema = z
	.object(KEYS_TOOL_SCHEMAS.createApiKey)
	.superRefine((value, ctx) => {
		if (value.type === "workspace" && !value.workspace_id) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["workspace_id"],
				message: "workspace_id is required when type is 'workspace'",
			});
		}
		if (value.sub_type === "user" && !value.user_id) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["user_id"],
				message: "user_id is required when sub_type is 'user'",
			});
		}
	});

function formatKeyUsageLimits(
	limits: VirtualKeyUsageLimits | ApiKeyUsageLimits | null,
): Pick<
	VirtualKeyUsageLimits | ApiKeyUsageLimits,
	"credit_limit" | "alert_threshold" | "periodic_reset"
> | null {
	return limits
		? {
				credit_limit: limits.credit_limit,
				alert_threshold: limits.alert_threshold,
				periodic_reset: limits.periodic_reset,
			}
		: null;
}

function formatKeyRateLimits(
	limits: (VirtualKeyRateLimit | ApiKeyRateLimit)[] | null | undefined,
):
	| Pick<VirtualKeyRateLimit | ApiKeyRateLimit, "type" | "unit" | "value">[]
	| null {
	return (
		limits?.map((limit) => ({
			type: limit.type,
			unit: limit.unit,
			value: limit.value,
		})) ?? null
	);
}

function formatVirtualKey(key: VirtualKey): {
	name: string;
	slug: string;
	status: VirtualKey["status"];
	note: string | null;
	usage_limits: ReturnType<typeof formatKeyUsageLimits>;
	rate_limits: ReturnType<typeof formatKeyRateLimits>;
	reset_usage: number | null;
	created_at: string;
	model_config: Record<string, unknown>;
	expires_at?: string | null;
	secret_mappings?: VirtualKey["secret_mappings"];
} {
	return {
		name: key.name,
		slug: key.slug,
		status: key.status,
		note: key.note,
		usage_limits: formatKeyUsageLimits(key.usage_limits),
		rate_limits: formatKeyRateLimits(key.rate_limits),
		reset_usage: key.reset_usage,
		created_at: key.created_at,
		model_config: key.model_config,
		expires_at: key.expires_at,
		secret_mappings: key.secret_mappings,
	};
}

/**
 * list_api_keys omits reset_usage to keep list payloads lean; get_api_key
 * surfaces it between expires_at and created_at. Both share the same
 * usage_limits/rate_limits mapping via formatKeyUsageLimits/formatKeyRateLimits
 * but are kept as separate literals so each preserves its own JSON field order.
 */
function formatApiKeySummary(apiKey: ApiKey): {
	id: string;
	name: string;
	description?: string;
	type: ApiKey["type"];
	status: ApiKey["status"];
	organisation_id: string;
	workspace_id?: string;
	user_id?: string;
	scopes: string[];
	usage_limits: ReturnType<typeof formatKeyUsageLimits>;
	rate_limits: ReturnType<typeof formatKeyRateLimits>;
	defaults: ApiKey["defaults"];
	alert_emails: string[];
	expires_at: string | null;
	created_at: string;
	last_updated_at: string;
	creation_mode: ApiKey["creation_mode"];
} {
	return {
		id: apiKey.id,
		name: apiKey.name,
		description: apiKey.description,
		type: apiKey.type,
		status: apiKey.status,
		organisation_id: apiKey.organisation_id,
		workspace_id: apiKey.workspace_id,
		user_id: apiKey.user_id,
		scopes: apiKey.scopes,
		usage_limits: formatKeyUsageLimits(apiKey.usage_limits),
		rate_limits: formatKeyRateLimits(apiKey.rate_limits),
		defaults: apiKey.defaults,
		alert_emails: apiKey.alert_emails,
		expires_at: apiKey.expires_at,
		created_at: apiKey.created_at,
		last_updated_at: apiKey.last_updated_at,
		creation_mode: apiKey.creation_mode,
	};
}

function formatApiKey(apiKey: ApiKey): {
	id: string;
	name: string;
	description?: string;
	type: ApiKey["type"];
	status: ApiKey["status"];
	organisation_id: string;
	workspace_id?: string;
	user_id?: string;
	scopes: string[];
	usage_limits: ReturnType<typeof formatKeyUsageLimits>;
	rate_limits: ReturnType<typeof formatKeyRateLimits>;
	defaults: ApiKey["defaults"];
	alert_emails: string[];
	expires_at: string | null;
	reset_usage: number | null;
	created_at: string;
	last_updated_at: string;
	creation_mode: ApiKey["creation_mode"];
} {
	return {
		id: apiKey.id,
		name: apiKey.name,
		description: apiKey.description,
		type: apiKey.type,
		status: apiKey.status,
		organisation_id: apiKey.organisation_id,
		workspace_id: apiKey.workspace_id,
		user_id: apiKey.user_id,
		scopes: apiKey.scopes,
		usage_limits: formatKeyUsageLimits(apiKey.usage_limits),
		rate_limits: formatKeyRateLimits(apiKey.rate_limits),
		defaults: apiKey.defaults,
		alert_emails: apiKey.alert_emails,
		expires_at: apiKey.expires_at,
		reset_usage: apiKey.reset_usage,
		created_at: apiKey.created_at,
		last_updated_at: apiKey.last_updated_at,
		creation_mode: apiKey.creation_mode,
	};
}

export function registerKeysTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List virtual keys tool
	server.tool(
		"list_virtual_keys",
		"List provider API keys stored as virtual keys in your Portkey org. Use this to find slugs before wiring prompts/configs or auditing limits. Returns total plus name, slug, status, usage limits, rate limits, reset state, and model config.",
		KEYS_TOOL_SCHEMAS.listVirtualKeys,
		async (params) => {
			const virtualKeys = await service.keys.listVirtualKeys({
				current_page: params.current_page,
				page_size: params.page_size,
			});
			return jsonResult({
				total: virtualKeys.total,
				virtual_keys: virtualKeys.data.map(formatVirtualKey),
			});
		},
	);

	// Phase 2: Create virtual key tool
	server.tool(
		"create_virtual_key",
		"Store a provider API key as a virtual key. The raw key is encrypted and only returned at creation time, so save the returned slug and use it in prompts/configs. Optional usage and rate limits apply immediately, and the tool returns the new slug.",
		KEYS_TOOL_SCHEMAS.createVirtualKey,
		async (params) => {
			const validated = createVirtualKeySchema.parse(params);
			const result = await service.keys.createVirtualKey({
				name: validated.name,
				provider: validated.provider,
				key: validated.key,
				note: validated.note,
				workspace_id: validated.workspace_id,
				apiVersion: validated.api_version,
				resourceName: validated.resource_name,
				deploymentName: validated.deployment_name,
				deploymentConfig: validated.deployment_configurations?.map(
					(configuration) => ({
						apiVersion: configuration.api_version,
						deploymentName: configuration.deployment_name,
						...(configuration.alias !== undefined
							? { alias: configuration.alias }
							: {}),
						...(configuration.is_default !== undefined
							? { is_default: configuration.is_default }
							: {}),
					}),
				),
				usage_limits: buildUsageLimits({
					credit_limit: validated.credit_limit,
					alert_threshold: validated.alert_threshold,
				}),
				rate_limits: buildRateLimitsRpm(validated.rate_limit_rpm),
				expires_at: validated.expires_at,
				secret_mappings: validated.secret_mappings,
			});

			// Handle both response formats: { data: { slug } } or { slug }
			const slug = result.data?.slug ?? (result as { slug?: string }).slug;
			return jsonResult({
				message: `Successfully created virtual key "${validated.name}"`,
				success: result.success,
				slug,
			});
		},
	);

	// Phase 2: Get virtual key tool
	server.tool(
		"get_virtual_key",
		"Fetch one virtual key by slug, including metadata, a masked secret, limits, status, and model config. Use this before updating or to inspect the current configuration.",
		KEYS_TOOL_SCHEMAS.getVirtualKey,
		async (params) => {
			const virtualKey = await service.keys.getVirtualKey(params.slug);
			return jsonResult(formatVirtualKey(virtualKey));
		},
	);

	// Phase 2: Update virtual key tool
	server.tool(
		"update_virtual_key",
		"Update a virtual key's name, secret, note, or limits. Rotating the key takes effect immediately, and limit changes apply to downstream prompts and configs using this slug. Returns success when Portkey accepts the update.",
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
				deploymentConfig: params.deployment_configurations?.map(
					(configuration) => ({
						apiVersion: configuration.api_version,
						deploymentName: configuration.deployment_name,
						...(configuration.alias !== undefined
							? { alias: configuration.alias }
							: {}),
						...(configuration.is_default !== undefined
							? { is_default: configuration.is_default }
							: {}),
					}),
				),
				secret_mappings: params.secret_mappings,
			});

			return jsonResult({
				message: `Successfully updated virtual key "${params.slug}"`,
				success: result.success,
			});
		},
	);

	// Phase 2: Delete virtual key tool
	server.tool(
		"delete_virtual_key",
		"Delete a virtual key by slug. This is irreversible and will break prompts and configs that reference the slug, so confirm no active dependencies first. Returns success after removal.",
		KEYS_TOOL_SCHEMAS.deleteVirtualKey,
		async (params) => {
			const result = await service.keys.deleteVirtualKey(params.slug);
			return jsonResult({
				message: `Successfully deleted virtual key "${params.slug}"`,
				success: result.success,
			});
		},
	);

	// Phase 2: Create API key tool
	server.tool(
		"create_api_key",
		"Create a Portkey API key for auth. Org keys grant broader access; workspace keys are scoped. WARNING: The key secret is returned ONCE in the tool result and will be visible in MCP transcripts and LLM context — store it securely immediately. Using the key grants access immediately according to its scopes, defaults, and limits. Workspace keys require workspace_id and user keys require user_id.",
		KEYS_TOOL_SCHEMAS.createApiKey,
		async (params) => {
			const validated = createApiKeySchema.parse(params);
			const result = await service.keys.createApiKey(
				validated.type,
				validated.sub_type,
				{
					name: validated.name,
					description: validated.description,
					organisation_id: validated.organisation_id,
					workspace_id: validated.workspace_id,
					user_id: validated.user_id,
					scopes: validated.scopes,
					usage_limits: buildUsageLimits({
						credit_limit: validated.credit_limit,
						alert_threshold: validated.alert_threshold,
					}),
					rate_limits:
						validated.rate_limits ??
						buildRateLimitsRpm(validated.rate_limit_rpm),
					defaults: (() => {
						const d: Record<string, unknown> = {};
						if (validated.default_config_id !== undefined)
							d.config_id = validated.default_config_id;
						if (validated.default_metadata !== undefined)
							d.metadata = validated.default_metadata;
						if (validated.default_allow_config_override !== undefined)
							d.allow_config_override = validated.default_allow_config_override;
						return Object.keys(d).length > 0 ? d : undefined;
					})(),
					alert_emails: validated.alert_emails,
					expires_at: validated.expires_at,
					rotation_policy: validated.rotation_policy,
				},
			);

			return jsonResult({
				message: `Successfully created API key "${validated.name}"`,
				id: result.id,
				key: result.key,
			});
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

			return jsonResult({
				total: apiKeys.total,
				api_keys: apiKeys.data.map(formatApiKeySummary),
			});
		},
	);

	// Phase 2: Get API key tool
	server.tool(
		"get_api_key",
		"Fetch one API key by UUID without revealing the secret. Use this to inspect scopes, defaults, limits, expiration, and reset state before changing access.",
		KEYS_TOOL_SCHEMAS.getApiKey,
		async (params) => {
			const apiKey = await service.keys.getApiKey(params.id);
			return jsonResult(formatApiKey(apiKey));
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
				rate_limits:
					params.rate_limits ?? buildRateLimitsRpm(params.rate_limit_rpm),
				...(params.reset_usage !== undefined
					? { reset_usage: params.reset_usage }
					: {}),
				defaults:
					params.default_config_id !== undefined ||
					params.default_metadata !== undefined ||
					params.default_allow_config_override !== undefined
						? {
								config_id: params.default_config_id,
								metadata: params.default_metadata,
								...(params.default_allow_config_override !== undefined
									? {
											allow_config_override:
												params.default_allow_config_override,
										}
									: {}),
							}
						: undefined,
				alert_emails: params.alert_emails,
				expires_at: params.expires_at,
				...(params.rotation_policy !== undefined
					? { rotation_policy: params.rotation_policy }
					: {}),
			});

			return jsonResult({
				message: `Successfully updated API key "${params.id}"`,
				success: result.success,
			});
		},
	);

	// Phase 2: Delete API key tool
	server.tool(
		"delete_api_key",
		"Delete an API key by UUID. This cannot be undone, revokes access immediately, and can break active sessions using the key. Returns success after revocation.",
		KEYS_TOOL_SCHEMAS.deleteApiKey,
		async (params) => {
			const result = await service.keys.deleteApiKey(params.id);
			return jsonResult({
				message: `Successfully deleted API key "${params.id}"`,
				success: result.success,
			});
		},
	);

	server.tool(
		"rotate_api_key",
		"Rotate an API key without changing its identity or scopes. The new secret is returned once and exposed to this MCP transcript, while the previous secret remains valid until key_transition_expires_at. Store the new key securely, update callers during the transition window, and never log either secret.",
		KEYS_TOOL_SCHEMAS.rotateApiKey,
		{
			title: "Rotate API Key",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: true,
		},
		async (params) => {
			const result = await service.keys.rotateApiKey(params.id, {
				key_transition_period_ms: params.key_transition_period_ms,
			});
			return jsonResult({
				message: `Successfully rotated API key "${result.id}"`,
				warning:
					"Copy this new key now; it is returned only once. Replace callers before key_transition_expires_at and never log either key.",
				id: result.id,
				key: result.key,
				key_transition_expires_at: result.key_transition_expires_at,
			});
		},
	);
}
