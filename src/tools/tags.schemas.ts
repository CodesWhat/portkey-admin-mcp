import { z } from "zod";

/** Flat string map used for deployment and integration tags. */
export const resourceTagsSchema = z.record(
	z
		.string()
		.regex(
			/^[a-zA-Z0-9_-]+$/,
			"Tag keys may contain only letters, numbers, underscores, and hyphens",
		),
	z.string(),
);
