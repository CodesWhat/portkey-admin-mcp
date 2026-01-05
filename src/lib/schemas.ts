/**
 * Shared Zod schemas used across services and tools
 */
import { z } from "zod";

// ===== Pagination Schemas =====
export const PaginationParamsSchema = z.object({
	current_page: z.number().positive().optional(),
	page_size: z.number().positive().max(100).optional(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

// ===== Common Response Schemas =====
export const ListResponseMetaSchema = z.object({
	total: z.number(),
	object: z.literal("list"),
});

// ===== Prompt-Related Schemas =====
export const PromptFunctionSchema = z.object({
	name: z.string().describe("Function name"),
	description: z.string().optional().describe("Function description"),
	parameters: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Function parameters schema"),
});

export const PromptToolSchema = z.object({
	type: z.literal("function").describe("Tool type"),
	function: PromptFunctionSchema.describe("Function definition"),
});

export const HyperparametersSchema = z.object({
	max_tokens: z
		.number()
		.positive()
		.optional()
		.describe("Maximum tokens to generate"),
	temperature: z
		.number()
		.min(0)
		.max(2)
		.optional()
		.describe("Sampling temperature (0-2)"),
	top_p: z.number().min(0).max(1).optional().describe("Top-p sampling (0-1)"),
	top_k: z.number().positive().optional().describe("Top-k sampling"),
	presence_penalty: z
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Presence penalty (-2 to 2)"),
	frequency_penalty: z
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Frequency penalty (-2 to 2)"),
	stop: z.array(z.string()).optional().describe("Stop sequences"),
});

export const BillingMetadataSchema = z.object({
	client_id: z
		.string()
		.describe("Client ID for billing attribution (REQUIRED)"),
	app: z
		.enum(["hourlink", "apizone", "research-pilot"])
		.describe("App identifier (REQUIRED)"),
	env: z.enum(["dev", "staging", "prod"]).describe("Environment (REQUIRED)"),
	project_id: z.string().optional().describe("Project ID for granular billing"),
	feature: z.string().optional().describe("Feature name for tracking"),
});

export const ToolChoiceSchema = z.union([
	z.enum(["auto", "none"]),
	z.object({
		type: z.literal("function"),
		function: z.object({ name: z.string() }),
	}),
]);

// ===== Role Schemas =====
export const OrgRoleSchema = z.enum(["admin", "member"]);
export const WorkspaceRoleSchema = z.enum(["admin", "member", "manager"]);

// ===== API Error Schema =====
export const ApiErrorSchema = z.object({
	message: z.string(),
	code: z.string().optional(),
	details: z.unknown().optional(),
});
