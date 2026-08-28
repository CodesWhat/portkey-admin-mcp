import { z } from "zod";

export const DeploymentListItemSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		type: z.enum(["production", "non_production"]),
		status: z.enum(["active", "archived"]),
		is_default: z.union([z.literal(0), z.literal(1)]),
		connection_status: z.enum(["healthy", "unhealthy", "unknown"]),
		created_by: z.string(),
		created_at: z.string(),
		last_updated_at: z.string(),
		last_synced_at: z.string().nullable(),
		last_resynced_at: z.string().nullable(),
		object: z.literal("deployment"),
	})
	.passthrough();

export const ListDeploymentsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	data: z.array(DeploymentListItemSchema),
});
