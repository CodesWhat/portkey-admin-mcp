import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

const statusSchema = z.enum(["active", "archived"]);
const rateUnitSchema = z.enum(["rpm", "rph", "rpd", "rpw"]);
const rateTargetSchema = z.enum(["llm", "mcp_tools"]);
const conditionValueSchema = z.union([z.string(), z.array(z.string()).min(1)]);
const conditionSchema = z.object({
	key: z
		.string()
		.min(1)
		.describe(
			"Match key such as api_key, virtual_key, provider, config, prompt, model, endpoint_type, mcp_server, mcp_tool, workspace_id, or metadata.*",
		),
	value: conditionValueSchema.describe(
		"One value or several OR-matched values; use * for wildcard matching",
	),
	excludes: conditionValueSchema.optional().describe("Values to exclude"),
});
const groupBySchema = z.object({
	key: z
		.string()
		.min(1)
		.describe(
			"Counter grouping key such as api_key, workspace_id, virtual_key, provider, config, prompt, model, mcp_server, mcp_tool, or metadata.*",
		),
});
const paginationSchema = {
	page_size: z.coerce
		.number()
		.int()
		.positive()
		.optional()
		.describe("Number of policies to return per page"),
	current_page: z.coerce
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Zero-based page number"),
};

const LIMITS_TOOL_SCHEMAS = {
	listRateLimits: {
		workspace_id: z.string().optional().describe("Filter by workspace UUID"),
		status: statusSchema
			.optional()
			.describe("Filter by active or archived status"),
		type: z
			.enum(["requests", "tokens"])
			.optional()
			.describe("Filter by counter type"),
		unit: rateUnitSchema.optional().describe("Filter by reset interval"),
		target: rateTargetSchema
			.optional()
			.describe("Filter by LLM or MCP-tool target"),
		...paginationSchema,
	},
	getRateLimit: {
		id: z.string().min(1).describe("Rate-limit policy UUID"),
		status: statusSchema
			.optional()
			.describe("Include an archived policy by status"),
	},
	createRateLimit: {
		conditions: z
			.array(conditionSchema)
			.min(1)
			.describe("Policy match conditions"),
		group_by: z
			.array(groupBySchema)
			.min(1)
			.describe("Counter grouping dimensions"),
		type: z.enum(["requests", "tokens"]).describe("Counter type"),
		unit: rateUnitSchema.describe("Counter reset interval"),
		value: z.coerce
			.number()
			.nonnegative()
			.describe("Maximum requests or tokens"),
		name: z.string().optional().describe("Optional policy display name"),
		target: rateTargetSchema
			.optional()
			.describe("LLM or MCP-tool enforcement target"),
		workspace_id: z.string().optional().describe("Workspace UUID scope"),
		organisation_id: z.string().optional().describe("Organisation UUID scope"),
	},
	updateRateLimit: {
		id: z.string().min(1).describe("Rate-limit policy UUID"),
		name: z.string().optional().describe("Replacement display name"),
		unit: rateUnitSchema.optional().describe("Replacement reset interval"),
		value: z.coerce
			.number()
			.nonnegative()
			.optional()
			.describe("Replacement maximum"),
		conditions: z
			.array(conditionSchema)
			.min(1)
			.optional()
			.describe("Replacement conditions"),
	},
	deleteRateLimit: {
		id: z.string().min(1).describe("Rate-limit policy UUID to delete"),
	},
	listUsageLimits: {
		workspace_id: z.string().optional().describe("Filter by workspace UUID"),
		status: statusSchema
			.optional()
			.describe("Filter by active or archived status"),
		type: z
			.enum(["cost", "tokens"])
			.optional()
			.describe("Filter by budget type"),
		...paginationSchema,
	},
	getUsageLimit: {
		id: z.string().min(1).describe("Usage-limit policy UUID"),
		status: statusSchema
			.optional()
			.describe("Include an archived policy by status"),
		include_usage: z
			.boolean()
			.optional()
			.describe("Include per-value usage counters"),
	},
	createUsageLimit: {
		conditions: z
			.array(conditionSchema)
			.min(1)
			.describe("Policy match conditions"),
		group_by: z
			.array(groupBySchema)
			.min(1)
			.describe("Usage grouping dimensions"),
		type: z.enum(["cost", "tokens"]).describe("Budget type"),
		credit_limit: z.coerce
			.number()
			.nonnegative()
			.describe("Maximum cumulative usage"),
		name: z.string().optional().describe("Optional policy display name"),
		alert_threshold: z.coerce
			.number()
			.nonnegative()
			.nullable()
			.optional()
			.describe("Optional alert threshold"),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.nullable()
			.optional()
			.describe("Optional reset schedule"),
		workspace_id: z.string().optional().describe("Workspace UUID scope"),
		organisation_id: z.string().optional().describe("Organisation UUID scope"),
	},
	updateUsageLimit: {
		id: z.string().min(1).describe("Usage-limit policy UUID"),
		name: z.string().optional().describe("Replacement display name"),
		credit_limit: z.coerce
			.number()
			.nonnegative()
			.optional()
			.describe("Replacement cumulative maximum"),
		alert_threshold: z.coerce
			.number()
			.nonnegative()
			.nullable()
			.optional()
			.describe("Replacement alert threshold"),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.nullable()
			.optional()
			.describe("Replacement reset schedule"),
		reset_usage_for_value: z
			.string()
			.optional()
			.describe("Grouped value whose usage should reset"),
	},
	deleteUsageLimit: {
		id: z.string().min(1).describe("Usage-limit policy UUID to archive"),
	},
	listUsageLimitEntities: {
		limit_id: z.string().min(1).describe("Usage-limit policy UUID"),
		status: z
			.enum(["active", "exhausted"])
			.optional()
			.describe("Filter by enforcement state"),
		search: z.string().optional().describe("Search tracked values"),
		page_size: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.optional()
			.describe("Number of entities per page"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number"),
	},
	resetUsageLimitEntity: {
		limit_id: z.string().min(1).describe("Usage-limit policy UUID"),
		entity_id: z.string().min(1).describe("Tracked entity UUID to reset"),
	},
} as const;

function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as T;
}

function withoutObject<T extends { object?: string }>(
	value: T,
): Omit<T, "object"> {
	const { object: _object, ...result } = value;
	return result;
}

export function registerLimitsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"list_rate_limits",
		"List rate-limit policies with their current condition, grouping, rate unit, target, status, and scope. Filter before retrieving or changing one policy, especially when archived policies should be included.",
		LIMITS_TOOL_SCHEMAS.listRateLimits,
		async (params) => {
			const result = await service.limits.listRateLimits(params);
			return jsonResult({
				total: result.total,
				rate_limits: result.data.map(withoutObject),
			});
		},
	);

	server.tool(
		"get_rate_limit",
		"Get one rate-limit policy by id, including current conditions, grouping, unit, value, target, scope, and status. Pass archived status when retrieving a soft-deleted policy.",
		LIMITS_TOOL_SCHEMAS.getRateLimit,
		async ({ id, status }) =>
			jsonResult(withoutObject(await service.limits.getRateLimit(id, status))),
	);

	server.tool(
		"create_rate_limit",
		"Create a request or token rate-limit policy. Conditions and grouping must be non-empty; target llm uses model/provider keys, while target mcp_tools uses MCP server and tool keys.",
		LIMITS_TOOL_SCHEMAS.createRateLimit,
		async (params) => {
			const result = await service.limits.createRateLimit(params);
			return jsonResult({
				success: true,
				id: result.id,
			});
		},
	);

	server.tool(
		"update_rate_limit",
		"Update a rate-limit policy's name, unit, value, or non-empty conditions by id. The public contract does not allow changing its type, target, or grouping after creation.",
		LIMITS_TOOL_SCHEMAS.updateRateLimit,
		async ({ id, ...updates }) => {
			await service.limits.updateRateLimit(id, compact(updates));
			return jsonResult({ success: true, id });
		},
	);

	server.tool(
		"delete_rate_limit",
		"Delete a rate-limit policy by id. Portkey removes the active throttling policy immediately, so inspect dependent callers and the full policy before deleting it.",
		LIMITS_TOOL_SCHEMAS.deleteRateLimit,
		async ({ id }) => {
			await service.limits.deleteRateLimit(id);
			return jsonResult({ success: true, id });
		},
	);

	server.tool(
		"list_usage_limits",
		"List cumulative cost or token usage-limit policies with current conditions, grouping, reset schedule, status, and scope. Filter by workspace, policy type, status, and pagination.",
		LIMITS_TOOL_SCHEMAS.listUsageLimits,
		async (params) => {
			const result = await service.limits.listUsageLimits(params);
			return jsonResult({
				total: result.total,
				usage_limits: result.data.map(withoutObject),
			});
		},
	);

	server.tool(
		"get_usage_limit",
		"Get one cumulative usage-limit policy by id. Use list_usage_limits first when the id is unknown. Optionally include per-value usage counters and retrieve archived policies; scheduled reset timestamps are returned when present.",
		LIMITS_TOOL_SCHEMAS.getUsageLimit,
		async ({ id, ...params }) =>
			jsonResult(withoutObject(await service.limits.getUsageLimit(id, params))),
	);

	server.tool(
		"create_usage_limit",
		"Create a cumulative cost or token usage-limit policy with non-empty conditions and grouping. A periodic reset can be weekly, monthly, or omitted for a cumulative lifetime limit.",
		LIMITS_TOOL_SCHEMAS.createUsageLimit,
		async (params) => {
			const result = await service.limits.createUsageLimit(params);
			return jsonResult({
				success: true,
				id: result.id,
			});
		},
	);

	server.tool(
		"update_usage_limit",
		"Update a cumulative usage-limit policy's name, credit limit, alert threshold, reset schedule, or one grouped value's usage. Conditions and grouping aren't mutable in the public contract.",
		LIMITS_TOOL_SCHEMAS.updateUsageLimit,
		async ({ id, ...updates }) => {
			await service.limits.updateUsageLimit(id, compact(updates));
			return jsonResult({ success: true, id });
		},
	);

	server.tool(
		"delete_usage_limit",
		"Archive a cumulative usage-limit policy by id. The policy stops enforcing its budget but its historical record remains available through archived-status reads.",
		LIMITS_TOOL_SCHEMAS.deleteUsageLimit,
		async ({ id }) => {
			await service.limits.deleteUsageLimit(id);
			return jsonResult({ success: true, id, status: "archived" });
		},
	);

	server.tool(
		"list_usage_limit_entities",
		"List the values currently tracked by one usage-limit policy with each value key and current usage. Filter by active or exhausted state, search text, and pagination before resetting one counter.",
		LIMITS_TOOL_SCHEMAS.listUsageLimitEntities,
		async ({ limit_id, ...params }) => {
			const result = await service.limits.listUsageLimitEntities(
				limit_id,
				params,
			);
			return jsonResult({ total: result.total, entities: result.data });
		},
	);

	server.tool(
		"reset_usage_limit_entity",
		"Reset the current usage counter for one tracked usage-limit entity. This changes enforcement immediately for that exact policy and entity, so use the entity id returned by list_usage_limit_entities.",
		LIMITS_TOOL_SCHEMAS.resetUsageLimitEntity,
		async ({ limit_id, entity_id }) => {
			await service.limits.resetUsageLimitEntity(limit_id, entity_id);
			return jsonResult({ success: true, limit_id, entity_id });
		},
	);
}
