import { z } from "zod";

export const AccessPolicySubjectSchema = z
	.object({
		type: z
			.enum(["user", "group", "agent"])
			.describe("Subject kind; users and agents are matched independently"),
		id: z
			.string()
			.min(1)
			.describe(
				"Subject ID; ANY matches all users or all agents, but cannot identify a group",
			),
	})
	.refine((subject) => subject.type !== "group" || subject.id !== "ANY", {
		message: "ANY is supported only for users and agents",
	});

const selectionSchema = z.union([
	z.literal("ALL"),
	z.array(z.string().min(1)).min(1),
]);
export const AccessPolicyTargetSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("mcp_server").describe("Target an MCP server"),
		server_id: z
			.string()
			.min(1)
			.describe(
				"MCP server UUID or slug in the workspace; responses return the UUID",
			),
		tools: selectionSchema.describe(
			"ALL tools on the server, or a nonempty list of tool names",
		),
	}),
	z.object({
		type: z.literal("provider").describe("Target a provider"),
		provider_id: z
			.string()
			.min(1)
			.describe(
				"Provider UUID or slug in the workspace; responses return the UUID",
			),
		models: selectionSchema
			.optional()
			.describe(
				"ALL models or a nonempty list of model slugs; omitted defaults to ALL in Portkey",
			),
	}),
]);

const policyFields = {
	name: z
		.string()
		.min(1)
		.max(64)
		.describe("Policy name, unique within the workspace (1-64 characters)"),
	description: z
		.string()
		.max(256)
		.nullable()
		.optional()
		.describe("Policy description; null clears it"),
	effect: z
		.enum(["allow", "deny"])
		.optional()
		.describe(
			"Allow or deny access; omitted create effect is inferred, while omitted update effect keeps its stored value",
		),
	subjects: z
		.array(AccessPolicySubjectSchema)
		.min(1)
		.describe(
			"Complete subject list; updates replace the existing subjects. A side without entries matches requests without that principal",
		),
	targets: z
		.array(AccessPolicyTargetSchema)
		.min(1)
		.describe("Complete target list; updates replace the existing targets"),
	enabled: z
		.boolean()
		.optional()
		.describe(
			"Whether the policy is enabled; creates default to true, updates preserve the stored value when omitted",
		),
};

function hasSpecificAllowSubject(policy: {
	effect?: "allow" | "deny";
	subjects: Array<{ id: string }>;
}): boolean {
	return (
		policy.effect !== "allow" ||
		policy.subjects.some((subject) => subject.id !== "ANY")
	);
}

export const CreateAccessPolicyRequestSchema = z
	.object({
		workspace_id: z
			.string()
			.optional()
			.describe(
				"Workspace UUID or slug; required with an organisation-level API key",
			),
		...policyFields,
	})
	.refine(
		(policy) => {
			const effect =
				policy.effect ??
				(policy.subjects.some(
					(subject) => subject.type === "user" && subject.id === "ANY",
				) &&
				policy.subjects.some(
					(subject) => subject.type === "agent" && subject.id === "ANY",
				)
					? "deny"
					: "allow");
			return hasSpecificAllowSubject({ ...policy, effect });
		},
		{
			message:
				"An allow policy must name at least one specific user, group, or agent",
		},
	);

export const UpdateAccessPolicyRequestSchema = z
	.object({
		...policyFields,
		name: policyFields.name.optional(),
		version: z
			.number()
			.int()
			.min(1)
			.describe(
				"Current version from get_access_policy; a stale version returns HTTP 409",
			),
	})
	.refine(hasSpecificAllowSubject, {
		message:
			"An allow policy must name at least one specific user, group, or agent",
	});

const responseFields = {
	id: z.string().uuid().optional(),
	name: z.string().optional(),
	description: z.string().nullable().optional(),
	enabled: z.boolean().optional(),
	effect: z.enum(["allow", "deny"]).optional(),
	version: z.number().int().optional(),
	status: z.literal("active").optional(),
	workspace_id: z.string().uuid().optional(),
	organisation_id: z.string().uuid().optional(),
	created_by: z.string().nullable().optional(),
	created_at: z.iso.datetime().optional(),
	last_updated_at: z.iso.datetime().optional(),
	object: z.literal("access").optional(),
};

export const AccessPolicyListItemSchema = z.object({
	...responseFields,
	allow_all_users: z.boolean().optional(),
	allow_all_agents: z.boolean().optional(),
	target_server_count: z.number().int().optional(),
	target_provider_count: z.number().int().optional(),
});
export const AccessPolicySchema = z.object({
	...responseFields,
	subjects: z
		.array(
			z.object({
				type: z.enum(["user", "group", "agent"]).optional(),
				id: z.string().optional(),
				name: z.string().nullable().optional(),
				email: z.string().nullable().optional(),
			}),
		)
		.optional(),
	targets: z.array(AccessPolicyTargetSchema).optional(),
});
export const ListAccessPoliciesResponseSchema = z.object({
	object: z.literal("list").optional(),
	total: z.number().int().optional(),
	data: z.array(AccessPolicyListItemSchema).optional(),
});
export const CreateAccessPolicyResponseSchema = z.object({
	id: z.string().uuid().optional(),
	object: z.literal("access").optional(),
});
