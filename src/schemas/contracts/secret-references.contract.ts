import { z } from "zod";

export const SecretManagerTypeSchema = z.enum([
	"aws_sm",
	"azure_kv",
	"hashicorp_vault",
]);

export const SecretReferenceListItemSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	slug: z.string(),
	manager_type: SecretManagerTypeSchema,
	status: z.literal("ACTIVE"),
	created_at: z.iso.datetime(),
	last_updated_at: z.iso.datetime(),
	object: z.literal("secret-reference"),
});

export const ListSecretReferencesResponseSchema = z.object({
	object: z.literal("list"),
	total: z.number().int().nonnegative(),
	data: z.array(SecretReferenceListItemSchema),
});

export const SecretReferenceDetailSchema = SecretReferenceListItemSchema.extend(
	{
		organisation_id: z.string().uuid(),
		description: z.string().nullable(),
		secret_path: z.string(),
		secret_key: z.string().nullable(),
		allow_all_workspaces: z.boolean(),
		tags: z.record(z.string(), z.string()).nullable(),
		created_by: z.string(),
		auth_config: z.record(z.string(), z.unknown()),
	},
);

export const CreateSecretReferenceResponseSchema = z.object({
	id: z.string().uuid(),
	slug: z.string(),
	object: z.literal("secret-reference"),
});
