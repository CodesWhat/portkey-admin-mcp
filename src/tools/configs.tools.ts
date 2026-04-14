import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

type ConfigToolParams = {
	cache_mode?: "simple" | "semantic";
	cache_max_age?: number;
	retry_attempts?: number;
	retry_on_status_codes?: number[];
	strategy_mode?: "loadbalance" | "fallback";
	targets?: Array<{
		provider?: string;
		virtual_key?: string;
	}>;
};

const CONFIGS_TOOL_SCHEMAS = {
	listConfigs: {},
	getConfig: {
		slug: z
			.string()
			.describe(
				"The unique identifier (slug) of the configuration to retrieve. " +
					"This can be found in the configuration's URL or from the list_configs tool response",
			),
	},
	createConfig: {
		name: z.string().describe("Name for the new configuration"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to create config in"),
		cache_mode: z
			.enum(["simple", "semantic"])
			.optional()
			.describe("Cache mode: 'simple' or 'semantic'"),
		cache_max_age: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Cache max age in seconds"),
		retry_attempts: z.coerce
			.number()
			.positive()
			.max(5)
			.optional()
			.describe("Number of retry attempts (1-5)"),
		retry_on_status_codes: z
			.array(z.coerce.number())
			.optional()
			.describe("HTTP status codes to retry on (e.g., [429, 500, 502, 503])"),
		strategy_mode: z
			.enum(["loadbalance", "fallback"])
			.optional()
			.describe("Routing strategy: 'loadbalance' or 'fallback'"),
		targets: z
			.array(
				z
					.object({
						provider: z.string().optional(),
						virtual_key: z.string().optional(),
					})
					.refine((t) => t.provider || t.virtual_key, {
						message: "Each target must have at least provider or virtual_key",
					}),
			)
			.optional()
			.describe("Array of target providers with virtual keys"),
	},
	updateConfig: {
		slug: z.string().describe("Configuration slug to update"),
		name: z.string().optional().describe("New name for the configuration"),
		status: z
			.enum(["active", "inactive"])
			.optional()
			.describe("Configuration status"),
		cache_mode: z
			.enum(["simple", "semantic"])
			.optional()
			.describe("Cache mode: 'simple' or 'semantic'"),
		cache_max_age: z.coerce
			.number()
			.positive()
			.optional()
			.describe("Cache max age in seconds"),
		retry_attempts: z.coerce
			.number()
			.positive()
			.max(5)
			.optional()
			.describe("Number of retry attempts (1-5)"),
		retry_on_status_codes: z
			.array(z.coerce.number())
			.optional()
			.describe("HTTP status codes to retry on"),
		strategy_mode: z
			.enum(["loadbalance", "fallback"])
			.optional()
			.describe("Routing strategy"),
		targets: z
			.array(
				z
					.object({
						provider: z.string().optional(),
						virtual_key: z.string().optional(),
					})
					.refine((t) => t.provider || t.virtual_key, {
						message: "Each target must have at least provider or virtual_key",
					}),
			)
			.optional()
			.describe("Array of target providers"),
	},
	deleteConfig: {
		slug: z.string().describe("Configuration slug to delete"),
	},
	listConfigVersions: {
		slug: z.string().describe("Configuration slug to list versions for"),
	},
} as const;

function buildConfigPayload(params: ConfigToolParams) {
	const cache =
		params.cache_mode !== undefined || params.cache_max_age !== undefined
			? {
					...(params.cache_mode !== undefined
						? { mode: params.cache_mode }
						: {}),
					...(params.cache_max_age !== undefined
						? { max_age: params.cache_max_age }
						: {}),
				}
			: undefined;
	const retry =
		params.retry_attempts !== undefined ||
		params.retry_on_status_codes !== undefined
			? {
					...(params.retry_attempts !== undefined
						? { attempts: params.retry_attempts }
						: {}),
					...(params.retry_on_status_codes !== undefined
						? { on_status_codes: params.retry_on_status_codes }
						: {}),
				}
			: undefined;

	return {
		cache,
		retry,
		strategy:
			params.strategy_mode !== undefined
				? { mode: params.strategy_mode }
				: undefined,
		targets: params.targets,
	};
}

function hasConfigSettings(
	config: ReturnType<typeof buildConfigPayload>,
): boolean {
	return (
		config.cache !== undefined ||
		config.retry !== undefined ||
		config.strategy !== undefined ||
		config.targets !== undefined
	);
}

export function registerConfigsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// List configurations tool
	server.tool(
		"list_configs",
		"Retrieve all configurations in your Portkey organization, including their status and workspace associations. Configs define request routing behavior (cache, retry, fallback, load balancing). Use to discover config slugs before inspecting or modifying them.",
		CONFIGS_TOOL_SCHEMAS.listConfigs,
		async () => {
			const configs = await service.configs.listConfigs();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: configs.total,
								configurations: (configs.data ?? []).map((config) => ({
									id: config.id,
									name: config.name,
									slug: config.slug,
									workspace_id: config.workspace_id,
									status: config.status,
									is_default: config.is_default,
									created_at: config.created_at,
									last_updated_at: config.last_updated_at,
									owner_id: config.owner_id,
									updated_by: config.updated_by,
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

	// Get configuration details tool
	server.tool(
		"get_config",
		"Retrieve detailed information about a specific configuration, including cache settings, retry policies, routing strategy, and targets. Use when you need to inspect a config's full settings or clone an existing config's structure.",
		CONFIGS_TOOL_SCHEMAS.getConfig,
		async (params) => {
			const response = await service.configs.getConfig(params.slug);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								id: response.id,
								slug: response.slug,
								name: response.name,
								status: response.status,
								config: {
									cache: response.config.cache && {
										mode: response.config.cache.mode,
										max_age: response.config.cache.max_age,
									},
									retry: response.config.retry && {
										attempts: response.config.retry.attempts,
										on_status_codes: response.config.retry.on_status_codes,
									},
									strategy: response.config.strategy && {
										mode: response.config.strategy.mode,
									},
									targets: response.config.targets?.map(
										(target: { provider?: string; virtual_key?: string }) => ({
											provider: target.provider,
											virtual_key: target.virtual_key,
										}),
									),
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

	// Phase 1: Create configuration tool
	server.tool(
		"create_config",
		"Create a new configuration that defines how AI requests are routed, cached, retried, and load-balanced across providers. At least one setting is required: cache (cache_mode/cache_max_age), retry (retry_attempts/retry_on_status_codes), strategy_mode, or targets.",
		CONFIGS_TOOL_SCHEMAS.createConfig,
		async (params) => {
			const config = buildConfigPayload(params);

			// API requires config to have at least one non-empty setting
			if (!hasConfigSettings(config)) {
				return {
					content: [
						{
							type: "text",
							text: "Error creating configuration: At least one config setting (cache_mode, retry_attempts, strategy_mode, or targets) must be provided",
						},
					],
					isError: true,
				};
			}

			const result = await service.configs.createConfig({
				name: params.name,
				config,
				workspace_id: params.workspace_id,
			});

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created configuration "${params.name}"`,
								id: result.id,
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

	// Phase 1: Update configuration tool
	server.tool(
		"update_config",
		"Update an existing configuration's cache, retry, or routing settings. Creates a new version; only provided fields are updated, unspecified fields remain unchanged.",
		CONFIGS_TOOL_SCHEMAS.updateConfig,
		async (params) => {
			const config = buildConfigPayload(params);

			// Only include defined fields to avoid sending undefined to API
			const updateData: Record<string, unknown> = {};
			if (params.name !== undefined) updateData.name = params.name;
			if (params.status !== undefined) updateData.status = params.status;
			if (hasConfigSettings(config)) {
				updateData.config = config;
			}

			const result = await service.configs.updateConfig(
				params.slug,
				updateData,
			);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated configuration "${params.slug}"`,
								id: result.id,
								slug: result.slug,
								config: result.config,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Phase 1: Delete configuration tool
	server.tool(
		"delete_config",
		"Delete a configuration by slug. This action cannot be undone and removes all versions. Requests and API keys referencing this config slug will fail immediately. Use list_config_versions first to review history; audit dependent API keys before deleting.",
		CONFIGS_TOOL_SCHEMAS.deleteConfig,
		async (params) => {
			const result = await service.configs.deleteConfig(params.slug);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted configuration "${params.slug}"`,
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

	// Phase 1: List configuration versions tool
	server.tool(
		"list_config_versions",
		"List all versions of a configuration to view its change history. Use to audit past changes, compare versions, or find a specific version ID for rollback.",
		CONFIGS_TOOL_SCHEMAS.listConfigVersions,
		async (params) => {
			const result = await service.configs.listConfigVersions(params.slug);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								versions: (result.data ?? []).map((version) => ({
									id: version.id,
									version: version.version,
									config: version.config,
									created_at: version.created_at,
									created_by: version.created_by,
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
}
