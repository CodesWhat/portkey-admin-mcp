import { z } from "zod";

const CollectionDetailsSchema = z
	.object({
		child_collections_count: z.number().int().nonnegative(),
		prompts_count: z.number().int().nonnegative(),
		child_collections_last_updated_at: z.string().nullable(),
		prompts_last_updated_at: z.string().nullable(),
	})
	.passthrough();

const CollectionSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		workspace_id: z.string(),
		slug: z.string(),
		parent_collection_id: z.string().nullable().optional(),
		is_default: z.boolean().optional(),
		status: z.enum(["active", "archived"]).optional(),
		created_at: z.string(),
		last_updated_at: z.string(),
	})
	.passthrough();

export const ChildCollectionSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		last_updated_at: z.string(),
		collection_details: CollectionDetailsSchema,
	})
	.passthrough();

export const ListCollectionsResponseSchema = z.object({
	total: z.number().int().nonnegative(),
	data: z.array(
		CollectionSchema.extend({
			collection_details: CollectionDetailsSchema.optional(),
		}),
	),
});

export const GetCollectionResponseSchema = CollectionSchema.extend({
	child_collections: z.array(ChildCollectionSchema).optional(),
});
