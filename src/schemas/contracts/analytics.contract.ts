import { z } from "zod";

export const CacheSummaryResponseSchema = z.object({
	object: z.literal("analytics-summary"),
	summary: z
		.object({
			hits: z.number().nonnegative(),
			avg_latency: z.number().nonnegative(),
			total_requests: z.number().nonnegative(),
			cache_speedup: z.number(),
		})
		.passthrough(),
});

export const ProviderGroupAnalyticsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative().optional(),
	data: z.array(
		z
			.object({
				provider: z.string(),
				requests: z.number().nonnegative(),
			})
			.passthrough(),
	),
});

export const McpGroupAnalyticsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative().optional(),
	data: z.array(
		z
			.object({
				object: z.literal("analytics-group").optional(),
				name: z.string(),
				requests: z.number().int().nonnegative(),
			})
			.passthrough(),
	),
});

export const A2aGroupAnalyticsResponseSchema =
	McpGroupAnalyticsResponseSchema.extend({});

export const WorkspaceGroupAnalyticsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative().optional(),
	is_quota_exceeded: z.boolean().optional(),
	data: z.array(
		z
			.object({
				object: z.literal("analytics-group").optional(),
				workspace_slug: z.string(),
				requests: z.number().int().nonnegative(),
				cost: z.number().nonnegative(),
			})
			.passthrough(),
	),
});
