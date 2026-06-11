/**
 * Shared Zod schemas used across services and tools
 */
import { z } from "zod";
import type { ToolChoice } from "../services/prompts.types.js";

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
	max_tokens: z.coerce
		.number()
		.positive()
		.optional()
		.describe("Maximum tokens to generate"),
	temperature: z.coerce
		.number()
		.min(0)
		.max(2)
		.optional()
		.describe("Sampling temperature (0-2)"),
	top_p: z.coerce
		.number()
		.min(0)
		.max(1)
		.optional()
		.describe("Top-p sampling (0-1)"),
	top_k: z.coerce.number().positive().optional().describe("Top-k sampling"),
	presence_penalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Presence penalty (-2 to 2)"),
	frequency_penalty: z.coerce
		.number()
		.min(-2)
		.max(2)
		.optional()
		.describe("Frequency penalty (-2 to 2)"),
	stop: z.array(z.string()).optional().describe("Stop sequences"),
});

export const PromptAppIdentifierSchema = z
	.string()
	.min(1)
	.describe(
		"App identifier (REQUIRED). Use your deployed app name, for example 'hourlink' or 'support-console'.",
	);

export const PromptEnvironmentIdentifierSchema = z
	.string()
	.min(1)
	.describe(
		"Environment identifier (REQUIRED). Use your environment name, for example 'dev', 'staging', 'prod', or 'qa'.",
	);

export const BillingMetadataSchema = z.object({
	client_id: z
		.string()
		.describe("Client ID for billing attribution (REQUIRED)"),
	app: PromptAppIdentifierSchema,
	env: PromptEnvironmentIdentifierSchema,
	project_id: z.string().optional().describe("Project ID for granular billing"),
	feature: z.string().optional().describe("Feature name for tracking"),
});

export const ToolChoiceSchema = z
	.object({
		mode: z
			.enum(["auto", "none", "function"])
			.describe(
				"Tool choice mode: auto lets the model decide, none disables tool use, function forces one function by name",
			),
		function_name: z
			.string()
			.optional()
			.describe("Required when mode is 'function'; ignored otherwise"),
	})
	.superRefine((value, ctx) => {
		if (value.mode === "function" && !value.function_name) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["function_name"],
				message: "function_name is required when mode is 'function'",
			});
		}

		if (value.mode !== "function" && value.function_name !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["function_name"],
				message: "function_name is only allowed when mode is 'function'",
			});
		}
	});

export type ToolChoiceInput = z.infer<typeof ToolChoiceSchema>;

export function toPromptToolChoice(
	toolChoice?: ToolChoiceInput,
): ToolChoice | undefined {
	if (!toolChoice) {
		return undefined;
	}

	if (toolChoice.mode === "function") {
		// superRefine above guarantees function_name is defined when mode === "function"
		return {
			type: "function",
			function: {
				name: toolChoice.function_name as string,
			},
		};
	}

	return toolChoice.mode;
}
