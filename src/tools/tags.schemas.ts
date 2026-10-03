import { z } from "zod";

/** Flat string map used for deployment tags, whose keys the API restricts. */
export const resourceTagsSchema = z.record(
	z
		.string()
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Tag keys may contain only letters, numbers, underscores, and hyphens",
		),
	z.string(),
);

/**
 * Flat string map used for integration tags. The OpenAPI places no constraint on
 * integration tag keys, so none is enforced here.
 */
export const integrationTagsSchema = z.record(z.string(), z.string());
