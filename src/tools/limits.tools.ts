import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";

export function registerLimitsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	// ==================== Usage Limits Tools ====================

	// List usage limits
	server.tool(
		"list_usage_limits",
		"Retrieve all usage limits in your Portkey organization. Usage limits control how much of a resource (tokens, requests, cost) can be consumed within a time period.",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter usage limits by workspace ID"),
		},
		async (params) => {
			try {
				const result = await service.listUsageLimits(params.workspace_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									usage_limits: result.data.map((limit) => ({
										id: limit.id,
										name: limit.name,
										workspace_id: limit.workspace_id,
										status: limit.status,
										value: limit.value,
										metric: limit.metric,
										period: limit.period,
										created_at: limit.created_at,
										updated_at: limit.updated_at,
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
							text: `Error fetching usage limits: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
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
			try {
				const result = await service.getUsageLimit(params.id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									usage_limit: {
										id: result.data.id,
										name: result.data.name,
										workspace_id: result.data.workspace_id,
										status: result.data.status,
										value: result.data.value,
										metric: result.data.metric,
										period: result.data.period,
										created_at: result.data.created_at,
										updated_at: result.data.updated_at,
										created_by: result.data.created_by,
										updated_by: result.data.updated_by,
									},
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
							text: `Error fetching usage limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create usage limit
	server.tool(
		"create_usage_limit",
		"Create a new usage limit to control resource consumption within a time period",
		{
			name: z.string().describe("Name for the usage limit"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID to apply the limit to"),
			value: z
				.number()
				.positive()
				.describe("The limit value (e.g., max tokens, max cost)"),
			metric: z
				.enum(["tokens", "requests", "cost"])
				.describe("The metric to limit"),
			period: z
				.enum(["daily", "weekly", "monthly"])
				.describe("The time period for the limit"),
		},
		async (params) => {
			try {
				const result = await service.createUsageLimit({
					name: params.name,
					workspace_id: params.workspace_id,
					value: params.value,
					metric: params.metric,
					period: params.period,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully created usage limit "${params.name}"`,
									success: result.success,
									usage_limit: result.data,
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
							text: `Error creating usage limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update usage limit
	server.tool(
		"update_usage_limit",
		"Update an existing usage limit's configuration",
		{
			id: z.string().describe("The unique identifier of the usage limit"),
			name: z.string().optional().describe("New name for the usage limit"),
			value: z.number().positive().optional().describe("New limit value"),
			metric: z
				.enum(["tokens", "requests", "cost"])
				.optional()
				.describe("New metric to limit"),
			period: z
				.enum(["daily", "weekly", "monthly"])
				.optional()
				.describe("New time period for the limit"),
			status: z
				.enum(["active", "inactive"])
				.optional()
				.describe("Usage limit status"),
		},
		async (params) => {
			try {
				const result = await service.updateUsageLimit(params.id, {
					name: params.name,
					value: params.value,
					metric: params.metric,
					period: params.period,
					status: params.status,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated usage limit "${params.id}"`,
									success: result.success,
									usage_limit: result.data,
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
							text: `Error updating usage limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
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
			try {
				const result = await service.deleteUsageLimit(params.id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully deleted usage limit "${params.id}"`,
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
							text: `Error deleting usage limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// ==================== Rate Limits Tools ====================

	// List rate limits
	server.tool(
		"list_rate_limits",
		"Retrieve all rate limits in your Portkey organization. Rate limits control how many requests can be made within a time window.",
		{
			workspace_id: z
				.string()
				.optional()
				.describe("Filter rate limits by workspace ID"),
		},
		async (params) => {
			try {
				const result = await service.listRateLimits(params.workspace_id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									rate_limits: result.data.map((limit) => ({
										id: limit.id,
										name: limit.name,
										workspace_id: limit.workspace_id,
										status: limit.status,
										value: limit.value,
										metric: limit.metric,
										window: limit.window,
										created_at: limit.created_at,
										updated_at: limit.updated_at,
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
							text: `Error fetching rate limits: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
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
			try {
				const result = await service.getRateLimit(params.id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									success: result.success,
									rate_limit: {
										id: result.data.id,
										name: result.data.name,
										workspace_id: result.data.workspace_id,
										status: result.data.status,
										value: result.data.value,
										metric: result.data.metric,
										window: result.data.window,
										created_at: result.data.created_at,
										updated_at: result.data.updated_at,
										created_by: result.data.created_by,
										updated_by: result.data.updated_by,
									},
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
							text: `Error fetching rate limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Create rate limit
	server.tool(
		"create_rate_limit",
		"Create a new rate limit to control request frequency within a time window",
		{
			name: z.string().describe("Name for the rate limit"),
			workspace_id: z
				.string()
				.optional()
				.describe("Workspace ID to apply the limit to"),
			value: z
				.number()
				.positive()
				.describe("The maximum number of requests allowed"),
			metric: z
				.enum(["requests", "tokens"])
				.describe("The metric to rate limit"),
			window: z
				.enum(["1m", "5m", "15m", "1h", "1d"])
				.describe("The time window for the rate limit"),
		},
		async (params) => {
			try {
				const result = await service.createRateLimit({
					name: params.name,
					workspace_id: params.workspace_id,
					value: params.value,
					metric: params.metric,
					window: params.window,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully created rate limit "${params.name}"`,
									success: result.success,
									rate_limit: result.data,
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
							text: `Error creating rate limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);

	// Update rate limit
	server.tool(
		"update_rate_limit",
		"Update an existing rate limit's configuration",
		{
			id: z.string().describe("The unique identifier of the rate limit"),
			name: z.string().optional().describe("New name for the rate limit"),
			value: z
				.number()
				.positive()
				.optional()
				.describe("New maximum requests value"),
			metric: z
				.enum(["requests", "tokens"])
				.optional()
				.describe("New metric to rate limit"),
			window: z
				.enum(["1m", "5m", "15m", "1h", "1d"])
				.optional()
				.describe("New time window for the rate limit"),
			status: z
				.enum(["active", "inactive"])
				.optional()
				.describe("Rate limit status"),
		},
		async (params) => {
			try {
				const result = await service.updateRateLimit(params.id, {
					name: params.name,
					value: params.value,
					metric: params.metric,
					window: params.window,
					status: params.status,
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully updated rate limit "${params.id}"`,
									success: result.success,
									rate_limit: result.data,
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
							text: `Error updating rate limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
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
			try {
				const result = await service.deleteRateLimit(params.id);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									message: `Successfully deleted rate limit "${params.id}"`,
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
							text: `Error deleting rate limit: ${error instanceof Error ? error.message : "Unknown error"}`,
						},
					],
				};
			}
		},
	);
}
