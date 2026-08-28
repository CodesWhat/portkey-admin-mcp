import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PortkeyService } from "../services/index.js";
import { jsonResult } from "./utils.js";

// Zod schemas for guardrail check parameters
const guardrailCheckSchema = z.object({
	id: z
		.string()
		.describe("Check identifier (e.g., 'default.jwt', 'default.pii')"),
	name: z.string().optional().describe("Display name for the check"),
	is_enabled: z.boolean().optional().describe("Whether the check is enabled"),
	parameters: z
		.record(z.string(), z.unknown())
		.optional()
		.describe(
			"Check-specific configuration. Supported examples include requestParametersCheck and parameters.forwardHeaders; forwarded headers can expose sensitive values, so allow only the minimum required names.",
		),
});

const guardrailFeedbackSchema = z.object({
	value: z.coerce.number().optional().describe("Feedback value"),
	weight: z.coerce.number().optional().describe("Feedback weight"),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Additional metadata"),
});

const guardrailActionSchema = z.object({
	deny: z
		.boolean()
		.optional()
		.describe("Whether to deny the request on check failure"),
	async: z
		.boolean()
		.optional()
		.describe("Whether to run checks asynchronously"),
	on_success: guardrailFeedbackSchema
		.optional()
		.describe("Feedback configuration for successful checks"),
	on_fail: guardrailFeedbackSchema
		.optional()
		.describe("Feedback configuration for failed checks"),
	on_fail_action: z
		.string()
		.optional()
		.describe("Simple action on failure (e.g., 'block')"),
	message: z
		.string()
		.optional()
		.describe("Message to return when guardrail triggers"),
});

const workspaceGuardrailExclusionSchema = z.object({
	workspace_id: z
		.string()
		.describe("Workspace ID whose exclusion state changes"),
	excluded: z
		.boolean()
		.describe("True to exclude this workspace; false to restore enforcement"),
});

const GUARDRAILS_TOOL_SCHEMAS = {
	getOrganisationDefaults: {},
	listGuardrails: {
		workspace_id: z
			.string()
			.optional()
			.describe("Filter guardrails by workspace ID"),
		organisation_id: z
			.string()
			.optional()
			.describe("Filter guardrails by organization ID"),
		page_size: z.coerce
			.number()
			.int()
			.min(1)
			.max(100)
			.optional()
			.describe("Number of items per page (1-100, default: 100)"),
		current_page: z.coerce
			.number()
			.int()
			.nonnegative()
			.optional()
			.describe("Zero-based page number; the first page is 0"),
	},
	getGuardrail: {
		guardrail_id: z
			.string()
			.describe("The guardrail UUID or slug (with guard_ prefix) to retrieve"),
	},
	createGuardrail: {
		name: z.string().describe("Name of the guardrail"),
		checks: z
			.array(guardrailCheckSchema)
			.min(1)
			.describe("Array of checks to apply (at least one required)"),
		actions: guardrailActionSchema.describe(
			"Actions to take when guardrail checks pass or fail",
		),
		workspace_id: z
			.string()
			.optional()
			.describe("Workspace ID to create the guardrail in"),
		organisation_id: z
			.string()
			.optional()
			.describe("Organisation ID (required if workspace_id not provided)"),
	},
	updateGuardrail: {
		guardrail_id: z.string().describe("The guardrail UUID or slug to update"),
		name: z.string().optional().describe("New name for the guardrail"),
		checks: z
			.array(guardrailCheckSchema)
			.min(1)
			.optional()
			.describe("Updated array of checks to apply"),
		actions: guardrailActionSchema
			.optional()
			.describe("Updated actions configuration"),
	},
	deleteGuardrail: {
		guardrail_id: z.string().describe("The guardrail UUID or slug to delete"),
	},
	updateOrganisationDefaults: {
		input_guardrails: z
			.array(z.string())
			.optional()
			.describe("Ordered guardrail IDs or slugs to enforce on model input"),
		output_guardrails: z
			.array(z.string())
			.optional()
			.describe("Ordered guardrail IDs or slugs to enforce on model output"),
	},
	listWorkspaceExclusions: {
		organisation_id: z
			.string()
			.describe("Organisation ID whose workspace exclusions should be listed"),
	},
	updateWorkspaceExclusions: {
		organisation_id: z
			.string()
			.describe("Organisation ID whose workspace exclusions should be updated"),
		workspaces: z
			.array(workspaceGuardrailExclusionSchema)
			.min(1)
			.describe("Workspace exclusion states to apply"),
		override_existing: z
			.boolean()
			.optional()
			.describe("Replace existing exclusion states instead of merging changes"),
	},
} as const;

const GET_ORGANISATION_DEFAULTS_ANNOTATIONS = {
	title: "Get Organisation Guardrail Defaults",
	readOnlyHint: true,
	destructiveHint: false,
	idempotentHint: true,
	openWorldHint: true,
} as const;

export function registerGuardrailsTools(
	server: McpServer,
	service: PortkeyService,
): void {
	server.tool(
		"get_organisation_defaults",
		"Get the organisation-wide input and output guardrails that workspaces inherit by default. Use this before update_organisation_defaults or when auditing baseline enforcement; it does not include per-workspace exclusions, which are available from the directional exclusion list tools. Requires an organisation service API key with organisation_settings.read scope.",
		GUARDRAILS_TOOL_SCHEMAS.getOrganisationDefaults,
		GET_ORGANISATION_DEFAULTS_ANNOTATIONS,
		async () => jsonResult(await service.guardrails.getOrganisationDefaults()),
	);

	server.tool(
		"update_organisation_defaults",
		"Replace the organisation-wide default input and/or output guardrail lists inherited by workspaces. Only supplied directions change, but enforcement updates immediately across non-excluded workspaces; inspect get_organisation_defaults and the directional workspace exclusions first. Repeating the same lists is safe. Requires an organisation service API key with organisation_settings.update scope.",
		GUARDRAILS_TOOL_SCHEMAS.updateOrganisationDefaults,
		{
			title: "Update Organisation Guardrail Defaults",
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(await service.guardrails.updateOrganisationDefaults(params)),
	);

	server.tool(
		"list_input_guardrail_workspace_exclusions",
		"List workspaces excluded from organisation-wide input guardrails for one organisation. Use this to audit exceptions or establish the current state before the matching update tool; it reads input exclusions only and does not return the organisation's default guardrail list. Requires an organisation service API key with organisation_exclusions.list scope.",
		GUARDRAILS_TOOL_SCHEMAS.listWorkspaceExclusions,
		{
			title: "List Input Guardrail Workspace Exclusions",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(
				await service.guardrails.listWorkspaceExclusions("input", params),
			),
	);

	server.tool(
		"update_input_guardrail_workspace_exclusions",
		"Set workspace exclusions from organisation-wide input guardrails. Each entry excludes or restores one workspace; override_existing replaces prior states while the default merge behavior preserves unmentioned workspaces. Review the matching list tool first because enforcement changes immediately. Repeating the same states is safe. Requires an organisation service API key with organisation_exclusions.update scope.",
		GUARDRAILS_TOOL_SCHEMAS.updateWorkspaceExclusions,
		{
			title: "Update Input Guardrail Workspace Exclusions",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(
				await service.guardrails.updateWorkspaceExclusions("input", params),
			),
	);

	server.tool(
		"list_output_guardrail_workspace_exclusions",
		"List workspaces excluded from organisation-wide output guardrails for one organisation. Use this to audit exceptions or establish the current state before the matching update tool; it reads output exclusions only and does not return the organisation's default guardrail list. Requires an organisation service API key with organisation_exclusions.list scope.",
		GUARDRAILS_TOOL_SCHEMAS.listWorkspaceExclusions,
		{
			title: "List Output Guardrail Workspace Exclusions",
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(
				await service.guardrails.listWorkspaceExclusions("output", params),
			),
	);

	server.tool(
		"update_output_guardrail_workspace_exclusions",
		"Set workspace exclusions from organisation-wide output guardrails. Each entry excludes or restores one workspace; override_existing replaces prior states while the default merge behavior preserves unmentioned workspaces. Review the matching list tool first because enforcement changes immediately. Repeating the same states is safe. Requires an organisation service API key with organisation_exclusions.update scope.",
		GUARDRAILS_TOOL_SCHEMAS.updateWorkspaceExclusions,
		{
			title: "Update Output Guardrail Workspace Exclusions",
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
		},
		async (params) =>
			jsonResult(
				await service.guardrails.updateWorkspaceExclusions("output", params),
			),
	);

	// List guardrails tool
	server.tool(
		"list_guardrails",
		"List guardrails in the org with id, slug, status, ownership, and optional workspace/org filters. Use this to find IDs and slugs before get_guardrail, update_guardrail, or delete_guardrail.",
		GUARDRAILS_TOOL_SCHEMAS.listGuardrails,
		async (params) => {
			const result = await service.guardrails.listGuardrails(params);
			return jsonResult({
				total: result.total,
				guardrails: result.data.map((guardrail) => ({
					id: guardrail.id,
					name: guardrail.name,
					slug: guardrail.slug,
					status: guardrail.status,
					workspace_id: guardrail.workspace_id,
					organisation_id: guardrail.organisation_id,
					created_at: guardrail.created_at,
					last_updated_at: guardrail.last_updated_at,
					owner_id: guardrail.owner_id,
					updated_by: guardrail.updated_by,
				})),
			});
		},
	);

	// Get guardrail tool
	server.tool(
		"get_guardrail",
		"Fetch one guardrail by id or slug with its full checks and actions; use list_guardrails to discover ids first. Use before update_guardrail or delete_guardrail when you need the exact enforcement policy, and returns the full check and action configuration alongside status and ownership.",
		GUARDRAILS_TOOL_SCHEMAS.getGuardrail,
		async (params) => {
			const guardrail = await service.guardrails.getGuardrail(
				params.guardrail_id,
			);
			return jsonResult({
				id: guardrail.id,
				name: guardrail.name,
				slug: guardrail.slug,
				status: guardrail.status,
				workspace_id: guardrail.workspace_id,
				organisation_id: guardrail.organisation_id,
				checks: guardrail.checks,
				actions: guardrail.actions,
				created_at: guardrail.created_at,
				last_updated_at: guardrail.last_updated_at,
				owner_id: guardrail.owner_id,
				updated_by: guardrail.updated_by,
			});
		},
	);

	// Create guardrail tool
	server.tool(
		"create_guardrail",
		"Create a guardrail with checks and actions for request filtering. Create it first, then reference it from configs; the new version becomes the policy anchor for downstream use.",
		GUARDRAILS_TOOL_SCHEMAS.createGuardrail,
		async (params) => {
			const result = await service.guardrails.createGuardrail({
				name: params.name,
				checks: params.checks,
				actions: params.actions,
				workspace_id: params.workspace_id,
				organisation_id: params.organisation_id,
			});
			return jsonResult({
				message: `Successfully created guardrail "${params.name}"`,
				id: result.id,
				slug: result.slug,
				version_id: result.version_id,
			});
		},
	);

	// Update guardrail tool
	server.tool(
		"update_guardrail",
		"Update a guardrail's name, checks, or actions, unlike create_guardrail which registers a new one or delete_guardrail which removes it. This creates a new version that takes effect immediately for dependent configs, so review list_guardrails first; returns the updated id, slug, and version_id.",
		GUARDRAILS_TOOL_SCHEMAS.updateGuardrail,
		async (params) => {
			const updateData: {
				name?: string;
				checks?: typeof params.checks;
				actions?: typeof params.actions;
			} = {};

			if (params.name !== undefined) {
				updateData.name = params.name;
			}
			if (params.checks !== undefined) {
				updateData.checks = params.checks;
			}
			if (params.actions !== undefined) {
				updateData.actions = params.actions;
			}

			const result = await service.guardrails.updateGuardrail(
				params.guardrail_id,
				updateData,
			);
			return jsonResult({
				message: `Successfully updated guardrail "${params.guardrail_id}"`,
				id: result.id,
				slug: result.slug,
				version_id: result.version_id,
			});
		},
	);

	// Delete guardrail tool
	server.tool(
		"delete_guardrail",
		"Delete a guardrail by id or slug. This is irreversible and removes the check from any configs that reference it, so review dependent configs first.",
		GUARDRAILS_TOOL_SCHEMAS.deleteGuardrail,
		async (params) => {
			const result = await service.guardrails.deleteGuardrail(
				params.guardrail_id,
			);
			return jsonResult({
				message: `Successfully deleted guardrail "${params.guardrail_id}"`,
				success: result.success,
			});
		},
	);
}
