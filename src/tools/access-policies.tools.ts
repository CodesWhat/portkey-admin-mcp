import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { CurrentPageSchema } from "../lib/schemas.js";
import {
	CreateAccessPolicyRequestSchema,
	UpdateAccessPolicyRequestSchema,
} from "../schemas/contracts/access-policies.contract.js";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

const idSchema = z
	.string()
	.uuid()
	.describe(
		"Access policy UUID from list_access_policies or create_access_policy",
	);

const listSchema = {
	workspace_id: z.string().optional().describe("Workspace UUID or slug"),
	effect: z
		.enum(["allow", "deny"])
		.optional()
		.describe("Filter by allow or deny effect"),
	enabled: z
		.boolean()
		.optional()
		.describe("Filter enabled or disabled policies; false is preserved"),
	user_id: z
		.string()
		.max(36)
		.optional()
		.describe("Policies naming this user or matching all users"),
	agent_id: z
		.string()
		.max(36)
		.optional()
		.describe("Policies naming this agent or matching all agents"),
	server_id: z
		.string()
		.max(100)
		.optional()
		.describe("Policies targeting this MCP server ID"),
	search: z.string().max(64).optional().describe("Search policy names"),
	created_by: z
		.string()
		.max(255)
		.optional()
		.describe("Filter by creator user ID"),
	start_time: z.iso
		.datetime()
		.optional()
		.describe("Policies created at or after this ISO 8601 timestamp"),
	end_time: z.iso
		.datetime()
		.optional()
		.describe("Policies created at or before this ISO 8601 timestamp"),
	current_page: CurrentPageSchema,
	page_size: z.coerce
		.number()
		.int()
		.nonnegative()
		.optional()
		.describe("Items per page; the published API permits zero"),
};
const lookupSchema = { id: idSchema };
const updateSchema = UpdateAccessPolicyRequestSchema.safeExtend({
	id: idSchema,
});

export function registerAccessPoliciesTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.registerTool(
		"create_access_policy",
		{
			description:
				"Create a workspace access policy for users, groups, and agents targeting MCP tools or provider models. Changes who may access those targets. An omitted effect becomes deny only when both user ANY and agent ANY are present; otherwise allow, which requires a specific subject. Returns the policy UUID; use get_access_policy before later updates.",
			inputSchema: CreateAccessPolicyRequestSchema,
		},
		async (params) =>
			jsonResult(await service.accessPolicies.createAccessPolicy(params)),
	);
	server.registerTool(
		"list_access_policies",
		{
			description:
				"Inspect active workspace access policies, newest first, without changing permissions. Filter by subject, MCP server, effect, enabled state, or creation time. Returns total and the current page of policy summaries with versions; use get_access_policy for complete subjects and targets.",
			inputSchema: listSchema,
		},
		async (params) =>
			jsonResult(await service.accessPolicies.listAccessPolicies(params)),
	);
	server.registerTool(
		"get_access_policy",
		{
			description:
				"Read one access policy's complete subjects, targets, effect, and current version. Use this before update_access_policy so replacement lists and optimistic concurrency use the latest state. Returns policy details; a missing policy returns HTTP 404.",
			inputSchema: lookupSchema,
		},
		async ({ id }) =>
			jsonResult(await service.accessPolicies.getAccessPolicy(id)),
	);
	server.registerTool(
		"update_access_policy",
		{
			description:
				"Replace an access policy's complete subjects and targets, changing access permissions. Requires the current version from get_access_policy; a stale version returns HTTP 409 without retrying. Omitted name, description, effect, and enabled retain their stored values. Returns Portkey's acknowledgement; reread before retrying a conflict.",
			inputSchema: updateSchema,
			annotations: { destructiveHint: true },
		},
		async ({ id, ...params }) =>
			jsonResult(await service.accessPolicies.updateAccessPolicy(id, params)),
	);
	server.registerTool(
		"delete_access_policy",
		{
			description:
				"Delete an access policy by UUID, removing its allow or deny rule and changing access permissions. This cannot be undone by this tool. Inspect get_access_policy first; returns Portkey's acknowledgement, or HTTP 404 when the policy is missing.",
			inputSchema: lookupSchema,
		},
		async ({ id }) =>
			jsonResult(await service.accessPolicies.deleteAccessPolicy(id)),
	);
}
