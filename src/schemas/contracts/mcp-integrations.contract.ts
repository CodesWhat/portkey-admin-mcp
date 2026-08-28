import { z } from "zod";

export const McpIntegrationSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		slug: z.string(),
		description: z.string().nullable().optional(),
		owner_id: z.string(),
		workspace_id: z.string().optional(),
		status: z.enum(["active", "archived"]),
		url: z.string(),
		auth_type: z.string(),
		transport: z.string(),
		type: z.enum(["workspace", "organisation"]).optional(),
		configurations: z.record(z.string(), z.unknown()).optional(),
		created_at: z.string(),
		last_updated_at: z.string().nullable(),
		object: z.literal("mcp-integration"),
	})
	.passthrough();

export const ListMcpIntegrationsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	has_more: z.boolean(),
	data: z.array(McpIntegrationSchema),
});
