import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import type {
	RateLimit,
	UsageLimit,
	UsageLimitEntity,
} from "../services/limits.service.js";

// Reusable schema for limit conditions
const conditionSchema = z.object({
	field: z
		.string()
		.describe(
			"The field to match on (e.g., 'virtual_key', 'api_key', 'user_id', 'metadata.key')",
		),
	operator: z
		.string()
		.describe("The comparison operator (e.g., 'is', 'contains', 'is_not')"),
	value: z.string().describe("The value to match against"),
});

const LIMITS_TOOL_SCHEMAS = {
	listRateLimits: {
		workspace_id: z
			.string()
			.optional()
			.describe("Filter rate limits by workspace ID"),
	},
	getRateLimit: {
		id: z.string().describe("The unique identifier of the rate limit"),
	},
	createRateLimit: {
		conditions: z
			.array(conditionSchema)
			.describe(
				"Array of conditions that determine which requests this rate limit applies to",
			),
		group_by: z
			.array(z.string())
			.describe(
				"Array of fields to group the rate limit by (e.g., ['virtual_key'], ['api_key', 'user_id'])",
			),
		type: z
			.enum(["requests", "tokens"])
			.describe("What to rate limit: 'requests' or 'tokens'"),
		unit: z
			.enum(["rpm", "rph", "rpd"])
			.describe(
				"Time unit: 'rpm' (per minute), 'rph' (per hour), or 'rpd' (per day)",
			),
		value: z.coerce
			.number()
			.positive()
			.describe("The maximum allowed value per unit (e.g., 100 rpm)"),
		name: z.string().optional().describe("Optional name for the rate limit"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to scope the limit to"),
		organisation_id: z
			.string()
			.optional()
			.describe("Organisation ID to scope the limit to"),
	},
	updateRateLimit: {
		id: z.string().describe("The unique identifier of the rate limit"),
		name: z.string().optional().describe("New name for the rate limit"),
		unit: z
			.enum(["rpm", "rph", "rpd"])
			.optional()
			.describe(
				"New time unit: 'rpm' (per minute), 'rph' (per hour), or 'rpd' (per day)",
			),
		value: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New maximum allowed value per unit"),
	},
	deleteRateLimit: {
		id: z.string().describe("The unique identifier of the rate limit"),
	},
	listUsageLimits: {
		workspace_id: z
			.string()
			.optional()
			.describe("Filter usage limits by workspace ID"),
	},
	getUsageLimit: {
		id: z.string().describe("The unique identifier of the usage limit"),
	},
	createUsageLimit: {
		conditions: z
			.array(conditionSchema)
			.describe(
				"Array of conditions that determine which requests this usage limit applies to",
			),
		group_by: z
			.array(z.string())
			.describe(
				"Array of fields to group the usage limit by (e.g., ['virtual_key'], ['api_key', 'user_id'])",
			),
		type: z
			.enum(["cost", "tokens"])
			.describe("What to limit: 'cost' (in dollars) or 'tokens'"),
		credit_limit: z.coerce
			.number()
			.positive()
			.describe("The maximum allowed usage (cost in dollars or token count)"),
		name: z.string().optional().describe("Optional name for the usage limit"),
		alert_threshold: z.coerce
			.number()
			.optional()
			.describe("Percentage threshold (0-100) at which to send an alert"),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.optional()
			.describe("Automatically reset usage counters on this schedule"),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to scope the limit to"),
		organisation_id: z
			.string()
			.optional()
			.describe("Organisation ID to scope the limit to"),
	},
	updateUsageLimit: {
		id: z.string().describe("The unique identifier of the usage limit"),
		name: z.string().optional().describe("New name for the usage limit"),
		credit_limit: z.coerce
			.number()
			.positive()
			.optional()
			.describe("New maximum allowed usage value"),
		alert_threshold: z.coerce
			.number()
			.optional()
			.describe("New alert threshold percentage (0-100)"),
		periodic_reset: z
			.enum(["monthly", "weekly"])
			.optional()
			.describe("New periodic reset schedule"),
		reset_usage_for_value: z
			.string()
			.optional()
			.describe("Reset usage counters for a specific group_by value"),
	},
	deleteUsageLimit: {
		id: z.string().describe("The unique identifier of the usage limit"),
	},
	listUsageLimitEntities: {
		limit_id: z.string().describe("Usage limit policy ID"),
	},
	resetUsageLimitEntity: {
		limit_id: z.string().describe("Usage limit policy ID"),
		entity_id: z.string().describe("Entity ID to reset usage for"),
	},
} as const;

function formatRateLimit(limit: RateLimit): {
	id: string;
	name?: string;
	type: "requests" | "tokens";
	unit: "rpm" | "rph" | "rpd";
	value: number;
	status: string;
	conditions: RateLimit["conditions"];
	group_by: string[];
	workspace_id?: string;
	organisation_id?: string;
	created_at: string;
	last_updated_at: string;
} {
	return {
		id: limit.id,
		name: limit.name,
		type: limit.type,
		unit: limit.unit,
		value: limit.value,
		status: limit.status,
		conditions: limit.conditions,
		group_by: limit.group_by,
		workspace_id: limit.workspace_id,
		organisation_id: limit.organisation_id,
		created_at: limit.created_at,
		last_updated_at: limit.last_updated_at,
	};
}

function formatUsageLimit(limit: UsageLimit): {
	id: string;
	name?: string;
	type: "cost" | "tokens";
	credit_limit: number;
	alert_threshold?: number;
	periodic_reset?: "monthly" | "weekly";
	status: string;
	conditions: UsageLimit["conditions"];
	group_by: string[];
	workspace_id?: string;
	organisation_id?: string;
	created_at: string;
	last_updated_at: string;
} {
	return {
		id: limit.id,
		name: limit.name,
		type: limit.type,
		credit_limit: limit.credit_limit,
		alert_threshold: limit.alert_threshold,
		periodic_reset: limit.periodic_reset,
		status: limit.status,
		conditions: limit.conditions,
		group_by: limit.group_by,
		workspace_id: limit.workspace_id,
		organisation_id: limit.organisation_id,
		created_at: limit.created_at,
		last_updated_at: limit.last_updated_at,
	};
}

function formatUsageLimitEntity(entity: UsageLimitEntity): UsageLimitEntity {
	return {
		id: entity.id,
		entity_id: entity.entity_id,
		entity_type: entity.entity_type,
		usage: entity.usage,
		limit_id: entity.limit_id,
		last_reset_at: entity.last_reset_at,
	};
}

export function registerLimitsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Rate Limits Tools ====================

	// List rate limits
	server.tool(
		"list_rate_limits",
		"Retrieve all rate limits in your Portkey organization. Use to discover existing rate limit policies before creating new ones. Returns an array of rate limits each containing id, type, unit, value, and status. Rate limits control how many requests or tokens can be consumed per time unit (rpm/rph/rpd).",
		LIMITS_TOOL_SCHEMAS.listRateLimits,
		async (params) => {
			const result = await service.limits.listRateLimits(params.workspace_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								rate_limits: result.data.map(formatRateLimit),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get rate limit
	server.tool(
		"get_rate_limit",
		"Retrieve detailed information about a specific rate limit by its ID. Returns full detail including conditions and group_by fields. Use when you have a specific rate limit ID from list_rate_limits and need to inspect its complete configuration.",
		LIMITS_TOOL_SCHEMAS.getRateLimit,
		async (params) => {
			const result = await service.limits.getRateLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatRateLimit(result), null, 2),
					},
				],
			};
		},
	);

	// Create rate limit
	server.tool(
		"create_rate_limit",
		"Create a new rate limit policy to throttle requests in real-time by controlling request/token consumption per time unit. Differs from usage limits, which cap cumulative consumption over time. Requires conditions to match against and group_by to specify how limits are applied.",
		LIMITS_TOOL_SCHEMAS.createRateLimit,
		async (params) => {
			const result = await service.limits.createRateLimit({
				conditions: params.conditions,
				group_by: params.group_by,
				type: params.type,
				unit: params.unit,
				value: params.value,
				name: params.name,
				workspace_id: params.workspace_id,
				organisation_id: params.organisation_id,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created rate limit${params.name ? ` "${params.name}"` : ""}`,
								rate_limit: formatRateLimit(result),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update rate limit
	server.tool(
		"update_rate_limit",
		"Update an existing rate limit's name, unit, or value. Only name, unit, and value can be changed after creation; conditions and group_by are immutable. Returns the updated rate limit object.",
		LIMITS_TOOL_SCHEMAS.updateRateLimit,
		async (params) => {
			const result = await service.limits.updateRateLimit(params.id, {
				name: params.name,
				unit: params.unit,
				value: params.value,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated rate limit "${params.id}"`,
								rate_limit: formatRateLimit(result),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Delete rate limit
	server.tool(
		"delete_rate_limit",
		"Delete a rate limit policy by ID. This action cannot be undone. Requests previously throttled by this policy will no longer be limited; review dependent configs and virtual keys first to avoid unexpected traffic spikes.",
		LIMITS_TOOL_SCHEMAS.deleteRateLimit,
		async (params) => {
			await service.limits.deleteRateLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted rate limit "${params.id}"`,
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

	// ==================== Usage Limits Tools ====================

	// List usage limits
	server.tool(
		"list_usage_limits",
		"Retrieve all usage limits in your Portkey organization. Differs from rate limits: usage limits cap total cumulative cost or tokens over time, optionally resetting on a weekly or monthly schedule. Returns an array of usage limits with id, type, credit_limit, status, and reset schedule.",
		LIMITS_TOOL_SCHEMAS.listUsageLimits,
		async (params) => {
			const result = await service.limits.listUsageLimits(params.workspace_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								usage_limits: result.data.map(formatUsageLimit),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Get usage limit
	server.tool(
		"get_usage_limit",
		"Retrieve detailed information about a specific usage limit by its ID. Returns full detail including conditions, group_by, credit_limit, alert_threshold, and periodic reset schedule.",
		LIMITS_TOOL_SCHEMAS.getUsageLimit,
		async (params) => {
			const result = await service.limits.getUsageLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(formatUsageLimit(result), null, 2),
					},
				],
			};
		},
	);

	// Create usage limit
	server.tool(
		"create_usage_limit",
		"Create a new usage limit policy to enforce spending or token budgets over time. Differs from rate limits, which control real-time request velocity. Requires conditions to match against and group_by to specify how limits are applied. Supports optional periodic resets and alert thresholds.",
		LIMITS_TOOL_SCHEMAS.createUsageLimit,
		async (params) => {
			const result = await service.limits.createUsageLimit({
				conditions: params.conditions,
				group_by: params.group_by,
				type: params.type,
				credit_limit: params.credit_limit,
				name: params.name,
				alert_threshold: params.alert_threshold,
				periodic_reset: params.periodic_reset,
				workspace_id: params.workspace_id,
				organisation_id: params.organisation_id,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully created usage limit${params.name ? ` "${params.name}"` : ""}`,
								usage_limit: formatUsageLimit(result),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Update usage limit
	server.tool(
		"update_usage_limit",
		"Update an existing usage limit's configuration. Modifiable fields: name, credit_limit, alert_threshold, periodic_reset, and reset_usage_for_value. Conditions and group_by are immutable after creation.",
		LIMITS_TOOL_SCHEMAS.updateUsageLimit,
		async (params) => {
			const result = await service.limits.updateUsageLimit(params.id, {
				name: params.name,
				credit_limit: params.credit_limit,
				alert_threshold: params.alert_threshold,
				periodic_reset: params.periodic_reset,
				reset_usage_for_value: params.reset_usage_for_value,
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully updated usage limit "${params.id}"`,
								usage_limit: formatUsageLimit(result),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	// Delete usage limit
	server.tool(
		"delete_usage_limit",
		"Delete a usage limit policy by ID. This action cannot be undone. Budgets and quotas enforced by this policy are removed immediately and tracked entities lose accumulated usage state. Use list_usage_limit_entities first to review impact before deleting.",
		LIMITS_TOOL_SCHEMAS.deleteUsageLimit,
		async (params) => {
			await service.limits.deleteUsageLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully deleted usage limit "${params.id}"`,
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

	// ==================== Usage Limit Entities ====================

	server.tool(
		"list_usage_limit_entities",
		"List all entities (individual keys, users, or groups) tracked against a usage limit policy. Shows current consumption per entity, useful for monitoring who is approaching or has exceeded their budget.",
		LIMITS_TOOL_SCHEMAS.listUsageLimitEntities,
		async (params) => {
			const result = await service.limits.listUsageLimitEntities(
				params.limit_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								total: result.total,
								entities: result.data.map(formatUsageLimitEntity),
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.tool(
		"reset_usage_limit_entity",
		"Reset the accumulated usage counter to zero for a specific entity on a usage limit policy. Does not delete the entity or the policy itself. Use when an entity needs its budget restored before the next scheduled periodic reset.",
		LIMITS_TOOL_SCHEMAS.resetUsageLimitEntity,
		async (params) => {
			await service.limits.resetUsageLimitEntity(
				params.limit_id,
				params.entity_id,
			);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								message: `Successfully reset usage for entity "${params.entity_id}" on limit "${params.limit_id}"`,
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
