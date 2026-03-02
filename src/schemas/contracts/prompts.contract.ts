/**
 * Contract schemas for Portkey Prompts API responses.
 * Validated against recorded API fixtures in contract tests.
 */
import { z } from "zod";

// Individual prompt item in list response
export const PromptListItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	collection_id: z.string(),
	workspace_id: z.string().optional(),
	model: z.string().optional(),
	status: z.string().optional(),
	created_at: z.string(),
	last_updated_at: z.string(),
	object: z.literal("prompt"),
});

// GET /prompts
export const ListPromptsResponseSchema = z.object({
	data: z.array(PromptListItemSchema),
	total: z.number(),
	object: z.literal("list"),
});

// Prompt version (nested in get response)
const PromptFunctionSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	parameters: z.record(z.string(), z.unknown()).optional(),
});

const PromptToolSchema = z.object({
	type: z.literal("function"),
	function: PromptFunctionSchema,
});

const ToolChoiceSchema = z.union([
	z.enum(["auto", "none"]),
	z.object({
		type: z.literal("function"),
		function: z.object({ name: z.string() }),
	}),
]);

export const PromptVersionSchema = z.object({
	id: z.string(),
	version_number: z.number(),
	version_description: z.string().optional(),
	string: z.string(),
	parameters: z.record(z.string(), z.unknown()),
	model: z.string().optional(),
	virtual_key: z.string().optional(),
	functions: z.array(PromptFunctionSchema).optional(),
	tools: z.array(PromptToolSchema).optional(),
	tool_choice: ToolChoiceSchema.optional(),
	template_metadata: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
});

// GET /prompts/:id
export const GetPromptResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	collection_id: z.string(),
	workspace_id: z.string().optional(),
	created_at: z.string(),
	last_updated_at: z.string(),
	current_version: PromptVersionSchema,
	versions: z.array(PromptVersionSchema),
	object: z.literal("prompt"),
});

// POST /prompts
export const CreatePromptResponseSchema = z.object({
	id: z.string(),
	slug: z.string(),
	version_id: z.string(),
	object: z.literal("prompt"),
});

// PUT /prompts/:id
export const UpdatePromptResponseSchema = z.object({
	id: z.string(),
	slug: z.string(),
	prompt_version_id: z.string(),
	object: z.literal("prompt"),
});

// GET /prompts/:id/versions
export const PromptVersionListItemSchema = z.object({
	id: z.string(),
	prompt_id: z.string(),
	prompt_template: z.string(),
	prompt_version: z.number(),
	prompt_description: z.string().optional(),
	label_id: z.string().optional(),
	created_at: z.string(),
	status: z.string(),
	object: z.literal("prompt"),
});

export const ListPromptVersionsResponseSchema = z.array(
	PromptVersionListItemSchema,
);
