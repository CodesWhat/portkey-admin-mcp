import { z } from "zod";

type SecretMappingSchemaOptions = {
	allowKeyTarget: boolean;
	targetFieldDescription: string;
	secretReferenceDescription: string;
	valueFormatDescription: string;
};

export function createSecretMappingSchema({
	allowKeyTarget,
	targetFieldDescription,
	secretReferenceDescription,
	valueFormatDescription,
}: SecretMappingSchemaOptions) {
	return z.object({
		target_field: z
			.string()
			.refine(
				(value) =>
					(allowKeyTarget && value === "key") ||
					value.startsWith("configurations."),
				allowKeyTarget
					? "target_field must be 'key' or start with 'configurations.'"
					: "target_field must start with 'configurations.'",
			)
			.describe(targetFieldDescription),
		secret_reference_id: z.string().describe(secretReferenceDescription),
		secret_key: z
			.string()
			.nullable()
			.optional()
			.describe("Optional key to select from a multi-value secret"),
		value_format: z
			.enum(["string", "json"])
			.nullable()
			.optional()
			.describe(valueFormatDescription),
	});
}

export function uniqueSecretMappingsSchema<
	T extends z.ZodType<{ target_field: string }>,
>(itemSchema: T) {
	return z.array(itemSchema).superRefine((mappings, context) => {
		const firstIndexByTarget = new Map<string, number>();
		for (const [index, mapping] of mappings.entries()) {
			const firstIndex = firstIndexByTarget.get(mapping.target_field);
			if (firstIndex !== undefined) {
				context.addIssue({
					code: "custom",
					path: [index, "target_field"],
					message: `target_field must be unique; also used at index ${firstIndex}`,
				});
			} else {
				firstIndexByTarget.set(mapping.target_field, index);
			}
		}
	});
}
