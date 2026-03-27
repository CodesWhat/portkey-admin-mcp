/**
 * Contract schemas for Portkey Configs API responses.
 * Validated against recorded API fixtures in contract tests.
 */
import { z } from "zod";

// Individual config item in list response
export const ConfigItemSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	organisation_id: z.string(),
	workspace_id: z.string(),
	is_default: z.number(),
	status: z.string(),
	owner_id: z.string(),
	updated_by: z.string(),
	created_at: z.string(),
	last_updated_at: z.string(),
	object: z.literal("config"),
});

// GET /configs — list envelope (no `success` field)
export const ListConfigsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number(),
	data: z.array(ConfigItemSchema),
});

// Config detail — parsed from JSON string
export const ConfigDetailsSchema = z.object({
	retry: z
		.object({
			attempts: z.number().optional(),
			on_status_codes: z.array(z.number()).optional(),
		})
		.optional(),
	cache: z
		.object({
			mode: z.string().optional(),
			max_age: z.number().optional(),
		})
		.optional(),
	strategy: z
		.object({
			mode: z.string().optional(),
		})
		.optional(),
	targets: z
		.array(
			z.object({
				provider: z.string().optional(),
				virtual_key: z.string().optional(),
			}),
		)
		.optional(),
});

// GET /configs/:slug — flat shape, config is a JSON string
export const GetConfigResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	workspace_id: z.string(),
	slug: z.string(),
	organisation_id: z.string(),
	is_default: z.number(),
	status: z.string(),
	owner_id: z.string(),
	updated_by: z.string(),
	created_at: z.string(),
	last_updated_at: z.string(),
	config: z.string(), // JSON-encoded config details
	format: z.string(),
	type: z.string(),
	version_id: z.string(),
	object: z.literal("config"),
});

// POST /configs — wrapped in { success, data }
export const CreateConfigResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		id: z.string(),
		version_id: z.string(),
	}),
});

// GET /configs/:slug/versions
export const ConfigVersionSchema = z.object({
	id: z.string(),
	version: z.number(),
	config: ConfigDetailsSchema,
	created_at: z.string(),
	created_by: z.string().optional(),
});

export const ConfigVersionsResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number(),
	data: z.array(ConfigVersionSchema),
});
