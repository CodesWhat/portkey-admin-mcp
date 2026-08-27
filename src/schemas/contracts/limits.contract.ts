import { z } from "zod";

const ConditionValueSchema = z.union([z.string(), z.array(z.string())]);

export const LimitConditionSchema = z.object({
	key: z.string(),
	value: ConditionValueSchema,
	excludes: ConditionValueSchema.optional(),
});

export const LimitGroupBySchema = z.object({ key: z.string() });

export const RateLimitSchema = z
	.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		type: z.enum(["requests", "tokens"]),
		unit: z.enum(["rpm", "rph", "rpd", "rpw"]),
		value: z.number().nonnegative(),
		target: z.enum(["llm", "mcp_tools"]).optional(),
		status: z.enum(["active", "archived"]),
		conditions: z.array(LimitConditionSchema),
		group_by: z.array(LimitGroupBySchema),
		workspace_id: z.string(),
		organisation_id: z.string(),
		created_at: z.string(),
		last_updated_at: z.string(),
		object: z.string().optional(),
	})
	.passthrough();

export const ListRateLimitsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	data: z.array(RateLimitSchema),
});

export const UsageLimitSchema = z
	.object({
		id: z.string(),
		name: z.string().nullable().optional(),
		type: z.enum(["cost", "tokens"]),
		credit_limit: z.number().nonnegative(),
		alert_threshold: z.number().nullable().optional(),
		periodic_reset: z.enum(["monthly", "weekly"]).nullable().optional(),
		periodic_reset_days: z.number().int().nonnegative().nullable().optional(),
		next_usage_reset_at: z.string().nullable().optional(),
		last_reset_at: z.string().nullable().optional(),
		status: z.enum(["active", "archived"]),
		conditions: z.array(LimitConditionSchema),
		group_by: z.array(LimitGroupBySchema),
		workspace_id: z.string(),
		organisation_id: z.string(),
		created_at: z.string(),
		last_updated_at: z.string(),
		object: z.string().optional(),
	})
	.passthrough();

export const ListUsageLimitsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	data: z.array(UsageLimitSchema),
});

export const UsageLimitEntitySchema = z
	.object({
		id: z.string(),
		value_key: z.string(),
		current_usage: z.number().nonnegative(),
	})
	.passthrough();

export const ListUsageLimitEntitiesResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	data: z.array(UsageLimitEntitySchema),
});
