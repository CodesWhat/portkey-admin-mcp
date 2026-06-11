/**
 * Contract schemas for Portkey Keys API responses.
 * Validated against recorded API fixtures in contract tests.
 */
import { z } from "zod";

// ===== Virtual Keys =====

const VirtualKeyRateLimitSchema = z.object({
	type: z.literal("requests"),
	unit: z.literal("rpm"),
	value: z.number(),
});

const VirtualKeyUsageLimitsSchema = z.object({
	type: z.enum(["cost", "tokens"]),
	alert_threshold: z.number(),
	credit_limit: z.number(),
	periodic_reset: z.enum(["monthly", "weekly"]),
});

export const VirtualKeySchema = z.object({
	id: z.string(),
	organisation_id: z.string(),
	name: z.string(),
	note: z.string().nullable(),
	status: z.enum(["active", "exhausted"]),
	usage_limits: VirtualKeyUsageLimitsSchema.nullable(),
	reset_usage: z.number().nullable(),
	created_at: z.string(),
	slug: z.string(),
	workspace_id: z.string(),
	model_config: z.record(z.string(), z.unknown()).nullable(),
	rate_limits: z.array(VirtualKeyRateLimitSchema).nullable(),
	expires_at: z.string().nullable(),
	last_reset_at: z.string().nullable(),
	integration_id: z.string().nullable().optional(),
	tags: z.unknown().nullable().optional(),
	workspace_name: z.string().optional(),
	provider: z.string().optional(),
	object: z.literal("virtual-key"),
});

// GET /virtual-keys
export const ListVirtualKeysResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number(),
	data: z.array(VirtualKeySchema),
});

// POST /virtual-keys
export const CreateVirtualKeyResponseSchema = z.object({
	success: z.boolean(),
	data: z.object({
		slug: z.string(),
	}),
});

// ===== API Keys =====

const ApiKeyRateLimitSchema = z.object({
	type: z.literal("requests"),
	unit: z.literal("rpm"),
	value: z.number(),
});

const ApiKeyUsageLimitsSchema = z
	.object({
		type: z.enum(["cost", "tokens"]).optional(),
		credit_limit: z.number().optional(),
		periodic_reset: z.enum(["monthly", "weekly"]).optional(),
		alert_threshold: z.number().optional(),
	})
	.passthrough();

const ApiKeyDefaultsSchema = z.object({
	metadata: z.record(z.string(), z.string()).nullable(),
	config_id: z.string().nullable(),
});

export const ApiKeySchema = z.object({
	id: z.string(),
	key: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	type: z.enum(["organisation-service", "workspace-service", "workspace-user"]),
	organisation_id: z.string(),
	workspace_id: z.string().nullable().optional(),
	user_id: z.string().nullable(),
	status: z.enum(["active", "exhausted", "expired"]),
	created_at: z.string(),
	last_updated_at: z.string(),
	creation_mode: z.enum(["ui", "api", "auto"]),
	rate_limits: z.array(ApiKeyRateLimitSchema).nullable(),
	usage_limits: ApiKeyUsageLimitsSchema.nullable(),
	reset_usage: z.number().nullable(),
	scopes: z.array(z.string()),
	defaults: ApiKeyDefaultsSchema.nullable(),
	alert_emails: z.array(z.string()).nullable(),
	expires_at: z.string().nullable(),
	last_reset_at: z.string().nullable().optional(),
	expiry_enforced: z.number().optional(),
	allow_config_override: z.number().nullable().optional(),
	api_key_defaults_id: z.string().nullable().optional(),
	object: z.literal("api-key"),
});

// GET /api-keys
export const ListApiKeysResponseSchema = z.object({
	total: z.number(),
	object: z.literal("list"),
	data: z.array(ApiKeySchema),
});

// POST /api-keys/:type/:sub_type
export const CreateApiKeyResponseSchema = z.object({
	id: z.string(),
	key: z.string(),
	object: z.literal("api-key"),
});
