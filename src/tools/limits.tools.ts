import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

// Reusable schema for limit conditions
const conditionSchema = z.object({
	field: z.string().describe("The field to match on (e.g., 'virtual_key', 'api_key', 'user_id', 'metadata.key')"),
	operator: z.string().describe("The comparison operator (e.g., 'is', 'contains', 'is_not')"),
	value: z.string().describe("The value to match against"),
});

export function registerLimitsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Rate Limits Tools ====================

	// List rate limits
	server.tool(
		"list_rate_limits",
		"Retrieve all rate limits in your Portkey organization. Rate limits control how many requests or tokens can be consumed per time unit (rpm/rph/rpd).",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter rate limits by workspace ID"),
		},
		async (params) => {
			const result = await service.listRateLimits(params.workspace_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	// Get rate limit
	server.tool(
		"get_rate_limit",
		"Retrieve detailed information about a specific rate limit by its ID",
		{
			id: z.string().describe("The unique identifier of the rate limit"),
		},
		async (params) => {
			const result = await service.getRateLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	// Create rate limit
	server.tool(
		"create_rate_limit",
		"Create a new rate limit policy to control request/token consumption per time unit. Requires conditions to match against and group_by to specify how limits are applied.",
		{
			conditions: z
				.array(conditionSchema)
				.describe("Array of conditions that determine which requests this rate limit applies to"),
			group_by: z
				.array(z.string())
				.describe("Array of fields to group the rate limit by (e.g., ['virtual_key'], ['api_key', 'user_id'])"),
			type: z
				.enum(["requests", "tokens"])
				.describe("What to rate limit: 'requests' or 'tokens'"),
			unit: z
				.enum(["rpm", "rph", "rpd"])
				.describe("Time unit: 'rpm' (per minute), 'rph' (per hour), or 'rpd' (per day)"),
			value: z
				.coerce.number()
				.positive()
				.describe("The maximum allowed value per unit (e.g., 100 rpm)"),
			name: z
				.string()
				.optional()
				.describe("Optional name for the rate limit"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID to scope the limit to"),
			organisation_id: z
				.string()
				.optional()
				.describe("Organisation ID to scope the limit to"),
		},
		async (params) => {
			const result = await service.createRateLimit({
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
								rate_limit: result,
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
		"Update an existing rate limit's name, unit, or value",
		{
			id: z.string().describe("The unique identifier of the rate limit"),
			name: z.string().optional().describe("New name for the rate limit"),
			unit: z
				.enum(["rpm", "rph", "rpd"])
				.optional()
				.describe("New time unit: 'rpm' (per minute), 'rph' (per hour), or 'rpd' (per day)"),
			value: z
				.coerce.number()
				.positive()
				.optional()
				.describe("New maximum allowed value per unit"),
		},
		async (params) => {
			const result = await service.updateRateLimit(params.id, {
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
								rate_limit: result,
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
		"Delete a rate limit by ID. This action cannot be undone.",
		{
			id: z.string().describe("The unique identifier of the rate limit"),
		},
		async (params) => {
			await service.deleteRateLimit(params.id);
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
		"Retrieve all usage limits in your Portkey organization. Usage limits control how much cost or tokens can be consumed, with optional periodic resets.",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter usage limits by workspace ID"),
		},
		async (params) => {
			const result = await service.listUsageLimits(params.workspace_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	// Get usage limit
	server.tool(
		"get_usage_limit",
		"Retrieve detailed information about a specific usage limit by its ID",
		{
			id: z.string().describe("The unique identifier of the usage limit"),
		},
		async (params) => {
			const result = await service.getUsageLimit(params.id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	// Create usage limit
	server.tool(
		"create_usage_limit",
		"Create a new usage limit policy to control cost or token consumption. Requires conditions to match against and group_by to specify how limits are applied.",
		{
			conditions: z
				.array(conditionSchema)
				.describe("Array of conditions that determine which requests this usage limit applies to"),
			group_by: z
				.array(z.string())
				.describe("Array of fields to group the usage limit by (e.g., ['virtual_key'], ['api_key', 'user_id'])"),
			type: z
				.enum(["cost", "tokens"])
				.describe("What to limit: 'cost' (in dollars) or 'tokens'"),
			credit_limit: z
				.coerce.number()
				.positive()
				.describe("The maximum allowed usage (cost in dollars or token count)"),
			name: z
				.string()
				.optional()
				.describe("Optional name for the usage limit"),
			alert_threshold: z
				.coerce.number()
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
		async (params) => {
			const result = await service.createUsageLimit({
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
								usage_limit: result,
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
		"Update an existing usage limit's configuration",
		{
			id: z.string().describe("The unique identifier of the usage limit"),
			name: z.string().optional().describe("New name for the usage limit"),
			credit_limit: z
				.coerce.number()
				.positive()
				.optional()
				.describe("New maximum allowed usage value"),
			alert_threshold: z
				.coerce.number()
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
		async (params) => {
			const result = await service.updateUsageLimit(params.id, {
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
								usage_limit: result,
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
		"Delete a usage limit by ID. This action cannot be undone.",
		{
			id: z.string().describe("The unique identifier of the usage limit"),
		},
		async (params) => {
			await service.deleteUsageLimit(params.id);
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
		"List all entities tracked against a usage limit policy, showing current usage per entity",
		{
			limit_id: z.string().describe("Usage limit policy ID"),
		},
		async (params) => {
			const result = await service.listUsageLimitEntities(params.limit_id);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		},
	);

	server.tool(
		"reset_usage_limit_entity",
		"Reset accumulated usage for a specific entity on a usage limit policy",
		{
			limit_id: z.string().describe("Usage limit policy ID"),
			entity_id: z.string().describe("Entity ID to reset usage for"),
		},
		async (params) => {
			await service.resetUsageLimitEntity(params.limit_id, params.entity_id);
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
