import { isIP } from "node:net";
import { z } from "zod";

export const EgressAllowlistDomainSchema = z
	.string()
	.min(1)
	.max(255)
	.refine(
		(value) => {
			const host = value.trim();
			if (
				isIP(host) ||
				(host.startsWith("[") &&
					host.endsWith("]") &&
					isIP(host.slice(1, -1)) === 6)
			)
				return true;
			const hostname = host.replace(/^\*\./, "").replace(/\.$/, "");
			return hostname
				.split(".")
				.every((label) =>
					/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label),
				);
		},
		{
			message:
				"Use a hostname, IP literal, or *. wildcard without scheme, path, credentials, or port",
		},
	)
	.describe(
		"Exact hostname, IPv4/IPv6 literal (optionally bracketed), or *. wildcard. No scheme, path, credentials, or port. Portkey trims/lowercases it and rejects cloud-metadata destinations",
	);

const descriptionSchema = z
	.string()
	.max(500)
	.nullable()
	.optional()
	.describe("Optional description (up to 500 characters); null clears it");
export const CreateEgressAllowlistRequestSchema = z.object({
	domain: EgressAllowlistDomainSchema,
	description: descriptionSchema,
});
export const UpdateEgressAllowlistRequestSchema = z
	.object({
		domain: EgressAllowlistDomainSchema.optional(),
		description: descriptionSchema,
	})
	.refine(
		(value) => value.domain !== undefined || value.description !== undefined,
		{ message: "Provide domain or description to update" },
	);
export const EgressAllowlistEntrySchema = z.object({
	id: z.string().uuid().optional(),
	organisation_id: z.string().uuid().optional(),
	domain: z.string().optional(),
	description: z.string().nullable().optional(),
	status: z.literal("active").optional(),
	created_by: z.string().uuid().nullable().optional(),
	created_at: z.iso.datetime().optional(),
	last_updated_at: z.iso.datetime().optional(),
	object: z.literal("egress-allowlist").optional(),
});
export const ListEgressAllowlistResponseSchema = z.object({
	object: z.literal("list").optional(),
	total: z.number().int().optional(),
	data: z.array(EgressAllowlistEntrySchema).optional(),
});
export const CreateEgressAllowlistResponseSchema = z.object({
	id: z.string().uuid().optional(),
	domain: z.string().optional(),
	object: z.literal("egress-allowlist").optional(),
});
